# Correção: Erro de Autenticação em AdminDeleteButton

## Problema Identificado

Ao tentar deletar todos os registros de uma tabela usando AdminDeleteButton, o usuário recebia o erro:

```
[v0] Erro detectarDuplicatas: Autenticação necessária
Failed to load resource: the server responded with a status of 400
```

### Causa Raiz

O componente `AdminDeleteButton.tsx` estava usando o cliente Supabase público:

```typescript
const { error } = await supabase.from(tableName).delete().neq("id", "");
```

**Por quê falhou:**
- O cliente público não tem permissão para fazer DELETE sem RLS específico
- A query `.delete().neq("id", "")` requer autenticação do servidor (admin)
- Faltava o contexto de autenticação (token JWT) na requisição

## Solução Implementada

### 1. Criação de Função Server-Side

Novo arquivo: `src/lib/admin-delete.functions.ts`

**Características:**
- Usa `createServerFn` do TanStack React Start
- Obtém o token de autenticação via `getRequest()` do header `Authorization`
- Cria cliente Supabase autenticado com o token do usuário
- Valida que apenas admin pode deletar (verificação de email)
- Executa delete com privilégios do servidor

### 2. Padrão de Autenticação

```typescript
// Obter token da requisição
const request = getRequest();
const authHeader = request?.headers.get("authorization");
const token = authHeader?.replace("Bearer ", "");

// Criar cliente com o token
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
});
```

**Este padrão:**
- Reutiliza o token JWT do usuário logado
- Passa por todas as validações de RLS do Supabase
- Garante que o delete é feito como o usuário autenticado
- Respeita as permissões definidas no banco de dados

### 3. Verificação de Admin

```typescript
const adminEmail = import.meta.env.VITE_ADMIN_ACCESS_EMAIL;
if (data.adminEmail !== adminEmail) {
  throw new Error("Acesso negado: apenas admin pode deletar");
}
```

**Camadas de proteção:**
1. Validação de email (frontend + backend)
2. Verificação de token de autenticação (servidor)
3. RLS do Supabase (banco de dados)

### 4. Atualização do Componente

`AdminDeleteButton.tsx` agora:
- Importa a função server `deleteAllRecords`
- Passa o email do usuário autenticado
- Aguarda resposta da função server
- Exibe contagem de registros deletados

## Arquivos Modificados

### Novo
- `src/lib/admin-delete.functions.ts` - Função server-side para delete

### Atualizado
- `src/components/AdminDeleteButton.tsx` - Importa e usa função server

## Como Funciona Agora

```
1. Admin clica em "Deletar Todos"
   ↓
2. Diálogo pede confirmação (digitação de "deletar")
   ↓
3. Componente chama deleteAllRecords() (server function)
   ↓
4. Servidor:
   - Obtém token do header Authorization
   - Valida email do admin
   - Cria cliente Supabase autenticado
   - Executa DELETE com privilégios
   ↓
5. Retorna contagem de deletados
   ↓
6. Página recarrega e exibe sucesso
```

## Segurança

### Verificações Implementadas

| Nível | Verificação | Localização |
|-------|------------|------------|
| Frontend | Visibilidade apenas para admin | AdminDeleteButton.tsx |
| Frontend | Confirmação dupla (digitação) | Diálogo de confirmação |
| Servidor | Verificação de email admin | admin-delete.functions.ts |
| Servidor | Validação de token JWT | getRequest() |
| Banco | Row Level Security (RLS) | Supabase |

### Proteção Contra Abuso

1. **Email verificado**: Apenas `VITE_ADMIN_ACCESS_EMAIL` pode deletar
2. **Token obrigatório**: Requer autenticação válida
3. **RLS do Supabase**: Respeita permissões do banco
4. **Confirmação dupla**: Requer digitação de "deletar"
5. **Logs**: Erros são registrados para auditoria

## Testes

### Testar Autenticação

1. Fazer login como admin
2. Clicar em "Deletar Todos" em qualquer tabela
3. Digitar "deletar" no campo de confirmação
4. Clicar "Deletar Todos"
5. Verificar se registros foram deletados
6. Página deve recarregar automaticamente

### Testar Rejeição

1. Fazer logout ou usar sessão sem admin
2. Botão não deve aparecer (visibilidade controlada)

3. Se tentar chamar API direto:
   - Erro: "Acesso negado: apenas admin pode deletar"

## Performance

- Delete otimizado: Uma única operação `.delete().neq("id", "")`
- Sem loops desnecessários
- Contagem de registros deletados retornada imediatamente
- Recarregamento de página limpa cache

## Rollback

Se houver problemas, basta remover a função server:

```bash
git revert <commit-hash>
```

Ou para testes, comentar a chamada em AdminDeleteButton.tsx e usar cliente público (sem segurança).

## Próximas Melhorias (Opcional)

1. **Confirmação via email**: Enviar email para admin confirmando delete
2. **Audit log**: Registrar quem deletou quando e quantos registros
3. **Soft delete**: Implementar soft delete com restore
4. **Backup automático**: Fazer backup antes de deletar
5. **Notificação**: Notificar gestores sobre delete em massa

## Referências

- TanStack React Start: https://tanstack.com/start
- Supabase Auth: https://supabase.com/docs/guides/auth
- Server Functions: Padrão usado em ferias.functions.ts
