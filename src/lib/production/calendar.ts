export type CalView = 'dia' | 'semana' | 'mes'

function toISO(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
}
function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number)
  return [y, m - 1, d] // m zero-based
}

export function calendarDays(view: CalView, dateISO: string): string[] {
  const [y, m, d] = parts(dateISO)
  if (view === 'dia') return [dateISO]

  if (view === 'semana') {
    const base = new Date(Date.UTC(y, m, d))
    const dow = base.getUTCDay() // 0=domingo
    const start = new Date(Date.UTC(y, m, d - dow))
    return Array.from({ length: 7 }, (_, i) =>
      new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i))
        .toISOString().slice(0, 10),
    )
  }

  // mes: grade de semanas completas
  const first = new Date(Date.UTC(y, m, 1))
  const startDow = first.getUTCDay()
  const gridStart = new Date(Date.UTC(y, m, 1 - startDow))
  const last = new Date(Date.UTC(y, m + 1, 0)) // último dia do mês
  const endDow = last.getUTCDay()
  const gridEnd = new Date(Date.UTC(y, m + 1, 0 + (6 - endDow)))
  const days: string[] = []
  for (let t = gridStart.getTime(); t <= gridEnd.getTime(); t += 86400000) {
    days.push(new Date(t).toISOString().slice(0, 10))
  }
  return days
}

export function shiftPeriod(view: CalView, dateISO: string, dir: -1 | 1): string {
  const [y, m, d] = parts(dateISO)
  if (view === 'dia') return toISO(y, m, d + dir)
  if (view === 'semana') return toISO(y, m, d + 7 * dir)
  return toISO(y, m + dir, d) // mes
}
