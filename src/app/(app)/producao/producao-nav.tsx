'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/producao', label: 'Quadro' },
  { href: '/producao/calendario', label: 'Calendário' },
  { href: '/producao/concluidos', label: 'Concluídos' },
]

export function ProductionNav() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-2 border-b pb-2 text-sm">
      {TABS.map(t => (
        <Link key={t.href} href={t.href}
          className={cn('rounded px-3 py-1',
            pathname === t.href ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
