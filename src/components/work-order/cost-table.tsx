import { formatBRL } from '@/lib/format'
import { SubmitButton } from '@/components/ui/submit-button'
import { deleteCost, updateCost } from '@/app/(app)/orcamentos/[id]/ordem/actions'
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

export function CostTable({ costs, editable, quoteId }: {
  costs: WorkOrderCost[]; editable: boolean; quoteId: string
}) {
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
                  {editable && <th className="py-1 text-right font-medium">Qtd</th>}
                  {editable && <th className="py-1 text-right font-medium">Valor un.</th>}
                  <th className="py-1 text-right font-medium">Real</th>
                  {editable && <th className="py-1 font-medium"></th>}
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
                    {editable ? (
                      <>
                        <td className="py-1 text-right">
                          <form action={updateCost} className="flex items-center justify-end gap-1">
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="quote_id" value={quoteId} />
                            <input name="qty" defaultValue={String(c.qty)} inputMode="decimal"
                              className="w-16 rounded-md border px-2 py-1 text-right" aria-label="Quantidade" />
                            <input name="unit_value" defaultValue={String(c.unit_value)} inputMode="decimal"
                              className="w-28 rounded-md border px-2 py-1 text-right" aria-label="Valor unitário" />
                            <SubmitButton size="sm" variant="outline">ok</SubmitButton>
                          </form>
                        </td>
                        <td className="py-1 text-right font-semibold">{formatBRL(c.actual_value)}</td>
                        <td className="py-1 text-right">
                          {c.source !== 'orcamento' && (
                            <form action={deleteCost}>
                              <input type="hidden" name="id" value={c.id} />
                              <input type="hidden" name="quote_id" value={quoteId} />
                              <SubmitButton variant="link" className="h-auto px-0 text-red-600 underline">excluir</SubmitButton>
                            </form>
                          )}
                        </td>
                      </>
                    ) : (
                      <td className="py-1 text-right font-semibold">{formatBRL(c.actual_value)}</td>
                    )}
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
