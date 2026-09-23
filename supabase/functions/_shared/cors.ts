// Cabeçalhos CORS padronizados para todas as Edge Functions.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

/** Resposta JSON com CORS. */
export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

/** Resposta de erro JSON `{ error }` com CORS. */
export const errorJson = (message: string, status: number, extra?: Record<string, unknown>): Response =>
  json({ error: message, ...(extra || {}) }, status);

/** Resposta ao preflight OPTIONS; devolve null se não for preflight. */
export const handleOptions = (req: Request): Response | null =>
  req.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;
