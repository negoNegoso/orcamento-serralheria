# Sistema de Orçamentos — Serralheria (Esquadrias de Alumínio e Vidros Temperados)

**Data:** 2026-07-02
**Status:** Aprovado pelo usuário (design verbal); aguardando revisão deste documento

## 1. Objetivo

Sistema web simples, rápido e direto para uma serralheria (Pariquera-Açu/SP, 7+ anos de mercado) que:

1. Calcula automaticamente o valor dos produtos vendidos (portões de alumínio, box, portas e janelas de vidro temperado, motores)
2. Monta a lista de itens do orçamento
3. Tem uma tela de apresentação limpa para mostrar ao cliente na obra
4. Tem uma área de administração onde o dono configura produtos, preços, opções, modelos e condições de pagamento — **tudo flexível, nada fixo em código**

## 2. Usuários e perfis

| Perfil | Pode |
|---|---|
| **Vendedor** | Criar, editar e compartilhar orçamentos; ver todos os orçamentos da empresa; usar modo apresentação |
| **Admin** | Tudo do vendedor + configurar produtos/opções/modelos/pagamento/empresa + gerenciar usuários |

Equipe pequena: todos os usuários autenticados veem todos os orçamentos. Cliente final **não tem login** — recebe link público.

## 3. Arquitetura

- **Frontend/backend:** Next.js (App Router), mobile-first (vendedor usa celular na obra), Tailwind CSS + shadcn/ui
- **Banco, auth e arquivos:** Supabase (Postgres com RLS, Auth com e-mail/senha, Storage para fotos dos modelos)
- **Deploy:** Vercel
- **Custo inicial:** zero (planos gratuitos Vercel + Supabase)

## 4. Modelo de dados

### Configuração (editável pelo admin)

- **`company_settings`** (linha única): nome, logo, cidade, telefone/WhatsApp, texto de apresentação ("da fábrica direto para sua obra…"), texto de garantias (1 ano esquadrias, 2 anos motores), validade padrão do orçamento em dias
- **`profiles`**: vinculado ao usuário do Supabase Auth; nome, papel (`admin` | `vendedor`), ativo
- **`product_types`**: nome (ex: "Portão de Alumínio", "Box Blindex"), modo de preço (`m2` | `fixo` | `manual`), preço por m² **ou** preço base fixo, ativo, ordem de exibição. Modo `manual` = produto sob consulta: a responsável orça e o vendedor digita o valor combinado no item (ex: Janela Linha Suprema com persiana integrada); medidas viram registro opcional
- **`option_groups`**: pertence a um produto; nome (ex: "Cor do Alumínio", "Tipo de Vidro", "Abertura", "Social", "Formato do Box"), obrigatório (sim/não), ordem
- **`options`**: pertence a um grupo; rótulo (ex: "Bronze Brilhante"), tipo de adicional (`fixo` em R$ | `por_m2` em R$/m²), valor do adicional (0 = não altera o preço, caso Branco/Preto), ordem, ativo
- **`models`**: pertence a um produto; nome, foto (Supabase Storage), adicional fixo em R$ (padrão 0), ativo — galeria para o vendedor mostrar ao cliente
- **`payment_conditions`**: descrição (ex: "50% entrada + 50% em 5x no cartão"), faixa de aplicação `min_total`/`max_total` (nulo = sem limite), ordem, ativo. O orçamento exibe **somente** as condições cuja faixa contém o total. Cobre as regras atuais: 5x só acima de R$ 5.000; 12x sem juros acima de R$ 11.000; 10x abaixo de R$ 11.000; boleto "a negociar"

### Orçamentos

- **`quotes`**: token público aleatório (para o link), nome do cliente, telefone, endereço da obra, status (`rascunho` | `enviado` | `aprovado` | `recusado`), desconto em R$ (opcional), total, validade, criado por, criado em
- **`quote_items`**: **snapshot congelado** — nome do produto, nome e foto do modelo, largura (m), altura (m), área (m²), quantidade, preço base unitário, opções escolhidas em JSON (`[{grupo, rótulo, tipo_adicional, valor}]`), total unitário, total da linha, ordem. Guarda FK opcional para o produto só para rastreio; **a exibição e o valor vêm sempre do snapshot** — mudança de tabela de preços não altera orçamentos já criados

## 5. Regras de cálculo

```
área        = largura × altura                     (produto por m²)
base        = área × preço_m²                      (modo m²)
base        = preço_fixo                           (modo fixo)
base        = valor digitado pelo vendedor         (modo manual — orçado pela responsável)
unitário    = base
            + Σ adicionais fixos das opções
            + Σ (adicionais por m² × área)
            + adicional do modelo
linha       = unitário × quantidade
subtotal    = Σ linhas
total       = subtotal − desconto
```

