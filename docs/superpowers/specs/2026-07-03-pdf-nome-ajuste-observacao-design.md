# Melhorias: nome do PDF, ajuste livre e observação por item

**Data:** 2026-07-03
**Status:** Aprovado (design verbal); aguardando revisão deste documento
**Base:** sistema de orçamentos em produção (spec 2026-07-02)

## 1. Nome do PDF = nome do cliente

O PDF é gerado pela impressão do navegador, que sugere o título da página como
nome do arquivo. Hoje o título é fixo.

- `generateMetadata` nas duas rotas de apresentação:
  - `/orcamentos/[id]/apresentacao` (interna)
  - `/o/[token]` (pública)
- Título: `Orçamento - {customer_name}` → PDF sugerido: `Orçamento - João Silva.pdf`
- Orçamento inexistente: mantém comportamento atual (notFound), sem metadata especial

## 2. Ajuste livre (±R$) por item

- Novo campo do item no editor: **"Ajuste (R$)"** — aceita positivo (acréscimo)
  ou negativo (abatimento), via `parseDecimal` (vírgula decimal, milhar pt-BR)
- Aplicado **uma vez na linha**, não multiplica pela quantidade:
  `line_total = round2(unit_total × qty + ajuste)`
- Validação no motor: linha resultante < 0 → `PricingError`
  ("Ajuste deixa o item com valor negativo")
- Ajuste 0/vazio: comportamento idêntico ao atual
- Apresentação (interna e pública): quando ajuste ≠ 0, mostra linha
  `Ajuste: +R$ X` ou `Ajuste: −R$ X` dentro do item — desconto dado fica
  visível ao cliente

## 3. Observação por item

- Novo campo do item no editor: textarea **"Observação (aparece no orçamento)"**
- Texto livre, **visível ao cliente**: renderizado em itálico sob o item na
  apresentação interna, no link público e no PDF
- Vazio: nada renderizado

## 4. Dados e cálculo

- Migration 0005: `quote_items` + `extra_value numeric(12,2) not null default 0`,
  `note text not null default ''` — orçamentos existentes seguem válidos
- `save_quote_atomic` (função Postgres) passa a inserir os dois campos novos
  (migration recria a função com as colunas)
- Motor (`ItemInput`): `extraValue?: number` — testes novos: positivo, negativo,
  erro linha negativa, interação com qty e desconto do orçamento
- `ItemSelection` e `ItemSnapshot` ganham os campos; snapshot congela ambos;
  reconstrução na edição devolve ajuste e observação preenchidos
- Subtotal/total do orçamento: nada muda (linha já embute o ajuste)

## 5. Fora de escopo

- Observação interna (invisível ao cliente) — descartado nesta rodada
- Ajuste percentual — só R$ fixo
- Nome de arquivo customizável — sempre "Orçamento - {cliente}"

## 6. Testes

- Motor: casos novos de `extraValue` em `calc.test.ts` (TDD)
- Snapshot: round-trip de `extra_value`/`note` em `snapshot.test.ts`
- Verificação manual no browser: item com ajuste negativo e observação →
  editor, apresentação, link público e diálogo de impressão (nome do arquivo)
