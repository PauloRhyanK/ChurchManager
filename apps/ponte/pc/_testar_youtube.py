"""Prova que a ponte consegue escrever na transmissao — SEM MUDAR NADA.

O teste e gravar de volta EXATAMENTE o titulo que ja esta la. Se o YouTube
aceitar, o caminho de escrita esta livre e nada no canal mudou. Se recusar,
aprendemos o motivo sem ter alterado coisa alguma.

E um canal publico com milhares de inscritos; por isso o teste e um no-op e
nao "muda o titulo para TESTE".
"""

from ponte.youtube import ClienteYouTube, ErroYouTube

cliente = ClienteYouTube("_google_oauth.json", "_youtube_token.json")


def retrato(t):
    s = t.get("snippet", {})
    return {
        "titulo": s.get("title"),
        "tamanho_descricao": len(s.get("description") or ""),
        "privacidade": t.get("status", {}).get("privacyStatus"),
        "categoria": s.get("categoryId"),
        "miniaturas": sorted((s.get("thumbnails") or {}).keys()),
    }


print("[1] lendo a transmissao agendada")
antes = cliente.transmissao("upcoming")
if not antes:
    print("  Nao ha transmissao agendada agora. Nada a testar.")
    raise SystemExit(0)

d_antes = retrato(antes)
print("  titulo      : {!r}".format(d_antes["titulo"]))
print("  descricao   : {} caracteres".format(d_antes["tamanho_descricao"]))
print("  privacidade : {}".format(d_antes["privacidade"]))
print("  miniaturas  : {}".format(d_antes["miniaturas"]))

print("\n[2] gravando de volta o MESMO titulo (nenhuma mudanca pretendida)")
try:
    cliente.atualizar(antes, titulo=d_antes["titulo"])
    print("  o YouTube ACEITOU a escrita")
except ErroYouTube as erro:
    print("  o YouTube RECUSOU: {}".format(erro))
    raise SystemExit(1)

print("\n[3] relendo para conferir que nada mudou")
depois = cliente.transmissao("upcoming")
d_depois = retrato(depois) if depois else {}

iguais = True
for campo in ("titulo", "tamanho_descricao", "privacidade", "categoria", "miniaturas"):
    a, b = d_antes.get(campo), d_depois.get(campo)
    marca = "OK   " if a == b else "MUDOU"
    if a != b:
        iguais = False
    print("  {}  {:<18} {!r}{}".format(
        marca, campo, a, "" if a == b else "  ->  {!r}".format(b)))

print()
if iguais:
    print("ESCRITA FUNCIONA, e o canal esta exatamente como estava.")
else:
    print("ATENCAO: alguma coisa mudou. Ver acima.")
