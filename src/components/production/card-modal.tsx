'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { formatBRL } from '@/lib/format'
import { STAGE_LABELS, nextStage, prevStage, type Stage } from '@/lib/production/stages'
import { urgencyFor, type Urgency } from '@/lib/production/urgency'
import type { BoardQuote, Pendency } from '@/lib/production/queries'
import { PendencyPanel } from './pendency-panel'

const URGENCY_CLASS: Record<Urgency, string> = {
  atrasado: 'text-red-600 font-semibold',
  urgente: 'text-amber-600 font-semibold',
  futuro: 'text-muted-foreground',
  'sem-data': 'text-muted-foreground italic',
}

export function CardModal({ quote, todayISO, pendencies, onMove, onConclude, onClose }: {
  quote: BoardQuote
  todayISO: string
  pendencies: Pendency[]
  onMove: (id: string, stage: Stage) => void
  onConclude: (id: string) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const stage: Stage = quote.production_stage ?? 'pendente'
  const urg = urgencyFor(quote.delivery_date, todayISO)
  const prev = prevStage(stage)
  const next = nextStage(stage)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose} role="dialog" aria-modal="true" aria-label={`Orçamento de ${quote.customer_name}`}>
      <div className="w-full max-w-5xl rounded-lg bg-background p-6 shadow-xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-3xl font-semibold">{quote.customer_name}</h2>
            <p className="text-lg text-muted-foreground">{STAGE_LABELS[stage]}</p>
          </div>
          <button className="rounded border px-3 py-1 text-xl leading-none text-muted-foreground hover:text-foreground"
            aria-label="Fechar" onClick={onClose}>×</button>
        </div>

        <div className="mt-4 space-y-1 text-xl">
          <p className={URGENCY_CLASS[urg]}>
            Entrega: {quote.delivery_date
              ? new Date(quote.delivery_date + 'T12:00:00').toLocaleDateString('pt-BR')
              : 'sem data'}
          </p>
          <p className="text-muted-foreground">{formatBRL(quote.total)}</p>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button disabled={!prev} onClick={() => prev && onMove(quote.id, prev)}
            className="rounded border px-4 py-2 text-base disabled:opacity-30" aria-label="Voltar etapa">‹ Voltar</button>
          {next
            ? <button onClick={() => onMove(quote.id, next)}
                className="rounded border px-4 py-2 text-base" aria-label="Avançar etapa">Avançar ›</button>
            : <button onClick={() => onConclude(quote.id)}
                className="rounded bg-primary px-4 py-2 text-base text-primary-foreground">Concluir</button>}
          <Link href={`/orcamentos/${quote.id}`} className="ml-auto text-base underline">abrir orçamento</Link>
        </div>

        <div className="mt-6">
          <h3 className="text-xl font-semibold">Pendências</h3>
          <PendencyPanel quoteId={quote.id} pendencies={pendencies} large />
        </div>
      </div>
    </div>
  )
}
