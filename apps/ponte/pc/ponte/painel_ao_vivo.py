"""O que o painel do culto ao vivo tem a mais que o painel antigo.

O app.py monta o retrato de sempre e chama `completar()`, que SO ACRESCENTA:
nenhuma chave antiga some nem muda de sentido. E o que deixa o painel.html
antigo (e uma versao web antiga) continuar funcionando contra este codigo.

As acoes novas tambem moram aqui, e continuam sendo UMA LISTA FECHADA. Nao
ha "rode isto": cada acao diz exatamente o que faz, e a web so pode pedir as
duas de ACOES_DA_WEB. Passar slide pela web esta fora de proposito: entre o
toque e o telao haveria ate 4 segundos.

Este arquivo nao importa o app.py. Tudo que precisa dele chega em `dep`, um
dicionario de funcoes; e isso que deixa testa-lo sem subir servidor nenhum.
"""

import time

from . import agenda as mod_agenda
from . import repertorio as mod_repertorio
from . import roteiro as mod_roteiro

VERSAO_DO_PAINEL = 2

ACOES = (
    "cena_transmissao", "clima", "luz_seguir",
    "louvor_assumir", "louvor_devolver", "louvor_segurar", "louvor_slide", "louvor_parte",
    "louvor_repetir_refrao", "louvor_musica", "louvor_comecou", "louvor_acertar",
    "imagem",
    "palavra_slide", "palavra_assumir", "palavra_tirar", "pregador_link",
    "telao_slide",
    "roteiro_ir", "musico_link",
)
ACOES_DA_WEB = ("cena_transmissao", "clima", "roteiro_ir")

DISCO_AMARELO_GB = 20
DISCO_VERMELHO_GB = 5
ESPELHO_LENTO_MS = 1500
ESPELHO_CAIU_S = 20

# sistema do retrato antigo -> (frase quando para, frase quando volta)
VIRADAS = {
    "Transmissão": ("O OBS parou de responder", "O OBS voltou"),
    "Telão": ("O Holyrics parou de responder", "O Holyrics voltou"),
    "Luz": ("O PC do som parou de buscar a luz", "O PC do som voltou a buscar a luz"),
    "Retorno na TV": ("O retorno na TV caiu", "O retorno na TV voltou"),
}


