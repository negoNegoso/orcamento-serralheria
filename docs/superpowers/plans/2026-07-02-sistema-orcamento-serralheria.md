# Sistema de Orçamentos — Serralheria: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web app mobile-first de orçamentos para serralheria: admin configura produtos/preços/opções/modelos/pagamento; vendedor monta orçamento com cálculo automático na obra; cliente recebe link público com apresentação, WhatsApp e PDF.

**Architecture:** Next.js App Router (src dir, server components + server actions) com Supabase (Postgres+RLS, Auth e-mail/senha, Storage para fotos). Motor de cálculo é biblioteca TypeScript pura testada com Vitest; servidor recalcula e congela snapshot de preços em cada save. Página pública por token usa service role no servidor — nenhuma tabela exposta a anônimo.

**Tech Stack:** Next.js (App Router, TS), Tailwind CSS, shadcn/ui, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Vitest, Vercel.

**Spec:** `docs/superpowers/specs/2026-07-02-sistema-orcamento-serralheria-design.md`

## Global Constraints

- UI inteira em **pt-BR**, mobile-first (funciona bem em ~380px de largura)
- Dinheiro: R$ com **2 casas decimais, arredondamento meio-para-cima por linha** (`round2`)
- Orçamento salvo = **snapshot congelado** (nomes + valores copiados em `quote_items`); mudar tabela de preços NÃO altera orçamento existente; **editar e salvar de novo recalcula com preços atuais** (comportamento documentado)
- Papéis: `admin` | `vendedor`; só admin escreve em tabelas de configuração (RLS `is_admin()`)
- Anônimo **nunca** lê tabelas diretamente; página pública só via token com service role no servidor
- Import alias `@/*` → `src/*`; testes colocalizados `src/**/*.test.ts`, ambiente node
- Status de orçamento: `rascunho` | `enviado` | `aprovado` | `recusado`
- Modos de preço: `m2` | `fixo` | `manual` (vendedor digita o valor — produto orçado pela responsável; medidas opcionais informativas); adicionais de opção: `fixo` | `por_m2`; adicional `por_m2` só multiplica área quando ela existe (produto fixo, ou manual sem medidas → contribui R$ 0)
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (nunca exposta ao cliente)
- Classe CSS `no-print` esconde elementos na impressão (PDF = impressão do navegador)

---

### Task 1: Scaffold do projeto

**Files:**
- Create: projeto Next.js na raiz (`package.json`, `src/app/*`, etc. — gerados)
- Create: `vitest.config.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: —
- Produces: projeto Next.js com TS, Tailwind, shadcn/ui (componentes `button`, `input`, `label`, `card`, `badge`, `textarea`), Vitest rodando com alias `@/*`

- [ ] **Step 1: Scaffold Next.js**

```bash
cd /Users/yvillanova/Downloads/orcamento
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
```

Se recusar por pasta não vazia: `mv docs /tmp/orcamento-docs && npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes && mv /tmp/orcamento-docs docs`

- [ ] **Step 2: shadcn/ui**

```bash
npx shadcn@latest init -y -b neutral
npx shadcn@latest add button input label card badge textarea -y
```

- [ ] **Step 3: Vitest**

```bash
npm i -D vitest
```

Criar `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
```

Em `package.json`, adicionar em `scripts`: `"test": "vitest run"`.

- [ ] **Step 4: Verificar**

Run: `npm run test` → Expected: "No test files found" (exit 0 com `--passWithNoTests`? Não — adicionar flag: script `"test": "vitest run --passWithNoTests"`). `npm run build` → Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js + Tailwind + shadcn/ui + Vitest"
```

---

### Task 2: Motor de cálculo (`calcItem`, `calcQuoteTotal`)

**Files:**
- Create: `src/lib/pricing/types.ts`
- Create: `src/lib/pricing/calc.ts`
- Test: `src/lib/pricing/calc.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `types.ts`: `PricingMode = 'm2'|'fixo'|'manual'`, `SurchargeType = 'fixo'|'por_m2'`, `SelectedOption { optionId?: string; group: string; label: string; surchargeType: SurchargeType; surchargeValue: number }`, `ItemInput { pricingMode: PricingMode; pricePerM2?: number|null; basePrice?: number|null; manualPrice?: number|null; widthM?: number|null; heightM?: number|null; qty: number; options: SelectedOption[]; modelSurcharge?: number }`, `ItemTotals { areaM2: number|null; unitBasePrice: number; unitTotal: number; lineTotal: number }`
  - `calc.ts`: `class PricingError extends Error`, `round2(v: number): number`, `calcItem(input: ItemInput): ItemTotals`, `calcQuoteTotal(lineTotals: number[], discount?: number): { subtotal: number; total: number }`

- [ ] **Step 1: Escrever `types.ts`**

```ts
export type PricingMode = 'm2' | 'fixo' | 'manual'
export type SurchargeType = 'fixo' | 'por_m2'

export interface SelectedOption {
  optionId?: string
  group: string
  label: string
  surchargeType: SurchargeType
  surchargeValue: number
}

export interface ItemInput {
  pricingMode: PricingMode
  pricePerM2?: number | null
  basePrice?: number | null
  /** modo manual: valor combinado, digitado pelo vendedor (produto orçado pela responsável) */
  manualPrice?: number | null
  widthM?: number | null
  heightM?: number | null
  qty: number
  options: SelectedOption[]
  modelSurcharge?: number
}

export interface ItemTotals {
  areaM2: number | null
  unitBasePrice: number
  unitTotal: number
  lineTotal: number
}
```

- [ ] **Step 2: Escrever testes que falham (`calc.test.ts`)**

```ts
import { describe, expect, it } from 'vitest'
import { PricingError, calcItem, calcQuoteTotal, round2 } from './calc'
import type { ItemInput } from './types'

const m2Item = (over: Partial<ItemInput> = {}): ItemInput => ({
  pricingMode: 'm2', pricePerM2: 100, widthM: 2, heightM: 1.5,
  qty: 1, options: [], ...over,
})

describe('round2', () => {
  it('arredonda meio para cima', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.344)).toBe(2.34)
    expect(round2(2.345)).toBe(2.35)
  })
  it('fronteiras .xx5 em magnitudes reais de dinheiro (regressão float)', () => {
    expect(round2(4.015)).toBe(4.02)
    expect(round2(8.075)).toBe(8.08)
    expect(round2(35.035)).toBe(35.04)
    expect(round2(67.335)).toBe(67.34)
    expect(round2(2730)).toBe(2730)
  })
})

describe('calcItem por m²', () => {
  it('base = área × preço/m²', () => {
    const r = calcItem(m2Item()) // 3 m² × 100
    expect(r.areaM2).toBe(3)
    expect(r.unitBasePrice).toBe(300)
    expect(r.unitTotal).toBe(300)
    expect(r.lineTotal).toBe(300)
  })
  it('soma adicional fixo (Bronze +500)', () => {
    const r = calcItem(m2Item({ options: [{ group: 'Cor', label: 'Bronze', surchargeType: 'fixo', surchargeValue: 500 }] }))
    expect(r.unitTotal).toBe(800)
  })
  it('adicional por m² multiplica pela área', () => {
    const r = calcItem(m2Item({ options: [{ group: 'Vidro', label: 'Fumê', surchargeType: 'por_m2', surchargeValue: 50 }] }))
    expect(r.unitTotal).toBe(450) // 300 + 50×3
  })
  it('soma adicional do modelo e multiplica por quantidade', () => {
    const r = calcItem(m2Item({ modelSurcharge: 120, qty: 3 }))
    expect(r.unitTotal).toBe(420)
    expect(r.lineTotal).toBe(1260)
  })
  it('rejeita medidas ausentes ou zero', () => {
    expect(() => calcItem(m2Item({ widthM: 0 }))).toThrow(PricingError)
    expect(() => calcItem(m2Item({ heightM: null }))).toThrow(PricingError)
  })
  it('rejeita produto m² sem preço configurado', () => {
    expect(() => calcItem(m2Item({ pricePerM2: null }))).toThrow(PricingError)
  })
})

describe('calcItem fixo', () => {
  const fixo = (over: Partial<ItemInput> = {}): ItemInput => ({
    pricingMode: 'fixo', basePrice: 1800, qty: 1, options: [], ...over,
  })
  it('base = preço fixo, ignora medidas', () => {
    expect(calcItem(fixo()).unitTotal).toBe(1800)
    expect(calcItem(fixo()).areaM2).toBeNull()
  })
  it('adicional por_m2 em produto fixo contribui 0', () => {
    const r = calcItem(fixo({ options: [{ group: 'X', label: 'Y', surchargeType: 'por_m2', surchargeValue: 99 }] }))
    expect(r.unitTotal).toBe(1800)
  })
  it('rejeita qty < 1 ou não inteira', () => {
    expect(() => calcItem(fixo({ qty: 0 }))).toThrow(PricingError)
    expect(() => calcItem(fixo({ qty: 1.5 }))).toThrow(PricingError)
  })
})

describe('calcItem manual (sob consulta)', () => {
  const manual = (over: Partial<ItemInput> = {}): ItemInput => ({
    pricingMode: 'manual', manualPrice: 2500, qty: 1, options: [], ...over,
  })
  it('base = valor digitado', () => {
    const r = calcItem(manual())
    expect(r.unitBasePrice).toBe(2500)
    expect(r.unitTotal).toBe(2500)
    expect(r.areaM2).toBeNull()
  })
  it('medidas opcionais viram área informativa', () => {
    const r = calcItem(manual({ widthM: 2, heightM: 1.5 }))
    expect(r.areaM2).toBe(3)
    expect(r.unitTotal).toBe(2500) // área não altera o valor
  })
  it('soma adicionais e quantidade normalmente', () => {
    const r = calcItem(manual({ qty: 2, options: [{ group: 'Cor', label: 'Bronze', surchargeType: 'fixo', surchargeValue: 250 }] }))
    expect(r.unitTotal).toBe(2750)
    expect(r.lineTotal).toBe(5500)
  })
  it('rejeita valor ausente ou negativo', () => {
    expect(() => calcItem(manual({ manualPrice: null }))).toThrow(PricingError)
    expect(() => calcItem(manual({ manualPrice: -1 }))).toThrow(PricingError)
  })
})

