import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, X, Clock3, Download, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState, ListRow, LoadingState, SectionCard } from "@/components/ds";

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
    <div className="mt-4 pt-4 border-t border-border space-y-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {tabs.map((t) => (
          <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} count={t.count}>
            <t.icon className="h-3.5 w-3.5" aria-hidden /> {t.label}
          </Chip>
        ))}
        <Button variant="outline" size="sm" onClick={exportCsv} className="ml-auto">
          <Download className="h-3.5 w-3.5" /> Exportar lista
        </Button>
      </div>

      {isLoading ? (
        <LoadingState variant="list" rows={3} />
      ) : groups[tab].length === 0 ? (
        <EmptyState compact icon={Users} title="Nenhum membro nesta categoria" />
      ) : (
        <SectionCard padding="none" className="max-h-64 overflow-y-auto">
          {groups[tab].map((m, i) => (
            <ListRow
              key={m.id}
              title={m.full_name}
              subtitle={m.company_name || m.email || "Sem dados"}
              last={i === groups[tab].length - 1}
            />
          ))}
        </SectionCard>
      )}
    </div>
  );
};
