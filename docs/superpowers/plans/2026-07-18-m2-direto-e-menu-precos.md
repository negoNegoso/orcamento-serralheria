# Modo m² direto + menu "Preços" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Novo modo de preço `m2_direto` (vendedor digita metragem em m², sem largura/altura) e renomear "Produtos" → "Preços" no menu e títulos.

**Architecture:** Quarto valor no enum `pricing_mode`. Cálculo centralizado em `src/lib/pricing/calc.ts` ganha ramo novo com campo `areaInputM2`; snapshot ganha `areaM2` na seleção; UI do item mostra campo único de metragem. Rota `/admin/produtos` permanece.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase (Postgres), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-18-m2-direto-e-menu-precos-design.md`

## Global Constraints

- Valores do enum: `'m2' | 'm2_direto' | 'fixo' | 'manual'` — exatamente estas strings.
- Rótulo do novo modo no admin: `Por m² (metragem direta)`.
- Rótulo do campo no form do item: `Metragem (m²)`.
- Menu/títulos: `Produtos` → `Preços`. Rota `/admin/produtos` e ícone `inventory_2` NÃO mudam.
- Mensagens de erro em pt-BR, padrão `PricingError`.
- Testes: `npx vitest run <arquivo>`; suite completa `npm test`.

---

### Task 1: Migration do banco

**Files:**
- Create: `supabase/migrations/0024_pricing_mode_m2_direto.sql`

**Interfaces:**
- Produces: coluna `product_types.pricing_mode` aceita `'m2_direto'`.

- [ ] **Step 1: Criar migration**

```sql
-- permite modo de preço por metragem direta (vendedor digita m²)
alter table product_types drop constraint product_types_pricing_mode_check;
alter table product_types add constraint product_types_pricing_mode_check
  check (pricing_mode in ('m2','m2_direto','fixo','manual'));
```

(Constraint criada inline sem nome na 0001 → nome default do Postgres é `product_types_pricing_mode_check`. Se o drop falhar por nome, buscar o nome real com `select conname from pg_constraint where conrelid = 'product_types'::regclass and contype = 'c';` e ajustar.)

- [ ] **Step 2: Aplicar no Supabase**

Aplicar via MCP Supabase `apply_migration` (name: `pricing_mode_m2_direto`, query = conteúdo do arquivo). Verificar sucesso.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0024_pricing_mode_m2_direto.sql
git commit -m "feat(db): modo de preço m2_direto no enum de pricing_mode"
```

---

### Task 2: Tipos e cálculo (TDD)

**Files:**
- Modify: `src/lib/pricing/types.ts`
- Modify: `src/lib/pricing/calc.ts`
- Test: `src/lib/pricing/calc.test.ts`

**Interfaces:**
- Produces: `PricingMode` inclui `'m2_direto'`; `ItemInput.areaInputM2?: number | null`; `calcItem` calcula base = round2(areaInputM2) × pricePerM2 no modo novo.

- [ ] **Step 1: Escrever testes que falham**

Adicionar em `src/lib/pricing/calc.test.ts`, após o describe `calcItem por m²`:

```ts
describe('calcItem m² direto (metragem digitada)', () => {
  const direto = (over: Partial<ItemInput> = {}): ItemInput => ({
    pricingMode: 'm2_direto', pricePerM2: 100, areaInputM2: 3,
    qty: 1, options: [], ...over,
  })
  it('base = metragem × preço/m²', () => {
    const r = calcItem(direto())
    expect(r.areaM2).toBe(3)
    expect(r.unitBasePrice).toBe(300)
    expect(r.unitTotal).toBe(300)
    expect(r.lineTotal).toBe(300)
  })
  it('arredonda metragem digitada para 2 casas', () => {
    expect(calcItem(direto({ areaInputM2: 3.456 })).areaM2).toBe(3.46)
  })
  it('adicional por m² multiplica pela metragem digitada', () => {
    const r = calcItem(direto({ options: [{ group: 'Vidro', label: 'Fumê', surchargeType: 'por_m2', surchargeValue: 50 }] }))
    expect(r.unitTotal).toBe(450) // 300 + 50×3
  })
  it('adicional do modelo por m² multiplica pela metragem', () => {
    const r = calcItem(direto({ modelSurcharge: 50, modelSurchargeType: 'por_m2' }))
    expect(r.unitTotal).toBe(450)
  })
  it('rejeita metragem ausente ou zero', () => {
    expect(() => calcItem(direto({ areaInputM2: 0 }))).toThrow(PricingError)
    expect(() => calcItem(direto({ areaInputM2: null }))).toThrow(PricingError)
  })
  it('rejeita produto sem preço por m² configurado', () => {
    expect(() => calcItem(direto({ pricePerM2: null }))).toThrow(PricingError)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/pricing/calc.test.ts`
