// src/components/quote/client-field.tsx
'use client'
import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { searchClients, type ClientHit } from '@/app/(app)/clientes/actions'

export interface ClientValue {
  clientId: string | null
  name: string
  phone: string
}

export function ClientField({ value, onChange }: {
  value: ClientValue
  onChange: (v: ClientValue) => void
}) {
  const [hits, setHits] = useState<ClientHit[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onNameChange(name: string) {
    onChange({ clientId: null, name, phone: value.phone })
    if (timer.current) clearTimeout(timer.current)
    if (name.trim().length < 2) { setHits([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      // falha na busca não bloqueia: segue como cliente novo
      try {
        const res = await searchClients(name)
        setHits(res)
        setOpen(res.length > 0)
      } catch {
        setHits([])
        setOpen(false)
      }
    }, 250)
  }

  function select(hit: ClientHit) {
    onChange({ clientId: hit.id, name: hit.name, phone: hit.phone })
    setOpen(false)
    setHits([])
  }

  function clear() {
    onChange({ clientId: null, name: '', phone: '' })
  }

  if (value.clientId) {
    return (
      <div className="space-y-1">
        <Label>Cliente *</Label>
        <div className="flex items-center gap-2 rounded border bg-muted/50 p-2 text-sm">
          <span className="font-medium">{value.name}</span>
          {value.phone && <span className="text-muted-foreground">· {value.phone}</span>}
          <button type="button" onClick={clear} aria-label="Trocar cliente"
            className="ml-auto text-muted-foreground underline">trocar</button>
        </div>
        <p className="text-xs text-muted-foreground">
          Para corrigir nome/telefone deste cliente, use a página Clientes.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="relative space-y-1">
        <Label>Nome *</Label>
        <Input value={value.name} onChange={e => onNameChange(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Digite para buscar ou criar" autoComplete="off" />
        {open && (
          <ul className="absolute z-10 w-full rounded border bg-card shadow">
            {hits.map(h => (
              <li key={h.id}>
                <button type="button" className="w-full p-2 text-left text-sm hover:bg-muted"
                  onMouseDown={() => select(h)}>
                  <span className="font-medium">{h.name}</span>
                  {h.phone && <span className="text-muted-foreground"> · {h.phone}</span>}
                </button>
              </li>
            ))}
            <li className="border-t p-2 text-xs text-muted-foreground">
              Nenhum desses? Continue digitando — cliente novo será criado ao salvar.
            </li>
          </ul>
        )}
      </div>
      <div className="space-y-1">
        <Label>Telefone/WhatsApp</Label>
        <Input inputMode="tel" value={value.phone}
          onChange={e => onChange({ ...value, phone: e.target.value })} />
      </div>
    </>
  )
}
