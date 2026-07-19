const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

/** 1..999 por extenso. */
function trioPorExtenso(n: number): string {
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100)
  const d = Math.floor((n % 100) / 10)
  const u = n % 10
  const parts: string[] = []
  if (c) parts.push(CENTENAS[c])
  if (d === 1) parts.push(DEZ_A_DEZENOVE[u])
  else {
    if (d) parts.push(DEZENAS[d])
    if (u) parts.push(UNIDADES[u])
  }
  return parts.join(' e ')
}

/** 1..999_999_999 por extenso, com vírgula/e entre grupos (regra usual pt-BR). */
function inteiroPorExtenso(n: number): string {
  const milhoes = Math.floor(n / 1_000_000)
  const milhares = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000
  const segs: string[] = []
  if (milhoes) segs.push(milhoes === 1 ? 'um milhão' : `${trioPorExtenso(milhoes)} milhões`)
  if (milhares) segs.push(milhares === 1 ? 'mil' : `${trioPorExtenso(milhares)} mil`)
  if (resto) segs.push(trioPorExtenso(resto))
  if (segs.length === 1) return segs[0]
  const last = segs.pop()!
  const usaE = resto > 0 && (resto < 100 || resto % 100 === 0)
  return segs.join(', ') + (usaE ? ' e ' : ', ') + last
}

/**
 * Valor monetário por extenso em pt-BR, para uso em contrato.
 * Ex.: 5320.5 → "cinco mil, trezentos e vinte reais e cinquenta centavos".
 */
export function valorPorExtenso(valor: number): string {
  const total = Math.round(Math.abs(valor) * 100)
  const reais = Math.floor(total / 100)
  const centavos = total % 100
  if (reais === 0 && centavos === 0) return 'zero reais'
  const parts: string[] = []
  if (reais > 0) {
    const texto = inteiroPorExtenso(reais)
    const nome = reais === 1 ? 'real' : 'reais'
    // "um milhão de reais" (grupo exato de milhão pede "de")
    parts.push(reais % 1_000_000 === 0 ? `${texto} de ${nome}` : `${texto} ${nome}`)
  }
  if (centavos > 0) parts.push(`${trioPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`)
  return parts.join(' e ')
}

/** Número do contrato: 8 primeiros caracteres do uuid do orçamento, maiúsculos, + ano. */
export function contractNumber(quoteId: string, createdAt: string | Date): string {
  const year = new Date(createdAt).getFullYear()
  return `${quoteId.replace(/-/g, '').slice(0, 8).toUpperCase()}/${year}`
}

export function contractPdfTitle(customerName: string, date: string | Date): string {
  const d = new Date(date).toLocaleDateString('pt-BR').replace(/\//g, '-')
  return `${d} - Contrato - ${customerName}`
}
