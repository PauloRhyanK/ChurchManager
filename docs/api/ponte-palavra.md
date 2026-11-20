# Ponte do Culto: a Palavra e as imagens dos slides (`sermon`)

O campo `sermon` da resposta da Ponte traz a palavra enviada para o culto. Desde 25/11/2026 ele traz também os slides, cada um com uma imagem PNG pronta para o telão.

```
GET /api/public/tenants/:slug/worship/services/next
GET /api/public/tenants/:slug/worship/services/:id
x-ponte-key: ponte_…        (a chave gerada no painel, em Cultos › Ponte do Culto)
```

O resto da resposta (`version`, `service`, `songs`, `roteiro`) está em [ponte-roteiro.md](./ponte-roteiro.md).

## O que mudou em 25/11/2026

- **Nada foi tirado nem renomeado.** `title`, `preacherName`, `estimatedMinutes` e `slideCount` continuam iguais.
- **Campos novos:** `version` e `slides`.
- Culto sem palavra continua com `"sermon": null`.

## Campos de `sermon`

| Campo | Tipo | O que é |
|-------|------|---------|
| `title` | string | Título da palavra. |
| `preacherName` | string | Nome de quem prega. |
| `estimatedMinutes` | inteiro | Tempo estimado, em minutos, arredondado para cima. |
| `slideCount` | inteiro | Quantidade de slides. É sempre igual a `slides.length`. |
| `version` | string (16 hex) | **Novo.** Impressão digital dos slides. Muda quando qualquer slide, o estilo ou o título mudam. **Não** muda quando só chega uma imagem nova. |
| `slides` | lista | **Novo.** Os slides na ordem de exibição. |

### Cada item de `slides`

| Campo | Tipo | O que é |
|-------|------|---------|
| `index` | inteiro | Posição, a partir de 0. |
| `kind` | `"TITLE"` \| `"VERSE"` \| `"POINT"` \| `"SUMMARY"` | Tipo do slide. |
| `title` | string | Título que aparece no slide (o título do ponto, ou da palavra). |
| `text` | string | Em `VERSE`, o trecho do versículo. Em `SUMMARY`, os itens da lista separados por `\n`. Em `TITLE` e `POINT`, o próprio título. |
| `reference` | string \| null | Referência bíblica (só `VERSE`), por exemplo `"Isaías 46:10"`. |
| `imageUrl` | string \| null | URL pública do PNG do slide, ou `null` se a imagem ainda não existe. |
| `width` | inteiro \| null | `1920` quando há imagem, senão `null`. |
| `height` | inteiro \| null | `1080` quando há imagem, senão `null`. |

## A imagem

- PNG de 1920×1080, na identidade aprovada ([identidade-slides.md](../identidade-slides.md)), desenhado pelo painel com o mesmo código da prévia.
- O endereço tem a forma:

  ```
  https://<R2_PUBLIC_URL>/tenants/<tenantId>/sermons/<deliveryId>/<hash>.png
  ```

  `<hash>` são 16 caracteres hexadecimais calculados do conteúdo do slide (tipo, composição, título, versículo, referência, itens, estilo e a versão do desenho). **Mesmo hash, mesma imagem:** o arquivo pode ficar em cache para sempre. Se o slide muda, o hash muda e o endereço também.
- O arquivo é servido com `Cache-Control: public, max-age=31536000, immutable`.

### Quando `imageUrl` vem `null`

- Palavra enviada antes de 25/11/2026 (a entrega antiga não tem imagens).
- O pregador acabou de mudar o slide e o painel ainda não enviou a imagem nova. As imagens sobem sozinhas uns segundos depois que a palavra é salva, enquanto o painel estiver aberto.

Nesses casos a Ponte mostra o slide em texto, com `title`, `text` e `reference`. Nunca há imagem de um slide antigo no lugar de um slide novo: só vale a imagem cujo hash é o do slide atual.

## Exemplo

Palavra "A agenda Profética está em Curso" (o exemplo aprovado, 13 slides, estilo `MINIMAL`). Aqui aparecem 5 dos 13 slides; a lista inteira está em [apps/ponte/docs/exemplo-services-next.json](../../apps/ponte/docs/exemplo-services-next.json). O último slide ainda não tem imagem.

