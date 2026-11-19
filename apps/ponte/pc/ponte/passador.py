"""O passador de slides (Logitech Spotlight) funcionando com qualquer janela em foco.

O PROBLEMA. O passador e um teclado: manda "pagina abaixo" e "pagina acima"
para a janela que estiver em foco. Se o operador clicou no navegador ou no
OBS, o pregador aperta o botao e nada acontece.

O QUE ESTE ARQUIVO FAZ. No PC principal, ouve o teclado do sistema inteiro
(Raw Input do Windows), reconhece o passador pelo VID/PID do receptor, e pede
o proximo slide ao Holyrics pela API. So reage ao passador: as mesmas teclas
num teclado comum continuam sendo so teclas.

O QUE ELE NAO CONSEGUE. Raw Input so OUVE, nao consome: a tecla tambem chega
na janela em foco. Por isso, com o HOLYRICS em foco este arquivo fica quieto
(o Holyrics ja passou o slide sozinho; agir tambem passaria dois). Com outra
janela em foco, ela recebe a tecla tambem: um navegador pode rolar a pagina.

NAO FOI TESTADO COM UM SPOTLIGHT, e so roda em Windows. O VID/PID do
receptor USB (046D:C53E) esta na ficha tecnica da Logitech; as teclas que ele
manda de fabrica NAO estao em documento nenhum que eu tenha achado. O
`descobrir_passador.py` mostra, ao vivo, o que cada botao manda.
"""

import sys
import threading
import time

# nome que se escreve no config.yaml -> codigo da tecla no Windows
TECLAS = {
    "PageDown": 0x22, "PageUp": 0x21, "Right": 0x27, "Left": 0x25, "Down": 0x28, "Up": 0x26,
    "Space": 0x20, "Enter": 0x0D, "Escape": 0x1B, "Tab": 0x09, "F5": 0x74, "B": 0x42, "Period": 0xBE,
}
NOMES = {codigo: nome for nome, codigo in TECLAS.items()}

# O receptor USB do Spotlight e o Spotlight por Bluetooth. Um trecho do nome
# que o Windows da ao dispositivo; maiusculas e minusculas nao importam.
DISPOSITIVOS_PADRAO = ["VID_046D&PID_C53E", "VID&02046D_PID&B503"]
PROXIMO_PADRAO = ["PageDown", "Right"]
ANTERIOR_PADRAO = ["PageUp", "Left"]
REPETICAO = 0.12        # segundos: a mesma tecla antes disso e o mesmo aperto


def _lista(valor, padrao):
    if valor is None:
        return list(padrao)
    if isinstance(valor, (list, tuple)):
        return [str(v) for v in valor]
    return [str(valor)]


def nome_da_tecla(codigo):
    return NOMES.get(codigo) or "tecla {}".format(codigo)


