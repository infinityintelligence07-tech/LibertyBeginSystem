import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrailPath } from "@/components/tools/TrailPath";
import { DiagnosticRadar } from "@/components/tools/DiagnosticRadar";
import { GiftReveal } from "@/components/tools/GiftReveal";
import { StateMap } from "@/components/tools/StateMap";
import { NextStepsTrail } from "@/components/tools/NextStepsTrail";

import {
  DIAGNOSTICO_BEGIN_PILLARS,
  computeScores,
  isPillarComplete,
  pillarAnsweredCount,
  overallScore,
  maturityLabel,
  pillarGoalKey,
  pillarCurrentKey,
  formatNumericInput,
  type Answers,
  type ToolPillar,
} from "@/lib/diagnosticoBegin";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, Moon, PartyPopper,
  Radar as RadarIcon, Sun, Target, X,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IconButton, SectionCard, TextAreaField, TextField } from "@/components/ds";

const PILLARS = DIAGNOSTICO_BEGIN_PILLARS;
const TOTAL_QUESTIONS = PILLARS.reduce((a, p) => a + p.questions.length, 0);

export const pillarAccent = (i: number) => `hsl(var(--pillar-${(i % 7) + 1}))`;

const MICRO_REWARDS = [
  "Boa! Seguimos.",
  "Registrado.",
  "Isso ajuda muito no diagnóstico.",
  "Mais um passo dado.",
  "Excelente, avançando.",
];

const GOAL_EXAMPLES: Record<string, string[]> = {
  financeiro: [
    "Reduzir custos",
    "Ter clareza dos números (conciliação em dia)",
    "Construir a projeção financeira dos próximos meses",
    "Definir e retirar pró-labore com previsibilidade",
    "Separar 100% pessoa física de pessoa jurídica",
  ],
  gestao: [
    "Definir indicadores e acompanhar em rotina semanal",
    "Organizar a agenda de decisões (reunião de gestão)",
    "Documentar o modelo de negócio e as prioridades do semestre",
  ],
  lideranca: [
    "Definir combinados e valores praticados no dia a dia",
    "Criar rotina de feedback e acompanhamento do time",
    "Formar um segundo líder para a operação",
  ],
  marketing: [
    "Definir o posicionamento e a promessa central",
    "Estruturar um canal de aquisição previsível",
    "Padronizar a rotina de conteúdo e mensuração",
  ],
  inovacao: [
    "Criar um produto ou serviço novo",
    "Levar a oferta atual para um novo público",
    "Mudar a forma de entregar para ganhar tempo e custo",
    "Testar um novo formato de pacote ou preço",
  ],
  vendas: [
    "Padronizar o processo comercial da abordagem ao fechamento",
    "Criar rotina de follow-up com prazo e responsável",
    "Acompanhar funil, conversão e ticket médio toda semana",
    "Estruturar ações de recompra e indicação",
  ],
  processos: [

    "Mapear e documentar o processo crítico da operação",
    "Reduzir retrabalho com checklists e padrões",
  ],
  pessoas: [
    "Estruturar o processo de contratação e integração",
    "Definir papéis e responsabilidades com clareza",
  ],
};

const PROCESSING_STEPS = [
  "Lendo todas as respostas…",
  "Calculando os scores…",
  "Cruzando forças e gargalos…",
  "Preparando o resultado…",
];

type View = "cover" | "trail" | "question" | "stage" | "processing" | "result" | "map" | "nextsteps" | "gift";

interface Props {
  answers: Answers;
  onChange: (qid: string, value: string) => void;
  onExit: () => void;
  onFinish?: () => void | Promise<void>;
  title: string;
  subtitle?: string;
  finishLabel?: string;
  resultLabel?: string;
  demo?: boolean;
  startAtResult?: boolean;
  startAtTrail?: boolean;
  saving?: boolean;
  onSaveStep?: () => void;
}

