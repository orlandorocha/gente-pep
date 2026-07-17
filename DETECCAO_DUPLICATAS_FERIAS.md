# Detecção e Remoção de Férias Duplicadas

## Visão Geral

Sistema automático que detecta e permite corrigir férias duplicadas no sistema. Quando um colaborador tem múltiplas férias para o mesmo período e ano, o sistema alerta e facilita a remoção das duplicadas.

---

## O Problema Resolvido

### Antes
- Colaboradores com múltiplas férias no mesmo período passavam despercebidos
- Necessidade manual de auditar banco de dados
- Possibilidade de erros de importação criar duplicatas
- Sem notificação do problema

### Depois
- Detecção automática ao abrir página de férias
- Alerta visual em vermelho com contador
- Modal interativo para corrigir
- Escolha individual de qual féria manter

---

## Como Funciona

### 1. Detecção Automática

Ao abrir a página de férias, o sistema:
1. Executa `detectarFeriasDuplicadas()`
2. Busca todas as férias ativas (Pendente, Aprovada, Em gozo, Concluída)
3. Agrupa por: **colaborador + período_aquisitivo + ano**
4. Identifica grupos com mais de 1 féria
5. Conta total de duplicatas

### 2. Alertas

Se duplicatas forem encontradas:

**Badge Vermelho (topo da página):**
```
⚠️ 5 Duplicatas
```

**Toast de notificação (8 segundos):**
```
Detectadas 5 féria(s) duplicada(s)! Clique no aviso para corrigir.
```

### 3. Modal de Correção

Ao clicar no badge, abre modal mostrando:

**Para cada grupo duplicado:**
- Nome do colaborador
- Período e ano (ex: "2024/2025 (2024)")
- Número total de duplicatas
- Lista de cada féria com:
  - Datas (De ... até ...)
  - Status (Aprovada, Em gozo, etc)
  - Checkbox para selecionar

**Prioridade recomendada (do que MANTER para o que DELETAR):**
1. ✓ Aprovada (manter)
2. Em gozo (pode deletar se houver outra)
3. Concluída (pode deletar)
4. Pendente (pode deletar)

---

## Uso Prático

### Cenário: Gabriel tem 2 férias em 2024/2025

```
GABRIEL (2024/2025)
├─ Féria 1: 15/01/2024 a 20/01/2024 (Aprovada) ← MANTER
└─ Féria 2: 15/01/2024 a 20/01/2024 (Pendente) ← DELETAR
```

**Passos:**
1. Abre página Férias
2. Vê badge "⚠️ 1 Duplicata"
3. Clica no badge
4. Modal abre mostrando as 2 férias
5. Marca checkbox da Féria 2 (Pendente)
6. Clica "Deletar Selecionadas"
7. Toast: "1 férias duplicadas removidas"
8. Modal fecha
9. Badge desaparece

---

## Implementação Técnica

### Métodos Server (`ferias.functions.ts`)

#### `detectarFeriasDuplicadas()`
```typescript
export const detectarFeriasDuplicadas = createServerFn()
  // Retorna: { total: number; grupos: GrupoFeriasDuplicadas[] }
  // total = quantidade de férias duplicadas (não de grupos)
  // grupos = array de grupos com duplicatas
```

**Tipos:**
```typescript
type FeriaDuplicada = {
  id: string;
  colaborador_id: string;
  colaborador_nome: string;
  inicio: string;
  fim: string;
  status: string;
  periodo_aquisitivo: string;
  ano: number;
};

type GrupoFeriasDuplicadas = {
  colaborador_id: string;
  colaborador_nome: string;
  ano: number;
  periodo_aquisitivo: string;
  ferias: FeriaDuplicada[];
};

type DetectarDuplicatasResult = {
  total: number;
  grupos: GrupoFeriasDuplicadas[];
};
```

#### `deletarFeriasDuplicadas(feriaIds)`
```typescript
export const deletarFeriasDuplicadas = createServerFn()
  // Recebe: { feriaIds: string[] }
  // Deleta as férias selecionadas
  // Re-sincroniza jornadas diárias
  // Retorna: { ok: true; deletadas: number }
```

### UI Component (`ferias.tsx`)

**Estados adicionados:**
```typescript
const [duplicatas, setDuplicatas] = useState<GrupoFeriasDuplicadas[]>([]);
const [showDuplicatasModal, setShowDuplicatasModal] = useState(false);
const [selecionadasParaDelete, setSelecionadasParaDelete] = useState<Set<string>>(new Set());
const [deletandoDuplicatas, setDeletandoDuplicatas] = useState(false);
```

**Effect de detecção:**
```typescript
useEffect(() => {
  // Executa detectarFeriasDuplicadas
  // Se encontrar: mostra badge + toast
}, []);
```

**Função deletarSelecionadas():**
```typescript
// 1. Valida se tem itens selecionados
// 2. Chama deletarFeriasDuplicatas() com IDs
// 3. Mostra toast de sucesso
// 4. Re-detecta para atualizar UI
// 5. Limpa seleções e fecha modal
```

---

## Recursos e Features

