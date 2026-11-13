# Instalar a ponte num PC da igreja

O projeto é o mesmo em todo PC. O que muda é o **papel** da máquina, que o
instalador pergunta.

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