describe('calcQuoteTotal', () => {
  it('soma linhas e aplica desconto', () => {
    expect(calcQuoteTotal([300, 1260], 60)).toEqual({ subtotal: 1560, total: 1500 })
  })
  it('desconto padrão 0', () => {
    expect(calcQuoteTotal([100.005]).total).toBe(100.01)
  })
  it('rejeita desconto negativo ou maior que subtotal', () => {
    expect(() => calcQuoteTotal([100], -1)).toThrow(PricingError)
    expect(() => calcQuoteTotal([100], 101)).toThrow(PricingError)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/lib/pricing/calc.test.ts`
Expected: FAIL — `calc.ts` não existe.

- [ ] **Step 4: Implementar `calc.ts`**

```ts
import type { ItemInput, ItemTotals } from './types'

export class PricingError extends Error {}

export function round2(v: number): number {
  // deslocamento de expoente via string: evita erro de representação float
  // (multiplicar por 100 antes de arredondar falha em fronteiras .xx5, ex: 35.035*100 = 3503.4999…)
  const shifted = Math.round(Number(`${v}e2`))
  return Number(`${shifted}e-2`)
}

export function calcItem(input: ItemInput): ItemTotals {
  if (!Number.isInteger(input.qty) || input.qty < 1) {
    throw new PricingError('Quantidade deve ser um número inteiro maior ou igual a 1')
  }
  let areaM2: number | null = null
  let base: number
  if (input.pricingMode === 'm2') {
    if (!input.widthM || input.widthM <= 0 || !input.heightM || input.heightM <= 0) {
      throw new PricingError('Informe largura e altura maiores que zero')
    }
    if (input.pricePerM2 == null || input.pricePerM2 < 0) {
      throw new PricingError('Produto sem preço por m² configurado')
    }
    areaM2 = round2(input.widthM * input.heightM)
    base = areaM2 * input.pricePerM2
  } else if (input.pricingMode === 'manual') {
    if (input.manualPrice == null || input.manualPrice < 0) {
      throw new PricingError('Informe o valor do item (produto orçado pela responsável)')
    }
    // medidas opcionais, só registro — não alteram o valor
    if (input.widthM && input.widthM > 0 && input.heightM && input.heightM > 0) {
      areaM2 = round2(input.widthM * input.heightM)
    }
    base = input.manualPrice
  } else {
    if (input.basePrice == null || input.basePrice < 0) {
      throw new PricingError('Produto sem preço fixo configurado')
    }
    base = input.basePrice
  }
  let unit = base + (input.modelSurcharge ?? 0)
  for (const opt of input.options) {
    unit += opt.surchargeType === 'por_m2' ? opt.surchargeValue * (areaM2 ?? 0) : opt.surchargeValue
  }
  const unitTotal = round2(unit)
  return {
    areaM2,
    unitBasePrice: round2(base),
    unitTotal,
    lineTotal: round2(unitTotal * input.qty),
  }
}

export function calcQuoteTotal(lineTotals: number[], discount = 0): { subtotal: number; total: number } {
  const subtotal = round2(lineTotals.reduce((a, b) => a + b, 0))
  if (discount < 0) throw new PricingError('Desconto não pode ser negativo')
  if (discount > subtotal) throw new PricingError('Desconto não pode ser maior que o subtotal')
  return { subtotal, total: round2(subtotal - discount) }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/pricing/calc.test.ts`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add src/lib/pricing && git commit -m "feat: motor de cálculo de orçamento (m²/fixo, adicionais, desconto)"
```

---

### Task 3: Condições de pagamento por faixa + formatação BRL

**Files:**
- Create: `src/lib/pricing/payment.ts`
- Create: `src/lib/format.ts`
- Test: `src/lib/pricing/payment.test.ts`, `src/lib/format.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `payment.ts`: `PaymentConditionRow { description: string; min_total: number|null; max_total: number|null; sort_order: number; active: boolean }`, `applicableConditions<T extends PaymentConditionRow>(conds: T[], total: number): T[]`
  - `format.ts`: `formatBRL(v: number): string` (ex: `R$ 1.234,56`), `parseDecimal(s: string): number` (aceita vírgula)

- [ ] **Step 1: Testes que falham**

`src/lib/pricing/payment.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applicableConditions } from './payment'

const c = (description: string, min: number | null, max: number | null, sort = 0, active = true) =>
  ({ description, min_total: min, max_total: max, sort_order: sort, active })

describe('applicableConditions', () => {
  const conds = [
    c('50% entrada + 50% entrega', null, null, 1),
    c('50% + 3x cartão', null, 5000, 2),
    c('50% + até 5x cartão', 5000.01, null, 3),
    c('10x sem juros', null, 11000, 4),
    c('12x sem juros', 11000.01, null, 5),
    c('inativa', null, null, 0, false),
  ]
  it('total 3000: sem 5x nem 12x', () => {
    expect(applicableConditions(conds, 3000).map(x => x.description))
      .toEqual(['50% entrada + 50% entrega', '50% + 3x cartão', '10x sem juros'])
  })
  it('total 12000: com 5x e 12x, sem 3x nem 10x', () => {
    expect(applicableConditions(conds, 12000).map(x => x.description))
      .toEqual(['50% entrada + 50% entrega', '50% + até 5x cartão', '12x sem juros'])
  })
  it('limites inclusivos e ordena por sort_order', () => {
    const r = applicableConditions(conds, 5000)
    expect(r.map(x => x.description)).toEqual(['50% entrada + 50% entrega', '50% + 3x cartão', '10x sem juros'])
    expect(r[0].sort_order).toBeLessThan(r[1].sort_order)
  })
  it('exclui inativas', () => {
    expect(applicableConditions(conds, 100).some(x => x.description === 'inativa')).toBe(false)
  })
})
```

`src/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatBRL, parseDecimal } from './format'

describe('formatBRL', () => {
  it('formata em pt-BR', () => {
    expect(formatBRL(1234.56).replace(/ /g, ' ')).toBe('R$ 1.234,56')
    expect(formatBRL(0).replace(/ /g, ' ')).toBe('R$ 0,00')
  })
})

describe('parseDecimal', () => {
  it('aceita vírgula e ponto', () => {
    expect(parseDecimal('1,5')).toBe(1.5)
    expect(parseDecimal('2.75')).toBe(2.75)
    expect(parseDecimal('')).toBe(0)
  })
  it('trata ponto de milhar do pt-BR', () => {
    expect(parseDecimal('3.200,00')).toBe(3200)
    expect(parseDecimal('1.234.567,89')).toBe(1234567.89)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib` → Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar**

`src/lib/pricing/payment.ts`:

```ts
export interface PaymentConditionRow {
  description: string
  min_total: number | null
  max_total: number | null
  sort_order: number
  active: boolean
}

export function applicableConditions<T extends PaymentConditionRow>(conds: T[], total: number): T[] {
  return conds
    .filter(c => c.active
      && (c.min_total == null || total >= c.min_total)
      && (c.max_total == null || total <= c.max_total))
    .sort((a, b) => a.sort_order - b.sort_order)
}
```

`src/lib/format.ts`:

```ts
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBRL(v: number): string {
  return brl.format(v)
}

export function parseDecimal(s: string): number {
  const t = String(s).trim()
  if (!t) return 0
  // pt-BR: quando há vírgula decimal, pontos são separador de milhar
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test` → Expected: PASS (calc + payment + format).

- [ ] **Step 5: Commit**

```bash
git add src/lib && git commit -m "feat: condições de pagamento por faixa e formatação BRL"
```

---

### Task 4: Snapshot builder (seleção → linha congelada)

**Files:**
- Create: `src/lib/config-types.ts`
- Create: `src/lib/pricing/snapshot.ts`
- Test: `src/lib/pricing/snapshot.test.ts`

**Interfaces:**
- Consumes: `calcItem`, `PricingError`, tipos de `types.ts` (Task 2)
- Produces:
  - `config-types.ts` (espelha o shape do select do Supabase):
    ```ts
    OptionRow { id: string; label: string; surcharge_type: 'fixo'|'por_m2'; surcharge_value: number; sort_order: number; active: boolean }
    OptionGroupRow { id: string; name: string; required: boolean; sort_order: number; options: OptionRow[] }
    ModelRow { id: string; name: string; photo_url: string|null; surcharge: number; active: boolean; sort_order: number }
    ProductConfig { id: string; name: string; pricing_mode: 'm2'|'fixo'|'manual'; price_per_m2: number|null; base_price: number|null; active: boolean; sort_order: number; option_groups: OptionGroupRow[]; models: ModelRow[] }
    ```
  - `snapshot.ts`:
    ```ts
    ItemSelection { productTypeId: string; modelId: string|null; optionIds: string[]; widthM: number|null; heightM: number|null; manualPrice: number|null; qty: number }
    ItemSnapshot { product_type_id: string; product_name: string; model_id: string|null; model_name: string|null; model_photo_url: string|null; width_m: number|null; height_m: number|null; area_m2: number|null; qty: number; unit_base_price: number; selected_options: SelectedOption[]; unit_total: number; line_total: number }
    buildSnapshot(product: ProductConfig, sel: ItemSelection): ItemSnapshot  // lança PricingError
    ```

- [ ] **Step 1: Escrever `config-types.ts`** (conteúdo acima, como interfaces exportadas)

```ts
export interface OptionRow {
  id: string; label: string
  surcharge_type: 'fixo' | 'por_m2'
  surcharge_value: number
  sort_order: number; active: boolean
}
export interface OptionGroupRow {
  id: string; name: string; required: boolean; sort_order: number
  options: OptionRow[]
}
export interface ModelRow {
  id: string; name: string; photo_url: string | null
  surcharge: number; active: boolean; sort_order: number
}
export interface ProductConfig {
  id: string; name: string
  pricing_mode: 'm2' | 'fixo' | 'manual'
  price_per_m2: number | null
  base_price: number | null
  active: boolean; sort_order: number
  option_groups: OptionGroupRow[]
  models: ModelRow[]
}
```

- [ ] **Step 2: Testes que falham (`snapshot.test.ts`)**

```ts
import { describe, expect, it } from 'vitest'
import { PricingError } from './calc'
import { buildSnapshot, type ItemSelection } from './snapshot'
import type { ProductConfig } from '@/lib/config-types'

const portao: ProductConfig = {
  id: 'p1', name: 'Portão de Alumínio', pricing_mode: 'm2',
  price_per_m2: 100, base_price: null, active: true, sort_order: 0,
  option_groups: [
    { id: 'g1', name: 'Cor', required: true, sort_order: 0, options: [
      { id: 'o1', label: 'Branco', surcharge_type: 'fixo', surcharge_value: 0, sort_order: 0, active: true },
      { id: 'o2', label: 'Bronze', surcharge_type: 'fixo', surcharge_value: 500, sort_order: 1, active: true },
    ]},
    { id: 'g2', name: 'Abertura', required: false, sort_order: 1, options: [
      { id: 'o3', label: 'Correr', surcharge_type: 'fixo', surcharge_value: 0, sort_order: 0, active: true },
    ]},
  ],
  models: [{ id: 'm1', name: 'Lambril', photo_url: 'http://x/f.jpg', surcharge: 150, active: true, sort_order: 0 }],
}

const sel = (over: Partial<ItemSelection> = {}): ItemSelection => ({
  productTypeId: 'p1', modelId: null, optionIds: ['o1'],
  widthM: 2, heightM: 1.5, manualPrice: null, qty: 1, ...over,
})

describe('buildSnapshot', () => {
  it('congela nomes e valores e calcula totais', () => {
    const s = buildSnapshot(portao, sel({ optionIds: ['o2'], modelId: 'm1', qty: 2 }))
    expect(s.product_name).toBe('Portão de Alumínio')
    expect(s.model_name).toBe('Lambril')
    expect(s.area_m2).toBe(3)
    expect(s.unit_base_price).toBe(300)
    expect(s.unit_total).toBe(950) // 300 + 500 bronze + 150 modelo
    expect(s.line_total).toBe(1900)
    expect(s.selected_options).toEqual([
      { optionId: 'o2', group: 'Cor', label: 'Bronze', surchargeType: 'fixo', surchargeValue: 500 },
    ])
  })
  it('rejeita grupo obrigatório sem seleção', () => {
    expect(() => buildSnapshot(portao, sel({ optionIds: [] }))).toThrow(PricingError)
    expect(() => buildSnapshot(portao, sel({ optionIds: ['o3'] }))).toThrow(PricingError) // só grupo opcional
  })
  it('rejeita optionId inexistente', () => {
    expect(() => buildSnapshot(portao, sel({ optionIds: ['o1', 'zzz'] }))).toThrow(PricingError)
  })
  it('rejeita modelId inexistente', () => {
    expect(() => buildSnapshot(portao, sel({ modelId: 'zzz' }))).toThrow(PricingError)
  })
  it('rejeita produto errado', () => {
    expect(() => buildSnapshot(portao, sel({ productTypeId: 'outro' }))).toThrow(PricingError)
  })
  it('produto manual usa valor digitado e guarda medidas informativas', () => {
    const suprema: ProductConfig = {
      id: 'p2', name: 'Janela Linha Suprema', pricing_mode: 'manual',
      price_per_m2: null, base_price: null, active: true, sort_order: 0,
      option_groups: [], models: [],
    }
    const s = buildSnapshot(suprema, sel({ productTypeId: 'p2', optionIds: [], manualPrice: 3200 }))
    expect(s.unit_base_price).toBe(3200)
    expect(s.line_total).toBe(3200)
    expect(s.width_m).toBe(2)
    expect(s.area_m2).toBe(3)
    expect(() => buildSnapshot(suprema, sel({ productTypeId: 'p2', optionIds: [], manualPrice: null })))
      .toThrow(PricingError)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/lib/pricing/snapshot.test.ts` → Expected: FAIL.

- [ ] **Step 4: Implementar `snapshot.ts`**

```ts
import type { ProductConfig } from '@/lib/config-types'
import { PricingError, calcItem } from './calc'
import type { SelectedOption } from './types'

export interface ItemSelection {
  productTypeId: string
  modelId: string | null
  optionIds: string[]
  widthM: number | null
  heightM: number | null
  /** valor combinado — só para produto de preço manual */
  manualPrice: number | null
  qty: number
}

export interface ItemSnapshot {
  product_type_id: string
  product_name: string
  model_id: string | null
  model_name: string | null
  model_photo_url: string | null
  width_m: number | null
  height_m: number | null
  area_m2: number | null
  qty: number
  unit_base_price: number
  selected_options: SelectedOption[]
  unit_total: number
  line_total: number
}

export function buildSnapshot(product: ProductConfig, sel: ItemSelection): ItemSnapshot {
  if (product.id !== sel.productTypeId) throw new PricingError('Produto não corresponde à seleção')

  const selected: SelectedOption[] = sel.optionIds.map(id => {
    for (const g of product.option_groups) {
      const o = g.options.find(o => o.id === id)
      if (o) return { optionId: o.id, group: g.name, label: o.label, surchargeType: o.surcharge_type, surchargeValue: o.surcharge_value }
    }
    throw new PricingError('Opção selecionada não existe mais — atualize o item')
  })

  for (const g of product.option_groups) {
    if (g.required && !g.options.some(o => sel.optionIds.includes(o.id))) {
      throw new PricingError(`Selecione uma opção em "${g.name}"`)
    }
  }

  let model = null
  if (sel.modelId) {
    model = product.models.find(m => m.id === sel.modelId) ?? null
    if (!model) throw new PricingError('Modelo selecionado não existe mais — atualize o item')
  }

  const totals = calcItem({
    pricingMode: product.pricing_mode,
    pricePerM2: product.price_per_m2,
    basePrice: product.base_price,
    manualPrice: sel.manualPrice,
    widthM: sel.widthM,
    heightM: sel.heightM,
    qty: sel.qty,
    options: selected,
    modelSurcharge: model?.surcharge ?? 0,
  })

  const keepDims = product.pricing_mode !== 'fixo' // m2 obrigatório; manual opcional-informativo
  return {
    product_type_id: product.id,
    product_name: product.name,
    model_id: model?.id ?? null,
    model_name: model?.name ?? null,
    model_photo_url: model?.photo_url ?? null,
    width_m: keepDims ? sel.widthM : null,
    height_m: keepDims ? sel.heightM : null,
    area_m2: totals.areaM2,
    qty: sel.qty,
    unit_base_price: totals.unitBasePrice,
    selected_options: selected,
    unit_total: totals.unitTotal,
    line_total: totals.lineTotal,
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run test` → Expected: PASS (todas as suítes).

- [ ] **Step 6: Commit**

```bash
git add src/lib && git commit -m "feat: snapshot builder — seleção vira linha congelada de orçamento"
```

---

### Task 5: Supabase — projeto, schema, RLS, storage, seed, clients

**Files:**
- Create: `supabase/migrations/0001_schema.sql`, `supabase/migrations/0002_rls.sql`, `supabase/migrations/0003_seed.sql`
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`
- Create: `scripts/create-admin.mjs`
- Create: `.env.local` (não commitado — já no .gitignore)

**Interfaces:**
- Consumes: —
- Produces:
  - Banco com tabelas: `company_settings`, `profiles`, `product_types`, `option_groups`, `options`, `models`, `payment_conditions`, `quotes`, `quote_items`; função `is_admin()`; bucket `fotos` público-leitura
  - `createClient()` (browser), `createServerSupabase()` (server, cookies), `createAdminClient()` (service role, só servidor)
  - Script `node scripts/create-admin.mjs <email> <senha> <nome>` cria admin

- [ ] **Step 1: Instalar deps**

```bash
npm i @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Criar/usar projeto Supabase**

Via MCP Supabase: `list_projects`; se não houver projeto adequado, `get_cost` + `confirm_cost` + `create_project` (nome `orcamento-serralheria`). Anotar `project_id`. Pegar URL via `get_project_url` e anon key via `get_publishable_keys`. Service role key: dashboard → Settings → API (usuário copia; agente pede se faltar).

Criar `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service_role>
```

- [ ] **Step 3: Migration 0001 — schema**

`supabase/migrations/0001_schema.sql` (aplicar via MCP `apply_migration`, name `0001_schema`):

```sql
create table company_settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'Minha Serralheria',
  logo_url text,
  city text not null default '',
  phone text not null default '',
  about_text text not null default '',
  warranty_text text not null default '',
  default_validity_days int not null default 15
);
insert into company_settings (id) values (1);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  name text not null,
  role text not null default 'vendedor' check (role in ('admin','vendedor')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table product_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- manual = sob consulta: vendedor digita o valor combinado no item
  pricing_mode text not null check (pricing_mode in ('m2','fixo','manual')),
  price_per_m2 numeric(10,2),
  base_price numeric(10,2),
  active boolean not null default true,
  sort_order int not null default 0
);

create table option_groups (
  id uuid primary key default gen_random_uuid(),
  product_type_id uuid not null references product_types(id) on delete cascade,
  name text not null,
  required boolean not null default false,
  sort_order int not null default 0
);

create table options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references option_groups(id) on delete cascade,
  label text not null,
  surcharge_type text not null default 'fixo' check (surcharge_type in ('fixo','por_m2')),
  surcharge_value numeric(10,2) not null default 0,
  active boolean not null default true,
  sort_order int not null default 0
);

create table models (
  id uuid primary key default gen_random_uuid(),
  product_type_id uuid not null references product_types(id) on delete cascade,
  name text not null,
  photo_url text,
  surcharge numeric(10,2) not null default 0,
  active boolean not null default true,
  sort_order int not null default 0
);

create table payment_conditions (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  min_total numeric(12,2),
  max_total numeric(12,2),
  active boolean not null default true,
  sort_order int not null default 0
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  customer_name text not null,
  customer_phone text not null default '',
  site_address text not null default '',
  status text not null default 'rascunho' check (status in ('rascunho','enviado','aprovado','recusado')),
  discount numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  valid_until date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quotes_token_idx on quotes(token);
create index quotes_status_idx on quotes(status);

create table quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  product_type_id uuid references product_types(id) on delete set null,
  product_name text not null,
  model_id uuid references models(id) on delete set null,
  model_name text,
  model_photo_url text,
  width_m numeric(6,2),
  height_m numeric(6,2),
  area_m2 numeric(8,2),
  qty int not null default 1,
  unit_base_price numeric(12,2) not null,
  selected_options jsonb not null default '[]',
  unit_total numeric(12,2) not null,
  line_total numeric(12,2) not null,
  sort_order int not null default 0
);
create index quote_items_quote_idx on quote_items(quote_id);
```

- [ ] **Step 4: Migration 0002 — RLS + storage**

`supabase/migrations/0002_rls.sql` (aplicar via MCP, name `0002_rls`):

```sql
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin' and active
  )
$$;

alter table company_settings enable row level security;
alter table profiles enable row level security;
alter table product_types enable row level security;
alter table option_groups enable row level security;
alter table options enable row level security;
alter table models enable row level security;
alter table payment_conditions enable row level security;
alter table quotes enable row level security;
alter table quote_items enable row level security;

-- Configuração: leitura autenticada, escrita admin
create policy cfg_read on company_settings for select to authenticated using (true);
create policy cfg_write on company_settings for all to authenticated using (is_admin()) with check (is_admin());
create policy pt_read on product_types for select to authenticated using (true);
create policy pt_write on product_types for all to authenticated using (is_admin()) with check (is_admin());
create policy og_read on option_groups for select to authenticated using (true);
create policy og_write on option_groups for all to authenticated using (is_admin()) with check (is_admin());
create policy op_read on options for select to authenticated using (true);
create policy op_write on options for all to authenticated using (is_admin()) with check (is_admin());
create policy mo_read on models for select to authenticated using (true);
create policy mo_write on models for all to authenticated using (is_admin()) with check (is_admin());
create policy pc_read on payment_conditions for select to authenticated using (true);
create policy pc_write on payment_conditions for all to authenticated using (is_admin()) with check (is_admin());

-- Perfis: lê o próprio ou admin lê todos; escrita admin
create policy pr_read on profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy pr_write on profiles for all to authenticated using (is_admin()) with check (is_admin());

-- Orçamentos: CRUD para autenticados (equipe pequena, todos veem tudo)
create policy q_all on quotes for all to authenticated using (true) with check (true);
create policy qi_all on quote_items for all to authenticated using (true) with check (true);

-- Storage: bucket público para leitura; escrita só admin
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true);
create policy fotos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and is_admin());
create policy fotos_update on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and is_admin());
create policy fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and is_admin());
```

- [ ] **Step 5: Migration 0003 — seed com preços reais**

Preços da chefe (2026-07-02): portão de correr 650/m²; social embutido 700/m² (= +50/m²); basculante +2.000 fixo; janela 500/m²; porta Blindex 550/m²; box padrão 500/m², até o teto 550/m² (= +50/m²); **Bronze sempre +250 fixo**. Linha Suprema é sob consulta (modo `manual` — a responsável orça caso a caso). Motor 1.800 é exemplo.

`supabase/migrations/0003_seed.sql`:

```sql
insert into company_settings (id, name, city, about_text, warranty_text)
values (1, 'Serralheria', 'Pariquera-Açu/SP',
  'Trabalhamos com esquadrias de alumínio, vidros temperados e automatização de motores. Mais de 7 anos de mercado. Qualidade sob medida, instalação profissional, tudo vistoriado pelo próprio dono. Da fábrica direto para sua obra.',
  'Garantia de 1 ano para esquadrias e 2 anos para motores. Vedação total garantida (não somente PU). Todos os vidros temperados.')
on conflict (id) do update set
  name = excluded.name, city = excluded.city,
  about_text = excluded.about_text, warranty_text = excluded.warranty_text;

-- Portão de Alumínio: 650/m²; basculante +2000 fixo; social embutido +50/m²; bronze +250
with p as (
  insert into product_types (name, pricing_mode, price_per_m2, sort_order)
  values ('Portão de Alumínio', 'm2', 650.00, 0) returning id
), g1 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Abertura', true, 0 from p returning id
), g2 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Social', false, 1 from p returning id
), g3 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Cor do Alumínio', true, 2 from p returning id
), o1 as (
  insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
  select id, x.label, x.typ, x.val, x.ord from g1,
    (values ('De Correr', 'fixo', 0.00, 0), ('Basculante', 'fixo', 2000.00, 1)) as x(label, typ, val, ord)
), o2 as (
  insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
  select id, x.label, x.typ, x.val, x.ord from g2,
    (values ('Sem social', 'fixo', 0.00, 0), ('Social Embutido', 'por_m2', 50.00, 1)) as x(label, typ, val, ord)
)
insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
select id, x.label, 'fixo', x.val, x.ord from g3,
  (values ('Branco', 0.00, 0), ('Preto', 0.00, 1), ('Bronze', 250.00, 2)) as x(label, val, ord);

-- Janela de Vidro Temperado: 500/m²
with p as (
  insert into product_types (name, pricing_mode, price_per_m2, sort_order)
  values ('Janela de Vidro Temperado', 'm2', 500.00, 1) returning id
), g1 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Tipo de Vidro', true, 0 from p returning id
), g2 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Cor do Alumínio', true, 1 from p returning id
), o1 as (
  insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
  select id, x.label, 'fixo', 0, x.ord from g1,
    (values ('Incolor', 0), ('Fumê', 1), ('Verde', 2), ('Serigrafado', 3)) as x(label, ord)
)
insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
select id, x.label, 'fixo', x.val, x.ord from g2,
  (values ('Branco', 0.00, 0), ('Preto', 0.00, 1), ('Bronze', 250.00, 2)) as x(label, val, ord);

-- Porta Blindex: 550/m²
with p as (
  insert into product_types (name, pricing_mode, price_per_m2, sort_order)
  values ('Porta Blindex', 'm2', 550.00, 2) returning id
), g1 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Tipo de Vidro', true, 0 from p returning id
), g2 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Cor do Alumínio', true, 1 from p returning id
), o1 as (
  insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
  select id, x.label, 'fixo', 0, x.ord from g1,
    (values ('Incolor', 0), ('Fumê', 1), ('Verde', 2), ('Serigrafado', 3)) as x(label, ord)
)
insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
select id, x.label, 'fixo', x.val, x.ord from g2,
  (values ('Branco', 0.00, 0), ('Preto', 0.00, 1), ('Bronze', 250.00, 2)) as x(label, val, ord);

