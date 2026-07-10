'use client'
import { useState } from 'react'
import { formatBRL } from '@/lib/format'
import { itemDisplayGross } from '@/lib/pricing/display'
import { receiptDeclaration } from '@/lib/receipt/text'

/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */

const ACCENT = '#00b8e6' // ciano da marca L.D

function EditableInput({ value, onChange, placeholder, className = '' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`border-b border-dashed border-muted-foreground/40 bg-transparent px-1 outline-none focus:border-solid print:border-none print:placeholder-transparent ${className}`}
    />
  )
}

export function ReciboDocument({ company, quote, items }: {
  company: any; quote: any; items: any[]
}) {
  const total = Number(quote.total)
  const today = new Date().toISOString().slice(0, 10)
  const [clientDoc, setClientDoc] = useState('')
  const [receiptDate, setReceiptDate] = useState(today)
  const [payment, setPayment] = useState('')
  const [receiverName, setReceiverName] = useState('')
  const [receiverDoc, setReceiverDoc] = useState('')
  const [receiverMethod, setReceiverMethod] = useState('')

  const displayDate = new Date(receiptDate + 'T12:00:00').toLocaleDateString('pt-BR')

  return (
    <article className="mx-auto max-w-3xl space-y-6 p-4 text-slate-800 print:p-0">
      {/* Header: card da marca + card do valor */}
      <header className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-2xl p-6 text-white" style={{ backgroundColor: ACCENT }}>
          {company?.logo_url && <img src={company.logo_url} alt="" className="h-16 w-16 rounded-lg bg-white/20 object-contain p-1" />}
          <div>
            <p className="text-xl font-bold leading-tight">{company?.name}</p>
            {company?.cnpj && <p className="text-sm opacity-90">CNPJ: {company.cnpj}</p>}
            <p className="text-sm opacity-90">{company?.city}{company?.phone && ` · ${company.phone}`}</p>
          </div>
        </div>
        <div className="rounded-2xl bg-muted/50 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valor recebido</p>
          <p className="text-3xl font-bold" style={{ color: ACCENT }}>{formatBRL(total)}</p>
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
          CPF/CNPJ: <EditableInput value={clientDoc} onChange={setClientDoc} placeholder="informe o documento" className="w-48" />
        </div>
        {quote.customer_phone && <p className="text-sm text-muted-foreground">{quote.customer_phone}</p>}
        {quote.site_address && <p className="text-sm text-muted-foreground">Obra: {quote.site_address}</p>}
      </section>

      {/* Declaração */}
      <section className="text-sm leading-relaxed">
        <p>{receiptDeclaration(quote.customer_name, total)}</p>
      </section>

      {/* Tabela de serviços */}
      <section>
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Descrição</span><span className="text-center">Qtd</span><span className="text-right">Total</span>
        </div>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b py-3 text-sm">
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

      {/* Total */}
      <section className="text-right">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</p>
        <p className="text-3xl font-bold" style={{ color: ACCENT }}>{formatBRL(total)}</p>
      </section>

      {/* Recebedor / assinatura */}
      <section className="space-y-3 border-t pt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recebedor</p>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div>Nome: <EditableInput value={receiverName} onChange={setReceiverName} placeholder="nome" className="w-full" /></div>
          <div>Documento: <EditableInput value={receiverDoc} onChange={setReceiverDoc} placeholder="documento" className="w-full" /></div>
          <div>Recebimento: <EditableInput value={receiverMethod} onChange={setReceiverMethod} placeholder="ex.: PIX" className="w-full" /></div>
        </div>
        <div className="pt-10 text-center text-sm">
          <div className="mx-auto w-64 border-t border-slate-400" />
          <p className="text-muted-foreground">Assinatura do recebedor · {displayDate}</p>
        </div>
      </section>
    </article>
  )
}
