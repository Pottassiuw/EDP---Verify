import os
import sys
import socket
import webbrowser
import traceback
import threading
import time

print("1. Iniciando o motor do Painel EDP...")

def servidor_esta_rodando(porta):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', porta)) == 0

def esperar_e_abrir_navegador(porta, timeout=60):
    print(f"-> Aguardando o servidor ligar na porta {porta}...")
    inicio = time.time()
    url = f"http://localhost:{porta}"
    
    while time.time() - inicio < timeout:
        if servidor_esta_rodando(porta):
            print("-> Servidor ONLINE! Abrindo navegador...")
            time.sleep(1.5) # Dá tempo para a interface ser construída
            webbrowser.open(url)
            return
        time.sleep(1)
    print("-> Timeout: O servidor demorou muito para responder.")

try:
    porta = 8599
    url = f"http://localhost:{porta}"

    print(f"2. Verificando a porta {porta}...")
    
    if servidor_esta_rodando(porta):
        print("3. A porta já está em uso. Reabrindo o navegador...")
        webbrowser.open(url)
        time.sleep(3)
        sys.exit(0)
        
    else:
        print("3. Porta livre! Preparando os caminhos de rede...")
        if getattr(sys, 'frozen', False):
            application_path = sys._MEIPASS
        else:
            application_path = os.path.dirname(os.path.abspath(__file__))
        
        os.chdir(application_path)

        # --- A SOLUÇÃO ESTÁ AQUI: PEGANDO O CAMINHO ABSOLUTO ---
        caminho_app = os.path.join(application_path, "app.py")

        print("4. Soltando o Vigia para abrir o Chrome na hora certa...")
        threading.Thread(target=esperar_e_abrir_navegador, args=(porta,), daemon=True).start()

        print("5. Dando a partida no Streamlit. Segure firme...")
        import streamlit.web.cli as stcli

        if __name__ == "__main__":
            sys.argv = [
                "streamlit",
                "run",
                caminho_app,  # <--- ENTREGANDO O ARQUIVO DIRETAMENTE NA MÃO DELE
                f"--server.port={porta}",
                "--server.headless=true", 
                "--global.developmentMode=false"
            ]
            sys.exit(stcli.main())

except SystemExit:
    pass 
except Exception as e:
    print("\n=== OCORREU UM ERRO FATAL ===")
    print(traceback.format_exc())
    with open("ERRO_FATAL_SISTEMA.txt", "w") as f:
        f.write(traceback.format_exc())
    input("Pressione ENTER para fechar...")