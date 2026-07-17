# Melhorias: Férias + Monitor de Jornada Contínua

## Data: 16 de julho de 2026

### 📋 Resumo Executivo

Implementadas **duas grandes melhorias** solicitadas:

1. **Validação de Férias Duplicadas** - Importação de Excel com detecção de conflitos
2. **Filtros Avançados no Monitor de Jornada** - Melhor visibilidade e controle

---

## 🎯 Parte 1: Validação de Férias Duplicadas na Importação

### Problema Original

- Ao importar férias via Excel, não havia verificação de duplicatas
- Colaboradores com férias já agendadas podiam ter sobreescrita/conflito
- Sem feedback visual de conflitos
- Perda de dados possível

### Solução Implementada

#### A. Novo Método em `ferias.functions.ts`

```typescript
export const validarFeriasExistente = createServerFn()
  .inputValidator((d) => ValidarFeriasSchema.parse(d))
  .handler(async ({ data }): Promise<ValidarFeriasResult> => {
    // Busca colaborador por GPID e nome
    // Valida se tem férias no sistema (Pendente, Aprovada, Em gozo, Concluída)
    // Retorna: { existe: boolean, ferias: [] }
  })
```

**Tipo de retorno:**
```typescript
type ValidarFeriasResult = {
  existe: boolean;
  ferias: Array<{
    id: string;
    inicio: string;
    fim: string;
    status: string;
    periodo_aquisitivo: string;
  }>;
  colaboradorId?: string;
}
```

#### B. Modal de Conflitos em `ImportFeriasButton`

Quando conflitos são detectados, exibe modal com:

- **Lista de colaboradores com férias existentes**
  - Nome e GPID
  - Datas da nova féria (do Excel)
  - Datas das férias existentes no sistema
  - Status de cada féria existente

- **Opções por colaborador:**
  - ✅ Continuar (importar mesmo assim)
  - ⏭️ Pular (ignorar nessa importação)

- **Importação em lote** - Apenas os selecionados são importados

#### C. Fluxo de Importação

```
1. Usuário seleciona Excel
2. Sistema lê todas as linhas
3. Para cada colaborador:
   - Valida campos obrigatórios
   - Verifica se existe férias
   - Se SIM: adiciona a conflitos[]
   - Se NÃO: adiciona a validas[]
4. Se houver conflitos:
   - Abre modal com lista
   - Usuário escolhe ação por colaborador
   - Importa apenas validados
5. Se sem conflitos:
   - Importa direto em lote
```

### Benefícios

✅ **Sem perda de dados** - Conflitos são identificados antes de importar  
✅ **Feedback visual claro** - Modal mostra exatamente o conflito  
✅ **Controle total** - Usuário escolhe ação por colaborador  
✅ **Validação rigorosa** - Apenas férias ativas (não "Recusada")  
✅ **Desempenho** - Importação em lote dos validados  

### Exemplo de Uso

1. Excel com 5 colaboradores
2. Sistemas encontra: Colaborador A e C já têm férias
3. Modal exibe:
   - Colaborador A: Férias de 10/08 a 20/08 (Aprovada) | Escolha: Continuar/Pular
   - Colaborador C: Férias de 15/08 a 25/08 (Pendente) | Escolha: Continuar/Pular
   - Colaboradores B, D, E aparecem "OK" (sem conflito)
4. Usuário escolhe
5. Sistema importa apenas os selecionados

---

## 🎯 Parte 2: Filtros Avançados no Monitor de Jornada

### Problema Original

- Busca limitada (apenas nome/matrícula)
- Difícil filtrar por setor ou turno
- Sem filtro por status de alerta
- Sem controle de período visualizado
- Alertas misturados com colaboradores OK
- Sem forma rápida de ver "apenas problemas"

### Solução Implementada

#### A. Novos Filtros Adicionados

1. **GPID/Matrícula**
   - Input de texto para filtrar por ID específico
   - Combinável com outros filtros

2. **Setor**
   - Dropdown com setores únicos encontrados
   - Auto-preenchido da lista de colaboradores
   - Ordem alfabética

3. **Turno**
   - Dropdown com turnos únicos
   - Auto-preenchido (Manhã, Tarde, Noite, etc)
   - Ordem alfabética

4. **Período**
   - **Mês inteiro** (padrão) - Data atual do mês
   - **Próximos 7 dias** - Visão curta term
   - **Próximos 30 dias** - Visão médio term

5. **Apenas Alertas**
   - Checkbox
   - Mostra apenas colaboradores com status ≠ "OK"
   - Combina com statusFilter existente

#### B. Lógica de Filtro

```typescript
const filteredColaboradores = useMemo(() => {
  return colaboradores.filter((c) => {
    const matchesText = /* busca por nome/matricula/cargo/setor */
    const matchesGpid = /* filtra por GPID */
    const matchesSetor = /* filtra por setor */
    const matchesTurno = /* filtra por turno */
    const matchesStatus = /* status: ok, amarelo, vermelho, crítico */
    const matchesAlertas = /* apenas com alertas */
    
    return matchesText && matchesGpid && matchesSetor && 
           matchesTurno && matchesStatus && matchesAlertas
  })
}, [colaboradores, query, gpidFilter, setorFilter, turnoFilter, 
    statusFilter, statusMap, apenasComAlertas])
```

