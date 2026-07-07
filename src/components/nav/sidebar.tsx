import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { NavLink } from './nav-link'
import { LogoutButton } from '@/components/logout-button'
import type { NavItem } from '@/lib/nav/items'

export function Sidebar({ items }: { items: NavItem[] }) {
  return (
    <aside className="no-print fixed left-0 top-0 z-50 hidden h-full w-[260px] flex-col border-r border-border bg-card px-4 py-6 md:flex">
      <div className="mb-8 flex items-center gap-3 px-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <Icon name="security" filled className="text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-none text-primary">Orçamentos</h1>
          <p className="label-caps text-on-surface-variant opacity-70">Serralheria</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1">
        {items.map((i) => (
          <NavLink key={i.href} href={i.href} label={i.label} icon={i.icon} />
        ))}
      </nav>
      <div className="mt-auto space-y-3">
        <Link
          href="/orcamentos/novo"
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground transition hover:brightness-110"
        >
          <Icon name="add" />
          <span className="label-caps">Novo orçamento</span>
        </Link>
        <div className="px-4">
          <LogoutButton />
        </div>
      </div>
    </aside>
  )
}
