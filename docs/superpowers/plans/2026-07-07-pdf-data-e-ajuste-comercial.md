# Data no nome do PDF e ajuste positivo como info comercial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prefixar o nome do PDF exportado com a data de geração (`DD-MM-YYYY`) e ocultar o ajuste positivo dos itens nas visões voltadas ao cliente (link público e PDF).

**Architecture:** Um helper puro formata o título da página (usado pelo navegador como nome do PDF) a partir de `customer_name` + `created_at`. As duas rotas de apresentação (`generateMetadata`) passam a usar esse helper. O componente compartilhado `QuotePresentation` recebe uma prop `internal` que controla a exibição da linha de ajuste positivo; a rota interna passa `true`, a pública `false`.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, Vitest.

**Base:** spec `docs/superpowers/specs/2026-07-07-pdf-data-e-ajuste-comercial-design.md`. Branch: `feature/pdf-data-ajuste-comercial`.

---

## File Structure

- `src/lib/format.ts` — **Modify**: adicionar helper puro `quotePdfTitle`.
- `src/lib/format.test.ts` — **Modify**: testes do helper.
- `src/app/o/[token]/page.tsx` — **Modify**: `generateMetadata` seleciona `created_at` e usa o helper; render passa `internal={false}`.
- `src/app/(app)/orcamentos/[id]/apresentacao/page.tsx` — **Modify**: `generateMetadata` seleciona `created_at` e usa o helper; render passa `internal={true}`.
- `src/components/presentation/quote-presentation.tsx` — **Modify**: prop `internal`; oculta ajuste positivo quando `internal` é `false`.

---

## Task 1: Helper `quotePdfTitle` (nome do PDF com data)

**Files:**
- Modify: `src/lib/format.ts`
- Test: `src/lib/format.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `src/lib/format.test.ts`:

```typescript
import { formatBRL, parseDecimal, quotePdfTitle } from './format'

describe('quotePdfTitle', () => {
  it('prefixa a data de geração no formato DD-MM-YYYY', () => {
    // meio-dia local evita virada de dia por fuso
    const createdAt = new Date(2026, 6, 7, 12, 0, 0)
    expect(quotePdfTitle('João Silva', createdAt)).toBe('07-07-2026 - Orçamento - João Silva')
  })
  it('aceita string ISO', () => {
    const createdAt = new Date(2026, 0, 3, 12, 0, 0).toISOString()
    expect(quotePdfTitle('Maria', createdAt)).toBe('03-01-2026 - Orçamento - Maria')
  })
})
```

Nota: a linha `import` acima **substitui** o import existente
`import { formatBRL, parseDecimal } from './format'` no topo do arquivo (não
duplicar). Aplique como edição no import do topo e adicione o `describe` no fim.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/lib/format.test.ts`
Expected: FAIL — `quotePdfTitle is not a function` (ou erro de export inexistente).

- [ ] **Step 3: Implementar o helper**

Adicionar ao final de `src/lib/format.ts`:

