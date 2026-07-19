# Apresentação tabular do orçamento

Data: 2026-07-18

## Objetivo

Novo estilo de apresentação dos itens do orçamento em formato de tabela, escolhido pelo admin por empresa. Vale para todas as superfícies que usam a apresentação: tela interna (`/orcamentos/[id]/apresentacao`), link público (`/o/[token]`) e impressão/PDF (print do browser). Informações e mecânicas de cálculo não mudam — apenas a forma de exibir.

## Contexto atual

- `src/components/presentation/quote-presentation.tsx` é o componente único de apresentação, usado pelas 3 superfícies. Itens hoje são cards (`div` com foto + texto empilhado + valor).
- Config de empresa vive na tabela `companies`, editada em Admin → Empresa (`src/app/(app)/admin/empresa/`). As páginas já buscam `company` e passam ao componente — nenhuma mudança de fetch necessária.
- Lógica de valores exibidos centralizada em `src/lib/pricing/display.ts` (`itemDisplayGross`, `quoteDisplayFooter`) — reutilizada sem mudança.

## Decisões

- **Escolha por empresa**: config única em Admin → Empresa. Sem override por orçamento.
- **Default `cards`**: empresas existentes continuam exatamente como hoje.
- **Tabela com miniatura**: foto pequena + descrição empilhada na mesma célula; não é planilha de uma coluna por campo.
- **Mesma tabela em todas as larguras**: sem scroll horizontal, sem fallback para cards em mobile. Colunas comprimem e descrição quebra linha.
- **Totais fora da tabela**: bloco de subtotal/desconto/multiplicador/total permanece como está, abaixo dos itens.
- **Arquitetura**: `QuotePresentation` vira orquestrador; seção de itens extraída em dois subcomponentes (cards e tabela). Header, totais, observações, formas de pagamento, garantias e texto de apresentação continuam compartilhados.

## Design

### 1. Banco de dados

Migration `0025_presentation_style.sql`:

```sql
alter table companies add column presentation_style text not null default 'cards'
  check (presentation_style in ('cards','tabela'));
```

### 2. Admin → Empresa

- `company-form.tsx`: select nativo "Estilo de apresentação do orçamento" com opções `Cards (padrão)` e `Tabela`, `defaultValue={settings?.presentation_style ?? 'cards'}`. Texto auxiliar: vale para tela, link público e PDF.
- `actions.ts` (`saveCompany`): persiste `presentation_style`; valida contra `['cards','tabela']`, fallback `'cards'`.

### 3. Componentes de apresentação

- `src/components/presentation/quote-presentation.tsx`: mantém header, totais, observações, pagamento, garantias. Seção de itens delega:
  - `company?.presentation_style === 'tabela'` → `<ItemsTable items={items} internal={internal} />`
  - senão → `<ItemsCards items={items} internal={internal} />`
- `src/components/presentation/items-cards.tsx`: código atual dos cards, extraído sem mudança de comportamento.
- `src/components/presentation/items-table.tsx`: novo. `<table>` com larguras naturais (`w-full`, bordas leves via `divide-y`/`border`):
  - Coluna **foto**: miniatura (~48px, `rounded object-cover`); coluna inteira omitida se nenhum item tem `model_photo_url`.
  - Coluna **Descrição**: empilha nome do produto/modelo, medidas (mesma regra atual: `L × A m (X m²)` ou só `X m²`), opções selecionadas, ajuste (mesma regra `internal`/negativo dos cards, incluindo `no-print` no ajuste interno positivo), nota em itálico.
  - Coluna **Qtd**: omitida se todos os itens têm `qty === 1`.
  - Coluna **Valor**: `formatBRL(itemDisplayGross(...))`, alinhada à direita, `whitespace-nowrap`.
  - `<thead>` com rótulos discretos (Descrição / Qtd / Valor); célula de foto sem rótulo.

### 4. Superfícies

Nenhuma mudança em `/orcamentos/[id]/apresentacao/page.tsx`, `/o/[token]/page.tsx` ou fluxo de print — todas já passam `company`. Impressão usa a mesma tabela (sem regras print específicas além das classes `no-print` existentes).

### 5. Testes e verificação

- Sem testes de componente no projeto (vitest cobre só `lib`); lógica de valores já testada em `pricing/display`.
- Verificação manual via preview: apresentação interna, link público e print preview nos dois estilos (trocar config em Admin → Empresa), incluindo mobile (375px).

## Fora de escopo

- Estilo por orçamento (override).
- Mudança no recibo (`/orcamentos/[id]/recibo`) — documento próprio, não usa `QuotePresentation`.
- Mudanças no editor de orçamento (`quote-editor.tsx`).
- Totais dentro da tabela (`tfoot`).