Expected: FAIL — TypeScript rejeita `'m2_direto'`/`areaInputM2` (ou testes falham em runtime).

- [ ] **Step 3: Implementar tipos**

`src/lib/pricing/types.ts` — mudar linha 1 e adicionar campo no `ItemInput` após `basePrice`:

```ts
export type PricingMode = 'm2' | 'm2_direto' | 'fixo' | 'manual'
```

```ts
  /** modo m2_direto: metragem (m²) digitada pelo vendedor, sem largura/altura */
  areaInputM2?: number | null
```

- [ ] **Step 4: Implementar cálculo**

`src/lib/pricing/calc.ts` — inserir ramo entre o `if (input.pricingMode === 'm2')` e o `else if (input.pricingMode === 'manual')`:

```ts
  } else if (input.pricingMode === 'm2_direto') {
    if (!input.areaInputM2 || input.areaInputM2 <= 0) {
      throw new PricingError('Informe a metragem (m²) maior que zero')
    }
    if (input.pricePerM2 == null || input.pricePerM2 < 0) {
      throw new PricingError('Produto sem preço por m² configurado')
    }
    areaM2 = round2(input.areaInputM2)
    base = areaM2 * input.pricePerM2
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/pricing/calc.test.ts`
Expected: PASS (todos, incluindo os antigos).

- [ ] **Step 6: Commit**

```bash
git add src/lib/pricing/types.ts src/lib/pricing/calc.ts src/lib/pricing/calc.test.ts
git commit -m "feat(pricing): cálculo do modo m2_direto (metragem digitada)"
```

---

### Task 3: Snapshot (TDD)

**Files:**
- Modify: `src/lib/pricing/snapshot.ts`
- Test: `src/lib/pricing/snapshot.test.ts`

**Interfaces:**
- Consumes: `calcItem` com `areaInputM2` (Task 2).
- Produces: `ItemSelection.areaM2: number | null`; snapshot de `m2_direto` com `width_m`/`height_m` null e `area_m2` preenchido. **Breaking**: todo construtor de `ItemSelection` precisa do campo `areaM2` (Tasks 4 e 5 cobrem os usos em UI/página).

- [ ] **Step 1: Escrever testes que falham**

Em `src/lib/pricing/snapshot.test.ts`: adicionar `areaM2: null,` no helper `sel` (após `heightM: 1.5,`) e novo teste no fim do describe:

```ts
  it('produto m2_direto usa metragem digitada, sem largura/altura', () => {
    const tela: ProductConfig = {
      id: 'p3',
      name: 'Tela Mosquiteira',
      pricing_mode: 'm2_direto',
      price_per_m2: 80,
      base_price: null,
      active: true,
      sort_order: 0,
      option_groups: [],
      models: [],
    }
    const s = buildSnapshot(tela, sel({ productTypeId: 'p3', optionIds: [], widthM: null, heightM: null, areaM2: 2.5 }))
    expect(s.area_m2).toBe(2.5)
    expect(s.width_m).toBeNull()
    expect(s.height_m).toBeNull()
    expect(s.unit_base_price).toBe(200) // 2.5 × 80
    expect(s.line_total).toBe(200)
    expect(() => buildSnapshot(tela, sel({ productTypeId: 'p3', optionIds: [], areaM2: null })))
      .toThrow(PricingError)
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/pricing/snapshot.test.ts`
Expected: FAIL — `areaM2` não existe em `ItemSelection`.

- [ ] **Step 3: Implementar**

`src/lib/pricing/snapshot.ts`:

Em `ItemSelection`, após `heightM`:

```ts
  /** metragem (m²) digitada — só para produto m2_direto */
  areaM2: number | null
```

Em `buildSnapshot`, na chamada `calcItem`, após `basePrice`:

```ts
    areaInputM2: sel.areaM2,
```

Trocar a linha do `keepDims`:

