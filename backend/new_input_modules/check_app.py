import re

def verify():
    with open("app.py", "r", encoding="utf-8") as f:
        content = f.read()

    print("=== INICIANDO VERIFICAÇÃO PROGRAMÁTICA DO app.py ===")

    # 1. Verificar se a função 'travar_fechamento_aba' está definida
    if "def travar_fechamento_aba(travar=True):" in content:
        print("[OK] Função travar_fechamento_aba está definida.")
    else:
        print("[ERRO] Função travar_fechamento_aba não foi encontrada!")

    # 2. Verificar se 'sincronizando' está inicializada na sessão
    if "if 'sincronizando' not in st.session_state:" in content:
        print("[OK] Inicialização de 'sincronizando' no st.session_state está presente.")
    else:
        print("[ERRO] Inicialização de 'sincronizando' não encontrada!")

    # 3. Listar botões que devem conter a propriedade disabled
    button_searches = [
        ('form_editar (Exclusão - botao_salvar)', 'botao_salvar = st.form_submit_button("💾 Salvar Edições", type="primary", use_container_width=True, disabled=st.session_state.get(\'sincronizando\', False))'),
        ('form_editar (Exclusão - botao_deletar)', 'botao_deletar = st.form_submit_button("🗑️  Excluir Notas Selecionadas", use_container_width=True, disabled=st.session_state.get(\'sincronizando\', False))'),
        ('form_editar (Lote - botao_salvar_lote)', 'botao_salvar_lote = st.form_submit_button("Aplicar e Salvar Lote", type="primary", use_container_width=True, disabled=st.session_state.get(\'sincronizando\', False))'),
        ('form_editar (Edição Rápida - botao_salvar)', 'botao_salvar = st.form_submit_button("💾 Salvar Edições", type="primary", use_container_width=True, disabled=st.session_state.get(\'sincronizando\', False))'),
        ('btn_vinculo_unico', 'st.button("Aplicar Vínculo Único", type="primary", use_container_width=True, key="btn_vinculo_unico", disabled=st.session_state.get(\'sincronizando\', False))'),
        ('btn_vinculo_lote', 'st.button("🚀 Aplicar Vínculos em Lote", type="primary", use_container_width=True, key="btn_vinculo_lote", disabled=st.session_state.get(\'sincronizando\', False))'),
        ('form_editar_ramal (botao_salvar_ramal)', 'botao_salvar_ramal = st.form_submit_button("💾 Salvar Alterações de Ramal", type="primary", disabled=st.session_state.get(\'sincronizando\', False))'),
        ('form_unica (botao_salvar)', 'st.form_submit_button("💾 Salvar Nova Nota", type="primary", disabled=st.session_state.get(\'sincronizando\', False))'),
        ('form_unica_ramal (botao_salvar)', 'st.form_submit_button("💾 Salvar Nova Nota de Ramal", type="primary", disabled=st.session_state.get(\'sincronizando\', False))'),
        ('form_inserir_massa (botao_salvar)', 'botao_salvar = st.form_submit_button("💾 Salvar Lote de Notas", type="primary", disabled=st.session_state.get(\'sincronizando\', False))'),
        ('form_inserir_massa_ramal (botao_salvar)', 'botao_salvar_ramal = st.form_submit_button("💾 Salvar Lote de Notas de Ramal", type="primary", disabled=st.session_state.get(\'sincronizando\', False))')
    ]

    print("\n--- Verificação de Botões com propriedade 'disabled' ---")
    for name, pattern in button_searches:
        # Normalize whitespace to avoid matching issues
        norm_pattern = re.sub(r'\s+', ' ', pattern).strip()
        norm_content = re.sub(r'\s+', ' ', content)
        if norm_pattern in norm_content:
            print(f"[OK] Botão '{name}' está devidamente desabilitado durante sincronização.")
        else:
            print(f"[ERRO] Botão '{name}' NÃO contém a trava de disabled!")

    # 4. Verificar tratamentos de try/except/finally
    print("\n--- Verificação de Blocos try/except/finally ---")
    blocks = [
        ('Exclusão de Notas (botao_deletar)', 'try:', 'deletar_notas', 'finally:', 'st.session_state.sincronizando = False', 'travar_fechamento_aba(travar=False)'),
        ('Edição em Lote (botao_salvar_lote)', 'try:', 'salvar_em_massa', 'finally:', 'st.session_state.sincronizando = False', 'travar_fechamento_aba(travar=False)'),
        ('Edição Rápida (botao_salvar)', 'try:', 'salvar_em_massa', 'finally:', 'st.session_state.sincronizando = False', 'travar_fechamento_aba(travar=False)'),
        ('Vínculo Único', 'try:', 'vincular_notas_hierarquia', 'finally:', 'st.session_state.sincronizando = False', 'travar_fechamento_aba(travar=False)'),
        ('Vínculo em Lote', 'try:', 'vincular_notas_hierarquia_lote', 'finally:', 'st.session_state.sincronizando = False', 'travar_fechamento_aba(travar=False)'),
        ('Edição de Ramal', 'try:', 'salvar_em_massa_ramal', 'finally:', 'st.session_state.sincronizando = False', 'travar_fechamento_aba(travar=False)'),
        ('Cadastro Único', 'try:', 'salvar_em_massa', 'finally:', 'st.session_state.sincronizando = False', 'travar_fechamento_aba(travar=False)'),
        ('Cadastro Único Ramal', 'try:', 'salvar_em_massa_ramal', 'finally:', 'st.session_state.sincronizando = False', 'travar_fechamento_aba(travar=False)'),
        ('Cadastro Massa', 'try:', 'salvar_em_massa', 'finally:', 'st.session_state.sincronizando = False', 'travar_fechamento_aba(travar=False)'),
        ('Cadastro Massa Ramal', 'try:', 'salvar_em_massa_ramal', 'finally:', 'st.session_state.sincronizando = False', 'travar_fechamento_aba(travar=False)')
    ]
    for block_name, *tokens in blocks:
        missing = [tok for tok in tokens if tok not in content]
        if not missing:
            print(f"[OK] Bloco '{block_name}' contém a estrutura try/except/finally e liberações corretas.")
        else:
            print(f"[ERRO] Bloco '{block_name}' está incompleto! Faltam tokens: {missing}")

if __name__ == "__main__":
    verify()
