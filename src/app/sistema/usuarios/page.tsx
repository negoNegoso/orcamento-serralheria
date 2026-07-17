import { createAdminClient } from '@/lib/supabase/admin'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { assignUser, createPlatformUser } from './actions'

interface ProfileRow {
  id: string; name: string; email: string; role: string; active: boolean; company_id: string | null
}
interface CompanyRow { id: string; name: string }

export default async function SistemaUsuariosPage() {
  const admin = createAdminClient()
  const [{ data: users }, { data: companies }] = await Promise.all([
    admin.from('profiles').select('id, name, email, role, active, company_id').order('created_at'),
    admin.from('companies').select('id, name').order('name'),
  ])
  const rows = (users ?? []) as ProfileRow[]
  const comps = (companies ?? []) as CompanyRow[]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Usuários</h2>
        <p className="text-sm text-muted-foreground">Vincule usuários a uma empresa e defina o papel.</p>
      </div>

      <ul className="space-y-2">
        {rows.map(u => u.role === 'admin_system' ? (
          <li key={u.id} className="flex flex-wrap items-center gap-2 rounded border border-dashed p-3">
            <span className="font-medium">{u.name}</span>
            <span className="text-sm text-muted-foreground">{u.email}</span>
            <span className="ml-auto text-xs text-muted-foreground">admin do sistema (não editável)</span>
          </li>
        ) : (
          <li key={u.id}>
            <form action={assignUser} className="flex flex-wrap items-center gap-2 rounded border p-3">
              <input type="hidden" name="id" value={u.id} />
              <span className="font-medium">{u.name}</span>
              <span className="text-sm text-muted-foreground">{u.email}</span>
              <select name="company_id" defaultValue={u.company_id ?? ''} className="rounded border bg-background p-1 text-sm">
                <option value="" disabled>Empresa…</option>
                {comps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
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

      <div className="space-y-2">
        <h3 className="font-semibold">Novo usuário</h3>
        <form action={createPlatformUser} className="flex flex-wrap items-end gap-2 rounded border p-3">
          <div><label className="text-xs">Nome</label><Input name="name" required /></div>
          <div><label className="text-xs">E-mail</label><Input name="email" type="email" required /></div>
          <div><label className="text-xs">Senha (mín. 8)</label><Input name="password" type="password" required minLength={8} /></div>
          <select name="company_id" defaultValue="" required className="rounded border bg-background p-2 text-sm">
            <option value="" disabled>Empresa…</option>
            {comps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="role" defaultValue="vendedor" className="rounded border bg-background p-2 text-sm">
            <option value="vendedor">Vendedor</option>
            <option value="admin">Admin</option>
          </select>
          <SubmitButton size="sm" pendingLabel="Criando…">Criar</SubmitButton>
        </form>
      </div>
    </div>
  )
}
