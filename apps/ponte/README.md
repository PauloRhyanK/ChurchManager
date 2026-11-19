# Ponte do Culto

O sistema da equipe de multimídia da Igreja Paraíso: um clique aciona OBS, Holyrics
e luzes, e um guia conduz o voluntário que chega para o culto.

Esta pasta (`apps/ponte/`) vive dentro do monorepo do ChurchManager, mas é
independente da API e do painel: é Python, não usa o banco e tem implantação própria.
Os caminhos abaixo são relativos a ela.

## Como a pasta está dividida

| Pasta | O que é | Onde roda |
|---|---|---|
| [`web/`](web/) | A versão da web. Um **espelho** com senha: mostra o estado do culto e repassa pedidos. | VPS, em `ponte.igrejaparaiso.com.br` |
| [`pc/`](pc/) | A ponte de verdade. O **mesmo projeto em todo PC**; o que muda é o papel da máquina. | PCs da igreja |
| [`docs/`](docs/) | Como implantar e como as peças conversam. | — |

Quem chega agora ao projeto começa por
[`docs/PARA-A-SESSAO-DO-PC.md`](docs/PARA-A-SESSAO-DO-PC.md): o que mudou em 12/11/2026,
o que ainda não foi testado e o que falta fazer nos PCs da igreja.

A versão web serve os arquivos de `pc/` (as telas são as mesmas) e entrega a pasta
`pc/` em `.zip` no endereço `/baixar` — é assim que um PC novo recebe o projeto.

## Quem manda em quem

```
   celular / qualquer lugar                      rede da igreja
  ┌──────────────────────────┐        ┌────────────────────────────────────┐
  │  web/  (VPS, com senha)  │ ◄──────│  pc/  no PC do Holyrics (principal)│──► OBS · Holyrics · TV
  │  mostra e repassa        │  liga  │  mede, guarda, executa             │
  └──────────────────────────┘  a cada└───────────────▲────────────────────┘
                                 2 s                  │ leem o estado
                                        ┌─────────────┴──────────┐
                                        │ pc/ no notebook e no   │──► luz (PC do som)
                                        │ PC do som (secundários)│
                                        └────────────────────────┘
```

**A igreja liga para a web, nunca o contrário.** Não há porta aberta no roteador da
igreja. Se a internet cair, o culto não sente: o painel local continua, e a web passa
a dizer "sem contato com a igreja".

## O papel de cada máquina

Cada PC tem um `pc/maquina.yaml` (não versionado; veja `maquina.exemplo.yaml`):

- `holyrics` — o principal. Começa por um formulário (qual culto, que horas, quem veio)
  e pergunta uma coisa por vez.
- `transmissao` — o notebook do OBS. Apresenta-se e mostra o estado.
- `som` — o PC do Reaper. O mesmo, com os checks da mesa.

Qualquer máquina pode virar a principal trocando uma linha desse arquivo. **A troca é
manual**; não existe ainda eleição automática.

## O que NÃO está no repositório, de propósito

`config.yaml` (token do Holyrics, senha do OBS, chave da web), `maquina.yaml`,
credenciais do YouTube, logs, áudio e o acervo de letras. O `.gitignore` cuida disso;
os arquivos `.exemplo` mostram o formato.

## Instalar num PC novo

O jeito de um arquivo só: abrir `https://ponte.igrejaparaiso.com.br/instalar` no PC
novo, baixar o instalador e dar dois cliques. Ele traz o projeto e a configuração da
igreja guardada no cofre da versão web.

Sem internet, ou sem o cofre: no painel do PC do Holyrics, **Instalar em outro PC** baixa a pasta `pc/` em zip. Dentro
dela, `configurar-este-pc.bat` pergunta o papel da máquina e faz o resto. Detalhes em
[`pc/INSTALAR.md`](pc/INSTALAR.md).

## Passar os slides: pelo painel e pelo passador

**Pelo painel.** O painel do culto ao vivo mostra o que está aberto no Holyrics, seja o
que for: o slide atual, o próximo, a lista inteira com o atual destacado, e os botões
Anterior e Próximo (a barra de espaço também passa). Tocar num slide vai direto a ele.
Funciona no PC e no celular, na rede da igreja; pela versão web não se passa slide.
Se a Ponte estiver conduzindo uma música sozinha, passar à mão **assume** a letra, e
"Devolver" entrega de volta.

