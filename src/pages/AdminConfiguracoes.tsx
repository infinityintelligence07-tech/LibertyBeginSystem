import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { supabase } from "@/integrations/supabase/client";
import { Settings, Save, MessageCircle, Target, Zap, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AccessManagement } from "@/components/AccessManagement";

interface ConfigValues {
  mariana_whatsapp: string;
  cs_name: string;
  max_sessions_month: string;
  session_duration: string;
  session_value: string;
  google_calendar_id: string;
  zoom_account_id: string;
}

const defaultConfig: ConfigValues = {
  mariana_whatsapp: "",
  cs_name: "",
  max_sessions_month: "2",
  session_duration: "90",
  session_value: "300",
  google_calendar_id: "",
  zoom_account_id: "",
};

const AdminConfiguracoesPage = () => {
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
    (data || []).forEach((d: any) => { map[d.key] = d.value; });
    setConfig({
      mariana_whatsapp: map.mariana_whatsapp || "",
      cs_name: map.cs_name || "",
      max_sessions_month: map.max_sessions_month || "2",
      session_duration: map.session_duration || "90",
      session_value: map.session_value || "300",
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
    setSaving(null);
  };

  const hasValue = (v: string) => v.trim().length > 0;

  if (loading) {
    return (
      <AppLayout role="admin">
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="glass-card p-6 animate-pulse h-40" />)}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout role="admin">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-8">
        <motion.div variants={fadeUpItem}>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" /> Configurações
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Configurações gerais do programa</p>
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <AccessManagement />
        </motion.div>

        {/* Contato e Suporte */}
        <motion.div variants={fadeUpItem} className="glass-card p-6">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
            <MessageCircle className="h-4 w-4 text-primary" /> Contato e Suporte
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">WhatsApp da CS</label>
              <input
                value={config.mariana_whatsapp}
                onChange={e => setConfig(c => ({ ...c, mariana_whatsapp: e.target.value }))}
                className="input-begin text-sm h-10 w-full"
                placeholder="+55 11 99999-9999"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Nome da responsável CS</label>
              <input
                value={config.cs_name}
                onChange={e => setConfig(c => ({ ...c, cs_name: e.target.value }))}
                className="input-begin text-sm h-10 w-full"
                placeholder="Mariana"
              />
            </div>
          </div>
          <button
            onClick={() => saveSection(["mariana_whatsapp", "cs_name"])}
            disabled={saving === "mariana_whatsapp"}
            className="btn-silver text-xs px-4 py-2.5 flex items-center gap-1.5 h-10 rounded-lg mt-4"
          >
            <Save className="h-3.5 w-3.5" /> {saving === "mariana_whatsapp" ? "Salvando..." : "Salvar alterações"}
          </button>
        </motion.div>

        {/* Regras do Programa */}
        <motion.div variants={fadeUpItem} className="glass-card p-6">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-status-yellow" /> Regras do Programa
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Máx. sessões/mês por membro</label>
              <input
                type="number"
                value={config.max_sessions_month}
                onChange={e => setConfig(c => ({ ...c, max_sessions_month: e.target.value }))}
                className="input-begin text-sm h-10 w-full"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Duração padrão (min)</label>
              <input
                type="number"
                value={config.session_duration}
                onChange={e => setConfig(c => ({ ...c, session_duration: e.target.value }))}
                className="input-begin text-sm h-10 w-full"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Valor padrão por sessão (R$)</label>
              <input
                type="number"
                value={config.session_value}
                onChange={e => setConfig(c => ({ ...c, session_value: e.target.value }))}
                className="input-begin text-sm h-10 w-full"
              />
            </div>
          </div>
          <button
            onClick={() => saveSection(["max_sessions_month", "session_duration", "session_value"])}
            disabled={saving === "max_sessions_month"}
            className="btn-silver text-xs px-4 py-2.5 flex items-center gap-1.5 h-10 rounded-lg mt-4"
          >
            <Save className="h-3.5 w-3.5" /> {saving === "max_sessions_month" ? "Salvando..." : "Salvar alterações"}
          </button>
        </motion.div>

        {/* Integrações */}
        <motion.div variants={fadeUpItem} className="glass-card p-6">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-status-blue" /> Integrações
          </h2>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Google Agenda: Calendar ID</label>
                {hasValue(config.google_calendar_id) ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-green/10 text-status-green border border-border flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Configurado</span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-border flex items-center gap-1"><XCircle className="h-3 w-3" /> Não configurado</span>
                )}
              </div>
              <input
                value={config.google_calendar_id}
                onChange={e => setConfig(c => ({ ...c, google_calendar_id: e.target.value }))}
                className="input-begin text-sm h-10 w-full"
                placeholder="calendar-id@group.calendar.google.com"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Zoom Account ID</label>
                {hasValue(config.zoom_account_id) ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-green/10 text-status-green border border-border flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Configurado</span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-border flex items-center gap-1"><XCircle className="h-3 w-3" /> Não configurado</span>
                )}
              </div>
              <input
                value={config.zoom_account_id}
                onChange={e => setConfig(c => ({ ...c, zoom_account_id: e.target.value }))}
                className="input-begin text-sm h-10 w-full"
                placeholder="Zoom Account ID"
              />
            </div>
          </div>
          <button
            onClick={() => saveSection(["google_calendar_id", "zoom_account_id"])}
            disabled={saving === "google_calendar_id"}
            className="btn-silver text-xs px-4 py-2.5 flex items-center gap-1.5 h-10 rounded-lg mt-4"
          >
            <Save className="h-3.5 w-3.5" /> {saving === "google_calendar_id" ? "Salvando..." : "Salvar alterações"}
          </button>
        </motion.div>
      </motion.div>
    </AppLayout>
  );
};

export default AdminConfiguracoesPage;
