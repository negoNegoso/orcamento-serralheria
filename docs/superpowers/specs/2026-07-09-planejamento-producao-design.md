# Planejamento de Produção — Kanban + Calendário por data de entrega

**Data:** 2026-07-09
**Status:** Aprovado (design verbal); aguardando revisão deste documento
**Base:** sistema de orçamentos; branch `feature/datas-criacao-entrega` (tem `delivery_date` obrigatório no editor, exibição e filtro por período)

## 1. Objetivo

Módulo para organizar a linha de produção da serralheria a partir da **data
de possível entrega** dos orçamentos **aprovados**. Duas visões da mesma
fonte — um **quadro (kanban)** por etapa de produção e um **calendário**
(dia/semana/mês) — mais uma aba de **concluídos** (histórico). Só entram
orçamentos com `status = 'aprovado'`.

## 2. Ciclo de vida

- Orçamento vira `aprovado` → entra no quadro na etapa **Pendente**
  (`production_stage` recebe `pendente` ao aprovar).
- Avança pelas etapas: **Pendente → A produzir → Em produção → Pronto →
  Instalado**.
- Em **Instalado**, o botão **"Concluir"** arquiva (`archived_at = now()`):
  sai do quadro ativo e do calendário-ativo, vira **histórico**.
- Se o orçamento deixar de ser `aprovado` (ex: volta a `enviado` ou vira
  `recusado`), some do quadro ativo (não é arquivado; simplesmente não é mais
  elegível). Voltar a `aprovado` o traz de volta na etapa em que estava
  (`production_stage` é preservado).

## 3. Onde vive e acesso

- Nova seção **"Produção"** na navegação, com três abas: **Quadro**,
  **Calendário**, **Concluídos**.
- Visível a qualquer usuário autenticado (mesmo padrão do resto do app);
  mover etapa, editar pendências e concluir também para autenticados.

## 4. Dados (migration nova)

- `quotes.production_stage text` — `null` ou um de
  `('pendente','a_produzir','em_producao','pronto','instalado')`. Definido
  como `pendente` quando o status passa a `aprovado` e ainda estava `null`.
  Preservado nas demais transições.
- `quotes.archived_at timestamptz` — `null` = ativo; preenchido = concluído
  (histórico).
- Tabela `quote_pendencies`:
  - `id uuid pk`, `quote_id uuid references quotes(id) on delete cascade`,
    `label text not null`, `done boolean not null default false`,
    `sort_order int not null default 0`, `created_at timestamptz default now()`
  - RLS: CRUD para autenticados (equipe pequena, como `quotes`).
- Elegibilidade do quadro/calendário ativo: `status = 'aprovado'
  AND archived_at IS NULL`.

## 5. Quadro (Kanban)

- 5 colunas fixas na ordem das etapas. Cards = orçamentos elegíveis,
  agrupados por `production_stage`.
- **Card** mostra:
  - Cliente (nome)
  - Data de entrega com **cor de urgência** (regra pura testável
    `urgencyFor`): vermelho = **atrasado** (`delivery_date < hoje`); laranja =
    **urgente** (hoje ou amanhã); normal = **futuro** (depois de amanhã). Sem
    data não deve ocorrer (editor a torna obrigatória); se ocorrer, exibe
    "sem data" em cinza.
  - Total (formatBRL)
  - Contador de pendências abertas (ex: "2 pendências") quando houver
- **Mover de etapa:** dois caminhos, ambos chamando a mesma server action
  `setProductionStage(quoteId, stage)`:
  - Botões **‹ ›** em cada card (avançar/voltar uma etapa) — caminho
    principal no celular; ‹ desabilitado na primeira etapa, › vira "Concluir"
    na última.
  - **Drag-and-drop** nativo HTML5 (`draggable` + `onDragOver`/`onDrop`) entre
    colunas no desktop — sem biblioteca. No toque, os botões são o caminho.
- Clicar no card abre um painel (na própria página) com a **checklist de
  pendências** e um link "Abrir orçamento" para `/orcamentos/[id]`.
- Etapa **Instalado**: em vez de "›", o card mostra **"Concluir"** →
  `archiveQuote(quoteId)` (`archived_at = now()`).

## 6. Checklist de pendências

- No painel do card: lista de itens (`label`) com caixa de marcar (`done`).
- Ações (server actions): `addPendency(quoteId, label)`,
  `togglePendency(pendencyId)`, `deletePendency(pendencyId)`.
- O contador do card = itens com `done = false`.
- Independente da etapa: pode-se anotar/marcar em qualquer coluna.

## 7. Calendário

- Três visões via query param (`?view=dia|semana|mes` + `?date=YYYY-MM-DD`):
  - **Mês:** grade 7 colunas (dom–sáb), cada dia lista os orçamentos com
    `delivery_date` naquele dia.
  - **Semana:** 7 dias da semana da `date`.
  - **Dia:** lista do dia.
- Cada entrada mostra cliente + etapa atual, com a mesma cor de urgência.
  Clicar abre `/orcamentos/[id]`.
- Mostra orçamentos aprovados; os já **concluídos** aparecem com visual
  "feito" (esmaecido) nas datas passadas — não somem do calendário.
- Navegação anterior/próximo período; botão "Hoje".
- Cálculo de fronteiras de data em função pura testável (reaproveitar o
  padrão de `src/lib/dashboard/period.ts`, em UTC), num novo
  `src/lib/production/calendar.ts` que gera a grade de dias da visão.

## 8. Concluídos (histórico)

- Aba lista os `archived_at IS NOT NULL`, ordenados por `delivery_date`.
- Filtro por período (reusar `resolvePeriod` do dashboard): dia/semana/
  mês/intervalo. Mostra cliente, data de entrega, total, data de conclusão.
- Reabrir/desarquivar um concluído é **fora de escopo v1** (ver §10).

## 9. Testes

- Função pura `urgencyFor(deliveryDate, today)` → `'atrasado' | 'urgente' |
  'futuro'` (Vitest, TDD): atrasado (ontem), urgente (hoje), urgente (amanhã),
  futuro (depois de amanhã); `null` de data → tratado como "sem data" na UI.
- Função pura de transição de etapa `nextStage(stage)` / `prevStage(stage)`
  e `STAGES` (ordem) — testável.
- Grade do calendário `calendarDays(view, date)` → lista de datas — testável
  (mês começa no domingo correto, semana correta, dia único).
- Fluxos de UI (mover etapa, checklist, concluir, calendário): verificação
  manual no browser.

## 10. Fora de escopo (v1)

- Etapas configuráveis pelo admin (fixas no código por ora)
- Reabrir concluído / desarquivar
- Notificações ou alertas automáticos de atraso
- Alocação de responsável de produção / capacidade por dia
- Drag-and-drop em telas de toque (botões cobrem o mobile)
- Reordenar cards dentro da coluna (ordem por data de entrega)

## 11. Decomposição sugerida do plano (fases)

1. **Dados + regras puras:** migration (`production_stage`, `archived_at`,
   `quote_pendencies`), `urgencyFor`, `STAGES`/`nextStage`/`prevStage`,
   `calendarDays` — tudo com testes; ao aprovar, setar `pendente`.
2. **Quadro:** página Produção + aba Quadro, cards, botões ‹ ›, drag-drop,
   server action `setProductionStage`, `archiveQuote`.
3. **Checklist:** painel do card + `quote_pendencies` actions + contador.
4. **Calendário:** aba Calendário (dia/semana/mês) + navegação.
5. **Concluídos:** aba histórico + filtro por período.
