import pyodbc

db_path = r"C:\Users\E713105\Downloads\Database11.accdb"

conn = pyodbc.connect(
    r"DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};"
    rf"DBQ={db_path};"
)

cursor = conn.cursor()

cursor.execute("SELECT * FROM 'Input de Notas'")
for row in cursor.fetchall():
    print(row)

cursor.execute(
    "UPDATE 'Input de Notas' SET nome = ? WHERE id = ?",
    ("Alexandre", 1)
)

conn.commit()
conn.close()