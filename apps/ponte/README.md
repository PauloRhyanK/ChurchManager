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

## A TV do altar e as telas do PC

O retorno do altar é a tela do PC do Holyrics, transmitida pelo Sunshine e recebida pelo
Moonlight na TV (LG webOS), pelo Wi-Fi. Duas coisas davam problema, e a Ponte passou a
cuidar das duas.

**A TV liga e abre o retorno sozinha, na janela do culto.** Dentro da janela (de uma hora
antes do culto até meia hora depois do fim, ou o horário escrito em
`vigia_tv.janela_do_culto`), o PC principal:

1. fica olhando, de 5 em 5 segundos, se a TV está na rede. Enquanto não está, manda
   "ligar pela rede" a cada 30 segundos e o painel mostra "esperando a TV". Não há limite
   de tentativas nesta fase: é só olhar;
2. assim que a TV responde (ligada pela rede ou por alguém no controle), espera uns
   segundos e manda abrir o retorno;
3. só dá por certo quando o Sunshine registra que a TV entrou.

Se a TV for desligada e religada no meio do culto, o ciclo recomeça. O que não muda: com
**outro aplicativo na tela** da TV a Ponte não mexe; e se a TV responde mas o retorno não
conecta em três tentativas, ela para e pede uma pessoa (e volta a tentar quando a TV for
religada). Fora da janela do culto, vale a regra antiga: nunca liga a TV nem abre o que
ninguém abriu. Cada passo aparece no "Aconteceu agora".

- **Para a TV acordar pela rede** é preciso ligar na própria TV: Configurações > Geral >
  Dispositivos > Dispositivos externos > **"Ligar via Wi-Fi"** (o nome muda com o ano do
  modelo: "LG Connect Apps", "Mobile TV On"). Sem isso a Ponte só espera alguém ligar a TV
  no controle, e faz o resto. Pelo Wi-Fi nem toda LG acorda; pelo cabo de rede, sim.
- Na **chegada**, o item "TV do altar mostrando o retorno" fica verde só com a TV ligada,
  o retorno na tela dela e o Sunshine transmitindo. "Tentar de novo" refaz o ciclo.

**As telas do PC.** Quando o Windows reorganiza as telas (um monitor desligado, um cabo
HDMI solto ou encaixado, uma resolução trocada), o Sunshine pode passar a capturar a tela
errada. No menu Mais do painel, **"Esta é a disposição certa"** guarda a disposição de
agora. Daí em diante a Ponte avisa, em vermelho, quando ela muda, dizendo o que mudou, e
oferece **"Restaurar a disposição"**. Também avisa quando a tela escrita em `output_name`
do `sunshine.conf` deixou de existir. Restaurar não traz de volta um monitor desligado ou
sem cabo.

**A recomendação que resolve de vez: uma tela só para o retorno.** Enquanto o retorno
depender de um monitor de verdade, desligar esse monitor ou soltar o cabo dele derruba a
TV. Duas saídas, das quais a primeira é a mais simples:

- um **plugue HDMI fantasma** (um adaptador pequeno, que faz o PC achar que há um monitor
  1080p ligado) numa saída de vídeo livre do PC do Holyrics;
- ou um **driver de tela virtual** instalado no Windows.

Nos dois casos: estender a área de trabalho para essa tela, pôr nela a saída de retorno do
Holyrics, escrever o nome dela em `output_name` no `sunshine.conf`, e guardar a disposição
no painel. A tela do retorno passa a existir sempre, com ou sem monitor.

**Nada disto rodou com a TV, o Sunshine ou um Windows de verdade.** Ver a seção 18 de
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
