/**
 * Tradução de erros de autenticação (Supabase GoTrue) para mensagens em PT-BR.
 * Usado no Login e nas telas de redefinição de senha.
 */

// TODO(admin): preencher com o número real do suporte Liberty no formato `https://wa.me/55DDDNUMERO`
// (só dígitos, com DDI 55). Enquanto estiver vazio, o link abre o WhatsApp sem contato pré-selecionado.
export const SUPPORT_WHATSAPP_URL = "https://wa.me/";

export const AUTH_DEFAULT_ERROR_MESSAGE =
  "Não foi possível entrar. Tente novamente ou fale com o suporte.";

/** Mensagem neutra exibida após "Esqueci minha senha" (não revela se o e-mail existe). */
export const FORGOT_PASSWORD_NEUTRAL_MESSAGE =
  "Se este e-mail tiver uma conta, você receberá o link em alguns minutos. Verifique também o spam. Se não chegar, peça um novo acesso pela equipe Liberty pelo WhatsApp.";

type AuthErrorLike = {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
};

const RULES: Array<{ test: (msg: string, code: string) => boolean; message: string }> = [
  {
    test: (msg, code) => msg.includes("invalid login credentials") || code === "invalid_credentials",
    message: "E-mail ou senha incorretos. Se você recebeu a senha por WhatsApp, confira maiúsculas e minúsculas.",
  },
  {
    test: (msg, code) => msg.includes("email not confirmed") || code === "email_not_confirmed",
    message: "Seu e-mail ainda não foi confirmado. Fale com o suporte.",
  },
  {
    test: (msg, code) =>
      msg.includes("too many requests") ||
      msg.includes("rate limit") ||
      code === "over_request_rate_limit" ||
      code === "over_email_send_rate_limit",
    message: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  },
  {
    test: (msg, code) => msg.includes("user not found") || code === "user_not_found",
    message: "Não encontramos uma conta com este e-mail. Fale com a equipe Liberty para gerar seu acesso.",
  },
  {
    test: (msg, code) => msg.includes("user is banned") || code === "user_banned",
    message: "Sua conta está bloqueada. Fale com a equipe Liberty.",
  },
  {
    test: (msg, code) =>
      msg.includes("network") || msg.includes("failed to fetch") || msg.includes("load failed") || code === "network_error",
    message: "Sem conexão. Verifique sua internet.",
  },
  {
    test: (msg, code) =>
      msg.includes("same_password") || msg.includes("should be different from the old password") || code === "same_password",
    message: "A nova senha precisa ser diferente da atual.",
  },
  {
    test: (msg, code) => msg.includes("password should be at least") || code === "weak_password",
    message: "A senha precisa ter pelo menos 6 caracteres.",
  },
  {
    test: (msg, code) =>
      msg.includes("auth session missing") || msg.includes("otp_expired") || msg.includes("token has expired") || code === "otp_expired" || code === "session_not_found",
    message: "Este link expirou ou já foi usado. Peça um novo em \"Esqueci minha senha\".",
  },
  {
    // Erros de timeout gerados pelo próprio app (useAuth.signIn) já vêm em PT.
    test: (msg) => msg.includes("tempo esgotado"),
    message: "Tempo esgotado. Verifique sua conexão e tente novamente.",
  },
];

/** Converte um erro de auth (AuthError, Error, string ou desconhecido) em mensagem PT-BR amigável. */
export function translateAuthError(error: unknown): string {
  let rawMessage = "";
  let code = "";

  if (typeof error === "string") {
    rawMessage = error;
  } else if (error && typeof error === "object") {
    const e = error as AuthErrorLike;
    rawMessage = typeof e.message === "string" ? e.message : "";
    code = typeof e.code === "string" ? e.code : "";
  }

  const msg = rawMessage.toLowerCase();
  const normalizedCode = code.toLowerCase();

  for (const rule of RULES) {
    if (rule.test(msg, normalizedCode)) return rule.message;
  }
  return AUTH_DEFAULT_ERROR_MESSAGE;
}
