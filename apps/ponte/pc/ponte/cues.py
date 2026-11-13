"""Motor de cues.

Uma cue e uma lista de passos. Clicar num botao do painel roda a cue.

Regra central: UM PASSO QUE FALHA NAO PARA A CUE. Se o OBS estiver fechado, a
luz ainda muda. Se a luz estiver fora, o OBS ainda troca de cena. Num culto ao
vivo, meia automacao e muito melhor que nenhuma, e quem esta operando precisa
ver o que foi e o que nao foi — por isso cada passo volta com seu proprio
resultado em vez de a cue inteira estourar.
"""

import time

TEMPO_MAXIMO_DE_ESPERA = 5.0

ROTULOS = {
    "obs": "OBS",
    "obs_fonte": "OBS",
    "holyrics": "Holyrics",
    "luzes": "Luzes",
    "esperar": "Esperar",
}


def executar(cue, contexto):
    """Roda todos os passos da cue. Nunca levanta excecao.

    Devolve a lista de resultados, um por passo, na ordem.
    """
    resultados = []
    numero = 0
    for passo in cue.get("passos") or []:
        if not isinstance(passo, dict):
            numero += 1
            resultados.append(
                _resultado(numero, "?", "erro", "passo mal escrito no config.yaml")
            )
            continue
        for tipo, dados in passo.items():
            numero += 1
            resultados.append(_um_passo(numero, tipo, dados, contexto))
    return resultados


def _um_passo(numero, tipo, dados, contexto):
    rotulo = ROTULOS.get(tipo, tipo)
    try:
        if tipo == "obs":
            return _passo_obs(numero, rotulo, dados, contexto)
        if tipo == "obs_fonte":
            return _passo_obs_fonte(numero, rotulo, dados, contexto)
        if tipo == "holyrics":
            return _passo_holyrics(numero, rotulo, dados, contexto)
        if tipo == "luzes":
            return _passo_luzes(numero, rotulo, dados, contexto)
        if tipo == "esperar":
            return _passo_esperar(numero, rotulo, dados)
        return _resultado(
            numero, rotulo, "erro", "tipo de passo desconhecido: {}".format(tipo)
        )
    except Exception as erro:
        # Rede de seguranca: qualquer coisa inesperada vira um passo com erro,
        # e a cue segue para o proximo passo.
        return _resultado(numero, rotulo, "erro", str(erro) or type(erro).__name__)


# Codigos do obs-websocket que NAO sao falha: sao "ja estava assim".
#
# Ligar uma saida que ja roda devolve 500 (OutputRunning); parar uma que esta
# parada devolve 501 (OutputNotRunning). Tratar isso como erro pinta o painel
# de vermelho quando o sistema esta exatamente no estado desejado — e e o que
# torna seguro entrar duas vezes no mesmo momento do culto.
#
# MEDIDO contra o OBS 33.0.1 da igreja em 08/11, nao copiado de documentacao:
# StopVirtualCam parado -> 501; StartVirtualCam ja ativo -> 500.
JA_ESTAVA = {
    500: "ja estava ligado",
    501: "ja estava desligado",
}


def _passo_obs(numero, rotulo, dados, contexto):
    cliente = contexto.get("obs")
    if cliente is None:
        return _resultado(numero, rotulo, "pulado", "OBS desligado no config.yaml")
    if not isinstance(dados, dict) or not dados.get("requestType"):
        return _resultado(numero, rotulo, "erro", "falta requestType no config.yaml")

    tipo_req = dados["requestType"]
    try:
        cliente.pedir(tipo_req, dados.get("requestData"))
    except Exception as erro:
        # Sem importar ErroOBS: este modulo nao conhece os clientes de
        # proposito, e `codigo` e so um atributo. Quem nao tiver, nao casa.
        codigo = getattr(erro, "codigo", None)
        if codigo in JA_ESTAVA:
            return _resultado(
                numero, rotulo, "ok", "{} — {}".format(tipo_req, JA_ESTAVA[codigo])
            )
        raise

    detalhe = tipo_req
    cena = (dados.get("requestData") or {}).get("sceneName")
    if cena:
        detalhe = "{} → {}".format(tipo_req, cena)
    return _resultado(numero, rotulo, "ok", detalhe)


