import { FormEvent, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ds";
import { toast } from "sonner";

export const MEMBER_NOTES_KEY = ["profile-admin-notes"] as const;

export type MemberAdminNote = {
  id: string;
  profile_id: string;
  body: string;
  author_name: string | null;
  author_avatar_url: string | null;
  created_at: string;
};

type NoteRow = {
  id: string;
  profile_id: string;
  body: string;
  author_name: string | null;
  created_at: string;
  author: { full_name: string | null; avatar_url: string | null } | { full_name: string | null; avatar_url: string | null }[] | null;
};

function authorOf(row: NoteRow) {
  const author = Array.isArray(row.author) ? row.author[0] : row.author;
  return {
    name: row.author_name || author?.full_name || null,
    avatar: author?.avatar_url || null,
  };
}

export function mapMemberNote(row: NoteRow): MemberAdminNote {
  const author = authorOf(row);
  return {
    id: row.id,
    profile_id: row.profile_id,
    body: row.body,
    author_name: author.name,
    author_avatar_url: author.avatar,
    created_at: row.created_at,
  };
}

const NOTE_SELECT =
  "id, profile_id, body, author_name, created_at, author:profiles!profile_admin_notes_author_profile_id_fkey(full_name, avatar_url)";

export async function fetchAllMemberNotes(): Promise<MemberAdminNote[]> {
  const { data, error } = await supabase
    .from("profile_admin_notes")
    .select(NOTE_SELECT)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return ((data || []) as NoteRow[]).map(mapMemberNote);
}

export async function fetchMemberNotes(profileId: string): Promise<MemberAdminNote[]> {
  const { data, error } = await supabase
    .from("profile_admin_notes")
    .select(NOTE_SELECT)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data || []) as NoteRow[]).map(mapMemberNote);
}

function noteStamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function AdminMemberNote({
  memberId,
  canWrite = true,
  notes,
  notesLoading = false,
}: {
  memberId: string;
  canWrite?: boolean;
  notes?: MemberAdminNote[];
  notesLoading?: boolean;
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const own = useQuery({
    queryKey: [...MEMBER_NOTES_KEY, memberId],
    queryFn: () => fetchMemberNotes(memberId),
    enabled: notes === undefined,
  });
  const list = notes ?? own.data ?? [];
  const loading = notes === undefined ? own.isLoading : notesLoading;
  const ordered = useMemo(
    () => [...list].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [list],
  );

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || saving || !canWrite) return;
    setSaving(true);
    const authorName = profile?.full_name?.trim() || null;
    const { error } = await supabase.from("profile_admin_notes").insert({
      profile_id: memberId,
      body,
      author_profile_id: profile?.id ?? null,
      author_name: authorName,
    });
    if (error) {
      setSaving(false);
      toast.error("Não foi possível salvar a nota");
      return;
    }
    await supabase.from("profiles").update({ admin_note: body }).eq("id", memberId);
    setDraft("");
    setSaving(false);
    toast.success("Nota adicionada");
    queryClient.invalidateQueries({ queryKey: MEMBER_NOTES_KEY });
    queryClient.invalidateQueries({ queryKey: ["admin-members"] });
  };

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <p className="text-xs font-medium text-muted-foreground">Anotações</p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando anotações</p>
      ) : ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma anotação ainda.</p>
      ) : (
        <ul className="max-h-40 space-y-2 overflow-y-auto pr-1">
          {ordered.map((note) => (
            <li key={note.id} className="flex gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
              <UserAvatar
                name={note.author_name || "Coordenação"}
                avatarUrl={note.author_avatar_url}
                size={28}
              />
              <div className="min-w-0">
                <p className="text-xs tabular-nums text-muted-foreground">
                  {noteStamp(note.created_at)}
                  {note.author_name ? ` · ${note.author_name}` : ""}
                </p>
                <p className="whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <form className="space-y-2" onSubmit={save}>
          <TextAreaField
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escreva uma nota rápida"
            rows={2}
            className="min-h-11 resize-y text-base"
            aria-label="Nova anotação"
          />
          <Button type="submit" size="sm" className="min-h-11" disabled={!draft.trim() || saving}>
            {saving ? "Salvando" : "Adicionar nota"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
