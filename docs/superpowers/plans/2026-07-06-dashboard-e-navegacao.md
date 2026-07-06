# Dashboard de Orçamentos + Novo Shell de Navegação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma página de dashboard só-admin (`/admin/dashboard`) para acompanhar orçamentos, valores e status, e adotar um novo shell de navegação (sidebar + top bar + bottom nav mobile) em todo o app, no estilo "Precision & Clarity".

**Architecture:** Next.js App Router (RSC) + Supabase. Uma função RPC no Postgres (`dashboard_metrics`) agrega tudo em um JSON, chamada por um server component. O shell de navegação vive em `components/nav/` alimentado por uma lista única de itens filtrada por papel. Design tokens já mapeados nas variáveis shadcn em `globals.css`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, shadcn, Supabase (Postgres + RLS), Vitest, Material Symbols, Hanken Grotesk + JetBrains Mono.

**Base:** branch `feature/dashboard-navegacao` (a partir de `build-v1`). O design system (Hanken Grotesk + tokens de cor/raio) já está aplicado e commitado.

---

## Referência de arquivos

**Criar:**
- `src/components/ui/icon.tsx` — wrapper de ícone Material Symbols
- `src/lib/nav/items.ts` — lista única de itens de navegação + `navFor(role)`
- `src/lib/nav/items.test.ts` — teste do filtro por papel
- `src/components/nav/nav-link.tsx` — link com estado ativo (client)
- `src/components/nav/sidebar.tsx` — sidebar desktop (client)
- `src/components/nav/top-bar.tsx` — barra superior (server)
- `src/components/nav/mobile-nav.tsx` — bottom nav + FAB (client)
- `src/components/nav/app-shell.tsx` — compõe o shell (server)
- `src/lib/dashboard/period.ts` — `range`/`month` → intervalo de datas
- `src/lib/dashboard/period.test.ts` — teste do helper
- `src/lib/dashboard/types.ts` — tipos do retorno da RPC
- `supabase/migrations/0006_dashboard_metrics.sql` — função RPC
- `src/components/dashboard/kpi-card.tsx`
- `src/components/dashboard/bar-chart.tsx`
- `src/components/dashboard/section-card.tsx`
- `src/components/dashboard/stat-list.tsx`
- `src/components/dashboard/period-filter.tsx` (client)
- `src/app/(app)/admin/dashboard/page.tsx`

**Modificar:**
- `src/app/layout.tsx` — trocar Geist Mono por JetBrains Mono + link Material Symbols
- `src/app/globals.css` — `--font-mono`, `.label-caps`, `.material-symbols-outlined`
- `src/app/(app)/layout.tsx` — renderizar `<AppShell>`
- `src/app/(app)/admin/layout.tsx` — remover nav interna (só guard)
- `src/components/quote/status-badge.tsx` — pill de status

---

### Task 1: Fontes, ícones e utilitários de estilo

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Create: `src/components/ui/icon.tsx`

- [ ] **Step 1: JetBrains Mono + link Material Symbols no root layout**

Substitua o conteúdo de `src/app/layout.tsx` por:

```tsx
import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "Orçamentos — Serralheria",
  description: "Sistema de orçamentos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${hankenGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Atualizar `--font-mono` e adicionar utilitários em globals.css**

Em `src/app/globals.css`, dentro do bloco `@theme inline`, troque a linha do mono:

```css
  --font-mono: var(--font-jetbrains-mono);
```

(estava `var(--font-geist-mono)`).

Depois, no fim do arquivo (após o bloco `@media print`), adicione:

```css
.material-symbols-outlined {
  font-family: "Material Symbols Outlined";
  font-weight: normal;
  font-style: normal;
  font-size: 20px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  direction: ltr;
  -webkit-font-feature-settings: "liga";
  -webkit-font-smoothing: antialiased;
}