**Pelo passador (Logitech Spotlight).** O passador é um teclado: sozinho, só passa o
slide com a janela do Holyrics em foco. A Ponte, no PC principal, ouve o passador com
**qualquer janela em foco** e pede o próximo slide ao Holyrics.

- Só reage ao passador, reconhecido pelo receptor USB (`046D:C53E`). As mesmas teclas
  num teclado comum continuam sendo só teclas.
- Com o Holyrics em foco a Ponte fica quieta, porque ele já recebeu a tecla e passou
  sozinho; agir também passaria dois slides.
- O painel mostra, em "Telão e palco", se o receptor está conectado e qual foi o último
  clique.
- Para ver o que cada botão do passador manda: `python descobrir_passador.py` no PC do
  Holyrics. O que ele mostrar vai no bloco `passador` do `config.yaml` (fim do
  `config.exemplo.yaml`). De fábrica a Ponte espera "página abaixo" ou seta para a
  direita no botão de avançar, e "página acima" ou seta para a esquerda no de voltar.
- **Limite:** a Ponte ouve a tecla, não a tira de ninguém. A janela em foco também a
  recebe (um navegador pode rolar a página).
- **Nunca foi testado com o passador nem em Windows.** Ver a seção 15 de
  `docs/PARA-A-SESSAO-DO-PC.md`.

## O celular do músico e o roteiro intercalado

**O celular do músico.** No painel, em "Celular do músico", o operador gera um link que
vale só naquele culto (como o do pregador). Quem conduz o louvor abre no celular e vê a
música de agora, com tom, bpm e as partes em lista; entre músicas, vê o momento e o cartão
"Preparem" com a próxima música. Os botões: Próximo, Voltar, Repetir (a parte de agora),
tocar numa parte para pular para ela, e Próxima música, que precisa ser segurado por um
segundo porque **solta o VS**. Depois de cada toque aparece "Desfazer". Tudo o que o
músico faz fica no "Aconteceu agora" do painel ("Músico: repetiu o refrão").

**O VS e o interruptor.** Hoje o VS toca no Reaper do PC do som e quem dá o play é uma
pessoa. A Ponte passa a saber pedir "toque esta música", "vá para tal segundo" e "pare"
(`pc/ponte/vs.py`), mas isso vem **desligado** (`vs: { ativo: false }` no `config.yaml`):

- **Desligado:** os botões do músico mexem só no que é da Ponte. Com o tempo contado por
  ela (`relogio: { fonte: cronometro }`), pular e repetir movem esse tempo e a letra
  segue; senão, passam a letra do telão à mão.
- **Ligado para o navegador** (`driver: navegador`): a tela do painel que toca o áudio em
  ensaio obedece. É o que dá para ver funcionando sem a igreja.
- **Ligado para o Reaper** (`driver: reaper`): a ponte do PC do som busca os pedidos e
  manda no Reaper pela interface web dele (`pc/ponte/vs_reaper.py`). **Nunca rodou com um
  Reaper**, e o PC do som ainda roda a versão antiga da Ponte.

**O roteiro intercalado.** Quando o ChurchManager manda o campo `roteiro` (momentos e
músicas na ordem do culto), a coluna da ordem no painel passa a mostrar essa fila, com as
músicas entre os momentos, e "Próximo" segue por ela. Um momento de lá aciona o momento
daqui (câmera e luz) quando os nomes batem, ou pelo par escrito em `roteiro.momentos` do
config; sem par, o roteiro anda e nada é acionado. Sem o campo `roteiro`, o painel mostra
a ordem do culto de sempre. `pc/roteiro.exemplo.json` tem o formato, e
`cultos: { arquivo: roteiro.exemplo.json }` faz a Ponte ler dele, para ensaiar sem
internet.

## "No ar" só quando o YouTube confirma

O OBS dizer que está enviando não quer dizer que o YouTube está recebendo. Já aconteceu
de o painel mostrar "no ar" com a transmissão parada do lado de lá. Com o OBS enviando, a
Ponte (no PC principal, se o YouTube estiver autorizado) passa a perguntar ao YouTube se o
envio chega e se a transmissão do dia está no ar, e compara com a chave que está no OBS
(`pc/ponte/recepcao.py`).

