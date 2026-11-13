"""Cliente do YouTube — titulo, visibilidade e miniatura da transmissao.

O QUE O OBS JA FAZ E O QUE FALTAVA
----------------------------------
Comecar e parar a transmissao e do OBS, e a ponte ja manda isso. O que o OBS
nao alcanca e o que pertence ao YOUTUBE: o titulo que aparece para quem
assiste, se a live e publica ou nao listada, e a miniatura. Isso e este
modulo.

POR QUE NAO USAR AS BIBLIOTECAS DO GOOGLE
-----------------------------------------
google-api-python-client e google-auth-oauthlib arrastam uma arvore grande de
dependencias. O pacote de instalacao offline da igreja ja tem 122 MB, e o PC
do som e de 2011. O fluxo OAuth e umas oitenta linhas de HTTP; o cliente
obs-websocket deste projeto tambem foi escrito a mao, pelo mesmo motivo.
Nenhuma dependencia nova: requests ja esta no venv, o resto e biblioteca
padrao.

CHAVE DE API NAO SERVE AQUI
---------------------------
Chave de API le dado publico e nao identifica ninguem. Tudo que este modulo
faz e agir EM NOME DO CANAL, e para isso o Google exige OAuth 2.0: uma
autorizacao explicita, feita uma vez no navegador, que devolve um
refresh_token guardado em disco.

A ARMADILHA DOS 7 DIAS
----------------------
Se a tela de consentimento do projeto Google ficar em "Testando", o
refresh_token EXPIRA A CADA 7 DIAS — ou seja, quebra exatamente no domingo
seguinte, e ninguem liga uma coisa a outra. Precisa estar em "Em producao".
Publicar e um botao e vale na hora; a verificacao e outra coisa, mais lenta,
e so tira o aviso de "app nao verificado".
"""

import json
import os
import threading
import time
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

import requests

ESCOPO = "https://www.googleapis.com/auth/youtube"
API = "https://www.googleapis.com/youtube/v3"
ENVIO = "https://www.googleapis.com/upload/youtube/v3"

# Uma folga antes de o token vencer. Sem ela, um pedido disparado no segundo
# exato da virada falha — e no culto isso aparece como "nao funcionou" sem
# explicacao nenhuma.
FOLGA_SEGUNDOS = 120


class ErroYouTube(Exception):
    """Falha de autorizacao, de rede ou recusa da API."""


class _Captura(BaseHTTPRequestHandler):
    """Servidor de um pedido so, para pegar o `code` que o Google devolve."""

    codigo = None
    erro = None

    def do_GET(self):
        partes = urllib.parse.urlparse(self.path)
        campos = urllib.parse.parse_qs(partes.query)
        _Captura.codigo = (campos.get("code") or [None])[0]
        _Captura.erro = (campos.get("error") or [None])[0]

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        if _Captura.codigo:
            texto = ("<h2>Autorizado.</h2><p>Pode fechar esta aba e voltar "
                     "para a ponte do culto.</p>")
        else:
            texto = ("<h2>Nao deu.</h2><p>O Google respondeu: {}</p>"
                     .format(_Captura.erro or "sem motivo"))
        self.wfile.write(("<meta charset='utf-8'>" + texto).encode("utf-8"))

    def log_message(self, *_):
        return      # sem ruido no console da ponte


