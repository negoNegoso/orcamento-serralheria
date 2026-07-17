# Catálogo de Áreas de Atuação

## Contexto

Hoje o campo "Área de atuação" (`companies.business_area`) é um input de texto livre,
repetido em 3 formulários: `/admin/empresa`, `/sistema/empresas/nova` e
`/sistema/empresas/[id]`. O default é `'Serralheria'`.

O objetivo é transformá-lo numa caixa de pesquisa alimentada por um catálogo de áreas
pré-cadastradas no banco, mantendo a possibilidade de digitar uma área nova. Toda área
nova digitada entra automaticamente no catálogo. O `admin_system` ganha uma tela para
gerenciar (adicionar/renomear/remover) as áreas.

## Abordagem escolhida

**Catálogo denormalizado.** Uma nova tabela `business_areas` alimenta apenas a caixa de
pesquisa. A coluna `companies.business_area` continua sendo `text` (sem FK). Isso evita
migração de `companies`, mantém o texto livre trivial e isola o catálogo. Remover uma
área do catálogo **não** altera empresas já cadastradas — elas guardam o texto.

## 1. Banco de dados

Migration `supabase/migrations/0020_business_areas.sql` (aplicada em produção via
MCP `apply_migration`, projeto `nwtfesocleshvynxrpfh`):

```sql
create table business_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- unicidade case-insensitive: evita "Serralheria" vs "serralheria"
create unique index business_areas_name_lower_uq on business_areas (lower(name));

insert into business_areas (name) values ('Serralheria'), ('Construção')
  on conflict do nothing;

alter table business_areas enable row level security;
```

Políticas RLS:
- **SELECT**: qualquer usuário autenticado (lista compartilhada, não isolada por empresa).
- **INSERT**: qualquer `admin`, `vendedor` ou `admin_system` (auto-add ao salvar empresa;
  precisa cobrir quem edita empresa em `/admin/empresa`).
- **UPDATE / DELETE**: apenas `admin_system` (tela de gestão).

A coluna `companies.business_area` permanece `text not null default 'Serralheria'` — sem
alteração.

## 2. Caixa de pesquisa (UI)

Componente client reutilizável `src/components/business-area-input.tsx`:

- Props: `areas: string[]`, `defaultValue?: string`, `required?: boolean`.
- Renderiza `<input list="business-areas" name="business_area" ...>` + `<datalist>` com
  as opções. Nativo, pesquisável, aceita digitar uma área nova.
- Mantém `name="business_area"` — os server actions não mudam a forma de ler o campo.

Aplicado nos 3 formulários. Cada página (server) busca
`select name from business_areas order by name` e passa o array ao componente:
- `src/app/(app)/admin/empresa/company-form.tsx` (já é client; recebe `areas` via prop
  do `page.tsx`).
- `src/app/sistema/empresas/nova/page.tsx`.
- `src/app/sistema/empresas/[id]/page.tsx`.

## 3. Auto-add ao salvar

Nos server actions que gravam empresa, após persistir `business_area`, inserir a área no
catálogo se não existir:

```ts
const area = String(fd.get('business_area')).trim();
if (area) {
  await supabase.from('business_areas').insert({ name: area });
  // conflito de unicidade é ignorado (área já existe)
}
```

Locais:
- `src/app/(app)/admin/empresa/actions.ts`
- `src/app/sistema/empresas/actions.ts` (create e update)

## 4. Tela de gestão `/sistema/areas`

- `src/app/sistema/areas/page.tsx` — server component sob o layout `/sistema` (restrito a
  `admin_system`). Lista as áreas ordenadas por nome.
- Ações em `src/app/sistema/areas/actions.ts`: `createArea`, `renameArea`, `deleteArea`.
- Novo item "Áreas" no menu do `/sistema` (`src/app/sistema/layout.tsx` ou onde o menu
  do sistema é definido).
- Remover uma área não afeta `companies` existentes.
- Validação: nome não vazio, sem duplicado case-insensitive (tratado pelo índice único +
  mensagem amigável no action).

## 5. Normalização e testes

Helper puro `src/lib/business-area.ts`:
- `normalizeAreaName(raw: string): string` — `trim()` e colapsa espaços internos.
- Teste `src/lib/business-area.test.ts` cobrindo: trim, espaços múltiplos, string vazia
  vira `''`.

Verificação final: `npm test`, `npx tsc --noEmit`, `npm run build`.

## Fora de escopo

- FK entre `companies` e `business_areas`.
- Migração/normalização retroativa dos valores atuais de `companies.business_area`.
- Reatribuir empresas quando uma área é removida do catálogo.
