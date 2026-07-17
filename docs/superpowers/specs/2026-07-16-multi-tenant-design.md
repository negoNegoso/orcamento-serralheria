# Multi-tenant: múltiplas empresas com isolamento total + admin_system

**Data:** 2026-07-16
**Status:** Aprovado

## Objetivo

Transformar o sistema (hoje single-tenant, uma serralheria) em plataforma multi-empresa:

- Várias empresas usam o mesmo site, cada uma com seus dados 100% isolados — produtos, modelos, opções, orçamentos, clientes, produção, condições de pagamento, configurações e branding. Dados de empresas distintas não se misturam em hipótese alguma.
- Novo perfil **admin_system** (dono da plataforma): cria/gerencia/suspende empresas e entra em qualquer uma como membro para dar suporte.
- Cada empresa tem **cor destaque** própria que tematiza o app, o orçamento público e o recibo.

## Decisões de requisito

| Decisão | Escolha |
|---|---|
| Vínculo usuário ↔ empresa | Exatamente 1 empresa por login (`company_id` no profile) |
| Acesso | Mesma URL para todas as empresas; empresa determinada pelo login |
| Suporte do admin_system | Acesso total (age como admin da empresa selecionada) |
| Dados atuais | Viram a empresa #1; nada se perde |
| Onboarding | admin_system cria a empresa e o primeiro admin dela (email/senha) |
| Suspensão | Empresa tem status `ativa`/`suspensa`; suspensa bloqueia membros, preserva dados |

## Arquitetura escolhida

**Banco único + coluna `company_id` + RLS por empresa** (Postgres Row Level Security no Supabase).

O isolamento vive no banco, não no código: toda policy filtra por empresa e todo `with check` força gravação na empresa correta. Bug no código de aplicação não vaza dado — o Postgres recusa.

Alternativas descartadas: schema por tenant (Supabase/PostgREST não suporta bem, migrations por tenant) e projeto Supabase por empresa (custo, ops e admin central inviáveis).

## 1. Schema

### Nova tabela `companies`

```sql
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'ativa' check (status in ('ativa','suspensa')),
  logo_url text,
  city text not null default '',
  phone text not null default '',
  about_text text not null default '',
  warranty_text text not null default '',
  default_validity_days int not null default 15,
  accent_color text not null default '#0f766e' check (accent_color ~ '^#[0-9a-f]{6}$'),
  created_at timestamptz not null default now()
);
```

Absorve os campos do singleton `company_settings` (que deixa de existir ao final). `app_settings` (kill switch global de manutenção) permanece global, sem `company_id`.

### `company_id` nas tabelas de dados

`company_id uuid not null references companies(id)` + índice em:

`profiles`*, `product_types`, `option_groups`, `options`, `models`, `payment_conditions`, `quotes`, `quote_items`, `clients`

\* Exceção: profile com role `admin_system` tem `company_id null`.

Tabelas filhas (`option_groups`, `options`, `models`, `quote_items`) recebem `company_id` denormalizado de propósito: policy RLS vira comparação direta sem join, índice direto, e impede item de uma empresa referenciar pai de outra.

### Roles e suporte

- `profiles.role`: `admin_system` | `admin` | `vendedor`.
- Constraint: `role = 'admin_system'` ⇔ `company_id is null`.
- `profiles.acting_company_id uuid null references companies(id)`: usada só por admin_system; guarda a empresa selecionada para suporte.

### Storage

Paths do bucket `fotos` ganham prefixo `{company_id}/...`. Policy de storage valida o prefixo contra a empresa efetiva do usuário. Fotos existentes movem para o prefixo da empresa #1 (script), com URLs atualizadas em `models.photo_url` e `companies.logo_url`.

## 2. RLS / Isolamento

### Funções helper (security definer, stable)

```sql
-- Empresa efetiva: membro comum → profiles.company_id;
-- admin_system → profiles.acting_company_id. Sem seleção → null (vê nada).
create function current_company_id() returns uuid;

-- Profile ativo com role admin_system.
create function is_admin_system() returns boolean;

-- Admin da empresa efetiva OU admin_system atuando nela.
create function is_company_admin() returns boolean;
```

### Padrão de policy (todas as tabelas de dados)

- Leitura: `company_id = current_company_id()`.
- Escrita de configuração (`product_types`, `option_groups`, `options`, `models`, `payment_conditions`, branding em `companies`): mesma condição **e** `is_company_admin()`.
- Orçamentos/itens/clientes: qualquer membro da empresa lê e escreve (comportamento atual mantido, agora por empresa).
- `with check` em todo insert/update força `company_id = current_company_id()` — impossível gravar na empresa errada.

### Policies especiais

