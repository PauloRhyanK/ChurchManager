# ===========================================================================
#  PONTE DO CULTO - instalar do zero
#
#  O que o instalar-ponte.bat (baixado em ponte.igrejaparaiso.com.br/instalar)
#  executa. Leva um PC que nao tem NADA ate a ponte ligada, ja com a
#  configuracao da igreja:
#
#    1. pergunta que PC e este
#    2. baixa o projeto e, do cofre da versao web, a configuracao do papel
#    3. instala o que faltar: Python, e o OBS no notebook da transmissao
#    4. poe a colecao de cenas e o perfil do OBS no lugar
#    5. chama o configurar-este-pc.ps1, que faz o resto (atalhos, ligar)
#
#  Num PC que JA tem a ponte, ele atualiza os arquivos do projeto e NAO toca
#  no config.yaml nem no maquina.yaml que estao la.
#
#  Este arquivo e servido pela versao web e roda direto da memoria, por isso:
#  SO ASCII, em comentario e em texto. Baixado assim, o PowerShell 5.1 nao
#  sabe que e UTF-8 e um acento vira lixo.
#
#  ESTADO: escrito em 12/11/2026 e AINDA NAO TESTADO NUM WINDOWS DE VERDADE.
# ===========================================================================

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # sem isto o download fica 10x mais lento
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Host.UI.RawUI.WindowTitle = "Ponte do Culto - instalar"

$URL     = $env:PONTE_URL
$CODIGO  = $env:PONTE_CODIGO
$DESTINO = "C:\ponte-do-culto"

