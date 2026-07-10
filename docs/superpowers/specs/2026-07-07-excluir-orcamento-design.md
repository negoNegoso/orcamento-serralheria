# Excluir orçamento

## Contexto

O sistema de orçamentos de serralheria permite criar, editar, clonar e apresentar
orçamentos, mas não há como removê-los. É preciso uma opção para excluir um
orçamento definitivamente.

## Objetivo

Permitir que o dono do orçamento (ou um admin) exclua um orçamento e seus itens
de forma definitiva, a partir da tela de detalhe, com confirmação.

## Fora de escopo

- Arquivar / soft delete (a exclusão é definitiva).
- Exclusão em lote ou a partir da lista.
- Lixeira / restauração.

## Decisões

- **Permissão:** dono do orçamento ou admin — reusa `canReassignOwner`
  (`src/lib/quotes/ownership.ts`), a mesma regra do reatribuir responsável.
- **Definitiva:** `delete from quotes` remove o cabeçalho; os `quote_items` são
  apagados por `on delete cascade` (já definido em `0001_schema.sql`). Não há
  migration nova — a RLS `q_all` (`for all to authenticated using(true)`) já
  permite delete.
- **Origem:** botão "Excluir" na tela de detalhe, ao lado de "Clonar".
- **Confirmação:** `window.confirm` nativo (não há componente de modal no design
  system).
- **Visibilidade:** o botão só aparece para quem pode excluir (`canReassign`, já
  calculado na página de detalhe).

## Componentes

### Server action `deleteQuote` (`src/app/(app)/orcamentos/actions.ts`)

```ts
export async function deleteQuote(id: string): Promise<{ error: string } | void> {
  const { supabase, user, profile } = await getProfile()

  const { data: quote, error: qErr } = await supabase
    .from('quotes').select('created_by').eq('id', id).single()
  if (qErr || !quote) return { error: 'Orçamento não encontrado' }

  if (!canReassignOwner({ role: profile.role, userId: user.id, quoteOwnerId: quote.created_by })) {
    return { error: 'Sem permissão para excluir' }
  }

  const { error } = await supabase.from('quotes').delete().eq('id', id)
  if (error) return { error: 'Erro ao excluir: ' + error.message }

  revalidatePath('/')
  redirect('/')
}
```

- `canReassignOwner` já está importado no arquivo (usado por `setQuoteOwner`).
- `redirect` (de `next/navigation`) já está importado (usado por `cloneQuote`).
- `redirect` lança `NEXT_REDIRECT`; fica fora de qualquer try/catch e só após o
  delete bem-sucedido.
- Retorna `{ error }` em caso de falha; em sucesso não retorna (redireciona).

### Client component `DeleteQuoteButton` (`src/components/quote/delete-quote-button.tsx`)

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { deleteQuote } from '@/app/(app)/orcamentos/actions'

export function DeleteQuoteButton({ quoteId }: { quoteId: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function onDelete() {
    if (!window.confirm('Excluir este orçamento? Esta ação não pode ser desfeita.')) return
    setPending(true); setError('')
    const res = await deleteQuote(quoteId)
    if (res?.error) { setError(res.error); setPending(false) }
    // sucesso: a action redireciona para /
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" onClick={onDelete}
        disabled={pending} className="text-red-700">
        {pending ? 'Excluindo…' : 'Excluir'}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
```

### Detalhe (`src/app/(app)/orcamentos/[id]/page.tsx`)

- Importar `DeleteQuoteButton`.
- No grupo de botões do cabeçalho (onde estão "Clonar" e "Apresentar /
  Compartilhar"), renderizar `<DeleteQuoteButton quoteId={quote.id} />`
  **somente quando `canReassign` for `true`**.

## Fluxo

1. Usuário com permissão clica "Excluir" no detalhe.
2. `window.confirm` pede confirmação.
3. Confirmado → `deleteQuote(id)` valida permissão no servidor, apaga o
   orçamento (cascade nos itens), revalida `/` e redireciona para a lista.
4. Sem permissão / erro → mensagem exibida abaixo do botão, sem redirecionar.

## Erros e segurança

- Dupla checagem de permissão: UI esconde o botão; a action revalida no servidor
  (defesa mesmo que alguém chame a action diretamente).
- Orçamento inexistente → `{ error: 'Orçamento não encontrado' }`.

## Testes

- `canReassignOwner` já é coberto por `src/lib/quotes/ownership.test.ts` (reuso).
- A action `deleteQuote` não recebe teste unitário, seguindo o padrão do repo
  (nenhuma server action tem teste). Verificação por `npm run lint` e
  `npm run build`.
