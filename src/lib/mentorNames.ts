import { supabase } from "@/integrations/supabase/client";

/**
 * Nome do mentor para a área do membro.
 * A política de `profiles` não deixa o aluno ler o perfil do mentor, então o nome
 * vinha vazio e a tela caía em "Mentor". A função só devolve id e nome.
 */
export async function fetchMentorNames(ids: string[]): Promise<{ id: string; full_name: string }[]> {
  const unique = [...new Set(ids.filter((id) => id && !id.startsWith("demo-") && !id.startsWith("preview-")))];
  if (unique.length === 0) return [];

  const { data, error } = await supabase.rpc("mentor_display_names", { _ids: unique });
  if (!error && data) {
    return data.flatMap((row) => (row.id && row.full_name ? [{ id: row.id, full_name: row.full_name }] : []));
  }

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);
  if (profileError) throw profileError;
  return (profiles ?? []).flatMap((profile) =>
    profile.full_name ? [{ id: profile.id, full_name: profile.full_name }] : [],
  );
}
