import { useState, type ReactNode } from "react";
import { Loader2, Wand2, Download, Copy, ClipboardPaste, AlertCircle, Plus, X, CheckCircle2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BottomSheet, Callout, IconButton, SectionCard, TextAreaField, TextField } from "@/components/ds";
import {
  downloadSessionDeliverablePdf,
  type SessionDeliverableData,
  type DeliverablePillar,
  type DeliverableActionRow,
  type DeliverableRisk,
} from "@/lib/sessionDeliverablePdf";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  memberName: string;
  mentorName: string;
  sessionName?: string;
  sessionContext?: string;
  mainPain?: string;
  companyName?: string;
  memberTier?: string;
}

const REFINE_PROMPT = (json: string) => `Você é consultor estratégico Liberty Begin. Anexei o PDF do "Entregável Estratégico" que já foi gerado — abra-o para ver a identidade visual, tom e estrutura. Abaixo está o CONTEÚDO desse mesmo PDF em JSON.

REGRAS OBRIGATÓRIAS (não podem ser quebradas):
- NÃO gere PDF, imagem, HTML ou layout. SÓ devolva JSON.
- NÃO invente, renomeie ou reordene campos. Devolva EXATAMENTE o mesmo esquema, com as mesmas chaves.
- Português BR, tom Liberty Begin: direto, executivo, sem jargão de IA, sem "nesta sessão pudemos observar".
- Máx 4 pilares. Máx 6 linhas de plano de ação. Máx 5 riscos. Máx 5 próximos passos.
- Cada string curta e específica. Verbo no infinitivo nas ações.
- Campo vazio = "" ou []. NUNCA escreva "não se aplica" ou "a definir".
- Devolva SOMENTE o JSON, começando com { e terminando com }. Nada antes, nada depois, sem \`\`\`.

JSON atual:
${json}

Pedido de ajuste do mentor:
[escreva aqui o que quer melhorar — ex: "deixe o diagnóstico mais forte", "reescreva os pilares focando marketing", "adicione um risco sobre capital de giro"]`;

