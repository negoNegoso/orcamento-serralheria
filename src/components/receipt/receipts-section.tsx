import Link from 'next/link'
import { formatBRL } from '@/lib/format'
import { receiptSummary } from '@/lib/receipt/financials'
import { SubmitButton } from '@/components/ui/submit-button'
import { createReceipt, deleteReceipt } from '@/app/(app)/orcamentos/[id]/recibo/actions'
import type { Receipt } from '@/lib/receipt/types'

export function ReceiptsSection({ quoteId, total, received, receipts }: {
  quoteId: string; total: number; received: number; receipts: Receipt[]
}) {
  const { balance, settled } = receiptSummary(total, received)
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">Recibos</h2>
        {settled
          ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Quitado</span>
          : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Em aberto</span>}
        <form action={createReceipt.bind(null, quoteId)} className="ml-auto">
          <SubmitButton size="sm" disabled={settled}>Novo recibo</SubmitButton>
        </form>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div><span className="text-muted-foreground">Recebido</span><p className="font-bold text-green-700">{formatBRL(received)}</p></div>
        <div><span className="text-muted-foreground">Saldo</span><p className="font-bold text-amber-700">{formatBRL(balance)}</p></div>
        <div><span className="text-muted-foreground">Total</span><p className="font-bold">{formatBRL(total)}</p></div>
      </div>

      {receipts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum recibo gerado.</p>
      ) : (
        <ul className="divide-y">
          {receipts.map(r => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="w-24">{new Date(r.receipt_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
              <span className="w-28 font-semibold">{formatBRL(Number(r.amount))}</span>
              <span className="flex-1 truncate text-muted-foreground">{r.payment_method || '—'}</span>
              <Link href={`/orcamentos/${quoteId}/recibo/${r.id}`} className="underline">Abrir</Link>
              <form action={deleteReceipt}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="quote_id" value={quoteId} />
                <SubmitButton variant="link" className="h-auto px-0 text-red-600 underline">excluir</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
