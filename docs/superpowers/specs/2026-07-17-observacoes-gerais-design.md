# Observações gerais do orçamento

**Data:** 2026-07-17
**Status:** Aprovado

## Objetivo

Campo de observações gerais no orçamento (condições especiais, prazos, detalhes combinados), visível para a equipe no editor e para o cliente final na página pública e no PDF.

## Decisões

| Decisão | Escolha |
|---|---|
| Visibilidade | Editor + página pública `/o/[token]` + impressão/PDF |
| Recibo | Não mostra (é comprovante de pagamento) — fora de escopo |
| Estrutura | Coluna única `general_note text not null default ''` em `quotes` |

## Design

### Banco

Migration nova (próximo número livre em `supabase/migrations/`):

```sql
alter table quotes add column general_note text not null default '';
```

- `save_quote_atomic`: update ganha `general_note = coalesce(p_quote->>'general_note', '')`.
- `clone_quote`: copia `general_note` no insert do clone.

### Editor (`src/components/quote/quote-editor.tsx`)

Textarea "Observações gerais" abaixo da lista de itens, antes do resumo/total. Mesmo padrão visual da nota de item (`item-form.tsx`: `Textarea rows={2}`). Valor entra no payload enviado ao `save_quote_atomic` (campo `general_note` no objeto `p_quote`).

### Apresentação (`src/components/presentation/quote-presentation.tsx`)

Bloco "Observações" após os itens, antes das condições de pagamento. Renderiza só se `general_note` não-vazio. Quebras de linha preservadas com `whitespace-pre-line`. Como o componente é compartilhado, o campo aparece automaticamente na apresentação interna, na página pública e na impressão/PDF.

### Multi-tenant

Nenhum impacto: coluna nova em `quotes` herda a RLS vigente. Se o plano multi-tenant (`2026-07-16`) for implementado antes, apenas a numeração da migration muda; `save_quote_atomic`/`clone_quote` são editadas na versão vigente no momento da implementação.

## Erros e edge cases

- Observação vazia → bloco não renderiza (nem título).
- Texto longo/multilinha → preservado (`whitespace-pre-line`), sem limite imposto.
- Orçamentos existentes → default `''`, comportamento idêntico ao atual.

## Testes

Sem lógica pura nova — verificação via preview: salvar orçamento com observação multilinha, conferir editor (persistência), página pública e visualização de impressão; salvar sem observação e confirmar ausência do bloco; clonar orçamento e confirmar cópia do texto.
