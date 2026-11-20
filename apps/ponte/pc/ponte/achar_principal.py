"""Achar o PC principal quando o endereco dele muda.

O QUE ACONTECIA (19/11/2026, numa quinta, antes do culto). O PC do som
parou de alcancar o PC do Holyrics: "sem contato", e a luz parada no ultimo
quadro, porque e por esse caminho que o PC do som busca o que acender. O
roteador da igreja troca os enderecos de vez em quando, e o endereco do
principal estava escrito a mao no maquina.yaml e no config.yaml do PC do som.

COMO FICA:
  - o PRINCIPAL conta para a versao web, junto com o retrato do culto,
    em que enderecos da rede da igreja ele atende (`enderecos_locais`);
  - uma SECUNDARIA confere o principal a cada 20 segundos. Se ele nao
    responde duas vezes seguidas, pergunta a versao web onde ele esta,
    testa cada endereco, e troca para o que responder dizendo que e o
    principal. Grava o endereco novo no maquina.yaml e no config.yaml, para
    o proximo boot ja nascer certo.

A web so conta o endereco para quem chega da MESMA internet que a igreja
(ver /api/principal em web/app.py): de fora, nao ha o que perguntar.

O QUE ISTO NAO RESOLVE: o firewall do Windows bloqueando a porta no
principal. Ai o endereco e achado, mas nao responde, e a pagina do PC diz
isso com todas as letras, em vez de so "sem contato".
"""

import ipaddress
import json
import re
import socket
import threading
import time
import urllib.request

PASSO = 20.0          # de quanto em quanto tempo confere o principal
FALHAS_PARA_PROCURAR = 2
ENTRE_PROCURAS = 30.0


def _privado(ip):
    try:
        endereco = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return endereco.version == 4 and endereco.is_private and not endereco.is_loopback \
        and not endereco.is_link_local


def enderecos_locais(porta):
    """Os enderecos desta maquina na rede da igreja, o mais provavel primeiro."""
    achados = []
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # UDP nao conecta de verdade: so faz o sistema escolher a interface de
        # saida, que e a da rede local.
        sock.connect(("8.8.8.8", 80))
        achados.append(sock.getsockname()[0])
    except OSError:
        pass
    finally:
        sock.close()
    try:
        for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            achados.append(item[4][0])
    except OSError:
        pass
    vistos, lista = set(), []
    for ip in achados:
        if _privado(ip) and ip not in vistos:
            vistos.add(ip)
            lista.append("http://{}:{}".format(ip, int(porta)))
    return lista[:6]


_ENDERECO_OK = re.compile(r"^http://(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})$")


def endereco_valido(url):
    """So http://<IP privado>:<porta>. E o que a web aceita e repassa."""
    achado = _ENDERECO_OK.match(str(url or ""))
    return bool(achado) and _privado(achado.group(1)) and 1 <= int(achado.group(2)) <= 65535


# -- gravar o endereco novo nos arquivos desta maquina -------------------------

def com_principal(texto, url):
    """O maquina.yaml com `principal:` apontando para `url`."""
    linha = "principal: " + url
    novo, quantas = re.subn(r"(?m)^principal:[^\r\n]*", linha, texto)
    if quantas:
        return novo
    fim = "\r\n" if "\r\n" in texto else "\n"
    return texto + ("" if not texto or texto.endswith(("\n", "\r")) else fim) + linha + fim


def com_url_do_seguidor(texto, url):
    """O config.yaml com a `url` do bloco `seguidor` trocada. Se o bloco nao
    tem `url`, devolve o texto como estava: quem nao segue a luz nao ganha
    uma linha nova."""
    linhas = texto.splitlines(keepends=True)
    dentro = False
    for i, linha in enumerate(linhas):
        if re.match(r"^seguidor:\s*(#.*)?$", linha.rstrip("\r\n")):
            dentro = True
            continue
        if dentro and re.match(r"^[^\s#]", linha):
            break
        if dentro and re.match(r"^  url:", linha):
            final = "\r\n" if linha.endswith("\r\n") else "\n" if linha.endswith("\n") else ""
            linhas[i] = "  url: " + url + final
            return "".join(linhas)
    return texto


