'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const RANGES = [
  { key: 'mes', label: 'Mês atual' },
  { key: '30d', label: 'Últimos 30 dias' },
  { key: 'ano', label: 'Este ano' },
  { key: 'tudo', label: 'Tudo' },
]

export function PeriodFilter() {
  const router = useRouter()
  const sp = useSearchParams()
  const range = sp.get('range') ?? 'tudo'
  const month = sp.get('month') ?? ''

  return (
    <div className="flex flex-wrap items-center gap-2">
      {RANGES.map((r) => (
        <button
          key={r.key}
          onClick={() => router.push(`/admin/dashboard?range=${r.key}`)}
          className={cn(
            'label-caps rounded-full px-4 py-2 transition-colors',
            !month && range === r.key
              ? 'bg-primary text-primary-foreground'
              : 'border border-border bg-card text-on-surface-variant hover:bg-surface-container-low',
          )}
        >
          {r.label}
        </button>
      ))}
      <input
        type="month"
        value={month}
        onChange={(e) =>
          router.push(
            e.target.value
              ? `/admin/dashboard?month=${e.target.value}`
              : `/admin/dashboard?range=tudo`,
          )
        }
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
      />
    </div>
  )
}
