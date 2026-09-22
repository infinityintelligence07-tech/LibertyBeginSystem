import { useState } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { Wrench, ExternalLink, Lock, Loader2, Radar as RadarIcon, FileText } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getEffectiveBookingStatus, isVisibleSessionBooking } from "@/lib/bookingStatus";
import { DiagnosticRadar } from "@/components/tools/DiagnosticRadar";
import { DiagnosticSheet } from "@/components/tools/DiagnosticSheet";
import { StudentTools } from "@/components/StudentTools";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DIAGNOSTICO_BEGIN_PILLARS, diagnosticPillarsForAnswers } from "@/lib/diagnosticoBegin";
import { useDemoData } from "@/contexts/DemoDataContext";
import { demoContentTools, demoDiagnosticApplications, demoProfileFill } from "@/lib/demoForUser";

const FerramentasPage = () => {
  const [openSheet, setOpenSheet] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const { profile: _profile } = useAuth();
  const { demoEnabled } = useDemoData();
  const profile = demoEnabled ? demoProfileFill(_profile as any) : _profile;


  // Fetch tools from contents table
  const { data: tools = [], isLoading } = useQuery({
    queryKey: ["contents-tools"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contents")
        .select("*")
        .eq("content_type", "tool")
        .eq("is_active", true)
        .order("phase_unlock");
      return data || [];
    },
  });

  // Fetch member's completed sessions to determine unlock
  const { data: completedBookings = [] } = useQuery({
    queryKey: ["liberty-completed-bookings", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("bookings")
        .select("session_id, scheduled_date, start_time, end_time, status")
        .eq("liberty_id", profile.id);
      return (data || []).filter((b) => isVisibleSessionBooking(b) && getEffectiveBookingStatus(b) === "completed");
    },
    enabled: !!profile?.id,
  });

  const completedSessionIds = new Set(completedBookings.map((b) => b.session_id));

  // Ferramentas enviadas pelos mentores (para não exibir estado vazio quando existem)
  const { data: sessionToolsCount = 0 } = useQuery({
    queryKey: ["student-tools-count", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { count } = await supabase
        .from("student_tools")
        .select("id", { count: "exact", head: true })
        .eq("liberty_id", profile!.id);
      return count || 0;
    },
  });
  const hasSessionTools = sessionToolsCount > 0;


  // Diagnósticos aplicados pelo mentor (só concluídos ficam visíveis para o aluno)
  const { data: _diagnostics = [] } = useQuery({
    queryKey: ["member-tool-applications", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("tool_applications")
        .select("*")
        .eq("member_id", profile!.id)
        .eq("status", "completed")
        .order("completed_at", { ascending: true });
      return data || [];
    },
  });

  const diagnostics: any[] = demoEnabled && profile?.id
    ? [..._diagnostics, ...demoDiagnosticApplications(profile.id, DIAGNOSTICO_BEGIN_PILLARS as any)]
    : _diagnostics;
  const effectiveTools: any[] = demoEnabled ? [...tools, ...demoContentTools()] : tools;

  const inicial = diagnostics.find((d: any) => d.phase !== "final");
  const final = diagnostics.find((d: any) => d.phase === "final");
  const base = final || inicial;
  const displayPillars = diagnosticPillarsForAnswers((base?.answers as any) || {});

  const selectedPillar = displayPillars.find((p) => p.id === selected) || null;


  return (
    <AppLayout role="liberty">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-8">
        <motion.div variants={fadeUpItem}>
          <h1 className="text-2xl font-semibold text-foreground">Ferramentas</h1>
          <p className="text-muted-foreground text-sm">Ferramentas aplicadas nas suas sessões de mentoria</p>
        </motion.div>

        {base && (
          <motion.div variants={fadeUpItem} className="glass-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <RadarIcon className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Mapeamento do Negócio</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpenSheet(true)}
                className="shrink-0 flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <FileText className="h-3.5 w-3.5" /> Acessar a ferramenta
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Retrato da maturidade do seu negócio construído junto com o seu mentor.
            </p>
            <DiagnosticRadar
              scores={(inicial?.scores as any) || (base.scores as any) || {}}
              compareScores={inicial && final ? ((final.scores as any) || {}) : null}
              compareLabel="Diagnóstico final"
              label="Diagnóstico inicial"
              onPillarSelect={(id) => {
                setSelected(id);
                setOpenSheet(true);
              }}
            />
          </motion.div>
        )}

        <Dialog open={openSheet} onOpenChange={(o) => { setOpenSheet(o); if (!o) setSelected(null); }}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="text-base">
                {selectedPillar ? selectedPillar.name : "Mapa do negócio, setor a setor"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {(selectedPillar ? [selectedPillar] : displayPillars).map((p) => (
                <DiagnosticSheet
                  key={p.id}
                  pillar={p}
                  answers={(base?.answers as any) || {}}
                  score={((base?.scores as any) || {})[p.id]}
                  memberName={profile?.full_name || undefined}
                  companyName={(profile as any)?.company_name || undefined}
                />
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Arquivos e links enviados pelos mentores nas sessões */}
        {profile?.id && (
          <motion.div variants={fadeUpItem}>
            <StudentTools libertyId={profile.id} title="Ferramentas das suas sessões" />
          </motion.div>
        )}


        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : effectiveTools.length > 0 ? (
          <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {effectiveTools.map((tool: any) => {
              const unlocked = tool.is_public || (tool.session_id && completedSessionIds.has(tool.session_id));
              const Wrapper: any = unlocked && tool.url ? "a" : "div";
              return (
                <motion.div key={tool.id} variants={fadeUpItem}>
                  <Wrapper
                    {...(unlocked && tool.url
                      ? { href: tool.url, target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className={`glass-card p-5 flex flex-col gap-4 min-h-[132px] transition-all ${
                      unlocked ? "hover:border-primary/30" : "opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${unlocked ? "bg-status-green/10" : "bg-muted"}`}>
                        {unlocked ? <Wrench className="h-4 w-4 text-status-green" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      {unlocked && tool.url && <ExternalLink className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <p className="text-base font-semibold text-foreground leading-snug line-clamp-2">{tool.title}</p>
                    {!unlocked && (
                      <span className="text-[11px] text-muted-foreground">Disponível após a sessão</span>
                    )}
                  </Wrapper>
                </motion.div>
              );
            })}
          </motion.div>
        ) : !hasSessionTools ? (
          <EmptyState
            icon={Wrench}
            title="Nenhuma ferramenta disponível"
            description="As ferramentas são liberadas conforme você avança nas sessões."
          />
        ) : null}

      </motion.div>
    </AppLayout>
  );
};

export default FerramentasPage;
