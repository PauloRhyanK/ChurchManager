"""As musicas do dia, num formato so, venham de onde vierem.

ESTA E A FRONTEIRA. O condutor e a tela so conhecem o formato abaixo, que e o
do contrato do modulo Cultos com os nomes da ponte:

    musica  { id, titulo, pronta, holyrics_id, audio, duracao, total_slides,
              partes[], slides[] }
    parte   { nome, tipo, clima, luz {cena, modo}, tempo, primeiro_slide, quantos }
    slide   { indice, parte, tempo, tempo_estimado, linhas[], instrucoes[] }

`slides` e a SEQUENCIA que o telao percorre, nao a lista do Holyrics: um
refrao que volta aparece duas vezes, cada vez com o seu tempo. `indice` e o
numero do slide no Holyrics, que e o que se manda para ele.

Hoje quem entrega e a FonteLocal (config.yaml + _marcas_louvor.json + o texto
dos slides lido do Holyrics). Quando o modulo Cultos existir, entra uma
FonteCultos com os mesmos tres metodos, e nada do resto muda.
"""

import hashlib
import json
import time
import unicodedata

CLIMAS = ("contemplativo", "adoracao", "crescendo", "celebracao", "explosao")
NOMES = {
    "contemplativo": "Contemplativo",
    "adoracao": "Adoração",
    "crescendo": "Crescendo",
    "celebracao": "Celebração",
    "explosao": "Explosão",
}
# O que cada clima acende quando o config.yaml nao diz. As chaves sao fixas (as
# mesmas do modulo Cultos); o que elas querem dizer em luz e desta igreja.
CLIMAS_PADRAO = {
    "contemplativo": {"cena": "oracao", "modo": "respiro"},
    "adoracao": {"cena": "louvor", "modo": "lento"},
    "crescendo": {"cena": "louvor", "modo": "onda"},
    "celebracao": {"cena": "celebracao", "modo": "animado"},
    "explosao": {"cena": "celebracao", "modo": "batida"},
}
MARCADOR = "//"
SEGUNDOS_POR_SLIDE_SEM_FIM = 4.0


def tabela_de_climas(config, cenas, modos):
    """Os cinco climas, com o que cada um acende e se este PC consegue.

    `cenas` sao as cenas de luz que existem; `modos` os movimentos que o
    painel pode ligar (sem os perigosos). 'parado' sempre vale.
    """
    escritos = (config or {}).get("climas") or {}
    cenas = {str(c) for c in cenas or []}
    modos = {str(m) for m in modos or []} | {"parado"}
    tabela = []
    for chave in CLIMAS:
        dados = escritos.get(chave) if isinstance(escritos.get(chave), dict) else None
        dados = dados or CLIMAS_PADRAO[chave]
        cena = str(dados.get("cena") or "")
        modo = str(dados.get("modo") or "parado")
        tabela.append({"id": chave, "nome": NOMES[chave], "cena": cena, "modo": modo,
                       "disponivel": cena in cenas and modo in modos})
    return tabela


def clima_de(cena, modo, tabela):
    """Que clima tem esta cena e este movimento? None se nenhum."""
    for item in tabela or []:
        if item["cena"] == str(cena or "") and item["modo"] == str(modo or "parado"):
            return item["id"]
    return None


def _sem_acento(texto):
    return "".join(c for c in unicodedata.normalize("NFD", str(texto)) if unicodedata.category(c) != "Mn")


def tipo_da_parte(nome):
    n = _sem_acento(nome or "").lower().strip()
    if n.startswith("pre"):
        return "pre_refrao"
    if "refr" in n or n.startswith("coro"):
        return "refrao"
    if n.startswith("intro") or n.startswith("inicio"):
        return "intro"
    if n.startswith("verso") or n.startswith("estrofe"):
        return "verso"
    if n.startswith("ponte"):
        return "ponte"
    if n.startswith("instrumental") or n.startswith("solo") or n.startswith("interl"):
        return "instrumental"
    if n.startswith("final") or n.startswith("fim") or n.startswith("encerr"):
        return "final"
    return "outra"


def _texto_do_slide(slide):
    """(linhas do telao, instrucoes da banda) de um slide do Holyrics."""
    linhas, instrucoes = [], []
    texto = (slide or {}).get("text") if isinstance(slide, dict) else None
    for linha in str(texto or "").split("\n"):
        linha = linha.strip()
        if not linha:
            continue
        if linha.startswith(MARCADOR):
            recado = linha[len(MARCADOR):].strip().rstrip(".").strip()
            if not recado:
                continue
            para, resto = "Banda", recado
            if ":" in recado:
                antes, depois = recado.split(":", 1)
                if 0 < len(antes.strip()) <= 20 and depois.strip():
                    para, resto = antes.strip(), depois.strip()
            instrucoes.append({"para": para, "texto": resto})
        else:
            linhas.append(linha)
    return linhas, instrucoes


def _numero(valor):
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return None
    return numero if numero >= 0 and numero == numero else None


def _inteiro(valor):
    try:
        return max(0, int(valor))
    except (TypeError, ValueError):
        return None


