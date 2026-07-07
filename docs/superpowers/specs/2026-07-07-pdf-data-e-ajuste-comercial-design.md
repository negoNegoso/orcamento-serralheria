# Data no nome do PDF e ajuste positivo como info comercial

**Data:** 2026-07-07
**Status:** Aprovado (design verbal); aguardando revisão deste documento
**Base:** sistema de orçamentos em produção (specs 2026-07-02 e 2026-07-03)

## 1. Data de geração no nome do PDF

O PDF é gerado pela impressão do navegador, que sugere o título da página
(`generateMetadata`) como nome do arquivo. Hoje o título é `Orçamento - {cliente}`.

- A data de geração é `quote.created_at`.
- Formato no nome: `DD-MM-YYYY` (com hífens — `/` é inválido em nome de arquivo).
- Novo título: `{DD-MM-YYYY} - Orçamento - {cliente}`
  - Exemplo: `07-07-2026 - Orçamento - João Silva.pdf`
- Aplicar nas duas rotas de apresentação:
  - `/o/[token]` (pública) — `generateMetadata` passa a selecionar `created_at`
  - `/orcamentos/[id]/apresentacao` (interna) — idem
- Orçamento inexistente: mantém fallback atual (`Orçamento`), sem data.
- A data exibida **dentro** do orçamento continua `DD/MM/YYYY` (inalterada).

## 2. Ajuste positivo = informação comercial (só vendedor/admin)

O ajuste positivo (acréscimo) é uma informação comercial da empresa e **não**
deve aparecer para o cliente (link público e PDF).

Situação atual: a linha `Ajuste: +R$ X` aparece em ambas as visões (interna e
pública) e o valor já está embutido no total do item.

- `QuotePresentation` ganha a prop `internal: boolean`.
  - Rota interna (`/orcamentos/[id]/apresentacao`, autenticada): `internal={true}`
    → mostra a linha `Ajuste: +R$ X`.
  - Rota pública (`/o/[token]`, cliente + PDF): `internal={false}`
    → **oculta** a linha de ajuste positivo.
- O total do item **não muda**: o acréscimo segue embutido no valor exibido; o
  cliente apenas não vê a decomposição.
- Ajuste **negativo** (desconto): comportamento **inalterado** — continua visível
  ao cliente, agregado à linha "Desconto" do rodapé.
- No PDF (impresso da rota pública) o ajuste positivo também fica oculto, pois usa
  a mesma view.

## 3. Fora de escopo

- Alterar a data exibida dentro do orçamento.
- Nome de arquivo customizável.
- Ocultar ajuste negativo do cliente (permanece visível como desconto).
- Distinção de papéis entre vendedor e admin (ambos usam a rota interna).

## 4. Testes / verificação

- Verificação manual no browser:
  - Nome sugerido no diálogo de impressão nas duas rotas começa com `DD-MM-YYYY`.
  - Item com ajuste positivo: linha `Ajuste: +R$ X` aparece na rota interna e
    **não** aparece na rota pública; total do item idêntico nas duas.
  - Item com ajuste negativo: linha "Desconto" continua visível na rota pública.
