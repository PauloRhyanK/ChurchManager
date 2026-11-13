"""Liga a ponte e cuida dela: atualiza ao ligar, religa, volta atras.

E O QUE O iniciar-ponte.ps1 EXECUTA (antes ele chamava o app.py direto).

  1. Ao ligar o PC, se a versao web tem um projeto mais novo, traz antes de
     subir. Nao faz isso no PC do som (ele leva a luz: la, so pelo botao) nem
     se um culto parece estar em andamento.
  2. Sobe o app.py. Se ele sair pedindo para religar (codigo 42, que e o que
     o botao "Atualizar agora" faz depois de trocar os arquivos), sobe de novo.
  3. Se a versao nova morrer logo ao subir, volta para a anterior e sobe ela.

Tudo que pode dar errado aqui termina em "sobe o que ja estava": a pior
consequencia de uma atualizacao ruim tem que ser continuar na versao velha.
"""

import json
import os
import subprocess
import sys
import time

RAIZ = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, RAIZ)

RELIGAR = 42
MORREU_CEDO = 45.0      # segundos: menos que isso depois de atualizar = versao ruim
CULTO_RECENTE = 6 * 3600


def _maquina():
    """papel e preferencia de atualizacao, lidos sem depender do PyYAML."""
    dados = {"papel": "holyrics", "atualizar": "", "endereco": ""}
    try:
        with open(os.path.join(RAIZ, "maquina.yaml"), encoding="utf-8") as arq:
            for linha in arq:
                chave, _, valor = linha.partition(":")
                chave, valor = chave.strip(), valor.split("#")[0].strip().strip("\"'")
                if chave in ("papel", "atualizar"):
                    dados[chave] = valor.lower()
                elif chave == "atualizar_de":
                    dados["endereco"] = linha.split(":", 1)[1].split(" #")[0].strip().strip("\"'")
    except OSError:
        pass
    return dados


def _culto_em_andamento():
    """O PC reiniciou no meio de um culto? Entao nao e hora de atualizar."""
    caminho = os.path.join(RAIZ, "_ordem_atual.json")
    try:
        if time.time() - os.path.getmtime(caminho) > CULTO_RECENTE:
            return False
        with open(caminho, encoding="utf-8") as arq:
            return json.load(arq).get("atual") is not None
    except (OSError, ValueError):
        return False


def _atualizar_ao_ligar():
    from ponte import atualizar, versao
    maquina = _maquina()
    if maquina["atualizar"] in ("nunca", "false", "nao", "manual"):
        return
    if maquina["papel"] == "som":
        print("  [atualizacao] PC do som: so pelo botao do painel, nunca ao ligar.")
        return
    if _culto_em_andamento():
        print("  [atualizacao] parece haver um culto em andamento: nao atualizo agora.")
        return
    endereco = maquina["endereco"] or atualizar.ENDERECO_PADRAO
    try:
        la = atualizar.consultar(endereco, timeout=4.0)["versao"]
        aqui = versao.calcular(RAIZ)
        if la == aqui:
            return
        print("  [atualizacao] ha uma versao nova ({} -> {}). Trazendo...".format(aqui, la))
        feito = atualizar.aplicar(endereco, RAIZ)
        print("  [atualizacao] pronto: agora na versao {}.".format(feito["para"]))
    except Exception as erro:
        # Sem internet, web fora do ar, pacote estranho: sobe o que ja estava.
        print("  [atualizacao] nao deu ({}). Sigo com a versao que ja estava.".format(
            str(erro)[:120]))


def main():
    try:
        _atualizar_ao_ligar()
    except Exception as erro:
        print("  [atualizacao] ignorada: {}".format(erro))
    while True:
        from ponte import atualizar
        recem = atualizar.acabou_de_atualizar(RAIZ)
        comeco = time.time()
        codigo = subprocess.call([sys.executable, os.path.join(RAIZ, "app.py")], cwd=RAIZ,
                                 env=dict(os.environ, PONTE_INICIADA_PELO_LANCADOR="1"))
        durou = time.time() - comeco
        if codigo == RELIGAR:
            continue
        if recem and codigo != 0 and durou < MORREU_CEDO:
            print("\n  [atualizacao] a versao nova nao subiu. Voltando para a anterior...")
            if atualizar.restaurar(RAIZ):
                continue
        return codigo


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
