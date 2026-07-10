# Planejamento de Produção — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo "Produção" que organiza orçamentos aprovados por etapa (kanban com botões ‹› + drag), checklist de pendências, calendário (dia/semana/mês) e histórico de concluídos — tudo guiado pela data de entrega.

**Architecture:** Reusa `quotes` (já tem `delivery_date`, `status`). Migration adiciona `production_stage`, `archived_at` e a tabela `quote_pendencies`. Regras puras (etapas, urgência, grade do calendário) ficam em `src/lib/production/*` com testes Vitest. UI em `src/app/(app)/producao/*` (Quadro, Calendário, Concluídos) + componentes client em `src/components/production/*`, com server actions.

**Tech Stack:** Next.js App Router (server components + server actions), Supabase, Vitest, Tailwind. Sem dependência nova (drag = HTML5 nativo).

**Spec:** `docs/superpowers/specs/2026-07-09-planejamento-producao-design.md`

## Global Constraints

- Elegível ao quadro/calendário ativo: `status = 'aprovado' AND archived_at IS NULL`
- Etapas fixas, nesta ordem: `pendente → a_produzir → em_producao → pronto → instalado`
- Ao `status` virar `aprovado`, `production_stage` recebe `pendente` **apenas se estava null** (preserva etapa ao reaprovar)
- "Concluir" (na etapa `instalado`) grava `archived_at = now()` → vai pro histórico
- Urgência da data: `atrasado` (< hoje), `urgente` (hoje ou amanhã), `futuro` (depois), `sem-data` (null)
- Cor de urgência: atrasado = vermelho, urgente = laranja/âmbar, futuro = normal, sem-data = cinza
- pt-BR em toda UI; datas comparadas como string ISO `YYYY-MM-DD` (lexicográfico); dinheiro via `formatBRL`
- Migration nova: número `0010`; RLS de tabela nova = CRUD para `authenticated` (padrão do projeto)
- Supabase project id: `nwtfesocleshvynxrpfh` (aplicar via MCP `apply_migration` + arquivo em `supabase/migrations/`)
- Não iniciar/matar dev server nas tasks de implementação; verificação por task = `npm run test` + `npm run lint` + `npm run build`
- Branch: `feature/planejamento-producao` (a partir de build-v1, que já tem `delivery_date`)

---

### Task 1: Migration 0010 — colunas + tabela de pendências

**Files:**
- Create: `supabase/migrations/0010_producao.sql` (+ aplicar via MCP, name `0010_producao`)

**Interfaces:**
- Consumes: —
- Produces: `quotes.production_stage text` (nullável, check dos 5 valores), `quotes.archived_at timestamptz`; tabela `quote_pendencies(id, quote_id, label, done, sort_order, created_at)` com RLS

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/0010_producao.sql`:

```sql
-- Planejamento de produção: etapa (kanban), arquivamento (histórico) e checklist de pendências.
alter table quotes
  add column if not exists production_stage text
    check (production_stage in ('pendente','a_produzir','em_producao','pronto','instalado')),
  add column if not exists archived_at timestamptz;

create index if not exists quotes_production_idx
  on quotes (production_stage) where archived_at is null;

