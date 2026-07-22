'use client'
import { useActionState, useState } from 'react'
import { formatBRL, parseDecimal } from '@/lib/format'
import { itemDisplayGross, quoteDisplayFooter } from '@/lib/pricing/display'
import { receiptDeclaration } from '@/lib/receipt/text'
import { maskCpfCnpj } from '@/lib/receipt/mask'
import type { Receipt } from '@/lib/receipt/types'
import { saveReceipt, type SaveReceiptState } from '@/app/(app)/orcamentos/[id]/recibo/actions'
import { SubmitButton } from '@/components/ui/submit-button'

/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */

function EditableInput({ value, onChange, placeholder, className = '', mask }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
  mask?: (v: string) => string
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(mask ? mask(e.target.value) : e.target.value)}
      placeholder={placeholder}
      inputMode={mask ? 'numeric' : undefined}
      className={`border-b border-dashed border-muted-foreground/40 bg-transparent px-1 outline-none focus:border-solid print:border-none print:placeholder-transparent ${className}`}
    />
  )
}

export function ReciboDocument({ company, quote, items, receipt }: {
  company: any; quote: any; items: any[]; receipt: Receipt
}) {
  const footer = quoteDisplayFooter(
    Number(quote.subtotal),
    (quote.discount_type ?? 'valor') as 'valor' | 'percent',
    Number(quote.discount),
    items.map(it => Number(it.extra_value ?? 0)),
    Number(quote.multiplier ?? 1),
  )
  const [amount, setAmount] = useState(Number(receipt.amount).toFixed(2).replace('.', ','))
  const [clientDoc, setClientDoc] = useState(receipt.payer_doc ?? '')
  const [receiptDate, setReceiptDate] = useState(receipt.receipt_date)
  const [payment, setPayment] = useState(receipt.payment_method ?? '')
  const [receiverName, setReceiverName] = useState(receipt.receiver_name || company?.receiver_name || '')
  const [receiverDoc, setReceiverDoc] = useState(receipt.receiver_doc || company?.cnpj || '')
  const [receiverMethod, setReceiverMethod] = useState(receipt.receiver_method ?? '')

  const amountNum = parseDecimal(amount)
  const displayDate = new Date(receiptDate + 'T12:00:00').toLocaleDateString('pt-BR')
  const [saveState, saveAction] = useActionState<SaveReceiptState, FormData>(saveReceipt, {})

  return (
    <article className="mx-auto max-w-3xl space-y-6 p-4 text-slate-800 print:p-0">
      {/* barra de ações (não imprime) */}
      <form action={saveAction} className="no-print flex flex-wrap items-end gap-3 rounded-xl border p-3">
        <input type="hidden" name="id" value={receipt.id} />
        <input type="hidden" name="quote_id" value={receipt.quote_id} />
        <input type="hidden" name="payer_doc" value={clientDoc} />
        <input type="hidden" name="payment_method" value={payment} />
        <input type="hidden" name="receiver_name" value={receiverName} />
        <input type="hidden" name="receiver_doc" value={receiverDoc} />
        <input type="hidden" name="receiver_method" value={receiverMethod} />
        <input type="hidden" name="receipt_date" value={receiptDate} />
        <label className="text-sm">Valor recebido
          <input name="amount" value={amount} onChange={e => setAmount(e.target.value)}
            inputMode="decimal" className="ml-2 w-32 rounded border px-2 py-1" />
        </label>
        <SubmitButton size="sm">Salvar recibo</SubmitButton>
        {saveState.error && <p className="w-full text-sm text-red-600">{saveState.error}</p>}
        {saveState.ok && <p className="w-full text-sm text-green-600">Recibo salvo.</p>}
      </form>

      {/* Header: card da marca + card do valor */}
      <header className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-2xl bg-primary p-6 text-primary-foreground">
          {company?.logo_url && <img src={company.logo_url} alt="" className="h-16 w-16 rounded-lg bg-white/20 object-contain p-1" />}
          <div>
            <p className="text-xl font-bold leading-tight">{company?.name}</p>
            {company?.cnpj && <p className="text-sm opacity-90">CNPJ: {company.cnpj}</p>}
            <p className="text-sm opacity-90">{company?.city}{company?.phone && ` · ${company.phone}`}</p>
          </div>
        </div>
        <div className="rounded-2xl bg-muted/50 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valor recebido</p>
          <p className="text-3xl font-bold text-primary">{formatBRL(amountNum)}</p>
          <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground no-print">
            <span>Data:</span><input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)}
              className="bg-transparent outline-none" />
          </div>
          <p className="mt-1 hidden text-sm text-muted-foreground print:block">Data: {displayDate}</p>
        </div>
      </header>

      {/* Recebemos de */}
      <section className="rounded-2xl border p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recebemos de</p>
        <p className="text-lg font-semibold">{quote.customer_name}</p>
        <div className="text-sm text-muted-foreground">
          CPF/CNPJ: <EditableInput value={clientDoc} onChange={setClientDoc} placeholder="informe o documento" className="w-48" mask={maskCpfCnpj} />
        </div>
        {quote.customer_phone && <p className="text-sm text-muted-foreground">{quote.customer_phone}</p>}
        {quote.site_address && <p className="text-sm text-muted-foreground">Obra: {quote.site_address}</p>}
      </section>

      {/* Declaração */}
      <section className="text-sm leading-relaxed">
        <p>{receiptDeclaration(quote.customer_name, amountNum)}</p>
      </section>

      {/* Tabela de serviços */}
      <section>
        <div className="grid grid-cols-[1fr_4rem_8rem] gap-3 border-b pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Descrição</span><span className="text-center">Qtd</span><span className="text-right">Total</span>
        </div>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_4rem_8rem] gap-3 border-b py-3 text-sm">
            <span className="font-medium">{it.product_name}{it.model_name && ` — ${it.model_name}`}</span>
            <span className="text-center">{it.qty}</span>
            <span className="text-right font-semibold">{formatBRL(itemDisplayGross(Number(it.line_total), Number(it.extra_value ?? 0)))}</span>
          </div>
        ))}
      </section>

      {/* Pagamento */}
      <section className="rounded-2xl border p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Forma de pagamento</p>
        <textarea value={payment} onChange={e => setPayment(e.target.value)} rows={3}
          placeholder="Ex.: Entrada R$ 2.000 cartão crédito 10x; Entrega R$ 2.000 cartão crédito 10x"
          className="mt-1 w-full resize-none border-b border-dashed border-muted-foreground/40 bg-transparent outline-none focus:border-solid print:border-none print:placeholder-transparent" />
      </section>

      {/* Total do orçamento (referência) */}
      <section className="space-y-1 text-right">
        {footer.hasDeduction && (
          <>
            <p className="text-sm text-muted-foreground">Subtotal: {formatBRL(footer.subtotal)}</p>
            {footer.itemAdjustment > 0 && (
              <p className="text-sm text-green-700">Ajuste dos itens: −{formatBRL(footer.itemAdjustment)}</p>
            )}
            {footer.discount > 0 && (
              <p className="text-sm text-green-700">
                Desconto{footer.discountPercentLabel ? ` (${footer.discountPercentLabel})` : ''}: −{formatBRL(footer.discount)}
              </p>
            )}
          </>
        )}
        {footer.multiplier > 1 && (
          <>
            <p className="text-sm text-muted-foreground">Valor por unidade: {formatBRL(footer.unitTotal)}</p>
            <p className="text-sm text-muted-foreground">{footer.multiplier} casas × {formatBRL(footer.unitTotal)}</p>
          </>
        )}
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total do orçamento</p>
        <p className="text-3xl font-bold text-primary">{formatBRL(footer.total)}</p>
      </section>

      {/* Recebedor / assinatura */}
      <section className="space-y-3 border-t pt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recebedor</p>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div>Nome: <EditableInput value={receiverName} onChange={setReceiverName} placeholder="nome" className="w-full" /></div>
          <div>Documento: <EditableInput value={receiverDoc} onChange={setReceiverDoc} placeholder="documento" className="w-full" mask={maskCpfCnpj} /></div>
          <div>Recebimento: <EditableInput value={receiverMethod} onChange={setReceiverMethod} placeholder="ex.: PIX" className="w-full" /></div>
        </div>
        <div className="pt-6 text-center text-sm">
          <img src={company?.signature_url || '/assinatura-recibo.png'} alt="Assinatura"
            className="mx-auto h-24 w-64 object-contain" />
          <div className="mx-auto w-64 border-t border-slate-400" />
          <p className="text-muted-foreground">Assinatura do recebedor · {displayDate}</p>
        </div>
      </section>
    </article>
  )
}
