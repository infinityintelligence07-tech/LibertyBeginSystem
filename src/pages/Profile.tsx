import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { User, Mail, Phone, Save, CheckCircle2, LogOut } from "lucide-react";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { AvatarCropUpload } from "@/components/AvatarCropUpload";
import { NotificationSettingsCard } from "@/components/NotificationSettingsCard";

const ProfilePage = ({ role = "liberty" }: { role?: "liberty" | "mentor" | "admin" }) => {
  const { profile, user, updateProfile, signOut, refreshProfile } = useAuth() as any;
  const [googleLoading, setGoogleLoading] = useState(false);

  // handle callback params from OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      toast.success("Google Agenda conectado! Sincronizando suas sessões...");
      refreshProfile?.();
      // Backfill existing bookings into the newly connected calendar
      setTimeout(async () => {
        const { data: prof } = await supabase.auth.getUser();
        if (prof.user) {
          const { data: p } = await supabase.from("profiles").select("id").eq("user_id", prof.user.id).maybeSingle();
          if (p?.id) {
            const { data } = await supabase.functions.invoke("google-calendar-sync", { body: { backfill_profile_id: p.id } });
            if (data?.synced) toast.success(`${data.synced} sessão(ões) sincronizada(s) com o Google Agenda.`);
          }
        }
      }, 500);
      params.delete("google");
      window.history.replaceState({}, "", window.location.pathname + (params.toString() ? "?" + params.toString() : ""));
    } else if (params.get("google") === "denied") {
      toast.error("Conexão com Google Agenda cancelada.");
      params.delete("google");
      window.history.replaceState({}, "", window.location.pathname + (params.toString() ? "?" + params.toString() : ""));
    }
  }, [refreshProfile]);

  const handleBackfillCalendar = async () => {
    if (!profile?.id) return;
    setGoogleLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
        body: { backfill_profile_id: profile.id },
      });
      if (error) throw error;
      toast.success(`${data?.synced || 0} sessão(ões) sincronizada(s) com o Google Agenda.`);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao sincronizar.");
    } finally {
      setGoogleLoading(false);
    }
  };


  const handleConnectGoogle = async () => {
    setGoogleLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-oauth-start", {
        body: { returnTo: window.location.pathname },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      console.error(e);
      toast.error("Erro ao iniciar conexão com o Google.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!profile) return;
    setGoogleLoading(true);
    try {
      await supabase.from("user_oauth_tokens").delete().eq("profile_id", profile.id);
      const { error } = await supabase
        .from("profiles")
        .update({ google_connected: false, google_calendar_email: null })
        .eq("id", profile.id);
      if (error) throw error;
      toast.success("Google Agenda desconectado.");
      refreshProfile?.();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao desconectar.");
    } finally {
      setGoogleLoading(false);
    }
  };
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync state when profile loads
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name);
      setPhone(profile.phone ?? "");
    }
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await updateProfile({ full_name: fullName, phone: phone || null });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar perfil.");
    } else {
      toast.success("Perfil atualizado com sucesso!");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <AppLayout role={role}>
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-8 max-w-2xl mx-auto lg:mx-0">
        <motion.div variants={fadeUpItem}>
          <h1 className="text-2xl font-semibold text-foreground">Meu Perfil</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie suas informações pessoais</p>
        </motion.div>

        {/* Avatar + Name */}
        <motion.div variants={fadeUpItem} className="glass-card p-6 flex flex-col sm:flex-row sm:items-center gap-5">
          {profile && (
            <AvatarCropUpload
              profileId={profile.id}
              fullName={profile.full_name}
              avatarUrl={profile.avatar_url}
              size={96}
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-lg font-medium text-foreground truncate">{profile?.full_name ?? "Carregando..."}</p>
            <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
            {profile?.google_calendar_email && (
              <div className="flex items-center gap-1.5 mt-1">
                <CheckCircle2 className="h-3 w-3 text-status-green" />
                <span className="text-xs text-status-green">Google Agenda conectado</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Edit form */}
        <motion.div variants={fadeUpItem} className="glass-card p-6 space-y-5">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Dados pessoais
          </h2>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">Nome completo</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="input-begin w-full" />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">Email</label>
            <div className="flex items-center gap-2 min-w-0">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground truncate">{user?.email}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">O email não pode ser alterado por aqui.</p>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">Telefone</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" className="input-begin w-full pl-10" />
            </div>
          </div>

          <button onClick={handleSave} disabled={saving} className="btn-silver text-sm flex items-center gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </motion.div>

        {/* Google Calendar integration section */}
        <motion.div variants={fadeUpItem} className="glass-card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.5 22h-15A2.5 2.5 0 012 19.5v-15A2.5 2.5 0 014.5 2H8v2H4.5a.5.5 0 00-.5.5v15a.5.5 0 00.5.5h15a.5.5 0 00.5-.5V16h2v3.5a2.5 2.5 0 01-2.5 2.5z"/>
              <path d="M18 2h-4v2h4v4h2V4.5A2.5 2.5 0 0019.5 2H18zM8 8h8v2H8zm0 4h8v2H8zm0 4h5v2H8z"/>
            </svg>
            Integrações
          </h2>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border border-border bg-background/50">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">Google Agenda</p>
                {profile?.google_calendar_email ? (
                  <p className="text-xs text-status-green flex items-center gap-1 min-w-0">
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">Conectado: {profile.google_calendar_email}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Sincronize suas sessões automaticamente</p>
                )}
              </div>
            </div>
            <button
              onClick={profile?.google_calendar_email ? handleDisconnectGoogle : handleConnectGoogle}
              disabled={googleLoading}
              className={`text-xs px-4 py-2 rounded-lg border transition-colors shrink-0 self-start sm:self-auto disabled:opacity-50 ${
                profile?.google_calendar_email
                  ? "border-border text-destructive hover:bg-destructive/10"
                  : "btn-silver"
              }`}
            >
              {googleLoading ? "..." : profile?.google_calendar_email ? "Desconectar" : "Conectar"}
            </button>
          </div>
          {profile?.google_calendar_email && (
            <button
              onClick={handleBackfillCalendar}
              disabled={googleLoading}
              className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted/30 transition-colors disabled:opacity-50"
            >
              Sincronizar minhas sessões agora
            </button>
          )}
        </motion.div>


        {/* Notifications */}
        <motion.div variants={fadeUpItem}>
          <NotificationSettingsCard />
        </motion.div>

        {/* Sign out */}
        <motion.div variants={fadeUpItem}>
          <button onClick={handleSignOut} className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 transition-colors">
            <LogOut className="h-4 w-4" />
            Sair da conta
          </button>
        </motion.div>
      </motion.div>
    </AppLayout>
  );
};

export default ProfilePage;
