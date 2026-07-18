'use client'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import type { GroupTemplateRow } from '@/lib/config-types'
import { deleteTemplate, deleteTemplateOption, saveTemplate, saveTemplateOption } from './actions'

export function TemplateEditor({ templates }: { templates: GroupTemplateRow[] }) {
  return (
    <section className="space-y-4">
      {templates.map(t => (
        <div key={t.id} className="space-y-2 rounded border p-3">
          <form action={saveTemplate} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={t.id} />
            <Input name="name" defaultValue={t.name} className="w-44" aria-label="Nome do template" />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="required" defaultChecked={t.required} /> Obrigatório
            </label>
            <SubmitButton size="sm">Salvar</SubmitButton>
          </form>
          <form action={deleteTemplate}>
            <input type="hidden" name="id" value={t.id} />
            <SubmitButton variant="link" className="h-auto px-0 text-xs text-red-600 underline">Excluir template (e opções)</SubmitButton>
          </form>
          <ul className="space-y-2 pl-2">
            {t.option_templates.map(o => (
              <li key={o.id} className="flex flex-wrap items-end gap-2">
                <form action={saveTemplateOption} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="template_id" value={t.id} />
                  <input type="hidden" name="id" value={o.id} />
                  <Input name="label" defaultValue={o.label} className="w-36" aria-label="Opção" />
                  <select name="surcharge_type" defaultValue={o.surcharge_type} className="rounded border bg-background p-2 text-sm">
                    <option value="fixo">R$ fixo</option>
                    <option value="por_m2">R$ por m²</option>
                  </select>
                  <Input name="surcharge_value" inputMode="decimal" defaultValue={o.surcharge_value} className="w-24" aria-label="Adicional" />
                  <Input name="sort_order" type="number" defaultValue={o.sort_order} className="w-14" aria-label="Ordem" />
                  <SubmitButton size="sm" variant="outline">OK</SubmitButton>
                </form>
                <form action={deleteTemplateOption}>
                  <input type="hidden" name="id" value={o.id} />
                  <SubmitButton variant="link" className="h-auto px-0 text-xs text-red-600 underline">excluir</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
          <form action={saveTemplateOption} className="flex flex-wrap items-end gap-2 border-t pt-2">
            <input type="hidden" name="template_id" value={t.id} />
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
      <form action={saveTemplate} className="flex flex-wrap items-end gap-2 rounded border border-dashed p-3">
        <Input name="name" placeholder="Novo template (ex: Cor do Alumínio)" className="w-56" />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="required" /> Obrigatório
        </label>
        <SubmitButton size="sm">Adicionar template</SubmitButton>
      </form>
    </section>
  )
}
