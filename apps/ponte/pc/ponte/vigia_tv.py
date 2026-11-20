"""O vigia do retorno na TV: percebe quando a TV solta o retorno e reabre.

O QUE ACONTECE NA IGREJA (diagnostico de 12/11/2026, no PC do Holyrics). A
TV do altar mostra a letra recebendo a tela deste PC: o Sunshine transmite,
o Moonlight na TV recebe. O Sunshine nunca caiu. Quem cai e a sessao do
Moonlight, do lado da TV, sem erro nenhum antes: Wi-Fi, economia de
energia, o webOS fechando o aplicativo. Em 08/11 caiu duas vezes no meio do
culto, e da segunda ninguem reabriu por 2 h 40 min.

O QUE O VIGIA OLHA, do mais confiavel para o menos:
  1. A SESSAO NO SUNSHINE. O registro dele (sunshine.log) ganha uma linha
     "CLIENT CONNECTED" quando a TV entra e "CLIENT DISCONNECTED" quando sai.
     A ultima das duas diz se ha retorno no ar. E a verdade de quem transmite.
  2. O QUE ESTA NA TELA DA TV (so quando a decisao depende disso): se nao e
     o Moonlight, alguem trocou de entrada ou abriu outra coisa, talvez de
     proposito.
  3. A TV NA REDE: a porta 3000 dela abre.

A REGRA, FORA DA JANELA DO CULTO (a de 12/11): sem sessao ha mais de
`espera_s`, com a TV ligada e o Moonlight na tela, reabre; mas nunca liga a
TV e nunca abre o retorno se ninguem abriu desde que a ponte subiu.

DENTRO DA JANELA DO CULTO (20/11/2026), o vigia faz o ciclo inteiro sozinho:
  1. fica OLHANDO, de 5 em 5 segundos, se a TV esta na rede. Enquanto nao
     esta, manda "ligar pela rede" (Wake-on-LAN) de tempos em tempos e diz
     "esperando a TV". SEM LIMITE DE TENTATIVAS: aqui ele so olha.
  2. assim que a TV responde (ligada pela rede ou por alguem no controle),
     espera ela assentar e manda abrir o retorno;
  3. so da por certo quando o Sunshine registra "CLIENT CONNECTED".
  Se a TV for desligada e religada no meio do culto, o ciclo recomeca.

O QUE CONTINUA VALENDO SEMPRE:
  - nao mexe quando ha outro aplicativo na tela (alguem usando de proposito);
  - o limite de falhas vale so para ABRIR: a TV responde mas o retorno nao
    conecta. Depois de `max_falhas` ele pede uma pessoa, e volta a tentar no
    proximo ciclo da TV (quando ela sumir e reaparecer).
E SO A MEDIDA PINTA DE VERDE: a tentativa so conta como certa quando o
Sunshine registra a TV de volta. O script terminar sem erro nao basta.

Este modulo nao conhece Flask, PowerShell nem a chegada: recebe funcoes. E
o que deixa testar sem TV (ver _testar_vigia_tv.py).
"""

import datetime
import os
import threading
import time

LOG_PADRAO = r"C:\Program Files\Sunshine\config\sunshine.log"
MOONLIGHT = "com.limelight.webos"
PASSO = 5.0               # segundos entre uma olhada e outra
CONFIRMA_EM = 40.0        # quanto esperar a TV voltar depois de uma tentativa
CAUDA = 512 * 1024        # do registro, so o fim interessa

TEXTOS = {
    "no_ar": "retorno no ar",
    "fechado": "retorno ainda não foi aberto",
    "caiu": "o retorno caiu",
    "reconectando": "o retorno caiu, reconectando",
    "desistiu": "o retorno caiu e não voltou sozinho: abra pelo controle",
    "tv_desligada": "TV desligada",
    "outro_app": "outro aplicativo na TV",
    "pausado": "vigia pausado",
    "fora_da_janela": "o retorno caiu (fora do horário do vigia)",
    "sem_sinal": "não achei o registro do Sunshine neste PC",
    "esperando_tv": "esperando a TV aparecer na rede",
    "abrindo": "a TV apareceu, abrindo o retorno",
}
# Aplicativos da TV que NAO sao "alguem usando de proposito": a tela inicial e
# a TV aberta, que e onde ela cai ao ligar. Com um destes na tela, abrir o
# retorno nao atrapalha ninguem. OS IDS NAO FORAM CONFERIDOS NA TV DA IGREJA.
APPS_LIVRES = ("com.webos.app.home", "com.webos.app.livetv", "com.webos.app.screensaver")


