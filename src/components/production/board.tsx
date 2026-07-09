'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatBRL } from '@/lib/format'
import { STAGES, STAGE_LABELS, nextStage, prevStage, type Stage } from '@/lib/production/stages'
import { urgencyFor, type Urgency } from '@/lib/production/urgency'
import type { BoardQuote } from '@/lib/production/queries'
import { setProductionStage, archiveQuote } from '@/app/(app)/producao/actions'
import { PendencyPanel } from './pendency-panel'
import type { Pendency } from '@/lib/production/queries'

const URGENCY_CLASS: Record<Urgency, string> = {
  atrasado: 'text-red-600 font-semibold',
  urgente: 'text-amber-600 font-semibold',
  futuro: 'text-muted-foreground',
  'sem-data': 'text-muted-foreground italic',
}

export function Board({ quotes, todayISO, pendenciesByQuote }: {
  quotes: BoardQuote[]; todayISO: string; pendenciesByQuote: Record<string, Pendency[]>
}) {
  const router = useRouter()
  const [dragId, setDragId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  async function move(id: string, stage: Stage) {
    await setProductionStage(id, stage)
    router.refresh()
  }
  async function conclude(id: string) {
    await archiveQuote(id)
    router.refresh()
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {STAGES.map(stage => {
        const cards = quotes.filter(q => (q.production_stage ?? 'pendente') === stage)
        return (
          <div key={stage}
            onDragOver={e => e.preventDefault()}
            onDrop={() => { if (dragId) { move(dragId, stage); setDragId(null) } }}
            className="w-64 shrink-0 rounded-lg bg-muted/70 p-2">
            <h3 className="mb-2 px-1 text-sm font-semibold">
              {STAGE_LABELS[stage]} <span className="text-muted-foreground">({cards.length})</span>
            </h3>
            <div className="space-y-2">
              {cards.map(q => {
                const urg = urgencyFor(q.delivery_date, todayISO)
                const prev = prevStage(stage)
                const next = nextStage(stage)
                return (
                  <div key={q.id} draggable onDragStart={() => setDragId(q.id)}
                    className="rounded border bg-background p-2 text-sm shadow-sm">
                    <p className="font-medium">{q.customer_name}</p>
                    <p className={URGENCY_CLASS[urg]}>
                      {q.delivery_date
                        ? new Date(q.delivery_date + 'T12:00:00').toLocaleDateString('pt-BR')
                        : 'sem data'}
                    </p>
                    <p className="text-muted-foreground">{formatBRL(q.total)}</p>
                    {q.open_pendencies > 0 && (
                      <p className="text-xs text-amber-700">{q.open_pendencies} pendência(s)</p>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <button disabled={!prev} onClick={() => prev && move(q.id, prev)}
                        className="rounded border px-2 py-0.5 disabled:opacity-30" aria-label="Voltar etapa">‹</button>
                      <Link href={`/orcamentos/${q.id}`} className="text-xs underline">abrir</Link>
                      {next
                        ? <button onClick={() => move(q.id, next)}
                            className="rounded border px-2 py-0.5" aria-label="Avançar etapa">›</button>
                        : <button onClick={() => conclude(q.id)}
                            className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">Concluir</button>}
                    </div>
                    <button className="mt-1 text-xs underline text-muted-foreground"
                      onClick={() => setOpenId(openId === q.id ? null : q.id)}>
                      {openId === q.id ? 'ocultar pendências' : 'pendências'}
                    </button>
                    {openId === q.id && (
                      <PendencyPanel quoteId={q.id} pendencies={pendenciesByQuote[q.id] ?? []} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
