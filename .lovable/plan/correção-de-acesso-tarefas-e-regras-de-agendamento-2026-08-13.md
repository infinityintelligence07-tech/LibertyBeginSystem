# Correção de acesso, tarefas e regras de agendamento

## Objetivo
Eliminar o atrito relatado pelos alunos e tornar as regras consistentes tanto na interface quanto no banco de dados.

## Implementação

### 1. Tarefas do membro realmente interativas
- Trocar a lista somente de leitura da Central de Tarefas por controles completos para o aluno.
- Permitir marcar/desmarcar a tarefa, definir prazo e acompanhar o estado (pendente, em andamento, aguardando validação e concluída).
- Atualizar imediatamente contadores e filtros após cada ação, sem exigir recarregar a página.
- Manter as mesmas ações também dentro da Jornada e da Agenda.

### 2. Limite de duas sessões por mês
- Contabilizar por mês da data agendada, não pelo total geral de sessões futuras.
- Contar sessões agendadas, reagendadas, pendentes de aprovação e realizadas; ignorar canceladas e não realizadas.
- Bloquear a terceira sessão do mesmo membro no mesmo mês, com mensagem clara indicando o limite.
- Aplicar a regra também no banco para impedir duplicidade por cliques simultâneos ou por outro fluxo de criação.
- Ajustar todos os pontos de criação/edição de sessão para exibirem corretamente o motivo do bloqueio.

### 3. Mapeamento do Negócio obrigatório até três sessões
- Corrigir a faixa para membros com **até 3 sessões realizadas**.
- Enquanto o Mapeamento não estiver concluído, deixar somente essa sessão disponível e mostrar cadeado nas demais.
- Após a conclusão do Mapeamento, liberar imediatamente as outras sessões.
- Com 4 ou mais sessões realizadas, não aplicar a obrigatoriedade retroativa.
- Alinhar a mesma regra na tela de Jornada e no agendamento direto por link.

### 4. Resiliência contra o app “fora do ar”
- Fortalecer a recuperação do erro `removeChild/insertBefore` no nível raiz do aplicativo, inclusive quando provocado por tradução automática, extensões ou versão antiga em cache.
- Preservar o formulário inicial e o estado digitado durante uma recuperação.
- Validar login, onboarding e rotas principais do membro em viewport de celular, incluindo tarefas e agendamento.

## Regras técnicas
- A validação mensal será transacional e protegida contra concorrência no banco.
- Administradores e mentores continuarão podendo administrar registros existentes, mas novas sessões de membros respeitarão o limite mensal.
- Nenhum histórico atual será apagado ou alterado automaticamente.

## Validação
- Testar membro com 0, 1, 2, 3 e 4 sessões realizadas em relação ao Mapeamento.
- Testar primeira, segunda e terceira sessão no mesmo mês, incluindo cancelamento e tentativa simultânea.
- Testar check, desmarcação e prazo de tarefa na Central de Tarefas e na Jornada.
- Executar smoke test das rotas de aluno em mobile e confirmar ausência de erros de runtime.
