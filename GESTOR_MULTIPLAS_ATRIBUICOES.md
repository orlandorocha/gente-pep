# Gestores com Múltiplas Atribuições

## Problema Resolvido

Anteriormente, um gestor poderia ser vinculado a apenas **um** setor/cargo/turno. Isso significava que se você tinha um gestor chamado "GABRIEL" cadastrado para "PROCESSO MASSA FRITA TORCIDA · Manhã", ele **não podia** gerenciar "EMBALAGEM TORCIDA · Tarde" simultaneamente.

## Solução Implementada

Agora, um gestor pode gerenciar **múltiplos processos** (combinações de setor/cargo/turno) sem limite.

### Arquitetura

#### Tabela Nova: `gestor_atribuicoes`

```sql
CREATE TABLE gestor_atribuicoes (
  id UUID PRIMARY KEY,
  gestor_id UUID NOT NULL (referencia gestores),
  setor TEXT NOT NULL,
  cargo TEXT NOT NULL,
  turno ENUM ("Manhã", "Tarde", "Noite") NOT NULL,
  created_at TIMESTAMP,
  UNIQUE(gestor_id, setor, cargo, turno)
);
```

**Benefício:** Cada combinação (gestor, setor, cargo, turno) é única, mas um mesmo gestor pode ter múltiplas linhas com combinações diferentes.

#### Alterações na Tabela `gestores`

Antes (modelo antigo):
```
gestores
├── id
├── nome
├── email
├── setor      ❌ Removido (agora em atribuições)
├── turno      ❌ Removido (agora em atribuições)
└── cargo      ❌ Removido (agora em atribuições)
```

Depois (modelo novo):
```
gestores                          gestor_atribuicoes
├── id                    ┐       ├── id
├── nome                  ├──────→├── gestor_id
├── email                 ┘       ├── setor
└── (sem setor/turno)            ├── cargo
                                 ├── turno
                                 └── (pode ter múltiplas linhas)
```

### Fluxo de Uso

#### 1. Criar um novo gestor (sem atribuições iniciais)

```
Modal "Novo gestor"
├── Nome: "GABRIEL" [obrigatório]
├── E-mail: "gabriel@empresa.com" [opcional]
├── Setor: [deixar em branco]
├── Cargo: [deixar em branco]
└── Turno: [deixar em branco]

→ Clica em "Adicionar gestor"
→ GABRIEL é criado sem atribuições
```

#### 2. Adicionar primeira atribuição

```
Card do GABRIEL
└── Botão "Atribuições" (clica)

Painel de Atribuições
├── Setor: "PROCESSO MASSA FRITA TORCIDA"
├── Cargo: "Operador"
├── Turno: "Manhã"
└── Clica "Adicionar atribuição"

→ GABRIEL agora gerencia: PROCESSO MASSA FRITA TORCIDA · Manhã
```

#### 3. Adicionar segunda atribuição (mesmo gestor)

```
Card do GABRIEL (Botão "Atribuições" já ativo)

Painel de Atribuições
├── Atribuições existentes: 1
├── Setor: "EMBALAGEM TORCIDA"
├── Cargo: "Operador"
├── Turno: "Tarde"
└── Clica "Adicionar atribuição"

→ GABRIEL agora gerencia:
  • PROCESSO MASSA FRITA TORCIDA · Manhã
  • EMBALAGEM TORCIDA · Tarde
```

#### 4. Remover uma atribuição

```
Card do GABRIEL (Botão "Atribuições" clicado)

Painel de Atribuições
├── PROCESSO MASSA FRITA TORCIDA · Manhã [X] ← clica
├── EMBALAGEM TORCIDA · Tarde

→ Primeira atribuição removida
→ GABRIEL agora gerencia apenas: EMBALAGEM TORCIDA · Tarde
```

## Componentes Modificados

### 1. `src/components/GestoresModal.tsx`

**Mudanças principais:**

- ✅ Nova seção "Atribuições" no card de cada gestor
- ✅ Botão "Atribuições" para ativar/desativar painel de gerenciamento
- ✅ Formulário para adicionar nova atribuição (setor/cargo/turno)
- ✅ Lista de atribuições existentes com botão de remover
- ✅ Setor/cargo/turno agora opcionais ao criar gestor

**Novas funções:**

```typescript
async function adicionarAtribuicao(gestorId: string)
  // Cria nova atribuição e vincula colaboradores automaticamente
  
async function removerAtribuicao(gestorId: string, atribuicaoId: string)
  // Remove atribuição
```

### 2. `src/integrations/supabase/types.ts`

**Adicionado:**

```typescript
gestor_atribuicoes: {
  Row: {
    id: UUID
    gestor_id: UUID
    setor: string
    cargo: string
    turno: "Manhã" | "Tarde" | "Noite"
  }
  // ... Insert/Update types
}
```

### 3. Migration SQL: `20260715_add-gestor-atribuicoes-table.sql`

**O que faz:**

1. Cria tabela `gestor_atribuicoes`
2. Migra dados existentes (gestores com setor/turno/cargo) para atribuições
3. Cria índices para performance
4. Define constraint único para evitar duplicatas

## Dados e Segurança

### Migração de Dados Existentes

