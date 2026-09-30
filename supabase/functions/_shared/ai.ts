// Cliente de IA sem Lovable. Três APIs, o mesmo pedido (mensagens, ferramentas e instrução).
// Se uma responde sem crédito, limite ou indisponível, a próxima é tentada.
// Secrets (Edge Functions → Secrets, ou private.app_secrets via get_app_secret):
//   - OPENAI_API_KEY (+ opcional OPENAI_MODEL, default gpt-4o-mini)
//   - GEMINI_API_KEY ou GOOGLE_AI_API_KEY (+ opcional GEMINI_MODEL, default gemini-2.5-flash)
//   - ANTHROPIC_API_KEY (+ opcional ANTHROPIC_MODEL, default claude-sonnet-4-5)

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

export type AiProviderName = "openai" | "gemini" | "anthropic";

export type AiProviderConfig = {
  provider: AiProviderName;
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

const QUOTA_ERROR =
  "Sem créditos de IA. Verifique o plano da chave OpenAI, Gemini ou Anthropic.";

type AttemptKind = "quota" | "rate_limit" | "other";

type ProviderAttempt = {
  provider: AiProviderConfig["provider"];
  status: number;
  kind: AttemptKind;
};

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

async function loadOpenAiConfig(): Promise<AiProviderConfig | null> {
  const openai =
    Deno.env.get("OPENAI_API_KEY")?.trim() ||
    (await loadSecretFromDb("OPENAI_API_KEY"));
  if (!openai) return null;
  return {
    provider: "openai",
    apiKey: openai,
    baseUrl: "https://api.openai.com/v1",
    model: Deno.env.get("OPENAI_MODEL")?.trim() || "gpt-4o-mini",
  };
}

async function loadGeminiConfig(): Promise<AiProviderConfig | null> {
  const gemini =
    (
      Deno.env.get("GEMINI_API_KEY") ||
      Deno.env.get("GOOGLE_AI_API_KEY") ||
      ""
    ).trim() ||
    (await loadSecretFromDb("GEMINI_API_KEY")) ||
    (await loadSecretFromDb("GOOGLE_AI_API_KEY"));
  if (!gemini) return null;
  return {
    provider: "gemini",
    apiKey: gemini,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-2.5-flash",
  };
}

async function loadAnthropicConfig(): Promise<AiProviderConfig | null> {
  const key =
    Deno.env.get("ANTHROPIC_API_KEY")?.trim() ||
    (await loadSecretFromDb("ANTHROPIC_API_KEY"));
  if (!key) return null;
  return {
    provider: "anthropic",
    apiKey: key,
    baseUrl: "https://api.anthropic.com/v1/messages",
    model: Deno.env.get("ANTHROPIC_MODEL")?.trim() || "claude-sonnet-4-5",
  };
}

/** Ordem fixa: OpenAI, Gemini, Anthropic. Chave ausente é pulada. */
export async function loadProviders(): Promise<AiProviderConfig[]> {
  const [openai, gemini, anthropic] = await Promise.all([
    loadOpenAiConfig(),
    loadGeminiConfig(),
    loadAnthropicConfig(),
  ]);
  return [openai, gemini, anthropic].filter((p): p is AiProviderConfig => p != null);
}

export async function resolveAiConfig(): Promise<AiProviderConfig> {
  const providers = await loadProviders();
  if (!providers.length) {
    throw new AiConfigError(
      "Chave de IA ausente. Configure OPENAI_API_KEY, GEMINI_API_KEY ou ANTHROPIC_API_KEY nos secrets do Supabase.",
    );
  }
  return providers[0];
}

function jsonError(
  error: string,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorSample(bodyText: string): string {
  const trimmed = bodyText.slice(0, 4_000);
  try {
    const parsed = JSON.parse(trimmed);
    const err = parsed?.error ?? parsed;
    if (err && typeof err === "object") {
      const parts = [err.message, err.type, err.code, err.status].filter(
        (v): v is string => typeof v === "string",
      );
      if (parts.length) return parts.join(" ");
    }
    if (typeof err === "string") return err.slice(0, 500);
  } catch {
    /* plain text */
  }
  return trimmed.slice(0, 500);
}

function bodySignalsQuota(bodyText: string): boolean {
  const lower = errorSample(bodyText).toLowerCase();
  return (
    lower.includes("insufficient_quota") ||
    lower.includes("billing") ||
    lower.includes("credit")
  );
}

function bodySignalsRateLimit(bodyText: string): boolean {
  const lower = errorSample(bodyText).toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("ratelimit") ||
    lower.includes("too many requests") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota")
  );
}

/** 402, 429, or a body that clearly describes quota, billing, or rate limit. */
export function classifyProviderFailure(
  status: number,
  bodyText: string,
): { retry: boolean; kind: AttemptKind } {
  const quota = status === 402 || bodySignalsQuota(bodyText);
  const rate = status === 429 || bodySignalsRateLimit(bodyText);
  if (quota) return { retry: true, kind: "quota" };
  if (rate) return { retry: true, kind: "rate_limit" };
  return { retry: false, kind: "other" };
}

function providerLabel(provider: AiProviderName): string {
  if (provider === "openai") return "OpenAI";
  if (provider === "gemini") return "Gemini";
  return "Anthropic";
}

type OpenAITool = {
  type?: string;
  function?: { name?: string; description?: string; parameters?: unknown };
};

/** O mesmo pedido das outras APIs, no formato da Anthropic. A resposta volta no formato OpenAI. */
function anthropicPayload(body: ChatCompletionsRequest, model: string): Record<string, unknown> {
  const system = body.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const messages = body.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  const tools = ((body.tools as OpenAITool[] | undefined) || [])
    .map((t) => t.function)
    .filter((fn): fn is NonNullable<OpenAITool["function"]> => !!fn?.name)
    .map((fn) => ({
      name: fn.name,
      description: fn.description || "",
      input_schema: fn.parameters || { type: "object", properties: {} },
    }));
  const choice = body.tool_choice as { function?: { name?: string } } | undefined;
  const payload: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    messages: messages.length ? messages : [{ role: "user", content: system || "Responda." }],
  };
  if (system) payload.system = system;
  if (tools.length) {
    payload.tools = tools;
    payload.tool_choice = choice?.function?.name
      ? { type: "tool", name: choice.function.name }
      : { type: "any" };
  }
  return payload;
}

