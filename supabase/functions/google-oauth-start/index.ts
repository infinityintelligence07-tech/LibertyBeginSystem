import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveGoogleOAuthCredentials, googleOAuthRedirectUri } from "../_shared/googleOAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_APP_ORIGIN = "https://begin.libertymentoria.com.br";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/meetings.space.created",
  "https://www.googleapis.com/auth/meetings.space.settings",
  "https://www.googleapis.com/auth/meetings.space.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid",
].join(" ");

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

/** Aceita só https?://host sem path; bloqueia accounts.google.com e supabase functions. */
function sanitizeAppOrigin(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return DEFAULT_APP_ORIGIN;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return DEFAULT_APP_ORIGIN;
    const host = u.hostname.toLowerCase();
    if (
      host === "accounts.google.com" ||
      host.endsWith(".supabase.co") ||
      host === "localhost" ||
      host === "127.0.0.1"
    ) {
      // localhost ok em dev
      if (host === "localhost" || host === "127.0.0.1") return u.origin;
      if (host.endsWith(".supabase.co") || host === "accounts.google.com") return DEFAULT_APP_ORIGIN;
    }
    return u.origin;
  } catch {
    return DEFAULT_APP_ORIGIN;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const returnTo = typeof body.returnTo === "string" && body.returnTo.startsWith("/") && !body.returnTo.startsWith("//")
      ? body.returnTo
      : "/perfil";

    const appOrigin = sanitizeAppOrigin(
      body.appOrigin || req.headers.get("origin") || Deno.env.get("APP_URL") || DEFAULT_APP_ORIGIN,
    );

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { clientId, clientSecret } = await resolveGoogleOAuthCredentials(admin);
    const redirectUri = googleOAuthRedirectUri();

    // userId | returnTo | appOrigin | timestamp  (appOrigin sem '|')
    const statePayload = `${user.id}|${returnTo}|${appOrigin}|${Date.now()}`;
    const sig = await hmac(statePayload, clientSecret);
    const state = btoa(`${statePayload}|${sig}`);

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);

    return new Response(JSON.stringify({ url: url.toString() }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
