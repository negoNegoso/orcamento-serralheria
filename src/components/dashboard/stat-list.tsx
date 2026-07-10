export function StatList({
  rows,
}: {
  rows: { left: React.ReactNode; right: React.ReactNode }[]
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-on-surface-variant">Sem dados.</p>
  }
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center justify-between gap-2">
          <span className="text-on-surface">{r.left}</span>
          <span className="font-semibold">{r.right}</span>
        </li>
      ))}
    </ul>
  )
}
