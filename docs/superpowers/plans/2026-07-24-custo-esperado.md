# Custo esperado no catálogo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastrar o custo esperado de cada preço do catálogo, quebrado por natureza, para que a Ordem de Serviço nasça com margem prevista em vez de margem zero.

**Architecture:** Tabela nova `price_costs` guarda até três componentes de custo (um por categoria) pendurados no preço base do produto ou numa opção. O clone da OS passa a gerar uma linha por componente (`planned_kind='custo'`), caindo no comportamento atual (`planned_kind='venda'`) quando não há custo cadastrado. A mesma decomposição existe em TypeScript testado e em SQL, como na entrega anterior.

**Tech Stack:** Next.js 16 (App Router, Server Components e Server Actions), React 19, Supabase (Postgres + RLS), TypeScript, vitest, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-07-24-custo-esperado-design.md`

## Global Constraints

- Textos de UI em **português do Brasil**; identificadores em inglês. Valores monetários sempre via `formatBRL` de `src/lib/format.ts`; entrada de números via `parseDecimal` do mesmo arquivo.
- Arredondamento monetário: `round2` de `src/lib/pricing/calc.ts` no TypeScript, `round(x, 2)` no SQL. Nunca `toFixed`.
- Migrations são arquivos em `supabase/migrations/`, numerados em sequência. **O implementador cria o arquivo e commita; o controlador aplica no banco** (não há CLI do Supabase no repositório).
- Toda tabela nova tem `company_id`, RLS habilitada e policies por `current_company_id()`. Funções SQL: `set search_path = public`, com `revoke execute ... from public, anon` + `grant execute ... to authenticated`.
- **Custo é dado de admin.** `price_costs` exige `is_company_admin()` para ler e escrever — diferente de `product_types`/`options`, que o vendedor lê. Nenhum valor de custo pode ser buscado ou renderizado para `vendedor`.
- Testes: vitest, `*.test.ts` ao lado do código, só lógica pura (`environment: 'node'`). Sem infraestrutura de teste de banco nem de componente — o que depende de Postgres é verificado por SQL pelo controlador.
- Rodar `npm test` e `npm run lint` antes de cada commit. Erros pré-existentes que **não** são seus: 4 `no-explicit-any` em `src/app/(app)/orcamentos/[id]/page.tsx`, 2 warnings em `src/app/layout.tsx`, e erros de `tsc` em `src/lib/pricing/snapshot.test.ts`.

---

### Task 1: Types e margem prevista

**Files:**
- Modify: `src/lib/work-order/types.ts`
- Modify: `src/lib/work-order/variance.ts`
- Test: `src/lib/work-order/variance.test.ts`

**Interfaces:**
- Consumes: `round2` de `@/lib/pricing/calc`.
- Produces: types `PlannedKind`, `CostComponent`, `PriceCost`; campo `planned_kind` em `WorkOrderCost`; campo `predicted_margin` em `WorkOrderTotals`; função `predictedMargin(quoteTotal, plannedTotal): number`.

- [ ] **Step 1: Acrescentar os types**

Em `src/lib/work-order/types.ts`, adicionar após `CostSource`:

```ts
/**
 * 'custo' = planejado veio de custo cadastrado; 'venda' = preço sem custo
 * cadastrado (fallback pela venda); 'estrutural' = linha sem preço cadastrável
 * (modelo, ajuste do item, arredondamento).
 */
export type PlannedKind = 'custo' | 'venda' | 'estrutural'

/** Um componente de custo esperado, na unidade da venda (R$ ou R$/m²). */
export interface CostComponent {
  priceCategoryId: string
  value: number
}

/** Linha de price_costs como vem do banco. */
export interface PriceCost {
  id: string
  product_type_id: string | null
  option_id: string | null
  price_category_id: string
  value: number
}
```

No mesmo arquivo, acrescentar `planned_kind: PlannedKind` a `WorkOrderCost` (logo após `planned_value`) e `predicted_margin: number` a `WorkOrderTotals` (logo após `margin`).

- [ ] **Step 2: Escrever o teste que falha**

Acrescentar ao final de `src/lib/work-order/variance.test.ts`:

```ts
describe('predictedMargin', () => {
  it('total do orçamento menos o custo esperado', () => {
    expect(predictedMargin(2934.90, 1190)).toBe(1744.90)
  })
  it('custo esperado acima do total dá margem prevista negativa', () => {
    expect(predictedMargin(1000, 1200)).toBe(-200)
  })
  it('sem custo cadastrado (planejado = venda) a margem prevista é zero', () => {
    expect(predictedMargin(2934.90, 2934.90)).toBe(0)
  })
})
```

E adicionar `predictedMargin` ao import existente de `./variance` no topo do arquivo.

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npm test -- src/lib/work-order/variance.test.ts`
Expected: FAIL — `predictedMargin is not a function`

- [ ] **Step 4: Implementar**

Em `src/lib/work-order/variance.ts`, após `margin`:

```ts
/**
 * Margem prevista: o que sobra se o custo real fechar no custo esperado.
 * Linha sem custo cadastrado entra no planejado pelo preço de venda e por isso
 * não contribui margem — o número é conservador de propósito.
 */
export function predictedMargin(quoteTotal: number, plannedTotal: number): number {
  return round2(quoteTotal - plannedTotal)
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npm test -- src/lib/work-order/variance.test.ts`
Expected: PASS — 11 testes no arquivo

- [ ] **Step 6: Commit**

```bash
git add src/lib/work-order/types.ts src/lib/work-order/variance.ts src/lib/work-order/variance.test.ts
git commit -m "feat: types de custo esperado e margem prevista"
```

---

### Task 2: Decomposição com componentes de custo

**Files:**
- Modify: `src/lib/work-order/decompose.ts`
- Test: `src/lib/work-order/decompose.test.ts`

**Interfaces:**
- Consumes: `round2`; `CostComponent`, `PlannedKind` de `./types`; `SelectedOption` de `@/lib/pricing/types`; `PricingMode` de `@/lib/pricing/types`.
- Produces: `PlannedLine` ganha `plannedKind: PlannedKind`; `DecomposeInput` ganha `pricingMode`, `baseCosts`, `optionCosts`, `categoryNames`; `decomposeItem` inalterada na assinatura.

Esta é a tarefa de maior risco. Duas mudanças estruturais: a linha planejada passa a poder ser custo, e o **resíduo do modelo deixa de ser calculado contra a soma das linhas** — passa a ser contra uma soma de venda acumulada em separado, porque linhas de custo não carregam o valor de venda.

- [ ] **Step 1: Escrever os testes que falham**

Substituir a função `input()` no topo de `src/lib/work-order/decompose.test.ts` por esta versão (que acrescenta os campos novos com defaults "sem custo"):

```ts
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
    pricingMode: 'fixo',
    baseCosts: [],
    optionCosts: {},
    categoryNames: { 'cat-custo': 'Custo', 'cat-insumo': 'Insumo', 'cat-repasse': 'Repasse' },
    ...over,
  }
}
```

Acrescentar ao final do arquivo um bloco novo:

