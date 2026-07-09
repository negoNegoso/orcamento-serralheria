export type Urgency = 'atrasado' | 'urgente' | 'futuro' | 'sem-data'

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function urgencyFor(deliveryDate: string | null, todayISO: string): Urgency {
  const dd = (deliveryDate ?? '').trim()
  if (!dd) return 'sem-data'
  if (dd < todayISO) return 'atrasado'
  const amanha = addDaysISO(todayISO, 1)
  if (dd === todayISO || dd === amanha) return 'urgente'
  return 'futuro'
}
