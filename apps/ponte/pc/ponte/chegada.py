"""O guia de chegada: o passo a passo de quem chega para o culto.

O conteudo mora em chegada.yaml. Este modulo faz tres coisas com ele:

  1. MEDE, de fundo, tudo que da para medir (OBS responde? a TV esta na rede?
     o PC do som esta buscando a luz?) e guarda o resultado com a hora.
  2. EXECUTA os passos de um clique (abrir o retorno na TV, trocar a colecao
     do OBS, iniciar a transmissao).
  3. GUARDA o que foi marcado como feito, num arquivo ao lado — para o
     celular e o PC verem o mesmo, e para um reinicio da ponte nao zerar o
     progresso no meio da preparacao.

A REGRA QUE SUSTENTA O RESTO: passo com medida so fica verde pela medida.
"Feito" marcado a mao em cima de algo mensuravel e exatamente como um
checklist de papel mente — a pessoa marca "OBS aberto" de memoria e o OBS
esta fechado. Existe um "marcar mesmo assim", porque medida tambem erra e
ninguem pode ficar preso; mas ele aparece em ambar, nunca em verde.

E a segunda regra: SEM MEDIDA NAO E VERDE. Uma medida que ainda nao rodou,
ou que estourou, devolve ok=None e a tela mostra cinza.
"""

import base64
import json
import os
import re
import socket
import subprocess
import threading
import time

import yaml

PAUSA_MEDIDAS = 4.0

# Quanto tempo sem o PC do som buscar o quadro ate chamar de "parou". Ele
# busca 4 vezes por segundo; 6 segundos sao 24 buscas perdidas seguidas, o que
# nao acontece por soluço de rede.
LUZ_SILENCIO_MAXIMO = 6.0


class ErroChegada(Exception):
    """Algo que quem opera consegue entender e resolver."""


def _hoje():
    return time.strftime("%Y-%m-%d")


def _porta_aberta(host, porta, timeout=1.0):
    try:
        with socket.create_connection((host, int(porta)), timeout=timeout):
            return True
    except OSError:
        return False


def _ip_pelo_mac(mac):
    """Procura um MAC na tabela de vizinhos do Windows. Devolve o IPv4 ou None.

    Usa `arp -a` e nao PowerShell: sobe em milissegundos, e isto roda de fundo
    a cada poucos segundos quando algo esta fora do ar.

    So acha quem ja trocou algum pacote com esta maquina desde o boot — o que,
    numa rede de igreja cheia de broadcast, e quase todo mundo em um minuto.
    Nao achar NAO prova que a maquina esta desligada.
    """
    if not mac:
        return None
    alvo = re.sub(r"[^0-9a-f]", "", str(mac).lower())
    if len(alvo) != 12:
        return None
    try:
        saida = subprocess.run(
            ["arp", "-a"], capture_output=True, timeout=5,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        ).stdout.decode("cp850", errors="ignore")
    except Exception:
        return None
    for linha in saida.splitlines():
        achado = re.match(r"\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:-]{17})\s", linha)
        if not achado:
            continue
        if re.sub(r"[^0-9a-f]", "", achado.group(2).lower()) == alvo:
            ip = achado.group(1)
            if not ip.endswith(".255") and not ip.startswith("224."):
                return ip
    return None


