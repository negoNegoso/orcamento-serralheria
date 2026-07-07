import { getProfile } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { deleteCondition, saveCondition } from './actions'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ConditionForm({ c }: { c?: any }) {
  return (
    <form action={saveCondition} className="flex flex-wrap items-end gap-2 rounded border p-3">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="w-full sm:w-72">
        <label className="text-xs">Descrição</label>
        <Input name="description" defaultValue={c?.description ?? ''} required />
      </div>
      <div><label className="text-xs">Valor mín. (vazio = sem)</label>
        <Input name="min_total" inputMode="decimal" defaultValue={c?.min_total ?? ''} className="w-28" /></div>
      <div><label className="text-xs">Valor máx. (vazio = sem)</label>
        <Input name="max_total" inputMode="decimal" defaultValue={c?.max_total ?? ''} className="w-28" /></div>
      <div><label className="text-xs">Ordem</label>
        <Input name="sort_order" type="number" defaultValue={c?.sort_order ?? 0} className="w-16" /></div>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" name="active" defaultChecked={c?.active ?? true} /> Ativa
      </label>
      <SubmitButton size="sm">{c ? 'Salvar' : 'Adicionar'}</SubmitButton>
    </form>
  )
}

export default async function PagamentoPage() {
  const { supabase } = await getProfile()
  const { data: conds } = await supabase.from('payment_conditions').select('*').order('sort_order')
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Condições de pagamento</h1>
      <p className="text-sm text-muted-foreground">
        Cada condição aparece no orçamento somente se o total estiver dentro da faixa (mín/máx).
      </p>
      {(conds ?? []).map(c => (
        <div key={c.id} className="space-y-1">
          <ConditionForm c={c} />
          <form action={deleteCondition}>
            <input type="hidden" name="id" value={c.id} />
            <SubmitButton variant="link" className="h-auto px-0 text-xs text-red-600 underline">excluir</SubmitButton>
          </form>
        </div>
      ))}
      <h2 className="font-semibold">Nova condição</h2>
      <ConditionForm />
    </div>
  )
}
