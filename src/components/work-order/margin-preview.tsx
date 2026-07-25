import { formatBRL } from '@/lib/format'
import type { MarginPreview as Preview } from '@/lib/work-order/preview-margin'

export function MarginPreview({ preview, quoteTotal }: {
  preview: Preview
  quoteTotal: number
}) {
  return (
    <section className="space-y-2 rounded-xl border p-4">
      <h2 className="text-lg font-bold">Margem prevista</h2>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <span className="text-muted-foreground">Venda</span>
          <p className="font-bold">{formatBRL(quoteTotal)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Custo esperado</span>
          <p className="font-bold">{formatBRL(preview.plannedTotal)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Sobra prevista</span>
          <p className={`font-bold ${preview.predictedMargin < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {formatBRL(preview.predictedMargin)}
          </p>
        </div>
      </div>
      {preview.uncostedCount > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {preview.uncostedCount} {preview.uncostedCount === 1 ? 'preço sem' : 'preços sem'} custo
          cadastrado — a sobra real é maior que a mostrada aqui.
        </p>
      )}
    </section>
  )
}
