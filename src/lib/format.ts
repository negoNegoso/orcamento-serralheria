const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBRL(v: number): string {
  return brl.format(v)
}

export function parseDecimal(s: string): number {
  const t = String(s).trim()
  if (!t) return 0
  // pt-BR: quando há vírgula decimal, pontos são separador de milhar
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}