def _passo_obs_fonte(numero, rotulo, dados, contexto):
    """Mostra ou esconde uma fonte dentro de uma cena do OBS.

    Existe porque aqui o culto roda quase todo dentro de uma cena só, e o que
    muda entre um momento e outro é qual fonte está visível — não qual cena
    está no ar.
    """
    cliente = contexto.get("obs")
    if cliente is None:
        return _resultado(numero, rotulo, "pulado", "OBS desligado no config.yaml")
    if not isinstance(dados, dict):
        return _resultado(numero, rotulo, "erro", "passo obs_fonte mal escrito")
    cena = dados.get("cena")
    fonte = dados.get("fonte")
    if not cena or not fonte:
        return _resultado(numero, rotulo, "erro", "falta cena ou fonte no config.yaml")
    visivel = bool(dados.get("visivel"))
    cliente.definir_visibilidade(cena, fonte, visivel)
    return _resultado(
        numero, rotulo, "ok",
        "{} em '{}' -> {}".format(fonte, cena, "visivel" if visivel else "oculto"),
    )


# Respostas do Holyrics que NAO sao falha: sao "nao ha o que fazer".
#
# MEDIDO contra o Holyrics 2.30.0 da igreja em 08/11: com nenhuma apresentacao
# no ar, SetF8, SetF9 e SetF10 recusam SEMPRE — tanto para ligar quanto para
# desligar — com "No presentation available". Faz sentido: essas teclas
# escurecem uma apresentacao, e sem apresentacao nao ha o que escurecer. O
# telao ja esta sem conteudo, que e exatamente o que o passo queria garantir.
#
# FRAGIL DE PROPOSITO, e vale saber: isto casa por TEXTO, nao por codigo,
# porque a API do Holyrics nao devolve codigo numerico. Se uma versao futura
# mudar a frase, o passo volta a aparecer como erro vermelho — chato, mas
# visivel, que e melhor que falhar calado.
NADA_A_FAZER_HOLYRICS = ("no presentation available",)


def _passo_holyrics(numero, rotulo, dados, contexto):
    cliente = contexto.get("holyrics")
    if cliente is None:
        return _resultado(numero, rotulo, "pulado", "Holyrics desligado no config.yaml")
    if not isinstance(dados, dict) or not dados.get("action"):
        return _resultado(numero, rotulo, "erro", "falta action no config.yaml")

    acao = dados["action"]
    try:
        cliente.pedir(acao, dados.get("payload"))
    except Exception as erro:
        texto = str(erro).lower()
        if any(frase in texto for frase in NADA_A_FAZER_HOLYRICS):
            return _resultado(
                numero, rotulo, "ok", "{} — nao havia apresentacao no ar".format(acao)
            )
        raise

    return _resultado(numero, rotulo, "ok", acao)


def _passo_luzes(numero, rotulo, dados, contexto):
    cliente = contexto.get("luzes")
    if cliente is None:
        return _resultado(numero, rotulo, "pulado", "luzes em driver: nenhum")
    looks = contexto.get("looks") or {}
    nome = str(dados)
    look = looks.get(nome)
    if look is None:
        return _resultado(
            numero, rotulo, "erro", "a look '{}' nao existe no config.yaml".format(nome)
        )
    cliente.aplicar(look)
    # Art-Net e UDP: o pacote saiu, mas ninguem confirma. Ver luzes.py.
    return _resultado(numero, rotulo, "ok", "look {} enviada".format(nome))


def _passo_esperar(numero, rotulo, dados):
    try:
        segundos = float(dados)
    except (TypeError, ValueError):
        return _resultado(numero, rotulo, "erro", "tempo invalido: {}".format(dados))
    segundos = max(0.0, min(segundos, TEMPO_MAXIMO_DE_ESPERA))
    time.sleep(segundos)
    return _resultado(numero, rotulo, "ok", "{:g}s".format(segundos))


def _resultado(numero, rotulo, estado, detalhe):
    return {"passo": numero, "sistema": rotulo, "estado": estado, "detalhe": detalhe}
