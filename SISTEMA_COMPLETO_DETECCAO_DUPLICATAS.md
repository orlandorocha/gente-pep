# Sistema Completo de Detecção de Duplicatas de Férias

## Visão Geral

Implementação de 3 camadas de validação para garantir integridade de dados de férias:

1. **Validação de Duplicatas no Arquivo XLSX** ← Nova
2. **Validação de Férias Existentes no Sistema**
3. **Detecção de Duplicatas em Tempo Real**

---

## Camada 1: Validação de Duplicatas no Arquivo XLSX (NEW)

### O Problema
Quando usuário importa planilha com múltiplas férias do mesmo colaborador no mesmo período, o sistema deveria alertar ANTES de importar.

### Solução
Função `detectarDuplicatasArquivo()` que:
- Agrupa férias por: colaborador + período_aquisitivo + ano
- Detecta grupos com mais de 1 féria
- Mostra modal antes de continuar importação

### Implementação

**Arquivo:** `src/components/XlsxButtons.tsx`

**Tipos:**
```typescript
type FeriasDuplicataArquivo = {
  colaborador: Colab;
  periodo_aquisitivo: string;
  ano: number;
  linhas: number[];
  ferias: Array<{ linha: number; inicio: string; fim: string }>;
};
```

**Função:**
```typescript
function detectarDuplicatasArquivo(ferias: FeriasImportRow[]): FeriasDuplicataArquivo[] {
  // Agrupa por colaborador + periodo + ano
  // Retorna apenas grupos com duplicatas (>1 féria)
}
```

**Estados:**
```typescript
const [duplicatasArquivo, setDuplicatasArquivo] = useState<FeriasDuplicataArquivo[]>([]);
const [showDuplicatasDialog, setShowDuplicatasDialog] = useState(false);
```

### Fluxo na Importação

```
1. Usuário seleciona arquivo XLSX
   ↓
2. Sistema lê linhas e normaliza
   ↓
3. ⚡ PRIMEIRA VALIDAÇÃO: Detecta duplicatas no arquivo
   ↓
   ├─ Se houver duplicatas:
   │  ├─ Mostra modal listando duplicatas
   │  ├─ Toast de aviso
   │  └─ Interrompe importação
   │
   └─ Se sem duplicatas:
      ↓
      4. SEGUNDA VALIDAÇÃO: Valida se já existe no sistema
      ↓
      ├─ Se houver conflitos:
      │  ├─ Mostra modal de conflitos
      │  └─ Permite escolher continuar ou pular
      │
      └─ Se sem conflitos:
         ↓
         5. Importa férias com status "Pendente"
```

### UI - Modal de Duplicatas

**Título:** "Duplicatas Detectadas no Arquivo"

**Conteúdo:**
- Grupo por colaborador com border vermelho
- Nome do colaborador
- Período e ano
- Lista de férias duplicadas com:
  - Número da linha (onde encontrada)
  - Data início e fim

**Ação:** Botão "Fechar" que cancela importação

**Toast:** "X colaborador(es) com férias duplicadas no arquivo"

### Exemplo de Uso

Arquivo com:
```
Linha 2: GABRIEL | 2024/2025 | 15/01/2024 | 20/01/2024
Linha 3: GABRIEL | 2024/2025 | 15/01/2024 | 20/01/2024  ← Duplicada
Linha 4: MARIA   | 2024/2025 | 01/02/2024 | 10/02/2024
```

**Resultado:**
- Modal mostra: "GABRIEL: 2 férias encontradas (Linhas 2 e 3)"
- User cancela, corrige arquivo, reimporta
- Na segunda tentativa: sem duplicatas, segue para próxima validação

---

## Camada 2: Validação de Férias Existentes (Já Existia)

### O Que Faz
Valida se colaborador já tem férias agendadas para o mesmo período no sistema.

**Arquivo:** `src/components/XlsxButtons.tsx` (linhas 510-530)

**Modal:** "Férias Já Agendadas"
- Mostra férias existentes por colaborador
- Permite selecionar qual linha pular
- Importa apenas selecionadas

---

## Camada 3: Detecção de Duplicatas em Tempo Real (Já Implementada)

### O Que Faz
Detecta e permite corrigir duplicatas já no sistema.

**Arquivo:** `src/lib/ferias.functions.ts`

**Métodos:**
- `detectarFeriasDuplicadas()` - encontra duplicatas
- `deletarFeriasDuplicadas()` - remove selecionadas

**UI:**
- Badge vermelho no topo da página
- Modal com checkboxes para selecionar qual deletar
- Toast de sucesso com quantidade deletada

---

## Arquitetura Completa

