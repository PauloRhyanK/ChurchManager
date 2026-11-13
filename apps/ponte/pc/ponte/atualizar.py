"""Atualizar este PC com o projeto que a versao web tem.

O QUE FAZ: baixa o pacote, guarda a versao atual numa pasta ao lado
(_versao_anterior), troca os arquivos DO PROJETO e, se a lista de
dependencias mudou, instala. Se algo falhar no caminho, desfaz.

O QUE NUNCA TOCA: config.yaml, maquina.yaml, chegada.yaml, as cenas de luz,
credenciais, a pasta obs/ e o .venv. Ver ponte/versao.py.

QUEM CHAMA: o iniciar.py, ao ligar o PC; e o painel, pelo botao "Atualizar
agora". Nada aqui decide QUANDO atualizar: isso e de quem chama.
"""

import io
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import zipfile

from ponte import versao as mod_versao

ENDERECO_PADRAO = "https://ponte.igrejaparaiso.com.br"
PASTA_ANTERIOR = "_versao_anterior"
MARCA = "_atualizou.json"
PREFIXO = "ponte-do-culto/"
TAMANHO_MAXIMO = 40 * 1024 * 1024


class ErroAtualizacao(Exception):
    pass


def consultar(endereco, timeout=6.0):
    """{"versao": "...", "em": ...} da versao web. Levanta se nao responder."""
    with urllib.request.urlopen(str(endereco).rstrip("/") + "/api/versao", timeout=timeout) as r:
        dados = json.loads(r.read().decode("utf-8"))
    if not isinstance(dados, dict) or not dados.get("versao"):
        raise ErroAtualizacao("a versao web nao disse qual e a versao dela")
    return dados


def _caminho(raiz, relativo):
    return os.path.join(raiz, *relativo.split("/"))


def _baixar(endereco, timeout=60.0):
    url = str(endereco).rstrip("/") + "/api/atualizacao/pacote"
    with urllib.request.urlopen(url, timeout=timeout) as r:
        bruto = r.read(TAMANHO_MAXIMO + 1)
    if len(bruto) > TAMANHO_MAXIMO:
        raise ErroAtualizacao("o pacote e grande demais para ser o projeto")
    arquivos = {}
    with zipfile.ZipFile(io.BytesIO(bruto)) as pacote:
        for item in pacote.infolist():
            nome = item.filename.replace("\\", "/")
            if item.is_dir() or not nome.startswith(PREFIXO):
                continue
            relativo = nome[len(PREFIXO):]
            partes = relativo.split("/")
            # Um nome com ".." ou barra no comeco escreveria fora da pasta.
            if not relativo or any(p in ("", ".", "..") for p in partes) or ":" in relativo:
                raise ErroAtualizacao("o pacote tem um nome de arquivo estranho: " + nome[:80])
            arquivos[relativo] = pacote.read(item)
    if "app.py" not in arquivos or "requirements.txt" not in arquivos:
        raise ErroAtualizacao("o pacote veio sem o projeto dentro")
    return arquivos


def restaurar(raiz):
    """Volta para a versao guardada. True se havia o que voltar."""
    pasta = os.path.join(raiz, PASTA_ANTERIOR)
    marca = os.path.join(raiz, MARCA)
    if not os.path.isdir(pasta):
        return False
    novos = []
    try:
        with open(marca, encoding="utf-8") as arq:
            novos = json.load(arq).get("novos") or []
    except (OSError, ValueError):
        pass
    for relativo in novos:
        try:
            os.remove(_caminho(raiz, relativo))
        except OSError:
            pass
    for pasta_atual, _subpastas, nomes in os.walk(pasta):
        for nome in nomes:
            origem = os.path.join(pasta_atual, nome)
            destino = os.path.join(raiz, os.path.relpath(origem, pasta))
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            shutil.copy2(origem, destino)
    try:
        os.remove(marca)
    except OSError:
        pass
    return True


def confirmar(raiz):
    """A versao nova subiu e ficou no ar: a marca de 'acabei de atualizar' sai.
    A pasta com a versao anterior fica, para quem quiser voltar a mao."""
    try:
        os.remove(os.path.join(raiz, MARCA))
    except OSError:
        pass


def acabou_de_atualizar(raiz):
    return os.path.exists(os.path.join(raiz, MARCA))


def aplicar(endereco, raiz, instalar_dependencias=True):
    """Traz o projeto da versao web. Devolve {"de": ..., "para": ...}.

    Se a versao daqui ja e a de la, nao faz nada e devolve de == para.
    """
    antes = mod_versao.calcular(raiz)
    arquivos = _baixar(endereco)
    do_projeto = {r: c for r, c in arquivos.items() if mod_versao.e_do_projeto(r)}
    # Os arquivos DA IGREJA que vem no pacote (cenas e chegada de exemplo) so
    # entram num PC que ainda nao tem o dele.
    so_se_faltar = {r: c for r, c in arquivos.items()
                    if r in mod_versao.DA_IGREJA and not os.path.exists(_caminho(raiz, r))}

    atuais = set(mod_versao.listar(raiz))
    sobrando = sorted(atuais - set(do_projeto))
    novos = sorted(set(do_projeto) - atuais) + sorted(so_se_faltar)

    anterior = os.path.join(raiz, PASTA_ANTERIOR)
    shutil.rmtree(anterior, ignore_errors=True)
    for relativo in sorted(atuais):
        destino = _caminho(anterior, relativo)
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        shutil.copy2(_caminho(raiz, relativo), destino)
    with open(os.path.join(raiz, MARCA), "w", encoding="utf-8") as arq:
        json.dump({"de": antes, "em": time.time(), "novos": novos}, arq)

    try:
        dependencias_antes = b""
        try:
            with open(_caminho(raiz, "requirements.txt"), "rb") as arq:
                dependencias_antes = arq.read()
        except OSError:
            pass
        for relativo, conteudo in list(do_projeto.items()) + list(so_se_faltar.items()):
            destino = _caminho(raiz, relativo)
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            provisorio = destino + ".novo"
            with open(provisorio, "wb") as arq:
                arq.write(conteudo)
            os.replace(provisorio, destino)
        for relativo in sobrando:
            try:
                os.remove(_caminho(raiz, relativo))
            except OSError:
                pass
        mudou = (dependencias_antes.replace(b"\r\n", b"\n")
                 != do_projeto["requirements.txt"].replace(b"\r\n", b"\n"))
        if instalar_dependencias and mudou:
            feito = subprocess.run(
                [sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "-q",
                 "-r", _caminho(raiz, "requirements.txt")],
                capture_output=True, text=True, timeout=600)
            if feito.returncode != 0:
                raise ErroAtualizacao("nao consegui instalar as dependencias novas: "
                                      + (feito.stderr or feito.stdout or "")[-200:])
    except Exception:
        restaurar(raiz)
        raise

    depois = mod_versao.calcular(raiz)
    if depois == antes:
        confirmar(raiz)
    return {"de": antes, "para": depois}
