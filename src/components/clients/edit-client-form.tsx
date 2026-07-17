'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateClient } from '@/app/(app)/clientes/actions'

export function EditClientForm({ client }: {
  client: { id: string; name: string; phone: string }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(client.name)
  const [phone, setPhone] = useState(client.phone)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) {
    return <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Editar</Button>
  }

  async function onSave() {
    setSaving(true); setError('')
    const res = await updateClient({ id: client.id, name, phone })
    if ('error' in res) { setError(res.error); setSaving(false); return }
    setOpen(false); setSaving(false)
    router.refresh()
  }

  return (
    <div className="w-full space-y-2 rounded border p-3">
      <div className="space-y-1"><Label>Nome *</Label>
        <Input value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="space-y-1"><Label>Telefone/WhatsApp</Label>
        <Input inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></div>
      <p className="text-xs text-amber-700">
        Alterar aqui atualiza o nome/telefone em TODOS os orçamentos deste cliente.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={saving || !name.trim()}>
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </div>
  )
}