-- Box Blindex: 500/m²; até o teto +50/m²; bronze +250
with p as (
  insert into product_types (name, pricing_mode, price_per_m2, sort_order)
  values ('Box Blindex', 'm2', 500.00, 3) returning id
), g1 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Altura', true, 0 from p returning id
), g2 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Formato', false, 1 from p returning id
), g3 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Tipo de Vidro', true, 2 from p returning id
), g4 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Cor do Alumínio', true, 3 from p returning id
), o1 as (
  insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
  select id, x.label, x.typ, x.val, x.ord from g1,
    (values ('Padrão', 'fixo', 0.00, 0), ('Até o teto', 'por_m2', 50.00, 1)) as x(label, typ, val, ord)
), o2 as (
  insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
  select id, x.label, 'fixo', 0, x.ord from g2, (values ('Box Reto', 0), ('Box de Canto', 1)) as x(label, ord)
), o3 as (
  insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
  select id, x.label, 'fixo', 0, x.ord from g3,
    (values ('Incolor', 0), ('Fumê', 1), ('Verde', 2), ('Serigrafado', 3)) as x(label, ord)
)
insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
select id, x.label, 'fixo', x.val, x.ord from g4,
  (values ('Branco', 0.00, 0), ('Preto', 0.00, 1), ('Bronze', 250.00, 2)) as x(label, val, ord);

-- Linha Suprema: sob consulta — a responsável orça, vendedor digita o valor no item
insert into product_types (name, pricing_mode, sort_order)
values ('Janela Linha Suprema (persiana integrada)', 'manual', 4);

-- Motor: valor EXEMPLO
insert into product_types (name, pricing_mode, base_price, sort_order)
values ('Motor para Portão (automatização)', 'fixo', 1800.00, 5);

insert into payment_conditions (description, min_total, max_total, sort_order) values
  ('50% de entrada + 50% na entrega', null, null, 0),
  ('50% de entrada + 50% em até 3x no cartão', null, 5000.00, 1),
  ('50% de entrada + 50% em até 5x no cartão', 5000.01, null, 2),
  ('10x no cartão sem juros', null, 11000.00, 3),
  ('12x no cartão sem juros', 11000.01, null, 4),
  ('50% de entrada + 50% no boleto (a negociar com o responsável)', null, null, 5);
```

- [ ] **Step 6: Clients Supabase**

`src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

`src/lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {} // chamado de Server Component — middleware renova a sessão
        },
      },
    }
  )
}
```

`src/lib/supabase/admin.ts`:

```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
```

```bash
npm i server-only
```

- [ ] **Step 7: Script create-admin**

`scripts/create-admin.mjs`:

```js
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const [email, password, ...nameParts] = process.argv.slice(2)
const name = nameParts.join(' ')
if (!email || !password || !name) {
  console.error('Uso: node scripts/create-admin.mjs <email> <senha> <nome>')
  process.exit(1)
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true })
if (error) { console.error(error.message); process.exit(1) }
const { error: pErr } = await supabase.from('profiles').insert({ id: data.user.id, email, name, role: 'admin' })
if (pErr) { console.error(pErr.message); process.exit(1) }
console.log('Admin criado:', email)
```

- [ ] **Step 8: Verificar**

Aplicar as 3 migrations via MCP `apply_migration`. Run: MCP `list_tables` → Expected: 9 tabelas. `node scripts/create-admin.mjs admin@teste.com senha-forte-123 Dono` → Expected: `Admin criado`. MCP `get_advisors` (security) → Expected: sem erro crítico de RLS desabilitada.

- [ ] **Step 9: Commit**

```bash
git add supabase src/lib/supabase scripts package.json package-lock.json
git commit -m "feat: schema Supabase com RLS, storage, seed e clients"
```

---

### Task 6: Auth — middleware, login, shell autenticado

**Files:**
- Create: `src/middleware.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/page.tsx` (placeholder da lista — Task 13 substitui)
- Modify: `src/app/layout.tsx` (metadata pt-BR), `src/app/globals.css` (regra no-print)
- Delete: `src/app/page.tsx` (página default do scaffold)

