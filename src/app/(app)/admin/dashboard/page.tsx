import Link from 'next/link'
import { getProfile } from '@/lib/auth'
import { formatBRL } from '@/lib/format'
import { resolvePeriod } from '@/lib/dashboard/period'
import { EMPTY_METRICS, type DashboardMetrics } from '@/lib/dashboard/types'
import { StatusBadge } from '@/components/quote/status-badge'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { BarChart } from '@/components/dashboard/bar-chart'
import { SectionCard } from '@/components/dashboard/section-card'
import { StatList } from '@/components/dashboard/stat-list'
import { PeriodFilter } from '@/components/dashboard/period-filter'

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; month?: string }>
}) {
  const { range, month } = await searchParams
  const { supabase } = await getProfile()
  const { start, end } = resolvePeriod({ range, month })
  const { data } = await supabase.rpc('dashboard_metrics', { p_start: start, p_end: end })
  const m = { ...EMPTY_METRICS, ...(data as DashboardMetrics | null) }

  const monthly = m.monthly.map((d) => ({
    label: new Date(d.month).toLocaleDateString('pt-BR', { month: 'short' }),
    value: Number(d.value),
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
      </div>

      <PeriodFilter />

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Total de orçamentos" value={String(m.kpis.total_count)} icon="description" />
        <KpiCard
          label="Valor aprovado"
          value={formatBRL(Number(m.kpis.approved_value))}
          icon="trending_up"
          tone="success"
        />
        <KpiCard
          label="Em aberto (enviado)"
          value={formatBRL(Number(m.kpis.open_value))}
          icon="schedule"
          tone="warning"
        />
        <KpiCard
          label="Taxa de conversão"
          value={`${Math.round(Number(m.kpis.conversion_rate) * 100)}%`}
          icon="percent"
          hint={`Ticket médio ${formatBRL(Number(m.kpis.avg_ticket))}`}
        />
      </section>

      {/* Funil + A vencer */}
      <section className="grid gap-3 md:grid-cols-2">
        <SectionCard title="Funil por status">
          <StatList
            rows={m.funnel.map((f) => ({
              left: STATUS_LABEL[f.status] ?? f.status,
              right: `${f.count} · ${formatBRL(Number(f.value))}`,
            }))}
          />
        </SectionCard>
        <SectionCard title="A vencer / vencidos">
          <StatList
            rows={[
              { left: 'Vencem em 7 dias', right: String(m.expiring.due_7_days) },
              {
                left: <span className="text-red-600">Já vencidos (enviados)</span>,
                right: <span className="text-red-600">{m.expiring.overdue}</span>,
              },
            ]}
          />
        </SectionCard>
      </section>

      {/* Evolução + Vendedores */}
      <section className="grid gap-3 md:grid-cols-2">
        <SectionCard title="Evolução por mês (valor)">
          <BarChart data={monthly} />
        </SectionCard>
        <SectionCard title="Ranking por vendedor">
          <StatList
            rows={m.sellers.map((s) => ({
              left: s.name,
              right: `${formatBRL(Number(s.approved_value))} · ${s.count}`,
            }))}
          />
        </SectionCard>
      </section>

      {/* Produtos + Recentes */}
      <section className="grid gap-3 md:grid-cols-2">
        <SectionCard title="Produtos mais orçados">
          <StatList
            rows={m.products.map((p) => ({
              left: p.product_name,
              right: `${p.times}×`,
            }))}
          />
        </SectionCard>
        <SectionCard title="Últimos orçamentos">
          {m.recent.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Nenhum orçamento.</p>
          ) : (
            <ul className="space-y-2">
              {m.recent.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/orcamentos/${r.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-container-low"
                  >
                    <span>{r.customer_name}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">{formatBRL(Number(r.total))}</span>
                      <StatusBadge status={r.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </section>
    </div>
  )
}
