"""Procura interfaces de luz Art-Net na rede e diz o nome de cada uma.

So LEITURA. Manda um ArtPoll — a pergunta de descoberta que o proprio
protocolo define — e escuta as respostas. Nenhum canal DMX e tocado, nenhuma
luz muda de estado.

Rodar da pasta do projeto:
    .venv\\Scripts\\python.exe descobrir_luzes.py

Se nao achar nada, leia a secao "quando nao acha" no fim deste arquivo.
"""

import socket
import struct
import sys
import time

PORTA = 6454
SEGUNDOS_DE_ESCUTA = 4.0

# ArtPoll: cabecalho + OpCode 0x2000 (little-endian no fio) + versao 14.
# TalkToMe=0 pede resposta so a este poll, sem inscricao em mudancas — e o
# modo mais educado: nao deixa o no mandando pacote sozinho depois.
ART_POLL = b"Art-Net\x00" + struct.pack("<H", 0x2000) + b"\x00\x0e" + b"\x00\x00"

OP_POLL_REPLY = 0x2100


def texto(bruto):
    """Os nomes vem com enchimento de zeros e, as vezes, lixo depois."""
    return bruto.split(b"\x00")[0].decode("latin-1", "replace").strip()


def enderecos_locais():
    try:
        return sorted({info[4][0]
                       for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
                       if not info[4][0].startswith("127.")})
    except socket.gaierror:
        return []


def destinos():
    """Todo broadcast que faz sentido daqui.

    O broadcast dirigido (192.168.1.255) e o que funciona na pratica: o
    255.255.255.255 sai por UMA interface so, escolhida pelo sistema, e numa
    maquina com duas placas pode ser a errada.
    """
    alvos = {"255.255.255.255"}
    for ip in enderecos_locais():
        alvos.add(".".join(ip.split(".")[:3] + ["255"]))   # assume /24, que e o caso aqui
    return sorted(alvos)


def varredura():
    """Um ArtPoll para CADA endereco da faixa local, um a um.

    Existe por causa do Firewall do Windows, e o detalhe vale entender porque
    ele explica metade dos "nao acha nada": o firewall e com estado. Um pacote
    UDP que chega sem ter sido pedido e descartado calado — mas se ESTA maquina
    mandou algo para aquele endereco primeiro, a resposta dele volta por uma
    brecha aberta so para ela.

    Um broadcast nao abre essa brecha de forma confiavel. Perguntar de um em um
    abre, e sem precisar ser administrador para criar regra de firewall. Sao
    254 pacotes de 14 bytes: menos trafego que carregar uma pagina.
    """
    for ip in enderecos_locais():
        base = ip.split(".")[:3]
        for ultimo in range(1, 255):
            yield ".".join(base + [str(ultimo)])


def ler_resposta(pacote, origem):
    if len(pacote) < 207 or pacote[0:8] != b"Art-Net\x00":
        return None
    if struct.unpack("<H", pacote[8:10])[0] != OP_POLL_REPLY:
        return None

    mac = pacote[201:207]
    return {
        "ip": ".".join(str(b) for b in pacote[10:14]),
        "visto_de": origem[0],
        "nome_curto": texto(pacote[26:44]),
        "nome_longo": texto(pacote[44:108]),
        "relatorio": texto(pacote[108:172]),
        "saidas": pacote[173],
        "universos_de_saida": [pacote[18] << 8 | (pacote[19] << 4) | pacote[190 + i]
                               for i in range(min(4, pacote[173]))],
        "mac": "-".join("{:02X}".format(b) for b in mac) if any(mac) else "(nao informado)",
    }


def main():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    try:
        sock.bind(("0.0.0.0", PORTA))
    except OSError as erro:
        print("Nao consegui escutar na porta {}: {}".format(PORTA, erro))
        print("Provavel: a ponte ou o QLC+ ja estao no ar. Feche e rode de novo.")
        return 2

    alvos = destinos()
    print("broadcast em: {}".format(", ".join(alvos)))
    for alvo in alvos:
        try:
            sock.sendto(ART_POLL, (alvo, PORTA))
        except OSError as erro:
            print("  (falhou mandar para {}: {})".format(alvo, erro))

    um_a_um = list(varredura())
    print("e um a um em {} enderecos (para furar o firewall — ver varredura())"
          .format(len(um_a_um)))
    for alvo in um_a_um:
        try:
            sock.sendto(ART_POLL, (alvo, PORTA))
        except OSError:
            pass

    achados = {}
    sock.settimeout(0.5)
    limite = time.time() + SEGUNDOS_DE_ESCUTA
    while time.time() < limite:
        try:
            pacote, origem = sock.recvfrom(1024)
        except socket.timeout:
            continue
        no = ler_resposta(pacote, origem)
        if no:
            achados[no["ip"]] = no
    sock.close()

    print("")
    if not achados:
        print("NENHUM no Art-Net respondeu.")
        print("")
        print("Quando nao acha, e quase sempre uma destas tres:")
        print("  1. O Firewall do Windows bloqueou a RESPOSTA de entrada na UDP 6454.")
        print("     E o caso mais comum, e o mais enganoso: a pergunta sai, a")
        print("     resposta chega na placa e o Windows joga fora em silencio.")
        print("  2. A interface esta numa faixa de IP que esta maquina nao enxerga")
        print("     (a Lumikit sai de fabrica em 192.168.0.30).")
        print("  3. Ela nao esta ligada, ou o cabo de rede esta no switch errado.")
        return 1

    print("{} no(s) Art-Net:".format(len(achados)))
    for no in achados.values():
        print("")
        print("  {}  —  {}".format(no["ip"], no["nome_curto"] or "(sem nome)"))
        print("    nome longo : {}".format(no["nome_longo"]))
        print("    MAC        : {}".format(no["mac"]))
        print("    saidas DMX : {}  universos {}".format(
            no["saidas"], no["universos_de_saida"]))
        if no["relatorio"]:
            print("    diz de si  : {}".format(no["relatorio"]))
        if no["ip"] != no["visto_de"]:
            print("    ATENCAO    : o pacote veio de {}, mas ele se diz {}.".format(
                no["visto_de"], no["ip"]))
            print("                 Use o endereco de onde o pacote VEIO.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
