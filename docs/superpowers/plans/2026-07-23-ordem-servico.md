# Ordem de Serviço — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar uma Ordem de Serviço automaticamente quando um orçamento é aprovado, clonando a composição de preços como custo planejado congelado, e permitir lançar o custo real (interno e de terceiros) até o encerramento.

**Architecture:** Duas tabelas novas (`work_orders`, `work_order_costs`) e duas views de rollup. A OS absorve `production_stage`/`archived_at` de `quotes`, virando dona do ciclo pós-aprovação. Toda escrita alcançável por vendedor passa por RPC `security definer`; admin escreve direto por policy. Regras de cálculo existem em TypeScript (testadas) e são repetidas em SQL dentro das funções.

**Tech Stack:** Next.js 16 (App Router, Server Components e Server Actions), React 19, Supabase (Postgres + RLS), TypeScript, vitest, Tailwind 4, componentes locais em `src/components/ui` (base-ui).

**Spec:** `docs/superpowers/specs/2026-07-23-ordem-servico-design.md`

## Global Constraints

- Textos de UI em **português do Brasil**. Valores monetários sempre via `formatBRL` de `src/lib/format.ts`.
- Migrations são arquivos em `supabase/migrations/`, numerados em sequência. Não há CLI do Supabase configurada no repositório: cada migration é aplicada no banco pelo SQL Editor do painel do Supabase (ou pela ferramenta `apply_migration` do MCP do Supabase) **e** commitada no repositório.
- Isolamento multi-tenant é obrigatório: toda tabela nova tem `company_id`, RLS habilitada e policies filtrando por `current_company_id()`. Escrita de admin usa também `is_company_admin()`. Ambas as funções já existem (migration `0017_multi_tenant_rls.sql`).
- Funções SQL novas: sempre `set search_path = public`, sempre `revoke execute ... from public, anon` seguido de `grant execute ... to authenticated`. Padrão de referência: `public.save_receipt` em `supabase/migrations/0027_receipts.sql`.
- Arredondamento monetário: `round2` de `src/lib/pricing/calc.ts` no TypeScript, `round(x, 2)` no SQL. Nunca `toFixed`.
- Testes: vitest, arquivo `*.test.ts` ao lado do código, apenas lógica pura (`vitest.config.ts` usa `environment: 'node'` e `include: ['src/**/*.test.ts']`). Não há infraestrutura de teste de banco nem de componente — o que depende de Postgres ou de React é verificado manualmente, com roteiro escrito na própria tarefa.
- Custo é dado de admin: `work_order_costs` nunca é lido nem escrito por `vendedor`, em nenhuma tela e em nenhuma policy.
- Rodar `npm test` e `npm run lint` antes de cada commit.

---

### Task 1: Types e cálculo de variação

**Files:**
- Create: `src/lib/work-order/types.ts`
- Create: `src/lib/work-order/variance.ts`
- Test: `src/lib/work-order/variance.test.ts`

**Interfaces:**
- Consumes: `round2` de `@/lib/pricing/calc`; `PriceCategory` de `@/lib/config-types`; `Stage` de `@/lib/production/stages`.
- Produces: types `WorkOrderStatus`, `CostSource`, `WorkOrder`, `WorkOrderCost`, `WorkOrderTotals`, `CategoryTotals`; funções `variance(planned, actual): number`, `variancePercent(planned, actual): number | null`, `margin(quoteTotal, actualTotal): number`, `rollupByCategory(costs, categories): CategoryTotals[]`.

- [ ] **Step 1: Criar os types**

`src/lib/work-order/types.ts`:

```ts
import type { Stage } from '@/lib/production/stages'

export type WorkOrderStatus = 'planejada' | 'em_andamento' | 'concluida' | 'cancelada'
export type CostSource = 'orcamento' | 'manual' | 'terceiro'

export interface WorkOrder {
  id: string
  quote_id: string
  number: number
  status: WorkOrderStatus
  production_stage: Stage | null
  archived_at: string | null
  quote_total: number
  quote_snapshot_at: string
  closed_at: string | null
}

export interface WorkOrderCost {
  id: string
  work_order_id: string
  source: CostSource
  description: string
  item_label: string
  quote_item_id: string | null
  price_category_id: string | null
  qty: number
  unit_value: number
  /** coluna gerada no banco: round(qty * unit_value, 2) */
  actual_value: number
  planned_value: number
  supplier: string
  note: string
  sort_order: number
}

export interface WorkOrderTotals {
  quote_total: number
  planned_total: number
  actual_total: number
  variance: number
  margin: number
}

export interface CategoryTotals {
  price_category_id: string | null
  name: string
  planned_total: number
  actual_total: number
  variance: number
}
```

- [ ] **Step 2: Escrever o teste que falha**

`src/lib/work-order/variance.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { margin, rollupByCategory, variance, variancePercent } from './variance'
import type { PriceCategory } from '@/lib/config-types'

const CATS: PriceCategory[] = [
  { id: 'c1', slug: 'custo', name: 'Custo', sort_order: 0 },
  { id: 'c2', slug: 'insumo', name: 'Insumo', sort_order: 1 },
]

function cost(price_category_id: string | null, planned_value: number, actual_value: number) {
  return { price_category_id, planned_value, actual_value }
}

describe('variance', () => {
  it('estouro é positivo, economia é negativa', () => {
    expect(variance(100, 130)).toBe(30)
    expect(variance(100, 80)).toBe(-20)
  })
  it('arredonda em 2 casas', () => {
    expect(variance(35.035, 35.045)).toBe(0.01)
  })
})

describe('variancePercent', () => {
  it('percentual sobre o planejado', () => {
    expect(variancePercent(200, 230)).toBe(15)
  })
  it('planejado zero não tem base de comparação', () => {
    expect(variancePercent(0, 500)).toBeNull()
  })
})

describe('margin', () => {
  it('total do orçamento menos custo real', () => {
    expect(margin(10000, 6400)).toBe(3600)
  })
  it('custo acima do total dá margem negativa', () => {
    expect(margin(1000, 1200)).toBe(-200)
  })
})

describe('rollupByCategory', () => {
  it('soma por categoria, na ordem do catálogo, mesmo sem lançamentos', () => {
    const rows = rollupByCategory([cost('c2', 10, 12)], CATS)
    expect(rows.map(r => r.name)).toEqual(['Custo', 'Insumo'])
    expect(rows[0]).toMatchObject({ planned_total: 0, actual_total: 0, variance: 0 })
    expect(rows[1]).toMatchObject({ planned_total: 10, actual_total: 12, variance: 2 })
  })
  it('linha sem categoria vira "Sem categoria", sempre por último', () => {
    const rows = rollupByCategory([cost(null, 5, 9), cost('c1', 1, 1)], CATS)
    expect(rows[rows.length - 1]).toMatchObject({
      price_category_id: null, name: 'Sem categoria', planned_total: 5, actual_total: 9, variance: 4,
    })
  })
  it('sem linha descategorizada, não cria a linha "Sem categoria"', () => {
    const rows = rollupByCategory([cost('c1', 1, 1)], CATS)
    expect(rows).toHaveLength(2)
  })
  it('categoria que sumiu do catálogo cai em "Sem categoria"', () => {
    const rows = rollupByCategory([cost('apagada', 7, 7)], CATS)
    expect(rows[rows.length - 1]).toMatchObject({ price_category_id: null, actual_total: 7 })
  })
})
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npm test -- src/lib/work-order/variance.test.ts`
Expected: FAIL — `Failed to resolve import "./variance"`

- [ ] **Step 4: Implementar**

`src/lib/work-order/variance.ts`:

```ts
import { round2 } from '@/lib/pricing/calc'
import type { PriceCategory } from '@/lib/config-types'
import type { CategoryTotals } from './types'

/** Positivo = estourou o planejado. Negativo = gastou menos. */
export function variance(planned: number, actual: number): number {
  return round2(actual - planned)
}

/** null quando o planejado é zero: custo não previsto não tem base de comparação. */
export function variancePercent(planned: number, actual: number): number | null {
  if (planned === 0) return null
  return round2(((actual - planned) / planned) * 100)
}

export function margin(quoteTotal: number, actualTotal: number): number {
  return round2(quoteTotal - actualTotal)
}

type CostSlice = { price_category_id: string | null; planned_value: number; actual_value: number }

function emptyRow(id: string | null, name: string): CategoryTotals {
  return { price_category_id: id, name, planned_total: 0, actual_total: 0, variance: 0 }
}

/**
 * Uma linha por categoria do catálogo (mesmo zerada, para a tabela não mudar de
 * forma), mais "Sem categoria" ao final quando existe custo descategorizado.
 * Categoria que sumiu do catálogo cai em "Sem categoria" em vez de desaparecer.
 */
export function rollupByCategory(
  costs: CostSlice[],
  categories: PriceCategory[],
): CategoryTotals[] {
  const rows = new Map<string, CategoryTotals>()
  for (const c of [...categories].sort((a, b) => a.sort_order - b.sort_order)) {
    rows.set(c.id, emptyRow(c.id, c.name))
  }
  let uncategorized: CategoryTotals | null = null

  for (const cost of costs) {
    let row = cost.price_category_id ? rows.get(cost.price_category_id) : undefined
    if (!row) {
      uncategorized ??= emptyRow(null, 'Sem categoria')
      row = uncategorized
    }
    row.planned_total = round2(row.planned_total + cost.planned_value)
    row.actual_total = round2(row.actual_total + cost.actual_value)
  }

  const out = [...rows.values()]
  if (uncategorized) out.push(uncategorized)
  for (const r of out) r.variance = variance(r.planned_total, r.actual_total)
  return out
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npm test -- src/lib/work-order/variance.test.ts`
Expected: PASS — 8 testes

- [ ] **Step 6: Commit**

```bash
git add src/lib/work-order/types.ts src/lib/work-order/variance.ts src/lib/work-order/variance.test.ts
git commit -m "feat: types da ordem de serviço e cálculo de variação"
```

---

### Task 2: Máquina de estados da OS

**Files:**
- Create: `src/lib/work-order/status.ts`
- Test: `src/lib/work-order/status.test.ts`

**Interfaces:**
- Consumes: `WorkOrderStatus` de `./types`; `Stage` de `@/lib/production/stages`.
- Produces: `WO_STATUS_LABELS: Record<WorkOrderStatus, string>`, `nextStatusForStage(status, stage): WorkOrderStatus`, `canEditCosts(status): boolean`, `canClose(status): boolean`, `canReopen(status): boolean`.

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/work-order/status.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canClose, canEditCosts, canReopen, nextStatusForStage, WO_STATUS_LABELS } from './status'

