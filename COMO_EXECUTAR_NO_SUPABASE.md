# Como Executar o Script SQL no Supabase

## Problema
A aplicação está retornando erro: `Could not find the table 'public.gestor_atribuicoes' in the schema cache`

Isso significa que a tabela ainda não foi criada no seu banco de dados Supabase.

## Solução: Execute o Script SQL Manualmente

### Passo 1: Abra o Supabase SQL Editor
1. Acesse seu projeto no Supabase (https://app.supabase.com)
2. No menu lateral, clique em **SQL Editor**
3. Clique em **New Query** ou **+ New**

### Passo 2: Copie o Script SQL
1. Abra o arquivo `EXECUTE_NO_SUPABASE.sql` neste repositório
2. Copie TODO o conteúdo (Ctrl+C / Cmd+C)

### Passo 3: Cole no Supabase
1. No SQL Editor do Supabase, cole o script (Ctrl+V / Cmd+V)
2. Clique no botão verde **Execute** ou pressione **Ctrl+Enter**

### Passo 4: Verifique o Resultado
Após a execução, você verá:
- "success" em verde indicando que o script foi executado
- A tabela `gestor_atribuicoes` foi criada
- Os dados existentes foram migrados automaticamente

### Passo 5: Verificar a Tabela (Opcional)
Para confirmar que tudo funcionou, execute este comando:

```sql
SELECT * FROM public.gestor_atribuicoes LIMIT 5;
```

Se retornar resultados (ou tabela vazia se não há dados), a tabela foi criada com sucesso!

---

## Se der Erro

### Erro: "type 'turno_enum' does not exist"
**Solução:** Este tipo deve existir no seu banco. Verifique em **Database > Tables** se existe a tabela `gestores` com a coluna `turno` do tipo enum.

**Alternativa:** Se não existir, execute este comando primeiro:

```sql
CREATE TYPE public.turno_enum AS ENUM ('Manhã', 'Tarde', 'Noite');
```

### Erro: "relation 'gestores' does not exist"
**Solução:** A tabela `gestores` não existe ainda. Crie-a com este script:

```sql
CREATE TABLE IF NOT EXISTS public.gestores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  setor TEXT,
  cargo TEXT,
  turno public.turno_enum,
  teams_user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('UTC', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('UTC', NOW()) NOT NULL
);
```

### Erro: "constraint 'gestor_atribuicoes_gestor_id_fkey' already exists"
**Solução:** A tabela já foi criada. Isso é normal! Ignore o erro e continue. A aplicação agora funcionará.

---

## O que o Script Faz

1. **Cria a tabela `gestor_atribuicoes`** com:
   - `id` (UUID único)
   - `gestor_id` (referência ao gestor)
   - `setor` (nome do setor)
   - `cargo` (nome do cargo)
   - `turno` (Manhã, Tarde ou Noite)
   - `created_at` (data de criação)

2. **Cria índices** para melhor performance nas buscas

3. **Migra dados existentes** automaticamente:
   - Se um gestor tem `setor`, `cargo` e `turno` preenchidos na tabela `gestores`
   - Uma atribuição será criada automaticamente em `gestor_atribuicoes`

4. **Adiciona comentários** para documentação do banco

---

## Após a Execução

Agora você pode:

1. **Criar um novo gestor** com múltiplas atribuições
2. **Clique em "Atribuições"** para gerenciar processos
3. **Adicionar/Remover** processos do gestor sem limite

**Exemplo:**
- GABRIEL pode gerenciar "PROCESSO MASSA FRITA TORCIDA · Manhã"
- E também "EMBALAGEM TORCIDA · Tarde"
- Tudo simultaneamente!

---

## Suporte

Se continuaR com problemas:
1. Verifique se todos os comandos foram executados (verde = sucesso)
2. Atualize a página da aplicação (F5 ou Cmd+R)
3. Limpe o cache do navegador (Ctrl+Shift+Delete)
4. Tente novamente