- Valores em R$ com 2 casas decimais; arredondamento meio-para-cima por linha
- Validações: largura e altura obrigatórias e > 0 quando modo m² (opcionais e só informativas no modo manual); valor obrigatório ≥ 0 quando modo manual; grupo obrigatório exige seleção; desconto ≤ subtotal; quantidade ≥ 1
- Motor de cálculo é **função TypeScript pura** (sem banco, sem framework) — testável isoladamente

## 6. Telas e rotas

### Vendedor
- `/login` — e-mail/senha
- `/` — lista de orçamentos: busca por cliente, filtro por status, total e data
- `/orcamentos/novo` e `/orcamentos/[id]` — montagem em passos:
  1. Dados do cliente (nome, telefone, endereço da obra)
  2. Itens: escolhe produto → digita medidas (se m²) → seleciona opções (grupos do produto) → escolhe modelo na galeria de fotos (opcional) → quantidade → subtotal do item aparece na hora
  3. Resumo: lista de itens, desconto, total, condições de pagamento aplicáveis, status
- `/orcamentos/[id]/apresentacao` — **modo apresentação**: tela limpa em tela cheia para mostrar ao cliente na obra (logo, itens com fotos, total, formas de pagamento, garantias, texto da empresa). Sem botões de edição, sem dados internos

### Cliente (sem login)
- `/o/[token]` — mesma apresentação, acessível pelo link. Botão "Baixar PDF" (impressão do navegador)

### Admin
- `/admin/produtos` — CRUD de produtos; dentro de cada produto: grupos de opções, opções com adicionais, modelos com upload de foto
- `/admin/pagamento` — CRUD de condições com faixas de valor
- `/admin/empresa` — dados, logo, textos, garantias, validade padrão
- `/admin/usuarios` — convidar/ativar/desativar vendedores, definir papel

## 7. Compartilhamento e PDF

- **Link público:** cada orçamento tem token aleatório não sequencial; rota `/o/[token]` busca no servidor (service role) — a tabela não fica exposta a acesso anônimo
- **WhatsApp:** botão abre `wa.me` com mensagem pronta (nome do cliente, total, link) no WhatsApp do vendedor
- **PDF:** CSS de impressão (`@media print`) na página de apresentação + botão que chama a impressão do navegador → "Salvar como PDF". Zero dependência extra
- Mudar status para `enviado` ao compartilhar

## 8. Segurança

- Supabase Auth (e-mail/senha); cadastro fechado — admin cria os usuários
- RLS:
  - Tabelas de configuração: leitura para autenticados; escrita só admin
  - `quotes`/`quote_items`: CRUD para autenticados
  - `profiles`: usuário lê o próprio; admin lê/edita todos
  - Acesso anônimo: nenhum direto às tabelas; página pública só via token no servidor
- Storage: bucket de fotos com leitura pública, escrita só admin

## 9. Testes

- **Motor de cálculo:** testes unitários (Vitest) — casos: m², fixo, adicional fixo, adicional por m², adicional de modelo, quantidade, desconto, arredondamento, validações. Parte crítica: erro aqui é prejuízo real em reais
- **Seleção de condições de pagamento por faixa:** testes unitários
- Fluxos de tela: verificação manual rodando o app (criar orçamento ponta a ponta, link público, RLS de admin vs vendedor)

## 10. Tabela de preços inicial (seed — dados da chefe, 2026-07-02)

Carga inicial editável pelo admin. Bronze: **sempre +R$ 250** (valor da chefe substitui os ~R$ 500 mencionados antes pelo dono).

| Produto | Preço base | Grupos de opções |
|---|---|---|
| Portão de Alumínio | R$ 650/m² | Abertura*: De Correr 0, Basculante **+R$ 2.000 fixo** · Social: Sem social 0, Social embutido **+R$ 50/m²** (650→700) · Cor*: Branco 0, Preto 0, Bronze **+R$ 250** |
| Janela de Vidro Temperado | R$ 500/m² | Vidro*: Incolor/Fumê/Verde/Serigrafado 0 · Cor*: Branco 0, Preto 0, Bronze +R$ 250 |
| Porta Blindex | R$ 550/m² | Vidro*: idem · Cor*: idem |
| Box Blindex | R$ 500/m² | Altura*: Padrão 0, Até o teto **+R$ 50/m²** (500→550) · Formato: Reto 0, De Canto 0 · Vidro*: idem · Cor*: idem |
| Janela Linha Suprema (persiana integrada) | **manual (sob consulta)** | a responsável orça caso a caso; vendedor digita o valor combinado no item |
| Motor para Portão (automatização) | R$ 1.800 fixo (exemplo) | — |

(* = grupo obrigatório)

## 11. Fora de escopo (v1)

- Controle de estoque, ordem de serviço/produção, agenda de instalação
- Relatórios financeiros e comissões
- Funcionamento offline
- Assinatura digital do cliente
- Multi-empresa
- Integração de pagamento online (condições são texto informativo)