describe('nextStatusForStage', () => {
  it('planejada vira em_andamento quando a produção começa', () => {
    expect(nextStatusForStage('planejada', 'em_producao')).toBe('em_andamento')
    expect(nextStatusForStage('planejada', 'pronto')).toBe('em_andamento')
    expect(nextStatusForStage('planejada', 'instalado')).toBe('em_andamento')
  })
  it('planejada continua planejada nas etapas anteriores à produção', () => {
    expect(nextStatusForStage('planejada', 'pendente')).toBe('planejada')
    expect(nextStatusForStage('planejada', 'a_produzir')).toBe('planejada')
  })
  it('nunca rebaixa nem ressuscita status já avançado', () => {
    expect(nextStatusForStage('em_andamento', 'pendente')).toBe('em_andamento')
    expect(nextStatusForStage('concluida', 'em_producao')).toBe('concluida')
    expect(nextStatusForStage('cancelada', 'em_producao')).toBe('cancelada')
  })
})

describe('canEditCosts', () => {
  it('libera enquanto a OS está aberta', () => {
    expect(canEditCosts('planejada')).toBe(true)
    expect(canEditCosts('em_andamento')).toBe(true)
  })
  it('bloqueia depois de encerrada ou cancelada', () => {
    expect(canEditCosts('concluida')).toBe(false)
    expect(canEditCosts('cancelada')).toBe(false)
  })
})

describe('canClose / canReopen', () => {
  it('conclui só o que está aberto', () => {
    expect(canClose('em_andamento')).toBe(true)
    expect(canClose('planejada')).toBe(true)
    expect(canClose('concluida')).toBe(false)
    expect(canClose('cancelada')).toBe(false)
  })
  it('reabre só o que está concluído', () => {
    expect(canReopen('concluida')).toBe(true)
    expect(canReopen('em_andamento')).toBe(false)
    expect(canReopen('cancelada')).toBe(false)
  })
})