```ts
describe('decomposeItem com custo esperado', () => {
  it('sem custo cadastrado mantém o comportamento antigo, marcado como venda', () => {
    const lines = decomposeItem(input(), 1)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      description: 'Preço base', plannedValue: 1200, plannedKind: 'venda',
    })
  })

  it('base com dois componentes vira duas linhas de custo, nomeadas pela natureza', () => {
    const lines = decomposeItem(input({
      unitBasePrice: 600, lineTotal: 600,
      baseCosts: [
        { priceCategoryId: 'cat-insumo', value: 40 },
        { priceCategoryId: 'cat-custo', value: 140 },
      ],
    }), 1)
    expect(lines.map(l => [l.description, l.priceCategoryId, l.plannedValue, l.plannedKind])).toEqual([
      ['Preço base — Insumo', 'cat-insumo', 40, 'custo'],
      ['Preço base — Custo', 'cat-custo', 140, 'custo'],
    ])
  })

  it('componente único não deixa sobra da venda na base', () => {
    const lines = decomposeItem(input({
      unitBasePrice: 600, lineTotal: 600,
      baseCosts: [{ priceCategoryId: 'cat-insumo', value: 200 }],
    }), 1)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ plannedValue: 200, plannedKind: 'custo' })
  })

  it('produto por m² escala o custo pela área', () => {
    const lines = decomposeItem(input({
      pricingMode: 'm2', areaM2: 6, unitBasePrice: 1200, lineTotal: 1200,
      baseCosts: [{ priceCategoryId: 'cat-insumo', value: 30 }],
    }), 1)
    // 30 R$/m² × 6 m² = 180
    expect(lines[0]).toMatchObject({ plannedValue: 180, plannedKind: 'custo' })
  })

  it('custo escala por qty e multiplier junto', () => {
    const lines = decomposeItem(input({
      qty: 3, unitBasePrice: 600, lineTotal: 1800,
      baseCosts: [{ priceCategoryId: 'cat-insumo', value: 50 }],
    }), 2)
    // 50 × 3 × 2 = 300
    expect(lines[0]).toMatchObject({ plannedValue: 300 })
  })

  it('opção com custo vira linha de custo; opção sem custo cai no fallback de venda', () => {
    const lines = decomposeItem(input({
      unitBasePrice: 600, lineTotal: 600 + 150 + 100,
      selectedOptions: [
        { optionId: 'o1', group: 'Ferragens', label: 'Fechadura', surchargeType: 'fixo', surchargeValue: 150 },
        { optionId: 'o2', group: 'Extra', label: 'Solda', surchargeType: 'fixo', surchargeValue: 100 },
      ],
      optionCategoryIds: { o1: 'cat-insumo', o2: 'cat-repasse' },
      optionCosts: { o1: [{ priceCategoryId: 'cat-insumo', value: 60 }] },
    }), 1)
    expect(lines.map(l => [l.description, l.plannedValue, l.plannedKind])).toEqual([
      ['Preço base', 600, 'venda'],
      ['Ferragens — Fechadura — Insumo', 60, 'custo'],
      ['Extra — Solda', 100, 'venda'],
    ])
  })

  it('opção por_m2 com custo escala o custo pela área', () => {
    const lines = decomposeItem(input({
      unitBasePrice: 600, areaM2: 6, lineTotal: 600 + 40 * 6,
      selectedOptions: [
        { optionId: 'o1', group: 'Acabamento', label: 'Pintura', surchargeType: 'por_m2', surchargeValue: 40 },
      ],
      optionCategoryIds: { o1: 'cat-repasse' },
      optionCosts: { o1: [{ priceCategoryId: 'cat-repasse', value: 12 }] },
    }), 1)
    // 12 R$/m² × 6 = 72
    expect(lines[1]).toMatchObject({ description: 'Acabamento — Pintura — Repasse', plannedValue: 72 })
  })

  it('resíduo do modelo é medido contra a VENDA, não contra as linhas de custo', () => {
    const lines = decomposeItem(input({
      unitBasePrice: 1200, lineTotal: 1500, modelName: 'Colonial',
      baseCosts: [{ priceCategoryId: 'cat-insumo', value: 300 }],
    }), 1)
    // venda distribuída = 1200; resíduo = 1500 − 1200 = 300 (o surcharge do modelo)
    expect(lines.map(l => [l.description, l.plannedValue, l.plannedKind])).toEqual([
      ['Preço base — Insumo', 300, 'custo'],
      ['Modelo Colonial', 300, 'estrutural'],
    ])
  })

  it('múltiplos componentes não inflam a soma de venda do resíduo', () => {
    const lines = decomposeItem(input({
      unitBasePrice: 1200, lineTotal: 1500, modelName: 'Colonial',
      baseCosts: [
        { priceCategoryId: 'cat-insumo', value: 100 },
        { priceCategoryId: 'cat-custo', value: 200 },
      ],
    }), 1)
    // a venda 1200 conta UMA vez, não uma por componente → resíduo continua 300
    expect(lines[lines.length - 1]).toMatchObject({ description: 'Modelo Colonial', plannedValue: 300 })
  })

  it('ajuste do item é estrutural e entra na soma do resíduo', () => {
    const lines = decomposeItem(input({
      unitBasePrice: 1200, extraValue: -200, lineTotal: 1000,
      baseCosts: [{ priceCategoryId: 'cat-insumo', value: 500 }],
    }), 1)
    expect(lines.map(l => [l.description, l.plannedValue, l.plannedKind])).toEqual([
      ['Preço base — Insumo', 500, 'custo'],
      ['Ajuste do item', -200, 'estrutural'],
    ])
  })

  it('componente de categoria desconhecida usa o id como rótulo em vez de sumir', () => {
    const lines = decomposeItem(input({
      unitBasePrice: 600, lineTotal: 600,
      baseCosts: [{ priceCategoryId: 'cat-fantasma', value: 10 }],
    }), 1)
    expect(lines[0].description).toBe('Preço base — Sem categoria')
    expect(lines[0].priceCategoryId).toBe('cat-fantasma')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- src/lib/work-order/decompose.test.ts`
Expected: FAIL — erros de tipo em `pricingMode`/`baseCosts` e `plannedKind` indefinido

- [ ] **Step 3: Implementar**

Substituir o conteúdo de `src/lib/work-order/decompose.ts` por:

