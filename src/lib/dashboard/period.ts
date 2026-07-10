export interface Period {
  start: string | null
  end: string | null
}

// Observação: fronteiras calculadas em UTC (deterministas e testáveis).
export function resolvePeriod(
  params: { range?: string; month?: string },
  now: Date = new Date(),
): Period {
  const { range, month } = params

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number)
    return {
      start: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
      end: new Date(Date.UTC(y, m, 1)).toISOString(),
    }
  }

  const y = now.getUTCFullYear()
  const mo = now.getUTCMonth()
  const d = now.getUTCDate()

  switch (range) {
    case 'mes':
      return {
        start: new Date(Date.UTC(y, mo, 1)).toISOString(),
        end: new Date(Date.UTC(y, mo + 1, 1)).toISOString(),
      }
    case '30d':
      return {
        start: new Date(Date.UTC(y, mo, d - 30)).toISOString(),
        end: new Date(Date.UTC(y, mo, d + 1)).toISOString(),
      }
    case 'ano':
      return {
        start: new Date(Date.UTC(y, 0, 1)).toISOString(),
        end: new Date(Date.UTC(y + 1, 0, 1)).toISOString(),
      }
    default:
      return { start: null, end: null }
  }
}
