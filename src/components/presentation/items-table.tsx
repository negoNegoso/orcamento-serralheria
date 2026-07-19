import { formatBRL } from '@/lib/format'
import { itemDisplayGross } from '@/lib/pricing/display'

/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
export function ItemsTable({ items, internal }: { items: any[]; internal: boolean }) {
  const hasPhoto = items.some(it => it.model_photo_url)
  const hasQty = items.some(it => Number(it.qty) > 1)
  return (
    <section>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            {hasPhoto && <th className="w-14 py-2 pr-2" aria-label="Foto" />}
            <th className="py-2 pr-2 font-medium">Descrição</th>
            {hasQty && <th className="w-12 py-2 pr-2 text-center font-medium">Qtd</th>}
            <th className="py-2 text-right font-medium">Valor</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((it, i) => (
            <tr key={i} className="align-top">
              {hasPhoto && (
                <td className="py-2 pr-2">
                  {it.model_photo_url && <img src={it.model_photo_url} alt="" className="h-12 w-12 rounded object-cover" />}
                </td>
              )}
              <td className="py-2 pr-2">
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
              {hasQty && <td className="py-2 pr-2 text-center">{it.qty}</td>}
              <td className="whitespace-nowrap py-2 text-right font-semibold">
                {formatBRL(itemDisplayGross(Number(it.line_total), Number(it.extra_value ?? 0)))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