class ClienteYouTube:
    def __init__(self, caminho_credencial, caminho_token,
                 redirect_uri="http://localhost:8765/", timeout=15.0):
        self._credencial = caminho_credencial
        self._caminho_token = caminho_token
        self._redirect = redirect_uri
        self._timeout = float(timeout)
        self._lock = threading.Lock()
        self._token = None          # {"access_token", "expira_em", "refresh_token"}

    # -- credencial ----------------------------------------------------------

    def _cliente(self):
        if not os.path.exists(self._credencial):
            raise ErroYouTube(
                "nao achei a credencial do Google em {}".format(self._credencial))
        try:
            with open(self._credencial, "r", encoding="utf-8") as arquivo:
                bruto = json.load(arquivo)
        except (OSError, ValueError) as erro:
            raise ErroYouTube("credencial ilegivel: {}".format(erro))

        # O Google entrega "installed" para cliente de computador e "web" para
        # aplicativo web. Os dois servem aqui; o que muda e que o web exige o
        # redirect_uri registrado no console, igual caractere por caractere.
        for chave in ("installed", "web"):
            if chave in bruto:
                return bruto[chave], chave
        raise ErroYouTube(
            "a credencial nao parece um cliente OAuth do Google "
            "(esperava uma chave 'installed' ou 'web')")

    # -- token ---------------------------------------------------------------

    def _carregar_token(self):
        if not os.path.exists(self._caminho_token):
            return None
        try:
            with open(self._caminho_token, "r", encoding="utf-8") as arquivo:
                return json.load(arquivo)
        except (OSError, ValueError):
            return None

    def _gravar_token(self, dados):
        # Escreve em arquivo temporario e troca: uma queda no meio da escrita
        # deixaria um token pela metade, e a ponte nao subiria de manha.
        temporario = self._caminho_token + ".tmp"
        with open(temporario, "w", encoding="utf-8") as arquivo:
            json.dump(dados, arquivo)
        os.replace(temporario, self._caminho_token)

    def autorizado(self):
        dados = self._token or self._carregar_token()
        return bool(dados and dados.get("refresh_token"))

    def _renovar(self, refresh_token):
        cliente, _ = self._cliente()
        try:
            resposta = requests.post(
                cliente["token_uri"],
                data={
                    "client_id": cliente["client_id"],
                    "client_secret": cliente.get("client_secret", ""),
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
                timeout=self._timeout,
            )
        except requests.RequestException as erro:
            raise ErroYouTube("sem conexao com o Google: {}".format(erro))

        if resposta.status_code != 200:
            motivo = self._motivo(resposta)
            # Esta e a cara da armadilha dos 7 dias. Vale nomear, senao
            # alguem vai procurar erro em rede, em senha, em tudo menos no
            # lugar certo.
            if "invalid_grant" in motivo:
                raise ErroYouTube(
                    "o Google recusou a autorizacao guardada (invalid_grant). "
                    "Quase sempre e um destes tres: a tela de consentimento "
                    "voltou para 'Testando' e o token expirou em 7 dias; "
                    "alguem revogou o acesso na conta; ou a senha da conta "
                    "mudou. Autorize de novo.")
            raise ErroYouTube("o Google recusou renovar o acesso: {}".format(motivo))

        corpo = resposta.json()
        novo = {
            "access_token": corpo["access_token"],
            "expira_em": time.time() + int(corpo.get("expires_in", 3600)),
            # A renovacao normalmente NAO devolve refresh_token; o antigo
            # continua valendo. Sobrescrever com vazio seria perder o acesso.
            "refresh_token": corpo.get("refresh_token") or refresh_token,
        }
        self._gravar_token(novo)
        return novo

    def _acesso(self):
        with self._lock:
            dados = self._token or self._carregar_token()
            if not dados or not dados.get("refresh_token"):
                raise ErroYouTube(
                    "ainda nao autorizado — rode a autorizacao uma vez")
            if dados.get("access_token") and \
                    dados.get("expira_em", 0) > time.time() + FOLGA_SEGUNDOS:
                self._token = dados
                return dados["access_token"]
            self._token = self._renovar(dados["refresh_token"])
            return self._token["access_token"]

    # -- autorizacao ---------------------------------------------------------

    def url_de_autorizacao(self, conta=None):
        """A URL para autorizar. `conta` pre-seleciona um e-mail na tela.

        O pre-selecionar nao e enfeite: quando a autorizacao e feita noutra
        maquina, por outra pessoa, apontar a conta certa evita o erro mais
        caro deste fluxo — autorizar a conta errada e so descobrir depois,
        ao tentar mexer numa transmissao que nao existe naquele canal.
        """
        cliente, _ = self._cliente()
        parametros = {
            "client_id": cliente["client_id"],
            "redirect_uri": self._redirect,
            "response_type": "code",
            "scope": ESCOPO,
            # offline e o que faz o Google devolver refresh_token; sem ele a
            # autorizacao morre em uma hora e nao sobrevive a um reinicio.
            "access_type": "offline",
            # DOIS pedidos, e os dois tem motivo.
            #
            # consent forca a tela de permissao mesmo em quem ja autorizou
            # antes. Sem ele, numa segunda autorizacao o Google NAO manda
            # refresh_token, e o arquivo fica sem a parte que importa.
            #
            # select_account forca a tela de ESCOLHA DE CONTA. Sem ele o
            # Google reaproveita a sessao ja aberta no navegador e autoriza
            # em silencio a conta errada — foi o que aconteceu aqui na
            # primeira tentativa, porque a conta que transmite nao e a que
            # estava logada. O erro so apareceria depois, ao tentar mexer
            # numa transmissao que nao existe naquele canal.
            "prompt": "select_account consent",
        }
        if conta:
            parametros["login_hint"] = str(conta)
        return cliente["auth_uri"] + "?" + urllib.parse.urlencode(parametros)

    def autorizar(self, abrir_navegador=True, espera=300):
        """Faz a autorizacao uma vez. Abre o navegador e espera o retorno."""
        cliente, tipo = self._cliente()
        porta = urllib.parse.urlparse(self._redirect).port or 80

        _Captura.codigo = None
        _Captura.erro = None
        try:
            servidor = HTTPServer(("127.0.0.1", porta), _Captura)
        except OSError as erro:
            raise ErroYouTube(
                "nao consegui escutar na porta {} para receber a resposta do "
                "Google ({}). Feche o que estiver usando essa porta, ou mude "
                "o redirect_uri — lembrando que ele precisa bater com o que "
                "esta registrado no console.".format(porta, erro))

        url = self.url_de_autorizacao()
        if abrir_navegador:
            webbrowser.open(url)

        servidor.timeout = espera
        servidor.handle_request()
        servidor.server_close()

        if _Captura.erro:
            raise ErroYouTube("o Google recusou: {}".format(_Captura.erro))
        if not _Captura.codigo:
            raise ErroYouTube("ninguem autorizou dentro do tempo")

        try:
            resposta = requests.post(
                cliente["token_uri"],
                data={
                    "code": _Captura.codigo,
                    "client_id": cliente["client_id"],
                    "client_secret": cliente.get("client_secret", ""),
                    "redirect_uri": self._redirect,
                    "grant_type": "authorization_code",
                },
                timeout=self._timeout,
            )
        except requests.RequestException as erro:
            raise ErroYouTube("sem conexao com o Google: {}".format(erro))

        if resposta.status_code != 200:
            raise ErroYouTube(
                "o Google nao trocou o codigo por token: {}".format(
                    self._motivo(resposta)))

        corpo = resposta.json()
        if not corpo.get("refresh_token"):
            raise ErroYouTube(
                "o Google autorizou mas nao mandou refresh_token. Sem ele a "
                "autorizacao morre em uma hora. Normalmente e porque a conta "
                "ja tinha autorizado antes: revogue o acesso em "
                "myaccount.google.com/permissions e autorize de novo.")

        self._gravar_token({
            "access_token": corpo["access_token"],
            "expira_em": time.time() + int(corpo.get("expires_in", 3600)),
            "refresh_token": corpo["refresh_token"],
        })
        return True

    def revogar(self):
        """Devolve a autorizacao ao Google e apaga o arquivo local.

        Apagar so o arquivo nao basta: a concessao continuaria viva na conta,
        aparecendo em myaccount.google.com/permissions como um app com acesso
        ao YouTube. Autorizacao concedida por engano se desfaz, nao se
        esquece.
        """
        dados = self._token or self._carregar_token()
        apagado = False
        if dados and dados.get("refresh_token"):
            try:
                requests.post("https://oauth2.googleapis.com/revoke",
                              data={"token": dados["refresh_token"]},
                              timeout=self._timeout)
            except requests.RequestException:
                # Nao poder avisar o Google nao pode impedir a limpeza local.
                pass
        if os.path.exists(self._caminho_token):
            os.remove(self._caminho_token)
            apagado = True
        self._token = None
        return apagado

    # -- API -----------------------------------------------------------------

    @staticmethod
    def _motivo(resposta):
        """Mensagem util sem vazar token. NUNCA devolve o corpo cru inteiro."""
        try:
            corpo = resposta.json()
        except ValueError:
            return "HTTP {}".format(resposta.status_code)
        erro = corpo.get("error")
        if isinstance(erro, dict):
            detalhes = erro.get("errors") or []
            razao = detalhes[0].get("reason") if detalhes else None
            return "HTTP {} — {}{}".format(
                resposta.status_code, erro.get("message", "?"),
                " ({})".format(razao) if razao else "")
        if isinstance(erro, str):
            return "{} — {}".format(erro, corpo.get("error_description", ""))
        return "HTTP {}".format(resposta.status_code)

    def _pedir(self, metodo, caminho, **kwargs):
        cabecalhos = {"Authorization": "Bearer " + self._acesso()}
        cabecalhos.update(kwargs.pop("headers", {}))
        try:
            resposta = requests.request(
                metodo, caminho, headers=cabecalhos, timeout=self._timeout, **kwargs)
        except requests.RequestException as erro:
            raise ErroYouTube("sem conexao com o YouTube: {}".format(erro))
        if resposta.status_code >= 400:
            raise ErroYouTube(self._motivo(resposta))
        if not resposta.content:
            return {}
        return resposta.json()

    def transmissao(self, estado="active"):
        """A transmissao do canal: 'active' (no ar) ou 'upcoming' (agendada).

        Devolve None quando nao ha nenhuma — e isso NAO e erro: antes de o OBS
        entrar no ar, nao existe transmissao ativa para mexer.
        """
        corpo = self._pedir("GET", API + "/liveBroadcasts", params={
            "part": "id,snippet,status,contentDetails",
            "broadcastStatus": estado,
            "broadcastType": "all",
            "maxResults": 5,
        })
        itens = corpo.get("items") or []
        return itens[0] if itens else None

    def atualizar(self, transmissao, titulo=None, descricao=None, privacidade=None):
        """Muda titulo, descricao e/ou visibilidade de uma transmissao.

        LEITURA-MODIFICACAO-ESCRITA, de proposito e sem atalho. O update do
        YouTube SUBSTITUI a parte inteira que voce manda: se enviar um snippet
        so com o titulo, a descricao e o horario agendado SOMEM. Por isso a
        transmissao atual entra aqui inteira e so os campos pedidos mudam.
        """
        if not isinstance(transmissao, dict) or not transmissao.get("id"):
            raise ErroYouTube("precisa da transmissao inteira, nao so do id")

        snippet = dict(transmissao.get("snippet") or {})
        status = dict(transmissao.get("status") or {})
        if titulo is not None:
            snippet["title"] = str(titulo)[:100]      # o YouTube corta em 100
        if descricao is not None:
            snippet["description"] = str(descricao)[:5000]
        if privacidade is not None:
            if privacidade not in ("public", "unlisted", "private"):
                raise ErroYouTube(
                    "visibilidade invalida: {!r} (use public, unlisted ou "
                    "private)".format(privacidade))
            status["privacyStatus"] = privacidade

        # SOBRE scheduledStartTime: a documentacao do Google diz que ele e
        # obrigatorio no snippet de um liveBroadcast, e a primeira versao
        # disto RECUSAVA atualizar sem ele.
        #
        # Medido contra o canal da igreja em 08/11: a transmissao deles NAO
        # TEM esse campo. O snippet traz so categoryId, channelId,
        # description, isDefaultBroadcast, liveChatId, publishedAt,
        # thumbnails e title — e o formato de quem usa "transmitir agora" em
        # vez de agendar. Ou seja, a trava teria recusado justamente a
        # transmissao real, por causa da documentacao e nao do YouTube.
        #
        # Entao: se a transmissao original tinha o campo, ele vai junto
        # (senao o update o apagaria). Se nao tinha, nao se inventa um.
        if not snippet.get("scheduledStartTime"):
            snippet.pop("scheduledStartTime", None)

        return self._pedir("PUT", API + "/liveBroadcasts",
                           params={"part": "id,snippet,status"},
                           json={"id": transmissao["id"], "snippet": snippet,
                                 "status": status})

    def trocar_codigo(self, bruto):
        """Troca por token um codigo obtido NOUTRA maquina.

        O retorno da autorizacao vai para localhost, e localhost e sempre a
        maquina de quem abriu o navegador. Autorizando do celular ou de
        outro PC, a pagina final da erro de conexao — e isso e o SUCESSO: o
        codigo esta na barra de endereco. Aceita a URL inteira porque copiar
        a barra toda e mais facil, e menos sujeito a erro, do que isolar o
        codigo no meio dela.
        """
        texto = str(bruto or "").strip()
        if not texto:
            raise ErroYouTube("nao veio codigo nenhum")
        if "code=" in texto:
            campos = urllib.parse.parse_qs(urllib.parse.urlparse(texto).query)
            texto = (campos.get("code") or [""])[0]
        if not texto:
            raise ErroYouTube("achei 'code=' mas nao consegui extrair o valor")

        cliente, _ = self._cliente()
        try:
            resposta = requests.post(cliente["token_uri"], timeout=self._timeout, data={
                "code": texto,
                "client_id": cliente["client_id"],
                "client_secret": cliente.get("client_secret", ""),
                "redirect_uri": self._redirect,
                "grant_type": "authorization_code",
            })
        except requests.RequestException as erro:
            raise ErroYouTube("sem conexao com o Google: {}".format(erro))

        if resposta.status_code != 200:
            raise ErroYouTube(
                "{} — as causas comuns, nesta ordem: o codigo ja foi usado "
                "(serve UMA vez so), passaram mais de alguns minutos, ou o "
                "redirect_uri nao bate com o que gerou o codigo".format(
                    self._motivo(resposta)))

        corpo = resposta.json()
        if not corpo.get("refresh_token"):
            raise ErroYouTube(
                "autorizou mas nao veio refresh_token — sem ele a autorizacao "
                "morre em uma hora. Acontece quando a conta ja autorizou este "
                "app antes: revogue em myaccount.google.com/permissions e "
                "autorize de novo.")

        self._gravar_token({
            "access_token": corpo["access_token"],
            "expira_em": time.time() + int(corpo.get("expires_in", 3600)),
            "refresh_token": corpo["refresh_token"],
        })
        return True

    def canal(self):
        """Nome e id do canal autorizado. Serve para CONFERIR, nao decorar.

        Autorizar o canal errado e o erro mais caro deste fluxo, e so se
        descobre tentando mexer numa transmissao que nao existe la. Com o
        nome na tela, a conferencia e imediata.
        """
        corpo = self._pedir("GET", API + "/channels",
                            params={"part": "snippet,statistics", "mine": "true"})
        itens = corpo.get("items") or []
        if not itens:
            return None
        it = itens[0]
        return {
            "id": it.get("id"),
            "nome": it["snippet"].get("title"),
            "inscritos": it.get("statistics", {}).get("subscriberCount"),
            "videos": it.get("statistics", {}).get("videoCount"),
        }

    @staticmethod
    def link(transmissao):
        if not transmissao or not transmissao.get("id"):
            return None
        return "https://www.youtube.com/watch?v=" + transmissao["id"]

    def chaves(self):
        """As chaves de transmissao do canal — SEM O VALOR DELAS.

        Devolve nome, id e servidor. O segredo nunca sai daqui para o
        navegador: o painel escolhe uma chave PELO ID, e quem busca o valor e
        aplica no OBS e o servidor. Chave de transmissao na tela e chave de
        transmissao num print de tela, numa foto, num grupo de WhatsApp.
        """
        corpo = self._pedir("GET", API + "/liveStreams",
                            params={"part": "id,snippet,cdn,status",
                                    "mine": "true", "maxResults": 25})
        saida = []
        for it in corpo.get("items") or []:
            cdn = it.get("cdn") or {}
            ing = cdn.get("ingestionInfo") or {}
            saida.append({
                "id": it.get("id"),
                "nome": (it.get("snippet") or {}).get("title"),
                "servidor": ing.get("ingestionAddress"),
                "tem_chave": bool(ing.get("streamName")),
                "estado": (it.get("status") or {}).get("streamStatus"),
            })
        return saida

    def chave_de(self, id_stream):
        """O valor de uma chave. SO O SERVIDOR chama isto, nunca uma rota
        que devolva para o navegador."""
        corpo = self._pedir("GET", API + "/liveStreams",
                            params={"part": "id,cdn", "id": str(id_stream)})
        itens = corpo.get("items") or []
        if not itens:
            raise ErroYouTube("nao achei a chave {!r} neste canal".format(id_stream))
        ing = (itens[0].get("cdn") or {}).get("ingestionInfo") or {}
        chave = ing.get("streamName")
        if not chave:
            raise ErroYouTube("essa chave veio vazia do YouTube")
        return {"chave": chave, "servidor": ing.get("ingestionAddress")}

    def definir_miniatura(self, id_video, caminho):
        """A miniatura. Limite do YouTube: 2 MB, e a conta precisa estar
        verificada por telefone — senao vem um 403 que nao explica isso."""
        if not os.path.exists(caminho):
            raise ErroYouTube("nao achei a imagem em {}".format(caminho))
        tamanho = os.path.getsize(caminho)
        if tamanho > 2 * 1024 * 1024:
            raise ErroYouTube(
                "a imagem tem {:.1f} MB; o YouTube aceita ate 2 MB".format(
                    tamanho / 1024 / 1024))
        with open(caminho, "rb") as arquivo:
            return self._pedir(
                "POST", ENVIO + "/thumbnails/set",
                params={"videoId": id_video, "uploadType": "media"},
                headers={"Content-Type": "image/jpeg"},
                data=arquivo.read())
