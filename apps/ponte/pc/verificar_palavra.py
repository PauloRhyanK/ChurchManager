"""Confere se o Holyrics desta igreja deixa a Ponte mostrar a palavra.

    python verificar_palavra.py            # so pergunta, nao mostra nada
    python verificar_palavra.py --mostrar  # MOSTRA um versiculo e um texto no telao

A Ponte poe os slides da palavra no telao por tres acoes do Holyrics (ver
ponte/palavra.py): uma que mostra um versiculo pela referencia, uma que mostra
um texto, e uma que tira o que esta no telao. Os nomes mudam entre versoes do
Holyrics, e cada acao precisa de permissao no token (Arquivo > Configuracoes >
API Server). Este script diz, para cada uma:

    liberada       respondeu sem recusar
    falta liberar  o Holyrics disse "unauthorized action": a acao existe, e
                   so falta marcar a permissao dela no token
    nao existe     esta versao do Holyrics nao tem essa acao: troque o nome
                   no bloco `palavra` do config.yaml
    token errado   "invalid token"

SEM --mostrar o pedido vai com um parametro vazio, que o Holyrics recusa por
falta de dado DEPOIS de conferir a permissao: da para saber se esta liberada
sem nada aparecer no telao. Isso e o esperado, mas NAO FOI TESTADO NA IGREJA:
rode a primeira vez fora do culto.
"""

import json
import os
import sys

import requests
import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte.palavra import TelaoDaPalavra

AQUI = os.path.dirname(os.path.abspath(__file__))
REFERENCIA = "Salmos 119:105"
TEXTO = "Teste da Ponte do Culto"


def acoes(config):
    escrito = (config.get("palavra") or {})
    saida = {}
    for qual, padrao in TelaoDaPalavra.PADRAO.items():
        dados = dict(padrao)
        if isinstance(escrito.get(qual), dict):
            dados.update(escrito[qual])
        saida[qual] = dados
    return saida


def veredito(status, corpo):
    """A resposta do Holyrics -> uma das quatro palavras."""
    erro = ""
    if isinstance(corpo, dict):
        erro = str(corpo.get("error") or "").lower()
    if status == 404 or "not found" in erro or "invalid action" in erro:
        return "nao existe"
    if "invalid token" in erro:
        return "token errado"
    if status == 401 or "unauthorized" in erro:
        return "falta liberar"
    return "liberada"


def perguntar(base, token, acao, payload):
    resposta = requests.post("{}/{}".format(base, acao), params={"token": token}, json=payload, timeout=6)
    try:
        corpo = resposta.json()
    except ValueError:
        corpo = {}
    return veredito(resposta.status_code, corpo), corpo


def imagens(config, base, token):
    """As imagens prontas dos slides (ponte/slides_da_palavra.py): a Ponte acha
    a pasta de imagens do Holyrics no disco? O token pode mostrar imagem?
    Nao mostra nada no telao. Devolve quantas coisas faltam."""
    from ponte import slides_da_palavra

    class Cliente:
        def pedir(self, acao, payload=None):
            return requests.post("{}/{}".format(base, acao), params={"token": token},
                                 json=payload or {}, timeout=6).json()

    print()
    print("As imagens prontas dos slides:")
    falta = 0
    subpasta = str((config.get("palavra") or {}).get("pasta_de_imagens") or "Palavra")
    try:
        pasta = slides_da_palavra.pasta_de_imagens_do_holyrics(config, Cliente())
    except Exception:
        pasta = None
    if pasta is None:
        falta += 1
        print("  NAO ACHEI      a pasta de imagens do Holyrics no disco deste PC.")
        print("                 No Holyrics, aba Imagens > botao direito > abrir a pasta; copie o")
        print("                 caminho para `palavra: { pasta_no_disco: ... }` no config.yaml.")
    else:
        dentro = os.path.join(pasta, subpasta)
        quantos = len(os.listdir(dentro)) if os.path.isdir(dentro) else 0
        print("  ACHEI          {}".format(pasta))
        print("                 subpasta `{}`: {} arquivo(s)".format(subpasta, quantos))
    try:
        # Um nome que nao existe: o Holyrics confere a permissao antes de procurar.
        resultado, corpo = perguntar(base, token, "ShowImage", {"file": "ponte-do-culto-nao-existe.png"})
    except requests.RequestException as erro:
        print("  SEM RESPOSTA   Mostrar uma imagem (ShowImage): {}".format(str(erro).replace(token, "***")[:120]))
        return falta + 1
    print("  {:<14} Mostrar uma imagem (ShowImage)".format(resultado.upper()))
    if resultado != "liberada":
        falta += 1
        print("                 o Holyrics disse: {}".format(json.dumps(corpo, ensure_ascii=False)[:160].replace(token, "***")))
    return falta


def main():
    mostrar = "--mostrar" in sys.argv
    caminho = os.environ.get("PONTE_CONFIG") or os.path.join(AQUI, "config.yaml")
    with open(caminho, "r", encoding="utf-8-sig") as arquivo:
        config = yaml.safe_load(arquivo) or {}
    holy = config.get("holyrics") or {}
    token = str(holy.get("token") or "")
    if not token or token.startswith("COLE-AQUI"):
        print("O token do Holyrics ainda nao esta no config.yaml.")
        return 2
    base = "http://{}:{}/api".format(holy.get("host", "127.0.0.1"), holy.get("porta", 8091))
    conf = acoes(config)
    pedidos = [
        ("versiculo", "Mostrar um versiculo pela referencia",
         {conf["versiculo"].get("campo") or "references": REFERENCIA if mostrar else ""}),
        ("texto", "Mostrar um texto (titulo, ponto)",
         {conf["texto"].get("campo") or "text": TEXTO if mostrar else ""}),
    ]
    if mostrar:
        pedidos.append(("tirar", "Tirar do telao", {}))
        print("ATENCAO: isto vai aparecer no telao agora.")
    ruim = 0
    for qual, descricao, payload in pedidos:
        acao = conf[qual]["acao"]
        try:
            resultado, corpo = perguntar(base, token, acao, payload)
        except requests.RequestException as erro:
            print("  SEM RESPOSTA   {} ({}): {}".format(descricao, acao, str(erro).replace(token, "***")[:120]))
            ruim += 1
            continue
        print("  {:<14} {} ({})".format(resultado.upper(), descricao, acao))
        if resultado != "liberada":
            ruim += 1
            detalhe = json.dumps(corpo, ensure_ascii=False)[:160].replace(token, "***")
            print("                 o Holyrics disse: {}".format(detalhe))
    ruim += imagens(config, base, token)
    print()
    if ruim:
        print("Falta alguma coisa. Para liberar: Holyrics > Arquivo > Configuracoes > API Server >")
        print("permissoes do token > marcar a acao. Para trocar o nome da acao: bloco `palavra`")
        print("do config.yaml (ver o fim do config.exemplo.yaml).")
        print("Enquanto faltar, o painel mostra o slide com 'Abra no Holyrics' e a lista segue.")
    else:
        print("Tudo liberado." + ("" if mostrar else " Rode com --mostrar, fora do culto, para ver no telao."))
    return 1 if ruim else 0


if __name__ == "__main__":
    sys.exit(main())