### Detecção
- ✓ Agrupa automaticamente por colaborador + período + ano
- ✓ Ignora férias com status "Recusada"
- ✓ Conta corretamente duplicatas (N-1 por grupo)

### UI
- ✓ Badge visual em vermelho com ícone de alerta
- ✓ Contador de duplicatas encontradas
- ✓ Modal com scrolling se muitas duplicatas
- ✓ Checkboxes para seleção individual
- ✓ Contador em tempo real de seleções

### Deleção
- ✓ Valida seleção antes de deletar
- ✓ Feedback visual (botão desabilitado se vazio)
- ✓ Deleta em batch de forma eficiente
- ✓ Re-sincroniza jornadas automaticamente
- ✓ Re-detecta após deleção

### Notificações
- ✓ Toast de alerta ao detectar (8 segundos)
- ✓ Toast de sucesso ao deletar
- ✓ Toast de erro se falhar
- ✓ Mensagens claras em português

---

## Casos de Uso

### Cenário 1: Importação com duplicatas
1. Usuário importa Excel com férias
2. Sistema detecta que colaborador já tinha férias no mesmo período
3. Alerta durante importação (modal de conflitos)
4. Usuário resolve conflitos
5. Após importar, nova detecção identifica duplicatas (se houver)
6. Badge aparece
7. Usuário corrige via modal

### Cenário 2: Dados legados com duplicatas
1. Sistema migrou de outro software
2. Alguns colaboradores têm duplicatas
3. Página abre, detecta e alerta
4. RH/Admin corrige via modal

### Cenário 3: Erro de digitação
1. Gerente cria férias manualmente
2. Digita duas vezes por engano
3. Sistema detecta e alerta
4. Gerente deleta a duplicada

---

## Prioridades Recomendadas

**Qual féria MANTER (em ordem de prioridade):**

1. **Aprovada** - Aproveita confirmação, manter
2. **Em gozo** - Férias em andamento, manter se presente
3. **Concluída** - Já passou, pode deletar a outra
4. **Pendente** - Aguardando aprovação, deletar se houver outra

**Regra geral:** Manter a féria com status mais avançado, deletar as demais.

---

## Limitações e Notas

### O que detecta
- Férias com **mesma data inicial E data final** em mesmo ano/período
- Agrupa por **colaborador + período_aquisitivo + ano do início**

### O que NÃO detecta
- Férias com datas ligeiramente diferentes (ex: 15-20 vs 15-21)
- Férias em períodos diferentes (ex: 2023/2024 vs 2024/2025)
- Férias com status "Recusada" (são ignoradas)

### Performance
- Busca todas as férias ativas (eficiente com índices)
- Agrupa em memória (rápido)
- Deleção em batch de até 200 registros
- Re-sincronização de jornadas automática

---

## Testes Recomendados

### Teste 1: Detecção
1. Criar 2 férias iguais para mesmo colaborador
2. Abrir página Férias
3. Verificar badge e toast
4. Abrir modal e confirmar duplicatas mostradas

### Teste 2: Deleção
1. No modal de duplicatas
2. Marcar checkbox de uma féria
3. Clicar "Deletar Selecionadas"
4. Confirmar toast de sucesso
5. Modal fecha
6. Badge desaparece

### Teste 3: Re-detecção
1. Após deletar, badge deve desaparecer
2. Se houver mais duplicatas, badge se atualiza
3. Contador reflete número correto

### Teste 4: Importação
1. Importar Excel com férias que duplicam as existentes
2. Modal de conflitos deve aparecer
3. Escolher continuar
4. Após importar, detectar duplicatas
5. Corrigir via modal

---

## Troubleshooting

### Badge não aparece
- Verifique se há duplicatas reais no banco
- Tente refresh F5 na página
- Verifique console.log para erros

### Modal não abre
- Clique no badge novamente
- Tente refresh F5
- Verifique se não há erro em console

### Deletar não funciona
- Selecione pelo menos uma féria
- Botão "Deletar Selecionadas" deve estar ativo
- Verifique se tem permissões de delete
- Veja erros no console

### Re-detecção não atualiza
- Página precisa de reload manual às vezes
- Tente refresh F5 após deletar
- Sistema tenta re-detectar automaticamente

---

## Changelog

### v1.0 (Atual)
- ✓ Detecção automática de duplicatas
- ✓ Modal interativo com checkboxes
- ✓ Deleção em batch
- ✓ Notificações visuais
- ✓ Re-sincronização de jornadas
- ✓ Integração com importação Excel

---

## Próximas Melhorias Sugeridas

1. **Auto-corrige** - Deletar duplicatas automaticamente mantendo Aprovada
2. **Relatório** - Exportar histórico de duplicatas encontradas/corrigidas
3. **Agendamento** - Verificação periódica de duplicatas
4. **Audit trail** - Log de qual féria foi deletada e quem deletou
5. **Sugestão inteligente** - Indicar automaticamente qual deletar

---

## Suporte

Para dúvidas ou problemas, consulte:
- Documentação de férias: `MELHORIAS_FERIAS_JORNADA.md`
- Código: `src/lib/ferias.functions.ts` e `src/routes/_app/ferias.tsx`
- Commits: `feat: detectar e remover férias duplicadas com mesmo ano/período`