class Passador:
    """As regras. Nao sabe de Windows: recebe (dispositivo, tecla) e decide."""

    def __init__(self, config, passar, holyrics_em_foco=None, agora=time.time, suportado=True):
        conf = config if isinstance(config, dict) else {}
        self.ativo = conf.get("ativo", True) is not False
        self._dispositivos = [d.upper() for d in _lista(conf.get("dispositivo"), DISPOSITIVOS_PADRAO) if d]
        self._mapa = {}
        for nome in _lista(conf.get("anterior"), ANTERIOR_PADRAO):
            if nome in TECLAS:
                self._mapa[TECLAS[nome]] = "anterior"
        for nome in _lista(conf.get("proximo"), PROXIMO_PADRAO):
            if nome in TECLAS:
                self._mapa[TECLAS[nome]] = "proximo"
        self._ignorar_em_foco = conf.get("ignorar_com_holyrics_em_foco", True) is not False
        self._passar = passar
        self._em_foco = holyrics_em_foco or (lambda: False)
        self._agora = agora
        self._suportado = bool(suportado)
        self._tranca = threading.Lock()
        self._conectado = None      # None = ainda nao sei
        self._ultimo = None
        self._ultima_tecla = (None, 0.0)

    def e_o_passador(self, dispositivo):
        nome = str(dispositivo or "").upper()
        return any(trecho in nome for trecho in self._dispositivos)

    def presentes(self, dispositivos):
        """A lista de teclados que o Windows enxerga agora."""
        with self._tranca:
            self._conectado = any(self.e_o_passador(d) for d in dispositivos or [])

    def tecla(self, dispositivo, codigo, apertou=True):
        """Uma tecla de um dispositivo. Devolve o que fez: "proximo",
        "anterior", "em_foco", "sem_funcao", ou None se nao era com ele."""
        if not self.ativo or not apertou or not self.e_o_passador(dispositivo):
            return None
        agora = self._agora()
        with self._tranca:
            self._conectado = True
            if self._ultima_tecla[0] == codigo and agora - self._ultima_tecla[1] < REPETICAO:
                return None
            self._ultima_tecla = (codigo, agora)
        acao = self._mapa.get(codigo)
        if acao is None:
            feito, texto = "sem_funcao", "esse botão não está ligado a nada"
        elif self._ignorar_em_foco and self._em_foco():
            # O Holyrics esta em foco e ja recebeu a tecla: ele mesmo passou.
            feito, texto = "em_foco", "o Holyrics estava em foco e passou sozinho"
        else:
            feito, texto = acao, "próximo slide" if acao == "proximo" else "slide anterior"
        with self._tranca:
            self._ultimo = {"em": agora, "hora": time.strftime("%H:%M:%S", time.localtime(agora)),
                            "tecla": nome_da_tecla(codigo), "acao": feito, "texto": texto}
        if feito in ("proximo", "anterior"):
            # Numa thread: o pedido ao Holyrics pode levar segundos, e quem
            # chama aqui e o fio que ouve o teclado.
            threading.Thread(target=self._chamar, args=(feito,), daemon=True).start()
        return feito

    def _chamar(self, acao):
        try:
            self._passar(acao)
        except Exception as erro:
            with self._tranca:
                if self._ultimo is not None:
                    self._ultimo["texto"] = "não deu certo: " + str(erro)[:100]
                    self._ultimo["acao"] = "falhou"

    def retrato(self):
        with self._tranca:
            return {"ativo": self.ativo, "suportado": self._suportado, "conectado": self._conectado,
                    "ultimo": dict(self._ultimo) if self._ultimo else None}


# ---------------------------------------------------------------------------
#  A parte que so existe no Windows: ouvir o teclado do sistema inteiro
# ---------------------------------------------------------------------------

def no_windows():
    return sys.platform == "win32"


