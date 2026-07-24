'use client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { canClose, canReopen } from '@/lib/work-order/status'
import { closeOrder, reopenOrder } from '@/app/(app)/orcamentos/[id]/ordem/actions'
import type { WorkOrder } from '@/lib/work-order/types'

export function OrderActions({ quoteId, workOrder }: { quoteId: string; workOrder: WorkOrder }) {
  const router = useRouter()

  async function conclude() {
    if (!confirm('Concluir a OS congela os lançamentos. Nenhum custo poderá ser editado ou adicionado depois. Continuar?')) return
    await closeOrder(quoteId, workOrder.id)
    router.refresh()
  }
  async function reopen() {
    await reopenOrder(quoteId, workOrder.id)
    router.refresh()
  }

  if (canClose(workOrder.status)) return <Button size="sm" onClick={conclude}>Concluir OS</Button>
  if (canReopen(workOrder.status)) return <Button size="sm" variant="outline" onClick={reopen}>Reabrir OS</Button>
  return null
}
