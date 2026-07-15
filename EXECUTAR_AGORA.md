# ⚡ Executar Agora - Script gestor_atribuicoes

## O Erro Que Recebeu
```
new row violates row-level security policy for table "gestor_atribuicoes"
```

## Por Quê?
A tabela `gestor_atribuicoes` não existe no seu banco de dados Supabase, ou existe mas sem as políticas RLS (Row Level Security) configuradas corretamente.

## Como Resolver (3 passos)

### 1️⃣ Abra o Arquivo
Veja o arquivo: **`SCRIPT_GESTOR_ATRIBUICOES.sql`**

### 2️⃣ Copie Todo o Conteúdo
Selecione tudo (Ctrl+A) e copie (Ctrl+C)

### 3️⃣ Execute no Supabase
1. Vá para: https://app.supabase.com
2. Selecione seu projeto
3. Clique em **SQL Editor** (lado esquerdo)
4. Clique em **New Query**
5. Cole o script (Ctrl+V)
6. Clique em **Execute** (ou Ctrl+Enter)

## Pronto! ✅
Se não receber erros, a tabela foi criada com sucesso!

### Testar (opcional)
Cole este comando separadamente no SQL Editor:
```sql
SELECT COUNT(*) as total_atribuicoes FROM public.gestor_atribuicoes;
```

Deve retornar um número (quantidade de atribuições criadas).

---

## O que o Script Faz
- ✅ Cria tabela `gestor_atribuicoes` com estrutura correta
- ✅ Cria índices para performance
- ✅ Migra dados de gestores existentes automaticamente
- ✅ Ativa RLS (Row Level Security)
- ✅ Cria políticas de segurança para SELECT, INSERT, UPDATE, DELETE

## Erros Comuns

### Erro: "relation gestor_atribuicoes already exists"
Significa que a tabela já foi criada. Isso é normal se executou 2 vezes.
Solução: Apenas continue usando normalmente.

### Erro: "syntax error at or near"
Copie e cole o arquivo inteiro, não por partes.

### Erro: "column X does not exist"
Certifique-se que você está executando no projeto correto (rpyejdtxsuodagbvakhw).

---

## Após Executar
Volte à aplicação e atualize a página (F5). Agora pode criar gestores com múltiplas atribuições!
