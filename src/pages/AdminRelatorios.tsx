import { useState, useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Search, CalendarCheck } from "lucide-react";
import { shortName } from "@/lib/formatName";
import { format, parseISO } from "date-fns";
import {
  getEffectiveBookingStatus,
  isVisibleSessionBooking,
  sortByScheduledDateDesc,
  PENDING_CONFIRMATION_HINT,
} from "@/lib/bookingStatus";
import { fetchAdminBookings, fetchReportedBookingIds, type AdminBookingRow } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  SectionCard,
  Callout,
  ListRow,
  DateBlock,
  StatusPill,
  Chip,
  BottomSheet,
  TextField,
  LoadingState,
  EmptyState,
  ErrorState,
} from "@/components/ds";

/** Só entram aqui sessões que já aconteceram (realizadas ou aguardando a confirmação do mentor). */
type ReportStatus = "completed" | "awaiting_report" | "pending_confirmation";
type ReportFilter = "all" | ReportStatus;

/** Data `YYYY-MM-DD` formatada sem depender do fuso do navegador. */
const formatShortDate = (date: string) => format(parseISO(date), "dd/MM/yyyy");

type ReportRow = AdminBookingRow & { effective_status: ReportStatus; has_report: boolean };

const FILTER_OPTIONS: Array<{ key: ReportFilter; label: string }> = [
  { key: "all", label: "Todas" },
  { key: "completed", label: "Realizadas" },
  { key: "awaiting_report", label: "Sem relatório" },
  { key: "pending_confirmation", label: "A confirmar" },
];

const isReportStatus = (status: string): status is ReportStatus =>
  status === "completed" || status === "awaiting_report" || status === "pending_confirmation";

const reportLabel = (row: ReportRow) => {
  if (row.has_report) return "Entregue pelo mentor";
  switch (row.effective_status) {
    case "completed":
      return "Não exigido para esta sessão";
    case "awaiting_report":
      return "Pendente";
    case "pending_confirmation":
      return "Aguardando confirmação da sessão";
    default: {
      const _exhaustive: never = row.effective_status;
      return _exhaustive;
    }
  }
};

const DetailField = ({ label, value }: { label: string; value: ReactNode }) => (
  <div>
    <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
    <div className="text-sm text-foreground">{value}</div>
  </div>
);

