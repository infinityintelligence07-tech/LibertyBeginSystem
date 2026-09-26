import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { AccessManagement } from "@/components/AccessManagement";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, SectionHeader, SectionCard, StatusPill, TextField, LoadingState, Callout } from "@/components/ds";
import { DEFAULT_KICKOFF_SESSION_VALUE, DEFAULT_SESSION_VALUE } from "@/lib/mentorFees";

interface ConfigValues {
  mariana_whatsapp: string;
  cs_name: string;
  max_sessions_month: string;
  session_duration: string;
  session_value: string;
  kickoff_session_value: string;
  google_calendar_id: string;
  zoom_account_id: string;
}

const defaultConfig: ConfigValues = {
  mariana_whatsapp: "",
  cs_name: "",
  max_sessions_month: "2",
  session_duration: "90",
  session_value: String(DEFAULT_SESSION_VALUE),
  kickoff_session_value: String(DEFAULT_KICKOFF_SESSION_VALUE),
  google_calendar_id: "",
  zoom_account_id: "",
};

const AdminConfiguracoesPage = () => {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<ConfigValues>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const { data, error } = await supabase.from("system_config").select("key, value");
    if (error) { setLoading(false); return; }
    const map: Record<string, string> = {};
    (data || []).forEach((d: { key: string; value: string }) => { map[d.key] = d.value; });
    setConfig({
      mariana_whatsapp: map.mariana_whatsapp || "",
      cs_name: map.cs_name || "",
      max_sessions_month: map.max_sessions_month || "2",
      session_duration: map.session_duration || "90",
      session_value: map.session_value || String(DEFAULT_SESSION_VALUE),
      kickoff_session_value: map.kickoff_session_value || String(DEFAULT_KICKOFF_SESSION_VALUE),
      google_calendar_id: map.google_calendar_id || "",
      zoom_account_id: map.zoom_account_id || "",
    });
    setLoading(false);
  };

  const saveSection = async (keys: (keyof ConfigValues)[]) => {
    setSaving(keys[0]);
    for (const key of keys) {
      const { data: existing } = await supabase.from("system_config").select("key").eq("key", key).maybeSingle();
      if (existing) {
        await supabase.from("system_config").update({ value: config[key] }).eq("key", key);
      } else {
        await supabase.from("system_config").insert({ key, value: config[key] });
      }
    }
    toast.success("Configurações salvas");
    await queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    await queryClient.invalidateQueries({ queryKey: ["mentor-fee-rates"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-mentors"] });
    setSaving(null);
  };

  const hasValue = (v: string) => v.trim().length > 0;

  const configuredPill = (v: string) =>
    hasValue(v) ? (
      <StatusPill tone="success">Configurado</StatusPill>
    ) : (
      <StatusPill tone="danger">Não configurado</StatusPill>
    );

  const saveButton = (keys: (keyof ConfigValues)[]) => {
    const busy = saving === keys[0];
    return (
      <div className="flex justify-end pt-2">
        <Button onClick={() => saveSection(keys)} disabled={busy}>
          <Save aria-hidden />
          {busy ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    );
  };

  const normalValue = parseFloat(config.session_value) || DEFAULT_SESSION_VALUE;
  const kickoffValue = parseFloat(config.kickoff_session_value) || DEFAULT_KICKOFF_SESSION_VALUE;

  return (
    <AppLayout role="admin">
      <PageContainer>
        <PageHeader title="Configurações" description="Configurações gerais do programa" />

        {loading ? (
          <LoadingState variant="cards" rows={3} />
        ) : (
          <>
            <AccessManagement />

            <SectionCard as="section" className="space-y-4">
              <SectionHeader as="h3" title="Contato e suporte" description="Canal de atendimento exibido para os membros." />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TextField
                  label="WhatsApp da CS"
                  value={config.mariana_whatsapp}
                  onChange={e => setConfig(c => ({ ...c, mariana_whatsapp: e.target.value }))}
                  placeholder="+55 11 99999-9999"
                  inputMode="tel"
                />
                <TextField
                  label="Nome da responsável CS"
                  value={config.cs_name}
                  onChange={e => setConfig(c => ({ ...c, cs_name: e.target.value }))}
                  placeholder="Mariana"
                />
              </div>
              {saveButton(["mariana_whatsapp", "cs_name"])}
            </SectionCard>

            <SectionCard as="section" className="space-y-4">
              <SectionHeader
                as="h3"
                title="Regras do programa"
                description="Valores usados no Financeiro, no painel do mentor e quando o mentor não tem taxa própria."
              />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TextField
                  label="Máx. sessões por mês por membro"
                  type="number"
                  inputMode="numeric"
                  value={config.max_sessions_month}
                  onChange={e => setConfig(c => ({ ...c, max_sessions_month: e.target.value }))}
                />
                <TextField
                  label="Duração padrão (min)"
                  type="number"
                  inputMode="numeric"
                  value={config.session_duration}
                  onChange={e => setConfig(c => ({ ...c, session_duration: e.target.value }))}
                />
                <TextField
                  label="Valor da sessão normal (R$)"
                  type="number"
                  inputMode="decimal"
                  value={config.session_value}
                  onChange={e => setConfig(c => ({ ...c, session_value: e.target.value }))}
                  hint="Sessões de 90 min da jornada."
                />
                <TextField
                  label="Valor do Mapeamento / 3h (R$)"
                  type="number"
                  inputMode="decimal"
                  value={config.kickoff_session_value}
                  onChange={e => setConfig(c => ({ ...c, kickoff_session_value: e.target.value }))}
                  hint="Mapeamento do Negócio (kickoff)."
                />
              </div>
              <Callout tone="info">
                Repasse padrão hoje: sessão normal R$ {Math.round(normalValue).toLocaleString("pt-BR")} ·
                Mapeamento R$ {Math.round(kickoffValue).toLocaleString("pt-BR")}.
                Se o mentor tiver valor próprio na ficha, o Mapeamento escala na mesma proporção.
              </Callout>
              {saveButton(["max_sessions_month", "session_duration", "session_value", "kickoff_session_value"])}
            </SectionCard>

            <SectionCard as="section" className="space-y-4">
              <SectionHeader as="h3" title="Integrações" description="Identificadores das contas conectadas." />
              <div className="space-y-4">
                <TextField
                  label={
                    <span className="flex items-center justify-between gap-3">
                      Google Agenda: Calendar ID
                      {configuredPill(config.google_calendar_id)}
                    </span>
                  }
                  value={config.google_calendar_id}
                  onChange={e => setConfig(c => ({ ...c, google_calendar_id: e.target.value }))}
                  placeholder="calendar-id@group.calendar.google.com"
                />
                <TextField
                  label={
                    <span className="flex items-center justify-between gap-3">
                      Zoom Account ID
                      {configuredPill(config.zoom_account_id)}
                    </span>
                  }
                  value={config.zoom_account_id}
                  onChange={e => setConfig(c => ({ ...c, zoom_account_id: e.target.value }))}
                  placeholder="Zoom Account ID"
                />
              </div>
              {saveButton(["google_calendar_id", "zoom_account_id"])}
            </SectionCard>
          </>
        )}
      </PageContainer>
    </AppLayout>
  );
};

export default AdminConfiguracoesPage;
