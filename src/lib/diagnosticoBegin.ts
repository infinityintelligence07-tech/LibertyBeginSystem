/**
 * Definição da ferramenta "Diagnóstico Begin" (sessão de mapeamento / kickoff).
 * As perguntas seguem exatamente o material oficial do programa.
 *
 * Escala: A = 1 ... E = 5. O score de cada pilar é a média das perguntas de escala.
 */

export type ScaleOption = { key: "A" | "B" | "C" | "D" | "E"; label: string };

export type TextFormat = "currency" | "percent" | "number";

export type ToolQuestion =
  | { id: string; type: "text"; title: string; placeholder?: string; format?: TextFormat; allowUnknown?: boolean }
  | { id: string; type: "scale"; title: string; options: ScaleOption[] };

export interface ToolPillar {
  id: string;
  name: string;
  short: string;
  description: string;
  questions: ToolQuestion[];
}

const opts = (...labels: string[]): ScaleOption[] =>
  (["A", "B", "C", "D", "E"] as const).map((key, i) => ({ key, label: labels[i] }));

export const DIAGNOSTICO_BEGIN_SLUG = "diagnostico-begin";

export const LEGACY_GESTAO_VISAO_QUESTION: ToolQuestion = {
  id: "gestao_visao",
  type: "text",
  title: "Ao final do programa Liberty Begin (6 meses), qual meta você quer ter realizado no seu negócio?",
  placeholder: "Ex.: dobrar o faturamento, estruturar o time, sair da operação...",
};

