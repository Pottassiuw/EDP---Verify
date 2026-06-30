# region Chapter 1. IMPORTS & CONSTANTS
from streamlit.proto import AuthRedirect_pb2
import os
import time
import pandas as pd
import subprocess
import win32com.client
import pyperclip
import gc
import json
import sqlite3

from config import CAMINHO_PASTA_SQL, CAMINHO_EXPORT_NOTAS, CAMINHO_EXPORT_ORDEM, CAMINHO_EXPORT_MEDIDAS, CAMINHO_DB

# Nomes de Arquivos
ARQUIVO_NOME_IW28 = os.path.basename(CAMINHO_EXPORT_NOTAS)
ARQUIVO_NOME_IW38 = os.path.basename(CAMINHO_EXPORT_ORDEM)
ARQUIVO_NOME_IW66 = os.path.basename(CAMINHO_EXPORT_MEDIDAS)    

# Parâmetros SAP
NOME_SISTEMA_SAP = "P40_S4/HANA"
LAYOUT_IW38 = "/GALVAO"
LAYOUT_IW66 = "/GALVAO"
CAMINHO_SAP_LOGON = r"C:\Program Files (x86)\SAP\FrontEnd\SAPgui\saplogon.exe"
# endregion

# region Chapter 2. CREDENTIALS LOAD
# Descobre a pasta onde o script está rodando e procura o arquivo JSON
caminho_script = os.path.dirname(os.path.abspath(__file__))
caminho_credenciais = os.path.join(caminho_script, 'credenciais.json')

# Tenta ler o arquivo de senhas
try:
    with open(caminho_credenciais, 'r', encoding='utf-8') as f:
        segredos = json.load(f)
        LOGIN_SAP = segredos['LOGIN_SAP']
        SENHA_SAP = segredos['SENHA_SAP']
except FileNotFoundError:
    print(f"❌ ERRO FATAL: Arquivo 'credenciais.json' não encontrado na pasta {caminho_script}.")
    print("Crie o arquivo com suas credenciais antes de rodar o robô.")
    os._exit(1)
except KeyError as e:
    print(f"❌ ERRO FATAL: Chave {e} não encontrada dentro do 'credenciais.json'.")
    os._exit(1)
# endregion