class Chegada:
    """Tudo do guia. Uma instancia por ponte.

    `servicos` e um dicionario de funcoes que o app.py entrega — o guia nao
    importa o app (seria circular) e nao conhece Flask:

      contexto()            -> o dict vivo de clientes
      estado()              -> copia do cache de estado (holyrics/obs)
      luz_vista()           -> (epoch da ultima busca de fora, ip) ou (None, None)
      rodar_cue(id)         -> (ok, texto)
      carregar_ordem(id)    -> (ok, texto)
      ordens()              -> {"carregada": {...}, "disponiveis": [...]}
      trocar_host_obs(host) -> refaz os clientes do OBS apontando para `host`
      host_obs()            -> o host atual do OBS
      novo_obs() / novo_holyrics() -> clientes SO do guia (ou None)
    """

    def __init__(self, raiz, servicos):
        self._raiz = raiz
        self._s = servicos
        self._caminho_yaml = os.path.join(raiz, "chegada.yaml")
        self._caminho_estado = os.path.join(raiz, "_chegada.json")
        self._tranca = threading.RLock()
        self._roteiro = {"rede": {}, "obs": {}, "ilhas": [], "passos": [],
                         "endereco": "", "letras_modo": "manual"}
        self._culto = None
        self._lido_em = None
        self._erro_do_roteiro = None
        self._medidas = {}
        self._feitos = {}
        self._dia = _hoje()
        self._tv_ip = None
        self._obs = None
        self._holyrics = None
        self._agindo = set()
        self._ler_roteiro()
        self._ler_estado()

    # -- roteiro ------------------------------------------------------------

    def _ler_roteiro(self):
        """Le o chegada.yaml se ele mudou. Roteiro quebrado NAO derruba nada:
        fica valendo o ultimo que funcionou, e a tela mostra o erro."""
        try:
            mudou_em = os.path.getmtime(self._caminho_yaml)
        except OSError:
            self._erro_do_roteiro = "nao achei o chegada.yaml"
            return
        if mudou_em == self._lido_em:
            return
        try:
            with open(self._caminho_yaml, "r", encoding="utf-8-sig") as arquivo:
                dados = yaml.safe_load(arquivo) or {}
            passos, vistos = [], set()
            for passo in dados.get("passos") or []:
                if not isinstance(passo, dict) or not passo.get("id"):
                    continue
                if passo["id"] in vistos:
                    raise ErroChegada("id repetido: {}".format(passo["id"]))
                vistos.add(passo["id"])
                passos.append(passo)
            ilhas = [i for i in (dados.get("ilhas") or []) if isinstance(i, dict) and i.get("id")]
            conhecidas = {i["id"] for i in ilhas}
            for passo in passos:
                if passo.get("ilha") not in conhecidas:
                    raise ErroChegada("o passo {} cita uma ilha que nao existe: {}".format(
                        passo["id"], passo.get("ilha")))
            with self._tranca:
                self._roteiro = {
                    "rede": dados.get("rede") or {},
                    "obs": dados.get("obs") or {},
                    "ilhas": ilhas,
                    "passos": passos,
                    "endereco": str(dados.get("endereco") or "")
                                if dados.get("endereco_no_ar") else "",
                    "letras_modo": str((dados.get("letras") or {}).get("modo") or "manual"),
                }
                self._lido_em = mudou_em
                self._erro_do_roteiro = None
        except Exception as erro:
            self._lido_em = mudou_em     # nao reler o mesmo arquivo ruim em laco
            self._erro_do_roteiro = "chegada.yaml com erro: {}".format(erro)
            print("  AVISO: {}".format(self._erro_do_roteiro))

    # -- progresso ----------------------------------------------------------

    def _ler_estado(self):
        """utf-8-sig de proposito: editor do Windows grava BOM, e BOM ja fez
        esta ponte perder dado calada uma vez (ver _ler_marcas no app.py)."""
        if not os.path.exists(self._caminho_estado):
            return
        try:
            with open(self._caminho_estado, "r", encoding="utf-8-sig") as arquivo:
                dados = json.load(arquivo) or {}
            if dados.get("dia") == _hoje() and isinstance(dados.get("feitos"), dict):
                self._feitos = dados["feitos"]
                if isinstance(dados.get("culto"), dict):
                    self._culto = dados["culto"]
        except Exception as erro:
            print("  AVISO: nao consegui ler {}: {}".format(self._caminho_estado, erro))

    def _gravar_estado(self):
        try:
            with open(self._caminho_estado, "w", encoding="utf-8") as arquivo:
                json.dump({"dia": self._dia, "feitos": self._feitos, "culto": self._culto},
                          arquivo, ensure_ascii=False, indent=2)
        except OSError as erro:
            print("  AVISO: nao consegui gravar o progresso da chegada: {}".format(erro))

    def _virar_o_dia(self):
        """Progresso e por dia. Ontem todo mundo marcou "nobreak ligado"; isso
        nao diz nada sobre hoje."""
        if self._dia != _hoje():
            self._dia = _hoje()
            self._feitos = {}
            self._culto = None
            self._gravar_estado()

    def recomecar(self):
        """Para o segundo culto do mesmo dia."""
        with self._tranca:
            self._feitos = {}
            self._culto = None
            self._gravar_estado()

    def definir_culto(self, ordem, hora, presentes):
        """O formulario da primeira tela: qual culto, que horas, quem veio.

        E a primeira coisa que o PC principal pergunta, e nao e burocracia:
        as tres respostas mudam o que o guia faz. O culto escolhe a ordem (os
        botoes do painel); a hora vira o "faltam 40 minutos" de cada tela; e
        quem veio decide de quem sao os passos — funcao sem ninguem cai para
        quem esta no PC principal, em vez de ficar esquecida.
        """
        hora = str(hora or "").strip()
        if not re.match(r"^([01]?\d|2[0-3]):[0-5]\d$", hora):
            raise ErroChegada("a hora tem que ser assim: 19:30")
        conhecidas = [i["id"] for i in self._roteiro["ilhas"]]
        presentes = [p for p in (presentes or []) if p in conhecidas]
        # So troca a ordem se ela MUDOU. Carregar uma ordem zera o ponteiro
        # ("em que momento do culto estamos"); recarregar a mesma, so porque
        # alguem corrigiu a hora no meio do culto, faria o painel perder o
        # lugar com a pregacao no ar.
        carregada = (self._s["ordens"]().get("carregada") or {}).get("id")
        if str(ordem or "") != str(carregada or ""):
            ok, texto = self._s["carregar_ordem"](str(ordem or ""))
            if not ok:
                raise ErroChegada(texto)
        with self._tranca:
            self._virar_o_dia()
            self._culto = {"ordem": str(ordem), "hora": hora, "presentes": presentes,
                           "em": time.strftime("%H:%M")}
            self._gravar_estado()

    def marcar(self, passo_id, feito=True, forcado=False):
        with self._tranca:
            passo = self._passo(passo_id)
            if feito:
                # Passo com medida so aceita marca a mao como FORCADA, e ela
                # fica registrada como tal.
                como = "forcado" if passo.get("confere") else "mao"
                if passo.get("confere") and not forcado:
                    raise ErroChegada("este passo e conferido pelo sistema")
                self._feitos[passo_id] = {"em": time.strftime("%H:%M"), "como": como}
            else:
                self._feitos.pop(passo_id, None)
            self._gravar_estado()

    def _passo(self, passo_id):
        for passo in self._roteiro["passos"]:
            if passo["id"] == passo_id:
                return passo
        raise ErroChegada("nao existe o passo {!r}".format(passo_id))

    # -- medidas ------------------------------------------------------------

    def comecar(self):
        threading.Thread(target=self._medir_sempre, daemon=True).start()

    def _medir_sempre(self):
        while True:
            try:
                self._ler_roteiro()
                with self._tranca:
                    nomes = {p["confere"] for p in self._roteiro["passos"] if p.get("confere")}
                for nome in sorted(nomes):
                    self._medidas[nome] = self._medir(nome)
            except Exception:
                # Esta thread nao pode morrer: tela com medida velha parecendo
                # nova e pior do que tela sem medida.
                pass
            time.sleep(PAUSA_MEDIDAS)

    def _medir(self, nome):
        funcao = getattr(self, "_mede_" + nome, None)
        if funcao is None:
            return {"ok": None, "detalhe": "nao sei medir '{}'".format(nome), "em": time.time()}
        # Uma medida devolve (ok, detalhe) ou (ok, detalhe, desde).
        #
        # O DETALHE TEM QUE SER ESTAVEL: nada de "parou ha 12 segundos" no
        # texto. A tela se redesenha quando o texto muda, e um texto que muda
        # a cada medida refaz os botoes debaixo do dedo de quem esta tocando —
        # foi assim que um clique de teste se perdeu em 12/11. O "ha quanto
        # tempo" vai em `desde`, e a tela conta sozinha sem se redesenhar.
        desde = None
        try:
            resultado = funcao()
            ok, detalhe = resultado[0], resultado[1]
            if len(resultado) > 2:
                desde = resultado[2]
        except Exception as erro:
            ok, detalhe = None, "a medida falhou: {}".format(erro)
        return {"ok": ok, "detalhe": detalhe, "desde": desde, "em": time.time()}

    def _cliente_obs(self):
        if self._obs is None:
            self._obs = self._s["novo_obs"]()
        return self._obs

    def _cliente_holyrics(self):
        if self._holyrics is None:
            self._holyrics = self._s["novo_holyrics"]()
        return self._holyrics

    def _mede_holyrics(self):
        dados = (self._s["estado"]() or {}).get("holyrics")
        if dados is None:
            return False, "o Holyrics nao respondeu"
        # SO "respondendo", sem dizer o que esta no telao. Dizia, e era um erro
        # com consequencia: no meio da pregacao o slide muda a cada minuto, o
        # texto da medida mudava junto, e a tela do guia se refazia inteira
        # debaixo do dedo de quem estava tocando. O detalhe de uma medida tem
        # que ser tao estavel quanto o estado que ela mede.
        return True, "respondendo"

    def _mede_obs(self):
        dados = (self._s["estado"]() or {}).get("obs")
        if dados is not None:
            return True, "conectado em {}".format(self._s["host_obs"]())
        # Nao respondeu. Antes de dizer "esta fechado", ver se o notebook so
        # mudou de endereco — foi exatamente o que aconteceu em 12/11.
        mudou = self._reachar_obs()
        if mudou:
            return None, "o notebook mudou para {} · reconectando".format(mudou)
        ip = _ip_pelo_mac((self._roteiro["rede"].get("obs") or {}).get("mac"))
        if ip:
            return False, "o notebook esta na rede ({}), mas o OBS nao responde".format(ip)
        return False, "nao achei o notebook na rede, nem pelo MAC"

    def _reachar_obs(self):
        mac = (self._roteiro["rede"].get("obs") or {}).get("mac")
        ip = _ip_pelo_mac(mac)
        if not ip or ip == self._s["host_obs"]():
            return None
        if not _porta_aberta(ip, 4455, timeout=1.5):
            return None
        self._s["trocar_host_obs"](ip)
        self._obs = None            # o cliente do guia apontava para o antigo
        print("  [chegada] OBS reachado pelo MAC em {}".format(ip))
        return ip

    def _mede_obs_colecao(self):
        cliente = self._cliente_obs()
        if cliente is None:
            return None, "OBS desligado no config.yaml"
        esperada = str((self._roteiro["obs"] or {}).get("colecao") or "")
        atual = cliente.pedir("GetSceneCollectionList").get("currentSceneCollectionName")
        if not esperada:
            return None, "falta dizer a colecao em chegada.yaml (obs: colecao:)"
        if atual == esperada:
            return True, "colecao: {}".format(atual)
        return False, "o OBS esta em \"{}\" · o culto usa \"{}\"".format(atual, esperada)

    def _mede_obs_estudio(self):
        cliente = self._cliente_obs()
        if cliente is None:
            return None, "OBS desligado no config.yaml"
        ligado = bool(cliente.pedir("GetStudioModeEnabled").get("studioModeEnabled"))
        return (True, "Modo Estudio ligado") if ligado else (False, "o Modo Estudio esta desligado")

    def _mede_transmitindo(self):
        dados = (self._s["estado"]() or {}).get("obs")
        if dados is None:
            return None, "sem resposta do OBS"
        if dados.get("transmitindo"):
            return True, "transmitindo" + (" e gravando" if dados.get("gravando") else "")
        return False, "o OBS nao esta transmitindo"

    def _mede_luz(self):
        visto, de = self._s["luz_vista"]()
        if visto is None:
            return False, "o PC do som ainda nao buscou a luz desde que a ponte subiu"
        if time.time() - visto <= LUZ_SILENCIO_MAXIMO:
            return True, "o PC do som esta buscando a luz"
        return False, "o PC do som parou de buscar a luz", visto

    def _ip_da_tv(self):
        conf = self._roteiro["rede"].get("tv") or {}
        candidatos = [self._tv_ip, conf.get("ip"), _ip_pelo_mac(conf.get("mac"))]
        for ip in candidatos:
            # 3000 e a porta do SSAP, o protocolo que o script do retorno usa.
            if ip and _porta_aberta(ip, 3000, timeout=1.0):
                self._tv_ip = ip
                return ip
        return None

    def _mede_tv(self):
        ip = self._ip_da_tv()
        if ip:
            return True, "TV ligada e na rede ({})".format(ip)
        return False, "a TV nao respondeu na rede"

    def _mede_lista_do_dia(self):
        cliente = self._cliente_holyrics()
        if cliente is None:
            return None, "Holyrics desligado no config.yaml"
        corpo = cliente.pedir("GetLyricsPlaylist")
        lista = corpo.get("data") if isinstance(corpo, dict) and "data" in corpo else corpo
        lista = lista or []
        if not lista:
            return False, "a lista de musicas do Holyrics esta vazia"
        nomes = [str(m.get("title") or "?") for m in lista if isinstance(m, dict)]
        resumo = ", ".join(nomes[:3]) + ("…" if len(nomes) > 3 else "")
        return True, "{} musica(s) na lista: {}".format(len(lista), resumo)

    # -- acoes --------------------------------------------------------------

    def agir(self, passo_id, dados=None):
        """Executa o clique de um passo. Devolve {"ok", "texto"}.

        Um clique por passo de cada vez: abrir o retorno na TV leva 20
        segundos, e um segundo clique impaciente mandaria as teclas em dobro
        para a TV, parando na tela errada.
        """
        dados = dados or {}
        with self._tranca:
            passo = self._passo(passo_id)
            nome = passo.get("acao")
            if not nome:
                raise ErroChegada("este passo nao tem botao")
            if passo_id in self._agindo:
                return {"ok": False, "texto": "ja estou fazendo isso — espere terminar"}
            self._agindo.add(passo_id)
        try:
            funcao = getattr(self, "_faz_" + nome, None)
            if funcao is None:
                raise ErroChegada("nao sei fazer '{}'".format(nome))
            ok, texto = funcao(dados)
        except ErroChegada as erro:
            ok, texto = False, str(erro)
        except Exception as erro:
            ok, texto = False, "nao deu certo: {}".format(erro)
        finally:
            with self._tranca:
                self._agindo.discard(passo_id)

        # UM CLIQUE QUE DEU CERTO NAO MARCA O PASSO COMO FEITO. Marcava, na
        # primeira versao — e ai "abrir o retorno na TV" ficava verde porque o
        # comando saiu, nao porque a letra apareceu. Quem tem medida, fica
        # verde pela medida; quem nao tem, espera a pessoa olhar e dizer Feito.
        if ok and passo.get("confere"):
            # Medir de novo JA, para a tela nao ficar 4 segundos vermelha
            # depois de um clique que funcionou.
            self._medidas[passo["confere"]] = self._medir(passo["confere"])
        return {"ok": bool(ok), "texto": texto}

    def _faz_abrir_holyrics(self, dados):
        exe = self._roteiro["rede"].get("holyrics_exe")
        if not exe or not os.path.exists(exe):
            raise ErroChegada("nao achei o Holyrics em {}".format(exe))
        if (self._s["estado"]() or {}).get("holyrics") is not None:
            return True, "o Holyrics ja esta aberto"
        subprocess.Popen([exe], cwd=os.path.dirname(exe))
        return True, "abrindo o Holyrics — fica verde quando ele responder, uns 30 segundos"

    def _faz_retorno_tv(self, dados):
        conf = self._roteiro["rede"].get("tv") or {}
        script = conf.get("script")
        if not script or not os.path.exists(script):
            raise ErroChegada("nao achei o script do retorno em {}".format(script))
        ip = self._ip_da_tv()
        if not ip:
            raise ErroChegada("a TV nao respondeu na rede. Ela esta ligada?")
        resultado = subprocess.run(
            ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass",
             "-File", script, "-Action", "Retorno", "-TvIp", ip],
            capture_output=True, timeout=120,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        saida = (resultado.stdout or b"").decode("cp850", errors="ignore").strip()
        ultima = [l.strip() for l in saida.splitlines() if l.strip()][-1:] or [""]
        if resultado.returncode != 0:
            raise ErroChegada("o script do retorno falhou: {}".format(ultima[0] or "sem detalhe"))
        return True, "comando enviado para a TV. Olhe para ela: apareceu a letra?"

    def _faz_obs_colecao(self, dados):
        cliente = self._s["contexto"]().get("obs")
        if cliente is None:
            raise ErroChegada("OBS desligado no config.yaml")
        esperada = str((self._roteiro["obs"] or {}).get("colecao") or "")
        if not esperada:
            raise ErroChegada("falta dizer a colecao em chegada.yaml")
        # Trocar de colecao derruba e recarrega todas as fontes. Com o culto
        # no ar, isso e tela preta no YouTube.
        if cliente.pedir("GetStreamStatus").get("outputActive") or \
           cliente.pedir("GetRecordStatus").get("outputActive"):
            raise ErroChegada("o OBS esta transmitindo ou gravando — nao troco de colecao agora")
        cliente.pedir("SetCurrentSceneCollection", {"sceneCollectionName": esperada})
        return True, "colecao trocada para {}".format(esperada)

    def _faz_obs_estudio(self, dados):
        cliente = self._s["contexto"]().get("obs")
        if cliente is None:
            raise ErroChegada("OBS desligado no config.yaml")
        cliente.pedir("SetStudioModeEnabled", {"studioModeEnabled": True})
        return True, "Modo Estudio ligado"

    def _faz_transmitir(self, dados):
        return self._s["rodar_cue"]("transmitir")

    def _faz_carregar_ordem(self, dados):
        opcao = dados.get("opcao")
        if not opcao:
            raise ErroChegada("escolha uma das ordens")
        return self._s["carregar_ordem"](str(opcao))

    # -- imagem -------------------------------------------------------------

    def imagem_do_obs(self):
        """Uma foto do que o OBS esta pondo no ar. Devolve (bytes, mime).

        E so leitura: pedir captura nao mexe em cena nem em transmissao.
        """
        cliente = self._cliente_obs()
        if cliente is None:
            raise ErroChegada("OBS desligado no config.yaml")
        cena = cliente.pedir("GetCurrentProgramScene")
        nome = cena.get("sceneName") or cena.get("currentProgramSceneName")
        if not nome:
            raise ErroChegada("o OBS nao disse qual cena esta no ar")
        foto = cliente.pedir("GetSourceScreenshot", {
            "sourceName": nome, "imageFormat": "jpg",
            "imageWidth": 960, "imageCompressionQuality": 70,
        })
        dados = str(foto.get("imageData") or "")
        if "," not in dados:
            raise ErroChegada("o OBS nao devolveu a imagem")
        return base64.b64decode(dados.split(",", 1)[1]), "image/jpeg"

    # -- retrato ------------------------------------------------------------

    def retrato(self):
        """Tudo que a tela precisa, de uma vez."""
        with self._tranca:
            self._virar_o_dia()
            ordens = self._s["ordens"]()
            passos = []
            for passo in self._roteiro["passos"]:
                medida = self._medidas.get(passo["confere"]) if passo.get("confere") else None
                marca = self._feitos.get(passo["id"])
                if passo.get("confere"):
                    tipo = "confere"
                    medido = bool(medida and medida.get("ok") is True)
                    feito = medido or bool(marca)
                    como = "medido" if medido else (marca or {}).get("como")
                else:
                    tipo = "clique" if passo.get("acao") else "manual"
                    feito = bool(marca)
                    como = (marca or {}).get("como")
                acao = None
                if passo.get("acao"):
                    acao = {"rotulo": passo.get("rotulo_acao") or "Fazer",
                            "confirmar": bool(passo.get("confirmar")),
                            "ocupado": passo["id"] in self._agindo}
                    if passo["acao"] == "carregar_ordem":
                        acao["opcoes"] = [{"id": o["id"], "nome": o["nome"]}
                                          for o in ordens.get("disponiveis") or []]
                        acao["atual"] = (ordens.get("carregada") or {}).get("id")
                passos.append({
                    "id": passo["id"], "ilha": passo["ilha"],
                    "titulo": passo.get("titulo") or passo["id"],
                    "frase": passo.get("frase") or passo.get("titulo") or passo["id"],
                    "apoio": passo.get("apoio"),
                    "desenho": passo.get("desenho"),
                    "confere": passo.get("confere"),
                    "tipo": tipo,
                    "como": [str(x) for x in (passo.get("como") or [])],
                    "porque": passo.get("porque"),
                    "se_falhar": passo.get("se_falhar"),
                    "link": passo.get("link"),
                    "imagem": passo.get("imagem"),
                    "acao": acao,
                    "medida": medida,
                    "feito": feito, "como_feito": como,
                    "feito_em": (marca or {}).get("em"),
                })
            ilhas = []
            for ilha in self._roteiro["ilhas"]:
                dela = [p for p in passos if p["ilha"] == ilha["id"]]
                ilhas.append({
                    "id": ilha["id"], "nome": ilha.get("nome") or ilha["id"],
                    "onde": ilha.get("onde"), "papel": ilha.get("papel"),
                    "total": len(dela), "feitos": sum(1 for p in dela if p["feito"]),
                    "falhando": sum(1 for p in dela
                                    if p["medida"] and p["medida"].get("ok") is False
                                    and not p["feito"]),
                })
            return {
                "dia": self._dia, "agora": time.time(),
                "erro_do_roteiro": self._erro_do_roteiro,
                "ordem": ordens.get("carregada"),
                "ordens": [{"id": o["id"], "nome": o["nome"]}
                           for o in ordens.get("disponiveis") or []],
                "culto": self._culto,
                "endereco": self._roteiro.get("endereco"),
                "letras_modo": self._roteiro.get("letras_modo"),
                "ilhas": ilhas, "passos": passos,
            }
