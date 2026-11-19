# Ponte do Culto: o culto a executar (`services/next`)

A Ponte do Culto (PC da igreja) lê daqui o próximo culto montado no painel, em **Cultos**.

```
GET /api/public/tenants/:slug/worship/services/next
x-ponte-key: ponte_…        (a chave gerada no painel, em Cultos › Ponte do Culto)
```

Também existe `GET /api/public/tenants/:slug/worship/services/:id`, com a mesma resposta para um culto escolhido.

- **Próximo culto:** é o culto de hoje (dia em São Paulo) ou o seguinte.
- **Sem culto:** a resposta é `{ "version": "vazio", "service": null, "sermon": null, "songs": [], "roteiro": [] }`.
- **`version`:** é uma impressão digital do conteúdo. A Ponte só refaz o trabalho quando ela muda.

Exemplo real (ambiente local, 22/11/2026, com o endereço do áudio trocado): [exemplos/ponte-services-next.json](./exemplos/ponte-services-next.json).

## O que mudou em 24/11/2026

As músicas deixaram de ficar dentro de um bloco "Louvor". Cada música agora é um item do roteiro, entre os momentos: Abertura, música, música, Oração, música, Avisos…

- **Nada foi tirado nem renomeado.** `service`, `sermon` e `songs` continuam com os mesmos campos.
- **`service.moments`** agora traz também os itens de música, com `kind: "SONG"`, na ordem do culto.
- **`songs`** são as músicas do roteiro na ordem em que aparecem; espaço reservado sem música não entra.
- **Campo novo, `roteiro`:** o culto inteiro na ordem, pronto para o celular do músico e para a condução.

## `roteiro`

Uma lista ordenada; cada item é um momento ou uma música.

| Campo | Tipo | O que é |
|---|---|---|
| `ordem` | número | Posição no culto, a partir de 1 |
| `tipo` | `"momento"` \| `"musica"` | O que é o item |
| `id` | uuid | Id do item no roteiro (a mesma música pode aparecer duas vezes, com ids diferentes) |
| `nome` | texto | Nome do momento, ou título da música |
| `inicio` | `"HH:MM"` | Horário previsto, recalculado pela ordem |
| `duracaoMin` | número | Duração prevista, em minutos (música com áudio: a duração do áudio, arredondada) |
| `momento` | objeto | Só em `tipo: "momento"` |
| `musica` | objeto \| `null` | Só em `tipo: "musica"`. `null` = espaço reservado ("Música a escolher") |

### `momento`

| Campo | Tipo | O que é |
|---|---|---|
| `kind` | `PRE_SERVICE` \| `GENERIC` \| `WORSHIP` \| `SERMON` | O tipo do momento. `WORSHIP` é o bloco "Louvor" antigo, ainda sem músicas |
| `palavra` | `{ titulo, pregador }` \| `null` | Só em `SERMON`: a palavra enviada para este culto |

### `musica`

| Campo | Tipo | O que é |
|---|---|---|
| `id` | uuid | Id da música no repertório (o mesmo de `songs[].id`) |
| `titulo` | texto | |
| `tom` | texto \| `null` | Tom (ex.: `"D"`, `"Sol"`), como escrito na ficha |
| `bpm` | número \| `null` | |
| `clima` | `CONTEMPLATIVE` \| `WORSHIP` \| `BUILD` \| `CELEBRATION` \| `EXPLOSION` \| `null` | O clima que mais aparece nas partes (no empate, o mais forte). Mesmos códigos de `songs[].parts[].mood` |
| `holyricsId` | texto \| `null` | Id da música no Holyrics do PC |
| `audioUrl` | url \| `null` | O áudio-guia (VS) |
| `duracaoSeg` | número \| `null` | Duração do áudio, em segundos |
| `partes` | lista | As partes, na ordem da música |

### `musica.partes[]`

| Campo | Tipo | O que é |
|---|---|---|
| `indice` | número | Posição da parte, a partir de 0 (o mesmo de `songs[].parts[].index`) |
| `nome` | texto | "Verso 1", "Refrão", "Refrão final"… (inclui o nome dado à mão) |
| `kind` | `INTRO` \| `VERSE` \| `PRE_CHORUS` \| `CHORUS` \| `BRIDGE` \| `INSTRUMENTAL` \| `ENDING` | Tipo da parte |
| `inicioSeg` | número \| `null` | Segundo do áudio em que a parte começa (início da frase, sem antecipação) |
| `fimSeg` | número \| `null` | Início da parte seguinte com tempo; na última, a duração do áudio |

`inicioSeg` e `fimSeg` vêm `null` enquanto a parte não tem tempo marcado.

## Exemplo (trecho)

```json
{
  "version": "194e2c2843b4",
  "roteiro": [
    { "ordem": 2, "tipo": "momento", "id": "97988d45-…", "nome": "Abertura", "inicio": "19:00", "duracaoMin": 5,
      "momento": { "kind": "GENERIC" } },
    { "ordem": 4, "tipo": "musica", "id": "0dd83ba6-…", "nome": "Aleluia", "inicio": "19:10", "duracaoMin": 2,
      "musica": {
        "id": "addacd9f-…", "titulo": "Aleluia", "tom": "G", "bpm": 74, "clima": "WORSHIP", "holyricsId": null,
        "audioUrl": "https://cdn.exemplo.org/…/a6f686f8-….mp3", "duracaoSeg": 100,
        "partes": [
          { "indice": 0, "nome": "Verso 1", "kind": "VERSE", "inicioSeg": 10.5, "fimSeg": 26.1 },
          { "indice": 1, "nome": "Verso 2", "kind": "VERSE", "inicioSeg": 26.1, "fimSeg": 34.9 }
        ]
      } },
    { "ordem": 5, "tipo": "momento", "id": "230b7a6f-…", "nome": "Oração", "inicio": "19:11", "duracaoMin": 3,
      "momento": { "kind": "GENERIC" } },
    { "ordem": 9, "tipo": "momento", "id": "…", "nome": "Palavra", "inicio": "19:29", "duracaoMin": 40,
      "momento": { "kind": "SERMON", "palavra": null } },
    { "ordem": 10, "tipo": "musica", "id": "…", "nome": "Música", "inicio": "20:09", "duracaoMin": 5, "musica": null }
  ]
}
```

O arquivo completo, com `service`, `sermon` e `songs`, está em [exemplos/ponte-services-next.json](./exemplos/ponte-services-next.json).

## Horários

- Os `PRE_SERVICE` do começo contam para trás a partir do início do culto. O resto conta para a frente, na ordem.
- Música com áudio dura o áudio, contado em segundos (cinco músicas de 4:10 somam 20:50, não 25 min). Música sem áudio, e espaço reservado, duram o que está escrito no item.
- `inicio` é o minuto em que o item começa, arredondado para baixo.
