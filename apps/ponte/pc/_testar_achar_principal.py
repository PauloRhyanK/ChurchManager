"""Testes de achar o PC principal quando o endereco muda. Sem rede:

    python _testar_achar_principal.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte import achar_principal as a

FALHAS = []


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


print("\n1. Enderecos aceitos")
for url, esperado in [("http://192.168.1.50:8700", True), ("http://10.0.0.7:8700", True),
                      ("http://172.20.1.2:8700", True), ("http://127.0.0.1:8700", False),
                      ("http://8.8.8.8:8700", False), ("http://192.168.1.50:8700/x", False),
                      ("https://192.168.1.50:8700", False), ("http://169.254.1.1:8700", False)]:
    conferir(url, a.endereco_valido(url) is esperado)
conferir("enderecos_locais so devolve privados", all(a.endereco_valido(u) for u in a.enderecos_locais(8700)),
         a.enderecos_locais(8700))

print("\n2. Gravar nos arquivos")
m = "# papel\npapel: som\nnome: PC do som\nprincipal: http://192.168.1.143:8700\n"
r = a.com_principal(m, "http://192.168.1.60:8700")
conferir("troca a linha principal", "principal: http://192.168.1.60:8700\n" in r and r.count("principal:") == 1, r)
conferir("o resto fica", r.startswith("# papel\npapel: som\nnome: PC do som\n"))
r = a.com_principal("papel: som\r\nnome: PC do som", "http://192.168.1.60:8700")
conferir("sem a linha: acrescenta, com o fim de linha do arquivo", r == "papel: som\r\nnome: PC do som\r\nprincipal: http://192.168.1.60:8700\r\n", repr(r))
c = "luzes:\n  url: nao-mexer\nseguidor:\n  ativo: true   # liga\n  url: http://192.168.1.143:8700\n  intervalo: 0.25\nweb:\n  url: https://x\n"
r = a.com_url_do_seguidor(c, "http://192.168.1.60:8700")
conferir("troca so a url do seguidor", "  url: http://192.168.1.60:8700\n  intervalo" in r and "  url: nao-mexer" in r and "  url: https://x" in r, r)
conferir("sem bloco seguidor: nao mexe", a.com_url_do_seguidor("web:\n  url: x\n", "http://1") == "web:\n  url: x\n")


class Mundo:
    def __init__(self):
        self.agora = 1000.0
        self.atual = "http://192.168.1.143:8700"
        self.vivos = {"http://192.168.1.60:8700": {"papel": "holyrics", "e_principal": True}}
        self.web = {"enderecos": ["http://192.168.1.60:8700"]}
        self.web_fora = False
        self.trocas = []
        self.perguntas_a_web = 0
        self.p = a.Procurador(atual=lambda: self.atual, trocar=self._trocar, web=lambda: "https://web",
                              pedir_json=self._pedir, relogio=lambda: self.agora,
                              dormir=lambda s: None, registrar=lambda t: None)

    def _trocar(self, url):
        self.trocas.append(url)
        self.atual = url

    def _pedir(self, url, timeout):
        if url == "https://web/api/principal":
            self.perguntas_a_web += 1
            if self.web_fora:
                raise OSError("sem internet")
            return self.web
        base = url[:-len("/api/aqui")]
        if base in self.vivos:
            return self.vivos[base]
        raise OSError("timed out")

    def olhar(self, vezes=1):
        for _ in range(vezes):
            self.p.olhar()
            self.agora += a.PASSO


print("\n3. O principal mudou de endereco")
w = Mundo()
w.olhar()
conferir("uma falha so nao procura", w.perguntas_a_web == 0)
w.olhar()
conferir("duas falhas: pergunta a web e troca", w.trocas == ["http://192.168.1.60:8700"], w.trocas)
conferir("estado ok, com a troca", w.p.retrato()["estado"] == "ok" and w.p.retrato()["trocou_para"] == "http://192.168.1.60:8700")
w.olhar(5)
conferir("depois disso fica quieto", w.perguntas_a_web == 1 and len(w.trocas) == 1)

print("\n4. Principal no ar, sem precisar procurar")
w = Mundo()
w.vivos[w.atual] = {"papel": "holyrics", "e_principal": True}
w.olhar(10)
conferir("nunca pergunta a web", w.perguntas_a_web == 0 and not w.trocas)

print("\n5. Endereco achado, mas nao responde (firewall)")
w = Mundo()
w.vivos = {}
w.olhar(2)
conferir("nao troca", not w.trocas)
conferir("estado nao_responde", w.p.retrato()["estado"] == "nao_responde")
conferir("a explicacao fala do firewall e do endereco", "firewall" in (w.p.explicar() or "") and "192.168.1.60" in w.p.explicar(), w.p.explicar())
w.olhar(1)
conferir("nao pergunta a web de novo antes de 30 s", w.perguntas_a_web == 1, w.perguntas_a_web)
w.olhar(2)
conferir("pergunta de novo depois", w.perguntas_a_web == 2, w.perguntas_a_web)

print("\n6. Quem responde tem que ser o principal")
w = Mundo()
w.vivos = {"http://192.168.1.60:8700": {"papel": "transmissao", "e_principal": False}}
w.olhar(2)
conferir("nao troca para outro PC secundario", not w.trocas)

print("\n7. Sem internet, ou a web sem endereco")
w = Mundo(); w.web_fora = True; w.olhar(2)
conferir("sem_web", w.p.retrato()["estado"] == "sem_web" and "internet" in w.p.explicar())
w = Mundo(); w.web = {"enderecos": ["http://127.0.0.1:8700", "http://8.8.8.8:80"]}; w.olhar(2)
conferir("endereco que nao e da rede local e ignorado", w.p.retrato()["estado"] == "nao_sei" and not w.trocas)
w = Mundo(); w.web = {"erro": "so respondo para quem esta na rede da igreja"}; w.olhar(2)
conferir("web recusou", w.p.retrato()["estado"] == "nao_sei")

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(FALHAS)))
sys.exit(1 if FALHAS else 0)
