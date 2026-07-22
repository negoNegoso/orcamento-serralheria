const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

export function formatBRL(v: number): string {
  return brl.format(v)
}

export function formatPercent(v: number): string {
  return `${pct.format(v)}%`
}

export function parseDecimal(s: string): number {
  const t = String(s).trim()
  if (!t) return 0
  let normalized: string
  if (t.includes(',')) {
    // pt-BR: com vírgula decimal, pontos são separador de milhar
    normalized = t.replace(/\./g, '').replace(',', '.')
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    // sem vírgula mas pontos agrupando exatamente 3 dígitos: milhar pt-BR ("3.200" = 3200, "-1.200" = -1200)
    normalized = t.replace(/\./g, '')
  } else {
    normalized = t
  }
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

export function quotePdfTitle(customerName: string, createdAt: string | Date): string {
  const date = new Date(createdAt).toLocaleDateString('pt-BR').replace(/\//g, '-')
  return `${date} - Orçamento - ${customerName}`
}

// Nome de arquivo seguro pro PDF: remove separadores de caminho/ilegais e faz
// trim; se sobrar vazio, cai no fallback (nome padrão).
export function sanitizePdfName(name: string, fallback: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|]/g, '').trim()
  return cleaned || fallback
}
