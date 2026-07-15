# Kill Switch / Modo Manutenção — Design

**Data:** 2026-07-15
**Status:** Aprovado (aguardando review do spec)

## Objetivo

Ter um controle máximo do dono do sistema (agência/desenvolvedor) para tornar o
site **totalmente inacessível via qualquer URL** através de uma única flag no
banco de dados. Uso principal: suspender o acesso caso o cliente não pague a
mensalidade. A flag é alternada diretamente no Supabase (SQL / Table Editor),
fora do alcance do cliente.

## Escopo

- **Incluído:** flag global única; bloqueio de todas as rotas (públicas,
  autenticadas e a rota pública `/o/[token]`); página neutra de manutenção;
  toggle via Supabase.
- **Fora de escopo (YAGNI):** multi-tenant / bloqueio por empresa; painel
  super-admin dentro do site; "porta dos fundos" de acesso durante o bloqueio;
  agendamento automático por vencimento de pagamento.

## Decisões

| Tema | Decisão |
|------|---------|
| Escopo | Flag única global (single-tenant por enquanto) |
| Toggle | Direto no Supabase (SQL / Table Editor) |
| Tela ao visitante | Página neutra "em manutenção" (não expõe o motivo), HTTP 503 |
| Porta dos fundos | Não há — bloqueia todos; reativação só pelo Supabase |
| Falha ao ler a flag | **Fail-open** (site continua no ar em caso de erro) |
| Propagação do toggle | Quase imediata (cache best-effort ~30s) |

## Arquitetura

Next.js 16 usa **`proxy.ts`** (antigo "middleware"), que roda em toda
requisição no runtime **Node.js** por padrão. É o único ponto capaz de
interceptar *qualquer* URL antes da renderização, então é onde o bloqueio vive.

Fluxo por requisição:

```
request ──▶ proxy.ts
             │ lê flag maintenance_mode (cache best-effort ~30s → fetch REST Supabase)
             ├─ true  ──▶ Response HTML 503 inline (página de manutenção)
             └─ false ──▶ NextResponse.next()  (fluxo normal)
   erro ao ler ─────────▶ NextResponse.next()  (fail-open)
```

### Componentes

1. **Migration `supabase/migrations/0014_app_settings.sql`**
   - Tabela singleton `public.app_settings`:
     - `id boolean primary key default true` com `check (id)` → garante linha única.
     - `maintenance_mode boolean not null default false`
     - `updated_at timestamptz not null default now()`
   - Seed: `insert into app_settings (id) values (true) on conflict do nothing;`
   - RLS: `enable row level security`.
     - Policy `SELECT` para `anon` e `authenticated` (`using (true)`) — a flag
       não é segredo e o proxy a lê com a anon key.
     - **Sem** policy de escrita → só o service role (Table Editor / SQL do
       dashboard) altera.

2. **`src/lib/site-status.ts`**
   - `isMaintenanceMode(): Promise<boolean>`
   - Faz `fetch` a
     `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/app_settings?select=maintenance_mode`
     com headers `apikey` + `Authorization: Bearer <anon key>`.
   - Cache em módulo (`let cache = { value, expiresAt }`) com TTL ~30s. É apenas
     otimização best-effort; se o ambiente não preservar o módulo entre
     requisições, apenas consulta novamente (correção não depende do cache).
   - **Fail-open:** qualquer erro (rede, status != 2xx, parsing) → retorna
     `false` (não bloqueia).

3. **`src/lib/maintenance-response.ts`**
   - `maintenanceResponse(): Response`
   - Retorna `Response` com status **503**, `Content-Type: text/html; charset=utf-8`,
     header `Retry-After`, e corpo HTML autossuficiente (CSS inline, sem assets
     externos) com texto neutro: "Site em manutenção. Voltamos em breve."

4. **`proxy.ts`** (raiz do projeto)
   - `export const config = { matcher: [...] }` que roda em tudo **exceto**
     `_next/static`, `_next/image`, `favicon.ico` (assets internos hasheados —
     evita consultas desnecessárias em operação normal).
   - `export async function proxy(request)`:
     ```
     if (await isMaintenanceMode()) return maintenanceResponse()
     return NextResponse.next()
     ```

## Fluxo de dados

- Fonte da verdade: coluna `app_settings.maintenance_mode` no Supabase.
- Leitura: proxy → `isMaintenanceMode()` → REST Supabase (anon key) → cache 30s.
- Escrita: manual pelo operador no Supabase (bypassa RLS via service role).

## Tratamento de erros

- Erro ao consultar o Supabase → **fail-open** (`isMaintenanceMode()` retorna
  `false`), o site permanece acessível. Justificativa: nunca derrubar um cliente
  pagante por falha transitória do banco.

## Estratégia de testes (vitest)

- `src/lib/site-status.test.ts`:
  - `fetch` mockado retornando `maintenance_mode: true` → `isMaintenanceMode()` = `true`.
  - retornando `false` → `false`.
  - `fetch` rejeitando / status 500 → `false` (fail-open).
  - cache: segunda chamada dentro do TTL não refaz `fetch`.
- `src/lib/maintenance-response.test.ts`:
  - status 503, `Content-Type` html, corpo contém o texto de manutenção,
    header `Retry-After` presente.
- `proxy.ts` / matcher: não testável em unidade — validação manual (ligar a flag
  e conferir que qualquer rota retorna 503; desligar e conferir retorno normal).

## Operação

- **Bloquear:** `update app_settings set maintenance_mode = true;`
- **Liberar:** `update app_settings set maintenance_mode = false;`
  (efeito em até ~30s pelo cache).

## Riscos / observações

- Assets sob `_next/static` não são bloqueados (excluídos do matcher). Durante a
  manutenção nenhuma página é servida, então esses chunks não são requisitados;
  vazamento é desprezível (JS/CSS hasheados, sem conteúdo sensível).
- Server Actions são POST para a rota onde vivem; como o matcher cobre essas
  rotas, também são bloqueadas durante a manutenção.
