"""Os dados do Holyrics sao resgataveis pela API, ou ficam presos nele?

Essa e a pergunta que de fato importa na conversa sobre trocar de programa.
Software fechado assusta por causa de aprisionamento: o medo nao e a licenca,
e perder o acervo.

So leitura. Nao imprime letra nem titulo — so a ESTRUTURA e as contagens, pra
responder "da pra tirar tudo daqui?" sem despejar o acervo da igreja na tela.
"""

import json
import urllib.parse
import urllib.request

import yaml

cfg = yaml.safe_load(open("config.yaml", encoding="utf-8"))["holyrics"]
BASE = "http://{}:{}/api/".format(cfg["host"], cfg["porta"])
TOKEN = urllib.parse.urlencode({"token": str(cfg["token"])})


def chamar(acao, payload=None):
    req = urllib.request.Request(BASE + acao + "?" + TOKEN,
                                 data=json.dumps(payload or {}).encode(),
                                 method="POST")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))


print("=== acervo de musicas ===")
musicas = chamar("GetSongs")["data"]
print("  total de musicas:", len(musicas))
if musicas:
    print("  campos por musica:", ", ".join(sorted(musicas[0].keys())))
    com_letra = sum(1 for m in musicas if m.get("lyrics") or m.get("text"))
    print("  com letra no proprio GetSongs:", com_letra)

print("\n=== uma musica completa traz a letra? ===")
if musicas:
    alvo = musicas[0]["id"]
    detalhe = chamar("GetLyrics", {"id": alvo})["data"]
    campos = sorted(detalhe.keys()) if isinstance(detalhe, dict) else []
    print("  campos de GetLyrics:", ", ".join(campos))
    letra = detalhe.get("lyrics") or detalhe.get("text") or ""
    print("  tamanho da letra:", len(str(letra)), "caracteres")
    print("  tem letra?", bool(str(letra).strip()))

print("\n=== o resto do acervo ===")
for acao, rotulo in [("GetSongGroups", "grupos de musica"),
                     ("GetTexts", "textos"),
                     ("GetThemes", "temas"),
                     ("GetBackgrounds", "fundos"),
                     ("GetSavedPlaylists", "playlists salvas"),
                     ("GetTeams", "equipes"),
                     ("GetMembers", "membros"),
                     ("GetFavorites", "favoritos"),
                     ("GetCustomMessages", "mensagens personalizadas"),
                     ("GetAnnouncements", "avisos")]:
    try:
        dados = chamar(acao).get("data")
        n = len(dados) if isinstance(dados, list) else ("objeto" if dados else 0)
        print("  {:<26} {}".format(rotulo, n))
    except Exception as erro:
        print("  {:<26} nao deu: {}".format(rotulo, str(erro)[:50]))

print("\n=== conclusao ===")
print("  Se os numeros acima sao reais, o acervo sai inteiro pela API,")
print("  sem depender de o Holyrics continuar existindo.")
