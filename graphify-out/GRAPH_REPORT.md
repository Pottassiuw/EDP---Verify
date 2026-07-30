# Graph Report - .  (2026-07-29)

## Corpus Check
- 345 files · ~395,741 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2053 nodes · 5533 edges · 115 communities (88 shown, 27 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 135 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Coffee Backend Tests
- Input Backend Tests
- Carteira Frontend
- Databricks Backend
- Input Route Integration
- Integration Module Tests
- Shared UI Components
- Coffee Jobs Client
- Coffee Operations Tests
- Input Database Sync
- Input Data Services
- Input Reports UI
- Input Feature UI
- Coffee API Routes
- Coffee Database
- Coffee Note Persistence
- Upload Verification Backend
- Carteira Backend Tests
- Input Note Service
- Input Notes Grid
- Frontend API Types
- Carteira Database Sync
- Coffee Completed UI
- Input Management UI
- Input Enrichment Engine
- Application Shell
- Reporting Backend
- Reporting Format UI
- Carteira Actions UI
- Financial Reports UI
- Branded Navigation UI
- Reports Data Hooks
- Frontend App TypeScript
- Sidebar UI Primitives
- Frontend Tooling TypeScript
- Carteira Specifications
- Coffee Hub UI
- Monthly Reports UI
- Coffee Logs UI
- Coffee Operation Inspector
- Coffee Operation Types
- Carteira API Routes
- Frontend Dev Dependencies
- Reports Export UI
- Developer Manual
- Frontend Runtime Dependencies
- Verification Dashboard
- Shadcn Configuration
- Fine Mesh Dialogs
- Carteira Service Dashboard
- Carteira Implementation Plans
- Detail Sheet UI
- Input Feature Types
- SAP Automation Backend
- Plan Movement Dialogs
- Carteira Movement Service
- Carteira Repository
- Coffee Implementation Plans
- Chart UI Components
- Duplicate Comparison UI
- Settings Context
- Reports Navigation
- IW28 Data Integration
- Frontend Build Scripts
- Coffee Note Summary
- Carteira Field Mapping
- Input UI Plans
- Dashboard Reporting Plans
- Upload Progress UI
- Shared Utility Components
- Operation Composer UI
- Refactoring UI Plans
- Coffee Foundation Specs
- TypeScript Base Configuration
- Carteira Status Rules
- Coffee Modal Specs
- Coffee Operation API
- Coffee Queue Plans
- Coffee Logs Specs
- Coffee Lifecycle Specs
- Coffee Verification Specs
- Input Table Specs
- Shadcn Migration Specs
- Shell Settings Specs
- Input Identity Specs
- Vite Environment Types
- Engineering Guidelines
- Backend Test Isolation
- Dexie Dependency
- SAP Status Reports
- Duplicate Detection Design
- React Vite Migration
- Input Module Design
- KPI Drawer Design
- Persistence Performance Design
- Coffee Pending Logs
- Coffee Polish Specs
- IndexedDB Input Cache
- Coffee Kanban Design
- Inter Font Dependency
- Lucide Icon Dependency
- Sonner Toast Dependency
- React Query Dependency
- React Table Dependency
- Persistence Performance Plan
- Input Migration Spec
- Frontend HTML Entry
- Microsoft Excel Logo
- EDP Brand Logo
- EDP Dark Logo
- EDP Master Logo
- EDP Light Logo

## God Nodes (most connected - your core abstractions)
1. `cn()` - 90 edges
2. `react` - 66 edges
3. `upsert_nota()` - 46 edges
4. `get_db_connection()` - 45 edges
5. `Button()` - 45 edges
6. `fmtQtd()` - 42 edges
7. `listar_notas()` - 36 edges
8. `salvar_em_massa()` - 34 edges
9. `garantir_banco()` - 34 edges
10. `listar_logs()` - 32 edges

## Surprising Connections (you probably didn't know these)
- `Backend Dependencies` --conceptually_related_to--> `Backend Input Module`  [INFERRED]
  backend/requirements.txt → docs/dev/06-backend-input-module.md
- `Engineering Rules` --semantically_similar_to--> `Engineering Rules`  [EXTRACTED] [semantically similar]
  AGENTS.md → CLAUDE.md
- `EDP Verify Project Overview` --conceptually_related_to--> `Developer Manual Overview`  [INFERRED]
  README.md → docs/dev/00-overview.md
- `_executar()` --calls--> `conectar()`  [INFERRED]
  backend/databricks_module/client.py → backend/carteira_module/db.py
- `test_consultar_repete_e_depois_sucede()` --indirect_call--> `conectar()`  [INFERRED]
  backend/test_databricks_module.py → backend/carteira_module/db.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **COFFEE-to-Input Note Lifecycle** — docs_coffee_fluxo_transicao_notas_status_transition, docs_dev_05_backend_coffee_module_backend_coffee_module, docs_dev_06_backend_input_module_backend_input_module, docs_dev_08_integracao_coffee_input_coffee_input_integration [INFERRED 0.85]
- **Carteira and Reporting Convergence** — docs_dev_09_frontend_relatorios_relatarios_frontend, docs_dev_10_backend_carteira_module_carteira_backend_module, docs_dev_11_frontend_carteira_carteira_frontend [INFERRED 0.85]
- **Carteira Delivery Phases** — docs_superpowers_plans_2026_07_22_carteira_fase_0_discovery_plan, docs_superpowers_plans_2026_07_22_carteira_fase_1a_backend_plan, docs_superpowers_plans_2026_07_22_carteira_fase_1b_frontend_plan, docs_superpowers_plans_2026_07_23_carteira_fase_2a_backend_plan, docs_superpowers_plans_2026_07_23_carteira_fase_2b_frontend_plan, docs_superpowers_plans_2026_07_23_carteira_fase_3a_backend_plan [EXTRACTED 1.00]
- **Relatorios Evolution** — docs_superpowers_plans_2026_07_17_relatorios_home_plan, docs_superpowers_plans_2026_07_20_relatorios_v2_alertas_postergadas_plan, docs_superpowers_plans_2026_07_20_relatorios_v3_abas_layout_plan [INFERRED 0.85]
- **COFFEE Operational Evolution** — docs_superpowers_specs_2026_06_18_coffee_foundation_design_coffee_backend_foundation, docs_superpowers_specs_2026_06_18_coffee_hub_nav_design_coffee_hub_navigation, docs_superpowers_specs_2026_06_18_coffee_subpages_design_coffee_subpages, docs_superpowers_plans_2026_07_24_coffee_operacao_kanban_persistent_kanban [EXTRACTED 1.00]
- **Carteira and Relatórios Contract Convergence** — docs_superpowers_plans_2026_07_24_carteira_fase_3b_frontend_dashboard_carteira, docs_superpowers_plans_2026_07_27_relatorios_recomposicao_six_screens_shared_report_filters, docs_superpowers_plans_2026_07_29_carteira_fase_4a_backend_dashboard_superset, docs_superpowers_plans_2026_07_29_carteira_fase_4a_frontend_dashboard_convergence [EXTRACTED 1.00]
- **Input UI Overhaul Subprojects** — docs_superpowers_specs_2026_06_28_input_tabela_notas_design_specification, docs_superpowers_specs_2026_06_28_input_navegacao_sidebar_design_specification, docs_superpowers_specs_2026_06_28_input_gerenciar_shadcn_design_specification [EXTRACTED 1.00]
- **Frontend Refactoring Roadmap** — docs_superpowers_specs_2026_07_06_refatoracao_sp1_limpeza_estrutura_design_specification, docs_superpowers_specs_2026_07_06_sp2a_preflight_tailwind_utilities_design_specification, docs_superpowers_specs_2026_07_08_sp2b_shadcn_component_swaps_design_specification, docs_superpowers_specs_2026_07_08_sp3_manual_desenvolvedor_design_specification [EXTRACTED 1.00]
- **Carteira delivery phases** — docs_superpowers_specs_2026_07_22_carteira_fase_1_projecao_explorador_design_document, docs_superpowers_specs_2026_07_23_carteira_fase_2_movimentacao_design_document, docs_superpowers_specs_2026_07_23_carteira_fase_3_dashboard_design_document, docs_superpowers_specs_2026_07_29_carteira_fase_4a_convergencia_relatorios_design_document [EXTRACTED 1.00]

## Communities (115 total, 27 thin omitted)

### Community 0 - "Coffee Backend Tests"
Cohesion: 0.05
Nodes (78): classificar(), nao_gerada | pendente | corrigida | gerada. arquivado NÃO entra aqui.…, listar_logs(), Insere um registro em coffee_logs. Best-effort: nunca levanta., registrar_log(), iniciar_geracao(), obter_job(), sap() (+70 more)

### Community 1 - "Input Backend Tests"
Cohesion: 0.07
Nodes (54): aplicar_edicoes(), carregar_dados(), carregar_logs(), converter_para_iso_data(), deletar_notas(), Cria um backup rotativo do banco em ``config.data_dir()/"backups"``. Só cria um…, Carrega todos os registros da tabela de log de alterações., Exclui notas do banco e registra a exclusão no log de auditoria. O log e o… (+46 more)

### Community 2 - "Carteira Frontend"
Cohesion: 0.06
Nodes (49): base(), CarteiraApi, ParamsNotas, req(), CarteiraSection(), DashboardCarteiraView(), Divergencias(), colunasCarteira (+41 more)

### Community 3 - "Databricks Backend"
Cohesion: 0.06
Nodes (50): _backoff(), _conectar(), consultar(), _executar(), DataFrame, Cliente generico do Databricks SQL Warehouse. Sem conhecimento de dominio:…, Abre uma conexao real com o SQL Warehouse (usado por padrao)., Executa uma consulta e devolve um DataFrame. Repete ate `tentativas` vezes com… (+42 more)

### Community 4 - "Input Route Integration"
Cohesion: 0.08
Nodes (62): obter_data_ultima_alteracao(), Busca a data e hora exata da última modificação feita no banco., esta_sincronizando_rede(), _achar_base(), baixar_backup(), baixar_base(), criar_lote(), criar_nota() (+54 more)

### Community 5 - "Integration Module Tests"
Cohesion: 0.06
Nodes (56): compor_local_instalacao(), Compoe o local de instalacao a partir dos campos decompostos da API COFFEE. A…, obter_nota_plano(), Registro do plano na MESMA representação formatada de carregar_dados()., avisos_proposta(), _calcular_planejado(), montar_nova_nota(), montar_proposta() (+48 more)

### Community 6 - "Shared UI Components"
Cohesion: 0.09
Nodes (39): construirOpcoesMes(), MESES, MesExecucaoPicker(), MesExecucaoPickerProps, Opcao, PageHeader(), SegTab, SegTabs() (+31 more)

### Community 7 - "Coffee Jobs Client"
Cohesion: 0.10
Nodes (41): Classificação de notas COFFEE a partir do id_sap (atual × anterior)., alterar_local(), buscar_nota(), definir_sap(), desarquivar(), _get_logado(), NotaNaoEncontradaErro, Exception (+33 more)

### Community 8 - "Coffee Operations Tests"
Cohesion: 0.15
Nodes (42): criar_operacao(), listar_itens_operacao(), listar_operacoes_ativas(), obter_operacao(), upsert_item_operacao(), iniciar_consulta_operacao(), iniciar_geracao_operacao(), adicionar_entradas() (+34 more)

### Community 9 - "Input Database Sync"
Cohesion: 0.08
Nodes (45): dashboard(), Versao composta (input+carteira) para o ETag do dashboard — barata, permite…, Dashboard: reusa a agregacao dos Relatorios (meta/planejado/executado) e…, versao_dashboard(), carregar_dados_ramal(), carregar_log_arquivos(), carregar_metas(), carregar_planos_depara() (+37 more)

### Community 10 - "Input Data Services"
Cohesion: 0.07
Nodes (41): caminho_controle_recomposicao(), caminho_sap_robot(), data_dir(), Path, Dicionários de domínio e caminhos do módulo Input. Porte de Input/config.py,…, Diretório de dados local (sobrescritível por env para testes)., Script do robô SAP — vive em backend/Sap_Robot.py, não numa pasta de rede., Planilha Controle Plano de Recomposição (OneDrive local sincronizado). Default… (+33 more)

### Community 11 - "Input Reports UI"
Cohesion: 0.09
Nodes (34): baixarBlob(), CAMPOS_EDITAVEIS, COLUNAS, COLUNAS_COLAGEM, FILTROS_FAIXA, FILTROS_MULTI, FILTROS_TEXTO, ROTULOS (+26 more)

### Community 12 - "Input Feature UI"
Cohesion: 0.14
Nodes (32): react, garantirUsuario(), getUsuario(), InputApi, setUsuario(), gravarSnapshot(), lerSnapshot(), Filters() (+24 more)

### Community 13 - "Coffee API Routes"
Cohesion: 0.15
Nodes (37): trace_atual(), arquivar(), ArquivarPedido, atualizar_sap_operacao(), BuscaPedido, buscar(), consultar(), consultar_operacao() (+29 more)

### Community 14 - "Coffee Database"
Cohesion: 0.08
Nodes (36): data_dir(), Path, Diretório de dados local (sobrescritível por env para testes)., arquivar_nota(), diagnosticar_nota(), get_db_connection(), inicializar_banco(), interromper_operacoes_em_andamento() (+28 more)

### Community 15 - "Coffee Note Persistence"
Cohesion: 0.11
Nodes (36): definir_origem(), listar_notas(), marcar_gerar(), origem_atual(), Liga/desliga a flag a_gerar de uma nota existente., Marca a origem da nota ('avulsa' | 'verificar')., Retorna a origem registrada da nota, ou None., upsert_nota() (+28 more)

### Community 16 - "Upload Verification Backend"
Cohesion: 0.10
Nodes (34): _agendador_sap_noturno(), enrich_candidate(), extract_str(), get_data(), load_state(), mark_duplicata(), parse_coord(), parse_duplicate_ids() (+26 more)

### Community 17 - "Carteira Backend Tests"
Cohesion: 0.14
Nodes (30): normalizar_linha(), inicializar_banco(), carteira_tmp(), _inserir(), _montar_app_dashboard(), _origem_exemplo(), fixture, Testes do modulo Carteira (backend). Origem Databricks sempre mockada. (+22 more)

### Community 18 - "Input Note Service"
Cohesion: 0.12
Nodes (31): CorrecaoItem, EdicaoPedido, ExclusaoPedido, ExclusaoRamalPedido, ExportPedido, HierarquiaPedido, LotePedido, BaseModel (+23 more)

### Community 19 - "Input Notes Grid"
Cohesion: 0.12
Nodes (30): ColagemPlanilhaProps, ColunaDef, CelulaLeitura(), DataGrid(), DataGridProps, larguraAutofit(), medirTexto(), Ordem (+22 more)

### Community 20 - "Frontend API Types"
Cohesion: 0.11
Nodes (29): ApiData, ApiRecord, coffeeFetch(), consultarNota(), CorrigirLocalItemApi, corrigirLocalLote(), erroComDetail(), marcarGerar() (+21 more)

### Community 21 - "Carteira Database Sync"
Cohesion: 0.11
Nodes (28): data_dir(), normalizar_regional_dashboard(), Path, Configuracao do modulo Carteira: caminhos, fonte e dominio., bump_versao(), caminho_banco(), conectar(), definir_meta() (+20 more)

### Community 22 - "Coffee Completed UI"
Cohesion: 0.13
Nodes (21): EDPApi, CoffeeConcluidas(), inPeriod(), ConcluidasList(), ConcluidasListProps, field(), LegacyDate(), local() (+13 more)

### Community 23 - "Input Management UI"
Cohesion: 0.15
Nodes (21): Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Label(), Switch() (+13 more)

### Community 24 - "Input Enrichment Engine"
Cohesion: 0.11
Nodes (28): carregar_base_dataframe(), carregar_projeto_construcao(), Carrega o mapa projeto/construção do JSON na rede; se ausente, devolve o…, Carrega um DataFrame completo a partir de uma tabela SQLite., avaliar_prazo_sap(), _comparar_medida_planejado(), enriquecer_dados(), extrair_data_sap() (+20 more)

### Community 25 - "Application Shell"
Cohesion: 0.10
Nodes (25): fetchData(), markDuplicate(), toggleComplete(), App(), AppContent(), CarteiraSection, CoffeeHub, ConfiguracoesPage (+17 more)

### Community 26 - "Reporting Backend"
Cohesion: 0.11
Nodes (27): _executada(), _linhas_fato(), _mes_de_execucao(), montar_dashboard(), _pct(), DataFrame, Agregação do dashboard do Plano de Recomposição (funções puras). Regras: -…, jul-2026' -> (7, 2026); tolera vazio/lixo -> (None, None). (+19 more)

### Community 27 - "Reporting Format UI"
Cohesion: 0.19
Nodes (18): corCobertura(), DistribuicaoPlano(), DistribuicaoRegional(), HeatmapCobertura(), KpisDashboard(), disponibilidade(), SaldoRegionalResumo(), farol (+10 more)

### Community 28 - "Carteira Actions UI"
Cohesion: 0.32
Nodes (14): Button(), buttonVariants, Table, TableBody, TableCell, TableHead, TableHeader, TableRow (+6 more)

### Community 29 - "Financial Reports UI"
Cohesion: 0.12
Nodes (21): AcoesCriticas(), corCobertura(), agruparPorArea(), DetalhamentoCarteira(), corCobertura(), nomeMes(), ResumoDecisao(), FinanceiroAreas() (+13 more)

### Community 30 - "Branded Navigation UI"
Cohesion: 0.11
Nodes (17): svgBase, AlertDialogMedia(), AlertDialogOverlay(), SelectScrollDownButton(), SelectScrollUpButton(), Separator(), SidebarContent(), SidebarFooter() (+9 more)

### Community 31 - "Reports Data Hooks"
Cohesion: 0.19
Nodes (18): DashboardGeral(), Financeiro(), PlanoInspectorProps, CarteiraRegional(), RegionalKpis(), chaveMatriz(), classeMatriz(), criarMatriz() (+10 more)

### Community 32 - "Frontend App TypeScript"
Cohesion: 0.08
Nodes (25): compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules, jsx, lib, module, moduleDetection (+17 more)

### Community 33 - "Sidebar UI Primitives"
Cohesion: 0.12
Nodes (22): Sidebar(), SidebarContext, SidebarContextProps, SidebarGroupAction(), SidebarGroupContent(), SidebarInput(), SidebarInset(), SidebarMenuAction() (+14 more)

### Community 34 - "Frontend Tooling TypeScript"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+14 more)

### Community 35 - "Carteira Specifications"
Cohesion: 0.09
Nodes (22): Relatórios Home Design, Relatórios, Relatórios v2 Alertas e Postergadas, Relatórios v3 Abas, Carteira de Notas, Carteira de Notas Design Arquitetural, Carteira Fase 1, Sincronização da Carteira (+14 more)

### Community 36 - "Coffee Hub UI"
Cohesion: 0.16
Nodes (16): TriageSnapshot, AppSidebarProps, CoffeeAbrir(), CoffeeAbrirProps, sortIdsDesc(), CoffeeHubProps, CoffeeVerificar(), TriageHandoff (+8 more)

### Community 37 - "Monthly Reports UI"
Cohesion: 0.17
Nodes (16): Banner(), Evolucao(), PontoEvolucao, MESES_ABREV_PT, fmtQtd(), corCarteira(), MensalizacaoChart(), nomeMes() (+8 more)

### Community 38 - "Coffee Logs UI"
Cohesion: 0.15
Nodes (19): ACOES_CONSULTAR, ACOES_GERAR, classeAtual(), DETAIL_LABELS, formatDetailValue(), Grupo, grupoNoPasso(), LogTable() (+11 more)

### Community 39 - "Coffee Operation Inspector"
Cohesion: 0.16
Nodes (17): CoffeeNotaInspector(), InspectorAction, maskLocal(), nextStep(), unmaskLocal(), ConcluidasToolbar(), CoffeeOperacao(), OperacaoKanban() (+9 more)

### Community 40 - "Coffee Operation Types"
Cohesion: 0.19
Nodes (17): field(), NotaOperacaoCard(), NotaOperacaoCardProps, OperacaoBatchBar(), OperacaoBatchBarProps, OperacaoColumn(), OperacaoColumnProps, COLUMNS (+9 more)

### Community 41 - "Carteira API Routes"
Cohesion: 0.15
Nodes (20): listar_divergencias(), dashboard(), divergencias(), listar_notas(), mover(), mover_preview(), MoverPedido, movimentacoes() (+12 more)

### Community 42 - "Frontend Dev Dependencies"
Cohesion: 0.10
Nodes (21): devDependencies, tailwindcss, @tailwindcss/vite, tw-animate-css, @types/node, @types/react, @types/react-dom, typescript (+13 more)

### Community 43 - "Reports Export UI"
Cohesion: 0.13
Nodes (15): StatTile(), Exportar(), BlocoExportacao, BLOCOS, BLOCOS_INICIAIS, ExportarForm(), FormatoExportacao, slugEscopo() (+7 more)

### Community 44 - "Developer Manual"
Cohesion: 0.14
Nodes (20): Backend Dependencies, SAP Robot Dependencies, EDP Verify Design System, COFFEE Note Status Transition, Developer Manual Overview, Verificar Frontend Module, COFFEE Frontend Module, Input Frontend Module (+12 more)

### Community 45 - "Frontend Runtime Dependencies"
Cohesion: 0.11
Nodes (19): class-variance-authority, clsx, @fontsource/ibm-plex-mono, dependencies, class-variance-authority, clsx, @fontsource/ibm-plex-mono, radix-ui (+11 more)

### Community 46 - "Verification Dashboard"
Cohesion: 0.15
Nodes (15): ruleMeta(), titleize(), Dashboard(), DashboardProps, DetailProps, URG, detectarNoveExtra(), MalhaFinaPanel() (+7 more)

### Community 47 - "Shadcn Configuration"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 48 - "Fine Mesh Dialogs"
Cohesion: 0.21
Nodes (13): AlertDialog(), AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter(), AlertDialogHeader(), AlertDialogTitle() (+5 more)

### Community 49 - "Carteira Service Dashboard"
Cohesion: 0.19
Nodes (13): converter_ddpm(), montar(), _pct(), Agregacao do dashboard da Carteira: reusa montar_dashboard (Relatorios) e…, Superset do contrato de Relatorios: preserva o payload do montar_dashboard e…, detalhe(), _numeros_no_plano(), pagina_notas() (+5 more)

### Community 50 - "Carteira Implementation Plans"
Cohesion: 0.13
Nodes (16): Fase 1 Grupo A Input Module Plan, Auto-Vinculos Identity UX Plan, Input Ramal Nota Mae Plan, Input Registro UX Plan, Malha Fina Local 9 Plan, Integracao COFFEE Input Plan, Relatorios Home Plan, Relatorios V2 Alertas Postergadas Plan (+8 more)

### Community 51 - "Detail Sheet UI"
Cohesion: 0.17
Nodes (10): Badge(), badgeVariants, Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay() (+2 more)

### Community 52 - "Input Feature Types"
Cohesion: 0.20
Nodes (14): base(), escrita(), req(), BackupInfo, BaseStatus, EdicaoResultado, HierarquiaInfo, InputMeta (+6 more)

### Community 53 - "SAP Automation Backend"
Cohesion: 0.18
Nodes (8): alterar_medidas_sap(), formatar_quantidade_sap(), log_debug(), obter_ou_criar_sessao_sap(), Tenta se conectar a uma sessão ativa do SAP. Se encontrar uma conexão aberta…, Formata a quantidade com base na unidade: - Se for 'un' (Equipamento), retorna…, Altera as quantidades de medidas das notas fornecidas no SAP GUI via IW22., SapAutomator

### Community 54 - "Plan Movement Dialogs"
Cohesion: 0.25
Nodes (9): Dialog(), DialogContent(), DialogDescription(), DialogFooter(), DialogHeader(), DialogOverlay(), DialogTitle(), camposIniciais() (+1 more)

### Community 55 - "Carteira Movement Service"
Cohesion: 0.26
Nodes (13): avisos(), mapear_nova_nota(), _motivo_bloqueio(), mover_para_plano(), MovimentacaoBloqueadaErro, _numero(), preview(), _prioridade() (+5 more)

### Community 56 - "Carteira Repository"
Cohesion: 0.27
Nodes (12): base_por_plano(), carregar_staging(), listar(), listar_divergencias(), obter(), _preparar_plano(), Connection, SQL da projecao da Carteira: staging, reconciliacao, leitura, agregados. A… (+4 more)

### Community 57 - "Coffee Implementation Plans"
Cohesion: 0.15
Nodes (13): COFFEE Backend Foundation Plan, COFFEE Hub Navigation Plan, COFFEE Subpages Plan, COFFEE Generate and Logs UI Plan, Collapsible Sidebar and COFFEE Logs Plan, COFFEE Not Generated Status Plan, COFFEE Verification Triage Plan, COFFEE Generation Flow Plan (+5 more)

### Community 58 - "Chart UI Components"
Cohesion: 0.21
Nodes (11): ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent(), getPayloadConfigFromPayload(), INITIAL_DIMENSION (+3 more)

### Community 59 - "Duplicate Comparison UI"
Cohesion: 0.23
Nodes (11): coffeeUrl(), mapsUrl(), openCoffee(), DUPC_CTX, DUPC_KEYS, dupcEq(), dupcNorm(), DuplicateCompare() (+3 more)

### Community 60 - "Settings Context"
Cohesion: 0.24
Nodes (10): DEFAULTS, getSystemTheme(), loadSettings(), Settings, SettingsContext, SettingsContextValue, SettingsProvider(), Accent (+2 more)

### Community 61 - "Reports Navigation"
Cohesion: 0.29
Nodes (10): RELATORIOS_TABS, RelatoriosTab, TITULOS_RELATORIOS, criarAvisoExecutadasSemData(), RelatoriosPageContent(), filtrarPlanos(), mensagemErro(), RelatoriosSection() (+2 more)

### Community 62 - "IW28 Data Integration"
Cohesion: 0.20
Nodes (9): Salva um DataFrame completo em uma tabela SQLite, substituindo-a., salvar_base_dataframe(), extraida_em(), obter_por_nota(), Contrato de leitura da base IW28 (extração diária do SAP). A tabela base_iw28 é…, Linha da base_iw28 para a nota SAP, ou None (ausente/fora da extração)., Data da última importação da IW28 registrada em log_arquivos., _sqlite_iw66() (+1 more)

### Community 63 - "Frontend Build Scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, preview, test, type (+1 more)

### Community 64 - "Coffee Note Summary"
Cohesion: 0.27
Nodes (8): CoffeeNotaInspectorProps, CURATED_FIELDS, display(), NotaSummary(), NotaSummaryProps, SummaryRow(), MoverAlvo, NotaRevisao

### Community 65 - "Carteira Field Mapping"
Cohesion: 0.25
Nodes (7): de_para_regional(), hash_conteudo(), _inteiro(), Normalizacao origem Databricks -> dominio da Carteira., Hash estavel das colunas de negocio (o proprio dict de normalizar_linha)., _texto(), test_de_para_regional()

### Community 66 - "Input UI Plans"
Cohesion: 0.25
Nodes (8): KPI Drawer Plan, Sidebar and Settings Plan, UI UX Foundation Plan, UI UX Shell and Settings Plan, Input Management Shadcn Plan, Input Sidebar Navigation Plan, Input Notes Table Plan, Input Datasheet Grid Plan

### Community 67 - "Dashboard Reporting Plans"
Cohesion: 0.25
Nodes (8): Carteira Dashboard, Carteira Fase 3b Frontend Plan, Relatórios Six Screens Plan, Shared Report Filters, Carteira Dashboard Superset, Carteira Fase 4a Backend Plan, Dashboard Contract Convergence, Carteira Fase 4a Frontend Plan

### Community 68 - "Upload Progress UI"
Cohesion: 0.32
Nodes (5): Progress(), KpiDrawer(), UploadScreen(), KpiDrawerProps, UploadScreenProps

### Community 69 - "Shared Utility Components"
Cohesion: 0.36
Nodes (4): Skeleton(), ToggleGroupContext, Toggle(), toggleVariants

### Community 70 - "Operation Composer UI"
Cohesion: 0.38
Nodes (5): Textarea(), OperacaoComposer(), OperacaoComposerProps, parseCoffeeIds(), ParsedIds

### Community 71 - "Refactoring UI Plans"
Cohesion: 0.33
Nodes (6): COFFEE UI Polish Implementation Plan, COFFEE UI Redesign Plan, Refatoracao SP1 Limpeza Estrutura Plan, SP2a Preflight Tailwind Utilities Plan, SP2b shadcn Component Swaps Plan, SP3 Developer Manual Plan

### Community 72 - "Coffee Foundation Specs"
Cohesion: 0.33
Nodes (6): COFFEE Backend Foundation, COFFEE Foundation Design, COFFEE Hub Navigation, COFFEE Hub Navigation Design, COFFEE Operational Subpages, COFFEE Subpages Design

### Community 73 - "TypeScript Base Configuration"
Cohesion: 0.33
Nodes (5): compilerOptions, baseUrl, paths, files, references

### Community 74 - "Carteira Status Rules"
Cohesion: 0.40
Nodes (4): derivar(), Situacao da nota: funcao pura sobre a projecao + presenca no plano., test_situacao_precedencia(), test_situacao_sem_sap_nunca_no_plano()

### Community 75 - "Coffee Modal Specs"
Cohesion: 0.40
Nodes (5): Concluir and Toast Feedback Specification, COFFEE Generate Consult Modal Specification, COFFEE Git Graph Logs Specification, COFFEE Modal Session UX Specification, Installation Location Mass Correction Specification

### Community 76 - "Coffee Operation API"
Cohesion: 0.50
Nodes (4): JobResponse, json(), postIds(), CoffeeOperacaoQuadro

### Community 77 - "Coffee Queue Plans"
Cohesion: 0.50
Nodes (4): COFFEE Operation Kanban Plan, Persistent COFFEE Kanban, COFFEE Queue Integration Design, COFFEE Queue Bridge

### Community 78 - "Coffee Logs Specs"
Cohesion: 0.50
Nodes (4): COFFEE Generate and Logs UI Design, COFFEE Generation and Logs UI, Retractable Sidebar and COFFEE Logs Design, Retractable Sidebar and Logs

### Community 79 - "Coffee Lifecycle Specs"
Cohesion: 0.50
Nodes (4): COFFEE Not Generated Status Design, COFFEE Generation Lifecycle, COFFEE Generation Flow Design, Generation Flow Corrections

### Community 80 - "Coffee Verification Specs"
Cohesion: 0.50
Nodes (4): COFFEE Verify Triage Design, Embedded COFFEE Triage, COFFEE Verify Batch Design, Verify Batch Tasks

### Community 81 - "Input Table Specs"
Cohesion: 0.50
Nodes (4): Input Manage Shadcn Specification, Input Sidebar Navigation Specification, Input Notes Table Specification, Input Overview Data Grid Specification

### Community 82 - "Shadcn Migration Specs"
Cohesion: 1.00
Nodes (4): SP1 Cleanup and Structure Specification, SP2a Tailwind Utilities Specification, SP2b Shadcn Component Swaps Specification, SP3 Developer Manual Specification

### Community 83 - "Shell Settings Specs"
Cohesion: 0.67
Nodes (3): Sidebar 08 and Settings Specification, UI UX Foundation Specification, UI UX Shell Specification

### Community 84 - "Input Identity Specs"
Cohesion: 0.67
Nodes (3): Auto Links Identity UX Specification, Input Extension and Parent Note Specification, Input Record UX Specification

## Knowledge Gaps
- **289 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+284 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Input Feature UI` to `Carteira Frontend`, `Shared UI Components`, `Input Reports UI`, `Input Notes Grid`, `Coffee Completed UI`, `Input Management UI`, `Application Shell`, `Reporting Format UI`, `Carteira Actions UI`, `Financial Reports UI`, `Reports Data Hooks`, `Sidebar UI Primitives`, `Coffee Hub UI`, `Monthly Reports UI`, `Coffee Logs UI`, `Coffee Operation Inspector`, `Reports Export UI`, `Frontend Runtime Dependencies`, `Verification Dashboard`, `Chart UI Components`, `Settings Context`, `Reports Navigation`, `Upload Progress UI`, `Operation Composer UI`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Frontend Runtime Dependencies` to `Inter Font Dependency`, `Lucide Icon Dependency`, `Sonner Toast Dependency`, `React Query Dependency`, `React Table Dependency`, `Input Feature UI`, `Dexie Dependency`, `Frontend Build Scripts`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `Button()` connect `Carteira Actions UI` to `Carteira Frontend`, `Shared UI Components`, `Input Reports UI`, `Input Feature UI`, `Coffee Completed UI`, `Input Management UI`, `Reporting Format UI`, `Financial Reports UI`, `Branded Navigation UI`, `Sidebar UI Primitives`, `Coffee Hub UI`, `Monthly Reports UI`, `Coffee Operation Inspector`, `Coffee Operation Types`, `Reports Export UI`, `Verification Dashboard`, `Fine Mesh Dialogs`, `Plan Movement Dialogs`, `Duplicate Comparison UI`, `Upload Progress UI`, `Operation Composer UI`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _289 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Coffee Backend Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.04979480164158687 - nodes in this community are weakly interconnected._
- **Should `Input Backend Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.06521739130434782 - nodes in this community are weakly interconnected._
- **Should `Carteira Frontend` be split into smaller, more focused modules?**
  _Cohesion score 0.0553116769095698 - nodes in this community are weakly interconnected._