import { formatBRL } from '@/lib/format'
import { itemDisplayGross, quoteDisplayFooter } from '@/lib/pricing/display'

/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
export function QuotePresentation({ company, quote, items, conditions, internal = false }: {
  company: any; quote: any; items: any[]; conditions: { description: string }[]; internal?: boolean
}) {
  const footer = quoteDisplayFooter(
    Number(quote.subtotal),
    Number(quote.discount),
    items.map(it => Number(it.extra_value ?? 0)),
  )
  return (
    <article className="mx-auto max-w-2xl space-y-6 p-4 print:p-0">
      <header className="flex items-center gap-4 border-b pb-4">
        {company?.logo_url && <img src={company.logo_url} alt="" className="h-16 w-16 rounded object-contain" />}
        <div>
          <h1 className="text-2xl font-bold">{company?.name}</h1>
          <p className="text-sm text-muted-foreground">{company?.city}{company?.phone && ` · ${company.phone}`}</p>
        </div>
      </header>

      <section>
        <h2 className="text-lg font-semibold">Orçamento</h2>
        <p className="text-sm">
          Cliente: <strong>{quote.customer_name}</strong>
          {quote.site_address && <> · Obra: {quote.site_address}</>}
        </p>
        <p className="text-sm text-muted-foreground">
          Data: {new Date(quote.created_at).toLocaleDateString('pt-BR')}
          {quote.valid_until && ` · Válido até ${new Date(quote.valid_until + 'T12:00:00').toLocaleDateString('pt-BR')}`}
        </p>
        {quote.creator?.name && (
          <p className="text-sm text-muted-foreground">Vendedor: {quote.creator.name}</p>
        )}
      </section>

      <section className="space-y-3">
        {items.map((it, i) => (
          <div key={i} className="flex gap-3 rounded border p-3">
            {it.model_photo_url && <img src={it.model_photo_url} alt="" className="h-20 w-24 rounded object-cover" />}
            <div className="flex-1 text-sm">
              <p className="font-semibold">{it.product_name}{it.model_name && ` — ${it.model_name}`}</p>
              {it.area_m2 != null && (
                <p className="text-muted-foreground">{Number(it.width_m).toLocaleString('pt-BR')} × {Number(it.height_m).toLocaleString('pt-BR')} m ({Number(it.area_m2).toLocaleString('pt-BR')} m²)</p>
              )}
              {(it.selected_options as any[]).length > 0 && (
                <p className="text-muted-foreground">{(it.selected_options as any[]).map(o => o.label).join(' · ')}</p>
              )}
              {it.qty > 1 && <p className="text-muted-foreground">Quantidade: {it.qty}</p>}
              {(Number(it.extra_value ?? 0) < 0 || (internal && Number(it.extra_value ?? 0) > 0)) && (
                <p className={Number(it.extra_value) < 0 ? 'text-green-700' : 'text-muted-foreground no-print'}>
                  Ajuste: {Number(it.extra_value) > 0 ? '+' : '−'}{formatBRL(Math.abs(Number(it.extra_value)))}
                </p>
              )}
              {it.note && <p className="italic text-muted-foreground">{it.note}</p>}
            </div>
            <p className="shrink-0 font-semibold">{formatBRL(itemDisplayGross(Number(it.line_total), Number(it.extra_value ?? 0)))}</p>
          </div>
        ))}
      </section>

      <section className="space-y-1 border-t pt-3 text-right">
        {footer.hasDeduction && (
          <>
            <p className="text-sm text-muted-foreground">Subtotal: {formatBRL(footer.subtotal)}</p>
            <p className="text-sm text-green-700">Desconto: −{formatBRL(footer.discount)}</p>
          </>
        )}
        <p className="text-2xl font-bold">Total: {formatBRL(footer.total)}</p>
      </section>

      {conditions.length > 0 && (
        <section>
          <h2 className="font-semibold">Formas de pagamento</h2>
          <ul className="list-inside list-disc text-sm">
            {conditions.map((c, i) => <li key={i}>{c.description}</li>)}
          </ul>
        </section>
      )}

      {company?.warranty_text && (
        <section>
          <h2 className="font-semibold">Garantias</h2>
          <p className="whitespace-pre-line text-sm">{company.warranty_text}</p>
        </section>
      )}

      {company?.about_text && (
        <section className="border-t pt-3">
          <p className="whitespace-pre-line text-sm text-muted-foreground">{company.about_text}</p>
        </section>
      )}
    </article>
  )
}