export const DIAGNOSTICO_BEGIN_PILLARS: ToolPillar[] = [
  {
    id: "gestao",
    name: "Gestão e Estratégia",
    short: "Gestão",
    description: "Contexto da empresa, clareza do modelo de negócio e tomada de decisão.",
    questions: [
      {
        id: "gestao_contexto_cnpj",
        type: "text",
        title: "Tem CNPJ? Quanto tempo de empresa?",
        placeholder: "Ex.: CNPJ ativo desde 2019 (6 anos de operação)...",
      },
      {
        id: "gestao_contexto_time",
        type: "text",
        title: "Quantos colaboradores tem na empresa? Desses, quantos são líderes?",
        placeholder: "Ex.: 14 colaboradores, sendo 3 líderes de área...",
      },
      {
        id: "gestao_modelo",
        type: "scale",
        title: "Qual é o nível de clareza sobre o modelo de negócio da empresa?",
        options: opts(
          "A empresa não possui clareza sobre como gera e captura valor.",
          "O modelo de negócio é conhecido apenas pelos proprietários.",
          "As principais fontes de receita e públicos são conhecidos, mas sem análise aprofundada.",
          "A empresa conhece segmentos, proposta de valor, canais, receitas, custos e recursos essenciais.",
          "O modelo de negócio é revisado e adaptado conforme mudanças de mercado e oportunidades.",
        ),
      },
      {
        id: "gestao_decisao",
        type: "scale",
        title: "Como funciona a tomada de decisão dentro da empresa?",
        options: opts(
          "Praticamente todas as decisões dependem do proprietário.",
          "Algumas pessoas decidem, mas não existem critérios ou limites claros.",
          "Existem responsáveis, porém muitas decisões ainda retornam aos sócios.",
          "Cada líder possui autonomia e limites de decisão bem definidos.",
          "As decisões são descentralizadas, orientadas por indicadores e alinhadas à estratégia.",
        ),
      },
    ],
  },
  {
    id: "lideranca",
    name: "Liderança e Cultura",
    short: "Liderança e Cultura",
    description: "Prioridades, acompanhamento do time, valores e autonomia da cultura.",
    questions: [
      {
        id: "lid_prioridades",
        type: "scale",
        title: "Como as prioridades da empresa são definidas e comunicadas ao time?",
        options: opts(
          "Não existem prioridades claras. Cada pessoa trabalha no que considera mais urgente.",
          "Os líderes sabem o que precisa ser feito, mas isso não é comunicado de maneira organizada.",
          "Algumas prioridades são comunicadas, porém mudam frequentemente ou não são acompanhadas.",
          "As prioridades são claras, comunicadas e acompanhadas pelos líderes.",
          "As prioridades são claras, mensuráveis e conectadas à estratégia e à rotina de cada área.",
        ),
      },
      {
        id: "lid_desempenho",
        type: "scale",
        title: "Como os líderes acompanham o desempenho de suas equipes?",
        options: opts(
          "Não existe acompanhamento estruturado.",
          "O acompanhamento acontece apenas quando surge algum problema.",
          "Existem reuniões ou conversas, mas sem frequência e indicadores consistentes.",
          "Existem reuniões periódicas, metas, indicadores e planos de ação.",
          "Além do acompanhamento estruturado, os líderes desenvolvem novos líderes e antecipam problemas.",
        ),
      },
      {
        id: "lid_valores",
        type: "scale",
        title: "Como os valores e comportamentos esperados são vividos na empresa?",
        options: opts(
          "A empresa não possui valores definidos.",
          "Existem valores, mas são apenas frases institucionais.",
          "Os valores são conhecidos, porém nem sempre orientam decisões e comportamentos.",
          "Os valores orientam contratações, decisões, reconhecimentos e desligamentos.",
          "Os valores são vividos, medidos e fortalecidos pelos líderes em todas as áreas.",
        ),
      },
      {
        id: "lid_combinados",
        type: "scale",
        title: "Como a liderança reage quando alguém não cumpre o que foi combinado?",
        options: opts(
          "Normalmente nada acontece ou o problema é ignorado.",
          "A liderança cobra apenas quando a situação se torna grave.",
          "Existem cobranças, mas sem critérios, consequências ou acompanhamento.",
          "O problema é tratado com clareza, feedback, plano de correção e prazo.",
          "Existe uma cultura de autorresponsabilidade, consequência e aprendizado contínuo.",
        ),
      },
      {
        id: "lid_ausencia",
        type: "scale",
        title: "O que aconteceria se os principais líderes se afastassem da operação durante 30 dias? (Se não há líderes, e se você se afastasse da operação?)",
        options: opts(
          "A operação provavelmente pararia.",
          "A operação continuaria parcialmente, mas com muitos problemas e decisões acumuladas.",
          "A operação continuaria, porém algumas áreas dependeriam de contato direto.",
          "A operação seguiria com o time atual e processos definidos.",
          "A operação continuaria normalmente, acompanhando indicadores e tomando decisões.",
        ),
      },
      {
        id: "lid_resultado_cultura",
        type: "scale",
        title:
          "O que acontece quando uma pessoa entrega bons resultados, mas possui comportamentos contrários à cultura?",
        options: opts(
          "O comportamento é tolerado porque a pessoa entrega resultados.",
          "A liderança conversa informalmente, mas normalmente não aplica consequências.",
          "Existem cobranças, porém a decisão varia conforme a importância da pessoa.",
          "O comportamento é tratado com feedback, plano de mudança e consequências claras.",
          "A empresa não mantém pessoas que entregam resultados destruindo a cultura.",
        ),
      },
      {
        id: "lid_fundadores",
        type: "scale",
        title: "Quanto a cultura depende da presença dos fundadores?",
        options: opts(
          "Sem os fundadores, os comportamentos e padrões se perdem rapidamente.",
          "Alguns colaboradores mantêm a cultura, mas a maioria depende da cobrança dos sócios.",
          "A cultura está presente em algumas equipes, porém varia conforme a liderança.",
          "Os líderes sustentam e replicam a cultura mesmo sem os fundadores.",
          "A cultura está incorporada aos processos, decisões e comportamentos de toda a organização.",
        ),
      },
    ],
  },
  {
    id: "financeiro",
    name: "Financeiro",
    short: "Financeiro",
    description: "Separação PJ/PF, organização, projeção de caixa, preços e planejamento.",
    questions: [
      {
        id: "gestao_faturamento",
        type: "text",
        title: "Qual seu faturamento médio mensal?",
        format: "currency",
        placeholder: "0,00",
      },
      {
        id: "fin_separacao",
        type: "scale",
        title: "Como é realizada a separação entre o dinheiro da empresa e o dinheiro dos sócios?",
        options: opts(
          "Não existe separação.",
          "Existe uma conta empresarial, mas os pagamentos ainda são misturados.",
          "A separação existe, porém retiradas e despesas pessoais ainda acontecem sem planejamento.",
          "Existe separação completa, pró-labore e regras para distribuição de lucros.",
          "Além da separação, existe planejamento patrimonial e financeiro dos sócios e da empresa.",
        ),
      },
      {
        id: "fin_organizacao",
        type: "scale",
        title: "Qual é o nível de organização das informações financeiras?",
        options: opts(
          "A empresa não possui números confiáveis e atualizados.",
          "Controla entradas e saídas de maneira básica ou manual.",
          "Possui sistema ou planilha, mas com informações incompletas ou atrasadas.",
          "Possui fluxo de caixa, contas a pagar, contas a receber e relatórios atualizados.",
          "As informações estão integradas, são confiáveis e orientam decisões estratégicas.",
        ),
      },
      {
        id: "fin_margem_lucro",
        type: "text",
        title: "Qual é a margem de lucro atual, antes dos pagamentos de: Empréstimos, financiamentos, e investimentos?",
        format: "percent",
        allowUnknown: true,
        placeholder: "0,0",
      },
      {
        id: "fin_projecao",
        type: "scale",
        title: "Como a empresa realiza a projeção de caixa?",
        options: opts(
          "Não existe projeção de caixa.",
          "A empresa observa apenas o saldo bancário atual.",
          "Existe uma previsão básica de entradas e despesas.",
          "Existe projeção semanal e mensal, com diferentes cenários.",
          "A empresa antecipa necessidades de caixa, riscos e oportunidades com base em projeções.",
        ),
      },
      {
        id: "fin_precos",
        type: "scale",
        title: "Como os preços são definidos?",
        options: opts(
          "Pelo preço da concorrência ou pela percepção do proprietário.",
          "Com base no custo direto, sem considerar todas as despesas e margens.",
          "Considerando custos e mercado, mas sem revisão frequente.",
          "Considerando custos, impostos, margem, posicionamento e valor percebido.",
          "Os preços são testados, segmentados e revisados conforme rentabilidade e estratégia.",
        ),
      },
      {
        id: "fin_planejamento",
        type: "scale",
        title: "Como é realizado o planejamento financeiro?",
        options: opts(
          "Não existe orçamento ou planejamento.",
          "O planejamento acontece conforme as necessidades do mês.",
          "Existe uma previsão anual ou mensal, mas ela não é acompanhada regularmente.",
          "Existe orçamento, metas e comparação entre realizado e planejado.",
          "O planejamento financeiro está conectado à estratégia e considera diferentes cenários.",
        ),
      },
      {
        id: "fin_decisoes",
        type: "scale",
        title: "Como os números financeiros são utilizados nas decisões?",
        options: opts(
          "As decisões são tomadas principalmente por intuição.",
          "Os números são consultados apenas em decisões maiores.",
          "Alguns relatórios são utilizados, mas sem uma rotina definida.",
          "As principais decisões são baseadas em indicadores financeiros.",
          "A empresa utiliza dados financeiros para prever resultados, riscos, investimentos e capacidade de crescimento.",
        ),
      },
    ],
  },
  {
    id: "marketing",
    name: "Marketing & Branding",
    short: "Marketing",
    description: "Cliente ideal, posicionamento, conteúdo, mídia e mensuração.",
    questions: [
      {
        id: "mkt_cliente",
        type: "scale",
        title: "Qual é o nível de clareza sobre o cliente ideal?",
        options: opts(
          "A empresa acredita que pode vender para qualquer pessoa.",
          "Possui uma visão geral do público, baseada em experiência.",
          "Conhece algumas características, dores e necessidades dos clientes.",
          "Possui perfil de cliente ideal definido e utilizado no marketing e nas vendas.",
          "O perfil é atualizado com dados e segmentado por comportamento, necessidade e valor.",
        ),
      },
      {
        id: "mkt_posicionamento",
        type: "scale",
        title: "Como está definido o posicionamento da marca?",
        options: opts(
          "Não possui posicionamento claro.",
          "Posicionamento por preço e qualidade.",
          "Posicionamento por preço baixo.",
          "Posicionamento por custo-benefício.",
          "Posicionamento por diferenciação.",
        ),
      },
      {
        id: "mkt_consistencia",
        type: "scale",
        title: "Qual é o nível de consistência da marca?",
        options: opts(
          "Cada material possui um estilo, linguagem ou mensagem diferente.",
          "Existe uma identidade visual básica, mas sem padrão de aplicação.",
          "A comunicação possui alguma consistência, porém muda entre canais e pessoas.",
          "Existe identidade visual, linguagem, mensagens e padrões definidos.",
          "Todos os pontos de contato entregam uma experiência de marca consistente e reconhecível.",
        ),
      },
      {
        id: "mkt_conteudo",
        type: "scale",
        title: "Como funciona a produção de conteúdo?",
        options: opts(
          "A empresa não produz conteúdo ou publica sem planejamento.",
          "Produz quando existe tempo, campanha ou necessidade.",
          "Possui calendário, mas com pouca consistência ou direcionamento estratégico.",
          "O conteúdo possui planejamento, objetivos, frequência e conexão com a jornada do cliente.",
          "O conteúdo é mensurado, testado e utilizado para gerar autoridade, demanda e vendas.",
        ),
      },
      {
        id: "mkt_midia",
        type: "scale",
        title: "Como funciona a aquisição de clientes hoje?",
        options: opts(
          "Os clientes chegam por indicação ou acaso, sem nenhum canal ativo de aquisição.",
          "A aquisição depende de ações pontuais: orgânico nas redes, link da bio ou captação ativa quando falta venda.",
          "Existem alguns canais em uso (orgânico, tráfego pago, Google Meu Negócio, parcerias ou captação ativa), mas sem consistência nem mensuração.",
          "Os canais de aquisição são definidos e recorrentes (tráfego pago, orgânico/link da bio, Google, parcerias e captação ativa), com metas e acompanhamento de indicadores.",
          "A aquisição é uma operação previsível: cada canal tem custo, retorno e volume conhecidos, e é otimizado por oferta, público e investimento.",
        ),
      },

      {
        id: "mkt_vendas",
        type: "scale",
        title: "Como marketing e vendas trabalham juntos?",
        options: opts(
          "As áreas não possuem alinhamento ou trabalham separadamente.",
          "Existe comunicação apenas quando surgem problemas.",
          "Existem reuniões ou trocas, mas sem critérios e metas compartilhadas.",
          "Marketing e vendas compartilham metas, definição de lead e análise do funil.",
          "As áreas operam como uma estrutura integrada de geração de receita.",
        ),
      },
      {
        id: "mkt_mensuracao",
        type: "scale",
        title: "Como os resultados de marketing são mensurados?",
        options: opts(
          "A empresa analisa principalmente curtidas, seguidores ou alcance.",
          "Acompanha alguns números, mas não relaciona marketing com vendas.",
          "Mede leads e campanhas, porém sem visão completa de custos e retorno.",
          "Acompanha CPL, CAC, conversão, receita e retorno sobre investimento.",
          "Utiliza dados para redistribuir investimentos, prever resultados e aumentar a eficiência de aquisição.",
        ),
      },
    ],
  },
  {
    id: "inovacao",
    name: "Tecnologia e Inovação",
    short: "Tecnologia",
    description:
      "Tecnologia não é só inovação: envolve novos produtos, novos públicos, novos processos, nova forma de cobrar e leitura de mercado.",
    questions: [
      {
        id: "ino_produto",
        type: "scale",
        title: "Inovação de produto: com que frequência a empresa cria produtos ou serviços novos (não apenas melhora os atuais)?",
        options: opts(
          "Vende sempre os mesmos produtos/serviços, sem criar nada novo.",
          "Já surgiram ideias de novos produtos, mas nada foi colocado no mercado.",
          "Já lançou algum produto novo, de forma pontual e sem método.",
          "Lança novos produtos com alguma regularidade, avaliando demanda e margem.",
          "Tem um fluxo contínuo de criação e lançamento de novos produtos que ampliam a receita.",
        ),
      },
      {
        id: "ino_publico",
        type: "scale",
        title: "Inovação de público: a empresa já levou o que vende para novos públicos, segmentos ou canais?",
        options: opts(
          "Atende sempre o mesmo público, do mesmo jeito.",
          "Percebe que existem outros públicos possíveis, mas nunca testou.",
          "Já tentou atender outro público de forma pontual, sem continuidade.",
          "Já adaptou oferta, linguagem e preço para atender um novo público com sucesso.",
          "Explora novos públicos e canais de forma recorrente, com oferta e preço próprios para cada um.",
        ),
      },
      {
        id: "ino_processo",
        type: "scale",
        title: "Inovação de processo: a empresa muda a forma de fazer as coisas para ganhar tempo, custo ou qualidade?",
        options: opts(
          "Faz tudo do mesmo jeito de sempre, mesmo quando dá problema.",
          "Muda apenas quando algo quebra ou vira urgência.",
          "Já fez melhorias pontuais, mas sem medir o ganho.",
          "Revisa processos com frequência e mede ganho de tempo, custo ou qualidade.",
          "Melhoria e automação de processos fazem parte da rotina, com ganhos acompanhados por indicadores.",
        ),
      },
      {
        id: "ino_modelo_preco",
        type: "scale",
        title: "Inovação no modelo de oferta e cobrança: a empresa testa novas formas de empacotar e precificar o que vende?",
        options: opts(
          "Sempre a mesma oferta e a mesma forma de cobrar.",
          "Já pensou em mudar (pacote, assinatura, ticket maior), mas não testou.",
          "Fez algum teste isolado de novo formato ou preço.",
          "Já criou pacotes/planos diferentes e ajustou preço conforme valor entregue.",
          "Testa e ajusta formatos de oferta e precificação de forma contínua, com impacto claro no faturamento.",
        ),
      },
      {
        id: "ino_mercado",
        type: "scale",
        title: "Como a empresa acompanha o mercado e os concorrentes para encontrar oportunidades?",
        options: opts(
          "Não acompanha de forma estruturada.",
          "Observa redes sociais, preços ou movimentos mais visíveis.",
          "Realiza análises pontuais quando precisa tomar alguma decisão.",
          "Monitora concorrentes, tendências, clientes e mudanças de mercado.",
          "Transforma essas informações em oportunidades, diferenciação e antecipação estratégica.",
        ),
      },
      {
        id: "ino_cultura_teste",
        type: "scale",
        title: "Como as ideias novas viram teste dentro da empresa?",
        options: opts(
          "As ideias ficam só na conversa e nunca saem do papel.",
          "Alguma ideia é executada, mas sempre depende do dono.",
          "As ideias são testadas de forma improvisada, sem prazo nem responsável.",
          "Existem testes com responsável, prazo e avaliação do resultado.",
          "A empresa testa, mede, descarta o que não funciona e escala o que dá certo.",
        ),
      },
    ],
  },
  {
    id: "vendas",
    name: "Vendas",
    short: "Vendas",
    description: "Processo comercial, previsibilidade, follow-up, time e indicadores de venda.",
    questions: [
      {
        id: "vend_aquisicao",
        type: "scale",
        title: "Como novos clientes chegam até a empresa?",
        options: opts(
          "Principalmente por indicação ou procura espontânea, sem previsibilidade.",
          "Existem alguns canais, mas a empresa não sabe quais geram mais resultados.",
          "A empresa conhece os principais canais, mas não possui estratégia para aumentar clientes.",
          "Existem canais estruturados, metas de entrada e acompanhamento de resultados.",
          "A empresa possui diferentes canais previsíveis e otimiza o investimento de acordo com a qualidade dos leads.",
        ),
      },
      {
        id: "vend_funil",
        type: "scale",
        title: "Como é a estrutura comercial?",
        options: opts(
          "Não existe estrutura, funil ou etapas definidas.",
          "Cada vendedor conduz a venda da sua maneira.",
          "Existem etapas básicas, mas elas não são seguidas ou acompanhadas corretamente.",
          "A estrutura ou funil de vendas possui etapas, critérios de avanço, responsáveis e indicadores.",
          "A estrutura ou funil de vendas é analisada continuamente para aumentar conversão e previsibilidade.",
        ),
      },
      {
        id: "vend_registro",
        type: "scale",
        title: "Como as oportunidades são registradas e acompanhadas?",
        options: opts(
          "Não existe registro centralizado.",
          "Os registros ficam em conversas no WhatsApp, agendas ou planilhas individuais.",
          "Existe CRM ou planilha, mas o preenchimento é incompleto.",
          "Todas as oportunidades são registradas e acompanhadas em um CRM.",
          "O CRM está integrado a outros canais e é utilizado para gestão, previsão e tomada de decisão.",
        ),
      },
      {
        id: "vend_qualificacao",
        type: "scale",
        title: "A empresa sabe exatamente seu público-alvo?",
        options: opts(
          "Acredita que todas as pessoas são público-alvo.",
          "Depende da percepção de cada vendedor.",
          "A linguagem dos vendedores é direcionada para o público-alvo.",
          "Existe um perfil claro de cliente.",
          "A qualificação é baseada em dados e direciona abordagem, prioridade e oferta.",
        ),
      },
      {
        id: "vend_metas",
        type: "scale",
        title: "A empresa define metas claras para o time de vendas?",
        options: opts(
          "Não temos metas de vendas ou elas são pouco claras e imprecisas.",
          "Temos metas de vendas amplas, porém nem sempre são atingidas.",
          "Temos metas de vendas claras, mas o desdobramento durante o mês ainda não está claro.",
          "As metas de vendas são claramente definidas, mensuráveis e ajustadas regularmente, mas focam principalmente em indicadores financeiros.",
          "As metas de vendas são claras, mensuráveis e incluem tanto objetivos financeiros quanto qualidade, conversão ou satisfação do cliente.",
        ),
      },
      {
        id: "vend_treinamento",
        type: "scale",
        title: "A equipe de vendas recebe treinamentos regulares?",
        options: opts(
          "Não há treinamentos estruturados para a equipe de vendas.",
          "Realizamos treinamentos esporádicos, sem um plano definido.",
          "Existe um plano de treinamento para a equipe, mas ele é aplicado de forma irregular.",
          "Temos um plano de treinamento estruturado, atualizado regularmente, e ele é executado de forma consistente.",
          "Além de um plano estruturado, a empresa tem a cultura de treinamento, incentivando os vendedores a evoluir o tempo todo.",
        ),
      },

    ],

  },

  {

    id: "processos",
    name: "Processos",
    short: "Processos",
    description: "Mapeamento, documentação, responsáveis, padronização e eficiência.",
    questions: [
      {
        id: "proc_mapeados",
        type: "scale",
        title: "Os principais processos da empresa estão identificados?",
        options: opts(
          "A empresa não possui seus processos mapeados.",
          "Os processos existem apenas no conhecimento das pessoas.",
          "Alguns processos importantes estão identificados, mas não de forma completa.",
          "Os principais processos estão mapeados, organizados e possuem responsáveis.",
          "Os processos são revisados conforme os indicadores, a estratégia e a experiência do cliente.",
        ),
      },
      {
        id: "proc_documentacao",
        type: "scale",
        title: "Qual é o nível de documentação dos processos?",
        options: opts(
          "Não existem documentos, procedimentos ou orientações formais.",
          "Existem anotações dispersas ou materiais desatualizados.",
          "Alguns processos possuem documentos, mas a equipe nem sempre os utiliza.",
          "Os processos críticos estão documentados, atualizados e acessíveis.",
          "Os processos estão documentados em dois níveis: o que fazer e como fazer.",
        ),
      },
      {
        id: "proc_responsaveis",
        type: "scale",
        title: "Como estão definidos os responsáveis por cada processo?",
        options: opts(
          "Não existem responsáveis claros.",
          "A responsabilidade é definida informalmente conforme a necessidade.",
          "Alguns processos possuem responsáveis, mas ainda existem tarefas sem dono.",
          "Cada processo possui responsável, participantes e entregas definidas.",
          "Todas as tarefas e demandas do job de cada colaborador têm processos desenhados com indicadores.",
        ),
      },
      {
        id: "proc_padronizacao",
        type: "scale",
        title: "Qual é o nível de padronização das atividades?",
        options: opts(
          "Cada pessoa executa as atividades da maneira que considera melhor.",
          "Existem padrões informais, transmitidos verbalmente.",
          "Algumas atividades são padronizadas, mas existem diferenças entre pessoas e áreas.",
          "As atividades críticas possuem padrões claros e são seguidas pela equipe.",
          "Os padrões garantem qualidade, agilidade e consistência, sem impedir melhorias.",
        ),
      },
      {
        id: "proc_eficiencia",
        type: "scale",
        title: "Como a empresa acompanha a eficiência dos processos?",
        options: opts(
          "Não existem indicadores de processos.",
          "Os problemas são percebidos por reclamações, atrasos ou erros.",
          "Alguns indicadores são acompanhados, mas sem frequência ou plano de ação.",
          "Existem indicadores de prazo, qualidade, produtividade e retrabalho.",
          "Os dados são utilizados para prever problemas, reduzir custos e aumentar a capacidade operacional.",
        ),
      },
    ],
  },
  {
    id: "pessoas",
    name: "Pessoas e Estrutura Organizacional",
    short: "Pessoas",
    description: "Organograma, competências e dependência de pessoas-chave.",
    questions: [
      {
        id: "pes_estrutura",
        type: "scale",
        title: "Como está definida a estrutura organizacional da empresa?",
        options: opts(
          "Não existe uma estrutura definida. As pessoas se organizam conforme as demandas aparecem.",
          "Existe uma hierarquia informal, conhecida principalmente pela convivência e pelo tempo de empresa.",
          "Existem áreas e lideranças definidas, mas a estrutura não está documentada ou não representa completamente a operação.",
          "Existe um organograma atualizado, com áreas, lideranças e relações de responsabilidade claramente definidas.",
          "A estrutura é revisada conforme a estratégia, o crescimento e as necessidades futuras da empresa.",
        ),
      },
      {
        id: "pes_competencias",
        type: "scale",
        title: "Como a empresa identifica e desenvolve as competências necessárias da equipe?",
        options: opts(
          "Não existe avaliação das competências ou necessidade de desenvolvimento.",
          "Treinamentos acontecem apenas quando surgem erros, dificuldades ou novas demandas.",
          "Alguns treinamentos são realizados, mas sem um diagnóstico claro das necessidades de cada função.",
          "A empresa identifica lacunas técnicas e comportamentais e possui planos de desenvolvimento para as funções prioritárias.",
          "O desenvolvimento é contínuo, acompanhado por evidências de evolução e conectado às necessidades futuras da empresa.",
        ),
      },
      {
        id: "pes_dependencia",
        type: "scale",
        title: "Quanto a empresa depende de pessoas específicas para manter a operação?",
        options: opts(
          "Diversas atividades ou decisões dependem exclusivamente de uma única pessoa.",
          "A empresa reconhece essas dependências, mas ainda não possui alternativas preparadas.",
          "Algumas responsabilidades já podem ser assumidas por outras pessoas, mas ainda existem funções críticas concentradas.",
          "As principais funções possuem processos documentados, substitutos preparados ou planos de continuidade.",
          "O conhecimento é compartilhado, existem sucessores em desenvolvimento e a saída ou ausência de uma pessoa não compromete significativamente a operação.",
        ),
      },
      {
        id: "pes_autonomia",
        type: "scale",
        title: "Qual é o nível de autonomia da equipe para executar as atividades do dia a dia?",
        options: opts(
          "A equipe depende constantemente do líder para tomar praticamente qualquer decisão ou dar continuidade às atividades.",
          "A equipe consegue executar tarefas rotineiras, mas frequentemente interrompe o líder para validar decisões simples.",
          "A equipe possui autonomia em parte das atividades, porém decisões importantes ainda ficam concentradas na liderança.",
          "A equipe possui critérios claros de decisão e resolve a maior parte das situações sem depender do líder, recorrendo a ele apenas em casos estratégicos ou excepcionais.",
          "A equipe tem autonomias definidas, toma decisões alinhadas aos objetivos da empresa e o líder atua principalmente no direcionamento estratégico e no desenvolvimento das pessoas.",
        ),
      },
      {
        id: "pes_responsabilidades",
        type: "scale",
        title: "Como as responsabilidades e expectativas de cada função estão definidas?",
        options: opts(
          "Não existem responsabilidades claramente definidas. As pessoas executam as atividades conforme a necessidade do momento.",
          "As responsabilidades são conhecidas informalmente, mas variam conforme a interpretação de cada colaborador ou gestor.",
          "A maioria das funções possui responsabilidades definidas, porém ainda existem sobreposições, dúvidas ou lacunas.",
          "Cada função possui responsabilidades, entregas e expectativas claramente definidas e conhecidas pela equipe.",
          "Além de responsabilidades bem definidas, as funções são revisadas periodicamente para acompanhar a estratégia, o crescimento da empresa e a evolução das pessoas.",
        ),
      },

    ],
  },
];

