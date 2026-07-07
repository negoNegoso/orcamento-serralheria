const map: Record<string, { label: string; cls: string }> = {
  rascunho: { label: 'Rascunho', cls: 'bg-amber-100 text-amber-800' },
  enviado: { label: 'Enviado', cls: 'bg-blue-100 text-blue-800' },
  aprovado: { label: 'Aprovado', cls: 'bg-green-100 text-green-800' },
  recusado: { label: 'Recusado', cls: 'bg-red-100 text-red-800' },
}

export function StatusBadge({ status }: { status: string }) {
  const s = map[status] ?? map.rascunho
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}
    >
      {s.label}
    </span>
  )
}
