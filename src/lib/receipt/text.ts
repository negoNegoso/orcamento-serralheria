import { formatBRL } from '@/lib/format'

export function receiptDeclaration(customerName: string, total: number): string {
  return `Declaro que recebi de ${customerName} a importância de ${formatBRL(total)} referente à prestação dos serviços descritos abaixo.`
}

export function receiptPdfTitle(customerName: string, date: string | Date): string {
  const d = new Date(date).toLocaleDateString('pt-BR').replace(/\//g, '-')
  return `${d} - Recibo - ${customerName}`
}
