alter table public.step_prompts add column if not exists prompt_status text not null default 'preenchido';
alter table public.step_prompts add column if not exists is_required boolean not null default true;
alter table public.step_prompts add column if not exists placeholder_note text;

alter table public.project_step_prompts add column if not exists prompt_status text not null default 'preenchido';
alter table public.project_step_prompts add column if not exists is_required boolean not null default true;
alter table public.project_step_prompts add column if not exists placeholder_note text;

with template as (
  insert into public.journey_templates (name, description, context, status)
  select 'Projeto Ambiental Padrão', 'Jornada operacional padrão para elaboração de projetos ambientais com IA.', 'projeto', 'ativo'
  where not exists (
    select 1 from public.journey_templates where lower(name) = 'projeto ambiental padrão' and context = 'projeto'
  )
  returning id
),
existing_template as (
  select id from template
  union all
  select id from public.journey_templates where lower(name) = 'projeto ambiental padrão' and context = 'projeto'
  limit 1
),
steps(phase, name, step_order, tool_name, input_text, output_text, prompt_title, prompt_note) as (
  values
    ('1. Contexto & Extração', 'Criar a conversa de contexto e subir todos os documentos do cliente', 1, 'ChatGPT', 'CNPJ, contrato social, documentação do imóvel, plantas, relatório fotográfico', 'Arquivos carregados na conversa', 'Prompt — recebimento de documentos', 'Preencher com o prompt definitivo para confirmação de recebimento dos arquivos.'),
    ('1. Contexto & Extração', 'Rodar o prompt de extração dos documentos', 2, 'ChatGPT', 'Documentos carregados', 'Dados extraídos e salvos em formato legível pela IA', 'Prompt — extração dos documentos', 'Preencher com o prompt definitivo de extração e organização dos dados.'),
    ('2. Sumário do Projeto', 'Explicar o projeto e pedir um sumário inicial', 3, 'ChatGPT', 'Base de contexto estruturada', 'Sumário proposto em rascunho', 'Prompt — gerar sumário inicial', 'Preencher com o prompt definitivo para geração do sumário inicial.'),
    ('2. Sumário do Projeto', 'Limpar e estruturar o sumário', 4, 'ChatGPT', 'Sumário rascunho', 'Sumário final numerado e hierarquizado', 'Prompt — limpar e hierarquizar sumário', 'Preencher com o prompt definitivo para remover tópicos e organizar a hierarquia.'),
    ('3. Escrita Tópico a Tópico', 'Enviar contexto adicional do tópico a desenvolver', 5, 'ChatGPT', 'Sumário final + contexto específico do tópico', 'ChatGPT pronto para desenvolver o tópico', 'Prompt — contexto do tópico', 'Preencher com o prompt definitivo para preparar o tópico antes da escrita.'),
    ('3. Escrita Tópico a Tópico', 'Pedir o desenvolvimento do tópico ou subtópico', 6, 'ChatGPT', 'Contexto do tópico', 'Texto do tópico redigido', 'Prompt — desenvolver tópico', 'Preencher com o prompt definitivo para redação técnica do tópico.'),
    ('3. Escrita Tópico a Tópico', 'Refinar com direcionamentos e colar no Word', 7, 'ChatGPT → Word', 'Texto do tópico', 'Rascunho consolidado no Word', 'Prompt — refinar tópico', 'Preencher com o prompt definitivo para refinamentos, tabelas e fechamento do tópico.'),
    ('4. Fluxogramas', 'Abrir nova conversa e subir o projeto escrito', 8, 'ChatGPT', 'Projeto escrito em texto', 'Projeto carregado na conversa de fluxogramas', 'Prompt — identificar fluxos', 'Preencher com o prompt definitivo para identificar processos representáveis em fluxograma.'),
    ('4. Fluxogramas', 'Gerar e salvar imagens dos fluxogramas', 9, 'ChatGPT', 'Lista de fluxos identificados', 'Imagens dos fluxogramas salvas', 'Prompt — gerar imagem de fluxograma', 'Preencher com o prompt definitivo para gerar cada imagem de fluxograma.'),
    ('5. Formatação & Layout', 'Formatar títulos e subtítulos no Word', 10, 'Claude + Word', 'Rascunho do projeto', 'Títulos padronizados', 'Prompt — formatação de títulos', 'Preencher com o prompt definitivo para padronização de títulos e subtítulos.'),
    ('5. Formatação & Layout', 'Formatar tabelas e inserir sumário automático', 11, 'Claude + Word', 'Documento com títulos', 'Tabelas formatadas e sumário automático', 'Prompt — tabelas e sumário', 'Preencher com o prompt definitivo para formatar tabelas e inserir sumário.'),
    ('5. Formatação & Layout', 'Aplicar layout do escritório e inserir mapas e fluxogramas', 12, 'Claude + Word', 'Documento formatado, mapas e imagens de fluxograma', 'Projeto no padrão visual da empresa', 'Prompt — layout e imagens', 'Preencher com o prompt definitivo para capa, cabeçalho, rodapé, mapas, imagens e legendas.'),
    ('6. Apresentações / Síntese', 'Subir fonte-modelo e projeto formatado', 13, 'NotebookLM', 'Fonte de apresentação + projeto formatado', 'Fontes carregadas no NotebookLM', 'Prompt — carregar fontes no NotebookLM', 'Preencher com o prompt definitivo para orientar o NotebookLM sobre modelo e conteúdo.'),
    ('6. Apresentações / Síntese', 'Gerar apresentação ou síntese por tópico', 14, 'NotebookLM → Word', 'Fontes carregadas', 'Sínteses inseridas no projeto', 'Prompt — gerar síntese por tópico', 'Preencher com o prompt definitivo para geração de sínteses/apresentações por tópico.'),
    ('7. Relatório Fotográfico', 'Subir fotos do levantamento e diretrizes', 15, 'NotebookLM', 'Fotos, diretrizes e projeto', 'Fontes do relatório carregadas', 'Prompt — carregar fotos e diretrizes', 'Preencher com o prompt definitivo para preparar o relatório fotográfico.'),
    ('7. Relatório Fotográfico', 'Gerar relatório fotográfico detalhado', 16, 'NotebookLM', 'Fotos e diretrizes', 'Tópico de relatório fotográfico detalhado', 'Prompt — montar relatório fotográfico', 'Preencher com o prompt definitivo para organizar fotos, ambientes e legendas técnicas.'),
    ('8. Montagem Final', 'Consolidar tudo no Word e revisar entrega', 17, 'Word', 'Projeto, mapas, fluxogramas, sínteses e relatório fotográfico', 'Projeto final concluído', 'Prompt — revisão final', 'Preencher com o prompt definitivo para revisão de numeração, sumário, quebras e coerência geral.')
),
inserted_steps as (
  insert into public.journey_steps (journey_template_id, name, description, step_order, objective, expected_output, checklist, execution_instructions, status)
  select
    existing_template.id,
    steps.name,
    steps.phase,
    steps.step_order,
    'Executar a atividade da fase ' || steps.phase || ' usando ' || steps.tool_name || '.',
    steps.output_text,
    'Entrada: ' || steps.input_text || E'\nSaída esperada: ' || steps.output_text || E'\nFerramenta: ' || steps.tool_name,
    'Fase: ' || steps.phase,
    'ativo'
  from existing_template, steps
  where not exists (
    select 1
    from public.journey_steps
    where journey_template_id = existing_template.id
      and lower(name) = lower(steps.name)
  )
  returning id, name
),
all_steps as (
  select js.id, js.name
  from public.journey_steps js
  join existing_template on existing_template.id = js.journey_template_id
),
prompt_rows as (
  select all_steps.id as journey_step_id, steps.prompt_title, steps.prompt_note
  from all_steps
  join steps on lower(steps.name) = lower(all_steps.name)
)
insert into public.step_prompts (journey_step_id, title, content, prompt_status, is_required, placeholder_note, prompt_order, usage_notes)
select
  prompt_rows.journey_step_id,
  prompt_rows.prompt_title,
  '',
  'pendente',
  true,
  prompt_rows.prompt_note,
  1,
  'Prompt criado como espaço pendente para preenchimento manual.'
from prompt_rows
where not exists (
  select 1
  from public.step_prompts sp
  where sp.journey_step_id = prompt_rows.journey_step_id
    and lower(coalesce(sp.title, '')) = lower(prompt_rows.prompt_title)
);