create table if not exists quote_pendencies (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists quote_pendencies_quote_idx on quote_pendencies (quote_id);

alter table quote_pendencies enable row level security;
create policy qp_all on quote_pendencies for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Aplicar e verificar**

Aplicar via MCP `apply_migration` (project `nwtfesocleshvynxrpfh`, name `0010_producao`, query acima). Depois, via `execute_sql`:
`select column_name from information_schema.columns where table_name='quotes' and column_name in ('production_stage','archived_at');`
→ Expected: as duas colunas. E `select count(*) from quote_pendencies;` → 0.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0010_producao.sql
git commit -m "feat(db): colunas de produção e tabela de pendências

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Regras puras de etapas (TDD)

**Files:**
- Create: `src/lib/production/stages.ts`
- Test: `src/lib/production/stages.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `type Stage = 'pendente'|'a_produzir'|'em_producao'|'pronto'|'instalado'`
  - `STAGES: Stage[]` (ordem)
  - `STAGE_LABELS: Record<Stage,string>` (rótulos pt-BR)
  - `nextStage(s: Stage): Stage | null` (null na última)
  - `prevStage(s: Stage): Stage | null` (null na primeira)
  - `isValidStage(s: string): s is Stage`

- [ ] **Step 1: Teste que falha**

`src/lib/production/stages.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { STAGES, STAGE_LABELS, nextStage, prevStage, isValidStage } from './stages'

describe('etapas de produção', () => {
  it('ordem fixa das 5 etapas', () => {
    expect(STAGES).toEqual(['pendente', 'a_produzir', 'em_producao', 'pronto', 'instalado'])
  })
  it('rótulos pt-BR', () => {
    expect(STAGE_LABELS.pendente).toBe('Pendente')
    expect(STAGE_LABELS.a_produzir).toBe('A produzir')
    expect(STAGE_LABELS.em_producao).toBe('Em produção')
    expect(STAGE_LABELS.pronto).toBe('Pronto')
    expect(STAGE_LABELS.instalado).toBe('Instalado')
  })
  it('nextStage avança e para na última', () => {
    expect(nextStage('pendente')).toBe('a_produzir')
    expect(nextStage('pronto')).toBe('instalado')
    expect(nextStage('instalado')).toBeNull()
  })
  it('prevStage volta e para na primeira', () => {
    expect(prevStage('a_produzir')).toBe('pendente')
    expect(prevStage('pendente')).toBeNull()
  })
  it('isValidStage', () => {
    expect(isValidStage('pronto')).toBe(true)
    expect(isValidStage('qualquer')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/production/stages.test.ts` → Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

`src/lib/production/stages.ts`:

```ts
export type Stage = 'pendente' | 'a_produzir' | 'em_producao' | 'pronto' | 'instalado'

export const STAGES: Stage[] = ['pendente', 'a_produzir', 'em_producao', 'pronto', 'instalado']

export const STAGE_LABELS: Record<Stage, string> = {
  pendente: 'Pendente',
  a_produzir: 'A produzir',
  em_producao: 'Em produção',
  pronto: 'Pronto',
  instalado: 'Instalado',
}

export function isValidStage(s: string): s is Stage {
  return (STAGES as string[]).includes(s)
}

export function nextStage(s: Stage): Stage | null {
  const i = STAGES.indexOf(s)
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null
}

export function prevStage(s: Stage): Stage | null {
  const i = STAGES.indexOf(s)
  return i > 0 ? STAGES[i - 1] : null
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test` → Expected: suíte verde (as existentes + 5 novos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/production/stages.ts src/lib/production/stages.test.ts
git commit -m "feat: regras puras de etapas de produção

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Regra pura de urgência (TDD)

**Files:**
- Create: `src/lib/production/urgency.ts`
- Test: `src/lib/production/urgency.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `type Urgency = 'atrasado'|'urgente'|'futuro'|'sem-data'`; `urgencyFor(deliveryDate: string|null, todayISO: string): Urgency` (compara strings ISO; urgente = hoje ou amanhã)

- [ ] **Step 1: Teste que falha**

`src/lib/production/urgency.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { urgencyFor } from './urgency'

describe('urgencyFor', () => {
  const hoje = '2026-07-09'
  it('sem data', () => {
    expect(urgencyFor(null, hoje)).toBe('sem-data')
    expect(urgencyFor('', hoje)).toBe('sem-data')
  })
  it('ontem ou antes = atrasado', () => {
    expect(urgencyFor('2026-07-08', hoje)).toBe('atrasado')
    expect(urgencyFor('2026-01-01', hoje)).toBe('atrasado')
  })
  it('hoje e amanhã = urgente', () => {
    expect(urgencyFor('2026-07-09', hoje)).toBe('urgente')
    expect(urgencyFor('2026-07-10', hoje)).toBe('urgente')
  })
  it('depois de amanhã = futuro', () => {
    expect(urgencyFor('2026-07-11', hoje)).toBe('futuro')
    expect(urgencyFor('2026-12-31', hoje)).toBe('futuro')
  })
  it('vira do mês corretamente (amanhã cruzando mês)', () => {
    expect(urgencyFor('2026-08-01', '2026-07-31')).toBe('urgente')
    expect(urgencyFor('2026-08-02', '2026-07-31')).toBe('futuro')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/production/urgency.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/lib/production/urgency.ts`:

```ts
export type Urgency = 'atrasado' | 'urgente' | 'futuro' | 'sem-data'

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function urgencyFor(deliveryDate: string | null, todayISO: string): Urgency {
  const dd = (deliveryDate ?? '').trim()
  if (!dd) return 'sem-data'
  if (dd < todayISO) return 'atrasado'
  const amanha = addDaysISO(todayISO, 1)
  if (dd === todayISO || dd === amanha) return 'urgente'
  return 'futuro'
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test` → Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/lib/production/urgency.ts src/lib/production/urgency.test.ts
git commit -m "feat: regra pura de urgência da data de entrega

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Grade do calendário (TDD)

**Files:**
- Create: `src/lib/production/calendar.ts`
- Test: `src/lib/production/calendar.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `type CalView = 'dia'|'semana'|'mes'`
  - `calendarDays(view: CalView, dateISO: string): string[]` — lista de datas `YYYY-MM-DD`. `dia`=1; `semana`=7 (domingo→sábado da semana que contém a data); `mes`=grade de semanas completas (múltiplo de 7, do domingo ≤ dia 1 ao sábado ≥ último dia)
  - `shiftPeriod(view: CalView, dateISO: string, dir: -1 | 1): string` — data de referência do período anterior/próximo

- [ ] **Step 1: Teste que falha**

`src/lib/production/calendar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { calendarDays, shiftPeriod } from './calendar'

describe('calendarDays', () => {
  it('dia = só a própria data', () => {
    expect(calendarDays('dia', '2026-07-09')).toEqual(['2026-07-09'])
  })
  it('semana = domingo a sábado contendo a data', () => {
    // 2026-07-09 é quinta; semana começa 2026-07-05 (domingo)
    expect(calendarDays('semana', '2026-07-09')).toEqual([
      '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08',
      '2026-07-09', '2026-07-10', '2026-07-11',
    ])
  })
  it('mês = grade de semanas completas cobrindo julho/2026', () => {
    const dias = calendarDays('mes', '2026-07-15')
    expect(dias.length % 7).toBe(0)
    expect(dias[0]).toBe('2026-06-28') // domingo antes do dia 1 (2026-07-01 é quarta)
    expect(dias).toContain('2026-07-01')
    expect(dias).toContain('2026-07-31')
    expect(dias[dias.length - 1] >= '2026-07-31').toBe(true)
  })
})

describe('shiftPeriod', () => {
  it('dia ±1', () => {
    expect(shiftPeriod('dia', '2026-07-09', 1)).toBe('2026-07-10')
    expect(shiftPeriod('dia', '2026-07-09', -1)).toBe('2026-07-08')
  })
  it('semana ±7', () => {
    expect(shiftPeriod('semana', '2026-07-09', 1)).toBe('2026-07-16')
  })
  it('mês ±1 mês', () => {
    expect(shiftPeriod('mes', '2026-07-15', 1)).toBe('2026-08-15')
    expect(shiftPeriod('mes', '2026-01-15', -1)).toBe('2025-12-15')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/production/calendar.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/lib/production/calendar.ts`:

```ts
export type CalView = 'dia' | 'semana' | 'mes'

function toISO(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
}
function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number)
  return [y, m - 1, d] // m zero-based
}

export function calendarDays(view: CalView, dateISO: string): string[] {
  const [y, m, d] = parts(dateISO)
  if (view === 'dia') return [dateISO]

  if (view === 'semana') {
    const base = new Date(Date.UTC(y, m, d))
    const dow = base.getUTCDay() // 0=domingo
    const start = new Date(Date.UTC(y, m, d - dow))
    return Array.from({ length: 7 }, (_, i) =>
      new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i))
        .toISOString().slice(0, 10),
    )
  }

  // mes: grade de semanas completas
  const first = new Date(Date.UTC(y, m, 1))
  const startDow = first.getUTCDay()
  const gridStart = new Date(Date.UTC(y, m, 1 - startDow))
  const last = new Date(Date.UTC(y, m + 1, 0)) // último dia do mês
  const endDow = last.getUTCDay()
  const gridEnd = new Date(Date.UTC(y, m + 1, 0 + (6 - endDow)))
  const days: string[] = []
  for (let t = gridStart.getTime(); t <= gridEnd.getTime(); t += 86400000) {
    days.push(new Date(t).toISOString().slice(0, 10))
  }
  return days
}

export function shiftPeriod(view: CalView, dateISO: string, dir: -1 | 1): string {
  const [y, m, d] = parts(dateISO)
  if (view === 'dia') return toISO(y, m, d + dir)
  if (view === 'semana') return toISO(y, m, d + 7 * dir)
  return toISO(y, m + dir, d) // mes
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test` → Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/lib/production/calendar.ts src/lib/production/calendar.test.ts
git commit -m "feat: grade e navegação do calendário de produção

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Ao aprovar, entrar na etapa Pendente

**Files:**
- Modify: `src/app/(app)/orcamentos/actions.ts` (função `setStatus`)

**Interfaces:**
- Consumes: —
- Produces: efeito colateral — aprovar seta `production_stage='pendente'` se null; revalida `/producao`

- [ ] **Step 1: Editar `setStatus`**

Substituir a função `setStatus` existente por:

```ts
export async function setStatus(id: string, status: 'rascunho' | 'enviado' | 'aprovado' | 'recusado') {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('quotes')
    .update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  // ao aprovar, entra no quadro de produção na etapa inicial (só se ainda não tem etapa)
  if (status === 'aprovado') {
    await supabase.from('quotes')
      .update({ production_stage: 'pendente' }).eq('id', id).is('production_stage', null)
  }
  revalidatePath('/')
  revalidatePath(`/orcamentos/${id}`)
  revalidatePath('/producao')
}
```

- [ ] **Step 2: Verificar**

Run: `npm run build && npm run lint && npm run test` → Expected: tudo verde (sem teste novo; comportamento coberto na verificação de browser da Task 7).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/orcamentos/actions.ts"
git commit -m "feat: aprovar orçamento o coloca na etapa Pendente da produção

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Navegação, sub-nav e queries do módulo

**Files:**
- Modify: `src/lib/nav/items.ts` (item "Produção")
- Create: `src/app/(app)/producao/producao-nav.tsx`
- Create: `src/lib/production/queries.ts`

**Interfaces:**
- Consumes: `Stage` (Task 2); `createServerSupabase`/`getProfile`
- Produces:
  - `NAV_ITEMS` ganha `{ label: 'Produção', href: '/producao', icon: 'precision_manufacturing' }`
  - `ProductionNav()` — sub-nav client com links Quadro/Calendário/Concluídos, marcando o ativo por `usePathname`
  - `BoardQuote { id, customer_name, delivery_date: string|null, total: number, production_stage: Stage|null, open_pendencies: number }`
  - `fetchBoardQuotes(supabase): Promise<BoardQuote[]>` — aprovados, não arquivados, com contagem de pendências abertas

- [ ] **Step 1: Item de navegação**

Em `src/lib/nav/items.ts`, adicionar ao array `NAV_ITEMS` (após 'Orçamentos'):

```ts
  { label: 'Produção', href: '/producao', icon: 'precision_manufacturing' },
```

- [ ] **Step 2: Sub-nav**

`src/app/(app)/producao/producao-nav.tsx`:

```tsx
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
```

- [ ] **Step 3: Queries**

`src/lib/production/queries.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Stage } from './stages'

export interface BoardQuote {
  id: string
  customer_name: string
  delivery_date: string | null
  total: number
  production_stage: Stage | null
  open_pendencies: number
}

export async function fetchBoardQuotes(supabase: SupabaseClient): Promise<BoardQuote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, customer_name, delivery_date, total, production_stage, quote_pendencies(done)')
    .eq('status', 'aprovado')
    .is('archived_at', null)
    .order('delivery_date', { ascending: true, nullsFirst: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((q: any) => ({
    id: q.id,
    customer_name: q.customer_name,
    delivery_date: q.delivery_date,
    total: Number(q.total),
    production_stage: q.production_stage,
    open_pendencies: (q.quote_pendencies ?? []).filter((p: { done: boolean }) => !p.done).length,
  }))
}
```

- [ ] **Step 4: Verificar**

Run: `npm run build && npm run lint && npm run test` → Expected: verde (nav mostra "Produção"; `/producao` ainda 404 até a Task 7 — ok, o build não falha por rota ausente referida só na nav).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav/items.ts "src/app/(app)/producao/producao-nav.tsx" src/lib/production/queries.ts
git commit -m "feat: navegação, sub-nav e queries do módulo de produção

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Quadro (kanban) com botões ‹ › e drag

**Files:**
- Create: `src/app/(app)/producao/page.tsx`
- Create: `src/app/(app)/producao/actions.ts`
- Create: `src/components/production/board.tsx`

**Interfaces:**
- Consumes: `fetchBoardQuotes`/`BoardQuote` (Task 6), `STAGES`/`STAGE_LABELS`/`nextStage`/`prevStage`/`isValidStage`/`Stage` (Task 2), `urgencyFor` (Task 3), `ProductionNav` (Task 6), `formatBRL`
- Produces:
  - Actions `setProductionStage(quoteId: string, stage: Stage): Promise<void>`, `archiveQuote(quoteId: string): Promise<void>`
  - `Board({ quotes, todayISO }: { quotes: BoardQuote[]; todayISO: string })` — kanban client

- [ ] **Step 1: Server actions**

`src/app/(app)/producao/actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { isValidStage, type Stage } from '@/lib/production/stages'

export async function setProductionStage(quoteId: string, stage: Stage): Promise<void> {
  const { supabase } = await getProfile()
  if (!isValidStage(stage)) throw new Error('Etapa inválida')
  const { error } = await supabase.from('quotes')
    .update({ production_stage: stage, updated_at: new Date().toISOString() })
    .eq('id', quoteId).eq('status', 'aprovado').is('archived_at', null)
  if (error) throw new Error(error.message)
  revalidatePath('/producao')
  revalidatePath('/producao/calendario')
}

export async function archiveQuote(quoteId: string): Promise<void> {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('quotes')
    .update({ archived_at: new Date().toISOString(), production_stage: 'instalado' })
    .eq('id', quoteId)
  if (error) throw new Error(error.message)
  revalidatePath('/producao')
  revalidatePath('/producao/concluidos')
  revalidatePath('/producao/calendario')
}
```

- [ ] **Step 2: Board (client)**

`src/components/production/board.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatBRL } from '@/lib/format'
import { STAGES, STAGE_LABELS, nextStage, prevStage, type Stage } from '@/lib/production/stages'
import { urgencyFor, type Urgency } from '@/lib/production/urgency'
import type { BoardQuote } from '@/lib/production/queries'
import { setProductionStage, archiveQuote } from '@/app/(app)/producao/actions'

const URGENCY_CLASS: Record<Urgency, string> = {
  atrasado: 'text-red-600 font-semibold',
  urgente: 'text-amber-600 font-semibold',
  futuro: 'text-muted-foreground',
  'sem-data': 'text-muted-foreground italic',
}

export function Board({ quotes, todayISO }: { quotes: BoardQuote[]; todayISO: string }) {
  const router = useRouter()
  const [dragId, setDragId] = useState<string | null>(null)

  async function move(id: string, stage: Stage) {
    await setProductionStage(id, stage)
    router.refresh()
  }
  async function conclude(id: string) {
    await archiveQuote(id)
    router.refresh()
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {STAGES.map(stage => {
        const cards = quotes.filter(q => (q.production_stage ?? 'pendente') === stage)
        return (
          <div key={stage}
            onDragOver={e => e.preventDefault()}
            onDrop={() => { if (dragId) { move(dragId, stage); setDragId(null) } }}
            className="w-64 shrink-0 rounded-lg bg-muted/40 p-2">
            <h3 className="mb-2 px-1 text-sm font-semibold">
              {STAGE_LABELS[stage]} <span className="text-muted-foreground">({cards.length})</span>
            </h3>
            <div className="space-y-2">
              {cards.map(q => {
                const urg = urgencyFor(q.delivery_date, todayISO)
                const prev = prevStage(stage)
                const next = nextStage(stage)
                return (
                  <div key={q.id} draggable onDragStart={() => setDragId(q.id)}
                    className="rounded border bg-background p-2 text-sm shadow-sm">
                    <p className="font-medium">{q.customer_name}</p>
                    <p className={URGENCY_CLASS[urg]}>
                      {q.delivery_date
                        ? new Date(q.delivery_date + 'T12:00:00').toLocaleDateString('pt-BR')
                        : 'sem data'}
                    </p>
                    <p className="text-muted-foreground">{formatBRL(q.total)}</p>
                    {q.open_pendencies > 0 && (
                      <p className="text-xs text-amber-700">{q.open_pendencies} pendência(s)</p>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <button disabled={!prev} onClick={() => prev && move(q.id, prev)}
                        className="rounded border px-2 py-0.5 disabled:opacity-30" aria-label="Voltar etapa">‹</button>
                      <Link href={`/orcamentos/${q.id}`} className="text-xs underline">abrir</Link>
                      {next
                        ? <button onClick={() => move(q.id, next)}
                            className="rounded border px-2 py-0.5" aria-label="Avançar etapa">›</button>
                        : <button onClick={() => conclude(q.id)}
                            className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">Concluir</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Página**

`src/app/(app)/producao/page.tsx`:

```tsx
import { getProfile } from '@/lib/auth'
import { fetchBoardQuotes } from '@/lib/production/queries'
import { ProductionNav } from './producao-nav'
import { Board } from '@/components/production/board'

export default async function ProducaoPage() {
  const { supabase } = await getProfile()
  const quotes = await fetchBoardQuotes(supabase)
  const todayISO = new Date().toISOString().slice(0, 10)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Produção</h1>
      <ProductionNav />
      {quotes.length === 0
        ? <p className="text-muted-foreground">Nenhum orçamento aprovado em produção.</p>
        : <Board quotes={quotes} todayISO={todayISO} />}
    </div>
  )
}
```

- [ ] **Step 4: Verificar**

Run: `npm run build && npm run lint && npm run test` → Expected: verde. Verificação funcional no browser fica com o controlador (aprovar um orçamento → aparece em Pendente; ‹›/drag movem; Concluir arquiva).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/producao/page.tsx" "src/app/(app)/producao/actions.ts" src/components/production/board.tsx
git commit -m "feat: quadro kanban de produção com botões e drag

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Checklist de pendências no card

**Files:**
- Modify: `src/app/(app)/producao/actions.ts` (3 actions novas)
- Modify: `src/lib/production/queries.ts` (`fetchPendencies`)
- Create: `src/components/production/pendency-panel.tsx`
- Modify: `src/components/production/board.tsx` (abrir painel no card)

**Interfaces:**
- Consumes: actions de pendência; `getProfile`
- Produces:
  - `addPendency(quoteId: string, label: string): Promise<void>`, `togglePendency(id: string, done: boolean): Promise<void>`, `deletePendency(id: string): Promise<void>`
  - `Pendency { id: string; label: string; done: boolean }`; `fetchPendencies(supabase, quoteId): Promise<Pendency[]>`
  - `PendencyPanel({ quoteId, pendencies }: { quoteId: string; pendencies: Pendency[] })`

- [ ] **Step 1: Actions de pendência**

Adicionar ao final de `src/app/(app)/producao/actions.ts`:

```ts
export async function addPendency(quoteId: string, label: string): Promise<void> {
  const { supabase } = await getProfile()
  const t = label.trim()
  if (!t) return
  const { error } = await supabase.from('quote_pendencies').insert({ quote_id: quoteId, label: t })
  if (error) throw new Error(error.message)
  revalidatePath('/producao')
}

export async function togglePendency(id: string, done: boolean): Promise<void> {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('quote_pendencies').update({ done }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/producao')
}

export async function deletePendency(id: string): Promise<void> {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('quote_pendencies').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/producao')
}
```

- [ ] **Step 2: `fetchPendencies`**

Adicionar a `src/lib/production/queries.ts`:

```ts
export interface Pendency {
  id: string
  label: string
  done: boolean
}

export async function fetchPendencies(supabase: SupabaseClient, quoteId: string): Promise<Pendency[]> {
  const { data, error } = await supabase
    .from('quote_pendencies')
    .select('id, label, done')
    .eq('quote_id', quoteId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as Pendency[]
}
```

- [ ] **Step 3: Painel de pendências (client)**

`src/components/production/pendency-panel.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addPendency, togglePendency, deletePendency } from '@/app/(app)/producao/actions'
import type { Pendency } from '@/lib/production/queries'

export function PendencyPanel({ quoteId, pendencies }: { quoteId: string; pendencies: Pendency[] }) {
  const router = useRouter()
  const [label, setLabel] = useState('')

  async function add() {
    if (!label.trim()) return
    await addPendency(quoteId, label)
    setLabel('')
    router.refresh()
  }

  return (
    <div className="mt-2 space-y-1 border-t pt-2">
      <ul className="space-y-1">
        {pendencies.map(p => (
          <li key={p.id} className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={p.done}
              onChange={async () => { await togglePendency(p.id, !p.done); router.refresh() }} />
            <span className={p.done ? 'line-through text-muted-foreground' : ''}>{p.label}</span>
            <button className="ml-auto text-red-600"
              onClick={async () => { await deletePendency(p.id); router.refresh() }}>×</button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1">
        <input value={label} onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          placeholder="Nova pendência…" className="flex-1 rounded border bg-background px-2 py-0.5 text-xs" />
        <button onClick={add} className="rounded border px-2 text-xs">+</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Abrir painel no card**

Em `src/components/production/board.tsx`: (a) o `fetchBoardQuotes` já traz `open_pendencies`, mas o painel precisa da lista completa. Para manter simples e server-first, a página carrega as pendências de todos os cards e passa ao Board. Modificar a assinatura do `Board` para receber `pendenciesByQuote: Record<string, Pendency[]>` e, em cada card, um toggle de expandir que renderiza `<PendencyPanel quoteId={q.id} pendencies={pendenciesByQuote[q.id] ?? []} />`.

Adicionar import: `import { PendencyPanel } from './pendency-panel'` e `import type { Pendency } from '@/lib/production/queries'`. Trocar a assinatura:

```tsx
export function Board({ quotes, todayISO, pendenciesByQuote }: {
  quotes: BoardQuote[]; todayISO: string; pendenciesByQuote: Record<string, Pendency[]>
}) {
```

Adicionar estado de expandido no componente (logo após `const [dragId, setDragId] = useState<string | null>(null)`):

```tsx
  const [openId, setOpenId] = useState<string | null>(null)
```

No card, após a `div` dos botões ‹ › (antes de fechar a div do card), adicionar:

```tsx
                    <button className="mt-1 text-xs underline text-muted-foreground"
                      onClick={() => setOpenId(openId === q.id ? null : q.id)}>
                      {openId === q.id ? 'ocultar pendências' : 'pendências'}
                    </button>
                    {openId === q.id && (
                      <PendencyPanel quoteId={q.id} pendencies={pendenciesByQuote[q.id] ?? []} />
                    )}
```

- [ ] **Step 5: Página passa as pendências**

Em `src/app/(app)/producao/page.tsx`, carregar as pendências de todos os cards e montar o mapa. Substituir o corpo por:

```tsx
import { getProfile } from '@/lib/auth'
import { fetchBoardQuotes, fetchPendencies, type Pendency } from '@/lib/production/queries'
import { ProductionNav } from './producao-nav'
import { Board } from '@/components/production/board'

export default async function ProducaoPage() {
  const { supabase } = await getProfile()
  const quotes = await fetchBoardQuotes(supabase)
  const todayISO = new Date().toISOString().slice(0, 10)
  const entries = await Promise.all(
    quotes.map(async q => [q.id, await fetchPendencies(supabase, q.id)] as const),
  )
  const pendenciesByQuote: Record<string, Pendency[]> = Object.fromEntries(entries)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Produção</h1>
      <ProductionNav />
      {quotes.length === 0
        ? <p className="text-muted-foreground">Nenhum orçamento aprovado em produção.</p>
        : <Board quotes={quotes} todayISO={todayISO} pendenciesByQuote={pendenciesByQuote} />}
    </div>
  )
}
```

- [ ] **Step 6: Verificar**

Run: `npm run build && npm run lint && npm run test` → Expected: verde. Browser (controlador): abrir "pendências" num card, adicionar item, marcar, ver o contador do card atualizar.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/producao" src/components/production src/lib/production/queries.ts
git commit -m "feat: checklist de pendências por orçamento no quadro

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Calendário (dia/semana/mês)

**Files:**
- Create: `src/app/(app)/producao/calendario/page.tsx`
- Create: `src/components/production/calendar-view.tsx`
- Modify: `src/lib/production/queries.ts` (`fetchCalendarQuotes`)

**Interfaces:**
- Consumes: `calendarDays`/`shiftPeriod`/`CalView` (Task 4), `urgencyFor` (Task 3), `STAGE_LABELS` (Task 2), `ProductionNav`
- Produces:
  - `CalendarQuote { id, customer_name, delivery_date: string, production_stage: Stage|null, archived: boolean }`
  - `fetchCalendarQuotes(supabase, startISO, endISO): Promise<CalendarQuote[]>` — aprovados com `delivery_date` no intervalo (inclui arquivados, marcados `archived`)
  - `CalendarView({ view, dateISO, days, quotesByDate, todayISO })`

- [ ] **Step 1: `fetchCalendarQuotes`**

Adicionar a `src/lib/production/queries.ts`:

```ts
export interface CalendarQuote {
  id: string
  customer_name: string
  delivery_date: string
  production_stage: Stage | null
  archived: boolean
}

export async function fetchCalendarQuotes(
  supabase: SupabaseClient, startISO: string, endISO: string,
): Promise<CalendarQuote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, customer_name, delivery_date, production_stage, archived_at')
    .eq('status', 'aprovado')
    .gte('delivery_date', startISO)
    .lte('delivery_date', endISO)
    .not('delivery_date', 'is', null)
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((q: any) => ({
    id: q.id,
    customer_name: q.customer_name,
    delivery_date: q.delivery_date,
    production_stage: q.production_stage,
    archived: q.archived_at != null,
  }))
}
```

- [ ] **Step 2: CalendarView (client)**

`src/components/production/calendar-view.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { shiftPeriod, type CalView } from '@/lib/production/calendar'
import { urgencyFor } from '@/lib/production/urgency'
import { STAGE_LABELS } from '@/lib/production/stages'
import type { CalendarQuote } from '@/lib/production/queries'

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function CalendarView({ view, dateISO, days, quotesByDate, todayISO }: {
  view: CalView
  dateISO: string
  days: string[]
  quotesByDate: Record<string, CalendarQuote[]>
  todayISO: string
}) {
  const router = useRouter()
  const go = (v: CalView, d: string) => router.push(`/producao/calendario?view=${v}&date=${d}`)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {(['dia', 'semana', 'mes'] as CalView[]).map(v => (
            <button key={v} onClick={() => go(v, dateISO)}
              className={`rounded border px-2 py-1 text-sm capitalize ${v === view ? 'bg-primary text-primary-foreground' : ''}`}>
              {v === 'mes' ? 'mês' : v}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button className="rounded border px-2 py-1" onClick={() => go(view, shiftPeriod(view, dateISO, -1))}>‹</button>
          <button className="rounded border px-2 py-1 text-sm" onClick={() => go(view, todayISO)}>Hoje</button>
          <button className="rounded border px-2 py-1" onClick={() => go(view, shiftPeriod(view, dateISO, 1))}>›</button>
        </div>
      </div>

      <div className={view === 'mes' || view === 'semana' ? 'grid grid-cols-7 gap-1' : 'space-y-2'}>
        {(view === 'mes' || view === 'semana') && DOW.map(d => (
          <div key={d} className="p-1 text-center text-xs font-semibold text-muted-foreground">{d}</div>
        ))}
        {days.map(day => {
          const list = quotesByDate[day] ?? []
          return (
            <div key={day} className={`min-h-16 rounded border p-1 ${day === todayISO ? 'ring-2 ring-primary' : ''}`}>
              <div className="text-xs text-muted-foreground">
                {Number(day.slice(8, 10))}
                {view === 'dia' && ` — ${new Date(day + 'T12:00:00').toLocaleDateString('pt-BR')}`}
              </div>
              <div className="space-y-0.5">
                {list.map(q => (
                  <Link key={q.id} href={`/orcamentos/${q.id}`}
                    className={`block truncate rounded px-1 text-xs ${q.archived ? 'opacity-40 line-through' : ''} ${
                      urgencyFor(q.delivery_date, todayISO) === 'atrasado' ? 'text-red-600'
                      : urgencyFor(q.delivery_date, todayISO) === 'urgente' ? 'text-amber-600' : ''}`}
                    title={`${q.customer_name} · ${q.production_stage ? STAGE_LABELS[q.production_stage] : ''}`}>
                    {q.customer_name}
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Página do calendário**

`src/app/(app)/producao/calendario/page.tsx`:

```tsx
import { getProfile } from '@/lib/auth'
import { calendarDays, type CalView } from '@/lib/production/calendar'
import { fetchCalendarQuotes, type CalendarQuote } from '@/lib/production/queries'
import { ProductionNav } from '../producao-nav'
import { CalendarView } from '@/components/production/calendar-view'

export default async function CalendarioPage({ searchParams }: {
  searchParams: Promise<{ view?: string; date?: string }>
}) {
  const { view: rawView, date: rawDate } = await searchParams
  const view: CalView = rawView === 'dia' || rawView === 'semana' ? rawView : 'mes'
  const todayISO = new Date().toISOString().slice(0, 10)
  const dateISO = /^\d{4}-\d{2}-\d{2}$/.test(rawDate ?? '') ? rawDate! : todayISO

  const days = calendarDays(view, dateISO)
  const { supabase } = await getProfile()
  const quotes = await fetchCalendarQuotes(supabase, days[0], days[days.length - 1])

  const quotesByDate: Record<string, CalendarQuote[]> = {}
  for (const q of quotes) (quotesByDate[q.delivery_date] ??= []).push(q)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Produção</h1>
      <ProductionNav />
      <CalendarView view={view} dateISO={dateISO} days={days}
        quotesByDate={quotesByDate} todayISO={todayISO} />
    </div>
  )
}
```

- [ ] **Step 4: Verificar**

Run: `npm run build && npm run lint && npm run test` → Expected: verde. Browser (controlador): alternar dia/semana/mês, navegar ‹ Hoje ›, ver orçamentos nas datas de entrega, concluídos esmaecidos.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/producao/calendario" src/components/production/calendar-view.tsx src/lib/production/queries.ts
git commit -m "feat: calendário de produção (dia/semana/mês)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Concluídos (histórico)

**Files:**
- Create: `src/app/(app)/producao/concluidos/page.tsx`
- Modify: `src/lib/production/queries.ts` (`fetchArchivedQuotes`)

**Interfaces:**
- Consumes: `resolvePeriod` de `@/lib/dashboard/period`; `ProductionNav`; `formatBRL`
- Produces: `ArchivedQuote { id, customer_name, delivery_date: string|null, total: number, archived_at: string }`; `fetchArchivedQuotes(supabase, period): Promise<ArchivedQuote[]>`

- [ ] **Step 1: `fetchArchivedQuotes`**

Adicionar a `src/lib/production/queries.ts`:

```ts
export interface ArchivedQuote {
  id: string
  customer_name: string
  delivery_date: string | null
  total: number
  archived_at: string
}

export async function fetchArchivedQuotes(
  supabase: SupabaseClient, period: { start: string | null; end: string | null },
): Promise<ArchivedQuote[]> {
  let query = supabase.from('quotes')
    .select('id, customer_name, delivery_date, total, archived_at')
    .not('archived_at', 'is', null)
    .order('delivery_date', { ascending: false, nullsFirst: false })
  if (period.start) query = query.gte('delivery_date', period.start.slice(0, 10))
  if (period.end) query = query.lte('delivery_date', period.end.slice(0, 10))
  const { data, error } = await query
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((q: any) => ({
    id: q.id, customer_name: q.customer_name, delivery_date: q.delivery_date,
    total: Number(q.total), archived_at: q.archived_at,
  }))
}
```

Nota: `resolvePeriod` retorna `start`/`end` como ISO datetime; aqui recortamos para `YYYY-MM-DD` (o `.slice(0,10)`) porque `delivery_date` é `date`.

- [ ] **Step 2: Página**

`src/app/(app)/producao/concluidos/page.tsx`:

```tsx
import Link from 'next/link'
import { getProfile } from '@/lib/auth'
import { resolvePeriod } from '@/lib/dashboard/period'
import { fetchArchivedQuotes } from '@/lib/production/queries'
import { formatBRL } from '@/lib/format'
import { ProductionNav } from '../producao-nav'

const RANGES = [
  { key: '', label: 'Tudo' },
  { key: 'mes', label: 'Este mês' },
  { key: '30d', label: '30 dias' },
  { key: 'ano', label: 'Este ano' },
]

export default async function ConcluidosPage({ searchParams }: {
  searchParams: Promise<{ range?: string }>
}) {
  const { range = '' } = await searchParams
  const period = resolvePeriod({ range })
  const { supabase } = await getProfile()
  const quotes = await fetchArchivedQuotes(supabase, period)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Produção</h1>
      <ProductionNav />
      <div className="flex gap-2 text-sm">
        {RANGES.map(r => (
          <Link key={r.key} href={`/producao/concluidos${r.key ? `?range=${r.key}` : ''}`}
            className={`rounded border px-2 py-1 ${range === r.key ? 'bg-primary text-primary-foreground' : ''}`}>
            {r.label}
          </Link>
        ))}
      </div>
      <ul className="space-y-2">
        {quotes.map(q => (
          <li key={q.id}>
            <Link href={`/orcamentos/${q.id}`} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">{q.customer_name}</p>
                <p className="text-sm text-muted-foreground">
                  Entrega: {q.delivery_date ? new Date(q.delivery_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                  {' · '}Concluído em {new Date(q.archived_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <span className="font-semibold">{formatBRL(q.total)}</span>
            </Link>
          </li>
        ))}
        {quotes.length === 0 && <p className="text-muted-foreground">Nenhum concluído no período.</p>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Verificar**

Run: `npm run build && npm run lint && npm run test` → Expected: verde. Browser (controlador): concluir um card no Quadro → aparece em Concluídos; filtro por período funciona.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/producao/concluidos" src/lib/production/queries.ts
git commit -m "feat: aba Concluídos (histórico) com filtro por período

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-review (feito na escrita)

- **Cobertura do spec:** §2 ciclo de vida → T1 (colunas) + T5 (aprovar→pendente) + T7 (archiveQuote); §3 seção/abas → T6 (nav+sub-nav) + T7/T9/T10 (páginas); §4 dados → T1; §5 quadro (cards, urgência, botões ‹›, drag, painel) → T7 + T8; §6 checklist → T8; §7 calendário → T9; §8 concluídos → T10; §9 testes puros (urgencyFor, STAGES/next/prev, calendarDays) → T2/T3/T4
- **Placeholders:** nenhum — todo step com código completo ou old→new exato
- **Consistência de tipos:** `Stage`/`STAGES`/`STAGE_LABELS`/`nextStage`/`prevStage`/`isValidStage` (T2) usados idênticos em T5/T7/T9; `urgencyFor`/`Urgency` (T3) em T7/T9; `calendarDays`/`shiftPeriod`/`CalView` (T4) em T9; `BoardQuote`/`Pendency`/`CalendarQuote`/`ArchivedQuote`/`fetch*` (T6/T8/T9/T10) casam entre queries e páginas; `setProductionStage(quoteId, stage)`/`archiveQuote(quoteId)`/`add|toggle|deletePendency` idênticos entre actions e componentes
- **Risco conhecido:** elegibilidade `status='aprovado' AND archived_at IS NULL` aplicada consistentemente nas queries (T6/T9) e nas actions (T7 `.eq('status','aprovado').is('archived_at',null)`); ícone `precision_manufacturing` é Material Symbol válido (mesmo set do shell)