```ts
import { round2 } from '@/lib/pricing/calc'
import type { PricingMode, SelectedOption } from '@/lib/pricing/types'
import type { CostComponent, PlannedKind } from './types'

export interface PlannedLine {
  description: string
  itemLabel: string
  quoteItemId: string | null
  priceCategoryId: string | null
  plannedValue: number
  plannedKind: PlannedKind
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
  /** modo de preço do produto: define se o custo da base é R$ ou R$/m² */
  pricingMode: PricingMode
  /** custo esperado do preço base; vazio = sem custo cadastrado */
  baseCosts: CostComponent[]
  /** custo esperado por opção, indexado por optionId */
  optionCosts: Record<string, CostComponent[]>
  /** nome de cada categoria, para compor a descrição da linha */
  categoryNames: Record<string, string>
}

const dim = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function itemLabel(
  input: Pick<DecomposeInput, 'productName' | 'widthM' | 'heightM'>,
): string {
  if (input.widthM == null || input.heightM == null) return input.productName
  return `${input.productName} ${dim.format(input.widthM)}×${dim.format(input.heightM)}`
}

/**
 * Quebra um item do orçamento nas linhas planejadas da OS.
 *
 * Preço com custo esperado cadastrado vira uma linha por componente
 * (`plannedKind='custo'`): o planejado é o custo, então a margem já nasce
 * prevista. Preço sem custo cai no comportamento antigo — planejado é a venda,
 * `plannedKind='venda'`, contribuição de margem zero.
 *
 * O resíduo do modelo é medido contra a soma da VENDA distribuída, acumulada
 * em separado: linhas de custo não carregam o valor de venda, e a venda de um
 * preço conta uma vez só, mesmo que ele gere vários componentes.
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
  // soma da venda distribuída — base do resíduo, independente do planejado
  let vendaSum = 0

  function push(
    description: string,
    priceCategoryId: string | null,
    plannedValue: number,
    plannedKind: PlannedKind,
  ): void {
    lines.push({
      description, itemLabel: label, quoteItemId: input.quoteItemId,
      priceCategoryId, plannedValue, plannedKind, sortOrder: sort++,
    })
  }

  function categoryLabel(id: string): string {
    return input.categoryNames[id] ?? 'Sem categoria'
  }

  /**
   * Emite as linhas de um preço: uma por componente de custo, ou uma de venda
   * quando não há custo cadastrado. `unitCostFactor` converte o valor cadastrado
   * na unidade da linha (área quando o preço é por m², 1 quando é fixo).
   */
  function pushPrice(
    baseDescription: string,
    vendaValue: number,
    vendaCategoryId: string | null,
    costs: CostComponent[],
    unitCostFactor: number,
  ): void {
    vendaSum = round2(vendaSum + vendaValue)
    if (costs.length === 0) {
      push(baseDescription, vendaCategoryId, vendaValue, 'venda')
      return
    }
    for (const c of costs) {
      push(
        `${baseDescription} — ${categoryLabel(c.priceCategoryId)}`,
        c.priceCategoryId,
        round2(c.value * unitCostFactor * input.qty * multiplier),
        'custo',
      )
    }
  }

  const porM2 = input.pricingMode === 'm2' || input.pricingMode === 'm2_direto'
  pushPrice(
    'Preço base',
    round2(input.unitBasePrice * input.qty * multiplier),
    input.productCategoryId,
    input.baseCosts,
    porM2 ? (input.areaM2 ?? 0) : 1,
  )

  for (const opt of input.selectedOptions) {
    const unit = opt.surchargeType === 'por_m2'
      ? opt.surchargeValue * (input.areaM2 ?? 0)
      : opt.surchargeValue
    const category = opt.optionId ? (input.optionCategoryIds[opt.optionId] ?? null) : null
    const costs = opt.optionId ? (input.optionCosts[opt.optionId] ?? []) : []
    pushPrice(
      `${opt.group} — ${opt.label}`,
      round2(unit * input.qty * multiplier),
      category,
      costs,
      opt.surchargeType === 'por_m2' ? (input.areaM2 ?? 0) : 1,
    )
  }

  if (input.extraValue !== 0) {
    const extra = round2(input.extraValue * multiplier)
    vendaSum = round2(vendaSum + extra)
    push('Ajuste do item', null, extra, 'estrutural')
  }

  // resíduo: surcharge do modelo (não persistido) + sobra de arredondamento
  const total = round2(input.lineTotal * multiplier)
  const residual = round2(total - vendaSum)
  if (residual !== 0) {
    push(
      input.modelName ? `Modelo ${input.modelName}` : 'Ajuste de arredondamento',
      null, residual, 'estrutural',
    )
  }

  return lines
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- src/lib/work-order/decompose.test.ts`
Expected: PASS — os 14 testes antigos continuam passando (todos com `baseCosts: []`, comportamento idêntico) mais os 11 novos

- [ ] **Step 5: Rodar a suíte inteira e o lint**

Run: `npm test && npm run lint`
Expected: PASS; lint só com os erros pré-existentes listados nas Global Constraints

- [ ] **Step 6: Commit**

```bash
git add src/lib/work-order/decompose.ts src/lib/work-order/decompose.test.ts
git commit -m "feat: decomposição gera linhas de custo esperado"
```

---

### Task 3: Margem prevista do orçamento (prévia)

**Files:**
- Create: `src/lib/work-order/preview-margin.ts`
- Test: `src/lib/work-order/preview-margin.test.ts`

**Interfaces:**
- Consumes: `decomposeItem`, `DecomposeInput` de `./decompose`; `round2`.
- Produces: `previewMargin(items: DecomposeInput[], quoteTotal: number, multiplier: number): { predictedMargin: number; plannedTotal: number; uncostedCount: number }`.

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/work-order/preview-margin.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { previewMargin } from './preview-margin'
import type { DecomposeInput } from './decompose'

function item(over: Partial<DecomposeInput> = {}): DecomposeInput {
  return {
    quoteItemId: 'qi1', productName: 'Serviço',
    widthM: null, heightM: null, areaM2: null,
    qty: 1, unitBasePrice: 600, lineTotal: 600, extraValue: 0,
    modelName: null, selectedOptions: [], productCategoryId: null,
    optionCategoryIds: {}, pricingMode: 'fixo',
    baseCosts: [], optionCosts: {},
    categoryNames: { 'cat-insumo': 'Insumo', 'cat-custo': 'Custo' },
    ...over,
  }
}