def pacote_de_ligar(mac):
    """O "pacote magico" do Wake-on-LAN: 6 bytes FF e o MAC 16 vezes."""
    limpo = "".join(c for c in str(mac or "") if c in "0123456789abcdefABCDEF")
    if len(limpo) != 12:
        raise ValueError("MAC invalido: {!r}".format(mac))
    return b"\xff" * 6 + bytes.fromhex(limpo) * 16


def ligar_pela_rede(mac, ip=None):
    """Manda a TV ligar (Wake-on-LAN). Nao ha resposta: so se sabe que deu
    certo quando ela aparece na rede.

    NA TV LG isso exige a opcao ligada em Configuracoes > Geral > Dispositivos
    > Dispositivos externos > "Ligar via Wi-Fi" / "LG Connect Apps" (o nome
    muda com o ano do modelo). Pelo Wi-Fi nem toda LG acorda; pelo cabo de
    rede, sim.
    """
    import socket
    pacote = pacote_de_ligar(mac)
    destinos = ["255.255.255.255"]
    if ip and str(ip).count(".") == 3:
        destinos.append(str(ip).rsplit(".", 1)[0] + ".255")   # a rede da TV
        destinos.append(str(ip))
    tomada = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        tomada.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        for destino in destinos:
            for porta in (9, 7):
                try:
                    tomada.sendto(pacote, (destino, porta))
                except OSError:
                    pass
    finally:
        tomada.close()



class LeitorDoSunshine:
    """Acompanha o sunshine.log e guarda o ultimo evento da TV.

    `sessao` e True (a TV esta recebendo), False (saiu) ou None (o registro
    nao existe ou ainda nao disse nada).
    """

    def __init__(self, caminho):
        self._caminho = caminho
        self._lido = 0
        self._resto = b""
        self.sessao = None

    def ler(self):
        try:
            tamanho = os.path.getsize(self._caminho)
        except OSError:
            self.sessao = None
            self._lido = 0
            return None
        if tamanho < self._lido:
            # O arquivo encolheu: o Sunshine reiniciou e comecou um registro
            # novo (o antigo virou .1). Reiniciar derruba a sessao; o registro
            # novo e lido do comeco e diz se a TV ja voltou.
            self._lido = 0
            self._resto = b""
            self.sessao = False
        if tamanho == self._lido:
            if self.sessao is None:
                # O registro existe e esta vazio (o Sunshine acabou de
                # reiniciar): nao ha sessao. Antes isto virava "nao achei o
                # registro", e o vigia ficava parado.
                self.sessao = False
            return self.sessao
        try:
            with open(self._caminho, "rb") as arq:
                comeco = self._lido
                if comeco == 0 and tamanho > CAUDA:
                    comeco = tamanho - CAUDA
                arq.seek(comeco)
                novo = arq.read(tamanho - comeco)
        except OSError:
            return self.sessao
        self._lido = tamanho
        texto = self._resto + novo
        # A ultima linha pode estar pela metade; fica para a proxima leitura.
        corte = texto.rfind(b"\n")
        self._resto = texto[corte + 1:] if corte >= 0 else texto
        inteiro = texto[:corte + 1] if corte >= 0 else b""
        entrou = inteiro.rfind(b"CLIENT CONNECTED")
        saiu = inteiro.rfind(b"CLIENT DISCONNECTED")
        if entrou >= 0 or saiu >= 0:
            self.sessao = entrou > saiu
        elif self.sessao is None:
            # O registro existe e nunca falou da TV: nao ha sessao.
            self.sessao = False
        return self.sessao


def _dentro_da_janela(janela, agora):
    """`janela` e ["18:30", "22:30"] ou nada. Sem janela, sempre dentro."""
    try:
        inicio, fim = [datetime.time(*[int(p) for p in str(h).split(":")[:2]]) for h in janela]
    except (TypeError, ValueError):
        return True
    hora = datetime.datetime.fromtimestamp(agora).time()
    return inicio <= hora <= fim if inicio <= fim else (hora >= inicio or hora <= fim)


