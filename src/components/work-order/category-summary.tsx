import { formatBRL } from '@/lib/format'
import type { CategoryTotals } from '@/lib/work-order/types'

export function CategorySummary({ rows }: { rows: CategoryTotals[] }) {
  return (
    <section className="space-y-2 rounded-xl border p-4">
      <h2 className="text-lg font-bold">Por natureza</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1 font-medium">Categoria</th>
              <th className="py-1 text-right font-medium">Planejado</th>
              <th className="py-1 text-right font-medium">Real</th>
              <th className="py-1 text-right font-medium">Variação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.price_category_id ?? 'sem'} className="border-b last:border-0">
                <td className="py-1">{r.name}</td>
                <td className="py-1 text-right">{formatBRL(r.planned_total)}</td>
                <td className="py-1 text-right">{formatBRL(r.actual_total)}</td>
                <td className={`py-1 text-right font-semibold ${r.variance > 0 ? 'text-red-600' : r.variance < 0 ? 'text-green-700' : ''}`}>
                  {r.variance === 0 ? '—' : formatBRL(r.variance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