@layer components {
  .label-caps {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 12px;
    line-height: 16px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
}
```

- [ ] **Step 3: Componente Icon**

Crie `src/components/ui/icon.tsx`:

```tsx
export function Icon({
  name,
  className,
  filled,
}: {
  name: string
  className?: string
  filled?: boolean
}) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden
    >
      {name}
    </span>
  )
}
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: build conclui sem erros (ainda sem uso do Icon; só valida a compilação das mudanças de fonte/CSS).

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css src/components/ui/icon.tsx
git commit -m "feat: JetBrains Mono, Material Symbols e utilitário label-caps

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Lista de itens de navegação (TDD)

**Files:**
- Create: `src/lib/nav/items.ts`
- Test: `src/lib/nav/items.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/lib/nav/items.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { navFor } from './items'

describe('navFor', () => {
  it('vendedor só vê itens não-admin', () => {
    const items = navFor('vendedor')
    expect(items.every((i) => !i.adminOnly)).toBe(true)
    expect(items.map((i) => i.href)).toContain('/')
    expect(items.map((i) => i.href)).not.toContain('/admin/dashboard')
  })

  it('admin vê todos os itens', () => {
    const items = navFor('admin')
    expect(items.map((i) => i.href)).toContain('/admin/dashboard')
    expect(items.map((i) => i.href)).toContain('/admin/usuarios')
    expect(items.map((i) => i.href)).toContain('/')
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/nav/items.test.ts`
Expected: FAIL (`Cannot find module './items'`).

- [ ] **Step 3: Implementar**

Crie `src/lib/nav/items.ts`:

```ts
export interface NavItem {
  label: string
  href: string
  icon: string
  adminOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: 'dashboard', adminOnly: true },
  { label: 'Orçamentos', href: '/', icon: 'description' },
  { label: 'Produtos', href: '/admin/produtos', icon: 'inventory_2', adminOnly: true },
  { label: 'Pagamento', href: '/admin/pagamento', icon: 'payments', adminOnly: true },
  { label: 'Empresa', href: '/admin/empresa', icon: 'apartment', adminOnly: true },
  { label: 'Usuários', href: '/admin/usuarios', icon: 'group', adminOnly: true },
]

export function navFor(role: 'admin' | 'vendedor'): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.adminOnly || role === 'admin')
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/lib/nav/items.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav/items.ts src/lib/nav/items.test.ts
git commit -m "feat: itens de navegação com filtro por papel

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Componentes do shell de navegação

**Files:**
- Create: `src/components/nav/nav-link.tsx`
- Create: `src/components/nav/sidebar.tsx`
- Create: `src/components/nav/top-bar.tsx`
- Create: `src/components/nav/mobile-nav.tsx`
- Create: `src/components/nav/app-shell.tsx`

- [ ] **Step 1: NavLink (estado ativo)**

Crie `src/components/nav/nav-link.tsx`:

```tsx
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
```

- [ ] **Step 2: Sidebar**

Crie `src/components/nav/sidebar.tsx`:

```tsx
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
```

- [ ] **Step 3: TopBar (server, busca por cliente)**

Crie `src/components/nav/top-bar.tsx`:

```tsx
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
```

- [ ] **Step 4: MobileNav + FAB**

Crie `src/components/nav/mobile-nav.tsx`:

```tsx
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
```

- [ ] **Step 5: AppShell**

Crie `src/components/nav/app-shell.tsx`:

```tsx
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
```

- [ ] **Step 6: Commit**

```bash
git add src/components/nav
git commit -m "feat: componentes do shell de navegação (sidebar, top bar, mobile nav)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Integrar o shell no layout do app

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/admin/layout.tsx`

- [ ] **Step 1: Substituir o layout do app pelo AppShell**

Substitua o conteúdo de `src/app/(app)/layout.tsx` por:

```tsx
import { getProfile } from '@/lib/auth'
import { AppShell } from '@/components/nav/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getProfile()
  return <AppShell profile={profile}>{children}</AppShell>
}
```

- [ ] **Step 2: Enxugar o layout admin (só guard)**

Substitua o conteúdo de `src/app/(app)/admin/layout.tsx` por:

```tsx
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getProfile()
  if (profile.role !== 'admin') redirect('/')
  return <>{children}</>
}
```

- [ ] **Step 3: Build e checagem visual**

Run: `npm run build`
Expected: build sem erros.

Run: `npm run dev` e abra `http://localhost:3000`
Expected: sidebar à esquerda no desktop, top bar com busca e avatar, itens admin visíveis só para admin; no mobile (janela estreita) aparece a bottom nav + FAB. As páginas existentes continuam funcionando.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/layout.tsx src/app/(app)/admin/layout.tsx
git commit -m "feat: usa o novo shell de navegação no app e simplifica o layout admin

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: StatusBadge no padrão pill

