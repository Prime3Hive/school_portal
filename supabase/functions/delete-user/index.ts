import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  try {
    // Verify the caller is an authenticated admin
    const authHeader = req.headers.get("authorization") || "";
    const callerToken = authHeader.replace("Bearer ", "").trim();
    if (!callerToken) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: CORS_HEADERS,
      });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    // Validate the caller's token and confirm admin role
    const { data: callerData, error: callerErr } = await adminClient.auth.getUser(callerToken);
    if (callerErr || !callerData?.user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: CORS_HEADERS,
      });
    }

    const { data: callerProfile, error: profileErr } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", callerData.user.id)
      .maybeSingle();

    if (profileErr || callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden — admin role required" }), {
        status: 403,
        headers: CORS_HEADERS,
      });
    }

    // Parse body
    const body = await req.json();
    const targetUserId: string = body.userId; // Supabase Auth UUID of the user to delete

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    // Prevent self-deletion
    if (targetUserId === callerData.user.id) {
      return new Response(JSON.stringify({ error: "You cannot delete your own account" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    // Soft-delete: mark profile as inactive first (preserves referential integrity)
    const { error: softDeleteErr } = await adminClient
      .from("profiles")
      .update({ status: "inactive", updated_at: new Date().toISOString() })
      .eq("id", targetUserId);

    if (softDeleteErr) {
      console.error("Failed to soft-delete profile:", softDeleteErr);
      // Continue — still attempt Auth deletion
    }

    // Hard-delete from Supabase Auth (removes login capability permanently)
    const { error: authDeleteErr } = await adminClient.auth.admin.deleteUser(targetUserId);

    if (authDeleteErr) {
      console.error("Failed to delete auth user:", authDeleteErr);
      return new Response(
        JSON.stringify({ error: "Failed to delete user from Auth: " + authDeleteErr.message }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // Audit log
    await adminClient.from("audit_logs").insert({
      action: "USER_DELETED",
      performed_by: callerProfile?.role + ":" + callerData.user.id,
      target: targetUserId,
      details: { deleted_at: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    });

    console.log(`User ${targetUserId} deleted by admin ${callerData.user.id}`);

    return new Response(JSON.stringify({ success: true, deleted: targetUserId }), {
      status: 200,
      headers: CORS_HEADERS,
    });

  } catch (err) {
    console.error("delete-user error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
