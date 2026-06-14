alter table public.ai_tools add column if not exists logo_url text;

insert into public.ai_tools (name, description, logo_url, access_url, usage_instructions, status)
select 'ChatGPT', 'Processamento inicial, extracao de dados, consolidacao de informacoes, contexto geral e sumarios.', '/ai-tools/chatgpt.png', 'https://chatgpt.com', 'Use nas etapas de leitura, estruturacao, consolidacao e desenvolvimento inicial.', 'ativo'
where not exists (select 1 from public.ai_tools where lower(name) = 'chatgpt');

insert into public.ai_tools (name, description, logo_url, access_url, usage_instructions, status)
select 'Claude', 'Revisao, melhoria, padronizacao e formatacao de textos ja desenvolvidos.', '/ai-tools/claude.png', 'https://claude.ai', 'Use em etapas de revisao, refinamento textual e padronizacao de documentos.', 'ativo'
where not exists (select 1 from public.ai_tools where lower(name) = 'claude');

insert into public.ai_tools (name, description, logo_url, access_url, usage_instructions, status)
select 'NotebookLM', 'Geracao de resumos, roteiros de apresentacao, ideias de imagens e materiais visuais baseados nas fontes.', '/ai-tools/notebooklm.png', 'https://notebooklm.google.com', 'Use depois que o documento e as fontes estiverem consolidados.', 'ativo'
where not exists (select 1 from public.ai_tools where lower(name) = 'notebooklm');
