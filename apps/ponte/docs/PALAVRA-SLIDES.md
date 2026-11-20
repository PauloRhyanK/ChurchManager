# Slides da Palavra na Ponte

Para quem mexe na Ponte. O contrato completo está em [docs/api/ponte-palavra.md](../../../docs/api/ponte-palavra.md) e um exemplo inteiro em [exemplo-services-next.json](./exemplo-services-next.json) (campo `sermon`).

## O que chega

Em `sermon`, além de `title`, `preacherName`, `estimatedMinutes` e `slideCount`, agora vêm:

- `version`: 16 caracteres hex. Muda quando o conteúdo dos slides muda.
- `slides`: cada um com `index`, `kind`, `title`, `text`, `reference`, `imageUrl`, `width` e `height`.

## Como usar

1. **Detectar mudança pela `version`.** Guarde a última `sermon.version`. Se for a mesma, os slides são os mesmos: não refaça nada. A `version` não muda quando só chega uma imagem que faltava. Por isso, confira também se algum `imageUrl` que era `null` passou a ter endereço (ou use o `version` de fora, o da resposta inteira, que muda nesse caso).
2. **Baixar as imagens por `imageUrl`.** O nome do arquivo é o hash do conteúdo (`…/<hash>.png`). Mesmo nome, mesma imagem: guarde em cache para sempre, com o hash como nome local, e não baixe de novo. Slide que mudou vem com outro hash e outro endereço.
3. **Imagem `null`: mostrar o texto.** Entrega antiga, ou o painel ainda não enviou a imagem do slide. Monte o slide com `title`, `text` (em `SUMMARY`, um item por linha) e `reference`. Quando a imagem chegar, troque.
4. **Falha ao baixar:** trate como `null` e mostre o texto. Tente de novo na próxima consulta.

## O que não fazer

- **Não remova `slideCount`.** Ele continua no contrato, é sempre igual a `slides.length` e não vai sair. Código antigo depende dele.
- Não use a posição (`index`) como nome do arquivo em cache: a ordem pode mudar sem a imagem mudar. Use o hash do endereço.
- Não abra pasta nem arquivo local no Holyrics para a pregação ("file not allowed"): as imagens já vêm prontas pela API.
