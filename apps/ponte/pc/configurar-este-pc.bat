@echo off
rem Dois cliques aqui configuram este PC. Toda a logica esta no .ps1 ao lado.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0configurar-este-pc.ps1"
