# Modo de preço "m² direto" + menu "Preços"

Data: 2026-07-18

## Objetivo

1. Novo modo de preço `m2_direto`: vendedor digita a metragem (m²) diretamente no item do orçamento, sem informar largura e altura. Total = metragem × preço/m² do produto.
2. Renomear item de navegação e títulos de "Produtos" para "Preços". Rota `/admin/produtos` permanece.

## Contexto atual

- Modos existentes: `m2` (largura × altura × preço/m²), `fixo` (preço fechado), `manual` (valor combinado digitado pelo vendedor).
- Constraint no banco: `product_types.pricing_mode check in ('m2','fixo','manual')` (migration 0001).
- Cálculo centralizado em `src/lib/pricing/calc.ts`; snapshot do item em `src/lib/pricing/snapshot.ts`.
- Telas de exibição mostram `largura × altura (área m²)` quando `area_m2 != null` — com o novo modo, largura/altura serão null e a exibição precisa de fallback.

## Decisões

- **Abordagem**: novo valor de enum `m2_direto` (não flag booleana, não hack largura×1). Explícito, segue padrão existente, adicionais `por_m2` funcionam sem mudança.
- **Entrada**: vendedor digita m² no form do item. Não é metragem fixa cadastrada no produto.
- **Menu**: rótulo + títulos de página mudam para "Preços"; rota e ícone mantidos.

## Design

### 1. Banco de dados

Migration `0024_pricing_mode_m2_direto.sql`:

```sql
alter table product_types drop constraint product_types_pricing_mode_check;
alter table product_types add constraint product_types_pricing_mode_check
  check (pricing_mode in ('m2','m2_direto','fixo','manual'));
```

(Nome exato da constraint conferido na implementação.) Usa coluna `price_per_m2` existente; nenhuma coluna nova.

### 2. Tipos e cálculo (`src/lib/pricing/`)

- `types.ts`: `PricingMode = 'm2' | 'm2_direto' | 'fixo' | 'manual'`. `ItemInput` ganha `areaInputM2?: number | null`.
- `calc.ts`, ramo `m2_direto`:
  - Valida `areaInputM2 > 0`, senão `PricingError('Informe a metragem (m²) maior que zero')`.
  - Valida `pricePerM2 != null && >= 0`, senão erro de produto sem preço por m².
  - `areaM2 = round2(areaInputM2)`; `base = areaM2 * pricePerM2`.
- Adicionais `por_m2` (opções e modelos) usam `areaM2` automaticamente pelo fluxo existente.

### 3. Snapshot (`src/lib/pricing/snapshot.ts`)

- `ItemSelection` ganha `areaM2: number | null` (m² digitado; usado só no modo `m2_direto`).
- `buildSnapshot` passa `areaInputM2: sel.areaM2` ao `calcItem`.
- No snapshot resultante: `width_m`/`height_m` = null para `m2_direto`; `area_m2` vem de `totals.areaM2`.
- Edição de orçamento (`src/app/(app)/orcamentos/[id]/page.tsx`): reconstrói `areaM2` a partir do `area_m2` salvo no item.

### 4. Form do item (`src/components/quote/item-form.tsx`)

- Produto `m2_direto`: exibe um único campo "Metragem (m²)" (`inputMode="decimal"`, placeholder ex.: `5,25`), sem largura/altura.
- Estado string local (`areaStr`), convertido com `parseDecimal` na seleção, mesmo padrão de largura/altura.
- Preview existente já mostra m² e subtotal.

### 5. Exibição de itens

- `src/components/quote/quote-editor.tsx` e `src/components/presentation/quote-presentation.tsx`:
  - Se `width_m != null`: `2,50 × 2,10 m (5,25 m²)` (comportamento atual).
  - Senão, se `area_m2 != null`: apenas `5,25 m²`.

### 6. Admin de produtos (`src/app/(app)/admin/produtos/`)

- `product-form.tsx`: nova opção no select — `Por m² (metragem direta)`. Campo preço/m² aparece quando modo é `m2` ou `m2_direto`.
- `actions.ts`: `price_per_m2` persiste quando modo `m2` ou `m2_direto`.
- `page.tsx` (lista): mostra `R$ X/m²` também para `m2_direto`.
- `src/lib/config-types.ts`: union de `pricing_mode` atualizada.

### 7. Menu "Preços"

- `src/lib/nav/items.ts`: label `Produtos` → `Preços` (href e ícone mantidos).
- `src/app/(app)/admin/produtos/page.tsx`: `<h1>` e textos "Produtos" → "Preços".
- Menu mobile (`mobile-nav.tsx`) usa o mesmo item — sem mudança.

### 8. Testes

- `calc.test.ts`: `m2_direto` com metragem válida; metragem ausente/zero → erro; `pricePerM2` ausente → erro; adicional `por_m2` multiplica pela metragem digitada.
- `snapshot.test.ts`: snapshot de `m2_direto` com `width_m`/`height_m` null e `area_m2` preenchido.

## Fora de escopo

- Renomear rota `/admin/produtos` → `/admin/precos`.
- Metragem fixa cadastrada no produto.
- Alterações no modo `m2`, `fixo` ou `manual`.
