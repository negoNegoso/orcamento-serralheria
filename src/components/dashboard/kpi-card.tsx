import { Icon } from '@/components/ui/icon'

export function KpiCard({
  label,
  value,
  icon,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  icon: string
  hint?: string
  tone?: 'default' | 'success' | 'warning'
}) {
  const toneCls =
    tone === 'success' ? 'text-green-600' : tone === 'warning' ? 'text-amber-600' : 'text-primary'
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="label-caps text-on-surface-variant">{label}</span>
        <Icon name={icon} className={toneCls} />
      </div>
      <div className={`text-2xl font-bold ${toneCls}`}>{value}</div>
      {hint && <p className="mt-1 text-sm text-on-surface-variant">{hint}</p>}
    </div>
  )
}
