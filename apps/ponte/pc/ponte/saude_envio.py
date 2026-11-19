"""A qualidade do envio da transmissao, numa palavra.

O OBS conta quadros perdidos DESDE QUE A TRANSMISSAO COMECOU. Esse total nao
serve para a tela: uma queda de dois minutos no comeco do culto deixaria a
transmissao "ruim" ate o fim, com tudo ja normal. O que interessa e o que
aconteceu AGORA, entao a conta e sempre a diferenca entre a leitura mais
antiga de uma janela de 30 segundos e a mais nova.

Funcao pura: quem le o OBS e o app.py; aqui so chegam os numeros.
"""

import collections

OSCILANDO_ACIMA_DE = 0.5   # % de quadros perdidos no envio
RUIM_ACIMA_DE = 5.0
CONGESTAO_QUE_OSCILA = 0.5


class SaudeDoEnvio:
    def __init__(self, janela=30.0):
        self._janela = float(janela)
        self._leituras = collections.deque()
        self._reconectando = False
        self._congestao = 0.0
        self._ativo = False

    def ler(self, agora, ativo, perdidos=0, total=0, bytes_=0, congestao=0.0,
            reconectando=False):
        self._ativo = bool(ativo)
        self._reconectando = bool(reconectando)
        try:
            self._congestao = float(congestao or 0.0)
        except (TypeError, ValueError):
            self._congestao = 0.0
        if not ativo:
            self._leituras.clear()
            return
        nova = (float(agora), int(perdidos or 0), int(total or 0), int(bytes_ or 0))
        if self._leituras:
            ultima = self._leituras[-1]
            # Contador que DIMINUIU: a transmissao caiu e voltou, e o OBS
            # recomecou a contagem. Comparar com o antes daria numero negativo.
            if nova[1] < ultima[1] or nova[2] < ultima[2] or nova[3] < ultima[3]:
                self._leituras.clear()
        self._leituras.append(nova)
        while len(self._leituras) > 2 and nova[0] - self._leituras[1][0] >= self._janela:
            self._leituras.popleft()

    def retrato(self):
        if not self._ativo:
            return {"palavra": None, "perdidos_pct": None, "kbps": None}
        pct, kbps = None, None
        if len(self._leituras) >= 2:
            antiga, nova = self._leituras[0], self._leituras[-1]
            quadros = nova[2] - antiga[2]
            if quadros > 0:
                pct = round(100.0 * (nova[1] - antiga[1]) / quadros, 2)
            tempo = nova[0] - antiga[0]
            if tempo > 0:
                kbps = int((nova[3] - antiga[3]) * 8 / 1000.0 / tempo)
        if self._reconectando:
            palavra = "Reconectando"
        elif pct is not None and pct > RUIM_ACIMA_DE:
            palavra = "Ruim"
        elif (pct is not None and pct >= OSCILANDO_ACIMA_DE) or self._congestao > CONGESTAO_QUE_OSCILA:
            palavra = "Oscilando"
        else:
            palavra = "Boa"
        return {"palavra": palavra, "perdidos_pct": pct, "kbps": kbps}