**Files:**
- Modify: `src/components/quote/status-badge.tsx`

- [ ] **Step 1: Atualizar o componente**

Substitua o conteúdo de `src/components/quote/status-badge.tsx` por:

```tsx
const map: Record<string, { label: string; cls: string }> = {
  rascunho: { label: 'Rascunho', cls: 'bg-amber-100 text-amber-800' },
  enviado: { label: 'Enviado', cls: 'bg-blue-100 text-blue-800' },
  aprovado: { label: 'Aprovado', cls: 'bg-green-100 text-green-800' },
  recusado: { label: 'Recusado', cls: 'bg-red-100 text-red-800' },
}

export function StatusBadge({ status }: { status: string }) {
  const s = map[status] ?? map.rascunho
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}
    >
      {s.label}
    </span>
  )
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/quote/status-badge.tsx
git commit -m "feat: StatusBadge no formato pill do design system

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Helper de período (TDD)

**Files:**
- Create: `src/lib/dashboard/period.ts`
- Test: `src/lib/dashboard/period.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/lib/dashboard/period.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolvePeriod } from './period'

const now = new Date(Date.UTC(2026, 5, 15, 12, 0, 0)) // 2026-06-15

describe('resolvePeriod', () => {
  it('sem params → tudo (null/null)', () => {
    expect(resolvePeriod({}, now)).toEqual({ start: null, end: null })
  })

  it('range=tudo → null/null', () => {
    expect(resolvePeriod({ range: 'tudo' }, now)).toEqual({ start: null, end: null })
  })

  it('range=mes → mês atual', () => {
    const p = resolvePeriod({ range: 'mes' }, now)
    expect(p.start).toBe('2026-06-01T00:00:00.000Z')
    expect(p.end).toBe('2026-07-01T00:00:00.000Z')
  })

  it('range=ano → ano atual', () => {
    const p = resolvePeriod({ range: 'ano' }, now)
    expect(p.start).toBe('2026-01-01T00:00:00.000Z')
    expect(p.end).toBe('2027-01-01T00:00:00.000Z')
  })

  it('month=YYYY-MM tem precedência sobre range', () => {
    const p = resolvePeriod({ range: 'ano', month: '2025-03' }, now)
    expect(p.start).toBe('2025-03-01T00:00:00.000Z')
    expect(p.end).toBe('2025-04-01T00:00:00.000Z')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/dashboard/period.test.ts`
Expected: FAIL (`Cannot find module './period'`).

- [ ] **Step 3: Implementar**

Crie `src/lib/dashboard/period.ts`:

```ts
export interface Period {
  start: string | null
  end: string | null
}

// Observação: fronteiras calculadas em UTC (deterministas e testáveis).
export function resolvePeriod(
  params: { range?: string; month?: string },
  now: Date = new Date(),
): Period {
  const { range, month } = params

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number)
    return {
      start: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
      end: new Date(Date.UTC(y, m, 1)).toISOString(),
    }
  }

  const y = now.getUTCFullYear()
  const mo = now.getUTCMonth()
  const d = now.getUTCDate()

  switch (range) {
    case 'mes':
      return {
        start: new Date(Date.UTC(y, mo, 1)).toISOString(),
        end: new Date(Date.UTC(y, mo + 1, 1)).toISOString(),
      }
    case '30d':
      return {
        start: new Date(Date.UTC(y, mo, d - 30)).toISOString(),
        end: new Date(Date.UTC(y, mo, d + 1)).toISOString(),
      }
    case 'ano':
      return {
        start: new Date(Date.UTC(y, 0, 1)).toISOString(),
        end: new Date(Date.UTC(y + 1, 0, 1)).toISOString(),
      }
    default:
      return { start: null, end: null }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/dashboard/period.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/period.ts src/lib/dashboard/period.test.ts
git commit -m "feat: helper de período do dashboard (range/month → intervalo)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Tipos do retorno da RPC

**Files:**
- Create: `src/lib/dashboard/types.ts`

- [ ] **Step 1: Criar os tipos**

Crie `src/lib/dashboard/types.ts`:

```ts
export interface DashboardKpis {
  total_count: number
  approved_value: number
  open_value: number
  avg_ticket: number
  conversion_rate: number
}

export interface FunnelRow {
  status: string
  count: number
  value: number
}

export interface DashboardMetrics {
  kpis: DashboardKpis
  funnel: FunnelRow[]
  expiring: { due_7_days: number; overdue: number }
  monthly: { month: string; value: number }[]
  sellers: { name: string; approved_value: number; count: number }[]
  products: { product_name: string; times: number; qty: number }[]
  recent: {
    id: string
    customer_name: string
    total: number
    status: string
    created_at: string
  }[]
}

export const EMPTY_METRICS: DashboardMetrics = {
  kpis: { total_count: 0, approved_value: 0, open_value: 0, avg_ticket: 0, conversion_rate: 0 },
  funnel: [],
  expiring: { due_7_days: 0, overdue: 0 },
  monthly: [],
  sellers: [],
  products: [],
  recent: [],
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/dashboard/types.ts
git commit -m "feat: tipos do retorno da RPC dashboard_metrics

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: Migration da função `dashboard_metrics`

**Files:**
- Create: `supabase/migrations/0006_dashboard_metrics.sql`

- [ ] **Step 1: Escrever a migration**

Crie `supabase/migrations/0006_dashboard_metrics.sql`:

```sql
-- Métricas do dashboard (admin). Agrega tudo em um JSON.
-- Reutiliza public.is_admin() (definido em 0002_rls.sql).
create or replace function public.dashboard_metrics(
  p_start timestamptz default null,
  p_end timestamptz default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  with periodo as (
    select q.* from quotes q
    where (p_start is null or q.created_at >= p_start)
      and (p_end is null or q.created_at < p_end)
  )
  select jsonb_build_object(
    'kpis', (
      select jsonb_build_object(
        'total_count', count(*),
        'approved_value', coalesce(sum(total) filter (where status = 'aprovado'), 0),
        'open_value', coalesce(sum(total) filter (where status = 'enviado'), 0),
        'avg_ticket', coalesce(avg(total), 0),
        'conversion_rate', coalesce(
          count(*) filter (where status = 'aprovado')::numeric
          / nullif(count(*) filter (where status in ('aprovado','recusado')), 0),
          0)
      ) from periodo
    ),
    'funnel', (
      select coalesce(jsonb_agg(
        jsonb_build_object('status', s.status, 'count', coalesce(c.cnt, 0), 'value', coalesce(c.val, 0))
        order by s.ord), '[]'::jsonb)
      from (values ('rascunho', 1), ('enviado', 2), ('aprovado', 3), ('recusado', 4)) as s(status, ord)
      left join (
        select status, count(*) as cnt, sum(total) as val from periodo group by status
      ) c on c.status = s.status
    ),
    'expiring', (
      select jsonb_build_object(
        'due_7_days', count(*) filter (where status = 'enviado' and valid_until >= current_date and valid_until <= current_date + 7),
        'overdue', count(*) filter (where status = 'enviado' and valid_until < current_date)
      ) from quotes
    ),
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object('month', m, 'value', v) order by m), '[]'::jsonb)
      from (
        select date_trunc('month', created_at) as m, sum(total) as v
        from periodo group by 1
      ) t
    ),
    'sellers', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'approved_value', av, 'count', cnt) order by av desc), '[]'::jsonb)
      from (
        select coalesce(p.name, 'Sem vendedor') as name,
               coalesce(sum(q.total) filter (where q.status = 'aprovado'), 0) as av,
               count(*) as cnt
        from periodo q left join profiles p on p.id = q.created_by
        group by 1
        order by av desc
        limit 10
      ) t
    ),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object('product_name', product_name, 'times', times, 'qty', qty) order by times desc), '[]'::jsonb)
      from (
        select qi.product_name, count(*) as times, coalesce(sum(qi.qty), 0) as qty
        from quote_items qi
        join periodo q on q.id = qi.quote_id
        group by qi.product_name
        order by times desc
        limit 10
      ) t
    ),
    'recent', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'customer_name', customer_name, 'total', total, 'status', status, 'created_at', created_at
      ) order by created_at desc), '[]'::jsonb)
      from (
        select id, customer_name, total, status, created_at
        from quotes order by created_at desc limit 8
      ) t
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.dashboard_metrics(timestamptz, timestamptz) to authenticated;
```

- [ ] **Step 2: Aplicar a migration no Supabase**

Aplique o arquivo no banco (via Supabase MCP `apply_migration` com o conteúdo acima, ou `supabase db push` conforme o fluxo do projeto).

- [ ] **Step 3: Verificar a função**

Execute no banco (SQL):

```sql
select public.dashboard_metrics(null, null);
```

Expected: retorna um JSON com as chaves `kpis`, `funnel`, `expiring`, `monthly`, `sellers`, `products`, `recent`. (Executado como admin; como service role o `is_admin()` pode ser falso — validar de preferência autenticado como admin no app na Task 10.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_dashboard_metrics.sql
git commit -m "feat: função RPC dashboard_metrics (agregações do dashboard)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Componentes de UI do dashboard

**Files:**
- Create: `src/components/dashboard/kpi-card.tsx`
- Create: `src/components/dashboard/section-card.tsx`
- Create: `src/components/dashboard/stat-list.tsx`
- Create: `src/components/dashboard/bar-chart.tsx`
- Create: `src/components/dashboard/period-filter.tsx`

- [ ] **Step 1: KpiCard**

Crie `src/components/dashboard/kpi-card.tsx`:

```tsx
import { Icon } from '@/components/ui/icon'

