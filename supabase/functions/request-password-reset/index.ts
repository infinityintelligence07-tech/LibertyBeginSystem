// "Esqueci minha senha": gera o link de recuperação e envia pelo Gmail da conta
// host do Meet. O e-mail padrão do Supabase não entrega para os alunos.
// A resposta não diz se o e-mail existe.
import { handleOptions, json, errorJson } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/auth.ts";
import { resolveGoogleOAuthCredentials } from "../_shared/googleOAuth.ts";

const APP_ORIGIN = "https://begin.libertymentoria.com.br";
const ALLOWED_ORIGINS = new Set([
  APP_ORIGIN,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const MIN_INTERVAL_MS = 90_000;

function appOrigin(raw: unknown): string {
  const value = typeof raw === "string" ? raw.replace(/\/$/, "") : "";
  return ALLOWED_ORIGINS.has(value) ? value : APP_ORIGIN;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function hostGmail(admin: ReturnType<typeof getAdminClient>): Promise<{ accessToken: string; from: string } | { error: string }> {
  const { data: hosts } = await admin
    .from("meeting_hosts")
    .select("email, profile_id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1);
  const host = hosts?.[0];
  if (!host?.email) return { error: "Conta de envio não configurada." };

  let profileId = host.profile_id as string | null;
  if (!profileId) {
    const { data: profile } = await admin.from("profiles").select("id").ilike("email", host.email).maybeSingle();
    profileId = profile?.id ?? null;
  }
  if (!profileId) return { error: "Conta de envio sem perfil." };

  const { data: tokenRow } = await admin
    .from("user_oauth_tokens")
    .select("google_refresh_token")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!tokenRow?.google_refresh_token) return { error: "Conta de envio sem Google conectado." };

  const { clientId, clientSecret } = await resolveGoogleOAuthCredentials(admin);
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokenRow.google_refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson.access_token) return { error: "Não foi possível enviar o e-mail agora." };
  return { accessToken: tokenJson.access_token, from: host.email };
}

async function sendGmail(accessToken: string, from: string, to: string, subject: string, html: string): Promise<void> {
  const encode = (value: string) => btoa(unescape(encodeURIComponent(value)));
  const mime = [
    `From: Liberty Begin <${from}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${encode(subject)}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encode(html).replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
  const raw = encode(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn("[request-password-reset] gmail", res.status, body.slice(0, 180));
    throw new Error("Não foi possível enviar o e-mail agora.");
  }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return errorJson("Método não permitido", 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    if (!email.includes("@") || email.length > 200) return errorJson("Informe um e-mail válido.", 400);

    const admin = getAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("user_id, full_name")
      .ilike("email", email)
      .not("user_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (!profile?.user_id) return json({ ok: true });

    const { data: authUser, error: userErr } = await admin.auth.admin.getUserById(profile.user_id);
    if (userErr || !authUser?.user?.email) return json({ ok: true });

    const sentAt = authUser.user.recovery_sent_at ? Date.parse(authUser.user.recovery_sent_at) : 0;
    if (sentAt && Date.now() - sentAt < MIN_INTERVAL_MS) return json({ ok: true });

    const origin = appOrigin(body?.origin);
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: authUser.user.email,
      options: { redirectTo: `${origin}/reset-password` },
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkErr || !tokenHash) {
      console.warn("[request-password-reset] link", linkErr?.message);
      return errorJson("Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.", 500);
    }

    const resetUrl = `${origin}/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
    const name = (profile.full_name || "").trim().split(" ")[0] || "olá";
    const gmail = await hostGmail(admin);
    if ("error" in gmail) {
      console.warn("[request-password-reset] host", gmail.error);
      return errorJson("Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.", 500);
    }

    await sendGmail(
      gmail.accessToken,
      gmail.from,
      authUser.user.email,
      "Nova senha do Liberty Begin",
      `<p>${escapeHtml(name)},</p><p>Para criar uma nova senha, abra o link abaixo. Ele vale por pouco tempo e só pode ser usado uma vez.</p><p><a href="${escapeHtml(resetUrl)}">Criar nova senha</a></p><p>Se você não pediu isso, ignore este e-mail.</p>`,
    );

    return json({ ok: true });
  } catch (e) {
    console.warn("[request-password-reset]", e instanceof Error ? e.message : e);
    return errorJson("Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.", 500);
  }
});
