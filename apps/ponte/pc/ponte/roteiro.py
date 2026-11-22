"""O roteiro do culto: momentos e musicas na ordem em que acontecem.

Ate aqui a Ponte tinha duas listas separadas: a ordem do culto (momentos, do
config.yaml) e as musicas do dia. O roteiro junta as duas numa fila so, com as
musicas INTERCALADAS nos momentos: Abertura, musica, musica, Oracao, musica,
Avisos...

De onde vem:
  cultos  o campo `roteiro` da resposta do ChurchManager (lista ordenada de
          {ordem, tipo: "momento" | "musica", id, nome, inicio, duracaoMin,
          momento?, musica?}). Quando ele vem, a Ponte segue ESTA ordem.
  local   sem esse campo, a fila e montada aqui: os momentos da ordem do culto
          e, depois do momento do louvor, as musicas do dia. E o que deixa o
          celular do musico funcionar sem o ChurchManager; o painel do
          operador continua mostrando a ordem do culto de sempre.

Este arquivo so guarda a fila e onde o culto esta nela. Quem EXECUTA a entrada
num item (trocar camera e luz, por a musica no telao, soltar o VS) e o
painel_ao_vivo.py.
"""

import threading
import time
import unicodedata


def _limpo(texto):
    texto = "".join(c for c in unicodedata.normalize("NFD", str(texto or ""))
                    if unicodedata.category(c) != "Mn")
    return "".join(c for c in texto.lower() if c.isalnum())


def _numero(valor):
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return None
    return numero if numero >= 0 and numero == numero else None


def _hora(valor):
    """'19:05', '19:05:00' ou uma data ISO -> 'HH:MM'. None se nao der."""
    texto = str(valor or "").strip()
    if not texto:
        return None
    if "T" in texto:
        # Data completa: vale a hora DAQUI, nao a do fuso em que foi escrita.
        try:
            from datetime import datetime
            quando = datetime.fromisoformat(texto.replace("Z", "+00:00"))
            if quando.tzinfo is not None:
                quando = quando.astimezone()
            return quando.strftime("%H:%M")
        except ValueError:
            return None
    partes = texto.split(":")
    try:
        hora, minuto = int(partes[0]), int(partes[1])
    except (ValueError, IndexError):
        return None
    return "{:02d}:{:02d}".format(hora, minuto) if 0 <= hora <= 23 and 0 <= minuto <= 59 else None


def normalizar(bruto):
    """O `roteiro` do ChurchManager -> a fila da ponte. None se nao veio."""
    if not isinstance(bruto, list) or not bruto:
        return None
    itens = []
    cruos = [i for i in bruto if isinstance(i, dict)]
    cruos.sort(key=lambda i: _numero(i.get("ordem")) if _numero(i.get("ordem")) is not None else 1e9)
    for cru in cruos:
        tipo = "musica" if str(cru.get("tipo") or "") == "musica" else "momento"
        musica = cru.get("musica") if isinstance(cru.get("musica"), dict) else None
        if tipo == "musica" and musica is None:
            continue
        duracao = _numero(cru.get("duracaoMin"))
        item = {
            "tipo": tipo,
            "id": str(cru.get("id") or (musica or {}).get("id") or len(itens)),
            "nome": str(cru.get("nome") or (musica or {}).get("titulo") or "").strip() or "Momento",
            "inicio": _hora(cru.get("inicio")),
            "duracao_min": int(duracao) if duracao else None,
            "momento": str(cru.get("momento") or "") or None,
            "cue": None,
            "musica": None,
        }
        if musica is not None:
            partes = []
            for parte in musica.get("partes") or []:
                if isinstance(parte, dict):
                    partes.append({"nome": str(parte.get("nome") or "parte"),
                                   "inicio": _numero(parte.get("inicioSeg")),
                                   "fim": _numero(parte.get("fimSeg"))})
            item["musica"] = {
                "id": str(musica.get("id") or item["id"]),
                "titulo": str(musica.get("titulo") or item["nome"]),
                "tom": str(musica.get("tom") or "") or None,
                "bpm": _numero(musica.get("bpm")),
                "clima": str(musica.get("clima") or "") or None,
                "holyrics_id": str(musica["holyricsId"]) if musica.get("holyricsId") else None,
                "audio_url": musica.get("audioUrl") or None,
                "partes": partes,
            }
            item["nome"] = item["musica"]["titulo"]
        itens.append(item)
    return itens or None


