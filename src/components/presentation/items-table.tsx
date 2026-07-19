import { formatBRL } from '@/lib/format'
import { itemDisplayGross } from '@/lib/pricing/display'

/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
export function ItemsTable({ items, internal }: { items: any[]; internal: boolean }) {
  const hasPhoto = items.some(it => it.model_photo_url)
  const hasQty = items.some(it => Number(it.qty) > 1)
  return (
    <section>
      <table className="w-full border-collapse border border-border text-sm [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
        <thead>
          <tr className="bg-muted text-left text-xs uppercase text-foreground">
            {hasPhoto && <th className="w-14 border border-border px-2 py-2 font-semibold" aria-label="Foto" />}
            <th className="border border-border px-2 py-2 font-semibold">Descrição</th>
            {hasQty && <th className="w-12 border border-border px-2 py-2 text-center font-semibold">Qtd</th>}
            <th className="border border-border px-2 py-2 text-right font-semibold">Valor</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="align-top even:bg-muted/40">
              {hasPhoto && (
                <td className="border border-border px-2 py-2">
                  {it.model_photo_url && <img src={it.model_photo_url} alt="" className="h-12 w-12 rounded object-cover" />}
                </td>
              )}
              <td className="border border-border px-2 py-2">
                <p className="font-semibold">{it.product_name}{it.model_name && ` — ${it.model_name}`}</p>
                {it.area_m2 != null && (
                  <p className="text-muted-foreground">
                    {it.width_m != null
                      ? `${Number(it.width_m).toLocaleString('pt-BR')} × ${Number(it.height_m).toLocaleString('pt-BR')} m (${Number(it.area_m2).toLocaleString('pt-BR')} m²)`
                      : `${Number(it.area_m2).toLocaleString('pt-BR')} m²`}
                  </p>
                )}
                {(it.selected_options as any[]).length > 0 && (
                  <p className="text-muted-foreground">{(it.selected_options as any[]).map(o => o.label).join(' · ')}</p>
                )}
                {(Number(it.extra_value ?? 0) < 0 || (internal && Number(it.extra_value ?? 0) > 0)) && (
                  <p className={Number(it.extra_value) < 0 ? 'text-green-700' : 'text-muted-foreground no-print'}>
                    Ajuste: {Number(it.extra_value) > 0 ? '+' : '−'}{formatBRL(Math.abs(Number(it.extra_value)))}
                  </p>
                )}
                {it.note && <p className="whitespace-pre-line italic text-muted-foreground">{it.note}</p>}
              </td>
              {hasQty && <td className="border border-border px-2 py-2 text-center">{it.qty}</td>}
              <td className="whitespace-nowrap border border-border px-2 py-2 text-right font-semibold">
                {formatBRL(itemDisplayGross(Number(it.line_total), Number(it.extra_value ?? 0)))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
