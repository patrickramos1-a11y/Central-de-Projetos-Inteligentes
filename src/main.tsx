import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bot,
  Check,
  Clipboard,
  Database,
  FileText,
  GitBranch,
  Layers3,
  Link2,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Save,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import "./styles.css";

type Status = "ativo" | "inativo" | "rascunho" | "arquivado";

type AiTool = {
  id: string;
  name: string;
  description: string | null;
  access_url: string | null;
  usage_instructions: string | null;
  status: Status;
};

type PromptCategory = {
  id: string;
  name: string;
  description: string | null;
  status: Status;
};

type ProjectType = {
  id: string;
  name: string;
  description: string | null;
  status: Status;
};

type Prompt = {
  id: string;
  title: string;
  short_description: string | null;
  content: string;
  category_id: string | null;
  ai_tool_id: string | null;
  project_type_id: string | null;
  variables: string | null;
  version: string;
  status: Status;
};

type JourneyTemplate = {
  id: string;
  name: string;
  description: string | null;
  project_type_id: string | null;
  status: Status;
};

type JourneyStep = {
  id: string;
  journey_template_id: string;
  name: string;
  description: string | null;
  step_order: number;
  objective: string | null;
  ai_tool_id: string | null;
  expected_output: string | null;
  checklist: string | null;
  execution_instructions: string | null;
  status: Status;
};

type StepPrompt = {
  id: string;
  journey_step_id: string;
  prompt_id: string;
  prompt_order: number;
  usage_notes: string | null;
};

type Procedure = {
  id: string;
  title: string;
  description: string | null;
  content: string;
  category: string | null;
  project_type_id: string | null;
  journey_step_id: string | null;
  status: Status;
};

type Tables = {
  ai_tools: AiTool[];
  prompt_categories: PromptCategory[];
  project_types: ProjectType[];
  prompts: Prompt[];
  journey_templates: JourneyTemplate[];
  journey_steps: JourneyStep[];
  step_prompts: StepPrompt[];
  procedures: Procedure[];
};

type ModuleKey =
  | "ai_tools"
  | "prompt_categories"
  | "prompts"
  | "project_types"
  | "journey_templates"
  | "journey_steps"
  | "procedures";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
const supabase = hasSupabaseConfig ? createClient(supabaseUrl!, supabaseAnonKey!) : null;

const emptyTables: Tables = {
  ai_tools: [],
  prompt_categories: [],
  project_types: [],
  prompts: [],
  journey_templates: [],
  journey_steps: [],
  step_prompts: [],
  procedures: [],
};

const modules: Array<{ key: ModuleKey; label: string; icon: typeof Bot; description: string }> = [
  {
    key: "ai_tools",
    label: "Ferramentas de IA",
    icon: Bot,
    description: "Cadastre ChatGPT, Claude, NotebookLM e outras ferramentas usadas pela equipe.",
  },
  {
    key: "prompt_categories",
    label: "Categorias",
    icon: Layers3,
    description: "Organize os prompts por finalidade, etapa ou area de uso.",
  },
  {
    key: "prompts",
    label: "Prompts",
    icon: Clipboard,
    description: "Crie comandos reutilizaveis com variaveis e ferramenta recomendada.",
  },
  {
    key: "project_types",
    label: "Tipos de Projeto",
    icon: FileText,
    description: "Defina produtos ou tipos de projeto que poderao ter jornadas proprias.",
  },
  {
    key: "journey_templates",
    label: "Jornadas",
    icon: Route,
    description: "Monte modelos reutilizaveis de execucao por tipo de projeto.",
  },
  {
    key: "journey_steps",
    label: "Etapas",
    icon: ListChecks,
    description: "Cadastre etapas, objetivos, checklists, resultados esperados e prompts vinculados.",
  },
  {
    key: "procedures",
    label: "Procedimentos",
    icon: GitBranch,
    description: "Registre regras internas e instrucoes operacionais da equipe.",
  },
];