describe('previewMargin', () => {
  it('com custo cadastrado, margem prevista é venda menos custo', () => {
    const r = previewMargin([item({
      baseCosts: [{ priceCategoryId: 'cat-insumo', value: 180 }],
    })], 600, 1)
    expect(r).toEqual({ predictedMargin: 420, plannedTotal: 180, uncostedCount: 0 })
  })

  it('sem custo cadastrado, margem prevista é zero e conta o serviço', () => {
    const r = previewMargin([item()], 600, 1)
    expect(r).toEqual({ predictedMargin: 0, plannedTotal: 600, uncostedCount: 1 })
  })

  it('cadastro parcial: soma o que tem e conta só o que falta', () => {
    const r = previewMargin([
      item({ baseCosts: [{ priceCategoryId: 'cat-insumo', value: 180 }] }),
      item({ unitBasePrice: 400, lineTotal: 400 }),
    ], 1000, 1)
    expect(r.plannedTotal).toBe(580)
    expect(r.predictedMargin).toBe(420)
    expect(r.uncostedCount).toBe(1)
  })

  it('conta um serviço por preço sem custo, não uma vez por linha gerada', () => {
    const r = previewMargin([item({
      lineTotal: 600 + 100,
      selectedOptions: [
        { optionId: 'o1', group: 'Extra', label: 'Solda', surchargeType: 'fixo', surchargeValue: 100 },
      ],
      baseCosts: [{ priceCategoryId: 'cat-insumo', value: 180 }],
    })], 700, 1)
    // base tem custo, opção não → 1 sem custo
    expect(r.uncostedCount).toBe(1)
  })

  it('lista vazia devolve zeros', () => {
    expect(previewMargin([], 0, 1)).toEqual({ predictedMargin: 0, plannedTotal: 0, uncostedCount: 0 })
  })

  it('linha estrutural (modelo/ajuste) nunca conta como sem custo', () => {
    const r = previewMargin([item({
      lineTotal: 900, modelName: 'Colonial', extraValue: 100,
      baseCosts: [{ priceCategoryId: 'cat-insumo', value: 180 }],
    })], 900, 1)
    // base tem custo; ajuste (100) e resíduo do modelo (200) são estruturais
    expect(r.uncostedCount).toBe(0)
    expect(r.plannedTotal).toBe(480)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- src/lib/work-order/preview-margin.test.ts`
Expected: FAIL — `Failed to resolve import "./preview-margin"`

- [ ] **Step 3: Implementar**

`src/lib/work-order/preview-margin.ts`:

```ts
import { round2 } from '@/lib/pricing/calc'
import { decomposeItem, type DecomposeInput } from './decompose'

export interface MarginPreview {
  /** total do orçamento menos o custo esperado */
  predictedMargin: number
  /** soma do planejado (custo onde há cadastro, venda onde não há) */
  plannedTotal: number
  /** quantos preços entraram sem custo cadastrado */
  uncostedCount: number
}

/**
 * Margem prevista de um orçamento antes de aprovar, pela mesma decomposição que
 * a OS usará. Não grava nada. Linha sem custo cadastrado entra pela venda e não
 * contribui margem, então o número é conservador — daí o uncostedCount, que a
 * tela mostra junto para o número se ler como "pelo menos X".
 */
export function previewMargin(
  items: DecomposeInput[],
  quoteTotal: number,
  multiplier: number,
): MarginPreview {
  let plannedTotal = 0
  let uncostedCount = 0

  for (const item of items) {
    for (const line of decomposeItem(item, multiplier)) {
      plannedTotal = round2(plannedTotal + line.plannedValue)
      // linha estrutural (modelo, ajuste do item, arredondamento) não tem preço
      // cadastrável: não conta como pendência
      if (line.plannedKind === 'venda') {
        uncostedCount++
      }
    }
  }

  return { predictedMargin: round2(quoteTotal - plannedTotal), plannedTotal, uncostedCount }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- src/lib/work-order/preview-margin.test.ts`
Expected: PASS — 6 testes

- [ ] **Step 5: Commit**

```bash
git add src/lib/work-order/preview-margin.ts src/lib/work-order/preview-margin.test.ts
git commit -m "feat: margem prevista do orçamento antes de aprovar"
```

---

### Task 4: Schema do custo esperado (migration 0035)

**Files:**
- Create: `supabase/migrations/0035_price_costs.sql`

**Interfaces:**
- Consumes: `current_company_id()`, `is_company_admin()` (0017); `work_order_costs`, `work_order_totals` (0031).
- Produces: tabela `price_costs`; coluna `work_order_costs.planned_kind`; `work_order_totals.predicted_margin`; `woc_frozen_guard` cobrindo `planned_kind`.

**Não aplique no banco** — crie o arquivo e commite. O controlador aplica.

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/0035_price_costs.sql`:

```sql
-- Custo esperado por natureza, pendurado no preço de venda (produto ou opção).
-- Fecha a "Limitação conhecida" da OS: o planejado passa a ser custo, não venda,
-- então a margem nasce prevista em vez de zero.

create table price_costs (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id),
  product_type_id   uuid references product_types(id) on delete cascade,
  option_id         uuid references options(id) on delete cascade,
  price_category_id uuid not null references price_categories(id),
  -- na unidade da venda: R$/m² quando o preço é por m², R$ quando é fixo
  value             numeric(12,2) not null check (value >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- dono é exatamente um dos dois
  check ((product_type_id is null) <> (option_id is null)),
  unique (product_type_id, price_category_id),
  unique (option_id, price_category_id)
);
create index price_costs_company_idx on price_costs(company_id);
create index price_costs_product_idx on price_costs(product_type_id);
create index price_costs_option_idx  on price_costs(option_id);

alter table price_costs enable row level security;

-- Diferente de product_types/options (que o vendedor lê para montar orçamento):
-- custo é dado de admin, então nem leitura o vendedor tem.
create policy pcost_all on price_costs for all to authenticated
  using (company_id = current_company_id() and is_company_admin())
  with check (company_id = current_company_id() and is_company_admin());

-- 'custo' = planejado veio de custo cadastrado; 'venda' = preço sem custo
-- cadastrado (fallback pela venda); 'estrutural' = linha sem preço cadastrável
-- (modelo, ajuste do item, arredondamento) — nunca conta como pendência.
-- Default 'venda' deixa as linhas já existentes semanticamente corretas.
alter table work_order_costs add column planned_kind text not null default 'venda'
  check (planned_kind in ('custo','venda','estrutural'));

-- planned_kind entra no congelamento: é parte da foto da aprovação.
create or replace function public.woc_frozen_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.planned_value is distinct from old.planned_value then
    raise exception 'planned_value é congelado e não pode ser alterado';
  end if;
  if new.planned_kind is distinct from old.planned_kind then
    raise exception 'planned_kind é congelado e não pode ser alterado';
  end if;
  if new.work_order_id is distinct from old.work_order_id then
    raise exception 'Lançamento não pode mudar de ordem de serviço';
  end if;
  return new;
end;
$$;

-- Margem prevista: o que sobra se o real fechar no custo esperado.
create or replace view work_order_totals with (security_invoker = on) as
  select
    wo.id         as work_order_id,
    wo.company_id,
    wo.quote_total,
    coalesce(sum(c.planned_value), 0) as planned_total,
    coalesce(sum(c.actual_value), 0)  as actual_total,
    coalesce(sum(c.actual_value), 0) - coalesce(sum(c.planned_value), 0) as variance,
    wo.quote_total - coalesce(sum(c.actual_value), 0)  as margin,
    wo.quote_total - coalesce(sum(c.planned_value), 0) as predicted_margin
  from work_orders wo
  left join work_order_costs c on c.work_order_id = wo.id
  group by wo.id;
```

- [ ] **Step 2: Conferir o arquivo contra o spec**

Reler o arquivo e confirmar, item a item, contra a seção "Schema" de `docs/superpowers/specs/2026-07-24-custo-esperado-design.md`: os três índices, o `check` XOR, os dois `unique`, a policy admin-only, o default `'venda'`, o guard cobrindo `planned_kind` e a view com `predicted_margin`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0035_price_costs.sql
git commit -m "feat: schema do custo esperado no catálogo"
```

---

### Task 5: Clone com custo esperado (migration 0036)

**Files:**
- Create: `supabase/migrations/0036_clone_with_costs.sql`

**Interfaces:**
- Consumes: `price_costs`, `planned_kind` (0035); `work_order_clone_costs` (0032).
- Produces: `work_order_clone_costs` reescrita.

Esta função espelha `decomposeItem` da Task 2. Mesma ordem de linhas, mesmas descrições, mesma regra de resíduo. **Não aplique no banco.**

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/0036_clone_with_costs.sql`:

```sql
-- Clone da OS com custo esperado. Espelha decomposeItem() em TS:
-- preço com custo cadastrado vira uma linha por componente (planned_kind='custo');
-- sem cadastro, cai no comportamento antigo (planned_kind='venda'); linha
-- estrutural (ajuste do item, modelo/resíduo) usa planned_kind='estrutural' —
-- não há preço cadastrável nela, então nunca conta como pendência.
-- O resíduo do modelo é medido contra a soma da VENDA (v_sum_venda), acumulada
-- em separado — linhas de custo não carregam venda, e a venda de um preço conta
-- uma vez só mesmo gerando vários componentes.
create or replace function public.work_order_clone_costs(
  p_work_order_id uuid,
  p_quote_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company   uuid;
  v_mult      int;
  it          record;
  o           jsonb;
  cc          record;
  v_label     text;
  v_venda     numeric(12,2);
  v_sum_venda numeric(12,2);
  v_total     numeric(12,2);
  v_res       numeric(12,2);
  v_cat       uuid;
  v_opt_id    text;
  v_opt_uuid  uuid;
  v_sort      int := 0;
  v_raw       text;
  v_factor    numeric(12,4);
  v_has_cost  boolean;
begin
  select company_id, coalesce(multiplier, 1) into v_company, v_mult
    from quotes where id = p_quote_id;

  for it in
    select qi.*, pt.price_category_id as product_category_id,
           pt.id as pt_id, pt.pricing_mode
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
    v_sum_venda := 0;

    ----------------------------------------------------------------- preço base
    v_venda := round(it.unit_base_price * it.qty * v_mult, 2);
    v_sum_venda := v_sum_venda + v_venda;
    -- custo da base é R$/m² quando o produto vende por m²
    v_factor := case when it.pricing_mode in ('m2','m2_direto')
                     then coalesce(it.area_m2, 0) else 1 end;

    select exists (select 1 from price_costs where product_type_id = it.pt_id)
      into v_has_cost;

    if v_has_cost then
      for cc in
        select pc.value, pc.price_category_id, coalesce(cat.name, 'Sem categoria') as cat_name
          from price_costs pc
          left join price_categories cat on cat.id = pc.price_category_id
         where pc.product_type_id = it.pt_id
         order by cat.sort_order
      loop
        insert into work_order_costs (work_order_id, company_id, source, description,
          item_label, quote_item_id, price_category_id, qty, unit_value, planned_value,
          planned_kind, sort_order)
        values (p_work_order_id, v_company, 'orcamento', 'Preço base — ' || cc.cat_name,
          v_label, it.id, cc.price_category_id, 1,
          round(cc.value * v_factor * it.qty * v_mult, 2),
          round(cc.value * v_factor * it.qty * v_mult, 2), 'custo', v_sort);
        v_sort := v_sort + 1;
      end loop;
    else
      insert into work_order_costs (work_order_id, company_id, source, description,
        item_label, quote_item_id, price_category_id, qty, unit_value, planned_value,
        planned_kind, sort_order)
      values (p_work_order_id, v_company, 'orcamento', 'Preço base',
        v_label, it.id, it.product_category_id, 1, v_venda, v_venda, 'venda', v_sort);
      v_sort := v_sort + 1;
    end if;

    -------------------------------------------------------------------- opções
    for o in select value from jsonb_array_elements(it.selected_options)
    loop
      v_opt_id := o->>'optionId';
      v_opt_uuid := null;
      v_cat := null;
      if v_opt_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        v_opt_uuid := v_opt_id::uuid;
        select coalesce(op.price_category_id, g.price_category_id) into v_cat
          from options op
          join option_groups g on g.id = op.group_id
         where op.id = v_opt_uuid;
      end if;

      v_raw := o->>'surchargeValue';
      if v_raw is null or v_raw !~ '^-?[0-9]+(\.[0-9]+)?$' then
        v_raw := '0';
      end if;

      v_venda := round((case when o->>'surchargeType' = 'por_m2'
                             then v_raw::numeric * coalesce(it.area_m2, 0)
                             else v_raw::numeric end)
                       * it.qty * v_mult, 2);
      v_sum_venda := v_sum_venda + v_venda;
      v_factor := case when o->>'surchargeType' = 'por_m2'
                       then coalesce(it.area_m2, 0) else 1 end;

      v_has_cost := v_opt_uuid is not null
        and exists (select 1 from price_costs where option_id = v_opt_uuid);

      if v_has_cost then
        for cc in
          select pc.value, pc.price_category_id, coalesce(cat.name, 'Sem categoria') as cat_name
            from price_costs pc
            left join price_categories cat on cat.id = pc.price_category_id
           where pc.option_id = v_opt_uuid
           order by cat.sort_order
        loop
          insert into work_order_costs (work_order_id, company_id, source, description,
            item_label, quote_item_id, price_category_id, qty, unit_value, planned_value,
            planned_kind, sort_order)
          values (p_work_order_id, v_company, 'orcamento',
            coalesce(o->>'group', '') || ' — ' || coalesce(o->>'label', '') || ' — ' || cc.cat_name,
            v_label, it.id, cc.price_category_id, 1,
            round(cc.value * v_factor * it.qty * v_mult, 2),
            round(cc.value * v_factor * it.qty * v_mult, 2), 'custo', v_sort);
          v_sort := v_sort + 1;
        end loop;
      else
        insert into work_order_costs (work_order_id, company_id, source, description,
          item_label, quote_item_id, price_category_id, qty, unit_value, planned_value,
          planned_kind, sort_order)
        values (p_work_order_id, v_company, 'orcamento',
          coalesce(o->>'group', '') || ' — ' || coalesce(o->>'label', ''),
          v_label, it.id, v_cat, 1, v_venda, v_venda, 'venda', v_sort);
        v_sort := v_sort + 1;
      end if;
    end loop;

    ------------------------------------------------------------ ajuste da linha
    if coalesce(it.extra_value, 0) <> 0 then
      v_venda := round(it.extra_value * v_mult, 2);
      v_sum_venda := v_sum_venda + v_venda;
      insert into work_order_costs (work_order_id, company_id, source, description,
        item_label, quote_item_id, price_category_id, qty, unit_value, planned_value,
        planned_kind, sort_order)
      values (p_work_order_id, v_company, 'orcamento', 'Ajuste do item',
        v_label, it.id, null, 1, v_venda, v_venda, 'estrutural', v_sort);
      v_sort := v_sort + 1;
    end if;

    ------------------------------------- resíduo: modelo + sobra de arredondamento
    v_total := round(it.line_total * v_mult, 2);
    v_res := round(v_total - v_sum_venda, 2);
    if v_res <> 0 then
      insert into work_order_costs (work_order_id, company_id, source, description,
        item_label, quote_item_id, price_category_id, qty, unit_value, planned_value,
        planned_kind, sort_order)
      values (p_work_order_id, v_company, 'orcamento',
        case when nullif(it.model_name, '') is not null then 'Modelo ' || it.model_name
             else 'Ajuste de arredondamento' end,
        v_label, it.id, null, 1, v_res, v_res, 'estrutural', v_sort);
      v_sort := v_sort + 1;
    end if;
  end loop;
end;
$$;

revoke execute on function public.work_order_clone_costs(uuid, uuid) from public, anon, authenticated;
```

- [ ] **Step 2: Conferir a paridade com o TypeScript**

Abrir `src/lib/work-order/decompose.ts` lado a lado e conferir, item a item: ordem das linhas (base → opções → ajuste → resíduo); descrição com o nome da categoria; `v_sum_venda` somando a venda **uma vez por preço** (fora do laço de componentes); fator por m² na base vindo de `pricing_mode` e na opção de `surchargeType`; resíduo contra `v_sum_venda`. Anotar no relatório qualquer divergência encontrada.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0036_clone_with_costs.sql
git commit -m "feat: clone da OS usa o custo esperado do catálogo"
```

---

### Task 6: Leitura do custo e dos totais

**Files:**
- Modify: `src/lib/work-order/queries.ts`

**Interfaces:**
- Consumes: `PriceCost`, `WorkOrderTotals` de `./types`.
- Produces: `fetchPriceCosts(supabase): Promise<PriceCost[]>`; `fetchWorkOrderTotals` passando a devolver `predicted_margin`; `fetchWorkOrderCosts` devolvendo `planned_kind`.

- [ ] **Step 1: Acrescentar a busca dos custos**

Em `src/lib/work-order/queries.ts`, adicionar o import de `PriceCost` ao import de `./types` e acrescentar ao final do arquivo:

```ts
/**
 * Todos os custos esperados da empresa. A RLS de price_costs é admin-only, então
 * para vendedor isto volta vazio — mas quem chama já deve ter feito o gate.
 */
export async function fetchPriceCosts(supabase: SupabaseClient): Promise<PriceCost[]> {
  const { data, error } = await supabase
    .from('price_costs')
    .select('id, product_type_id, option_id, price_category_id, value')
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((c: any) => ({ ...c, value: Number(c.value) })) as PriceCost[]
}
```

- [ ] **Step 2: Incluir predicted_margin nos totais**

Na mesma `queries.ts`, em `fetchWorkOrderTotals`, trocar a lista de colunas e o retorno:

```ts
    .select('quote_total, planned_total, actual_total, variance, margin, predicted_margin')
```

e no objeto retornado, acrescentar após `margin`:

```ts
    predicted_margin: Number(data.predicted_margin),
```

- [ ] **Step 3: Rodar lint e testes**

Run: `npm run lint && npm test`
Expected: PASS; `fetchWorkOrderCosts` usa `select('*')`, então `planned_kind` já vem sem mudança

- [ ] **Step 4: Commit**

```bash
git add src/lib/work-order/queries.ts
git commit -m "feat: leitura do custo esperado e da margem prevista"
```

---

### Task 7: Cadastro do custo no produto

**Files:**
- Create: `src/components/admin/cost-fields.tsx`
- Modify: `src/app/(app)/admin/produtos/product-form.tsx`
- Modify: `src/app/(app)/admin/produtos/actions.ts`
- Modify: `src/app/(app)/admin/produtos/page.tsx`

**Interfaces:**
- Consumes: `PriceCategory` de `@/lib/config-types`; `PriceCost` de `@/lib/work-order/types`; `parseDecimal`.
- Produces: `<CostFields categories costs unit idPrefix />` — bloco de inputs reutilizado pela opção na Task 8, com `name={`cost_${categoryId}`}`; server action `savePriceCosts(fd: FormData)`.

- [ ] **Step 1: Componente compartilhado dos campos**

`src/components/admin/cost-fields.tsx`:

```tsx
'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PriceCategory } from '@/lib/config-types'
import type { PriceCost } from '@/lib/work-order/types'

/**
 * Um input por categoria. O name é `cost_<categoryId>`, lido pela action que
 * grava price_costs. Vazio = componente ausente (a action apaga a linha).
 */
export function CostFields({ categories, costs, unit, idPrefix }: {
  categories: PriceCategory[]
  costs: PriceCost[]
  /** 'R$' ou 'R$/m²', espelhando a unidade da venda */
  unit: string
  idPrefix: string
}) {
  const byCategory = new Map(costs.map(c => [c.price_category_id, c.value]))
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-sm font-medium">Custo esperado ({unit})</p>
      <p className="text-xs text-muted-foreground">
        Quanto este preço custa para você. Em branco = sem custo cadastrado; a OS usa o
        preço de venda e a margem prevista dele fica zero.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {categories.map(cat => (
          <div key={cat.id} className="space-y-1">
            <Label htmlFor={`${idPrefix}-cost-${cat.id}`} className="text-xs">{cat.name}</Label>
            <Input
              id={`${idPrefix}-cost-${cat.id}`}
              name={`cost_${cat.id}`}
              inputMode="decimal"
              defaultValue={byCategory.get(cat.id) ?? ''}
              placeholder="—"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Action que grava os componentes**

Acrescentar ao final de `src/app/(app)/admin/produtos/actions.ts`:

```ts
/**
 * Grava os componentes de custo de um preço. Input vazio apaga o componente;
 * valor presente faz upsert. Valida tudo antes de escrever, para uma falha de
 * validação não deixar o lote pela metade. Admin-only pela RLS de price_costs.
 */
export async function savePriceCosts(fd: FormData): Promise<void> {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const productId = String(fd.get('product_type_id') ?? '')
  const optionId = String(fd.get('option_id') ?? '')
  if (!productId && !optionId) throw new Error('Preço não informado')
  if (productId && optionId) throw new Error('Informe produto ou opção, não os dois')

  // O id do dono vem do cliente: confirma que pertence à empresa antes de
  // escrever — sem isso, um UUID forjado de outra empresa contaminaria o
  // clone da OS dela (a busca do clone é por dono, não por empresa).
  const ownerTable = productId ? 'product_types' : 'options'
  const ownerId = productId || optionId
  const { data: owner } = await supabase
    .from(ownerTable).select('id')
    .eq('id', ownerId).eq('company_id', company.id)
    .maybeSingle()
  if (!owner) throw new Error('Preço não encontrado nesta empresa')

  const owner_cols = productId
    ? { product_type_id: productId, option_id: null }
    : { product_type_id: null, option_id: optionId }

  // valida tudo antes da primeira escrita
  const deletes: string[] = []
  const upserts: { categoryId: string; value: number }[] = []
  for (const [key, raw] of fd.entries()) {
    if (!key.startsWith('cost_')) continue
    const categoryId = key.slice('cost_'.length)
    const text = String(raw).trim()
    if (!text) {
      deletes.push(categoryId)
      continue
    }
    const value = parseDecimal(text)
    if (value < 0) throw new Error('Custo não pode ser negativo')
    upserts.push({ categoryId, value })
  }

  for (const categoryId of deletes) {
    let del = supabase.from('price_costs').delete().eq('price_category_id', categoryId)
    del = productId ? del.eq('product_type_id', productId) : del.eq('option_id', optionId)
    const { error } = await del
    if (error) throw new Error(error.message)
  }
  for (const { categoryId, value } of upserts) {
    const { error } = await supabase.from('price_costs').upsert(
      { ...owner_cols, price_category_id: categoryId, value, company_id: company.id,
        updated_at: new Date().toISOString() },
      { onConflict: productId ? 'product_type_id,price_category_id' : 'option_id,price_category_id' },
    )
    if (error) throw new Error(error.message)
  }

  revalidatePath('/admin/produtos')
  if (optionId) revalidatePath(`/admin/produtos/${String(fd.get('product_id') ?? '')}`)
}
```

- [ ] **Step 3: Bloco no formulário do produto**

Em `src/app/(app)/admin/produtos/product-form.tsx`:

1. Acrescentar aos imports:

```tsx
import { CostFields } from '@/components/admin/cost-fields'
import type { PriceCost } from '@/lib/work-order/types'
```

2. Acrescentar `costs` às props do componente:

```tsx
  costs = [],
```

e ao tipo das props:

```tsx
  costs?: PriceCost[]
```

3. O custo é um **form irmão**, não um campo do form do produto (form aninhado é HTML inválido, e `saveProduct` grava a linha inteira — misturar apagaria campos). Envolver o `<form>` existente do produto num `<div className="space-y-3">` e acrescentar, logo **após** o `</form>` do produto, dentro desse div:

```tsx
      {mode !== 'manual' && product && (
        <form action={savePriceCosts} className="space-y-2">
          <input type="hidden" name="product_type_id" value={product.id} />
          <CostFields
            categories={categories}
            costs={costs}
            unit={mode === 'fixo' ? 'R$' : 'R$/m²'}
            idPrefix={`p-${product.id}`}
          />
          <SubmitButton size="sm" variant="outline">Salvar custo esperado</SubmitButton>
        </form>
      )}
```

Importar `savePriceCosts` de `./actions`. O bloco só aparece com `product` existente porque `price_costs` precisa do id do dono — produto novo cadastra o custo na segunda edição. `manual` não mostra o bloco (não tem preço cadastrado). `saveProduct` não muda: nenhum campo `cost_*` passa por ele.

- [ ] **Step 4: Passar os custos pela página**

Em `src/app/(app)/admin/produtos/page.tsx`, acrescentar `fetchPriceCosts` ao `Promise.all` existente que já busca produtos e categorias:

```tsx
import { fetchPriceCosts } from '@/lib/work-order/queries'
```

e, ao renderizar cada `<ProductForm>`, passar os custos daquele produto:

```tsx
costs={priceCosts.filter(c => c.product_type_id === p.id)}
```

- [ ] **Step 5: Rodar lint e testes**

Run: `npm run lint && npm test`
Expected: PASS; nenhum erro novo além dos pré-existentes

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/cost-fields.tsx "src/app/(app)/admin/produtos/product-form.tsx" "src/app/(app)/admin/produtos/actions.ts" "src/app/(app)/admin/produtos/page.tsx"
git commit -m "feat: cadastro do custo esperado no produto"
```

---

### Task 8: Cadastro do custo na opção

**Files:**
- Modify: `src/app/(app)/admin/produtos/[id]/option-row.tsx`
- Modify: `src/app/(app)/admin/produtos/[id]/group-card.tsx`
- Modify: `src/app/(app)/admin/produtos/[id]/group-editor.tsx`
- Modify: `src/app/(app)/admin/produtos/[id]/page.tsx`

**Interfaces:**
- Consumes: `<CostFields>` da Task 7; `savePriceCosts` de `src/app/(app)/admin/produtos/actions.ts`; `PriceCost`.
- Produces: `OptionRowItem` ganha a prop `costs: PriceCost[]`; a cadeia `page → group-editor → group-card → option-row` repassa `priceCosts`.

- [ ] **Step 1: Sub-bloco expansível na linha da opção**

Em `src/app/(app)/admin/produtos/[id]/option-row.tsx`:

1. Acrescentar aos imports:

```tsx
import { CostFields } from '@/components/admin/cost-fields'
import { savePriceCosts } from '@/app/(app)/admin/produtos/actions'
import { SubmitButton } from '@/components/ui/submit-button'
import type { PriceCost } from '@/lib/work-order/types'
```

2. Acrescentar `costs: PriceCost[]` às props do `OptionRowItem` e desestruturar `costs`.

3. Renderizar, logo abaixo da linha de campos da opção (dentro do container da linha, após o bloco existente dos inputs):

```tsx
      <details className="mt-1 w-full">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Custo esperado{costs.length > 0 ? ` (${costs.length})` : ''}
        </summary>
        <form action={savePriceCosts} className="mt-2 space-y-2">
          <input type="hidden" name="option_id" value={option.id} />
          <input type="hidden" name="product_id" value={productId} />
          <CostFields
            categories={categories}
            costs={costs}
            unit={type === 'por_m2' ? 'R$/m²' : 'R$'}
            idPrefix={`o-${option.id}`}
          />
          <SubmitButton size="sm" variant="outline">Salvar custo esperado</SubmitButton>
        </form>
      </details>
```

O `<details>` mantém a linha compacta — ela já carrega rótulo, tipo, valor e categoria. O campo `product_id` serve ao `revalidatePath` da action.

- [ ] **Step 2: Repassar a prop pela cadeia**

Em `group-card.tsx`: acrescentar `priceCosts: PriceCost[]` às props e, ao renderizar cada `<OptionRowItem>`, passar:

```tsx
costs={priceCosts.filter(c => c.option_id === o.id)}
```

Em `group-editor.tsx`: acrescentar `priceCosts: PriceCost[]` às props e repassar `priceCosts={priceCosts}` a cada `<GroupCard>`.

Em `src/app/(app)/admin/produtos/[id]/page.tsx`: importar `fetchPriceCosts` de `@/lib/work-order/queries`, acrescentá-la ao `Promise.all` existente e passar `priceCosts={priceCosts}` ao `<GroupEditor>`.

Em todos os três, importar `PriceCost` de `@/lib/work-order/types`.

- [ ] **Step 3: Rodar lint e testes**

Run: `npm run lint && npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/admin/produtos/[id]/"
git commit -m "feat: cadastro do custo esperado na opção"
```

---

### Task 9: Margem prevista na tela da OS

**Files:**
- Modify: `src/app/(app)/orcamentos/[id]/ordem/page.tsx`
- Modify: `src/components/work-order/cost-table.tsx`
- Modify: `src/components/work-order/order-summary.tsx`

**Interfaces:**
- Consumes: `WorkOrderTotals.predicted_margin`; `WorkOrderCost.planned_kind`; `formatBRL`.
- Produces: nenhuma nova.

- [ ] **Step 1: Margem prevista no cabeçalho da OS**

Em `src/app/(app)/orcamentos/[id]/ordem/page.tsx`, na `<section>` dos totais, trocar a grade de quatro para cinco colunas (`sm:grid-cols-5`) e acrescentar, entre "Planejado" e "Custo real":

```tsx
        <div>
          <span className="text-muted-foreground">Margem prevista</span>
          <p className={`font-bold ${totals.predicted_margin < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {formatBRL(totals.predicted_margin)}
          </p>
        </div>
```

e trocar o rótulo de "Planejado" para "Custo esperado", que é o que ele passa a significar.

- [ ] **Step 2: Badge de linha sem custo cadastrado**

Em `src/components/work-order/cost-table.tsx`, na célula de descrição, trocar a condição do badge atual (`c.planned_value === 0`) por duas marcas distintas:

```tsx
                      {c.planned_kind === 'venda' && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          sem custo cadastrado
                        </span>
                      )}
                      {c.planned_value === 0 && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          não previsto
                        </span>
                      )}
```

"não previsto" continua marcando o custo lançado durante a produção (planejado zero); "sem custo cadastrado" marca a linha que caiu no fallback.

- [ ] **Step 3: Margem prevista no bloco do orçamento**

Em `src/components/work-order/order-summary.tsx`, trocar a grade de três para quatro colunas (`grid-cols-4`) e acrescentar, antes de "Margem":

```tsx
        <div>
          <span className="text-muted-foreground">Margem prevista</span>
          <p className={`font-bold ${totals.predicted_margin < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {formatBRL(totals.predicted_margin)}
          </p>
        </div>
```

e trocar o rótulo "Planejado" por "Custo esperado".

- [ ] **Step 4: Rodar lint e testes**

Run: `npm run lint && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/orcamentos/[id]/ordem/page.tsx" src/components/work-order/cost-table.tsx src/components/work-order/order-summary.tsx
git commit -m "feat: margem prevista na tela da OS"
```

---

### Task 10: Prévia de margem no orçamento

**Files:**
- Create: `src/components/work-order/margin-preview.tsx`
- Create: `src/lib/work-order/quote-preview.ts`
- Modify: `src/app/(app)/orcamentos/[id]/page.tsx`

**Interfaces:**
- Consumes: `previewMargin`, `MarginPreview` de `@/lib/work-order/preview-margin`; `fetchPriceCosts`; `DecomposeInput`.
- Produces: `buildPreviewInputs(quoteItems, products, priceCosts, categories): DecomposeInput[]`; `<MarginPreview preview quoteTotal />`.

- [ ] **Step 1: Montar as entradas da prévia a partir do orçamento salvo**

`src/lib/work-order/quote-preview.ts`:

```ts
import type { PriceCategory, ProductConfig } from '@/lib/config-types'
import { categoriaEfetiva } from '@/lib/pricing/price-category'
import type { DecomposeInput } from './decompose'
import type { CostComponent, PriceCost } from './types'

/** Linha de quote_items usada na prévia (só os campos que a decomposição lê). */
export interface QuoteItemRow {
  id: string
  product_type_id: string | null
  product_name: string
  model_name: string | null
  width_m: number | null
  height_m: number | null
  area_m2: number | null
  qty: number
  unit_base_price: number
  line_total: number
  extra_value: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selected_options: any[]
}

function componentsOf(costs: PriceCost[]): CostComponent[] {
  return costs.map(c => ({ priceCategoryId: c.price_category_id, value: c.value }))
}

/**
 * Traduz o orçamento salvo para as entradas da decomposição, resolvendo
 * categoria efetiva das opções e anexando o custo esperado do catálogo.
 */
export function buildPreviewInputs(
  items: QuoteItemRow[],
  products: ProductConfig[],
  priceCosts: PriceCost[],
  categories: PriceCategory[],
): DecomposeInput[] {
  const categoryNames = Object.fromEntries(categories.map(c => [c.id, c.name]))
  const productById = new Map(products.map(p => [p.id, p]))

  return items.map(it => {
    const product = it.product_type_id ? productById.get(it.product_type_id) : undefined
    const optionCategoryIds: Record<string, string | null> = {}
    const optionCosts: Record<string, CostComponent[]> = {}

    for (const group of product?.option_groups ?? []) {
      for (const opt of group.options ?? []) {
        optionCategoryIds[opt.id] = categoriaEfetiva(opt.price_category_id, group.price_category_id)
        const costs = priceCosts.filter(c => c.option_id === opt.id)
        if (costs.length > 0) optionCosts[opt.id] = componentsOf(costs)
      }
    }

    return {
      quoteItemId: it.id,
      productName: it.product_name,
      widthM: it.width_m, heightM: it.height_m, areaM2: it.area_m2,
      qty: it.qty,
      unitBasePrice: Number(it.unit_base_price),
      lineTotal: Number(it.line_total),
      extraValue: Number(it.extra_value ?? 0),
      modelName: it.model_name,
      selectedOptions: it.selected_options ?? [],
      productCategoryId: product?.price_category_id ?? null,
      optionCategoryIds,
      pricingMode: product?.pricing_mode ?? 'fixo',
      baseCosts: it.product_type_id
        ? componentsOf(priceCosts.filter(c => c.product_type_id === it.product_type_id))
        : [],
      optionCosts,
      categoryNames,
    }
  })
}
```

- [ ] **Step 2: Componente da prévia**

`src/components/work-order/margin-preview.tsx`:

```tsx
import { formatBRL } from '@/lib/format'
import type { MarginPreview as Preview } from '@/lib/work-order/preview-margin'

export function MarginPreview({ preview, quoteTotal }: {
  preview: Preview
  quoteTotal: number
}) {
  return (
    <section className="space-y-2 rounded-xl border p-4">
      <h2 className="text-lg font-bold">Margem prevista</h2>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <span className="text-muted-foreground">Venda</span>
          <p className="font-bold">{formatBRL(quoteTotal)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Custo esperado</span>
          <p className="font-bold">{formatBRL(preview.plannedTotal)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Sobra prevista</span>
          <p className={`font-bold ${preview.predictedMargin < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {formatBRL(preview.predictedMargin)}
          </p>
        </div>
      </div>
      {preview.uncostedCount > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {preview.uncostedCount} {preview.uncostedCount === 1 ? 'preço sem' : 'preços sem'} custo
          cadastrado — a sobra real é maior que a mostrada aqui.
        </p>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Renderizar no orçamento não-aprovado, só para admin**

Em `src/app/(app)/orcamentos/[id]/page.tsx`:

1. Acrescentar aos imports:

```tsx
import { fetchPriceCosts } from '@/lib/work-order/queries'
import { buildPreviewInputs } from '@/lib/work-order/quote-preview'
import { previewMargin } from '@/lib/work-order/preview-margin'
import { MarginPreview } from '@/components/work-order/margin-preview'
```

2. Após o bloco que já busca `workOrder`/`woTotals` (que usa `isAdmin`), acrescentar:

```tsx
  // Prévia só faz sentido antes de aprovar: depois, o número real é o da OS.
  const showPreview = isAdmin && quote.status !== 'aprovado'
  const priceCosts = showPreview ? await fetchPriceCosts(supabase) : []
  const preview = showPreview
    ? previewMargin(
        buildPreviewInputs(quote.quote_items, products, priceCosts, categories),
        Number(quote.total),
        quote.multiplier ?? 1,
      )
    : null
```

`products` é a lista já carregada por `fetchProductConfigs` na página; `categories` é a lista de `price_categories` — se a página ainda não a carregar, acrescentá-la ao `Promise.all` existente:

```tsx
supabase.from('price_categories').select('id, slug, name, sort_order').order('sort_order'),
```

3. No JSX, logo acima do bloco `{workOrder && woTotals && (...)}`:

```tsx
{preview && <MarginPreview preview={preview} quoteTotal={Number(quote.total)} />}
```

- [ ] **Step 4: Rodar lint, testes e build**

Run: `npm run lint && npm test && npm run build`
Expected: PASS; build compila todas as rotas

- [ ] **Step 5: Commit**

```bash
git add src/lib/work-order/quote-preview.ts src/components/work-order/margin-preview.tsx "src/app/(app)/orcamentos/[id]/page.tsx"
git commit -m "feat: prévia de margem no orçamento antes de aprovar"
```

---

## Verificação final

- [ ] `npm test` — toda a suíte passa
- [ ] `npm run lint` — só os erros pré-existentes das Global Constraints
- [ ] `npm run build` — compila
- [ ] Migrations 0035 e 0036 aplicadas pelo controlador
- [ ] Conformidade SQL×TS verificada com um orçamento de fixture cobrindo: preço com custo cheio, preço com custo parcial, preço sem custo, produto por m², opção `por_m2` com custo, item com modelo (resíduo) e `extra_value` — comparando o resultado da RPC contra `decomposeItem`
- [ ] Verificação de acesso: com um usuário `vendedor`, confirmar que `select * from price_costs` volta vazio e que o bloco de prévia não aparece na página do orçamento
- [ ] Verificação de comportamento: cadastrar custo num serviço da Garagem do Maninho, aprovar um orçamento novo e confirmar que a OS nasce com Margem prevista > 0 e Real = custo esperado