**Interfaces:**
- Consumes: `createClient` (browser), `createServerSupabase` (Task 5)
- Produces: rotas sob `(app)` exigem login; `/login` e `/o/*` livres; layout com nav (`Orçamentos`, `Admin` se admin, `Sair`); helper exportado `getProfile()` em `src/lib/auth.ts` → `{ user, profile } | redirect('/login')`

- [ ] **Step 1: Middleware**

`src/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  if (!user && path !== '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  if (user && path === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|o/|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
}
```

- [ ] **Step 2: Helper de perfil**

`src/lib/auth.ts`:

```ts
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'

export interface Profile {
  id: string; email: string; name: string
  role: 'admin' | 'vendedor'; active: boolean
}

export async function getProfile() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !profile.active) redirect('/login')
  return { user, profile: profile as Profile, supabase }
}
```

- [ ] **Step 3: Página de login**

`src/app/login/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('E-mail ou senha inválidos'); setLoading(false); return }
    router.push('/'); router.refresh()
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center">Orçamentos</h1>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Shell autenticado + placeholder**

`src/app/(app)/layout.tsx`:

```tsx
import Link from 'next/link'
import { getProfile } from '@/lib/auth'
import { LogoutButton } from '@/components/logout-button'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getProfile()
  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-10 border-b bg-background">
        <nav className="mx-auto flex max-w-3xl items-center gap-4 p-3 text-sm">
          <Link href="/" className="font-semibold">Orçamentos</Link>
          {profile.role === 'admin' && <Link href="/admin/produtos">Admin</Link>}
          <span className="ml-auto text-muted-foreground">{profile.name}</span>
          <LogoutButton />
        </nav>
      </header>
      <main className="mx-auto max-w-3xl p-4">{children}</main>
    </div>
  )
}
```

`src/components/logout-button.tsx`:

```tsx
'use client'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function LogoutButton() {
  const router = useRouter()
  return (
    <button
      className="text-muted-foreground underline"
      onClick={async () => { await createClient().auth.signOut(); router.push('/login'); router.refresh() }}
    >
      Sair
    </button>
  )
}
```

`src/app/(app)/page.tsx` (placeholder até Task 13):

```tsx
export default function Home() {
  return <p>Lista de orçamentos — em construção.</p>
}
```

Remover `src/app/page.tsx` (default do scaffold): `rm src/app/page.tsx`.

Em `src/app/layout.tsx`, trocar metadata e lang:

```tsx
export const metadata: Metadata = {
  title: 'Orçamentos — Serralheria',
  description: 'Sistema de orçamentos',
}
```

e `<html lang="pt-BR">`.

Em `src/app/globals.css`, adicionar no final:

```css
@media print {
  .no-print { display: none !important; }
  body { background: white !important; }
}
```

- [ ] **Step 5: Verificar**

Run: `npm run build` → Expected: OK. `npm run dev` → abrir `http://localhost:3000` → Expected: redireciona para `/login`; login com admin criado na Task 5 → Expected: entra, nav mostra nome + link Admin; Sair → volta ao login.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: auth com middleware, login e shell autenticado"
```

---

### Task 7: Admin — guarda de rota + página Empresa

**Files:**
- Create: `src/app/(app)/admin/layout.tsx`
- Create: `src/app/(app)/admin/empresa/page.tsx`
- Create: `src/app/(app)/admin/empresa/actions.ts`
- Create: `src/components/admin/photo-upload.tsx`

**Interfaces:**
- Consumes: `getProfile` (Task 6), `createClient` browser (Task 5)
- Produces: layout `/admin/*` redireciona não-admin para `/`; nav interna admin (Produtos | Pagamento | Empresa | Usuários); componente `PhotoUpload { folder: string; value: string|null; onChange: (url: string|null) => void }` (upload no bucket `fotos`); action `saveCompany(formData: FormData): Promise<void>`

- [ ] **Step 1: Layout admin com guarda**

`src/app/(app)/admin/layout.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getProfile()
  if (profile.role !== 'admin') redirect('/')
  return (
    <div className="space-y-4">
      <nav className="no-print flex flex-wrap gap-3 text-sm border-b pb-2">
        <Link href="/admin/produtos">Produtos</Link>
        <Link href="/admin/pagamento">Pagamento</Link>
        <Link href="/admin/empresa">Empresa</Link>
        <Link href="/admin/usuarios">Usuários</Link>
      </nav>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Upload de foto (reutilizável)**

`src/components/admin/photo-upload.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function PhotoUpload({ folder, value, onChange }: {
  folder: string
  value: string | null
  onChange: (url: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError('')
    const supabase = createClient()
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${folder}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('fotos').upload(path, file)
    if (error) { setError('Falha no upload: ' + error.message); setBusy(false); return }
    const { data } = supabase.storage.from('fotos').getPublicUrl(path)
    onChange(data.publicUrl)
    setBusy(false)
  }

  return (
    <div className="space-y-2">
      {value && (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-20 w-20 rounded object-cover" />
          <button type="button" className="text-sm text-red-600 underline" onClick={() => onChange(null)}>Remover</button>
        </div>
      )}
      <input type="file" accept="image/*" onChange={onFile} disabled={busy} />
      {busy && <p className="text-sm">Enviando…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Action + página Empresa**

`src/app/(app)/admin/empresa/actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'

export async function saveCompany(formData: FormData) {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('company_settings').update({
    name: String(formData.get('name') ?? ''),
    city: String(formData.get('city') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    about_text: String(formData.get('about_text') ?? ''),
    warranty_text: String(formData.get('warranty_text') ?? ''),
    default_validity_days: Number(formData.get('default_validity_days') ?? 15),
    logo_url: String(formData.get('logo_url') ?? '') || null,
  }).eq('id', 1)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/empresa')
}
```

`src/app/(app)/admin/empresa/page.tsx`:

```tsx
import { getProfile } from '@/lib/auth'
import { saveCompany } from './actions'
import { CompanyForm } from './company-form'

export default async function EmpresaPage() {
  const { supabase } = await getProfile()
  const { data } = await supabase.from('company_settings').select('*').eq('id', 1).single()
  return <CompanyForm settings={data} action={saveCompany} />
}
```

`src/app/(app)/admin/empresa/company-form.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PhotoUpload } from '@/components/admin/photo-upload'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CompanyForm({ settings, action }: { settings: any; action: (fd: FormData) => Promise<void> }) {
  const [logo, setLogo] = useState<string | null>(settings?.logo_url ?? null)
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-bold">Dados da empresa</h1>
      <input type="hidden" name="logo_url" value={logo ?? ''} />
      <div className="space-y-2"><Label>Logo</Label><PhotoUpload folder="logo" value={logo} onChange={setLogo} /></div>
      <div className="space-y-2"><Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" defaultValue={settings?.name ?? ''} required /></div>
      <div className="space-y-2"><Label htmlFor="city">Cidade</Label>
        <Input id="city" name="city" defaultValue={settings?.city ?? ''} /></div>
      <div className="space-y-2"><Label htmlFor="phone">Telefone/WhatsApp</Label>
        <Input id="phone" name="phone" defaultValue={settings?.phone ?? ''} /></div>
      <div className="space-y-2"><Label htmlFor="about_text">Texto de apresentação</Label>
        <Textarea id="about_text" name="about_text" rows={4} defaultValue={settings?.about_text ?? ''} /></div>
      <div className="space-y-2"><Label htmlFor="warranty_text">Garantias</Label>
        <Textarea id="warranty_text" name="warranty_text" rows={3} defaultValue={settings?.warranty_text ?? ''} /></div>
      <div className="space-y-2"><Label htmlFor="default_validity_days">Validade padrão do orçamento (dias)</Label>
        <Input id="default_validity_days" name="default_validity_days" type="number" min={1}
          defaultValue={settings?.default_validity_days ?? 15} /></div>
      <Button type="submit">Salvar</Button>
    </form>
  )
}
```

- [ ] **Step 4: Verificar**

`npm run dev` → `/admin/empresa` como admin: edita nome, sobe logo, salva → recarrega com valores persistidos. Logado como vendedor (criar depois na Task 12; por ora só admin) → guardas testadas na Task 12.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: área admin com guarda de papel e página de dados da empresa"
```

---

### Task 8: Admin — CRUD de produtos

**Files:**
- Create: `src/app/(app)/admin/produtos/page.tsx`
- Create: `src/app/(app)/admin/produtos/actions.ts`
- Create: `src/app/(app)/admin/produtos/product-form.tsx`

**Interfaces:**
- Consumes: `getProfile`, `parseDecimal` (Task 3)
- Produces: actions `saveProduct(formData)` (insert se sem `id`, update se com), `deleteProduct(id: string)`; lista em `/admin/produtos` com link para `/admin/produtos/[id]` (Task 9)

- [ ] **Step 1: Actions**

`src/app/(app)/admin/produtos/actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { parseDecimal } from '@/lib/format'

export async function saveProduct(formData: FormData) {
  const { supabase } = await getProfile()
  const id = String(formData.get('id') ?? '')
  const mode = String(formData.get('pricing_mode')) as 'm2' | 'fixo' | 'manual'
  const row = {
    name: String(formData.get('name') ?? '').trim(),
    pricing_mode: mode,
    price_per_m2: mode === 'm2' ? parseDecimal(String(formData.get('price_per_m2') ?? '0')) : null,
    base_price: mode === 'fixo' ? parseDecimal(String(formData.get('base_price') ?? '0')) : null,
    active: formData.get('active') === 'on',
    sort_order: Number(formData.get('sort_order') ?? 0),
  }
  if (!row.name) throw new Error('Nome obrigatório')
  const q = id
    ? supabase.from('product_types').update(row).eq('id', id)
    : supabase.from('product_types').insert(row)
  const { error } = await q
  if (error) throw new Error(error.message)
  revalidatePath('/admin/produtos')
}

export async function deleteProduct(id: string) {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('product_types').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/produtos')
}
```

- [ ] **Step 2: Formulário (client)**

`src/app/(app)/admin/produtos/product-form.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ProductForm({ product, action }: { product?: any; action: (fd: FormData) => Promise<void> }) {
  const [mode, setMode] = useState<'m2' | 'fixo' | 'manual'>(product?.pricing_mode ?? 'm2')
  return (
    <form action={action} className="space-y-3 rounded border p-3">
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="space-y-1">
        <Label htmlFor={`name-${product?.id ?? 'new'}`}>Nome do produto</Label>
        <Input id={`name-${product?.id ?? 'new'}`} name="name" defaultValue={product?.name ?? ''} required />
      </div>
      <div className="space-y-1">
        <Label>Modo de preço</Label>
        <select name="pricing_mode" value={mode} onChange={e => setMode(e.target.value as 'm2' | 'fixo' | 'manual')}
          className="w-full rounded border bg-background p-2">
          <option value="m2">Por m² (largura × altura)</option>
          <option value="fixo">Preço fixo</option>
          <option value="manual">Sob consulta (vendedor digita o valor no orçamento)</option>
        </select>
      </div>
      {mode === 'm2' && (
        <div className="space-y-1">
          <Label htmlFor={`ppm2-${product?.id ?? 'new'}`}>Preço por m² (R$)</Label>
          <Input id={`ppm2-${product?.id ?? 'new'}`} name="price_per_m2" inputMode="decimal"
            defaultValue={product?.price_per_m2 ?? ''} required />
        </div>
      )}
      {mode === 'fixo' && (
        <div className="space-y-1">
          <Label htmlFor={`bp-${product?.id ?? 'new'}`}>Preço fixo (R$)</Label>
          <Input id={`bp-${product?.id ?? 'new'}`} name="base_price" inputMode="decimal"
            defaultValue={product?.base_price ?? ''} required />
        </div>
      )}
      {mode === 'manual' && (
        <p className="text-sm text-muted-foreground">
          Sem preço tabelado: a responsável orça e o vendedor digita o valor combinado ao montar o orçamento.
        </p>
      )}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={product?.active ?? true} /> Ativo
        </label>
        <div className="flex items-center gap-2 text-sm">
          Ordem <Input name="sort_order" type="number" className="w-20" defaultValue={product?.sort_order ?? 0} />
        </div>
      </div>
      <Button type="submit" size="sm">{product ? 'Salvar' : 'Adicionar produto'}</Button>
    </form>
  )
}
```

- [ ] **Step 3: Página lista**

`src/app/(app)/admin/produtos/page.tsx`:

```tsx
import Link from 'next/link'
import { getProfile } from '@/lib/auth'
import { formatBRL } from '@/lib/format'
import { deleteProduct, saveProduct } from './actions'
import { ProductForm } from './product-form'
import { Button } from '@/components/ui/button'

export default async function ProdutosPage() {
  const { supabase } = await getProfile()
  const { data: products } = await supabase.from('product_types')
    .select('*').order('sort_order').order('name')
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Produtos</h1>
      <ul className="space-y-2">
        {(products ?? []).map(p => (
          <li key={p.id} className="flex items-center justify-between rounded border p-3">
            <div>
              <Link href={`/admin/produtos/${p.id}`} className="font-medium underline">{p.name}</Link>
              <p className="text-sm text-muted-foreground">
                {p.pricing_mode === 'm2' && `${formatBRL(p.price_per_m2 ?? 0)}/m²`}
                {p.pricing_mode === 'fixo' && formatBRL(p.base_price ?? 0)}
                {p.pricing_mode === 'manual' && 'Sob consulta'}
                {!p.active && ' · inativo'}
              </p>
            </div>
            <form action={deleteProduct.bind(null, p.id)}>
              <Button variant="ghost" size="sm" className="text-red-600">Excluir</Button>
            </form>
          </li>
        ))}
      </ul>
      <h2 className="font-semibold">Novo produto</h2>
      <ProductForm action={saveProduct} />
    </div>
  )
}
```

- [ ] **Step 4: Verificar**

`/admin/produtos`: seed aparece (6 produtos, Linha Suprema mostrando "Sob consulta"); criar produto teste, editar via página detalhe ainda 404 (Task 9) — editar aqui só via novo; excluir produto teste → some. Excluir NÃO pede confirmação ainda — adicionar `onSubmit` confirm no form de excluir? Server form não tem onSubmit; aceitável v1 (item recriável). 

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: CRUD de produtos no admin"
```

---

### Task 9: Admin — detalhe do produto: grupos, opções e modelos

**Files:**
- Create: `src/app/(app)/admin/produtos/[id]/page.tsx`
- Create: `src/app/(app)/admin/produtos/[id]/actions.ts`
- Create: `src/app/(app)/admin/produtos/[id]/group-editor.tsx`
- Create: `src/app/(app)/admin/produtos/[id]/model-editor.tsx`

**Interfaces:**
- Consumes: `getProfile`, `parseDecimal`, `PhotoUpload` (Task 7), `ProductForm`/`saveProduct` (Task 8), tipos `ProductConfig` (Task 4)
- Produces: actions `saveGroup`, `deleteGroup`, `saveOption`, `deleteOption`, `saveModel`, `deleteModel` (todas `(formData) => Promise<void>` com `product_id` hidden para revalidate); página edita produto completo — consulta modelo: `product_types.select('*, option_groups(*, options(*)), models(*)')`

- [ ] **Step 1: Actions**

`src/app/(app)/admin/produtos/[id]/actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { parseDecimal } from '@/lib/format'

function reval(fd: FormData) {
  revalidatePath(`/admin/produtos/${String(fd.get('product_id'))}`)
}

export async function saveGroup(fd: FormData) {
  const { supabase } = await getProfile()
  const id = String(fd.get('id') ?? '')
  const row = {
    product_type_id: String(fd.get('product_id')),
    name: String(fd.get('name') ?? '').trim(),
    required: fd.get('required') === 'on',
    sort_order: Number(fd.get('sort_order') ?? 0),
  }
  if (!row.name) throw new Error('Nome obrigatório')
  const { error } = await (id
    ? supabase.from('option_groups').update(row).eq('id', id)
    : supabase.from('option_groups').insert(row))
  if (error) throw new Error(error.message)
  reval(fd)
}

export async function deleteGroup(fd: FormData) {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('option_groups').delete().eq('id', String(fd.get('id')))
  if (error) throw new Error(error.message)
  reval(fd)
}

export async function saveOption(fd: FormData) {
  const { supabase } = await getProfile()
  const id = String(fd.get('id') ?? '')
  const row = {
    group_id: String(fd.get('group_id')),
    label: String(fd.get('label') ?? '').trim(),
    surcharge_type: String(fd.get('surcharge_type')) as 'fixo' | 'por_m2',
    surcharge_value: parseDecimal(String(fd.get('surcharge_value') ?? '0')),
    sort_order: Number(fd.get('sort_order') ?? 0),
    active: fd.get('active') === 'on',
  }
  if (!row.label) throw new Error('Rótulo obrigatório')
  const { error } = await (id
    ? supabase.from('options').update(row).eq('id', id)
    : supabase.from('options').insert(row))
  if (error) throw new Error(error.message)
  reval(fd)
}

export async function deleteOption(fd: FormData) {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('options').delete().eq('id', String(fd.get('id')))
  if (error) throw new Error(error.message)
  reval(fd)
}

export async function saveModel(fd: FormData) {
  const { supabase } = await getProfile()
  const id = String(fd.get('id') ?? '')
  const row = {
    product_type_id: String(fd.get('product_id')),
    name: String(fd.get('name') ?? '').trim(),
    photo_url: String(fd.get('photo_url') ?? '') || null,
    surcharge: parseDecimal(String(fd.get('surcharge') ?? '0')),
    sort_order: Number(fd.get('sort_order') ?? 0),
    active: fd.get('active') === 'on',
  }
  if (!row.name) throw new Error('Nome obrigatório')
  const { error } = await (id
    ? supabase.from('models').update(row).eq('id', id)
    : supabase.from('models').insert(row))
  if (error) throw new Error(error.message)
  reval(fd)
}

export async function deleteModel(fd: FormData) {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('models').delete().eq('id', String(fd.get('id')))
  if (error) throw new Error(error.message)
  reval(fd)
}
```

- [ ] **Step 2: Editor de grupos/opções (client)**

`src/app/(app)/admin/produtos/[id]/group-editor.tsx`:

```tsx
'use client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { OptionGroupRow } from '@/lib/config-types'
import { deleteGroup, deleteOption, saveGroup, saveOption } from './actions'

export function GroupEditor({ productId, groups }: { productId: string; groups: OptionGroupRow[] }) {
  return (
    <section className="space-y-4">
      <h2 className="font-semibold">Grupos de opções</h2>
      {groups.map(g => (
        <div key={g.id} className="space-y-2 rounded border p-3">
          <form action={saveGroup} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="product_id" value={productId} />
            <input type="hidden" name="id" value={g.id} />
            <Input name="name" defaultValue={g.name} className="w-44" aria-label="Nome do grupo" />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="required" defaultChecked={g.required} /> Obrigatório
            </label>
            <Input name="sort_order" type="number" defaultValue={g.sort_order} className="w-16" aria-label="Ordem" />
            <Button size="sm" type="submit">Salvar</Button>
          </form>
          <form action={deleteGroup}>
            <input type="hidden" name="product_id" value={productId} />
            <input type="hidden" name="id" value={g.id} />
            <button className="text-xs text-red-600 underline">Excluir grupo (e opções)</button>
          </form>
          <ul className="space-y-2 pl-2">
            {g.options.map(o => (
              <li key={o.id} className="flex flex-wrap items-end gap-2">
                <form action={saveOption} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="product_id" value={productId} />
                  <input type="hidden" name="group_id" value={g.id} />
                  <input type="hidden" name="id" value={o.id} />
                  <Input name="label" defaultValue={o.label} className="w-36" aria-label="Opção" />
                  <select name="surcharge_type" defaultValue={o.surcharge_type} className="rounded border bg-background p-2 text-sm">
                    <option value="fixo">R$ fixo</option>
                    <option value="por_m2">R$ por m²</option>
                  </select>
                  <Input name="surcharge_value" inputMode="decimal" defaultValue={o.surcharge_value} className="w-24" aria-label="Adicional" />
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="active" defaultChecked={o.active} /> Ativa
                  </label>
                  <Input name="sort_order" type="number" defaultValue={o.sort_order} className="w-14" aria-label="Ordem" />
                  <Button size="sm" variant="outline" type="submit">OK</Button>
                </form>
                <form action={deleteOption}>
                  <input type="hidden" name="product_id" value={productId} />
                  <input type="hidden" name="id" value={o.id} />
                  <button className="text-xs text-red-600 underline">excluir</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={saveOption} className="flex flex-wrap items-end gap-2 border-t pt-2">
            <input type="hidden" name="product_id" value={productId} />
            <input type="hidden" name="group_id" value={g.id} />
            <input type="hidden" name="active" value="on" />
            <Input name="label" placeholder="Nova opção" className="w-36" />
            <select name="surcharge_type" defaultValue="fixo" className="rounded border bg-background p-2 text-sm">
              <option value="fixo">R$ fixo</option>
              <option value="por_m2">R$ por m²</option>
            </select>
            <Input name="surcharge_value" inputMode="decimal" defaultValue={0} className="w-24" />
            <Button size="sm" type="submit">Adicionar opção</Button>
          </form>
        </div>
      ))}
      <form action={saveGroup} className="flex flex-wrap items-end gap-2 rounded border border-dashed p-3">
        <input type="hidden" name="product_id" value={productId} />
        <Input name="name" placeholder="Novo grupo (ex: Cor do Alumínio)" className="w-56" />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="required" /> Obrigatório
        </label>
        <Button size="sm" type="submit">Adicionar grupo</Button>
      </form>
    </section>
  )
}
```

Nota: checkbox `active` com hidden `value="on"` no form de nova opção garante ativa por padrão.

- [ ] **Step 3: Editor de modelos (client)**

`src/app/(app)/admin/produtos/[id]/model-editor.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhotoUpload } from '@/components/admin/photo-upload'
import type { ModelRow } from '@/lib/config-types'
import { deleteModel, saveModel } from './actions'

function ModelForm({ productId, model }: { productId: string; model?: ModelRow }) {
  const [photo, setPhoto] = useState<string | null>(model?.photo_url ?? null)
  return (
    <form action={saveModel} className="space-y-2 rounded border p-3">
      <input type="hidden" name="product_id" value={productId} />
      {model && <input type="hidden" name="id" value={model.id} />}
      <input type="hidden" name="photo_url" value={photo ?? ''} />
      <div className="flex flex-wrap items-end gap-2">
        <Input name="name" defaultValue={model?.name ?? ''} placeholder="Nome do modelo" className="w-44" required />
        <Input name="surcharge" inputMode="decimal" defaultValue={model?.surcharge ?? 0} className="w-24" aria-label="Adicional R$" />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="active" defaultChecked={model?.active ?? true} /> Ativo
        </label>
        <Input name="sort_order" type="number" defaultValue={model?.sort_order ?? 0} className="w-16" aria-label="Ordem" />
        <Button size="sm" type="submit">{model ? 'Salvar' : 'Adicionar modelo'}</Button>
      </div>
      <PhotoUpload folder="modelos" value={photo} onChange={setPhoto} />
    </form>
  )
}

export function ModelEditor({ productId, models }: { productId: string; models: ModelRow[] }) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Modelos (galeria para o cliente)</h2>
      {models.map(m => (
        <div key={m.id} className="space-y-1">
          <ModelForm productId={productId} model={m} />
          <form action={deleteModel}>
            <input type="hidden" name="product_id" value={productId} />
            <input type="hidden" name="id" value={m.id} />
            <button className="text-xs text-red-600 underline">excluir modelo</button>
          </form>
        </div>
      ))}
      <ModelForm productId={productId} />
    </section>
  )
}
```

- [ ] **Step 4: Página detalhe**

`src/app/(app)/admin/produtos/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import type { ProductConfig } from '@/lib/config-types'
import { saveProduct } from '../actions'
import { ProductForm } from '../product-form'
import { GroupEditor } from './group-editor'
import { ModelEditor } from './model-editor'

export default async function ProdutoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await getProfile()
  const { data } = await supabase.from('product_types')
    .select('*, option_groups(*, options(*)), models(*)')
    .eq('id', id).single()
  if (!data) notFound()
  const product = data as unknown as ProductConfig
  product.option_groups.sort((a, b) => a.sort_order - b.sort_order)
  product.option_groups.forEach(g => g.options.sort((a, b) => a.sort_order - b.sort_order))
  product.models.sort((a, b) => a.sort_order - b.sort_order)
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{product.name}</h1>
      <ProductForm product={product} action={saveProduct} />
      <GroupEditor productId={product.id} groups={product.option_groups} />
      <ModelEditor productId={product.id} models={product.models} />
    </div>
  )
}
```

- [ ] **Step 5: Verificar**

`/admin/produtos` → clicar "Portão de Alumínio": grupos do seed aparecem (Abertura com Basculante +2.000, Social com Embutido +50/m², Cor com Bronze +250); editar valor do Bronze para 300, salvar → persiste; voltar para 250; adicionar modelo com foto → foto aparece; excluir opção teste. `npm run build` → OK.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: edição de grupos, opções e modelos com foto no produto"
```

---

### Task 10: Admin — condições de pagamento

**Files:**
- Create: `src/app/(app)/admin/pagamento/page.tsx`
- Create: `src/app/(app)/admin/pagamento/actions.ts`

**Interfaces:**
- Consumes: `getProfile`, `parseDecimal`, `formatBRL`
- Produces: actions `saveCondition(formData)`, `deleteCondition(formData)`; página lista + form inline (mesmo padrão da Task 9)

- [ ] **Step 1: Actions**

`src/app/(app)/admin/pagamento/actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { parseDecimal } from '@/lib/format'

export async function saveCondition(fd: FormData) {
  const { supabase } = await getProfile()
  const id = String(fd.get('id') ?? '')
  const minS = String(fd.get('min_total') ?? '').trim()
  const maxS = String(fd.get('max_total') ?? '').trim()
  const row = {
    description: String(fd.get('description') ?? '').trim(),
    min_total: minS ? parseDecimal(minS) : null,
    max_total: maxS ? parseDecimal(maxS) : null,
    sort_order: Number(fd.get('sort_order') ?? 0),
    active: fd.get('active') === 'on',
  }
  if (!row.description) throw new Error('Descrição obrigatória')
  const { error } = await (id
    ? supabase.from('payment_conditions').update(row).eq('id', id)
    : supabase.from('payment_conditions').insert(row))
  if (error) throw new Error(error.message)
  revalidatePath('/admin/pagamento')
}

export async function deleteCondition(fd: FormData) {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('payment_conditions').delete().eq('id', String(fd.get('id')))
  if (error) throw new Error(error.message)
  revalidatePath('/admin/pagamento')
}
```

- [ ] **Step 2: Página**

`src/app/(app)/admin/pagamento/page.tsx`:

```tsx
import { getProfile } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteCondition, saveCondition } from './actions'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ConditionForm({ c }: { c?: any }) {
  return (
    <form action={saveCondition} className="flex flex-wrap items-end gap-2 rounded border p-3">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="w-full sm:w-72">
        <label className="text-xs">Descrição</label>
        <Input name="description" defaultValue={c?.description ?? ''} required />
      </div>
      <div><label className="text-xs">Valor mín. (vazio = sem)</label>
        <Input name="min_total" inputMode="decimal" defaultValue={c?.min_total ?? ''} className="w-28" /></div>
      <div><label className="text-xs">Valor máx. (vazio = sem)</label>
        <Input name="max_total" inputMode="decimal" defaultValue={c?.max_total ?? ''} className="w-28" /></div>
      <div><label className="text-xs">Ordem</label>
        <Input name="sort_order" type="number" defaultValue={c?.sort_order ?? 0} className="w-16" /></div>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" name="active" defaultChecked={c?.active ?? true} /> Ativa
      </label>
      <Button size="sm" type="submit">{c ? 'Salvar' : 'Adicionar'}</Button>
    </form>
  )
}

export default async function PagamentoPage() {
  const { supabase } = await getProfile()
  const { data: conds } = await supabase.from('payment_conditions').select('*').order('sort_order')
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Condições de pagamento</h1>
      <p className="text-sm text-muted-foreground">
        Cada condição aparece no orçamento somente se o total estiver dentro da faixa (mín/máx).
      </p>
      {(conds ?? []).map(c => (
        <div key={c.id} className="space-y-1">
          <ConditionForm c={c} />
          <form action={deleteCondition}>
            <input type="hidden" name="id" value={c.id} />
            <button className="text-xs text-red-600 underline">excluir</button>
          </form>
        </div>
      ))}
      <h2 className="font-semibold">Nova condição</h2>
      <ConditionForm />
    </div>
  )
}
```

- [ ] **Step 3: Verificar**

`/admin/pagamento`: 6 condições do seed; editar faixa de uma, salvar → persiste.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: CRUD de condições de pagamento com faixas"
```

---

### Task 11: Admin — usuários

**Files:**
- Create: `src/app/(app)/admin/usuarios/page.tsx`
- Create: `src/app/(app)/admin/usuarios/actions.ts`

**Interfaces:**
- Consumes: `getProfile`, `createAdminClient` (Task 5)
- Produces: actions `createUser(formData)` (cria auth user + profile via service role; exige chamador admin), `updateUser(formData)` (papel/ativo)

- [ ] **Step 1: Actions**

`src/app/(app)/admin/usuarios/actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdmin() {
  const { profile } = await getProfile()
  if (profile.role !== 'admin') throw new Error('Apenas admin')
}

export async function createUser(fd: FormData) {
  await requireAdmin()
  const email = String(fd.get('email') ?? '').trim()
  const password = String(fd.get('password') ?? '')
  const name = String(fd.get('name') ?? '').trim()
  const role = String(fd.get('role')) === 'admin' ? 'admin' : 'vendedor'
  if (!email || password.length < 8 || !name) throw new Error('Dados inválidos (senha mínima: 8 caracteres)')
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(error.message)
  const { error: pErr } = await admin.from('profiles').insert({ id: data.user.id, email, name, role })
  if (pErr) throw new Error(pErr.message)
  revalidatePath('/admin/usuarios')
}

export async function updateUser(fd: FormData) {
  await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({
    role: String(fd.get('role')) === 'admin' ? 'admin' : 'vendedor',
    active: fd.get('active') === 'on',
  }).eq('id', String(fd.get('id')))
  if (error) throw new Error(error.message)
  revalidatePath('/admin/usuarios')
}
```

- [ ] **Step 2: Página**

`src/app/(app)/admin/usuarios/page.tsx`:

```tsx
import { getProfile } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createUser, updateUser } from './actions'

export default async function UsuariosPage() {
  const { supabase } = await getProfile()
  const { data: users } = await supabase.from('profiles').select('*').order('created_at')
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Usuários</h1>
      <ul className="space-y-2">
        {(users ?? []).map(u => (
          <li key={u.id}>
            <form action={updateUser} className="flex flex-wrap items-center gap-2 rounded border p-3">
              <input type="hidden" name="id" value={u.id} />
              <span className="font-medium">{u.name}</span>
              <span className="text-sm text-muted-foreground">{u.email}</span>
              <select name="role" defaultValue={u.role} className="rounded border bg-background p-1 text-sm">
                <option value="vendedor">Vendedor</option>
                <option value="admin">Admin</option>
              </select>
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="active" defaultChecked={u.active} /> Ativo
              </label>
              <Button size="sm" variant="outline" type="submit">Salvar</Button>
            </form>
          </li>
        ))}
      </ul>
      <h2 className="font-semibold">Novo usuário</h2>
      <form action={createUser} className="flex flex-wrap items-end gap-2 rounded border p-3">
        <div><label className="text-xs">Nome</label><Input name="name" required /></div>
        <div><label className="text-xs">E-mail</label><Input name="email" type="email" required /></div>
        <div><label className="text-xs">Senha (mín. 8)</label><Input name="password" type="password" required minLength={8} /></div>
        <select name="role" defaultValue="vendedor" className="rounded border bg-background p-2 text-sm">
          <option value="vendedor">Vendedor</option>
          <option value="admin">Admin</option>
        </select>
        <Button size="sm" type="submit">Criar</Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Verificar**

Criar usuário vendedor teste. Logar como vendedor em aba anônima → `/admin/produtos` redireciona para `/`; nav não mostra Admin. Tentar update em `product_types` como vendedor (via UI não há; RLS cobre). Voltar como admin.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: gestão de usuários (criar, papel, ativo) via service role"
```

---

### Task 12: Lista de orçamentos

**Files:**
- Modify: `src/app/(app)/page.tsx` (substitui placeholder)
- Create: `src/components/quote/status-badge.tsx`

**Interfaces:**
- Consumes: `getProfile`, `formatBRL`
- Produces: `StatusBadge { status: string }`; lista com busca `?q=` e filtro `?status=`; links para `/orcamentos/[id]` e botão `Novo orçamento` → `/orcamentos/novo`

- [ ] **Step 1: StatusBadge**

`src/components/quote/status-badge.tsx`:

```tsx
import { Badge } from '@/components/ui/badge'

const map: Record<string, { label: string; cls: string }> = {
  rascunho: { label: 'Rascunho', cls: 'bg-gray-200 text-gray-800' },
  enviado: { label: 'Enviado', cls: 'bg-blue-100 text-blue-800' },
  aprovado: { label: 'Aprovado', cls: 'bg-green-100 text-green-800' },
  recusado: { label: 'Recusado', cls: 'bg-red-100 text-red-800' },
}

export function StatusBadge({ status }: { status: string }) {
  const s = map[status] ?? map.rascunho
  return <Badge variant="outline" className={s.cls}>{s.label}</Badge>
}
```

- [ ] **Step 2: Página lista**

`src/app/(app)/page.tsx`:

```tsx
import Link from 'next/link'
import { getProfile } from '@/lib/auth'
import { formatBRL } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/quote/status-badge'

const STATUSES = ['rascunho', 'enviado', 'aprovado', 'recusado'] as const

export default async function Home({ searchParams }: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const { q = '', status = '' } = await searchParams
  const { supabase } = await getProfile()
  let query = supabase.from('quotes').select('*').order('created_at', { ascending: false }).limit(100)
  if (q) query = query.ilike('customer_name', `%${q}%`)
  if (status) query = query.eq('status', status)
  const { data: quotes } = await query
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Orçamentos</h1>
        <Button asChild><Link href="/orcamentos/novo">Novo orçamento</Link></Button>
      </div>
      <form className="flex gap-2">
        <Input name="q" placeholder="Buscar cliente…" defaultValue={q} />
        <select name="status" defaultValue={status} className="rounded border bg-background p-2 text-sm">
          <option value="">Todos</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button variant="outline" type="submit">Filtrar</Button>
      </form>
      <ul className="space-y-2">
        {(quotes ?? []).map(qt => (
          <li key={qt.id}>
            <Link href={`/orcamentos/${qt.id}`} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">{qt.customer_name}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(qt.created_at).toLocaleDateString('pt-BR')} · {formatBRL(qt.total)}
                </p>
              </div>
              <StatusBadge status={qt.status} />
            </Link>
          </li>
        ))}
        {(quotes ?? []).length === 0 && <p className="text-muted-foreground">Nenhum orçamento.</p>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Verificar**

`/` mostra lista vazia + botão Novo. Busca/filtro não quebram com lista vazia.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: lista de orçamentos com busca e filtro de status"
```

---

### Task 13: Editor de orçamento + save com snapshot no servidor

**Files:**
- Create: `src/app/(app)/orcamentos/actions.ts`
- Create: `src/app/(app)/orcamentos/novo/page.tsx`
- Create: `src/app/(app)/orcamentos/[id]/page.tsx`
- Create: `src/components/quote/quote-editor.tsx`
- Create: `src/components/quote/item-form.tsx`

**Interfaces:**
- Consumes: `buildSnapshot`, `ItemSelection`, `calcQuoteTotal`, `PricingError` (Tasks 2/4), `ProductConfig` (Task 4), `applicableConditions` (Task 3), `getProfile`, `formatBRL`, `parseDecimal`, `StatusBadge` (Task 12)
- Produces:
  - Action `saveQuote(input: SaveQuoteInput): Promise<{ id: string } | { error: string }>` com
    ```ts
    SaveQuoteInput {
      id?: string
      customerName: string; customerPhone: string; siteAddress: string
      discount: number
      items: ItemSelection[]
    }
    ```
    Servidor: refaz snapshots com config atual, recalcula totais, upsert `quotes` + delete/insert `quote_items`. Cria com `valid_until = hoje + default_validity_days`.
  - Action `setStatus(id: string, status: 'rascunho'|'enviado'|'aprovado'|'recusado')`
  - Componente `QuoteEditor { products: ProductConfig[]; quote?: ExistingQuote }` onde `ExistingQuote { id: string; customer_name: string; customer_phone: string; site_address: string; discount: number; status: string; token: string; items: ItemSelection[] }`
  - Helper exportado `fetchProductConfigs(supabase): Promise<ProductConfig[]>` em `src/lib/queries.ts` — select `product_types` ativos com `option_groups(*, options(*))` e `models(*)`, filtrando opções/modelos ativos e ordenando por `sort_order`

- [ ] **Step 1: Query helper**

`src/lib/queries.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProductConfig } from '@/lib/config-types'

export async function fetchProductConfigs(supabase: SupabaseClient): Promise<ProductConfig[]> {
  const { data, error } = await supabase.from('product_types')
    .select('*, option_groups(*, options(*)), models(*)')
    .eq('active', true)
    .order('sort_order')
  if (error) throw new Error(error.message)
  const products = (data ?? []) as unknown as ProductConfig[]
  for (const p of products) {
    p.option_groups.sort((a, b) => a.sort_order - b.sort_order)
    for (const g of p.option_groups) {
      g.options = g.options.filter(o => o.active).sort((a, b) => a.sort_order - b.sort_order)
    }
    p.models = p.models.filter(m => m.active).sort((a, b) => a.sort_order - b.sort_order)
  }
  return products
}
```

- [ ] **Step 2: Actions**

`src/app/(app)/orcamentos/actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { fetchProductConfigs } from '@/lib/queries'
import { PricingError, calcQuoteTotal } from '@/lib/pricing/calc'
import { buildSnapshot, type ItemSelection } from '@/lib/pricing/snapshot'

export interface SaveQuoteInput {
  id?: string
  customerName: string
  customerPhone: string
  siteAddress: string
  discount: number
  items: ItemSelection[]
}

export async function saveQuote(input: SaveQuoteInput): Promise<{ id: string } | { error: string }> {
  const { supabase, user } = await getProfile()
  try {
    if (!input.customerName.trim()) return { error: 'Informe o nome do cliente' }
    if (input.items.length === 0) return { error: 'Adicione pelo menos um item' }

    const products = await fetchProductConfigs(supabase)
    const snapshots = input.items.map(sel => {
      const p = products.find(p => p.id === sel.productTypeId)
      if (!p) throw new PricingError('Produto não encontrado ou inativo — remova o item')
      return buildSnapshot(p, sel)
    })
    const { subtotal, total } = calcQuoteTotal(snapshots.map(s => s.line_total), input.discount)

    const quoteRow = {
      customer_name: input.customerName.trim(),
      customer_phone: input.customerPhone.trim(),
      site_address: input.siteAddress.trim(),
      discount: input.discount,
      subtotal,
      total,
      updated_at: new Date().toISOString(),
    }

    let quoteId = input.id
    if (quoteId) {
      const { error } = await supabase.from('quotes').update(quoteRow).eq('id', quoteId)
      if (error) throw new Error(error.message)
      const { error: dErr } = await supabase.from('quote_items').delete().eq('quote_id', quoteId)
      if (dErr) throw new Error(dErr.message)
    } else {
      const { data: settings } = await supabase.from('company_settings')
        .select('default_validity_days').eq('id', 1).single()
      const days = settings?.default_validity_days ?? 15
      const validUntil = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
      const { data, error } = await supabase.from('quotes')
        .insert({ ...quoteRow, created_by: user.id, valid_until: validUntil })
        .select('id').single()
      if (error) throw new Error(error.message)
      quoteId = data.id as string
    }

    const rows = snapshots.map((s, i) => ({ ...s, quote_id: quoteId, sort_order: i }))
    const { error: iErr } = await supabase.from('quote_items').insert(rows)
    if (iErr) throw new Error(iErr.message)

    revalidatePath('/')
    revalidatePath(`/orcamentos/${quoteId}`)
    return { id: quoteId! }
  } catch (e) {
    if (e instanceof PricingError) return { error: e.message }
    return { error: 'Erro ao salvar: ' + (e instanceof Error ? e.message : String(e)) }
  }
}

export async function setStatus(id: string, status: 'rascunho' | 'enviado' | 'aprovado' | 'recusado') {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('quotes')
    .update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/')
  revalidatePath(`/orcamentos/${id}`)
}
```

- [ ] **Step 3: Formulário de item (client)**

`src/components/quote/item-form.tsx`:

```tsx
'use client'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ProductConfig } from '@/lib/config-types'
import { formatBRL, parseDecimal } from '@/lib/format'
import { PricingError } from '@/lib/pricing/calc'
import { buildSnapshot, type ItemSelection } from '@/lib/pricing/snapshot'

export function ItemForm({ products, initial, onConfirm, onCancel }: {
  products: ProductConfig[]
  initial?: ItemSelection
  onConfirm: (sel: ItemSelection) => void
  onCancel: () => void
}) {
  const [productId, setProductId] = useState(initial?.productTypeId ?? products[0]?.id ?? '')
  const [optionIds, setOptionIds] = useState<string[]>(initial?.optionIds ?? [])
  const [modelId, setModelId] = useState<string | null>(initial?.modelId ?? null)
  const [width, setWidth] = useState(initial?.widthM?.toString() ?? '')
  const [height, setHeight] = useState(initial?.heightM?.toString() ?? '')
  const [manualStr, setManualStr] = useState(initial?.manualPrice?.toString() ?? '')
  const [qty, setQty] = useState(initial?.qty ?? 1)

  const product = products.find(p => p.id === productId)

  const sel: ItemSelection = useMemo(() => ({
    productTypeId: productId,
    modelId,
    optionIds,
    widthM: width ? parseDecimal(width) : null,
    heightM: height ? parseDecimal(height) : null,
    manualPrice: manualStr ? parseDecimal(manualStr) : null,
    qty,
  }), [productId, modelId, optionIds, width, height, manualStr, qty])

  const preview = useMemo(() => {
    if (!product) return { error: 'Escolha um produto' }
    try { return { snap: buildSnapshot(product, sel) } }
    catch (e) { return { error: e instanceof PricingError ? e.message : 'Erro no cálculo' } }
  }, [product, sel])

  function pickOption(groupOptionIds: string[], optionId: string) {
    // escolha única por grupo: remove os demais ids do grupo e adiciona o clicado
    setOptionIds(ids => [...ids.filter(i => !groupOptionIds.includes(i)), optionId])
  }

  if (!product) return <p className="text-sm text-red-600">Nenhum produto ativo cadastrado.</p>

  return (
    <div className="space-y-4 rounded border p-3">
      <div className="space-y-1">
        <Label>Produto</Label>
        <select value={productId} className="w-full rounded border bg-background p-2"
          onChange={e => { setProductId(e.target.value); setOptionIds([]); setModelId(null) }}>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {product.pricing_mode !== 'fixo' && (
        <div className="flex gap-2">
          <div className="space-y-1 flex-1">
            <Label>Largura (m){product.pricing_mode === 'manual' && ' — opcional'}</Label>
            <Input inputMode="decimal" value={width} onChange={e => setWidth(e.target.value)} placeholder="2,50" />
          </div>
          <div className="space-y-1 flex-1">
            <Label>Altura (m){product.pricing_mode === 'manual' && ' — opcional'}</Label>
            <Input inputMode="decimal" value={height} onChange={e => setHeight(e.target.value)} placeholder="2,10" />
          </div>
        </div>
      )}

      {product.pricing_mode === 'manual' && (
        <div className="space-y-1">
          <Label>Valor combinado (R$) — orçado pela responsável</Label>
          <Input inputMode="decimal" value={manualStr} onChange={e => setManualStr(e.target.value)} placeholder="3.200,00" />
        </div>
      )}

      {product.option_groups.map(g => (
        <div key={g.id} className="space-y-1">
          <Label>{g.name}{g.required && ' *'}</Label>
          <div className="flex flex-wrap gap-2">
            {g.options.map(o => {
              const selected = optionIds.includes(o.id)
              return (
                <button key={o.id} type="button"
                  onClick={() => pickOption(g.options.map(x => x.id), o.id)}
                  className={`rounded border px-3 py-2 text-sm ${selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'}`}>
                  {o.label}{o.surcharge_value > 0 && ` (+${formatBRL(o.surcharge_value)}${o.surcharge_type === 'por_m2' ? '/m²' : ''})`}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {product.models.length > 0 && (
        <div className="space-y-1">
          <Label>Modelo (opcional)</Label>
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button type="button" onClick={() => setModelId(null)}
              className={`shrink-0 rounded border px-3 py-2 text-sm ${modelId == null ? 'border-primary' : ''}`}>
              Sem modelo
            </button>
            {product.models.map(m => (
              <button key={m.id} type="button" onClick={() => setModelId(m.id)}
                className={`shrink-0 rounded border p-1 text-center text-xs ${modelId === m.id ? 'border-primary ring-2 ring-primary' : ''}`}>
                {m.photo_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={m.photo_url} alt={m.name} className="h-20 w-24 rounded object-cover" />
                  : <div className="flex h-20 w-24 items-center justify-center rounded bg-muted">sem foto</div>}
                <p className="mt-1 w-24 truncate">{m.name}{m.surcharge > 0 && ` +${formatBRL(m.surcharge)}`}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label>Quantidade</Label>
        <Input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value)))} className="w-24" />
      </div>

      {'snap' in preview
        ? <p className="font-semibold">
            {preview.snap.area_m2 != null && <span className="mr-2 text-sm text-muted-foreground">{preview.snap.area_m2} m²</span>}
            Subtotal do item: {formatBRL(preview.snap.line_total)}
          </p>
        : <p className="text-sm text-amber-700">{preview.error}</p>}

      <div className="flex gap-2">
        <Button type="button" disabled={!('snap' in preview)} onClick={() => onConfirm(sel)}>
          {initial ? 'Atualizar item' : 'Adicionar ao orçamento'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Editor do orçamento (client)**

`src/components/quote/quote-editor.tsx`:

```tsx
'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ProductConfig } from '@/lib/config-types'
import { formatBRL, parseDecimal } from '@/lib/format'
import { PricingError, calcQuoteTotal } from '@/lib/pricing/calc'
import { buildSnapshot, type ItemSelection, type ItemSnapshot } from '@/lib/pricing/snapshot'
import { saveQuote } from '@/app/(app)/orcamentos/actions'
import { ItemForm } from './item-form'

export interface ExistingQuote {
  id: string
  customer_name: string
  customer_phone: string
  site_address: string
  discount: number
  status: string
  token: string
  items: ItemSelection[]
}

export function QuoteEditor({ products, quote }: { products: ProductConfig[]; quote?: ExistingQuote }) {
  const router = useRouter()
  const [customerName, setCustomerName] = useState(quote?.customer_name ?? '')
  const [customerPhone, setCustomerPhone] = useState(quote?.customer_phone ?? '')
  const [siteAddress, setSiteAddress] = useState(quote?.site_address ?? '')
  const [discountStr, setDiscountStr] = useState(quote?.discount ? String(quote.discount) : '')
  const [items, setItems] = useState<ItemSelection[]>(quote?.items ?? [])
  const [editing, setEditing] = useState<number | 'new' | null>(quote ? null : 'new')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const computed = useMemo(() => {
    const snaps: (ItemSnapshot | { error: string })[] = items.map(sel => {
      const p = products.find(p => p.id === sel.productTypeId)
      if (!p) return { error: 'Produto removido da tabela — exclua este item' }
      try { return buildSnapshot(p, sel) } catch (e) {
        return { error: e instanceof PricingError ? e.message : 'Erro' }
      }
    })
    const valid = snaps.filter((s): s is ItemSnapshot => !('error' in s))
    const discount = discountStr ? parseDecimal(discountStr) : 0
    let totals = { subtotal: 0, total: 0 }
    let totalError = ''
    try { totals = calcQuoteTotal(valid.map(s => s.line_total), discount) }
    catch (e) { totalError = e instanceof PricingError ? e.message : 'Erro' }
    return { snaps, totals, totalError, allValid: valid.length === items.length }
  }, [items, products, discountStr])

  async function onSave() {
    setSaving(true); setError('')
    const res = await saveQuote({
      id: quote?.id,
      customerName, customerPhone, siteAddress,
      discount: discountStr ? parseDecimal(discountStr) : 0,
      items,
    })
    if ('error' in res) { setError(res.error); setSaving(false); return }
    router.push(`/orcamentos/${res.id}`)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="font-semibold">Cliente</h2>
        <div className="space-y-1"><Label>Nome *</Label>
          <Input value={customerName} onChange={e => setCustomerName(e.target.value)} /></div>
        <div className="space-y-1"><Label>Telefone/WhatsApp</Label>
          <Input inputMode="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} /></div>
        <div className="space-y-1"><Label>Endereço da obra</Label>
          <Input value={siteAddress} onChange={e => setSiteAddress(e.target.value)} /></div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Itens</h2>
        {items.map((sel, i) => {
          const s = computed.snaps[i]
          if (editing === i) {
            return <ItemForm key={i} products={products} initial={sel}
              onConfirm={ns => { setItems(arr => arr.map((x, j) => j === i ? ns : x)); setEditing(null) }}
              onCancel={() => setEditing(null)} />
          }
          return (
            <div key={i} className="flex items-start justify-between rounded border p-3">
              {'error' in s
                ? <p className="text-sm text-red-600">{s.error}</p>
                : <div className="text-sm">
                    <p className="font-medium">{s.product_name}{s.model_name && ` — ${s.model_name}`}</p>
                    <p className="text-muted-foreground">
                      {s.area_m2 != null && `${s.width_m} × ${s.height_m} m (${s.area_m2} m²) · `}
                      {s.selected_options.map(o => o.label).join(', ')}
                      {s.qty > 1 && ` · ${s.qty}un`}
                    </p>
                    <p className="font-semibold">{formatBRL(s.line_total)}</p>
                  </div>}
              <div className="flex shrink-0 gap-2 text-sm">
                <button className="underline" onClick={() => setEditing(i)}>editar</button>
                <button className="text-red-600 underline"
                  onClick={() => setItems(arr => arr.filter((_, j) => j !== i))}>remover</button>
              </div>
            </div>
          )
        })}
        {editing === 'new'
          ? <ItemForm products={products}
              onConfirm={ns => { setItems(arr => [...arr, ns]); setEditing(null) }}
              onCancel={() => setEditing(null)} />
          : <Button variant="outline" onClick={() => setEditing('new')}>+ Adicionar item</Button>}
      </section>

      <section className="space-y-2 border-t pt-3">
        <div className="flex items-center gap-2">
          <Label className="shrink-0">Desconto (R$)</Label>
          <Input inputMode="decimal" value={discountStr} onChange={e => setDiscountStr(e.target.value)} className="w-28" />
        </div>
        <p className="text-sm text-muted-foreground">Subtotal: {formatBRL(computed.totals.subtotal)}</p>
        <p className="text-lg font-bold">Total: {formatBRL(computed.totals.total)}</p>
        {computed.totalError && <p className="text-sm text-red-600">{computed.totalError}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={onSave} disabled={saving || !computed.allValid || !!computed.totalError || items.length === 0 || !customerName.trim()}>
          {saving ? 'Salvando…' : 'Salvar orçamento'}
        </Button>
        <p className="text-xs text-muted-foreground">Ao salvar, os preços são recalculados pela tabela atual e congelados no orçamento.</p>
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Páginas novo e detalhe**

`src/app/(app)/orcamentos/novo/page.tsx`:

```tsx
import { getProfile } from '@/lib/auth'
import { fetchProductConfigs } from '@/lib/queries'
import { QuoteEditor } from '@/components/quote/quote-editor'

export default async function NovoOrcamento() {
  const { supabase } = await getProfile()
  const products = await fetchProductConfigs(supabase)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Novo orçamento</h1>
      <QuoteEditor products={products} />
    </div>
  )
}
```

`src/app/(app)/orcamentos/[id]/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { fetchProductConfigs } from '@/lib/queries'
import { QuoteEditor, type ExistingQuote } from '@/components/quote/quote-editor'
import { StatusBadge } from '@/components/quote/status-badge'
import { Button } from '@/components/ui/button'
import { setStatus } from '../actions'
import type { ItemSelection } from '@/lib/pricing/snapshot'

export default async function OrcamentoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await getProfile()
  const [{ data: quote }, products] = await Promise.all([
    supabase.from('quotes').select('*, quote_items(*)').eq('id', id).single(),
    fetchProductConfigs(supabase),
  ])
  if (!quote) notFound()

  // reconstrói seleções a partir dos snapshots (ids salvos)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: ItemSelection[] = (quote.quote_items as any[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(it => ({
      productTypeId: it.product_type_id ?? '',
      modelId: it.model_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      optionIds: (it.selected_options as any[]).map(o => o.optionId).filter(Boolean),
      widthM: it.width_m != null ? Number(it.width_m) : null,
      heightM: it.height_m != null ? Number(it.height_m) : null,
      // usado só quando o produto é de preço manual (unit_base_price = valor digitado)
      manualPrice: Number(it.unit_base_price),
      qty: it.qty,
    }))

  const existing: ExistingQuote = {
    id: quote.id, customer_name: quote.customer_name, customer_phone: quote.customer_phone,
    site_address: quote.site_address, discount: Number(quote.discount), status: quote.status,
    token: quote.token, items,
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">Orçamento — {quote.customer_name}</h1>
        <StatusBadge status={quote.status} />
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <Link href={`/orcamentos/${quote.id}/apresentacao`}>Apresentar / Compartilhar</Link>
        </Button>
      </div>
      <div className="no-print flex gap-2 text-sm">
        {quote.status !== 'aprovado' && (
          <form action={setStatus.bind(null, quote.id, 'aprovado')}><button className="text-green-700 underline">Marcar aprovado</button></form>
        )}
        {quote.status !== 'recusado' && (
          <form action={setStatus.bind(null, quote.id, 'recusado')}><button className="text-red-700 underline">Marcar recusado</button></form>
        )}
      </div>
      <QuoteEditor products={products} quote={existing} />
    </div>
  )
}
```

- [ ] **Step 6: Verificar**

`npm run test` → PASS. `npm run dev`: criar orçamento com Portão 2,00×2,10 (De Correr, Sem social, Bronze) + Box 1,20×1,90 (Padrão, Reto, Incolor, Branco); conferir subtotais na tela contra cálculo manual (portão: 4,2 m² × 650 + 250 = 2.980,00; box: 2,28 m² × 500 = 1.140,00; total 4.120,00). Testar também Basculante (+2.000 → 4.980,00), Social Embutido (+50/m²: 4,2 × 700 + 250 = 3.190,00 no correr) e a Linha Suprema (sob consulta): adicionar item, digitar valor combinado 3.200,00 → entra no total como 3.200,00; sem valor → aviso e não deixa salvar. Salvar → cai no detalhe; editar item, salvar de novo → atualiza (inclusive o valor manual reaparece no campo). Verificar no banco (`execute_sql`): `select unit_total, line_total, selected_options from quote_items` → snapshots com optionId/labels.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: editor de orçamento com cálculo ao vivo e snapshot no servidor"
```

---

### Task 14: Apresentação (componente compartilhado + rota interna)

**Files:**
- Create: `src/components/presentation/quote-presentation.tsx`
- Create: `src/app/(app)/orcamentos/[id]/apresentacao/page.tsx`
- Create: `src/components/quote/share-bar.tsx`

**Interfaces:**
- Consumes: `formatBRL`, `applicableConditions` (Task 3), `setStatus` (Task 13)
- Produces:
  - `QuotePresentation { company, quote, items, conditions }` — server-safe (sem hooks), usado pela rota interna e pela pública (Task 15). Tipos:
    ```ts
    CompanyInfo { name: string; logo_url: string|null; city: string; phone: string; about_text: string; warranty_text: string }
    QuoteInfo { customer_name: string; site_address: string; status: string; discount: number; subtotal: number; total: number; valid_until: string|null; created_at: string }
    ItemInfo = linha de quote_items (snapshot)
    ```
  - `ShareBar { quoteId: string; token: string; customerName: string; total: number; markSent: boolean }` (client): botões WhatsApp / Copiar link / Baixar PDF (window.print); WhatsApp e Copiar chamam `setStatus(quoteId, 'enviado')` se `markSent`

- [ ] **Step 1: Componente de apresentação**

`src/components/presentation/quote-presentation.tsx`:

```tsx
import { formatBRL } from '@/lib/format'

/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
export function QuotePresentation({ company, quote, items, conditions }: {
  company: any; quote: any; items: any[]; conditions: { description: string }[]
}) {
  return (
    <article className="mx-auto max-w-2xl space-y-6 p-4 print:p-0">
      <header className="flex items-center gap-4 border-b pb-4">
        {company?.logo_url && <img src={company.logo_url} alt="" className="h-16 w-16 rounded object-contain" />}
        <div>
          <h1 className="text-2xl font-bold">{company?.name}</h1>
          <p className="text-sm text-muted-foreground">{company?.city}{company?.phone && ` · ${company.phone}`}</p>
        </div>
      </header>

      <section>
        <h2 className="text-lg font-semibold">Orçamento</h2>
        <p className="text-sm">
          Cliente: <strong>{quote.customer_name}</strong>
          {quote.site_address && <> · Obra: {quote.site_address}</>}
        </p>
        <p className="text-sm text-muted-foreground">
          Data: {new Date(quote.created_at).toLocaleDateString('pt-BR')}
          {quote.valid_until && ` · Válido até ${new Date(quote.valid_until + 'T12:00:00').toLocaleDateString('pt-BR')}`}
        </p>
      </section>

      <section className="space-y-3">
        {items.map((it, i) => (
          <div key={i} className="flex gap-3 rounded border p-3">
            {it.model_photo_url && <img src={it.model_photo_url} alt="" className="h-20 w-24 rounded object-cover" />}
            <div className="flex-1 text-sm">
              <p className="font-semibold">{it.product_name}{it.model_name && ` — ${it.model_name}`}</p>
              {it.area_m2 != null && (
                <p className="text-muted-foreground">{Number(it.width_m).toLocaleString('pt-BR')} × {Number(it.height_m).toLocaleString('pt-BR')} m ({Number(it.area_m2).toLocaleString('pt-BR')} m²)</p>
              )}
              {(it.selected_options as any[]).length > 0 && (
                <p className="text-muted-foreground">{(it.selected_options as any[]).map(o => o.label).join(' · ')}</p>
              )}
              {it.qty > 1 && <p className="text-muted-foreground">Quantidade: {it.qty}</p>}
            </div>
            <p className="shrink-0 font-semibold">{formatBRL(Number(it.line_total))}</p>
          </div>
        ))}
      </section>

      <section className="space-y-1 border-t pt-3 text-right">
        {Number(quote.discount) > 0 && (
          <>
            <p className="text-sm text-muted-foreground">Subtotal: {formatBRL(Number(quote.subtotal))}</p>
            <p className="text-sm text-green-700">Desconto: −{formatBRL(Number(quote.discount))}</p>
          </>
        )}
        <p className="text-2xl font-bold">Total: {formatBRL(Number(quote.total))}</p>
      </section>

      {conditions.length > 0 && (
        <section>
          <h2 className="font-semibold">Formas de pagamento</h2>
          <ul className="list-inside list-disc text-sm">
            {conditions.map((c, i) => <li key={i}>{c.description}</li>)}
          </ul>
        </section>
      )}

      {company?.warranty_text && (
        <section>
          <h2 className="font-semibold">Garantias</h2>
          <p className="whitespace-pre-line text-sm">{company.warranty_text}</p>
        </section>
      )}

      {company?.about_text && (
        <section className="border-t pt-3">
          <p className="whitespace-pre-line text-sm text-muted-foreground">{company.about_text}</p>
        </section>
      )}
    </article>
  )
}
```

- [ ] **Step 2: ShareBar (client)**

`src/components/quote/share-bar.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { setStatus } from '@/app/(app)/orcamentos/actions'
import { formatBRL } from '@/lib/format'

export function ShareBar({ quoteId, token, customerName, total, markSent }: {
  quoteId: string; token: string; customerName: string; total: number; markSent: boolean
}) {
  const [copied, setCopied] = useState(false)
  const publicUrl = () => `${window.location.origin}/o/${token}`

  async function sent() { if (markSent) await setStatus(quoteId, 'enviado') }

  return (
    <div className="no-print flex flex-wrap gap-2">
      <Button onClick={async () => {
        const msg = `Olá, ${customerName}! Segue seu orçamento (total ${formatBRL(total)}): ${publicUrl()}`
        await sent()
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
      }}>WhatsApp</Button>
      <Button variant="outline" onClick={async () => {
        await navigator.clipboard.writeText(publicUrl())
        await sent()
        setCopied(true); setTimeout(() => setCopied(false), 2000)
      }}>{copied ? 'Copiado!' : 'Copiar link'}</Button>
      <Button variant="outline" onClick={() => window.print()}>Baixar PDF</Button>
    </div>
  )
}
```

- [ ] **Step 3: Rota interna de apresentação**

`src/app/(app)/orcamentos/[id]/apresentacao/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { applicableConditions } from '@/lib/pricing/payment'
import { QuotePresentation } from '@/components/presentation/quote-presentation'
import { ShareBar } from '@/components/quote/share-bar'

export default async function Apresentacao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await getProfile()
  const [{ data: quote }, { data: company }, { data: conds }] = await Promise.all([
    supabase.from('quotes').select('*, quote_items(*)').eq('id', id).single(),
    supabase.from('company_settings').select('*').eq('id', 1).single(),
    supabase.from('payment_conditions').select('*'),
  ])
  if (!quote) notFound()
  const conditions = applicableConditions(conds ?? [], Number(quote.total))
  const items = [...quote.quote_items].sort((a, b) => a.sort_order - b.sort_order)
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center gap-2">
        <Link href={`/orcamentos/${id}`} className="text-sm underline">← Voltar</Link>
        <div className="ml-auto">
          <ShareBar quoteId={quote.id} token={quote.token} customerName={quote.customer_name}
            total={Number(quote.total)} markSent={quote.status === 'rascunho'} />
        </div>
      </div>
      <QuotePresentation company={company} quote={quote} items={items} conditions={conditions} />
    </div>
  )
}
```

- [ ] **Step 4: Verificar**

Abrir apresentação do orçamento da Task 13: layout limpo, condições corretas para o total (4.120,00 → aparece "até 3x" e "10x", some "até 5x" e "12x"); Baixar PDF → diálogo de impressão sem nav/botões; WhatsApp abre wa.me com mensagem e status vira `enviado`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: modo apresentação com compartilhamento WhatsApp e PDF"
```

---

### Task 15: Página pública `/o/[token]`

**Files:**
- Create: `src/app/o/[token]/page.tsx`
- Create: `src/app/o/[token]/print-button.tsx`

**Interfaces:**
- Consumes: `createAdminClient` (Task 5), `QuotePresentation` (Task 14), `applicableConditions`
- Produces: rota pública sem login; 404 para token inválido; `noindex`

- [ ] **Step 1: Página pública**

`src/app/o/[token]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { applicableConditions } from '@/lib/pricing/payment'
import { QuotePresentation } from '@/components/presentation/quote-presentation'
import { PrintButton } from './print-button'

export const metadata = { robots: { index: false, follow: false } }

export default async function OrcamentoPublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[a-f0-9]{32}$/.test(token)) notFound()
  const admin = createAdminClient()
  const [{ data: quote }, { data: company }, { data: conds }] = await Promise.all([
    admin.from('quotes').select('*, quote_items(*)').eq('token', token).single(),
    admin.from('company_settings').select('*').eq('id', 1).single(),
    admin.from('payment_conditions').select('*'),
  ])
  if (!quote) notFound()
  const conditions = applicableConditions(conds ?? [], Number(quote.total))
  const items = [...quote.quote_items].sort((a, b) => a.sort_order - b.sort_order)
  return (
    <main className="min-h-dvh bg-background">
      <QuotePresentation company={company} quote={quote} items={items} conditions={conditions} />
      <div className="mx-auto max-w-2xl p-4">
        <PrintButton />
      </div>
    </main>
  )
}
```

`src/app/o/[token]/print-button.tsx`:

```tsx
'use client'
import { Button } from '@/components/ui/button'

export function PrintButton() {
  return <Button variant="outline" className="no-print" onClick={() => window.print()}>Baixar PDF</Button>
}
```

- [ ] **Step 2: Verificar**

Copiar link na apresentação; abrir em janela anônima (sem login) → orçamento aparece; token alterado → 404; `curl -I http://localhost:3000/o/<token>` → 200 sem redirect (middleware exclui `o/`).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: página pública do orçamento por token"
```

---

### Task 16: Deploy Vercel + verificação ponta a ponta

**Files:**
- Modify: nenhum código novo (ajustes só se a verificação achar problema)

**Interfaces:**
- Consumes: tudo
- Produces: app em produção na Vercel

- [ ] **Step 1: Build local**

Run: `npm run build && npm run test` → Expected: ambos PASS.

- [ ] **Step 2: Deploy**

```bash
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel deploy --prod
```

(ou usar skill `vercel:deploy`)

- [ ] **Step 3: Checklist ponta a ponta em produção**

1. Login admin → OK
2. `/admin/produtos`: editar preço do Portão → salva
3. Criar orçamento completo no celular (ou viewport 380px): produto m² + opções + modelo com foto + produto fixo → totais corretos
4. Apresentação → WhatsApp abre com link; link em aba anônima → abre sem login
5. Baixar PDF → sai limpo (sem nav)
6. Mudar preço no admin → orçamento antigo NÃO muda; editar e salvar orçamento → recalcula
7. Login vendedor → sem link Admin; `/admin/empresa` redireciona
8. MCP `get_advisors` (security) → sem crítico

- [ ] **Step 4: Commit final + tag**

```bash
git add -A && git commit -m "chore: ajustes de deploy" --allow-empty
git tag v0.1.0
```

---

## Self-review (feito na escrita)

- **Cobertura do spec:** empresa ✔ (T7), produtos/opções/modelos ✔ (T8-9), pagamento por faixa ✔ (T10, motor T3), usuários/papéis ✔ (T11, RLS T5), lista+status ✔ (T12), editor+cálculo+snapshot ✔ (T2/T4/T13), apresentação ✔ (T14), link público+WhatsApp+PDF ✔ (T14-15), validade ✔ (T13 valid_until), garantias/textos ✔ (seed+T7+T14), deploy ✔ (T16)
- **Placeholders:** nenhum TBD; todo step com código completo
- **Consistência de tipos:** `ItemSelection`/`ItemSnapshot`/`SelectedOption` (camelCase no jsonb `selected_options`) usados idênticos em T4/T13/T14; `ProductConfig.option_groups/models` casa com o select do Supabase; `subtotal` adicionado a `quotes` (T5) e usado em T13/T14; modo `manual` presente em `PricingMode` (T2), `ProductConfig` (T4), check do schema (T5), `ProductForm` (T8) e `ItemForm`/reconstrução (T13) — `ItemSelection.manualPrice` percorre editor → `buildSnapshot` → `unit_base_price`
