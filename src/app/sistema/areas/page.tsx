import { createServerSupabase } from '@/lib/supabase/server'
import { createArea, deleteArea, renameArea } from './actions'

interface Area { id: string; name: string }

export default async function AreasPage() {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.from('business_areas').select('id, name').order('name')
  if (error) throw new Error(error.message)
  const areas = (data ?? []) as Area[]
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Áreas de atuação</h2>
      <form action={createArea} className="flex gap-2">
        <input name="name" required placeholder="Nova área" className="flex-1 rounded border px-3 py-2" />
        <button className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground">Adicionar</button>
      </form>
      <ul className="divide-y rounded border">
        {areas.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2 p-3">
            <form action={renameArea} className="flex flex-1 items-center gap-2">
              <input type="hidden" name="id" value={a.id} />
              <input name="name" defaultValue={a.name} className="flex-1 rounded border px-2 py-1 text-sm" />
              <button className="rounded border px-2 py-1 text-xs">Salvar</button>
            </form>
            <form action={deleteArea}>
              <input type="hidden" name="id" value={a.id} />
              <button className="rounded border px-2 py-1 text-xs text-red-600">Remover</button>
            </form>
          </li>
        ))}
        {areas.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhuma área.</li>}
      </ul>
      <p className="text-xs text-muted-foreground">Remover uma área não altera empresas já cadastradas.</p>
    </div>
  )
}
