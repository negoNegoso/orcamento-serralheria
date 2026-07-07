# Feedback de Carregamento (Spinner) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feedback visual (spinner) em toda espera do site: navegação/leitura do banco (via `loading.tsx`) e gravações (via `SubmitButton` com `useFormStatus`).

**Architecture:** Três componentes reutilizáveis (`Spinner`, `LoadingScreen`, `SubmitButton`). Cada rota que busca dados ganha um `loading.tsx` que o Next.js mostra automaticamente via Suspense. Botões de submit dos forms server-action passam a desabilitar e mostrar spinner enquanto a action está pending.

**Tech Stack:** Next.js App Router, React `useFormStatus`, Tailwind `animate-spin`. Sem dependências novas.

**Spec:** `docs/superpowers/specs/2026-07-06-loading-states-design.md`

## Global Constraints

- Estilo: **spinner simples** — sem barra de topo, sem skeleton
- **Sem dependências novas**; sem toolchain de teste de UI (Vitest é `environment: 'node'`, só `*.test.ts`) — nenhum teste unitário novo; a suíte existente (41) deve seguir verde
- Verificação: `npm run build` + `npm run lint` limpos por task; verificação visual manual no browser (throttle) fica com o controlador
- pt-BR em qualquer texto de carregando (ex: "Salvando…", "Carregando…")
- `useFormStatus` só funciona em componente **descendente** de um `<form>`; `SubmitButton` é client component e vive dentro de cada `<form action={...}>`
- Não iniciar/matar dev server nas tasks de implementação (preview do controlador na 3000)
- `cn` utilitário existe em `@/lib/utils`; `Button` em `@/components/ui/button`

---

### Task 1: Componentes Spinner, LoadingScreen, SubmitButton

**Files:**
- Create: `src/components/ui/spinner.tsx`
- Create: `src/components/ui/loading-screen.tsx`
- Create: `src/components/ui/submit-button.tsx`

**Interfaces:**
- Consumes: `cn` de `@/lib/utils`; `Button` de `@/components/ui/button`
- Produces:
  - `Spinner({ className?: string })` — SVG girando; server-safe
  - `LoadingScreen({ label?: string })` — spinner centralizado + label (default "Carregando…"); server-safe
  - `SubmitButton(props: ComponentProps<typeof Button> & { pendingLabel?: string })` — botão `type="submit"` que desabilita e mostra spinner quando o form pai está pending

- [ ] **Step 1: Spinner**

`src/components/ui/spinner.tsx`:

```tsx
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('size-5 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="status"
      aria-label="Carregando"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
```

- [ ] **Step 2: LoadingScreen**

`src/components/ui/loading-screen.tsx`:

```tsx
import { Spinner } from './spinner'

export function LoadingScreen({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <Spinner className="size-8" />
      <span className="text-sm">{label}</span>
    </div>
  )
}
```

- [ ] **Step 3: SubmitButton**

`src/components/ui/submit-button.tsx`:

```tsx
'use client'
import type { ComponentProps } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from './button'
import { Spinner } from './spinner'

export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending && <Spinner className="size-4" />}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  )
}
```

- [ ] **Step 4: Verificar**

Run: `npm run build && npm run lint`
Expected: build compila (novos componentes sem consumidores ainda é OK), lint sem erros. `npm run test` → 41 verdes (inalterado).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/spinner.tsx src/components/ui/loading-screen.tsx src/components/ui/submit-button.tsx
git commit -m "feat: componentes Spinner, LoadingScreen e SubmitButton

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `loading.tsx` por rota (navegação + leitura)

**Files (todos Create):**
- `src/app/(app)/loading.tsx`
- `src/app/(app)/orcamentos/novo/loading.tsx`
- `src/app/(app)/orcamentos/[id]/loading.tsx`
- `src/app/(app)/orcamentos/[id]/apresentacao/loading.tsx`
- `src/app/(app)/admin/produtos/loading.tsx`
- `src/app/(app)/admin/produtos/[id]/loading.tsx`
- `src/app/(app)/admin/pagamento/loading.tsx`
- `src/app/(app)/admin/empresa/loading.tsx`
- `src/app/(app)/admin/usuarios/loading.tsx`
- `src/app/o/[token]/loading.tsx`

**Interfaces:**
- Consumes: `LoadingScreen` (Task 1)
- Produces: nada consumido por tasks futuras

- [ ] **Step 1: Criar os 10 arquivos — conteúdo idêntico**

Cada arquivo acima recebe exatamente:

```tsx
import { LoadingScreen } from '@/components/ui/loading-screen'

export default function Loading() {
  return <LoadingScreen />
}
```

- [ ] **Step 2: Verificar**

