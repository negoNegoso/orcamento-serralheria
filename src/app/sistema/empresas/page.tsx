import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { enterSupport, setCompanyStatus } from './actions'

interface Row {
  id: string; name: string; status: 'ativa' | 'suspensa'
  created_at: string; accent_color: string; users: number; quotes: number
}

export default async function EmpresasPage() {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('system_companies_overview')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Row[]
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Empresas</h2>
        <Link href="/sistema/empresas/nova" className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground">
          Nova empresa
        </Link>
      </div>
      <ul className="divide-y rounded border">
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
            <span className="size-3 rounded-full" style={{ background: c.accent_color }} />
            <Link href={`/sistema/empresas/${c.id}`} className="font-medium underline">{c.name}</Link>
            <span className={c.status === 'ativa' ? 'text-xs text-green-700' : 'text-xs text-red-600'}>
              {c.status}
            </span>
            <span className="text-xs text-muted-foreground">
              {c.users} usuário(s) · {c.quotes} orçamento(s)
            </span>
            <span className="ml-auto flex gap-2">
              <form action={enterSupport}>
                <input type="hidden" name="company_id" value={c.id} />
                <button className="rounded border px-2 py-1 text-xs">Entrar como suporte</button>
              </form>
              <form action={setCompanyStatus}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="status" value={c.status === 'ativa' ? 'suspensa' : 'ativa'} />
                <button className="rounded border px-2 py-1 text-xs">
                  {c.status === 'ativa' ? 'Suspender' : 'Reativar'}
                </button>
              </form>
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhuma empresa.</li>}
      </ul>
    </div>
  )
}
