# ===========================================================================
#  PONTE DO CULTO — configurar este PC
#
#  O instalador. Roda UMA VEZ em cada PC novo, depois de extrair o pacote
#  baixado do painel ("Instalar em outro PC"). Pergunta duas coisas e faz o
#  resto: o papel da maquina, o endereco do PC principal, o Python do projeto,
#  e os atalhos (area de trabalho e iniciar junto com o Windows).
#
#  Existe porque a alternativa era um passo a passo com "copie este arquivo,
#  edite aquela linha, crie um atalho em shell:startup" — e cada um desses e
#  um lugar para errar na correria antes do culto.
#
#  SO ASCII DENTRO DE TEXTO: o PowerShell 5.1 le .ps1 sem BOM como ANSI, e
#  um acento em UTF-8 vira lixo — ja quebrou o iniciar-ponte.ps1 uma vez.
# ===========================================================================

$ErrorActionPreference = "Stop"
$PASTA = $PSScriptRoot
$Host.UI.RawUI.WindowTitle = "Ponte do Culto - configurar este PC"

function Linha { Write-Host ("  " + ("=" * 60)) -ForegroundColor DarkGray }
function Ok($t)    { Write-Host "    OK  $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "    !   $t" -ForegroundColor Yellow }
function Parar($t) {
    Write-Host ""; Write-Host "    PAREI: $t" -ForegroundColor Red; Write-Host ""
    Read-Host "    Tecle ENTER para fechar"; exit 1
}

Write-Host ""; Linha
Write-Host "    PONTE DO CULTO - configurar este PC" -ForegroundColor Cyan
Linha; Write-Host ""

# --- 0. A pasta tem o projeto? -------------------------------------------
if (-not (Test-Path (Join-Path $PASTA "app.py"))) {
    Parar "nao achei app.py nesta pasta. Rode este arquivo de dentro da pasta extraida do pacote."
}

# --- 1. Python ------------------------------------------------------------
# Procura um Python 3.10 ou mais novo. "py" e o lancador oficial do Windows;
# "python" pode ser o atalho falso da Microsoft Store, que so abre a loja.
$PY = $null
foreach ($tentativa in @(@("py", "-3"), @("python"))) {
    try {
        $saida = & $tentativa[0] @($tentativa[1..9] | Where-Object { $_ }) -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
        if ($LASTEXITCODE -eq 0 -and $saida -match '^3\.(\d+)$' -and [int]$Matches[1] -ge 10) {
            $PY = $tentativa; break
        }
    } catch { }
}
if (-not $PY) {
    Write-Host "    Este PC nao tem Python 3.10 ou mais novo." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    Instale assim, e depois rode este arquivo de novo:" -ForegroundColor Gray
    Write-Host "      1. Abra python.org/downloads e baixe o Python 3.12 para Windows" -ForegroundColor Gray
    Write-Host "      2. Na primeira tela do instalador, MARQUE 'Add python.exe to PATH'" -ForegroundColor Gray
    Write-Host "      3. Clique em Install Now" -ForegroundColor Gray
    Write-Host ""
    Read-Host "    Tecle ENTER para fechar"; exit 1
}
Ok ("Python encontrado (" + ($PY -join " ") + ")")

# --- 2. O papel -----------------------------------------------------------
Write-Host ""
Write-Host "    Que PC e este?" -ForegroundColor White
Write-Host "      1  Notebook da transmissao (OBS)"
Write-Host "      2  PC do som (Reaper / mesa X32)"
Write-Host "      3  PC do Holyrics (o principal)"
$escolha = Read-Host "    Digite 1, 2 ou 3"
switch ($escolha.Trim()) {
    "1" { $PAPEL = "transmissao"; $NOME = "Notebook da transmissao" }
    "2" { $PAPEL = "som";         $NOME = "PC do som" }
    "3" { $PAPEL = "holyrics";    $NOME = "PC do Holyrics" }
    default { Parar "resposta '$escolha' nao e 1, 2 nem 3." }
}

# O PC DO SOM LEVA A LUZ. Se ele ja roda a versao antiga, trocar sem cuidado
# derruba os refletores — e as duas versoes brigariam pela mesma porta.
if ($PAPEL -eq "som" -and (Test-Path "C:\ponte-culto\app.py")) {
    Write-Host ""
    Aviso "Este PC ja roda a versao antiga da ponte em C:\ponte-culto, e e ela que leva a luz."
    Aviso "A troca precisa ser feita com calma, desligando a antiga do jeito certo."
    Parar "nao vou instalar por cima. Faca a troca junto com a sessao do Claude deste PC."
}

# --- 3. O PC principal ----------------------------------------------------
$PRINCIPAL = $null
if ($PAPEL -ne "holyrics") {
    $padrao = "192.168.1.143"
    $ip = Read-Host "    Endereco do PC do Holyrics [ENTER = $padrao]"
    if (-not $ip.Trim()) { $ip = $padrao }
    $PRINCIPAL = "http://" + $ip.Trim() + ":8700"
    try {
        $r = Invoke-WebRequest "$PRINCIPAL/api/aqui" -UseBasicParsing -TimeoutSec 6
        $papelDela = ($r.Content | ConvertFrom-Json).papel
        if ($papelDela -ne "holyrics") { Aviso "o PC em $ip respondeu, mas diz que e '$papelDela', nao o principal." }
        else { Ok "PC do Holyrics respondeu em $ip" }
    } catch {
        Aviso "o PC do Holyrics nao respondeu em $ip. Ele esta ligado com a janela preta aberta?"
        Aviso "Sigo assim mesmo: a pagina deste PC vai mostrar 'sem contato' ate ele responder."
    }
}

# --- 4. maquina.yaml e config.yaml ----------------------------------------
$maq = "# Gerado por configurar-este-pc.ps1`r`npapel: $PAPEL`r`nnome: $NOME`r`n"
if ($PRINCIPAL) { $maq += "principal: $PRINCIPAL`r`n" }
[System.IO.File]::WriteAllText((Join-Path $PASTA "maquina.yaml"), $maq, (New-Object System.Text.UTF8Encoding($false)))
Ok "maquina.yaml: $NOME"

$cfg = Join-Path $PASTA "config.yaml"
if (Test-Path $cfg) {
    Ok "config.yaml ja existia: mantive o que estava"
} elseif ($PAPEL -eq "holyrics") {
    Copy-Item (Join-Path $PASTA "config.exemplo.yaml") $cfg
    Aviso "config.yaml criado a partir do exemplo. O PC principal precisa dos SEGREDOS (token"
    Aviso "do Holyrics, senha do OBS): alguem da equipe digita direto no arquivo. Nunca por mensagem."
} else {
    Copy-Item (Join-Path $PASTA "config.secundaria.yaml") $cfg
    Ok "config.yaml de maquina secundaria (sem segredo nenhum)"
}

# --- 5. O Python do projeto -----------------------------------------------
$venv = Join-Path $PASTA ".venv\Scripts\python.exe"
if (-not (Test-Path $venv)) {
    Write-Host "    Criando o Python do projeto..." -ForegroundColor Gray
    & $PY[0] @($PY[1..9] | Where-Object { $_ }) -m venv (Join-Path $PASTA ".venv")
    if (-not (Test-Path $venv)) { Parar "nao consegui criar a pasta .venv" }
}
Write-Host "    Instalando o que a ponte precisa (precisa de internet, leva um minuto)..." -ForegroundColor Gray
& $venv -m pip install --disable-pip-version-check -q -r (Join-Path $PASTA "requirements.txt")
if ($LASTEXITCODE -ne 0) { Parar "o pip nao conseguiu instalar. Este PC esta com internet?" }
Ok "dependencias instaladas"

# --- 6. Atalhos -----------------------------------------------------------
$ws = New-Object -ComObject WScript.Shell
$bat = Join-Path $PASTA "iniciar-ponte.bat"
foreach ($destino in @(
        @([Environment]::GetFolderPath("Desktop"), "Ponte do Culto.lnk", 1),
        @([Environment]::GetFolderPath("Startup"), "Ponte do Culto.lnk", 7))) {
    $a = $ws.CreateShortcut((Join-Path $destino[0] $destino[1]))
    $a.TargetPath = $bat; $a.WorkingDirectory = $PASTA; $a.WindowStyle = $destino[2]
    $a.Description = "Liga a Ponte do Culto deste PC"
    $a.Save()
}
Ok "atalho na area de trabalho e para abrir junto com o Windows"

# --- 7. Pronto ------------------------------------------------------------
Write-Host ""; Linha
Write-Host "    PRONTO. Este PC agora e: $NOME" -ForegroundColor Green
Linha; Write-Host ""
$ja = Read-Host "    Ligar a ponte agora? [S/n]"
if ($ja.Trim().ToLower() -ne "n") { Start-Process $bat }
