# Instalar a ponte num PC da igreja

O projeto é o mesmo em todo PC. O que muda é o **papel** da máquina, que o
instalador pergunta.

## O jeito mais curto: um arquivo só

No PC que vai ser instalado, abra `https://ponte.igrejaparaiso.com.br/instalar`, entre
com a senha da equipe e clique em **Baixar o instalador**. Dois cliques no
`instalar-ponte.bat` e ele:

1. pergunta que PC é este;
2. baixa o projeto e a configuração da igreja guardada no cofre da versão web;
3. instala o que faltar (Python; o OBS, no notebook da transmissão);
4. põe a coleção de cenas e o perfil do OBS no lugar, se ainda não existirem;
5. cria os atalhos e liga a ponte.

O instalador **vale por 30 minutos**. Não mande o arquivo por mensagem: quem o tiver,
nesse prazo, recebe os segredos da igreja. Se vencer, baixe outro.

Num PC que já tem a ponte ele só atualiza o projeto: o `config.yaml` e o
`maquina.yaml` que estão lá ficam como estão.

**Ainda não foi testado num Windows de verdade** (escrito em 12/11/2026). Até ser,
o caminho abaixo, passo a passo, continua valendo.

### Ligar o PC principal à versão web

O painel só funciona pela internet depois que o PC principal recebe a **chave** da
versão web (uma frase de palavras com hífen, que fica na VPS).

- **Instalando pelo instalador da web**, a chave vem junto e o PC já sai ligado. Ninguém
  digita nada.
- **Instalando pela rede da igreja** (`configurar-este-pc.bat`), o instalador pergunta a
  chave. ENTER deixa para depois.
- **Num PC já instalado**, dois cliques em **`ligar-web.bat`**: ele pergunta a chave.

Nos três casos a chave é conferida com a versão web antes de ser gravada. Chave errada
não é gravada. O que muda é só o bloco `web` do `config.yaml` (`ativo` e `chave`) e a
linha `endereco_no_ar` do `chegada.yaml`.

### O que o cofre guarda, e de onde vem

O PC principal entrega sozinho, a cada mudança: `config.yaml`, `chegada.yaml`,
`looks_salvas.yaml`, `patch.yaml`, tudo que estiver na pasta `obs/` e os arquivos
`_*.json`: as credenciais do YouTube (`_google_oauth.json`, `_youtube_token.json`) e o
estado do culto (ordem, marcas do louvor, progresso do guia). Só o PC principal recebe
os `_*.json`. Num PC que já tem a ponte, os que estão lá ficam.

A pasta `obs/` é preenchida **à mão, uma vez**, e de novo quando as cenas mudarem. No
notebook da transmissão, copie de `%APPDATA%\obs-studio\basic\`:

- `scenes\<coleção>.json` para `obs\scenes\` na pasta da ponte **do PC principal**;
- `profiles\<perfil>\` (a pasta inteira) para `obs\profiles\`.

O perfil tem a chave de transmissão do YouTube. A pasta `obs/` nunca entra no Git.

## Atualizar os PCs

Quando o projeto muda, **não é preciso reinstalar**. Cada PC pergunta à versão web, de
10 em 10 minutos, se há projeto mais novo:

- **Ao ligar o PC**, a ponte traz a versão nova antes de subir. O PC do som não faz
  isso (ele leva a luz), e nenhum PC faz se um culto parece estar em andamento.
- **Com o PC já ligado**, aparece a faixa "Há uma atualização da Ponte" no painel e na
  página do PC, com o botão **Atualizar agora**. A ponte some por alguns segundos e
  volta sozinha. Fora do culto, de preferência.
- **O que é da igreja não é tocado:** `config.yaml`, `maquina.yaml`, `chegada.yaml`,
  as cenas de luz, as credenciais e a pasta `obs/`.
- **Se a versão nova não subir**, a ponte volta sozinha para a anterior, que fica
  guardada em `_versao_anterior/`.
- No menu **Mais** do painel há a lista dos PCs e quem ainda precisa atualizar.

Isso só funciona em PCs abertos pelo atalho **Ponte do Culto** (o `iniciar-ponte.bat`).
Um PC que nunca deve se atualizar sozinho leva `atualizar: nunca` no `maquina.yaml`.

## Passo a passo, sem o instalador

## 1. Python (uma vez por PC)

Se o PC não tiver, o instalador avisa. Para instalar: [python.org/downloads](https://www.python.org/downloads/),
Python 3.12 para Windows. **Na primeira tela, marque "Add python.exe to PATH"** e
clique em Install Now.

## 2. Baixar

No PC novo, abra o painel do PC do Holyrics — `http://192.168.1.143:8700` — e clique
em **Instalar em outro PC**. Extraia o zip em `C:\ponte-do-culto`.

