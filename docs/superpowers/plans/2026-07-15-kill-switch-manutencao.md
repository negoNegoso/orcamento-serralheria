# Kill Switch / Modo Manutenção — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o operador torne o site totalmente inacessível (qualquer URL) alternando uma única flag no banco (Supabase), exibindo uma página neutra de manutenção com HTTP 503.

**Architecture:** Uma tabela singleton `app_settings` no Supabase guarda `maintenance_mode`. O `proxy.ts` do Next.js 16 (roda em toda requisição, runtime Node) lê essa flag (com cache best-effort de ~30s e fail-open) e, se ativa, retorna uma `Response` HTML 503 autossuficiente para qualquer rota.

**Tech Stack:** Next.js 16 (proxy.ts), Supabase (REST + RLS), TypeScript, vitest.

**Referência:** `docs/superpowers/specs/2026-07-15-kill-switch-manutencao-design.md`

---

## Estrutura de arquivos

- Create: `supabase/migrations/0014_app_settings.sql` — tabela singleton + RLS + seed.
- Create: `src/lib/maintenance-response.ts` — gera a `Response` HTML 503.
- Create: `src/lib/maintenance-response.test.ts` — testes da response.
- Create: `src/lib/site-status.ts` — lê a flag no Supabase com cache + fail-open.
- Create: `src/lib/site-status.test.ts` — testes da leitura da flag.
- Create: `proxy.ts` (raiz do projeto) — intercepta requisições e bloqueia.

---

## Task 1: Migration `app_settings` no Supabase

**Files:**
- Create: `supabase/migrations/0014_app_settings.sql`

- [ ] **Step 1: Criar a migration**

```sql
-- Singleton com a flag global de manutenção (kill switch)
create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Leitura pública: o proxy lê a flag com a anon key. Não é segredo.
create policy app_settings_read on public.app_settings
  for select to anon, authenticated using (true);

-- Sem policy de escrita: só service role (Table Editor / SQL do dashboard) altera.
```

- [ ] **Step 2: Aplicar a migration no Supabase**

Aplique via o fluxo já usado no projeto (Supabase CLI `supabase db push`, ou colar o SQL no SQL Editor do dashboard). Confirme que a tabela existe:

Run (SQL Editor): `select * from public.app_settings;`
Expected: uma linha com `id=true, maintenance_mode=false`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0014_app_settings.sql
git commit -m "feat(db): tabela app_settings com flag de manutenção (kill switch)"
```

---

## Task 2: Página de manutenção (`maintenanceResponse`)

**Files:**
- Create: `src/lib/maintenance-response.ts`
- Test: `src/lib/maintenance-response.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { describe, expect, it } from 'vitest'
import { maintenanceResponse } from './maintenance-response'