export const ToolWizard = ({
  answers,
  onChange,
  onExit,
  onFinish,
  title,
  subtitle,
  finishLabel = "Acessar diagnóstico",
  resultLabel = "Diagnóstico",
  demo = false,
  startAtResult = false,
  startAtTrail = false,
  saving = false,
  onSaveStep,
}: Props) => {
  const { theme, toggleTheme } = useTheme();
  const [view, setView] = useState<View>(startAtResult ? "result" : startAtTrail ? "trail" : "cover");
  const [pi, setPi] = useState(0);
  const [qi, setQi] = useState(0);
  const [reward, setReward] = useState<string | null>(null);
  const [procStep, setProcStep] = useState(0);

  useEffect(() => {
    if (startAtResult) setView("result");
  }, [startAtResult]);

  const scores = useMemo(() => computeScores(answers), [answers]);
  const total = overallScore(scores);
  const answered = PILLARS.reduce((a, p) => a + pillarAnsweredCount(p, answers), 0);
  const progress = Math.round((answered / TOTAL_QUESTIONS) * 100);
  const allComplete = PILLARS.every((p) => isPillarComplete(p, answers));

  const pillar: ToolPillar = PILLARS[pi];
  const question = pillar?.questions[qi];
  const accent = pillarAccent(pi);

  const flashReward = () => {
    setReward(MICRO_REWARDS[Math.floor(Math.random() * MICRO_REWARDS.length)]);
    setTimeout(() => setReward(null), 1400);
  };

  const openPillar = (index: number) => {
    const p = PILLARS[index];
    const firstUnanswered = p.questions.findIndex((q) => !answers[q.id]);
    setPi(index);
    setQi(firstUnanswered >= 0 ? firstUnanswered : 0);
    setView("question");
    window.scrollTo({ top: 0 });
  };

  const goNext = () => {
    onSaveStep?.();
    if (qi < pillar.questions.length - 1) {
      setQi((v) => v + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setView("stage");
    window.scrollTo({ top: 0 });
  };

  const goPrev = () => {
    if (qi > 0) return setQi((v) => v - 1);
    setView("trail");
  };

  const answerAndAdvance = (value: string) => {
    if (!question) return;
    onChange(question.id, value);
    flashReward();
    setTimeout(goNext, 480);
  };

  const startProcessing = async () => {
    setView("processing");
    setProcStep(0);
    PROCESSING_STEPS.forEach((_, i) => {
      if (i > 0) setTimeout(() => setProcStep(i), i * 750);
    });
    try {
      await onFinish?.();
    } catch {
      /* erro tratado por quem chama */
    }
    setTimeout(() => {
      setView("result");
      window.scrollTo({ top: 0 });
    }, PROCESSING_STEPS.length * 750 + 400);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      {/* Topo */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div
          className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center gap-3"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)", paddingBottom: "0.5rem" }}
        >
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)` }}
          >
            <RadarIcon className="h-4 w-4" style={{ color: accent }} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{title}</p>
            <p className="text-xs text-muted-foreground truncate">
              {subtitle || (demo ? "Modo demonstração · nada é salvo" : "Sessão de mapeamento")}
            </p>
          </div>
          {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Salvando" />}
          <IconButton
            variant="outline"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </IconButton>
          <IconButton variant="outline" onClick={onExit} aria-label="Fechar ferramenta">
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div
          className="h-1 bg-muted"
          role="progressbar"
          aria-label="Progresso do diagnóstico"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={view === "result" || view === "map" || view === "nextsteps" || view === "gift" ? 100 : progress}
        >
          <motion.div
            className="h-full"
            style={{ background: accent }}
            animate={{ width: `${view === "result" || view === "map" || view === "nextsteps" || view === "gift" ? 100 : progress}%` }}
            transition={{ duration: 0.45 }}
          />
        </div>
      </div>

      {/* Microrrecompensa */}
      <AnimatePresence>
        {reward && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            className="fixed left-1/2 -translate-x-1/2 z-30 rounded-full px-4 py-2 text-xs font-medium shadow-lg border border-border bg-card text-foreground flex items-center gap-2"
            style={{ top: "calc(env(safe-area-inset-top) + 4.5rem)" }}
          >
            <Check className="h-3.5 w-3.5" style={{ color: accent }} />
            {reward}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
        <AnimatePresence mode="wait">
          {/* Capa */}
          {view === "cover" && (
            <motion.div key="cover" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              {/* Abertura */}
              <SectionCard className="sm:p-8">
                <p className="ds-kicker" style={{ color: pillarAccent(0) }}>Ferramenta Begin</p>
                <h1 className="text-[28px] md:text-[34px] font-bold text-foreground mt-2 leading-[1.15]">
                  {title}
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground mt-3 leading-relaxed max-w-xl">
                  Uma conversa guiada, uma pergunta por vez, no ritmo da sessão. No final,
                  um retrato claro do momento do negócio.
                </p>

                <Button size="lg" className="mt-6 w-full sm:w-auto" onClick={() => setView("trail")}>
                  {answered > 0 ? "Continuar trilha" : "Iniciar"} <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </SectionCard>

              {/* Como funciona */}
              <ol className="grid gap-3 sm:grid-cols-3 list-none m-0 p-0">
                {[
                  { t: "Trilha guiada", d: "Uma pergunta por tela, sem formulário longo." },
                  { t: "Etapa a etapa", d: "Cada etapa concluída marca o avanço na trilha." },
                  { t: "Resultado final", d: "Ao concluir, o mapeamento é gerado na hora." },
                ].map((s, i) => (
                  <li key={s.t}>
                    <SectionCard padding="compact" className="h-full">
                      <span
                        className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: `color-mix(in srgb, ${pillarAccent(i)} 16%, transparent)`, color: pillarAccent(i) }}
                        aria-hidden
                      >
                        {i + 1}
                      </span>
                      <p className="text-[15px] font-semibold text-foreground mt-2.5">{s.t}</p>
                      <p className="text-xs text-muted-foreground leading-snug mt-1">{s.d}</p>
                    </SectionCard>
                  </li>
                ))}
              </ol>
            </motion.div>
          )}


          {/* Trilha em bento vertical */}
          {view === "trail" && (
            <motion.div key="trail" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <SectionCard padding="compact" className="flex items-center gap-4">
                <div className="relative h-16 w-16 shrink-0" role="img" aria-label={`${progress}% concluído`}>
                  <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90" aria-hidden>
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
                    <motion.circle
                      cx="18" cy="18" r="15.5" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 15.5}
                      animate={{ strokeDashoffset: 2 * Math.PI * 15.5 * (1 - progress / 100) }}
                      transition={{ duration: 0.6 }}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-foreground tabular-nums">{progress}%</span>
                </div>
                <div className="min-w-0">
                  <h2 className="text-[17px] font-semibold text-foreground">Trilha do diagnóstico</h2>
                  <p className="text-xs text-muted-foreground tabular-nums">{answered} de {TOTAL_QUESTIONS} perguntas respondidas</p>
                </div>
              </SectionCard>

              <TrailPath answers={answers} onSelect={openPillar} activeIndex={pi} />


              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch auto-rows-fr" role="list">
                {PILLARS.map((p, i) => {
                  const done = isPillarComplete(p, answers);
                  const count = pillarAnsweredCount(p, answers);
                  const pct = Math.round((count / p.questions.length) * 100);
                  const c = pillarAccent(i);
                  return (
                    <SectionCard
                      key={p.id}
                      as="button"
                      interactive
                      padding="compact"
                      role="listitem"
                      onClick={() => openPillar(i)}
                      aria-label={`${p.name}: ${count} de ${p.questions.length} respostas`}
                      className="text-left h-full flex flex-col"
                      style={{ borderColor: done ? `color-mix(in srgb, ${c} 55%, transparent)` : undefined }}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className="h-9 w-9 rounded-full text-xs font-bold flex items-center justify-center shrink-0"
                          style={{ background: `color-mix(in srgb, ${c} 18%, transparent)`, color: c }}
                          aria-hidden
                        >
                          {done ? <Check className="h-4 w-4" /> : i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-semibold text-foreground truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground leading-snug line-clamp-2 min-h-[2rem]">{p.description}</p>
                          <div className="mt-2.5 h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden>
                            <motion.div className="h-full rounded-full" style={{ background: c }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 tabular-nums">{count}/{p.questions.length} respostas</p>
                        </div>
                      </div>
                    </SectionCard>
                  );
                })}
              </div>

              <Button size="lg" className="w-full" onClick={startProcessing} disabled={answered === 0}>
                {finishLabel} <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
              {!allComplete && (
                <p className="text-xs text-muted-foreground text-center">
                  O resultado considera apenas o que já foi respondido. Dá pra voltar e completar depois.
                </p>
              )}
            </motion.div>
          )}

          {/* Uma pergunta por tela */}
          {view === "question" && question && (
            <motion.div key={question.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs px-2.5 h-6 inline-flex items-center rounded-full font-semibold" style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}>
                  Etapa {pi + 1}/{PILLARS.length} · {pillar.short}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Pergunta {qi + 1} de {pillar.questions.length}
                </span>
              </div>

              <div className="flex gap-1.5" aria-hidden>
                {pillar.questions.map((q, i) => (
                  <div
                    key={q.id}
                    className="h-1.5 flex-1 rounded-full transition-colors"
                    style={{ background: answers[q.id] ? accent : i === qi ? `color-mix(in srgb, ${accent} 40%, transparent)` : "hsl(var(--muted))" }}
                  />
                ))}
              </div>

              <SectionCard>
                <h2 className="text-[22px] sm:text-[24px] font-semibold text-foreground leading-snug">{question.title}</h2>
              </SectionCard>

              {question.type === "text" && question.format ? (
                <div className="space-y-2.5">
                  <TextField
                    aria-label={question.title}
                    inputMode="numeric"
                    value={answers[question.id] === "Não tem clareza" ? "" : answers[question.id] || ""}
                    onChange={(e) => onChange(question.id, formatNumericInput(e.target.value, question.format!))}
                    placeholder={question.placeholder}
                    autoFocus
                    className="h-14 text-lg font-semibold tabular-nums placeholder:font-normal"
                  />
                  {question.allowUnknown && (
                    <button
                      type="button"
                      onClick={() => onChange(question.id, "Não tem clareza")}
                      aria-pressed={answers[question.id] === "Não tem clareza"}
                      className="rounded-full border px-3.5 h-8 text-xs font-medium transition-colors duration-ds-1 ease-ds focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
                      style={{
                        borderColor: answers[question.id] === "Não tem clareza" ? accent : "hsl(var(--border))",
                        background: answers[question.id] === "Não tem clareza" ? `color-mix(in srgb, ${accent} 14%, transparent)` : "transparent",
                        color: answers[question.id] === "Não tem clareza" ? accent : "hsl(var(--muted-foreground))",
                      }}
                    >
                      Não tem clareza
                    </button>
                  )}
                </div>
              ) : question.type === "text" ? (
                <TextAreaField
                  aria-label={question.title}
                  value={answers[question.id] || ""}
                  onChange={(e) => onChange(question.id, e.target.value)}
                  placeholder={question.placeholder}
                  rows={5}
                  autoFocus
                  className="resize-y"
                />
              ) : (
                <div className="space-y-2.5" role="group" aria-label={question.title}>
                  {question.options.map((o, oi) => {
                    const selected = answers[question.id] === o.key;
                    return (
                      <motion.button
                        key={o.key}
                        type="button"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: oi * 0.04 }}
                        onClick={() => answerAndAdvance(o.key)}
                        aria-pressed={selected}
                        className="w-full flex items-start gap-3 rounded-ds-lg border p-4 min-h-[56px] text-left transition-colors duration-ds-1 ease-ds focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
                        style={{
                          borderColor: selected ? accent : "hsl(var(--border))",
                          background: selected ? `color-mix(in srgb, ${accent} 12%, transparent)` : "hsl(var(--card))",
                        }}
                      >
                        <span
                          className="h-7 w-7 shrink-0 rounded-full text-xs font-bold flex items-center justify-center"
                          style={{
                            background: selected ? accent : "hsl(var(--muted))",
                            color: selected ? "hsl(var(--background))" : "hsl(var(--muted-foreground))",
                          }}
                          aria-hidden
                        >
                          {o.key}
                        </span>
                        <span className="text-sm text-foreground leading-snug">{o.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-1">
                <Button variant="outline" onClick={goPrev}>
                  <ArrowLeft className="h-4 w-4" aria-hidden /> {qi === 0 ? "Trilha" : "Anterior"}
                </Button>
                <Button onClick={goNext}>
                  {qi === pillar.questions.length - 1 ? "Concluir etapa" : "Próxima"}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Etapa concluída */}
          {view === "stage" && (
            <motion.div key="stage" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="py-6 space-y-4">
              <div className="text-center space-y-3">
                <div
                  className="mx-auto h-16 w-16 rounded-full flex items-center justify-center"
                  style={{ background: `color-mix(in srgb, ${accent} 18%, transparent)` }}
                >
                  <PartyPopper className="h-8 w-8" style={{ color: accent }} aria-hidden />
                </div>
                <div>
                  <h2 className="text-[22px] font-semibold text-foreground">Etapa concluída</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {pillar.name} mapeado. {PILLARS.filter((p) => isPillarComplete(p, answers)).length} de {PILLARS.length} etapas prontas.
                  </p>
                </div>
                <div className="flex justify-center gap-1.5" aria-hidden>
                  {PILLARS.map((p, i) => (
                    <span
                      key={p.id}
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: isPillarComplete(p, answers) ? pillarAccent(i) : "hsl(var(--muted))" }}
                    />
                  ))}
                </div>
              </div>

              {/* Revisão das respostas da etapa */}
              <SectionCard padding="compact" className="space-y-3">
                <h3 className="text-[15px] font-semibold text-foreground">Como ficou esta etapa</h3>
                <div className="space-y-2">
                  {pillar.questions.map((q, i) => {
                    const val = answers[q.id];
                    const label =
                      q.type === "scale"
                        ? q.options.find((o) => o.key === val)?.label
                        : val;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => { setQi(i); setView("question"); window.scrollTo({ top: 0 }); }}
                        className="w-full text-left rounded-ds-lg border border-border bg-card p-3 min-h-[56px] hover:bg-accent transition-colors duration-ds-1 ease-ds focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
                      >
                        <p className="text-xs text-muted-foreground leading-snug">{q.title}</p>
                        <p className="text-sm text-foreground mt-1 leading-snug">
                          {label || <span className="text-muted-foreground">Sem resposta, toque para preencher</span>}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              {/* Resumo do estado atual do setor */}
              <SectionCard padding="compact">
                <TextAreaField
                  label={
                    <span className="inline-flex items-center gap-2">
                      <Target className="h-4 w-4" style={{ color: accent }} aria-hidden />
                      Resuma em uma frase como está hoje o {pillar.short}
                    </span>
                  }
                  value={answers[pillarCurrentKey(pillar.id)] || ""}
                  onChange={(e) => onChange(pillarCurrentKey(pillar.id), e.target.value)}
                  placeholder="Ex.: hoje esta área funciona de forma reativa, sem rotina definida e sem indicadores claros."
                  rows={3}
                  className="resize-y"
                  hint="No final do mapeamento você define para onde quer levar cada setor."
                />
              </SectionCard>

              <Button size="lg" className="w-full" onClick={() => { onSaveStep?.(); setView("trail"); window.scrollTo({ top: 0 }); }}>
                Voltar para a trilha <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </motion.div>
          )}

          {/* Processando */}
          {view === "processing" && (
            <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-20 text-center space-y-6" aria-live="polite" aria-busy="true">
              <div
                className="relative mx-auto h-20 w-20 rounded-full flex items-center justify-center"
                style={{ background: `color-mix(in srgb, ${pillarAccent(procStep)} 18%, transparent)` }}
              >
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: pillarAccent(procStep) }} aria-hidden />
              </div>
              <div className="space-y-2">
                <h2 className="text-[22px] font-semibold text-foreground">Processando o diagnóstico</h2>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={procStep}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="text-sm text-muted-foreground"
                  >
                    {PROCESSING_STEPS[procStep]}
                  </motion.p>
                </AnimatePresence>
              </div>
              <div className="mx-auto max-w-xs h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden>
                <motion.div
                  className="h-full rounded-full bg-primary"
                  animate={{ width: `${((procStep + 1) / PROCESSING_STEPS.length) * 100}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
            </motion.div>
          )}

          {/* Resultado */}
          {view === "result" && (
            <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <SectionCard tone="success" className="text-center">
                <div className="mx-auto h-14 w-14 rounded-full bg-status-green/15 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-status-green" aria-hidden />
                </div>
                <h2 className="text-[22px] font-semibold text-foreground mt-3">Diagnóstico pronto</h2>
                <p className="text-sm text-muted-foreground">
                  Maturidade geral <span className="font-semibold text-foreground tabular-nums">{total.toFixed(1)}/5</span> · {maturityLabel(total).label}
                </p>
              </SectionCard>

              <SectionCard className="space-y-4">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" aria-hidden />
                  <h3 className="text-[17px] font-semibold text-foreground">Radar da maturidade</h3>
                </div>
                <DiagnosticRadar scores={scores} label={resultLabel} />
              </SectionCard>

              <Button size="lg" className="w-full" onClick={() => { setView("map"); window.scrollTo({ top: 0 }); }}>
                Próxima etapa <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>

              <Button variant="outline" size="lg" className="w-full" onClick={() => setView("trail")}>
                <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar para a trilha
              </Button>
            </motion.div>
          )}

          {/* Mapa: estado atual x estado desejado */}
          {view === "map" && (
            <div key="map" className="animate-fade-in xl:mx-[calc(50%-47vw)]">
              <StateMap
                answers={answers}
                onChange={(k, v) => onChange(k, v)}
                onBack={() => { setView("result"); window.scrollTo({ top: 0 }); }}
                onNext={() => { onSaveStep?.(); setView("nextsteps"); window.scrollTo({ top: 0 }); }}
                accentFor={pillarAccent}
              />
            </div>
          )}

          {/* Próximos encontros */}
          {view === "nextsteps" && (
            <div key="nextsteps" className="animate-fade-in xl:mx-[calc(50%-47vw)]">
              <NextStepsTrail
                answers={answers}
                onBack={() => { setView("map"); window.scrollTo({ top: 0 }); }}
                onNext={() => { setView("gift"); window.scrollTo({ top: 0 }); }}
                accentFor={pillarAccent}
              />
            </div>
          )}

          {/* Presente */}
          {view === "gift" && (
            <div key="gift" className="animate-fade-in">
              <GiftReveal onBack={() => setView("nextsteps")} />
            </div>
          )}

        </AnimatePresence>
      </div>

      {/* Atalho fixo para a trilha */}
      <AnimatePresence>
        {(view === "question" || view === "stage") && (
          <motion.div
            key="trail-fab"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed left-1/2 -translate-x-1/2 z-40"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <Button variant="outline" size="sm" className="rounded-full shadow-ds-2 bg-card" onClick={() => setView("trail")}>
              <ArrowLeft className="h-3.5 w-3.5" style={{ color: accent }} aria-hidden />
              Ver trilha
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>

  );
};
