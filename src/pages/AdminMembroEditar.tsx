import { useEffect, useState } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { useGoBack } from "@/lib/navigation";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AvatarUpload } from "@/components/AvatarUpload";
import { toTitleCase } from "@/lib/formatName";

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
  const navigate = useNavigate();
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
  };

  if (loading) return <AppLayout role={layoutRole}><div className="p-8 text-muted-foreground">Carregando…</div></AppLayout>;
  if (!profile) return <AppLayout role={layoutRole}><div className="p-8">Membro não encontrado.</div></AppLayout>;

  return (
    <AppLayout role={layoutRole}>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <button onClick={goBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-silver flex items-center gap-2 text-sm disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>

        <div className="glass-card p-6 flex flex-col md:flex-row md:items-center gap-4">
          <AvatarUpload
            profileId={profile.id}
            fullName={profile.full_name || ""}
            avatarUrl={profile.avatar_url}
            onChange={(url) => update("avatar_url", url)}
          />
          <div className="flex-1">
            <h1 className="text-xl font-semibold">{toTitleCase(profile.full_name || "")}</h1>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tipo: <span className="text-primary">{profile.member_tier === "liberty" ? "Liberty Premium" : "Begin"}</span>
            </p>
          </div>
          <div className="md:w-64">
            <label className="block text-xs text-muted-foreground mb-1">Nova senha (opcional, mín. 6)</label>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Deixe vazio para manter"
              className="input-begin w-full text-sm h-10"
              autoComplete="new-password"
            />
          </div>
        </div>

        {SECTIONS.map((section) => (
          <section key={section.title} className="glass-card p-6 space-y-4">
            <h2 className="text-base font-semibold border-b border-border pb-2">{section.title}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {section.fields.map((f) => {
                const val = profile[f.key] ?? "";
                const span = f.type === "textarea" ? "md:col-span-2" : "";
                return (
                  <div key={f.key} className={span}>
                    <label className="block text-xs text-muted-foreground mb-1">{f.label}</label>
                    {f.type === "textarea" ? (
                      <textarea
                        value={val}
                        onChange={(e) => update(f.key, e.target.value)}
                        rows={4}
                        className="input-begin w-full text-sm"
                      />
                    ) : f.type === "select" ? (
                      <select
                        value={val}
                        onChange={(e) => update(f.key, e.target.value)}
                        className="input-begin w-full text-sm h-10"
                      >
                        {f.options!.map((o) => (
                          <option key={o} value={o}>{o === "begin" ? "Begin" : "Liberty Premium"}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.type === "date" ? "date" : "text"}
                        value={val ?? ""}
                        onChange={(e) => update(f.key, e.target.value)}
                        className="input-begin w-full text-sm h-10"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </AppLayout>
  );
};

export default AdminMembroEditarPage;