describe('maintenanceResponse', () => {
  it('retorna 503 com HTML de manutenção', async () => {
    const res = maintenanceResponse()
    expect(res.status).toBe(503)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('retry-after')).toBeTruthy()
    const body = await res.text()
    expect(body).toContain('manutenção')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/maintenance-response.test.ts`
Expected: FAIL — `Failed to resolve import './maintenance-response'`.

- [ ] **Step 3: Implementar o mínimo**

```typescript
const HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Em manutenção</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
         background:#0f172a; color:#e2e8f0; text-align:center; padding:24px; }
  .card { max-width:420px; }
  h1 { font-size:1.5rem; margin:0 0 12px; }
  p { margin:0; color:#94a3b8; line-height:1.5; }
</style>
</head>
<body>
  <div class="card">
    <h1>Site em manutenção</h1>
    <p>Estamos realizando ajustes no momento. Voltamos em breve.</p>
  </div>
</body>
</html>`

export function maintenanceResponse(): Response {
  return new Response(HTML, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'retry-after': '3600',
      'cache-control': 'no-store',
    },
  })
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/maintenance-response.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/maintenance-response.ts src/lib/maintenance-response.test.ts
git commit -m "feat: página de manutenção 503 autossuficiente"
```

---

## Task 3: Leitura da flag (`isMaintenanceMode`) com cache e fail-open

**Files:**
- Create: `src/lib/site-status.ts`
- Test: `src/lib/site-status.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetMaintenanceCache, isMaintenanceMode } from './site-status'

function mockFetch(impl: typeof fetch) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  __resetMaintenanceCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('isMaintenanceMode', () => {
  it('retorna true quando a flag está ativa', async () => {
    mockFetch(async () =>
      new Response(JSON.stringify([{ maintenance_mode: true }]), { status: 200 }))
    expect(await isMaintenanceMode()).toBe(true)
  })

  it('retorna false quando a flag está inativa', async () => {
    mockFetch(async () =>
      new Response(JSON.stringify([{ maintenance_mode: false }]), { status: 200 }))
    expect(await isMaintenanceMode()).toBe(false)
  })

  it('fail-open: retorna false quando o fetch rejeita', async () => {
    mockFetch(async () => { throw new Error('network') })
    expect(await isMaintenanceMode()).toBe(false)
  })

  it('fail-open: retorna false em status != 2xx', async () => {
    mockFetch(async () => new Response('err', { status: 500 }))
    expect(await isMaintenanceMode()).toBe(false)
  })

  it('usa cache dentro do TTL (não refaz fetch)', async () => {
    const fn = vi.fn(async () =>
      new Response(JSON.stringify([{ maintenance_mode: true }]), { status: 200 }))
    vi.stubGlobal('fetch', fn)
    await isMaintenanceMode()
    await isMaintenanceMode()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/site-status.test.ts`
Expected: FAIL — `Failed to resolve import './site-status'`.

- [ ] **Step 3: Implementar o mínimo**

```typescript
const TTL_MS = 30_000

let cache: { value: boolean; expiresAt: number } | null = null

// Exposto apenas para testes.
export function __resetMaintenanceCache() {
  cache = null
}

export async function isMaintenanceMode(): Promise<boolean> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.value

  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/app_settings?select=maintenance_mode&limit=1`
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    if (!res.ok) return false // fail-open (não cacheia erro)

    const rows = (await res.json()) as Array<{ maintenance_mode: boolean }>
    const value = rows[0]?.maintenance_mode === true
    cache = { value, expiresAt: now + TTL_MS }
    return value
  } catch {
    return false // fail-open
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/site-status.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/site-status.ts src/lib/site-status.test.ts
git commit -m "feat: leitura da flag de manutenção com cache best-effort e fail-open"
```

---

## Task 4: `proxy.ts` — bloqueio de todas as rotas

**Files:**
- Create: `proxy.ts` (raiz do projeto)

- [ ] **Step 1: Implementar o proxy**

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isMaintenanceMode } from '@/lib/site-status'
import { maintenanceResponse } from '@/lib/maintenance-response'

export async function proxy(_request: NextRequest) {
  if (await isMaintenanceMode()) return maintenanceResponse()
  return NextResponse.next()
}

export const config = {
  // Roda em tudo, exceto assets internos hasheados e o favicon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 2: Verificar tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Validação manual — bloqueio**

No Supabase: `update app_settings set maintenance_mode = true;`
Run: `npm run dev` e acesse `http://localhost:3000/`, `/login`, `/o/qualquer-token`.
Expected: todas retornam a página "Site em manutenção" com HTTP 503 (confira no DevTools → Network o status 503).

- [ ] **Step 4: Validação manual — liberação**

No Supabase: `update app_settings set maintenance_mode = false;`
Aguarde ~30s (TTL do cache) ou reinicie o `npm run dev`.
Expected: rotas voltam ao normal (login, home, etc.).

- [ ] **Step 5: Commit**

```bash
git add proxy.ts
git commit -m "feat: proxy que bloqueia todas as rotas no modo manutenção"
```

---

## Task 5: Suíte completa de testes

**Files:** nenhum (verificação).

- [ ] **Step 1: Rodar toda a suíte**

Run: `npm run test`
Expected: todos os testes passam (incluindo os novos de `site-status` e `maintenance-response`).

- [ ] **Step 2: Commit (se necessário)**

Sem alterações se tudo passar. Caso haja ajustes, commitar com mensagem descritiva.

---

## Validação final (contra o spec)

- [x] Flag única global no banco (`app_settings.maintenance_mode`) — Task 1.
- [x] Toggle via Supabase, sem escrita pela app (RLS sem policy de write) — Task 1.
- [x] Bloqueia qualquer URL (proxy roda em todas as rotas) — Task 4.
- [x] Página neutra de manutenção, HTTP 503 — Task 2.
- [x] Sem porta dos fundos — não implementada (proxy bloqueia todos).
- [x] Fail-open em erro de leitura — Task 3.
- [x] Propagação ~30s via cache best-effort — Task 3.
- [x] Testes: site-status (flag/cache/fail-open) e maintenance-response (503/html) — Tasks 2 e 3.
