import { formatBRL } from '@/lib/format'
import { itemDisplayGross } from '@/lib/pricing/display'

/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
export function ItemsCards({ items, internal }: { items: any[]; internal: boolean }) {
  return (
    <section className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="flex gap-3 rounded border p-3">
          {it.model_photo_url && <img src={it.model_photo_url} alt="" className="h-20 w-24 rounded object-cover" />}
          <div className="flex-1 text-sm">
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
            {it.qty > 1 && <p className="text-muted-foreground">Quantidade: {it.qty}</p>}
            {(Number(it.extra_value ?? 0) < 0 || (internal && Number(it.extra_value ?? 0) > 0)) && (
              <p className={Number(it.extra_value) < 0 ? 'text-green-700' : 'text-muted-foreground no-print'}>
                Ajuste: {Number(it.extra_value) > 0 ? '+' : '−'}{formatBRL(Math.abs(Number(it.extra_value)))}
              </p>
            )}
            {it.note && <p className="whitespace-pre-line italic text-muted-foreground">{it.note}</p>}
          </div>
          <p className="shrink-0 font-semibold">{formatBRL(itemDisplayGross(Number(it.line_total), Number(it.extra_value ?? 0)))}</p>
        </div>
      ))}
    </section>
  )
}
