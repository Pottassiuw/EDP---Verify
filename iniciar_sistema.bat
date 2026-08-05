@echo off
:: =======================================================================
:: Helios - Script de Inicializacao Automatizado
:: =======================================================================
chcp 65001 > nul
setlocal enabledelayedexpansion

title Helios
set "PROJECT_ROOT=%~dp0"
cd /d "%PROJECT_ROOT%"

:: Inicializa o Node.js pelo FNM quando ele estiver instalado.
set "FNM_EXE="
for %%F in (
    "%USERPROFILE%\Documents\fnm-windows\fnm.exe"
    "%USERPROFILE%\Node\fnm.exe"
    "%APPDATA%\fnm\fnm.exe"
    "%LOCALAPPDATA%\fnm\fnm.exe"
) do if exist "%%~F" if not defined FNM_EXE set "FNM_EXE=%%~F"

if not defined FNM_EXE (
    for /f "delims=" %%F in ('where fnm 2^>nul') do if not defined FNM_EXE set "FNM_EXE=%%F"
)

if defined FNM_EXE (
    for /f "tokens=*" %%i in ('"!FNM_EXE!" env --shell cmd') do %%i
)

:: Identifica o executavel do Python pelo caminho absoluto.
if exist "%PROJECT_ROOT%backend\.venv\Scripts\python.exe" (
    set "PYTHON_EXE=%PROJECT_ROOT%backend\.venv\Scripts\python.exe"
) else if exist "%PROJECT_ROOT%.venv\Scripts\python.exe" (
    set "PYTHON_EXE=%PROJECT_ROOT%.venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

:MENU
cls
echo =======================================================================
echo                              HELIOS
echo =======================================================================
echo.
echo  [1] Iniciar sistema (build + http://localhost:8000)
echo  [2] Iniciar modo desenvolvedor (Backend :8000 + Vite :5173)
echo  [3] Recompilar frontend
echo  [4] Sair
echo.
echo =======================================================================

choice /C 1234 /T 10 /D 1 /M "Selecione uma opcao (modo padrao em 10s)"
if errorlevel 4 goto SAIR
if errorlevel 3 goto REBUILD
if errorlevel 2 goto DEV_MODE
goto PROD_MODE

:PROD_MODE
cls
echo.
echo [1/2] Compilando o frontend...
call :BUILD_FRONTEND
if errorlevel 1 goto BUILD_FAILURE

echo [2/2] Iniciando o servidor Helios (Backend + Frontend)...
echo.
echo -----------------------------------------------------------------------
echo  O sistema abrira automaticamente no navegador: http://localhost:8000
echo  Para encerrar o sistema, feche esta janela ou pressione Ctrl+C.
echo -----------------------------------------------------------------------
echo.

start "" "http://localhost:8000"
cd /d "%PROJECT_ROOT%backend"
"!PYTHON_EXE!" -m uvicorn main:app --host 127.0.0.1 --port 8000
goto FIM

:DEV_MODE
cls
echo.
echo =======================================================================
echo                   INICIANDO MODO DESENVOLVEDOR
echo =======================================================================
echo.

where npm > nul 2>&1
if errorlevel 1 (
    echo ERRO: npm nao foi encontrado. Instale ou configure o Node.js e tente novamente.
    goto FIM
)

echo [1/2] Iniciando Backend FastAPI em segundo plano (:8000)...
start "Helios - Backend" /D "%PROJECT_ROOT%backend" cmd /k ""!PYTHON_EXE!" -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

echo [2/2] Iniciando Frontend Vite (:5173)...
start "Helios - Frontend Vite" /D "%PROJECT_ROOT%frontend" cmd /k "npm run dev"

echo.
echo Servidores iniciados em janelas separadas!
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo.
goto FIM

:REBUILD
cls
echo.
echo Recompilando o frontend...
call :BUILD_FRONTEND
if errorlevel 1 goto BUILD_FAILURE

echo.
echo Build concluido com sucesso!
echo.
pause
goto MENU

:BUILD_FRONTEND
where npm > nul 2>&1
if errorlevel 1 (
    echo ERRO: npm nao foi encontrado. Instale ou configure o Node.js e tente novamente.
    exit /b 1
)

cd /d "%PROJECT_ROOT%frontend"
if not exist "node_modules\" (
    echo Dependencias do frontend ausentes. Instalando com npm ci...
    call npm ci
    if errorlevel 1 exit /b 1
)

call npm run build
if errorlevel 1 exit /b 1
exit /b 0

:BUILD_FAILURE
echo.
echo ERRO: o frontend nao foi compilado. O sistema nao sera iniciado.
echo Reveja as mensagens acima, corrija o problema e tente novamente.
echo.
pause
goto MENU

:SAIR
exit /b 0

:FIM
pause
