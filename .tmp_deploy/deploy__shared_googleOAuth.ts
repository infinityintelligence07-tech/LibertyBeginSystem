/** Credenciais OAuth Google: env das Edge Functions, com fallback em system_config. */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

export type GoogleOAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

async function fromSystemConfig(admin: SupabaseClient): Promise<Partial<GoogleOAuthCredentials>> {
  const { data } = await admin
    .from("system_config")
    .select("key, value")
    .in("key", ["google_oauth_client_id", "google_oauth_client_secret"]);
  const map = new Map((data || []).map((r: { key: string; value: string }) => [r.key, (r.value || "").trim()]));
  return {
    clientId: map.get("google_oauth_client_id") || undefined,
    clientSecret: map.get("google_oauth_client_secret") || undefined,
  };
}

/** Resolve client_id/secret. Prefere Deno.env; se vazio, lê system_config (service role). */
export async function resolveGoogleOAuthCredentials(
  admin?: SupabaseClient,
): Promise<GoogleOAuthCredentials> {
  let clientId = (Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "").trim();
  let clientSecret = (Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || "").trim();

  if ((!clientId || !clientSecret) && admin) {
    const cfg = await fromSystemConfig(admin);
    clientId = clientId || cfg.clientId || "";
    clientSecret = clientSecret || cfg.clientSecret || "";
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID/SECRET não configurados (Edge Secrets ou system_config).",
    );
  }
  return { clientId, clientSecret };
}

export function googleOAuthRedirectUri(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-oauth-callback`;
}
