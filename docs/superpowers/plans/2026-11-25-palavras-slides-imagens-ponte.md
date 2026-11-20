# Palavras — imagens dos slides para a Ponte (plano)

## Problema

A Ponte recebe de `GET /api/public/tenants/:slug/worship/services/next` só `sermon: { title, preacherName, estimatedMinutes, slideCount }`, montado por `SermonDeliveryService.summaries`. Os slides não vão. No culto, o botão da Ponte tentou abrir uma pasta "Pregação" no Holyrics e deu "file not allowed".

Os slides precisam chegar sozinhos, como as letras chegam: uma imagem PNG de 1920×1080 por slide, na identidade aprovada (`docs/identidade-slides.md`).

## Decisão: o navegador do painel desenha, a API guarda

- **O desenho** sai do mesmo `drawSlide` da prévia e do `.pptx` (`apps/admin/src/features/sermons/lib/slide-layout.ts`). Ele é passado para um `<canvas>` de 1920×1080, depois que as fontes Montserrat carregam, e exportado em PNG. O resultado é igual à prévia, sem servidor de renderização.
- **O armazenamento** é o R2 que a API já usa (`StorageService`).
- **Por que não renderizar no servidor:** um Chromium headless na VPS de 1 GB pede de 300 a 500 MB de RAM por instância e uns 400 MB de imagem Docker. Isso disputaria memória com a API e o Postgres.

## Identidade de cada imagem (API)

- `RENDER_VERSION = 'painel-1'`: uma constante que muda quando o desenho mudar. Assim as imagens antigas deixam de valer.
- `slideHash(style, slide)` = os primeiros 16 hex do sha256 de `JSON.stringify([RENDER_VERSION, style, kind, layout, title, verse, reference, items, start])`, a partir do `PublicSlide` da cópia entregue (`readDeliverySlides`).
- `deliveryVersion` = os primeiros 16 hex do sha256 de `JSON.stringify([RENDER_VERSION, style, title, hashes])`.
- A chave no R2 é `tenants/${tenantId}/sermons/${deliveryId}/${hash}.png`. O nome é fixo pelo conteúdo: subir de novo o mesmo slide sobrescreve o mesmo arquivo.

## Banco

`sermon_deliveries.slide_images JSONB NOT NULL DEFAULT '{}'`, no Prisma `slideImages Json @default("{}") @map("slide_images")`. Guarda um mapa `hash → url pública`. Migração nova em `apps/api/prisma/migrations/20261125120000_sermon_delivery_slide_images/`.

## Rotas do painel (autor, permissão Palavras › Editar, tenant e autor do JWT)

**`GET /admin/tenants/me/sermons/:id/delivery/images`**

Responde 404 se a palavra não tem envio. Senão:

```json
{ "style": "MINIMAL", "version": "…16hex…",
  "slides": [{ "index": 0, "hash": "…16hex…", "slide": { …PublicSlide… }, "imageUrl": "https://…png" | null }] }
```

- `slide` é exatamente o que a cópia entregue tem: o painel desenha isso, e não o que está na tela.
- A mesma chamada limpa o mapa: tira as entradas cujo hash não está mais nos slides. Os objetos dessas entradas são apagados do R2 com `deleteFileByPublicUrl`, sem derrubar a resposta se falhar.

**`PUT /admin/tenants/me/sermons/:id/delivery/images/:hash`**

Recebe multipart com o campo `file` (`FileInterceptor`, como `worship-songs.controller`).

- **O que é recusado, com mensagens em pt-BR:**
  - hash que não é `/^[0-9a-f]{16}$/` ou não está nos slides atuais da entrega: 400, "A lista de slides mudou. Atualize a página.";
  - arquivo que não é PNG pelos bytes, ou com IHDR diferente de 1920×1080: 400;
  - arquivo acima de 1,5 MB: 413.