- `companies`: admin_system lê/escreve todas; membro comum lê só a própria (branding) e não altera `status`.
- `profiles`: membro lê o próprio; admin da empresa lê/gerencia os da própria empresa; admin_system lê todos. Criar/editar profile com role `admin_system` só via admin_system (regra na policy, não no código).
- Suspensão: empresa `suspensa` → policies negam leitura/escrita para membros comuns; admin_system continua vendo.

### RPCs

`save_quote_atomic`, clone/multiplicador, dashboard metrics e `sync_client_to_quotes` deixam de ler `company_settings where id = 1` e passam a operar sobre `current_company_id()`, validando empresa internamente (são `security definer`).

### Página pública `/o/[token]`

Continua via service role (`createAdminClient`). Busca o orçamento pelo token e carrega branding, cor e condições de pagamento **da empresa dona do orçamento** (`quote.company_id`). Token de empresa suspensa continua acessível — link já enviado ao cliente final não quebra.

## 3. admin_system — telas e fluxo de suporte

### Nova área `/sistema` (guard: só admin_system)

- **`/sistema/empresas`** — lista: nome, status, nº usuários, nº orçamentos, criada em. Ações: criar, suspender/reativar, "entrar como suporte".
- **`/sistema/empresas/nova`** — form: dados da empresa (incl. cor destaque) + primeiro admin (nome, email, senha). Server action com service role: cria empresa → auth user → profile `admin`. Falha no meio → rollback (deleta auth user órfão; padrão já usado em `/admin/usuarios`).
- **`/sistema/empresas/[id]`** — edita dados/cor, lista usuários da empresa, reset de senha.

### Fluxo de suporte

1. "Entrar como suporte" → server action grava `acting_company_id`.
2. Redirect para `/orcamentos`. RLS enxerga admin_system como membro; todas as telas existentes funcionam **sem mudança**.
3. Banner fixo no topo: "🔧 Suporte: [Empresa] — [Sair]".
4. Sair → limpa `acting_company_id` → volta a `/sistema/empresas`.

### Guards de navegação

- admin_system sem empresa selecionada → cai em `/sistema/empresas`.
- Membro comum em `/sistema/*` → redirect (mesmo padrão do guard admin atual).
- Nav lateral do admin_system em suporte: itens normais + "Voltar ao sistema".

## 4. Cor destaque

- Editável em `/admin/empresa` (admin da empresa) e em `/sistema/empresas/*` (admin_system). Color picker + preview.
- **App interno:** layout injeta CSS variable (`--primary`) com a cor da empresa efetiva → botões, links, nav e dashboard herdam sem tocar componente por componente.
- **Orçamento público e recibo:** usam a cor da empresa dona do orçamento (cabeçalho, destaques, total). Sai na impressão/PDF.
- Texto sobre a cor: branco ou preto calculado por luminância (helper puro com teste unitário).
- Fallback: sem cor/empresa → default atual do tema.

## 5. Migração de dados

Uma migration principal, ordem:

1. Cria `companies`; insere empresa #1 copiando `company_settings`.
2. `company_id uuid null` nas 9 tabelas → backfill com empresa #1 → `not null` + FK + índices.
3. Atualiza check de `profiles.role`; adiciona `acting_company_id`; constraint admin_system ⇔ company_id null.
4. Recria helpers e **todas** as policies (drop das antigas). Reescreve RPCs company-aware.
5. Storage: policy por prefixo; script move fotos e atualiza URLs.
6. (Migration final, após código migrado) remove `company_settings`.
7. Seed/script: cria o usuário admin_system.

Reversível até o passo 6. Testar em branch do Supabase antes de produção.

## 6. Plano de código (ordem)

1. Helpers: `getCurrentCompany()` em `src/lib/auth.ts`, tipos, luminância.
2. Queries/actions existentes: trocar `company_settings id=1` pela empresa corrente; inserts ganham `company_id` explícito (defesa em profundidade — RLS já força).
3. Layout: CSS variable da cor, banner de suporte, guard de suspensão.
4. `/o/[token]` e recibo: branding pela empresa do orçamento.
5. Área `/sistema` completa.
6. `/admin/empresa` passa a editar a linha da empresa em `companies`.

## 7. Erros e edge cases

- admin_system sem empresa → `/sistema` (RLS retorna vazio por padrão; seguro).
- Empresa suspensa → membro vê tela de aviso; dados preservados; admin_system reativa.
- Criação de empresa falha no meio → rollback do auth user órfão.
- Link público de empresa suspensa → continua funcionando.
- Upload de foto → sempre no prefixo da empresa efetiva; policy recusa path fora dele.

## 8. Testes

- Unitários (Vitest, já configurado): luminância/contraste, helpers puros, lógica de guards.
- **Teste de isolamento em SQL:** dois usuários de empresas diferentes; para cada tabela, confirmar que select/insert/update cruzado retorna vazio/erro. Zero vazamento é critério de aceite.
- Fluxo admin_system: criar empresa, entrar como suporte, criar orçamento, sair, confirmar que sem seleção não vê dados.
