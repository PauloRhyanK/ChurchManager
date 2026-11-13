# Instalar a ponte num PC da igreja

O projeto é o mesmo em todo PC. Depois de instalado, o que diz "quem é esta máquina"
é um arquivo pequeno, o `maquina.yaml`.

## 1. Pôr os arquivos

Baixe `ponte-do-culto-pc.zip` em `https://ponte.igrejaparaiso.com.br/baixar` (pede a
senha da equipe) e extraia em `C:\ponte-do-culto`.

## 2. Python e dependências

Precisa do Python 3.12. Na pasta extraída, no PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## 3. Os dois arquivos que são só desta máquina

```powershell
Copy-Item config.exemplo.yaml config.yaml
Copy-Item maquina.exemplo.yaml maquina.yaml
```

- **`maquina.yaml`** — o papel (`holyrics`, `transmissao` ou `som`). Nas que não são a
  principal, ponha também `principal: http://<IP do PC do Holyrics>:8700`.
- **`config.yaml`** — só o PC principal precisa dos segredos (token do Holyrics, senha
  do OBS, chave da web). Quem digita é uma pessoa da equipe, direto no arquivo:
  **nunca por mensagem, foto ou print.** Nas secundárias, deixe `obs: ativo: false` e
  `holyrics: ativo: false`.

## 4. Abrir sozinho ao ligar

O `iniciar-ponte.bat` liga a ponte e abre a página deste PC. Para ele rodar no login,
crie um atalho dele em `shell:startup`. Os caminhos dentro de `iniciar-ponte.ps1`
(`$PASTA`, `$HOLYRICS`) precisam apontar para esta instalação.

## 5. Conferir

Abra `http://127.0.0.1:8700/aqui`. A página tem que dizer o nome certo da máquina.
Numa secundária, "PC do Holyrics: conectado" tem que estar verde.

## O PC do som não pode dormir

É ele que leva a luz até os refletores. Em **Configurações › Sistema › Energia**, ponha
"Suspender" em **Nunca**. Em 12/11/2026 ele dormiu duas vezes no meio do culto.
