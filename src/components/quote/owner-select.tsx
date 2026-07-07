'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SubmitButton } from '@/components/ui/submit-button'
import { setQuoteOwner } from '@/app/(app)/orcamentos/actions'

export function OwnerSelect({ quoteId, currentOwnerId, users }: {
  quoteId: string
  currentOwnerId: string | null
  users: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [error, setError] = useState('')

  async function action(formData: FormData) {
    setError('')
    const newOwnerId = String(formData.get('owner') ?? '')
    const res = await setQuoteOwner(quoteId, newOwnerId)
    if ('error' in res) { setError(res.error); return }
    router.refresh()
  }

  return (
    <form action={action} className="flex items-center gap-2 text-sm">
      <label className="text-muted-foreground">Responsável:</label>
      <select name="owner" defaultValue={currentOwnerId ?? ''} className="rounded border bg-background p-1 text-sm">
        {currentOwnerId == null && <option value="">Sem vendedor</option>}
        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <SubmitButton size="sm" variant="outline">Alterar responsável</SubmitButton>
      {error && <span className="text-red-600">{error}</span>}
    </form>
  )
}
