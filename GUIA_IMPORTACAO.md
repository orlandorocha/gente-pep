# Guia de Importação XLSX - Sistema Gente PEP

## 🎯 Objetivo
Importar dados em lote a partir de arquivos Excel (.xlsx) para o sistema, com **máxima tolerância a erros** e **garantia de importação** de todos os registros válidos.

---

## 📊 O que Pode Ser Importado

### 1. **Férias** 
**Arquivo esperado:** `.xlsx` com colunas
- `periodo_aquisitivo` (ex: "2024/2025")
- `colaborador_id` ou `colaborador` (nome ou GPID)
- `inicio` (data YYYY-MM-DD)
- `fim` (data YYYY-MM-DD)

**Limitações:**
- Detecta férias duplicadas dentro do arquivo
- Valida se colaborador já tem férias agendadas
- Permite escolher se ignora ou importa mesmo com conflito

### 2. **Faltas**
**Arquivo esperado:** `.xlsx` com colunas
- `data` (data YYYY-MM-DD)
- `colaborador_id` ou `colaborador` (nome ou GPID)
- `motivo` (ex: "Falta", "Afastamento Médico")
- `periodo` (ex: "Integral", "Manhã", "Tarde")
- `observacao` (opcional)

**Limitações:**
- Remove duplicatas por colaborador + data + motivo
- Processa em lotes de 500 registros
- Ignora observações muito longas

### 3. **Colaboradores**
**Arquivo esperado:** `.xlsx` com colunas
- `nome` ✅ obrigatório
- `gpid` ✅ obrigatório (identificador único)
- `email` (opcional, padrão: gpid@empresa.local)
- `cargo` (opcional)
- `area` (opcional)
- `turno` (opcional: "Manhã", "Tarde", "Noite")
- `status` (opcional: "Ativo", "Inativo", "Afastado")
- `gestor_id` ou `gestor` (opcional, nome do gestor)

**Limitações:**
- GPID deve ser único
- Detecta duplicatas e permite escolher: atualizar ou manter
- Processa em lotes de 500 registros

### 4. **Agendamentos**
**Arquivo esperado:** `.xlsx` com colunas
- `colaborador_id` ou `colaborador` (nome ou GPID)
- `tipo` (ex: "De bem com a vida", "Aniversário", "Hora Extra")
- `titulo` (opcional, usa tipo se não preenchido)
- `data` (YYYY-MM-DD)
- `hora` (HH:MM)
- `prioridade` (opcional: "Baixa", "Média", "Alta")
- `status` (opcional: "Agendado", "Realizado", "Cancelado")
- `observacao` (opcional)

**Limitações:**
- Não importa se já existe agendamento na mesma data/hora/tipo
- Processa em lotes de 200 registros

---

## 🔄 Fluxo de Importação

### Antes (Sistema Antigo) ❌
```
┌─────────────────────────────────┐
│  Arquivo Excel (1000 registros) │
└────────────┬────────────────────┘
             │
             ▼
    ┌─────────────────────────┐
    │  Processa em lotes      │
    │  (200 registros/lote)   │
    └─────────┬───────────────┘
              │
              ▼
         ┌──────────────┐
         │ Lote falha?  │
         └─┬──────────┬─┘
           │          │
        NÃO│          │SIM
           │    ┌─────▼─────┐
           │    │ Tenta     │
           │    │ 1 por 1   │
           │    └─────┬─────┘
           │          │
           ▼          ▼
        ┌──────────────────────────┐
        │ PROBLEMA: Se falhar      │
        │ nessa segunda tentativa, │
        │ PERDE 200 registros!     │
        └──────────────────────────┘

RESULTADO: ❌ Muitos registros perdidos
```

### Depois (Sistema Novo) ✅
```
┌─────────────────────────────────┐
│  Arquivo Excel (1000 registros) │
└────────────┬────────────────────┘
             │
             ▼
    ┌─────────────────────────────┐
    │ Para CADA registro:         │
    │ ├─ Tenta inserir           │
    │ ├─ Se falhar → registra    │
    │ │   erro específico        │
    │ └─ Continua com próximo    │
    └─────────┬───────────────────┘
              │
              ▼
    ┌─────────────────────────────┐
    │ RESULTADO:                  │
    │ ✅ 950 importados           │
    │ ⚠️  50 com erro (listados)   │
    └─────────────────────────────┘

RESULTADO: ✅ MÁXIMO de registros importados
```

---

## 🚀 Como Usar

### Passo 1: Preparar o Arquivo Excel
1. Abra o Excel/Google Sheets
2. Preencha as colunas conforme esperado
3. **Salve como `.xlsx`** (não use `.xls` ou `.csv`)
4. Verifique nomes das colunas (case-insensitive, mas deve ter as obrigatórias)

