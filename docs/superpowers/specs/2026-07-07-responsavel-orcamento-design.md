# Responsável pelo orçamento — exibir e reatribuir

**Data:** 2026-07-07
**Status:** Aprovado (design verbal); aguardando revisão deste documento
**Base:** sistema de orçamentos em produção (branch build-v1)

## 1. Objetivo

Expor o vendedor responsável por cada orçamento (campo `quotes.created_by`,
já existente e já usado no "Ranking por vendedor" do dashboard) e permitir
reatribuir o responsável, para organização e métricas de vendedores.

**Sem migration** — reusa `quotes.created_by` (FK → `profiles(id)`).

## 2. Exibição do responsável

- **Lista** (`src/app/(app)/page.tsx`): cada linha mostra "Vendedor: {nome}".
  A query passa a fazer embed do criador: `.select('*, creator:created_by(name)')`.
  Quando `created_by` é nulo (orçamento antigo/sem dono), mostra "Sem vendedor".
- **Detalhe** (`src/app/(app)/orcamentos/[id]/page.tsx`): "Responsável: {nome}"
  no topo, junto do status.

## 3. Reatribuição

- Server action `setQuoteOwner(quoteId: string, newOwnerId: string)` em
  `src/app/(app)/orcamentos/actions.ts`:
  1. `getProfile()` → `{ user, profile, supabase }`
  2. Busca o orçamento (`created_by` atual)
  3. **Autorização (na action):** permite se `profile.role === 'admin'` **OU**
     `quote.created_by === user.id`. Caso contrário, retorna erro
     "Sem permissão para trocar o responsável".
  4. Valida que `newOwnerId` é um perfil **ativo** existente; senão erro.
  5. Atualiza `quotes.created_by = newOwnerId`, `updated_at = now()`.
  6. `revalidatePath('/')`, `/orcamentos/[id]` e `/admin/dashboard`.
  - Retorno: `{ ok: true } | { error: string }` (mesmo padrão de erro amigável).
- **UI no detalhe:** se o usuário pode trocar (admin ou dono), renderiza um
  `<form>` com `<select>` de usuários ativos (`profiles` ativos, id+nome) e um
  `SubmitButton` "Alterar responsável" (spinner ao enviar). Se não pode trocar,
  mostra só o nome do responsável em texto.
  - O `<select>` vem pré-selecionado no responsável atual.
- Alvo da reatribuição: **qualquer usuário ativo** (vendedor ou admin).

## 4. Segurança (decisão: controle na action — opção A)

A política RLS de `quotes` é permissiva por design ("equipe pequena, todos
editam tudo"). A autorização "admin ou dono" vive na **server action**, que é
o ponto de entrada do fluxo de UI. Aceita-se conscientemente que essa regra
**não** é imposta no banco: um usuário autenticado tecnicamente mal-intencionado
poderia contornar via chamada direta ao Supabase. Fora do modelo de ameaça de
uma equipe pequena e confiável; endurecer o RLS fica como melhoria futura
opcional, não neste escopo.

## 5. Testes

- Unitário (função pura de autorização extraída, testável sem banco):
  `canReassignOwner({ role, userId, quoteOwnerId })` → true para admin, true
  para o dono, false para terceiro. Casos: admin+qualquer, dono, não-dono
  não-admin.
- Verificação visual no browser: lista mostra vendedor; detalhe mostra e troca;
  vendedor terceiro não vê o seletor (só o nome); dashboard reflete a troca.
- Suíte existente (57) segue verde; `npm run build` + `npm run lint` limpos.

## 6. Fora de escopo

- Endurecer RLS de `quotes` (opção B) — melhoria futura
- Histórico de reatribuições (quem trocou, quando)
- Mostrar o vendedor na apresentação/PDF do cliente
- Restringir alvo da reatribuição só a vendedores
