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

### O que o cofre guarda, e de onde vem

O PC principal entrega sozinho, a cada mudança: `config.yaml`, `chegada.yaml`,
`looks_salvas.yaml`, `patch.yaml` e tudo que estiver na pasta `obs/`. As credenciais
do YouTube (`_*.json`) não vão: num PC novo, autorize de novo em `/youtube`.

A pasta `obs/` é preenchida **à mão, uma vez**, e de novo quando as cenas mudarem. No
notebook da transmissão, copie de `%APPDATA%\obs-studio\basic\`:

- `scenes\<coleção>.json` para `obs\scenes\` na pasta da ponte **do PC principal**;
- `profiles\<perfil>\` (a pasta inteira) para `obs\profiles\`.

O perfil tem a chave de transmissão do YouTube. A pasta `obs/` nunca entra no Git.

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
