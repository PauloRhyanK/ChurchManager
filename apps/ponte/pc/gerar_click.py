"""Gera um click de teste em WAV, sem baixar nada de lugar nenhum.

Para que existe: para testar o caminho inteiro — audio tocando, secoes
andando, luz e letra seguindo — sem depender dos arquivos da igreja nem de
musica com direito autoral. Qualquer um pode rodar e ter um metronomo.

O click nao e o fim: e o andaime. Quando a equipe trouxer o VS de verdade,
troca-se o arquivo e os tempos passam a ser os da gravacao.

Rodar:
    .venv\\Scripts\\python.exe gerar_click.py [bpm] [minutos]
"""

import math
import struct
import sys
import wave

TAXA = 44100
CANAIS = 1
LARGURA = 2          # 16 bits


def _bip(frequencia, duracao, volume):
    """Um bip curto com decaimento — sem o decaimento, estala no fim."""
    quadros = int(TAXA * duracao)
    for i in range(quadros):
        t = i / TAXA
        envelope = math.exp(-t * 28)
        amostra = math.sin(2 * math.pi * frequencia * t) * envelope * volume
        yield int(max(-1.0, min(1.0, amostra)) * 32767)


def gerar(caminho, bpm=100.0, minutos=4.0, tempos_por_compasso=4):
    intervalo = 60.0 / bpm
    total_tempos = int(minutos * 60 / intervalo)
    por_tempo = int(TAXA * intervalo)

    # O acento no tempo 1 e o que deixa o compasso audivel. Sem ele, quem
    # ouve conta os tempos mas perde a conta dos compassos — e compasso e a
    # unidade em que o musico pensa.
    agudo = list(_bip(1760.0, 0.05, 0.85))     # tempo 1
    grave = list(_bip(880.0, 0.04, 0.55))      # demais

    with wave.open(caminho, "wb") as arquivo:
        arquivo.setnchannels(CANAIS)
        arquivo.setsampwidth(LARGURA)
        arquivo.setframerate(TAXA)
        for n in range(total_tempos):
            bip = agudo if n % tempos_por_compasso == 0 else grave
            silencio = por_tempo - len(bip)
            quadros = bip + [0] * max(0, silencio)
            arquivo.writeframes(struct.pack("<{}h".format(len(quadros)), *quadros))

    return total_tempos, total_tempos * intervalo


if __name__ == "__main__":
    bpm = float(sys.argv[1]) if len(sys.argv) > 1 else 100.0
    minutos = float(sys.argv[2]) if len(sys.argv) > 2 else 4.0
    nome = "click-{:g}bpm.wav".format(bpm)
    tempos, segundos = gerar(nome, bpm, minutos)
    print("{}: {:g} bpm, {} tempos, {:.0f}s ({:.0f} compassos de 4)".format(
        nome, bpm, tempos, segundos, tempos / 4))
