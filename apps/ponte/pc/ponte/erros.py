"""Envio de erros ao GlitchTip (https://erros.kustertech.com, projeto ponte).

O GlitchTip fala o protocolo do Sentry, entao usamos o sentry-sdk.

Sem DSN nada e ligado: nos testes, no PC de quem desenvolve e em qualquer PC
da igreja sem a chave configurada. Sem o sentry-sdk instalado (pip falhou na
atualizacao, por exemplo) tambem nao: a ponte sobe igual, so nao avisa.

Nada da pessoa sai daqui: corpo do pedido, cookies, cabecalhos, query string,
IP e variaveis locais ficam de fora, e e-mail, telefone, CPF e tokens Bearer
sao mascarados em qualquer texto do evento.

Este arquivo e usado dos dois lados: pelos PCs e pela versao web (que o
carrega da pasta pc/). Por isso so importa o sentry-sdk dentro de ligar().
"""

import re

_CHAVE_SENSIVEL = re.compile(
    r"^(password|senha|token|secret|segredo|chave|authorization|cookie|e-?mail|"
    r"phone|telefone|celular|whatsapp|cpf)$", re.IGNORECASE)

_EMAIL = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}", re.IGNORECASE)
_CPF = re.compile(r"(?<![\w.-])\d{3}\.\d{3}\.\d{3}-\d{2}(?![\w-])")
_TELEFONE = re.compile(
    r"(?<![\w-])(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)?9?\d{4}[\s-]?\d{4}(?![\w-])")
_BEARER = re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE)


def qual_dsn(ambiente, config):
    """A variavel SENTRY_DSN ganha; senao, `erros: dsn:` do config.yaml."""
    dsn = (ambiente.get("SENTRY_DSN") or "").strip()
    if dsn:
        return dsn
    secao = (config or {}).get("erros") or {}
    return str(secao.get("dsn") or "").strip()


def limpar_texto(texto):
    texto = _BEARER.sub("Bearer [token]", texto)
    texto = _EMAIL.sub("[email]", texto)
    texto = _CPF.sub("[cpf]", texto)
    return _TELEFONE.sub("[telefone]", texto)


def _sem_query(url):
    return re.split(r"[?#]", url, maxsplit=1)[0]


def _limpar(valor, fundo=0):
    if isinstance(valor, str):
        return limpar_texto(valor)
    if fundo > 12:
        return valor
    if isinstance(valor, dict):
        return {k: "[filtrado]" if isinstance(k, str) and _CHAVE_SENSIVEL.match(k)
                else _limpar(v, fundo + 1) for k, v in valor.items()}
    if isinstance(valor, (list, tuple)):
        return [_limpar(v, fundo + 1) for v in valor]
    return valor


def limpar_evento(evento, dica=None):
    pedido = evento.get("request")
    saida = _limpar({k: v for k, v in evento.items() if k not in ("request", "user")})
    if pedido:
        limpo = {}
        if pedido.get("method"):
            limpo["method"] = pedido["method"]
        if pedido.get("url"):
            limpo["url"] = limpar_texto(_sem_query(pedido["url"]))
        saida["request"] = limpo
    return saida


def limpar_rastro(rastro, dica=None):
    saida = _limpar(rastro)
    url = (rastro.get("data") or {}).get("url")
    if isinstance(url, str):
        saida["data"]["url"] = limpar_texto(_sem_query(url))
    return saida


def opcoes(dsn, ambiente, release):
    if not dsn:
        return None
    return {
        "dsn": dsn,
        "environment": ambiente,
        "release": release or None,
        "send_default_pii": False,
        "max_request_body_size": "never",
        "include_local_variables": False,
        "max_breadcrumbs": 30,
        # So erros: o GlitchTip nao usa tracing, sessoes nem profiling.
        "traces_sample_rate": None,
        "auto_session_tracking": False,
        "before_send": limpar_evento,
        "before_breadcrumb": limpar_rastro,
    }


def ligar(dsn, ambiente, release, transporte=None):
    """Liga o envio. Devolve True se ligou. Nunca derruba a ponte."""
    op = opcoes(dsn, ambiente, release)
    if op is None:
        return False
    try:
        import sentry_sdk
    except ImportError:
        print("[aviso] erros: sentry-sdk nao instalado; os erros nao vao ao GlitchTip")
        return False
    if transporte is not None:
        op["transport"] = transporte
    try:
        sentry_sdk.init(**op)
    except Exception as erro:  # DSN mal escrito, por exemplo
        print("[aviso] erros: nao consegui ligar o envio ao GlitchTip ({})".format(
            type(erro).__name__))
        return False
    return True
