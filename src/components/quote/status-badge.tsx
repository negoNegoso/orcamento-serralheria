import { Badge } from '@/components/ui/badge'

const map: Record<string, { label: string; cls: string }> = {
  rascunho: { label: 'Rascunho', cls: 'bg-gray-200 text-gray-800' },
  enviado: { label: 'Enviado', cls: 'bg-blue-100 text-blue-800' },
  aprovado: { label: 'Aprovado', cls: 'bg-green-100 text-green-800' },
  recusado: { label: 'Recusado', cls: 'bg-red-100 text-red-800' },
}

export function StatusBadge({ status }: { status: string }) {
  const s = map[status] ?? map.rascunho
  return <Badge variant="outline" className={s.cls}>{s.label}</Badge>
}