Run: `npm run build && npm run lint`
Expected: build lista as rotas com seus loading boundaries; lint limpo. `npm run test` → 41 verdes.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/loading.tsx" "src/app/(app)/orcamentos/novo/loading.tsx" "src/app/(app)/orcamentos/[id]/loading.tsx" "src/app/(app)/orcamentos/[id]/apresentacao/loading.tsx" "src/app/(app)/admin/produtos/loading.tsx" "src/app/(app)/admin/produtos/[id]/loading.tsx" "src/app/(app)/admin/pagamento/loading.tsx" "src/app/(app)/admin/empresa/loading.tsx" "src/app/(app)/admin/usuarios/loading.tsx" "src/app/o/[token]/loading.tsx"
git commit -m "feat: loading.tsx com spinner em cada rota de dados

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: SubmitButton nos botões de salvar (forms admin)

Substitui os botões de submit primários (Salvar/Adicionar/Criar/OK) por `SubmitButton`. Cada um está dentro de um `<form action={serverAction}>`, então `useFormStatus` reporta o pending correto. Regra da troca: remover `type="submit"` (o SubmitButton já o define), manter `variant`/`size`/`className`, trocar a tag.

**Files (Modify):**
- `src/app/(app)/admin/empresa/company-form.tsx`
- `src/app/(app)/admin/usuarios/page.tsx`
- `src/app/(app)/admin/pagamento/page.tsx`
- `src/app/(app)/admin/produtos/product-form.tsx`
- `src/app/(app)/admin/produtos/[id]/group-editor.tsx`
- `src/app/(app)/admin/produtos/[id]/model-editor.tsx`

**Interfaces:**
- Consumes: `SubmitButton` (Task 1)

- [ ] **Step 1: company-form.tsx**

Adicionar import (junto dos outros imports de UI):

```tsx
import { SubmitButton } from '@/components/ui/submit-button'
```

Trocar:

```tsx
      <Button type="submit">Salvar</Button>
```

por:

```tsx
      <SubmitButton pendingLabel="Salvando…">Salvar</SubmitButton>
```

Se `Button` ficar sem uso no arquivo, remover seu import; se ainda houver outros usos, manter.

- [ ] **Step 2: usuarios/page.tsx**

Adicionar `import { SubmitButton } from '@/components/ui/submit-button'`.

Trocar:

```tsx
              <Button size="sm" variant="outline" type="submit">Salvar</Button>
```

por:

```tsx
              <SubmitButton size="sm" variant="outline">Salvar</SubmitButton>
```

E trocar:

```tsx
        <Button size="sm" type="submit">Criar</Button>
```

por:

```tsx
        <SubmitButton size="sm" pendingLabel="Criando…">Criar</SubmitButton>
```

- [ ] **Step 3: pagamento/page.tsx**

Adicionar `import { SubmitButton } from '@/components/ui/submit-button'`.

Trocar:

```tsx
      <Button size="sm" type="submit">{c ? 'Salvar' : 'Adicionar'}</Button>
```

por:

```tsx
      <SubmitButton size="sm">{c ? 'Salvar' : 'Adicionar'}</SubmitButton>
```

- [ ] **Step 4: product-form.tsx**

Adicionar `import { SubmitButton } from '@/components/ui/submit-button'`.

Trocar:

```tsx
      <Button type="submit" size="sm">{product ? 'Salvar' : 'Adicionar produto'}</Button>
```

por:

```tsx
      <SubmitButton size="sm">{product ? 'Salvar' : 'Adicionar produto'}</SubmitButton>
```

- [ ] **Step 5: group-editor.tsx**

Adicionar `import { SubmitButton } from '@/components/ui/submit-button'`.

Trocar as 4 ocorrências de botão de submit:

```tsx
            <Button size="sm" type="submit">Salvar</Button>
```
→
```tsx
            <SubmitButton size="sm">Salvar</SubmitButton>
```

```tsx
                  <Button size="sm" variant="outline" type="submit">OK</Button>
```
→
```tsx
                  <SubmitButton size="sm" variant="outline">OK</SubmitButton>
```

```tsx
            <Button size="sm" type="submit">Adicionar opção</Button>
```
→
```tsx
            <SubmitButton size="sm">Adicionar opção</SubmitButton>
```

```tsx
        <Button size="sm" type="submit">Adicionar grupo</Button>
```
→
```tsx
        <SubmitButton size="sm">Adicionar grupo</SubmitButton>
```

- [ ] **Step 6: model-editor.tsx**

Adicionar `import { SubmitButton } from '@/components/ui/submit-button'`.

Trocar:

```tsx
        <Button size="sm" type="submit">{model ? 'Salvar' : 'Adicionar modelo'}</Button>
```

por:

```tsx
        <SubmitButton size="sm">{model ? 'Salvar' : 'Adicionar modelo'}</SubmitButton>
```

- [ ] **Step 7: Verificar**

Run: `npm run build && npm run lint`
Expected: compila e lint limpo. Onde `Button` deixou de ser usado num arquivo, seu import foi removido (senão o lint acusa `no-unused-vars`). `npm run test` → 41 verdes.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/admin"
git commit -m "feat: SubmitButton com spinner nos botões de salvar do admin

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: SubmitButton nos botões de excluir/status + spinner no upload

Botões de excluir e mudar status são gravações — recebem `SubmitButton` com aparência de link (variant `link`, resetando altura/padding do Button para ficar inline como o `<button>` original). O upload de foto ganha o `Spinner` ao lado de "Enviando…".

