import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveGoogleOAuthCredentials, googleOAuthRedirectUri } from "../_shared/googleOAuth.ts";

const DEFAULT_APP_ORIGIN = "https://begin.libertymentoria.com.br";

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

function sanitizeAppOrigin(raw: string | undefined): string {
  if (!raw) return DEFAULT_APP_ORIGIN;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return DEFAULT_APP_ORIGIN;
    const host = u.hostname.toLowerCase();
    if (host === "accounts.google.com" || host.endsWith(".supabase.co")) return DEFAULT_APP_ORIGIN;
    return u.origin;
  } catch {
    return DEFAULT_APP_ORIGIN;
  }
}

function parseStatePayload(payload: string): { userId: string; returnTo: string; appOrigin: string } {
  // Formato novo: userId|returnTo|appOrigin|timestamp
  // Formato antigo: userId|returnTo|timestamp
  const parts = payload.split("|");
  if (parts.length >= 4 && /^https?:\/\//i.test(parts[2])) {
    return {
      userId: parts[0],
      returnTo: parts[1],
      appOrigin: sanitizeAppOrigin(parts[2]),
    };
  }
  return {
    userId: parts[0] || "",
    returnTo: parts[1] || "/perfil",
    appOrigin: DEFAULT_APP_ORIGIN,
  };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return htmlRedirect(`${DEFAULT_APP_ORIGIN}/perfil?google=denied`, "Conexão cancelada.");
  }
  if (!code || !state) {
    return new Response("Missing code/state", { status: 400 });
  }

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { clientId, clientSecret } = await resolveGoogleOAuthCredentials(admin);
    const redirectUri = googleOAuthRedirectUri();

    const decoded = atob(state);
    const parts = decoded.split("|");
    const sig = parts.pop()!;
    const payload = parts.join("|");
    const expectedSig = await hmac(payload, clientSecret);
    if (sig !== expectedSig) return new Response("Invalid state", { status: 400 });

    const { userId, returnTo, appOrigin } = parseStatePayload(payload);
    const safeReturn =
      typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//")
        ? returnTo
        : "/perfil";

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("Token exchange failed", tokens);
      return new Response("Token exchange failed: " + JSON.stringify(tokens), { status: 500 });
    }

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userInfoRes.json();

    const { data: prof } = await admin.from("profiles").select("id").eq("user_id", userId).maybeSingle();
    if (prof?.id && tokens.refresh_token) {
      await admin.from("user_oauth_tokens").upsert({
        profile_id: prof.id,
        google_refresh_token: tokens.refresh_token,
        updated_at: new Date().toISOString(),
      }, { onConflict: "profile_id" });
    } else if (prof?.id && !tokens.refresh_token) {
      // Reconsent sem refresh novo: mantém token antigo se existir
      console.warn("OAuth sem refresh_token; perfil", prof.id);
    }

    await admin
      .from("profiles")
      .update({
        google_connected: true,
        google_calendar_email: userInfo.email,
      })
      .eq("user_id", userId);

    await admin.from("notifications").insert({
      user_id: userId,
      type: "google_connected",
      title: "Google Agenda conectado",
      message: `Sua conta ${userInfo.email} foi conectada com sucesso.`,
      link: safeReturn,
    });

    const target = `${appOrigin.replace(/\/$/, "")}${safeReturn}?google=connected`;
    return htmlRedirect(target, "Conectado! Redirecionando...");
  } catch (e) {
    console.error(e);
    return new Response("Error: " + String(e), { status: 500 });
  }
});