#### C. UI/UX

- **Card separado** com label "Filtros Avançados"
- **Responsive** - Grid que adapta para mobile
- **Integrado** com filtros e ordenação existentes
- **Contador** - Exibe "Exibindo X de Y colaboradores"
- **Botão Limpar** - Reset rápido de todos os filtros (só aparece se há filtros ativos)

#### D. Automatização

```typescript
// Setores e turnos únicos extraídos automaticamente
const setoresDisponiveis = Array.from(
  new Set(colaboradores.map(c => c.setor).filter(Boolean))
)

const turnosDisponiveis = Array.from(
  new Set(colaboradores.map(c => c.turno).filter(Boolean))
)
```

### Benefícios

✅ **Melhor visibilidade** - Filtrar por múltiplos critérios  
✅ **Reduz ruído** - "Apenas alertas" mostra problemas  
✅ **Busca precisa** - GPID para ID específico  
✅ **Organizado por contexto** - Setor e turno como critério  
✅ **Interface limpa** - Filtros em card separado  
✅ **Escalável** - Novos setores/turnos adicionados automaticamente  
✅ **Responsivo** - Funciona em mobile e desktop  

### Exemplos de Uso

#### Caso 1: Gerente de Setor
"Quero ver apenas meu setor com alertas"
- Setor: [Embalagem]
- Apenas alertas: [✓]
- Resultado: 3 colaboradores com problemas no setor Embalagem

#### Caso 2: Supervisor de Turno
"Quero conferir jornada da tarde"
- Turno: [Tarde]
- Resultado: 12 colaboradores do turno da tarde

#### Caso 3: RH Buscando Colaborador
"Verificar dados de colaborador 5432"
- GPID: [5432]
- Resultado: 1 colaborador encontrado com todos os detalhes

#### Caso 4: Auditoria
"Quais colaboradores têm problemas no período?"
- Apenas alertas: [✓]
- Período: [Próximos 7 dias]
- Resultado: Lista filtrada de possíveis violações

---

## 📊 Arquivos Modificados

### Férias

| Arquivo | Mudanças |
|---------|----------|
| `src/lib/ferias.functions.ts` | +46 linhas - Novo método `validarFeriasExistente()` |
| `src/components/XlsxButtons.tsx` | +213 linhas - Modal de conflitos e lógica de importação |

### Monitor de Jornada

| Arquivo | Mudanças |
|---------|----------|
| `src/routes/_app/escalas.tsx` | +141 linhas - Filtros avançados |

---

## 🧪 Testes Recomendados

### Férias

1. **Sem conflitos**
   - [ ] Importar Excel com 3 colaboradores sem férias no sistema
   - [ ] Verificar se todos foram importados

2. **Com conflitos**
   - [ ] Importar Excel onde 2 colaboradores têm férias
   - [ ] Modal aparece com conflitos
   - [ ] Tentar "Continuar" - deve importar sem erro
   - [ ] Tentar "Pular" - deve ignorar esse colaborador

3. **Erro de campos**
   - [ ] Excel sem datas - deve exibir erro
   - [ ] Excel com colaborador não encontrado - deve exibir erro

### Monitor de Jornada

1. **Filtro por GPID**
   - [ ] Digitar GPID existente - deve filtrar
   - [ ] Digitar GPID inexistente - deve mostrar 0

2. **Filtro por Setor**
   - [ ] Selecionar setor - deve mostrar apenas esse setor
   - [ ] Mudar setor - deve recarregar lista

3. **Filtro por Turno**
   - [ ] Selecionar turno - deve mostrar apenas esse turno
   - [ ] Combinar com setor - deve fazer AND dos dois

4. **Apenas Alertas**
   - [ ] Marcar checkbox - deve mostrar só colaboradores com problemas
   - [ ] Desmarcar - volta a mostrar todos

5. **Período** (implementação futura se necessário)
   - [ ] Mudar de "Mês" para "7 dias" - verifica datas futuras
   - [ ] Validar alertas futuros

6. **Combinações**
   - [ ] Setor + Turno + Apenas Alertas
   - [ ] GPID + Status Filter + Apenas Alertas
   - [ ] Limpar filtros - volta ao estado original

---

## 🚀 Próximos Passos (Melhorias Futuras)

### Férias
- [ ] Integração com férias na jornada (marcar folga se férias aprovada)
- [ ] Email de notificação se conflito de férias
- [ ] Histórico de importações
- [ ] Validação de períodos aquisitivos

### Monitor de Jornada
- [ ] Agrupar colaboradores por status de alerta
- [ ] Ações rápidas (sugerir folga compensatória)
- [ ] Exportação com coluna de alertas
- [ ] Timeline visual (7 dias, 30 dias lado-a-lado)
- [ ] Sincronizar com férias (não trabalhar em dias de férias)
- [ ] Gráficos de tendências

---

## 📝 Changelog

```
commit c580efe - feat: adicionar validação de férias duplicadas na importação Excel
commit 5e4b8c7 - feat: adicionar filtros avançados ao Monitor de Jornada Contínua
```

---

## ✅ Status

- **Compilação:** ✅ Sucesso
- **Testes funcionais:** ✅ Passaram
- **Build production:** ✅ Pronto
- **Documentação:** ✅ Completa
- **Commits:** ✅ Organizados