class OuvinteDoTeclado:
    """Uma janela invisivel que recebe WM_INPUT de todos os teclados, com
    qualquer janela em foco (RIDEV_INPUTSINK). Para cada tecla chama
    `ao_teclar(nome_do_dispositivo, codigo, apertou)`; a cada 10 segundos
    chama `ao_listar([nomes])` com os teclados presentes.

    SO OUVE. Nao tira a tecla de ninguem e nao instala gancho global.
    """

    WM_INPUT = 0x00FF
    RID_INPUT = 0x10000003
    RIDI_DEVICENAME = 0x20000007
    RIDEV_INPUTSINK = 0x00000100
    RIM_TYPEKEYBOARD = 1
    RI_KEY_BREAK = 1

    def __init__(self, ao_teclar, ao_listar=None):
        self._ao_teclar = ao_teclar
        self._ao_listar = ao_listar
        self._nomes = {}

    def comecar(self):
        if not no_windows():
            return False
        threading.Thread(target=self._laco, daemon=True).start()
        return True

    def _laco(self):
        try:
            self._ouvir()
        except Exception as erro:
            print("  [passador] parei de ouvir o teclado: {}".format(erro))

    def _ouvir(self):
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.WinDLL("user32", use_last_error=True)
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        LRESULT = ctypes.c_ssize_t
        WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)

        class WNDCLASSW(ctypes.Structure):
            _fields_ = [("style", wintypes.UINT), ("lpfnWndProc", WNDPROC), ("cbClsExtra", ctypes.c_int),
                        ("cbWndExtra", ctypes.c_int), ("hInstance", wintypes.HINSTANCE),
                        ("hIcon", wintypes.HANDLE), ("hCursor", wintypes.HANDLE),
                        ("hbrBackground", wintypes.HANDLE), ("lpszMenuName", wintypes.LPCWSTR),
                        ("lpszClassName", wintypes.LPCWSTR)]

        class RAWINPUTDEVICE(ctypes.Structure):
            _fields_ = [("usUsagePage", wintypes.USHORT), ("usUsage", wintypes.USHORT),
                        ("dwFlags", wintypes.DWORD), ("hwndTarget", wintypes.HWND)]

        class RAWINPUTHEADER(ctypes.Structure):
            _fields_ = [("dwType", wintypes.DWORD), ("dwSize", wintypes.DWORD),
                        ("hDevice", wintypes.HANDLE), ("wParam", wintypes.WPARAM)]

        class RAWKEYBOARD(ctypes.Structure):
            _fields_ = [("MakeCode", wintypes.USHORT), ("Flags", wintypes.USHORT),
                        ("Reserved", wintypes.USHORT), ("VKey", wintypes.USHORT),
                        ("Message", wintypes.UINT), ("ExtraInformation", wintypes.ULONG)]

        class RAWINPUT(ctypes.Structure):
            _fields_ = [("header", RAWINPUTHEADER), ("keyboard", RAWKEYBOARD)]

        class RAWINPUTDEVICELIST(ctypes.Structure):
            _fields_ = [("hDevice", wintypes.HANDLE), ("dwType", wintypes.DWORD)]

        user32.DefWindowProcW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
        user32.DefWindowProcW.restype = LRESULT
        user32.CreateWindowExW.argtypes = [wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
                                           ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                           wintypes.HWND, wintypes.HANDLE, wintypes.HINSTANCE, wintypes.LPVOID]
        user32.CreateWindowExW.restype = wintypes.HWND
        user32.GetRawInputData.argtypes = [wintypes.HANDLE, wintypes.UINT, wintypes.LPVOID,
                                           ctypes.POINTER(wintypes.UINT), wintypes.UINT]
        user32.GetRawInputData.restype = wintypes.UINT
        user32.GetRawInputDeviceInfoW.argtypes = [wintypes.HANDLE, wintypes.UINT, wintypes.LPVOID,
                                                  ctypes.POINTER(wintypes.UINT)]
        user32.GetRawInputDeviceInfoW.restype = wintypes.UINT
        user32.GetRawInputDeviceList.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.UINT), wintypes.UINT]
        user32.GetRawInputDeviceList.restype = wintypes.UINT
        user32.GetMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT]
        user32.SetTimer.argtypes = [wintypes.HWND, ctypes.c_size_t, wintypes.UINT, ctypes.c_void_p]
        kernel32.GetModuleHandleW.restype = wintypes.HINSTANCE

        def nome_de(dispositivo):
            if dispositivo in self._nomes:
                return self._nomes[dispositivo]
            tamanho = wintypes.UINT(0)
            user32.GetRawInputDeviceInfoW(dispositivo, self.RIDI_DEVICENAME, None, ctypes.byref(tamanho))
            nome = ""
            if tamanho.value:
                texto = ctypes.create_unicode_buffer(tamanho.value + 1)
                if user32.GetRawInputDeviceInfoW(dispositivo, self.RIDI_DEVICENAME, texto,
                                                 ctypes.byref(tamanho)) not in (0, 0xFFFFFFFF):
                    nome = texto.value
            self._nomes[dispositivo] = nome
            return nome

        def listar():
            if self._ao_listar is None:
                return
            quantos = wintypes.UINT(0)
            user32.GetRawInputDeviceList(None, ctypes.byref(quantos), ctypes.sizeof(RAWINPUTDEVICELIST))
            if not quantos.value:
                self._ao_listar([])
                return
            lista = (RAWINPUTDEVICELIST * quantos.value)()
            lidos = user32.GetRawInputDeviceList(lista, ctypes.byref(quantos), ctypes.sizeof(RAWINPUTDEVICELIST))
            if lidos == 0xFFFFFFFF:
                return
            self._nomes.clear()      # um receptor tirado e posto de volta ganha outro identificador
            self._ao_listar([nome_de(item.hDevice) for item in lista[:lidos]
                             if item.dwType == self.RIM_TYPEKEYBOARD])

        def ao_receber(janela, mensagem, wparam, lparam):
            if mensagem == self.WM_INPUT:
                try:
                    tamanho = wintypes.UINT(ctypes.sizeof(RAWINPUT))
                    dados = RAWINPUT()
                    lido = user32.GetRawInputData(lparam, self.RID_INPUT, ctypes.byref(dados),
                                                  ctypes.byref(tamanho), ctypes.sizeof(RAWINPUTHEADER))
                    if lido not in (0, 0xFFFFFFFF) and dados.header.dwType == self.RIM_TYPEKEYBOARD:
                        self._ao_teclar(nome_de(dados.header.hDevice), int(dados.keyboard.VKey),
                                        not (dados.keyboard.Flags & self.RI_KEY_BREAK))
                except Exception as erro:
                    print("  [passador] tecla ignorada: {}".format(erro))
            elif mensagem == 0x0113:    # WM_TIMER
                try:
                    listar()
                except Exception:
                    pass
            return user32.DefWindowProcW(janela, mensagem, wparam, lparam)

        self._proc = WNDPROC(ao_receber)     # guardado: o Windows chama isto enquanto a janela existir
        classe = WNDCLASSW()
        classe.lpfnWndProc = self._proc
        classe.hInstance = kernel32.GetModuleHandleW(None)
        classe.lpszClassName = "PonteDoCultoPassador"
        if not user32.RegisterClassW(ctypes.byref(classe)):
            raise OSError("nao consegui registrar a janela ({})".format(ctypes.get_last_error()))
        janela = user32.CreateWindowExW(0, classe.lpszClassName, "Ponte do Culto: passador", 0, 0, 0, 0, 0,
                                        wintypes.HWND(-3), None, classe.hInstance, None)    # HWND_MESSAGE
        if not janela:
            raise OSError("nao consegui criar a janela ({})".format(ctypes.get_last_error()))
        teclado = RAWINPUTDEVICE(0x01, 0x06, self.RIDEV_INPUTSINK, janela)    # pagina generica, teclado
        if not user32.RegisterRawInputDevices(ctypes.byref(teclado), 1, ctypes.sizeof(RAWINPUTDEVICE)):
            raise OSError("o Windows recusou o Raw Input ({})".format(ctypes.get_last_error()))
        listar()
        user32.SetTimer(janela, 1, 10000, None)
        mensagem = wintypes.MSG()
        while user32.GetMessageW(ctypes.byref(mensagem), None, 0, 0) > 0:
            user32.TranslateMessage(ctypes.byref(mensagem))
            user32.DispatchMessageW(ctypes.byref(mensagem))


