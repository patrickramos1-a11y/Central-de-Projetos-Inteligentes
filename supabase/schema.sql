create extension if not exists pgcrypto;

create table if not exists public.ai_tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  logo_url text,
  access_url text,
  usage_instructions text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo', 'arquivado')),
  created_at timestamptz not null default now()
);

alter table public.ai_tools add column if not exists logo_url text;

create table if not exists public.prompt_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo', 'arquivado')),
  created_at timestamptz not null default now()
);

create table if not exists public.project_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo', 'arquivado')),
  created_at timestamptz not null default now()
);

create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  short_description text,
  content text not null,
  category_id uuid references public.prompt_categories(id) on delete set null,
  ai_tool_id uuid references public.ai_tools(id) on delete set null,
  project_type_id uuid references public.project_types(id) on delete set null,
  variables text,
  version text not null default '1.0',
  status text not null default 'rascunho' check (status in ('rascunho', 'ativo', 'inativo', 'arquivado')),
  created_at timestamptz not null default now()
);

create table if not exists public.journey_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  project_type_id uuid references public.project_types(id) on delete set null,
  status text not null default 'ativo' check (status in ('ativo', 'inativo', 'arquivado')),
  created_at timestamptz not null default now()
);

create table if not exists public.journey_steps (
  id uuid primary key default gen_random_uuid(),
  journey_template_id uuid not null references public.journey_templates(id) on delete cascade,
  name text not null,
  description text,
  step_order integer not null default 1,
  objective text,
  ai_tool_id uuid references public.ai_tools(id) on delete set null,
  expected_output text,
  checklist text,
  execution_instructions text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo', 'arquivado')),
  created_at timestamptz not null default now()
);

