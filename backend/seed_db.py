import os
import sys
import sqlite3

# --- BLINDAGEM DE SEGURANÇA ---
# Exige autorização explícita via variável de ambiente para impedir apagar banco acidentalmente
if os.environ.get("ALLOW_SEED") != "1" and os.environ.get("FORCE_SEED") != "1":
    print("[BLOQUEADO] OPERACAO CANCELADA POR SEGURANCA:")
    print("   O script seed_db.py apaga e reinicia tabelas com dados de teste.")
    print("   Para autorizar a execucao, defina a variavel de ambiente ALLOW_SEED=1 (ou FORCE_SEED=1).")
    sys.exit(1)

db_path = 'backend/data/notas_departamento.db'

# Connect to database
if os.path.exists(db_path):
    conn_check = sqlite3.connect(db_path)
    cur_check = conn_check.cursor()
    try:
        cur_check.execute("SELECT count(*) FROM notas")
        count = cur_check.fetchone()[0]
        if count > 100 and os.environ.get("FORCE_SEED") != "1":
            print(f"❌ CANCELADO POR SEGURANÇA: O banco {db_path} contém {count} notas reais.")
            print("Para sobrescrever com dados de teste, defina a variável de ambiente FORCE_SEED=1.")
            sys.exit(1)
    except Exception:
        pass
    finally:
        conn_check.close()

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Clean existing records first to avoid constraint errors
cursor.execute("DELETE FROM notas")
cursor.execute("DELETE FROM notas_ramal")

# Seed data for 'notas'
# Columns: Numero_Nota, ID_Cronologia, Status_Obra, Conjunto, Circuito, Local_Instalacao, Regional, Planejado_DDPM, Mes_Execucao_Planejado, Data_Envio_Projeto, Centro_Responsavel, Status_Nota, Prioridade_Nota, Observacao, "Check", Status_Anterior, Nota_Mae
notas_data = [
    # A Mother note (Planejado 2026)
    (100001, 1, "Em Andamento", "POA", "POA123", "045-TESTE1", "Guarulhos", 50000.0, "2026-03-01", "15/01/2026", "C_RESP_1", 10, "Programável", "Nota Mãe do Lote A", "-", "-", "-"),
    # Daughter 1 (Planejado 2026)
    (100002, 2, "Pendente", "POA", "POA123", "045-TESTE2", "Guarulhos", 0.0, "2026-03-01", "15/01/2026", "C_RESP_1", 10, "Programável", "Nota Filha A1", "-", "-", "100001"),
    # Daughter 2 (Planejado 2026)
    (100003, 3, "Pendente", "POA", "POA123", "045-TESTE3", "Guarulhos", 0.0, "2026-03-01", "15/01/2026", "C_RESP_1", 10, "Programável", "Nota Filha A2", "-", "-", "100001"),
    # An independent note (Planejado 2026)
    (100004, 4, "Liberado", "MOGI", "MOG789", "130-MOGI1", "Mogi das Cruzes", 12000.0, "2026-05-01", "10/02/2026", "-", 51, "Urgente", "Nota Importante Mogi", "-", "-", "-"),
    # An independent note (Planejado 2026)
    (100005, 5, "-", "SUZANO", "SUZ456", "155-SUZANO1", "Mogi das Cruzes", 30000.0, "2026-08-01", "-", "-", 0, "Emergente", "", "-", "-", "-"),
    # A past note (Planejado 2025)
    (100006, 6, "Executado", "POA", "POA123", "045-TESTE4", "Guarulhos", 15000.0, "2025-06-01", "10/05/2025", "-", 54, "Programável", "Obra Concluída no ano passado", "-", "-", "-"),
    # A future note (Planejado 2027)
    (100007, 7, "-", "MOGI", "MOG789", "130-MOGI2", "Mogi das Cruzes", 8000.0, "2027-01-01", "-", "-", 10, "Programável", "Planejado para 2027", "-", "-", "-"),
    # Another 2026 note (Litoral Norte)
    (100008, 8, "Em Andamento", "CARAGUA", "195-CARAG", "195-LITORAL1", "Litoral Norte", 22000.0, "2026-10-01", "20/05/2026", "-", 11, "Urgente", "Reforço de rede no Litoral", "-", "-", "-"),
]

cursor.executemany("""
    INSERT INTO notas (
        Numero_Nota, ID_Cronologia, Status_Obra, Conjunto, Circuito, Local_Instalacao,
        Regional, Planejado_DDPM, Mes_Execucao_Planejado, Data_Envio_Projeto,
        Centro_Responsavel, Status_Nota, Prioridade_Nota, Observacao, "Check",
        Status_Anterior, Nota_Mae
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""", notas_data)

# Seed data for 'notas_ramal'
# Columns: Numero_Nota, ID_Cronologia, Status_Obra, Conjunto, Circuito, Local_Instalacao, Planejado_DDPM, Mes_Execucao_Planejado, CenTrab_Respon, Prioridade_Nota, Observacao, Extracao_Antiga, Status_Nota, Status_Anterior, Check_Btzero, Plano
ramal_data = [
    (200001, 1, "Em Andamento", "POA", "POA123", "045-RAMAL1", 5000.0, "2026-03-01", "CEN_POA", "Programável", "Ramal poa", "N", "10 Em planejamento", "-", "-", "SIM"),
    (200002, 2, "Pendente", "MOGI", "MOG789", "130-RAMAL2", 1500.0, "2026-04-01", "CEN_MOGI", "Urgente", "Ramal mogi", "N", "00 Pendente", "-", "-", "NÃO"),
    (200003, 3, "Executado", "SUZANO", "SUZ456", "155-RAMAL3", 3500.0, "2025-12-01", "CEN_SUZ", "Programável", "Concluído", "S", "54 Executado/Energizado", "-", "-", "SIM"),
]

cursor.executemany("""
    INSERT INTO notas_ramal (
        Numero_Nota, ID_Cronologia, Status_Obra, Conjunto, Circuito, Local_Instalacao,
        Planejado_DDPM, Mes_Execucao_Planejado, CenTrab_Respon, Prioridade_Nota,
        Observacao, Extracao_Antiga, Status_Nota, Status_Anterior, Check_Btzero, Plano
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""", ramal_data)

conn.commit()
conn.close()
print("Banco de dados populado com dados de teste local com sucesso!")