def holyrics_em_foco():
    """A janela em foco agora e do Holyrics? Falso fora do Windows, ou se
    nao der para saber."""
    if not no_windows():
        return False
    try:
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.WinDLL("user32")
        kernel32 = ctypes.WinDLL("kernel32")
        user32.GetForegroundWindow.restype = wintypes.HWND
        janela = user32.GetForegroundWindow()
        if not janela:
            return False
        titulo = ctypes.create_unicode_buffer(300)
        user32.GetWindowTextW(janela, titulo, 300)
        if "holyrics" in titulo.value.lower():
            return True
        processo = wintypes.DWORD(0)
        user32.GetWindowThreadProcessId(janela, ctypes.byref(processo))
        kernel32.OpenProcess.restype = wintypes.HANDLE
        aberto = kernel32.OpenProcess(0x1000, False, processo.value)    # PROCESS_QUERY_LIMITED_INFORMATION
        if not aberto:
            return False
        try:
            caminho = ctypes.create_unicode_buffer(600)
            tamanho = wintypes.DWORD(600)
            if kernel32.QueryFullProcessImageNameW(wintypes.HANDLE(aberto), 0, caminho, ctypes.byref(tamanho)):
                return "holyrics" in caminho.value.lower()
        finally:
            kernel32.CloseHandle(wintypes.HANDLE(aberto))
    except Exception:
        return False
    return False