(De fora da igreja: `https://ponte.igrejaparaiso.com.br/baixar`, com a senha da equipe.)

## 3. Configurar

Dentro da pasta extraída, dois cliques em **`configurar-este-pc.bat`**. Ele pergunta:

1. que PC é este (notebook da transmissão, PC do som, PC do Holyrics);
2. o endereço do PC do Holyrics (ENTER aceita `192.168.1.143`).

E faz o resto: prepara o Python do projeto, cria o atalho na área de trabalho e o
de abrir junto com o Windows, e liga a ponte.

## O que muda em cada PC

- **Notebook e PC do som** não guardam segredo nenhum. A ponte deles só mostra a
  página do PC e conversa com o PC do Holyrics.
- **PC do Holyrics** é o principal e precisa dos segredos (token do Holyrics, senha
  do OBS) no `config.yaml`. **Quem digita é uma pessoa da equipe, direto no arquivo.
  Nunca por mensagem, foto ou print.**
- **PC do som** já roda a versão antiga, que leva a luz. O instalador **se recusa** a
  instalar por cima: a troca é feita com calma, para a luz não cair.

## O PC do som não pode dormir nem perder a rede

É ele que leva a luz até os refletores. Em 12/11/2026 ele saiu da rede duas vezes no
meio do culto, e a suspensão já estava desligada — a causa está sendo investigada.

## Seguir com a luz (opcional)

As cabeças móveis do teto acompanham uma pessoa pela câmera aberta do OBS. A
tela é `/seguir`, no PC principal. Sem os passos abaixo, a ponte funciona igual
e a tela só diz o que falta.

1. **No PC principal**, instale o OpenCV (uma vez):

   ```
   pip install -r requirements-seguir.txt
   ```

2. **O modelo YOLO** (recomendado; sem ele, a ponte usa um detector simples
   que erra mais). Em qualquer computador com Python, uma vez:

   ```
   pip install ultralytics
   yolo export model=yolo11n.pt format=onnx imgsz=320 opset=12
   ```

   Copie o `yolo11n.onnx` gerado para `modelos/` na pasta da ponte. O YOLO da
   Ultralytics tem licença AGPL-3.0: uso interno na igreja não tem problema,
   mas não redistribua o arquivo junto com a ponte.

3. **No `config.yaml` do PC principal**, a seção `seguir:` (exemplo no fim de
   `config.exemplo.yaml`). O mais importante é `fonte`: o nome da fonte da
   câmera aberta no OBS. **No PC do som**, ponha `seguir: { cerca: ..., velocidade: ... }`
   se quiser limitar até onde e quão rápido a luz anda.

4. **Calibre** cada luz pela tela `/seguir`: uma pessoa em pé numa marca do
   palco, a luz no peito dela, clique em "Gravar ponto" e na pessoa. De 4 a 6
   marcas espalhadas. Se a câmera mudar de lugar ou de zoom, calibre de novo.

Segurança: a luz só anda com "Seguir" ligado. Perdeu a pessoa, a luz fica
parada onde está. "Parado", qualquer modo do culto ou o Estúdio desligam o
seguir. Cabeça apagada não se mexe.

### Vídeo ainda mais rápido (opcional, fase 2)

A imagem do painel agora chega em fluxo, com 4 a 5 quadros por segundo, a
partir de fotos do OBS. Para ter vídeo de verdade (30 quadros por segundo, com
menos de meio segundo de atraso), o caminho é um **MediaMTX** na rede da
igreja recebendo uma segunda saída do OBS, pequena (480p) e com codificador
de hardware. O navegador assiste por WebRTC. Isso pede instalar o MediaMTX e
um plugin de saída extra no OBS, e não está feito.
