'use client'
import { formatBRL } from '@/lib/format'
import { itemDisplayGross, quoteDisplayFooter } from '@/lib/pricing/display'
import { round2 } from '@/lib/pricing/calc'
import { valorPorExtenso, contractNumber } from '@/lib/contract/text'
import type { ConsumerData, ContractTerms, Witness } from '@/lib/contract/types'

/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */

function Clausula({ titulo, children, avoidBreak = true }: { titulo: string; children: React.ReactNode; avoidBreak?: boolean }) {
  return (
    <section className={avoidBreak ? 'break-inside-avoid' : undefined}>
      <h2 className="text-sm font-bold uppercase">{titulo}</h2>
      <div className="mt-1 text-sm leading-relaxed">{children}</div>
    </section>
  )
}

function LinhaAssinatura({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="pt-10 text-center text-sm">
      <div className="mx-auto w-64 border-t border-slate-400" />
      <p className="font-semibold">{label}</p>
      {sub && <p className="text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function ContractDocument({ company, quote, items, consumer, terms, witnesses }: {
  company: any; quote: any; items: any[]; consumer: ConsumerData; terms: ContractTerms; witnesses: Witness[]
}) {
  const footer = quoteDisplayFooter(
    Number(quote.subtotal),
    (quote.discount_type ?? 'valor') as 'valor' | 'percent',
    Number(quote.discount),
    items.map(it => Number(it.extra_value ?? 0)),
    Number(quote.multiplier ?? 1),
  )
  const numero = contractNumber(quote.id, quote.created_at)
  const hoje = new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })

  return (
    <article className="mx-auto max-w-3xl space-y-5 p-4 text-slate-800 print:p-0">
      {/* Cabeçalho */}
      <header className="flex items-center gap-4 border-b pb-4">
        {company?.logo_url && <img src={company.logo_url} alt="" className="h-14 w-14 rounded object-contain" />}
        <div>
          <p className="font-bold">{company?.name}</p>
          <p className="text-sm text-muted-foreground">
            {company?.cnpj && `CNPJ: ${company.cnpj} · `}{company?.city}{company?.phone && ` · ${company.phone}`}
          </p>
        </div>
      </header>
      <h1 className="text-center text-base font-bold uppercase">
        Contrato de Prestação de Serviços e Fornecimento Nº {numero}
      </h1>

      {/* Qualificação das partes */}
      <section className="space-y-2 text-sm leading-relaxed">
        <p>
          <strong>CONTRATADA:</strong> {company?.name}
          {company?.cnpj && <>, inscrita no CNPJ sob o nº {company.cnpj}</>}
          , com sede em {company?.city}
          {company?.phone && <>, telefone {company.phone}</>}.
        </p>
        <p>
          <strong>CONTRATANTE:</strong> {consumer.name}, inscrito(a) no CPF/CNPJ sob o nº {consumer.doc}
          {consumer.rg && <>, RG nº {consumer.rg}</>}
          , residente e domiciliado(a) em {consumer.address}
          {consumer.phone && <>, telefone {consumer.phone}</>}
          {consumer.email && <>, e-mail {consumer.email}</>}.
        </p>
        <p>As partes acima qualificadas celebram o presente contrato, que se regerá pelas cláusulas seguintes.</p>
      </section>

      {/* Cláusula 1 — Objeto, com tabela de itens (sempre tabular) */}
      <Clausula titulo="Cláusula 1ª — Do Objeto" avoidBreak={false}>
        <p>
          O presente contrato tem por objeto o fornecimento e a instalação, pela CONTRATADA,
          dos itens descritos na tabela abaixo, conforme orçamento nº {numero}:
        </p>
        <table className="mt-2 w-full border-collapse border border-border text-sm [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
          <thead>
            <tr className="bg-muted text-left text-xs uppercase text-foreground">
              <th className="w-10 border border-border px-2 py-2 text-center font-semibold">Item</th>
              <th className="border border-border px-2 py-2 font-semibold">Produto / Modelo</th>
              <th className="border border-border px-2 py-2 font-semibold">Medidas</th>
              <th className="w-12 border border-border px-2 py-2 text-center font-semibold">Qtd</th>
              <th className="border border-border px-2 py-2 text-right font-semibold">Valor unit.</th>
              <th className="border border-border px-2 py-2 text-right font-semibold">Valor total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const gross = itemDisplayGross(Number(it.line_total), Number(it.extra_value ?? 0))
              const unit = round2(gross / Number(it.qty || 1))
              return (
                <tr key={i} className="break-inside-avoid align-top even:bg-muted/40">
                  <td className="border border-border px-2 py-2 text-center">{i + 1}</td>
                  <td className="border border-border px-2 py-2">
                    <p className="font-semibold">{it.product_name}{it.model_name && ` — ${it.model_name}`}</p>
                    {(it.selected_options as any[])?.length > 0 && (
                      <p className="text-muted-foreground">{(it.selected_options as any[]).map(o => o.label).join(' · ')}</p>
                    )}
                    {it.note && <p className="whitespace-pre-line italic text-muted-foreground">{it.note}</p>}
                  </td>
                  <td className="border border-border px-2 py-2">
                    {it.area_m2 != null
                      ? it.width_m != null
                        ? `${Number(it.width_m).toLocaleString('pt-BR')} × ${Number(it.height_m).toLocaleString('pt-BR')} m (${Number(it.area_m2).toLocaleString('pt-BR')} m²)`
                        : `${Number(it.area_m2).toLocaleString('pt-BR')} m²`
                      : '—'}
                  </td>
                  <td className="border border-border px-2 py-2 text-center">{it.qty}</td>
                  <td className="border border-border px-2 py-2 text-right">{formatBRL(unit)}</td>
                  <td className="border border-border px-2 py-2 text-right font-semibold">{formatBRL(gross)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            {footer.hasDeduction && (
              <>
                <tr>
                  <td colSpan={5} className="border border-border px-2 py-1 text-right text-muted-foreground">Subtotal</td>
                  <td className="border border-border px-2 py-1 text-right">{formatBRL(footer.subtotal)}</td>
                </tr>
                {footer.itemAdjustment > 0 && (
                  <tr>
                    <td colSpan={5} className="border border-border px-2 py-1 text-right text-green-700">Ajuste dos itens</td>
                    <td className="border border-border px-2 py-1 text-right text-green-700">−{formatBRL(footer.itemAdjustment)}</td>
                  </tr>
                )}
                {footer.discount > 0 && (
                  <tr>
                    <td colSpan={5} className="border border-border px-2 py-1 text-right text-green-700">
                      Desconto{footer.discountPercentLabel ? ` (${footer.discountPercentLabel})` : ''}
                    </td>
                    <td className="border border-border px-2 py-1 text-right text-green-700">−{formatBRL(footer.discount)}</td>
                  </tr>
                )}
              </>
            )}
            {footer.multiplier > 1 && (
              <tr>
                <td colSpan={5} className="border border-border px-2 py-1 text-right text-muted-foreground">
                  {footer.multiplier} unidades × {formatBRL(footer.unitTotal)}
                </td>
                <td className="border border-border px-2 py-1 text-right">{formatBRL(footer.total)}</td>
              </tr>
            )}
            <tr className="bg-muted font-bold">
              <td colSpan={5} className="border border-border px-2 py-2 text-right uppercase">Total</td>
              <td className="border border-border px-2 py-2 text-right">{formatBRL(footer.total)}</td>
            </tr>
          </tfoot>
        </table>
      </Clausula>

      <Clausula titulo="Cláusula 2ª — Do Preço">
        <p>
          Pelo objeto descrito na Cláusula 1ª, a CONTRATANTE pagará à CONTRATADA o valor total de{' '}
          <strong>{formatBRL(footer.total)}</strong> ({valorPorExtenso(footer.total)}).
        </p>
      </Clausula>

      <Clausula titulo="Cláusula 3ª — Do Pagamento">
        <p className="whitespace-pre-line">{terms.paymentTerms}</p>
      </Clausula>

      <Clausula titulo="Cláusula 4ª — Do Prazo e Local de Execução">
        <p>
          {terms.deadlineText}
          {terms.siteAddress && <> Os serviços serão executados em: {terms.siteAddress}.</>}
        </p>
      </Clausula>

      <Clausula titulo="Cláusula 5ª — Das Obrigações da Contratada">
        <p>
          A CONTRATADA obriga-se a executar os serviços conforme as especificações da Cláusula 1ª,
          empregando materiais de qualidade e mão de obra qualificada, e a comunicar à CONTRATANTE
          qualquer fato que possa afetar o prazo de execução.
        </p>
      </Clausula>

      <Clausula titulo="Cláusula 6ª — Das Obrigações da Contratante">
        <p>
          A CONTRATANTE obriga-se a garantir o acesso da CONTRATADA ao local de execução dos serviços
          e a efetuar os pagamentos nas condições e datas acordadas na Cláusula 3ª.
        </p>
      </Clausula>

      {company?.warranty_text && (
        <Clausula titulo="Cláusula 7ª — Da Garantia">
          <p className="whitespace-pre-line">{company.warranty_text}</p>
        </Clausula>
      )}

      <Clausula titulo={company?.warranty_text ? 'Cláusula 8ª — Da Rescisão' : 'Cláusula 7ª — Da Rescisão'}>
        <p>
          O descumprimento de qualquer cláusula deste contrato autoriza a parte inocente a rescindi-lo,
          ficando a parte infratora sujeita a multa de {terms.penaltyPercent}% sobre o valor total do
          contrato, sem prejuízo de perdas e danos.
        </p>
      </Clausula>

      <Clausula titulo={company?.warranty_text ? 'Cláusula 9ª — Do Foro' : 'Cláusula 8ª — Do Foro'}>
        <p>
          Fica eleito o foro da comarca de {company?.city} para dirimir quaisquer controvérsias
          oriundas do presente contrato, com renúncia a qualquer outro, por mais privilegiado que seja.
        </p>
      </Clausula>

      {/* Fecho e assinaturas */}
      <section className="space-y-2 pt-4 text-sm">
        <p>
          E, por estarem justas e contratadas, as partes assinam o presente instrumento em duas vias
          de igual teor, na presença das testemunhas abaixo.
        </p>
        <p className="pt-2 text-center">{company?.city}, {hoje}.</p>
      </section>
      <section className="grid gap-2 sm:grid-cols-2">
        <LinhaAssinatura label="CONTRATADA" sub={company?.name} />
        <LinhaAssinatura label="CONTRATANTE" sub={consumer.name} />
        {witnesses.map((w, i) => (
          <LinhaAssinatura key={i} label={`Testemunha ${i + 1}`}
            sub={w.name ? `${w.name}${w.doc ? ` — CPF ${w.doc}` : ''}` : 'Nome / CPF'} />
        ))}
      </section>
    </article>
  )
}
