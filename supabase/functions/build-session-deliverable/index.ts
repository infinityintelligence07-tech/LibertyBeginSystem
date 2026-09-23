// Build a structured "strategic deliverable" JSON from a raw Zoom
// transcript/summary. This is the source for the infographic PDF the mentor
// sends to the student on WhatsApp.
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { requireRole, toResponse, STAFF_ROLES } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    // Exige mentor/admin/super_admin autenticado (o entregável é gerado pelo mentor).
    await requireRole(req, STAFF_ROLES);

    const {
      zoom_transcript,
      session_name,
      member_name,
      main_pain,
      member_tier,
      company_name,
    } = await req.json();

    if (!zoom_transcript || typeof zoom_transcript !== "string" || zoom_transcript.trim().length < 80) {
      return new Response(
        JSON.stringify({ error: "Cole o resumo completo do Zoom (mínimo ~80 caracteres)." }),
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

    const systemPrompt = `Você é um consultor estratégico do programa Liberty Begin. Sua tarefa é transformar o resumo bruto do Zoom de uma sessão de mentoria em um ENTREGÁVEL ESTRATÉGICO que será enviado ao aluno via WhatsApp em formato de PDF infográfico (3-4 páginas).

Referência de estilo: documento de consultoria denso, direto, com título forte, diagnóstico, pilares numerados, plano de ação em tabela, riscos e próximos passos. Nada de fofura, nada de jargão de IA, nada de "nesta sessão pudemos observar".

Português BR, tom Liberty Begin: direto, específico, executivo.

REGRAS RÍGIDAS:
- NÃO invente fatos. Se algo não está claro no resumo, não coloque.
- Use nomes reais que aparecem no resumo (empresa, pessoas, cidades, produtos).
- Cada campo tem limite claro — respeite.
- Se um campo não tem material suficiente no resumo, devolva string vazia ou array vazio. NUNCA "não se aplica" ou "a definir".

Campos:

strategic_title (obrigatório, 3-8 palavras): título estratégico do plano/projeto discutido. Ex: "Plano de Abertura de Loja Física", "Estruturação de Precificação", "Reposicionamento da Marca". NÃO use o nome literal da sessão do programa.

subtitle (1 frase, até 140 caracteres): contexto de negócio do aluno em uma linha. Ex: "Estruturação, cronograma e responsabilidades para abertura em Taquaritinga."

goal_label (2-3 palavras, maiúsculas serão aplicadas no PDF): rótulo do card de meta. Ex: "Meta operacional", "Meta financeira", "Foco da fase".

goal_title (3-6 palavras): a meta em si, curta e forte. Ex: "Abrir antes do rodeio", "Faturar 50k em 90 dias".

goal_description (1-3 frases): detalha a meta, prazo e o que precisa ser preservado. Se não houver meta clara, deixe string vazia (o card some).

tags (array, 2-4 itens, cada um 1 palavra em maiúsculas): tags rápidas do contexto. Ex: ["TAQUARITINGA", "MODA", "ABERTURA"].

diagnosis (parágrafo, 2-4 frases): o diagnóstico central da situação. O que está em jogo, o que precisa ser executado, qual o risco de não agir.

pillars (array de 3 a 4 objetos): os pilares do plano. Cada um: { "number": "01"|"02"|"03"|"04", "title": "Nome curto (2-4 palavras)", "description": "1 frase objetiva do que esse pilar cobre" }.

action_plan (array de 3 a 6 objetos): plano de ação em tabela. Cada um: { "sector": "Setor/Área", "deliverable": "Entrega principal, 1 linha", "deadline": "Prazo específico ou 'semanal'" }. Se o resumo não tem material pra montar, devolva array vazio.

risks (array de 2 a 5 objetos): riscos críticos com o controle. Cada um: { "title": "Risco em 3-5 palavras", "control": "Ação de controle, 1 frase" }. Se não houver risco identificável, devolva array vazio.

next_steps (array de 3 a 5 strings): próximas ações prioritárias, cada uma começa com verbo no infinitivo e é curta (até 120 caracteres). Se nada claro, array vazio.`;


    const userPrompt = `Aluno: ${member_name || "(sem nome)"}${company_name ? ` — empresa: ${company_name}` : ""}\nTier: ${member_tier || "begin"}\nSessão do programa: ${session_name || "(sem nome)"}\nDor principal do aluno (do perfil): ${main_pain || "(não informada)"}\n\nRESUMO/TRANSCRIÇÃO BRUTA DO ZOOM:\n${zoom_transcript.trim()}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "build_deliverable",
              description: "Monta o entregável estratégico infográfico do aluno.",
              parameters: {
                type: "object",
                properties: {
                  strategic_title: { type: "string" },
                  subtitle: { type: "string" },
                  goal_label: { type: "string" },
                  goal_title: { type: "string" },
                  goal_description: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                  diagnosis: { type: "string" },
                  pillars: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        number: { type: "string" },
                        title: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["number", "title", "description"],
                      additionalProperties: false,
                    },
                  },
                  action_plan: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        sector: { type: "string" },
                        deliverable: { type: "string" },
                        deadline: { type: "string" },
                      },
                      required: ["sector", "deliverable", "deadline"],
                      additionalProperties: false,
                    },
                  },
                  risks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        control: { type: "string" },
                      },
                      required: ["title", "control"],
                      additionalProperties: false,
                    },
                  },
                  next_steps: { type: "array", items: { type: "string" } },
                },
                required: [
                  "strategic_title",
                  "subtitle",
                  "goal_label",
                  "goal_title",
                  "goal_description",
                  "tags",
                  "diagnosis",
                  "pillars",
                  "action_plan",
                  "risks",
                  "next_steps",
                ],
                additionalProperties: false,

              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "build_deliverable" } },
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
        JSON.stringify({ error: "Sem créditos de IA. Adicione créditos na conta." }),
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

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return toResponse(e);
  }
});
