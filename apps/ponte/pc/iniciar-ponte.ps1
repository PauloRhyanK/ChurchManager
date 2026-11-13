# ===========================================================================
#  PONTE DO CULTO — iniciar
#
#  E o "app" da area de trabalho. A pessoa liga este PC, da dois cliques, e
#  ele faz o que da para fazer sozinho daqui:
#
#    1. abre o Holyrics, se estiver fechado
#    2. sobe a ponte
#    3. abre o GUIA DE CHEGADA, que mede o resto e conduz a pessoa pelos
#       passos que dependem de mao (nobreak, cabos, notebook, mesa de som)
#
#  Por que existe: em 12/11 a igreja chegou para o culto de quinta e a ponte
#  estava parada, porque o PC tinha reiniciado e nada a subia de volta. Quem
#  opera nao tem que saber de venv nem de linha de comando.
#
#  Por que em PowerShell e nao em .bat: a primeira versao era .bat e morria
#  na linha que abria o navegador depois de uma espera. Em arquivo de lote,
#  `start "" cmd /c "... & start "" url"` tem aspas dentro de aspas e o
#  interpretador se perde. Aqui isso e uma linha so e nao tem armadilha.
# ===========================================================================

$ErrorActionPreference = "Stop"
$PASTA    = "C:\Users\User\ponte-teste"
$PORTA    = 8700
$PAINEL   = "http://127.0.0.1:$PORTA"
$HOLYRICS = "C:\Holyrics\Holyrics.exe"
$CHROME   = "C:\Program Files\Google\Chrome\Application\chrome.exe"

$Host.UI.RawUI.WindowTitle = "Ponte do Culto"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Linha { Write-Host ("  " + ("=" * 56)) -ForegroundColor DarkGray }
function Escutando {
    @(Get-NetTCPConnection -LocalPort $PORTA -State Listen -ErrorAction SilentlyContinue).Count -gt 0
}

# O guia abre como aplicativo (sem barra de navegador) quando ha Chrome, e no
# navegador padrao quando nao ha. O bloco e um texto porque tambem roda dentro
# de um job, e job nao enxerga as funcoes daqui.
$ABRIR = {
    param($painel, $chrome)
    # /aqui e a pagina DESTE PC: o que ela mostra depende do papel da maquina
    # (maquina.yaml). Uma ponte antiga, que ainda nao foi reiniciada, nao tem
    # essa pagina; abrir nela daria "nao encontrado" na cara de quem so quer
    # comecar, entao cai para o painel.
    $destino = "$painel/aqui"
    try { Invoke-WebRequest $destino -UseBasicParsing -TimeoutSec 4 | Out-Null }
    catch { $destino = $painel }
    if (Test-Path $chrome) { Start-Process $chrome "--app=$destino --window-size=1280,900" }
    else { Start-Process $destino }
}

Write-Host ""
Linha
Write-Host "    PONTE DO CULTO" -ForegroundColor Cyan
Linha
Write-Host ""

# --- 1. Holyrics. Sem ele nao ha telao; e ele demora a abrir, entao sai
#        primeiro e vai carregando enquanto a ponte sobe.
if (Get-Process Holyrics -ErrorAction SilentlyContinue) {
    Write-Host "    Holyrics: ja estava aberto." -ForegroundColor Gray
} elseif (Test-Path $HOLYRICS) {
    Write-Host "    Holyrics: abrindo..." -ForegroundColor Gray
    Start-Process $HOLYRICS -WorkingDirectory (Split-Path $HOLYRICS)
} else {
    # SO ASCII DENTRO DE TEXTO NESTE ARQUIVO. O PowerShell 5.1 le .ps1 sem BOM
    # como ANSI; um travessao em UTF-8 tem um byte que vira aspas e FECHA O
    # TEXTO NO MEIO. Isso quebrou este arquivo em 12/11 — e ele roda no login.
    Write-Host "    Holyrics: NAO ACHEI em $HOLYRICS. Abra na mao." -ForegroundColor Yellow
}

# --- 2. Ja esta no ar? Entao nao sobe outra. Duas pontes na mesma porta
#        dariam erro, e quem opera acharia que quebrou alguma coisa.
if (Escutando) {
    Write-Host "    A ponte JA ESTAVA no ar. Abrindo o guia..." -ForegroundColor Green
    & $ABRIR $PAINEL $CHROME
    Start-Sleep -Seconds 3
    exit 0
}

$python = Join-Path $PASTA ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Host "    NAO ACHEI o Python da ponte em:" -ForegroundColor Red
    Write-Host "    $python" -ForegroundColor Red
    Write-Host ""
    Write-Host "    Isso quer dizer que a instalacao foi movida ou apagada." -ForegroundColor Yellow
    Read-Host "    Tecle ENTER para fechar"
    exit 1
}

# --- 3. O guia abre sozinho, mas so DEPOIS que o servidor atender. Esperar
#        um tempo fixo seria chute; aqui ele pergunta ate a porta responder, e
#        desiste em 20 segundos para nao ficar pendurado se algo deu errado.
$abridor = Start-Job {
    param($porta, $painel, $chrome, $abrir)
    for ($i = 0; $i -lt 40; $i++) {
        if (@(Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue).Count -gt 0) {
            Start-Sleep -Milliseconds 800
            & ([scriptblock]::Create($abrir)) $painel $chrome
            return
        }
        Start-Sleep -Milliseconds 500
    }
} -ArgumentList $PORTA, $PAINEL, $CHROME, $ABRIR.ToString()

Write-Host "    Ponte: subindo. O guia de chegada abre sozinho em instantes." -ForegroundColor Gray
Write-Host ""
Write-Host "    NAO FECHE ESTA JANELA durante o culto." -ForegroundColor Yellow
Write-Host "    Fechar esta janela DESLIGA a ponte." -ForegroundColor Yellow
Write-Host ""
Linha
Write-Host ""

Set-Location $PASTA
& $python app.py

# --- Se chegou aqui, o Python saiu: ou alguem fechou, ou deu erro. A pausa
#     existe para a mensagem acima ficar legivel, em vez de a janela sumir
#     antes de qualquer um conseguir ler.
Remove-Job $abridor -Force -ErrorAction SilentlyContinue
Write-Host ""
Linha
Write-Host "    A PONTE PAROU." -ForegroundColor Yellow
Write-Host "    Se foi erro, a explicacao esta logo acima." -ForegroundColor Gray
Linha
Read-Host "    Tecle ENTER para fechar"