```typescript
export function quotePdfTitle(customerName: string, createdAt: string | Date): string {
  const date = new Date(createdAt).toLocaleDateString('pt-BR').replace(/\//g, '-')
  return `${date} - Orçamento - ${customerName}`
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/lib/format.test.ts`
Expected: PASS (todos os testes de format, incluindo os novos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat: helper quotePdfTitle com data no nome do PDF

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Usar `quotePdfTitle` nas duas rotas de apresentação

Sem teste automatizado (metadata de rota Next); validação por build + manual.

**Files:**
- Modify: `src/app/o/[token]/page.tsx:7-14`
- Modify: `src/app/(app)/orcamentos/[id]/apresentacao/page.tsx:9-14`

- [ ] **Step 1: Rota pública — `generateMetadata`**

Em `src/app/o/[token]/page.tsx`, adicionar o import do helper junto aos existentes:

```typescript
import { quotePdfTitle } from '@/lib/format'
```

Substituir a função `generateMetadata` inteira por:

```typescript
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const robots = { index: false, follow: false }
  const { token } = await params
  if (!/^[a-f0-9]{32}$/.test(token)) return { robots }
  const admin = createAdminClient()
  const { data } = await admin.from('quotes').select('customer_name, created_at').eq('token', token).single()
  return { robots, title: data ? quotePdfTitle(data.customer_name, data.created_at) : 'Orçamento' }
}
```

- [ ] **Step 2: Rota interna — `generateMetadata`**

Em `src/app/(app)/orcamentos/[id]/apresentacao/page.tsx`, adicionar o import:

```typescript
import { quotePdfTitle } from '@/lib/format'
```

Substituir a função `generateMetadata` inteira por:

```typescript
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data } = await supabase.from('quotes').select('customer_name, created_at').eq('id', id).single()
  return { title: data ? quotePdfTitle(data.customer_name, data.created_at) : 'Orçamento' }
}
```

- [ ] **Step 3: Type-check / lint**

Run: `npm run lint`
Expected: sem erros nas duas rotas alteradas.

- [ ] **Step 4: Commit**

```bash
git add "src/app/o/[token]/page.tsx" "src/app/(app)/orcamentos/[id]/apresentacao/page.tsx"
git commit -m "feat: data de geração no nome do PDF nas duas rotas de apresentação

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Ocultar ajuste positivo do cliente (prop `internal`)

**Files:**
- Modify: `src/components/presentation/quote-presentation.tsx:5-7` (assinatura) e bloco da linha de ajuste
- Modify: `src/app/o/[token]/page.tsx:30` (render)
- Modify: `src/app/(app)/orcamentos/[id]/apresentacao/page.tsx:36` (render)

- [ ] **Step 1: Adicionar a prop `internal` à assinatura do componente**

Em `src/components/presentation/quote-presentation.tsx`, substituir a assinatura:

```typescript
export function QuotePresentation({ company, quote, items, conditions }: {
  company: any; quote: any; items: any[]; conditions: { description: string }[]
}) {
```

por:

```typescript
export function QuotePresentation({ company, quote, items, conditions, internal = false }: {
  company: any; quote: any; items: any[]; conditions: { description: string }[]; internal?: boolean
}) {
```

- [ ] **Step 2: Ocultar a linha de ajuste positivo quando não for interno**

No mesmo arquivo, substituir o bloco atual da linha de ajuste:

```tsx
              {Number(it.extra_value ?? 0) !== 0 && (
                <p className={Number(it.extra_value) < 0 ? 'text-green-700' : 'text-muted-foreground'}>
                  Ajuste: {Number(it.extra_value) > 0 ? '+' : '−'}{formatBRL(Math.abs(Number(it.extra_value)))}
                </p>
              )}
```

por (mostra negativo sempre; positivo só quando `internal`):

```tsx
              {(Number(it.extra_value ?? 0) < 0 || (internal && Number(it.extra_value ?? 0) > 0)) && (
                <p className={Number(it.extra_value) < 0 ? 'text-green-700' : 'text-muted-foreground'}>
                  Ajuste: {Number(it.extra_value) > 0 ? '+' : '−'}{formatBRL(Math.abs(Number(it.extra_value)))}
                </p>
              )}
```

- [ ] **Step 3: Rota pública passa `internal={false}`**

Em `src/app/o/[token]/page.tsx`, substituir a linha do render:

```tsx
        <QuotePresentation company={company} quote={quote} items={items} conditions={conditions} />
```

por:

```tsx
        <QuotePresentation company={company} quote={quote} items={items} conditions={conditions} internal={false} />
```

- [ ] **Step 4: Rota interna passa `internal={true}`**

Em `src/app/(app)/orcamentos/[id]/apresentacao/page.tsx`, substituir a linha do render:

```tsx
      <QuotePresentation company={company} quote={quote} items={items} conditions={conditions} />
```

por:

```tsx
      <QuotePresentation company={company} quote={quote} items={items} conditions={conditions} internal={true} />
```

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/presentation/quote-presentation.tsx "src/app/o/[token]/page.tsx" "src/app/(app)/orcamentos/[id]/apresentacao/page.tsx"
git commit -m "feat: ocultar ajuste positivo do cliente (info comercial só interna)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Verificação final

- [ ] **Step 1: Suíte de testes completa**

Run: `npm test`
Expected: PASS (incluindo os novos testes de `quotePdfTitle`).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build conclui sem erros de tipo nas rotas/componente alterados.

- [ ] **Step 3: Verificação manual no browser**

- Abrir um orçamento com item de ajuste **positivo**:
  - Rota interna (`/orcamentos/[id]/apresentacao`): linha `Ajuste: +R$ X` **aparece**.
  - Link público (`/o/[token]`): linha de ajuste positivo **não aparece**; total do item idêntico ao da rota interna.
- Abrir um orçamento com item de ajuste **negativo**:
  - Link público: linha "Desconto" continua visível no rodapé.
- Em ambas as rotas, `Ctrl/Cmd+P` (ou botão "Baixar PDF" na pública): nome sugerido começa com `DD-MM-YYYY - Orçamento - {cliente}`.
