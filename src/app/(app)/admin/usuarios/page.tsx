import { getProfile } from '@/lib/auth'
import { effectiveCompanyId } from '@/lib/tenant'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { createUser, updateUser } from './actions'

export default async function UsuariosPage() {
  const { supabase, profile } = await getProfile()
  const companyId = effectiveCompanyId(profile)
  const { data: users } = await supabase.from('profiles').select('*')
    .eq('company_id', companyId ?? '').order('created_at')
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Usuários</h1>
      <ul className="space-y-2">
        {(users ?? []).map(u => (
          <li key={u.id}>
            <form action={updateUser} className="flex flex-wrap items-center gap-2 rounded border p-3">
              <input type="hidden" name="id" value={u.id} />
              <span className="font-medium">{u.name}</span>
              <span className="text-sm text-muted-foreground">{u.email}</span>
              <select name="role" defaultValue={u.role} className="rounded border bg-background p-1 text-sm">
                <option value="vendedor">Vendedor</option>
                <option value="admin">Admin</option>
              </select>
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="active" defaultChecked={u.active} /> Ativo
              </label>
              <SubmitButton size="sm" variant="outline">Salvar</SubmitButton>
            </form>
          </li>
        ))}
      </ul>
      <h2 className="font-semibold">Novo usuário</h2>
      <form action={createUser} className="flex flex-wrap items-end gap-2 rounded border p-3">
        <div><label className="text-xs">Nome</label><Input name="name" required /></div>
        <div><label className="text-xs">E-mail</label><Input name="email" type="email" required /></div>
        <div><label className="text-xs">Senha (mín. 8)</label><Input name="password" type="password" required minLength={8} /></div>
        <select name="role" defaultValue="vendedor" className="rounded border bg-background p-2 text-sm">
          <option value="vendedor">Vendedor</option>
          <option value="admin">Admin</option>
        </select>
        <SubmitButton size="sm" pendingLabel="Criando…">Criar</SubmitButton>
      </form>
    </div>
  )
}
