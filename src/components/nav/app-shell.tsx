import { navFor } from '@/lib/nav/items'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'
import { MobileNav } from './mobile-nav'
import type { Profile } from '@/lib/auth'

export function AppShell({
  profile,
  children,
}: {
  profile: Profile
  children: React.ReactNode
}) {
  const items = navFor(profile.role)
  return (
    <div className="min-h-dvh bg-background">
      <Sidebar items={items} />
      <TopBar name={profile.name} />
      <main className="p-4 pb-24 md:ml-[260px] md:p-6 md:pb-6">
        <div className="mx-auto max-w-[1280px]">{children}</div>
      </main>
      <MobileNav items={items} />
    </div>
  )
}
