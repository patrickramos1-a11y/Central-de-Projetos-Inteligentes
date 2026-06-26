PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ai_tools (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  access_url TEXT,
  usage_instructions TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'arquivado')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS prompt_categories (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'arquivado')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS project_types (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'arquivado')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  title TEXT NOT NULL,
  short_description TEXT,
  content TEXT NOT NULL DEFAULT '',
  category_id TEXT REFERENCES prompt_categories(id) ON DELETE SET NULL,
  ai_tool_id TEXT REFERENCES ai_tools(id) ON DELETE SET NULL,
  project_type_id TEXT REFERENCES project_types(id) ON DELETE SET NULL,
  variables TEXT,
  version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'ativo', 'inativo', 'arquivado')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS journey_templates (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  project_type_id TEXT REFERENCES project_types(id) ON DELETE SET NULL,
  context TEXT NOT NULL DEFAULT 'projeto' CHECK (context IN ('projeto', 'cliente', 'geral')),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'arquivado')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS journey_steps (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  journey_template_id TEXT NOT NULL REFERENCES journey_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  step_order INTEGER NOT NULL DEFAULT 1,
  objective TEXT,
  ai_tool_id TEXT REFERENCES ai_tools(id) ON DELETE SET NULL,
  expected_output TEXT,
  checklist TEXT,
  execution_instructions TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'arquivado')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS step_prompts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  journey_step_id TEXT NOT NULL REFERENCES journey_steps(id) ON DELETE CASCADE,
  prompt_id TEXT REFERENCES prompts(id) ON DELETE SET NULL,
  title TEXT,
  content TEXT,
  ai_tool_id TEXT REFERENCES ai_tools(id) ON DELETE SET NULL,
  prompt_status TEXT NOT NULL DEFAULT 'preenchido' CHECK (prompt_status IN ('pendente', 'preenchido', 'nao_aplicavel')),
  is_required INTEGER NOT NULL DEFAULT 1,
  placeholder_note TEXT,
  prompt_order INTEGER NOT NULL DEFAULT 1,
  usage_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (journey_step_id, prompt_id)
);

