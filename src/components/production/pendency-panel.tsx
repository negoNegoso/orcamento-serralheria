'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addPendency, togglePendency, deletePendency } from '@/app/(app)/producao/actions'
import type { Pendency } from '@/lib/production/queries'

export function PendencyPanel({ quoteId, pendencies }: { quoteId: string; pendencies: Pendency[] }) {
  const router = useRouter()
  const [label, setLabel] = useState('')

  async function add() {
    if (!label.trim()) return
    await addPendency(quoteId, label)
    setLabel('')
    router.refresh()
  }

  return (
    <div className="mt-2 space-y-1 border-t pt-2">
      <ul className="space-y-1">
        {pendencies.map(p => (
          <li key={p.id} className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={p.done}
              onChange={async () => { await togglePendency(p.id, !p.done); router.refresh() }} />
            <span className={p.done ? 'line-through text-muted-foreground' : ''}>{p.label}</span>
            <button className="ml-auto text-red-600"
              onClick={async () => { await deletePendency(p.id); router.refresh() }}>×</button>
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
