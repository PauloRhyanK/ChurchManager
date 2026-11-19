"""Mostra, ao vivo, o que o passador de slides manda para o Windows.

    python descobrir_passador.py

Lista os teclados que o Windows enxerga (o receptor do passador aparece como
um deles) e depois escreve uma linha para cada tecla apertada, dizendo de QUAL
dispositivo ela veio. Aperte cada botao do passador e anote:

  - o trecho VID_xxxx&PID_xxxx da linha dele  -> `passador.dispositivo`
  - o nome da tecla de cada botao             -> `passador.proximo` / `anterior`

So le. Nao muda nada, nao passa slide. Feche com Ctrl+C. So funciona no Windows.
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte import passador


def main():
    if not passador.no_windows():
        print("Este script so funciona no Windows (o PC do Holyrics).")
        return 2
    padrao = passador.Passador({}, lambda para: None)

    def ao_listar(nomes):
        if getattr(ao_listar, "feito", False):
            return
        ao_listar.feito = True
        print("\nTeclados que o Windows enxerga agora:")
        for nome in nomes:
            print("  {} {}".format("-> PASSADOR" if padrao.e_o_passador(nome) else "           ", nome))
        if not any(padrao.e_o_passador(n) for n in nomes):
            print("  (nenhum bate com o Spotlight de fabrica; aperte um botao dele e veja a linha)")
        print("\nAperte os botoes do passador. Ctrl+C para sair.\n")

    def ao_teclar(dispositivo, codigo, apertou):
        if not apertou:
            return
        print("  {}  {:<10} {}  {}".format(
            time.strftime("%H:%M:%S"), passador.nome_da_tecla(codigo),
            "PASSADOR" if padrao.e_o_passador(dispositivo) else "outro   ", dispositivo))

    if not passador.OuvinteDoTeclado(ao_teclar, ao_listar).comecar():
        print("Nao consegui ouvir o teclado.")
        return 1
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
