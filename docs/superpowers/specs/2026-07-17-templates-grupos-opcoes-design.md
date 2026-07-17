# Templates de Grupos de Opções — Design

**Data:** 2026-07-17
**Status:** Aprovado

## Problema

Grupos de opções repetitivos (ex: "Cor do Alumínio") precisam ser recriados manualmente em cada produto, opção por opção. Não existe forma de reaproveitar um grupo entre produtos.

## Solução

Biblioteca de templates de grupos de opções, por empresa. Ao criar/editar grupos num produto, o admin pode buscar um template e aplicá-lo — o grupo e suas opções são **copiados** para o produto (cópia independente: editar o template depois não afeta produtos que já o usaram). Templates guardam a estrutura completa, incluindo valores de adicional (R$ fixo / por m²).

Dois caminhos para criar templates:
1. Tela admin própria (`/admin/templates`) — criar do zero e gerenciar.
2. Botão "Salvar como template" em grupos existentes no editor de produto.

## Decisões de design

| Decisão | Escolha | Motivo |
|---|---|---|
| Origem dos templates | Biblioteca separada | Controle curado pelo admin |
| Vínculo após aplicar | Cópia independente | Sem sincronização; sem mudança de preço em massa acidental |
| Conteúdo do template | Estrutura + valores de adicional | Menos digitação; ajusta no produto se precisar |
| Modelagem | Tabelas espelho normalizadas | Segue padrão do projeto; queries de precificação intocadas |
| Nome duplicado | Permitido | Sem constraint unique; usuário gerencia na tela de templates |

## Dados — migração `0023_group_templates.sql`

```sql
create table option_group_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  required boolean not null default false,
  created_at timestamptz not null default now()
);

create table option_templates (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references option_group_templates(id) on delete cascade,
  company_id uuid not null references companies(id),
  label text not null,
  surcharge_type text not null default 'fixo' check (surcharge_type in ('fixo','por_m2')),
  surcharge_value numeric not null default 0,
  sort_order int not null default 0
);
```

- Índices por `company_id` nas duas tabelas.
- RLS: mesmas políticas de `option_groups`/`options` (leitura/escrita restrita à empresa do usuário).
- Sem coluna `active` no template (opção sempre nasce ativa ao aplicar).
- Sem `sort_order` no grupo template (listagem ordenada por nome).

## Tela admin — `/admin/templates`

- **Listagem**: templates da empresa ordenados por nome. Cada card segue o padrão de `group-editor.tsx`: form inline com nome, obrigatório, lista de opções (label, tipo, valor, ordem), adicionar/excluir opção, excluir template.
- **Criar do zero**: form "Novo template" no rodapé (padrão "Novo grupo" atual).
- **Arquivos**:
  - `src/app/(app)/admin/templates/page.tsx` — server component, busca templates + opções.
  - `src/app/(app)/admin/templates/template-editor.tsx` — client component.
  - `src/app/(app)/admin/templates/actions.ts` — `saveTemplate`, `deleteTemplate`, `saveTemplateOption`, `deleteTemplateOption`.
- Link no menu admin junto com Produtos, Empresa etc.

## Editor de produto — aplicar e salvar

Em `src/app/(app)/admin/produtos/[id]/group-editor.tsx`:

- **Aplicar template**: junto do form "Novo grupo", bloco "Usar template" com input de busca e filtro client-side (templates carregados no server component `page.tsx`; volume pequeno, sem busca no servidor). Lista mostra nome + nº de opções; botão "Aplicar" chama `applyTemplate(template_id, product_id)` → insere cópia do grupo + opções (todas `active = true`, `sort_order` das opções preservado). O grupo criado entra com `sort_order = 0` (padrão da tabela); admin ajusta depois se quiser.
- **Salvar como template**: botão em cada grupo existente → `saveGroupAsTemplate(group_id)` → copia grupo + opções para as tabelas de template.
- Actions novas em `produtos/[id]/actions.ts` (`applyTemplate`, `saveGroupAsTemplate`).

## Erros

- Actions seguem padrão atual: `throw new Error(mensagem)`; validação de empresa ativa via `getCompany()`.
- `applyTemplate`: confere que o template pertence à empresa (RLS garante; action falha com mensagem clara). Insere grupo, depois opções; se opções falharem, exclui o grupo criado (rollback manual — sem RPC atômica, volume pequeno).
- `saveGroupAsTemplate`: mesmo padrão no sentido inverso (exclui template criado se opções falharem).

## Testes

- Projeto só tem vitest em lógica pura (`pricing/snapshot.test.ts`); actions não têm testes hoje.
- Verificação manual via preview: criar template do zero, aplicar em produto, salvar grupo como template, editar template e conferir que produto não muda (cópia independente).

## Fora de escopo

- Sincronização template → produtos (vínculo vivo).
- Templates globais entre empresas.
- Busca server-side / paginação de templates.
