import type { GroupTemplateRow } from '@/lib/config-types'
import { getCompany } from '@/lib/auth'
import { TemplateEditor } from './template-editor'

export default async function TemplatesPage() {
  const { supabase } = await getCompany()
  const { data } = await supabase.from('option_group_templates')
    .select('*, option_templates(*)')
    .order('name')
  const templates = (data ?? []) as unknown as GroupTemplateRow[]
  templates.forEach(t => t.option_templates.sort((a, b) => a.sort_order - b.sort_order))
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Templates de grupos de opções</h1>
      <p className="text-sm text-on-surface-variant">
        Templates são pontos de partida: ao aplicar num produto, o grupo vira uma cópia independente.
      </p>
      <TemplateEditor templates={templates} />
    </div>
  )
}
