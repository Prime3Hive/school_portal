import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  try {
    // 1. Verify caller is admin
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
      .from('profiles').select('role').eq('id', caller.id).single();
    
    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Only admins can send invitations' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Parse request
    const { email, role, fullName, department, grade, section, dateOfBirth, expiryDays = 14 } = await req.json();

    if (!email || !role || !fullName) {
      return new Response(JSON.stringify({ error: 'Missing required fields: email, role, fullName' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. Generate user ID and password (but don't create user yet)
    const userId = generateUserId(role);
    const password = role === 'student' && dateOfBirth 
      ? formatDateOfBirthPassword(dateOfBirth)
      : generateRandomPassword();

    // 4. Create service role client (bypasses RLS)
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 5. Create invitation record ONLY (no user creation yet)
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

    const { error: inviteError } = await adminClient.from('invitations').insert({
      email: email,
      role,
      token,
      school_id: userId,
      default_password: password,
      full_name: fullName,
      status: 'pending',
      invited_by: caller.id,
      metadata: { 
        department: department || null, 
        fullName, 
        grade, 
        section, 
        dateOfBirth,
        // Store these for later user creation
        userId,
        password
      },
      expires_at: expiresAt
    });

    if (inviteError) {
      console.error('Invitation record creation failed:', inviteError);
      return new Response(JSON.stringify({ error: 'Failed to create invitation: ' + inviteError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 6. Send email
    let emailSent = false;
    let emailMessage = '';

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
      try {
        const inviteLink = `${req.headers.get('origin') || 'https://yourschool.com'}/verify-invitation.html?token=${token}`;
        const portalUrl = `${req.headers.get('origin') || 'https://yourschool.com'}/login.html`;
        
        const emailHtml = buildEmailHtml({
          fullName,
          role,
          loginId: userId,
          password,
          inviteLink,
          portalUrl,
          expiryDays,
          grade,
          section
        });

        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'onboarding@resend.dev',
            to: [email],
            subject: `You're Invited to Join the School Portal as ${capitalize(role)}`,
            html: emailHtml
          })
        });

        if (resendRes.ok) {
          emailSent = true;
          emailMessage = `Invitation email sent to ${email}`;
        } else {
          const errBody = await resendRes.text();
          console.error('Resend error:', errBody);
          emailMessage = 'Email service error';
        }
      } catch (emailErr) {
        console.error('Email sending failed:', emailErr);
        emailMessage = 'Email service unavailable';
      }
    } else {
      emailMessage = 'No email service configured (RESEND_API_KEY not set)';
    }

    // 7. Return success (user will be created when they accept the invitation)
    return new Response(JSON.stringify({
      success: true,
      userId,
      password,
      token,
      emailSent,
      emailMessage,
      message: `Invitation created for ${userId}. User account will be created upon acceptance.`
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Helper functions
function generateUserId(role: string): string {
  const year = new Date().getFullYear();
  const prefixes: Record<string, string> = {
    admin: 'ADM',
    teacher: 'TCH',
    staff: 'STF',
    student: 'STU'
  };
  const prefix = prefixes[role] || 'USR';
  const random = Math.floor(Math.random() * 900) + 100;
  return `${prefix}-${year}-${String(random).padStart(3, '0')}`;
}

function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function formatDateOfBirthPassword(dateOfBirth: string): string {
  const parts = dateOfBirth.split('-');
  return parts[2] + parts[1] + parts[0];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildEmailHtml(data: {
  fullName: string;
  role: string;
  loginId: string;
  password: string;
  inviteLink: string;
  portalUrl: string;
  expiryDays: number;
  grade?: string;
  section?: string;
}): string {
  const roleLabels: Record<string, string> = {
    admin: 'Administrator',
    teacher: 'Teacher',
    staff: 'Staff Member',
    student: 'Student'
  };
  const roleLabel = roleLabels[data.role] || data.role;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f0f2f5;">
  <div style="max-width: 600px; margin: 30px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
    
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 48px 32px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 12px;">🎓</div>
      <h1 style="margin: 0; font-size: 26px; font-weight: 700;">Welcome to School Portal</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 16px;">You've been invited as <strong>${roleLabel}</strong></p>
    </div>
    
    <div style="padding: 40px 32px;">
      <p style="font-size: 16px; margin-bottom: 24px;">Hello <strong>${data.fullName}</strong>,</p>
      
      <p style="font-size: 15px; margin-bottom: 24px; color: #555;">
        You have been invited to join the school portal. Click the button below to accept your invitation and activate your account.
      </p>
      
      <div style="background: #f8f9ff; border: 1px solid #e0e4f5; border-radius: 8px; padding: 24px; margin: 28px 0;">
        <h3 style="margin: 0 0 16px 0; color: #667eea; font-size: 16px;">🔑 Your Login Credentials</h3>
        <p style="margin: 0 0 12px 0; font-size: 14px; color: #666;">These will be activated when you accept the invitation:</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666; width: 120px;">Login ID</td>
            <td style="padding: 8px 0;"><code style="background: white; padding: 4px 12px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 15px; font-weight: 600; border: 1px solid #e0e4f5;">${data.loginId}</code></td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Password</td>
            <td style="padding: 8px 0;"><code style="background: white; padding: 4px 12px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 15px; font-weight: 600; border: 1px solid #e0e4f5;">${data.password}</code></td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Role</td>
            <td style="padding: 8px 0;"><strong>${roleLabel}</strong></td>
          </tr>
          ${data.grade && data.section ? `
          <tr>
            <td style="padding: 8px 0; color: #666;">Class</td>
            <td style="padding: 8px 0;"><strong>Grade ${data.grade} - Section ${data.section}</strong></td>
          </tr>
          ` : ''}
        </table>
      </div>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${data.inviteLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 48px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(102,126,234,0.4);">Accept Invitation</a>
      </div>
      
      <div style="background: #fff8e1; border: 1px solid #ffe082; padding: 16px; border-radius: 8px; margin-top: 28px;">
        <p style="margin: 0; font-size: 14px; color: #f57f17;">
          ⚠️ <strong>Important:</strong> You must accept this invitation to activate your account.
          This invitation expires in <strong>${data.expiryDays} days</strong>.
        </p>
      </div>
    </div>
    
    <div style="background: #f8f9fa; padding: 24px 32px; text-align: center; border-top: 1px solid #e9ecef;">
      <p style="margin: 0; font-size: 13px; color: #999;">
        If you did not expect this invitation, please ignore this email.
      </p>
      <p style="margin: 8px 0 0 0; font-size: 12px; color: #bbb;">
        © ${new Date().getFullYear()} School Portal. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>`;
}
