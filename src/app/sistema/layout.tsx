import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'

export default async function SistemaLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getProfile()
  if (profile.role !== 'admin_system') redirect('/')
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b px-4 py-3">
        <div className="mx-auto flex max-w-[960px] items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="font-semibold">Administração do sistema</h1>
            <nav className="flex gap-3 text-sm">
              <Link href="/sistema/empresas" className="text-muted-foreground hover:underline">Empresas</Link>
              <Link href="/sistema/areas" className="text-muted-foreground hover:underline">Áreas</Link>
              <Link href="/sistema/usuarios" className="text-muted-foreground hover:underline">Usuários</Link>
            </nav>
          </div>
          <span className="text-sm text-muted-foreground">{profile.name}</span>
        </div>
      </header>
      <main className="mx-auto max-w-[960px] p-4 md:p-6">{children}</main>
    </div>
  )
}
