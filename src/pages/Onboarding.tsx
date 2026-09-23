import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip, PageContainer, PageHeader, ProgressBar, SelectField, TextAreaField, TextField } from "@/components/ds";

type FieldType =
  | "text"
  | "textarea"
  | "date"
  | "tel"
  | "select"
  | "select-chips"
  | "uf"
  | "city"
  | "margin";

interface Field {
  key: string;
  label: string;
  hint?: string;
  type: FieldType;
  options?: string[];
  placeholder?: string;
  required?: boolean;
  span?: "full" | "half";
  rows?: number;
}

interface StepGroup {
  title: string;
  subtitle: string;
  fields: Field[];
}

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR",
  "PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

const STEPS: StepGroup[] = [
  {
    title: "Sobre você",
    subtitle: "Vamos começar pelo básico.",
    fields: [
      { key: "full_name", label: "Nome completo", type: "text", required: true, placeholder: "Seu nome completo", span: "full" },
      { key: "birth_date", label: "Data de nascimento", type: "date", required: true, span: "half" },
      { key: "phone", label: "WhatsApp", type: "tel", required: true, placeholder: "(11) 99999-9999", span: "half" },
      { key: "instagram_personal", label: "Instagram pessoal", type: "text", required: true, placeholder: "@seuinstagram", span: "half" },
      { key: "marital_status", label: "Estado civil", type: "select", required: true,
        options: ["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Viúvo(a)"], span: "half" },
    ],
  },
  {
    title: "Onde você está",
    subtitle: "Sua localização e algumas preferências.",
    fields: [
      { key: "uf", label: "Estado", type: "uf", required: true, placeholder: "Ex: SP", span: "half" },
      { key: "city", label: "Cidade", type: "city", required: true, placeholder: "Selecione o estado primeiro", span: "half" },
      { key: "dietary_restriction", label: "Restrição alimentar", type: "text", required: true,
        placeholder: "Nenhuma / vegetariano / sem glúten...", span: "half" },
      { key: "favorite_chocolate", label: "Chocolate preferido", type: "text", required: true,
        placeholder: "Ao leite, amargo, branco...", span: "half" },
    ],
  },
  {
    title: "Sua história",
    subtitle: "A verdadeira força de um negócio não está no que ele vende, mas na história por trás dele. Conte o caminho que te trouxe até aqui, sem pressa.",
    fields: [
      { key: "personal_story", label: "Sua história", type: "textarea", required: true,
        placeholder: "Comece pelo começo: como tudo começou, o que você passou, o que te fez chegar até aqui...",
        span: "full", rows: 14 },
    ],
  },
  {
    title: "Seu negócio",
    subtitle: "Agora me conta sobre a sua empresa.",
    fields: [
      { key: "company_name", label: "Nome da empresa", type: "text", required: true, placeholder: "Nome da empresa", span: "half" },
      { key: "company_segment", label: "Segmento", type: "text", required: true,
        placeholder: "Beleza, alimentação, tecnologia...", span: "half" },
      { key: "company_address", label: "Endereço da empresa", type: "text", required: true,
        placeholder: "Endereço, bairro ou cidade", span: "full" },
      { key: "company_instagram", label: "Instagram da empresa", type: "text", required: true,
        placeholder: "@suaempresa", span: "half" },
      { key: "business_age", label: "Tempo de existência", type: "select", required: true,
        options: ["Menos de 1 ano", "1 a 2 anos", "3 a 5 anos", "6 a 10 anos", "Mais de 10 anos"], span: "half" },
      { key: "employees_count", label: "Quantidade de funcionários", type: "select", required: true,
        options: ["Apenas eu", "2 a 5", "6 a 10", "11 a 20", "Mais de 20"], span: "full" },
      { key: "business_description", label: "O que sua empresa faz?", type: "textarea", required: true,
        hint: "Em poucas linhas, o que vocês entregam de valor?",
        placeholder: "Descreva...", span: "full", rows: 5 },
    ],
  },
  {
    title: "Financeiro",
    subtitle: "Sem julgamentos. Quanto mais real, melhor te ajudamos.",
    fields: [
      { key: "monthly_revenue", label: "Faturamento mensal médio", type: "select", required: true,
        options: ["Até R$ 10 mil", "R$ 10 a 30 mil", "R$ 30 a 100 mil", "R$ 100 a 300 mil", "Mais de R$ 300 mil", "Não sei"], span: "half" },
      { key: "profit_margin", label: "Margem de lucro", type: "margin", required: true, placeholder: "Ex: 15", span: "half" },
      { key: "would_buy_self", label: "Se fosse cliente, compraria de você?", type: "select-chips", required: true,
        options: ["Sim, com certeza", "Talvez", "Não tenho certeza"], span: "full" },
      { key: "financial_control", label: "Como é o seu controle financeiro hoje?", type: "select", required: true,
        options: ["Não tenho controle", "Anoto em caderno/planilha", "Uso sistema de gestão", "Tenho contador/financeiro"], span: "full" },
      { key: "costs_expenses", label: "Conhece seus custos e despesas?", type: "select-chips", required: true,
        options: ["Não", "Parcialmente", "Sim, totalmente"], span: "half" },
      { key: "uses_dre", label: "Você utiliza DRE?", type: "select", required: true,
        options: [
          "Não sei o que é",
          "Não uso",
          "Uso parcialmente",
          "Uso esporadicamente",
          "Faço todo o controle pelo DRE",
        ], span: "half" },
      { key: "financial_challenge", label: "Maior desafio financeiro hoje", type: "textarea", required: true,
        placeholder: "Conte o que mais te aperta...", span: "full", rows: 4 },
    ],
  },
  {
    title: "Sonhos e metas",
    subtitle: "Pra fechar, onde você quer chegar.",
    fields: [
      { key: "challenge_2026", label: "Maior desafio para 2026", type: "textarea", required: true,
        placeholder: "Seu maior desafio...", span: "full", rows: 3 },
      { key: "dream_2026", label: "Maior sonho para 2026", type: "textarea", required: true,
        placeholder: "Seu sonho...", span: "full", rows: 3 },
      { key: "program_expectation", label: "Expectativa com o Liberty Begin", type: "textarea", required: true,
        placeholder: "O que você espera...", span: "full", rows: 3 },
      { key: "sector_to_develop", label: "Setor que mais precisa desenvolver", type: "text", required: true,
        placeholder: "Vendas, marketing, financeiro...", span: "full" },
      { key: "vision_6_months", label: "Onde você quer estar em 6 meses?", type: "textarea", required: true,
        placeholder: "Sua visão...", span: "full", rows: 3 },
      { key: "main_pain", label: "Sua maior dor hoje", type: "textarea", required: true,
        hint: "Aquilo que tira seu sono, te trava, te angustia.",
        placeholder: "Sua maior dor...", span: "full", rows: 4 },
    ],
  },
];

