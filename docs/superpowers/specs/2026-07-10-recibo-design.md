# Recibo de Prestação de Serviços — Design

**Data:** 2026-07-10
**Feature:** Geração de recibo a partir de um orçamento.

## Objetivo

Permitir que, a partir de um orçamento, o usuário gere um **recibo de prestação de
serviços** imprimível (Baixar PDF via navegador), reaproveitando os dados já
existentes do orçamento e preenchendo manualmente, na própria página, os dados que
não são persistidos (documento do cliente, texto de pagamento, recebedor e data).

Nada novo é persistido no banco, exceto o **CNPJ da empresa** (configurado uma vez
pelo admin).

## Fluxo (Abordagem A — recibo imprimível com campos editáveis na própria página)

1. Na tela de detalhe do orçamento (`/orcamentos/[id]`) há um novo botão **"Gerar Recibo"**.
2. O botão leva a `/orcamentos/[id]/recibo` — uma página imprimível no mesmo padrão de
   `/orcamentos/[id]/apresentacao`.
3. A página abre já preenchida com os dados automáticos (empresa, logo, CNPJ, cliente,
   obra, itens, total).
4. Os campos manuais são **inputs editáveis diretamente no recibo** (CPF do cliente,
   data do recibo, texto de pagamento, recebedor: nome/documento/método). O preview é
   em tempo real.
5. Botão **"Baixar PDF"** (`window.print()`), controles com classe `no-print`.

Não há persistência de recibos (sem tabela `receipts`). Os campos manuais existem
apenas na sessão da página.

## Layout (base: "Frame 4" adaptado ao recibo BR)

Estética moderna: cards arredondados, cor de destaque = **azul-ciano da marca L.D**
(do logo), logo da empresa no header.

1. **Header** — dois blocos:
   - **Esquerda:** card com cor da marca contendo o **logo** (`company_settings.logo_url`),
     nome da empresa e **CNPJ** (`company_settings.cnpj`, campo novo).
   - **Direita:** card "VALOR RECEBIDO" com o **total do orçamento** em destaque e a
     **data do recibo** (input editável).

2. **Recebemos de** (bloco cliente): nome, telefone e endereço da obra
   (`customer_name`, `customer_phone`, `site_address`) + **CPF/CNPJ do cliente**
   (input editável, não persiste).

3. **Declaração:** texto "Declaro que recebi a importância de R$ [total] referente
   a..." gerado com o valor, editável.

4. **Tabela de serviços:** Descrição / Qtd / Valor / Total, vinda de `quote_items`.

5. **Pagamento:** campo de texto livre editável (ex.: "Entrada R$ 2.000 cartão
   crédito 10x; Entrega R$ 2.000...").

6. **Total** em destaque (grande, cor da marca) = total do orçamento.

7. **Recebedor** (bloco assinatura): nome, documento e método de recebimento — todos
   inputs editáveis por recibo — + linha de assinatura.

## Dados

| Campo | Origem |
|---|---|
| Nome da empresa, cidade, telefone, logo | `company_settings` |
| CNPJ da empresa | `company_settings.cnpj` (**novo**, admin preenche) |
| Nome do cliente, telefone, obra | `quotes` |
| Itens/serviços | `quote_items` |
| Valor total | `quotes.total` |
| CPF/CNPJ do cliente | Input editável na página (não persiste) |
| Data do recibo | Input editável (default: hoje) |
| Texto de pagamento | Input editável (não persiste) |
| Recebedor (nome/documento/método) | Inputs editáveis (não persiste) |

## Mudanças no banco

Migration nova adicionando:

```sql
alter table company_settings add column if not exists cnpj text not null default '';
```

## Mudanças na UI

- `/admin/empresa`: novo campo **CNPJ** no formulário de configurações da empresa.
- `/orcamentos/[id]`: botão **"Gerar Recibo"**.
- `/orcamentos/[id]/recibo`: nova página imprimível (componente de recibo +
  botão "Baixar PDF").

## Fora de escopo (YAGNI)

- Histórico/persistência de recibos.
- Numeração sequencial de recibo.
- Persistir documento do cliente no orçamento.
- Geração de PDF server-side (usa impressão do navegador).
