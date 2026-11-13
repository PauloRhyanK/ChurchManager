"""Cliente da API local do Holyrics.

O Holyrics expoe um servidor HTTP na propria maquina
(Arquivo > Configuracoes > API Server). O cliente aqui e generico de proposito:
o config.yaml diz a acao e o payload, entao da pra usar qualquer acao da versao
instalada sem mexer em codigo.

Os nomes de acao mudam entre versoes do Holyrics. Por isso a ponte ja nasce com
holyrics.ativo = false e uma acao_de_teste configuravel: confirme no
diagnostico do painel antes de amarrar cues a ele.
"""

import requests


class ErroHolyrics(Exception):
    """Falha de conexao ou recusa do Holyrics."""


def _host_para_url(host):
    """Endereco IPv6 precisa de colchetes dentro de uma URL.

    http://2804:31fc::1:8091 e ambiguo; o certo e http://[2804:31fc::1]:8091.
    Nome de maquina e IPv4 passam intactos.
    """
    texto = str(host).strip()
    if ":" in texto and not texto.startswith("["):
        return "[{}]".format(texto)
    return texto


class ClienteHolyrics:
    def __init__(self, host, porta, token, timeout=4.0):
        self._base = "http://{}:{}/api".format(_host_para_url(host), porta)
        self._token = token or ""
        self._timeout = timeout

    def _sem_segredo(self, texto):
        """Tira o token de qualquer texto que va virar mensagem de erro.

        MEDIDO em 08/11, e e um vazamento de verdade: o requests poe a URL
        INTEIRA dentro da excecao, e a URL leva ?token=... na query string.
        Essa mensagem ia parar na pilula de status do painel — que nao tem
        senha, e naquele dia a rede da igreja tinha quase cem aparelhos
        porque o wi-fi dos membros e o mesmo segmento da producao.

        Ou seja: bastava o Holyrics estar fechado para o painel publicar a
        credencial para a igreja inteira. Um erro de conexao nao pode fazer
        isso. Fica aqui, na saida do cliente, para valer em todo caminho.
        """
        texto = str(texto)
        if self._token:
            texto = texto.replace(self._token, "***")
        return texto

    def pedir(self, acao, payload=None):
        url = "{}/{}".format(self._base, acao)
        try:
            resposta = requests.post(
                url,
                params={"token": self._token},
                json=payload or {},
                timeout=self._timeout,
            )
        except requests.Timeout:
            raise ErroHolyrics(
                "o Holyrics nao respondeu a tempo em {} — programa fechado, "
                "API Server desligado ou porta errada".format(self._base)
            )
        except requests.RequestException as erro:
            raise ErroHolyrics(
                "sem conexao com o Holyrics em {} ({})".format(
                    self._base, self._sem_segredo(erro)
                )
            )

        if resposta.status_code == 401:
            raise ErroHolyrics("o Holyrics recusou o token do config.yaml")
        if resposta.status_code == 404:
            raise ErroHolyrics(
                "a acao '{}' nao existe nesta versao do Holyrics".format(acao)
            )
        if resposta.status_code != 200:
            raise ErroHolyrics(
                "o Holyrics respondeu HTTP {} em {}".format(resposta.status_code, acao)
            )

        try:
            corpo = resposta.json()
        except ValueError:
            # Algumas acoes respondem texto puro; isso nao e erro.
            return {"texto": resposta.text}

        if isinstance(corpo, dict):
            estado = corpo.get("status")
            if estado is not None and estado != "ok":
                raise ErroHolyrics(self._sem_segredo(
                    corpo.get("error") or "o Holyrics recusou a acao {}".format(acao)
                ))
        return corpo