```ts
  const keepDims = product.pricing_mode === 'm2' || product.pricing_mode === 'manual' // m2 obrigatório; manual opcional-informativo; m2_direto/fixo sem medidas
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/pricing/snapshot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/snapshot.ts src/lib/pricing/snapshot.test.ts
git commit -m "feat(pricing): snapshot do modo m2_direto com areaM2 na seleção"
```

---

### Task 4: Config types + form do item

**Files:**
- Modify: `src/lib/config-types.ts:31`
- Modify: `src/components/quote/item-form.tsx`

**Interfaces:**
- Consumes: `ItemSelection.areaM2` (Task 3).
- Produces: form do item com campo "Metragem (m²)" para produtos `m2_direto`.

- [ ] **Step 1: Atualizar config-types**

`src/lib/config-types.ts` linha 31:

```ts
  pricing_mode: 'm2' | 'm2_direto' | 'fixo' | 'manual'
```

- [ ] **Step 2: Atualizar item-form**

`src/components/quote/item-form.tsx`:

Novo estado após `const [height, setHeight] = ...`:

```ts
  const [areaStr, setAreaStr] = useState(initial?.areaM2?.toString() ?? '')
```

No `sel` (useMemo), após `heightM`, e incluir `areaStr` nas deps:

```ts
    areaM2: areaStr ? parseDecimal(areaStr) : null,
```

```ts
  }), [productId, modelId, optionIds, width, height, areaStr, manualStr, qty, extraStr, note])
```

Trocar a condição do bloco largura/altura (linha 68) de `product.pricing_mode !== 'fixo'` para:

```tsx
      {(product.pricing_mode === 'm2' || product.pricing_mode === 'manual') && (
```

Adicionar após esse bloco (antes do bloco `manual`):

```tsx
      {product.pricing_mode === 'm2_direto' && (
        <div className="space-y-1">
          <Label>Metragem (m²)</Label>
          <Input inputMode="decimal" value={areaStr} onChange={e => setAreaStr(e.target.value)} placeholder="5,25" />
        </div>
      )}
```

- [ ] **Step 3: Verificar tipos e testes**

Run: `npx tsc --noEmit`
Expected: erro apenas em `src/app/(app)/orcamentos/[id]/page.tsx` (falta `areaM2` na reconstrução — Task 5). Se aparecer outro uso de `ItemSelection` sem `areaM2`, corrigir adicionando `areaM2: null`.

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/config-types.ts src/components/quote/item-form.tsx
git commit -m "feat(quote): campo de metragem (m²) no form do item para m2_direto"
```

---

### Task 5: Reconstrução na edição de orçamento

**Files:**
- Modify: `src/app/(app)/orcamentos/[id]/page.tsx:40-47`

**Interfaces:**
- Consumes: `ItemSelection.areaM2` (Task 3).
- Produces: edição de orçamento existente reidrata metragem digitada.

- [ ] **Step 1: Adicionar areaM2 na reconstrução**

No map dos `quote_items`, após `heightM`:

```ts
      // usado só quando o produto é m2_direto (metragem digitada); nos demais modos é ignorado
      areaM2: it.area_m2 != null ? Number(it.area_m2) : null,
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/orcamentos/[id]/page.tsx"
git commit -m "feat(quote): reidrata metragem m2_direto ao editar orçamento"
```

---

### Task 6: Exibição de itens sem largura/altura

**Files:**
- Modify: `src/components/quote/quote-editor.tsx:139`
- Modify: `src/components/presentation/quote-presentation.tsx:45-47`

**Interfaces:**
- Consumes: snapshots com `width_m` null e `area_m2` preenchido (Task 3).

- [ ] **Step 1: quote-editor**

Trocar a linha 139:

```tsx
                        {s.area_m2 != null && (s.width_m != null
                          ? `${s.width_m} × ${s.height_m} m (${s.area_m2} m²) · `
                          : `${s.area_m2} m² · `)}
```

- [ ] **Step 2: quote-presentation**

Trocar as linhas 45-47:

```tsx
              {it.area_m2 != null && (
                <p className="text-muted-foreground">
                  {it.width_m != null
                    ? `${Number(it.width_m).toLocaleString('pt-BR')} × ${Number(it.height_m).toLocaleString('pt-BR')} m (${Number(it.area_m2).toLocaleString('pt-BR')} m²)`
                    : `${Number(it.area_m2).toLocaleString('pt-BR')} m²`}
                </p>
              )}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros, testes PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/quote/quote-editor.tsx src/components/presentation/quote-presentation.tsx
