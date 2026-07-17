import { notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { updateCompany } from '../actions'
import type { Company } from '@/lib/tenant'

export default async function EmpresaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const [{ data: company }, { data: users }] = await Promise.all([
    supabase.from('companies').select('*').eq('id', id).single(),
    supabase.from('profiles').select('id, name, email, role, active').eq('company_id', id).order('name'),
  ])
  if (!company) notFound()
  const c = company as Company
  return (
    <div className="space-y-6">
      <form action={updateCompany} className="max-w-md space-y-3">
        <h2 className="text-lg font-semibold">{c.name}</h2>
        <input type="hidden" name="id" value={c.id} />
        <label className="block space-y-1">
          <span className="text-sm font-medium">Nome</span>
          <input name="name" defaultValue={c.name} required className="w-full rounded border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Cidade</span>
          <input name="city" defaultValue={c.city} className="w-full rounded border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Telefone</span>
          <input name="phone" defaultValue={c.phone} className="w-full rounded border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Área de atuação</span>
          <input name="business_area" defaultValue={c.business_area} required className="w-full rounded border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Cor destaque</span>
          <input type="color" name="accent_color" defaultValue={c.accent_color} className="h-10 w-20 cursor-pointer rounded border" />
        </label>
        <button className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground">Salvar</button>
      </form>
      <section className="space-y-2">
        <h3 className="font-medium">Usuários</h3>
        <ul className="divide-y rounded border text-sm">
          {(users ?? []).map((u) => (
            <li key={u.id} className="flex items-center gap-2 p-2">
              <span>{u.name}</span>
              <span className="text-muted-foreground">{u.email}</span>
              <span className="ml-auto text-xs">{u.role}{u.active ? '' : ' · inativo'}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
