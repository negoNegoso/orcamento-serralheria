'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/ui/spinner'

export function PhotoUpload({ folder, value, onChange }: {
  folder: string
  value: string | null
  onChange: (url: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError('')
    const supabase = createClient()
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${folder}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('fotos').upload(path, file)
    if (error) { setError('Falha no upload: ' + error.message); setBusy(false); return }
    const { data } = supabase.storage.from('fotos').getPublicUrl(path)
    onChange(data.publicUrl)
    setBusy(false)
  }

  return (
    <div className="space-y-2">
      {value && (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-20 w-20 rounded object-cover" />
          <button type="button" className="text-sm text-red-600 underline" onClick={() => onChange(null)}>Remover</button>
        </div>
      )}
      <input type="file" accept="image/*" onChange={onFile} disabled={busy} />
      {busy && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Enviando…
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
