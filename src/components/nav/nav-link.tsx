'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

export function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  const pathname = usePathname()
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-4 py-3 transition-all',
        active
          ? 'bg-primary font-semibold text-primary-foreground'
          : 'text-on-surface-variant hover:bg-surface-container-low',
      )}
    >
      <Icon name={icon} filled={active} />
      <span className="label-caps">{label}</span>
    </Link>
  )
}