**Files (Modify):**
- `src/app/(app)/admin/pagamento/page.tsx`
- `src/app/(app)/admin/produtos/page.tsx`
- `src/app/(app)/admin/produtos/[id]/group-editor.tsx`
- `src/app/(app)/admin/produtos/[id]/model-editor.tsx`
- `src/app/(app)/orcamentos/[id]/page.tsx`
- `src/components/admin/photo-upload.tsx`

**Interfaces:**
- Consumes: `SubmitButton`, `Spinner` (Task 1)

- [ ] **Step 1: pagamento/page.tsx — excluir**

(`SubmitButton` já importado na Task 3.) Trocar:

```tsx
            <button className="text-xs text-red-600 underline">excluir</button>
```

por:

```tsx
            <SubmitButton variant="link" className="h-auto px-0 text-xs text-red-600 underline">excluir</SubmitButton>
```

- [ ] **Step 2: produtos/page.tsx — Excluir**

Adicionar `import { SubmitButton } from '@/components/ui/submit-button'`. Trocar:

```tsx
              <Button variant="ghost" size="sm" className="text-red-600">Excluir</Button>
```

por:

```tsx
              <SubmitButton variant="ghost" size="sm" className="text-red-600">Excluir</SubmitButton>
```

(Se `Button` ficar sem uso, remover import.)

- [ ] **Step 3: group-editor.tsx — excluir grupo e excluir opção**

(`SubmitButton` já importado.) Trocar:

```tsx
            <button className="text-xs text-red-600 underline">Excluir grupo (e opções)</button>
```
→
```tsx
            <SubmitButton variant="link" className="h-auto px-0 text-xs text-red-600 underline">Excluir grupo (e opções)</SubmitButton>
```

```tsx
                  <button className="text-xs text-red-600 underline">excluir</button>
```
→
```tsx
                  <SubmitButton variant="link" className="h-auto px-0 text-xs text-red-600 underline">excluir</SubmitButton>
```

- [ ] **Step 4: model-editor.tsx — excluir modelo**

(`SubmitButton` já importado.) Trocar:

```tsx
            <button className="text-xs text-red-600 underline">excluir modelo</button>
```
→
```tsx
            <SubmitButton variant="link" className="h-auto px-0 text-xs text-red-600 underline">excluir modelo</SubmitButton>
```

- [ ] **Step 5: orcamentos/[id]/page.tsx — status aprovado/recusado**

Adicionar `import { SubmitButton } from '@/components/ui/submit-button'`. Trocar:

```tsx
          <form action={setStatus.bind(null, quote.id, 'aprovado')}><button className="text-green-700 underline">Marcar aprovado</button></form>
```
→
```tsx
          <form action={setStatus.bind(null, quote.id, 'aprovado')}><SubmitButton variant="link" className="h-auto px-0 text-green-700 underline">Marcar aprovado</SubmitButton></form>
```

```tsx
          <form action={setStatus.bind(null, quote.id, 'recusado')}><button className="text-red-700 underline">Marcar recusado</button></form>
```
→
```tsx
          <form action={setStatus.bind(null, quote.id, 'recusado')}><SubmitButton variant="link" className="h-auto px-0 text-red-700 underline">Marcar recusado</SubmitButton></form>
```

- [ ] **Step 6: photo-upload.tsx — spinner no "Enviando…"**

Adicionar `import { Spinner } from '@/components/ui/spinner'`. Trocar:

```tsx
      {busy && <p className="text-sm">Enviando…</p>}
```

por:

```tsx
      {busy && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Enviando…
        </p>
      )}
```

- [ ] **Step 7: Verificar**

Run: `npm run build && npm run lint`
Expected: compila e lint limpo (imports de `Button` órfãos removidos). `npm run test` → 41 verdes.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/admin" "src/app/(app)/orcamentos/[id]/page.tsx" src/components/admin/photo-upload.tsx
git commit -m "feat: spinner nos botões de excluir/status e no upload de foto

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-review (feito na escrita)

- **Cobertura do spec:** §2 componentes → T1; §3A loading.tsx por rota → T2 (10 arquivos, batem com as rotas que fazem fetch; `login` é client com feedback próprio, não entra); §3B ações do servidor → T3 (salvar) + T4 (excluir/status); §3C já existentes → mantidos, upload padronizado com Spinner em T4; §4 comportamento (disabled durante pending, pt-BR) → SubmitButton em T1; §5 sem teste de UI novo, build+lint por task, verificação manual do controlador
- **Placeholders:** nenhum — cada troca tem old/new exato
- **Consistência de tipos:** `SubmitButton` aceita `ComponentProps<typeof Button>` + `pendingLabel`, então `variant`/`size`/`className`/`children` usados nas trocas são válidos; `Spinner({ className })` e `LoadingScreen({ label })` usados conforme definidos
- **Risco conhecido:** onde `Button` deixa de ser referenciado num arquivo, o import precisa sair para o lint passar — chamado explicitamente nos steps de verificação de T3 e T4