create table if not exists public.step_prompts (
  id uuid primary key default gen_random_uuid(),
  journey_step_id uuid not null references public.journey_steps(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  prompt_order integer not null default 1,
  usage_notes text,
  created_at timestamptz not null default now(),
  unique (journey_step_id, prompt_id)
);

create table if not exists public.procedures (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  content text not null,
  category text,
  project_type_id uuid references public.project_types(id) on delete set null,
  journey_step_id uuid references public.journey_steps(id) on delete set null,
  status text not null default 'ativo' check (status in ('ativo', 'inativo', 'arquivado')),
  created_at timestamptz not null default now()
);

alter table public.ai_tools enable row level security;
alter table public.prompt_categories enable row level security;
alter table public.project_types enable row level security;
alter table public.prompts enable row level security;
alter table public.journey_templates enable row level security;
alter table public.journey_steps enable row level security;
alter table public.step_prompts enable row level security;
alter table public.procedures enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.ai_tools,
  public.prompt_categories,
  public.project_types,
  public.prompts,
  public.journey_templates,
  public.journey_steps,
  public.step_prompts,
  public.procedures
to anon, authenticated;

drop policy if exists "mvp public select ai_tools" on public.ai_tools;
drop policy if exists "mvp public insert ai_tools" on public.ai_tools;
drop policy if exists "mvp public update ai_tools" on public.ai_tools;
drop policy if exists "mvp public delete ai_tools" on public.ai_tools;
drop policy if exists "mvp public select prompt_categories" on public.prompt_categories;
drop policy if exists "mvp public insert prompt_categories" on public.prompt_categories;
drop policy if exists "mvp public update prompt_categories" on public.prompt_categories;
drop policy if exists "mvp public delete prompt_categories" on public.prompt_categories;
drop policy if exists "mvp public select project_types" on public.project_types;
drop policy if exists "mvp public insert project_types" on public.project_types;
drop policy if exists "mvp public update project_types" on public.project_types;
drop policy if exists "mvp public delete project_types" on public.project_types;
drop policy if exists "mvp public select prompts" on public.prompts;
drop policy if exists "mvp public insert prompts" on public.prompts;
drop policy if exists "mvp public update prompts" on public.prompts;
drop policy if exists "mvp public delete prompts" on public.prompts;
drop policy if exists "mvp public select journey_templates" on public.journey_templates;
drop policy if exists "mvp public insert journey_templates" on public.journey_templates;
drop policy if exists "mvp public update journey_templates" on public.journey_templates;
drop policy if exists "mvp public delete journey_templates" on public.journey_templates;
drop policy if exists "mvp public select journey_steps" on public.journey_steps;
drop policy if exists "mvp public insert journey_steps" on public.journey_steps;
drop policy if exists "mvp public update journey_steps" on public.journey_steps;
drop policy if exists "mvp public delete journey_steps" on public.journey_steps;
drop policy if exists "mvp public select step_prompts" on public.step_prompts;
drop policy if exists "mvp public insert step_prompts" on public.step_prompts;
drop policy if exists "mvp public update step_prompts" on public.step_prompts;
drop policy if exists "mvp public delete step_prompts" on public.step_prompts;
drop policy if exists "mvp public select procedures" on public.procedures;
drop policy if exists "mvp public insert procedures" on public.procedures;
drop policy if exists "mvp public update procedures" on public.procedures;
drop policy if exists "mvp public delete procedures" on public.procedures;

create policy "mvp public select ai_tools" on public.ai_tools for select to anon using (true);
create policy "mvp public insert ai_tools" on public.ai_tools for insert to anon with check (true);
create policy "mvp public update ai_tools" on public.ai_tools for update to anon using (true) with check (true);
create policy "mvp public delete ai_tools" on public.ai_tools for delete to anon using (true);

create policy "mvp public select prompt_categories" on public.prompt_categories for select to anon using (true);
create policy "mvp public insert prompt_categories" on public.prompt_categories for insert to anon with check (true);
create policy "mvp public update prompt_categories" on public.prompt_categories for update to anon using (true) with check (true);
create policy "mvp public delete prompt_categories" on public.prompt_categories for delete to anon using (true);

create policy "mvp public select project_types" on public.project_types for select to anon using (true);
create policy "mvp public insert project_types" on public.project_types for insert to anon with check (true);
create policy "mvp public update project_types" on public.project_types for update to anon using (true) with check (true);
create policy "mvp public delete project_types" on public.project_types for delete to anon using (true);

create policy "mvp public select prompts" on public.prompts for select to anon using (true);
create policy "mvp public insert prompts" on public.prompts for insert to anon with check (true);
create policy "mvp public update prompts" on public.prompts for update to anon using (true) with check (true);
create policy "mvp public delete prompts" on public.prompts for delete to anon using (true);

create policy "mvp public select journey_templates" on public.journey_templates for select to anon using (true);
create policy "mvp public insert journey_templates" on public.journey_templates for insert to anon with check (true);
create policy "mvp public update journey_templates" on public.journey_templates for update to anon using (true) with check (true);
create policy "mvp public delete journey_templates" on public.journey_templates for delete to anon using (true);

create policy "mvp public select journey_steps" on public.journey_steps for select to anon using (true);
create policy "mvp public insert journey_steps" on public.journey_steps for insert to anon with check (true);
create policy "mvp public update journey_steps" on public.journey_steps for update to anon using (true) with check (true);
create policy "mvp public delete journey_steps" on public.journey_steps for delete to anon using (true);

create policy "mvp public select step_prompts" on public.step_prompts for select to anon using (true);
create policy "mvp public insert step_prompts" on public.step_prompts for insert to anon with check (true);
create policy "mvp public update step_prompts" on public.step_prompts for update to anon using (true) with check (true);
create policy "mvp public delete step_prompts" on public.step_prompts for delete to anon using (true);

create policy "mvp public select procedures" on public.procedures for select to anon using (true);
create policy "mvp public insert procedures" on public.procedures for insert to anon with check (true);
create policy "mvp public update procedures" on public.procedures for update to anon using (true) with check (true);
create policy "mvp public delete procedures" on public.procedures for delete to anon using (true);

insert into public.ai_tools (name, description, logo_url, access_url, usage_instructions, status)
select 'ChatGPT', 'Processamento inicial, extracao de dados, consolidacao de informacoes, contexto geral e sumarios.', '/ai-tools/chatgpt.png', 'https://chatgpt.com', 'Use nas etapas de leitura, estruturacao, consolidacao e desenvolvimento inicial.', 'ativo'
where not exists (select 1 from public.ai_tools where lower(name) = 'chatgpt');

insert into public.ai_tools (name, description, logo_url, access_url, usage_instructions, status)
select 'Claude', 'Revisao, melhoria, padronizacao e formatacao de textos ja desenvolvidos.', '/ai-tools/claude.png', 'https://claude.ai', 'Use em etapas de revisao, refinamento textual e padronizacao de documentos.', 'ativo'
where not exists (select 1 from public.ai_tools where lower(name) = 'claude');

insert into public.ai_tools (name, description, logo_url, access_url, usage_instructions, status)
select 'NotebookLM', 'Geracao de resumos, roteiros de apresentacao, ideias de imagens e materiais visuais baseados nas fontes.', '/ai-tools/notebooklm.png', 'https://notebooklm.google.com', 'Use depois que o documento e as fontes estiverem consolidados.', 'ativo'
where not exists (select 1 from public.ai_tools where lower(name) = 'notebooklm');
