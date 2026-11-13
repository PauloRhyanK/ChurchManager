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
