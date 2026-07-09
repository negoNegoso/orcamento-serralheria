'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addPendency, togglePendency, updatePendency, deletePendency } from '@/app/(app)/producao/actions'
import type { Pendency } from '@/lib/production/queries'

export function PendencyPanel({ quoteId, pendencies }: { quoteId: string; pendencies: Pendency[] }) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')

  async function add() {
    if (!label.trim()) return
    await addPendency(quoteId, label)
    setLabel('')
    router.refresh()
  }

  function startEdit(p: Pendency) {
    setEditingId(p.id)
    setEditLabel(p.label)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditLabel('')
  }

  async function saveEdit(id: string) {
    if (editLabel.trim()) await updatePendency(id, editLabel)
    cancelEdit()
    router.refresh()
  }

  return (
    <div className="mt-2 space-y-1 border-t pt-2">
      <ul className="space-y-1">
        {pendencies.map(p => (
          <li key={p.id} className="flex items-center gap-2 text-xs">
            {editingId === p.id ? (
              <>
                <input autoFocus value={editLabel} onChange={e => setEditLabel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveEdit(p.id)
                    if (e.key === 'Escape') cancelEdit()
                  }}
                  className="flex-1 rounded border bg-background px-2 py-0.5 text-xs" />
                <button className="text-primary" aria-label="Salvar pendência"
                  onClick={() => saveEdit(p.id)}>✓</button>
                <button className="text-muted-foreground" aria-label="Cancelar edição"
                  onClick={cancelEdit}>×</button>
              </>
            ) : (
              <>
                <input type="checkbox" checked={p.done}
                  onChange={async () => { await togglePendency(p.id, !p.done); router.refresh() }} />
                <span className={p.done ? 'line-through text-muted-foreground' : ''}>{p.label}</span>
                <button className="ml-auto text-muted-foreground hover:text-foreground"
                  aria-label="Editar pendência" onClick={() => startEdit(p)}>✎</button>
                <button className="text-red-600" aria-label="Remover pendência"
                  onClick={async () => { await deletePendency(p.id); router.refresh() }}>×</button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-1">
        <input value={label} onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          placeholder="Nova pendência…" className="flex-1 rounded border bg-background px-2 py-0.5 text-xs" />
        <button onClick={add} className="rounded border px-2 text-xs">+</button>
      </div>
    </div>
  )
}
