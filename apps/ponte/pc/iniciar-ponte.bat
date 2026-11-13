@echo off
rem Casca fina: toda a logica esta no .ps1 ao lado. Este arquivo existe so
rem porque atalho do Windows aponta para .bat sem complicacao, e porque
rem -ExecutionPolicy Bypass deixa o script rodar mesmo com a politica do
rem Windows fechada -- sem mudar politica nenhuma da maquina.
rem
rem %~dp0 e "a pasta onde este .bat esta": assim o mesmo arquivo serve em
rem qualquer PC, esteja a ponte instalada onde estiver.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-ponte.ps1"