git commit -m "feat(quote): exibição de item só com m² quando não há largura/altura"
```

---

### Task 7: Admin de produtos

**Files:**
- Modify: `src/app/(app)/admin/produtos/product-form.tsx`
- Modify: `src/app/(app)/admin/produtos/actions.ts:10,14`
- Modify: `src/app/(app)/admin/produtos/page.tsx:25`

**Interfaces:**
- Produces: admin cadastra produto `m2_direto` com `price_per_m2`.

- [ ] **Step 1: product-form**

Linha 9 (tipo do estado) e linha 19 (cast do onChange):

```ts
  const [mode, setMode] = useState<'m2' | 'm2_direto' | 'fixo' | 'manual'>(product?.pricing_mode ?? 'm2')
```

```tsx
        <select name="pricing_mode" value={mode} onChange={e => setMode(e.target.value as 'm2' | 'm2_direto' | 'fixo' | 'manual')}
```

Nova option após `<option value="m2">`:

```tsx
          <option value="m2_direto">Por m² (metragem direta)</option>
```

Condição do campo preço/m² (linha 26):

```tsx
      {(mode === 'm2' || mode === 'm2_direto') && (
```

- [ ] **Step 2: actions**

Linha 10 e 14:

```ts
  const mode = String(formData.get('pricing_mode')) as 'm2' | 'm2_direto' | 'fixo' | 'manual'
```

```ts
    price_per_m2: mode === 'm2' || mode === 'm2_direto' ? parseDecimal(String(formData.get('price_per_m2') ?? '0')) : null,
```

- [ ] **Step 3: lista de produtos**

Linha 25 de `page.tsx`:

```tsx
                {(p.pricing_mode === 'm2' || p.pricing_mode === 'm2_direto') && `${formatBRL(p.price_per_m2 ?? 0)}/m²`}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros, PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/admin/produtos/product-form.tsx src/app/\(app\)/admin/produtos/actions.ts src/app/\(app\)/admin/produtos/page.tsx
git commit -m "feat(admin): cadastro de produto com modo m2_direto"
```

---

### Task 8: Menu e títulos "Preços"

**Files:**
- Modify: `src/lib/nav/items.ts:13`
- Modify: `src/app/(app)/admin/produtos/page.tsx:18`

**Interfaces:**
- Produces: navegação e títulos exibem "Preços"; href `/admin/produtos` e ícone inalterados.

- [ ] **Step 1: nav item**

`src/lib/nav/items.ts` linha 13:

```ts
  { label: 'Preços', href: '/admin/produtos', icon: 'inventory_2', adminOnly: true },
```

- [ ] **Step 2: título da página**

`src/app/(app)/admin/produtos/page.tsx` linha 18:

```tsx
      <h1 className="text-xl font-bold">Preços</h1>
```

- [ ] **Step 3: varrer rótulos restantes**

Run: `grep -rn "Produtos" src/app/\(app\)/admin/produtos src/lib/nav`
Expected: nenhum rótulo visível restante (nome de função `ProdutosPage` e paths podem ficar). Se aparecer heading/label visível ao usuário (ex. página `[id]`), trocar para "Preços"/"Preço".

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros, PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav/items.ts src/app/\(app\)/admin/produtos/page.tsx
git commit -m "feat(nav): renomeia Produtos para Preços no menu e títulos"
```

---

### Task 9: Verificação end-to-end

**Files:** nenhum (verificação).

- [ ] **Step 1: Suite completa + tipos**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, sem erros.

- [ ] **Step 2: Verificar no browser (dev server)**

1. Abrir preview do dev server.
2. Admin → Preços: criar produto "Tela Mosquiteira", modo "Por m² (metragem direta)", preço/m² 80. Lista mostra `R$ 80,00/m²`.
3. Novo orçamento: adicionar item do produto — só campo "Metragem (m²)" aparece (sem largura/altura). Digitar `2,5` → subtotal `R$ 200,00`, preview mostra `2,5 m²`.
4. Salvar orçamento, reabrir para edição — metragem `2,5` reidratada.
5. Abrir apresentação/cliente do orçamento — item mostra `2,5 m²` (sem `null × null`).
6. Menu (desktop e mobile) mostra "Preços".

- [ ] **Step 3: Commit final (se houver ajustes)**

```bash
git add -A && git commit -m "fix: ajustes da verificação do modo m2_direto"
```
