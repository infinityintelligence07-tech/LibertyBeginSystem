import { createClient } from "npm:@supabase/supabase-js@2";

async function hmac(data: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function htmlRedirect(to: string, message: string) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Conectando...</title></head><body style="background:#0a0a08;color:#a0a8b4;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><p>${message}</p><p><a style="color:#a0a8b4" href="${to}">Continuar</a></p></div><script>setTimeout(()=>location.href=${JSON.stringify(to)},800)</script></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const appOrigin = req.headers.get("origin") || req.headers.get("referer") || "https://begin.libertymentoria.com.br";

  if (errorParam) {
    return htmlRedirect(`${appOrigin}/mentor/dashboard?google=denied`, "Conexão cancelada.");
  }
  if (!code || !state) {
    return new Response("Missing code/state", { status: 400 });
  }

  try {
    const secret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-oauth-callback`;

    const decoded = atob(state);
    const parts = decoded.split("|");
    const sig = parts.pop()!;
    const payload = parts.join("|");
    const expectedSig = await hmac(payload, secret);
    if (sig !== expectedSig) return new Response("Invalid state", { status: 400 });

    const [userId, returnTo] = payload.split("|");

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: secret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("Token exchange failed", tokens);
      return new Response("Token exchange failed: " + JSON.stringify(tokens), { status: 500 });
    }

    // Get user email
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userInfoRes.json();

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Find profile id for this user
    const { data: prof } = await admin.from("profiles").select("id").eq("user_id", userId).maybeSingle();
    if (prof?.id) {
      await admin.from("user_oauth_tokens").upsert({
        profile_id: prof.id,
        google_refresh_token: tokens.refresh_token,
        updated_at: new Date().toISOString(),
      }, { onConflict: "profile_id" });
    }
    await admin
      .from("profiles")
      .update({
        google_connected: true,
        google_calendar_email: userInfo.email,
      })
      .eq("user_id", userId);

    // Optional welcome notification
    await admin.from("notifications").insert({
      user_id: userId,
      type: "google_connected",
      title: "Google Agenda conectado",
      message: `Sua conta ${userInfo.email} foi conectada com sucesso.`,
      link: returnTo || "/mentor/dashboard",
    });

    const target = `${appOrigin.replace(/\/$/, "")}${returnTo || "/mentor/dashboard"}?google=connected`;
    return htmlRedirect(target, "Conectado! Redirecionando...");
  } catch (e) {
    console.error(e);
    return new Response("Error: " + String(e), { status: 500 });
  }
});
