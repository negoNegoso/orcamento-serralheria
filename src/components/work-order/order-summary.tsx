import Link from 'next/link'
import { formatBRL } from '@/lib/format'
import { STAGE_LABELS } from '@/lib/production/stages'
import { WO_STATUS_LABELS } from '@/lib/work-order/status'
import { variancePercent } from '@/lib/work-order/variance'
import type { WorkOrder, WorkOrderTotals } from '@/lib/work-order/types'

export function OrderSummary({ quoteId, workOrder, totals, quoteUpdatedAt }: {
  quoteId: string
  workOrder: WorkOrder
  totals: WorkOrderTotals
  quoteUpdatedAt: string
}) {
  const pct = variancePercent(totals.planned_total, totals.actual_total)
  const estourou = totals.variance > 0
  const desatualizado = new Date(quoteUpdatedAt) > new Date(workOrder.quote_snapshot_at)

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">Ordem de Serviço #{workOrder.number}</h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
          {WO_STATUS_LABELS[workOrder.status]}
        </span>
        {workOrder.production_stage && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            {STAGE_LABELS[workOrder.production_stage]}
          </span>
        )}
        <Link href={`/orcamentos/${quoteId}/ordem`} className="ml-auto underline">
          Abrir OS →
        </Link>
      </div>

      {desatualizado && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Orçamento alterado depois da geração da OS — o planejado é a foto da aprovação.
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <span className="text-muted-foreground">Planejado</span>
          <p className="font-bold">{formatBRL(totals.planned_total)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Real</span>
          <p className={`font-bold ${estourou ? 'text-red-600' : ''}`}>
            {formatBRL(totals.actual_total)}
            {totals.variance !== 0 && (
              <span className="ml-1 text-xs font-semibold">
                {estourou ? '▲' : '▼'} {formatBRL(Math.abs(totals.variance))}
                {pct != null && ` (${pct > 0 ? '+' : ''}${pct}%)`}
              </span>
            )}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Margem</span>
          <p className={`font-bold ${totals.margin < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {formatBRL(totals.margin)}
          </p>
        </div>
      </div>
    </section>
  )
}
