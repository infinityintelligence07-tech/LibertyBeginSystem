// Organize a Zoom transcript/summary into a structured mentoring report
// using Lovable AI Gateway. Returns: summary, delivered, next_steps,
// ai_insights, suggested_tasks[].
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { requireRole, toResponse, STAFF_ROLES } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    // Exige mentor/admin/super_admin autenticado.
    await requireRole(req, STAFF_ROLES);

    const { transcript, session_name, liberty_name, main_pain } = await req.json();

    if (!transcript || typeof transcript !== "string" || transcript.trim().length < 30) {
      return new Response(
        JSON.stringify({ error: "Transcrição muito curta. Cole o resumo completo do Zoom." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você receberá a transcrição, recapitulação ou resumo automático de uma sessão de mentoria realizada pelo Zoom. Sua tarefa é transformar esse conteúdo em um registro curto, claro e estratégico para que o próximo mentor consiga entender rapidamente:
1. O contexto da empresa ou da pessoa atendida.
2. O que realmente foi trabalhado durante a sessão.
3. As decisões, definições e direcionamentos construídos.
4. O que ainda precisa ser desenvolvido nas próximas sessões.

Preencha obrigatoriamente estes campos:

"summary" (Resumo): um parágrafo curto com o foco central da sessão e o principal desafio da empresa ou do mentorado. Deve mostrar a profundidade da conversa, incluindo questões de posicionamento, estratégia, percepção, história, negócio, público, comunicação, decisões ou conflitos identificados. Não faça parecer que a sessão foi apenas sobre design, identidade visual, cores, logo ou redes sociais, mesmo que esses assuntos tenham sido abordados.

"delivered" (O que foi entregue): explique de forma objetiva quais construções, definições, diagnósticos e direcionamentos foram realizados durante a sessão. Considere como entregas, quando presentes: clareza de posicionamento; diagnóstico da percepção atual da marca; definição ou aprofundamento da história; promessa de marca; pilares e diferenciais; perfil de cliente ideal; direção profissional ou empresarial; arquétipos e personalidade; organização de produtos e serviços; definição de prioridades; identificação de problemas ou oportunidades; direcionamentos de comunicação; direção visual e sensorial. Não trate apenas materiais visuais como entregas — destaque principalmente o raciocínio estratégico, as decisões tomadas e a clareza gerada.

"next_steps" (Próximos passos): em texto corrido ou poucos parágrafos, as ações mais importantes que o mentorado deve executar e os assuntos a aprofundar nas próximas sessões. Priorize ações concretas: decisões, planejamentos, organização, validação, implementação, produção de materiais, ajustes de posicionamento, alinhamento de equipe ou estruturação comercial.

"ai_alert": 1 alerta objetivo (2-3 frases) sobre risco, bloqueio, engajamento ou ponto cego do mentorado. Se não houver, escreva "Sem alertas relevantes nesta sessão.".

"ai_strategy": 1 sugestão estratégica (2-3 frases) acionável para o mentor entre uma sessão e outra.

"suggested_tasks": todas as tarefas concretas e acionáveis que apareceram na conversa para o mentorado executar até a próxima sessão. Cada uma começa com verbo no infinitivo, curta e específica (até 110 caracteres), sem numeração ou bullets. DEDUPLIQUE ações repetidas. Não repita o que já está em "delivered". Se não houver tarefa explícita, devolva array vazio — nunca invente.

Regras importantes:
- Use os nomes corretos das pessoas e da empresa apresentados no conteúdo.
- Não chame o mentor de "Contato", "Legacy", "Liberty" ou outro nome genérico quando o nome real estiver disponível.
- Não invente informações.
- Corrija apenas erros evidentes de transcrição de nomes, quando o nome correto for identificável pelo contexto.
- Elimine repetições, conversas informais, problemas técnicos e assuntos irrelevantes.
- Não registre como decisão algo que foi apenas uma sugestão.
- Diferencie claramente o que já foi definido do que ainda precisa ser feito.
- Texto curto, sem perder profundidade. Linguagem profissional, simples e de fácil entendimento.
- Evite linguagem genérica, exagerada ou com tom de propaganda.
- O texto deve servir como passagem de bastão para outro mentor continuar o acompanhamento sem assistir à sessão completa.
- Cada bloco deve ter, preferencialmente, entre 1 e 3 parágrafos curtos. Sem bullets dentro dos campos de texto.
- Não inclua introduções ou explicações antes da resposta.

Antes de responder, analise silenciosamente: qual era o verdadeiro problema discutido? Que clareza a sessão gerou? Quais decisões foram tomadas? O que foi apenas explorado, mas não definido? O que o próximo mentor precisa saber para não começar do zero?`;


    const userPrompt = `Sessão: ${session_name || "(sem nome)"}\nAluno: ${liberty_name || "(sem nome)"}\nDor principal do aluno: ${main_pain || "(não informada)"}\n\nResumo / transcrição do Zoom (bruto, pode estar desorganizado):\n${transcript.trim()}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "build_report",
              description: "Estrutura o relatório da sessão de mentoria.",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  delivered: { type: "string" },
                  next_steps: { type: "string" },
                  ai_alert: { type: "string" },
                  ai_strategy: { type: "string" },
                  suggested_tasks: {
                    type: "array",
                    description: "Todas as tarefas únicas e acionáveis identificadas na conversa, já deduplicadas.",
                    items: { type: "string" },
                  },
                },
                required: ["summary", "delivered", "next_steps", "ai_alert", "ai_strategy", "suggested_tasks"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "build_report" } },
      }),
    });

    if (response.status === 429) {
      return new Response(
        JSON.stringify({ error: "Muitas requisições. Tente novamente em alguns segundos." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (response.status === 402) {
      return new Response(
        JSON.stringify({ error: "Sem créditos de IA. Adicione créditos em Settings → Workspace → Usage." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!response.ok) {
      const txt = await response.text();
      console.error("AI gateway error", response.status, txt);
      return new Response(JSON.stringify({ error: "Falha ao chamar IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      return new Response(JSON.stringify({ error: "Resposta da IA sem estrutura esperada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(call.function.arguments);
    } catch (_e) {
      return new Response(JSON.stringify({ error: "JSON inválido vindo da IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Backwards-compat: also include combined ai_insights text.
    const alert = (parsed.ai_alert || "").trim();
    const strategy = (parsed.ai_strategy || "").trim();
    parsed.ai_insights = [alert && `⚠ Alerta\n${alert}`, strategy && `✦ Sugestão estratégica\n${strategy}`]
      .filter(Boolean)
      .join("\n\n");

    // Safety-net dedupe of suggested tasks (the model already deduplicates, but
    // we normalize whitespace + collapse near-duplicates just in case).
    if (Array.isArray(parsed.suggested_tasks)) {
      const seen = new Set<string>();
      parsed.suggested_tasks = parsed.suggested_tasks
        .map((t: unknown) => String(t || "").replace(/\s+/g, " ").trim())
        .filter((t: string) => {
          if (!t) return false;
          const key = t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return toResponse(e);
  }
});