Se você já tinha gestores com setor/turno/cargo, a migration automaticamente:

1. Lê cada gestor com setor/turno/cargo preenchidos
2. Cria uma atribuição em `gestor_atribuicoes` com esses valores
3. Mantém histórico de colaboradores vinculados

**Exemplo:**

```
Antes:
gestores.id=1, nome=GABRIEL, setor=PROCESSO MASSA FRITA, turno=Manhã, cargo=Operador

Depois:
gestores.id=1, nome=GABRIEL
gestor_atribuicoes.id=uuid1, gestor_id=1, setor=PROCESSO MASSA FRITA, turno=Manhã, cargo=Operador
```

### Row Level Security (RLS)

Cada gestor ainda recebe relatórios apenas de seus colaboradores vinculados. A lógica de vinculação permanece:

```
colaborador.gestor_id = gestor.id
```

A diferença agora é que um mesmo `gestor.id` pode ter múltiplas "responsabilidades" via `gestor_atribuicoes`.

## Benefícios

| Antes | Depois |
|-------|--------|
| 1 gestor = 1 atribuição | 1 gestor = N atribuições |
| Escalabilidade limitada | Escalabilidade total |
| Precisa criar gestor novo para cada processo | Reutiliza mesmo gestor |
| Difícil manter gestor para vários turnos | Fácil adicionar/remover atribuições |
| Sem flexibilidade | UI intuitiva para gerenciar |

## Exemplos de Uso Real

### Exemplo 1: Gestor em Múltiplos Turnos

```
Gestor: MARIANA

Atribuições:
✓ PRODUTO A · Operador · Manhã
✓ PRODUTO A · Operador · Tarde

Responsabilidades:
- Recebe relatórios de colaboradores da MANHÃ em PRODUTO A
- Recebe relatórios de colaboradores da TARDE em PRODUTO A
- Pode aprovar férias, faltas, etc. para ambos os turnos
```

### Exemplo 2: Gestor em Múltiplos Setores

```
Gestor: CARLOS

Atribuições:
✓ EMBALAGEM · Supervisor · Manhã
✓ EXPEDIÇÃO · Supervisor · Manhã
✓ QUALIDADE · Inspetor · Manhã

Responsabilidades:
- Supervisiona embalagem
- Supervisiona expedição
- Inspeciona qualidade
- Tudo no mesmo turno/gestor
```

### Exemplo 3: Gestor Flexível

```
Gestor: JOÃO

Atribuições:
✓ FÁBRICA A · Gerente · Manhã
✓ FÁBRICA B · Gerente · Tarde
✓ MANUTENÇÃO · Técnico · Noite

Responsabilidades:
- Gerencia fábrica A pela manhã
- Gerencia fábrica B à tarde
- Faz manutenção à noite
- Sem limite de combinações
```

## Testes Recomendados

### Teste 1: Criar Gestor com Atribuição Inicial

```
1. Clique em "Novo gestor"
2. Preencha: Nome = "TESTE", Setor = "TESTE", Cargo = "Teste", Turno = "Manhã"
3. Clique "Adicionar e vincular"
4. Verificar que gestor foi criado com 1 atribuição
```

### Teste 2: Criar Gestor sem Atribuição

```
1. Clique em "Novo gestor"
2. Preencha: Nome = "TESTE2"
3. Deixe Setor/Cargo/Turno em branco
4. Clique "Adicionar gestor"
5. Verificar que gestor foi criado sem atribuições
6. Clique "Atribuições" e adicione atribuição depois
```

### Teste 3: Múltiplas Atribuições no Mesmo Gestor

```
1. Crie gestor "GABRIEL" com primeira atribuição (PROCESSO MASSA FRITA · Manhã)
2. Clique "Atribuições"
3. Adicione segunda atribuição (EMBALAGEM TORCIDA · Tarde)
4. Verificar badge mostrando "+1" ou ambas atribuições
5. Remova uma atribuição
6. Verificar que gestor continua com outra atribuição
```

### Teste 4: Vinculação Automática

```
1. Crie atribuição para "PROCESSO A · Operador · Manhã"
2. Verificar toast mostrando quantos colaboradores foram vinculados
3. Ir em Colaboradores e verificar que foram associados ao gestor
4. Remover atribuição
5. Verificar que colaboradores PERMANECEM vinculados (RLS previne acesso)
```

## Próximas Melhorias (Opcional)

- [ ] Exportar lista de atribuições por gestor (relatório)
- [ ] Filtrar colaboradores por atribuição do gestor
- [ ] Dashboard mostrando "carga" de gestor (quantas atribuições)
- [ ] Limitar número máximo de atribuições por gestor
- [ ] Auditoria de mudanças em atribuições
- [ ] Notificações quando atribuição é adicionada/removida

## Suporte

Se encontrar problemas:

1. **Gestor não aparece após criar:** Aguarde reload ou clique "Fechar" e reabra modal
2. **Atribuição não vinculou colaboradores:** Verifique se existem colaboradores com essa combinação setor/cargo/turno
3. **Erro ao adicionar atribuição:** Tente remover conflitos (atribuição duplicada)

---

**Status:** Implementado e testado  
**Data:** 15/07/2026  
**Versão:** 1.0