def do_local(momentos, musicas, momentos_do_louvor, minutos_de=None):
    """A fila montada aqui: os momentos da ordem e, depois do primeiro momento
    de louvor, as musicas do dia."""
    itens, postas = [], False
    for momento in momentos or []:
        minutos = minutos_de(momento["id"]) if minutos_de else None
        itens.append({"tipo": "momento", "id": "m:" + str(momento["id"]), "nome": str(momento.get("nome") or momento["id"]),
                      "inicio": None, "duracao_min": minutos, "momento": None, "cue": str(momento["id"]), "musica": None})
        if not postas and str(momento["id"]) in (momentos_do_louvor or []):
            postas = True
            for musica in musicas or []:
                itens.append({"tipo": "musica", "id": str(musica["id"]), "nome": musica["titulo"], "inicio": None,
                              "duracao_min": None, "momento": None, "cue": None,
                              "musica": {"id": str(musica["id"]), "titulo": musica["titulo"],
                                         "tom": musica.get("tom"), "bpm": musica.get("bpm"), "clima": None,
                                         "holyrics_id": musica.get("holyrics_id"), "audio_url": None, "partes": []}})
    return itens


def e_da_palavra(item):
    """Um item do roteiro que e a pregacao: pelo tipo que o ChurchManager
    manda (`sermon`) ou, sem ele, pelo nome."""
    if not item or item.get("tipo") != "momento":
        return False
    if _limpo(item.get("momento")) in ("sermon", "palavra", "pregacao"):
        return True
    nome = _limpo(item.get("nome"))
    return any(p in nome for p in ("palavra", "prega", "sermao", "mensagem"))


def achar_cue(item, cues, mapa=None, da_palavra=None, do_louvor=None):
    """Que momento do config.yaml (cue) corresponde a este item do roteiro?

    Um momento do ChurchManager tem nome ("Oração", "Avisos"); os da Ponte tem
    id (`oracao`, `avisos`) e sao eles que trocam camera e luz. Casa pelo que
    estiver escrito em `roteiro.momentos` do config; senao, pelo nome ou pelo
    tipo. Sem par, o item existe no roteiro mas nao aciona nada.
    """
    if item.get("cue"):
        return item["cue"] if item["cue"] in cues else None
    mapa = mapa or {}
    for chave in (item.get("nome"), item.get("momento"), item.get("id")):
        if chave and str(chave) in mapa and str(mapa[str(chave)]) in cues:
            return str(mapa[str(chave)])
    tipo = _limpo(item.get("momento"))
    if tipo in ("sermon", "palavra") and da_palavra:
        for cue in da_palavra:
            if cue in cues:
                return cue
    if tipo in ("worship", "louvor") and do_louvor:
        for cue in do_louvor:
            if cue in cues:
                return cue
    alvo = _limpo(item.get("nome"))
    for cue_id, cue in cues.items():
        if alvo and alvo in (_limpo(cue_id), _limpo((cue or {}).get("nome"))):
            return cue_id
    return None


