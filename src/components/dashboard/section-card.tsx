export function SectionCard({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="label-caps text-on-surface-variant">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}