describe('WO_STATUS_LABELS', () => {
  it('rotula os quatro status', () => {
    expect(WO_STATUS_LABELS.planejada).toBe('Planejada')
    expect(WO_STATUS_LABELS.em_andamento).toBe('Em andamento')
    expect(WO_STATUS_LABELS.concluida).toBe('Concluída')
    expect(WO_STATUS_LABELS.cancelada).toBe('Cancelada')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/lib/work-order/status.test.ts`
Expected: FAIL — `Failed to resolve import "./status"`

- [ ] **Step 3: Implementar**

`src/lib/work-order/status.ts`:

```ts
import type { Stage } from '@/lib/production/stages'
import type { WorkOrderStatus } from './types'

export const WO_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  planejada: 'Planejada',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

/** Etapas que ainda não consomem mão de obra nem máquina. */
const PRE_WIP: Stage[] = ['pendente', 'a_produzir']

/**
 * Promoção automática: começou a produzir, a OS acumula custo (WIP). Só sobe a
 * partir de 'planejada' — concluir e cancelar são atos explícitos e não voltam
 * por movimento de card. Repetido em SQL dentro de set_production_stage.
 */
export function nextStatusForStage(status: WorkOrderStatus, stage: Stage): WorkOrderStatus {
  if (status === 'planejada' && !PRE_WIP.includes(stage)) return 'em_andamento'
  return status
}

export function canEditCosts(status: WorkOrderStatus): boolean {
  return status === 'planejada' || status === 'em_andamento'
}

export function canClose(status: WorkOrderStatus): boolean {
  return canEditCosts(status)
}

export function canReopen(status: WorkOrderStatus): boolean {
  return status === 'concluida'
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/lib/work-order/status.test.ts`
Expected: PASS — 8 testes

- [ ] **Step 5: Commit**

```bash
git add src/lib/work-order/status.ts src/lib/work-order/status.test.ts
git commit -m "feat: máquina de estados da ordem de serviço"
```

---

### Task 3: Decomposição do orçamento em linhas planejadas

**Files:**
- Create: `src/lib/work-order/decompose.ts`
- Test: `src/lib/work-order/decompose.test.ts`

**Interfaces:**
- Consumes: `round2` de `@/lib/pricing/calc`; `SelectedOption` de `@/lib/pricing/types`.
- Produces: `PlannedLine` (campos `description`, `itemLabel`, `quoteItemId`, `priceCategoryId`, `plannedValue`, `sortOrder`), `DecomposeInput`, `itemLabel(input): string`, `decomposeItem(input, multiplier, startSort?): PlannedLine[]`.

Esta é a regra de maior risco do projeto: arredondamento, opção `por_m2`, `multiplier` e o resíduo do modelo. A invariante `Σ linhas = line_total × multiplier` é o que garante que a OS não invente nem perca dinheiro em relação ao orçamento.

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/work-order/decompose.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { decomposeItem, itemLabel, type DecomposeInput } from './decompose'
import { round2 } from '@/lib/pricing/calc'

function input(over: Partial<DecomposeInput> = {}): DecomposeInput {
  return {
    quoteItemId: 'qi1',
    productName: 'Portão',
    widthM: 3, heightM: 2, areaM2: 6,
    qty: 1,
    unitBasePrice: 1200,
    lineTotal: 1200,
    extraValue: 0,
    modelName: null,
    selectedOptions: [],
    productCategoryId: 'cat-custo',
    optionCategoryIds: {},
    ...over,
  }
}

describe('itemLabel', () => {
  it('nome com as medidas quando existem', () => {
    expect(itemLabel({ productName: 'Portão', widthM: 3, heightM: 2.5 })).toBe('Portão 3,00×2,50')
  })
  it('só o nome quando não há medidas', () => {
    expect(itemLabel({ productName: 'Corrimão', widthM: null, heightM: null })).toBe('Corrimão')
  })
})

describe('decomposeItem', () => {
  it('item só com preço base gera uma linha com a categoria do produto', () => {
    const lines = decomposeItem(input(), 1)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      description: 'Preço base', itemLabel: 'Portão 3,00×2,00',
      quoteItemId: 'qi1', priceCategoryId: 'cat-custo', plannedValue: 1200, sortOrder: 0,
    })
  })

  it('opção fixa entra pelo valor cheio; opção por_m2 multiplica pela área', () => {
    const lines = decomposeItem(input({
      lineTotal: 1200 + 150 + 40 * 6,
      selectedOptions: [
        { optionId: 'o1', group: 'Ferragens', label: 'Fechadura', surchargeType: 'fixo', surchargeValue: 150 },
        { optionId: 'o2', group: 'Acabamento', label: 'Pintura', surchargeType: 'por_m2', surchargeValue: 40 },
      ],
      optionCategoryIds: { o1: 'cat-insumo', o2: 'cat-repasse' },
    }), 1)
    expect(lines.map(l => [l.description, l.priceCategoryId, l.plannedValue])).toEqual([
      ['Preço base', 'cat-custo', 1200],
      ['Ferragens — Fechadura', 'cat-insumo', 150],
      ['Acabamento — Pintura', 'cat-repasse', 240],
    ])
  })

  it('opção sem optionId no snapshot fica sem categoria', () => {
    const lines = decomposeItem(input({
      lineTotal: 1300,
      selectedOptions: [
        { group: 'Extra', label: 'Solda', surchargeType: 'fixo', surchargeValue: 100 },
      ],
    }), 1)
    expect(lines[1]).toMatchObject({ description: 'Extra — Solda', priceCategoryId: null, plannedValue: 100 })
  })

  it('opção de valor zero continua gerando linha (carrega a natureza do escopo)', () => {
    const lines = decomposeItem(input({
      selectedOptions: [
        { optionId: 'o1', group: 'Cor', label: 'Branco', surchargeType: 'fixo', surchargeValue: 0 },
      ],
      optionCategoryIds: { o1: 'cat-insumo' },
    }), 1)
    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatchObject({ plannedValue: 0, priceCategoryId: 'cat-insumo' })
  })

  it('qty multiplica base e opções', () => {
    const lines = decomposeItem(input({
      qty: 3,
      lineTotal: (1200 + 150) * 3,
      selectedOptions: [
        { optionId: 'o1', group: 'Ferragens', label: 'Fechadura', surchargeType: 'fixo', surchargeValue: 150 },
      ],
      optionCategoryIds: { o1: 'cat-insumo' },
    }), 1)
    expect(lines.map(l => l.plannedValue)).toEqual([3600, 450])
  })

  it('multiplier do orçamento multiplica tudo', () => {
    const lines = decomposeItem(input({ lineTotal: 1200 }), 3)
    expect(lines[0].plannedValue).toBe(3600)
  })

  it('extra_value vira linha própria sem categoria; zero não gera linha', () => {
    const comExtra = decomposeItem(input({ extraValue: -80, lineTotal: 1120 }), 1)
    expect(comExtra[1]).toMatchObject({ description: 'Ajuste do item', priceCategoryId: null, plannedValue: -80 })
    expect(decomposeItem(input(), 1)).toHaveLength(1)
  })

  it('sobra do modelo vira linha de resíduo nomeada', () => {
    const lines = decomposeItem(input({ modelName: 'Colonial', lineTotal: 1500 }), 1)
    expect(lines[1]).toMatchObject({
      description: 'Modelo Colonial', priceCategoryId: null, plannedValue: 300,
    })
  })

  it('sobra sem modelo é rotulada como arredondamento', () => {
    const lines = decomposeItem(input({ lineTotal: 1200.01 }), 1)
    expect(lines[1]).toMatchObject({ description: 'Ajuste de arredondamento', plannedValue: 0.01 })
  })

  it('invariante: a soma das linhas é sempre line_total × multiplier', () => {
    const casos: [Partial<DecomposeInput>, number][] = [
      [{ lineTotal: 1200 }, 1],
      [{ lineTotal: 1500, modelName: 'Colonial' }, 3],
      [{ qty: 7, unitBasePrice: 35.035, lineTotal: 245.25, extraValue: -0.01 }, 2],
      [{
        lineTotal: 1590, areaM2: 6, modelName: 'Colonial', extraValue: 50,
        selectedOptions: [
          { optionId: 'o1', group: 'A', label: 'x', surchargeType: 'por_m2', surchargeValue: 13.33 },
        ],
      }, 5],
    ]
    for (const [over, m] of casos) {
      const lines = decomposeItem(input(over), m)
      const soma = round2(lines.reduce((a, l) => a + l.plannedValue, 0))
      expect(soma).toBe(round2(input(over).lineTotal * m))
    }
  })

  it('sortOrder é contínuo e respeita o startSort', () => {
    const lines = decomposeItem(input({ extraValue: 10, lineTotal: 1210 }), 1, 5)
    expect(lines.map(l => l.sortOrder)).toEqual([5, 6])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/lib/work-order/decompose.test.ts`
Expected: FAIL — `Failed to resolve import "./decompose"`

- [ ] **Step 3: Implementar**

`src/lib/work-order/decompose.ts`:

```ts
import { round2 } from '@/lib/pricing/calc'
import type { SelectedOption } from '@/lib/pricing/types'

export interface PlannedLine {
  description: string
  itemLabel: string
  quoteItemId: string | null
  priceCategoryId: string | null
  plannedValue: number
  sortOrder: number
}

export interface DecomposeInput {
  quoteItemId: string | null
  productName: string
  widthM: number | null
  heightM: number | null
  areaM2: number | null
  qty: number
  /** quote_items.unit_base_price — só a base, sem modelo e sem opções */
  unitBasePrice: number
  /** quote_items.line_total — já inclui modelo, opções, qty e extra_value */
  lineTotal: number
  extraValue: number
  modelName: string | null
  selectedOptions: SelectedOption[]
  productCategoryId: string | null
  /** categoria efetiva (opção ?? grupo) já resolvida, indexada por optionId */
  optionCategoryIds: Record<string, string | null>
}

const dim = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function itemLabel(
  input: Pick<DecomposeInput, 'productName' | 'widthM' | 'heightM'>,
): string {
  if (input.widthM == null || input.heightM == null) return input.productName
  return `${input.productName} ${dim.format(input.widthM)}×${dim.format(input.heightM)}`
}

/**
 * Quebra um item do orçamento nas linhas de custo planejado da OS.
 *
 * O surcharge do modelo não é gravado em quote_items (só model_id/model_name),
 * então entra como resíduo: line_total × multiplier menos o que já foi
 * distribuído. Além de dispensar join no catálogo (mutável), o resíduo absorve
 * qualquer sobra de arredondamento — a soma das linhas fecha com o item por
 * construção.
 *
 * Repetido em SQL dentro de work_order_clone_costs.
 */
export function decomposeItem(
  input: DecomposeInput,
  multiplier: number,
  startSort = 0,
): PlannedLine[] {
  const label = itemLabel(input)
  const lines: PlannedLine[] = []
  let sort = startSort

  function push(description: string, priceCategoryId: string | null, plannedValue: number): void {
    lines.push({
      description, itemLabel: label, quoteItemId: input.quoteItemId,
      priceCategoryId, plannedValue, sortOrder: sort++,
    })
  }

  push('Preço base', input.productCategoryId, round2(input.unitBasePrice * input.qty * multiplier))

  for (const opt of input.selectedOptions) {
    const unit = opt.surchargeType === 'por_m2'
      ? opt.surchargeValue * (input.areaM2 ?? 0)
      : opt.surchargeValue
    const category = opt.optionId ? (input.optionCategoryIds[opt.optionId] ?? null) : null
    push(`${opt.group} — ${opt.label}`, category, round2(unit * input.qty * multiplier))
  }

  if (input.extraValue !== 0) {
    push('Ajuste do item', null, round2(input.extraValue * multiplier))
  }

  const total = round2(input.lineTotal * multiplier)
  const distributed = round2(lines.reduce((acc, l) => acc + l.plannedValue, 0))
  const residual = round2(total - distributed)
  if (residual !== 0) {
    push(input.modelName ? `Modelo ${input.modelName}` : 'Ajuste de arredondamento', null, residual)
  }

  return lines
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/lib/work-order/decompose.test.ts`
Expected: PASS — 11 testes

- [ ] **Step 5: Rodar a suíte inteira e o lint**

Run: `npm test && npm run lint`
Expected: PASS, sem warnings

- [ ] **Step 6: Commit**

```bash
git add src/lib/work-order/decompose.ts src/lib/work-order/decompose.test.ts
git commit -m "feat: decomposição do orçamento em linhas de custo planejado"
```

---

### Task 4: Schema da OS (migration 0031)

**Files:**
- Create: `supabase/migrations/0031_work_orders.sql`

**Interfaces:**
- Consumes: `public.current_company_id()` e `public.is_company_admin()` (migration 0017).
- Produces: tabelas `work_orders` e `work_order_costs`, views `work_order_totals` e `work_order_category_totals`, trigger `woc_closed_guard`.

Esta migration **não** mexe em `quotes` — as colunas `production_stage`/`archived_at` continuam onde estão até a Task 9. O sistema segue funcionando normalmente depois de aplicá-la.

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/0031_work_orders.sql`:

```sql
-- Ordem de Serviço: registro do ciclo pós-aprovação, com custo planejado
-- (clone congelado do orçamento) e custo real lançado durante a produção.
-- Não altera quotes: production_stage/archived_at migram na 0033/0034.

create table work_orders (
  id                uuid primary key default gen_random_uuid(),
  quote_id          uuid not null unique references quotes(id) on delete cascade,
  company_id        uuid not null references companies(id),
  number            int  not null,
  status            text not null default 'planejada'
                      check (status in ('planejada','em_andamento','concluida','cancelada')),
  production_stage  text check (production_stage in
                      ('pendente','a_produzir','em_producao','pronto','instalado')),
  archived_at       timestamptz,
  -- congelados na criação: o planejado é a foto do momento da aprovação
  quote_total       numeric(12,2) not null,
  quote_snapshot_at timestamptz not null,
  closed_at         timestamptz,
  closed_by         uuid references profiles(id) on delete set null,
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (company_id, number)
);
create index work_orders_company_idx on work_orders(company_id);
create index work_orders_stage_idx on work_orders(production_stage) where archived_at is null;

create table work_order_costs (
  id                uuid primary key default gen_random_uuid(),
  work_order_id     uuid not null references work_orders(id) on delete cascade,
  company_id        uuid not null references companies(id),
  source            text not null check (source in ('orcamento','manual','terceiro')),
  description       text not null,
  -- rótulo do item de origem, congelado: agrupa a UI mesmo se o item sumir
  item_label        text not null default '',
  quote_item_id     uuid references quote_items(id) on delete set null,
  price_category_id uuid references price_categories(id),
  qty               numeric(10,2) not null default 1 check (qty >= 0),
  unit_value        numeric(12,2) not null default 0,
  -- gerada: um caminho único de edição (qty, unit_value), sem chance de divergir
  actual_value      numeric(12,2) not null
                      generated always as (round(qty * unit_value, 2)) stored,
  planned_value     numeric(12,2) not null default 0,
  supplier          text not null default '',
  note              text not null default '',
  sort_order        int not null default 0,
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index work_order_costs_wo_idx on work_order_costs(work_order_id);
create index work_order_costs_company_idx on work_order_costs(company_id);
create index work_order_costs_category_idx on work_order_costs(price_category_id);

-- security_invoker: herdam as policies do usuário. Vendedor não vê custo nenhum,
-- então as views devolvem zero pra ele — mesmo padrão de quote_financials (0027).
create view work_order_totals with (security_invoker = on) as
  select
    wo.id         as work_order_id,
    wo.company_id,
    wo.quote_total,
    coalesce(sum(c.planned_value), 0) as planned_total,
    coalesce(sum(c.actual_value), 0)  as actual_total,
    coalesce(sum(c.actual_value), 0) - coalesce(sum(c.planned_value), 0) as variance,
    wo.quote_total - coalesce(sum(c.actual_value), 0) as margin
  from work_orders wo
  left join work_order_costs c on c.work_order_id = wo.id
  group by wo.id;

create view work_order_category_totals with (security_invoker = on) as
  select
    c.work_order_id,
    c.company_id,
    c.price_category_id,
    sum(c.planned_value) as planned_total,
    sum(c.actual_value)  as actual_total,
    sum(c.actual_value) - sum(c.planned_value) as variance
  from work_order_costs c
  group by c.work_order_id, c.company_id, c.price_category_id;

alter table work_orders enable row level security;

-- Leitura para qualquer membro da empresa: o board de produção precisa da etapa.
create policy wo_read on work_orders for select to authenticated
  using (company_id = current_company_id());

-- Escrita direta só de admin. Vendedor mexe na OS pelas RPCs security definer
-- (create_work_order, cancel_work_order, set_production_stage) — ver 0032.
create policy wo_write on work_orders for update to authenticated
  using (company_id = current_company_id() and is_company_admin())
  with check (company_id = current_company_id() and is_company_admin());

alter table work_order_costs enable row level security;

-- Custo é dado de admin: sem policy de leitura para vendedor.
create policy woc_all on work_order_costs for all to authenticated
  using (company_id = current_company_id() and is_company_admin())
  with check (company_id = current_company_id() and is_company_admin());

-- Concluir a OS congela os lançamentos. Regra que nenhuma policy expressa.
create or replace function public.woc_closed_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_wo     uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then v_wo := old.work_order_id; else v_wo := new.work_order_id; end if;
  select status into v_status from work_orders where id = v_wo;
  if v_status in ('concluida','cancelada') then
    raise exception 'Ordem de serviço encerrada: lançamentos bloqueados';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger woc_closed_guard
  before insert or update or delete on work_order_costs
  for each row execute function public.woc_closed_guard();

-- planned_value é a base de comparação da OS. A policy woc_all é `for all` e
-- não restringe coluna, então a imutabilidade do planejado (e o vínculo da
-- linha com a OS) é garantida aqui, não na camada de aplicação.
create or replace function public.woc_frozen_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.planned_value is distinct from old.planned_value then
    raise exception 'planned_value é congelado e não pode ser alterado';
  end if;
  if new.work_order_id is distinct from old.work_order_id then
    raise exception 'Lançamento não pode mudar de ordem de serviço';
  end if;
  return new;
end;
$$;

create trigger woc_frozen_guard
  before update on work_order_costs
  for each row execute function public.woc_frozen_guard();

-- Foto da aprovação: total do orçamento, marca d'água do snapshot, vínculo e
-- numeração não mudam depois que a OS nasce.
create or replace function public.wo_frozen_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.quote_id is distinct from old.quote_id
     or new.number is distinct from old.number
     or new.quote_total is distinct from old.quote_total
     or new.quote_snapshot_at is distinct from old.quote_snapshot_at then
    raise exception 'Campos congelados da ordem de serviço não podem ser alterados';
  end if;
  return new;
end;
$$;

create trigger wo_frozen_guard
  before update on work_orders
  for each row execute function public.wo_frozen_guard();
```

- [ ] **Step 2: Aplicar a migration no banco**

Aplicar o conteúdo do arquivo pelo SQL Editor do Supabase (ou `apply_migration` do MCP, nome `0031_work_orders`).
Expected: sucesso, sem erro.

- [ ] **Step 3: Conferir que o schema subiu**

Rodar no SQL Editor:

```sql
select table_name from information_schema.tables
 where table_schema = 'public' and table_name like 'work_order%'
 order by 1;
```

Expected: quatro linhas — `work_order_category_totals`, `work_order_costs`, `work_order_totals`, `work_orders`.

- [ ] **Step 4: Conferir a coluna gerada e o trigger**

```sql
select column_name, is_generated, generation_expression
  from information_schema.columns
 where table_name = 'work_order_costs' and column_name = 'actual_value';

select tgname from pg_trigger where tgrelid = 'work_order_costs'::regclass and not tgisinternal;
```

Expected: `actual_value` com `is_generated = ALWAYS` e expressão `round((qty * unit_value), 2)`; triggers `woc_closed_guard` e `woc_frozen_guard` presentes na `work_order_costs` (a query só inspeciona essa tabela — o terceiro trigger, `wo_frozen_guard`, fica em `work_orders` e não aparece aqui). O cálculo em si é exercitado com dados reais na Task 6, Step 3.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0031_work_orders.sql
git commit -m "feat: schema da ordem de serviço"
```

---

### Task 5: Funções da OS (migration 0032)

**Files:**
- Create: `supabase/migrations/0032_work_order_rpcs.sql`

**Interfaces:**
- Consumes: tabelas da Task 4; `current_company_id()`, `is_company_admin()`.
- Produces: `work_order_clone_costs(uuid, uuid)`, `create_work_order(uuid) returns uuid`, `cancel_work_order(uuid)`, `set_production_stage(uuid, text, boolean)`, `close_work_order(uuid)`, `reopen_work_order(uuid)`.

`work_order_clone_costs` repete em SQL a regra de `src/lib/work-order/decompose.ts`. Manter as duas idênticas: mesma ordem de linhas, mesmas descrições, mesmo resíduo.

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/0032_work_order_rpcs.sql`:

```sql
-- Funções da OS. As três alcançáveis por vendedor (create/cancel/set_stage) são
-- security definer porque ele não tem policy de escrita; cada uma valida a
-- empresa explicitamente, já que em definer a RLS não protege mais nada.

-- Clona a composição de preços do orçamento como custo planejado.
-- Interna: quem chama já validou a empresa. Espelha decomposeItem() em TS.
create or replace function public.work_order_clone_costs(
  p_work_order_id uuid,
  p_quote_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_mult    int;
  it        record;
  o         jsonb;
  v_label   text;
  v_val     numeric(12,2);
  v_sum     numeric(12,2);
  v_total   numeric(12,2);
  v_cat     uuid;
  v_opt_id  text;
  v_sort    int := 0;
  v_raw     text;
begin
  select company_id, coalesce(multiplier, 1) into v_company, v_mult
    from quotes where id = p_quote_id;

  for it in
    select qi.*, pt.price_category_id as product_category_id
      from quote_items qi
      left join product_types pt on pt.id = qi.product_type_id
     where qi.quote_id = p_quote_id
     order by qi.sort_order
  loop
    v_label := it.product_name || case
      when it.width_m is not null and it.height_m is not null
      then ' ' || replace(to_char(it.width_m, 'FM999990D00'), '.', ',')
           || '×' || replace(to_char(it.height_m, 'FM999990D00'), '.', ',')
      else '' end;
    v_sum := 0;

    -- preço base, com a categoria do produto
    v_val := round(it.unit_base_price * it.qty * v_mult, 2);
    insert into work_order_costs (work_order_id, company_id, source, description,
      item_label, quote_item_id, price_category_id, qty, unit_value, planned_value, sort_order)
    values (p_work_order_id, v_company, 'orcamento', 'Preço base',
      v_label, it.id, it.product_category_id, 1, v_val, v_val, v_sort);
    v_sum := v_sum + v_val;
    v_sort := v_sort + 1;

    -- uma linha por opção do snapshot, inclusive as de valor zero
    for o in select value from jsonb_array_elements(it.selected_options)
    loop
      v_opt_id := o->>'optionId';
      v_cat := null;
      if v_opt_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        select coalesce(op.price_category_id, g.price_category_id) into v_cat
          from options op
          join option_groups g on g.id = op.group_id
         where op.id = v_opt_id::uuid;
      end if;

      v_raw := o->>'surchargeValue';
      if v_raw is null or v_raw !~ '^-?[0-9]+(\.[0-9]+)?$' then
        v_raw := '0';
      end if;

      v_val := round((case when o->>'surchargeType' = 'por_m2'
                           then v_raw::numeric * coalesce(it.area_m2, 0)
                           else v_raw::numeric end)
                     * it.qty * v_mult, 2);

      insert into work_order_costs (work_order_id, company_id, source, description,
        item_label, quote_item_id, price_category_id, qty, unit_value, planned_value, sort_order)
      values (p_work_order_id, v_company, 'orcamento',
        coalesce(o->>'group', '') || ' — ' || coalesce(o->>'label', ''),
        v_label, it.id, v_cat, 1, v_val, v_val, v_sort);
      v_sum := v_sum + v_val;
      v_sort := v_sort + 1;
    end loop;

    -- ajuste livre da linha
    if coalesce(it.extra_value, 0) <> 0 then
      v_val := round(it.extra_value * v_mult, 2);
      insert into work_order_costs (work_order_id, company_id, source, description,
        item_label, quote_item_id, price_category_id, qty, unit_value, planned_value, sort_order)
      values (p_work_order_id, v_company, 'orcamento', 'Ajuste do item',
        v_label, it.id, null, 1, v_val, v_val, v_sort);
      v_sum := v_sum + v_val;
      v_sort := v_sort + 1;
    end if;

    -- resíduo: surcharge do modelo (não persistido em quote_items) + arredondamento
    v_total := round(it.line_total * v_mult, 2);
    v_val := round(v_total - v_sum, 2);
    if v_val <> 0 then
      insert into work_order_costs (work_order_id, company_id, source, description,
        item_label, quote_item_id, price_category_id, qty, unit_value, planned_value, sort_order)
      values (p_work_order_id, v_company, 'orcamento',
        case when nullif(it.model_name, '') is not null then 'Modelo ' || it.model_name
             else 'Ajuste de arredondamento' end,
        v_label, it.id, null, 1, v_val, v_val, v_sort);
      v_sort := v_sort + 1;
    end if;
  end loop;
end;
$$;

-- Cria (ou revive) a OS de um orçamento aprovado. Idempotente.
create or replace function public.create_work_order(p_quote_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  q     record;
  v_id  uuid;
  v_num int;
begin
  select * into q from quotes where id = p_quote_id for update;
  if q.id is null then
    raise exception 'Orçamento não encontrado';
  end if;
  if q.company_id is distinct from current_company_id() then
    raise exception 'not authorized';
  end if;
  if q.status <> 'aprovado' then
    raise exception 'Orçamento não está aprovado';
  end if;

  select id into v_id from work_orders where quote_id = p_quote_id;
  if v_id is not null then
    -- reaprovação: a mesma OS volta, com os custos já lançados
    update work_orders set status = 'planejada', updated_at = now()
     where id = v_id and status = 'cancelada';
    return v_id;
  end if;

  -- serializa a numeração da empresa; unique(company_id, number) é a rede
  perform pg_advisory_xact_lock(hashtext(q.company_id::text));
  select coalesce(max(number), 0) + 1 into v_num
    from work_orders where company_id = q.company_id;

  insert into work_orders (quote_id, company_id, number, production_stage,
    quote_total, quote_snapshot_at, created_by)
  values (p_quote_id, q.company_id, v_num, 'pendente',
    q.total, q.updated_at, auth.uid())
  returning id into v_id;

  perform work_order_clone_costs(v_id, p_quote_id);
  return v_id;
end;
$$;

-- Orçamento saiu de aprovado: cancela a OS, preservando os custos lançados.
create or replace function public.cancel_work_order(p_quote_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  select company_id into v_company from quotes where id = p_quote_id;
  if v_company is null or v_company is distinct from current_company_id() then
    raise exception 'not authorized';
  end if;
  update work_orders set status = 'cancelada', updated_at = now()
   where quote_id = p_quote_id and status not in ('cancelada', 'concluida');
end;
$$;

-- Único caminho de escrita do vendedor: etapa (e arquivamento). Toca só essas
-- colunas, mais a promoção automática para em_andamento.
create or replace function public.set_production_stage(
  p_quote_id uuid,
  p_stage text,
  p_archive boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare wo record;
begin
  if p_stage not in ('pendente','a_produzir','em_producao','pronto','instalado') then
    raise exception 'Etapa inválida';
  end if;

  select * into wo from work_orders where quote_id = p_quote_id for update;
  if wo.id is null then
    raise exception 'Ordem de serviço não encontrada';
  end if;
  if wo.company_id is distinct from current_company_id() then
    raise exception 'not authorized';
  end if;
  if wo.status in ('cancelada', 'concluida') then
    raise exception 'Ordem de serviço encerrada: etapa bloqueada';
  end if;

  update work_orders set
    production_stage = p_stage,
    archived_at = case when p_archive then now() else archived_at end,
    status = case when status = 'planejada' and p_stage not in ('pendente','a_produzir')
                  then 'em_andamento' else status end,
    updated_at = now()
   where id = wo.id;
end;
$$;

-- Encerramento financeiro. Não calcula total: o CPreal é work_order_totals.
-- security invoker: só admin chama, e admin já tem a policy de update.
create or replace function public.close_work_order(p_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not is_company_admin() then
    raise exception 'not authorized';
  end if;
  update work_orders set status = 'concluida', closed_at = now(),
    closed_by = auth.uid(), updated_at = now()
   where id = p_id and status in ('planejada','em_andamento');
  if not found then
    raise exception 'Ordem de serviço não pode ser concluída';
  end if;
end;
$$;

create or replace function public.reopen_work_order(p_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not is_company_admin() then
    raise exception 'not authorized';
  end if;
  update work_orders set status = 'em_andamento', closed_at = null,
    closed_by = null, updated_at = now()
   where id = p_id and status = 'concluida';
  if not found then
    raise exception 'Ordem de serviço não está concluída';
  end if;
end;
$$;

revoke execute on function public.work_order_clone_costs(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.create_work_order(uuid) from public, anon;
revoke execute on function public.cancel_work_order(uuid) from public, anon;
revoke execute on function public.set_production_stage(uuid, text, boolean) from public, anon;
revoke execute on function public.close_work_order(uuid) from public, anon;
revoke execute on function public.reopen_work_order(uuid) from public, anon;

grant execute on function public.create_work_order(uuid) to authenticated;
grant execute on function public.cancel_work_order(uuid) to authenticated;
grant execute on function public.set_production_stage(uuid, text, boolean) to authenticated;
grant execute on function public.close_work_order(uuid) to authenticated;
grant execute on function public.reopen_work_order(uuid) to authenticated;
```

- [ ] **Step 2: Aplicar a migration no banco**

Aplicar pelo SQL Editor do Supabase (ou `apply_migration`, nome `0032_work_order_rpcs`).
Expected: sucesso.

- [ ] **Step 3: Conferir que as funções existem**

```sql
select proname from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname like '%work_order%' or proname = 'set_production_stage'
 order by 1;
```

Expected: `cancel_work_order`, `close_work_order`, `create_work_order`, `reopen_work_order`, `set_production_stage`, `woc_closed_guard`, `work_order_clone_costs`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0032_work_order_rpcs.sql
git commit -m "feat: funções de criação, cancelamento e encerramento da OS"
```

---

### Task 6: Backfill das OS existentes (migration 0033)

**Files:**
- Create: `supabase/migrations/0033_work_orders_backfill.sql`

**Interfaces:**
- Consumes: `work_order_clone_costs` (Task 5), colunas `quotes.production_stage` e `quotes.archived_at` (ainda existentes).
- Produces: uma linha em `work_orders` para cada quote `aprovado`, com as linhas de custo clonadas.

Roda como superusuário na migration, então não passa por `create_work_order` (que exige `current_company_id()` de uma sessão autenticada).

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/0033_work_orders_backfill.sql`:

```sql
-- Uma OS para cada orçamento já aprovado, herdando etapa e arquivamento.
-- Status: arquivado nasce concluído; etapa além de 'a_produzir' nasce em
-- andamento; o resto nasce planejada — mesma regra de nextStatusForStage.
do $$
declare
  q     record;
  v_id  uuid;
  v_num int;
begin
  for q in
    select * from quotes where status = 'aprovado' order by company_id, created_at
  loop
    -- idempotente: orçamento que já tem OS é pulado, então reaplicar a migration
    -- não derruba o backfill inteiro por unique(quote_id)
    continue when exists (select 1 from work_orders where quote_id = q.id);

    select coalesce(max(number), 0) + 1 into v_num
      from work_orders where company_id = q.company_id;

    -- nasce 'planejada' porque woc_closed_guard recusa lançamento em OS
    -- encerrada; o status final é gravado depois do clone.
    insert into work_orders (quote_id, company_id, number, status, production_stage,
      archived_at, quote_total, quote_snapshot_at, closed_at, created_at)
    values (
      q.id, q.company_id, v_num, 'planejada',
      coalesce(q.production_stage, 'pendente'),
      q.archived_at, q.total, q.updated_at, q.archived_at, q.created_at
    )
    returning id into v_id;

    perform work_order_clone_costs(v_id, q.id);

    update work_orders set status = case
        when q.archived_at is not null then 'concluida'
        when coalesce(q.production_stage, 'pendente') in ('pendente','a_produzir') then 'planejada'
        else 'em_andamento'
      end
     where id = v_id;
  end loop;
end;
$$;
```

- [ ] **Step 2: Aplicar a migration no banco**

Aplicar pelo SQL Editor (ou `apply_migration`, nome `0033_work_orders_backfill`).
Expected: sucesso.

- [ ] **Step 3: Verificar a invariante do clone contra os orçamentos reais**

Esta é a verificação de conformidade entre a decomposição em SQL e a de TypeScript, exigida pelo spec. Rodar:

```sql
select wo.id, wo.number,
       round(sum(c.planned_value), 2) as clonado,
       round((select sum(qi.line_total) * coalesce(q.multiplier, 1)
                from quote_items qi where qi.quote_id = q.id), 2) as esperado
  from work_orders wo
  join quotes q on q.id = wo.quote_id
  join work_order_costs c on c.work_order_id = wo.id
 group by wo.id, wo.number, q.id, q.multiplier
having round(sum(c.planned_value), 2)
    is distinct from round((select sum(qi.line_total) * coalesce(q.multiplier, 1)
                              from quote_items qi where qi.quote_id = q.id), 2);
```

Expected: **zero linhas**. Qualquer linha aqui é bug em `work_order_clone_costs` — corrigir a função antes de seguir.

- [ ] **Step 4: Verificar que toda OS tem número e que a contagem bate**

```sql
select (select count(*) from quotes where status = 'aprovado') as aprovados,
       (select count(*) from work_orders) as ordens,
       (select count(*) from work_orders where number is null) as sem_numero;
```

Expected: `aprovados = ordens`, `sem_numero = 0`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0033_work_orders_backfill.sql
git commit -m "feat: backfill das ordens de serviço dos orçamentos aprovados"
```

---

### Task 7: Queries da OS e geração na aprovação

**Files:**
- Create: `src/lib/work-order/queries.ts`
- Modify: `src/app/(app)/orcamentos/actions.ts:90-103` (`setStatus`)

**Interfaces:**
- Consumes: types da Task 1; RPCs `create_work_order` e `cancel_work_order` da Task 5; `getProfile` de `@/lib/auth`.
- Produces: `fetchWorkOrder(supabase, quoteId): Promise<WorkOrder | null>`, `fetchWorkOrderCosts(supabase, workOrderId): Promise<WorkOrderCost[]>`, `fetchWorkOrderTotals(supabase, workOrderId): Promise<WorkOrderTotals | null>`.

- [ ] **Step 1: Escrever as queries**

`src/lib/work-order/queries.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkOrder, WorkOrderCost, WorkOrderTotals } from './types'

const WO_COLUMNS =
  'id, quote_id, number, status, production_stage, archived_at, quote_total, quote_snapshot_at, closed_at'

export async function fetchWorkOrder(
  supabase: SupabaseClient, quoteId: string,
): Promise<WorkOrder | null> {
  const { data, error } = await supabase
    .from('work_orders').select(WO_COLUMNS).eq('quote_id', quoteId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return { ...data, quote_total: Number(data.quote_total) } as WorkOrder
}

export async function fetchWorkOrderCosts(
  supabase: SupabaseClient, workOrderId: string,
): Promise<WorkOrderCost[]> {
  const { data, error } = await supabase
    .from('work_order_costs')
    .select('*')
    .eq('work_order_id', workOrderId)
    .order('sort_order')
    .order('created_at')
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((c: any) => ({
    ...c,
    qty: Number(c.qty),
    unit_value: Number(c.unit_value),
    actual_value: Number(c.actual_value),
    planned_value: Number(c.planned_value),
  })) as WorkOrderCost[]
}

export async function fetchWorkOrderTotals(
  supabase: SupabaseClient, workOrderId: string,
): Promise<WorkOrderTotals | null> {
  const { data, error } = await supabase
    .from('work_order_totals')
    .select('quote_total, planned_total, actual_total, variance, margin')
    .eq('work_order_id', workOrderId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    quote_total: Number(data.quote_total),
    planned_total: Number(data.planned_total),
    actual_total: Number(data.actual_total),
    variance: Number(data.variance),
    margin: Number(data.margin),
  }
}
```

- [ ] **Step 2: Ligar a geração na mudança de status**

Substituir `setStatus` em `src/app/(app)/orcamentos/actions.ts` (linhas 90–103) por:

```ts
export async function setStatus(id: string, status: 'rascunho' | 'enviado' | 'aprovado' | 'recusado') {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('quotes')
    .update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)

  // aprovar gera (ou revive) a OS; sair de aprovado cancela, preservando os
  // custos já lançados. A RPC é idempotente: reaprovar devolve a mesma OS.
  const rpc = status === 'aprovado' ? 'create_work_order' : 'cancel_work_order'
  const { error: woError } = await supabase.rpc(rpc, { p_quote_id: id })
  if (woError) throw new Error(woError.message)

  revalidatePath('/')
  revalidatePath(`/orcamentos/${id}`)
  revalidatePath('/producao')
}
```

- [ ] **Step 3: Rodar lint e testes**

Run: `npm run lint && npm test`
Expected: PASS, sem warnings

- [ ] **Step 4: Verificar manualmente a geração**

Rodar `npm run dev`, entrar como admin, abrir um orçamento em `rascunho` ou `enviado` e marcar como **aprovado**. Depois, no SQL Editor:

```sql
select wo.number, wo.status, wo.production_stage, count(c.id) as linhas,
       round(sum(c.planned_value), 2) as planejado
  from work_orders wo left join work_order_costs c on c.work_order_id = wo.id
 where wo.quote_id = '<id do orçamento>'
 group by wo.id;
```

Expected: uma linha, `status = planejada`, `production_stage = pendente`, `linhas` ≥ 1, `planejado` igual à soma de `line_total × multiplier` do orçamento.

Em seguida marcar o mesmo orçamento como **recusado** e reconsultar: `status = cancelada`, `linhas` inalterado. Voltar para **aprovado**: mesma `number`, `status = planejada`, `linhas` inalterado.

- [ ] **Step 5: Commit**

```bash
git add src/lib/work-order/queries.ts "src/app/(app)/orcamentos/actions.ts"
git commit -m "feat: gera a ordem de serviço ao aprovar o orçamento"
```

---

### Task 8: Produção passa a ler a OS

**Files:**
- Modify: `src/lib/production/queries.ts` (`fetchBoardQuotes`, `fetchCalendarQuotes`, `fetchArchivedQuotes`)
- Modify: `src/app/(app)/producao/actions.ts` (`setProductionStage`, `archiveQuote`)

**Interfaces:**
- Consumes: RPC `set_production_stage` (Task 5); tabela `work_orders`.
- Produces: `BoardQuote` ganha `work_order_id: string`; assinaturas de `setProductionStage(quoteId, stage)` e `archiveQuote(quoteId)` ficam iguais (o board não muda).

O board continua consultando `quotes` e embutindo `work_orders!inner`: assim a ordenação por `delivery_date` segue no nível de cima e o shape dos componentes não muda.

- [ ] **Step 1: Trocar a origem das colunas nas queries**

Em `src/lib/production/queries.ts`, adicionar `work_order_id` à interface e reescrever as três funções que hoje leem `production_stage`/`archived_at` de `quotes`:

```ts
export interface BoardQuote {
  id: string
  work_order_id: string
  customer_name: string
  delivery_date: string | null
  total: number
  production_stage: Stage | null
  open_pendencies: number
}

// PostgREST devolve objeto quando detecta 1:1 (unique em quote_id) e array
// quando não detecta. Normaliza os dois casos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function embeddedOrder(row: any) {
  const wo = Array.isArray(row.work_orders) ? row.work_orders[0] : row.work_orders
  return wo ?? null
}

export async function fetchBoardQuotes(supabase: SupabaseClient): Promise<BoardQuote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, customer_name, delivery_date, total, quote_pendencies(done), work_orders!inner(id, production_stage, status, archived_at)')
    .eq('status', 'aprovado')
    .neq('work_orders.status', 'cancelada')
    .is('work_orders.archived_at', null)
    .order('delivery_date', { ascending: true, nullsFirst: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((q: any) => {
    const wo = embeddedOrder(q)
    return {
      id: q.id,
      work_order_id: wo.id,
      customer_name: q.customer_name,
      delivery_date: q.delivery_date,
      total: Number(q.total),
      production_stage: wo.production_stage,
      open_pendencies: (q.quote_pendencies ?? []).filter((p: { done: boolean }) => !p.done).length,
    }
  })
}

export async function fetchCalendarQuotes(
  supabase: SupabaseClient, startISO: string, endISO: string,
): Promise<CalendarQuote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, customer_name, delivery_date, work_orders!inner(production_stage, archived_at, status)')
    .eq('status', 'aprovado')
    .neq('work_orders.status', 'cancelada')
    .gte('delivery_date', startISO)
    .lte('delivery_date', endISO)
    .not('delivery_date', 'is', null)
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((q: any) => {
    const wo = embeddedOrder(q)
    return {
      id: q.id,
      customer_name: q.customer_name,
      delivery_date: q.delivery_date,
      production_stage: wo.production_stage,
      archived: wo.archived_at != null,
    }
  })
}

export async function fetchArchivedQuotes(
  supabase: SupabaseClient, period: { start: string | null; end: string | null },
): Promise<ArchivedQuote[]> {
  let query = supabase.from('quotes')
    .select('id, customer_name, delivery_date, total, work_orders!inner(archived_at)')
    .not('work_orders.archived_at', 'is', null)
    .order('delivery_date', { ascending: false, nullsFirst: false })
  if (period.start) query = query.gte('delivery_date', period.start.slice(0, 10))
  if (period.end) query = query.lt('delivery_date', period.end.slice(0, 10))
  const { data, error } = await query
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((q: any) => ({
    id: q.id, customer_name: q.customer_name, delivery_date: q.delivery_date,
    total: Number(q.total), archived_at: embeddedOrder(q).archived_at,
  }))
}
```

- [ ] **Step 2: Trocar as escritas pela RPC**

Em `src/app/(app)/producao/actions.ts`, substituir as duas primeiras funções (o restante do arquivo, das pendências, não muda):

```ts
export async function setProductionStage(quoteId: string, stage: Stage): Promise<void> {
  const { supabase } = await getProfile()
  if (!isValidStage(stage)) throw new Error('Etapa inválida')
  // RPC porque vendedor não tem policy de escrita em work_orders; ela também
  // promove a OS para 'em_andamento' quando a produção começa.
  const { error } = await supabase.rpc('set_production_stage', {
    p_quote_id: quoteId, p_stage: stage, p_archive: false,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/producao')
  revalidatePath('/producao/calendario')
  revalidatePath(`/orcamentos/${quoteId}`)
}

export async function archiveQuote(quoteId: string): Promise<void> {
  const { supabase } = await getProfile()
  const { error } = await supabase.rpc('set_production_stage', {
    p_quote_id: quoteId, p_stage: 'instalado', p_archive: true,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/producao')
  revalidatePath('/producao/concluidos')
  revalidatePath('/producao/calendario')
  revalidatePath(`/orcamentos/${quoteId}`)
}
```

- [ ] **Step 3: Rodar lint e testes**

Run: `npm run lint && npm test`
Expected: PASS

- [ ] **Step 4: Verificar o board manualmente**

Com `npm run dev`: abrir `/producao`. Os cards devem aparecer nas mesmas colunas de antes. Arrastar um card de "Pendente" para "Em produção" e conferir no SQL Editor:

```sql
select number, status, production_stage from work_orders where quote_id = '<id>';
```

Expected: `production_stage = em_producao` e `status = em_andamento` (promoção automática). Depois conferir `/producao/calendario` e `/producao/concluidos` — mesma listagem de antes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/production/queries.ts "src/app/(app)/producao/actions.ts"
git commit -m "refactor: produção passa a ler etapa e arquivamento da OS"
```

---

### Task 9: Remover as colunas antigas de quotes (migration 0034)

**Files:**
- Create: `supabase/migrations/0034_drop_quote_production_columns.sql`

**Interfaces:**
- Consumes: nada. Só roda depois que a Task 8 tirou todas as leituras.
- Produces: `quotes` sem `production_stage` e sem `archived_at`.

- [ ] **Step 1: Confirmar que o código não referencia mais as colunas**

Run: `grep -rn "production_stage\|archived_at" src/ --include=*.ts --include=*.tsx`
Expected: nenhuma ocorrência lendo de `quotes`. As ocorrências restantes devem ser em `src/lib/work-order/` e nas queries de produção, todas apontando para `work_orders`.

- [ ] **Step 2: Escrever a migration**

`supabase/migrations/0034_drop_quote_production_columns.sql`:

```sql
-- Etapa e arquivamento agora vivem em work_orders (0031/0033). O app já lê de lá.
drop index if exists quotes_production_idx;
alter table quotes
  drop column if exists production_stage,
  drop column if exists archived_at;
```

- [ ] **Step 3: Aplicar a migration no banco**

Aplicar pelo SQL Editor (ou `apply_migration`, nome `0034_drop_quote_production_columns`).
Expected: sucesso.

- [ ] **Step 4: Verificar que o app segue de pé**

Com `npm run dev`, abrir `/producao`, `/producao/calendario`, `/producao/concluidos` e um orçamento aprovado.
Expected: nenhuma tela quebra; os cards continuam nas mesmas colunas.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0034_drop_quote_production_columns.sql
git commit -m "refactor: remove production_stage e archived_at de quotes"
```

---

### Task 10: Bloco da OS na página do orçamento

**Files:**
- Create: `src/components/work-order/order-summary.tsx`
- Modify: `src/app/(app)/orcamentos/[id]/page.tsx`

**Interfaces:**
- Consumes: `fetchWorkOrder`, `fetchWorkOrderTotals` (Task 7); `variancePercent` (Task 1); `WO_STATUS_LABELS` (Task 2); `STAGE_LABELS` de `@/lib/production/stages`; `formatBRL` de `@/lib/format`.
- Produces: `<OrderSummary quoteId workOrder totals quoteUpdatedAt />` — server component, renderizado só para admin.

- [ ] **Step 1: Escrever o componente**

`src/components/work-order/order-summary.tsx`:

```tsx
import Link from 'next/link'
import { formatBRL } from '@/lib/format'
import { STAGE_LABELS } from '@/lib/production/stages'
import { WO_STATUS_LABELS } from '@/lib/work-order/status'
import { variancePercent } from '@/lib/work-order/variance'
import type { WorkOrder, WorkOrderTotals } from '@/lib/work-order/types'

export function OrderSummary({ quoteId, workOrder, totals, quoteUpdatedAt }: {
  quoteId: string
  workOrder: WorkOrder
  totals: WorkOrderTotals
  quoteUpdatedAt: string
}) {
  const pct = variancePercent(totals.planned_total, totals.actual_total)
  const estourou = totals.variance > 0
  const desatualizado = new Date(quoteUpdatedAt) > new Date(workOrder.quote_snapshot_at)

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">Ordem de Serviço #{workOrder.number}</h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
          {WO_STATUS_LABELS[workOrder.status]}
        </span>
        {workOrder.production_stage && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            {STAGE_LABELS[workOrder.production_stage]}
          </span>
        )}
        <Link href={`/orcamentos/${quoteId}/ordem`} className="ml-auto underline">
          Abrir OS →
        </Link>
      </div>

      {desatualizado && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Orçamento alterado depois da geração da OS — o planejado é a foto da aprovação.
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <span className="text-muted-foreground">Planejado</span>
          <p className="font-bold">{formatBRL(totals.planned_total)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Real</span>
          <p className={`font-bold ${estourou ? 'text-red-600' : ''}`}>
            {formatBRL(totals.actual_total)}
            {totals.variance !== 0 && (
              <span className="ml-1 text-xs font-semibold">
                {estourou ? '▲' : '▼'} {formatBRL(Math.abs(totals.variance))}
                {pct != null && ` (${pct > 0 ? '+' : ''}${pct}%)`}
              </span>
            )}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Margem</span>
          <p className={`font-bold ${totals.margin < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {formatBRL(totals.margin)}
          </p>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Renderizar na página do orçamento**

Em `src/app/(app)/orcamentos/[id]/page.tsx`:

1. Adicionar os imports:

```tsx
import { OrderSummary } from '@/components/work-order/order-summary'
import { fetchWorkOrder, fetchWorkOrderTotals } from '@/lib/work-order/queries'
```

2. Depois do `if (!quote) notFound()`, buscar a OS só para admin:

```tsx
const isAdmin = profile.role !== 'vendedor'
const workOrder = isAdmin ? await fetchWorkOrder(supabase, id) : null
const woTotals = workOrder ? await fetchWorkOrderTotals(supabase, workOrder.id) : null
```

3. No JSX, logo abaixo do `<ReceiptsSection ... />` já existente:

```tsx
{workOrder && woTotals && (
  <OrderSummary
    quoteId={id}
    workOrder={workOrder}
    totals={woTotals}
    quoteUpdatedAt={quote.updated_at}
  />
)}
```

- [ ] **Step 3: Rodar lint e testes**

Run: `npm run lint && npm test`
Expected: PASS

- [ ] **Step 4: Verificar manualmente**

Com `npm run dev`, abrir um orçamento aprovado como admin: o bloco aparece com Planejado = Real (nada foi editado ainda) e Margem = total − planejado. Abrir o mesmo orçamento como vendedor: o bloco não aparece.

- [ ] **Step 5: Commit**

```bash
git add src/components/work-order/order-summary.tsx "src/app/(app)/orcamentos/[id]/page.tsx"
git commit -m "feat: bloco da ordem de serviço na página do orçamento"
```

---

### Task 11: Tela da OS (leitura)

**Files:**
- Create: `src/app/(app)/orcamentos/[id]/ordem/page.tsx`
- Create: `src/components/work-order/category-summary.tsx`
- Create: `src/components/work-order/cost-table.tsx`

**Interfaces:**
- Consumes: `fetchWorkOrder`, `fetchWorkOrderCosts`, `fetchWorkOrderTotals` (Task 7); `rollupByCategory` (Task 1); `WO_STATUS_LABELS`, `canEditCosts` (Task 2).
- Produces: rota `/orcamentos/[id]/ordem`; `<CategorySummary rows />`; `<CostTable costs editable quoteId />` (nesta tarefa, só leitura — a edição entra na Task 12).

- [ ] **Step 1: Resumo por natureza**

`src/components/work-order/category-summary.tsx`:

```tsx
import { formatBRL } from '@/lib/format'
import type { CategoryTotals } from '@/lib/work-order/types'

export function CategorySummary({ rows }: { rows: CategoryTotals[] }) {
  return (
    <section className="space-y-2 rounded-xl border p-4">
      <h2 className="text-lg font-bold">Por natureza</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1 font-medium">Categoria</th>
              <th className="py-1 text-right font-medium">Planejado</th>
              <th className="py-1 text-right font-medium">Real</th>
              <th className="py-1 text-right font-medium">Variação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.price_category_id ?? 'sem'} className="border-b last:border-0">
                <td className="py-1">{r.name}</td>
                <td className="py-1 text-right">{formatBRL(r.planned_total)}</td>
                <td className="py-1 text-right">{formatBRL(r.actual_total)}</td>
                <td className={`py-1 text-right font-semibold ${r.variance > 0 ? 'text-red-600' : r.variance < 0 ? 'text-green-700' : ''}`}>
                  {r.variance === 0 ? '—' : formatBRL(r.variance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Tabela de linhas (leitura)**

`src/components/work-order/cost-table.tsx`:

```tsx
import { formatBRL } from '@/lib/format'
import type { WorkOrderCost } from '@/lib/work-order/types'

function groupByItem(costs: WorkOrderCost[]): [string, WorkOrderCost[]][] {
  const groups = new Map<string, WorkOrderCost[]>()
  for (const c of costs) {
    const key = c.item_label || 'Lançamentos avulsos'
    const list = groups.get(key) ?? []
    list.push(c)
    groups.set(key, list)
  }
  return [...groups.entries()]
}

export function CostTable({ costs }: { costs: WorkOrderCost[] }) {
  if (costs.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum lançamento.</p>
  }
  return (
    <div className="space-y-4">
      {groupByItem(costs).map(([label, lines]) => (
        <details key={label} open className="rounded-xl border">
          <summary className="cursor-pointer px-4 py-2 font-semibold">{label}</summary>
          <div className="overflow-x-auto px-4 pb-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1 font-medium">Descrição</th>
                  <th className="py-1 text-right font-medium">Planejado</th>
                  <th className="py-1 text-right font-medium">Real</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(c => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-1">
                      {c.description}
                      {c.supplier && <span className="ml-2 text-muted-foreground">({c.supplier})</span>}
                      {c.planned_value === 0 && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          não previsto
                        </span>
                      )}
                    </td>
                    <td className="py-1 text-right text-muted-foreground">{formatBRL(c.planned_value)}</td>
                    <td className="py-1 text-right font-semibold">{formatBRL(c.actual_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: A página**

`src/app/(app)/orcamentos/[id]/ordem/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { formatBRL } from '@/lib/format'
import { STAGE_LABELS } from '@/lib/production/stages'
import { WO_STATUS_LABELS } from '@/lib/work-order/status'
import { rollupByCategory } from '@/lib/work-order/variance'
import { fetchWorkOrder, fetchWorkOrderCosts, fetchWorkOrderTotals } from '@/lib/work-order/queries'
import { CategorySummary } from '@/components/work-order/category-summary'
import { CostTable } from '@/components/work-order/cost-table'
import type { PriceCategory } from '@/lib/config-types'

export default async function OrdemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, profile } = await getProfile()
  if (profile.role === 'vendedor') redirect(`/orcamentos/${id}`)

  const workOrder = await fetchWorkOrder(supabase, id)
  if (!workOrder) notFound()

  const [costs, totals, { data: categories }, { data: quote }] = await Promise.all([
    fetchWorkOrderCosts(supabase, workOrder.id),
    fetchWorkOrderTotals(supabase, workOrder.id),
    supabase.from('price_categories').select('id, slug, name, sort_order').order('sort_order'),
    supabase.from('quotes').select('customer_name').eq('id', id).single(),
  ])
  if (!totals) notFound()

  const rows = rollupByCategory(costs, (categories ?? []) as PriceCategory[])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Ordem de Serviço #{workOrder.number}</h1>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
          {WO_STATUS_LABELS[workOrder.status]}
        </span>
        {workOrder.production_stage && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            {STAGE_LABELS[workOrder.production_stage]}
          </span>
        )}
        <Link href={`/orcamentos/${id}`} className="ml-auto underline">
          ← {quote?.customer_name ?? 'Orçamento'}
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-2 rounded-xl border p-4 text-sm sm:grid-cols-4">
        <div>
          <span className="text-muted-foreground">Total do orçamento</span>
          <p className="font-bold">{formatBRL(totals.quote_total)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Planejado</span>
          <p className="font-bold">{formatBRL(totals.planned_total)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Custo real</span>
          <p className="font-bold">{formatBRL(totals.actual_total)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Margem</span>
          <p className={`font-bold ${totals.margin < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {formatBRL(totals.margin)}
          </p>
        </div>
      </section>

      <CategorySummary rows={rows} />
      <CostTable costs={costs} />
    </div>
  )
}
```

- [ ] **Step 4: Rodar lint e testes**

Run: `npm run lint && npm test`
Expected: PASS

- [ ] **Step 5: Verificar manualmente**

Com `npm run dev`, abrir `/orcamentos/<id>/ordem` como admin em um orçamento aprovado.
Expected: cabeçalho com o número, os quatro totais, a tabela por natureza somando o mesmo `planned_total` do cabeçalho, e as linhas agrupadas por item. Acessar a mesma URL como vendedor: redireciona para `/orcamentos/<id>`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/orcamentos/[id]/ordem/page.tsx" src/components/work-order/category-summary.tsx src/components/work-order/cost-table.tsx
git commit -m "feat: tela da ordem de serviço"
```

---

### Task 12: Lançamento e encerramento

**Files:**
- Create: `src/app/(app)/orcamentos/[id]/ordem/actions.ts`
- Create: `src/components/work-order/add-cost-modal.tsx`
- Create: `src/components/work-order/order-actions.tsx`
- Modify: `src/components/work-order/cost-table.tsx`
- Modify: `src/app/(app)/orcamentos/[id]/ordem/page.tsx`

**Interfaces:**
- Consumes: RPCs `close_work_order`/`reopen_work_order` (Task 5); `canEditCosts`, `canClose`, `canReopen` (Task 2); `parseDecimal` de `@/lib/format`; `Dialog`, `DialogContent`, `DialogClose` de `@/components/ui/dialog`; `SubmitButton`, `Button`, `Input`, `Label`.
- Produces: `addCost(quoteId, fd)`, `updateCost(fd)`, `deleteCost(fd)`, `closeOrder(quoteId, workOrderId)`, `reopenOrder(quoteId, workOrderId)`; `<AddCostModal quoteId workOrderId categories />`; `<OrderActions quoteId workOrder />`; `CostTable` passa a receber `{ costs, editable, quoteId }`.

- [ ] **Step 1: Server actions**

`src/app/(app)/orcamentos/[id]/ordem/actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { parseDecimal } from '@/lib/format'

async function adminClient() {
  const { supabase, profile } = await getProfile()
  if (profile.role === 'vendedor') throw new Error('Sem permissão')
  return supabase
}

/** Lançamento novo durante a produção: planejado zero = custo não previsto. */
export async function addCost(quoteId: string, fd: FormData): Promise<void> {
  const supabase = await adminClient()
  const workOrderId = String(fd.get('work_order_id') ?? '')
  const description = String(fd.get('description') ?? '').trim()
  if (!workOrderId || !description) throw new Error('Descrição obrigatória')

  const { data: wo } = await supabase
    .from('work_orders').select('company_id').eq('id', workOrderId).single()
  if (!wo) throw new Error('Ordem de serviço não encontrada')

  const source = String(fd.get('source') ?? 'manual')
  const categoryId = String(fd.get('price_category_id') ?? '')
  const { error } = await supabase.from('work_order_costs').insert({
    work_order_id: workOrderId,
    company_id: wo.company_id,
    source: source === 'terceiro' ? 'terceiro' : 'manual',
    description,
    item_label: '',
    price_category_id: categoryId || null,
    qty: parseDecimal(String(fd.get('qty') ?? '1')) || 1,
    unit_value: parseDecimal(String(fd.get('unit_value') ?? '0')),
    supplier: source === 'terceiro' ? String(fd.get('supplier') ?? '').trim() : '',
    note: String(fd.get('note') ?? '').trim(),
    sort_order: 9999,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}/ordem`)
  revalidatePath(`/orcamentos/${quoteId}`)
}

/** Só qty e unit_value: actual_value é coluna gerada, planned_value é congelado. */
export async function updateCost(fd: FormData): Promise<void> {
  const supabase = await adminClient()
  const id = String(fd.get('id') ?? '')
  const quoteId = String(fd.get('quote_id') ?? '')
  if (!id || !quoteId) throw new Error('Lançamento inválido')
  const { error } = await supabase.from('work_order_costs').update({
    qty: parseDecimal(String(fd.get('qty') ?? '1')),
    unit_value: parseDecimal(String(fd.get('unit_value') ?? '0')),
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}/ordem`)
  revalidatePath(`/orcamentos/${quoteId}`)
}

export async function deleteCost(fd: FormData): Promise<void> {
  const supabase = await adminClient()
  const id = String(fd.get('id') ?? '')
  const quoteId = String(fd.get('quote_id') ?? '')
  const { error } = await supabase.from('work_order_costs').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}/ordem`)
  revalidatePath(`/orcamentos/${quoteId}`)
}

export async function closeOrder(quoteId: string, workOrderId: string): Promise<void> {
  const supabase = await adminClient()
  const { error } = await supabase.rpc('close_work_order', { p_id: workOrderId })
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}/ordem`)
  revalidatePath(`/orcamentos/${quoteId}`)
}

export async function reopenOrder(quoteId: string, workOrderId: string): Promise<void> {
  const supabase = await adminClient()
  const { error } = await supabase.rpc('reopen_work_order', { p_id: workOrderId })
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}/ordem`)
  revalidatePath(`/orcamentos/${quoteId}`)
}
```

- [ ] **Step 2: Edição inline na tabela**

Em `src/components/work-order/cost-table.tsx`, adicionar a prop `editable` e `quoteId`, e trocar a célula "Real" por um formulário quando editável. A assinatura passa a ser:

```tsx
export function CostTable({ costs, editable, quoteId }: {
  costs: WorkOrderCost[]; editable: boolean; quoteId: string
})
```

O `<thead>` ganha as colunas `Qtd`, `Valor un.` e uma coluna vazia quando `editable`, e cada `<tr>` passa a renderizar:

```tsx
{editable ? (
  <>
    <td className="py-1 text-right">
      <form action={updateCost} className="flex items-center justify-end gap-1">
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="quote_id" value={quoteId} />
        <input name="qty" defaultValue={String(c.qty)} inputMode="decimal"
          className="w-16 rounded-md border px-2 py-1 text-right" aria-label="Quantidade" />
        <input name="unit_value" defaultValue={String(c.unit_value)} inputMode="decimal"
          className="w-28 rounded-md border px-2 py-1 text-right" aria-label="Valor unitário" />
        <SubmitButton size="sm" variant="outline">ok</SubmitButton>
      </form>
    </td>
    <td className="py-1 text-right font-semibold">{formatBRL(c.actual_value)}</td>
    <td className="py-1 text-right">
      {c.source !== 'orcamento' && (
        <form action={deleteCost}>
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="quote_id" value={quoteId} />
          <SubmitButton variant="link" className="h-auto px-0 text-red-600 underline">excluir</SubmitButton>
        </form>
      )}
    </td>
  </>
) : (
  <td className="py-1 text-right font-semibold">{formatBRL(c.actual_value)}</td>
)}
```

Imports novos no arquivo: `import { SubmitButton } from '@/components/ui/submit-button'` e `import { deleteCost, updateCost } from '@/app/(app)/orcamentos/[id]/ordem/actions'`.

Linha de `source = 'orcamento'` não pode ser excluída — ela é a base de comparação. Só edita valor.

- [ ] **Step 3: Modal de novo custo**

`src/components/work-order/add-cost-modal.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { addCost } from '@/app/(app)/orcamentos/[id]/ordem/actions'
import type { PriceCategory } from '@/lib/config-types'

export function AddCostModal({ quoteId, workOrderId, categories }: {
  quoteId: string; workOrderId: string; categories: PriceCategory[]
}) {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<'manual' | 'terceiro'>('manual')

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Adicionar custo</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Novo lançamento de custo">
          <form action={addCost.bind(null, quoteId)} onSubmit={() => setOpen(false)} className="space-y-3">
            <input type="hidden" name="work_order_id" value={workOrderId} />
            <input type="hidden" name="source" value={source} />

            <div className="flex gap-2">
              <Button type="button" size="sm"
                variant={source === 'manual' ? 'default' : 'outline'}
                onClick={() => setSource('manual')}>Custo interno</Button>
              <Button type="button" size="sm"
                variant={source === 'terceiro' ? 'default' : 'outline'}
                onClick={() => setSource('terceiro')}>Terceiro</Button>
            </div>

            <label className="block text-sm">Descrição
              <input name="description" required className="mt-1 w-full rounded-md border px-2 py-1" />
            </label>

            <label className="block text-sm">Categoria
              <select name="price_category_id" className="mt-1 w-full rounded-md border px-2 py-1">
                <option value="">— sem categoria —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>

            <div className="flex gap-2">
              <label className="block flex-1 text-sm">Quantidade
                <input name="qty" defaultValue="1" inputMode="decimal"
                  className="mt-1 w-full rounded-md border px-2 py-1" />
              </label>
              <label className="block flex-1 text-sm">Valor unitário
                <input name="unit_value" defaultValue="0" inputMode="decimal"
                  className="mt-1 w-full rounded-md border px-2 py-1" />
              </label>
            </div>

            {source === 'terceiro' && (
              <label className="block text-sm">Fornecedor
                <input name="supplier" className="mt-1 w-full rounded-md border px-2 py-1" />
              </label>
            )}

            <label className="block text-sm">Observação
              <input name="note" className="mt-1 w-full rounded-md border px-2 py-1" />
            </label>

            <div className="flex justify-end gap-2">
              <DialogClose render={<Button type="button" variant="outline">Cancelar</Button>} />
              <SubmitButton>Lançar</SubmitButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

Valor fixo é `quantidade = 1`; valor variável é quantidade × valor unitário.

- [ ] **Step 4: Concluir e reabrir**

`src/components/work-order/order-actions.tsx`:

```tsx
'use client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { canClose, canReopen } from '@/lib/work-order/status'
import { closeOrder, reopenOrder } from '@/app/(app)/orcamentos/[id]/ordem/actions'
import type { WorkOrder } from '@/lib/work-order/types'

export function OrderActions({ quoteId, workOrder }: { quoteId: string; workOrder: WorkOrder }) {
  const router = useRouter()

  async function conclude() {
    if (!confirm('Concluir a OS congela os lançamentos. Nenhum custo poderá ser editado ou adicionado depois. Continuar?')) return
    await closeOrder(quoteId, workOrder.id)
    router.refresh()
  }
  async function reopen() {
    await reopenOrder(quoteId, workOrder.id)
    router.refresh()
  }

  if (canClose(workOrder.status)) return <Button size="sm" onClick={conclude}>Concluir OS</Button>
  if (canReopen(workOrder.status)) return <Button size="sm" variant="outline" onClick={reopen}>Reabrir OS</Button>
  return null
}
```

- [ ] **Step 5: Ligar tudo na página**

Em `src/app/(app)/orcamentos/[id]/ordem/page.tsx`:

1. Imports novos:

```tsx
import { canEditCosts } from '@/lib/work-order/status'
import { AddCostModal } from '@/components/work-order/add-cost-modal'
import { OrderActions } from '@/components/work-order/order-actions'
```

2. Antes do `return`:

```tsx
const editable = canEditCosts(workOrder.status)
```

3. No cabeçalho, antes do `<Link>` de volta:

```tsx
<OrderActions quoteId={id} workOrder={workOrder} />
```

4. Acima do `<CostTable>`:

```tsx
<div className="flex items-center gap-3">
  <h2 className="text-lg font-bold">Lançamentos</h2>
  {editable && (
    <AddCostModal
      quoteId={id}
      workOrderId={workOrder.id}
      categories={(categories ?? []) as PriceCategory[]}
    />
  )}
</div>
```

5. Trocar a chamada da tabela por:

```tsx
<CostTable costs={costs} editable={editable} quoteId={id} />
```

- [ ] **Step 6: Rodar lint e testes**

Run: `npm run lint && npm test`
Expected: PASS

- [ ] **Step 7: Verificar o fluxo completo manualmente**

Com `npm run dev`, como admin, em `/orcamentos/<id>/ordem`:

1. Editar `qty`/`valor unitário` de uma linha vinda do orçamento → coluna "Real" e o resumo por natureza atualizam; "Planejado" não muda.
2. "Adicionar custo" → Terceiro, descrição "Galvanização", categoria Repasse, qty 120, valor 3,50, fornecedor "Zinco SA" → linha nova com `não previsto`, real R$ 420,00, e a linha Repasse do resumo sobe 420.
3. "Concluir OS" → confirma → campos de edição e o botão de adicionar somem; o status vira `Concluída`.
4. "Reabrir OS" → volta a editar.
5. Conferir que o bloco na página do orçamento mostra os mesmos números.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/orcamentos/[id]/ordem" src/components/work-order/
git commit -m "feat: lançamento de custo real e encerramento da OS"
```

---

### Task 13: Badge de variação no board e verificação de acesso

**Files:**
- Modify: `src/lib/work-order/queries.ts`
- Modify: `src/app/(app)/producao/page.tsx`
- Modify: `src/components/production/board.tsx`

**Interfaces:**
- Consumes: view `work_order_totals`; `BoardQuote.work_order_id` (Task 8).
- Produces: `fetchBoardVariances(supabase, workOrderIds): Promise<Record<string, number>>`; `Board` ganha a prop opcional `variances?: Record<string, number>`.

- [ ] **Step 1: Query das variações**

Acrescentar ao final de `src/lib/work-order/queries.ts`:

```ts
/** Variação por OS, para o badge do board. Só admin enxerga: a view herda as
 *  policies de work_order_costs e devolve zero para vendedor. */
export async function fetchBoardVariances(
  supabase: SupabaseClient, workOrderIds: string[],
): Promise<Record<string, number>> {
  if (workOrderIds.length === 0) return {}
  const { data, error } = await supabase
    .from('work_order_totals')
    .select('work_order_id, variance')
    .in('work_order_id', workOrderIds)
  if (error) throw new Error(error.message)
  const out: Record<string, number> = {}
  for (const row of data ?? []) out[row.work_order_id] = Number(row.variance)
  return out
}
```

- [ ] **Step 2: Buscar na página de produção**

Em `src/app/(app)/producao/page.tsx`, trocar `const { supabase } = await getProfile()` por `const { supabase, profile } = await getProfile()` (não chamar `getProfile()` uma segunda vez) e, depois de `const quotes = await fetchBoardQuotes(supabase)`, acrescentar:

```tsx
const variances = profile.role === 'vendedor'
  ? {}
  : await fetchBoardVariances(supabase, quotes.map(q => q.work_order_id))
```

Importar `fetchBoardVariances` de `@/lib/work-order/queries` e passar `variances={variances}` para `<Board />`.

- [ ] **Step 3: Badge no card**

Em `src/components/production/board.tsx`, adicionar `variances` às props:

```tsx
export function Board({ quotes, todayISO, pendenciesByQuote, variances = {} }: {
  quotes: BoardQuote[]; todayISO: string
  pendenciesByQuote: Record<string, Pendency[]>
  variances?: Record<string, number>
})
```

E, dentro do card, abaixo do valor já exibido:

```tsx
{variances[q.work_order_id] != null && variances[q.work_order_id] !== 0 && (
  <span className={variances[q.work_order_id] > 0 ? 'text-xs font-semibold text-red-600' : 'text-xs font-semibold text-green-700'}>
    {variances[q.work_order_id] > 0 ? '▲' : '▼'} {formatBRL(Math.abs(variances[q.work_order_id]))}
  </span>
)}
```

- [ ] **Step 4: Rodar lint e testes**

Run: `npm run lint && npm test`
Expected: PASS

- [ ] **Step 5: Verificação final de acesso**

Roteiro obrigatório, com um usuário de papel `vendedor`:

1. Login como vendedor, abrir `/producao` → vê os cards, **sem** badge de variação; arrastar um card funciona.
2. Abrir um orçamento aprovado → o bloco "Ordem de Serviço" **não** aparece.
3. Acessar `/orcamentos/<id>/ordem` na barra de endereço → redireciona para `/orcamentos/<id>`.
4. Confirmar pelo banco que a RLS bloqueia o vendedor, simulando a sessão dele no SQL Editor (trocar `<uuid do vendedor>` pelo `profiles.id` do usuário usado nos passos 1–3):

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid do vendedor>","role":"authenticated"}';
select count(*) as custos_visiveis from work_order_costs;
select count(*) as ordens_visiveis from work_orders;
update work_orders set status = 'concluida' where id = (select id from work_orders limit 1);
rollback;
```

Expected: `custos_visiveis = 0`, `ordens_visiveis > 0`, e o `update` afetando **0 linhas** (a policy `wo_write` exige `is_company_admin()`).

5. Login como admin, repetir `/producao` → badge de variação aparece nos cards com custo real diferente do planejado.

- [ ] **Step 6: Commit**

```bash
git add src/lib/work-order/queries.ts "src/app/(app)/producao/page.tsx" src/components/production/board.tsx
git commit -m "feat: variação da OS no quadro de produção"
```

---

## Verificação final

- [ ] `npm test` — toda a suíte passa
- [ ] `npm run lint` — sem warnings
- [ ] `npm run build` — compila
- [ ] Query de conformidade da Task 6, Step 3 — zero linhas
- [ ] Roteiro de acesso da Task 13, Step 5 — todos os pontos conferidos
