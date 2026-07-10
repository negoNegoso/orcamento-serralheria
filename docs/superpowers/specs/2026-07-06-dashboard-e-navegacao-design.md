# Design — Dashboard de Orçamentos + Novo Shell de Navegação

Data: 2026-07-06
Branch: `feature/dashboard-navegacao` (a partir de `build-v1`)

## Contexto

App Next.js 16 (App Router, RSC) + Supabase + Tailwind v4 + shadcn para orçamentos
de serralheria. Tabelas principais:

- `quotes`: `status` (`rascunho`/`enviado`/`aprovado`/`recusado`), `total`, `subtotal`,
  `discount`, `valid_until`, `created_by`, `created_at`, `customer_name`, `customer_phone`.
- `quote_items`: `product_name`, `product_type_id`, `qty`, `line_total`.
- `profiles`: `role` (`admin`/`vendedor`), `name`.

Objetivo: (1) uma página de **dashboard só-admin** para acompanhar orçamentos, valores e
status; (2) adotar um **novo shell de navegação** (sidebar + top bar + bottom nav mobile)
em todo o app, seguindo o design system "Precision & Clarity" e uma tela de referência
fornecida pelo usuário.

## Decisões (confirmadas com o usuário)

- Dashboard mostra **todos os 7 blocos** propostos.
- **Filtro de período** com presets (mês atual, últimos 30 dias, este ano, tudo) e
  seleção de **mês específico** (`?month=YYYY-MM`).
- Localização: nova aba **Dashboard** no menu, rota `/admin/dashboard`.
- Cálculos via **função RPC no Postgres** (abordagem A).
- **Navegação redesenhada no app inteiro** (sidebar/topbar/bottom nav + FAB).
- Cor primária **`#006688`** (teal escuro); cyan **`#00c2ff`** como realce/hover.
- Ícones **Material Symbols**; `JetBrains Mono` para labels em maiúsculas.

## Design System (já aplicado, base desta entrega)

Em `src/app/globals.css` os tokens do `DESIGN.md` foram mapeados às variáveis shadcn
(primary `#006688`, superfícies steel, `border/input` `#bcc8d1`, `ring` teal, error
`#ba1a1a`) e os tokens Material expostos como utilitários (`bg-surface-container`,
`text-on-surface-variant`, etc.). Raio: `--radius: 0.25rem` (botões/inputs 4px, cards 8px,
badges pill). Fonte `--font-sans` = Hanken Grotesk em `layout.tsx`.

Ajustes adicionais desta entrega:
- Adicionar `JetBrains Mono` via `next/font` (variável `--font-mono`/utilitário
  `font-label-caps`) e link do **Material Symbols Outlined** no root layout.
- Utilitário/uso de `text-label-caps` (12px, uppercase, `letter-spacing .05em`).

## Arquitetura de Navegação

### Fonte única dos itens
`src/lib/nav/items.ts` — array tipado de itens `{ label, href, icon, adminOnly }`.
Uma função `navFor(role)` filtra por papel. Consumida por sidebar, top bar e bottom nav
para não duplicar a lista.

Itens:
| Label | href | adminOnly | ícone (Material Symbols) |
|-------|------|-----------|--------------------------|
| Dashboard | `/admin/dashboard` | sim | `dashboard` |
| Orçamentos | `/` | não | `description` |
| Produtos | `/admin/produtos` | sim | `inventory_2` |
| Pagamento | `/admin/pagamento` | sim | `payments` |
| Empresa | `/admin/empresa` | sim | `apartment` |
| Usuários | `/admin/usuarios` | sim | `group` |

Ação em destaque (fora da lista): **Novo orçamento** → `/orcamentos/novo` (ícone `add`).

### Componentes
- `src/components/nav/app-shell.tsx` (server): monta layout com sidebar + top bar +
  main + bottom nav. Recebe `profile`.
- `src/components/nav/sidebar.tsx` (client): sidebar desktop (`hidden md:flex`, 260px,
  fixa). Logo, lista de itens (item ativo via `usePathname`), botão "Novo orçamento",
  "Sair" no rodapé.
- `src/components/nav/top-bar.tsx` (client): barra superior sticky com busca (form GET
  para `/?q=`), nome do usuário e avatar/inicial. `Sair` reaproveita `LogoutButton`.
- `src/components/nav/mobile-nav.tsx` (client): bottom nav (`md:hidden`) com principais
  itens + FAB "Novo orçamento".
- `src/components/nav/nav-link.tsx` (client): link com estado ativo (`usePathname`).

### Integração
- `src/app/(app)/layout.tsx` passa a renderizar `<AppShell profile={profile}>{children}</AppShell>`.
  A `<main>` fica com `md:ml-[260px]`, container `max-w-[1280px]`, padding responsivo.
