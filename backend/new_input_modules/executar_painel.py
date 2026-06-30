import os
import sys
import socket
import webbrowser
import traceback
import threading
import time

# Esta funcao nunca e executada em tempo de execucao. 
# Serve apenas para o analisador estatico do PyInstaller detectar e empacotar essas dependencias.
def _forced_imports():
    import pandas
    import openpyxl
    import plotly
    import plotly.express
    import streamlit_autorefresh

# Descobrir a pasta real onde o executavel (.exe) esta rodando (e nao a pasta temporaria _MEIPASS)
if getattr(sys, 'frozen', False):
    pasta_executavel = os.path.dirname(sys.executable)
else:
    pasta_executavel = os.path.dirname(os.path.abspath(__file__))

def log_debug(msg):
    try:
        caminho_log = os.path.join(pasta_executavel, "painel_debug.txt")
        with open(caminho_log, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass

log_debug("1. Iniciando o motor do Painel EDP...")
print("1. Iniciando o motor do Painel EDP...", flush=True)

def servidor_esta_rodando(porta):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', porta)) == 0

def esperar_e_abrir_navegador(porta, timeout=60):
    log_debug(f"-> Aguardando o servidor ligar na porta {porta}...")
    print(f"-> Aguardando o servidor ligar na porta {porta}...", flush=True)
    inicio = time.time()
    url = f"http://localhost:{porta}"
    
    while time.time() - inicio < timeout:
        if servidor_esta_rodando(porta):
            log_debug("-> Servidor ONLINE! Abrindo navegador...")
            print("-> Servidor ONLINE! Abrindo navegador...", flush=True)
            time.sleep(1.5) # Dá tempo para a interface ser construída
            webbrowser.open(url)
            return
        time.sleep(1)
    log_debug("-> Timeout: O servidor demorou muito para responder.")
    print("-> Timeout: O servidor demorou muito para responder.", flush=True)

try:
    porta = 8599
    url = f"http://localhost:{porta}"

    log_debug(f"2. Verificando a porta {porta}...")
    print(f"2. Verificando a porta {porta}...", flush=True)
    
    if servidor_esta_rodando(porta):
        log_debug("3. A porta já está em uso. Reabrindo o navegador...")
        print("3. A porta já está em uso. Reabrindo o navegador...", flush=True)
        webbrowser.open(url)
        time.sleep(3)
        log_debug("Saindo pois a porta já está em uso.")
        sys.exit(0)
        
    else:
        log_debug("3. Porta livre! Preparando os caminhos de rede...")
        print("3. Porta livre! Preparando os caminhos de rede...", flush=True)
        if getattr(sys, 'frozen', False):
            application_path = sys._MEIPASS
        else:
            application_path = os.path.dirname(os.path.abspath(__file__))
        
        log_debug(f"Application path (_MEIPASS): {application_path}")
        os.chdir(application_path)

        caminho_app = os.path.join(application_path, "app.py")
        log_debug(f"Caminho do app.py: {caminho_app}")

        log_debug("4. Soltando o Vigia para abrir o Chrome na hora certa...")
        print("4. Soltando o Vigia para abrir o Chrome na hora certa...", flush=True)
        threading.Thread(target=esperar_e_abrir_navegador, args=(porta,), daemon=True).start()

        log_debug("5. Importando streamlit.web.cli...")
        print("5. Dando a partida no Streamlit. Segure firme...", flush=True)
        import streamlit.web.cli as stcli

        log_debug("6. Configurando sys.argv para iniciar o Streamlit...")
        if __name__ == "__main__":
            sys.argv = [
                "streamlit",
                "run",
                caminho_app,
                f"--server.port={porta}",
                "--server.headless=true", 
                "--global.developmentMode=false"
            ]
            log_debug(f"7. Executando stcli.main() com args: {sys.argv}")
            sys.exit(stcli.main())
        else:
            log_debug("Aviso: __name__ não é '__main__'")

except SystemExit:
    log_debug("SystemExit capturado.")
    pass 
except Exception as e:
    log_debug(f"ERRO FATAL: {str(e)}\n{traceback.format_exc()}")
    print("\n=== OCORREU UM ERRO FATAL ===", flush=True)
    print(traceback.format_exc(), flush=True)
    caminho_erro = os.path.join(pasta_executavel, "ERRO_FATAL_SISTEMA.txt")
    with open(caminho_erro, "w") as f:
        f.write(traceback.format_exc())
    input("Pressione ENTER para fechar...")
