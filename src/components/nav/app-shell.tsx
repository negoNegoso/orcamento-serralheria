import { navFor } from '@/lib/nav/items'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'
import { MobileNav } from './mobile-nav'
import { SupportBanner } from './support-banner'
import type { Profile } from '@/lib/auth'
import type { Company } from '@/lib/tenant'

export function AppShell({
  profile,
  company,
  children,
}: {
  profile: Profile
  company: Company
  children: React.ReactNode
}) {
  const items = navFor(profile.role)
  return (
    <div className="min-h-dvh bg-background">
      {profile.role === 'admin_system' && <SupportBanner companyName={company.name} />}
      <Sidebar items={items} businessArea={company.business_area} />
      <TopBar name={profile.name} />
      <main className="p-4 pb-24 md:ml-[260px] md:p-6 md:pb-6">
        <div className="mx-auto max-w-[1280px]">{children}</div>
      </main>
      <MobileNav items={items} />
    </div>
  )
}
