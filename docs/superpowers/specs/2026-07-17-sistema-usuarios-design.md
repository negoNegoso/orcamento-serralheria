# Vínculo de Usuários pelo admin_system — Design

**Autor:** brainstorming com o usuário (admin_system)
**Data:** 2026-07-17

## Objetivo

Dar ao `admin_system` uma página central para **criar** usuários já vinculados a uma
empresa e para **reatribuir** usuários existentes (trocar empresa, papel e ativar/desativar),
sem precisar entrar no modo suporte de cada empresa.

## Escopo

- Exclusiva do papel `admin_system` (já garantido pelo `SistemaLayout`).
- **Não** altera a página de Usuários da empresa (`/admin/usuarios`) nem a RLS.
- Papéis atribuíveis: apenas `admin` e `vendedor` (sempre vinculados a uma empresa).

## Localização e navegação

- Nova rota `/sistema/usuarios`.
- Novo link **"Usuários"** no header de navegação do `src/app/sistema/layout.tsx`
  (ao lado de "Empresas" e "Áreas").

## Componentes / arquivos

- `src/app/sistema/usuarios/page.tsx` — Server Component:
  - Lista todos os usuários da plataforma (nome, e-mail, empresa atual, papel, status).
  - Uma linha por usuário com selects de **empresa** e **papel**, checkbox **Ativo** e botão Salvar.
  - Formulário "Novo usuário": nome, e-mail, senha (mín. 8), select de **empresa**, select de **papel**.
  - Perfis com `role = 'admin_system'` são exibidos apenas como leitura (sem formulário de edição),
    para não rebaixá-los por engano.
- `src/app/sistema/usuarios/actions.ts` — Server Actions:
  - `createPlatformUser(fd)`: valida admin_system; cria no Auth (`admin.auth.admin.createUser`)
    e insere `profiles` com `company_id`, `role`, `name`, `email`. Rollback do usuário Auth se o
    insert de profile falhar (mesmo padrão de `admin/usuarios/actions.ts`).
  - `assignUser(fd)`: valida admin_system; atualiza `profiles.company_id`, `role`, `active`
    para o `id` informado. Recusa alterar perfis `admin_system`.
- `src/app/sistema/layout.tsx` — adicionar o link de navegação.

## Fluxo de dados

- Leitura da lista e das empresas: `createAdminClient()` (service-role), pois a operação é
  cross-company. Consistente com as actions existentes de usuários.
- Empresas para os selects: `select id, name from companies order by name`.

## Validações / regras

- Guard em cada action: `profile.role === 'admin_system'` (defense-in-depth além do layout).
- `role` é normalizado para `'admin'` ou `'vendedor'` (qualquer outro valor vira `'vendedor'`).
- `assignUser` e `createPlatformUser` exigem uma `company_id` que exista na tabela `companies`.
- `assignUser` recusa quando o perfil-alvo tem `role = 'admin_system'`.
- Criação exige `name`, `email` e `password` com no mínimo 8 caracteres.

## Fora de escopo

- Exclusão de usuários.
- Atribuição do papel `admin_system` por esta página.
- Alterações na página `/admin/usuarios` e na RLS.

## Testes

- `npx tsc --noEmit` e `npm test` verdes.
- Verificação manual: criar usuário vinculado à empresa A; reatribuir para empresa B com troca
  de papel; desativar/reativar; confirmar que perfis admin_system aparecem só em leitura.