function createBlankRecord(moduleKey: ModuleKey) {
  const base = { status: "ativo" as Status };

  if (moduleKey === "ai_tools") {
    return { name: "", description: "", access_url: "", usage_instructions: "", ...base };
  }

  if (moduleKey === "prompt_categories" || moduleKey === "project_types") {
    return { name: "", description: "", ...base };
  }

  if (moduleKey === "prompts") {
    return {
      title: "",
      short_description: "",
      content: "",
      category_id: "",
      ai_tool_id: "",
      project_type_id: "",
      variables: "{{nome_projeto}}, {{tipo_projeto}}",
      version: "1.0",
      status: "rascunho" as Status,
    };
  }

  if (moduleKey === "journey_templates") {
    return { name: "", description: "", project_type_id: "", ...base };
  }

  if (moduleKey === "journey_steps") {
    return {
      journey_template_id: "",
      name: "",
      description: "",
      step_order: 1,
      objective: "",
      ai_tool_id: "",
      expected_output: "",
      checklist: "",
      execution_instructions: "",
      ...base,
    };
  }

  return {
    title: "",
    description: "",
    content: "",
    category: "",
    project_type_id: "",
    journey_step_id: "",
    ...base,
  };
}

function App() {
  const [activeModule, setActiveModule] = useState<ModuleKey>("ai_tools");
  const [tables, setTables] = useState<Tables>(emptyTables);
  const [formState, setFormState] = useState<Record<string, unknown>>(createBlankRecord("ai_tools"));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState("Pronto para configurar a Central de Projetos IA.");
  const [linkForm, setLinkForm] = useState({ journey_step_id: "", prompt_id: "", prompt_order: 1, usage_notes: "" });

  const activeModuleMeta = modules.find((module) => module.key === activeModule)!;

  const stats = useMemo(
    () => [
      { label: "Ferramentas", value: tables.ai_tools.length },
      { label: "Prompts", value: tables.prompts.length },
      { label: "Jornadas", value: tables.journey_templates.length },
      { label: "Etapas", value: tables.journey_steps.length },
    ],
    [tables],
  );

  const filteredRecords = useMemo(() => {
    const records = tables[activeModule] as Array<Record<string, unknown>>;
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return records;
    }

    return records.filter((record) => JSON.stringify(record).toLowerCase().includes(needle));
  }, [activeModule, query, tables]);

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    setFormState(createBlankRecord(activeModule));
    setEditingId(null);
    setQuery("");
  }, [activeModule]);

  async function loadData() {
    if (!supabase) {
      setNotice("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para conectar o Supabase.");
      return;
    }

    setIsLoading(true);
    const tableNames: Array<keyof Tables> = [
      "ai_tools",
      "prompt_categories",
      "project_types",
      "prompts",
      "journey_templates",
      "journey_steps",
      "step_prompts",
      "procedures",
    ];

    const results = await Promise.all(
      tableNames.map(async (tableName) => {
        const { data, error } = await supabase.from(tableName).select("*").order("created_at", { ascending: false });
        return { tableName, data, error };
      }),
    );

    const nextTables = { ...emptyTables };
    const errors = results.filter((result) => result.error);

    results.forEach((result) => {
      nextTables[result.tableName] = (result.data ?? []) as never;
    });

    setTables(nextTables);
    setIsLoading(false);
    setNotice(
      errors.length
        ? "Nao foi possivel carregar todas as tabelas. Confira se o SQL do Supabase foi aplicado."
        : "Dados sincronizados com o Supabase.",
    );
  }

  function updateField(field: string, value: string | number) {
    setFormState((current) => ({ ...current, [field]: value }));
  }

  function startCreate() {
    setEditingId(null);
    setFormState(createBlankRecord(activeModule));
  }

  function startEdit(record: Record<string, unknown>) {
    setEditingId(record.id as string);
    setFormState(
      Object.fromEntries(
        Object.entries(record)
          .filter(([key]) => !["id", "created_at", "updated_at"].includes(key))
          .map(([key, value]) => [key, value ?? ""]),
      ),
    );
  }

  async function saveRecord() {
    if (!supabase) {
      setNotice("Conecte o Supabase antes de salvar.");
      return;
    }

    const payload = normalizePayload(formState);
    const request = editingId
      ? supabase.from(activeModule).update(payload).eq("id", editingId)
      : supabase.from(activeModule).insert(payload);
    const { error } = await request;

    if (error) {
      setNotice(`Erro ao salvar: ${error.message}`);
      return;
    }

    setNotice(editingId ? "Registro atualizado." : "Registro criado.");
    startCreate();
    await loadData();
  }

  async function deleteRecord(id: string) {
    if (!supabase) {
      setNotice("Conecte o Supabase antes de excluir.");
      return;
    }

    const { error } = await supabase.from(activeModule).delete().eq("id", id);
    setNotice(error ? `Erro ao excluir: ${error.message}` : "Registro excluido.");
    await loadData();
  }

  async function saveStepPrompt() {
    if (!supabase) {
      setNotice("Conecte o Supabase antes de vincular prompts.");
      return;
    }

    if (!linkForm.journey_step_id || !linkForm.prompt_id) {
      setNotice("Selecione uma etapa e um prompt para criar o vinculo.");
      return;
    }

    const { error } = await supabase.from("step_prompts").insert(normalizePayload(linkForm));
    setNotice(error ? `Erro ao vincular prompt: ${error.message}` : "Prompt vinculado a etapa.");
    setLinkForm({ journey_step_id: "", prompt_id: "", prompt_order: 1, usage_notes: "" });
    await loadData();
  }

  async function deleteStepPrompt(id: string) {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.from("step_prompts").delete().eq("id", id);
    setNotice(error ? `Erro ao remover vinculo: ${error.message}` : "Vinculo removido.");
    await loadData();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          <span>Central de Projetos IA</span>
        </div>

        <nav className="nav-list" aria-label="Modulos de cadastro">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <button
                className={`nav-item ${activeModule === module.key ? "active" : ""}`}
                key={module.key}
                onClick={() => setActiveModule(module.key)}
              >
                <Icon size={18} />
                <span>{module.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>Cadastros configuraveis</h1>
            <p>Monte ferramentas, prompts, jornadas e etapas antes de executar projetos reais.</p>
          </div>
          <button className="ghost-button" onClick={loadData} disabled={isLoading}>
            {isLoading ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
            <span>Sincronizar</span>
          </button>
        </header>

        <section className="metric-grid" aria-label="Resumo da configuracao">
          {stats.map((stat) => (
            <article className="metric-card" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </article>
          ))}
        </section>

        <section className={`setup-alert ${hasSupabaseConfig ? "connected" : ""}`}>
          <Database size={18} />
          <span>{notice}</span>
        </section>

        <section className="module-layout">
          <div className="list-panel">
            <div className="panel-heading">
              <div>
                <h2>{activeModuleMeta.label}</h2>
                <p>{activeModuleMeta.description}</p>
              </div>
              <label className="search-field">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar" />
              </label>
            </div>

            <div className="record-list">
              {filteredRecords.length ? (
                filteredRecords.map((record) => (
                  <article className="record-row" key={record.id as string}>
                    <div>
                      <strong>{getRecordTitle(record)}</strong>
                      <span>{getRecordSubtitle(record, tables)}</span>
                    </div>
                    <div className="row-actions">
                      <span className={`status-pill ${String(record.status ?? "ativo")}`}>{String(record.status ?? "ativo")}</span>
                      <button title="Editar" onClick={() => startEdit(record)}>
                        <Pencil size={16} />
                      </button>
                      <button title="Excluir" onClick={() => deleteRecord(record.id as string)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <Sparkles size={22} />
                  <strong>Nenhum registro encontrado</strong>
                  <span>Crie o primeiro item para comecar a montar a operacao.</span>
                </div>
              )}
            </div>
          </div>

          <aside className="form-panel">
            <div className="form-heading">
              <h2>{editingId ? "Editar registro" : "Novo registro"}</h2>
              <button className="icon-button" onClick={startCreate} title="Novo">
                <Plus size={17} />
              </button>
            </div>

            <DynamicForm
              moduleKey={activeModule}
              value={formState}
              tables={tables}
              onChange={updateField}
            />

            <button className="primary-button" onClick={saveRecord}>
              <Save size={17} />
              <span>{editingId ? "Salvar alteracoes" : "Criar registro"}</span>
            </button>
          </aside>
        </section>

        <section className="link-panel">
          <div className="panel-heading">
            <div>
              <h2>Vinculos entre etapas e prompts</h2>
              <p>Uma etapa pode usar varios prompts, e um prompt pode aparecer em varias etapas.</p>
            </div>
          </div>

          <div className="link-form">
            <SelectField
              label="Etapa"
              value={linkForm.journey_step_id}
              onChange={(value) => setLinkForm((current) => ({ ...current, journey_step_id: value }))}
              options={tables.journey_steps.map((step) => ({ value: step.id, label: `${step.step_order}. ${step.name}` }))}
            />
            <SelectField
              label="Prompt"
              value={linkForm.prompt_id}
              onChange={(value) => setLinkForm((current) => ({ ...current, prompt_id: value }))}
              options={tables.prompts.map((prompt) => ({ value: prompt.id, label: prompt.title }))}
            />
            <Field
              label="Ordem"
              type="number"
              value={linkForm.prompt_order}
              onChange={(value) => setLinkForm((current) => ({ ...current, prompt_order: Number(value) }))}
            />
            <Field
              label="Notas de uso"
              value={linkForm.usage_notes}
              onChange={(value) => setLinkForm((current) => ({ ...current, usage_notes: value }))}
            />
            <button className="primary-button" onClick={saveStepPrompt}>
              <Link2 size={17} />
              <span>Vincular</span>
            </button>
          </div>

          <div className="link-list">
            {tables.step_prompts.map((link) => (
              <article className="record-row compact" key={link.id}>
                <div>
                  <strong>{findName(tables.journey_steps, link.journey_step_id)}</strong>
                  <span>{findTitle(tables.prompts, link.prompt_id)} · ordem {link.prompt_order}</span>
                </div>
                <button title="Remover vinculo" onClick={() => deleteStepPrompt(link.id)}>
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function DynamicForm({
  moduleKey,
  value,
  tables,
  onChange,
}: {
  moduleKey: ModuleKey;
  value: Record<string, unknown>;
  tables: Tables;
  onChange: (field: string, value: string | number) => void;
}) {
  if (moduleKey === "ai_tools") {
    return (
      <div className="form-grid">
        <Field label="Nome" value={value.name} onChange={(next) => onChange("name", next)} />
        <Field label="URL de acesso" value={value.access_url} onChange={(next) => onChange("access_url", next)} />
        <TextArea label="Descricao" value={value.description} onChange={(next) => onChange("description", next)} />
        <TextArea label="Instrucoes de uso" value={value.usage_instructions} onChange={(next) => onChange("usage_instructions", next)} />
        <StatusField value={value.status} onChange={(next) => onChange("status", next)} />
      </div>
    );
  }

  if (moduleKey === "prompt_categories" || moduleKey === "project_types") {
    return (
      <div className="form-grid">
        <Field label="Nome" value={value.name} onChange={(next) => onChange("name", next)} />
        <TextArea label="Descricao" value={value.description} onChange={(next) => onChange("description", next)} />
        <StatusField value={value.status} onChange={(next) => onChange("status", next)} />
      </div>
    );
  }

  if (moduleKey === "prompts") {
    return (
      <div className="form-grid">
        <Field label="Titulo" value={value.title} onChange={(next) => onChange("title", next)} />
        <Field label="Descricao curta" value={value.short_description} onChange={(next) => onChange("short_description", next)} />
        <TextArea label="Conteudo do prompt" value={value.content} onChange={(next) => onChange("content", next)} rows={7} />
        <Field label="Variaveis" value={value.variables} onChange={(next) => onChange("variables", next)} />
        <Field label="Versao" value={value.version} onChange={(next) => onChange("version", next)} />
        <SelectField
          label="Categoria"
          value={value.category_id}
          onChange={(next) => onChange("category_id", next)}
          options={tables.prompt_categories.map((item) => ({ value: item.id, label: item.name }))}
        />
        <SelectField
          label="Ferramenta"
          value={value.ai_tool_id}
          onChange={(next) => onChange("ai_tool_id", next)}
          options={tables.ai_tools.map((item) => ({ value: item.id, label: item.name }))}
        />
        <SelectField
          label="Tipo de projeto"
          value={value.project_type_id}
          onChange={(next) => onChange("project_type_id", next)}
          options={tables.project_types.map((item) => ({ value: item.id, label: item.name }))}
        />
        <StatusField value={value.status} onChange={(next) => onChange("status", next)} includeDraft />
      </div>
    );
  }

  if (moduleKey === "journey_templates") {
    return (
      <div className="form-grid">
        <Field label="Nome da jornada" value={value.name} onChange={(next) => onChange("name", next)} />
        <TextArea label="Descricao" value={value.description} onChange={(next) => onChange("description", next)} />
        <SelectField
          label="Tipo de projeto"
          value={value.project_type_id}
          onChange={(next) => onChange("project_type_id", next)}
          options={tables.project_types.map((item) => ({ value: item.id, label: item.name }))}
        />
        <StatusField value={value.status} onChange={(next) => onChange("status", next)} />
      </div>
    );
  }

  if (moduleKey === "journey_steps") {
    return (
      <div className="form-grid">
        <SelectField
          label="Jornada"
          value={value.journey_template_id}
          onChange={(next) => onChange("journey_template_id", next)}
          options={tables.journey_templates.map((item) => ({ value: item.id, label: item.name }))}
        />
        <Field label="Ordem" type="number" value={value.step_order} onChange={(next) => onChange("step_order", Number(next))} />
        <Field label="Nome da etapa" value={value.name} onChange={(next) => onChange("name", next)} />
        <TextArea label="Descricao" value={value.description} onChange={(next) => onChange("description", next)} />
        <TextArea label="Objetivo" value={value.objective} onChange={(next) => onChange("objective", next)} />
        <SelectField
          label="Ferramenta recomendada"
          value={value.ai_tool_id}
          onChange={(next) => onChange("ai_tool_id", next)}
          options={tables.ai_tools.map((item) => ({ value: item.id, label: item.name }))}
        />
        <TextArea label="Checklist" value={value.checklist} onChange={(next) => onChange("checklist", next)} />
        <TextArea label="Instrucoes de execucao" value={value.execution_instructions} onChange={(next) => onChange("execution_instructions", next)} />
        <TextArea label="Resultado esperado" value={value.expected_output} onChange={(next) => onChange("expected_output", next)} />
        <StatusField value={value.status} onChange={(next) => onChange("status", next)} />
      </div>
    );
  }

  return (
    <div className="form-grid">
      <Field label="Titulo" value={value.title} onChange={(next) => onChange("title", next)} />
      <Field label="Categoria" value={value.category} onChange={(next) => onChange("category", next)} />
      <TextArea label="Descricao" value={value.description} onChange={(next) => onChange("description", next)} />
      <TextArea label="Conteudo" value={value.content} onChange={(next) => onChange("content", next)} rows={7} />
      <SelectField
        label="Tipo de projeto"
        value={value.project_type_id}
        onChange={(next) => onChange("project_type_id", next)}
        options={tables.project_types.map((item) => ({ value: item.id, label: item.name }))}
      />
      <SelectField
        label="Etapa relacionada"
        value={value.journey_step_id}
        onChange={(next) => onChange("journey_step_id", next)}
        options={tables.journey_steps.map((item) => ({ value: item.id, label: item.name }))}
      />
      <StatusField value={value.status} onChange={(next) => onChange("status", next)} />
    </div>
  );
}

function Field({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string;
  value: unknown;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({
  label,
  value,
  rows = 4,
  onChange,
}: {
  label: string;
  value: unknown;
  rows?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea rows={rows} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: unknown;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
        <option value="">Nao vinculado</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusField({
  value,
  includeDraft = false,
  onChange,
}: {
  value: unknown;
  includeDraft?: boolean;
  onChange: (value: string) => void;
}) {
  const options = includeDraft ? ["rascunho", "ativo", "inativo", "arquivado"] : ["ativo", "inativo", "arquivado"];

  return (
    <label className="field">
      <span>Status</span>
      <select value={String(value ?? "ativo")} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function normalizePayload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => {
      if (value === "") {
        return [key, null];
      }

      return [key, value];
    }),
  );
}

function getRecordTitle(record: Record<string, unknown>) {
  return String(record.name ?? record.title ?? "Sem titulo");
}

function getRecordSubtitle(record: Record<string, unknown>, tables: Tables) {
  if (record.short_description) {
    return String(record.short_description);
  }

  if (record.description) {
    return String(record.description);
  }

  if (record.journey_template_id) {
    return `Jornada: ${findName(tables.journey_templates, String(record.journey_template_id))}`;
  }

  if (record.category) {
    return String(record.category);
  }

  return "Registro configuravel da operacao";
}

function findName(records: Array<{ id: string; name: string }>, id: string) {
  return records.find((record) => record.id === id)?.name ?? "Nao encontrado";
}

function findTitle(records: Array<{ id: string; title: string }>, id: string) {
  return records.find((record) => record.id === id)?.title ?? "Nao encontrado";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
