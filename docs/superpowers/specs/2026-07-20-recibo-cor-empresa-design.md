# Recibo — cor da configuração da empresa

**Data:** 2026-07-20
**Status:** Aprovado

## Problema

O recibo ([recibo-document.tsx](../../../src/components/receipt/recibo-document.tsx)) usa cor hardcoded `ACCENT = '#00b8e6'` (ciano da marca L.D). Empresas com outra `accent_color` configurada veem o recibo com cor errada.

## Solução

Usar os tokens de tema que o layout do app já injeta a partir de `companies.accent_color` (`--primary`, `--primary-foreground`, via `readableTextColor`). O Tailwind v4 já mapeia esses tokens (`bg-primary`, `text-primary`, `text-primary-foreground`).

## Mudanças

Só em `src/components/receipt/recibo-document.tsx`:

1. Remover a constante `ACCENT`.
2. Card da marca (header): trocar `text-white` + `style={{ backgroundColor: ACCENT }}` por `bg-primary text-primary-foreground`. Sub-textos com `opacity-90` mantidos.
3. Valor recebido e Total: trocar `style={{ color: ACCENT }}` por `text-primary`.

## Não muda

- Schema, props, páginas — a página do recibo já está dentro do layout `(app)` que injeta as vars.
- Sem teste unitário: troca de classes, sem lógica.

## Verificação

Preview no browser da página do recibo confirmando cor da empresa aplicada (card do header, valor recebido e total), incluindo contraste do texto no card.