class VigiaDaTV:
    def __init__(self, conf, ip_da_tv, na_tela, reabrir, relogio=time.time,
                 dormir=time.sleep, registrar=print, leitor=None,
                 janela_do_culto=None, ligar=None, anotar=None):
        """
        conf        o bloco `vigia_tv` do config.yaml (pode ser vazio)
        ip_da_tv()  -> o IP da TV se ela esta ligada na rede, senao None
        na_tela(ip) -> o id do aplicativo na tela da TV, ou None se ela nao disse
        reabrir()   -> (ok, texto); manda a TV abrir o retorno. Demora.
        janela_do_culto(agora) -> True dentro da janela do culto. Sem isto, o
                    vigia se comporta como antes: nunca abre o que ninguem abriu.
        ligar()     -> manda a TV ligar pela rede. Sem isto, so espera.
        anotar(titulo, ok, detalhe) -> escreve no "Aconteceu agora" do painel.
        """
        conf = conf or {}
        self.ativo = conf.get("ativo", True) is not False
        self._espera = float(conf.get("espera_s", 25))
        self._intervalo = float(conf.get("intervalo_s", 120))
        self._max_falhas = int(conf.get("max_falhas", 3))
        self._janela = conf.get("janela")
        self._abrir_sozinho = conf.get("abrir_sozinho", True) is not False
        self._assentar = float(conf.get("assentar_s", 12))
        self._ligar_a_cada = float(conf.get("ligar_a_cada_s", 30))
        self._entre_aberturas = float(conf.get("entre_aberturas_s", 45))
        self._apps_livres = tuple(conf.get("apps_livres") or APPS_LIVRES)
        self._janela_do_culto = janela_do_culto
        self._ligar = ligar
        self._anotar = anotar
        self._ip_da_tv = ip_da_tv
        self._na_tela = na_tela
        self._reabrir = reabrir
        self._agora = relogio
        self._dormir = dormir
        self._registrar = registrar
        self._leitor = leitor or LeitorDoSunshine(conf.get("log") or LOG_PADRAO)
        self._tranca = threading.Lock()
        self._armado = False          # o retorno ja foi aberto desde que a ponte subiu
        self._sem_sessao_desde = None
        self._ultima_tentativa = None
        self._falhas = 0
        self._desistiu = False
        self._pausado_ate = None
        self._tv_ip = None
        self._tv_presente = None      # None = ainda nao olhei
        self._apareceu_em = None
        self._ultimo_ligar = None
        self._avisou_ligar = False
        self._agora_mesmo = False     # "Tentar de novo": vale como dentro da janela, sem esperas
        self._estado = "sem_sinal"
        self._motivo = ""
        self._desde = self._agora()

    # -- o que os outros leem ------------------------------------------------

    def tv(self):
        """(ligada, ip) pela ultima olhada. E daqui que a chegada tira o
        'TV ligada', em vez de bater na TV outra vez."""
        return self._tv_ip is not None, self._tv_ip

    def retrato(self):
        with self._tranca:
            return {"estado": self._estado, "texto": TEXTOS.get(self._estado, self._estado),
                    "motivo": self._motivo,
                    "desde": int(self._desde), "tentativas": self._falhas,
                    "ultima_tentativa": int(self._ultima_tentativa) if self._ultima_tentativa else None,
                    "pausado": self._esta_pausado(), "no_ar": self._estado == "no_ar",
                    "na_janela": self._na_janela_do_culto(self._agora())}

    # -- o que os outros mandam ----------------------------------------------

    def pausar(self, minutos=None):
        agora = self._agora()
        if minutos:
            ate = agora + max(1.0, min(float(minutos), 24 * 60)) * 60
        else:
            fim = datetime.datetime.fromtimestamp(agora).replace(hour=23, minute=59, second=59)
            ate = fim.timestamp()
        with self._tranca:
            self._pausado_ate = ate
        self._mudar("pausado")

    def retomar(self):
        with self._tranca:
            self._pausado_ate = None
            self._desistiu = False
            self._falhas = 0

    def abriram_na_mao(self):
        """Alguem apertou o botao de abrir o retorno. O vigia passa a cuidar
        dele, e esquece as falhas de antes."""
        with self._tranca:
            self._armado = True
            self._desistiu = False
            self._falhas = 0
            self._ultima_tentativa = self._agora()
            self._sem_sessao_desde = None

    def tentar_agora(self):
        """O botao "Tentar de novo" da chegada: faz o ciclo inteiro ja (ligar
        pela rede, esperar a TV, abrir), mesmo fora da janela do culto."""
        with self._tranca:
            self._agora_mesmo = True
            self._pausado_ate = None
            self._desistiu = False
            self._falhas = 0
            self._ultima_tentativa = None
            self._ultimo_ligar = None
            self._avisou_ligar = False
        self._nota("Tentando abrir o retorno na TV, a pedido", True, "ligar pela rede, esperar a TV, abrir")

    # -- o laco ---------------------------------------------------------------

    def comecar(self):
        threading.Thread(target=self._laco, daemon=True).start()

    def _laco(self):
        while True:
            try:
                self.olhar()
            except Exception as erro:
                # Esta thread nao pode morrer no meio do culto.
                self._registrar("  [retorno] o vigia tropecou: {}".format(str(erro)[:160]))
            self._dormir(PASSO)

    def _esta_pausado(self):
        return self._pausado_ate is not None and self._agora() < self._pausado_ate

    def _na_janela_do_culto(self, agora):
        if self._agora_mesmo:
            return True
        if not self._abrir_sozinho or self._janela_do_culto is None:
            return False
        try:
            return bool(self._janela_do_culto(agora))
        except Exception:
            return False

    def _nota(self, titulo, ok=True, detalhe=""):
        if self._anotar is not None:
            try:
                self._anotar(titulo, ok, detalhe)
            except Exception:
                pass

    def _mudar(self, estado, motivo=""):
        with self._tranca:
            self._motivo = motivo
            if estado != self._estado:
                self._estado = estado
                self._desde = self._agora()

    def olhar(self):
        """Uma olhada: le os sinais, decide e, se for o caso, age."""
        agora = self._agora()
        sessao = self._leitor.ler()
        self._tv_ip = self._ip_da_tv()
        culto = self._na_janela_do_culto(agora)
        estava = self._tv_presente
        self._tv_presente = self._tv_ip is not None
        if self._tv_presente and estava is False:
            # A TV acabou de aparecer: comeca um ciclo novo.
            self._apareceu_em = agora
            with self._tranca:
                self._desistiu = False
                self._falhas = 0
                self._avisou_ligar = False
                self._ultima_tentativa = None
            if culto or self._armado:
                self._nota("TV apareceu na rede", True, self._tv_ip)

        if sessao is None:
            return self._mudar("sem_sinal")
        if sessao:
            if self._estado not in ("no_ar", "sem_sinal"):
                if self._armado:
                    self._registrar("  [retorno] {} a TV voltou a receber o retorno".format(
                        time.strftime("%H:%M:%S", time.localtime(agora))))
                self._nota("Retorno no ar na TV", True, "o Sunshine registrou a TV recebendo")
            with self._tranca:
                self._armado = True
                self._falhas = 0
                self._desistiu = False
                self._sem_sessao_desde = None
                self._agora_mesmo = False
            return self._mudar("no_ar")

        # Daqui para baixo: nao ha sessao no Sunshine.
        if self._estado == "no_ar":
            self._registrar("  [retorno] {} a TV soltou o retorno".format(
                time.strftime("%H:%M:%S", time.localtime(agora))))
            self._nota("A TV soltou o retorno", False, "a sessão caiu do lado da TV")
        if self._sem_sessao_desde is None:
            self._sem_sessao_desde = agora
        if self._esta_pausado():
            return self._mudar("pausado")
        if self._tv_ip is None:
            # A TV sumiu. Quando reaparecer, o vigia volta a tentar do zero.
            with self._tranca:
                self._desistiu = False
                self._falhas = 0
            if not culto:
                return self._mudar("tv_desligada")
            # Dentro da janela do culto: ficar olhando, e mandar ligar de
            # tempos em tempos. Sem limite: aqui o vigia so olha.
            if self._ligar is not None and (self._ultimo_ligar is None
                                            or agora - self._ultimo_ligar >= self._ligar_a_cada):
                self._ultimo_ligar = agora
                try:
                    self._ligar()
                except Exception as erro:
                    self._registrar("  [retorno] nao consegui mandar ligar a TV: {}".format(str(erro)[:120]))
                if not self._avisou_ligar:
                    self._avisou_ligar = True
                    self._nota("Esperando a TV do altar", True, "mandando ligar pela rede até ela aparecer")
            return self._mudar("esperando_tv", "mandando ligar pela rede" if self._ligar is not None
                               else "ligue a TV no controle")
        if not self._armado and not culto:
            return self._mudar("fechado")
        if self._desistiu:
            return self._mudar("desistiu", "a TV responde, mas o retorno não conectou")
        if not culto and not _dentro_da_janela(self._janela, agora):
            return self._mudar("fora_da_janela")

        acabou_de_chegar = self._apareceu_em is not None and agora - self._apareceu_em < self._assentar
        if not self._agora_mesmo:
            if acabou_de_chegar:
                # A TV acabou de ligar: o webOS leva uns segundos para aceitar
                # comando. Mandar cedo demais abre a coisa errada.
                return self._mudar("abrindo", "esperando a TV acabar de ligar")
            # Um retorno que CAIU ganha `espera_s` para voltar sozinho. Um que
            # nunca foi aberto, dentro do culto, nao tem por que esperar.
            if self._armado and agora - self._sem_sessao_desde < self._espera:
                return self._mudar("caiu")
        intervalo = self._entre_aberturas if culto else self._intervalo
        if self._ultima_tentativa is not None and agora - self._ultima_tentativa < intervalo:
            return self._mudar("abrindo" if culto else "caiu", "esperando para tentar de novo")

        # Vai agir. Antes: o que esta na tela da TV?
        try:
            app = self._na_tela(self._tv_ip)
        except Exception:
            app = None
        if app and app != MOONLIGHT and app not in self._apps_livres:
            if self._estado != "outro_app":
                self._nota("Outro aplicativo na TV: não mexi", False, app)
            return self._mudar("outro_app", app)
        # E a TV pode ter voltado sozinha enquanto perguntavamos.
        if self._leitor.ler():
            return self._mudar("no_ar")

        primeira_vez = not self._armado
        self._mudar("abrindo" if primeira_vez else "reconectando", "mandando a TV abrir o retorno")
        self._nota("Abrindo o retorno na TV" if primeira_vez else "Reabrindo o retorno na TV", True,
                   "abrir o Moonlight e entrar neste PC")
        with self._tranca:
            self._ultima_tentativa = self._agora()
        try:
            ok, texto = self._reabrir()
        except Exception as erro:
            ok, texto = False, str(erro)
        voltou = False
        if ok:
            limite = self._agora() + CONFIRMA_EM
            while self._agora() < limite:
                if self._leitor.ler():
                    voltou = True
                    break
                self._dormir(2.0)
        hora = time.strftime("%H:%M:%S", time.localtime(self._agora()))
        if voltou:
            self._registrar("  [retorno] {} {} o retorno e a TV {}".format(
                hora, "abri" if primeira_vez else "reabri", "entrou" if primeira_vez else "voltou"))
            self._nota("Retorno no ar na TV", True, "o Sunshine registrou a TV recebendo")
            with self._tranca:
                self._armado = True
                self._falhas = 0
                self._sem_sessao_desde = None
                self._agora_mesmo = False
            return self._mudar("no_ar")
        with self._tranca:
            self._falhas += 1
            falhas = self._falhas
            if falhas >= self._max_falhas:
                self._desistiu = True
                self._agora_mesmo = False
        self._registrar("  [retorno] {} tentei {} e a TV nao {} ({} de {}): {}".format(
            hora, "abrir" if primeira_vez else "reabrir", "entrou" if primeira_vez else "voltou",
            falhas, self._max_falhas, str(texto)[:120]))
        if falhas >= self._max_falhas:
            self._nota("O retorno não abriu sozinho: abra pelo controle", False,
                       "{} tentativas sem a TV conectar. Tento de novo quando ela for religada.".format(falhas))
            return self._mudar("desistiu", "a TV responde, mas o retorno não conectou")
        self._nota("A TV não conectou ao retorno ({} de {})".format(falhas, self._max_falhas), False, str(texto)[:120])
        return self._mudar("abrindo" if culto else "caiu", "a TV não conectou; tento de novo")