export const SessionDeliverableDialog = ({
  open,
  onOpenChange,
  memberName,
  mentorName,
  sessionName,
  sessionContext,
  mainPain,
  companyName,
  memberTier,
}: Props) => {
  const [zoom, setZoom] = useState("");
  const [generating, setGenerating] = useState(false);
  const [data, setData] = useState<SessionDeliverableData | null>(null);
  const [downloading, setDownloading] = useState(false);

  const reset = () => {
    setZoom("");
    setData(null);
  };

  const generate = async () => {
    if (zoom.trim().length < 80) {
      toast.error("Cole um resumo do Zoom com mais conteúdo (mínimo ~80 caracteres).");
      return;
    }
    setGenerating(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke("build-session-deliverable", {
        body: {
          zoom_transcript: zoom.trim(),
          session_name: sessionName,
          member_name: memberName,
          main_pain: mainPain,
          member_tier: memberTier,
          company_name: companyName,
        },
      });
      if (error) throw error;
      if ((resp as any)?.error) throw new Error((resp as any).error);
      setData({
        strategic_title: sessionName || resp.strategic_title || "Material da sessão",
        subtitle: resp.subtitle || "",
        goal_label: resp.goal_label || "Meta",
        goal_title: resp.goal_title || "",
        goal_description: resp.goal_description || "",
        tags: Array.isArray(resp.tags) ? resp.tags : [],
        diagnosis: resp.diagnosis || "",
        pillars: Array.isArray(resp.pillars) ? resp.pillars : [],
        action_plan: Array.isArray(resp.action_plan) ? resp.action_plan : [],
        risks: Array.isArray(resp.risks) ? resp.risks : [],
        next_steps: Array.isArray(resp.next_steps) ? resp.next_steps : [],
        suggested_tasks: [],
        member_name: memberName,
        mentor_name: mentorName,
        session_context: sessionContext,
      });
      toast.success("Rascunho gerado. Revise e ajuste antes de baixar.");

    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar o material");
    } finally {
      setGenerating(false);
    }
  };

  const download = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await downloadSessionDeliverablePdf(data);
      toast.success("PDF baixado. Envie no WhatsApp do aluno.");
    } catch (e: any) {
      toast.error("Erro ao gerar PDF: " + (e?.message || ""));
    } finally {
      setDownloading(false);
    }
  };

  const copyRefinePrompt = async () => {
    if (!data) return;
    const {
      strategic_title, subtitle, goal_label, goal_title, goal_description,
      tags, diagnosis, pillars, action_plan, risks, next_steps, suggested_tasks,
    } = data;
    const jsonOnly = {
      strategic_title, subtitle, goal_label, goal_title, goal_description,
      tags, diagnosis, pillars, action_plan, risks, next_steps, suggested_tasks,
    };
    try {
      await navigator.clipboard.writeText(REFINE_PROMPT(JSON.stringify(jsonOnly, null, 2)));
      toast.success("Prompt copiado. Cole no ChatGPT e anexe o PDF baixado.");
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.");
    }
  };

  const pasteRefined = async () => {
    if (!data) return;
    try {
      const raw = await navigator.clipboard.readText();
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("Nenhum JSON encontrado no clipboard");
      const parsed = JSON.parse(raw.slice(start, end + 1));
      // Only replace known content fields, preserve header metadata
      setData({
        ...data,
        strategic_title: parsed.strategic_title ?? data.strategic_title,
        subtitle: parsed.subtitle ?? data.subtitle,
        goal_label: parsed.goal_label ?? data.goal_label,
        goal_title: parsed.goal_title ?? data.goal_title,
        goal_description: parsed.goal_description ?? data.goal_description,
        tags: Array.isArray(parsed.tags) ? parsed.tags : data.tags,
        diagnosis: parsed.diagnosis ?? data.diagnosis,
        pillars: Array.isArray(parsed.pillars) ? parsed.pillars : data.pillars,
        action_plan: Array.isArray(parsed.action_plan) ? parsed.action_plan : data.action_plan,
        risks: Array.isArray(parsed.risks) ? parsed.risks : data.risks,
        next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps : data.next_steps,
        suggested_tasks: Array.isArray(parsed.suggested_tasks) ? parsed.suggested_tasks : data.suggested_tasks,
      });
      toast.success("Conteúdo refinado aplicado.");
    } catch (e: any) {
      toast.error("JSON inválido: " + (e?.message || ""));
    }
  };

  const patch = <K extends keyof SessionDeliverableData>(k: K, v: SessionDeliverableData[K]) => {
    if (!data) return;
    setData({ ...data, [k]: v });
  };

  const footer = !data ? (
    <Button onClick={generate} disabled={generating || zoom.trim().length < 80} className="w-full sm:w-auto">
      {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
      {generating ? "Gerando material..." : "Gerar rascunho"}
    </Button>
  ) : (
    <>
      <div className="flex flex-wrap gap-2 sm:mr-auto">
        <Button variant="outline" size="sm" onClick={copyRefinePrompt}>
          <Copy className="h-3.5 w-3.5" /> Copiar prompt de refinamento
        </Button>
        <Button variant="outline" size="sm" onClick={pasteRefined}>
          <ClipboardPaste className="h-3.5 w-3.5" /> Colar JSON refinado
        </Button>
        <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground">
          Recomeçar
        </Button>
      </div>
      <Button onClick={download} disabled={downloading}>
        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Baixar PDF
      </Button>
    </>
  );

  return (
    <BottomSheet
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title={sessionName ? `Material da sessão · ${sessionName}` : "Material da sessão do aluno"}
      size="lg"
      className="sm:max-w-4xl"
      locked={generating || downloading}
      footer={footer}
    >
        {!data ? (
          <div className="space-y-4">
            <Callout tone="info" icon={Info} title="Cole o resumo ou a transcrição bruta do Zoom">
              Use o material completo (o resumo do Zoom é mais detalhado que o do relatório).
              A IA vai transformar isso num infográfico horizontal de 3 páginas no estilo Begin
              para você enviar no WhatsApp do aluno.
            </Callout>

            <TextAreaField
              label="Resumo do Zoom"
              hint="Mínimo de 80 caracteres."
              value={zoom}
              onChange={(e) => setZoom(e.target.value)}
              placeholder="Cole aqui todo o resumo/transcrição gerado pela IA do Zoom..."
              className="resize-none h-64"
            />
          </div>
        ) : (
          <div className="space-y-5">
            <Callout tone="success" icon={CheckCircle2}>
              Rascunho pronto. Edite cada bloco abaixo, baixe o PDF, e se quiser refinar no ChatGPT use o botão <b>Copiar prompt de refinamento</b>.
            </Callout>

            <Group label="Capa">
              <TextField label="Título da capa" hint="Padrão: nome da sessão" value={data.strategic_title} onChange={(e) => patch("strategic_title", e.target.value)} />
              <TextAreaField label="Subtítulo" hint="Contexto de negócio do aluno" rows={2} value={data.subtitle} onChange={(e) => patch("subtitle", e.target.value)} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField label="Rótulo da meta" value={data.goal_label} onChange={(e) => patch("goal_label", e.target.value)} />
                <TextField label="Título da meta" value={data.goal_title} onChange={(e) => patch("goal_title", e.target.value)} />
              </div>
              <TextAreaField label="Descrição da meta" rows={2} value={data.goal_description} onChange={(e) => patch("goal_description", e.target.value)} />
              <TextField
                label="Tags"
                hint="Separadas por vírgula"
                value={data.tags.join(", ")}
                onChange={(e) => patch("tags", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              />
            </Group>

            <Group label="Diagnóstico">
              <TextAreaField aria-label="Diagnóstico" rows={4} value={data.diagnosis} onChange={(e) => patch("diagnosis", e.target.value)} />
            </Group>

            <Group label="Pilares" onAdd={data.pillars.length < 4 ? () => patch("pillars", [...data.pillars, { number: String(data.pillars.length + 1).padStart(2, "0"), title: "", description: "" }]) : undefined}>
              <div className="space-y-2">
                {data.pillars.map((p, i) => (
                  <EditableRow key={i} label={`Remover pilar ${i + 1}`} onRemove={() => patch("pillars", data.pillars.filter((_, j) => j !== i))}>
                    <TextField aria-label="Número do pilar" containerClassName="w-16 shrink-0" placeholder="01" value={p.number} onChange={(e) => updateArr<DeliverablePillar>(data.pillars, i, { number: e.target.value }, (v) => patch("pillars", v))} />
                    <TextField aria-label="Título do pilar" containerClassName="flex-1 min-w-[140px]" placeholder="Título" value={p.title} onChange={(e) => updateArr(data.pillars, i, { title: e.target.value }, (v) => patch("pillars", v))} />
                    <TextField aria-label="Descrição do pilar" containerClassName="flex-[2] min-w-[180px]" placeholder="Descrição" value={p.description} onChange={(e) => updateArr(data.pillars, i, { description: e.target.value }, (v) => patch("pillars", v))} />
                  </EditableRow>
                ))}
                {!data.pillars.length && <EmptyHint text="Nenhum pilar. Use Adicionar para incluir." />}
              </div>
            </Group>

            <Group label="Plano de ação" onAdd={data.action_plan.length < 8 ? () => patch("action_plan", [...data.action_plan, { sector: "", deliverable: "", deadline: "" }]) : undefined}>
              <div className="space-y-2">
                {data.action_plan.map((r, i) => (
                  <EditableRow key={i} label={`Remover linha ${i + 1} do plano`} onRemove={() => patch("action_plan", data.action_plan.filter((_, j) => j !== i))}>
                    <TextField aria-label="Setor" containerClassName="flex-1 min-w-[120px]" placeholder="Setor" value={r.sector} onChange={(e) => updateArr<DeliverableActionRow>(data.action_plan, i, { sector: e.target.value }, (v) => patch("action_plan", v))} />
                    <TextField aria-label="Entrega" containerClassName="flex-[2] min-w-[180px]" placeholder="Entrega" value={r.deliverable} onChange={(e) => updateArr(data.action_plan, i, { deliverable: e.target.value }, (v) => patch("action_plan", v))} />
                    <TextField aria-label="Prazo" containerClassName="w-32 shrink-0" placeholder="Prazo" value={r.deadline} onChange={(e) => updateArr(data.action_plan, i, { deadline: e.target.value }, (v) => patch("action_plan", v))} />
                  </EditableRow>
                ))}
                {!data.action_plan.length && <EmptyHint text="Sem itens de plano de ação." />}
              </div>
            </Group>

            <Group label="Riscos críticos" onAdd={data.risks.length < 5 ? () => patch("risks", [...data.risks, { title: "", control: "" }]) : undefined}>
              <div className="space-y-2">
                {data.risks.map((r, i) => (
                  <EditableRow key={i} label={`Remover risco ${i + 1}`} onRemove={() => patch("risks", data.risks.filter((_, j) => j !== i))}>
                    <TextField aria-label="Risco" containerClassName="flex-1 min-w-[140px]" placeholder="Risco" value={r.title} onChange={(e) => updateArr<DeliverableRisk>(data.risks, i, { title: e.target.value }, (v) => patch("risks", v))} />
                    <TextField aria-label="Controle ou mitigação" containerClassName="flex-[2] min-w-[180px]" placeholder="Controle / mitigação" value={r.control} onChange={(e) => updateArr(data.risks, i, { control: e.target.value }, (v) => patch("risks", v))} />
                  </EditableRow>
                ))}
                {!data.risks.length && <EmptyHint text="Nenhum risco cadastrado." />}
              </div>
            </Group>

            <Group label="Próximos passos" onAdd={data.next_steps.length < 6 ? () => patch("next_steps", [...data.next_steps, ""]) : undefined}>
              <StringList arr={data.next_steps} setArr={(v) => patch("next_steps", v)} placeholder="Próxima ação..." />
            </Group>

            <details className="rounded-ds border border-border bg-muted/30 p-3">
              <summary className="text-sm font-medium text-foreground cursor-pointer flex items-center gap-1.5 min-h-[28px]">
                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Como refinar no ChatGPT sem quebrar o visual
              </summary>
              <ol className="text-xs text-muted-foreground mt-2 space-y-1 list-decimal ml-4 leading-relaxed">
                <li>Baixe o PDF uma primeira vez.</li>
                <li>Clique em <b>Copiar prompt de refinamento</b>.</li>
                <li>No ChatGPT/Claude, anexe o PDF baixado e cole o prompt. Descreva o ajuste desejado.</li>
                <li>Copie o JSON que a IA devolver.</li>
                <li>Volte aqui, clique em <b>Colar JSON refinado</b> e baixe a versão final.</li>
              </ol>
            </details>
          </div>
        )}
    </BottomSheet>
  );
};

const Group = ({ label, children, onAdd }: { label: string; children: ReactNode; onAdd?: () => void }) => (
  <SectionCard padding="compact" className="space-y-3">
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      {onAdd && (
        <Button variant="ghost" size="sm" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </Button>
      )}
    </div>
    {children}
  </SectionCard>
);

const EditableRow = ({ children, onRemove, label }: { children: ReactNode; onRemove: () => void; label: string }) => (
  <div className="flex flex-wrap items-center gap-2">
    {children}
    <IconButton aria-label={label} size="sm" onClick={onRemove} className="hover:text-destructive">
      <X className="h-4 w-4" />
    </IconButton>
  </div>
);

const EmptyHint = ({ text }: { text: string }) => (
  <p className="text-xs text-muted-foreground">{text}</p>
);

const StringList = ({ arr, setArr, placeholder }: { arr: string[]; setArr: (v: string[]) => void; placeholder: string }) => (
  <div className="space-y-2">
    {arr.map((s, i) => (
      <EditableRow key={i} label={`Remover passo ${i + 1}`} onRemove={() => setArr(arr.filter((_, j) => j !== i))}>
        <TextField aria-label={`Passo ${i + 1}`} containerClassName="flex-1" placeholder={placeholder} value={s} onChange={(e) => {
          const c = arr.slice(); c[i] = e.target.value; setArr(c);
        }} />
      </EditableRow>
    ))}
    {!arr.length && <EmptyHint text="Vazio." />}
  </div>
);

function updateArr<T>(arr: T[], index: number, patch: Partial<T>, apply: (v: T[]) => void) {
  const copy = arr.slice();
  copy[index] = { ...copy[index], ...patch };
  apply(copy);
}
