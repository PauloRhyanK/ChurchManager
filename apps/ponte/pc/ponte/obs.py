"""Cliente obs-websocket v5.

Fala direto com o OBS pelo protocolo nativo (Ferramentas > Configuracoes do
Servidor WebSocket). Nao usa biblioteca de terceiro pro OBS: assim qualquer
requisicao do protocolo pode ser chamada pelo config.yaml, sem mexer em codigo.

A conexao e preguicosa e se refaz sozinha: se o OBS estiver fechado na hora da
cue, o passo falha com mensagem clara e os outros passos seguem.
"""

import base64
import hashlib
import json
import threading
import uuid

import websocket  # pacote websocket-client


class ErroOBS(Exception):
    """Falha de conexao, de senha ou recusa do proprio OBS.

    `codigo` carrega o numero que o OBS devolveu em requestStatus.code, quando
    houver. Antes esse numero so aparecia dentro do texto da mensagem, o que
    impedia qualquer decisao programatica — e havia uma decisao importante a
    tomar com ele: 500 (OutputRunning) e 501 (OutputNotRunning) nao sao erro,
    sao "ja estava assim".
    """

    def __init__(self, mensagem, codigo=None):
        super().__init__(mensagem)
        self.codigo = codigo


def _host_para_url(host):
    """Endereco IPv6 precisa de colchetes dentro de uma URL.

    ws://2804:31fc::1:4455 e ambiguo — nao da pra saber onde acaba o endereco
    e comeca a porta. A forma correta e ws://[2804:31fc::1]:4455. Nome de
    maquina e IPv4 passam intactos.

    Isso apareceu quando o IPv4 da igreja quebrou e o unico caminho ate o OBS
    passou a ser IPv6.
    """
    texto = str(host).strip()
    if ":" in texto and not texto.startswith("["):
        return "[{}]".format(texto)
    return texto


def _traduzir_falha(erro):
    """Transforma erro de socket em frase que diz o que fazer.

    Quem le isso as 9h de domingo nao quer "WinError 10061"; quer saber se
    abre o OBS, se corrige o IP ou se mexe no firewall.
    """
    texto = str(erro)
    if isinstance(erro, ConnectionRefusedError) or "10061" in texto:
        return (
            "o OBS nao esta aberto nessa maquina, ou o servidor WebSocket esta "
            "desligado (OBS > Ferramentas > Configuracoes do Servidor WebSocket)"
        )
    if "11001" in texto or "getaddrinfo" in texto or "11004" in texto:
        return "nao achei essa maquina na rede — confira obs.host no config.yaml"
    if isinstance(erro, TimeoutError) or "timed out" in texto or "timeout" in texto.lower():
        return (
            "o OBS nao respondeu a tempo — maquina desligada, IP errado "
            "ou firewall bloqueando a porta"
        )
    return "sem conexao com o OBS ({})".format(texto)