export function KpiCard({
  label,
  value,
  icon,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  icon: string
  hint?: string
  tone?: 'default' | 'success' | 'warning'
}) {
  const toneCls =
    tone === 'success' ? 'text-green-600' : tone === 'warning' ? 'text-amber-600' : 'text-primary'
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="label-caps text-on-surface-variant">{label}</span>
        <Icon name={icon} className={toneCls} />
      </div>
      <div className={`text-2xl font-bold ${toneCls}`}>{value}</div>
      {hint && <p className="mt-1 text-sm text-on-surface-variant">{hint}</p>}
    </div>
  )
}
```

- [ ] **Step 2: SectionCard**

Crie `src/components/dashboard/section-card.tsx`:

```tsx
export function SectionCard({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="label-caps text-on-surface-variant">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: StatList**

Crie `src/components/dashboard/stat-list.tsx`:

```tsx
export function StatList({
  rows,
}: {
  rows: { left: React.ReactNode; right: React.ReactNode }[]
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-on-surface-variant">Sem dados.</p>
  }
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center justify-between gap-2">
          <span className="text-on-surface">{r.left}</span>
          <span className="font-semibold">{r.right}</span>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: BarChart**

Crie `src/components/dashboard/bar-chart.tsx`:

```tsx
export function BarChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-on-surface-variant">Sem dados no período.</p>
  }
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div>
      <div className="flex h-48 items-end justify-between gap-2 pt-4">
        {data.map((d, i) => (
          <div key={i} className="group relative flex-1">
            <div
              className="rounded-t-md bg-primary/70 transition-all group-hover:bg-primary"
              style={{ height: `${Math.max(2, Math.round((d.value / max) * 100))}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between gap-2">
        {data.map((d, i) => (
          <span key={i} className="label-caps flex-1 text-center text-on-surface-variant opacity-60">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: PeriodFilter (client)**

Crie `src/components/dashboard/period-filter.tsx`:

```tsx
'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const RANGES = [
  { key: 'mes', label: 'Mês atual' },
  { key: '30d', label: 'Últimos 30 dias' },
  { key: 'ano', label: 'Este ano' },
  { key: 'tudo', label: 'Tudo' },
]

export function PeriodFilter() {
  const router = useRouter()
  const sp = useSearchParams()
  const range = sp.get('range') ?? 'tudo'
  const month = sp.get('month') ?? ''

  return (
    <div className="flex flex-wrap items-center gap-2">
      {RANGES.map((r) => (
        <button
          key={r.key}
          onClick={() => router.push(`/admin/dashboard?range=${r.key}`)}
          className={cn(
            'label-caps rounded-full px-4 py-2 transition-colors',
            !month && range === r.key
              ? 'bg-primary text-primary-foreground'
              : 'border border-border bg-card text-on-surface-variant hover:bg-surface-container-low',
          )}
        >
          {r.label}
        </button>
      ))}
      <input
        type="month"
        value={month}
        onChange={(e) =>
          router.push(
            e.target.value
              ? `/admin/dashboard?month=${e.target.value}`
              : `/admin/dashboard?range=tudo`,
          )
        }
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
      />
    </div>
  )
}
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build sem erros (componentes ainda não usados; valida compilação).

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard
git commit -m "feat: componentes de UI do dashboard (kpi, gráfico, listas, filtro)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: Página do dashboard

**Files:**
- Create: `src/app/(app)/admin/dashboard/page.tsx`

- [ ] **Step 1: Criar a página**

Crie `src/app/(app)/admin/dashboard/page.tsx`:

```tsx
import Link from 'next/link'
import { getProfile } from '@/lib/auth'
import { formatBRL } from '@/lib/format'
import { resolvePeriod } from '@/lib/dashboard/period'
import { EMPTY_METRICS, type DashboardMetrics } from '@/lib/dashboard/types'
import { StatusBadge } from '@/components/quote/status-badge'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { BarChart } from '@/components/dashboard/bar-chart'
import { SectionCard } from '@/components/dashboard/section-card'
import { StatList } from '@/components/dashboard/stat-list'
import { PeriodFilter } from '@/components/dashboard/period-filter'

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; month?: string }>
}) {
  const { range, month } = await searchParams
  const { supabase } = await getProfile()
  const { start, end } = resolvePeriod({ range, month })
  const { data } = await supabase.rpc('dashboard_metrics', { p_start: start, p_end: end })
  const m = { ...EMPTY_METRICS, ...(data as DashboardMetrics | null) }

  const monthly = m.monthly.map((d) => ({
    label: new Date(d.month).toLocaleDateString('pt-BR', { month: 'short' }),
    value: Number(d.value),
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
      </div>

      <PeriodFilter />

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Total de orçamentos" value={String(m.kpis.total_count)} icon="description" />
        <KpiCard
          label="Valor aprovado"
          value={formatBRL(Number(m.kpis.approved_value))}
          icon="trending_up"
          tone="success"
        />
        <KpiCard
          label="Em aberto (enviado)"
          value={formatBRL(Number(m.kpis.open_value))}
          icon="schedule"
          tone="warning"
        />
        <KpiCard
          label="Taxa de conversão"
          value={`${Math.round(Number(m.kpis.conversion_rate) * 100)}%`}
          icon="percent"
          hint={`Ticket médio ${formatBRL(Number(m.kpis.avg_ticket))}`}
        />
      </section>

      {/* Funil + A vencer */}
      <section className="grid gap-3 md:grid-cols-2">
        <SectionCard title="Funil por status">
          <StatList
            rows={m.funnel.map((f) => ({
              left: STATUS_LABEL[f.status] ?? f.status,
              right: `${f.count} · ${formatBRL(Number(f.value))}`,
            }))}
          />
        </SectionCard>
        <SectionCard title="A vencer / vencidos">
          <StatList
            rows={[
              { left: 'Vencem em 7 dias', right: String(m.expiring.due_7_days) },
              {
                left: <span className="text-red-600">Já vencidos (enviados)</span>,
                right: <span className="text-red-600">{m.expiring.overdue}</span>,
              },
            ]}
          />
        </SectionCard>
      </section>

      {/* Evolução + Vendedores */}
      <section className="grid gap-3 md:grid-cols-2">
        <SectionCard title="Evolução por mês (valor)">
          <BarChart data={monthly} />
        </SectionCard>
        <SectionCard title="Ranking por vendedor">
          <StatList
            rows={m.sellers.map((s) => ({
              left: s.name,
              right: `${formatBRL(Number(s.approved_value))} · ${s.count}`,
            }))}
          />
        </SectionCard>
      </section>

      {/* Produtos + Recentes */}
      <section className="grid gap-3 md:grid-cols-2">
        <SectionCard title="Produtos mais orçados">
          <StatList
            rows={m.products.map((p) => ({
              left: p.product_name,
              right: `${p.times}×`,
            }))}
          />
        </SectionCard>
        <SectionCard title="Últimos orçamentos">
          {m.recent.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Nenhum orçamento.</p>
          ) : (
            <ul className="space-y-2">
              {m.recent.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/orcamentos/${r.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-container-low"
                  >
                    <span>{r.customer_name}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">{formatBRL(Number(r.total))}</span>
                      <StatusBadge status={r.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Build + lint**

Run: `npm run build && npm run lint`
Expected: ambos sem erros.

- [ ] **Step 3: Verificação manual (autenticado como admin)**

Run: `npm run dev`
- Abra `http://localhost:3000/admin/dashboard` como **admin** → todos os blocos aparecem; trocar chips de período e escolher um mês atualiza os números; "Últimos orçamentos" linka para `/orcamentos/[id]`.
- Faça login como **vendedor** e tente `/admin/dashboard` → redireciona para `/` (guard do `admin/layout.tsx`); a sidebar não mostra itens admin.

- [ ] **Step 4: Rodar toda a suíte de testes**

Run: `npm run test`
Expected: PASS (inclui `items.test.ts` e `period.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/admin/dashboard/page.tsx
git commit -m "feat: página de dashboard de orçamentos (admin)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-review realizada

- **Cobertura do spec:** shell (Tasks 1,3,4), estilo/fontes (Task 1), StatusBadge (Task 5), RPC (Task 8), período (Task 6), tipos (Task 7), UI + página com os 7 blocos e filtro (Tasks 9,10). ✔
- **Sem placeholders:** todo passo traz código/comando completo. ✔
- **Consistência de tipos:** `DashboardMetrics`/`EMPTY_METRICS` (Task 7) usados na página (Task 10); `resolvePeriod`/`Period` (Task 6) usados na página; `navFor`/`NavItem` (Task 2) usados nos componentes (Task 3) e AppShell. Nomes das chaves do JSON da RPC (Task 8) batem com os tipos (Task 7): `total_count`, `approved_value`, `open_value`, `avg_ticket`, `conversion_rate`, `funnel[].{status,count,value}`, `expiring.{due_7_days,overdue}`, `monthly[].{month,value}`, `sellers[].{name,approved_value,count}`, `products[].{product_name,times,qty}`, `recent[].{id,customer_name,total,status,created_at}`. ✔