### Passo 2: Navegar até o Módulo
- **Férias:** Menu → Férias → Botão "Importar XLSX"
- **Faltas:** Menu → Faltas → Botão "Importar XLSX"  
- **Colaboradores:** Menu → Colaboradores → Botão "Importar XLSX"
- **Agendamentos:** Menu → Agendamentos → Botão "Importar XLSX"

### Passo 3: Selecionar Arquivo
1. Clique no botão "Importar XLSX"
2. Selecione seu arquivo `.xlsx`
3. Sistema começa a processar automaticamente

### Passo 4: Revisar Resultado
- **Sucesso:** Toast verde mostrando "X importados. Y erros."
- **Com Erros:** Diálogo aparece listando cada erro
- **Conflitos:** (Férias/Colaboradores) Permite escolher por item

---

## ⚠️ Tratamento de Conflitos

### Férias com Conflitos
```
Colaborador já tem férias no período?
├─ Mostrar: Férias existentes (datas, status)
└─ Escolher por item:
   ├─ Pular (não importa)
   └─ Continuar (importa mesmo com conflito)
```

### Colaboradores Duplicados
```
GPID já existe?
├─ Mostrar: Dados atuais vs. novos
└─ Escolher por linha:
   ├─ Manter (dados antigos)
   └─ Atualizar (dados novos)
```

---

## 📈 Estatísticas de Importação

Após cada importação, você vê:
```
✅ 950 férias importadas. 50 erros.
```

**O que significa:**
- ✅ 950 foram processadas com sucesso
- ⚠️  50 tiveram problemas (listadas no diálogo)

### Diálogo de Erros
Mostra cada erro especificamente:
```
Linha 15: colaborador "João Silva" não encontrado
Linha 42: data inválida
Linha 78: data fim < data início
```

---

## 💡 Dicas Importantes

### ✅ Faça Assim
- ✓ Use datas no formato **YYYY-MM-DD** (2024-12-31)
- ✓ Deixe colunas **vazias** para campos opcionais
- ✓ Use nomes de colaboradores **completos e corretos**
- ✓ Revise o arquivo Excel **antes de importar**
- ✓ Salve como **`.xlsx`** (não PDF, não CSV)

### ❌ Não Faça Assim
- ✗ Não use datas em formato "31/12/2024"
- ✗ Não deixe "---" ou "N/A" em campos obrigatórios
- ✗ Não use nomes de colaboradores incompletos
- ✗ Não importe com arquivo aberto em outro programa
- ✗ Não copie/cole de PDF diretamente

---

## 🔧 Tratamento de Erros Comuns

| Erro | Causa | Solução |
|------|-------|---------|
| `colaborador "X" não encontrado` | Nome digitado errado ou não cadastrado | Verificar grafia, usar GPID se disponível |
| `data inválida` | Formato errado ou vazio | Use YYYY-MM-DD (2024-12-31) |
| `campos obrigatórios faltando` | Coluna importante vazia | Preencha as colunas obrigatórias |
| `período aquisitivo inválido` | Formato errado | Use AAAA/AAAA (2024/2025) |
| `data fim < data início` | Datas invertidas | Verifique se fim > início |
| `agendamento já existe` | Duplicata por data/hora/tipo | Use data/hora/tipo diferentes |

---

## 📋 Checklist Pré-Importação

Antes de importar, verifique:

- [ ] Arquivo é `.xlsx`
- [ ] Todas as colunas obrigatórias preenchidas
- [ ] Sem espaços extras nos nomes
- [ ] Datas em formato YYYY-MM-DD
- [ ] Sem linhas duplicadas
- [ ] Nomes de colaboradores existem no sistema
- [ ] Arquivo não está aberto em outro programa
- [ ] Nomes das colunas correspondem ao esperado

---

## 🎁 Benefícios da Nova Abordagem

✅ **100% de Taxa de Sucesso** - Todos os válidos são importados
✅ **Resiliência** - Erros isolados não param a importação
✅ **Transparência** - Você vê exatamente o que falhou
✅ **Segurança** - Nunca perde dados válidos
✅ **Performance** - Processa lotes ainda assim eficientemente
✅ **Feedback** - Diálogo detalhado com cada erro

---

## 📞 Suporte

Se tiver dúvidas:
1. Verifique o **Checklist Pré-Importação** acima
2. Revise o arquivo Excel usando os **Dicas Importantes**
3. Procure o erro na tabela **Tratamento de Erros Comuns**
4. Se persiste, contacte o suporte técnico com screenshot do erro

---

**Sistema Gente PEP v2.0** - Importação Resiliente ✅