# region Chapter 3. SAP AUTOMATION CLASS
class SapAutomator:
    def __init__(self, system_name):
        self.system_name = system_name
        self.session = None

    def connect(self, login, password):
        try:
            self.session = None
            gc.collect()

            subprocess.Popen(CAMINHO_SAP_LOGON)
            time.sleep(5)

            sap_gui_auto = None
            for _ in range(10):
                try:
                    sap_gui_auto = win32com.client.GetObject("SAPGUI")
                    break
                except:
                    time.sleep(1)

            if sap_gui_auto is None:
                raise Exception("SAP GUI scripting não disponível")

            application = sap_gui_auto.GetScriptingEngine
            connection = application.OpenConnection(self.system_name, True)
            self.session = connection.Children(0)

            self.session.findById("wnd[0]/usr/txtRSYST-BNAME").text = login
            self.session.findById("wnd[0]/usr/pwdRSYST-BCODE").text = password
            self.session.findById("wnd[0]").sendVKey(0)

            try:
                self.session.findById("wnd[1]/usr/radMULTI_LOGON_OPT2").select()
                self.session.findById("wnd[1]/tbar[0]/btn[0]").press()
            except:
                pass

            print("✅ Login no SAP realizado com sucesso.")
            return self.session
        except Exception as e:
            print(f"❌ Erro ao conectar no SAP: {e}")
            return None

    def execute_iw28(self, lista_notas, output_folder, output_filename):
        if not self.session or not lista_notas: return False
        try:
            print(f"Iniciando transação 'IW28' para auditar {len(lista_notas)} notas do banco...")
            self.session.findById("wnd[0]/tbar[0]/okcd").text = "IW28"
            self.session.findById("wnd[0]").sendVKey(0)
            
            try:
                self.session.findById("wnd[0]/tbar[1]/btn[17]").press()
                self.session.findById("wnd[1]/usr/txtENAME-LOW").text = "713105"
                self.session.findById("wnd[1]/tbar[0]/btn[8]").press()
            except Exception as e:
                print(f"  [Aviso] Ignorando variante: {e}")

            try:
                self.session.findById("wnd[0]/usr/ctxtQMART-LOW").text = ""
            except: pass
            
            notas_string = "\r\n".join(map(str, lista_notas))
            pyperclip.copy(notas_string)
            
            self.session.findById("wnd[0]/usr/btn%_QMNUM_%_APP_%-VALU_PUSH").press()
            time.sleep(1)
            self.session.findById("wnd[1]/tbar[0]/btn[24]").press() 
            time.sleep(1)
            self.session.findById("wnd[1]/tbar[0]/btn[8]").press()  

            print("Executando a consulta no SAP...")
            self.session.findById("wnd[0]/tbar[1]/btn[8]").press()
            time.sleep(5)
            
            print("Exportando dados diretamente para Planilha (XXL)...")
            grid = self.session.findById("wnd[0]/usr/cntlGRID1/shellcont/shell")
            grid.selectAll()
            grid.contextMenu()
            grid.selectContextMenuItem("&XXL")
            
            self.session.findById("wnd[1]/tbar[0]/btn[0]").press()
            self.session.findById("wnd[1]/usr/ctxtDY_PATH").text = output_folder + "\\"
            self.session.findById("wnd[1]/usr/ctxtDY_FILENAME").text = output_filename
            self.session.findById("wnd[1]/tbar[0]/btn[11]").press()

            print(f"✅ Arquivo '{output_filename}' salvo com sucesso na rede!")
            
            self.session.findById("wnd[0]/tbar[0]/btn[15]").press()
            time.sleep(1)
            self.session.findById("wnd[0]/tbar[0]/btn[15]").press()
            
            return True
        except Exception as e:
            print(f"❌ Erro fatal na transação 'IW28': {e}")
            return False

    def execute_iw38(self, order_list, layout, output_folder, output_filename):
        if not self.session or not order_list: return False
        try:
            print(f"Iniciando transação 'IW38' para {len(order_list)} ordens...")
            self.session.findById("wnd[0]/tbar[0]/okcd").text = "IW38"
            self.session.findById("wnd[0]").sendVKey(0)
            self.session.findById("wnd[0]/usr/chkDY_MAB").selected = True
            self.session.findById("wnd[0]/usr/chkDY_HIS").selected = True
            
            try:
                self.session.findById("wnd[0]/usr/ctxtDATUV").text = ""
                self.session.findById("wnd[0]/usr/ctxtDATUB").text = ""
            except: pass
            
            self.session.findById("wnd[0]/usr/ctxtVARIANT").text = layout
            
            orders_string = "\r\n".join(map(str, order_list))
            pyperclip.copy(orders_string)
            
            self.session.findById("wnd[0]/usr/btn%_AUFNR_%_APP_%-VALU_PUSH").press()
            time.sleep(1)
            self.session.findById("wnd[1]/tbar[0]/btn[24]").press()
            time.sleep(1)
            self.session.findById("wnd[1]/tbar[0]/btn[8]").press()
            
            print("Executando a consulta na IW38...")
            self.session.findById("wnd[0]/tbar[1]/btn[8]").press()
            time.sleep(5)

            print("Exportando dados da IW38 diretamente para Planilha (XXL)...")
            grid = self.session.findById("wnd[0]/usr/cntlGRID1/shellcont/shell")
            grid.selectAll()
            grid.contextMenu()
            grid.selectContextMenuItem("&XXL")
            
            self.session.findById("wnd[1]/tbar[0]/btn[0]").press()
            self.session.findById("wnd[1]/usr/ctxtDY_PATH").text = output_folder + "\\"
            self.session.findById("wnd[1]/usr/ctxtDY_FILENAME").text = output_filename
            self.session.findById("wnd[1]/tbar[0]/btn[11]").press()

            print(f"✅ Arquivo '{output_filename}' salvo com sucesso na rede!")

            time.sleep(3) 
            try:
                subprocess.run(["taskkill", "/F", "/IM", "EXCEL.EXE"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                print("🧹 Excel fechado automaticamente para liberar o arquivo.")
            except: pass
            
            self.session.findById("wnd[0]/tbar[0]/btn[15]").press()
            time.sleep(1)
            self.session.findById("wnd[0]/tbar[0]/btn[15]").press()
            
            return True
        except Exception as e:
            print(f"❌ Erro na transação 'IW38': {e}")
            return False

    def execute_iw66(self, lista_notas, output_folder, output_filename):
        if not self.session or not lista_notas: return False
        try:
            print(f"Iniciando transação 'IW66' para {len(lista_notas)} notas...")
            self.session.findById("wnd[0]/tbar[0]/okcd").text = "IW66"
            self.session.findById("wnd[0]").sendVKey(0)
            
            notas_string = "\r\n".join(map(str, lista_notas))
            pyperclip.copy(notas_string)
            
            self.session.findById("wnd[0]/usr/btn%_QMNUM_%_APP_%-VALU_PUSH").press()
            time.sleep(1)
            self.session.findById("wnd[1]/tbar[0]/btn[24]").press() 
            time.sleep(1)
            self.session.findById("wnd[1]/tbar[0]/btn[8]").press()  
            
            try:
                self.session.findById("wnd[0]/usr/ctxtDATUV").text = ""
            except: pass
            try:
                self.session.findById("wnd[0]/usr/ctxtDATUB").text = ""
            except: pass
            
            try:
                self.session.findById("wnd[0]/usr/ctxtVARIANT").text = "/GALVAO"
                self.session.findById("wnd[0]/usr/ctxtVARIANT").setFocus()
                self.session.findById("wnd[0]/usr/ctxtVARIANT").caretPosition = 7
            except Exception as e:
                print(f"  [Aviso] Erro ao aplicar variante: {e}")
                
            self.session.findById("wnd[0]/tbar[1]/btn[8]").press()
            time.sleep(5)
            
            print("Exportando dados da IW66 diretamente para Planilha (XXL)...")
            grid = self.session.findById("wnd[0]/usr/cntlGRID1/shellcont/shell")
            grid.setCurrentCell(-1, "")
            grid.selectAll()
            grid.contextMenu()
            grid.selectContextMenuItem("&XXL")
            
            self.session.findById("wnd[1]/tbar[0]/btn[0]").press()
            self.session.findById("wnd[1]/usr/ctxtDY_PATH").text = output_folder + "\\"
            self.session.findById("wnd[1]/usr/ctxtDY_FILENAME").text = output_filename
            self.session.findById("wnd[1]/tbar[0]/btn[11]").press()
            
            print(f"✅ Arquivo '{output_filename}' salvo com sucesso na rede!")
            
            time.sleep(3) 
            try:
                subprocess.run(["taskkill", "/F", "/IM", "EXCEL.EXE"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                print("🧹 Excel fechado automaticamente para liberar o arquivo.")
            except: pass
            
            self.session.findById("wnd[0]/tbar[0]/btn[15]").press()
            time.sleep(1)
            self.session.findById("wnd[0]/tbar[0]/btn[15]").press()
            
            return True
        except Exception as e:
            print(f"❌ Erro na transação 'IW66': {e}")
            return False
# endregion

# region Chapter 4. HELPER UTILITIES
def limpar_ambiente():
    try:
        subprocess.run(["taskkill", "/F", "/IM", "EXCEL.EXE"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("🧹 Instâncias do Excel fechadas.")
    except: pass

    arquivos_limpar = [
        CAMINHO_EXPORT_NOTAS,
        CAMINHO_EXPORT_ORDEM,
        CAMINHO_EXPORT_MEDIDAS
    ]
    
    for arq in arquivos_limpar:
        try:
            if os.path.exists(arq):
                os.remove(arq)
                print(f"🗑️ Arquivo antigo '{os.path.basename(arq)}' deletado.")
        except Exception as e:
            print(f"⚠️ Aviso: Não foi possível deletar '{os.path.basename(arq)}'. {e}")
# endregion

# region Chapter 5. ROBOT PROCESS EXECUTION
if __name__ == "__main__":
    print("--- INICIANDO ROBÔ SAP: AUDITORIA DE BANCO DE DADOS ---")
    limpar_ambiente()
    
    lista_notas_banco = []
    try:
        if os.path.exists(CAMINHO_DB):
            print("Lendo as notas ativas do banco de dados...")
            conn = sqlite3.connect(CAMINHO_DB)
            cursor = conn.cursor()
            cursor.execute("SELECT Numero_Nota FROM notas WHERE Numero_Nota IS NOT NULL UNION SELECT Numero_Nota FROM notas_ramal WHERE Numero_Nota IS NOT NULL")
            lista_notas_banco = [str(linha[0]) for linha in cursor.fetchall()]
            conn.close()
            print(f"✅ {len(lista_notas_banco)} notas carregadas do banco.")
        else:
            print(f"❌ ERRO: Banco de dados não encontrado no caminho: {CAMINHO_DB}")
            os._exit(1)
    except Exception as e:
        print(f"❌ Erro ao ler o banco de dados: {e}")
        os._exit(1)

    sap = SapAutomator(NOME_SISTEMA_SAP)
    session = sap.connect(LOGIN_SAP, SENHA_SAP)
    
    if session and lista_notas_banco:
        success_iw28 = sap.execute_iw28(lista_notas_banco, os.path.dirname(CAMINHO_EXPORT_NOTAS), ARQUIVO_NOME_IW28)
        
        if success_iw28:
            sap.execute_iw66(lista_notas_banco, os.path.dirname(CAMINHO_EXPORT_MEDIDAS), ARQUIVO_NOME_IW66)
            
            try:
                time.sleep(5)
                caminho_completo_iw28 = CAMINHO_EXPORT_NOTAS
                print(f"Lendo a coluna 'Ordem' do arquivo '{ARQUIVO_NOME_IW28}'...")
                
                time.sleep(2)
                df_para_ordens = pd.read_excel(caminho_completo_iw28)
                
                if "Ordem" in df_para_ordens.columns:
                    orders = df_para_ordens["Ordem"].dropna().astype(int).astype(str).tolist()
                    if orders:
                        sap.execute_iw38(orders, LAYOUT_IW38, os.path.dirname(CAMINHO_EXPORT_ORDEM), ARQUIVO_NOME_IW38)
                    else:
                        print("⚠️ Nenhuma ordem atrelada às notas foi encontrada.")
                else:
                    print("⚠️ Coluna 'Ordem' não encontrada no arquivo gerado.")
            except Exception as e:
                print(f"❌ Erro ao extrair custos (IW38): {e}")
                limpar_ambiente()
        else:
            print("❌ A extração da IW28 falhou. Processo interrompido.")
            
        print("--- EXECUÇÃO CONCLUÍDA ---")
        
        try:
            subprocess.run(["taskkill", "/F", "/IM", "saplogon.exe"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(["taskkill", "/F", "/IM", "sapgui.exe"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except: pass
# endregion