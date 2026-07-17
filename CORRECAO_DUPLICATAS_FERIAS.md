# Correção: Detecção de Férias Duplicadas - Retirada Temporária

## Problema Identificado

Após fazer deploy no Vercel, a funcionalidade de detecção de férias duplicadas causava erro 401:

```
Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY
```

### Causa

A funcionalidade usava `supabaseAdmin` que requer a variável de ambiente `SUPABASE_SERVICE_ROLE_KEY`. Esta chave:
- Não é fornecida automaticamente pelo Vercel
- Requer configuração manual de service role
- Não é seguro expor em variáveis de ambiente públicas

## O Que Foi Removido

### Código Removido
- `detectarFeriasDuplicadas()` - busca todas as férias para detectar duplicatas
- `deletarFeriasDuplicadas()` - deleta férias selecionadas
- Badge de alerta vermelho "⚠️ X Duplicatas"
- Modal interativo de correção
- Effect de detecção automática na página

### Arquivos Modificados
- `src/lib/ferias.functions.ts` - removidas as 2 server functions
- `src/routes/_app/ferias.tsx` - removidas UI, states, imports

### Impacto
- ✅ Página de Férias agora carrega normalmente
- ✅ Sem erros 401 no console
- ✅ Funcionalidades existentes mantidas (importar, exportar, solicitar, aprovar)
- ❌ Detecção de duplicatas não disponível

## Soluções Futuras

### Opção 1: Usar RLS (Recomendada)
Reescrever a detecção para usar Row Level Security:
- Usar cliente Supabase regular (não admin)
- Respeitar RLS policies existentes
- Buscar apenas dados que o usuário tem permissão

```typescript
export const detectarFeriasDuplicadas = createServerFn({ method: "POST" })
  .handler(async (): Promise<DetectarDuplicatasResult> => {
    const supabase = getServerSupabase(); // com contexto autenticado
    // Query respeitará RLS automaticamente
  });
```

### Opção 2: Endpoint Customizado
Criar um endpoint API com autenticação:
```
POST /api/ferias/detectar-duplicatas
```
- Executar com service role no backend
- Retornar dados filtrados por usuário
- Mais controle e segurança

### Opção 3: Ativar Service Role
Se a empresa quer detecção global de duplicatas:
1. Gerar service role key no Supabase
2. Adicionar `SUPABASE_SERVICE_ROLE_KEY` no Vercel project settings
3. Restaurar código original

## Próximas Melhorias

1. **Implementar com RLS** - Melhor segurança, respeita permissões
2. **Adicionar auditoria** - Log de quem detectou/corrigiu duplicatas
3. **Agendamento automático** - Verificar duplicatas periodicamente
4. **Relatório** - Gerar relatório de duplicatas encontradas

## Commits

- `9698856` - fix: remover detecção de duplicatas
- `e45ef3a` - feat: detectar e remover férias duplicadas (antes da remoção)
- `9a74219` - docs: documentação completa (antes da remoção)

## Status Atual

- Build: ✅ Passa
- Testes: ✅ Página carrega sem erros
- Produção: ✅ Deploy bem-sucedido
- Funcionalidade: ⏸️ Em espera de configuração de service role

## Observações

A estrutura do código para detecção permanece documentada em:
- `DETECCAO_DUPLICATAS_FERIAS.md` - documentação técnica original
- Git history - commits anteriores preservam o código

Quando a configuração de service role estiver disponível, o código pode ser restaurado com segurança.
