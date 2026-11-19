# Roteiro do culto (para a sessão da Ponte)

O ChurchManager passou a devolver, em `GET /api/public/tenants/:slug/worship/services/next`, um campo novo: **`roteiro`**. É o culto inteiro na ordem, com momentos e músicas intercalados.

- **Contrato completo:** [`docs/api/ponte-roteiro.md`](../../../docs/api/ponte-roteiro.md), na raiz do repositório.
- **Resposta real de exemplo:** [`exemplo-services-next.json`](./exemplo-services-next.json), de um ambiente local, com o endereço do áudio trocado.

## Em uma frase por campo

- `roteiro[]`: `{ ordem, tipo: "momento" | "musica", id, nome, inicio "HH:MM", duracaoMin, momento? , musica? }`.
- `momento`: `{ kind, palavra? }`. `kind` é `PRE_SERVICE`, `GENERIC`, `WORSHIP` ou `SERMON`; `palavra` vem só em `SERMON`.
- `musica`: `{ id, titulo, tom, bpm, clima, holyricsId, audioUrl, duracaoSeg, partes[] }`. `null` quando é espaço reservado (música ainda não escolhida).
- `partes[]`: `{ indice, nome, kind, inicioSeg, fimSeg }`. Os segundos são do áudio-guia, a partir do início da frase; `null` sem tempo marcado.
- `clima` usa os mesmos códigos de `songs[].parts[].mood` (`CONTEMPLATIVE`, `WORSHIP`, `BUILD`, `CELEBRATION`, `EXPLOSION`).

## O que não mudou

`service`, `sermon` e `songs` continuam com os mesmos campos. Duas diferenças:

- **`service.moments`:** agora inclui os itens de música (`kind: "SONG"`).
- **`songs`:** vêm na ordem em que as músicas aparecem no roteiro.

Para casar um item de música com a música completa (slides, letra, tempos dos slides), use `roteiro[].musica.id` = `songs[].id`. A mesma música pode entrar duas vezes no roteiro, e aí aparece uma vez para cada entrada em `songs`.

## Nomes

Os nomes seguem o pedido da sessão da Ponte. Há três campos a mais, que não estavam no pedido:

- `musica.duracaoSeg`;
- `partes[].kind`;
- `momento.palavra`.
