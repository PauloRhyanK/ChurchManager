"""Liga este PC (o principal) a versao web: poe a chave no config.yaml.

POR QUE EXISTE. Ligar a igreja a web era "abra o config.yaml, ache o bloco
web, troque duas linhas, abra o chegada.yaml, troque mais uma". Tres lugares
para errar, e um erro de indentacao derruba a ponte. Aqui a pessoa so
DIGITA A CHAVE; o resto e conferido e escrito por este arquivo.

O QUE FAZ:
  1. confere a chave com a propria versao web, na hora (chave errada nao
     chega a ser gravada)
  2. no config.yaml, bloco `web`: ativo: true e a chave
  3. no chegada.yaml: endereco_no_ar: true
So mexe nessas linhas. Comentarios e todo o resto ficam como estao.

COMO E CHAMADO:
  - pelo instalador (configurar-este-pc.ps1), que entrega a chave na variavel
    de ambiente PONTE_CHAVE_NOVA: nada de chave em linha de comando;
  - a mao, pelo ligar-web.bat: ai ele pergunta.
  - com --conferir: so diz se este PC ja esta ligado (saida 0) ou nao (1).

SAIDAS: 0 ligado · 2 chave recusada pela web · 3 nao deu para gravar
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.abspath(__file__))
ENDERECO_PADRAO = "https://ponte.igrejaparaiso.com.br"
CHAVE_OK = re.compile(r"^[A-Za-z0-9_\-]{24,128}$")


def _ler(nome):
    with open(os.path.join(RAIZ, nome), encoding="utf-8") as arq:
        return arq.read()


def _gravar(nome, texto):
    caminho = os.path.join(RAIZ, nome)
    provisorio = caminho + ".novo"
    with open(provisorio, "w", encoding="utf-8", newline="") as arq:
        arq.write(texto)
    os.replace(provisorio, caminho)


def bloco_web(texto):
    """(inicio, fim) das linhas do bloco `web:` de primeiro nivel, ou None."""
    linhas = texto.splitlines(keepends=True)
    inicio = next((i for i, l in enumerate(linhas) if re.match(r"^web:\s*(#.*)?$", l.rstrip("\r\n"))), None)
    if inicio is None:
        return linhas, None, None
    fim = len(linhas)
    for i in range(inicio + 1, len(linhas)):
        if re.match(r"^[^\s#]", linhas[i]):
            fim = i
            break
    return linhas, inicio, fim


def estado(texto):
    """{"ativo": bool, "url": str, "chave": str} do bloco web."""
    linhas, inicio, fim = bloco_web(texto)
    dados = {"ativo": False, "url": ENDERECO_PADRAO, "chave": ""}
    if inicio is None:
        return dados
    for linha in linhas[inicio + 1:fim]:
        achado = re.match(r"^  (ativo|url|chave):\s*(.*?)\s*(?:#.*)?$", linha.rstrip("\r\n"))
        if not achado:
            continue
        valor = achado.group(2).strip().strip("\"'")
        if achado.group(1) == "ativo":
            dados["ativo"] = valor.lower() in ("true", "sim", "yes", "on")
        else:
            dados[achado.group(1)] = valor
    return dados


def com_a_chave(texto, chave):
    """O config.yaml com `ativo: true` e a chave no bloco web."""
    linhas, inicio, fim = bloco_web(texto)
    fim_de_linha = "\r\n" if "\r\n" in texto else "\n"
    if inicio is None:
        if texto and not texto.endswith(("\n", "\r")):
            texto += fim_de_linha
        return texto + fim_de_linha.join([
            "", "web:", "  ativo: true", "  url: " + ENDERECO_PADRAO,
            '  chave: "{}"'.format(chave), ""])
    vistos = set()
    for i in range(inicio + 1, fim):
        achado = re.match(r"^  (ativo|chave):", linhas[i])
        if not achado:
            continue
        final = "\r\n" if linhas[i].endswith("\r\n") else "\n" if linhas[i].endswith("\n") else ""
        vistos.add(achado.group(1))
        linhas[i] = ("  ativo: true" if achado.group(1) == "ativo"
                     else '  chave: "{}"'.format(chave)) + final
    faltam = [l for nome, l in (("ativo", "  ativo: true"), ("chave", '  chave: "{}"'.format(chave)))
              if nome not in vistos]
    for linha in reversed(faltam):
        linhas.insert(inicio + 1, linha + fim_de_linha)
    return "".join(linhas)


def com_o_endereco_no_ar(texto):
    novo, quantas = re.subn(r"(?m)^endereco_no_ar:[ \t]*\S+", "endereco_no_ar: true", texto)
    if quantas:
        return novo
    fim_de_linha = "\r\n" if "\r\n" in texto else "\n"
    return texto + ("" if texto.endswith(("\n", "\r")) else fim_de_linha) + "endereco_no_ar: true" + fim_de_linha


def conferir_na_web(endereco, chave, timeout=8.0):
    """True = a web aceita a chave; False = recusa; None = nao deu para saber."""
    pedido = urllib.request.Request(
        str(endereco).rstrip("/") + "/api/espelho", data=b"{}", method="POST",
        headers={"Content-Type": "application/json", "X-Ponte-Chave": chave})
    try:
        urllib.request.urlopen(pedido, timeout=timeout).read()
        return True
    except urllib.error.HTTPError as erro:
        # 400 = "chave certa, mas voce nao mandou o retrato": e o que queremos.
        return True if erro.code == 400 else False if erro.code == 403 else None
    except Exception:
        return None


def main(argumentos):
    try:
        config = _ler("config.yaml")
    except OSError:
        print("    Este PC ainda nao tem config.yaml. Rode o configurar-este-pc primeiro.")
        return 3
    atual = estado(config)
    ligado = atual["ativo"] and bool(CHAVE_OK.match(atual["chave"]))
    if "--conferir" in argumentos:
        return 0 if ligado else 1

    chave = os.environ.get("PONTE_CHAVE_NOVA", "").strip()
    perguntou = False
    if not chave:
        perguntou = True
        print()
        print("    LIGAR ESTE PC A VERSAO WEB")
        print("    A chave fica na VPS. E uma frase de palavras com hifen, tudo minusculo.")
        if ligado:
            print("    (Este PC ja esta ligado. Digitar outra chave troca a que esta la.)")
        chave = input("    Digite a chave (ENTER = desistir): ").strip().strip("\"'")
        if not chave:
            return 1
    if not CHAVE_OK.match(chave):
        print("    Essa chave esta com formato estranho: tem que ter 24 letras ou mais,")
        print("    so letras, numeros e hifen, sem espaco. Confira e tente de novo.")
        return 2

    aceita = conferir_na_web(atual["url"] or ENDERECO_PADRAO, chave)
    if aceita is False:
        print("    A versao web RECUSOU essa chave. Nada foi gravado.")
        print("    Confira letra por letra com a que esta na VPS.")
        return 2

    try:
        _gravar("config.yaml", com_a_chave(config, chave))
        try:
            _gravar("chegada.yaml", com_o_endereco_no_ar(_ler("chegada.yaml")))
        except OSError:
            pass
    except OSError as erro:
        print("    Nao consegui gravar o config.yaml: {}".format(erro))
        return 3

    if aceita is None:
        print("    Chave gravada, mas NAO consegui falar com a versao web para conferir.")
        print("    Este PC esta com internet? Se a chave estiver errada, o painel avisa.")
    else:
        print("    Chave conferida com a versao web e gravada.")
    if perguntou:
        print("    Feche a janela preta da ponte e abra de novo para valer.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