function Linha { Write-Host ("  " + ("=" * 60)) -ForegroundColor DarkGray }
function Ok($t)    { Write-Host "    OK  $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "    !   $t" -ForegroundColor Yellow }
function Parar($t) {
    Write-Host ""; Write-Host "    PAREI: $t" -ForegroundColor Red; Write-Host ""
    Read-Host "    Tecle ENTER para fechar"; exit 1
}
function TemWinget { [bool](Get-Command winget -ErrorAction SilentlyContinue) }
function AtualizarPath {
    # Um programa recem-instalado entra no PATH do Windows, mas nao no desta
    # janela, que ja estava aberta. Sem reler, o Python novo "nao existe".
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [Environment]::GetEnvironmentVariable("Path", "User")
}
function TemPython {
    foreach ($t in @(@("py", "-3"), @("python"))) {
        try {
            $v = & $t[0] @($t[1..9] | Where-Object { $_ }) -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
            if ($LASTEXITCODE -eq 0 -and $v -match '^3\.(\d+)$' -and [int]$Matches[1] -ge 10) { return $true }
        } catch { }
    }
    return $false
}
function Instalar($id, $nome) {
    Write-Host "    Instalando $nome (leva alguns minutos)..." -ForegroundColor Gray
    winget install -e --id $id --silent --accept-package-agreements --accept-source-agreements | Out-Null
    AtualizarPath
}

Write-Host ""; Linha
Write-Host "    PONTE DO CULTO - instalar neste PC" -ForegroundColor Cyan
Linha; Write-Host ""

if (-not $URL -or -not $CODIGO) {
    Parar "este roteiro e chamado pelo instalar-ponte.bat. Baixe-o em ponte.igrejaparaiso.com.br/instalar."
}

# --- 1. O papel -----------------------------------------------------------
Write-Host "    Que PC e este?" -ForegroundColor White
Write-Host "      1  Notebook da transmissao (OBS)"
Write-Host "      2  PC do som (Reaper / mesa X32)"
Write-Host "      3  PC do Holyrics (o principal)"
$escolha = Read-Host "    Digite 1, 2 ou 3"
switch ($escolha.Trim()) {
    "1" { $PAPEL = "transmissao" }
    "2" { $PAPEL = "som" }
    "3" { $PAPEL = "holyrics" }
    default { Parar "resposta '$escolha' nao e 1, 2 nem 3." }
}

# O PC DO SOM LEVA A LUZ. Se ele ja roda a versao antiga, trocar sem cuidado
# derruba os refletores.
if ($PAPEL -eq "som" -and (Test-Path "C:\ponte-culto\app.py")) {
    Aviso "Este PC ja roda a versao antiga da ponte em C:\ponte-culto, e e ela que leva a luz."
    Parar "nao vou instalar por cima. Faca a troca com calma, fora do horario de culto."
}

# --- 2. Baixar o projeto e a configuracao ---------------------------------
$zip  = Join-Path $env:TEMP "ponte-do-culto-pc.zip"
$solt = Join-Path $env:TEMP ("ponte-" + [Guid]::NewGuid().ToString("N"))
Write-Host "    Baixando o projeto e a configuracao da igreja..." -ForegroundColor Gray
try {
    Invoke-WebRequest "$URL/api/instalar/pacote?papel=$PAPEL" -Headers @{ "X-Ponte-Codigo" = $CODIGO } `
        -OutFile $zip -UseBasicParsing -TimeoutSec 120
} catch {
    $status = $null
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    if ($status -eq 403) { Parar "o instalador venceu (vale 30 minutos). Baixe outro em $URL/instalar." }
    if ($status -eq 429) { Parar "muitas tentativas. Espere um minuto e rode de novo." }
    Parar "nao consegui baixar. Este PC esta com internet? ($($_.Exception.Message))"
}
Expand-Archive -Path $zip -DestinationPath $solt -Force
Remove-Item $zip -Force
$origem = Join-Path $solt "ponte-do-culto"
if (-not (Test-Path (Join-Path $origem "app.py"))) { Parar "o pacote veio sem o projeto dentro." }

# A copia da igreja (cenas de luz, passos da chegada) vence a do projeto.
$doCofre = Join-Path $origem "_do_cofre"
if (Test-Path $doCofre) {
    Copy-Item (Join-Path $doCofre "*") $origem -Recurse -Force
    Remove-Item $doCofre -Recurse -Force
}

# Num PC que ja tem a ponte, o que e DELE fica: o papel e os segredos.
$jaTinha = Test-Path (Join-Path $DESTINO "app.py")
if ($jaTinha) {
    # Tambem os _*.json: credenciais do YouTube e o ponto onde o culto esta.
    $deles = @("config.yaml", "maquina.yaml") + @(Get-ChildItem $DESTINO -Filter "_*.json" -File | ForEach-Object { $_.Name })
    foreach ($dele in $deles) {
        if (Test-Path (Join-Path $DESTINO $dele)) {
            Remove-Item (Join-Path $origem $dele) -Force -ErrorAction SilentlyContinue
        }
    }
    Aviso "este PC ja tinha a ponte: atualizei o projeto e mantive a configuracao e o estado dele."
}
New-Item -ItemType Directory -Path $DESTINO -Force | Out-Null
Copy-Item (Join-Path $origem "*") $DESTINO -Recurse -Force
Remove-Item $solt -Recurse -Force
Ok "projeto em $DESTINO"

if (Test-Path (Join-Path $DESTINO "config.yaml")) { Ok "configuracao da igreja no lugar" }
if ($PAPEL -eq "holyrics" -and (Test-Path (Join-Path $DESTINO "_youtube_token.json"))) { Ok "credenciais do YouTube no lugar" }
elseif ($PAPEL -eq "holyrics") {
    Aviso "o cofre da versao web ainda nao tem a configuracao da igreja."
    Aviso "O config.yaml sera criado do exemplo e alguem da equipe digita os segredos."
}

# --- 3. Python ------------------------------------------------------------
if (TemPython) { Ok "Python ja instalado" }
elseif (TemWinget) {
    Instalar "Python.Python.3.12" "o Python 3.12"
    if (TemPython) { Ok "Python instalado" }
    else { Parar "instalei o Python mas esta janela nao o encontrou. Feche, abra o instalador de novo." }
} else {
    Write-Host "    Este PC nao tem Python nem o instalador do Windows (winget)." -ForegroundColor Yellow
    Write-Host "      1. Abra python.org/downloads e baixe o Python 3.12 para Windows" -ForegroundColor Gray
    Write-Host "      2. Na primeira tela, MARQUE 'Add python.exe to PATH' e clique em Install Now" -ForegroundColor Gray
    Write-Host "      3. Rode este instalador de novo (ele continua de onde parou)" -ForegroundColor Gray
    Read-Host "    Tecle ENTER para fechar"; exit 1
}

# --- 4. Os programas do papel --------------------------------------------
if ($PAPEL -eq "transmissao") {
    $obsExe = "C:\Program Files\obs-studio\bin\64bit\obs64.exe"
    if (Test-Path $obsExe) { Ok "OBS ja instalado" }
    elseif (TemWinget) {
        Instalar "OBSProject.OBSStudio" "o OBS Studio"
        if (Test-Path $obsExe) { Ok "OBS instalado" } else { Aviso "nao consegui instalar o OBS sozinho. Baixe em obsproject.com." }
    } else { Aviso "este PC nao tem OBS. Baixe em obsproject.com e instale." }
}
if ($PAPEL -eq "holyrics" -and -not (Test-Path "C:\Holyrics\Holyrics.exe")) {
    # O Holyrics nao tem instalacao automatica: abre a pagina dele.
    Aviso "este PC nao tem o Holyrics em C:\Holyrics. Abri o site para voce baixar e instalar."
    Aviso "Depois de instalar, ligue o API Server nele com o MESMO token que esta no config.yaml."
    Start-Process "https://holyrics.com.br"
}

# --- 5. A configuracao do OBS --------------------------------------------
# A pasta obs/ vem do cofre: obs\scenes\*.json (colecoes de cenas) e
# obs\profiles\<nome>\ (perfil, com a chave do YouTube). So entra o que
# ainda nao existe neste PC: nunca troca uma colecao que alguem ja mexeu.
$obsVindo = Join-Path $DESTINO "obs"
if ($PAPEL -eq "transmissao" -and (Test-Path $obsVindo)) {
    $obsDados = Join-Path $env:APPDATA "obs-studio\basic"
    if (Get-Process obs64 -ErrorAction SilentlyContinue) {
        Aviso "o OBS esta aberto. Feche-o e rode o instalador de novo para trazer as cenas."
    } else {
        $postos = 0
        foreach ($tipo in @("scenes", "profiles")) {
            $de = Join-Path $obsVindo $tipo
            if (-not (Test-Path $de)) { continue }
            $para = Join-Path $obsDados $tipo
            New-Item -ItemType Directory -Path $para -Force | Out-Null
            foreach ($item in Get-ChildItem $de) {
                if (Test-Path (Join-Path $para $item.Name)) { Aviso "OBS: '$($item.Name)' ja existia, mantive o deste PC." }
                else { Copy-Item $item.FullName $para -Recurse; $postos++ }
            }
        }
        if ($postos -gt 0) {
            Ok "cenas e perfil do OBS no lugar ($postos). No OBS: menu Colecao de Cenas e menu Perfil."
            Aviso "Confira as fontes: camera e placa de captura tem nome diferente em cada PC."
        }
    }
}

# --- 6. O resto e do configurar-este-pc -----------------------------------
Write-Host ""
& (Join-Path $DESTINO "configurar-este-pc.ps1") -Papel $PAPEL
