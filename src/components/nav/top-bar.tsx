import { Icon } from '@/components/ui/icon'

export function TopBar({ name }: { name: string }) {
  const initial = name?.trim()?.[0]?.toUpperCase() ?? '?'
  return (
    <header className="no-print sticky top-0 z-40 h-16 border-b border-border bg-card md:ml-[260px]">
      <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between gap-4 px-4">
        <form action="/" className="relative hidden sm:block">
          <input
            name="q"
            placeholder="Buscar cliente…"
            className="w-64 rounded-full border-none bg-muted py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary"
          />
          <Icon
            name="search"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
        </form>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-on-surface-variant">{name}</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {initial}
          </div>
        </div>
      </div>
    </header>
  )
}
