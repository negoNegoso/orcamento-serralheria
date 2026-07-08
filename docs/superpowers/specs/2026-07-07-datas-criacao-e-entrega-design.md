# Datas de criação e de possível entrega no orçamento

## Contexto e objetivo

Vendedores e admins precisam enxergar **quando o orçamento foi criado** e **planejar a fabricação e entrega** dos produtos. Hoje:

- `quotes.created_at` já existe no banco e **já aparece nas exportações** (apresentação interna `/orcamentos/[id]/apresentacao` e página pública `/o/[token]`) como "Data: dd/mm/aaaa", além da listagem inicial. Porém **não aparece na tela de detalhe/edição interna** do orçamento.
- Não existe nenhum campo de data de entrega.

Este trabalho:
1. Exibe a data de criação também na tela de detalhe interna do orçamento.
2. Adiciona um novo campo **data de possível entrega** (`delivery_date`), obrigatório ao salvar, **de uso interno** (não aparece para o cliente).
3. Melhora a lista de orçamentos com exibição da data de entrega, seletor de ordenação e filtro por período de entrega.

## Escopo e decisões

- **Visibilidade da data de entrega:** apenas interna (vendedor dono e admin). **Não** aparece na apresentação nem na página pública do cliente.
- **Obrigatoriedade:** obrigatória ao salvar (validada na aplicação, cliente + server action). A coluna no banco permanece **nullable** para não quebrar orçamentos antigos nem a clonagem.
- **Data de criação:** passa a ser exibida também no cabeçalho da tela de detalhe interna.
- **Lista de orçamentos:** ordenação padrão continua por data de criação (mais recente primeiro). Adiciona-se um seletor "Ordenar por: Criação (padrão) / Entrega" e um filtro por período de entrega (de/até).

## Mudanças por camada

### 1. Banco de dados — nova migration `0009_delivery_date.sql`

- `alter table quotes add column delivery_date date;` (nullable).
- Recriar `save_quote_atomic(uuid, jsonb, jsonb)` para gravar `delivery_date = (p_quote->>'delivery_date')::date` no update do cabeçalho.
- Recriar `clone_quote(uuid)`: a cópia **não** herda a data de entrega (define `delivery_date` como `null`), pois a cópia é um novo trabalho a ser replanejado. Mantém o restante do comportamento atual (inclui `valid_until` recalculado).
- Manter grants/revokes idênticos aos das versões atuais das funções.

### 2. Server action `saveQuote` (`src/app/(app)/orcamentos/actions.ts`)

- `SaveQuoteInput` ganha `deliveryDate: string` (formato `YYYY-MM-DD`).
- Validação: se `deliveryDate` vazio/ inválido → `return { error: 'Informe a data de entrega' }`.
- Incluir `delivery_date: input.deliveryDate` em `quoteRow` (enviado ao `save_quote_atomic`).
- Na criação (insert inicial do `quotes`), incluir também `delivery_date`.

### 3. Editor (`src/components/quote/quote-editor.tsx`)

- `ExistingQuote` ganha `delivery_date: string | null`.
- Novo estado `deliveryDate` inicializado com `quote?.delivery_date ?? ''`.
- Novo `<Input type="date">` "Data de possível entrega *" na seção Cliente.
- Enviar `deliveryDate` no `saveQuote`.
- Botão "Salvar" desabilitado enquanto `deliveryDate` estiver vazio (junto das validações já existentes).

### 4. Tela de detalhe interna (`src/app/(app)/orcamentos/[id]/page.tsx`)

- Selecionar `delivery_date` (já usa `select('*')`, então já vem).
- Passar `delivery_date` para `ExistingQuote`.
- Exibir no cabeçalho: "Criado em: dd/mm/aaaa · Entrega prevista: dd/mm/aaaa" (data de entrega só interna, ok aqui).

### 5. Lista de orçamentos (`src/app/(app)/page.tsx`)

- `searchParams` ganha: `sort` (`'criacao' | 'entrega'`, padrão `'criacao'`), `de` e `ate` (datas `YYYY-MM-DD`).
- Query:
  - `sort='criacao'` → `.order('created_at', { ascending: false })` (atual).
  - `sort='entrega'` → `.order('delivery_date', { ascending: true, nullsFirst: false })`.
  - `de` → `.gte('delivery_date', de)`; `ate` → `.lte('delivery_date', ate)`.
  - Mantém busca por `customer_name` e filtro de `status`.
- UI do formulário: adicionar seletor de ordenação e dois inputs `type="date"` (de/até).
- Cada item da lista exibe "Entrega: dd/mm/aaaa" (ou "Entrega: —" quando null).

## Não faz parte deste trabalho (YAGNI)

- Data de entrega na exportação/PDF do cliente.
- Alertas/notificações de prazos.
- Tornar a coluna `NOT NULL` no banco ou backfill de orçamentos antigos (ficam com entrega em branco até serem editados; ao próximo save serão obrigados a preencher).

## Testes

- `saveQuote`: rejeita quando `deliveryDate` vazio; persiste `delivery_date` quando válido (seguir padrão de testes existentes do módulo).
- Lista: verificar montagem de query conforme `sort`/`de`/`ate` (se houver camada testável extraída; caso contrário, validar manualmente).
- Rodar a suíte com `npm run test` e garantir build (`npm run build`) antes de concluir.
