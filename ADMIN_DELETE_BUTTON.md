# AdminDeleteButton - Documentação

## O que é?

O `AdminDeleteButton` é um componente React reutilizável que permite que apenas administradores do sistema deletem **TODOS** os registros de uma tabela específica do banco de dados.

## Segurança

Este botão possui múltiplas camadas de segurança:

1. **Verificação de Admin**: O botão só aparece se o email do usuário logado corresponder ao `VITE_ADMIN_ACCESS_EMAIL` configurado no `.env.production`
   - Email configurado: `orlando.rocha@pepsico.com`

2. **Confirmação Dupla**:
   - Abre um diálogo de aviso
   - Requer que o usuário digite **"deletar"** para confirmar
   - Botão de ação fica desabilitado até que o texto correto seja digitado

3. **Aviso Visual**:
   - Ícone de alerta em vermelho (AlertTriangle)
   - Fundo com cor destrutiva
   - Mensagens claras sobre irreversibilidade

4. **Recarregamento**:
   - Após sucesso, a página é recarregada automaticamente para refletir as mudanças

## Uso

### Importação

```tsx
import { AdminDeleteButton } from "@/components/AdminDeleteButton";
```

### Implementação

```tsx
<AdminDeleteButton 
  tableName="ferias"
  label="Deletar Todos"
  description="Todos os registros de férias serão removidos permanentemente"
/>
```

### Props

| Prop | Tipo | Padrão | Descrição |
|------|------|--------|-----------|
| `tableName` | string | Obrigatório | Nome da tabela no Supabase |
| `label` | string | "Deletar Todos" | Texto do botão |
| `description` | string | "Esta ação não pode ser desfeita" | Descrição no diálogo |
| `variant` | string | "destructive" | Variante do botão (destructive, outline, etc) |

## Tabelas com AdminDeleteButton Implementado

- ✅ **ferias** - Férias (src/routes/_app/ferias.tsx)
- ✅ **faltas** - Faltas e absenteísmo (src/routes/_app/faltas.tsx)
- ✅ **colaboradores** - Colaboradores (src/routes/_app/colaboradores.tsx)
- ✅ **agendamentos** - Agendamentos (src/routes/_app/agendamentos.tsx)
- ✅ **escalas** - Escalas de jornada (src/routes/_app/escalas.tsx)
- ✅ **licencas** - Licenças (src/routes/_app/licencas.tsx)
- ✅ **tarefas** - Tarefas (src/routes/_app/tarefas.tsx)

## Comportamento Passo a Passo

1. **Usuário Admin clica no botão**
   ```
   Botão: "🗑️ Deletar Todos"
   ```

2. **Diálogo aparece com aviso**
   ```
   ⚠️ AVISO: Esta ação não pode ser desfeita!
   Tabela: ferias
   Digite "deletar" para confirmar:
   [Input vazio - BOTÃO DESABILITADO]
   ```

3. **Usuário digita "deletar"**
   ```
   Digite "deletar" para confirmar:
   [deletar - BOTÃO HABILITADO]
   ```

4. **Clica em "Deletar Todos"**
   ```
   ⏳ "Deletando..."
   ```

5. **Sucesso!**
   ```
   ✅ "Todos os registros de 'ferias' foram deletados!"
   🔄 Página recarrega automaticamente
   ```

6. **Erro (se houver)**
   ```
   ❌ "Erro ao deletar registros: [motivo]"
   ```

## Código Fonte

```typescript
// src/components/AdminDeleteButton.tsx
export function AdminDeleteButton({
  tableName,
  label = "Deletar Todos",
  description = "Esta ação não pode ser desfeita",
  variant = "destructive",
}: AdminDeleteButtonProps)
```

### Lógica Principal

```typescript
async function handleDeleteAll() {
  if (confirmText.toLowerCase() !== "deletar") {
    toast.error('Digite "deletar" para confirmar');
    return;
  }

  const { error } = await supabase
    .from(tableName)
    .delete()
    .neq("id", ""); // Delete all records
}
```

## Variáveis de Ambiente

```env
VITE_ADMIN_ACCESS_EMAIL="orlando.rocha@pepsico.com"
```

Se este valor não existir ou não corresponder ao email do usuário logado, o botão não será renderizado.

## Integração com Sistemas Existentes

- ✅ Usa `useAuth()` para obter email do usuário
- ✅ Usa `supabase` client para deletar registros
- ✅ Usa `toast` (sonner) para feedback
- ✅ Compatível com estrutura de diálogos existente
- ✅ Segue padrão de design da aplicação

## Testing

Para testar o componente:

1. Faça login com a conta de admin
2. Vá para qualquer página com o botão (ex: Férias)
3. Localize o botão "🗑️ Deletar Todos"
4. Clique e siga o fluxo de confirmação

## Troubleshooting

### Botão não aparece
- ✓ Verifique se `VITE_ADMIN_ACCESS_EMAIL` está definido em `.env.production`
- ✓ Verifique se você está logado com o email correto
- ✓ Verifique o console do navegador para erros

### Erro ao deletar
- ✓ Verifique se a tabela existe no Supabase
- ✓ Verifique as permissões (RLS policies)
- ✓ Verifique a conexão com o banco de dados

## Adicionar para Nova Tabela

Para adicionar o botão a uma nova tabela:

1. **Importe o componente**
   ```tsx
   import { AdminDeleteButton } from "@/components/AdminDeleteButton";
   ```

2. **Adicione na seção de ações**
   ```tsx
   <AdminDeleteButton 
     tableName="sua_tabela"
     label="Deletar Todos"
     description="Todos os registros serão removidos permanentemente"
   />
   ```

3. **Commit e deploy**
   ```bash
   git add .
   git commit -m "feat: adicionar AdminDeleteButton para tabela 'sua_tabela'"
   git push
   ```

## Considerações de Performance

- ⚡ Processa deletions de forma resiliente
- ⚡ Recarrega página após sucesso (garante sincronização)
- ⚡ Mostra loader durante a operação
- ⚡ Suporta grandes volumes de dados

## Segurança Adicional

Para aumentar a segurança, você pode:

1. **Adicionar OTP**: Enviar código para email do admin
2. **Log de auditoria**: Registrar quem deletou e quando
3. **Backup automático**: Fazer backup antes de deletar
4. **Agendamento**: Permitir apenas deleção em horários específicos

---

**Última atualização**: 2024
**Versão**: 1.0