function anthropicToOpenAI(data: { content?: Array<{ type?: string; text?: string; name?: string; input?: unknown }> }) {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const tool = blocks.find((b) => b.type === "tool_use" && b.name);
  if (tool) {
    return {
      choices: [{
        message: {
          tool_calls: [{
            function: {
              name: tool.name,
              arguments: JSON.stringify(tool.input ?? {}),
            },
          }],
        },
      }],
    };
  }
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text || "").join("\n");
  return { choices: [{ message: { content: text } }] };
}

function failureResponse(
  attempts: ProviderAttempt[],
  corsHeaders: Record<string, string>,
): Response {
  const allQuota = attempts.length > 0 && attempts.every((a) => a.kind === "quota");
  if (allQuota) return jsonError(QUOTA_ERROR, 402, corsHeaders);

  const detail = attempts
    .map((a) => `${providerLabel(a.provider)} ${a.status > 0 ? a.status : "sem resposta"}`)
    .join(", ");
  const allRate = attempts.length > 0 && attempts.every((a) => a.kind === "rate_limit");
  if (allRate) {
    return jsonError(
      `Muitas requisições de IA (${detail}). Tente novamente em alguns segundos.`,
      429,
      corsHeaders,
    );
  }
  return jsonError(
    `A IA não respondeu (${detail}). Tente novamente em instantes.`,
    500,
    corsHeaders,
  );
}

async function postChatCompletions(
  cfg: AiProviderConfig,
  body: ChatCompletionsRequest,
  timeoutMs: number,
): Promise<Response> {
  if (cfg.provider === "anthropic") {
    const res = await fetch(cfg.baseUrl, {
      method: "POST",
      headers: {
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(anthropicPayload(body, cfg.model)),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return res;
    const data = await res.json();
    return new Response(JSON.stringify(anthropicToOpenAI(data)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

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

export async function chatCompletions(
  body: ChatCompletionsRequest,
  opts?: { timeoutMs?: number },
): Promise<Response> {
  return chatCompletionsWithFallback(body, { timeoutMs: opts?.timeoutMs });
}

/**
 * Envia o mesmo pedido para OpenAI, Gemini e Anthropic, nessa ordem.
 * Sem crédito, no limite, chave recusada ou provedor fora: tenta a próxima.
 * Nunca registra chaves nem o header Authorization.
 */
export async function chatCompletionsWithFallback(
  body: ChatCompletionsRequest,
  opts?: { timeoutMs?: number; corsHeaders?: Record<string, string> },
): Promise<Response> {
  const corsHeaders = opts?.corsHeaders ?? {};
  const providers = await loadProviders();
  if (providers.length === 0) return missingAiKeyResponse(corsHeaders);

  const requested = opts?.timeoutMs ?? 90_000;
  const timeoutMs = providers.length > 1 ? Math.min(requested, 40_000) : requested;

  const attempts: ProviderAttempt[] = [];
  for (const cfg of providers) {
    let response: Response;
    try {
      response = await postChatCompletions(cfg, body, timeoutMs);
    } catch {
      console.error("AI provider request failed", cfg.provider);
      attempts.push({ provider: cfg.provider, status: 0, kind: "other" });
      continue;
    }

    if (response.ok) return response;

    let bodyText = "";
    try {
      bodyText = (await response.text()).slice(0, 4_000);
    } catch {
      bodyText = "";
    }
    const classified = classifyProviderFailure(response.status, bodyText);
    console.error("AI provider error", cfg.provider, response.status);
    attempts.push({
      provider: cfg.provider,
      status: response.status,
      kind: classified.kind,
    });
  }

  return failureResponse(attempts, corsHeaders);
}

export function missingAiKeyResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error:
        "Chave de IA ausente. Configure OPENAI_API_KEY, GEMINI_API_KEY ou ANTHROPIC_API_KEY nos secrets do Supabase (Edge Functions → Secrets).",
    }),
    {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