class ClienteOBS:
    def __init__(self, host, porta, senha, timeout=4.0, tentativas=2):
        self._url = "ws://{}:{}".format(_host_para_url(host), porta)
        self._senha = senha or ""
        self._timeout = timeout
        # Numa cue vale reconectar e tentar de novo. Num teste de status nao:
        # se nao conectou, nao conectou, e cada tentativa extra so faz o
        # painel demorar mais pra dizer o que ja da pra dizer.
        self._tentativas = max(1, int(tentativas))
        self._ws = None
        self._lock = threading.Lock()

    # -- conexao ------------------------------------------------------------

    def _conectar(self):
        ws = websocket.create_connection(self._url, timeout=self._timeout)

        hello = json.loads(ws.recv())
        if hello.get("op") != 0:
            ws.close()
            raise ErroOBS("o OBS respondeu algo inesperado no handshake")

        d = hello.get("d") or {}
        identify = {
            "rpcVersion": d.get("rpcVersion", 1),
            # Sem eventos: a ponte so manda comandos. Evita que o fluxo de
            # eventos do OBS se misture com as respostas que esperamos.
            "eventSubscriptions": 0,
        }

        auth = d.get("authentication")
        if auth:
            if not self._senha:
                ws.close()
                raise ErroOBS(
                    "o OBS esta pedindo senha e o config.yaml esta sem senha"
                )
            segredo = base64.b64encode(
                hashlib.sha256((self._senha + auth["salt"]).encode()).digest()
            ).decode()
            identify["authentication"] = base64.b64encode(
                hashlib.sha256((segredo + auth["challenge"]).encode()).digest()
            ).decode()

        ws.send(json.dumps({"op": 1, "d": identify}))

        # Quando a senha nao bate, o OBS nao responde nada: ele so fecha a
        # conexao (codigo 4009). Sem tratar isso aqui, o operador recebe
        # "sem conexao com o OBS" e vai procurar problema em cabo e rede,
        # quando o que falta e uma letra na senha do config.yaml.
        try:
            bruto = ws.recv()
        except Exception:
            bruto = ""
        if not bruto:
            try:
                ws.close()
            except Exception:
                pass
            raise ErroOBS("o OBS recusou a senha — confira obs.senha no config.yaml")

        try:
            resposta = json.loads(bruto)
        except ValueError:
            ws.close()
            raise ErroOBS("o OBS respondeu algo ilegivel na identificacao")
        if resposta.get("op") != 2:
            ws.close()
            raise ErroOBS(
                "o OBS recusou a conexao (respondeu op {})".format(resposta.get("op"))
            )

        self._ws = ws

    def _fechar(self):
        if self._ws is not None:
            try:
                self._ws.close()
            except Exception:
                pass
            self._ws = None

    # -- uso ----------------------------------------------------------------

    def pedir(self, tipo, dados=None):
        """Manda uma requisicao do obs-websocket e devolve o responseData.

        `tipo` e o nome do protocolo, ex. SetCurrentProgramScene, StartRecord.
        """
        with self._lock:
            ultimo_erro = None
            for _ in range(self._tentativas):
                # Guardado ANTES da tentativa: diz se existia uma conexao que
                # pode ter envelhecido, ou se nao havia nada.
                tinha_conexao = self._ws is not None
                try:
                    if self._ws is None:
                        self._conectar()
                    return self._uma_tentativa(tipo, dados)
                except ErroOBS:
                    # Senha errada ou recusa do OBS: repetir nao ajuda.
                    self._fechar()
                    raise
                except Exception as erro:
                    ultimo_erro = erro
                    self._fechar()
                    if not tinha_conexao:
                        # Nao havia conexao pra ter envelhecido — o OBS nao
                        # esta ali. Insistir so faria o operador esperar o
                        # dobro por um botao que ja estava perdido.
                        break
                    # Tinha conexao e ela caiu: vale reconectar e repetir.
            raise ErroOBS(_traduzir_falha(ultimo_erro))

    def _uma_tentativa(self, tipo, dados):
        pedido_id = uuid.uuid4().hex
        self._ws.send(
            json.dumps(
                {
                    "op": 6,
                    "d": {
                        "requestType": tipo,
                        "requestId": pedido_id,
                        "requestData": dados or {},
                    },
                }
            )
        )
        while True:
            msg = json.loads(self._ws.recv())
            if msg.get("op") != 7:
                continue
            corpo = msg.get("d") or {}
            if corpo.get("requestId") != pedido_id:
                continue
            status = corpo.get("requestStatus") or {}
            if not status.get("result"):
                raise ErroOBS(
                    status.get("comment")
                    or "o OBS recusou {} (codigo {})".format(tipo, status.get("code")),
                    codigo=status.get("code"),
                )
            return corpo.get("responseData") or {}

    def versao(self):
        """Usado pelo diagnostico do painel."""
        return self.pedir("GetVersion")

    def cenas(self):
        """Nomes das cenas do OBS — ajuda a conferir o que escrever no config."""
        dados = self.pedir("GetSceneList")
        return [c.get("sceneName") for c in dados.get("scenes", [])]

    def definir_visibilidade(self, cena, fonte, visivel):
        """Mostra ou esconde uma fonte dentro de uma cena, pelo NOME dela.

        O obs-websocket só liga/desliga item por sceneItemId, um número que o
        OBS gera e que muda quando alguém apaga e recria a fonte. Guardar esse
        número no config.yaml seria uma bomba-relógio: funcionaria por semanas
        e quebraria no dia em que mexessem na cena, com erro que não explica
        nada. Então a ponte traduz nome -> id na hora de cada chamada.

        Custa uma requisição a mais. Numa rede local isso é alguns
        milissegundos, e compra um config que a equipe consegue ler e manter.
        """
        try:
            dados = self.pedir(
                "GetSceneItemId", {"sceneName": cena, "sourceName": fonte}
            )
        except ErroOBS as erro:
            raise ErroOBS(
                "nao achei a fonte '{}' na cena '{}' ({})".format(fonte, cena, erro)
            )
        self.pedir(
            "SetSceneItemEnabled",
            {
                "sceneName": cena,
                "sceneItemId": dados["sceneItemId"],
                "sceneItemEnabled": bool(visivel),
            },
        )
