'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import type { NavItem } from '@/lib/nav/items'

export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  const main = items.slice(0, 4)
  return (
    <>
      <nav className="no-print fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-border bg-card px-2 py-2 md:hidden">
        {main.map((i) => {
          const active = i.href === '/' ? pathname === '/' : pathname.startsWith(i.href)
          return (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                'flex flex-col items-center gap-0.5',
                active ? 'text-primary' : 'text-on-surface-variant',
              )}
            >
              <Icon name={i.icon} filled={active} />
              <span className="label-caps">{i.label}</span>
            </Link>
          )
        })}
      </nav>
      <Link
        href="/orcamentos/novo"
        className="no-print fixed bottom-20 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:hidden"
      >
        <Icon name="add" className="text-2xl" />
      </Link>
    </>
  )
}