def montar_musica(louvor, marcas, slides, tabela, duracao=None):
    """Junta o que o config, as marcas e o Holyrics sabem de uma musica."""
    louvor = louvor if isinstance(louvor, dict) else {}
    marcas = [m for m in (marcas or []) if isinstance(m, dict)]
    if marcas:
        cruas = sorted(marcas, key=lambda m: _numero(m.get("segundo")) or 0.0)
        tempos = [_numero(m.get("segundo")) for m in cruas]
    else:
        cruas = [s for s in (louvor.get("secoes") or []) if isinstance(s, dict)]
        tempos = [None] * len(cruas)

    primeiros = []
    for crua in cruas:
        indice = _inteiro(crua.get("slide"))
        primeiros.append(indice if indice is not None else (primeiros[-1] if primeiros else 0))
    total = len(slides) if slides else ((max(primeiros) + 1) if primeiros else 0)
    duracao = _numero(duracao)

    partes, sequencia = [], []
    for i, crua in enumerate(cruas):
        primeiro = min(primeiros[i], max(0, total - 1))
        if i + 1 < len(cruas):
            proximo = primeiros[i + 1]
            # Marca com o mesmo slide da anterior, ou voltando (o refrao que
            # repete): a parte fica com um slide, nunca com nenhum.
            quantos = proximo - primeiro if proximo > primeiro else 1
        else:
            quantos = max(1, total - primeiro)
        quantos = max(1, min(quantos, max(1, total - primeiro)))
        tempo = tempos[i]
        fim = None
        if tempo is not None:
            seguintes = [t for t in tempos[i + 1:] if t is not None]
            fim = seguintes[0] if seguintes else (
                duracao if duracao and duracao > tempo else tempo + SEGUNDOS_POR_SLIDE_SEM_FIM * quantos)
        cena = str(crua.get("cena") or "") or None
        modo = str(crua.get("modo") or "") or None
        nome = str(crua.get("nome") or "parte")
        partes.append({
            "nome": nome, "tipo": tipo_da_parte(nome),
            "clima": clima_de(cena, modo, tabela) if cena else None,
            "luz": {"cena": cena, "modo": modo or "parado"} if cena else None,
            "tempo": tempo, "primeiro_slide": len(sequencia), "quantos": quantos,
        })
        for k in range(quantos):
            indice = primeiro + k
            linhas, instrucoes = _texto_do_slide(slides[indice]) if slides and indice < len(slides) else ([], [])
            sequencia.append({
                "indice": indice, "parte": i,
                "tempo": round(tempo + (fim - tempo) * k / quantos, 3) if tempo is not None else None,
                "tempo_estimado": bool(tempo is not None and k > 0),
                "linhas": linhas, "instrucoes": instrucoes,
            })

    pronta = bool(marcas) and bool(partes) and all(p["tempo"] is not None for p in partes)
    if duracao is None and pronta:
        ultima = partes[-1]
        duracao = ultima["tempo"] + SEGUNDOS_POR_SLIDE_SEM_FIM * ultima["quantos"]
    return {
        "id": str(louvor.get("id") or ""),
        "titulo": str(louvor.get("nome") or louvor.get("id") or ""),
        "pronta": pronta,
        "holyrics_id": str(louvor["holyrics_id"]) if louvor.get("holyrics_id") else None,
        "audio": str(louvor["audio"]) if louvor.get("audio") else None,
        "duracao": duracao,
        "total_slides": total,
        "tem_letra": bool(slides),
        "partes": partes,
        "slides": sequencia,
    }


class FonteLocal:
    """As musicas que ja moram neste PC."""

    RELER_SEM_LETRA = 60.0

    def __init__(self, config, ler_marcas, ler_slides, tabela, agora=time.monotonic):
        self._config = config or {}
        self._ler_marcas = ler_marcas
        self._ler_slides = ler_slides
        self._tabela = tabela
        self._agora = agora
        self._musicas = None
        self._versao = ""
        self._lido_em = None

    def _do_dia(self):
        louvores = [l for l in (self._config.get("louvores") or [])
                    if isinstance(l, dict) and l.get("id")]
        escolhidos = self._config.get("louvor_do_dia")
        if not escolhidos:
            return louvores
        por_id = {str(l["id"]): l for l in louvores}
        return [por_id[str(i)] for i in escolhidos if str(i) in por_id]

    def recarregar(self):
        self._musicas = None

    def musicas(self):
        sem_letra = self._musicas is not None and any(
            m["holyrics_id"] and not m["tem_letra"] for m in self._musicas)
        if self._musicas is not None and not (
                sem_letra and self._agora() - self._lido_em > self.RELER_SEM_LETRA):
            return self._musicas
        try:
            marcas = self._ler_marcas() or {}
        except Exception:
            marcas = {}
        tabela = self._tabela()
        musicas = []
        for louvor in self._do_dia():
            slides = None
            if louvor.get("holyrics_id"):
                try:
                    slides = self._ler_slides(str(louvor["holyrics_id"])) or None
                except Exception:
                    slides = None
            musicas.append(montar_musica(louvor, marcas.get(str(louvor["id"])), slides, tabela))
        self._musicas = musicas
        self._lido_em = self._agora()
        self._versao = hashlib.sha1(
            json.dumps(musicas, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:12]
        return self._musicas

    def versao(self):
        self.musicas()
        return self._versao