- O selo "No ar" só fica verde quando os dois concordam. Enquanto não dá para saber, fica
  âmbar ("Enviando · conferindo o YouTube").
- Depois de 30 segundos de envio, se algo estiver errado, aparece uma faixa vermelha e um
  item no "Aconteceu agora", com a saída a um toque:

| O que o painel diz | O que é | O botão |
|---|---|---|
| O YouTube não está recebendo | o OBS envia e nada chega | Reconectar o OBS |
| A chave do OBS é de outra transmissão | a transmissão de hoje espera outra chave | Usar a chave desta transmissão, e depois Reconectar o OBS |
| Chegando no YouTube, mas a transmissão não foi iniciada | o envio chega, mas ninguém vê | Iniciar no YouTube |

- **Nada acontece sozinho**: os botões pedem confirmação, e só existem na rede da igreja.
- Nos 3 primeiros minutos de envio a conferência é a cada 15 segundos; depois, a cada 2
  minutos. Num culto de duas horas isso gasta perto de 150 das 10.000 unidades diárias da
  cota do YouTube (somando o que a Ponte já consultava, uns 450).
- Se a Ponte não conseguir falar com o YouTube, ela diz que não conseguiu perguntar e
  **não** pinta o painel de vermelho.
- **Nunca foi testado com o YouTube de verdade.** Ver a seção 17 de
  `docs/PARA-A-SESSAO-DO-PC.md`.

## Estado em 12/11/2026

- **No ar no PC do Holyrics:** papéis, página por PC, guia pelo celular, letras por
  caracteres, pacote de instalação pelo painel.
- **No ar na VPS:** o espelho web com senha, em `https://ponte.igrejaparaiso.com.br`
  (contêiner `ponte-web`; ver [`docs/IMPLANTAR-NA-VPS.md`](docs/IMPLANTAR-NA-VPS.md)). A
  igreja ainda não foi ligada a ele.
- **Feito e testado só localmente (12/11/2026):** o painel do culto novo, que é a mesma
  tela no PC, no celular e em `ponte.igrejaparaiso.com.br/painel`, com comandos pela
  web; a atualização automática dos PCs; a tela de montar cena redesenhada; o estúdio de luz
  (`/estudio`), com animação por luz e limites de velocidade no motor. **Nada disso foi
  visto com refletor, OBS ou Holyrics de verdade.** As animações do estúdio só chegam à
  igreja depois que o PC do som for atualizado; até lá aparecem só na prévia da tela.
- **Feito e testado só localmente (19/11/2026):** o painel do culto ao vivo
  (`ao-vivo.html`, que passa a ser a tela de `/`): ordem com horários e atraso,
  equipamentos, imagem e números da transmissão, climas de luz, e o louvor conduzido
  pela ponte (Sozinho, Assumir, Segurar, Repetir o refrão). O painel anterior continua
  em `/painel-antigo`. **Nunca rodou com OBS, Holyrics ou refletor de verdade**; o que
  conferir na igreja está nas seções 12 e 13 de `docs/PARA-A-SESSAO-DO-PC.md`.
- **Feito e testado só localmente (19/11/2026):** a palavra no painel (slides do
  sermão, versículo pela referência), o celular do pregador (link que vale só naquele
  culto, pelo Wi-Fi e pela versão web) e a leitura das músicas do ChurchManager pelo
  contrato. **Os nomes das ações do Holyrics para versículo e texto não foram
  confirmados** (`python verificar_palavra.py` confere), e a leitura do ChurchManager foi testada só
  contra o formato, nunca contra o servidor.
- **Feito e testado só localmente:** instalador `configurar-este-pc`; o cofre da versão
  web e o envio da configuração pelo PC principal.
- **Escrito e ainda não testado num Windows:** `instalar-do-zero.ps1`, o instalador de
  um arquivo só que a versão web entrega em `/instalar`.
- **Feito, ainda não testado de verdade:** "Preparar transmissão" no YouTube, que cria
  a transmissão antes do OBS começar, com link fixo. Precisa de um teste com o OBS
  parado, porque cria um vídeo no canal.
- **Ainda não feito:** ligar o PC do Holyrics à versão web (chave no `config.yaml`),
  instalação no notebook, troca da versão antiga no PC do som, troca automática de
  principal.
