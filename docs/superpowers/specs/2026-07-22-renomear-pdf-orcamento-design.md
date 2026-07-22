# Renomear PDF do orçamento ao baixar

**Data:** 2026-07-22
**Branch base:** `feat/desconto-percentual`

## Problema

Ao baixar o PDF do orçamento (apresentação interna → "Baixar PDF"), o nome do arquivo é fixo:
`DD-MM-YYYY - Orçamento - {cliente}` (vem do `document.title` definido por `generateMetadata`
via `quotePdfTitle`). Não há como o usuário ajustar o nome antes de salvar.

## Objetivo

Permitir editar o nome do arquivo PDF antes de baixar, na **apresentação interna** do orçamento.
O nome padrão continua o mesmo; o usuário pode sobrescrever pontualmente.

Fora de escopo (YAGNI):
- Link público `/o/[token]` — mantém nome padrão.
- Recibo e contrato — fora deste ajuste.
- Persistir o nome no banco — o valor vale só para aquele download (ephemeral).

## Mecânica

O nome sugerido no diálogo "Salvar como PDF" do navegador vem de `document.title`. Setando
`document.title` imediatamente antes de `window.print()` muda o nome do arquivo; restaura-se o
título depois. A extensão `.pdf` é adicionada pelo navegador.

## Arquitetura

### 1. Lib pura `sanitizePdfName`

`src/lib/format.ts` (junto de `quotePdfTitle`):

```ts
// Nome de arquivo seguro: sem separadores de caminho/ilegais; vazio → fallback.
export function sanitizePdfName(name: string, fallback: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|]/g, '').trim()
  return cleaned || fallback
}
```

Testes (Vitest, `src/lib/format.test.ts`):
- remove `/ \ : * ? " < > |` do meio do nome;
- faz trim de espaços nas pontas;
- string vazia (ou só espaços/só caracteres ilegais) → retorna o fallback;
- nome válido passa inalterado.

### 2. `ShareBar` ganha o campo e usa no download

`src/components/quote/share-bar.tsx`:
- Nova prop `defaultPdfName: string`.
- Estado `const [pdfName, setPdfName] = useState(defaultPdfName)`.
- `<input>` (classe `no-print`, `aria-label="Nome do arquivo PDF"`) antes do botão "Baixar PDF",
  com `value={pdfName}` / `onChange`.
- Handler do "Baixar PDF":

```ts
function downloadPdf() {
  const prev = document.title
  document.title = sanitizePdfName(pdfName, defaultPdfName)
  const restore = () => { document.title = prev; window.removeEventListener('afterprint', restore) }
  window.addEventListener('afterprint', restore)
  window.print()
}
```

Restaurar via `afterprint` (one-shot) é seguro em navegadores onde `print()` não é bloqueante.

### 3. Página passa o nome padrão

`src/app/(app)/orcamentos/[id]/apresentacao/page.tsx`:
- Já tem `customer_name` + `created_at` para o `generateMetadata`.
- Passar `defaultPdfName={quotePdfTitle(quote.customer_name, quote.created_at)}` ao `<ShareBar>`.

## Fluxo

```
Apresentação → ShareBar (input pré-preenchido com o nome padrão)
  usuário edita (ou não) → "Baixar PDF"
  → document.title = sanitizePdfName(pdfName, default) → window.print()
  → afterprint restaura o título
```

## Erros / edge cases

- Nome vazio ou só caracteres ilegais → cai no `defaultPdfName` (nunca baixa sem nome).
- Sem persistência: recarregar a página volta o campo ao padrão.
- Não imprime o input (classe `no-print`), como o resto da share-bar.

## Testing

- Unit (Vitest): `sanitizePdfName` — casos de remoção, trim, fallback, passagem limpa.
- Verificação manual no browser: editar o nome, "Baixar PDF", confirmar o nome sugerido no diálogo;
  não editar → nome padrão; título da aba volta ao normal após baixar.

## Arquivos

- Modify `src/lib/format.ts` — `sanitizePdfName`.
- Modify `src/lib/format.test.ts` — testes.
- Modify `src/components/quote/share-bar.tsx` — prop, estado, input, handler.
- Modify `src/app/(app)/orcamentos/[id]/apresentacao/page.tsx` — passa `defaultPdfName`.
