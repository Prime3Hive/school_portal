import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/**
 * Attempt to delete an auth user and log (but don't throw) if it fails.
 * Used in rollback paths so a failing rollback doesn't hide the original error.
 */
async function safeDeleteAuthUser(adminClient: ReturnType<typeof createClient>, userId: string) {
  try {
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) console.error(`[Rollback] Failed to delete auth user ${userId}:`, error.message);
    else console.log(`[Rollback] Auth user ${userId} deleted.`);
  } catch (e) {
    console.error(`[Rollback] Exception deleting auth user ${userId}:`, e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let authUserId: string | null = null;

  try {
    // 1. Verify caller is an authenticated admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: callerProfile } = await callerClient
      .from('profiles').select('role').eq('id', caller.id).maybeSingle();

    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Only admins can create users' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Parse and validate request
    const body = await req.json();
    const { email, role, fullName, schoolId, password, dateOfBirth, grade, section, gender, photoUrl, guardian } = body;

    if (!email || !role || !fullName || !schoolId || !password) {
      return new Response(JSON.stringify({ error: 'Missing required fields: email, role, fullName, schoolId, password' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. Service role client (bypasses RLS — used for admin operations only)
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 4. Create auth user
    const internalEmail = `${schoolId.toLowerCase().replace(/\s+/g, '-')}@tbd.internal`;
    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role }
    });

    if (authError || !authUser?.user) {
      return new Response(JSON.stringify({ error: 'Failed to create auth user: ' + authError?.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    authUserId = authUser.user.id; // tracked for rollback

    // 5. Call the atomic DB function that creates profile + role record in one transaction.
    //    Falls back to sequential inserts if the RPC is not yet deployed.
    const { data: rpcData, error: rpcError } = await adminClient.rpc('create_user_records', {
      p_auth_id:     authUserId,
      p_email:       email,
      p_full_name:   fullName,
      p_role:        role,
      p_school_id:   schoolId,
      p_grade:       grade || null,
      p_section:     section || 'A',
      p_gender:      gender || null,
      p_dob:         dateOfBirth || null,
      p_photo:       photoUrl || null,
      p_guardian:    guardian ? JSON.stringify(guardian) : null,
    });

    if (rpcError) {
      // RPC not deployed yet — fall back to sequential inserts
      console.warn('create_user_records RPC not available, using sequential inserts:', rpcError.message);

      // 5a. Insert profile
      const { error: profileError } = await adminClient
        .from('profiles')
        .insert({
          id:        authUserId,
          email,
          full_name: fullName,
          role,
          school_id: schoolId,
          status:    'active'
        });

      if (profileError) {
        console.error('Profile insert failed:', profileError.message);
        await safeDeleteAuthUser(adminClient, authUserId);
        return new Response(JSON.stringify({ error: 'Failed to create profile: ' + profileError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 5b. Insert role-specific record
      if (role === 'student') {
        const { error: studentError } = await adminClient.from('students').insert({
          auth_id:       authUserId,
          name:          fullName,
          grade:         grade || null,
          section:       section || 'A',
          status:        'active',
          attendance:    100,
          fees:          'pending',
          photo:         photoUrl || '👤',
          date_of_birth: dateOfBirth || null,
          gender:        gender || null,
          guardian:      guardian || null,
        });

        if (studentError) {
          console.error('Student insert failed:', studentError.message);
          await adminClient.from('profiles').delete().eq('id', authUserId);
          await safeDeleteAuthUser(adminClient, authUserId);
          return new Response(JSON.stringify({ error: 'Failed to create student record: ' + studentError.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      } else if (role === 'teacher' || role === 'staff') {
        const { error: staffError } = await adminClient.from('staff').insert({
          auth_id: authUserId,
          name:    fullName,
          role,
          status:  'active',
        });

        if (staffError) {
          console.error('Staff insert failed:', staffError.message);
          await adminClient.from('profiles').delete().eq('id', authUserId);
          await safeDeleteAuthUser(adminClient, authUserId);
          return new Response(JSON.stringify({ error: 'Failed to create staff record: ' + staffError.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
    } else if (rpcData && !rpcData.success) {
      // RPC returned an application-level error — roll back auth user
      console.error('create_user_records RPC failed:', rpcData.error);
      await safeDeleteAuthUser(adminClient, authUserId);
      return new Response(JSON.stringify({ error: rpcData.error || 'User record creation failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 6. Audit log
    await adminClient.from('audit_logs').insert({
      action:       'USER_CREATED',
      performed_by: 'admin:' + caller.id,
      target:       schoolId,
      details:      { role, auth_id: authUserId },
      timestamp:    new Date().toISOString(),
    }).then(({ error: logErr }) => {
      if (logErr) console.warn('Audit log insert failed (non-fatal):', logErr.message);
    });

    console.log(`User ${schoolId} (${role}) created successfully — auth_id: ${authUserId}`);

    return new Response(JSON.stringify({
      success: true,
      authId:  authUserId,
      userId:  schoolId,
      message: `User ${schoolId} created successfully`,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: unknown) {
    console.error('Unexpected error in create-user-immediate:', err);
    // If auth user was created before the exception, attempt rollback
    if (authUserId) {
      const adminClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      await safeDeleteAuthUser(adminClient, authUserId);
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
