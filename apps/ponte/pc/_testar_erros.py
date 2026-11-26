"""Testes do envio de erros ao GlitchTip. Nada sai da maquina:

    python _testar_erros.py

Sem o sentry-sdk instalado, roda so a parte que nao depende dele.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte import erros

FALHAS = []
DSN = "https://chave@erros.exemplo.test/5"


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


print("\nQual DSN vale")
conferir("sem nada: nenhum", erros.qual_dsn({}, {}) == "")
conferir("so espacos: nenhum", erros.qual_dsn({"SENTRY_DSN": "  "}, {"erros": {"dsn": " "}}) == "")
conferir("do config.yaml", erros.qual_dsn({}, {"erros": {"dsn": " " + DSN + " "}}) == DSN)
conferir("a variavel ganha do config", erros.qual_dsn({"SENTRY_DSN": DSN}, {"erros": {"dsn": "outro"}}) == DSN)
conferir("config sem secao erros", erros.qual_dsn({}, {"erros": None}) == "")

print("\nSem DSN nao liga nada")
conferir("opcoes sem DSN: None", erros.opcoes("", "pc", "v1") is None)
conferir("ligar sem DSN: False", erros.ligar("", "pc", "v1") is False)

print("\nOpcoes com DSN")
op = erros.opcoes(DSN, "web", "abc")
conferir("dsn", op["dsn"] == DSN)
conferir("ambiente e release", op["environment"] == "web" and op["release"] == "abc")
conferir("sem PII", op["send_default_pii"] is False)
conferir("sem corpo do pedido", op["max_request_body_size"] == "never")
conferir("sem variaveis locais", op["include_local_variables"] is False)
conferir("sem tracing", op["traces_sample_rate"] is None)
conferir("sem sessoes", op["auto_session_tracking"] is False)
conferir("release vazio fica de fora", erros.opcoes(DSN, "pc", "")["release"] is None)

print("\nTexto mascarado")
sujo = ("falhou para maria.silva@exemplo.com.br, fone (27) 99876-5432 / +55 27 998765432, "
        "cpf 123.456.789-09, auth Bearer eyJhbGciOi.abc.def")
limpo = erros.limpar_texto(sujo)
for pedaco in ("maria", "exemplo.com", "99876", "998765432", "123.456", "eyJhbGciOi"):
    conferir("some: " + pedaco, pedaco not in limpo, limpo)
conferir("marcas no lugar", all(m in limpo for m in ("[email]", "[telefone]", "[cpf]", "Bearer [token]")), limpo)
inocente = "cue 42 em 2026-11-25 10:30, id 3f2b6c1e-9a7d-4b1e-8c2f-1a2b3c4d5e6f, porta 8700"
conferir("numeros curtos, datas e ids ficam", erros.limpar_texto(inocente) == inocente)

print("\nEvento limpo")
evento = {
    "message": "contato joao@x.com",
    "request": {
        "url": "https://ponte.exemplo.test/api/estado?chave=segredo",
        "method": "POST",
        "data": {"email": "joao@x.com"},
        "cookies": {"session": "segredo"},
        "headers": {"Authorization": "Bearer abc", "X-Ponte-Chave": "segredo"},
        "query_string": "chave=segredo",
        "env": {"REMOTE_ADDR": "1.2.3.4"},
    },
    "user": {"ip_address": "1.2.3.4"},
    "exception": {"values": [{"type": "ValueError", "value": "sem e-mail joao@x.com"}]},
    "extra": {"senha": "segredo", "lista": [{"texto": "ana@y.org"}]},
    "breadcrumbs": {"values": [{"message": "ligou para (27) 99999-8888"}]},
}
saida = erros.limpar_evento(evento, {})
texto = json.dumps(saida)
conferir("sem usuario", "user" not in saida)
conferir("pedido so com metodo e url sem query",
         saida["request"] == {"method": "POST", "url": "https://ponte.exemplo.test/api/estado"}, saida["request"])
for pedaco in ("joao@x.com", "ana@y.org", "99999-8888", "segredo", "1.2.3.4", "Bearer abc"):
    conferir("evento sem: " + pedaco, pedaco not in texto)
conferir("excecao mascarada", saida["exception"]["values"][0]["value"] == "sem e-mail [email]")

rastro = erros.limpar_rastro(
    {"category": "httplib", "data": {"url": "https://api.test/x?to=joao@x.com", "status_code": 500}}, {})
conferir("rastro sem query", rastro["data"]["url"] == "https://api.test/x", rastro)
conferir("rastro mantem o resto", rastro["data"]["status_code"] == 500)

try:
    import sentry_sdk
except ImportError:
    sentry_sdk = None

if sentry_sdk is None:
    print("\n(sentry-sdk nao instalado: pulando o teste com Flask)")
else:
    print("\nFlask de verdade: erro 500 vai limpo, 404 nao vai")
    from flask import Flask, abort

    enviados = []

    class Transporte(sentry_sdk.transport.Transport):
        def capture_envelope(self, envelope):
            for item in envelope.items:
                if item.type == "event":
                    enviados.append(item.payload.json)

    conferir("ligar com DSN: True", erros.ligar(DSN, "teste", "v1", transporte=Transporte))

    app = Flask(__name__)

    @app.route("/boom", methods=["POST"])
    def boom():
        raise RuntimeError("falhou para joao@x.com tel (27) 99999-8888")

    @app.route("/nada")
    def nada():
        abort(404)

    cliente = app.test_client()
    r = cliente.post("/boom?chave=segredo", json={"email": "joao@x.com"},
                     headers={"Authorization": "Bearer segredo", "Cookie": "session=segredo"})
    conferir("respondeu 500", r.status_code == 500)
    conferir("404 respondeu", cliente.get("/nada").status_code == 404)
    sentry_sdk.flush(2)
    conferir("um evento so", len(enviados) == 1, len(enviados))
    if enviados:
        ev = enviados[0]
        texto = json.dumps(ev)
        conferir("release", ev.get("release") == "v1")
        conferir("sem usuario", "user" not in ev)
        conferir("sem segredo, e-mail, telefone", not any(
            p in texto for p in ("segredo", "joao@x.com", "99999-8888")), texto[:300])
        conferir("mensagem mascarada", "falhou para [email] tel [telefone]" in texto)
    sentry_sdk.init()  # desliga

print("\n{} falha(s)".format(len(FALHAS)) if FALHAS else "\nTudo certo.")
sys.exit(1 if FALHAS else 0)
