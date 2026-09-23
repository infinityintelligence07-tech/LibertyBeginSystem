import { useState } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { Wrench, ExternalLink, Lock, Radar as RadarIcon, FileText } from "lucide-react";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState, PageContainer, PageHeader, SectionCard, SectionHeader, StatusPill } from "@/components/ds";
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
      <PageContainer>
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-8">
        <motion.div variants={fadeUpItem}>
          <PageHeader
            title="Ferramentas"
            description="Ferramentas aplicadas nas suas sessões de mentoria."
          />
        </motion.div>

        {base && (
          <motion.div variants={fadeUpItem}>
          <SectionCard className="space-y-4">
            <SectionHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <RadarIcon className="h-4 w-4 text-primary" aria-hidden />
                  Mapeamento do Negócio
                </span>
              }
              description="Retrato da maturidade do seu negócio construído junto com o seu mentor."
              actions={
                <Button variant="outline" size="sm" onClick={() => setOpenSheet(true)}>
                  <FileText className="h-3.5 w-3.5" aria-hidden /> Acessar a ferramenta
                </Button>
              }
            />
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
          </SectionCard>
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
          <LoadingState variant="cards" rows={3} />
        ) : effectiveTools.length > 0 ? (
          <motion.section variants={fadeUpItem} className="space-y-3" aria-labelledby="tools-title">
            <SectionHeader title={<span id="tools-title">Biblioteca de ferramentas</span>} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {effectiveTools.map((tool: any) => {
                const unlocked = tool.is_public || (tool.session_id && completedSessionIds.has(tool.session_id));
                const isLink = Boolean(unlocked && tool.url);
                const inner = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className={`w-11 h-11 rounded-ds-lg flex items-center justify-center ${unlocked ? "bg-status-green/10" : "bg-muted"}`}>
                        {unlocked ? <Wrench className="h-4 w-4 text-status-green" aria-hidden /> : <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />}
                      </div>
                      {isLink && <ExternalLink className="h-4 w-4 text-muted-foreground" aria-hidden />}
                    </div>
                    <p className="text-[17px] font-semibold text-foreground leading-snug line-clamp-2">{tool.title}</p>
                    {!unlocked && (
                      <StatusPill tone="neutral" size="sm" withDot={false}>Disponível após a sessão</StatusPill>
                    )}
                  </>
                );
                return isLink ? (
                  <a
                    key={tool.id}
                    href={tool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-ds-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
                  >
                    <SectionCard interactive className="flex flex-col gap-4 min-h-[132px] h-full">
                      {inner}
                    </SectionCard>
                  </a>
                ) : (
                  <SectionCard key={tool.id} className={`flex flex-col gap-4 min-h-[132px] ${unlocked ? "" : "opacity-70"}`}>
                    {inner}
                  </SectionCard>
                );
              })}
            </div>
          </motion.section>
        ) : !hasSessionTools ? (
          <EmptyState
            icon={Wrench}
            title="Nenhuma ferramenta disponível"
            description="As ferramentas são liberadas conforme você avança nas sessões."
          />
        ) : null}

      </motion.div>
      </PageContainer>
    </AppLayout>
  );
};

export default FerramentasPage;