```json
{
  "sermon": {
    "title": "A agenda Profética está em Curso",
    "preacherName": "Pr. João",
    "estimatedMinutes": 40,
    "slideCount": 13,
    "version": "cdf749f867ef7114",
    "slides": [
      {
        "index": 0,
        "kind": "VERSE",
        "title": "A agenda Profética está em Curso",
        "text": "Que anuncio o fim desde o princípio, e desde a antiguidade as coisas que ainda não sucederam; que digo: O meu conselho será firme, e farei toda a minha vontade.",
        "reference": "Isaías 46:10",
        "imageUrl": "https://arquivos.exemplo.org/tenants/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sermons/eeeeeeee-eeee-4eee-8eee-000000000001/403dae2d30aaf87f.png",
        "width": 1920,
        "height": 1080
      },
      {
        "index": 1,
        "kind": "SUMMARY",
        "title": "A agenda Profética está em Curso",
        "text": "Uma Agenda de Poder\nUma Agenda Guiada pelo Espírito Santo\nUma Agenda de Fé\nUm Agenda para Reinar em Vida\nUma Agenda que vai abalar tudo mais uma vez\nUma Agenda de Tranferência de Riquezas\nUma Agenda de Troca de Guarda",
        "reference": null,
        "imageUrl": "https://arquivos.exemplo.org/tenants/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sermons/eeeeeeee-eeee-4eee-8eee-000000000001/2761df1f12e414ef.png",
        "width": 1920,
        "height": 1080
      },
      {
        "index": 2,
        "kind": "VERSE",
        "title": "1. Uma Agenda de Poder",
        "text": "A palavra da cruz é loucura para os que perecem; mas para nós, que somos salvos, é o poder de Deus.",
        "reference": "1 Coríntios 1:18",
        "imageUrl": "https://arquivos.exemplo.org/tenants/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sermons/eeeeeeee-eeee-4eee-8eee-000000000001/3c5722dedafc6d7b.png",
        "width": 1920,
        "height": 1080
      },
      {
        "index": 11,
        "kind": "SUMMARY",
        "title": "7. Uma Agenda de Troca de Guarda",
        "text": "Deus visitou José em sonhos: ele sustentaria Israel no Egito (Gênesis 37:5)\nDeus visitou Moises em visão na sarça ardente: (Êxodo 3:2)\nDeus visitou Salomão em sonho: pede-me... (1 Reis 3:5)",
        "reference": null,
        "imageUrl": "https://arquivos.exemplo.org/tenants/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sermons/eeeeeeee-eeee-4eee-8eee-000000000001/84288c4227558fad.png",
        "width": 1920,
        "height": 1080
      },
      {
        "index": 12,
        "kind": "VERSE",
        "title": "7. Uma Agenda de Troca de Guarda",
        "text": "Meus olhos aprovam os fiéis da terra, e eles habitarão comigo. Somente quem tem vida íntegra me servirá.",
        "reference": "Salmos 101:6",
        "imageUrl": null,
        "width": null,
        "height": null
      }
    ]
  }
}
```

Os hashes e a `version` acima são os que a API calcula para esse conteúdo. O domínio, o tenant e o envio são fictícios.

## De onde vêm as imagens (painel)

A Ponte só lê. Quem desenha e envia é o painel, com o pregador logado (permissão Palavras › Editar, tenant e autor do JWT):

- `GET /api/admin/tenants/me/sermons/:id/delivery/images` devolve `{ style, version, slides: [{ index, hash, slide, imageUrl }] }` e tira do registro as imagens de slides que não existem mais.
- `PUT /api/admin/tenants/me/sermons/:id/delivery/images/:hash` recebe o PNG (multipart, campo `file`, até 1,5 MB, 1920×1080) e responde `{ hash, imageUrl }`. Hash que não é de um slide atual dá 400 ("A lista de slides mudou. Atualize a página.").

## Exemplos reais

Imagens geradas pelo painel para a palavra de exemplo "A agenda Profética está em Curso" (Verde, 1920×1080):

- Capa com o versículo de abertura: [`exemplos/ponte-palavra-slide-capa.png`](exemplos/ponte-palavra-slide-capa.png)
- Tópico com lista e referências: [`exemplos/ponte-palavra-slide-lista.png`](exemplos/ponte-palavra-slide-lista.png)
- O aviso na página de slides do painel: [`exemplos/ponte-palavra-status-painel.png`](exemplos/ponte-palavra-status-painel.png)

Nos 13 slides desse exemplo, o PNG teve em média 160 KB (o maior, 186 KB). Pelo `r2.dev` de hoje (17 MB em 83 s, uns 200 KB/s), cada imagem leva perto de 1 s e a palavra inteira uns 10 s. As imagens têm o hash no nome e não mudam, então a Ponte só baixa de novo as que mudaram.
