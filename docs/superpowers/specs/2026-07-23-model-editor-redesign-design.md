# Redesign do editor de modelos

**Data:** 2026-07-23
**Escopo:** `/admin/produtos/[id]` — seção "Modelos" (galeria para o cliente)

## Objetivo

Substituir o layout atual (form por modelo com botões, upload inline, links soltos) por um grid de cards visuais aprovado em mockup: foto grande, nome, adicional, toggle Ativo, com edição inline auto-save. Consistente com o redesign do editor de grupos recém-feito.

## Decisões

| Tema | Decisão |
|---|---|
| Layout | Grid de cards (`auto-fill minmax(240px, 1fr)`) |
| Criar modelo | Botão primário "+ Adicionar modelo" no header → card inline vazio no grid (placeholder de imagem, nome focado, +R$ 0, Ativo on) |
| Salvar | Auto-save no blur (nome/valor), no change (select tipo, toggle). Otimista com revert em erro |
| Tipo do adicional | Select discreto no card (`Fixo R$` / `Por m² R$`) — preserva dado existente |
| Foto | Foto do card clicável → file picker → upload Supabase → salva. Card novo mostra placeholder cinza com ícone até subir foto |
| Excluir | × no hover da foto → dialog de confirmação ("Excluir modelo X? Essa ação não pode ser desfeita.") |
| Ordem | Sem drag. `sort_order` preservado; modelo novo entra no fim |
| Remover foto | Botão "Remover" sai da UI — só troca de foto (clique) |
| Cores | Zero hex hardcoded, só tokens do tema. `--primary` da empresa |
| Schema | Nenhuma mudança de banco |

## Arquitetura

### Arquivos

- `src/app/(app)/admin/produtos/[id]/model-editor.tsx` — reescrito: client component, estado local (modelos), auto-save. **Assinatura de export inalterada** (`ModelEditor({ productId, models, companyId })`), `page.tsx` não muda
- Novo: `src/app/(app)/admin/produtos/[id]/model-card.tsx` — card de modelo (edição inline + card novo)
- Reusa: `Switch`, `Dialog`/`DialogContent`, `Icon`, `Input` (UI existentes); `saveModel`/`deleteModel` (actions existentes, `(fd: FormData) => Promise<void>`)
- Upload: lógica de `src/components/admin/photo-upload.tsx` reaproveitada — input file oculto disparado por clique na foto; usa `createClient()` + `supabase.storage.from('fotos')`, pasta `${companyId}/modelos`

### Modais

- **Confirmar exclusão de modelo** — reusa `Dialog`/`DialogContent`; mesma estrutura do `ConfirmDeleteGroupModal`

## Layout

### Header

`Modelos` (semibold) | direita: "+ Adicionar modelo" (`bg-primary text-primary-foreground`, ícone `add`)

### Card (`rounded-lg border`)

- Foto: `aspect-[4/3]`, `rounded-t-lg`, `object-cover`, clicável (cursor pointer). Sem foto → fundo `bg-muted` centralizando ícone `image` (`text-muted-foreground`)
- × no canto sup. direito da foto, visível no hover do card (`bg-background/80` circular, ícone `close`)
- Corpo (`p-3 space-y-2`): input nome (largura total); linha `+R$` (label `text-muted-foreground`) + input valor (`font-mono`) + select tipo discreto; Switch Ativo + label "Ativo"
- Card inativo: `opacity-60`

### Card novo

- Placeholder de imagem (sem × ), input nome focado (placeholder "Novo modelo"), +R$ 0, tipo `fixo`, Ativo on
- Salva no focusout do card quando nome preenchido (guard `cancelledRef` + `contains(relatedTarget)`, padrão da linha de opção). Esc cancela. Nome vazio no focusout cancela
- Upload de foto disponível antes de salvar: mantém `photo_url` em estado local, enviado junto no saveModel

### Estados

- Erro de action → reverte estado local + mensagem inline no card (`text-destructive`, `role="alert"`); limpa no próximo sucesso
- Upload em andamento → overlay/spinner discreto sobre a foto; erro de upload → mensagem inline
- Sem modelos → só o botão de adicionar (grid vazio)

## Fluxo de dados

- Server page passa `models` como hoje (já ordenado por `sort_order`)
- Estado local inicializado das props; reconciliação server-autoritativa via render-time adjust-state (mesmo padrão do editor de grupos — evita `react-hooks/set-state-in-effect`), pulando campo com foco durante save em voo quando viável
- `saveModel` recebe FormData com: `product_id`, `id?`, `name`, `surcharge_type`, `surcharge`, `sort_order`, `active` (`'on'`), `photo_url`

## Edge cases

- Blur com nome vazio em modelo existente → reverte, não salva
- Valor não numérico → normaliza vírgula→ponto (server via `parseDecimal`)
- Foto: só troca no clique; sem botão remover (definir null exigiria caminho extra — YAGNI)
- Upload falha → mantém foto anterior, erro inline

## Testes

- Sem função pura nova relevante (auto-save/upload são efeitos). Verificação: `tsc` + `eslint` + preview manual (Task final). Suite existente deve continuar verde

## Fora de escopo

- Mudanças de schema
- Drag-and-drop de modelos
- Botão "Remover foto"
- Galeria com múltiplas fotos por modelo
