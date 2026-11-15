"""Armazenamento da mesa de teste de luz.

Duas coisas que a mesa precisa guardar e que NAO pertencem ao config.yaml:

  looks_salvas.yaml  as looks desenhadas na mesa, com nome
  patch.yaml         o que cada canal DMX e, em portugues

Por que arquivos separados, e isto importa: o config.yaml e escrito a mao e
esta cheio de comentarios que explicam decisoes. Toda biblioteca de YAML
perde comentario ao reescrever um arquivo. Se a mesa gravasse direto no
config.yaml, a primeira look salva apagaria meses de explicacao — em
silencio, e sem ninguem notar ate precisar ler.

Entao: arquivo escrito por humano fica escrito por humano; arquivo escrito
por maquina fica separado e pode ser reescrito a vontade.
"""

import os
import tempfile

import yaml

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAMINHO_LOOKS = os.path.join(RAIZ, "looks_salvas.yaml")
CAMINHO_PATCH = os.path.join(RAIZ, "patch.yaml")

CABECALHO_LOOKS = """\
# Escrito pela MESA DE TESTE do painel (/luzes). Pode editar a mao, mas
# qualquer comentario que voce puser aqui some quando a mesa salvar de novo.
# Comentario que precisa durar vai no config.yaml.
#
# Uma look com o mesmo nome de uma do config.yaml SUBSTITUI aquela.
"""

CABECALHO_PATCH = """\
# O que cada canal DMX e, em portugues. Escrito pela mesa de teste.
#
# Isto nao muda o comportamento de nada — serve para quem esta montando uma
# look saber que o canal 7 e o par da esquerda e nao ter que adivinhar.
# Um canal pode ter mais de um refletor; e so escrever isso no texto.
"""


class ErroMesa(Exception):
    pass


def _ler(caminho, chave):
    if not os.path.exists(caminho):
        return {}
    try:
        with open(caminho, "r", encoding="utf-8") as arquivo:
            dados = yaml.safe_load(arquivo) or {}
    except (OSError, yaml.YAMLError) as erro:
        raise ErroMesa("nao consegui ler {}: {}".format(os.path.basename(caminho), erro))
    valor = dados.get(chave)
    return valor if isinstance(valor, dict) else {}


def _gravar(caminho, chave, valor, cabecalho):
    """Grava num arquivo temporario e so entao troca pelo definitivo.

    Sem isso, uma queda de energia no meio da escrita deixaria o arquivo pela
    metade — e um YAML pela metade impede a ponte de subir no domingo. Com a
    troca atomica, ou o arquivo novo esta inteiro, ou o antigo continua la.
    """
    pasta = os.path.dirname(caminho)
    temporario = None
    try:
        descritor, temporario = tempfile.mkstemp(dir=pasta, suffix=".tmp")
        with os.fdopen(descritor, "w", encoding="utf-8") as arquivo:
            arquivo.write(cabecalho)
            yaml.safe_dump({chave: valor}, arquivo, allow_unicode=True,
                           default_flow_style=False, sort_keys=True)
        os.replace(temporario, caminho)
        temporario = None
    except OSError as erro:
        raise ErroMesa("nao consegui gravar {}: {}".format(os.path.basename(caminho), erro))
    finally:
        if temporario and os.path.exists(temporario):
            try:
                os.remove(temporario)
            except OSError:
                pass


# -- looks -------------------------------------------------------------------


def carregar_looks():
    """As looks salvas na mesa, com canais e valores como inteiros."""
    cruas = _ler(CAMINHO_LOOKS, "looks")
    limpas = {}
    for nome, canais in cruas.items():
        if not isinstance(canais, dict):
            continue
        try:
            limpas[str(nome)] = {int(c): int(v) for c, v in canais.items()}
        except (TypeError, ValueError):
            continue
    return limpas


def salvar_look(nome, canais):
    nome = str(nome or "").strip()
    if not nome:
        raise ErroMesa("a look precisa de um nome")
    if len(nome) > 40:
        raise ErroMesa("nome longo demais (maximo 40 caracteres)")

    validos = {}
    for canal, valor in (canais or {}).items():
        try:
            numero, nivel = int(canal), int(valor)
        except (TypeError, ValueError):
            raise ErroMesa("canal ou valor nao numerico: {!r}".format(canal))
        if not 1 <= numero <= 512:
            raise ErroMesa("canal {} fora da faixa 1-512".format(numero))
        if not 0 <= nivel <= 255:
            raise ErroMesa("valor {} fora da faixa 0-255".format(nivel))
        # ZERO ENTRA, e isto ja esteve errado aqui. A versao anterior
        # descartava canal em zero, com o argumento de que "uma look e o que
        # eu ligo" e de que zeros so poluem o arquivo.
        #
        # So que o quadro DMX e PERSISTENTE: o que a look nao menciona fica
        # como estava. E entre os canais dos refletores da igreja ha um de
        # PROGRAMA AUTOMATICO e um de RESET. Um valor alto preso num deles
        # faz o refletor trocar de cor sozinho ou recalibrar no meio da
        # pregacao — e a look seguinte, sem mencionar o canal, nao conserta.
        #
        # Entao uma look guarda TODOS os canais da mesa, com os zeros. Zero
        # nao e ausencia: e a declaracao de que aquele canal fica apagado.
        validos[numero] = nivel

    todas = carregar_looks()
    todas[nome] = validos
    _gravar(CAMINHO_LOOKS, "looks", todas, CABECALHO_LOOKS)
    return validos


def remover_look(nome):
    todas = carregar_looks()
    if str(nome) not in todas:
        raise ErroMesa("nao existe look salva com o nome {!r}".format(nome))
    del todas[str(nome)]
    _gravar(CAMINHO_LOOKS, "looks", todas, CABECALHO_LOOKS)


# -- patch -------------------------------------------------------------------


def carregar_patch():
    cru = _ler(CAMINHO_PATCH, "canais")
    limpo = {}
    for canal, texto in cru.items():
        try:
            numero = int(canal)
        except (TypeError, ValueError):
            continue
        if 1 <= numero <= 512 and str(texto).strip():
            limpo[numero] = str(texto).strip()
    return limpo


def salvar_rotulo(canal, rotulo):
    try:
        numero = int(canal)
    except (TypeError, ValueError):
        raise ErroMesa("canal nao numerico: {!r}".format(canal))
    if not 1 <= numero <= 512:
        raise ErroMesa("canal {} fora da faixa 1-512".format(numero))

    texto = str(rotulo or "").strip()[:120]
    patch = carregar_patch()
    if texto:
        patch[numero] = texto
    else:
        patch.pop(numero, None)   # rotulo vazio apaga a anotacao
    _gravar(CAMINHO_PATCH, "canais", patch, CABECALHO_PATCH)
    return texto
