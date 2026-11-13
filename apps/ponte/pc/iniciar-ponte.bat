@echo off
rem Casca fina: toda a logica esta no .ps1 ao lado. Este arquivo existe so
rem porque atalho do Windows aponta para .bat sem complicacao, e porque
rem -ExecutionPolicy Bypass deixa o script rodar mesmo com a politica do
rem Windows fechada -- sem mudar politica nenhuma da maquina.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\User\ponte-teste\iniciar-ponte.ps1"
