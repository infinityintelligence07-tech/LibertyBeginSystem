import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, ArrowRight, Check, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
  emoji: string;
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
    emoji: "👋",
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
    emoji: "📍",
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
    emoji: "📖",
    title: "Sua história",
    subtitle: "A verdadeira força de um negócio não está no que ele vende, mas na história por trás dele. Conte o caminho que te trouxe até aqui, sem pressa.",
    fields: [
      { key: "personal_story", label: "Sua história", type: "textarea", required: true,
        placeholder: "Comece pelo começo: como tudo começou, o que você passou, o que te fez chegar até aqui...",
        span: "full", rows: 14 },
    ],
  },
  {
    emoji: "🏢",
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
    emoji: "💰",
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
    emoji: "🌟",
    title: "Sonhos & metas",
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

// Shared input/textarea classes — higher contrast (bg-card + visible border)
const FIELD_CLASSES =
  "bg-card border border-input/80 text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary";

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
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center animate-fade-in">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-primary/15 mb-6">
            <Check className="w-12 h-12 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-3">Tudo pronto! 🎉</h1>
          <p className="text-lg text-muted-foreground">Bem-vindo(a) ao Liberty Begin.</p>
        </div>
      </div>
    );
  }

  const progress = Math.round(((step + 1) / TOTAL_STEPS) * 100);

  const renderField = (f: Field) => {
    const v = answers[f.key] ?? "";
    const colSpan = f.span === "full" ? "md:col-span-2" : "";

    const Label = (
      <label className="text-sm font-medium text-foreground">
        {f.label} {f.required && <span className="text-primary">*</span>}
      </label>
    );

    if (f.type === "textarea") {
      return (
        <div key={f.key} className={cn("space-y-2", colSpan)}>
          {Label}
          {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
          <Textarea
            value={v}
            onChange={(e) => setField(f.key, e.target.value)}
            placeholder={f.placeholder}
            rows={f.rows ?? 4}
            className={cn("resize-y leading-relaxed", FIELD_CLASSES)}
          />
        </div>
      );
    }

    // Dropdown nativo — evita travamentos/tela preta em iOS (Safari/PWA)
    if (f.type === "select") {
      return (
        <div key={f.key} className={cn("space-y-2", colSpan)}>
          {Label}
          <select
            value={v}
            onChange={(e) => setField(f.key, e.target.value)}
            className={cn(
              "h-11 w-full rounded-md px-3 text-sm",
              FIELD_CLASSES,
            )}
          >
            <option value="">Selecione uma opção</option>
            {(f.options ?? []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    }


    // Chips — used for short yes/no/maybe style answers
    if (f.type === "select-chips") {
      return (
        <div key={f.key} className={cn("space-y-2", colSpan)}>
          {Label}
          <div className="flex flex-wrap gap-2">
            {(f.options ?? []).map((opt) => {
              const selected = v === opt;
              return (
                <button
                  type="button"
                  key={opt}
                  onClick={() => setField(f.key, opt)}
                  className={cn(
                    "px-3.5 py-2 rounded-lg border text-sm transition-all",
                    selected
                      ? "border-primary/60 bg-primary/15 text-foreground"
                      : "border-input/80 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {selected && <Check className="inline w-3.5 h-3.5 mr-1.5 text-primary" />}
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (f.type === "date") {
      const parsed = v ? parse(v, "yyyy-MM-dd", new Date()) : undefined;
      const displayDate = parsed && isValid(parsed) ? parsed : undefined;
      return (
        <div key={f.key} className={cn("space-y-2", colSpan)}>
          {Label}
          <p className="text-xs text-muted-foreground">Você pode digitar a data direto no campo (dia/mês/ano).</p>
          <div className="flex gap-2">
            <Input
              type="date"
              value={v}
              onChange={(e) => setField(f.key, e.target.value)}
              className={cn("flex-1 h-11", FIELD_CLASSES)}
              max={format(new Date(), "yyyy-MM-dd")}
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  type="button"
                  className="h-11 w-11 bg-card border-input/80"
                  aria-label="Abrir calendário"
                >
                  <CalendarIcon className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-popover border-border" align="end">
                <Calendar
                  mode="single"
                  selected={displayDate}
                  onSelect={(d) => d && setField(f.key, format(d, "yyyy-MM-dd"))}
                  captionLayout="dropdown-buttons"
                  fromYear={1930}
                  toYear={new Date().getFullYear()}
                  defaultMonth={displayDate}
                  locale={ptBR}
                  className={cn("p-3 pointer-events-auto onboarding-calendar")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      );
    }

    if (f.type === "uf") {
      return (
        <div key={f.key} className={cn("space-y-2", colSpan)}>
          {Label}
          <select
            value={v}
            onChange={(e) => {
              const val = e.target.value;
              setField(f.key, val);
              if (val !== answers.uf) setField("city", "");
            }}
            className={cn("h-11 w-full rounded-md px-3 text-sm", FIELD_CLASSES)}
          >
            <option value="">Selecione o estado</option>
            {UFS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>

        </div>
      );
    }

    if (f.type === "city") {
      return (
        <div key={f.key} className={cn("space-y-2", colSpan)}>
          {Label}
          <Input
            list="city-options"
            value={v}
            placeholder={answers.uf ? "Comece a digitar a cidade..." : f.placeholder}
            disabled={!answers.uf}
            onChange={(e) => setField(f.key, e.target.value)}
            className={cn("h-11", FIELD_CLASSES)}
          />
          <datalist id="city-options">
            {cityOptions.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
      );
    }

    if (f.type === "margin") {
      return (
        <div key={f.key} className={cn("space-y-2", colSpan)}>
          {Label}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={marginUnknown ? "" : v}
                disabled={marginUnknown}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder={f.placeholder}
                className={cn("h-11 pr-9", FIELD_CLASSES)}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
            <label className="flex items-center gap-2 px-3 h-11 rounded-lg border border-input/80 bg-card cursor-pointer hover:bg-muted/40 transition-colors">
              <Checkbox
                checked={marginUnknown}
                onCheckedChange={(c) => {
                  const checked = !!c;
                  setMarginUnknown(checked);
                  if (checked) setField(f.key, "");
                }}
              />
              <span className="text-sm text-foreground">Não sei</span>
            </label>
          </div>
        </div>
      );
    }

    return (
      <div key={f.key} className={cn("space-y-2", colSpan)}>
        {Label}
        <Input
          type={f.type === "tel" ? "tel" : "text"}
          value={v}
          onChange={(e) => setField(f.key, e.target.value)}
          placeholder={f.placeholder}
          className={cn("h-11", FIELD_CLASSES)}
        />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Inline styles to give the native dropdowns inside the calendar proper contrast */}
      <style>{`
        .onboarding-calendar .rdp-caption_dropdowns select,
        .onboarding-calendar select {
          background-color: hsl(var(--card));
          color: hsl(var(--foreground));
          border: 1px solid hsl(var(--input));
          border-radius: 6px;
          padding: 4px 6px;
          font-size: 0.875rem;
        }
        .onboarding-calendar .rdp-caption_dropdowns select:focus {
          outline: 2px solid hsl(var(--ring));
          outline-offset: 1px;
        }
        .onboarding-calendar .rdp-caption_dropdowns option {
          background-color: hsl(var(--popover));
          color: hsl(var(--foreground));
        }
      `}</style>

      <header className="px-6 py-5 flex items-center justify-between border-b border-border/40">
        <div className="text-sm font-medium text-muted-foreground">
          Etapa {step + 1} <span className="opacity-50">de {TOTAL_STEPS}</span>
        </div>
        <button onClick={() => signOut()} className="text-xs text-muted-foreground hover:text-foreground transition">
          Sair
        </button>
      </header>

      <div className="h-1 bg-border/30">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      <main className="flex-1 flex justify-center px-4 sm:px-6 py-8 md:py-12">
        <div key={step} className="w-full max-w-2xl animate-fade-in">
          <div className="text-xs font-medium uppercase tracking-wider text-primary/80 mb-3 flex items-center gap-2">
            <span className="text-base">{currentStep.emoji}</span>
            <span>{currentStep.title}</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-bold leading-tight mb-2">{currentStep.title}</h1>
          <p className="text-sm md:text-base text-muted-foreground mb-8 leading-relaxed">{currentStep.subtitle}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-6">
            {currentStep.fields.map(renderField)}
          </div>

          <div className="mt-10 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => step > 0 && setStep(step - 1)}
              disabled={step === 0}
              className="text-muted-foreground"
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
            </Button>
            <Button type="button" onClick={handleNext} disabled={saving} size="lg" className="min-w-[160px]">
              {step === TOTAL_STEPS - 1
                ? (saving ? "Finalizando..." : <>Finalizar <Check className="w-4 h-4 ml-2" /></>)
                : (saving ? "Salvando..." : <>Continuar <ArrowRight className="w-4 h-4 ml-2" /></>)}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
