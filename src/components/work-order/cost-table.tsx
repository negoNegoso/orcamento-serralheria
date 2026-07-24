import { formatBRL } from '@/lib/format'
import type { WorkOrderCost } from '@/lib/work-order/types'

function groupByItem(costs: WorkOrderCost[]): [string, WorkOrderCost[]][] {
  const groups = new Map<string, WorkOrderCost[]>()
  for (const c of costs) {
    const key = c.item_label || 'Lançamentos avulsos'
    const list = groups.get(key) ?? []
    list.push(c)
    groups.set(key, list)
  }
  return [...groups.entries()]
}

export function CostTable({ costs }: { costs: WorkOrderCost[] }) {
  if (costs.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum lançamento.</p>
  }
  return (
    <div className="space-y-4">
      {groupByItem(costs).map(([label, lines]) => (
        <details key={label} open className="rounded-xl border">
          <summary className="cursor-pointer px-4 py-2 font-semibold">{label}</summary>
          <div className="overflow-x-auto px-4 pb-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1 font-medium">Descrição</th>
                  <th className="py-1 text-right font-medium">Planejado</th>
                  <th className="py-1 text-right font-medium">Real</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(c => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-1">
                      {c.description}
                      {c.supplier && <span className="ml-2 text-muted-foreground">({c.supplier})</span>}
                      {c.planned_value === 0 && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          não previsto
                        </span>
                      )}
                    </td>
                    <td className="py-1 text-right text-muted-foreground">{formatBRL(c.planned_value)}</td>
                    <td className="py-1 text-right font-semibold">{formatBRL(c.actual_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  )
}
