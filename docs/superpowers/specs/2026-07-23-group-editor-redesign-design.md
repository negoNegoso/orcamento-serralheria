# Redesign do editor de grupos de opções

**Data:** 2026-07-23
**Escopo:** `/admin/produtos/[id]` — seção "Grupos de opções"

## Objetivo

Substituir o layout atual (form por campo, botões "OK"/"Salvar" por linha, links soltos) pelo design aprovado em mockup: cards de grupo com edição inline auto-save, modais para grupo/template, drag-and-drop para reordenar grupos e opções.

## Decisões

| Tema | Decisão |
|---|---|
| Salvamento de opção | Auto-save no blur (inputs/select) e no change (toggle). Otimista: UI atualiza na hora, reverte em erro |
| Ordenação | Drag-and-drop para **grupos e opções** via `@dnd-kit`. Campo "Ordem" sai da UI; `sort_order` mantido no banco |
| Salvar como template | Botão secundário dentro do modal "Editar Grupo" |
| Excluir grupo | Ícone lixeira → dialog de confirmação ("Excluir grupo X e N opções?") |
| Usar template | Vira botão "Aplicar template" no header → modal com lista de cards clicáveis (clicou, aplicou, fechou). Sem busca. Só aparece se existem templates |
| Novo grupo | Vira botão primário "+ Adicionar grupo" no header → modal (nome + toggle obrigatório) |
| Cores | **Zero hex hardcoded.** Só tokens do tema (`primary`, `primary-foreground`, `secondary`, `destructive`, neutros) — `--primary` é injetado da cor da empresa em `src/app/(app)/layout.tsx` |
| Schema | Nenhuma mudança de banco |

## Arquitetura

### Arquivos

- `src/app/(app)/admin/produtos/[id]/group-editor.tsx` — reescrito: client component com estado local (grupos + opções), DnD, auto-save
- `src/components/ui/switch.tsx` — **novo**, toggle reutilizável (usado no card, modal de grupo e futuro)
- `src/components/ui/dialog.tsx` — **novo**, modal base (overlay, título, X) via `@base-ui/react` Dialog (dependência já existente)
- `src/app/(app)/admin/produtos/[id]/actions.ts` — mantém actions atuais; **novas**: `reorderGroups(productId, ids[])` e `reorderOptions(productId, groupId, ids[])` (update batch de `sort_order`)

### Dependência nova

`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`

### Modais

1. **Editar Grupo** — input nome, toggle "Seleção obrigatória", botão secundário "Salvar como template", Cancelar/Salvar
2. **Adicionar Grupo** — mesmo form sem "Salvar como template"
3. **Aplicar Template** — cards com nome + "N opções" (subtítulo com contagem real de opções, não "1 grupo" como no mockup); clique aplica e fecha
4. **Confirmar exclusão de grupo**

## Layout

### Header da seção

`Grupos de Opções` (semibold) | direita: "Aplicar template" (outline, ícone copy, condicional) + "+ Adicionar grupo" (`bg-primary text-primary-foreground`)

### Card de grupo (`rounded-lg border p-4`)

- Header: nome bold + badge "Obrigatório" (`bg-primary/10 text-primary`, só se required) | direita: lápis + lixeira (ghost, `lucide-react`)
- Linha de opção: grip (hover, esquerda) | input nome (flex-1) | select tipo (`Fixo R$` / `Por m² R$`) | input valor | Switch ativo (`bg-primary` ligado) | × (ghost)
- Opção inativa: linha com opacity reduzida
- "+ Adicionar opção" (`text-primary`): adiciona linha em edição com foco no nome; salva no blur com label preenchido; Esc ou blur vazio cancela

### Estados

- Erro de action: reverte estado local + mensagem inline no card ("Erro ao salvar, tente novamente")
- Grupo sem opções: só "+ Adicionar opção"
- Sem grupos: estado vazio com texto + botões
- DnD: handle grip aparece no hover (linha e header do card); soltar → batch update

## Fluxo de dados

- Server page passa `groups`/`templates` como hoje
- Estado local inicializado das props; mutação local → server action → `router.refresh()` silencioso
- Reordenação persiste em uma action única (batch)
- Concorrência: último blur ganha, sem lock

## Edge cases

- Blur com nome vazio em opção existente → reverte, não salva
- Valor não numérico → normaliza vírgula → ponto (comportamento atual das actions)
- Template aplicado 2x → cria outro grupo (comportamento atual mantido)
- Touch: `TouchSensor` com delay ~200ms para não conflitar com scroll

## Testes

- Unidade (Vitest): `reorderGroups`/`reorderOptions` — validação de ids e escopo por produto/tenant; helpers puros (reordenar array, validação de linha nova)
- Interação/DnD: verificação manual no preview

## Fora de escopo

- Mudanças de schema
- Edição de opções dentro do modal de grupo (opções são inline no card)
- Página `/admin/templates`