- `src/app/(app)/admin/layout.tsx` deixa de renderizar a nav interna (os itens admin
  passam para a sidebar); mantém apenas o guard `if (profile.role !== 'admin') redirect('/')`.
- Ícones: componente wrapper `src/components/ui/icon.tsx` que renderiza
  `<span className="material-symbols-outlined">{name}</span>` para uso consistente.

## Dashboard

### Migration `supabase/migrations/0006_dashboard_metrics.sql`
Função `public.dashboard_metrics(p_start timestamptz, p_end timestamptz)`:
- `security definer`, `set search_path = public`.
- Verifica admin: `if (select role from profiles where id = auth.uid()) is distinct from 'admin' then raise exception 'not authorized'; end if;`
- `grant execute on function dashboard_metrics(timestamptz, timestamptz) to authenticated;`
- Período: quando `p_start`/`p_end` nulos, não limita (equivale a "tudo"). Caso
  contrário, filtra `quotes.created_at >= p_start and < p_end` nos blocos sensíveis a período.
- Retorna `jsonb` com:
  - `kpis`: `{ total_count, approved_value, open_value, avg_ticket, conversion_rate }`
    - `approved_value` = soma `total` onde status `aprovado`.
    - `open_value` = soma `total` onde status `enviado`.
    - `avg_ticket` = média de `total` (todos no período).
    - `conversion_rate` = `count(aprovado) / nullif(count(aprovado)+count(recusado),0)`.
  - `funnel`: por status → `{ status, count, value }` (ordem fixa rascunho→recusado).
  - `expiring` (**estado atual, ignora período**): `{ due_7_days, overdue }` — status
    `enviado` com `valid_until` entre hoje e hoje+7, e `valid_until < hoje`.
  - `monthly`: dentro do período, `{ month (date_trunc), value }` (soma `total`), ordenado.
  - `sellers`: `{ name, approved_value, count }` por `created_by`→`profiles.name`,
    ordenado por `approved_value desc`, limite 10.
  - `products`: `{ product_name, times, qty }` de `quote_items` (join período via `quote`),
    ordenado por `times desc`, limite 10.
  - `recent` (**ignora período**): últimos 8 `{ id, customer_name, total, status, created_at }`.

### Página `src/app/(app)/admin/dashboard/page.tsx` (server component)
- Lê `searchParams` `{ range?, month? }`.
- `lib/dashboard/period.ts` converte em `{ start, end }` (timestamptz ISO ou null):
  - `range=mes` → início/fim do mês atual; `range=30d` → hoje-30..amanhã;
  - `range=ano` → 1º jan..1º jan próximo; `range=tudo` (default) → `null,null`;
  - `month=YYYY-MM` → início/fim daquele mês (tem precedência sobre `range`).
- Chama `supabase.rpc('dashboard_metrics', { p_start, p_end })`.
- Renderiza:
  - Barra de filtro (chips pill de período + `<input type="month">`).
  - KPIs (4 cards).
  - Funil por status + card "A vencer / vencidos".
  - Evolução mensal (barras CSS a partir de `monthly`).
  - Ranking de vendedores.
  - Produtos mais orçados.
  - Últimos orçamentos (lista com link para `/orcamentos/[id]`, usando `StatusBadge`).
- Componentes de apoio em `src/components/dashboard/` (ex.: `kpi-card.tsx`,
  `bar-chart.tsx`, `stat-list.tsx`) — pequenos e sem estado.

### StatusBadge
Atualizar `src/components/quote/status-badge.tsx` para o padrão pill do design:
- `rascunho` âmbar, `enviado` azul/teal, `aprovado` verde, `recusado` vermelho.

## Testes
- `src/lib/dashboard/period.test.ts` (vitest): cobre `range`/`month` → intervalos
  esperados e o caso "tudo" (null/null). Precedência de `month` sobre `range`.
- Agregação SQL validada por `npm run build` e uso manual; sem teste de DB automatizado
  (fora do escopo do setup atual).

## Não-objetivos (YAGNI)
- Sem biblioteca de gráficos (barras em CSS).
- Sem exportação/PDF do dashboard.
- Sem novas páginas Clientes/Serviços/Relatórios (só remapeamos os itens existentes).
- Sem dark mode novo (app é light-only).

## Riscos / Notas
- `max-w-[1280px]` + sidebar muda a largura de todas as páginas; a lógica das páginas
  não é alterada, só o container. Verificar impressão (`.no-print`) — sidebar/top bar/
  bottom nav devem ter `no-print`.
- Material Symbols via `<link>` externo: aceitável (já há fontes Google via `next/font`).
