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

A REGRA: sem sessao ha mais de `espera_s`, com a TV ligada e o Moonlight na
tela (ou sem a TV dizer o que tem na tela), reabre. O que ele NUNCA faz:
  - ligar a TV;
  - abrir o retorno se ninguem abriu desde que a ponte subiu;
  - mexer quando ha outro aplicativo na tela;
  - insistir: uma tentativa a cada `intervalo_s`, e depois de `max_falhas`
    seguidas ele para e pede uma pessoa.
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
}


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
                 dormir=time.sleep, registrar=print, leitor=None):
        """
        conf        o bloco `vigia_tv` do config.yaml (pode ser vazio)
        ip_da_tv()  -> o IP da TV se ela esta ligada na rede, senao None
        na_tela(ip) -> o id do aplicativo na tela da TV, ou None se ela nao disse
        reabrir()   -> (ok, texto); manda a TV abrir o retorno. Demora.
        """
        conf = conf or {}
        self.ativo = conf.get("ativo", True) is not False
        self._espera = float(conf.get("espera_s", 25))
        self._intervalo = float(conf.get("intervalo_s", 120))
        self._max_falhas = int(conf.get("max_falhas", 3))
        self._janela = conf.get("janela")
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
        self._estado = "sem_sinal"
        self._desde = self._agora()

    # -- o que os outros leem ------------------------------------------------

    def tv(self):
        """(ligada, ip) pela ultima olhada. E daqui que a chegada tira o
        'TV ligada', em vez de bater na TV outra vez."""
        return self._tv_ip is not None, self._tv_ip

    def retrato(self):
        with self._tranca:
            return {"estado": self._estado, "texto": TEXTOS.get(self._estado, self._estado),
                    "desde": int(self._desde), "tentativas": self._falhas,
                    "ultima_tentativa": int(self._ultima_tentativa) if self._ultima_tentativa else None,
                    "pausado": self._esta_pausado(), "no_ar": self._estado == "no_ar"}

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

    def _mudar(self, estado):
        with self._tranca:
            if estado != self._estado:
                self._estado = estado
                self._desde = self._agora()

    def olhar(self):
        """Uma olhada: le os sinais, decide e, se for o caso, age."""
        agora = self._agora()
        sessao = self._leitor.ler()
        self._tv_ip = self._ip_da_tv()

        if sessao is None:
            return self._mudar("sem_sinal")
        if sessao:
            if self._estado not in ("no_ar", "sem_sinal") and self._armado:
                self._registrar("  [retorno] {} a TV voltou a receber o retorno".format(
                    time.strftime("%H:%M:%S", time.localtime(agora))))
            with self._tranca:
                self._armado = True
                self._falhas = 0
                self._desistiu = False
                self._sem_sessao_desde = None
            return self._mudar("no_ar")

        # Daqui para baixo: nao ha sessao no Sunshine.
        if self._estado == "no_ar":
            self._registrar("  [retorno] {} a TV soltou o retorno".format(
                time.strftime("%H:%M:%S", time.localtime(agora))))
        if self._sem_sessao_desde is None:
            self._sem_sessao_desde = agora
        if self._esta_pausado():
            return self._mudar("pausado")
        if self._tv_ip is None:
            # A TV sumiu. Quando reaparecer, o vigia volta a tentar do zero.
            with self._tranca:
                self._desistiu = False
                self._falhas = 0
            return self._mudar("tv_desligada")
        if not self._armado:
            return self._mudar("fechado")
        if self._desistiu:
            return self._mudar("desistiu")
        if not _dentro_da_janela(self._janela, agora):
            return self._mudar("fora_da_janela")
        if agora - self._sem_sessao_desde < self._espera:
            return self._mudar("caiu")
        if self._ultima_tentativa is not None and agora - self._ultima_tentativa < self._intervalo:
            return self._mudar("caiu")

        # Vai agir. Antes: o que esta na tela da TV?
        try:
            app = self._na_tela(self._tv_ip)
        except Exception:
            app = None
        if app and app != MOONLIGHT:
            return self._mudar("outro_app")
        # E a TV pode ter voltado sozinha enquanto perguntavamos.
        if self._leitor.ler():
            return self._mudar("no_ar")

        self._mudar("reconectando")
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
            self._registrar("  [retorno] {} reabri o retorno e a TV voltou".format(hora))
            with self._tranca:
                self._falhas = 0
                self._sem_sessao_desde = None
            return self._mudar("no_ar")
        with self._tranca:
            self._falhas += 1
            falhas = self._falhas
            if falhas >= self._max_falhas:
                self._desistiu = True
        self._registrar("  [retorno] {} tentei reabrir e a TV nao voltou ({} de {}): {}".format(
            hora, falhas, self._max_falhas, str(texto)[:120]))
        return self._mudar("desistiu" if falhas >= self._max_falhas else "caiu")
