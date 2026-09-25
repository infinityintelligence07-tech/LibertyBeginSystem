import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Calendar, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ListRow, PageContainer, PageHeader, SectionCard, SectionHeader, StatusPill, TextField } from "@/components/ds";

import { AvatarCropUpload } from "@/components/AvatarCropUpload";
import { NotificationSettingsCard } from "@/components/NotificationSettingsCard";

const ProfilePage = ({ role = "liberty" }: { role?: "liberty" | "mentor" | "admin" }) => {
  const { profile, user, updateProfile, signOut, refreshProfile } = useAuth();
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
        body: {
          returnTo: window.location.pathname,
          appOrigin: window.location.origin,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      if (data?.url) window.location.href = data.url;
      else throw new Error("URL de autorização não retornada");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao iniciar conexão com o Google.");
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
      toast.success("Perfil atualizado");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const googleConnected = Boolean(profile?.google_calendar_email);

  return (
    <AppLayout role={role}>
      <PageContainer variant="narrow">
        <div className="space-y-6 lg:space-y-8">
          <div>
            <PageHeader title="Meu perfil" description="Gerencie suas informações pessoais e integrações." />
          </div>

          {/* Avatar + nome */}
          <div>
            <SectionCard className="flex flex-col sm:flex-row sm:items-center gap-5">
              {profile && (
                <AvatarCropUpload profileId={profile.id} fullName={profile.full_name} avatarUrl={profile.avatar_url} size={96} />
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-[17px] font-semibold text-foreground truncate">{profile?.full_name ?? "Carregando..."}</p>
                <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
                {googleConnected && (
                  <StatusPill tone="success" className="mt-1">
                    Google Agenda conectado
                  </StatusPill>
                )}
              </div>
            </SectionCard>
          </div>

          {/* Dados pessoais */}
          <section className="space-y-3" aria-labelledby="perfil-dados">
            <SectionHeader title={<span id="perfil-dados">Dados pessoais</span>} />
            <SectionCard className="space-y-4">
              <TextField
                label="Nome completo"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <TextField
                label="E-mail"
                type="email"
                value={user?.email ?? ""}
                readOnly
                disabled
                hint="O e-mail não pode ser alterado por aqui."
              />
              <TextField
                label="Telefone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
              />
              <div className="flex justify-end pt-1">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Salvando..." : "Salvar alterações"}
                </Button>
              </div>
            </SectionCard>
          </section>

          {/* Integrações */}
          <section className="space-y-3" aria-labelledby="perfil-integracoes">
            <SectionHeader title={<span id="perfil-integracoes">Integrações</span>} />
            <SectionCard padding="none">
              <ListRow
                leading={<Calendar className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />}
                title="Google Agenda"
                subtitle={googleConnected ? `Conectado: ${profile?.google_calendar_email}` : "Sincronize suas sessões automaticamente"}
                trailing={
                  <Button
                    size="sm"
                    variant={googleConnected ? "outline" : "default"}
                    onClick={googleConnected ? handleDisconnectGoogle : handleConnectGoogle}
                    disabled={googleLoading}
                    className={googleConnected ? "text-destructive hover:text-destructive" : undefined}
                  >
                    {googleLoading ? "Aguarde..." : googleConnected ? "Desconectar" : "Conectar"}
                  </Button>
                }
                last={!googleConnected}
              />
              {googleConnected && (
                <ListRow
                  title="Sincronizar sessões agora"
                  subtitle="Envia as sessões já agendadas para o seu calendário."
                  trailing={
                    <Button size="sm" variant="outline" onClick={handleBackfillCalendar} disabled={googleLoading}>
                      Sincronizar
                    </Button>
                  }
                  last
                />
              )}
            </SectionCard>
          </section>

          {/* Notificações */}
          <div>
            <NotificationSettingsCard />
          </div>

          {/* Sair */}
          <div className="pt-2">
            <Button variant="outline" onClick={handleSignOut} className="w-full sm:w-auto text-destructive hover:text-destructive">
              <LogOut aria-hidden />
              Sair da conta
            </Button>
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  );
};

export default ProfilePage;