const AdminRelatoriosPage = () => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ReportFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: rows = [], isLoading, isError, refetch } = useQuery<ReportRow[]>({
    queryKey: ["admin-bookings-all"],
    queryFn: async () => {
      const [bookings, reportedIds] = await Promise.all([fetchAdminBookings(), fetchReportedBookingIds()]);
      const list: ReportRow[] = [];
      bookings.forEach((b) => {
        if (!isVisibleSessionBooking(b)) return;
        const hasReport = reportedIds.has(b.id);
        const status = getEffectiveBookingStatus(b, { hasReport });
        if (!isReportStatus(status)) return;
        list.push({ ...b, effective_status: status, has_report: hasReport });
      });
      return sortByScheduledDateDesc(list);
    },
  });

  const counts = useMemo(() => {
    const acc = { completed: 0, awaiting_report: 0, pending_confirmation: 0 };
    rows.forEach((r) => { acc[r.effective_status]++; });
    return { ...acc, realized: acc.completed + acc.awaiting_report };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((b) => {
      if (filter !== "all" && b.effective_status !== filter) return false;
      if (!q) return true;
      return (
        (b.liberty?.full_name || b.guest_name || "").toLowerCase().includes(q) ||
        (b.mentor?.full_name || "").toLowerCase().includes(q) ||
        (b.sessions?.name || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, filter]);

  const countFor = (key: ReportFilter) => {
    switch (key) {
      case "all":
        return rows.length;
      case "completed":
        return counts.completed;
      case "awaiting_report":
        return counts.awaiting_report;
      case "pending_confirmation":
        return counts.pending_confirmation;
      default: {
        const _exhaustive: never = key;
        return _exhaustive;
      }
    }
  };

  const openBooking = rows.find((r) => r.id === openId);

  const description = isLoading
    ? "Carregando sessões"
    : [
        `${counts.realized} realizada${counts.realized !== 1 ? "s" : ""}`,
        counts.awaiting_report > 0 ? `${counts.awaiting_report} sem relatório` : null,
        counts.pending_confirmation > 0 ? `${counts.pending_confirmation} a confirmar` : null,
      ].filter(Boolean).join(" · ");

  return (
    <AppLayout role="admin">
      <PageContainer variant="wide">
        <PageHeader title="Relatórios de sessões" description={description} />

        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
            <TextField
              type="search"
              aria-label="Buscar por membro, mentor ou sessão"
              placeholder="Buscar por membro, mentor ou sessão"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
            {FILTER_OPTIONS.map((opt) => (
              <Chip
                key={opt.key}
                active={filter === opt.key}
                onClick={() => setFilter(opt.key)}
                count={isLoading ? undefined : countFor(opt.key)}
              >
                {opt.label}
              </Chip>
            ))}
          </div>
        </div>

        {filter === "pending_confirmation" && !isLoading && (
          <Callout tone="warning" title="Sessões a confirmar">
            {PENDING_CONFIRMATION_HINT}
          </Callout>
        )}

        {isLoading ? (
          <LoadingState variant="list" rows={8} />
        ) : isError ? (
          <ErrorState title="Não foi possível carregar as sessões" onRetry={() => refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Nenhuma sessão encontrada"
            description={search || filter !== "all" ? "Ajuste a busca ou o filtro de status." : "Ainda não há sessões realizadas."}
          />
        ) : (
          <SectionCard padding="none">
            {filtered.map((booking, index) => (
              <ListRow
                key={booking.id}
                last={index === filtered.length - 1}
                onPress={() => setOpenId(booking.id)}
                leading={<DateBlock date={booking.scheduled_date} tone={booking.effective_status === "pending_confirmation" ? "muted" : "default"} />}
                title={
                  <>
                    {shortName(booking.liberty?.full_name || booking.guest_name || "Sem dados")}
                    <span className="text-muted-foreground font-normal"> com </span>
                    {shortName(booking.mentor?.full_name || "Sem dados")}
                  </>
                }
                subtitle={[booking.sessions?.name || "Sessão", booking.is_retroactive ? "registro histórico" : null, booking.observations ? "com observações" : null]
                  .filter(Boolean)
                  .join(" · ")}
                trailing={<StatusPill status={booking.effective_status} />}
              />
            ))}
          </SectionCard>
        )}
      </PageContainer>

      <BottomSheet
        open={openId !== null}
        onOpenChange={(open) => !open && setOpenId(null)}
        title={openBooking?.sessions?.name || "Sessão"}
        description={openBooking ? `${formatShortDate(openBooking.scheduled_date)}${openBooking.start_time ? ` · ${String(openBooking.start_time).slice(0, 5)}` : ""}` : undefined}
        footer={
          openBooking?.effective_status === "pending_confirmation" ? (
            <Button asChild variant="outline">
              <Link to={`/admin/agenda?booking=${openBooking.id}`}>
                <CalendarCheck aria-hidden /> Confirmar na agenda
              </Link>
            </Button>
          ) : undefined
        }
      >
        {openBooking && (
          <div className="space-y-4">
            <StatusPill status={openBooking.effective_status} size="md" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailField label="Membro" value={openBooking.liberty?.full_name || openBooking.guest_name || "Sem dados"} />
              <DetailField label="Mentor" value={openBooking.mentor?.full_name || "Sem dados"} />
              <DetailField label="Relatório" value={reportLabel(openBooking)} />
              {openBooking.is_retroactive && <DetailField label="Origem" value="Registro histórico lançado pelo administrador" />}
            </div>
            {openBooking.effective_status === "pending_confirmation" && (
              <Callout tone="warning">{PENDING_CONFIRMATION_HINT}</Callout>
            )}
            <DetailField
              label="Observações"
              value={
                openBooking.observations ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{openBooking.observations}</p>
                ) : (
                  <span className="text-muted-foreground">Sem observações</span>
                )
              }
            />
          </div>
        )}
      </BottomSheet>
    </AppLayout>
  );
};

export default AdminRelatoriosPage;
