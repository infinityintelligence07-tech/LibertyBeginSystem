// Selects a "Case of the day" using OpenAI/Gemini based on recent
// booking_reports quantitative/qualitative results. Runs daily via cron.
// Auth: aceita `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (cron) ou um
// admin/super_admin autenticado.
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { requireRole, toResponse, ADMIN_ROLES } from "../_shared/auth.ts";
import {
  AiConfigError,
  chatCompletions,
  missingAiKeyResponse,
  resolveAiConfig,
} from "../_shared/ai.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    const ctx = await requireRole(req, ADMIN_ROLES, { allowServiceRole: true });
    const admin = ctx.supabaseAdmin;

    try {
      await resolveAiConfig();
    } catch (e) {
      if (e instanceof AiConfigError) return missingAiKeyResponse(corsHeaders);
      throw e;
    }

    const today = new Date().toISOString().slice(0, 10);

    // Skip if already picked today
    const { data: existing } = await admin
      .from("featured_case_of_day")
      .select("id")
      .eq("case_date", today)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ ok: true, skipped: "already_picked" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull the last 60 days of tasks with quantitative results
    const since = new Date(); since.setDate(since.getDate() - 60);
    const { data: tasks } = await admin
      .from("session_tasks")
      .select("id, description, result_type, result_value, result_metric, booking_id")
      .not("result_value", "is", null)
      .gte("completed_at", since.toISOString())
      .limit(40);

    if (!tasks || tasks.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_data" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bookingIds = [...new Set(tasks.map((t: any) => t.booking_id).filter(Boolean))];
    const { data: bookings } = await admin
      .from("bookings")
      .select("id, liberty_id")
      .in("id", bookingIds);
    const libIds = [...new Set((bookings || []).map((b: any) => b.liberty_id).filter(Boolean))];
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, company_name")
      .in("id", libIds);
    const bookingMap: Record<string, any> = Object.fromEntries((bookings || []).map((b: any) => [b.id, b]));
    const profileMap: Record<string, any> = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));

    const enriched = tasks.map((t: any) => {
      const b = bookingMap[t.booking_id];
      const p = b ? profileMap[b.liberty_id] : null;
      return {
        member_id: p?.id,
        member_name: p?.full_name || "Aluno(a)",
        company: p?.company_name || "",
        description: t.description,
        result: t.result_value,
        metric: t.result_metric,
        type: t.result_type,
      };
    }).filter((r: any) => r.member_id);

    if (enriched.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_member_data" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = `Você seleciona o "Estudo de caso do dia" para a plataforma Begin by Liberty.
Escolha o resultado mais impactante da lista (preferir quantitativos claros: faturamento, leads, clientes, %).
Responda JSON puro: {"member_id":"uuid","headline":"máx 60 chars, impactante","summary":"2-3 frases, tom inspirador em pt-BR","metric_label":"ex: Faturamento","metric_value":"ex: +R$ 45.000/mês"}`;

    const resp = await chatCompletions({
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(enriched) },
      ],
      response_format: { type: "json_object" },
    });
    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: "ai_failed", detail: t.slice(0, 300) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const j = await resp.json();
    const content = j?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    if (!parsed?.member_id || !parsed?.headline || !parsed?.summary) {
      return new Response(JSON.stringify({ error: "invalid_ai_output" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // O member_id precisa ser um dos membros enviados à IA (evita gravar id inventado)
    if (!enriched.some((r: { member_id: string }) => r.member_id === parsed.member_id)) {
      return new Response(JSON.stringify({ error: "invalid_ai_output", detail: "member_id desconhecido" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insErr } = await admin.from("featured_case_of_day").insert({
      case_date: today,
      member_id: parsed.member_id,
      headline: String(parsed.headline).slice(0, 120),
      summary: String(parsed.summary).slice(0, 500),
      metric_label: parsed.metric_label ? String(parsed.metric_label).slice(0, 40) : null,
      metric_value: parsed.metric_value ? String(parsed.metric_value).slice(0, 40) : null,
    });
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ ok: true, picked: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return toResponse(e);
  }
});
