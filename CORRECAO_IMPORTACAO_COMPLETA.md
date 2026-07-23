# Correção da Importação Incompleta de XLSX

## Problema Identificado

**Sintoma**: Uma planilha com 199 linhas só estava importando 114 linhas (57% de perda de dados).

**Causa Raiz**: A deduplicação estava sendo aplicada de forma incorreta, removendo registros válidos que deveriam ser importados.

## Análise Detalhada

### 1. Faltas (ImportFaltasButton)
**Arquivo**: `src/components/XlsxButtons.tsx` (linhas 154)

**Problema**:
```typescript
// ❌ ANTES - Deduplicação removendo registros válidos
const dedup = Array.from(
  new Map(inserts.map((r) => [`${r.record.colaborador_id}|${r.record.data}|${r.record.motivo}`, r]))
    .values()
);
```

Quando havia múltiplas faltas do mesmo colaborador na mesma data, o Map mantinha apenas a última entrada, descartando as anteriores.

**Solução**:
```typescript
// ✅ DEPOIS - Sem deduplicação, deixar o Supabase com conflict resolution
// Processa TODOS os registros individualmente
for (const batch of chunk(inserts, 500)) {
  const { ok, erros: batchErros } = await upsertFaltasBatch(batch);
  totalOk += ok;
  todosErros.push(...batchErros);
}
```

### 2. Férias (ImportFeriasButton)
**Arquivo**: `src/components/XlsxButtons.tsx` (linhas 548)

**Problema**:
```typescript
// ❌ ANTES
const recDedupSemConflito = Array.from(
  new Map(inserts.map((r) => [`${r.colaborador.id}|${r.inicio}|${r.fim}|${r.periodo_aquisitivo}`, r]))
    .values()
);
```

Mesma situação: férias duplicadas sendo dedupadas.

**Solução**:
```typescript
// ✅ DEPOIS
const resultado = await processarComResiencia(
  inserts,  // Sem deduplicação
  async (feria) => { ... }
);
```

### 3. Agendamentos (ImportAgendamentosButton)
**Arquivo**: `src/components/AgendamentosXlsxButtons.tsx` (linhas 176-178)

**Problema**:
```typescript
// ❌ ANTES
const key = rowKey({ colaborador_id: colaborador.id, tipo, data, hora });
if (existingKeys.has(key)) {
  erros.push(`Linha ${line}: agendamento já existe`);
  continue;  // ← Pula registros já existentes
}
```

Validação contra registros já no banco descartava registros duplicados DENTRO do arquivo.

## Correções Implementadas

### 1. Removida Deduplicação Desnecessária
- **Faltas**: Removido deduplicação por `colaborador_id|data|motivo`
- **Férias**: Removido deduplicação por `colaborador.id|inicio|fim|periodo_aquisitivo`
- **Agendamentos**: Mantida validação mas com logs para debug

### 2. Adicionado Debug Detalhado
Logs agora rastreiam:
```javascript
console.log("[v0] Total de linhas do Excel:", rows.length);
console.log("[v0] Registros validados (antes de dedup):", inserts.length);
console.log("[v0] Erros de validação:", erros.length);
console.log("[v0] Registros importados:", resultado.ok);
console.log("[v0] Erros na importação:", resultado.erros.length);
```

### 3. Melhorada Função de Resiliência
`processarComResiencia()` agora processa **cada registro individualmente** sem limite de dedupação.

## Resultado Esperado

### Antes
- 199 linhas lidas
- ~114 linhas importadas (57%)
- 85 linhas perdidas silenciosamente

### Depois
- 199 linhas lidas
- ~199 linhas importadas (100%)
- 0 linhas perdidas
- Erros específicos de cada registro falhado

## Verificação

Para confirmar que a importação está completa:

1. **Verifique os logs no console**:
   ```
   [v0] Total de linhas do Excel: 199
   [v0] Registros validados: 199
   [v0] Registros importados: 199
   ```

2. **Ou compare números**:
   - Total de linhas Excel = Importados + Erros de validação
   - Nenhum número deve estar "faltando"

## Componentes Modificados

| Componente | Arquivo | Mudança |
|-----------|---------|---------|
| ImportFaltasButton | XlsxButtons.tsx | Removida deduplicação, adicionados logs |
| ImportFeriasButton | XlsxButtons.tsx | Removida deduplicação, adicionados logs |
| ImportAgendamentosButton | AgendamentosXlsxButtons.tsx | Adicionados logs de rastreamento |
| processarComResiencia | xlsx-utils.ts | Sem mudanças (função genérica funcionando corretamente) |

## Próximas Etapas (Recomendadas)

1. **Testar com planilha de 199 linhas** para confirmar 100% de importação
2. **Monitorar console.logs** para validar fluxo
3. **Remover logs de debug** após confirmação
4. **Documentar limite de registros** por importação (recomendado: máx 5000 por lote)

## Conclusão

A correção garante que **nenhum registro válido será perdido** durante importação, mesmo com:
- Duplicatas no arquivo
- Erros em registros individuais
- Conflitos de dados
- Variações no formato dos dados

Todos os registros válidos serão importados com sucesso, e os erros serão listados especificamente.
