import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getProfile()
  if (profile.role !== 'admin') redirect('/')
  return (
    <div className="space-y-4">
      <nav className="no-print flex flex-wrap gap-3 text-sm border-b pb-2">
        <Link href="/admin/produtos">Produtos</Link>
        <Link href="/admin/pagamento">Pagamento</Link>
        <Link href="/admin/empresa">Empresa</Link>
        <Link href="/admin/usuarios">Usuários</Link>
      </nav>
      {children}
    </div>
  )
}
