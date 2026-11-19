# Task 2 — Apresentação e diálogo Exportar

## Implementado
- `export/slides-deck.ts` (`buildDeck`, puro), `export/slides-pptx.ts` (`buildPptx` + `downloadPptx`, `import('pptxgenjs')` dinâmico), `components/ExportDialog.tsx`.
- Botão Exportar (ícone Download, aria-label="Exportar") no editor (flush antes de abrir; usa título/documento da tela; slides guardados em `slidesInfo.items`) e na conferência (espera `whenIdle()`; se falhou, toast "…Confira a lista antes de exportar." e não abre).
- pptxgenjs 4.0.1 (exato). Layout 16:9, caixa centralizada com 80% da largura, `fit: 'shrink'`, título nas propriedades.

## TDD
- RED slides-deck: `npx vitest run .../slides-deck.test.ts` -> "Test Files 1 failed, no tests" (módulo `./slides-deck` inexistente). GREEN: 4/4.
- RED ExportDialog: "1 failed, no tests" (componente inexistente). GREEN 9/9 (após o rótulo "Gerando…").
- RED páginas: 3 testes novos de Exportar falhando antes do botão; GREEN depois.
- slides-pptx.test.ts (real, jsdom): escrito junto com o código (verificação, não RED).

## Smoke do pptx
`slides-pptx.test.ts` chama o `buildPptx` real (pptxgenjs `write({outputType:'arraybuffer'})`) com 3 slides: bytes iniciam em `PK`, >1000 bytes, contém `ppt/slides/slide3.xml` e não `slide4.xml`. Funciona em jsdom (122 ms).

## Build (chunk)
- Antes (HEAD): `index-BsW64sMg.js` 1.409,99 kB.
- Depois: `index-BRSQYn5n.js` 1.419,20 kB (+9,2 kB: diálogo e construtores, não o pptxgenjs) e chunk separado `pptxgen.es-YPsmh9XM.js` 372,91 kB.

## Gates
tsc OK; lint exit 0 (avisos tolerados); vitest 56 arquivos / 463 testes passando; build OK.

## Observações
- Editor: Exportar não bloqueia se o flush falhar (exporta o que está na tela, como pedido).
- Na conferência a mensagem de falha é "…antes de exportar." (a existente diz "enviar").

## Revisão final
RED (antes do código): ExportDialog 3 falhando (créditos carregando, caixa reabre, duplo clique); slides-pptx propriedades; SermonSlidesPage Exportar travado; SermonEditorPage chip Enviada (2); SermonPreviewDialog "called 1 times, but got 2 times" ao focar.
- A1 caixa volta desmarcada ao abrir (effect em `open`). A2 PDF/TXT desligados com "Carregando os créditos…" enquanto a consulta pende (só se há tradução usada); falha segue com o código; caso real de tradução desconhecida testado. A3 author/company "ChurchManager", subject = título; teste lê core.xml/app.xml com JSZip. A4 segundo clique em <1 s ignorado (PDF e TXT). A5 Exportar desligado com `locked`.
- B1 chip "Enviada" é botão que chama `openSlides()`; teste com salvamento falho. B2 `refetchOnWindowFocus: false` + teste via focusManager. B3 asserção trocada por: última leitura do servidor tem revisão 2 e veio depois do salvamento.
GREEN: tsc OK; lint exit 0; vitest 56 arquivos / 472 testes; build OK com `pptxgen.es-*.js` (372,91 kB) separado, `index-*.js` 1.419,56 kB.