class Roteiro:
    def __init__(self, agora=time.time):
        self._agora = agora
        self._tranca = threading.RLock()
        self._itens = []
        self._origem = None
        self._assinatura = None
        self._atual = None
        self._entradas = {}      # indice -> instante em que o culto entrou nele

    def carregar(self, itens, origem, assinatura):
        """Troca a fila. O lugar e mantido se o item atual continua nela."""
        with self._tranca:
            if assinatura == self._assinatura:
                return False
            antigo = self._itens[self._atual] if self._atual is not None and self._atual < len(self._itens) else None
            self._itens, self._origem, self._assinatura = list(itens or []), origem, assinatura
            self._entradas = {}
            self._atual = None
            if antigo is not None:
                for indice, item in enumerate(self._itens):
                    if item["tipo"] == antigo["tipo"] and item["id"] == antigo["id"]:
                        self._atual = indice
                        self._entradas[indice] = self._agora()
                        break
            return True

    @property
    def origem(self):
        return self._origem

    def itens(self):
        with self._tranca:
            return list(self._itens)

    def atual(self):
        with self._tranca:
            return self._atual

    def item(self, indice=None):
        with self._tranca:
            indice = self._atual if indice is None else indice
            if indice is None or not 0 <= indice < len(self._itens):
                return None
            return self._itens[indice]

    def ir(self, indice):
        """Move o ponteiro. Devolve o item, ou None se o indice nao existe."""
        with self._tranca:
            if not isinstance(indice, int) or not 0 <= indice < len(self._itens):
                return None
            if indice != self._atual:
                self._atual = indice
                self._entradas[indice] = self._agora()
            return self._itens[indice]

    def achar(self, tipo, valor, a_partir=None):
        """O indice do item desta musica (pelo id) ou deste momento (pela cue).
        Prefere o primeiro do ponteiro para a frente."""
        with self._tranca:
            campo = "id" if tipo == "musica" else "cue"
            achados = [i for i, item in enumerate(self._itens) if item["tipo"] == tipo and item.get(campo) == valor]
            if not achados:
                return None
            comeco = self._atual if a_partir is None else a_partir
            adiante = [i for i in achados if comeco is None or i >= comeco]
            return adiante[0] if adiante else achados[0]

    def vizinho(self, passo, so_musica=False):
        """O indice do proximo (+1) ou do anterior (-1). None se nao ha."""
        with self._tranca:
            indice = (self._atual if self._atual is not None else -1) + passo
            while 0 <= indice < len(self._itens):
                if not so_musica or self._itens[indice]["tipo"] == "musica":
                    return indice
                indice += passo
            return None

    def entrada(self, indice=None):
        with self._tranca:
            return self._entradas.get(self._atual if indice is None else indice)

    def retrato(self):
        """O que o painel do operador mostra na coluna da ordem."""
        with self._tranca:
            agora = self._agora()
            itens = []
            for indice, item in enumerate(self._itens):
                resta = None
                if indice == self._atual and item["duracao_min"] and indice in self._entradas:
                    resta = int(round(item["duracao_min"] * 60 - (agora - self._entradas[indice])))
                itens.append({"indice": indice, "tipo": item["tipo"], "id": item["id"], "nome": item["nome"],
                              "hora": item["inicio"], "minutos": item["duracao_min"], "resta_s": resta,
                              "tom": (item["musica"] or {}).get("tom")})
            atraso, estado, texto = None, None, None
            atual = self._itens[self._atual] if self._atual is not None else None
            if atual is not None and atual["inicio"] and self._atual in self._entradas:
                hoje = time.localtime(agora)
                hora, minuto = (int(p) for p in atual["inicio"].split(":"))
                planejado = time.mktime((hoje.tm_year, hoje.tm_mon, hoje.tm_mday, hora, minuto, 0, 0, 0, -1))
                atraso = int(round(self._entradas[self._atual] - planejado))
                if atual["duracao_min"]:
                    atraso = max(atraso, int(round(agora - (planejado + atual["duracao_min"] * 60))))
                minutos = max(1, int(round(abs(atraso) / 60.0)))
                if abs(atraso) < 60:
                    estado, texto = "no_horario", "No horário"
                elif atraso > 0:
                    estado, texto = "atrasado", "{} min atrasado".format(minutos)
                else:
                    estado, texto = "adiantado", "{} min adiantado".format(minutos)
            return {"origem": self._origem, "atual": self._atual, "itens": itens,
                    "atraso_s": atraso, "estado": estado, "texto": texto}
