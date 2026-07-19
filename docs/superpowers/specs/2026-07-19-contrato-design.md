# Geração de contrato empresa ↔ consumidor — Design

**Data:** 2026-07-19
**Status:** Aprovado

## Objetivo

Gerar contrato em PDF a partir de um orçamento existente, formalizando a venda entre a
empresa (CONTRATADA, dados já no banco) e o consumidor (CONTRATANTE, dados coletados em
tempo de execução, **nunca gravados no banco**). O PDF é enviado ao cliente pela empresa
(WhatsApp/e-mail) e assinado fisicamente pelas partes.

## Decisões de escopo

- Contrato nasce **sempre de um orçamento** (sem fluxo avulso).
- Dados do consumidor: nome, CPF **ou** CNPJ, RG (opcional), endereço completo,
  telefone e e-mail (opcionais) — vivem só no estado React do navegador. Nenhum
  server action, nenhum insert. Fechar a aba descarta tudo (intencional).
- Cláusulas: **template fixo no código**. Sem edição por empresa.
- Condições de pagamento e prazo: pré-preenchidos a partir do orçamento
  (`delivery_date`, `site_address`, `customer_name`), mas **editáveis** no formulário.
- PDF via página imprimível + `window.print()` — mesmo padrão do recibo e do
  orçamento público. Zero dependência nova, zero migration.
- Assinatura: linhas para assinatura física (CONTRATADA, CONTRATANTE, 2 testemunhas).
  Sem integração de assinatura eletrônica.

## Fluxo e UX

Nova rota `/orcamentos/[id]/contrato`:

1. Server component busca `quote` + `quote_items` + `company` via `getProfile()`
   (RLS multi-tenant cuida do isolamento). Orçamento inexistente/estranho → `notFound()`.
2. Client component em duas etapas na mesma página:
   - **Formulário**: dados do consumidor + termos editáveis (pagamento, prazo,
     endereço da obra, multa de rescisão % — default 10).
   - **Preview**: contrato renderizado. "Baixar PDF" (`window.print()`) e
     "Editar dados" (volta ao formulário sem perder estado).
3. Acesso: link/botão "Gerar contrato" na página do orçamento, ao lado do recibo.

## Arquitetura

```
src/app/(app)/orcamentos/[id]/contrato/
  page.tsx            # server: fetch quote+items+company, notFound
  contract-flow.tsx   # client: estado do form, alterna form/preview, PrintButton

src/components/contract/
  contract-form.tsx      # campos do consumidor + termos editáveis + validação inline
  contract-document.tsx  # contrato renderizado com print CSS (padrão ReciboDocument)

src/lib/contract/
  text.ts        # título do PDF, número do contrato, valor por extenso, template de cláusulas
  text.test.ts
  mask.ts        # máscara + validação CPF/CNPJ (padrão de src/lib/receipt/mask.ts)
  mask.test.ts
```

- `contract-document.tsx` recebe props puras (`company`, `quote`, `items`, `consumer`,
  `terms`) — sem fetch, isolado e testável.
- Máscara CPF `000.000.000-00` / CNPJ `00.000.000/0000-00`, detectada pelo tamanho.
- Valor por extenso em `text.ts` ("R$ 5.000,00 (cinco mil reais)").

## Conteúdo do contrato

**Cabeçalho:** logo + nome da empresa; título "CONTRATO DE PRESTAÇÃO DE SERVIÇOS E
FORNECIMENTO Nº {8 primeiros caracteres do uuid do orçamento, maiúsculos}/{ano}".

**Qualificação:**
- CONTRATADA: `name`, `cnpj`, `city`, `phone` da tabela `companies`.
- CONTRATANTE: dados do formulário.

**Cláusulas (template fixo):**
1. **Objeto** — fornecimento e instalação dos itens conforme tabela (produto, modelo,
   medidas, qtd, valores) — mesma tabela de itens do orçamento.
2. **Preço** — total em número e por extenso; desconto se houver.
3. **Pagamento** — texto editável do formulário.
4. **Prazo de execução** — texto/data editável; local de execução (endereço da obra).
5. **Obrigações da contratada** — executar conforme especificado, materiais de qualidade.
6. **Obrigações do contratante** — acesso ao local, pagamento nas datas acordadas.
7. **Garantia** — `warranty_text` da empresa.
8. **Rescisão** — descumprimento; multa de {X}% (editável, default 10%).
9. **Foro** — comarca da `city` da empresa.

**Fecho:** local e data por extenso; linhas de assinatura CONTRATADA / CONTRATANTE +
2 testemunhas (nome/CPF).

## Validação e erros

- Obrigatórios: nome, CPF/CNPJ (com dígito verificador), endereço.
- Opcionais validados se preenchidos: e-mail (formato), telefone.
- "Gerar contrato" desabilitado até formulário válido; erros inline por campo.
- Empresa sem CNPJ: aviso no topo do form ("cadastre em Admin → Empresa"), não bloqueia.
- Aviso legal discreto no formulário (fora do PDF): template padrão; revisar com
  advogado se necessário.

## Testes

- `mask.test.ts`: máscara e validação de dígitos CPF/CNPJ.
- `text.test.ts`: valor por extenso (centavos, mil, milhão), título do PDF, número do contrato.
- Componentes: sem teste unitário (padrão do repo); verificação visual no preview.

## Fora de escopo

- Persistência de contratos ou de dados do consumidor.
- Assinatura eletrônica (Clicksign etc.).
- Cláusulas editáveis por empresa.
- Contrato avulso sem orçamento.
