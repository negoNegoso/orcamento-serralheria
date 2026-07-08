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
    // sucesso: a action redireciona para /; só chega aqui em caso de erro
    if (res?.error) { setError(res.error); setPending(false) }
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
