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

## Estado em 12/11/2026

- **Pronto e testado localmente:** papéis, páginas por PC, guia pelo celular, espelho
  web com senha, `/baixar`.
- **Ainda não feito:** implantação na VPS (ver [`docs/IMPLANTAR-NA-VPS.md`](docs/IMPLANTAR-NA-VPS.md)),
  instalação no notebook e no PC do som, troca automática de principal, e o painel de
  momentos do culto na versão web (hoje a web tem só o guia de chegada).
