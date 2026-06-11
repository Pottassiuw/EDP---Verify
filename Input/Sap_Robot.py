import os
import time
import pandas as pd
import subprocess
import win32com.client
import pyperclip
import gc
import json
import sqlite3

# ==============================================================================
# CONFIGURAÇÕES E CREDENCIAIS
# ==============================================================================
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

# Caminhos de Rede EDP
CAMINHO_FINAL = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\INPUT SQL"
CAMINHO_SAP_LOGON = r"C:\Program Files (x86)\SAP\FrontEnd\SAPgui\saplogon.exe"
CAMINHO_DB = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\INPUT SQL\notas_departamento.db"

# Nomes de Arquivos
ARQUIVO_NOME_IW28 = "Gerada_base_IW28.XLSX"
ARQUIVO_NOME_IW38 = "Gerada_custo_ord_IW38.XLSX"

# Parâmetros SAP
NOME_SISTEMA_SAP = "P40_S4/HANA"
LAYOUT_IW38 = "/GALVAO"

# ==============================================================================
# CLASSE DE AUTOMAÇÃO SAP
# ==============================================================================
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
            # Usa o código da transação direto em vez do Favorito (mais seguro)
            self.session.findById("wnd[0]/tbar[0]/okcd").text = "IW28"
            self.session.findById("wnd[0]").sendVKey(0)
            
            # Puxa a variante 713105 (Exatamente como você mapeou)
            try:
                self.session.findById("wnd[0]/tbar[1]/btn[17]").press()
                self.session.findById("wnd[1]/usr/txtENAME-LOW").text = "713105"
                self.session.findById("wnd[1]/tbar[0]/btn[8]").press()
            except Exception as e:
                print(f"  [Aviso] Ignorando variante: {e}")

            # Limpa o campo Tipo de Nota (QMART-LOW) - Você descobriu esse ID!
            try:
                self.session.findById("wnd[0]/usr/ctxtQMART-LOW").text = ""
            except: pass
            
            # Cola a lista do banco de dados na prancheta do Windows
            notas_string = "\r\n".join(map(str, lista_notas))
            pyperclip.copy(notas_string)
            
            # O botão EXATO de Múltipla Seleção que você mapeou
            self.session.findById("wnd[0]/usr/btn%_QMNUM_%_APP_%-VALU_PUSH").press()
            time.sleep(1)
            self.session.findById("wnd[1]/tbar[0]/btn[24]").press() # Importar da Prancheta
            time.sleep(1)
            self.session.findById("wnd[1]/tbar[0]/btn[8]").press()  # Executar (Confirmar lista)

            print("Executando a consulta no SAP...")
            self.session.findById("wnd[0]/tbar[1]/btn[8]").press()
            time.sleep(5)
            
            # ---------------------------------------------------------
            # EXPORTAÇÃO XXL (Onde o seu parou, e o Python resolve)
            # ---------------------------------------------------------
            print("Exportando dados diretamente para Planilha (XXL)...")
            grid = self.session.findById("wnd[0]/usr/cntlGRID1/shellcont/shell")
            grid.selectAll()
            grid.contextMenu()
            grid.selectContextMenuItem("&XXL")
            
            # Confirma o formato (Planilha/Tabela)
            self.session.findById("wnd[1]/tbar[0]/btn[0]").press()
            
            # Injeção DIRETA de texto, sem abrir o Windows Explorer!
            self.session.findById("wnd[1]/usr/ctxtDY_PATH").text = output_folder
            self.session.findById("wnd[1]/usr/ctxtDY_FILENAME").text = output_filename
            
            # O botão 11 é o comando "Substituir / Gerar" que o seu código gravou
            self.session.findById("wnd[1]/tbar[0]/btn[11]").press()

            print(f"✅ Arquivo '{output_filename}' salvo com sucesso na rede!")
            
            # Volta para a tela inicial para a próxima transação
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
            
            # Limpa as datas
            try:
                self.session.findById("wnd[0]/usr/ctxtDATUV").text = ""
                self.session.findById("wnd[0]/usr/ctxtDATUB").text = ""
            except: pass
            
            self.session.findById("wnd[0]/usr/ctxtVARIANT").text = layout
            
            # Cola as ordens na prancheta
            orders_string = "\r\n".join(map(str, order_list))
            pyperclip.copy(orders_string)
            
            # Seleção Múltipla de Ordens
            self.session.findById("wnd[0]/usr/btn%_AUFNR_%_APP_%-VALU_PUSH").press()
            time.sleep(1)
            self.session.findById("wnd[1]/tbar[0]/btn[24]").press()
            time.sleep(1)
            self.session.findById("wnd[1]/tbar[0]/btn[8]").press()
            
            print("Executando a consulta na IW38...")
            self.session.findById("wnd[0]/tbar[1]/btn[8]").press()
            time.sleep(5)

            # Exportação XXL
            print("Exportando dados da IW38 diretamente para Planilha (XXL)...")
            grid = self.session.findById("wnd[0]/usr/cntlGRID1/shellcont/shell")
            grid.selectAll()
            grid.contextMenu()
            grid.selectContextMenuItem("&XXL")
            
            self.session.findById("wnd[1]/tbar[0]/btn[0]").press()
            self.session.findById("wnd[1]/usr/ctxtDY_PATH").text = output_folder
            self.session.findById("wnd[1]/usr/ctxtDY_FILENAME").text = output_filename
            
            # Substituir/Gerar
            self.session.findById("wnd[1]/tbar[0]/btn[11]").press()

            print(f"✅ Arquivo '{output_filename}' salvo com sucesso na rede!")

            # ---------------------------------------------------------
            # FECHAMENTO FORÇADO DO EXCEL (A CORREÇÃO)
            # ---------------------------------------------------------
            time.sleep(3) # Dá tempo para o SAP disparar a abertura do Excel
            try:
                subprocess.run(["taskkill", "/F", "/IM", "EXCEL.EXE"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                print("🧹 Excel fechado automaticamente para liberar o arquivo.")
            except: pass
            
            # Volta para a tela inicial
            self.session.findById("wnd[0]/tbar[0]/btn[15]").press()
            time.sleep(1)
            self.session.findById("wnd[0]/tbar[0]/btn[15]").press()
            
            return True
            
        except Exception as e:
            print(f"❌ Erro na transação 'IW38': {e}")
            return False

# ==============================================================================
# FUNÇÕES AUXILIARES
# ==============================================================================
def limpar_ambiente():
    try:
        subprocess.run(["taskkill", "/F", "/IM", "EXCEL.EXE"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("🧹 Instâncias do Excel fechadas.")
    except: pass

    arquivos_limpar = [
        os.path.join(CAMINHO_FINAL, ARQUIVO_NOME_IW28),
        os.path.join(CAMINHO_FINAL, ARQUIVO_NOME_IW38)
    ]
    
    for arq in arquivos_limpar:
        try:
            if os.path.exists(arq):
                os.remove(arq)
                print(f"🗑️ Arquivo antigo '{os.path.basename(arq)}' deletado.")
        except Exception as e:
            print(f"⚠️ Aviso: Não foi possível deletar '{os.path.basename(arq)}'. {e}")

# ==============================================================================
# EXECUÇÃO PRINCIPAL
# ==============================================================================
if __name__ == "__main__":
    print("--- INICIANDO ROBÔ SAP: AUDITORIA DE BANCO DE DADOS ---")
    limpar_ambiente()
    
    # 1. Busca a lista de notas diretamente no banco de dados SQLite
    lista_notas_banco = []
    try:
        if os.path.exists(CAMINHO_DB):
            print("Lendo as notas ativas do banco de dados...")
            conn = sqlite3.connect(CAMINHO_DB)
            cursor = conn.cursor()
            cursor.execute("SELECT Numero_Nota FROM notas WHERE Numero_Nota IS NOT NULL")
            # Extrai os números e converte para lista de strings
            lista_notas_banco = [str(linha[0]) for linha in cursor.fetchall()]
            conn.close()
            print(f"✅ {len(lista_notas_banco)} notas carregadas do banco.")
        else:
            print(f"❌ ERRO: Banco de dados não encontrado no caminho: {CAMINHO_DB}")
            os._exit(1)
    except Exception as e:
        print(f"❌ Erro ao ler o banco de dados: {e}")
        os._exit(1)

    # 2. Inicia o SAP
    sap = SapAutomator(NOME_SISTEMA_SAP)
    session = sap.connect(LOGIN_SAP, SENHA_SAP)
    
    if session and lista_notas_banco:
        # ETAPA 1: IW28 (Enviando a lista do banco)
        success_iw28 = sap.execute_iw28(lista_notas_banco, CAMINHO_FINAL, ARQUIVO_NOME_IW28)
        
        if success_iw28:
            try:
                time.sleep(5)
                caminho_completo_iw28 = os.path.join(CAMINHO_FINAL, ARQUIVO_NOME_IW28)
                print(f"Lendo a coluna 'Ordem' do arquivo '{ARQUIVO_NOME_IW28}'...")
                
                limpar_ambiente()
                time.sleep(2)
                
                df_para_ordens = pd.read_excel(caminho_completo_iw28)
                
                if "Ordem" in df_para_ordens.columns:
                    orders = df_para_ordens["Ordem"].dropna().astype(int).astype(str).tolist()
                    
                    if orders:
                        # ETAPA 2: IW38
                        sap.execute_iw38(orders, LAYOUT_IW38, CAMINHO_FINAL, ARQUIVO_NOME_IW38)
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
        except: pass