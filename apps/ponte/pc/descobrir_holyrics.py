"""Descobre quais acoes a API do Holyrics 2.30.0 aceita.

Rodar depois de por o token no config.yaml:

    .venv\\Scripts\\python.exe descobrir_holyrics.py

Ele le host, porta e token da secao holyrics do config.yaml. O token nao entra
por linha de comando de proposito: linha de comando fica em historico de shell
e em log. O script nunca imprime o token, so diz se ele foi aceito.

Da pra passar porta e token na mao, se precisar testar outra coisa:

    .venv\\Scripts\\python.exe descobrir_holyrics.py <porta> [token]

MEDIDO NESTA INSTALACAO (Holyrics 2.30.0, 01/11/2026): a porta 8091 responde
HTTP 401 para qualquer caminho enquanto o token nao bate — acao que existe e
acao inventada dao exatamente a mesma resposta. Entao aqui NAO da pra descobrir
nada sem o token certo. Em servidores que separam "token invalido" de "acao
inexistente", o script ainda consegue trabalhar sem token.

SOBRE CONFIAR NO RESULTADO
--------------------------
Um script assim e uma maquina de falso positivo se ninguem segurar. A primeira
versao deste arquivo declarou 19 acoes existentes que nao existiam: o pedido de
controle tinha falhado com erro de rede, a assinatura de referencia virou a
string do erro, e dai qualquer resposta de verdade parecia "diferente, logo
existe".

Por isso aqui o controle e levado a serio:
  - sao DOIS nomes claramente inventados, nao um;
  - os dois precisam responder, e responder a MESMA coisa;
  - a resposta precisa ser HTTP de verdade, nao erro de conexao;
  - se nada disso valer, o script para e diz que nao aprendeu nada, em vez de
    cuspir uma lista bonita e errada.

Lista vazia e um resultado honesto. Lista errada custa um domingo.

So faz leitura: nenhuma acao desta lista muda o que esta na tela.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

import yaml

# Nomes CANDIDATOS, nao confirmados. O script existe pra separar os que
# existem nesta versao dos que eu so imaginei.
CANDIDATAS = [
    "GetCurrentPresentation", "GetCurrentSong", "GetCurrentSchedule",
    "GetSongs", "GetSong", "SearchSong", "GetSongGroups",
    "GetSchedules", "GetSchedule", "GetNextSong",
    "GetLyrics", "GetMedia", "GetMediaList", "GetFiles",
    "GetBibleBooks", "GetBibleVerses", "GetVerse",
    "GetTeams", "GetMembers", "GetRoles",
    "GetRuntimeEnvironment", "GetVersion", "GetInfo", "GetStatus",
    "GetDisplaySettings", "GetStageView", "GetTransitionEffect",
    "GetAlert", "GetCustomMessages", "GetAutomaticPresentation",
    "GetCommunicationPanelInfo", "GetFavorites", "GetHistory",
    "GetSavedPlaylists", "GetPlaylist", "GetThemes", "GetBackgrounds",
]

CONTROLES = ["AcaoInventada_zzz999", "OutroNomeFalso_qqq111"]
HOSTS = ["127.0.0.1", "192.168.1.143"]

# Textos de exemplo que o config.yaml traz de fabrica. Se o token ainda for um
# deles, nao adianta sair pedindo: o usuario nao colou o token ainda.
EXEMPLOS = ("COLE-AQUI", "TROQUE")


def carregar_config():
    """Le host, porta e token da secao holyrics do config.yaml.

    Devolve (dados, None) ou (None, motivo). O token nunca sai daqui pra tela.
    """
    caminho = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml")
    try:
        with open(caminho, "r", encoding="utf-8") as arquivo:
            cfg = yaml.safe_load(arquivo) or {}
    except Exception as erro:
        return None, "nao consegui ler o config.yaml ({})".format(erro)

    secao = cfg.get("holyrics") or {}
    porta = secao.get("porta")
    if not porta:
        return None, "falta holyrics.porta no config.yaml"

    token = str(secao.get("token") or "")
    if not token:
        return None, "holyrics.token esta vazio no config.yaml"
    if any(token.startswith(exemplo) for exemplo in EXEMPLOS):
        return None, ("holyrics.token ainda e o texto de exemplo — cole o token "
                      "de verdade, que esta no Holyrics em Arquivo > "
                      "Configuracoes > API Server")

    return {"host": secao.get("host") or "127.0.0.1",
            "porta": str(porta), "token": token}, None


def pedir(host, porta, acao, token, metodo):
    """Devolve (codigo_http, corpo). codigo None = nao foi HTTP."""
    url = "http://{}:{}/api/{}".format(host, porta, acao)
    if token:
        url += "?" + urllib.parse.urlencode({"token": token})
    corpo = b"{}" if metodo == "POST" else None
    req = urllib.request.Request(url, data=corpo, method=metodo)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=4) as r:
            return r.status, r.read().decode("utf-8", "replace")[:300]
    except urllib.error.HTTPError as erro:
        return erro.code, erro.read().decode("utf-8", "replace")[:300]
    except Exception as erro:
        return None, str(erro)


def assinatura(corpo):
    """Reduz a resposta ao motivo do erro, que e o que da pra comparar."""
    try:
        dados = json.loads(corpo)
    except ValueError:
        return corpo.strip()[:80]
    if isinstance(dados, dict):
        mapa = dados.get("map", dados)
        if isinstance(mapa, dict):
            ok = str(mapa.get("key_ok", mapa.get("status", ""))).lower()
            erro = str(mapa.get("key_error", mapa.get("error", ""))).lower()
            if ok in ("true", "ok"):
                return "OK"
            return erro or "erro sem motivo"
    return corpo.strip()[:80]


def achar_base(hosts, porta, token):
    """Acha host+metodo onde os DOIS controles respondem HTTP e concordam.

    Devolve {host, metodo, marca, codigo} ou {"motivos": [...]}.
    """
    motivos = []
    for host in hosts:
        for metodo in ("POST", "GET"):
            marcas, codigos = [], []
            for controle in CONTROLES:
                codigo, corpo = pedir(host, porta, controle, token, metodo)
                if codigo is None:
                    motivos.append("{} {} — sem HTTP: {}".format(
                        host, metodo, corpo.split("\n")[0][:60]))
                    marcas = None
                    break
                marcas.append(assinatura(corpo))
                codigos.append(codigo)
            if marcas is None:
                continue
            if marcas[0] != marcas[1]:
                motivos.append("{} {} — os dois controles divergiram: {!r} vs {!r}".format(
                    host, metodo, marcas[0], marcas[1]))
                continue
            return {"host": host, "metodo": metodo,
                    "marca": marcas[0], "codigo": codigos[0]}
    return {"motivos": motivos}


def main():
    if len(sys.argv) >= 2:
        porta = sys.argv[1]
        token = sys.argv[2] if len(sys.argv) > 2 else ""
        hosts = HOSTS
    else:
        dados, motivo = carregar_config()
        if dados is None:
            print("\n" + motivo + "\n")
            return 2
        porta, token = dados["porta"], dados["token"]
        # O host do config primeiro, e o da rede como alternativa: o Holyrics
        # as vezes so escuta no IP da rede.
        hosts = [dados["host"]] + [h for h in HOSTS if h != dados["host"]]

    base = achar_base(hosts, porta, token)
    if "motivos" in base:
        print("\nNao consegui uma base de comparacao confiavel na porta {}.\n".format(porta))
        for motivo in base["motivos"]:
            print("  " + motivo)
        print("\nSem um controle que responda e se repita, qualquer lista que eu")
        print("imprimisse seria chute. O Servidor API esta ligado no Holyrics?\n")
        return 1

    host, metodo = base["host"], base["metodo"]

    # O 401 do Holyrics tem DOIS motivos bem diferentes, e so o texto separa:
    #   "invalid token"       -> o token em si foi recusado
    #   "unauthorized action" -> o token vale, mas essa acao nao foi liberada
    # Olhar so o codigo HTTP confunde os dois e manda consertar a coisa errada.
    if "invalid token" in base["marca"]:
        print("\nO token foi recusado por {}:{}.".format(host, porta))
        print()
        print("Confira holyrics.token no config.yaml contra o que esta no")
        print("Holyrics em Arquivo > Configuracoes > API Server.\n")
        return 1

    print("\nBase: {}:{} via {}".format(host, porta, metodo))
    if "unauthorized" in base["marca"]:
        print("Token ACEITO — o servidor passou a reclamar da acao, nao do token.")
    print("Assinatura de 'acao que nao existe': {!r}\n".format(base["marca"]))

    existem, nao_existem = [], []
    for acao in CANDIDATAS:
        codigo, corpo = pedir(host, porta, acao, token, metodo)
        if codigo is None:
            # Falhou o transporte: nao da pra concluir nada sobre esta acao.
            nao_existem.append(acao + " (sem resposta)")
            continue
        marca = assinatura(corpo)
        if marca == base["marca"]:
            nao_existem.append(acao)
        else:
            existem.append((acao, marca))

    print("=" * 66)
    if not existem and "unauthorized" in base["marca"]:
        # Token valido e TUDO "unauthorized": o token nao tem acao liberada.
        print("O token vale, mas NENHUMA das {} candidatas foi liberada.".format(len(CANDIDATAS)))
        print()
        print("No Holyrics, cada token tem permissao por acao. Um token recem")
        print("criado costuma vir sem nenhuma marcada.")
        print()
        print("Em Arquivo > Configuracoes > API Server, abrir as permissoes desse")
        print("token e liberar as acoes de leitura. Depois rodar isto de novo:")
        print("com algo liberado, da pra ver quais nomes a versao reconhece.")
    elif not existem:
        print("NENHUMA das {} candidatas se diferenciou do controle.".format(len(CANDIDATAS)))
        print()
        print("Ou nenhum desses nomes existe nesta versao, ou o servidor responde")
        print("igual pra acao invalida e token invalido.")
    elif len(existem) == len(CANDIDATAS):
        # Todas "existirem" e implausivel: e sinal de controle furado.
        print("SUSPEITO: todas as {} candidatas pareceram existir.".format(len(CANDIDATAS)))
        print()
        print("Isso quase certamente quer dizer que o controle nao esta medindo o")
        print("que eu acho que mede, e nao que o Holyrics aceita tudo. Nao confie")
        print("nesta lista — me manda a saida que eu investigo.")
        for acao, detalhe in existem[:5]:
            print("  {:<32} {}".format(acao, detalhe))
        print("  ...")
    else:
        print("ACOES QUE EXISTEM ({} de {}):".format(len(existem), len(CANDIDATAS)))
        for acao, detalhe in existem:
            print("  {:<32} {}".format(acao, detalhe))
        print()
        print("Nao reconhecidas ({}): {}".format(len(nao_existem), ", ".join(nao_existem)))
    print("=" * 66)
    print("\nMe manda essa saida que eu monto as cues de letra no config.yaml.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
