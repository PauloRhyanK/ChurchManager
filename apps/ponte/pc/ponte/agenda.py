"""Os horarios do culto: quando cada momento devia comecar, quanto falta do
atual, e o atraso em relacao ao combinado.

FUNCAO PURA, de proposito: recebe a hora do culto, os minutos de cada momento
e a hora em que o operador entrou em cada um, e devolve o que a tela mostra.
Nao le arquivo, nao olha o relogio do sistema (a hora vem de fora) e nao sabe
de onde os minutos vieram. Hoje eles vem do config.yaml; quando o modulo
Cultos existir, vem de la, e este arquivo nao muda.
"""

import time

# Os mesmos minutos do "Culto padrao" do modulo Cultos, pelos ids do
# config.exemplo.yaml. Servem para a tela nao nascer sem horarios; o
# `minutos:` escrito na cue vale mais. (minutos, acontece antes do inicio?)
PADRAO = {
    "pre_culto": (15, True),
    "abertura": (5, False),
    "louvor": (17, False),
    "avisos": (5, False),
    "ofertorio": (5, False),
    "pregacao": (40, False),
    "encerrar": (5, False),
}


def minutos_de(cue_id, cue):
    """(minutos ou None, e antes do inicio?) de um momento."""
    cue = cue if isinstance(cue, dict) else {}
    padrao = PADRAO.get(str(cue_id), (None, False))
    minutos = cue.get("minutos", padrao[0])
    try:
        minutos = int(minutos) if minutos is not None else None
    except (TypeError, ValueError):
        minutos = None
    if minutos is not None and not 1 <= minutos <= 600:
        minutos = None
    antes = bool(cue["antes"]) if "antes" in cue else padrao[1]
    return minutos, antes


def _inicio_de_hoje(texto, agora):
    """'19:00' -> o instante de hoje nessa hora. None se o texto nao serve."""
    try:
        hora, minuto = str(texto).strip().split(":")
        hora, minuto = int(hora), int(minuto)
    except (ValueError, AttributeError):
        return None
    if not (0 <= hora <= 23 and 0 <= minuto <= 59):
        return None
    hoje = time.localtime(agora)
    return time.mktime((hoje.tm_year, hoje.tm_mon, hoje.tm_mday, hora, minuto, 0, 0, 0, -1))


def _hhmm(instante):
    return time.strftime("%H:%M", time.localtime(instante))


def _em_minutos(segundos):
    return max(1, int(round(abs(segundos) / 60.0)))


def calcular(inicio, momentos, atual, entradas, agora):
    """O que a coluna da ordem e o topo da tela mostram.

    inicio    "19:00", ou None se ninguem informou a hora do culto
    momentos  [{"id", "minutos", "antes"}], na ordem do culto
    atual     indice do momento em que o culto esta, ou None
    entradas  {id do momento: instante em que o operador entrou nele}
    agora     instante atual (time.time())
    """
    saida = [{"id": m["id"], "hora": None, "minutos": m.get("minutos"), "resta_s": None}
             for m in momentos]
    vazio = {"inicio": None, "momentos": saida, "atraso_s": None, "estado": None, "texto": None}
    # Quanto falta do momento atual nao depende da hora do culto: so de
    # quando o operador entrou nele e de quantos minutos ele tem.
    if atual is not None and 0 <= atual < len(momentos):
        entrada, minutos = entradas.get(momentos[atual]["id"]), momentos[atual].get("minutos")
        if entrada is not None and minutos is not None:
            saida[atual]["resta_s"] = int(round(minutos * 60 - (agora - entrada)))
    comeco = _inicio_de_hoje(inicio, agora) if inicio else None
    if comeco is None:
        return vazio

    # Quando cada momento devia comecar. Os "antes" do comeco da lista contam
    # para tras; depois de um momento sem minutos ninguem mais tem hora.
    planejado = [None] * len(momentos)
    antes = 0
    while antes < len(momentos) and momentos[antes].get("antes"):
        antes += 1
    ponteiro = comeco
    for i in range(antes - 1, -1, -1):
        if momentos[i].get("minutos") is None:
            break
        ponteiro -= momentos[i]["minutos"] * 60
        planejado[i] = ponteiro
    ponteiro = comeco
    for i in range(antes, len(momentos)):
        if ponteiro is None:
            break
        planejado[i] = ponteiro
        minutos = momentos[i].get("minutos")
        ponteiro = ponteiro + minutos * 60 if minutos is not None else None
    for item, quando in zip(saida, planejado):
        item["hora"] = _hhmm(quando) if quando is not None else None

    atraso = None
    estado = None
    if atual is None or not 0 <= atual < len(momentos):
        primeiro = planejado[0] if planejado else None
        if primeiro is not None and agora < primeiro:
            return {"inicio": _hhmm(comeco), "momentos": saida, "atraso_s": None,
                    "estado": "antes",
                    "texto": "Começa em {} min".format(_em_minutos(primeiro - agora))}
        if primeiro is not None:
            atraso = agora - primeiro
    else:
        momento = momentos[atual]
        entrada = entradas.get(momento["id"])
        minutos = momento.get("minutos")
        if planejado[atual] is not None:
            if entrada is not None:
                atraso = entrada - planejado[atual]
            if minutos is not None:
                # O momento ja devia ter acabado: o atraso cresce com o relogio.
                passou = agora - (planejado[atual] + minutos * 60)
                if passou > 0:
                    atraso = passou if atraso is None else max(atraso, passou)

    texto = None
    if atraso is not None:
        atraso = int(round(atraso))
        if abs(atraso) < 60:
            estado, texto = "no_horario", "No horário"
        elif atraso > 0:
            estado, texto = "atrasado", "{} min atrasado".format(_em_minutos(atraso))
        else:
            estado, texto = "adiantado", "{} min adiantado".format(_em_minutos(atraso))
    return {"inicio": _hhmm(comeco), "momentos": saida, "atraso_s": atraso,
            "estado": estado, "texto": texto}
