// Edge function: send-push
// Delivers a push notification to every FCM token belonging to a user via
// Firebase Cloud Messaging HTTP v1 API. Auth is a signed JWT built from the
// service account private key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface PushPayload {
  user_id: string;
  title: string;
  body?: string;
  link?: string;
  tag?: string;
  notification_id?: string;
}

const SERVICE_ACCOUNT_JSON = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUSH_TRIGGER_SECRET = Deno.env.get("PUSH_TRIGGER_SECRET")!;

let cachedToken: { token: string; expiresAt: number } | null = null;

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.token;

  const sa = JSON.parse(SERVICE_ACCOUNT_JSON) as {
    client_email: string;
    private_key: string;
    token_uri: string;
  };

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(new TextEncoder().encode(JSON.stringify(header)))}.${b64url(new TextEncoder().encode(JSON.stringify(claim)))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`google token exchange failed [${res.status}]: ${t}`);
  }
  const { access_token, expires_in } = await res.json();
  cachedToken = { token: access_token, expiresAt: now + (expires_in || 3600) };
  return access_token;
}

async function sendToToken(
  projectId: string,
  accessToken: string,
  token: string,
  p: PushPayload,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const body = {
    message: {
      token,
      notification: { title: p.title, body: p.body || "" },
      webpush: {
        headers: { Urgency: "high", TTL: "86400" },
        notification: {
          title: p.title,
          body: p.body || "",
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: p.tag || "liberty-notif",
          vibrate: [120, 60, 120],
          requireInteraction: false,
        },
        fcm_options: { link: p.link || "/" },
      },
      data: {
        link: p.link || "/",
        tag: p.tag || "liberty-notif",
        notification_id: p.notification_id || "",
      },
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, error: text };
  }
  return { ok: true, status: res.status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Simple shared-secret auth: DB trigger passes PUSH_TRIGGER_SECRET in Authorization
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ") || auth.slice(7) !== PUSH_TRIGGER_SECRET) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as PushPayload;
    if (!payload?.user_id || !payload?.title) {
      return new Response(JSON.stringify({ error: "user_id and title required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sa = JSON.parse(SERVICE_ACCOUNT_JSON);
    const projectId = sa.project_id;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("token")
      .eq("user_id", payload.user_id);
    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, note: "no tokens" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getAccessToken();
    const results = await Promise.all(
      subs.map((s: any) => sendToToken(projectId, accessToken, s.token, payload)),
    );

    // Clean up expired/invalid tokens (UNREGISTERED / INVALID_ARGUMENT)
    const dead: string[] = [];
    results.forEach((r, i) => {
      if (!r.ok && (r.status === 404 || r.status === 400)) dead.push((subs as any)[i].token);
    });
    if (dead.length) {
      await supabase.from("push_subscriptions").delete().in("token", dead);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sent: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        removed: dead.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[send-push] error:", err?.message, err?.stack);
    return new Response(JSON.stringify({ error: err?.message || "internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