class PainelAoVivo:
    def __init__(self, dep):
        self._d = dep
        self._agora = dep.get("agora") or time.time
        self._antes = {}          # nome do sistema -> estado da ultima olhada
        self._visto_no_roteiro = None   # (momento, musica) da ultima vez que o roteiro foi acertado
        self._internet_antes = None

    def _dep(self, nome, padrao=None):
        valor = self._d.get(nome)
        if valor is None:
            return padrao
        try:
            return valor() if callable(valor) else valor
        except Exception:
            return padrao

    # -- luz ------------------------------------------------------------------

    def tabela(self):
        motor = self._dep("motor")
        modos = []
        if motor is not None:
            try:
                modos = [m["id"] for m in motor.catalogo() if not m.get("perigoso")]
            except Exception:
                modos = []
        cenas = [str(n) for n in (self._dep("looks") or {}) if str(n) != "apagar"]
        return mod_repertorio.tabela_de_climas(self._dep("config") or {}, cenas, modos)

    def aplicar_luz(self, cena, modo):
        """Cena primeiro, movimento depois: o movimento modula o que a cena
        pos no ar, e na ordem inversa havia um instante com o movimento sobre
        a cena velha."""
        cliente = self._dep("luz")
        if cliente is None:
            raise RuntimeError("a luz está desligada neste PC")
        look = (self._dep("looks") or {}).get(str(cena))
        if look is None:
            raise RuntimeError("essa cena de luz não existe mais")
        motor = self._dep("motor")
        modo = str(modo or "parado")
        if motor is not None and modo != "parado":
            if any(m["id"] == modo and m.get("perigoso") for m in motor.catalogo()):
                raise RuntimeError("esse movimento só pode ser ligado no estúdio de luz")
        canais = {numero: 0 for numero in range(1, 513)}
        for canal, valor in look.items():
            canais[int(canal)] = int(valor)
        cliente.aplicar(canais)
        marcar = self._d.get("luz_escolhida")
        if marcar:
            marcar(str(cena))
        if motor is not None:
            motor.escolher(None if modo == "parado" else modo)
            try:
                cliente.reenviar()
            except Exception:
                pass

    def luz_da_parte(self, parte):
        """O que o condutor chama quando a musica entra numa parte."""
        luz = parte.get("luz") or {}
        if parte.get("clima"):
            for item in self.tabela():
                if item["id"] == parte["clima"]:
                    luz = {"cena": item["cena"], "modo": item["modo"]}
        if luz.get("cena"):
            self.aplicar_luz(luz["cena"], luz.get("modo"))

    def momentos_do_louvor(self):
        config = self._dep("config") or {}
        momentos = (config.get("painel") or {}).get("momento_do_louvor") or ["louvor"]
        if not isinstance(momentos, (list, tuple)):
            momentos = [momentos]
        return [str(m) for m in momentos]

    def momento_mudou(self, momento_id):
        """O culto saiu do louvor: o condutor larga a letra e a luz.

        Sem isto, uma musica que ficou contando o tempo continuaria trocando
        a luz no meio da pregacao.
        """
        condutor = self._dep("condutor")
        if condutor is None or not condutor.tem_musica():
            return
        if str(momento_id) in self.momentos_do_louvor():
            return
        condutor.encerrar()
        anotar = self._d.get("anotar")
        if anotar:
            anotar("Louvor encerrado", True, "a letra e a luz voltaram para a mão", "ponte")

    def luz_mexida(self):
        """Alguem trocou a luz pelo painel: se ha musica, o condutor larga."""
        condutor = self._dep("condutor")
        if condutor is not None:
            condutor.luz_na_mao()

    # -- pedacos do retrato ---------------------------------------------------

    def _agenda(self, ordem):
        cues = self._dep("cues") or {}
        momentos = []
        for m in ordem.get("momentos") or []:
            minutos, antes = mod_agenda.minutos_de(m["id"], cues.get(m["id"]))
            momentos.append({"id": m["id"], "minutos": minutos, "antes": antes})
        return mod_agenda.calcular(self._dep("hora_do_culto"), momentos, ordem.get("atual"),
                                   self._dep("entradas") or {}, self._agora())

    def internet(self):
        """{"estado": "boa" | "lenta" | "caiu", "detalhe"} ou None se nao ha
        como saber (sem a web ligada e sem transmissao)."""
        espelho = self._dep("espelho")
        saude = self._dep("saude")
        palavra = saude.retrato()["palavra"] if saude is not None else None
        envio_ruim = palavra in ("Oscilando", "Ruim", "Reconectando")
        if espelho is None:
            if palavra is None:
                return None
            return {"estado": "lenta" if envio_ruim else "boa",
                    "detalhe": "pela qualidade do envio da transmissão"}
        if espelho.get("ok") is False:
            ultimo = espelho.get("em")
            if ultimo is None or self._agora() - ultimo > ESPELHO_CAIU_S:
                return {"estado": "caiu", "detalhe": "sem contato com a versão web"}
            return {"estado": "lenta", "detalhe": "a versão web demorou a responder"}
        ms = espelho.get("ms")
        if (ms is not None and ms > ESPELHO_LENTO_MS) or envio_ruim:
            return {"estado": "lenta", "detalhe": "a transmissão está oscilando" if envio_ruim
                    else "a versão web demorou {:.1f} s para responder".format(ms / 1000.0)}
        return {"estado": "boa", "detalhe": ""}

    def _equipamentos(self, base, internet):
        agora = self._agora()
        itens = [{"nome": base.get("maquina") or "PC do telão", "estado": "ligado", "cor": "verde"}]
        vistas = {m.get("papel"): m for m in (base.get("maquinas") or []) if not m.get("esta")}
        config = self._dep("config") or {}

        obs_ligado = bool((config.get("obs") or {}).get("ativo")) or self._dep("simulacao", False)
        notebook = vistas.get("transmissao")
        if notebook is not None or obs_ligado:
            vivo = bool(notebook and notebook.get("viva")) or base.get("transmissao") is not None
            itens.append({"nome": (notebook or {}).get("nome") or "Notebook da transmissão",
                          "estado": "ligado" if vivo else "sem contato",
                          "cor": "verde" if vivo else "vermelho"})

        som = vistas.get("som")
        visto = self._dep("luz_vista")
        luz_buscada = bool(visto and agora - visto < 12)
        luz_por_agente = (config.get("luzes") or {}).get("driver") == "agente"
        if som is not None or luz_por_agente:
            vivo = bool(som and som.get("viva")) or luz_buscada
            itens.append({"nome": (som or {}).get("nome") or "PC do som",
                          "estado": "ligado" if vivo else "sem contato",
                          "cor": "verde" if vivo else "vermelho"})

        vigia = base.get("retorno_tv")
        if vigia:
            estado = vigia.get("estado")
            if estado == "no_ar":
                itens.append({"nome": "TV do altar", "estado": "retorno aberto", "cor": "verde"})
            elif estado in ("caiu", "reconectando", "desistiu", "fora_da_janela", "esperando_tv", "abrindo",
                            "outro_app"):
                itens.append({"nome": "TV do altar", "estado": str(vigia.get("texto") or "retorno caiu").lower(),
                              "cor": "vermelho" if estado in ("caiu", "desistiu") else "ambar"})
            else:
                itens.append({"nome": "TV do altar", "estado": str(vigia.get("texto") or "sem leitura").lower(),
                              "cor": "cinza"})
        telas = base.get("telas")
        if telas and telas.get("suportado"):
            cor = {"ok": "verde", "mudou": "vermelho", "sunshine_sem_tela": "vermelho"}.get(telas["estado"], "cinza")
            itens.append({"nome": "Telas deste PC", "cor": cor,
                          "estado": {"ok": "como foi guardado", "mudou": "mudaram",
                                     "sunshine_sem_tela": "a tela do retorno sumiu",
                                     "sem_referencia": "sem disposição guardada"}.get(telas["estado"], "sem leitura")})
        if internet is not None:
            itens.append({"nome": "Internet", "estado": internet["estado"],
                          "cor": {"boa": "verde", "lenta": "ambar", "caiu": "vermelho"}[internet["estado"]]})
        return itens

    def _transmissao(self, transmissao):
        obs = self._dep("estado_obs") or {}
        nome_de_cena = self._d.get("nome_de_cena") or (lambda nome: nome)
        config_obs = (self._dep("config") or {}).get("obs") or {}
        todas = [str(c) for c in (obs.get("cenas") or [])]
        escolhidas = [str(c) for c in (config_obs.get("cenas_do_painel") or []) if str(c) in todas]
        transmissao["cenas"] = [{"id": c, "nome": nome_de_cena(c), "no_ar": c == obs.get("no_ar")}
                                for c in (escolhidas or todas)]
        medidor = self._dep("medidor")
        transmissao["audios"] = medidor.retrato(config_obs.get("audios")) if medidor is not None else []
        saude = self._dep("saude")
        qualidade = saude.retrato() if saude is not None else {"palavra": None, "perdidos_pct": None, "kbps": None}
        yt = transmissao.get("youtube") or {}
        qualidade["youtube"] = yt.get("saude")
        qualidade["youtube_lido_em"] = yt.get("lido_em")
        disco = obs.get("disco_mb")
        disco_gb = int(disco / 1024) if isinstance(disco, (int, float)) else None
        transmissao["numeros"] = {
            "assistindo": yt.get("assistindo"),
            "assistindo_lido_em": yt.get("lido_em"),
            "qualidade": qualidade,
            "gravacao_ms": obs.get("gravacao_ms"),
            "disco_gb": disco_gb,
            "disco_cor": None if disco_gb is None else (
                "vermelho" if disco_gb < DISCO_VERMELHO_GB else
                "ambar" if disco_gb < DISCO_AMARELO_GB else "normal"),
        }
        return transmissao

    def _cores(self, cena):
        looks = self._dep("looks") or {}
        grupos = (self._dep("config") or {}).get("grupos_de_luz") or {}
        return mod_repertorio.cores_da_cena(looks.get(cena) or looks.get(str(cena)), grupos)

    def _climas(self, luz):
        motor = self._dep("motor")
        modo = "parado"
        if motor is not None:
            try:
                modo = motor.atual() or "parado"
            except Exception:
                modo = "parado"
        # Para a tela MOSTRAR a luz: as cores que a cena acende e o nome do
        # movimento, em vez de so o nome do clima.
        movimentos = {"parado": "Parado"}
        if motor is not None:
            try:
                movimentos.update({m["id"]: m["nome"] for m in motor.catalogo()})
            except Exception:
                pass
        climas = []
        for item in self.tabela():
            climas.append({"id": item["id"], "nome": item["nome"], "disponivel": item["disponivel"],
                           "cores": self._cores(item["cena"]),
                           "movimento": movimentos.get(item["modo"]) or item["modo"],
                           "modo": item["modo"],
                           "ativo": bool(item["disponivel"] and luz.get("cena") == item["cena"]
                                         and modo == item["modo"])})
        return climas

    # -- o retrato inteiro ----------------------------------------------------

    def completar(self, base):
        ordem = base.get("ordem") or {}
        internet = self.internet()
        base["versao_do_painel"] = VERSAO_DO_PAINEL
        base["agora"] = self._agora()
        base["simulacao"] = bool(self._dep("simulacao", False))
        base["agenda"] = self._agenda(ordem)
        base["internet"] = internet
        base["equipamentos"] = self._equipamentos(base, internet)
        if base.get("transmissao") is not None:
            base["transmissao"] = self._transmissao(base["transmissao"])
        condutor = self._dep("condutor")
        louvor = condutor.retrato() if condutor is not None else None
        if base.get("luz") is not None:
            base["luz"]["climas"] = self._climas(base["luz"])
            for cena in base["luz"].get("cenas") or []:
                cena["cores"] = self._cores(cena["id"])
            base["luz"]["seguindo"] = bool(louvor and louvor["musica"] and louvor["luz"] == "seguindo")
        if louvor is not None:
            louvor["no_momento"] = ordem.get("atual_id") in self.momentos_do_louvor()
        base["louvor"] = louvor
        repertorio = self._dep("repertorio")
        base["conteudo_versao"] = self._versao_do_conteudo()
        imagem = self._dep("imagem")
        base["imagem"] = {"disponivel": imagem is not None, "ativa": bool(imagem and imagem.ativo)}
        base["palavra"] = self._palavra(ordem, base["agenda"])
        telao = self._dep("telao")
        base["telao_ao_vivo"] = telao.retrato() if telao is not None else None
        passador = self._dep("passador")
        base["passador"] = passador.retrato() if passador is not None else None
        # O roteiro com as musicas intercaladas so aparece para o operador
        # quando vem do ChurchManager; sem ele a tela segue a ordem do culto.
        roteiro = self._roteiro_em_dia()
        base["roteiro"] = roteiro.retrato() if roteiro is not None and roteiro.origem == "cultos" else None
        musico = self._dep("musico")
        base["musico"] = None
        if musico is not None:
            link = musico.link.retrato()
            # A tela do musico viaja junto so enquanto ha link: e dela que a
            # versao web tira o que mostrar no celular.
            base["musico"] = {"link": link, "tela": musico.tela() if link else None}
        transporte = self._dep("transporte")
        base["vs"] = transporte.retrato() if transporte is not None else None
        return base

    # -- o roteiro (momentos e musicas intercalados) ---------------------------

    def _roteiro_em_dia(self):
        """Carrega a fila (do ChurchManager, ou montada aqui) e acerta o
        ponteiro quando o culto andou por outro caminho (o operador trocou de
        momento ou de musica pelo painel)."""
        roteiro = self._dep("roteiro")
        if roteiro is None:
            return None
        repertorio = self._dep("repertorio")
        ordem = self._dep("ordem_agora") or {}
        do_cultos = repertorio.roteiro() if repertorio is not None and hasattr(repertorio, "roteiro") else None
        versao = repertorio.versao() if repertorio is not None else ""
        if do_cultos:
            roteiro.carregar(do_cultos, "cultos", ("cultos", versao, repr([(i["tipo"], i["id"]) for i in do_cultos])))
        else:
            momentos = ordem.get("momentos") or []
            cues = self._dep("cues") or {}
            roteiro.carregar(
                mod_roteiro.do_local(momentos, repertorio.musicas() if repertorio is not None else [],
                                     self.momentos_do_louvor(),
                                     lambda cue_id: mod_agenda.minutos_de(cue_id, cues.get(cue_id))[0]),
                "local", ("local", ordem.get("id"), tuple(m["id"] for m in momentos), versao))
        condutor = self._dep("condutor")
        musica = (condutor.retrato().get("musica") or {}).get("id") if condutor is not None else None
        visto = (ordem.get("atual_id"), musica)
        if visto != self._visto_no_roteiro:
            self._visto_no_roteiro = visto
            alvo = None
            if musica is not None:
                alvo = roteiro.achar("musica", musica)
            elif visto[0] is not None:
                for indice, item in enumerate(roteiro.itens()):
                    if item["tipo"] == "momento" and self._cue_do_item(item) == visto[0]:
                        alvo = indice
                        if roteiro.atual() is None or indice >= roteiro.atual():
                            break
            if alvo is not None:
                roteiro.ir(alvo)
        return roteiro

    def _cue_do_item(self, item):
        config = self._dep("config") or {}
        return mod_roteiro.achar_cue(item, self._dep("cues") or {}, (config.get("roteiro") or {}).get("momentos"),
                                     self._momentos_da_palavra(), self.momentos_do_louvor())

    def entrar_no_item(self, indice, quem, soltar_vs=False):
        """Leva o culto para um item do roteiro e FAZ o que ele pede: num
        momento, troca camera e luz (a cue dele); numa musica, entra no louvor
        e poe a letra no telao. `soltar_vs` manda o audio comecar.

        Devolve (corpo, codigo_http)."""
        roteiro = self._roteiro_em_dia()
        if roteiro is None:
            return {"erro": "o roteiro não está disponível neste PC"}, 400
        try:
            indice = int(indice)
        except (TypeError, ValueError):
            return {"erro": "item desconhecido do roteiro"}, 400
        item = roteiro.ir(indice)
        if item is None:
            return {"erro": "item desconhecido do roteiro"}, 404
        condutor, transporte = self._dep("condutor"), self._dep("transporte")
        ir_para_cue = self._d.get("ir_para_cue")
        ordem = self._dep("ordem_agora") or {}
        detalhe, ok = "tudo certo", True
        if item["tipo"] == "musica":
            if ordem.get("atual_id") not in self.momentos_do_louvor() and ir_para_cue is not None:
                cues = self._dep("cues") or {}
                louvor = next((c for c in self.momentos_do_louvor() if c in cues), None)
                if louvor is not None:
                    ir_para_cue(louvor)
            if condutor is not None:
                corpo, codigo = condutor.ir_musica(item["id"])
                if codigo != 200:
                    ok, detalhe = False, corpo.get("erro") or "a música não entrou"
                elif corpo.get("ok") is False:
                    ok, detalhe = False, corpo.get("detalhe") or ""
                elif soltar_vs and transporte is not None:
                    transporte.tocar(item["id"], 0.0, item["nome"])
        else:
            if condutor is not None and condutor.tem_musica():
                condutor.encerrar()
                if transporte is not None:
                    transporte.parar()
            cue = self._cue_do_item(item)
            if cue is not None and ir_para_cue is not None and ordem.get("atual_id") != cue:
                resultado = ir_para_cue(cue)
                if isinstance(resultado, dict) and resultado.get("ok") is False:
                    ok, detalhe = False, resultado.get("detalhe") or ""
        ordem = self._dep("ordem_agora") or {}
        musica = (condutor.retrato().get("musica") or {}).get("id") if condutor is not None else None
        self._visto_no_roteiro = (ordem.get("atual_id"), musica)
        return {"ok": ok, "titulo": ("Música: " if item["tipo"] == "musica" else "") + item["nome"],
                "detalhe": detalhe}, 200

    # -- o celular do musico ---------------------------------------------------

    def musico_retrato(self, codigo):
        musico = self._dep("musico")
        if musico is None or not musico.link.confere(codigo):
            return None
        return musico.tela()

    def musico_agir(self, codigo, acao, dados):
        musico = self._dep("musico")
        if musico is None or not musico.link.confere(codigo):
            return {"erro": "este link não vale mais. Peça outro à equipe."}, 404
        if acao not in ("proximo", "voltar", "repetir", "pular", "proxima_musica", "desfazer"):
            return {"erro": "o celular do músico não faz isso"}, 400
        return musico.agir(acao, dados)

    # -- passar o slide que esta no telao --------------------------------------

    def passar(self, para, quem, visto=None):
        """Proximo ou anterior, para quem estiver com o telao agora.

        E o caminho do passador de slides e dos botoes do painel. Se a Ponte
        esta conduzindo uma musica, passar a mao ASSUME a letra (o condutor
        larga o automatico); se ha palavra da Ponte no telao, anda nela; senao
        manda direto ao Holyrics, para o que estiver aberto la.
        """
        condutor = self._dep("condutor")
        if condutor is not None and condutor.tem_musica() and para in ("proximo", "anterior"):
            return condutor.ir_slide(para, None, quem)
        palavra = self._dep("palavra")
        if palavra is not None and para in ("proximo", "anterior"):
            dela = palavra.retrato()
            ordem = self._dep("ordem_agora") or {}
            if dela.get("ativa") and dela.get("total") and (
                    dela.get("visivel") or ordem.get("atual_id") in self._momentos_da_palavra()):
                return palavra.ir(para, None, quem)
        telao = self._dep("telao")
        if telao is None:
            return {"erro": "o telão não está disponível neste PC"}, 400
        return telao.ir(para, visto)

    def _momentos_da_palavra(self):
        config = self._dep("config") or {}
        momentos = (config.get("painel") or {}).get("momento_da_palavra") or ["pregacao"]
        if not isinstance(momentos, (list, tuple)):
            momentos = [momentos]
        return [str(m) for m in momentos]

    def _palavra(self, ordem, agenda):
        palavra = self._dep("palavra")
        if palavra is None:
            return None
        retrato = palavra.retrato()
        retrato["no_momento"] = ordem.get("atual_id") in self._momentos_da_palavra()
        # Quanto tempo da palavra ja passou, para o operador e para o celular
        # do pregador: sai do momento atual da ordem, quando ele e o da palavra.
        retrato["passou_s"] = retrato["de_minutos"] = None
        if retrato["no_momento"]:
            for momento in (agenda or {}).get("momentos") or []:
                if momento["id"] == ordem.get("atual_id") and momento.get("resta_s") is not None:
                    retrato["de_minutos"] = momento["minutos"]
                    retrato["passou_s"] = momento["minutos"] * 60 - momento["resta_s"]
        return retrato

    def _versao_do_conteudo(self):
        repertorio, palavra = self._dep("repertorio"), self._dep("palavra")
        partes = [repertorio.versao() if repertorio is not None else ""]
        dela = palavra.conteudo() if palavra is not None else None
        if dela:
            partes.append(dela["versao"])
        telao = self._dep("telao")
        if telao is not None and telao.versao():
            partes.append(telao.versao())
        versao = "-".join(p for p in partes if p)
        return versao or None

    def conteudo(self):
        repertorio, palavra = self._dep("repertorio"), self._dep("palavra")
        dela = palavra.conteudo() if palavra is not None else None
        return {"versao": self._versao_do_conteudo(),
                "musicas": repertorio.musicas() if repertorio is not None else [],
                "palavra": dela["slides"] if dela else [],
                # os slides do que esta aberto no Holyrics agora, seja o que for
                "telao": self._dep("telao").slides() if self._dep("telao") is not None else []}

    # -- o celular do pregador -------------------------------------------------

    def pregador_retrato(self, codigo):
        """O que a pagina do pregador mostra. None se o codigo nao vale."""
        palavra = self._dep("palavra")
        if palavra is None or not palavra.confere(codigo):
            return None
        ordem = self._dep("ordem_agora") or {}
        retrato = self._palavra(ordem, self._agenda(ordem))
        retrato.pop("link", None)
        dela = palavra.conteudo()
        retrato["slides"] = dela["slides"] if dela else []
        retrato["agora"] = self._agora()
        return retrato

    def pregador_passar(self, codigo, para, visto):
        """O toque do pregador. So anda para frente e para tras."""
        palavra = self._dep("palavra")
        if palavra is None or not palavra.confere(codigo):
            return {"erro": "este link não vale mais. Peça outro à equipe."}, 404
        if para not in ("proximo", "anterior"):
            return {"erro": "o celular do pregador só passa os slides"}, 400
        from .palavra import PREGADOR
        return palavra.ir(para, visto, PREGADOR)

    # -- viradas de estado, para o "Aconteceu agora" ---------------------------

    def vigiar_viradas(self, sistemas):
        """Anota so quando um equipamento MUDA de estado, nunca a cada olhada."""
        anotar = self._d.get("anotar")
        if anotar is None:
            return
        for item in sistemas or []:
            nome, estado = item.get("nome"), item.get("estado")
            if nome not in VIRADAS or estado not in ("ok", "erro"):
                continue
            antes = self._antes.get(nome)
            self._antes[nome] = estado
            if antes is None or antes == estado:
                continue
            parou, voltou = VIRADAS[nome]
            if estado == "erro":
                anotar(parou, False, item.get("detalhe") or "", "ponte")
            else:
                anotar(voltou, True, "tudo certo", "ponte")
        internet = self.internet()
        agora = internet["estado"] if internet else None
        antes, self._internet_antes = self._internet_antes, agora
        if antes is None or agora is None or antes == agora:
            return
        if agora == "boa":
            anotar("A internet voltou ao normal", True, "tudo certo", "ponte")
        elif agora == "lenta":
            anotar("A internet ficou lenta", False, internet["detalhe"], "ponte")
        else:
            anotar("A internet caiu", False, internet["detalhe"], "ponte")

    # -- acoes ----------------------------------------------------------------

    def acao(self, tipo, dados, origem):
        """(corpo, codigo), ou None se `tipo` nao e uma acao nova.

        `silencioso` no corpo pede para nao anotar no historico: passar slide
        acontece dezenas de vezes por musica.
        """
        if tipo not in ACOES:
            return None
        if origem == "web" and tipo not in ACOES_DA_WEB:
            return {"erro": "isso só pode ser feito na igreja"}, 403
        dados = dados if isinstance(dados, dict) else {}
        quem = dados.get("quem")

        if tipo == "cena_transmissao":
            cliente = self._dep("obs")
            if cliente is None:
                return {"erro": "a transmissão está desligada neste PC"}, 400
            cena = str(dados.get("cena") or "")
            obs = self._dep("estado_obs") or {}
            if cena not in [str(c) for c in (obs.get("cenas") or [])]:
                return {"erro": "essa imagem não existe na transmissão"}, 404
            cliente.pedir("SetCurrentProgramScene", {"sceneName": cena})
            pedir_de_novo = self._d.get("reler_obs")
            if pedir_de_novo:
                pedir_de_novo()
            nome = (self._d.get("nome_de_cena") or (lambda n: n))(cena)
            return {"ok": True, "titulo": "Imagem no ar: " + str(nome), "detalhe": "tudo certo"}, 200

        if tipo == "clima":
            chave = str(dados.get("clima") or "")
            item = next((c for c in self.tabela() if c["id"] == chave), None)
            if item is None:
                return {"erro": "esse clima de luz não existe"}, 404
            if not item["disponivel"]:
                return {"erro": "falta configurar a luz de {} neste PC".format(item["nome"])}, 409
            try:
                self.aplicar_luz(item["cena"], item["modo"])
            except RuntimeError as erro:
                return {"erro": str(erro)}, 400
            self.luz_mexida()
            return {"ok": True, "titulo": "Luz: " + item["nome"], "detalhe": "tudo certo"}, 200

        if tipo == "imagem":
            imagem = self._dep("imagem")
            if imagem is None:
                return {"erro": "a imagem da transmissão não está disponível neste PC"}, 400
            imagem.ativo = bool(dados.get("mostrar"))
            return {"ok": True, "detalhe": "tudo certo",
                    "titulo": "Imagem da transmissão " + ("ligada" if imagem.ativo else "desligada")}, 200

        if tipo == "roteiro_ir":
            return self.entrar_no_item(dados.get("indice"), quem, False)

        if tipo == "musico_link":
            musico = self._dep("musico")
            if musico is None:
                return {"erro": "o celular do músico não está disponível neste PC"}, 400
            if dados.get("acao") == "encerrar":
                musico.link.encerrar()
                return {"ok": True, "titulo": "Acesso do músico encerrado", "detalhe": "tudo certo"}, 200
            if dados.get("acao") == "gerar":
                musico.link.gerar()
                return {"ok": True, "titulo": "Link do músico criado", "detalhe": "vale só neste culto"}, 200
            return {"erro": "o painel não sabe fazer isso"}, 400

        if tipo == "telao_slide":
            corpo, codigo = self.passar(dados.get("para"), quem, dados.get("visto"))
            corpo["silencioso"] = bool(corpo.get("ok"))
            return corpo, codigo

        if tipo in ("palavra_slide", "palavra_assumir", "palavra_tirar", "pregador_link"):
            palavra = self._dep("palavra")
            if palavra is None:
                return {"erro": "a palavra não está disponível neste PC"}, 400
            if tipo == "palavra_slide":
                corpo, codigo = palavra.ir(dados.get("para"), dados.get("visto"), quem)
                corpo["silencioso"] = bool(corpo.get("ok"))
                return corpo, codigo
            if tipo == "palavra_assumir":
                return palavra.assumir(quem)
            if tipo == "palavra_tirar":
                return palavra.tirar(quem)
            if dados.get("acao") == "encerrar":
                palavra.encerrar_link()
                return {"ok": True, "titulo": "Acesso do pregador encerrado", "detalhe": "tudo certo"}, 200
            if dados.get("acao") == "gerar":
                palavra.gerar_link()
                return {"ok": True, "titulo": "Link do pregador criado", "detalhe": "vale só neste culto"}, 200
            return {"erro": "o painel não sabe fazer isso"}, 400

        condutor = self._dep("condutor")
        if condutor is None:
            return {"erro": "o louvor não está disponível neste PC"}, 400
        if tipo == "luz_seguir":
            return condutor.seguir_luz()
        if tipo == "louvor_assumir":
            return condutor.assumir(quem)
        if tipo == "louvor_devolver":
            return condutor.devolver(quem)
        if tipo == "louvor_segurar":
            return condutor.segurar(bool(dados.get("segurar")), quem)
        if tipo == "louvor_slide":
            corpo, codigo = condutor.ir_slide(dados.get("para"), dados.get("visto"), quem)
            corpo["silencioso"] = bool(corpo.get("ok"))
            return corpo, codigo
        if tipo == "louvor_parte":
            corpo, codigo = condutor.ir_parte(dados.get("parte"), quem)
            corpo["silencioso"] = bool(corpo.get("ok"))
            return corpo, codigo
        if tipo == "louvor_repetir_refrao":
            return condutor.repetir_refrao(quem)
        if tipo == "louvor_musica":
            return condutor.ir_musica(str(dados.get("para") or "proxima"))
        if tipo == "louvor_comecou":
            return condutor.comecou()
        if tipo == "louvor_acertar":
            return condutor.acertar(dados.get("segundos"))
        return None