# -- a procura ---------------------------------------------------------------

def _pedir_json(url, timeout):
    pedido = urllib.request.Request(url, headers={"User-Agent": "ponte-do-culto"})
    with urllib.request.urlopen(pedido, timeout=timeout) as resposta:
        return json.loads(resposta.read().decode("utf-8"))


class Procurador:
    def __init__(self, atual, trocar, web, pedir_json=_pedir_json, relogio=time.time,
                 dormir=time.sleep, registrar=print):
        """
        atual()      -> o endereco do principal que esta valendo agora
        trocar(url)  -> passa a usar `url` (e grava nos arquivos)
        web()        -> o endereco da versao web
        """
        self._atual = atual
        self._trocar = trocar
        self._web = web
        self._pedir = pedir_json
        self._agora = relogio
        self._dormir = dormir
        self._registrar = registrar
        self._falhas = 0
        self._ultima_procura = None
        self._estado = {"estado": "ok", "achados": [], "trocou_para": None, "em": None}

    def retrato(self):
        return dict(self._estado)

    def comecar(self):
        threading.Thread(target=self._laco, daemon=True).start()

    def _laco(self):
        while True:
            try:
                self.olhar()
            except Exception as erro:
                self._registrar("  [principal] a procura tropecou: {}".format(str(erro)[:160]))
            self._dormir(PASSO)

    def _responde(self, url):
        """O endereco atende e diz que e o principal?"""
        try:
            corpo = self._pedir(url.rstrip("/") + "/api/aqui", 3.0)
        except Exception:
            return False
        return isinstance(corpo, dict) and corpo.get("papel") == "holyrics" \
            and corpo.get("e_principal") is not False

    def olhar(self):
        atual = self._atual()
        if atual and self._responde(atual):
            self._falhas = 0
            if self._estado["estado"] != "ok":
                self._estado = dict(self._estado, estado="ok", em=self._agora())
            return
        self._falhas += 1
        if self._falhas < FALHAS_PARA_PROCURAR:
            return
        agora = self._agora()
        if self._ultima_procura is not None and agora - self._ultima_procura < ENTRE_PROCURAS:
            return
        self._ultima_procura = agora
        try:
            corpo = self._pedir(str(self._web()).rstrip("/") + "/api/principal", 6.0)
            achados = [u for u in (corpo.get("enderecos") or []) if endereco_valido(u)]
        except Exception:
            self._estado = {"estado": "sem_web", "achados": [], "trocou_para": None, "em": agora}
            return
        if not achados:
            self._estado = {"estado": "nao_sei", "achados": [], "trocou_para": None, "em": agora}
            return
        for url in achados:
            if url != atual and self._responde(url):
                self._trocar(url)
                self._falhas = 0
                self._registrar("  [principal] o PC do Holyrics mudou de endereco: agora {}".format(url))
                self._estado = {"estado": "ok", "achados": achados, "trocou_para": url, "em": agora}
                return
        # O principal esta ligado (a web o ve), no endereco que a web conhece,
        # e mesmo assim nao responde daqui: e o firewall dele, ou outra rede.
        self._estado = {"estado": "nao_responde", "achados": achados, "trocou_para": None, "em": agora}

    def explicar(self):
        """Uma frase para a pagina deste PC, ou None se nao ha o que dizer."""
        e = self._estado
        if e["estado"] == "nao_responde":
            ips = ", ".join(u.replace("http://", "") for u in e["achados"])
            return ("O PC do Holyrics está ligado, no endereço {}, mas não responde a este PC. "
                    "O mais provável é o firewall do Windows nele bloqueando a porta da ponte."
                    .format(ips))
        if e["estado"] == "nao_sei":
            return "A versão web também não sabe o endereço do PC do Holyrics. Ele está ligado?"
        if e["estado"] == "sem_web":
            return "Não consegui perguntar à versão web onde o PC do Holyrics está. Este PC tem internet?"
        return None