/** Mantém a pergunta removida visível somente em aplicações históricas que já possuem essa resposta. */
export const diagnosticPillarsForAnswers = (answers?: Answers): ToolPillar[] => {
  if (!answers || !(LEGACY_GESTAO_VISAO_QUESTION.id in answers)) return DIAGNOSTICO_BEGIN_PILLARS;
  return DIAGNOSTICO_BEGIN_PILLARS.map((pillar) =>
    pillar.id === "gestao"
      ? { ...pillar, questions: [...pillar.questions.slice(0, 2), LEGACY_GESTAO_VISAO_QUESTION, ...pillar.questions.slice(2)] }
      : pillar.id === "inovacao"
        ? { ...pillar, name: "Tecnologia e Estratégia" }
        : pillar,
  );
};

export const SCALE_VALUE: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5 };

export type Answers = Record<string, string>;

export const pillarQuestionCount = (p: ToolPillar) => p.questions.length;

export const pillarAnsweredCount = (p: ToolPillar, answers: Answers) =>
  p.questions.filter((q) => (answers[q.id] ?? "").toString().trim().length > 0).length;

export const isPillarComplete = (p: ToolPillar, answers: Answers) =>
  pillarAnsweredCount(p, answers) === p.questions.length;

/** Média (1–5) das perguntas de escala de um pilar. Retorna 0 quando não há respostas. */
export const pillarScore = (p: ToolPillar, answers: Answers): number => {
  const scales = p.questions.filter((q) => q.type === "scale");
  const values = scales
    .map((q) => SCALE_VALUE[answers[q.id]])
    .filter((v): v is number => typeof v === "number");
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
};

