import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, X, Clock3, Download, Users } from "lucide-react";

type Tab = "going" | "not_going" | "pending";

interface Props {
  eventId: string;
  eventTitle: string;
}

/** Lista de presença de um evento: confirmados, recusados e quem ainda não respondeu. */
export const EventAttendanceList = ({ eventId, eventTitle }: Props) => {
  const [tab, setTab] = useState<Tab>("going");

  const { data, isLoading } = useQuery({
    queryKey: ["event-attendance", eventId],
    queryFn: async () => {
      const [{ data: members }, { data: attendance }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, phone, company_name")
          .eq("is_active", true)
          .order("full_name"),
        supabase.from("event_attendance").select("profile_id, status, guests, note").eq("event_id", eventId),
      ]);
      const byProfile = new Map<string, any>();
      (attendance || []).forEach((a: any) => byProfile.set(a.profile_id, a));
      return (members || []).map((m: any) => ({
        ...m,
        status: (byProfile.get(m.id)?.status as Tab | undefined) ?? "pending",
        guests: byProfile.get(m.id)?.guests ?? 0,
        note: byProfile.get(m.id)?.note ?? null,
      }));
    },
  });

  const groups = useMemo(() => {
    const rows = data || [];
    return {
      going: rows.filter((r) => r.status === "going"),
      not_going: rows.filter((r) => r.status === "not_going"),
      pending: rows.filter((r) => r.status === "pending"),
    };
  }, [data]);

  const exportCsv = () => {
    const rows = groups[tab];
    const header = "Nome,Email,Telefone,Empresa,Status\n";
    const body = rows
      .map((r) =>
        [r.full_name, r.email || "", r.phone || "", r.company_name || "", r.status]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `presenca-${eventTitle.toLowerCase().replace(/\s+/g, "-")}-${tab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { key: Tab; label: string; icon: any; count: number }[] = [
    { key: "going", label: "Confirmados", icon: Check, count: groups.going.length },
    { key: "pending", label: "Sem resposta", icon: Clock3, count: groups.pending.length },
    { key: "not_going", label: "Não vão", icon: X, count: groups.not_going.length },
  ];

  return (
    <div className="mt-4 pt-4 border-t border-border/40">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-[11px] px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors ${
              tab === t.key
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-3 w-3" /> {t.label} ({t.count})
          </button>
        ))}
        <button
          onClick={exportCsv}
          className="text-[11px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground flex items-center gap-1.5 ml-auto"
        >
          <Download className="h-3 w-3" /> Exportar lista
        </button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando lista…</p>
      ) : groups[tab].length === 0 ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> Nenhum membro nesta categoria.
        </p>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto">
          {groups[tab].map((m) => (
            <li key={m.id} className="rounded-lg border border-border bg-card/60 px-3 py-2">
              <p className="text-xs font-medium text-foreground truncate">{m.full_name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{m.company_name || m.email || "—"}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
