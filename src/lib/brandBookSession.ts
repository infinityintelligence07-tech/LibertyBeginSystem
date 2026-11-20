import { supabase } from "@/integrations/supabase/client";
import { BRAND_BOOK_SLUG } from "@/lib/brandBook";

export const isBrandingSession = (sessionName?: string | null) =>
  (sessionName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("brand");

/** Abre o Brand Book do aluno (cria na primeira vez, ligado à sessão). Devolve o id da aplicação. */
export async function ensureBrandBook(opts: { memberId: string; bookingId?: string | null; appliedBy?: string | null }): Promise<string> {
  const { data: template, error: tErr } = await supabase
    .from("tool_templates")
    .select("id")
    .eq("slug", BRAND_BOOK_SLUG)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!template) throw new Error("A ferramenta Brand Book ainda não está ativa.");

  const { data: existing } = await supabase
    .from("tool_applications")
    .select("id")
    .eq("template_id", template.id)
    .eq("member_id", opts.memberId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("tool_applications")
    .insert({
      template_id: template.id,
      member_id: opts.memberId,
      applied_by: opts.appliedBy ?? null,
      booking_id: opts.bookingId ?? null,
      phase: "inicial",
      status: "in_progress",
      answers: {},
      scores: {},
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
