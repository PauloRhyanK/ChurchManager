@echo off
rem Dois cliques aqui ligam este PC (o principal) a versao web: ele pergunta
rem a chave, confere com a web e grava no config.yaml. Ver ligar-web.py.
"%~dp0.venv\Scripts\python.exe" "%~dp0ligar-web.py"
echo.
pause
