# WhatsApp — mensagem completa do orçamento

**Data:** 2026-07-20
**Status:** Aprovado

## Problema

O botão WhatsApp da apresentação ([share-bar.tsx](../../../src/components/quote/share-bar.tsx)) envia apenas saudação, total e link público. Se o cliente não puder abrir o PDF no momento, não vê nenhum detalhe do orçamento.

## Solução

O botão WhatsApp vira um menu com duas opções:

1. **Enviar link** — comportamento atual (saudação + total + link público).
2. **Enviar mensagem completa** — mensagem de texto com todos os itens e o total, legível sem abrir o PDF.

## Formato da mensagem completa

```
Olá, Maria! Segue seu orçamento:

1. *Janela 2 folhas — Suprema*
   1,20 × 1,00 m · 2 un — R$ 1.500,00

2. *Porta de correr*
   2,00 × 2,10 m · 1 un — R$ 2.800,00

*Total: R$ 4.300,00*
```

Regras:

- **Item:** `product_name` + ` — model_name` quando houver modelo. Linha seguinte: medidas `L × A m` (quando `width_m`/`height_m` existirem), quantidade `N un`, valor da linha.
- **Valor da linha:** mesmo valor exibido no PDF — `itemDisplayGross(line_total, extra_value)` (ajuste negativo sai do item e vira desconto; aqui só afeta o valor bruto exibido).
- **Total:** mesmo cálculo do PDF — `quoteDisplayFooter(subtotal, discount, extraValues, multiplier).total`.
- **Multiplicador:** se `multiplier > 1`, linha extra antes do total: `3 casas × R$ 4.300,00`.
- **Não inclui:** link público, subtotal, desconto, formas de pagamento, observações, validade (decisão do usuário).
- Valores em BRL via `formatBRL`.

## Arquitetura

- **`src/lib/whatsapp-message.ts`** — `buildQuoteMessage(quote, items)`, função pura que retorna a string. Recebe apenas os campos necessários (nome do cliente, subtotal, discount, multiplier e itens com nome, modelo, medidas, qtd, line_total, extra_value).
- **`src/components/quote/share-bar.tsx`** — botão WhatsApp abre menu (estado local + div absoluta, fecha ao clicar fora). Duas opções; ambas marcam o orçamento como `enviado` (quando `markSent`) e abrem `wa.me` com o texto codificado. Nova prop `fullMessage: string`.
- **`src/app/(app)/orcamentos/[id]/apresentacao/page.tsx`** — monta `fullMessage` no server com `buildQuoteMessage` e passa ao ShareBar.

Sem dependência nova (sem Radix/dropdown-menu).

## Testes

`src/lib/whatsapp-message.test.ts`:

- Item com e sem modelo.
- Item com e sem medidas.
- `multiplier > 1` gera linha `N casas × R$ …` e total multiplicado.
- Ajuste negativo: valor do item exibido bruto.
- Formato geral da mensagem (saudação, numeração, total).

## Fora de escopo

- Envio direto para o telefone do cliente (`customer_phone`) — botão continua abrindo `wa.me` sem número.
- Alterações na página pública `/o/[token]`.
