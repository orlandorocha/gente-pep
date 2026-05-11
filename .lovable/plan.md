## Escopo

Ativar modais e funcionalidades de **Registrar ausência**, **Solicitar férias**, **Nova licença**, **Novo agendamento** e **Nova tarefa**, persistir tudo no Lovable Cloud, aplicar as regras de agendamento e enviar solicitações de aprovação de férias ao gestor por **Email + Microsoft Teams**.

---

## 1. Banco de dados (Lovable Cloud)

Tabelas novas (com RLS — leitura/escrita autenticada para usuários internos):

- `colaboradores` — nome, area, cargo, gestor_id, email, ativo
- `gestores` — nome, email, teams_user_id (opcional)
- `faltas` — colaborador_id, data, motivo, justificada, observacao
- `ferias` — colaborador_id, gestor_id, inicio, fim, periodo_aquisitivo, status (`Pendente`, `Aprovada`, `Recusada`, `Em gozo`, `Concluída`), token_aprovacao, decidido_em, decidido_por
- `licencas` — colaborador_id, tipo, inicio, fim, observacao, status
- `agendamentos` — colaborador_id, tipo (`De bem com a vida`, `Aniversário`, `Hora Extra`), titulo, data, hora, prioridade, status (`Agendado`, `Realizado`, `Cancelado`)
- `tarefas` — titulo, descricao, responsavel_id, status (`A fazer`, `Em andamento`, `Concluída`), prazo

Migra os mocks atuais para seed inicial.

---

## 2. Modais (Sheet/Dialog reutilizáveis)

Em cada página, botão do `PageHeader` abre um Sheet com formulário validado (zod + react-hook-form):

- **Registrar ausência** (`/_app/faltas`)
- **Solicitar férias** (`/_app/ferias`) — cria registro `Pendente` e dispara aprovação
- **Nova licença** (`/_app/licencas`)
- **Novo agendamento** (`/_app/agendamentos`) — com seletor de **Tipo**
- **Nova tarefa** (`/_app/tarefas`)

Após salvar: insert via Supabase, toast de sucesso, atualiza lista.

---

## 3. Regras de agendamento

Validação no **server function** `criarAgendamento`:

- **De bem com a vida**: se o colaborador já tem **3 ou mais** agendamentos deste tipo (qualquer status diferente de `Cancelado`) → bloqueia com mensagem: *"Limite de 3 agendamentos de De bem com a vida atingido para este colaborador."*
- **Aniversário**: se já existe **1 ou mais** agendamento deste tipo → bloqueia: *"Aniversário já agendado/gozado este ano."*
- **Hora Extra**: sem limite.

---

## 4. Fluxo de aprovação de férias (Email + Teams)

Ao criar uma solicitação de férias:

1. Server function `solicitarFerias` insere a linha com `status = 'Pendente'` e gera `token_aprovacao` (uuid).
2. Dispara notificação para o gestor:
   - **Email** via Lovable Emails (template `vacation-approval-request`) com botões **Aprovar** e **Recusar** apontando para `/api/public/ferias/decisao?token=...&action=approve|reject`.
   - **Teams**: mensagem em chat 1:1 com o gestor (via conector Microsoft Teams) com Adaptive Card contendo os mesmos links.
3. Página pública `/ferias/decisao` confirma a ação e atualiza o status (uma única vez por token).
4. Na tela de Férias, o gestor logado também vê botões **Aprovar/Recusar** inline para itens `Pendente`.

### Pré-requisitos que vou solicitar
- Configurar **domínio de email** Lovable (vou abrir o setup) → obrigatório para o envio de email.
- Conectar o **conector Microsoft Teams** → obrigatório para envio via Teams.

Enquanto qualquer dos dois não estiver configurado, o sistema continua criando a solicitação e mostra o status pendente; o canal indisponível fica em log e o outro segue funcionando.

---

## 5. Estrutura de código

```text
src/
  components/forms/
    AusenciaForm.tsx
    FeriasForm.tsx
    LicencaForm.tsx
    AgendamentoForm.tsx
    TarefaForm.tsx
  lib/
    ferias.functions.ts        # solicitar, aprovar, recusar
    agendamentos.functions.ts  # criar com regras
    notifications.server.ts    # email + teams
  routes/
    api/public/ferias.decisao.ts   # endpoint público com token
  lib/email-templates/
    vacation-approval-request.tsx
```

---

## 6. Ordem de execução

1. Criar migration com todas as tabelas + RLS + seed mínimo.
2. Configurar domínio de email + conector Teams (vou pedir).
3. Scaffold de email transacional + template de aprovação.
4. Server functions e endpoint público de decisão.
5. Modais e formulários nas 5 páginas.
6. Refatorar páginas de listagem para ler do Supabase.
7. Botões inline de Aprovar/Recusar em Férias.

Posso começar?
