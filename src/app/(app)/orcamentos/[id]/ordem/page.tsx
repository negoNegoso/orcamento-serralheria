import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { formatBRL } from '@/lib/format'
import { STAGE_LABELS } from '@/lib/production/stages'
import { WO_STATUS_LABELS } from '@/lib/work-order/status'
import { rollupByCategory } from '@/lib/work-order/variance'
import { fetchWorkOrder, fetchWorkOrderCosts, fetchWorkOrderTotals } from '@/lib/work-order/queries'
import { CategorySummary } from '@/components/work-order/category-summary'
import { CostTable } from '@/components/work-order/cost-table'
import type { PriceCategory } from '@/lib/config-types'

export default async function OrdemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, profile } = await getProfile()
  if (profile.role === 'vendedor') redirect(`/orcamentos/${id}`)

  const workOrder = await fetchWorkOrder(supabase, id)
  if (!workOrder) notFound()

  const [costs, totals, { data: categories }, { data: quote }] = await Promise.all([
    fetchWorkOrderCosts(supabase, workOrder.id),
    fetchWorkOrderTotals(supabase, workOrder.id),
    supabase.from('price_categories').select('id, slug, name, sort_order').order('sort_order'),
    supabase.from('quotes').select('customer_name').eq('id', id).single(),
  ])
  if (!totals) notFound()

  const rows = rollupByCategory(costs, (categories ?? []) as PriceCategory[])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Ordem de Serviço #{workOrder.number}</h1>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
          {WO_STATUS_LABELS[workOrder.status]}
        </span>
        {workOrder.production_stage && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            {STAGE_LABELS[workOrder.production_stage]}
          </span>
        )}
        <Link href={`/orcamentos/${id}`} className="ml-auto underline">
          ← {quote?.customer_name ?? 'Orçamento'}
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-2 rounded-xl border p-4 text-sm sm:grid-cols-4">
        <div>
          <span className="text-muted-foreground">Total do orçamento</span>
          <p className="font-bold">{formatBRL(totals.quote_total)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Planejado</span>
          <p className="font-bold">{formatBRL(totals.planned_total)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Custo real</span>
          <p className="font-bold">{formatBRL(totals.actual_total)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Margem</span>
          <p className={`font-bold ${totals.margin < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {formatBRL(totals.margin)}
          </p>
        </div>
      </section>

      <CategorySummary rows={rows} />
      <CostTable costs={costs} />
    </div>
  )
}
