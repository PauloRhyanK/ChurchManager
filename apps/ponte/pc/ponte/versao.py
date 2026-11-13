"""A versao do projeto: uma impressao digital dos arquivos.

Serve para um PC saber se esta atras do que a versao web tem. NAO e um numero
que alguem lembra de aumentar: e calculada dos proprios arquivos, entao nao
tem como "esquecer de subir a versao".

Entram so os arquivos DO PROJETO. Ficam de fora os DA IGREJA (config, papel
da maquina, cenas de luz e passos da chegada, que cada igreja ajusta) e tudo
que e estado ou lixo de execucao. Assim dois PCs com o mesmo projeto e
configuracoes diferentes tem a mesma versao.

Este arquivo e usado dos dois lados: pelos PCs e pela versao web (que o
carrega da pasta pc/). Por isso nao importa nada alem da biblioteca padrao.
"""

import hashlib
import os

# O que e de cada igreja / de cada maquina. Uma atualizacao NUNCA troca estes.
DA_IGREJA = ("config.yaml", "maquina.yaml", "chegada.yaml", "looks_salvas.yaml", "patch.yaml")
PASTAS_FORA = ("__pycache__", ".venv", "venv", "obs", "_versao_anterior", "_do_instalador",
               ".git", "acervo")
FINAIS_FORA = (".log", ".wav", ".mp3", ".m4a", ".pyc", ".pem", ".key")


def e_do_projeto(relativo):
    """`relativo` com barra normal. True se o arquivo faz parte do projeto."""
    partes = relativo.split("/")
    if any(p in PASTAS_FORA for p in partes[:-1]):
        return False
    nome = partes[-1]
    if len(partes) == 1 and nome in DA_IGREJA:
        return False
    if nome.endswith(FINAIS_FORA) or nome.startswith(".env"):
        return False
    if nome.startswith("_") and nome.endswith(".json"):
        return False
    return True


def listar(raiz):
    """Os arquivos do projeto em `raiz`, como caminhos relativos ordenados."""
    achados = []
    for pasta, subpastas, arquivos in os.walk(raiz):
        subpastas[:] = [d for d in subpastas if d not in PASTAS_FORA]
        for nome in arquivos:
            relativo = os.path.relpath(os.path.join(pasta, nome), raiz).replace(os.sep, "/")
            if e_do_projeto(relativo):
                achados.append(relativo)
    return sorted(achados)


def calcular(raiz):
    """12 caracteres que mudam se qualquer arquivo do projeto mudar."""
    resumo = hashlib.sha256()
    for relativo in listar(raiz):
        resumo.update(relativo.encode("utf-8") + b"\0")
        with open(os.path.join(raiz, *relativo.split("/")), "rb") as arq:
            # Fim de linha do Windows e do Linux contam como iguais: o mesmo
            # projeto baixado de jeitos diferentes nao pode parecer "outro".
            resumo.update(arq.read().replace(b"\r\n", b"\n"))
        resumo.update(b"\0")
    return resumo.hexdigest()[:12]


# ---------------------------------------------------------------------------
# A COMPARACAO QUE VALE: arquivo por arquivo, e so os que a web entrega.
#
# A primeira versao comparava a impressao digital da PASTA INTEIRA. Num PC de
# verdade a pasta tem mais coisa que o projeto (um audio, uma anotacao, um
# arquivo que o Windows cria), e ai o PC se achava "diferente da web" para
# sempre: atualizava, religava, e a faixa de atualizacao continuava la
# (visto em 12/11/2026, na primeira noite de uso). Pior: para "igualar", a
# atualizacao APAGAVA o que nao reconhecia.
#
# Agora a web diz o que ela tem (nome -> impressao de cada arquivo) e o PC
# confere so esses. O que mais houver na pasta nao e da conta de ninguem.
# ---------------------------------------------------------------------------
def impressao(caminho):
    with open(caminho, "rb") as arq:
        return hashlib.sha256(arq.read().replace(b"\r\n", b"\n")).hexdigest()[:16]


def impressoes(raiz):
    """{caminho relativo: impressao} dos arquivos do projeto em `raiz`."""
    return {r: impressao(os.path.join(raiz, *r.split("/"))) for r in listar(raiz)}


def diferentes(raiz, da_web):
    """Os arquivos que a web tem e este PC nao tem igual. [] = em dia."""
    faltam = []
    for relativo, esperada in sorted((da_web or {}).items()):
        partes = relativo.split("/")
        if any(p in ("", ".", "..") for p in partes) or ":" in relativo:
            continue
        caminho = os.path.join(raiz, *partes)
        try:
            if impressao(caminho) != esperada:
                faltam.append(relativo)
        except OSError:
            faltam.append(relativo)
    return faltam