CREATE TABLE IF NOT EXISTS procedures (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  title TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL DEFAULT '',
  category TEXT,
  project_type_id TEXT REFERENCES project_types(id) ON DELETE SET NULL,
  journey_step_id TEXT REFERENCES journey_steps(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'arquivado')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  company TEXT,
  responsible TEXT,
  project_type_id TEXT REFERENCES project_types(id) ON DELETE SET NULL,
  journey_template_id TEXT REFERENCES journey_templates(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'planejado' CHECK (status IN ('planejado', 'em_andamento', 'concluido', 'bloqueado', 'arquivado')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS project_steps (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_journey_step_id TEXT REFERENCES journey_steps(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  step_order INTEGER NOT NULL DEFAULT 1,
  objective TEXT,
  ai_tool_id TEXT REFERENCES ai_tools(id) ON DELETE SET NULL,
  expected_output TEXT,
  execution_instructions TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluido', 'bloqueado')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS project_step_checklist_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_step_id TEXT NOT NULL REFERENCES project_steps(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_done INTEGER NOT NULL DEFAULT 0,
  item_order INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS project_step_prompts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_step_id TEXT NOT NULL REFERENCES project_steps(id) ON DELETE CASCADE,
  prompt_id TEXT REFERENCES prompts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  ai_tool_id TEXT REFERENCES ai_tools(id) ON DELETE SET NULL,
  prompt_status TEXT NOT NULL DEFAULT 'preenchido' CHECK (prompt_status IN ('pendente', 'preenchido', 'nao_aplicavel')),
  is_required INTEGER NOT NULL DEFAULT 1,
  placeholder_note TEXT,
  prompt_order INTEGER NOT NULL DEFAULT 1,
  usage_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS project_step_links (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_step_id TEXT NOT NULL REFERENCES project_steps(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  notes TEXT,
  link_order INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  company TEXT,
  logo_url TEXT,
  responsible TEXT,
  project_type_id TEXT REFERENCES project_types(id) ON DELETE SET NULL,
  journey_template_id TEXT REFERENCES journey_templates(id) ON DELETE SET NULL,
  entry_month TEXT,
  status TEXT NOT NULL DEFAULT 'em_implantacao' CHECK (status IN ('em_implantacao', 'ativo', 'concluido', 'bloqueado', 'arquivado')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS client_steps (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  source_journey_step_id TEXT REFERENCES journey_steps(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  step_order INTEGER NOT NULL DEFAULT 1,
  objective TEXT,
  required_evidence_label TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluido', 'bloqueado')),
  notes TEXT,
  due_date TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS client_step_checklist_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  client_step_id TEXT NOT NULL REFERENCES client_steps(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_done INTEGER NOT NULL DEFAULT 0,
  item_order INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS client_step_links (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  client_step_id TEXT NOT NULL REFERENCES client_steps(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  notes TEXT,
  link_order INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS journey_steps_template_order_idx ON journey_steps(journey_template_id, step_order);
CREATE INDEX IF NOT EXISTS step_prompts_step_order_idx ON step_prompts(journey_step_id, prompt_order);
CREATE INDEX IF NOT EXISTS projects_type_idx ON projects(project_type_id);
CREATE INDEX IF NOT EXISTS project_steps_project_order_idx ON project_steps(project_id, step_order);
CREATE INDEX IF NOT EXISTS project_checklist_step_idx ON project_step_checklist_items(project_step_id);
CREATE INDEX IF NOT EXISTS project_prompts_step_idx ON project_step_prompts(project_step_id);
CREATE INDEX IF NOT EXISTS project_links_step_idx ON project_step_links(project_step_id);
CREATE INDEX IF NOT EXISTS clients_type_idx ON clients(project_type_id);
CREATE INDEX IF NOT EXISTS client_steps_client_order_idx ON client_steps(client_id, step_order);
CREATE INDEX IF NOT EXISTS client_checklist_step_idx ON client_step_checklist_items(client_step_id);
CREATE INDEX IF NOT EXISTS client_links_step_idx ON client_step_links(client_step_id);

INSERT INTO ai_tools (name, description, logo_url, access_url, usage_instructions, status)
SELECT 'ChatGPT', 'Processamento inicial, extracao de dados, consolidacao de informacoes, contexto geral e sumarios.', '/ai-tools/chatgpt.png', 'https://chatgpt.com', 'Use nas etapas de leitura, estruturacao, consolidacao e desenvolvimento inicial.', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM ai_tools WHERE lower(name) = 'chatgpt');

INSERT INTO ai_tools (name, description, logo_url, access_url, usage_instructions, status)
SELECT 'Claude', 'Revisao, melhoria, padronizacao e formatacao de textos ja desenvolvidos.', '/ai-tools/claude.png', 'https://claude.ai', 'Use em etapas de revisao, refinamento textual e padronizacao de documentos.', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM ai_tools WHERE lower(name) = 'claude');

INSERT INTO ai_tools (name, description, logo_url, access_url, usage_instructions, status)
SELECT 'NotebookLM', 'Geracao de resumos, roteiros de apresentacao, ideias de imagens e materiais visuais baseados nas fontes.', '/ai-tools/notebooklm.png', 'https://notebooklm.google.com', 'Use depois que o documento e as fontes estiverem consolidados.', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM ai_tools WHERE lower(name) = 'notebooklm');

INSERT INTO journey_templates (id, name, description, context, status)
SELECT 'template-cliente-integracao', 'Integração de Novo Cliente', 'Checklist de entrada de novo cliente no acompanhamento ambiental.', 'cliente', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM journey_templates WHERE id = 'template-cliente-integracao');

INSERT INTO journey_steps (id, journey_template_id, name, step_order, objective, checklist, expected_output, status)
VALUES
  ('cliente-step-cadastro-sisramos', 'template-cliente-integracao', 'Cadastro no SISRAMOS', 1, 'Cadastrar o cliente, usuário e dados principais no SISRAMOS.', 'Solicitar todos os dados necessários para fazer o cadastro completo no SISRAMOS de forma completa (usuário e cliente).
Realizar o cadastro do usuário com os dados do representante legal da empresa e utilizando o email geral da empresa que será utilizado para fazer o login no SISRAMOS.
Realizar o cadastro completo preenchendo todos os itens da janela cadastro e habilitando inicialmente em programação, contatos, plano de ação e contagem clientes.
Preencher email de envio de cobrança.
Inserir a logo do cliente no cadastro.', 'Logo do cliente e cadastro SISRAMOS conferidos', 'ativo'),
  ('cliente-step-plano-acao', 'template-cliente-integracao', 'Plano de Ação', 2, 'Criar, aprovar, importar e apresentar o plano de ação inicial.', 'Criar o plano de ação para a empresa e pegar a aprovação do gestor.
Realizar importação do plano de ação no SISRAMOS.
Agendar e realizar uma reunião inicial para apresentar o plano de ação.', 'Plano de ação aprovado/importado', 'ativo'),
  ('cliente-step-contrato', 'template-cliente-integracao', 'Contrato', 3, 'Coletar assinatura, lançar faturamentos e arquivar o contrato.', 'Enviar e coletar a assinatura do contrato.
Lançar o contrato e os faturamentos no sistema SISRAMOS.
Salvar o contrato assinado em local seguro e salvar no Drive de forma digital.', 'Contrato assinado ou link do contrato no Drive', 'ativo'),
  ('cliente-step-gestao', 'template-cliente-integracao', 'Gestão', 4, 'Atualizar bases internas de gestão e controle do cliente.', 'Incluir empresa na ficha de contatos.
Incluir empresa na lista de cliente AC.
Incluir a empresa e os seus dados na aba de empresas da tabela de lista de cliente de AC.
Solicitar a logo do cliente e salvar na pasta de cliente satisfeitos.', 'Cliente incluído nas listas internas', 'ativo'),
  ('cliente-step-comunicacao', 'template-cliente-integracao', 'Comunicação', 5, 'Preparar os canais de comunicação e mensagem inicial do cliente.', 'Fazer o levantamento de quais emails padrões devem receber informações sobre projeto e serviços da Ramos Engenharia e atualizar na planilha lista de empresa de AC.
Criar capa para grupo de WhatsApp.
Criar grupo de WhatsApp, colocar a descrição e incluir todos os integrantes necessários do grupo.
Criar modelo de mensagem rápida com os dados básicos do cliente.
Enviar mensagem de boas-vindas e dar start ao atendimento.', 'Grupo/canal criado e mensagem de boas-vindas enviada', 'ativo')
ON CONFLICT(id) DO NOTHING;

INSERT INTO journey_templates (id, name, description, context, status)
SELECT 'template-projeto-ambiental-padrao', 'Projeto Ambiental Padrão', 'Jornada operacional padrão para elaboração de projetos ambientais com IA.', 'projeto', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM journey_templates WHERE id = 'template-projeto-ambiental-padrao');

INSERT INTO journey_steps (id, journey_template_id, name, description, step_order, objective, expected_output, checklist, execution_instructions, status)
VALUES
  ('projeto-ambiental-step-01', 'template-projeto-ambiental-padrao', 'Criar a conversa de contexto e subir todos os documentos do cliente', '1. Contexto & Extração', 1, 'Executar a atividade da fase 1. Contexto & Extração usando ChatGPT.', 'Arquivos carregados na conversa', 'Entrada: CNPJ, contrato social, documentação do imóvel, plantas, relatório fotográfico
Saída esperada: Arquivos carregados na conversa
Ferramenta: ChatGPT', 'Fase: 1. Contexto & Extração', 'ativo'),
  ('projeto-ambiental-step-02', 'template-projeto-ambiental-padrao', 'Rodar o prompt de extração dos documentos', '1. Contexto & Extração', 2, 'Executar a atividade da fase 1. Contexto & Extração usando ChatGPT.', 'Dados extraídos e salvos em formato legível pela IA', 'Entrada: Documentos carregados
Saída esperada: Dados extraídos e salvos em formato legível pela IA
Ferramenta: ChatGPT', 'Fase: 1. Contexto & Extração', 'ativo'),
  ('projeto-ambiental-step-03', 'template-projeto-ambiental-padrao', 'Explicar o projeto e pedir um sumário inicial', '2. Sumário do Projeto', 3, 'Executar a atividade da fase 2. Sumário do Projeto usando ChatGPT.', 'Sumário proposto em rascunho', 'Entrada: Base de contexto estruturada
Saída esperada: Sumário proposto em rascunho
Ferramenta: ChatGPT', 'Fase: 2. Sumário do Projeto', 'ativo'),
  ('projeto-ambiental-step-04', 'template-projeto-ambiental-padrao', 'Limpar e estruturar o sumário', '2. Sumário do Projeto', 4, 'Executar a atividade da fase 2. Sumário do Projeto usando ChatGPT.', 'Sumário final numerado e hierarquizado', 'Entrada: Sumário rascunho
Saída esperada: Sumário final numerado e hierarquizado
Ferramenta: ChatGPT', 'Fase: 2. Sumário do Projeto', 'ativo'),
  ('projeto-ambiental-step-05', 'template-projeto-ambiental-padrao', 'Enviar contexto adicional do tópico a desenvolver', '3. Escrita Tópico a Tópico', 5, 'Executar a atividade da fase 3. Escrita Tópico a Tópico usando ChatGPT.', 'ChatGPT pronto para desenvolver o tópico', 'Entrada: Sumário final + contexto específico do tópico
Saída esperada: ChatGPT pronto para desenvolver o tópico
Ferramenta: ChatGPT', 'Fase: 3. Escrita Tópico a Tópico', 'ativo'),
  ('projeto-ambiental-step-06', 'template-projeto-ambiental-padrao', 'Pedir o desenvolvimento do tópico ou subtópico', '3. Escrita Tópico a Tópico', 6, 'Executar a atividade da fase 3. Escrita Tópico a Tópico usando ChatGPT.', 'Texto do tópico redigido', 'Entrada: Contexto do tópico
Saída esperada: Texto do tópico redigido
Ferramenta: ChatGPT', 'Fase: 3. Escrita Tópico a Tópico', 'ativo'),
  ('projeto-ambiental-step-07', 'template-projeto-ambiental-padrao', 'Refinar com direcionamentos e colar no Word', '3. Escrita Tópico a Tópico', 7, 'Executar a atividade da fase 3. Escrita Tópico a Tópico usando ChatGPT → Word.', 'Rascunho consolidado no Word', 'Entrada: Texto do tópico
Saída esperada: Rascunho consolidado no Word
Ferramenta: ChatGPT → Word', 'Fase: 3. Escrita Tópico a Tópico', 'ativo'),
  ('projeto-ambiental-step-08', 'template-projeto-ambiental-padrao', 'Abrir nova conversa e subir o projeto escrito', '4. Fluxogramas', 8, 'Executar a atividade da fase 4. Fluxogramas usando ChatGPT.', 'Projeto carregado na conversa de fluxogramas', 'Entrada: Projeto escrito em texto
Saída esperada: Projeto carregado na conversa de fluxogramas
Ferramenta: ChatGPT', 'Fase: 4. Fluxogramas', 'ativo'),
  ('projeto-ambiental-step-09', 'template-projeto-ambiental-padrao', 'Gerar e salvar imagens dos fluxogramas', '4. Fluxogramas', 9, 'Executar a atividade da fase 4. Fluxogramas usando ChatGPT.', 'Imagens dos fluxogramas salvas', 'Entrada: Lista de fluxos identificados
Saída esperada: Imagens dos fluxogramas salvas
Ferramenta: ChatGPT', 'Fase: 4. Fluxogramas', 'ativo'),
  ('projeto-ambiental-step-10', 'template-projeto-ambiental-padrao', 'Formatar títulos e subtítulos no Word', '5. Formatação & Layout', 10, 'Executar a atividade da fase 5. Formatação & Layout usando Claude + Word.', 'Títulos padronizados', 'Entrada: Rascunho do projeto
Saída esperada: Títulos padronizados
Ferramenta: Claude + Word', 'Fase: 5. Formatação & Layout', 'ativo'),
  ('projeto-ambiental-step-11', 'template-projeto-ambiental-padrao', 'Formatar tabelas e inserir sumário automático', '5. Formatação & Layout', 11, 'Executar a atividade da fase 5. Formatação & Layout usando Claude + Word.', 'Tabelas formatadas e sumário automático', 'Entrada: Documento com títulos
Saída esperada: Tabelas formatadas e sumário automático
Ferramenta: Claude + Word', 'Fase: 5. Formatação & Layout', 'ativo'),
  ('projeto-ambiental-step-12', 'template-projeto-ambiental-padrao', 'Aplicar layout do escritório e inserir mapas e fluxogramas', '5. Formatação & Layout', 12, 'Executar a atividade da fase 5. Formatação & Layout usando Claude + Word.', 'Projeto no padrão visual da empresa', 'Entrada: Documento formatado, mapas e imagens de fluxograma
Saída esperada: Projeto no padrão visual da empresa
Ferramenta: Claude + Word', 'Fase: 5. Formatação & Layout', 'ativo'),
  ('projeto-ambiental-step-13', 'template-projeto-ambiental-padrao', 'Subir fonte-modelo e projeto formatado', '6. Apresentações / Síntese', 13, 'Executar a atividade da fase 6. Apresentações / Síntese usando NotebookLM.', 'Fontes carregadas no NotebookLM', 'Entrada: Fonte de apresentação + projeto formatado
Saída esperada: Fontes carregadas no NotebookLM
Ferramenta: NotebookLM', 'Fase: 6. Apresentações / Síntese', 'ativo'),
  ('projeto-ambiental-step-14', 'template-projeto-ambiental-padrao', 'Gerar apresentação ou síntese por tópico', '6. Apresentações / Síntese', 14, 'Executar a atividade da fase 6. Apresentações / Síntese usando NotebookLM → Word.', 'Sínteses inseridas no projeto', 'Entrada: Fontes carregadas
Saída esperada: Sínteses inseridas no projeto
Ferramenta: NotebookLM → Word', 'Fase: 6. Apresentações / Síntese', 'ativo'),
  ('projeto-ambiental-step-15', 'template-projeto-ambiental-padrao', 'Subir fotos do levantamento e diretrizes', '7. Relatório Fotográfico', 15, 'Executar a atividade da fase 7. Relatório Fotográfico usando NotebookLM.', 'Fontes do relatório carregadas', 'Entrada: Fotos, diretrizes e projeto
Saída esperada: Fontes do relatório carregadas
Ferramenta: NotebookLM', 'Fase: 7. Relatório Fotográfico', 'ativo'),
  ('projeto-ambiental-step-16', 'template-projeto-ambiental-padrao', 'Gerar relatório fotográfico detalhado', '7. Relatório Fotográfico', 16, 'Executar a atividade da fase 7. Relatório Fotográfico usando NotebookLM.', 'Tópico de relatório fotográfico detalhado', 'Entrada: Fotos e diretrizes
Saída esperada: Tópico de relatório fotográfico detalhado
Ferramenta: NotebookLM', 'Fase: 7. Relatório Fotográfico', 'ativo'),
  ('projeto-ambiental-step-17', 'template-projeto-ambiental-padrao', 'Consolidar tudo no Word e revisar entrega', '8. Montagem Final', 17, 'Executar a atividade da fase 8. Montagem Final usando Word.', 'Projeto final concluído', 'Entrada: Projeto, mapas, fluxogramas, sínteses e relatório fotográfico
Saída esperada: Projeto final concluído
Ferramenta: Word', 'Fase: 8. Montagem Final', 'ativo')
ON CONFLICT(id) DO NOTHING;

INSERT INTO step_prompts (journey_step_id, title, content, prompt_status, is_required, placeholder_note, prompt_order, usage_notes)
VALUES
  ('projeto-ambiental-step-01', 'Prompt — recebimento de documentos', '', 'pendente', 1, 'Preencher com o prompt definitivo para confirmação de recebimento dos arquivos.', 1, 'Prompt criado como espaço pendente para preenchimento manual.'),
  ('projeto-ambiental-step-02', 'Prompt — extração dos documentos', '', 'pendente', 1, 'Preencher com o prompt definitivo de extração e organização dos dados.', 1, 'Prompt criado como espaço pendente para preenchimento manual.'),
  ('projeto-ambiental-step-03', 'Prompt — gerar sumário inicial', '', 'pendente', 1, 'Preencher com o prompt definitivo para geração do sumário inicial.', 1, 'Prompt criado como espaço pendente para preenchimento manual.'),
  ('projeto-ambiental-step-04', 'Prompt — limpar e hierarquizar sumário', '', 'pendente', 1, 'Preencher com o prompt definitivo para remover tópicos e organizar a hierarquia.', 1, 'Prompt criado como espaço pendente para preenchimento manual.'),
  ('projeto-ambiental-step-05', 'Prompt — contexto do tópico', '', 'pendente', 1, 'Preencher com o prompt definitivo para preparar o tópico antes da escrita.', 1, 'Prompt criado como espaço pendente para preenchimento manual.'),
  ('projeto-ambiental-step-06', 'Prompt — desenvolver tópico', '', 'pendente', 1, 'Preencher com o prompt definitivo para redação técnica do tópico.', 1, 'Prompt criado como espaço pendente para preenchimento manual.'),
  ('projeto-ambiental-step-07', 'Prompt — refinar tópico', '', 'pendente', 1, 'Preencher com o prompt definitivo para refinamentos, tabelas e fechamento do tópico.', 1, 'Prompt criado como espaço pendente para preenchimento manual.'),
  ('projeto-ambiental-step-08', 'Prompt — identificar fluxos', '', 'pendente', 1, 'Preencher com o prompt definitivo para identificar processos representáveis em fluxograma.', 1, 'Prompt criado como espaço pendente para preenchimento manual.'),
  ('projeto-ambiental-step-09', 'Prompt — gerar imagem de fluxograma', '', 'pendente', 1, 'Preencher com o prompt definitivo para gerar cada imagem de fluxograma.', 1, 'Prompt criado como espaço pendente para preenchimento manual.'),
  ('projeto-ambiental-step-10', 'Prompt — formatação de títulos', '', 'pendente', 1, 'Preencher com o prompt definitivo para padronização de títulos e subtítulos.', 1, 'Prompt criado como espaço pendente para preenchimento manual.'),
  ('projeto-ambiental-step-11', 'Prompt — tabelas e sumário', '', 'pendente', 1, 'Preencher com o prompt definitivo para formatar tabelas e inserir sumário.', 1, 'Prompt criado como espaço pendente para preenchimento manual.'),
  ('projeto-ambiental-step-12', 'Prompt — layout e imagens', '', 'pendente', 1, 'Preencher com o prompt definitivo para capa, cabeçalho, rodapé, mapas, imagens e legendas.', 1, 'Prompt criado como espaço pendente para preenchimento manual.'),
  ('projeto-ambiental-step-13', 'Prompt — carregar fontes no NotebookLM', '', 'pendente', 1, 'Preencher com o prompt definitivo para orientar o NotebookLM sobre modelo e conteúdo.', 1, 'Prompt criado como espaço pendente para preenchimento manual.'),
  ('projeto-ambiental-step-14', 'Prompt — gerar síntese por tópico', '', 'pendente', 1, 'Preencher com o prompt definitivo para geração de sínteses/apresentações por tópico.', 1, 'Prompt criado como espaço pendente para preenchimento manual.'),
  ('projeto-ambiental-step-15', 'Prompt — carregar fotos e diretrizes', '', 'pendente', 1, 'Preencher com o prompt definitivo para preparar o relatório fotográfico.', 1, 'Prompt criado como espaço pendente para preenchimento manual.'),
  ('projeto-ambiental-step-16', 'Prompt — montar relatório fotográfico', '', 'pendente', 1, 'Preencher com o prompt definitivo para organizar fotos, ambientes e legendas técnicas.', 1, 'Prompt criado como espaço pendente para preenchimento manual.'),
  ('projeto-ambiental-step-17', 'Prompt — revisão final', '', 'pendente', 1, 'Preencher com o prompt definitivo para revisão de numeração, sumário, quebras e coerência geral.', 1, 'Prompt criado como espaço pendente para preenchimento manual.')
ON CONFLICT(journey_step_id, prompt_id) DO NOTHING;
