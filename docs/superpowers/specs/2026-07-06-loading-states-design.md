# Feedback de carregamento (loading states) — spinner simples

**Data:** 2026-07-06
**Status:** Aprovado (design verbal); aguardando revisão deste documento
**Base:** sistema de orçamentos em produção

## 1. Objetivo

Dar feedback visual ao usuário em todo momento de espera: navegação entre
telas, carregamento de dados do banco e ações que gravam no banco. Estilo
escolhido: **spinner simples** (sem barra de topo, sem skeleton).

## 2. Componentes novos (reutilizáveis)

- **`Spinner`** (`src/components/ui/spinner.tsx`): ícone SVG girando via
  animação CSS (`animate-spin`), tamanho por prop (`className`). Sem estado,
  server-safe.
- **`LoadingScreen`** (`src/components/ui/loading-screen.tsx`): `Spinner`
  centralizado com padding vertical, para preencher a área de conteúdo
  durante o carregamento de uma rota. Server-safe.
- **`SubmitButton`** (`src/components/ui/submit-button.tsx`): client component
  (`'use client'`) que usa `useFormStatus()` do React; quando `pending`,
  desabilita o botão e mostra `Spinner` + texto opcional de carregando.
  Substitui `<Button type="submit">` dentro de `<form action={serverAction}>`.

## 3. Onde entra

### A) Navegação e leitura do banco — `loading.tsx` por rota
O Next.js App Router renderiza `loading.tsx` (Suspense boundary) instantâneo
enquanto o server component busca dados. Criar um `loading.tsx` que retorna
`<LoadingScreen />` em cada rota que faz fetch:
- `src/app/(app)/loading.tsx` (lista de orçamentos)
- `src/app/(app)/orcamentos/[id]/loading.tsx`
- `src/app/(app)/orcamentos/[id]/apresentacao/loading.tsx`
- `src/app/(app)/admin/produtos/loading.tsx`
- `src/app/(app)/admin/produtos/[id]/loading.tsx`
- `src/app/(app)/admin/pagamento/loading.tsx`
- `src/app/(app)/admin/empresa/loading.tsx`
- `src/app/(app)/admin/usuarios/loading.tsx`
- `src/app/o/[token]/loading.tsx`

(`/orcamentos/novo` não busca do banco além da config; recebe `loading.tsx`
também para consistência de navegação.)

### B) Ações do servidor sem feedback → `SubmitButton`
Trocar o botão de submit por `SubmitButton` nos `<form action={...}>` que hoje
não dão retorno visual:
- Excluir produto (`admin/produtos`)
- Aprovar/recusar orçamento (`setStatus` no detalhe)
- Salvar/excluir grupo, opção, modelo (`admin/produtos/[id]`)
- Salvar/excluir condição de pagamento (`admin/pagamento`)
- Criar/atualizar usuário (`admin/usuarios`)
- Salvar empresa (`admin/empresa`)

### C) Já têm feedback — padronizar visual
Mantidos, apenas usando o `Spinner` novo onde couber:
- Login (`Entrando…`)
- Salvar orçamento (`Salvando… / Salvo!`) — client, estado próprio, mantido
- Upload de foto (`Enviando…`) — usa `Spinner` no lugar do texto simples

## 4. Detalhes de comportamento

- `SubmitButton` desabilita durante `pending` (evita duplo-envio) e volta ao
  normal quando a action termina e a árvore re-renderiza
- `LoadingScreen` ocupa a área de conteúdo, não a nav (a nav do layout
  persiste durante navegação de rota filha)
- pt-BR onde houver texto (ex: "Salvando…")
- Sem dependências novas (spinner é CSS `animate-spin` do Tailwind; nenhum
  pacote de teste de UI é adicionado)

## 5. Testes

O projeto roda Vitest em `environment: 'node'` com `include: ['src/**/*.test.ts']`
e **não** tem jsdom nem testing-library. Introduzir render de componente React
exigiria toolchain novo — fora do escopo desta melhoria puramente visual.

- Sem teste unitário novo (não há setup de render de UI no projeto; não vale
  instalar um só para spinners triviais)
- A suíte existente (41 testes) deve continuar verde após as mudanças
- Verificação principal: **manual no browser** com throttle de rede (DevTools
  → Network → Slow 3G) — navegar lista→detalhe→apresentação e disparar ações
  admin, confirmando o `LoadingScreen` na navegação e o `SubmitButton` com
  spinner em cada ação. `npm run build` + `npm run lint` limpos.

## 6. Fora de escopo

- Barra de progresso no topo
- Skeletons (esqueleto de conteúdo)
- Otimistic UI / transições animadas além do spinner
