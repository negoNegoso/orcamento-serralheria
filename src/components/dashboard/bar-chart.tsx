export function BarChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-on-surface-variant">Sem dados no período.</p>
  }
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div>
      <div className="flex h-48 items-end justify-between gap-2 pt-4">
        {data.map((d, i) => (
          <div key={i} className="group relative flex-1">
            <div
              className="rounded-t-md bg-primary/70 transition-all group-hover:bg-primary"
              style={{ height: `${Math.max(2, Math.round((d.value / max) * 100))}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between gap-2">
        {data.map((d, i) => (
          <span key={i} className="label-caps flex-1 text-center text-on-surface-variant opacity-60">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}
