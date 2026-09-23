import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Save } from "lucide-react";
import { useGoBack } from "@/lib/navigation";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AvatarUpload } from "@/components/AvatarUpload";
import { toTitleCase } from "@/lib/formatName";
import { Button } from "@/components/ui/button";
import {
  ErrorState, LoadingState, PageContainer, PageHeader, SectionCard, SectionHeader, SelectField, StatusPill,
  TextAreaField, TextField,
} from "@/components/ds";
import { AccessCredentialsDialog, type AccessCredentialsData } from "@/components/AccessCredentialsDialog";

type Profile = Record<string, any>;

const SECTIONS: { title: string; fields: { key: string; label: string; type?: "text" | "textarea" | "date" | "select"; options?: string[] }[] }[] = [
  {
    title: "Identificação",
    fields: [
      { key: "full_name", label: "Nome completo" },
      { key: "email", label: "E-mail" },
      { key: "phone", label: "WhatsApp (somente números, com DDI)" },
      { key: "birth_date", label: "Data de nascimento", type: "date" },
      { key: "marital_status", label: "Estado civil" },
      { key: "city_state", label: "Cidade / Estado" },
      { key: "instagram_personal", label: "Instagram pessoal" },
      { key: "dietary_restriction", label: "Restrição alimentar" },
      { key: "favorite_chocolate", label: "Chocolate preferido" },
      { key: "member_tier", label: "Tipo de membro", type: "select", options: ["begin", "liberty"] },
    ],
  },
  {
    title: "Empresa",
    fields: [
      { key: "company_name", label: "Nome da empresa" },
      { key: "company_segment", label: "Ramo / Segmento" },
      { key: "company_address", label: "Endereço da empresa" },
      { key: "company_instagram", label: "Instagram da empresa" },
      { key: "business_age", label: "Há quanto tempo tem o negócio" },
      { key: "employees_count", label: "Quantidade de colaboradores (texto livre)" },
      { key: "employees_count_num", label: "Colaboradores (número)" },
      { key: "leaders_count", label: "Quantidade de líderes / gestores" },
      { key: "monthly_revenue", label: "Faturamento mensal médio" },
      { key: "profit_margin", label: "Margem de lucro" },
      { key: "business_description", label: "Descrição do negócio", type: "textarea" },
      { key: "business_story", label: "História unificada do negócio", type: "textarea" },
      { key: "personal_story", label: "Sua história", type: "textarea" },
    ],
  },
  {
    title: "Diagnóstico financeiro",
    fields: [
      { key: "financial_control", label: "Controle financeiro atual", type: "textarea" },
      { key: "uses_dre", label: "Elabora e analisa o DRE?" },
      { key: "costs_expenses", label: "Principais custos e despesas", type: "textarea" },
      { key: "financial_challenge", label: "Principal desafio financeiro", type: "textarea" },
      { key: "would_buy_self", label: "Compraria de você hoje? Por quê?", type: "textarea" },
    ],
  },
  {
    title: "Visão e expectativa",
    fields: [
      { key: "challenge_2026", label: "Maior desafio para romper em 2026", type: "textarea" },
      { key: "dream_2026", label: "Maior sonho para 2026", type: "textarea" },
      { key: "program_expectation", label: "Expectativa com o Liberty Begin", type: "textarea" },
      { key: "sector_to_develop", label: "Setor que mais precisa desenvolver" },
      { key: "vision_6_months", label: "Visão para 6 meses", type: "textarea" },
      { key: "main_pain", label: "Principal dor", type: "textarea" },
    ],
  },
  {
    title: "Programa",
    fields: [
      { key: "program_start_date", label: "Início do programa", type: "date" },
      { key: "program_end_date", label: "Término do programa", type: "date" },
    ],
  },
];

const AdminMembroEditarPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const layoutRole: "admin" | "mentor" = location.pathname.startsWith("/mentor") ? "mentor" : "admin";
  const backRoute = layoutRole === "mentor" ? `/mentor/alunos/${id}` : "/admin/membros";
  const goBack = useGoBack(backRoute);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
      if (error) toast.error("Erro ao carregar perfil");
      setProfile(data || null);
      setLoading(false);
    })();
  }, [id]);

  const update = (key: string, value: any) => setProfile((p) => (p ? { ...p, [key]: value } : p));

  const [newPassword, setNewPassword] = useState("");
  const [credentialsDialog, setCredentialsDialog] = useState<AccessCredentialsData | null>(null);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);

    // Build profile updates (everything except email — email goes through edge function)
    const profile_updates: Record<string, any> = {};
    SECTIONS.forEach((s) => s.fields.forEach((f) => {
      if (f.key === "email") return;
      profile_updates[f.key] = profile[f.key] === "" ? null : profile[f.key];
    }));
    profile_updates.avatar_url = profile.avatar_url ?? null;

    const newEmail = (profile.email || "").trim().toLowerCase();
    const emailChanged = newEmail && newEmail !== (profile.email_original || "").toLowerCase();

    const { data, error } = await supabase.functions.invoke("admin-update-user", {
      body: {
        profile_id: profile.id,
        email: newEmail || undefined,
        password: newPassword.length >= 6 ? newPassword : undefined,
        profile_updates,
      },
    });
    setSaving(false);

    // Try to surface the real error message from the edge function response body
    let realError: string | null = (data as any)?.error || null;
    if (error) {
      realError = error.message || realError;
      try {
        const ctx: any = (error as any).context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json();
          if (body?.error) realError = body.error;
        }
      } catch { /* ignore */ }
    }
    if (realError) {
      console.error("[admin-update-user] error:", realError, { error, data });
      return toast.error("Erro ao salvar: " + realError);
    }
    setNewPassword("");
    toast.success("Cadastro atualizado");
    // Ao trocar o e-mail de um cadastro sem conta, a função cria o acesso e devolve a senha para o admin enviar.
    const created = data as { account_created?: boolean; password?: string; email?: string } | null;
    if (created?.account_created && created.password) {
      setCredentialsDialog({
        full_name: profile.full_name || "",
        email: created.email || newEmail,
        password: created.password,
        role: "liberty",
      });
    }
  };

  if (loading) {
    return (
      <AppLayout role={layoutRole}>
        <PageContainer>
          <PageHeader title="Editar cadastro" back={goBack} size="large" />
          <LoadingState variant="page" />
        </PageContainer>
      </AppLayout>
    );
  }
  if (!profile) {
    return (
      <AppLayout role={layoutRole}>
        <PageContainer>
          <PageHeader title="Editar cadastro" back={goBack} size="large" />
          <ErrorState
            title="Membro não encontrado"
            description="O cadastro pode ter sido excluído ou mesclado com outro perfil."
            onRetry={goBack}
          />
        </PageContainer>
      </AppLayout>
    );
  }

  const saveButton = (
    <Button onClick={handleSave} disabled={saving}>
      <Save className="h-4 w-4" /> {saving ? "Salvando" : "Salvar"}
    </Button>
  );

  return (
    <AppLayout role={layoutRole}>
      <PageContainer>
        <PageHeader
          size="large"
          back={goBack}
          eyebrow="Editar cadastro"
          title={toTitleCase(profile.full_name || "")}
          description={profile.email}
          actions={saveButton}
        />

        <SectionCard className="flex flex-col md:flex-row md:items-center gap-4">
          <AvatarUpload
            profileId={profile.id}
            fullName={profile.full_name || ""}
            avatarUrl={profile.avatar_url}
            onChange={(url) => update("avatar_url", url)}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground font-medium truncate">{toTitleCase(profile.full_name || "")}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">Tipo:</span>
              <StatusPill tone={profile.member_tier === "liberty" ? "brand" : "neutral"} size="sm" withDot={false}>
                {profile.member_tier === "liberty" ? "Liberty Premium" : "Begin"}
              </StatusPill>
            </div>
          </div>
          <div className="md:w-72">
            <TextField
              label="Nova senha"
              hint="Opcional, mínimo de 6 caracteres. Deixe vazio para manter."
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Deixe vazio para manter"
              autoComplete="new-password"
            />
          </div>
        </SectionCard>

        {SECTIONS.map((section) => (
          <SectionCard as="section" key={section.title} className="space-y-4">
            <SectionHeader title={section.title} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {section.fields.map((f) => {
                const val = profile[f.key] ?? "";
                const span = f.type === "textarea" ? "md:col-span-2" : "";
                if (f.type === "textarea") {
                  return (
                    <TextAreaField
                      key={f.key}
                      containerClassName={span}
                      label={f.label}
                      value={val}
                      onChange={(e) => update(f.key, e.target.value)}
                      rows={4}
                    />
                  );
                }
                if (f.type === "select") {
                  return (
                    <SelectField key={f.key} label={f.label} value={val} onChange={(e) => update(f.key, e.target.value)}>
                      {f.options!.map((o) => (
                        <option key={o} value={o}>{o === "begin" ? "Begin" : "Liberty Premium"}</option>
                      ))}
                    </SelectField>
                  );
                }
                return (
                  <TextField
                    key={f.key}
                    label={f.label}
                    type={f.type === "date" ? "date" : "text"}
                    value={val ?? ""}
                    onChange={(e) => update(f.key, e.target.value)}
                  />
                );
              })}
            </div>
          </SectionCard>
        ))}

        <div className="flex justify-end">{saveButton}</div>
      </PageContainer>
      <AccessCredentialsDialog data={credentialsDialog} onClose={() => setCredentialsDialog(null)} />
    </AppLayout>
  );
};

export default AdminMembroEditarPage;
