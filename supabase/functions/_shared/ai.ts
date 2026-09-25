// Cliente de IA sem Lovable: OpenAI ou Google Gemini (endpoint OpenAI-compat).
// Secrets suportados (Edge Functions → Secrets, ou private.app_secrets via get_app_secret):
//   - OPENAI_API_KEY (+ opcional OPENAI_MODEL, default gpt-4o-mini)
//   - GEMINI_API_KEY ou GOOGLE_AI_API_KEY (+ opcional GEMINI_MODEL, default gemini-2.5-flash)

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatCompletionsRequest = {
  messages: ChatMessage[];
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: unknown;
  temperature?: number;
};

export type AiProviderConfig = {
  provider: "openai" | "gemini";
  apiKey: string;
  baseUrl: string;
  model: string;
};

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

async function loadSecretFromDb(name: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceKey) return null;

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_app_secret`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ secret_name: name }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const value = await res.json();
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export async function resolveAiConfig(): Promise<AiProviderConfig> {
  const openai =
    Deno.env.get("OPENAI_API_KEY")?.trim() ||
    (await loadSecretFromDb("OPENAI_API_KEY"));
  if (openai) {
    return {
      provider: "openai",
      apiKey: openai,
      baseUrl: "https://api.openai.com/v1",
      model: Deno.env.get("OPENAI_MODEL")?.trim() || "gpt-4o-mini",
    };
  }

  const gemini =
    (
      Deno.env.get("GEMINI_API_KEY") ||
      Deno.env.get("GOOGLE_AI_API_KEY") ||
      ""
    ).trim() ||
    (await loadSecretFromDb("GEMINI_API_KEY")) ||
    (await loadSecretFromDb("GOOGLE_AI_API_KEY"));
  if (gemini) {
    return {
      provider: "gemini",
      apiKey: gemini,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-2.5-flash",
    };
  }

  throw new AiConfigError(
    "Chave de IA ausente. Configure GEMINI_API_KEY ou OPENAI_API_KEY nos secrets do Supabase.",
  );
}

export async function chatCompletions(
  body: ChatCompletionsRequest,
  opts?: { timeoutMs?: number },
): Promise<Response> {
  const cfg = await resolveAiConfig();
  const timeoutMs = opts?.timeoutMs ?? 90_000;
  return fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      ...body,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export function missingAiKeyResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error:
        "Chave de IA ausente. Configure GEMINI_API_KEY ou OPENAI_API_KEY nos secrets do Supabase (Edge Functions → Secrets).",
    }),
    {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
