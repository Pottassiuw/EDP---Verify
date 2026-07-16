@echo off
setlocal
cd /d "%~dp0"

if not exist "venv\Scripts\python.exe" (
    echo [ERRO] venv nao encontrado em backend\venv. Rode primeiro:
    echo     python -m venv venv
    echo     venv\Scripts\python.exe -m pip install -r requirements-sap-robot.txt
    pause
    exit /b 1
)

if not exist "credenciais.json" (
    echo [ERRO] backend\credenciais.json nao encontrado.
    echo Copie credenciais.json.example para credenciais.json e preencha LOGIN_SAP/SENHA_SAP.
    pause
    exit /b 1
)

set PYTHONIOENCODING=utf-8
venv\Scripts\python.exe Sap_Robot.py

echo.
echo --- Robo finalizado (codigo de saida: %ERRORLEVEL%) ---
pause