```
┌─────────────────────────────────────────────────────────┐
│               IMPORTAÇÃO DE PLANILHA XLSX               │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────┐
        │ 1. Lê arquivo e normaliza dados  │
        └──────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────────────┐
        │ CAMADA 1: Detecta duplicatas NO ARQUIVO     │
        │ (detectarDuplicatasArquivo)                 │
        └──────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
         HÁ DUPLICATAS?          SEM DUPLICATAS
              │                         │
              ▼                         ▼
         MOSTRA MODAL              ┌──────────────────────┐
         (modal_duplicatas)        │ CAMADA 2: Valida     │
              │                    │ férias EXISTENTES    │
              └────────────────────→ (validarFerias)      │
                    ↓               └──────────────────────┘
              CANCELA                      │
              IMPORTAÇÃO        ┌──────────┴──────────┐
                                ▼                     ▼
                          HÁ CONFLITOS?          SEM CONFLITOS
                                │                     │
                                ▼                     ▼
                           MOSTRA MODAL         ┌─────────────┐
                        (modal_conflitos)      │ IMPORTA com │
                                │              │ status:     │
                                ▼              │ "Pendente"  │
                           USUÁRIO ESCOLHE     └─────────────┘
                           QUAL CONTINUAR           │
                                                    ▼
                    ┌──────────────────────────────────────┐
                    │ SUCESSO: Férias importadas           │
                    │ Toast: "X férias importadas"         │
                    └──────────────────────────────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────────────┐
                    │ CAMADA 3: Detecção em Tempo Real     │
                    │ (Badge + Modal + Detecção automática)│
                    └──────────────────────────────────────┘
```

---

## Comparação: Antes vs Depois

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Duplicatas no XLSX** | Não detectava | ✅ Detecta com modal |
| **Duplicatas no Sistema** | Não alertava | ✅ Alerta em tempo real |
| **Conflitos ao Importar** | Silencioso | ✅ Modal com opções |
| **Integridade de Dados** | Baixa | ✅ Alta (3 camadas) |
| **UX Feedback** | Limitado | ✅ Claro (modais + toasts) |

---

## Casos de Uso Completos

### Caso 1: Planilha com Duplicatas

**Usuário:** "Importar férias.xlsx"

**Arquivo contém:**
```
GABRIEL 2024/2025 15/01 20/01
GABRIEL 2024/2025 15/01 20/01 ← Duplicada
```

**Sistema:**
1. Detecta duplicata no arquivo
2. Mostra modal com linhas 2 e 3
3. Toast: "1 colaborador(a) com férias duplicadas no arquivo"
4. Usuário corrige arquivo
5. Reimporta
6. OK - importa com sucesso

### Caso 2: Planilha OK, mas já existe no sistema

**Arquivo:** Sem duplicatas

**Sistema já tem:** GABRIEL com férias 15/01-20/01 (Pendente)

**Sistema:**
1. Detecta: sem duplicatas no arquivo ✓
2. Valida: já existe no sistema
3. Mostra modal: "Férias já agendadas"
4. Usuário marca para pular
5. Importa outras, pula GABRIEL
6. Toast: "3 férias importadas"

### Caso 3: Tudo ok na importação, mas duplicatas após sincronização

**Importou:** OK, sem conflitos

**Mas depois:** Sistema detecta 2 férias do mesmo colaborador no mesmo período

**Sistema:**
1. Página de Férias carrega
2. Effect executa detecção automática
3. Badge vermelho: "⚠️ 2 Duplicatas"
4. Toast: "Detectadas 2 féria(s) duplicada(s)"
5. Usuário clica badge
6. Modal mostra as 2 férias
7. Seleciona qual deletar
8. Sistema remove + re-sincroniza
9. Toast: "1 férias duplicadas removidas"

---

## Segurança e Integridade

| Camada | Validação | Segurança |
|--------|-----------|-----------|
| **1 - XLSX** | Agrupa local | Sem DB |
| **2 - Existentes** | Query com RLS | Autenticado |
| **3 - Runtime** | Bearer token | Seguro |

---

## Performance

- **Camada 1:** O(n log n) - agrupamento de linhas
- **Camada 2:** O(n) queries por colaborador
- **Camada 3:** Uma query por detecção

---

## Próximas Melhorias

1. **Auto-sugestão:** Indicar automaticamente qual féria deletar
2. **Histórico:** Log de todas as duplicatas encontradas
3. **Batch:** Deletar múltiplas de uma vez sem confirmação
4. **Aviso Preventivo:** Alertar ao criar féria se vai criar duplicata
5. **Relatório:** Exportar relatório de duplicatas encontradas

---

## Troubleshooting

### Modal de duplicatas não aparece
- Verificar se o arquivo tem linhas com mesma data
- Verificar se colaborador tem mesmo ID/GPID

### Detecção em tempo real lenta
- Verificar quantidade de férias (>1000?)
- Considerar paginação

### Erro 401 em detecção
- Verificar se token está válido
- Verificar RLS policies na tabela

---

## Documentação Relacionada

- `DETECCAO_DUPLICATAS_FERIAS_REATIVADA.md` - Detecção em tempo real
- `CORRECAO_DUPLICATAS_FERIAS.md` - Histórico das correções
- `DETECCAO_DUPLICATAS_FERIAS.md` - Documentação original

---

**Status:** ✅ Sistema completo e funcional em produção
**Última atualização:** 2024
**Commits:** 
- `e7bb846` - feat: verificar duplicatas no arquivo XLSX
- `c5db6ca` - docs: detecção em tempo real reativada
