import { formatBRL } from '@/lib/format'
import { quoteDisplayFooter } from '@/lib/pricing/display'
import { ItemsCards } from './items-cards'
import { ItemsTable } from './items-table'

/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
export function QuotePresentation({ company, quote, items, conditions, internal = false }: {
  company: any; quote: any; items: any[]; conditions: { description: string }[]; internal?: boolean
}) {
  const footer = quoteDisplayFooter(
    Number(quote.subtotal),
    Number(quote.discount),
    items.map(it => Number(it.extra_value ?? 0)),
    Number(quote.multiplier ?? 1),
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

      {company?.presentation_style === 'tabela'
        ? <ItemsTable items={items} internal={internal} />
        : <ItemsCards items={items} internal={internal} />}

      <section className="space-y-1 border-t pt-3 text-right">
        {footer.hasDeduction && (
          <>
            <p className="text-sm text-muted-foreground">Subtotal: {formatBRL(footer.subtotal)}</p>
            <p className="text-sm text-green-700">Desconto: −{formatBRL(footer.discount)}</p>
          </>
        )}
        {footer.multiplier > 1 && (
          <>
            <p className="text-sm text-muted-foreground">Valor por unidade: {formatBRL(footer.unitTotal)}</p>
            <p className="text-sm text-muted-foreground">{footer.multiplier} casas × {formatBRL(footer.unitTotal)}</p>
          </>
        )}
        <p className="text-2xl font-bold">Total: {formatBRL(footer.total)}</p>
      </section>

      {quote.general_note && (
        <section>
          <h2 className="font-semibold">Observações</h2>
          <p className="whitespace-pre-line text-sm">{quote.general_note}</p>
        </section>
      )}

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