const TOTAL_STEPS = STEPS.length;

const splitCityState = (val?: string | null): { city: string; uf: string } => {
  if (!val) return { city: "", uf: "" };
  const m = val.match(/^(.+?),\s*([A-Za-z]{2})$/);
  if (m) return { city: m[1].trim(), uf: m[2].toUpperCase() };
  return { city: val, uf: "" };
};

export default function Onboarding() {
  const navigate = useNavigate();
  const { profile, user, signOut, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [marginUnknown, setMarginUnknown] = useState(false);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const seed: Record<string, string> = {};
    const cs = splitCityState((profile as any).city_state);
    if (cs.uf) seed.uf = cs.uf;
    if (cs.city) seed.city = cs.city;
    STEPS.forEach((g) => g.fields.forEach((f) => {
      if (f.key === "uf" || f.key === "city") return;
      const v = (profile as any)[f.key];
      if (v != null && v !== "") seed[f.key] = String(v);
    }));
    // Recupera rascunho local (protege contra recarregamento/queda de conexão)
    try {
      const raw = localStorage.getItem(`onboarding-draft-${profile.id}`);
      if (raw) {
        const draft = JSON.parse(raw) as Record<string, string>;
        Object.entries(draft).forEach(([k, val]) => {
          if (val != null && val !== "") seed[k] = String(val);
        });
      }
    } catch { /* ignore */ }
    if (seed.profit_margin === "Não sei") setMarginUnknown(true);
    setAnswers(seed);
  }, [profile]);

  // Salva rascunho localmente a cada alteração
  useEffect(() => {
    if (!profile?.id || Object.keys(answers).length === 0) return;
    try {
      localStorage.setItem(`onboarding-draft-${profile.id}`, JSON.stringify(answers));
    } catch { /* ignore */ }
  }, [answers, profile?.id]);


  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    const uf = answers.uf;
    if (!uf || uf.length !== 2) { setCityOptions([]); return; }
    let cancelled = false;
    fetch(`https://servicos.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setCityOptions(data.map((c: any) => c.nome).sort());
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [answers.uf]);

  const currentStep = STEPS[step];

  const isFieldValid = (f: Field) => {
    if (!f.required) return true;
    const v = (answers[f.key] || "").trim();
    if (f.type === "margin") return marginUnknown || v.length > 0;
    return v.length > 0;
  };

  const canAdvance = useMemo(
    () => currentStep.fields.every(isFieldValid),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentStep, answers, marginUnknown],
  );

  const setField = (key: string, val: string) =>
    setAnswers((a) => ({ ...a, [key]: val }));

  const persistStep = async () => {
    if (!profile) return false;
    const payload: Record<string, unknown> = {};
    currentStep.fields.forEach((f) => {
      if (f.key === "uf" || f.key === "city") return;
      if (f.type === "margin") {
        payload.profit_margin = marginUnknown ? "Não sei" : (answers.profit_margin ? `${answers.profit_margin}%` : null);
      } else {
        payload[f.key] = answers[f.key] || null;
      }
    });
    if (currentStep.fields.some((f) => f.key === "uf" || f.key === "city")) {
      const city = (answers.city || "").trim();
      const uf = (answers.uf || "").trim().toUpperCase();
      payload.city_state = city && uf ? `${city}, ${uf}` : (city || uf || null);
    }
    const { error } = await supabase.from("profiles").update(payload as any).eq("id", profile.id);
    if (error) {
      toast.error("Não conseguimos salvar agora. Seus dados ficaram guardados no aparelho.");
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    if (!canAdvance) {
      toast.error("Preencha todos os campos obrigatórios para continuar.");
      return;
    }
    setSaving(true);
    const ok = await persistStep();
    setSaving(false);
    if (!ok) return;
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      handleFinish();
    }
  };

  const handleFinish = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      toast.error("Não conseguimos finalizar agora. Seus dados estão salvos — tente novamente.");
      return;
    }
    try { localStorage.removeItem(`onboarding-draft-${profile.id}`); } catch { /* ignore */ }
    setDone(true);
    await refreshProfile();
    setTimeout(() => { navigate("/dashboard", { replace: true }); }, 1600);
  };




  if (done) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center py-10">
        <PageContainer variant="narrow">
          <div className="max-w-sm mx-auto text-center space-y-6" role="status" aria-live="polite">
            <Check className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
            <div className="space-y-2">
              <h1 className="text-[24px] md:text-[28px] font-semibold leading-[1.2] tracking-[var(--ds-tracking-display)] text-foreground">
                Tudo pronto
              </h1>
              <p className="text-sm text-muted-foreground">Bem-vindo(a) ao Liberty Begin. Estamos levando você para o início.</p>
            </div>
            <Button size="lg" onClick={() => navigate("/dashboard", { replace: true })} className="w-full">
              Ir para o início
            </Button>
          </div>
        </PageContainer>
      </div>
    );
  }

  const renderField = (f: Field) => {
    const v = answers[f.key] ?? "";
    const colSpan = f.span === "full" ? "md:col-span-2" : "";

    if (f.type === "textarea") {
      return (
        <TextAreaField
          key={f.key}
          label={f.label}
          hint={f.hint}
          required={f.required}
          value={v}
          onChange={(e) => setField(f.key, e.target.value)}
          placeholder={f.placeholder}
          rows={f.rows ?? 4}
          className="resize-y leading-relaxed"
          containerClassName={colSpan}
        />
      );
    }

    // Select nativo: evita travamentos em iOS (Safari/PWA)
    if (f.type === "select") {
      return (
        <SelectField
          key={f.key}
          label={f.label}
          required={f.required}
          value={v}
          onChange={(e) => setField(f.key, e.target.value)}
          containerClassName={colSpan}
        >
          <option value="">Selecione uma opção</option>
          {(f.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </SelectField>
      );
    }

    // Chips: respostas curtas (sim / talvez / não)
    if (f.type === "select-chips") {
      return (
        <fieldset key={f.key} className={cn("space-y-1.5 min-w-0", colSpan)}>
          <legend className="block text-sm font-medium text-foreground mb-1.5">
            {f.label}
            {f.required && <span className="text-destructive ml-0.5" aria-hidden>*</span>}
          </legend>
          <div className="flex flex-wrap gap-2">
            {(f.options ?? []).map((opt) => (
              <Chip key={opt} active={v === opt} onClick={() => setField(f.key, opt)}>
                {opt}
              </Chip>
            ))}
          </div>
        </fieldset>
      );
    }

    if (f.type === "date") {
      return (
        <TextField
          key={f.key}
          type="date"
          label={f.label}
          hint="Dia, mês e ano."
          required={f.required}
          value={v}
          onChange={(e) => setField(f.key, e.target.value)}
          max={format(new Date(), "yyyy-MM-dd")}
          containerClassName={colSpan}
        />
      );
    }

    if (f.type === "uf") {
      return (
        <SelectField
          key={f.key}
          label={f.label}
          required={f.required}
          value={v}
          onChange={(e) => {
            const val = e.target.value;
            setField(f.key, val);
            if (val !== answers.uf) setField("city", "");
          }}
          containerClassName={colSpan}
        >
          <option value="">Selecione o estado</option>
          {UFS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </SelectField>
      );
    }

    if (f.type === "city") {
      return (
        <div key={f.key} className={cn("min-w-0", colSpan)}>
          <TextField
            label={f.label}
            required={f.required}
            list="city-options"
            value={v}
            placeholder={answers.uf ? "Comece a digitar a cidade" : f.placeholder}
            disabled={!answers.uf}
            onChange={(e) => setField(f.key, e.target.value)}
          />
          <datalist id="city-options">
            {cityOptions.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
      );
    }

    if (f.type === "margin") {
      return (
        <div key={f.key} className={cn("space-y-1.5 min-w-0", colSpan)}>
          <div className="flex items-end gap-2.5">
            <div className="relative flex-1 min-w-0">
              <TextField
                type="number"
                label={f.label}
                required={f.required}
                min={0}
                max={100}
                step={0.1}
                inputMode="decimal"
                value={marginUnknown ? "" : v}
                disabled={marginUnknown}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder={marginUnknown ? "Não sei" : f.placeholder}
                className="pr-9"
              />
              <span className="absolute right-4 bottom-3 text-sm text-muted-foreground pointer-events-none" aria-hidden>%</span>
            </div>
            <Chip
              active={marginUnknown}
              onClick={() => {
                const next = !marginUnknown;
                setMarginUnknown(next);
                if (next) setField(f.key, "");
              }}
              className="h-11 mb-0.5"
            >
              Não sei
            </Chip>
          </div>
        </div>
      );
    }

    return (
      <TextField
        key={f.key}
        type={f.type === "tel" ? "tel" : "text"}
        label={f.label}
        required={f.required}
        inputMode={f.type === "tel" ? "tel" : undefined}
        autoComplete={f.type === "tel" ? "tel" : undefined}
        value={v}
        onChange={(e) => setField(f.key, e.target.value)}
        placeholder={f.placeholder}
        containerClassName={colSpan}
      />
    );
  };

  return (
    <div className="min-h-[100dvh] bg-background pt-[calc(env(safe-area-inset-top,0px)_+_1.5rem)] pb-[calc(env(safe-area-inset-bottom,0px)_+_2.5rem)] md:pt-10">
      <PageContainer variant="narrow">
        <div className="space-y-3">
          <PageHeader
            eyebrow={`Etapa ${step + 1} de ${TOTAL_STEPS}`}
            title={currentStep.title}
            description={currentStep.subtitle}
            actions={
              <Button type="button" variant="ghost" size="sm" onClick={() => signOut()} className="text-muted-foreground">
                Sair
              </Button>
            }
          />
          <ProgressBar value={step + 1} max={TOTAL_STEPS} label={`Progresso: etapa ${step + 1} de ${TOTAL_STEPS}`} />
        </div>

        <form
          key={step}
          onSubmit={(e) => { e.preventDefault(); void handleNext(); }}
          className="space-y-8"
          noValidate
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
            {currentStep.fields.map(renderField)}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => step > 0 && setStep(step - 1)}
              disabled={step === 0}
              className="text-muted-foreground"
            >
              <ArrowLeft aria-hidden /> Voltar
            </Button>
            <Button type="submit" disabled={saving} size="lg" className="min-w-[160px]">
              {step === TOTAL_STEPS - 1
                ? (saving ? "Finalizando..." : <>Finalizar <Check aria-hidden /></>)
                : (saving ? "Salvando..." : <>Continuar <ArrowRight aria-hidden /></>)}
            </Button>
          </div>
        </form>
      </PageContainer>
    </div>
  );
}
