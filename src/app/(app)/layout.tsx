import Link from 'next/link'
import { getProfile } from '@/lib/auth'
import { LogoutButton } from '@/components/logout-button'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getProfile()
  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-10 border-b bg-background">
        <nav className="mx-auto flex max-w-3xl items-center gap-4 p-3 text-sm">
          <Link href="/" className="font-semibold">Orçamentos</Link>
          {profile.role === 'admin' && <Link href="/admin/produtos">Admin</Link>}
          <span className="ml-auto text-muted-foreground">{profile.name}</span>
          <LogoutButton />
        </nav>
      </header>
      <main className="mx-auto max-w-3xl p-4">{children}</main>
    </div>
  )
}
