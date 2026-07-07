'use client'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import type { OptionGroupRow } from '@/lib/config-types'
import { deleteGroup, deleteOption, saveGroup, saveOption } from './actions'

export function GroupEditor({ productId, groups }: { productId: string; groups: OptionGroupRow[] }) {
  return (
    <section className="space-y-4">
      <h2 className="font-semibold">Grupos de opções</h2>
      {groups.map(g => (
        <div key={g.id} className="space-y-2 rounded border p-3">
          <form action={saveGroup} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="product_id" value={productId} />
            <input type="hidden" name="id" value={g.id} />
            <Input name="name" defaultValue={g.name} className="w-44" aria-label="Nome do grupo" />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="required" defaultChecked={g.required} /> Obrigatório
            </label>
            <Input name="sort_order" type="number" defaultValue={g.sort_order} className="w-16" aria-label="Ordem" />
            <SubmitButton size="sm">Salvar</SubmitButton>
          </form>
          <form action={deleteGroup}>
            <input type="hidden" name="product_id" value={productId} />
            <input type="hidden" name="id" value={g.id} />
            <button className="text-xs text-red-600 underline">Excluir grupo (e opções)</button>
          </form>
          <ul className="space-y-2 pl-2">
            {g.options.map(o => (
              <li key={o.id} className="flex flex-wrap items-end gap-2">
                <form action={saveOption} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="product_id" value={productId} />
                  <input type="hidden" name="group_id" value={g.id} />
                  <input type="hidden" name="id" value={o.id} />
                  <Input name="label" defaultValue={o.label} className="w-36" aria-label="Opção" />
                  <select name="surcharge_type" defaultValue={o.surcharge_type} className="rounded border bg-background p-2 text-sm">
                    <option value="fixo">R$ fixo</option>
                    <option value="por_m2">R$ por m²</option>
                  </select>
                  <Input name="surcharge_value" inputMode="decimal" defaultValue={o.surcharge_value} className="w-24" aria-label="Adicional" />
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="active" defaultChecked={o.active} /> Ativa
                  </label>
                  <Input name="sort_order" type="number" defaultValue={o.sort_order} className="w-14" aria-label="Ordem" />
                  <SubmitButton size="sm" variant="outline">OK</SubmitButton>
                </form>
                <form action={deleteOption}>
                  <input type="hidden" name="product_id" value={productId} />
                  <input type="hidden" name="id" value={o.id} />
                  <button className="text-xs text-red-600 underline">excluir</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={saveOption} className="flex flex-wrap items-end gap-2 border-t pt-2">
            <input type="hidden" name="product_id" value={productId} />
            <input type="hidden" name="group_id" value={g.id} />
            <input type="hidden" name="active" value="on" />
            <Input name="label" placeholder="Nova opção" className="w-36" />
            <select name="surcharge_type" defaultValue="fixo" className="rounded border bg-background p-2 text-sm">
              <option value="fixo">R$ fixo</option>
              <option value="por_m2">R$ por m²</option>
            </select>
            <Input name="surcharge_value" inputMode="decimal" defaultValue={0} className="w-24" />
            <SubmitButton size="sm">Adicionar opção</SubmitButton>
          </form>
        </div>
      ))}
      <form action={saveGroup} className="flex flex-wrap items-end gap-2 rounded border border-dashed p-3">
        <input type="hidden" name="product_id" value={productId} />
        <Input name="name" placeholder="Novo grupo (ex: Cor do Alumínio)" className="w-56" />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="required" /> Obrigatório
        </label>
        <SubmitButton size="sm">Adicionar grupo</SubmitButton>
      </form>
    </section>
  )
}
