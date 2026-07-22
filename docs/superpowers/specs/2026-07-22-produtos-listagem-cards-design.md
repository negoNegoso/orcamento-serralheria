# Redesenho da listagem de Preços (produtos) — cards

Data: 2026-07-22
Branch base: `develop`

## Contexto

A tela de administração de Preços (`/admin/produtos`) lista os tipos de produto
cadastrados. Hoje é uma `<ul>` simples: cada item tem nome (link sublinhado),
uma linha de preço em texto e um botão "Excluir". O formulário de novo produto
fica sempre visível no fim da página.

O objetivo é adotar um layout de cards mais claro, com badge do modo de preço,
contagem de grupos de opções, toggle de ativo funcional e ações por ícone —
conforme mockup aprovado.

Arquivo principal: `src/app/(app)/admin/produtos/page.tsx`.
A página de detalhe/edição (`[id]/page.tsx`), `group-editor`, `model-editor` e o
próprio `ProductForm` **não** mudam de comportamento.

## Data model

Sem migration. Campos já existentes em `product_types`:

- `name` (text)
- `pricing_mode`: `'m2' | 'm2_direto' | 'fixo' | 'manual'`
- `price_per_m2` (numeric, usado em m2 e m2_direto)
- `base_price` (numeric, usado em fixo)
- `active` (bool)
- `sort_order` (int)

Relação `option_groups` (1-N) já existe; a contagem por produto é obtida via
`select('*, option_groups(count)')`, que retorna `option_groups: [{ count: N }]`.

## Layout

### Cabeçalho
- Esquerda: texto `N produtos cadastrados` (contagem dinâmica, plural/singular).
- Direita: botão primary `+ Novo produto` que expande o `ProductForm` inline
  (escondido por padrão).

### Card container
Um contêiner com borda arredondada envolvendo todas as linhas. Cada produto é uma
linha (`li`) separada por divisória (border-t a partir da segunda). Conteúdo:

- **Nome** em negrito, linkando para `/admin/produtos/{id}`.
- **Badge** do modo (variant `secondary`):
  - `m2` → "Por m²"
  - `m2_direto` → "Por m² direto"
  - `fixo` → "Fixo"
  - `manual` → "Sob consulta"
- **Preço**:
  - `m2` / `m2_direto` → `${formatBRL(price_per_m2 ?? 0)}/m²`
  - `fixo` → `formatBRL(base_price ?? 0)`
  - `manual` → sem texto de preço (badge já comunica)
- **Contagem de grupos**: `N grupos de opções` (muted), singular quando N === 1
  (`1 grupo de opções`).
- **Ações (direita)**:
  - `ActiveToggle` — Switch funcional (base-ui) com rótulo "Ativo"/"Inativo".
  - Ícone editar (Material Symbol `edit`) → link para o detalhe.
  - Ícone excluir (Material Symbol `delete`) → `deleteProduct` (mantido).

## Componentes

### `page.tsx` (server, alterado)
- Query passa a `select('*, option_groups(count)')` mantendo os `.order(...)`.
- Renderiza cabeçalho com contagem + `NewProductPanel`.
- Renderiza o card container mapeando produtos para linhas.
- Deriva `groupsCount` de `p.option_groups?.[0]?.count ?? 0`.

### `ActiveToggle` (client, novo — `active-toggle.tsx`)
- Props: `{ id: string; active: boolean }`.
- Renderiza `Switch` do `@base-ui/react/switch` (Root + Thumb) com rótulo.
- `onCheckedChange` → `useTransition` chamando a server action
  `toggleProductActive(id, next)`. Estado otimista via `useState` inicializado
  com `active`; em caso de erro, reverte.
- Desabilita o switch enquanto `isPending`.

### `NewProductPanel` (client, novo — `new-product-panel.tsx`)
- Props: `{ children: React.ReactNode }` (recebe o `ProductForm` já renderizado no
  server, com a action `saveProduct` embutida).
- `useState(open)`; botão `+ Novo produto` alterna. Quando aberto, mostra os
  children; botão vira "Cancelar"/fecha. Fecha ao concluir não é obrigatório
  (revalidatePath já re-renderiza a lista).

### `actions.ts` (alterado)
Nova action:

```ts
export async function toggleProductActive(id: string, active: boolean) {
  const { supabase } = await getProfile()
  const { error } = await supabase
    .from('product_types')
    .update({ active })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/produtos')
}
```

`saveProduct` e `deleteProduct` permanecem.

## Fluxo

1. Server carrega produtos + contagem de grupos.
2. Cada card exibe dados; `ActiveToggle` e ações operam via server actions.
3. Toggle → `toggleProductActive` → revalidate → UI atualiza.
4. `+ Novo produto` → expande `ProductForm` inline (client state).
5. Excluir (ícone) → `deleteProduct` → revalidate.

## Tratamento de erro
- Server actions lançam `Error(error.message)` em falha (padrão do projeto).
- `ActiveToggle` reverte o estado otimista se a transição falhar.

## Testes
- Sem suite de UI no projeto para esta tela. Verificação manual no preview:
  contagem correta, badges por modo, preços formatados, toggle persiste,
  novo produto expande, excluir remove.

## Fora de escopo
- ProductForm (campos internos), group-editor, model-editor.
- Página de detalhe `[id]/page.tsx`.
- Qualquer mudança de schema.