export const computeScores = (answers: Answers): Record<string, number> => {
  const out: Record<string, number> = {};
  DIAGNOSTICO_BEGIN_PILLARS.forEach((p) => {
    out[p.id] = Number(pillarScore(p, answers).toFixed(2));
  });
  return out;
};

export const overallScore = (scores: Record<string, number>): number => {
  const values = Object.values(scores).filter((v) => v > 0);
  if (!values.length) return 0;
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
};

export const MATURITY_LEVELS = [
  { max: 1.9, label: "Inicial", hint: "A empresa depende de pessoas e improviso." },
  { max: 2.9, label: "Em estruturação", hint: "Existem iniciativas, mas sem consistência." },
  { max: 3.9, label: "Estruturada", hint: "Bases definidas, faltam indicadores e rotina." },
  { max: 4.6, label: "Consistente", hint: "Gestão orientada a processos e indicadores." },
  { max: 5, label: "Escalável", hint: "Empresa autogerenciável e orientada a dados." },
];

export const maturityLabel = (score: number) =>
  MATURITY_LEVELS.find((l) => score <= l.max) ?? MATURITY_LEVELS[0];

/** Chave da meta definida pelo aluno/mentor ao final de cada etapa. */
export const pillarGoalKey = (pillarId: string) => `meta_${pillarId}`;

/** Frase que resume o estado atual do setor, preenchida no mapa final. */
export const pillarCurrentKey = (pillarId: string) => `atual_${pillarId}`;

/** Meta possível para o próximo encontro daquele setor. */
export const pillarSessionGoalKey = (pillarId: string) => `meta_encontro_${pillarId}`;

/** Máscaras dos campos numéricos (número, R$ e %). */
export const formatNumericInput = (raw: string, format: TextFormat): string => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (format === "number") return String(Number(digits));
  const value = Number(digits) / 100;
  const num = value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return format === "currency" ? `R$ ${num}` : `${num}%`;
};