- **Como grava:**
  - no R2, por um método novo do `StorageService`: `uploadPng(buffer, key)`, que valida a assinatura e grava na chave exata;
  - no banco, de forma atômica e com o filtro de tenant: `UPDATE sermon_deliveries SET slide_images = slide_images || jsonb_build_object($hash, $url) WHERE id = $deliveryId AND tenant_id = $tenantId`.
- **Resposta:** `{ hash, imageUrl }`.
- Throttle de 120 por minuto: uma palavra tem até umas 40 imagens.

## Contrato da Ponte (só acrescentar)

Em `sermon` de `services/next` e `services/:id` (`WorshipPonteService.payload`), um método novo `SermonDeliveryService.forPonte(tenantId, serviceId)` devolve os campos de sempre (`title`, `preacherName`, `estimatedMinutes`, `slideCount`) e mais:

```json
"version": "…16hex…",
"slides": [{ "index": 0, "kind": "VERSE", "title": "1. Uma Agenda de Poder", "text": "A palavra da cruz…", "reference": "1 Coríntios 1:18",
             "imageUrl": "https://…/tenants/…/sermons/…/a1b2c3d4e5f60718.png", "width": 1920, "height": 1080 }]
```

- Slide sem imagem (entrega antiga, ou o painel ainda não enviou): `imageUrl: null`, `width: null`, `height: null`. A Ponte cai para o texto.
- `summaries`, que o Cultos usa no painel, não muda.
- A documentação vai em `docs/api/ponte-palavra.md` (com exemplo real e citada no `docs/api/README.md`) e em `apps/ponte/docs/PALAVRA-SLIDES.md`, para quem mexe na Ponte. Atualizar `apps/ponte/docs/exemplo-services-next.json`.

## Painel (quando gerar)

- `lib/slide-raster.ts`:
  - `renderSlidePng(slide: PublicSlide, style): Promise<Blob>` desenha num canvas 1920×1080 a partir de `drawSlide(slideFace…)`: fundo, painel `roundRect` com a borda, o traço, a aspa e os textos por trecho, com cor, peso e `letterSpacing`, alinhamento e altura de linha iguais aos da `SlidePreview`;
  - antes de desenhar, espera `document.fonts.load` para Montserrat 500, 600, 700 e 800.
- `lib/delivery-images.ts`, `syncDeliveryImages(sermonId, onProgress)`:
  - faz o GET; para cada slide sem `imageUrl`, renderiza e faz o PUT, um de cada vez;
  - devolve `{ total, uploaded, failed }`.
- Hook `useDeliveryImages(sermon)`:
  - roda quando `sermon.delivery` existe e a cópia muda (o hook observa `sermon.updatedAt` e `sermon.delivery`), com espera de 1,5 s;
  - entra na página de slides (`SermonSlidesPage`) e no editor (`SermonEditorPage`);
  - roda também depois de enviar para o culto, salvar ou gerar slides, e quando a página abre;
  - uma rodada nunca corre ao mesmo tempo que outra; se uma mudança chega no meio, ela roda de novo no fim.
- Status discreto na página de slides, perto de "Enviar para um culto": "Imagens para a Ponte: enviando 3 de 13…", depois "prontas" ou "falhou — tentar de novo" (botão). Sem toast a cada imagem.

## Testes

- **API:**
  - o hash é estável e muda quando o texto, a referência ou o estilo do slide mudam;
  - a versão muda quando um slide muda;
  - o GET devolve a lista, limpa o mapa e respeita autor e tenant;
  - o PUT recusa hash que não está nos slides, arquivo que não é PNG, IHDR errado e tamanho acima do limite, e grava com a chave certa;
  - `forPonte` traz `imageUrl` só para os hashes atuais e `null` na entrega antiga;
  - o payload da Ponte mantém os campos antigos;
  - o fluxo de atualização: depois que o slide muda, o hash muda, a imagem antiga sai e a nova é pedida.
- **Admin:**
  - o raster chama o canvas com as posições do `drawSlide` (contexto 2D falso);
  - `syncDeliveryImages` envia só o que falta, um de cada vez, e conta as falhas;
  - o hook dispara depois de salvar.
