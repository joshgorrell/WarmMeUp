import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { content } = body as { content: string };

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Feedback content is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmed = content.trim();
    if (trimmed.length > 5000) {
      return new Response(JSON.stringify({ error: "Feedback is too long (max 5000 characters)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: insertError } = await adminClient
      .from("user_feedback")
      .insert({
        user_id: user.id,
        user_email: user.email ?? null,
        content: trimmed,
      });

    if (insertError) {
      console.error("[submit-feedback] DB insert failed:", insertError.message);
      return new Response(JSON.stringify({ error: "Failed to save feedback" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Attempt email delivery to admin-specified addresses
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const { data: configRow } = await adminClient
      .from("app_config")
      .select("value")
      .eq("key", "feedback_emails")
      .maybeSingle();

    const recipientEmails: string[] = Array.isArray(configRow?.value)
      ? (configRow!.value as string[]).filter((e) => typeof e === "string" && e.includes("@"))
      : [];

    if (resendKey && recipientEmails.length > 0) {
      try {
        const emailBody = [
          `<h2>New feedback from Warm Me Up</h2>`,
          `<p><strong>From:</strong> ${user.email ?? "Unknown user"}</p>`,
          `<p><strong>User ID:</strong> ${user.id}</p>`,
          `<p><strong>Submitted:</strong> ${new Date().toISOString()}</p>`,
          `<hr style="border:none;border-top:1px solid #eee;margin:16px 0" />`,
          `<p style="white-space:pre-wrap;font-size:15px;line-height:1.5">${trimmed.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
        ].join("\n");

        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Warm Me Up Feedback <feedback@warmmeup.app>",
            to: recipientEmails,
            reply_to: user.email ?? undefined,
            subject: `New feedback from ${user.email ?? "a user"}`,
            html: emailBody,
          }),
        });

        if (!emailRes.ok) {
          const errText = await emailRes.text();
          console.error(`[submit-feedback] Resend API returned ${emailRes.status}:`, errText);
        }
      } catch (emailErr: any) {
        console.error("[submit-feedback] Email delivery failed:", emailErr?.message ?? String(emailErr));
      }
    } else if (!resendKey && recipientEmails.length > 0) {
      console.warn("[submit-feedback] RESEND_API_KEY not set — feedback stored in DB but no email sent");
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[submit-feedback] Unhandled error:", err?.message ?? String(err));
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
