import { StrictMode, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import {
  Bot,
  Check,
  CheckCircle2,
  Clipboard,
  Copy,
  Database,
  Upload,
  FileText,
  GitBranch,
  Layers3,
  Link2,
  ListChecks,
  Loader2,
  PanelLeft,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Save,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { createCloudflareApi } from "./lib/cloudflareApi";
import { parseProjectSummary } from "./lib/summaryParser";
import "./styles.css";

type ConfigStatus = "ativo" | "inativo" | "rascunho" | "arquivado";
type ProjectStatus = "planejado" | "em_andamento" | "concluido" | "bloqueado" | "arquivado";
type ClientStatus = "em_implantacao" | "ativo" | "concluido" | "bloqueado" | "arquivado";
type StepStatus = "pendente" | "em_andamento" | "concluido" | "bloqueado";
type ViewMode = "projects" | "journey" | "projectTemplates" | "clients" | "clientJourney" | "settings";

type AppUser = {
  id: string;
  name: string;
  status: ConfigStatus;
  created_at: string;
  updated_at: string;
};

type AiTool = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  access_url: string | null;
  usage_instructions: string | null;
  status: ConfigStatus;
};

type PromptCategory = {
  id: string;
  name: string;
  description: string | null;
  status: ConfigStatus;
};

type ProjectType = {
  id: string;
  name: string;
  description: string | null;
  status: ConfigStatus;
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
  status: ConfigStatus;
};

type JourneyTemplate = {
  id: string;
  name: string;
  description: string | null;
  project_type_id: string | null;
  context: "projeto" | "cliente" | "geral";
  status: ConfigStatus;
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
  status: ConfigStatus;
};

type StepPrompt = {
  id: string;
  journey_step_id: string;
  prompt_id: string | null;
  title: string | null;
  content: string | null;
  ai_tool_id: string | null;
  prompt_status: "pendente" | "preenchido" | "nao_aplicavel";
  is_required: boolean;
  placeholder_note: string | null;
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
  status: ConfigStatus;
};

type Project = {
  id: string;
  name: string;
  company: string | null;
  responsible: string | null;
  project_type_id: string | null;
  journey_template_id: string | null;
  status: ProjectStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectStep = {
  id: string;
  project_id: string;
  source_journey_step_id: string | null;
  name: string;
  description: string | null;
  step_order: number;
  objective: string | null;
  ai_tool_id: string | null;
  expected_output: string | null;
  execution_instructions: string | null;
  status: StepStatus;
  notes: string | null;
};

type ProjectChecklistItem = {
  id: string;
  project_step_id: string;
  label: string;
  is_done: boolean;
  item_order: number;
};

type ProjectStepPrompt = {
  id: string;
  project_step_id: string;
  prompt_id: string | null;
  title: string;
  content: string;
  ai_tool_id: string | null;
  prompt_status: "pendente" | "preenchido" | "nao_aplicavel";
  is_required: boolean;
  placeholder_note: string | null;
  prompt_order: number;
  usage_notes: string | null;
};

type ProjectStepLink = {
  id: string;
  project_step_id: string;
  title: string;
  url: string;
  notes: string | null;
  link_order: number;
};

type ProjectStepPhase = {
  id: string;
  project_step_id: string;
  title: string;
  description: string | null;
  phase_order: number;
  status: StepStatus;
  requires_previous_phase: boolean;
  prerequisite_phase_id: string | null;
  completion_condition: string | null;
  created_at: string;
  updated_at: string | null;
};

type ProjectStepContext = {
  id: string;
  project_step_id: string;
  phase_id: string | null;
  title: string;
  content: string;
  context_order: number;
  status: "ativo" | "rascunho" | "arquivado";
  created_at: string;
  updated_at: string | null;
};

type ProjectSummary = {
  id: string;
  project_id: string;
  raw_text: string;
  consolidated_text: string | null;
  version_number: number;
  status: "draft" | "active" | "archived";
  parse_status: "not_analyzed" | "analyzed" | "needs_review" | "reviewed";
  item_count: number;
  selected_item_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
  activated_at: string | null;
  archived_at: string | null;
};

type SummaryItemStatus = "pendente" | "em_andamento" | "desenvolvido" | "em_revisao" | "concluido" | "bloqueado" | "arquivado";

type ProjectSummaryItem = {
  id: string;
  summary_id: string;
  project_id: string;
  parent_id: string | null;
  topic_number: string;
  title: string;
  level: number;
  sort_order: number;
  original_text: string;
  is_selected: boolean;
  status: SummaryItemStatus;
  notes: string | null;
  parse_confidence: number;
  parse_warning: string | null;
  created_at: string;
  updated_at: string | null;
};

type PromptBlock = {
  id: string;
  title: string;
  description: string | null;
  content: string;
  category: string | null;
  ai_tool_id: string | null;
  project_type_id: string | null;
  journey_step_id: string | null;
  status: "ativo" | "inativo" | "arquivado";
  created_at: string;
  updated_at: string | null;
};

type GeneratedPrompt = {
  id: string;
  project_id: string;
  summary_id: string | null;
  summary_item_id: string | null;
  base_prompt_id: string | null;
  base_prompt_snapshot: string | null;
  selected_blocks_json: string | null;
  final_prompt: string;
  notes: string | null;
  ai_tool_id: string | null;
  created_by: string | null;
  created_at: string;
};

type Client = {
  id: string;
  name: string;
  company: string | null;
  logo_url: string | null;
  responsible: string | null;
  project_type_id: string | null;
  journey_template_id: string | null;
  entry_month: string | null;
  status: ClientStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ClientStep = {
  id: string;
  client_id: string;
  source_journey_step_id: string | null;
  name: string;
  description: string | null;
  step_order: number;
  objective: string | null;
  required_evidence_label: string | null;
  status: StepStatus;
  notes: string | null;
  due_date: string | null;
  completed_at: string | null;
};

type ClientChecklistItem = {
  id: string;
  client_step_id: string;
  label: string;
  is_done: boolean;
  item_order: number;
};

type ClientStepLink = {
  id: string;
  client_step_id: string;
  title: string;
  url: string;
  notes: string | null;
  link_order: number;
};

type Tables = {
  app_users: AppUser[];
  ai_tools: AiTool[];
  prompt_categories: PromptCategory[];
  project_types: ProjectType[];
  prompts: Prompt[];
  journey_templates: JourneyTemplate[];
  journey_steps: JourneyStep[];
  step_prompts: StepPrompt[];
  procedures: Procedure[];
  projects: Project[];
  project_steps: ProjectStep[];
  project_step_checklist_items: ProjectChecklistItem[];
  project_step_prompts: ProjectStepPrompt[];
  project_step_links: ProjectStepLink[];
  project_step_phases: ProjectStepPhase[];
  project_step_contexts: ProjectStepContext[];
  project_summaries: ProjectSummary[];
  project_summary_items: ProjectSummaryItem[];
  prompt_blocks: PromptBlock[];
  generated_prompts: GeneratedPrompt[];
  clients: Client[];
  client_steps: ClientStep[];
  client_step_checklist_items: ClientChecklistItem[];
  client_step_links: ClientStepLink[];
};

type ConfigModuleKey =
  | "app_users"
  | "ai_tools"
  | "prompt_categories"
  | "prompts"
  | "project_types"
  | "journey_templates"
  | "journey_steps"
  | "procedures"
  | "prompt_blocks";

const configuredApiUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
// In production, the frontend and API are served by the same Cloudflare Worker.
// Keeping the local Wrangler URL out of production prevents browsers from
// trying to load D1 data from the visitor's own computer.
const cloudflareApiUrl = import.meta.env.PROD ? "" : configuredApiUrl;
const hasCloudflareApi = true;
const supabase = createCloudflareApi(cloudflareApiUrl);

type UploadedFile = {
  key: string;
  url: string;
};

const emptyTables: Tables = {
  app_users: [],
  ai_tools: [],
  prompt_categories: [],
  project_types: [],
  prompts: [],
  journey_templates: [],
  journey_steps: [],
  step_prompts: [],
  procedures: [],
  projects: [],
  project_steps: [],
  project_step_checklist_items: [],
  project_step_prompts: [],
  project_step_links: [],
  project_step_phases: [],
  project_step_contexts: [],
  project_summaries: [],
  project_summary_items: [],
  prompt_blocks: [],
  generated_prompts: [],
  clients: [],
  client_steps: [],
  client_step_checklist_items: [],
  client_step_links: [],
};

const configModules: Array<{ key: ConfigModuleKey; label: string; icon: typeof Bot; description: string }> = [
  {
    key: "app_users",
    label: "Usuarios",
    icon: Users,
    description: "Pessoas que aparecem na entrada simples do painel, sem e-mail ou senha.",
  },
  {
    key: "ai_tools",
    label: "Ferramentas de IA",
    icon: Bot,
    description: "ChatGPT, Claude, NotebookLM e outras ferramentas usadas pela equipe.",
  },
  {
    key: "prompt_categories",
    label: "Categorias",
    icon: Layers3,
    description: "Organizacao da biblioteca de prompts por finalidade.",
  },
  {
    key: "prompts",
    label: "Biblioteca de Prompts",
    icon: Clipboard,
    description: "Prompts reutilizaveis que podem entrar nas etapas dos projetos.",
  },
  {
    key: "prompt_blocks",
    label: "Complementos de Prompt",
    icon: Sparkles,
    description: "Blocos menores e reutilizaveis para compor prompts por topico.",
  },
  {
    key: "project_types",
    label: "Tipos de Projeto",
    icon: FileText,
    description: "Produtos e tipos de entregaveis da Ramos Engenharia.",
  },
  {
    key: "journey_templates",
    label: "Templates",
    icon: Route,
    description: "Estruturas reutilizaveis salvas a partir da pratica.",
  },
  {
    key: "journey_steps",
    label: "Etapas de Template",
    icon: ListChecks,
    description: "Etapas padrao usadas ao criar novos projetos.",
  },
  {
    key: "procedures",
    label: "Procedimentos",
    icon: GitBranch,
    description: "Regras internas e instrucoes operacionais.",
  },
];

function App() {
  const [view, setView] = useState<ViewMode>("projects");
  const [activeConfig, setActiveConfig] = useState<ConfigModuleKey>("prompts");
  const [tables, setTables] = useState<Tables>(emptyTables);
  const [currentUserId, setCurrentUserId] = useState(() => localStorage.getItem("central_ia_user_id") ?? "");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientStepId, setSelectedClientStepId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState("Pronto para conduzir projetos com IA.");
  const [tableErrors, setTableErrors] = useState<string[]>([]);

  const selectedProject = tables.projects.find((project) => project.id === selectedProjectId) ?? null;
  const projectSteps = useMemo(
    () => tables.project_steps.filter((step) => step.project_id === selectedProjectId).sort(byOrder),
    [tables.project_steps, selectedProjectId],
  );
  const selectedStep = projectSteps.find((step) => step.id === selectedStepId) ?? projectSteps[0] ?? null;
  const selectedClient = tables.clients.find((client) => client.id === selectedClientId) ?? null;
  const clientSteps = useMemo(
    () => tables.client_steps.filter((step) => step.client_id === selectedClientId).sort(byOrder),
    [tables.client_steps, selectedClientId],
  );
  const selectedClientStep = clientSteps.find((step) => step.id === selectedClientStepId) ?? clientSteps[0] ?? null;
  const activeUsers = tables.app_users.filter((user) => user.status === "ativo");
  const currentUser = tables.app_users.find((user) => user.id === currentUserId) ?? null;

  const stats = useMemo(() => {
    const activeProjects = tables.projects.filter((project) => project.status !== "arquivado");
    const doneProjects = tables.projects.filter((project) => project.status === "concluido");
    const doneSteps = tables.project_steps.filter((step) => step.status === "concluido");

    return [
      { label: "Projetos ativos", value: activeProjects.length },
      { label: "Clientes", value: tables.clients.filter((client) => client.status !== "arquivado").length },
      { label: "Prompts", value: tables.prompts.length },
      { label: "Templates", value: tables.journey_templates.length },
      { label: "Etapas concluidas", value: doneSteps.length || doneProjects.length },
    ];
  }, [tables]);

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!selectedProjectId && tables.projects.length > 0) {
      setSelectedProjectId(tables.projects[0].id);
    }
  }, [selectedProjectId, tables.projects]);

  useEffect(() => {
    if (projectSteps.length > 0 && !projectSteps.some((step) => step.id === selectedStepId)) {
      setSelectedStepId(projectSteps[0].id);
    }
  }, [projectSteps, selectedStepId]);

  useEffect(() => {
    if (!selectedClientId && tables.clients.length > 0) {
      setSelectedClientId(tables.clients[0].id);
    }
  }, [selectedClientId, tables.clients]);

  useEffect(() => {
    if (clientSteps.length > 0 && !clientSteps.some((step) => step.id === selectedClientStepId)) {
      setSelectedClientStepId(clientSteps[0].id);
    }
  }, [clientSteps, selectedClientStepId]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    if (tables.app_users.length > 0 && !tables.app_users.some((user) => user.id === currentUserId && user.status === "ativo")) {
      localStorage.removeItem("central_ia_user_id");
      setCurrentUserId("");
    }
  }, [currentUserId, tables.app_users]);

  async function loadAll() {
    if (!supabase) {
      setNotice("Configure a API Cloudflare para conectar ao banco D1.");
      setTableErrors(Object.keys(emptyTables));
      return;
    }

    setIsLoading(true);
    const tableNames = Object.keys(emptyTables) as Array<keyof Tables>;
    const results = await Promise.all(
      tableNames.map(async (tableName) => {
        const { data, error } = await supabase.from(tableName).select("*").order(getOrderColumn(tableName), {
          ascending: true,
        });

        return { tableName, data: data ?? [], error };
      }),
    );

    const nextTables = { ...emptyTables };
    const errors = results.filter((result) => result.error);

    results.forEach((result) => {
      nextTables[result.tableName] = result.data as never;
    });

    if (!errors.length && nextTables.app_users.length === 0) {
      const { data: defaultUser, error } = await supabase
        .from<AppUser>("app_users")
        .insert(
          normalizePayload({
            id: "user-patrick",
            name: "Patrick",
            status: "ativo",
            updated_at: new Date().toISOString(),
          }),
        )
        .select("*")
        .single();

      if (!error && defaultUser) {
        nextTables.app_users = [defaultUser as AppUser];
      }
    }

    setTables(nextTables);
    setIsLoading(false);
    setTableErrors(errors.map((result) => String(result.tableName)));
    setNotice(errors.length ? `Falha ao sincronizar ${errors.length} tabela(s): ${errors.map((result) => result.tableName).join(", ")}.` : "Dados sincronizados.");
  }

  function selectUser(userId: string) {
    localStorage.setItem("central_ia_user_id", userId);
    setCurrentUserId(userId);
  }

  async function createAppUser(name: string) {
    if (!supabase || !name.trim()) {
      return;
    }

    setIsLoading(true);
    const { data, error } = await supabase
      .from<AppUser>("app_users")
      .insert(
        normalizePayload({
          name: name.trim(),
          status: "ativo",
          updated_at: new Date().toISOString(),
        }),
      )
      .select("*")
      .single();
    setIsLoading(false);

    if (error || !data) {
      setNotice(`Erro ao criar usuario: ${error?.message ?? "erro desconhecido"}`);
      return;
    }

    setTables((current) => ({ ...current, app_users: [...current.app_users, data as AppUser] }));
    selectUser(data.id);
    setNotice(`Usuario ${data.name} criado.`);
  }

  async function createProject(form: NewProjectFormState) {
    if (!supabase || !form.name.trim()) {
      return;
    }

    setIsLoading(true);
    const { data: project, error } = await supabase
      .from<Project>("projects")
      .insert(
        normalizePayload({
          name: form.name,
          company: form.company,
          responsible: form.responsible,
          project_type_id: form.project_type_id,
          journey_template_id: form.journey_template_id,
          status: "em_andamento",
          notes: form.notes,
        }),
      )
      .select("*")
      .single();

    if (error || !project) {
      setNotice(`Nao foi possivel criar o projeto: ${error?.message ?? "erro desconhecido"}`);
      setIsLoading(false);
      return;
    }

    if (form.journey_template_id) {
      await instantiateTemplate(project as Project, form.journey_template_id);
    } else {
      await createProjectStep(project.id, {
        name: "Primeira etapa",
        objective: "Defina o objetivo desta etapa e adicione os primeiros prompts.",
        status: "em_andamento",
      });
    }

    await loadAll();
    setSelectedProjectId(project.id);
    setView("journey");
    setNotice("Projeto criado. Agora a jornada pode ser executada e ajustada.");
    setIsLoading(false);
  }

  async function instantiateTemplate(project: Project, templateId: string) {
    if (!supabase) {
      return;
    }

    const templateSteps = tables.journey_steps.filter((step) => step.journey_template_id === templateId).sort(byOrder);

    if (templateSteps.length === 0) {
      await createProjectStep(project.id, {
        name: "Primeira etapa",
        objective: "Template sem etapas. Comece configurando a execucao real.",
        status: "em_andamento",
      });
      return;
    }

    for (const templateStep of templateSteps) {
      const { data: step } = await supabase
        .from<ProjectStep>("project_steps")
        .insert(
          normalizePayload({
            project_id: project.id,
            source_journey_step_id: templateStep.id,
            name: templateStep.name,
            description: templateStep.description,
            step_order: templateStep.step_order,
            objective: templateStep.objective,
            ai_tool_id: templateStep.ai_tool_id,
            expected_output: templateStep.expected_output,
            execution_instructions: templateStep.execution_instructions,
            status: templateStep.step_order === 1 ? "em_andamento" : "pendente",
          }),
        )
        .select("*")
        .single();

      if (!step) {
        continue;
      }

      const checklistRows = splitChecklist(templateStep.checklist).map((label, index) => ({
        project_step_id: step.id,
        label,
        item_order: index + 1,
      }));

      if (checklistRows.length > 0) {
        await supabase.from("project_step_checklist_items").insert(checklistRows);
      }

      const linkedPrompts = tables.step_prompts.filter((link) => link.journey_step_id === templateStep.id).sort(byOrder);
      const promptRows = linkedPrompts
        .map((link, index) => {
          const libraryPrompt = link.prompt_id ? tables.prompts.find((prompt) => prompt.id === link.prompt_id) : null;

          return {
            project_step_id: step.id,
            prompt_id: link.prompt_id,
            title: link.title ?? libraryPrompt?.title ?? "Prompt da etapa",
            content: link.content ?? libraryPrompt?.content ?? "",
            ai_tool_id: link.ai_tool_id ?? libraryPrompt?.ai_tool_id ?? templateStep.ai_tool_id,
            prompt_status: link.prompt_status ?? (link.content || libraryPrompt?.content ? "preenchido" : "pendente"),
            is_required: link.is_required ?? true,
            placeholder_note: link.placeholder_note,
            prompt_order: link.prompt_order || index + 1,
            usage_notes: link.usage_notes,
          };
        })
        .filter((row) => row.title && (row.content || row.prompt_status === "pendente"));

      if (promptRows.length > 0) {
        await supabase.from("project_step_prompts").insert(promptRows);
      }
    }
  }

  async function createProjectStep(projectId: string, payload: Partial<ProjectStep>) {
    if (!supabase) {
      return null;
    }

    const nextOrder =
      payload.step_order ??
      Math.max(0, ...tables.project_steps.filter((step) => step.project_id === projectId).map((step) => step.step_order)) + 1;

    const { data, error } = await supabase
      .from<ProjectStep>("project_steps")
      .insert(
        normalizePayload({
          project_id: projectId,
          name: payload.name || "Nova etapa",
          description: payload.description ?? "",
          step_order: nextOrder,
          objective: payload.objective ?? "",
          ai_tool_id: payload.ai_tool_id ?? "",
          expected_output: payload.expected_output ?? "",
          execution_instructions: payload.execution_instructions ?? "",
          status: payload.status ?? "pendente",
          notes: payload.notes ?? "",
        }),
      )
      .select("*")
      .single();

    if (error) {
      setNotice(`Erro ao criar etapa: ${error.message}`);
      return null;
    }

    return data as ProjectStep;
  }

  async function updateStep(stepId: string, payload: Partial<ProjectStep>) {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.from("project_steps").update(normalizePayload({ ...payload, updated_at: new Date().toISOString() })).eq("id", stepId);

    if (error) {
      setNotice(`Erro ao atualizar etapa: ${error.message}`);
      return;
    }

    setTables((current) => ({
      ...current,
      project_steps: current.project_steps.map((step) => (step.id === stepId ? { ...step, ...payload } : step)),
    }));
  }

  async function updateProject(projectId: string, payload: Partial<Project>) {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.from("projects").update(normalizePayload({ ...payload, updated_at: new Date().toISOString() })).eq("id", projectId);

    if (error) {
      setNotice(`Erro ao atualizar projeto: ${error.message}`);
      return;
    }

    setTables((current) => ({
      ...current,
      projects: current.projects.map((project) => (project.id === projectId ? { ...project, ...payload } : project)),
    }));
  }

  async function deleteProject(projectId: string) {
    const project = tables.projects.find((item) => item.id === projectId);

    if (!project) {
      return;
    }

    const confirmed = window.confirm(`Excluir o projeto "${project.name}" e todas as etapas vinculadas?`);

    if (!confirmed) {
      return;
    }

    await deleteRecord("projects", projectId);

    setTables((current) => ({
      ...current,
      projects: current.projects.filter((item) => item.id !== projectId),
      project_steps: current.project_steps.filter((step) => step.project_id !== projectId),
      project_step_checklist_items: current.project_step_checklist_items.filter(
        (item) => !current.project_steps.some((step) => step.project_id === projectId && step.id === item.project_step_id),
      ),
      project_step_prompts: current.project_step_prompts.filter(
        (item) => !current.project_steps.some((step) => step.project_id === projectId && step.id === item.project_step_id),
      ),
      project_step_links: current.project_step_links.filter(
        (item) => !current.project_steps.some((step) => step.project_id === projectId && step.id === item.project_step_id),
      ),
      project_step_phases: current.project_step_phases.filter(
        (item) => !current.project_steps.some((step) => step.project_id === projectId && step.id === item.project_step_id),
      ),
      project_step_contexts: current.project_step_contexts.filter(
        (item) => !current.project_steps.some((step) => step.project_id === projectId && step.id === item.project_step_id),
      ),
      project_summaries: current.project_summaries.filter((item) => item.project_id !== projectId),
      project_summary_items: current.project_summary_items.filter((item) => item.project_id !== projectId),
      generated_prompts: current.generated_prompts.filter((item) => item.project_id !== projectId),
    }));

    if (selectedProjectId === projectId) {
      setSelectedProjectId(null);
      setSelectedStepId(null);
      setView("projects");
    }

    setNotice("Projeto excluido.");
  }

  async function addChecklistItem(stepId: string, label: string) {
    if (!supabase || !label.trim()) {
      return;
    }

    const currentItems = tables.project_step_checklist_items.filter((item) => item.project_step_id === stepId);
    const { data, error } = await supabase
      .from<ProjectChecklistItem>("project_step_checklist_items")
      .insert({ project_step_id: stepId, label: label.trim(), item_order: currentItems.length + 1 })
      .select("*")
      .single();

    if (error) {
      setNotice(`Erro ao adicionar checklist: ${error.message}`);
      return;
    }

    setTables((current) => ({ ...current, project_step_checklist_items: [...current.project_step_checklist_items, data as ProjectChecklistItem] }));
  }

  async function toggleChecklistItem(item: ProjectChecklistItem) {
    if (!supabase) {
      return;
    }

    const nextDone = !item.is_done;
    await supabase.from("project_step_checklist_items").update({ is_done: nextDone }).eq("id", item.id);
    setTables((current) => ({
      ...current,
      project_step_checklist_items: current.project_step_checklist_items.map((row) => (row.id === item.id ? { ...row, is_done: nextDone } : row)),
    }));
  }

  async function deleteRecord(tableName: keyof Tables, id: string) {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.from(tableName).delete().eq("id", id);

    if (error) {
      setNotice(`Erro ao excluir: ${error.message}`);
      return;
    }

    setTables((current) => ({ ...current, [tableName]: current[tableName].filter((record: { id: string }) => record.id !== id) }));
  }

  async function addExistingPrompt(stepId: string, promptId: string) {
    if (!supabase || !promptId) {
      return;
    }

    const prompt = tables.prompts.find((item) => item.id === promptId);

    if (!prompt) {
      return;
    }

    const currentPrompts = tables.project_step_prompts.filter((item) => item.project_step_id === stepId);
    const { data, error } = await supabase
      .from<ProjectStepPrompt>("project_step_prompts")
      .insert({
        project_step_id: stepId,
        prompt_id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        ai_tool_id: prompt.ai_tool_id,
        prompt_status: prompt.content ? "preenchido" : "pendente",
        is_required: true,
        prompt_order: currentPrompts.length + 1,
      })
      .select("*")
      .single();

    if (error) {
      setNotice(`Erro ao vincular prompt: ${error.message}`);
      return;
    }

    setTables((current) => ({ ...current, project_step_prompts: [...current.project_step_prompts, data as ProjectStepPrompt] }));
  }

  async function addLocalPrompt(stepId: string, title: string, content: string, aiToolId: string) {
    if (!supabase || !title.trim() || !content.trim()) {
      return;
    }

    const currentPrompts = tables.project_step_prompts.filter((item) => item.project_step_id === stepId);
    const { data, error } = await supabase
      .from<ProjectStepPrompt>("project_step_prompts")
      .insert(
        normalizePayload({
          project_step_id: stepId,
          title: title.trim(),
          content: content.trim(),
          ai_tool_id: aiToolId,
          prompt_status: content.trim() ? "preenchido" : "pendente",
          is_required: true,
          prompt_order: currentPrompts.length + 1,
        }),
      )
      .select("*")
      .single();

    if (error) {
      setNotice(`Erro ao adicionar prompt: ${error.message}`);
      return;
    }

    setTables((current) => ({ ...current, project_step_prompts: [...current.project_step_prompts, data as ProjectStepPrompt] }));
  }

  async function createPromptFromBlock(payload: { title: string; content: string; ai_tool_id?: string | null; short_description?: string | null }): Promise<Prompt | null> {
    if (!supabase || !payload.title.trim() || !payload.content.trim()) {
      return null;
    }

    const { data, error } = await supabase
      .from<Prompt>("prompts")
      .insert(
        normalizePayload({
          title: payload.title.trim(),
          short_description: payload.short_description ?? "Criado a partir do construtor de jornada.",
          content: payload.content.trim(),
          ai_tool_id: payload.ai_tool_id ?? null,
          category_id: null,
          project_type_id: null,
          variables: "",
          version: "1.0",
          status: "ativo",
        }),
      )
      .select("*")
      .single();

    if (error || !data) {
      setNotice(`Erro ao salvar prompt na biblioteca: ${error?.message ?? "erro desconhecido"}`);
      return null;
    }

    setTables((current) => ({ ...current, prompts: [...current.prompts, data as Prompt] }));
    setNotice("Prompt salvo na biblioteca e vinculado ao bloco.");
    return data as Prompt;
  }
  async function addProjectStepPhase(stepId: string, title: string) {
    if (!supabase || !title.trim()) {
      return;
    }

    const currentPhases = tables.project_step_phases.filter((phase) => phase.project_step_id === stepId).sort(byOrder);
    const previousPhase = currentPhases[currentPhases.length - 1] ?? null;
    const { data, error } = await supabase
      .from<ProjectStepPhase>("project_step_phases")
      .insert(
        normalizePayload({
          project_step_id: stepId,
          title: title.trim(),
          description: "",
          phase_order: Math.max(0, ...currentPhases.map((phase) => phase.phase_order)) + 1,
          status: currentPhases.length === 0 ? "em_andamento" : "pendente",
          requires_previous_phase: currentPhases.length > 0,
          prerequisite_phase_id: previousPhase?.id ?? "",
          completion_condition: currentPhases.length > 0 ? "Concluir a fase anterior antes de avancar." : "",
          updated_at: new Date().toISOString(),
        }),
      )
      .select("*")
      .single();

    if (error || !data) {
      setNotice(`Erro ao adicionar fase: ${error?.message ?? "erro desconhecido"}`);
      return;
    }

    setTables((current) => ({ ...current, project_step_phases: [...current.project_step_phases, data as ProjectStepPhase] }));
    setNotice("Fase adicionada a etapa.");
  }

  async function updateProjectStepPhase(phaseId: string, payload: Partial<ProjectStepPhase>) {
    if (!supabase) {
      return;
    }

    const phase = tables.project_step_phases.find((item) => item.id === phaseId);
    const blockingPhase = getBlockingPhase(phase, tables.project_step_phases);

    if (payload.status && payload.status !== "pendente" && blockingPhase) {
      setNotice(`Conclua "${blockingPhase.title}" antes de avancar esta fase.`);
      return;
    }

    const { error } = await supabase.from("project_step_phases").update(normalizePayload({ ...payload, updated_at: new Date().toISOString() })).eq("id", phaseId);

    if (error) {
      setNotice(`Erro ao atualizar fase: ${error.message}`);
      return;
    }

    setTables((current) => ({
      ...current,
      project_step_phases: current.project_step_phases.map((item) => (item.id === phaseId ? { ...item, ...payload } : item)),
    }));
  }

  async function deleteProjectStepPhase(phaseId: string) {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.from("project_step_phases").delete().eq("id", phaseId);

    if (error) {
      setNotice(`Erro ao excluir fase: ${error.message}`);
      return;
    }

    setTables((current) => ({
      ...current,
      project_step_phases: current.project_step_phases.filter((item) => item.id !== phaseId),
      project_step_contexts: current.project_step_contexts.map((item) => (item.phase_id === phaseId ? { ...item, phase_id: null } : item)),
    }));
  }

  async function addProjectStepContext(stepId: string, title: string, content: string, phaseId: string) {
    if (!supabase || !title.trim() || !content.trim()) {
      return;
    }

    const currentContexts = tables.project_step_contexts.filter((context) => context.project_step_id === stepId);
    const { data, error } = await supabase
      .from<ProjectStepContext>("project_step_contexts")
      .insert(
        normalizePayload({
          project_step_id: stepId,
          phase_id: phaseId,
          title: title.trim(),
          content: content.trim(),
          context_order: Math.max(0, ...currentContexts.map((context) => context.context_order)) + 1,
          status: "ativo",
          updated_at: new Date().toISOString(),
        }),
      )
      .select("*")
      .single();

    if (error || !data) {
      setNotice(`Erro ao salvar contexto: ${error?.message ?? "erro desconhecido"}`);
      return;
    }

    setTables((current) => ({ ...current, project_step_contexts: [...current.project_step_contexts, data as ProjectStepContext] }));
    setNotice("Contexto salvo na etapa.");
  }

  async function updateProjectStepContext(contextId: string, payload: Partial<ProjectStepContext>) {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.from("project_step_contexts").update(normalizePayload({ ...payload, updated_at: new Date().toISOString() })).eq("id", contextId);

    if (error) {
      setNotice(`Erro ao atualizar contexto: ${error.message}`);
      return;
    }

    setTables((current) => ({
      ...current,
      project_step_contexts: current.project_step_contexts.map((item) => (item.id === contextId ? { ...item, ...payload } : item)),
    }));
  }

  async function deleteProjectStepContext(contextId: string) {
    await deleteRecord("project_step_contexts", contextId);
  }

  async function importProjectSummary(project: Project, rawText: string) {
    if (!supabase || !rawText.trim()) {
      return;
    }

    const parsed = parseProjectSummary({ rawText });

    if (parsed.items.length === 0) {
      setNotice("Nao encontrei topicos numerados nesse sumario. Cole uma estrutura como 1, 1.1, 1.1.1.");
      return;
    }

    const summaryId = crypto.randomUUID();
    const now = new Date().toISOString();
    const versionNumber = Math.max(0, ...tables.project_summaries.filter((summary) => summary.project_id === project.id).map((summary) => summary.version_number)) + 1;
    const itemIds = new Map(parsed.items.map((item) => [item.topicNumber, crypto.randomUUID()]));
    const itemRows = parsed.items.map((item) => ({
      id: itemIds.get(item.topicNumber)!,
      summary_id: summaryId,
      project_id: project.id,
      parent_id: item.parentTopicNumber ? itemIds.get(item.parentTopicNumber) ?? null : null,
      topic_number: item.topicNumber,
      title: item.title,
      level: item.level,
      sort_order: item.sortOrder,
      original_text: item.originalText,
      is_selected: item.selected,
      status: "pendente" as SummaryItemStatus,
      notes: "",
      parse_confidence: item.confidence,
      parse_warning: item.warning ?? null,
      updated_at: now,
    }));

    const summaryPayload = normalizePayload({
      id: summaryId,
      project_id: project.id,
      raw_text: rawText,
      consolidated_text: parsed.consolidatedPreview,
      version_number: versionNumber,
      status: "draft",
      parse_status: parsed.warnings.length || parsed.items.some((item) => item.warning) ? "needs_review" : "analyzed",
      item_count: itemRows.length,
      selected_item_count: itemRows.filter((item) => item.is_selected).length,
      created_by: currentUser?.name ?? "Patrick",
      updated_at: now,
    });

    const { data: summary, error } = await supabase.from<ProjectSummary>("project_summaries").insert(summaryPayload).select("*").single();

    if (error || !summary) {
      setNotice(`Erro ao importar sumario: ${error?.message ?? "erro desconhecido"}`);
      return;
    }

    const { error: itemsError } = await supabase.from<ProjectSummaryItem>("project_summary_items").insert(itemRows);

    if (itemsError) {
      setNotice(`Sumario criado, mas os topicos falharam: ${itemsError.message}`);
      return;
    }

    setTables((current) => ({
      ...current,
      project_summaries: [...current.project_summaries, summary as ProjectSummary],
      project_summary_items: [...current.project_summary_items, ...(itemRows as ProjectSummaryItem[])],
    }));
    setNotice(`Sumario analisado com ${itemRows.length} topicos. Revise e salve como consolidado.`);
  }

  async function updateProjectSummaryItem(itemId: string, payload: Partial<ProjectSummaryItem>) {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.from("project_summary_items").update(normalizePayload({ ...payload, updated_at: new Date().toISOString() })).eq("id", itemId);

    if (error) {
      setNotice(`Erro ao atualizar item do sumario: ${error.message}`);
      return;
    }

    setTables((current) => ({
      ...current,
      project_summary_items: current.project_summary_items.map((item) => (item.id === itemId ? { ...item, ...payload } : item)),
    }));
  }

  async function setSummaryItemSelection(summaryId: string, itemId: string, isSelected: boolean) {
    if (!supabase) {
      return;
    }

    const items = tables.project_summary_items.filter((item) => item.summary_id === summaryId);
    const affected = new Map<string, boolean>();
    const target = items.find((item) => item.id === itemId);

    if (!target) {
      return;
    }

    affected.set(itemId, isSelected);

    if (isSelected) {
      let parentId = target.parent_id;
      while (parentId) {
        const parent = items.find((item) => item.id === parentId);
        if (!parent) break;
        affected.set(parent.id, true);
        parentId = parent.parent_id;
      }
    } else {
      const collectChildren = (parentId: string) => {
        items.filter((item) => item.parent_id === parentId).forEach((child) => {
          affected.set(child.id, false);
          collectChildren(child.id);
        });
      };
      collectChildren(itemId);
    }

    await Promise.all(
      [...affected.entries()].map(([id, selected]) =>
        supabase.from("project_summary_items").update({ is_selected: selected, updated_at: new Date().toISOString() }).eq("id", id),
      ),
    );

    const nextItems = tables.project_summary_items.map((item) => (affected.has(item.id) ? { ...item, is_selected: affected.get(item.id)! } : item));
    const selectedCount = nextItems.filter((item) => item.summary_id === summaryId && item.is_selected).length;
    await supabase.from("project_summaries").update({ selected_item_count: selectedCount, updated_at: new Date().toISOString() }).eq("id", summaryId);

    setTables((current) => ({
      ...current,
      project_summary_items: current.project_summary_items.map((item) => (affected.has(item.id) ? { ...item, is_selected: affected.get(item.id)! } : item)),
      project_summaries: current.project_summaries.map((summary) => (summary.id === summaryId ? { ...summary, selected_item_count: selectedCount } : summary)),
    }));
  }

  async function addProjectSummaryItem(summaryId: string, parentId: string, title: string) {
    if (!supabase || !title.trim()) {
      return;
    }

    const summary = tables.project_summaries.find((item) => item.id === summaryId);
    const items = tables.project_summary_items.filter((item) => item.summary_id === summaryId).sort(byOrder);

    if (!summary) {
      return;
    }

    const parent = parentId ? items.find((item) => item.id === parentId) : null;
    const siblingCount = parent ? items.filter((item) => item.parent_id === parent.id).length : items.filter((item) => !item.parent_id).length;
    const topicNumber = parent ? `${parent.topic_number}.${siblingCount + 1}` : String(siblingCount + 1);
    const row: ProjectSummaryItem = {
      id: crypto.randomUUID(),
      summary_id: summaryId,
      project_id: summary.project_id,
      parent_id: parent?.id ?? null,
      topic_number: topicNumber,
      title: title.trim(),
      level: parent ? parent.level + 1 : 1,
      sort_order: Math.max(0, ...items.map((item) => item.sort_order)) + 1,
      original_text: `${topicNumber} ${title.trim()}`,
      is_selected: true,
      status: "pendente",
      notes: "",
      parse_confidence: 1,
      parse_warning: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from<ProjectSummaryItem>("project_summary_items").insert(normalizePayload(row)).select("*").single();

    if (error || !data) {
      setNotice(`Erro ao adicionar topico: ${error?.message ?? "erro desconhecido"}`);
      return;
    }

    const nextItemCount = summary.item_count + 1;
    const nextSelectedCount = summary.selected_item_count + 1;
    await supabase.from("project_summaries").update({ item_count: nextItemCount, selected_item_count: nextSelectedCount, updated_at: new Date().toISOString() }).eq("id", summaryId);

    setTables((current) => ({
      ...current,
      project_summary_items: [...current.project_summary_items, data as ProjectSummaryItem],
      project_summaries: current.project_summaries.map((item) => (item.id === summaryId ? { ...item, item_count: nextItemCount, selected_item_count: nextSelectedCount } : item)),
    }));
  }

  async function deleteProjectSummaryItem(summaryId: string, itemId: string) {
    if (!supabase) {
      return;
    }

    const items = tables.project_summary_items.filter((item) => item.summary_id === summaryId);
    const ids = new Set<string>([itemId]);
    const collectChildren = (parentId: string) => {
      items.filter((item) => item.parent_id === parentId).forEach((child) => {
        ids.add(child.id);
        collectChildren(child.id);
      });
    };
    collectChildren(itemId);

    for (const id of ids) {
      await supabase.from("project_summary_items").delete().eq("id", id);
    }

    const nextItems = tables.project_summary_items.filter((item) => item.summary_id === summaryId && !ids.has(item.id));
    const summary = tables.project_summaries.find((item) => item.id === summaryId);
    const nextItemCount = nextItems.length;
    const nextSelectedCount = nextItems.filter((item) => item.is_selected).length;

    if (summary) {
      await supabase.from("project_summaries").update({ item_count: nextItemCount, selected_item_count: nextSelectedCount, updated_at: new Date().toISOString() }).eq("id", summaryId);
    }

    setTables((current) => ({
      ...current,
      project_summary_items: current.project_summary_items.filter((item) => !ids.has(item.id)),
      project_summaries: current.project_summaries.map((item) => (item.id === summaryId ? { ...item, item_count: nextItemCount, selected_item_count: nextSelectedCount } : item)),
    }));
  }

  async function consolidateProjectSummary(summaryId: string): Promise<ProjectSummary | null> {
    if (!supabase) {
      return null;
    }

    const sourceSummary = tables.project_summaries.find((item) => item.id === summaryId);
    const sourceItems = tables.project_summary_items.filter((item) => item.summary_id === summaryId).sort(byOrder);
    const selectedItems = sourceItems.filter((item) => item.is_selected);

    if (!sourceSummary || selectedItems.length === 0) {
      setNotice("Selecione pelo menos um topico antes de consolidar o sumario.");
      return null;
    }

    const now = new Date().toISOString();
    const nextSummaryId = crypto.randomUUID();
    const nextVersionNumber = Math.max(0, ...tables.project_summaries.filter((item) => item.project_id === sourceSummary.project_id).map((item) => item.version_number)) + 1;
    const { rows: normalizedRows, consolidatedText } = buildConsolidatedSummaryVersion({
      sourceItems,
      selectedItems,
      nextSummaryId,
      projectId: sourceSummary.project_id,
      now,
    });
    const activeSummaries = tables.project_summaries.filter((item) => item.project_id === sourceSummary.project_id && item.status === "active");
    const nextSummary: ProjectSummary = {
      id: nextSummaryId,
      project_id: sourceSummary.project_id,
      raw_text: sourceSummary.raw_text,
      consolidated_text: consolidatedText,
      version_number: nextVersionNumber,
      status: "active",
      parse_status: "reviewed",
      item_count: normalizedRows.length,
      selected_item_count: normalizedRows.length,
      created_by: currentUser?.name ?? sourceSummary.created_by,
      created_at: now,
      updated_at: now,
      activated_at: now,
      archived_at: null,
    };

    for (const active of activeSummaries) {
      await supabase.from("project_summaries").update({ status: "archived", archived_at: now, updated_at: now }).eq("id", active.id);
    }

    const { data: insertedSummary, error } = await supabase.from<ProjectSummary>("project_summaries").insert(normalizePayload(nextSummary)).select("*").single();

    if (error || !insertedSummary) {
      setNotice(`Erro ao consolidar sumario: ${error?.message ?? "erro desconhecido"}`);
      return null;
    }

    const { error: itemError } = await supabase.from<ProjectSummaryItem>("project_summary_items").insert(normalizedRows.map((row) => normalizePayload(row)));

    if (itemError) {
      setNotice(`Sumario criado, mas houve erro ao criar topicos consolidados: ${itemError.message}`);
      return null;
    }

    setTables((current) => ({
      ...current,
      project_summaries: [
        ...current.project_summaries.map((item) => (activeSummaries.some((active) => active.id === item.id) ? { ...item, status: "archived" as const, archived_at: now, updated_at: now } : item)),
        insertedSummary as ProjectSummary,
      ],
      project_summary_items: [...current.project_summary_items, ...normalizedRows],
    }));
    setNotice(`Sumario consolidado como versao ${nextVersionNumber}, com ${normalizedRows.length} topicos renumerados.`);
    return insertedSummary as ProjectSummary;
  }

  async function saveGeneratedPrompt(payload: Omit<GeneratedPrompt, "id" | "created_at">) {
    if (!supabase || !payload.final_prompt.trim()) {
      return;
    }

    const { data, error } = await supabase
      .from<GeneratedPrompt>("generated_prompts")
      .insert(
        normalizePayload({
          ...payload,
          created_by: payload.created_by || currentUser?.name || "Patrick",
        }),
      )
      .select("*")
      .single();

    if (error || !data) {
      setNotice(`Erro ao salvar historico do prompt: ${error?.message ?? "erro desconhecido"}`);
      return;
    }

    setTables((current) => ({ ...current, generated_prompts: [...current.generated_prompts, data as GeneratedPrompt] }));
    setNotice("Prompt salvo no historico do projeto.");
  }

  async function addStepLink(stepId: string, title: string, url: string) {
    if (!supabase || !title.trim() || !url.trim()) {
      return;
    }

    const currentLinks = tables.project_step_links.filter((item) => item.project_step_id === stepId);
    const { data, error } = await supabase
      .from<ProjectStepLink>("project_step_links")
      .insert({ project_step_id: stepId, title: title.trim(), url: url.trim(), link_order: currentLinks.length + 1 })
      .select("*")
      .single();

    if (error) {
      setNotice(`Erro ao adicionar link: ${error.message}`);
      return;
    }

    setTables((current) => ({ ...current, project_step_links: [...current.project_step_links, data as ProjectStepLink] }));
  }

  async function uploadStepFile(stepId: string, file: File) {
    const uploaded = await uploadFileToR2(file);

    if (!uploaded) {
      return;
    }

    await addStepLink(stepId, file.name, uploaded.url);
  }

  async function addNextStep(projectId: string, name: string) {
    const step = await createProjectStep(projectId, { name: name || "Nova etapa" });

    if (step) {
      await loadAll();
      setSelectedStepId(step.id);
      setNotice("Etapa adicionada a jornada do projeto.");
    }
  }

  async function saveProjectAsTemplate(project: Project) {
    if (!supabase) {
      return;
    }

    const templateName = `${project.name} - template`;
    const { data: template, error } = await supabase
      .from<JourneyTemplate>("journey_templates")
      .insert(
        normalizePayload({
          name: templateName,
          description: `Criado a partir do projeto ${project.name}.`,
          project_type_id: project.project_type_id,
          context: "projeto",
          status: "ativo",
        }),
      )
      .select("*")
      .single();

    if (error || !template) {
      setNotice(`Erro ao salvar template: ${error?.message ?? "erro desconhecido"}`);
      return;
    }

    const steps = tables.project_steps.filter((step) => step.project_id === project.id).sort(byOrder);

    for (const step of steps) {
      const checklistText = tables.project_step_checklist_items
        .filter((item) => item.project_step_id === step.id)
        .sort(byOrder)
        .map((item) => item.label)
        .join("\n");

      const { data: templateStep } = await supabase
        .from("journey_steps")
        .insert(
          normalizePayload({
            journey_template_id: template.id,
            name: step.name,
            description: step.description,
            step_order: step.step_order,
            objective: step.objective,
            ai_tool_id: step.ai_tool_id,
            expected_output: step.expected_output,
            checklist: checklistText,
            execution_instructions: step.execution_instructions,
            status: "ativo",
          }),
        )
        .select("*")
        .single();

      if (!templateStep) {
        continue;
      }

      const prompts = tables.project_step_prompts.filter((prompt) => prompt.project_step_id === step.id).sort(byOrder);
      const rows = prompts.map((prompt, index) => ({
        journey_step_id: templateStep.id,
        prompt_id: prompt.prompt_id,
        title: prompt.prompt_id ? null : prompt.title,
        content: prompt.prompt_id ? null : prompt.content,
        ai_tool_id: prompt.ai_tool_id,
        prompt_status: prompt.prompt_status,
        is_required: prompt.is_required,
        placeholder_note: prompt.placeholder_note,
        prompt_order: prompt.prompt_order || index + 1,
        usage_notes: prompt.usage_notes,
      }));

      if (rows.length > 0) {
        await supabase.from("step_prompts").insert(rows);
      }
    }

    await loadAll();
    setNotice(`Template "${templateName}" salvo a partir da execucao real.`);
  }


  async function createClientJourney(form: NewClientFormState) {
    if (!supabase || !form.name.trim()) {
      return;
    }

    setIsLoading(true);
    const templateId = form.journey_template_id || getDefaultClientTemplate(tables.journey_templates)?.id || "";
    const { data: client, error } = await supabase
      .from<Client>("clients")
      .insert(
        normalizePayload({
          name: form.name,
          company: form.company,
          logo_url: form.logo_url,
          responsible: form.responsible,
          project_type_id: form.project_type_id,
          journey_template_id: templateId,
          entry_month: form.entry_month,
          status: "em_implantacao",
          notes: form.notes,
        }),
      )
      .select("*")
      .single();

    if (error || !client) {
      setNotice(`Nao foi possivel criar o cliente: ${error?.message ?? "erro desconhecido"}`);
      setIsLoading(false);
      return;
    }

    if (templateId) {
      await instantiateClientTemplate(client as Client, templateId);
    } else {
      await createClientStep(client.id, {
        name: "Primeira etapa",
        objective: "Defina a primeira atividade da jornada do cliente.",
        status: "em_andamento",
      });
    }

    await loadAll();
    setSelectedClientId(client.id);
    setView("clientJourney");
    setNotice("Cliente criado. A jornada de entrada ja pode ser acompanhada.");
    setIsLoading(false);
  }

  async function instantiateClientTemplate(client: Client, templateId: string) {
    if (!supabase) {
      return;
    }

    const templateSteps = tables.journey_steps.filter((step) => step.journey_template_id === templateId).sort(byOrder);

    if (templateSteps.length === 0) {
      await createClientStep(client.id, {
        name: "Primeira etapa",
        objective: "Template sem etapas. Comece configurando a jornada real do cliente.",
        status: "em_andamento",
      });
      return;
    }

    for (const templateStep of templateSteps) {
      const { data: step } = await supabase
        .from<ClientStep>("client_steps")
        .insert(
          normalizePayload({
            client_id: client.id,
            source_journey_step_id: templateStep.id,
            name: templateStep.name,
            description: templateStep.description,
            step_order: templateStep.step_order,
            objective: templateStep.objective,
            required_evidence_label: templateStep.expected_output,
            status: templateStep.step_order === 1 ? "em_andamento" : "pendente",
          }),
        )
        .select("*")
        .single();

      if (!step) {
        continue;
      }

      const checklistRows = splitChecklist(templateStep.checklist).map((label, index) => ({
        client_step_id: step.id,
        label,
        item_order: index + 1,
      }));

      if (checklistRows.length > 0) {
        await supabase.from("client_step_checklist_items").insert(checklistRows);
      }
    }
  }

  async function createClientStep(clientId: string, payload: Partial<ClientStep>) {
    if (!supabase) {
      return null;
    }

    const nextOrder =
      payload.step_order ??
      Math.max(0, ...tables.client_steps.filter((step) => step.client_id === clientId).map((step) => step.step_order)) + 1;

    const { data, error } = await supabase
      .from<ClientStep>("client_steps")
      .insert(
        normalizePayload({
          client_id: clientId,
          name: payload.name || "Nova etapa",
          description: payload.description ?? "",
          step_order: nextOrder,
          objective: payload.objective ?? "",
          required_evidence_label: payload.required_evidence_label ?? "",
          status: payload.status ?? "pendente",
          notes: payload.notes ?? "",
          due_date: payload.due_date ?? "",
        }),
      )
      .select("*")
      .single();

    if (error) {
      setNotice(`Erro ao criar etapa do cliente: ${error.message}`);
      return null;
    }

    return data as ClientStep;
  }

  async function updateClient(clientId: string, payload: Partial<Client>) {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.from("clients").update(normalizePayload({ ...payload, updated_at: new Date().toISOString() })).eq("id", clientId);

    if (error) {
      setNotice(`Erro ao atualizar cliente: ${error.message}`);
      return;
    }

    setTables((current) => ({
      ...current,
      clients: current.clients.map((client) => (client.id === clientId ? { ...client, ...payload } : client)),
    }));
  }

  async function updateClientStep(stepId: string, payload: Partial<ClientStep>) {
    if (!supabase) {
      return;
    }

    const localPayload: Partial<ClientStep> = {
      ...payload,
      completed_at: payload.status === "concluido" ? new Date().toISOString() : (payload.completed_at ?? null),
    };
    const dbPayload = { ...localPayload, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("client_steps").update(normalizePayload(dbPayload)).eq("id", stepId);

    if (error) {
      setNotice(`Erro ao atualizar etapa do cliente: ${error.message}`);
      return;
    }

    setTables((current) => ({
      ...current,
      client_steps: current.client_steps.map((step) => (step.id === stepId ? { ...step, ...localPayload } : step)),
    }));
  }

  async function addClientChecklistItem(stepId: string, label: string) {
    if (!supabase || !label.trim()) {
      return;
    }

    const currentItems = tables.client_step_checklist_items.filter((item) => item.client_step_id === stepId);
    const { data, error } = await supabase
      .from<ClientChecklistItem>("client_step_checklist_items")
      .insert({ client_step_id: stepId, label: label.trim(), item_order: currentItems.length + 1 })
      .select("*")
      .single();

    if (error) {
      setNotice(`Erro ao adicionar checklist do cliente: ${error.message}`);
      return;
    }

    setTables((current) => ({ ...current, client_step_checklist_items: [...current.client_step_checklist_items, data as ClientChecklistItem] }));
  }

  async function toggleClientChecklistItem(item: ClientChecklistItem) {
    if (!supabase) {
      return;
    }

    const nextDone = !item.is_done;
    await supabase.from("client_step_checklist_items").update({ is_done: nextDone }).eq("id", item.id);
    setTables((current) => ({
      ...current,
      client_step_checklist_items: current.client_step_checklist_items.map((row) => (row.id === item.id ? { ...row, is_done: nextDone } : row)),
    }));
  }

  async function addClientStepLink(stepId: string, title: string, url: string) {
    if (!supabase || !title.trim() || !url.trim()) {
      return;
    }

    const currentLinks = tables.client_step_links.filter((item) => item.client_step_id === stepId);
    const { data, error } = await supabase
      .from<ClientStepLink>("client_step_links")
      .insert({ client_step_id: stepId, title: title.trim(), url: url.trim(), link_order: currentLinks.length + 1 })
      .select("*")
      .single();

    if (error) {
      setNotice(`Erro ao adicionar evidencia do cliente: ${error.message}`);
      return;
    }

    setTables((current) => ({ ...current, client_step_links: [...current.client_step_links, data as ClientStepLink] }));
  }

  async function uploadClientStepFile(stepId: string, file: File) {
    const uploaded = await uploadFileToR2(file);

    if (!uploaded) {
      return;
    }

    await addClientStepLink(stepId, file.name, uploaded.url);
  }

  async function uploadFileToR2(file: File) {
    try {
      setIsLoading(true);
      const contentBase64 = await fileToBase64(file);
      const response = await fetch(`${cloudflareApiUrl.replace(/\/$/, "")}/api/files`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          contentBase64,
          contentType: file.type || "application/octet-stream",
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: UploadedFile; error?: string };

      if (!response.ok || !payload.data) {
        setNotice(`Erro ao enviar arquivo: ${payload.error ?? "upload nao concluido"}`);
        return null;
      }

      setNotice("Arquivo enviado e vinculado a etapa.");
      return payload.data;
    } catch (error) {
      setNotice(`Erro ao enviar arquivo: ${error instanceof Error ? error.message : "erro desconhecido"}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  }

  async function addNextClientStep(clientId: string, name: string) {
    const step = await createClientStep(clientId, { name: name || "Nova etapa" });

    if (step) {
      await loadAll();
      setSelectedClientStepId(step.id);
      setNotice("Etapa adicionada a jornada do cliente.");
    }
  }

  async function saveClientAsTemplate(client: Client) {
    if (!supabase) {
      return;
    }

    const templateName = `${client.name} - template cliente`;
    const { data: template, error } = await supabase
      .from<JourneyTemplate>("journey_templates")
      .insert(
        normalizePayload({
          name: templateName,
          description: `Criado a partir da jornada do cliente ${client.name}.`,
          project_type_id: client.project_type_id,
          context: "cliente",
          status: "ativo",
        }),
      )
      .select("*")
      .single();

    if (error || !template) {
      setNotice(`Erro ao salvar template de cliente: ${error?.message ?? "erro desconhecido"}`);
      return;
    }

    const steps = tables.client_steps.filter((step) => step.client_id === client.id).sort(byOrder);

    for (const step of steps) {
      const checklistText = tables.client_step_checklist_items
        .filter((item) => item.client_step_id === step.id)
        .sort(byOrder)
        .map((item) => item.label)
        .join("\n");

      await supabase.from("journey_steps").insert(
        normalizePayload({
          journey_template_id: template.id,
          name: step.name,
          description: step.description,
          step_order: step.step_order,
          objective: step.objective,
          expected_output: step.required_evidence_label,
          checklist: checklistText,
          status: "ativo",
        }),
      );
    }

    await loadAll();
    setNotice(`Template "${templateName}" salvo a partir da jornada do cliente.`);
  }

  if (!currentUser) {
    return (
      <UserEntryScreen
        users={activeUsers}
        isLoading={isLoading}
        notice={notice}
        tableErrors={tableErrors}
        onSelect={selectUser}
        onCreate={createAppUser}
        onRefresh={() => void loadAll()}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Sparkles size={20} />
          </span>
          <span>Ramos Jornadas</span>
        </div>

        <nav className="nav-list">
          <button className={`nav-item ${view === "projects" || view === "journey" ? "active" : ""}`} onClick={() => setView("projects")}>
            <PanelLeft size={18} />
            Projetos
          </button>
          <button className={`nav-item ${view === "projectTemplates" ? "active" : ""}`} onClick={() => setView("projectTemplates")}>
            <Route size={18} />
            Templates
          </button>
          <button className={`nav-item ${view === "clients" || view === "clientJourney" ? "active" : ""}`} onClick={() => setView("clients")}>
            <Users size={18} />
            Clientes
          </button>
          <button className={`nav-item ${view === "settings" ? "active" : ""}`} onClick={() => setView("settings")}>
            <Settings size={18} />
            Configuracoes
          </button>
        </nav>

        <div className="sidebar-user">
          <span>Usuario atual</span>
          <strong>{currentUser.name}</strong>
          <button onClick={() => setCurrentUserId("")}>Trocar usuario</button>
        </div>

        {view === "settings" && (
          <div className="subnav">
            {configModules.map((module) => {
              const Icon = module.icon;

              return (
                <button key={module.key} className={`subnav-item ${activeConfig === module.key ? "active" : ""}`} onClick={() => setActiveConfig(module.key)}>
                  <Icon size={16} />
                  {module.label}
                </button>
              );
            })}
          </div>
        )}
      </aside>

      <main className="workspace">
        <div className={`setup-alert ${hasCloudflareApi ? "connected" : ""}`}>
          {isLoading ? <Loader2 className="spin" size={18} /> : <Database size={18} />}
          <span>{notice}</span>
          {tableErrors.length > 0 && <span className="table-error-count">{tableErrors.length} pendencia(s)</span>}
          <button className="ghost-button" onClick={() => void loadAll()}>
            <RefreshCw size={16} />
            Sincronizar
          </button>
        </div>

        {view === "projects" && (
          <ProjectsView
            tables={tables}
            stats={stats}
            query={query}
            setQuery={setQuery}
            onCreate={createProject}
            onOpen={(id) => {
              setSelectedProjectId(id);
              setView("journey");
            }}
            onDelete={deleteProject}
          />
        )}

        {view === "projectTemplates" && <ProjectTemplatesView tables={tables} query={query} setQuery={setQuery} />}

        {view === "clients" && <ClientsView tables={tables} query={query} setQuery={setQuery} onCreate={createClientJourney} onOpen={(id) => { setSelectedClientId(id); setView("clientJourney"); }} />}

        {view === "journey" && selectedProject && selectedStep && (
          <JourneyView
            project={selectedProject}
            steps={projectSteps}
            selectedStep={selectedStep}
            selectedStepId={selectedStep.id}
            tables={tables}
            onSelectStep={setSelectedStepId}
            onBack={() => setView("projects")}
            onUpdateProject={updateProject}
            onUpdateStep={updateStep}
            onAddChecklist={addChecklistItem}
            onToggleChecklist={toggleChecklistItem}
            onDeleteChecklist={(id) => deleteRecord("project_step_checklist_items", id)}
            onAddExistingPrompt={addExistingPrompt}
            onAddLocalPrompt={addLocalPrompt}
            onDeletePrompt={(id) => deleteRecord("project_step_prompts", id)}
            onAddLink={addStepLink}
            onUploadFile={uploadStepFile}
            onDeleteLink={(id) => deleteRecord("project_step_links", id)}
            onAddPhase={addProjectStepPhase}
            onUpdatePhase={updateProjectStepPhase}
            onDeletePhase={deleteProjectStepPhase}
            onAddContext={addProjectStepContext}
            onUpdateContext={updateProjectStepContext}
            onDeleteContext={deleteProjectStepContext}
            onAddNextStep={addNextStep}
            onSaveTemplate={saveProjectAsTemplate}
            currentUser={currentUser}
            onImportSummary={importProjectSummary}
            onUpdateSummaryItem={updateProjectSummaryItem}
            onSetSummaryItemSelection={setSummaryItemSelection}
            onAddSummaryItem={addProjectSummaryItem}
            onDeleteSummaryItem={deleteProjectSummaryItem}
            onConsolidateSummary={consolidateProjectSummary}
            onSaveGeneratedPrompt={saveGeneratedPrompt}
            onCreatePromptFromBlock={createPromptFromBlock}
          />
        )}

        {view === "journey" && (!selectedProject || !selectedStep) && (
          <EmptyProjectJourney onBack={() => setView("projects")} />
        )}

        {view === "clientJourney" && selectedClient && selectedClientStep && (
          <ClientJourneyView
            client={selectedClient}
            steps={clientSteps}
            selectedStep={selectedClientStep}
            tables={tables}
            onSelectStep={setSelectedClientStepId}
            onBack={() => setView("clients")}
            onUpdateClient={updateClient}
            onUpdateStep={updateClientStep}
            onAddChecklist={addClientChecklistItem}
            onToggleChecklist={toggleClientChecklistItem}
            onDeleteChecklist={(id) => deleteRecord("client_step_checklist_items", id)}
            onAddLink={addClientStepLink}
            onUploadFile={uploadClientStepFile}
            onDeleteLink={(id) => deleteRecord("client_step_links", id)}
            onAddNextStep={addNextClientStep}
            onSaveTemplate={saveClientAsTemplate}
          />
        )}

        {view === "clientJourney" && (!selectedClient || !selectedClientStep) && (
          <EmptyClientJourney onBack={() => setView("clients")} />
        )}

        {view === "settings" && (
          <SettingsView
            tables={tables}
            activeConfig={activeConfig}
            setActiveConfig={setActiveConfig}
            query={query}
            setQuery={setQuery}
            onRefresh={loadAll}
            onNotice={setNotice}
            onTables={setTables}
          />
        )}
      </main>
    </div>
  );
}

type NewProjectFormState = {
  name: string;
  company: string;
  responsible: string;
  project_type_id: string;
  journey_template_id: string;
  notes: string;
};

type NewClientFormState = {
  name: string;
  company: string;
  logo_url: string;
  responsible: string;
  project_type_id: string;
  journey_template_id: string;
  entry_month: string;
  notes: string;
};

function ProjectsView({
  tables,
  stats,
  query,
  setQuery,
  onCreate,
  onOpen,
  onDelete,
}: {
  tables: Tables;
  stats: Array<{ label: string; value: number }>;
  query: string;
  setQuery: (query: string) => void;
  onCreate: (form: NewProjectFormState) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "todos">("todos");
  const filteredProjects = tables.projects
    .filter((project) => statusFilter === "todos" || project.status === statusFilter)
    .filter((project) => normalizeSearch(project.name, project.company, project.responsible).includes(query.toLowerCase()))
    .sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime());

  return (
    <>
      <section className="topbar">
        <div>
          <h1>Projetos</h1>
          <p>Crie uma execucao real, conduza as etapas e salve o que funcionar como template.</p>
        </div>
        <button className="primary-button" onClick={() => setShowForm((current) => !current)}>
          <Plus size={17} />
          Novo projeto
        </button>
      </section>

      <section className="metric-grid">
        {stats.map((stat) => (
          <article className="metric-card" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </article>
        ))}
      </section>

      {showForm && <NewProjectPanel tables={tables} onCreate={onCreate} />}

      <section className="list-panel">
        <div className="panel-heading">
          <div>
            <h2>Projetos reais</h2>
            <p>Abra um projeto para executar a jornada, copiar prompts e marcar entregas.</p>
          </div>
          <div className="panel-tools">
            <label className="search-field">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar projeto" />
            </label>
            <select className="compact-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ProjectStatus | "todos")}>
              <option value="todos">Todos</option>
              <option value="em_andamento">Em andamento</option>
              <option value="planejado">Planejados</option>
              <option value="concluido">Concluidos</option>
              <option value="bloqueado">Bloqueados</option>
              <option value="arquivado">Arquivados</option>
            </select>
          </div>
        </div>

        <div className="project-grid">
          {filteredProjects.map((project) => {
            const steps = tables.project_steps.filter((step) => step.project_id === project.id);
            const done = steps.filter((step) => step.status === "concluido").length;
            const progress = steps.length ? Math.round((done / steps.length) * 100) : 0;

            return (
              <article className="project-card" key={project.id}>
                <button className="project-card-main" onClick={() => onOpen(project.id)}>
                  <div className="project-card-head">
                    <span className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as CSSProperties}>
                      <strong>{progress}%</strong>
                    </span>
                    <div>
                      <strong>{project.name}</strong>
                      <span>{project.company || "Sem empresa definida"}</span>
                    </div>
                    <StatusPill status={project.status} />
                  </div>
                  <div className="progress-bar">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <small>
                    {progress}% concluido - {steps.length} etapas
                  </small>
                </button>
                <button className="danger-text-button" onClick={() => onDelete(project.id)}>
                  <Trash2 size={15} />
                  Excluir projeto
                </button>
              </article>
            );
          })}
        </div>

        {filteredProjects.length === 0 && (
          <div className="empty-state">
            <FileText size={34} />
            <strong>Nenhum projeto encontrado</strong>
            <span>Crie o primeiro projeto para iniciar uma jornada executavel.</span>
          </div>
        )}
      </section>
    </>
  );
}

function ProjectTemplatesView({ tables, query, setQuery }: { tables: Tables; query: string; setQuery: (query: string) => void }) {
  const templates = tables.journey_templates
    .filter((template) => template.context === "projeto" || template.context === "geral")
    .filter((template) => normalizeSearch(template.name, template.description).includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <section className="topbar">
        <div>
          <h1>Templates</h1>
          <p>Modelos de jornadas que podem ser usados para criar novos projetos.</p>
        </div>
      </section>

      <section className="list-panel">
        <div className="panel-heading">
          <div>
            <h2>Templates de projeto</h2>
            <p>Veja a estrutura salva, as etapas e os prompts pendentes de preenchimento.</p>
          </div>
          <label className="search-field">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar template" />
          </label>
        </div>

        <div className="template-grid">
          {templates.map((template) => {
            const steps = tables.journey_steps.filter((step) => step.journey_template_id === template.id).sort(byOrder);
            const stepIds = new Set(steps.map((step) => step.id));
            const prompts = tables.step_prompts.filter((prompt) => stepIds.has(prompt.journey_step_id));
            const pendingPrompts = prompts.filter((prompt) => prompt.prompt_status === "pendente" || !String(prompt.content ?? "").trim()).length;

            return (
              <article className="template-card" key={template.id}>
                <div className="project-card-head">
                  <strong>{template.name}</strong>
                  <StatusPill status={template.status} />
                </div>
                <p>{template.description || "Template sem descricao."}</p>
                <div className="template-meta">
                  <span>{steps.length} etapas</span>
                  <span>{prompts.length} prompts</span>
                  {pendingPrompts > 0 && <span className="warning-chip">{pendingPrompts} pendentes</span>}
                </div>
                <ol className="template-step-list">
                  {steps.slice(0, 6).map((step) => (
                    <li key={step.id}>{step.name}</li>
                  ))}
                </ol>
                {steps.length > 6 && <small>+ {steps.length - 6} etapas</small>}
              </article>
            );
          })}
        </div>

        {templates.length === 0 && (
          <div className="empty-state">
            <Route size={34} />
            <strong>Nenhum template encontrado</strong>
            <span>Cadastre ou salve uma jornada real como template.</span>
          </div>
        )}
      </section>
    </>
  );
}

function NewProjectPanel({ tables, onCreate }: { tables: Tables; onCreate: (form: NewProjectFormState) => void }) {
  const projectTemplates = tables.journey_templates.filter((template) => template.context === "projeto" || template.context === "geral");
  const [form, setForm] = useState<NewProjectFormState>({
    name: "",
    company: "",
    responsible: "",
    project_type_id: "",
    journey_template_id: "",
    notes: "",
  });

  return (
    <section className="form-panel inline-panel">
      <div className="form-heading">
        <div>
          <h2>Criar projeto</h2>
          <p>Escolha um template salvo ou comece vazio e construa a jornada na pratica.</p>
        </div>
        <button className="primary-button" onClick={() => onCreate(form)}>
          <Save size={16} />
          Criar jornada
        </button>
      </div>
      <div className="form-grid">
        <Field label="Nome do projeto" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
        <Field label="Empresa / cliente" value={form.company} onChange={(value) => setForm({ ...form, company: value })} />
        <Field label="Responsavel" value={form.responsible} onChange={(value) => setForm({ ...form, responsible: value })} />
        <SelectField label="Tipo de projeto" value={form.project_type_id} onChange={(value) => setForm({ ...form, project_type_id: value })} options={tables.project_types.map(toOption)} />
        <SelectField
          label="Template"
          value={form.journey_template_id}
          onChange={(value) => setForm({ ...form, journey_template_id: value })}
          options={projectTemplates.map(toOption)}
          emptyLabel="Comecar vazio"
        />
        <TextArea label="Observacoes iniciais" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
      </div>
    </section>
  );
}

function ClientsView({
  tables,
  query,
  setQuery,
  onCreate,
  onOpen,
}: {
  tables: Tables;
  query: string;
  setQuery: (query: string) => void;
  onCreate: (form: NewClientFormState) => void;
  onOpen: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const filteredClients = tables.clients
    .filter((client) => normalizeSearch(client.name, client.company, client.responsible).includes(query.toLowerCase()))
    .sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime());

  const activeClients = tables.clients.filter((client) => client.status !== "arquivado");
  const doneSteps = tables.client_steps.filter((step) => step.status === "concluido").length;
  const blockedSteps = tables.client_steps.filter((step) => step.status === "bloqueado").length;
  const averageProgress = activeClients.length
    ? Math.round(
        activeClients.reduce((total, client) => {
          const steps = tables.client_steps.filter((step) => step.client_id === client.id);
          const done = steps.filter((step) => step.status === "concluido").length;
          return total + (steps.length ? done / steps.length : 0);
        }, 0) /
          activeClients.length *
          100,
      )
    : 0;

  return (
    <>
      <section className="topbar">
        <div>
          <h1>Clientes</h1>
          <p>Acompanhe a jornada de entrada, implantação e organização inicial dos clientes.</p>
        </div>
        <button className="primary-button" onClick={() => setShowForm((current) => !current)}>
          <Plus size={17} />
          Novo cliente
        </button>
      </section>

      <section className="metric-grid client-metrics">
        <article className="metric-card">
          <span>Clientes ativos</span>
          <strong>{activeClients.length}</strong>
        </article>
        <article className="metric-card">
          <span>Progresso medio</span>
          <strong>{averageProgress}%</strong>
        </article>
        <article className="metric-card">
          <span>Etapas concluidas</span>
          <strong>{doneSteps}</strong>
        </article>
        <article className="metric-card">
          <span>Etapas bloqueadas</span>
          <strong>{blockedSteps}</strong>
        </article>
      </section>

      {showForm && <NewClientPanel tables={tables} onCreate={onCreate} />}

      <section className="list-panel">
        <div className="panel-heading">
          <div>
            <h2>Jornadas de clientes</h2>
            <p>Abra um cliente para marcar checklist, anexar evidencias e concluir etapas.</p>
          </div>
          <label className="search-field">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente" />
          </label>
        </div>

        <div className="project-grid">
          {filteredClients.map((client) => {
            const steps = tables.client_steps.filter((step) => step.client_id === client.id);
            const done = steps.filter((step) => step.status === "concluido").length;
            const progress = steps.length ? Math.round((done / steps.length) * 100) : 0;

            return (
              <button className="project-card client-card" key={client.id} onClick={() => onOpen(client.id)}>
                <div className="client-card-head">
                  <div className="client-avatar-stack">
                    <ClientLogo client={client} />
                    <span className="progress-ring small" style={{ "--progress": `${progress * 3.6}deg` } as CSSProperties}>
                      <strong>{progress}%</strong>
                    </span>
                  </div>
                  <StatusPill status={client.status} />
                </div>
                <strong>{client.name}</strong>
                <span>{client.company || client.entry_month || "Cliente sem detalhe definido"}</span>
                <div className="progress-bar">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <small>
                  {progress}% concluido - {steps.length} etapas
                </small>
              </button>
            );
          })}
        </div>

        {filteredClients.length === 0 && (
          <div className="empty-state">
            <Users size={34} />
            <strong>Nenhum cliente encontrado</strong>
            <span>Crie o primeiro cliente para acompanhar uma jornada.</span>
          </div>
        )}
      </section>
    </>
  );
}

function NewClientPanel({ tables, onCreate }: { tables: Tables; onCreate: (form: NewClientFormState) => void }) {
  const defaultTemplate = getDefaultClientTemplate(tables.journey_templates);
  const [form, setForm] = useState<NewClientFormState>({
    name: "",
    company: "",
    logo_url: "",
    responsible: "",
    project_type_id: "",
    journey_template_id: defaultTemplate?.id ?? "",
    entry_month: "",
    notes: "",
  });

  const clientTemplates = tables.journey_templates.filter((template) => template.context === "cliente" || template.context === "geral");

  return (
    <section className="form-panel inline-panel">
      <div className="form-heading">
        <div>
          <h2>Criar cliente</h2>
          <p>Use o template de integração ou comece uma jornada vazia.</p>
        </div>
        <button className="primary-button" onClick={() => onCreate(form)}>
          <Save size={16} />
          Criar jornada
        </button>
      </div>
      <div className="form-grid">
        <Field label="Nome do cliente" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
        <Field label="Empresa / unidade" value={form.company} onChange={(value) => setForm({ ...form, company: value })} />
        <Field label="Logo URL" value={form.logo_url} onChange={(value) => setForm({ ...form, logo_url: value })} />
        <Field label="Responsavel interno" value={form.responsible} onChange={(value) => setForm({ ...form, responsible: value })} />
        <Field label="Mes de entrada" value={form.entry_month} onChange={(value) => setForm({ ...form, entry_month: value })} />
        <SelectField label="Produto / tipo" value={form.project_type_id} onChange={(value) => setForm({ ...form, project_type_id: value })} options={tables.project_types.map(toOption)} />
        <SelectField
          label="Template de jornada"
          value={form.journey_template_id}
          onChange={(value) => setForm({ ...form, journey_template_id: value })}
          options={clientTemplates.map(toOption)}
          emptyLabel="Comecar vazio"
        />
        <TextArea label="Observacoes iniciais" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
      </div>
    </section>
  );
}

function ClientJourneyView({
  client,
  steps,
  selectedStep,
  tables,
  onSelectStep,
  onBack,
  onUpdateClient,
  onUpdateStep,
  onAddChecklist,
  onToggleChecklist,
  onDeleteChecklist,
  onAddLink,
  onUploadFile,
  onDeleteLink,
  onAddNextStep,
  onSaveTemplate,
}: {
  client: Client;
  steps: ClientStep[];
  selectedStep: ClientStep;
  tables: Tables;
  onSelectStep: (id: string) => void;
  onBack: () => void;
  onUpdateClient: (clientId: string, payload: Partial<Client>) => void;
  onUpdateStep: (stepId: string, payload: Partial<ClientStep>) => void;
  onAddChecklist: (stepId: string, label: string) => void;
  onToggleChecklist: (item: ClientChecklistItem) => void;
  onDeleteChecklist: (id: string) => void;
  onAddLink: (stepId: string, title: string, url: string) => void;
  onUploadFile: (stepId: string, file: File) => void;
  onDeleteLink: (id: string) => void;
  onAddNextStep: (clientId: string, name: string) => void;
  onSaveTemplate: (client: Client) => void;
}) {
  const doneSteps = steps.filter((step) => step.status === "concluido").length;
  const progress = steps.length ? Math.round((doneSteps / steps.length) * 100) : 0;
  const checklist = tables.client_step_checklist_items.filter((item) => item.client_step_id === selectedStep.id).sort(byOrder);
  const links = tables.client_step_links.filter((link) => link.client_step_id === selectedStep.id).sort(byOrder);
  const canComplete = checklist.every((item) => item.is_done);

  return (
    <>
      <section className="journey-header client-journey-header">
        <button className="ghost-button" onClick={onBack}>
          <PanelLeft size={16} />
          Clientes
        </button>
        <ClientLogo client={client} large />
        <div className="journey-title">
          <h1>{client.name}</h1>
          <p>{client.company || client.entry_month || "Jornada do cliente"}</p>
        </div>
        <div className="journey-progress">
          <strong>{progress}%</strong>
          <div className="progress-bar">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      </section>

      <section className="journey-layout client-journey-layout">
        <aside className="step-rail">
          <div className="rail-heading">
            <strong>Jornada</strong>
            <span>{doneSteps} concluidas</span>
          </div>
          {steps.map((step) => (
            <button key={step.id} className={`step-item ${selectedStep.id === step.id ? "active" : ""}`} onClick={() => onSelectStep(step.id)}>
              <span className={`step-dot ${step.status}`}>
                {step.status === "concluido" ? <Check size={13} /> : step.step_order}
              </span>
              <span>
                <strong>{step.name}</strong>
                <small>{formatStepStatus(step.status)}</small>
              </span>
            </button>
          ))}
        </aside>

        <section className="work-surface">
          <div className="work-heading">
            <div>
              <span className="eyebrow">Etapa do cliente</span>
              <InlineText defaultValue={selectedStep.name} className="inline-title" onSave={(value) => onUpdateStep(selectedStep.id, { name: value })} />
            </div>
            <div className="status-actions">
              {(["pendente", "em_andamento", "concluido", "bloqueado"] as StepStatus[]).map((status) => (
                <button
                  key={status}
                  className={`chip ${selectedStep.status === status ? "active" : ""}`}
                  onClick={() => onUpdateStep(selectedStep.id, { status })}
                  disabled={status === "concluido" && !canComplete}
                  title={status === "concluido" && !canComplete ? "Ainda existem itens de checklist pendentes" : undefined}
                >
                  {formatStepStatus(status)}
                </button>
              ))}
            </div>
          </div>

          <div className="editor-grid">
            <TextArea label="Objetivo da etapa" value={selectedStep.objective} onChange={() => undefined} onBlur={(value) => onUpdateStep(selectedStep.id, { objective: value })} />
            <TextArea label="Pre-requisito / evidencia para concluir" value={selectedStep.required_evidence_label} onChange={() => undefined} onBlur={(value) => onUpdateStep(selectedStep.id, { required_evidence_label: value })} />
            <TextArea label="Observacoes da etapa" value={selectedStep.notes} onChange={() => undefined} onBlur={(value) => onUpdateStep(selectedStep.id, { notes: value })} />
            <Field label="Prazo" type="date" value={selectedStep.due_date ?? ""} onChange={(value) => onUpdateStep(selectedStep.id, { due_date: value })} />
          </div>

          <ClientChecklistPanel items={checklist} onAdd={(label) => onAddChecklist(selectedStep.id, label)} onToggle={onToggleChecklist} onDelete={onDeleteChecklist} />
          <ClientLinksPanel links={links} onAdd={(title, url) => onAddLink(selectedStep.id, title, url)} onUpload={(file) => onUploadFile(selectedStep.id, file)} onDelete={onDeleteLink} />
        </section>

        <aside className="action-panel">
          <QuickAddStep onAdd={(name) => onAddNextStep(client.id, name)} />
          <button className="action-button" disabled={!canComplete} onClick={() => onUpdateStep(selectedStep.id, { status: "concluido" })}>
            <CheckCircle2 size={18} />
            Concluir etapa
          </button>
          <button className="action-button" onClick={() => onSaveTemplate(client)}>
            <Save size={18} />
            Salvar como template
          </button>
          <SelectField
            label="Status do cliente"
            value={client.status}
            onChange={(value) => onUpdateClient(client.id, { status: value as ClientStatus })}
            options={[
              { value: "em_implantacao", label: "Em implantacao" },
              { value: "ativo", label: "Ativo" },
              { value: "concluido", label: "Concluido" },
              { value: "bloqueado", label: "Bloqueado" },
              { value: "arquivado", label: "Arquivado" },
            ]}
          />
        </aside>
      </section>
    </>
  );
}

function ClientChecklistPanel({
  items,
  onAdd,
  onToggle,
  onDelete,
}: {
  items: ClientChecklistItem[];
  onAdd: (label: string) => void;
  onToggle: (item: ClientChecklistItem) => void;
  onDelete: (id: string) => void;
}) {
  const [label, setLabel] = useState("");

  return (
    <section className="work-block">
      <div className="block-heading">
        <h2>Checklist da etapa</h2>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd(label);
            setLabel("");
          }}
        >
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Adicionar item" />
          <button className="icon-button" type="submit">
            <Plus size={16} />
          </button>
        </form>
      </div>

      <div className="checklist">
        {items.map((item) => (
          <div className="check-row" key={item.id}>
            <button className={`checkbox ${item.is_done ? "checked" : ""}`} onClick={() => onToggle(item)}>
              {item.is_done && <Check size={14} />}
            </button>
            <span>{item.label}</span>
            <button className="icon-button subtle" onClick={() => onDelete(item.id)}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {items.length === 0 && <span className="muted">Nenhum checklist nesta etapa.</span>}
      </div>
    </section>
  );
}

function ClientLinksPanel({
  links,
  onAdd,
  onUpload,
  onDelete,
}: {
  links: ClientStepLink[];
  onAdd: (title: string, url: string) => void;
  onUpload: (file: File) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  return (
    <section className="work-block">
      <div className="block-heading">
        <h2>Evidencias e arquivos</h2>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd(title, url);
            setTitle("");
            setUrl("");
          }}
        >
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: contrato assinado" />
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Link Drive, PDF ou pasta" />
          <button className="icon-button" type="submit">
            <Plus size={16} />
          </button>
          <FileUploadButton onUpload={onUpload} />
        </form>
      </div>
      <div className="link-list">
        {links.map((link) => (
          <div className="record-row compact" key={link.id}>
            <div>
              <strong>{link.title}</strong>
              <a href={link.url} target="_blank" rel="noreferrer">
                {link.url}
              </a>
            </div>
            <button onClick={() => onDelete(link.id)}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {links.length === 0 && <span className="muted">Nenhuma evidencia vinculada.</span>}
      </div>
    </section>
  );
}

type StepBuilderBlock = {
  id: string;
  type: string;
  order: number;
  title: string;
  description?: string | null;
  required: boolean;
  visible: boolean;
  editableInExecution: boolean;
  collapsedByDefault: boolean;
  config: Record<string, any>;
};

type StepBuilderPayload = {
  document: {
    structureId: string;
    state: "draft" | "published" | "archived";
    versionNumber: number;
    revision: number;
    blocks: StepBuilderBlock[];
  };
  values: Array<{ block_id: string; value: any; completion_state: string }>;
  completion: { status: StepStatus; progress: number; completedBlocks: number; totalBlocks: number; canComplete: boolean; reasons: Array<{ message: string; blockId?: string }> };
};

const blockCatalog = [
  { type: "phase", label: "Fase", icon: Layers3 },
  { type: "short_text", label: "Texto simples", icon: Pencil },
  { type: "long_text", label: "Texto longo", icon: FileText },
  { type: "checklist", label: "Checklist", icon: ListChecks },
  { type: "prompt", label: "Prompt", icon: Clipboard },
  { type: "context", label: "Contexto", icon: Copy },
  { type: "project_summary", label: "Sumario", icon: GitBranch },
  { type: "materials", label: "Materiais", icon: Link2 },
  { type: "file_upload", label: "Upload", icon: Upload },
  { type: "comment", label: "Comentario", icon: FileText },
  { type: "status", label: "Status", icon: CheckCircle2 },
  { type: "date", label: "Data", icon: Route },
];

function JourneyView({
  project,
  steps,
  selectedStep,
  selectedStepId,
  tables,
  onSelectStep,
  onBack,
  onUpdateProject,
  onUpdateStep,
  onAddChecklist,
  onToggleChecklist,
  onDeleteChecklist,
  onAddExistingPrompt,
  onAddLocalPrompt,
  onDeletePrompt,
  onAddLink,
  onUploadFile,
  onDeleteLink,
  onAddPhase,
  onUpdatePhase,
  onDeletePhase,
  onAddContext,
  onUpdateContext,
  onDeleteContext,
  onAddNextStep,
  onSaveTemplate,
  currentUser,
  onImportSummary,
  onUpdateSummaryItem,
  onSetSummaryItemSelection,
  onAddSummaryItem,
  onDeleteSummaryItem,
  onConsolidateSummary,
  onSaveGeneratedPrompt,
  onCreatePromptFromBlock,
}: {
  project: Project;
  steps: ProjectStep[];
  selectedStep: ProjectStep;
  selectedStepId: string;
  tables: Tables;
  onSelectStep: (id: string) => void;
  onBack: () => void;
  onUpdateProject: (projectId: string, payload: Partial<Project>) => void;
  onUpdateStep: (stepId: string, payload: Partial<ProjectStep>) => void;
  onAddChecklist: (stepId: string, label: string) => void;
  onToggleChecklist: (item: ProjectChecklistItem) => void;
  onDeleteChecklist: (id: string) => void;
  onAddExistingPrompt: (stepId: string, promptId: string) => void;
  onAddLocalPrompt: (stepId: string, title: string, content: string, aiToolId: string) => void;
  onDeletePrompt: (id: string) => void;
  onAddLink: (stepId: string, title: string, url: string) => void;
  onUploadFile: (stepId: string, file: File) => void;
  onDeleteLink: (id: string) => void;
  onAddPhase: (stepId: string, title: string) => void;
  onUpdatePhase: (phaseId: string, payload: Partial<ProjectStepPhase>) => void;
  onDeletePhase: (phaseId: string) => void;
  onAddContext: (stepId: string, title: string, content: string, phaseId: string) => void;
  onUpdateContext: (contextId: string, payload: Partial<ProjectStepContext>) => void;
  onDeleteContext: (contextId: string) => void;
  onAddNextStep: (projectId: string, name: string) => void;
  onSaveTemplate: (project: Project) => void;
  currentUser: AppUser | null;
  onImportSummary: (project: Project, rawText: string) => void;
  onUpdateSummaryItem: (itemId: string, payload: Partial<ProjectSummaryItem>) => void;
  onSetSummaryItemSelection: (summaryId: string, itemId: string, isSelected: boolean) => void;
  onAddSummaryItem: (summaryId: string, parentId: string, title: string) => void;
  onDeleteSummaryItem: (summaryId: string, itemId: string) => void;
  onConsolidateSummary: (summaryId: string) => Promise<ProjectSummary | null>;
  onSaveGeneratedPrompt: (payload: Omit<GeneratedPrompt, "id" | "created_at">) => void;
  onCreatePromptFromBlock: (payload: { title: string; content: string; ai_tool_id?: string | null; short_description?: string | null }) => Promise<Prompt | null>;
}) {
  const doneSteps = steps.filter((step) => step.status === "concluido").length;
  const progress = steps.length ? Math.round((doneSteps / steps.length) * 100) : 0;
  const [payload, setPayload] = useState<StepBuilderPayload | null>(null);
  const [isLoadingBlocks, setIsLoadingBlocks] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [newStepName, setNewStepName] = useState("");
  const [summaryEditorOpen, setSummaryEditorOpen] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Set<string>>(() => new Set());
  const summaries = tables.project_summaries.filter((summary) => summary.project_id === project.id);
  const summaryItems = tables.project_summary_items.filter((item) => item.project_id === project.id).sort(byOrder);
  const generatedPrompts = tables.generated_prompts.filter((prompt) => prompt.project_id === project.id);

  useEffect(() => {
    void loadStepStructure();
  }, [selectedStep.id]);

  async function stepRequest(path: string, init?: RequestInit) {
    const response = await fetch(`${cloudflareApiUrl}/api/project-steps/${selectedStep.id}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = (await response.json()) as { data?: StepBuilderPayload; error?: string };
    if (!response.ok || !body.data) throw new Error(body.error ?? "Erro ao carregar estrutura da etapa.");
    return body.data;
  }

  async function loadStepStructure() {
    setIsLoadingBlocks(true);
    try {
      const next = await stepRequest("/structure");
      setPayload(next);
      if (next.completion.status !== selectedStep.status) {
        void onUpdateStep(selectedStep.id, { status: next.completion.status });
      }
    } finally {
      setIsLoadingBlocks(false);
    }
  }

  async function addBlock(type: string) {
    const next = await stepRequest("/blocks", { method: "POST", body: JSON.stringify({ type }) });
    setPayload(next);
    setEditingBlockId(next.document.blocks[next.document.blocks.length - 1]?.id ?? null);
    setIsAddMenuOpen(false);
  }

  async function updateBlock(blockId: string, patch: Partial<StepBuilderBlock>) {
    setPayload(await stepRequest(`/blocks/${encodeURIComponent(blockId)}`, { method: "PATCH", body: JSON.stringify(patch) }));
  }

  async function deleteBlock(blockId: string) {
    setPayload(await stepRequest(`/blocks/${encodeURIComponent(blockId)}`, { method: "DELETE" }));
  }

  async function duplicateBlock(block: StepBuilderBlock) {
    if (!payload) return;
    const created = await stepRequest("/blocks", {
      method: "POST",
      body: JSON.stringify({ type: block.type, title: `${block.title} copia`, parentBlockId: block.config.parentBlockId ?? null }),
    });
    const createdBlock = created.document.blocks.find((item) => !payload.document.blocks.some((existing) => existing.id === item.id));
    if (!createdBlock) {
      setPayload(created);
      return;
    }
    setPayload(await stepRequest(`/blocks/${encodeURIComponent(createdBlock.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: `${block.title} copia`,
        required: block.required,
        visible: block.visible,
        editableInExecution: block.editableInExecution,
        collapsedByDefault: block.collapsedByDefault,
        config: block.config,
      }),
    }));
  }

  function toggleBlockCollapsed(blockId: string) {
    setCollapsedBlockIds((current) => {
      const next = new Set(current);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }

  async function moveBlock(blockId: string, direction: -1 | 1) {
    if (!payload) return;
    const ids = payload.document.blocks.map((block) => block.id);
    const index = ids.indexOf(blockId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
    setPayload(await stepRequest("/blocks/reorder", { method: "POST", body: JSON.stringify({ blockIds: ids }) }));
  }

  async function saveBlockValue(blockId: string, value: unknown) {
    const next = await stepRequest(`/block-values/${encodeURIComponent(blockId)}`, { method: "PATCH", body: JSON.stringify({ value, updatedBy: currentUser?.name ?? "Patrick" }) });
    setPayload(next);
    if (next.completion.status !== selectedStep.status) onUpdateStep(selectedStep.id, { status: next.completion.status });
  }

  const blocks = payload?.document.blocks ?? [];
  const completion = payload?.completion;

  return (
    <>
      <section className="journey-hero">
        <button className="ghost-button" onClick={onBack}>
          <PanelLeft size={17} /> Projetos
        </button>
        <div>
          <span className="eyebrow">Ramos Jornadas</span>
          <h1>{project.name}</h1>
          <p>{project.company || "Projeto sem empresa definida"}</p>
        </div>
        <div className="journey-progress">
          <strong>{progress}%</strong>
          <div className="progress-bar"><span style={{ width: `${progress}%` }} /></div>
        </div>
      </section>

      <section className="journey-layout block-journey-layout">
        <aside className="step-rail collapsible-rail">
          <div className="rail-heading"><strong>Etapas</strong><span>{doneSteps} concluidas</span></div>
          {steps.map((step) => (
            <button key={step.id} className={`step-item ${selectedStepId === step.id ? "active" : ""}`} onClick={() => onSelectStep(step.id)}>
              <span className={`step-dot ${step.status}`}>{step.status === "concluido" ? <Check size={13} /> : step.step_order}</span>
              <span><strong>{step.name}</strong><small>{formatStepStatus(step.status)}</small></span>
            </button>
          ))}
        </aside>

        <section className="work-surface block-work-surface">
          <div className="journey-command-bar">
            <div>
              <span className="eyebrow">Etapa selecionada</span>
              <InlineText defaultValue={selectedStep.name} className="inline-title" onSave={(value) => onUpdateStep(selectedStep.id, { name: value })} />
            </div>
            <form className="quick-step-form" onSubmit={(event) => { event.preventDefault(); onAddNextStep(project.id, newStepName || "Nova etapa"); setNewStepName(""); }}>
              <input value={newStepName} onChange={(event) => setNewStepName(event.target.value)} placeholder="Nova etapa" />
              <button className="secondary-button" type="submit"><Plus size={16} /> Adicionar etapa</button>
            </form>
            <div className="block-add-wrap">
              <button className="primary-button" type="button" onClick={() => setIsAddMenuOpen((value) => !value)}><Plus size={17} /> Adicionar bloco</button>
              {isAddMenuOpen && <BlockTypeMenu onSelect={addBlock} />}
            </div>
            <button className="secondary-button" type="button" disabled={!completion?.canComplete} onClick={() => onUpdateStep(selectedStep.id, { status: "concluido" })}><CheckCircle2 size={17} /> Concluir</button>
            <button className="secondary-button" type="button" onClick={() => onSaveTemplate(project)}><Save size={17} /> Salvar template</button>
          </div>
          <div className="step-auto-status">
            <span className={`chip active ${completion?.status ?? selectedStep.status}`}>{formatStepStatus(completion?.status ?? selectedStep.status)}</span>
            <span>{completion ? `${completion.completedBlocks}/${completion.totalBlocks} blocos completos` : "Carregando blocos"}</span>
            <div className="progress-bar"><span style={{ width: `${completion?.progress ?? 0}%` }} /></div>
          </div>

          {isLoadingBlocks && <div className="empty-state compact"><Loader2 className="spin" size={24} /> Carregando construtor da etapa...</div>}

          {!isLoadingBlocks && blocks.length === 0 && (
            <div className="empty-block-canvas">
              <Sparkles size={34} />
              <strong>Etapa limpa</strong>
              <span>Adicione apenas os blocos que fazem sentido para esta etapa.</span>
              <button className="primary-button" onClick={() => setIsAddMenuOpen(true)}><Plus size={17} /> Adicionar primeiro bloco</button>
            </div>
          )}

          <div className="block-canvas">
            {blocks.map((block, index) => (
              <StepBuilderBlockCard
                key={block.id}
                block={block}
                index={index}
                total={blocks.length}
                value={payload?.values.find((item) => item.block_id === block.id)?.value}
                tables={tables}
                summaries={summaries}
                summaryItems={summaryItems}
                generatedPrompts={generatedPrompts}
                project={project}
                selectedStep={selectedStep}
                currentUser={currentUser}
                onUpdateSummaryItem={onUpdateSummaryItem}
                onSetSummaryItemSelection={onSetSummaryItemSelection}
                onDeleteSummaryItem={onDeleteSummaryItem}
                onSaveGeneratedPrompt={onSaveGeneratedPrompt}
                onCreatePromptFromBlock={onCreatePromptFromBlock}
                isEditing={editingBlockId === block.id}
                isCollapsed={collapsedBlockIds.has(block.id)}
                onToggleCollapse={() => toggleBlockCollapsed(block.id)}
                onDuplicate={() => duplicateBlock(block)}
                onEdit={() => {
                  setEditingBlockId(editingBlockId === block.id ? null : block.id);
                  setCollapsedBlockIds((current) => {
                    const next = new Set(current);
                    next.delete(block.id);
                    return next;
                  });
                }}
                onUpdate={(patch) => updateBlock(block.id, patch)}
                onDelete={() => deleteBlock(block.id)}
                onMove={moveBlock}
                onSaveValue={(value) => saveBlockValue(block.id, value)}
                onOpenSummary={() => setSummaryEditorOpen(true)}
              />
            ))}
          </div>
        </section>
      </section>

      {summaryEditorOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="summary-modal glass-panel">
            <div className="modal-heading">
              <div><span className="eyebrow">Editor dedicado</span><h2>Sumario inteligente</h2></div>
              <button className="icon-button" onClick={() => setSummaryEditorOpen(false)}>×</button>
            </div>
            <ProjectSummaryPanel
              project={project}
              selectedStep={selectedStep}
              summaries={summaries}
              items={summaryItems}
              promptBlocks={tables.prompt_blocks}
              generatedPrompts={generatedPrompts}
              tables={tables}
              currentUser={currentUser}
              onImport={onImportSummary}
              onUpdateItem={onUpdateSummaryItem}
              onSetSelection={onSetSummaryItemSelection}
              onAddItem={onAddSummaryItem}
              onDeleteItem={onDeleteSummaryItem}
              onConsolidate={onConsolidateSummary}
              onSaveGeneratedPrompt={onSaveGeneratedPrompt}
            />
          </div>
        </div>
      )}
    </>
  );
}

function BlockTypeMenu({ onSelect }: { onSelect: (type: string) => void }) {
  return (
    <div className="block-type-menu glass-panel">
      {blockCatalog.map((item) => {
        const Icon = item.icon;
        return <button key={item.type} type="button" onClick={() => onSelect(item.type)}><Icon size={16} /> {item.label}</button>;
      })}
    </div>
  );
}

function StepBuilderBlockCard({
  block,
  index,
  total,
  value,
  tables,
  summaries,
  summaryItems,
  generatedPrompts,
  project,
  selectedStep,
  currentUser,
  onUpdateSummaryItem,
  onSetSummaryItemSelection,
  onDeleteSummaryItem,
  onSaveGeneratedPrompt,
  onCreatePromptFromBlock,
  isEditing,
  isCollapsed,
  onToggleCollapse,
  onDuplicate,
  onEdit,
  onUpdate,
  onDelete,
  onMove,
  onSaveValue,
  onOpenSummary,
}: {
  block: StepBuilderBlock;
  index: number;
  total: number;
  value: any;
  tables: Tables;
  summaries: ProjectSummary[];
  summaryItems: ProjectSummaryItem[];
  generatedPrompts: GeneratedPrompt[];
  project: Project;
  selectedStep: ProjectStep;
  currentUser: AppUser | null;
  onUpdateSummaryItem: (itemId: string, payload: Partial<ProjectSummaryItem>) => void;
  onSetSummaryItemSelection: (summaryId: string, itemId: string, isSelected: boolean) => void;
  onDeleteSummaryItem: (summaryId: string, itemId: string) => void;
  onSaveGeneratedPrompt: (payload: Omit<GeneratedPrompt, "id" | "created_at">) => void;
  onCreatePromptFromBlock: (payload: { title: string; content: string; ai_tool_id?: string | null; short_description?: string | null }) => Promise<Prompt | null>;
  isEditing: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onUpdate: (patch: Partial<StepBuilderBlock>) => void;
  onDelete: () => void;
  onMove: (blockId: string, direction: -1 | 1) => void;
  onSaveValue: (value: unknown) => void;
  onOpenSummary: () => void;
}) {
  const Icon = blockCatalog.find((item) => item.type === block.type)?.icon ?? Layers3;
  const parentClass = block.config.parentBlockId ? " nested-block" : "";
  return (
    <article className={`step-builder-block ${block.type}${parentClass}`}>
      <div className="block-card-heading">
        <div><Icon size={18} /><div><strong>{block.title}</strong><span>{blockTypeText(block.type)}{block.required ? " - obrigatorio" : ""}</span></div></div>
        <div className="block-card-actions">
          <button className="icon-button" type="button" title={isCollapsed ? "Expandir bloco" : "Recolher bloco"} onClick={onToggleCollapse}>{isCollapsed ? "+" : "-"}</button>
          <button className="icon-button" type="button" title="Mover para cima" onClick={() => onMove(block.id, -1)} disabled={index === 0}>↑</button>
          <button className="icon-button" type="button" title="Mover para baixo" onClick={() => onMove(block.id, 1)} disabled={index === total - 1}>↓</button>
          <button className="icon-button" type="button" title="Duplicar bloco" onClick={onDuplicate}><Copy size={15} /></button>
          <button className="icon-button" type="button" title="Editar bloco" onClick={onEdit}><Pencil size={15} /></button>
          <button className="icon-button danger" type="button" title="Excluir bloco" onClick={onDelete}><Trash2 size={15} /></button>
        </div>
      </div>

      {!isCollapsed && isEditing && <BlockSettings block={block} tables={tables} onUpdate={onUpdate} onCreatePromptFromBlock={onCreatePromptFromBlock} />}
      {!isCollapsed && <BlockBody block={block} value={value} summaries={summaries} summaryItems={summaryItems} generatedPrompts={generatedPrompts} project={project} selectedStep={selectedStep} tables={tables} currentUser={currentUser} onUpdateSummaryItem={onUpdateSummaryItem} onSetSummaryItemSelection={onSetSummaryItemSelection} onDeleteSummaryItem={onDeleteSummaryItem} onSaveGeneratedPrompt={onSaveGeneratedPrompt} onSaveValue={onSaveValue} onOpenSummary={onOpenSummary} onUpdate={onUpdate} />}
    </article>
  );
}

function BlockSettings({ block, tables, onUpdate, onCreatePromptFromBlock }: { block: StepBuilderBlock; tables: Tables; onUpdate: (patch: Partial<StepBuilderBlock>) => void; onCreatePromptFromBlock: (payload: { title: string; content: string; ai_tool_id?: string | null; short_description?: string | null }) => Promise<Prompt | null> }) {
  const [draftTitle, setDraftTitle] = useState(block.title);
  const [draftInfoText, setDraftInfoText] = useState(String(block.config.content ?? block.config.placeholder ?? ""));

  useEffect(() => {
    setDraftTitle(block.title);
    setDraftInfoText(String(block.config.content ?? block.config.placeholder ?? ""));
  }, [block.id, block.title, block.config.content, block.config.placeholder]);

  function saveTitle() {
    const nextTitle = draftTitle.trim() || block.title;
    if (nextTitle !== block.title) onUpdate({ title: nextTitle });
  }

  function saveInfoText() {
    if (draftInfoText !== String(block.config.content ?? block.config.placeholder ?? "")) {
      onUpdate({ config: { content: draftInfoText, mode: "info" } });
    }
  }

  return (
    <div className="block-settings">
      <label className="field">
        <span>Titulo do bloco</span>
        <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} onBlur={saveTitle} />
      </label>
      <label className="checkline"><input type="checkbox" checked={block.required} onChange={(event) => onUpdate({ required: event.target.checked })} /> Obrigatorio para concluir</label>
      {(block.type === "short_text" || block.type === "long_text") && (
        <label className="field text-block-config">
          <span>Texto informativo</span>
          <textarea
            value={draftInfoText}
            rows={block.type === "long_text" ? 5 : 2}
            placeholder="Escreva a orientacao que deve aparecer na jornada"
            onChange={(event) => setDraftInfoText(event.target.value)}
            onBlur={saveInfoText}
          />
        </label>
      )}
      {block.type === "prompt" && <PromptBlockSettings block={block} tables={tables} onUpdate={onUpdate} onCreatePromptFromBlock={onCreatePromptFromBlock} />}
      {block.type === "project_summary" && <SelectField label="Versao do sumario" value={String(block.config.summaryId ?? "")} onChange={(summaryId) => onUpdate({ config: { summaryId } })} options={tables.project_summaries.map((summary) => ({ value: summary.id, label: `Versao ${summary.version_number} - ${summary.status}` }))} emptyLabel="Nao vinculado" />}
    </div>
  );
}
function BlockBody({
  block,
  value,
  summaries,
  summaryItems,
  generatedPrompts,
  project,
  selectedStep,
  tables,
  currentUser,
  onUpdateSummaryItem,
  onSetSummaryItemSelection,
  onDeleteSummaryItem,
  onSaveGeneratedPrompt,
  onSaveValue,
  onOpenSummary,
  onUpdate,
}: {
  block: StepBuilderBlock;
  value: any;
  summaries: ProjectSummary[];
  summaryItems: ProjectSummaryItem[];
  generatedPrompts: GeneratedPrompt[];
  project: Project;
  selectedStep: ProjectStep;
  tables: Tables;
  currentUser: AppUser | null;
  onUpdateSummaryItem: (itemId: string, payload: Partial<ProjectSummaryItem>) => void;
  onSetSummaryItemSelection: (summaryId: string, itemId: string, isSelected: boolean) => void;
  onDeleteSummaryItem: (summaryId: string, itemId: string) => void;
  onSaveGeneratedPrompt: (payload: Omit<GeneratedPrompt, "id" | "created_at">) => void;
  onSaveValue: (value: unknown) => void;
  onOpenSummary: () => void;
  onUpdate: (patch: Partial<StepBuilderBlock>) => void;
}) {
  if (block.type === "phase") {
    return <PhaseBlock block={block} onUpdate={onUpdate} />;
  }

  if (block.type === "checklist") {
    return <ChecklistBlock block={block} value={value} onSaveValue={onSaveValue} onUpdate={onUpdate} />;
  }

  if (block.type === "prompt") {
    return <PromptExecutionBlock block={block} value={value} tables={tables} onSaveValue={onSaveValue} onUpdate={onUpdate} />;
  }

  if (block.type === "context") {
    return <ContextBlock block={block} onUpdate={onUpdate} />;
  }

  if (block.type === "materials") {
    return <MaterialsBlock block={block} onUpdate={onUpdate} />;
  }

  if (block.type === "project_summary") {
    return (
      <SummaryOperationalBlock
        block={block}
        project={project}
        selectedStep={selectedStep}
        tables={tables}
        summaries={summaries}
        summaryItems={summaryItems}
        generatedPrompts={generatedPrompts}
        currentUser={currentUser}
        onUpdateItem={onUpdateSummaryItem}
        onSetSelection={onSetSummaryItemSelection}
        onDeleteItem={onDeleteSummaryItem}
        onSaveGeneratedPrompt={onSaveGeneratedPrompt}
        onOpenSummary={onOpenSummary}
      />
    );
  }

  if (block.type === "file_upload") {
    return <div className="muted-block">Upload R2 sera conectado neste bloco. Por enquanto use Materiais e links.</div>;
  }

  if (block.type === "comment") {
    return <textarea className="compact-textarea" value={String(block.config.content ?? "")} placeholder="Comentario pequeno" onChange={(event) => onUpdate({ config: { content: event.target.value } })} />;
  }

  if (block.type === "short_text" || block.type === "long_text") {
    const content = String(block.config.content ?? block.config.placeholder ?? "").trim();
    return (
      <div className={`informative-text-block ${block.type}`}>
        {content ? <p>{content}</p> : <span>Edite este bloco para escrever a orientacao.</span>}
      </div>
    );
  }

  const content = String(block.config.content ?? value ?? "");
  return <textarea className="compact-textarea" value={content} placeholder="Digite o conteudo" onChange={(event) => onUpdate({ config: { content: event.target.value } })} onBlur={() => onSaveValue(content)} />;
}

type PromptBlockRuntimeValue = {
  copyCount?: number;
  lastCopiedAt?: string | null;
  applied?: boolean;
  appliedAt?: string | null;
};

function PromptBlockSettings({
  block,
  tables,
  onUpdate,
  onCreatePromptFromBlock,
}: {
  block: StepBuilderBlock;
  tables: Tables;
  onUpdate: (patch: Partial<StepBuilderBlock>) => void;
  onCreatePromptFromBlock: (payload: { title: string; content: string; ai_tool_id?: string | null; short_description?: string | null }) => Promise<Prompt | null>;
}) {
  const selectedPrompt = tables.prompts.find((prompt) => prompt.id === block.config.promptId) ?? null;
  const [draftPromptText, setDraftPromptText] = useState(String(block.config.contentSnapshot ?? selectedPrompt?.content ?? ""));
  const [draftExpectedOutput, setDraftExpectedOutput] = useState(String(block.config.expectedOutput ?? ""));
  const toolId = String(block.config.toolId ?? selectedPrompt?.ai_tool_id ?? "");
  const canSaveToLibrary = Boolean(draftPromptText.trim()) && !selectedPrompt;

  useEffect(() => {
    const nextSelectedPrompt = tables.prompts.find((prompt) => prompt.id === block.config.promptId) ?? null;
    setDraftPromptText(String(block.config.contentSnapshot ?? nextSelectedPrompt?.content ?? ""));
    setDraftExpectedOutput(String(block.config.expectedOutput ?? ""));
  }, [block.id, block.config.promptId, block.config.contentSnapshot, block.config.expectedOutput, tables.prompts]);

  function linkPrompt(promptId: string) {
    const prompt = tables.prompts.find((item) => item.id === promptId) ?? null;

    if (!prompt) {
      onUpdate({ config: { promptId: null, contentSnapshot: draftPromptText, toolId } });
      return;
    }

    setDraftPromptText(prompt.content ?? "");
    onUpdate({
      title: prompt.title,
      config: {
        promptId: prompt.id,
        contentSnapshot: prompt.content,
        toolId: prompt.ai_tool_id ?? "",
        expectedOutput: draftExpectedOutput,
      },
    });
  }

  function savePromptDraft() {
    const currentPromptText = String(block.config.contentSnapshot ?? selectedPrompt?.content ?? "");
    const currentExpectedOutput = String(block.config.expectedOutput ?? "");
    if (draftPromptText !== currentPromptText || draftExpectedOutput !== currentExpectedOutput) {
      onUpdate({ config: { contentSnapshot: draftPromptText, expectedOutput: draftExpectedOutput, promptId: block.config.promptId ?? null, toolId } });
    }
  }

  async function saveToLibrary() {
    const created = await onCreatePromptFromBlock({
      title: block.title || "Prompt da etapa",
      content: draftPromptText,
      ai_tool_id: toolId || null,
      short_description: `Criado no bloco ${block.title || "Prompt"}`,
    });

    if (!created) return;
    setDraftPromptText(created.content ?? "");
    onUpdate({
      title: created.title,
      config: {
        promptId: created.id,
        contentSnapshot: created.content,
        toolId: created.ai_tool_id ?? "",
        expectedOutput: draftExpectedOutput,
      },
    });
  }

  return (
    <div className="prompt-block-settings">
      <SelectField
        label="Prompt da biblioteca"
        value={String(block.config.promptId ?? "")}
        onChange={linkPrompt}
        options={tables.prompts.filter((prompt) => prompt.status !== "arquivado").map((prompt) => ({ value: prompt.id, label: prompt.title }))}
        emptyLabel="Prompt avulso / nao vinculado"
      />
      <SelectField label="Ferramenta" value={toolId} onChange={(nextToolId) => onUpdate({ config: { toolId: nextToolId, contentSnapshot: draftPromptText, expectedOutput: draftExpectedOutput, promptId: block.config.promptId ?? null } })} options={tables.ai_tools.map((tool) => ({ value: tool.id, label: tool.name }))} emptyLabel="Nao vinculado" />
      <label className="field prompt-content-config">
        <span>Texto do prompt</span>
        <textarea value={draftPromptText} rows={6} placeholder="Cole o prompt ou selecione um da biblioteca" onChange={(event) => setDraftPromptText(event.target.value)} onBlur={savePromptDraft} />
      </label>
      <label className="field prompt-content-config">
        <span>Resultado esperado</span>
        <input value={draftExpectedOutput} placeholder="Ex.: apresentacao por topicos gerada no NotebookLM" onChange={(event) => setDraftExpectedOutput(event.target.value)} onBlur={savePromptDraft} />
      </label>
      <div className="inline-actions prompt-settings-actions">
        <button className="secondary-button" type="button" onClick={savePromptDraft}><Save size={15} /> Salvar alteracoes</button>
        <button className="secondary-button" type="button" disabled={!canSaveToLibrary} onClick={() => void saveToLibrary()}><Save size={15} /> Salvar na biblioteca e vincular</button>
      </div>
    </div>
  );
}

function PromptExecutionBlock({ block, value, tables, onSaveValue, onUpdate }: { block: StepBuilderBlock; value: any; tables: Tables; onSaveValue: (value: unknown) => void; onUpdate: (patch: Partial<StepBuilderBlock>) => void }) {
  const runtimeValue = value && typeof value === "object" && !Array.isArray(value) ? value as PromptBlockRuntimeValue : {};
  const linkedPrompt = tables.prompts.find((prompt) => prompt.id === block.config.promptId) ?? null;
  const tool = tables.ai_tools.find((item) => item.id === (block.config.toolId ?? linkedPrompt?.ai_tool_id)) ?? null;
  const promptText = String(block.config.contentSnapshot ?? linkedPrompt?.content ?? "").trim();
  const expectedOutput = String(block.config.expectedOutput ?? "").trim();
  const copyCount = Number(runtimeValue.copyCount ?? 0);
  const isApplied = Boolean(runtimeValue.applied);
  const [copyFeedback, setCopyFeedback] = useState(false);

  function persist(next: PromptBlockRuntimeValue) {
    onSaveValue({ ...runtimeValue, ...next });
  }

  function copyPrompt() {
    if (!promptText) return;
    void copyToClipboard(promptText);
    setCopyFeedback(true);
    window.setTimeout(() => setCopyFeedback(false), 1400);
    persist({ copyCount: copyCount + 1, lastCopiedAt: new Date().toISOString() });
  }

  function toggleApplied() {
    persist({ applied: !isApplied, appliedAt: !isApplied ? new Date().toISOString() : null });
  }

  if (!promptText) {
    return (
      <div className="prompt-execution-card empty">
        <div>
          <strong>Prompt ainda nao configurado</strong>
          <span>Abra o lapis do bloco para escolher um prompt da biblioteca ou colar um prompt avulso.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`prompt-execution-card ${isApplied ? "applied" : "pending"}`}>
      <div className="prompt-execution-main">
        <div>
          <strong>{linkedPrompt?.title ?? block.title}</strong>
          <span>{tool?.name ?? "Ferramenta nao vinculada"}{expectedOutput ? ` - ${expectedOutput}` : ""}</span>
        </div>
        <div className="prompt-execution-stats">
          <span>{copyCount} copia(s)</span>
          <span>{isApplied ? "Aplicado" : "Pendente"}</span>
        </div>
      </div>
      <div className="prompt-execution-actions">
        <button className={`primary-button copy-feedback-button ${copyFeedback ? "copied" : ""}`} type="button" onClick={copyPrompt}><Copy size={15} /> {copyFeedback ? "Copiado!" : "Copiar prompt"}</button>
        <button className={`secondary-button ${isApplied ? "is-applied" : ""}`} type="button" onClick={toggleApplied}><CheckCircle2 size={15} /> {isApplied ? "Aplicado" : "Confirmar aplicado"}</button>
        <button className="icon-button subtle" type="button" title="Atualizar titulo pelo prompt vinculado" disabled={!linkedPrompt} onClick={() => linkedPrompt && onUpdate({ title: linkedPrompt.title })}><RefreshCw size={14} /></button>
      </div>
    </div>
  );
}
function SummaryOperationalBlock({
  block,
  project,
  selectedStep,
  tables,
  summaries,
  summaryItems,
  generatedPrompts,
  currentUser,
  onUpdateItem,
  onSetSelection,
  onDeleteItem,
  onSaveGeneratedPrompt,
  onOpenSummary,
}: {
  block: StepBuilderBlock;
  project: Project;
  selectedStep: ProjectStep;
  tables: Tables;
  summaries: ProjectSummary[];
  summaryItems: ProjectSummaryItem[];
  generatedPrompts: GeneratedPrompt[];
  currentUser: AppUser | null;
  onUpdateItem: (itemId: string, payload: Partial<ProjectSummaryItem>) => void;
  onSetSelection: (summaryId: string, itemId: string, isSelected: boolean) => void;
  onDeleteItem: (summaryId: string, itemId: string) => void;
  onSaveGeneratedPrompt: (payload: Omit<GeneratedPrompt, "id" | "created_at">) => void;
  onOpenSummary: () => void;
}) {
  const [summarySearch, setSummarySearch] = useState("");
  const [collapsedTopicIds, setCollapsedTopicIds] = useState<string[]>([]);
  const [promptScopeIds, setPromptScopeIds] = useState<string[]>([]);
  const [basePromptId, setBasePromptId] = useState("");
  const [selectedPromptOptions, setSelectedPromptOptions] = useState<string[]>(["Mais tecnico", "Formato Word"]);

  const summary = summaries.find((item) => item.id === block.config.summaryId) ?? summaries.find((item) => item.status === "active") ?? summaries[0] ?? null;
  const items = summary ? summaryItems.filter((item) => item.summary_id === summary.id).sort(byOrder) : [];
  const selectedItems = items.filter((item) => item.is_selected);
  const visibleItems = getVisibleSummaryItems(items, collapsedTopicIds, summarySearch);
  const summaryPrompts = summary ? generatedPrompts.filter((prompt) => prompt.summary_id === summary.id) : [];
  const promptCoveredItemIds = new Set(summaryPrompts.flatMap((prompt) => getGeneratedPromptItemIds(prompt)));
  const coveredSelectedCount = selectedItems.filter((item) => promptCoveredItemIds.has(item.id)).length;
  const summaryStatusOptions: SummaryItemStatus[] = ["pendente", "em_andamento", "desenvolvido", "em_revisao", "concluido", "bloqueado", "arquivado"];
  const completedSelectedCount = selectedItems.filter((item) => item.status === "concluido" || item.status === "desenvolvido").length;
  const reviewSelectedCount = selectedItems.filter((item) => item.status === "em_revisao").length;
  const blockedSelectedCount = selectedItems.filter((item) => item.status === "bloqueado").length;
  const selectedPromptItems = promptScopeIds.length ? items.filter((item) => promptScopeIds.includes(item.id)).sort(byOrder) : [];
  const basePrompt = tables.prompts.find((prompt) => prompt.id === basePromptId) ?? null;
  const finalPrompt = composeGeneratedPrompt({
    project,
    step: selectedStep,
    summary,
    item: selectedPromptItems[0] ?? selectedItems[0] ?? items[0] ?? null,
    items: selectedPromptItems,
    basePrompt,
    blocks: [],
    promptOptions: selectedPromptOptions,
  });
  const collapsibleIds = items.filter((item) => items.some((child) => child.parent_id === item.id)).map((item) => item.id);
  const allCollapsed = collapsibleIds.length > 0 && collapsibleIds.every((id) => collapsedTopicIds.includes(id));

  function toggleCollapsedTopic(itemId: string) {
    setCollapsedTopicIds((current) => (current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]));
  }

  function togglePromptScopeItem(itemId: string) {
    setPromptScopeIds((current) => (current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]));
  }

  function selectPromptScope(ids: string[]) {
    setPromptScopeIds([...new Set(ids)]);
  }

  function togglePromptOption(option: string) {
    setSelectedPromptOptions((current) => (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]));
  }

  function copyAndSavePrompt() {
    if (!summary || !finalPrompt.trim() || selectedPromptItems.length === 0) return;
    const summaryItemIds = selectedPromptItems.map((item) => item.id);
    void copyToClipboard(finalPrompt);
    onSaveGeneratedPrompt({
      project_id: project.id,
      summary_id: summary.id,
      summary_item_id: summaryItemIds[0] ?? null,
      base_prompt_id: basePrompt?.id ?? null,
      base_prompt_snapshot: basePrompt?.content ?? null,
      selected_blocks_json: JSON.stringify({ schemaVersion: 1, summaryItemIds, promptOptions: selectedPromptOptions, promptBlocks: [] }),
      final_prompt: finalPrompt,
      notes: summaryItemIds.length > 1 ? `${summaryItemIds.length} topicos selecionados` : selectedPromptItems[0] ? `Topico ${selectedPromptItems[0].topic_number} - ${selectedPromptItems[0].title}` : "Prompt geral do sumario",
      ai_tool_id: basePrompt?.ai_tool_id ?? null,
      created_by: currentUser?.name ?? null,
    });
  }

  if (!summary) {
    return (
      <div className="summary-operational-block empty-summary-operational">
        <div className="empty-state compact">
          <GitBranch size={28} />
          <strong>Nenhum sumario vinculado</strong>
          <span>Abra o editor para importar e selecionar a estrutura do sumario.</span>
          <button className="primary-button" type="button" onClick={onOpenSummary}>Editar sumario</button>
        </div>
      </div>
    );
  }

  return (
    <div className="summary-operational-block">
      <div className="summary-operational-head">
        <div>
          <strong>Versao {summary.version_number} - {summary.status === "active" ? "Ativo" : "Rascunho"}</strong>
          <span>{selectedItems.length}/{items.length} topicos selecionados · {coveredSelectedCount}/{selectedItems.length || 0} cobertos por prompt</span>
        </div>
        <div className="inline-actions">
          <button className="secondary-button" type="button" disabled={!summary.consolidated_text} onClick={() => copyToClipboard(summary.consolidated_text ?? "")}><Copy size={15} /> Copiar consolidado</button>
          <button className="primary-button" type="button" onClick={onOpenSummary}><GitBranch size={15} /> Editar estrutura</button>
        </div>
      </div>

      <div className="summary-operational-metrics" aria-label="Resumo operacional do sumario">
        <div><strong>{selectedItems.length}/{items.length}</strong><span>Selecionados</span></div>
        <div><strong>{completedSelectedCount}</strong><span>Finalizados</span></div>
        <div><strong>{reviewSelectedCount}</strong><span>Em revisao</span></div>
        <div><strong>{blockedSelectedCount}</strong><span>Bloqueados</span></div>
        <div><strong>{coveredSelectedCount}/{selectedItems.length || 0}</strong><span>Com prompt</span></div>
      </div>

      <div className="summary-operational-tools">
        <label className="summary-search-field">
          <Search size={15} />
          <input value={summarySearch} onChange={(event) => setSummarySearch(event.target.value)} placeholder="Buscar topico" />
        </label>
        <button className="secondary-button" type="button" onClick={() => setCollapsedTopicIds(allCollapsed ? [] : collapsibleIds)}>{allCollapsed ? "Expandir tudo" : "Recolher tudo"}</button>
        <button className="secondary-button" type="button" disabled={items.length === 0} onClick={() => selectPromptScope(items.map((item) => item.id))}>Sumario inteiro</button>
        <button className="secondary-button" type="button" disabled={promptScopeIds.length === 0} onClick={() => setPromptScopeIds([])}>Limpar selecao</button>
      </div>

      {promptScopeIds.length > 0 && (
        <div className="summary-floating-composer">
          <div><strong>{promptScopeIds.length} topico(s) selecionado(s)</strong><span>Configure e copie um prompt para estes itens.</span></div>
          <SelectField label="Prompt base" value={basePromptId} onChange={setBasePromptId} options={tables.prompts.filter((prompt) => prompt.status !== "arquivado").map((prompt) => ({ value: prompt.id, label: prompt.title }))} emptyLabel="Sem prompt base" />
          <div className="prompt-option-grid mini-options">
            {["Mais tecnico", "Mais direto", "Incluir tabelas", "Considerar legislacao", "Apontar pendencias", "Formato Word"].map((option) => (
              <label key={option}><input type="checkbox" checked={selectedPromptOptions.includes(option)} onChange={() => togglePromptOption(option)} /><span>{option}</span></label>
            ))}
          </div>
          <button className="primary-button" type="button" onClick={copyAndSavePrompt}><Copy size={15} /> Copiar e salvar prompt</button>
        </div>
      )}

      <div className="summary-operational-tree">
        {visibleItems.map((item) => {
          const childCount = items.filter((child) => child.parent_id === item.id).length;
          const branchIds = collectSummaryBranchIds(items, item.id);
          const isPromptScope = promptScopeIds.includes(item.id);
          const generatedForItem = summaryPrompts.filter((prompt) => getGeneratedPromptItemIds(prompt).includes(item.id));
          const coveredInBranch = branchIds.filter((id) => promptCoveredItemIds.has(id)).length;

          return (
            <article className={`summary-item tree-row operational-row level-${Math.min(item.level, 4)} ${item.is_selected ? "selected" : "excluded"} ${isPromptScope ? "prompt-scope" : ""}`} key={item.id} style={{ "--tree-level": Math.max(0, item.level - 1) } as CSSProperties}>
              <button className="summary-expand-button" disabled={childCount === 0} onClick={() => toggleCollapsedTopic(item.id)} title={collapsedTopicIds.includes(item.id) ? "Expandir topico" : "Recolher topico"}>{childCount > 0 ? (collapsedTopicIds.includes(item.id) ? "+" : "-") : ""}</button>
              <button className={`checkbox ${item.is_selected ? "checked" : ""}`} onClick={() => onSetSelection(summary.id, item.id, !item.is_selected)} title="Entrar no sumario consolidado">{item.is_selected && <Check size={14} />}</button>
              <span className="summary-topic-number">{item.topic_number}</span>
              <div className="summary-item-main">
                <InlineText defaultValue={item.title} className="summary-title-input" onSave={(value) => onUpdateItem(item.id, { title: value })} />
                <div className="summary-item-controls compact-topic-meta">
                  <span className={`summary-status-dot ${item.status}`} title={formatStatus(item.status)} />
                  <select className={`summary-status-select ${item.status}`} value={item.status} onChange={(event) => onUpdateItem(item.id, { status: event.target.value as SummaryItemStatus })} title="Status do topico">
                    {summaryStatusOptions.map((status) => <option value={status} key={status}>{formatStatus(status)}</option>)}
                  </select>
                  {childCount > 0 && <span className="summary-mini-chip">{childCount} sub</span>}
                  {coveredInBranch > 0 && <span className="summary-mini-chip covered">{coveredInBranch}/{branchIds.length} prompt</span>}
                  {generatedForItem.map((prompt) => <button className="summary-copy-chip" key={prompt.id} onClick={() => copyToClipboard(prompt.final_prompt)}><Copy size={13} /> Prompt</button>)}
                </div>
              </div>
              <button className={`icon-button subtle prompt-pick-button ${isPromptScope ? "active" : ""}`} title="Marcar topico para prompt" onClick={() => togglePromptScopeItem(item.id)}><Sparkles size={15} /></button>
              <button className="icon-button subtle" title="Usar ramo para prompt" onClick={() => selectPromptScope(branchIds)}><GitBranch size={15} /></button>
              <button className="icon-button subtle operational-danger-action" title="Excluir topico" onClick={() => onDeleteItem(summary.id, item.id)}><Trash2 size={15} /></button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
function PhaseBlock({ block, onUpdate }: { block: StepBuilderBlock; onUpdate: (patch: Partial<StepBuilderBlock>) => void }) {
  return (
    <div className="phase-block-body">
      <SelectField label="Status da fase" value={String(block.config.status ?? "pendente")} onChange={(status) => onUpdate({ config: { status } })} options={["pendente", "em_andamento", "concluido", "bloqueado"].map((status) => ({ value: status, label: formatStepStatus(status as StepStatus) }))} />
      <textarea value={String(block.config.content ?? "")} placeholder="Descreva a fase" onChange={(event) => onUpdate({ config: { content: event.target.value } })} />
      <label className="checkline"><input type="checkbox" checked={Boolean(block.config.requiresPreviousPhase)} onChange={(event) => onUpdate({ config: { requiresPreviousPhase: event.target.checked } })} /> Exigir fase anterior concluida</label>
    </div>
  );
}

function ChecklistBlock({ block, value, onSaveValue, onUpdate }: { block: StepBuilderBlock; value: any; onSaveValue: (value: unknown) => void; onUpdate: (patch: Partial<StepBuilderBlock>) => void }) {
  const [newItem, setNewItem] = useState("");
  const items = Array.isArray(block.config.items) ? block.config.items as Array<any> : [];
  const checked = value?.checked ?? Object.fromEntries(items.map((item) => [item.id, Boolean(item.done)]));
  const setChecked = (itemId: string, done: boolean) => onSaveValue({ checked: { ...checked, [itemId]: done } });
  const addItem = () => {
    if (!newItem.trim()) return;
    onUpdate({ config: { items: [...items, { id: crypto.randomUUID(), label: newItem.trim(), order: items.length + 1, required: true, requiresFile: false, acceptedFileTypes: [] }] } });
    setNewItem("");
  };
  const removeItem = (itemId: string) => onUpdate({ config: { items: items.filter((item) => item.id !== itemId) } });
  return (
    <div className="checklist-block-body">
      {items.map((item) => (
        <label key={item.id} className="check-item-row"><input type="checkbox" checked={Boolean(checked[item.id])} onChange={(event) => setChecked(item.id, event.target.checked)} /><span>{item.label}</span><button className="icon-button danger" type="button" onClick={() => removeItem(item.id)}><Trash2 size={13} /></button></label>
      ))}
      <div className="inline-form"><input value={newItem} onChange={(event) => setNewItem(event.target.value)} placeholder="Novo item" /><button className="secondary-button" type="button" onClick={addItem}><Plus size={15} /> Item</button></div>
    </div>
  );
}

function MaterialsBlock({ block, onUpdate }: { block: StepBuilderBlock; onUpdate: (patch: Partial<StepBuilderBlock>) => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const links = Array.isArray(block.config.links) ? block.config.links as Array<any> : [];
  const add = () => {
    if (!title.trim() || !url.trim()) return;
    onUpdate({ config: { links: [...links, { id: crypto.randomUUID(), title: title.trim(), url: url.trim() }] } });
    setTitle("");
    setUrl("");
  };
  return (
    <div className="materials-block-body">
      {links.map((link) => <div className="material-row" key={link.id}><a href={link.url} target="_blank" rel="noreferrer">{link.title}</a><button className="icon-button danger" onClick={() => onUpdate({ config: { links: links.filter((item) => item.id !== link.id) } })}><Trash2 size={13} /></button></div>)}
      <div className="inline-form"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Nome" /><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" /><button className="secondary-button" type="button" onClick={add}><Plus size={15} /> Link</button></div>
    </div>
  );
}

function ContextBlock({ block, onUpdate }: { block: StepBuilderBlock; onUpdate: (patch: Partial<StepBuilderBlock>) => void }) {
  const contextColors = ["mint", "teal", "amber", "blue", "rose", "slate"];
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftColor, setDraftColor] = useState("mint");
  const [draftPinned, setDraftPinned] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  type ContextCard = { id: string; title: string; content: string; color?: string; pinned?: boolean };
  const rawContexts = Array.isArray(block.config.contexts) ? block.config.contexts as ContextCard[] : [];
  const legacyContent = String(block.config.content ?? "");
  const contexts = rawContexts.length > 0
    ? rawContexts
    : legacyContent.trim()
      ? [{ id: "legacy-context", title: block.title || "Contexto", content: legacyContent, color: "mint", pinned: false }]
      : [];
  const isWriting = editingId !== null;

  function resetForm() {
    setEditingId(null);
    setDraftTitle("");
    setDraftContent("");
    setDraftColor("mint");
    setDraftPinned(false);
  }

  function startNew() {
    setEditingId("new");
    setDraftTitle("");
    setDraftContent("");
    setDraftColor(contextColors[contexts.length % contextColors.length]);
    setDraftPinned(false);
  }

  function startEdit(item: ContextCard) {
    setEditingId(item.id);
    setDraftTitle(item.title);
    setDraftContent(item.content);
    setDraftColor(item.color || "mint");
    setDraftPinned(Boolean(item.pinned));
  }

  function saveContext() {
    if (!draftTitle.trim() && !draftContent.trim()) return;
    const normalizedContexts = contexts.map((item) => ({ ...item, id: item.id === "legacy-context" ? crypto.randomUUID() : item.id }));
    const nextItem: ContextCard = {
      id: editingId && editingId !== "new" && editingId !== "legacy-context" ? editingId : crypto.randomUUID(),
      title: draftTitle.trim() || "Contexto sem titulo",
      content: draftContent.trim(),
      color: draftColor,
      pinned: draftPinned,
    };
    const next = editingId && editingId !== "new"
      ? normalizedContexts.map((item) => item.id === editingId || (editingId === "legacy-context" && item.content === legacyContent) ? nextItem : item)
      : [...normalizedContexts, nextItem];
    onUpdate({ config: { contexts: next, content: "" } });
    resetForm();
  }

  function patchContext(itemId: string, patch: Partial<ContextCard>) {
    const normalizedContexts = contexts.map((item) => ({ ...item, id: item.id === "legacy-context" ? crypto.randomUUID() : item.id }));
    onUpdate({ config: { contexts: normalizedContexts.map((item) => item.id === itemId || (itemId === "legacy-context" && item.content === legacyContent) ? { ...item, ...patch } : item), content: "" } });
  }

  function removeContext(itemId: string) {
    const next = contexts.filter((item) => item.id !== itemId);
    onUpdate({ config: { contexts: next, content: "" } });
    if (editingId === itemId) resetForm();
  }

  return (
    <div className="context-library compact-context-library">
      <div className="context-library-head">
        <span>{contexts.length ? `${contexts.length} contexto(s)` : "Nenhum contexto salvo neste bloco"}</span>
        <button className="secondary-button" type="button" onClick={startNew}><Plus size={15} /> Adicionar contexto</button>
      </div>

      {isWriting && (
        <div className="context-compose compact-context-compose">
          <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Titulo do contexto" />
          <textarea value={draftContent} onChange={(event) => setDraftContent(event.target.value)} placeholder="Cole aqui o contexto" rows={5} />
          <div className="context-form-row">
            <div className="context-color-picker">
              {contextColors.map((color) => <button key={color} type="button" className={`context-color-dot ${color} ${draftColor === color ? "active" : ""}`} onClick={() => setDraftColor(color)} />)}
            </div>
            <label className="checkline"><input type="checkbox" checked={draftPinned} onChange={(event) => setDraftPinned(event.target.checked)} /> Salvar este contexto no template</label>
          </div>
          <div className="inline-actions">
            <button className="primary-button" type="button" onClick={saveContext}><Save size={15} /> Salvar contexto</button>
            <button className="secondary-button" type="button" onClick={resetForm}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="context-card-grid compact-context-grid">
        {contexts.map((item) => (
          <article className={`context-mini-card compact-context-card ${item.color || "mint"} ${item.pinned ? "pinned" : ""}`} key={item.id} onClick={() => copyToClipboard(item.content)} title="Clique para copiar o contexto">
            <strong>{item.title}</strong>
            {item.pinned && <span className="context-pin-label">Template</span>}
            <div className="context-mini-actions" onClick={(event) => event.stopPropagation()}>
              <button className={`icon-button ${item.pinned ? "active" : ""}`} type="button" title="Salvar no template" onClick={() => patchContext(item.id, { pinned: !item.pinned })}><Save size={14} /></button>
              <button className="icon-button" type="button" title="Copiar contexto" onClick={() => copyToClipboard(item.content)}><Copy size={14} /></button>
              <button className="icon-button" type="button" title="Editar contexto" onClick={() => startEdit(item)}><Pencil size={14} /></button>
              <button className="icon-button danger" type="button" title="Excluir contexto" onClick={() => removeContext(item.id)}><Trash2 size={14} /></button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function blockTypeText(type: string) {
  return blockCatalog.find((item) => item.type === type)?.label ?? type;
}

async function copyToClipboard(value: string) {
  if (!value.trim()) return;
  await navigator.clipboard.writeText(value);
}

function ProjectSummaryPanel({
  project,
  selectedStep,
  summaries,
  items,
  promptBlocks,
  generatedPrompts,
  tables,
  currentUser,
  onImport,
  onUpdateItem,
  onSetSelection,
  onAddItem,
  onDeleteItem,
  onConsolidate,
  onSaveGeneratedPrompt,
}: {
  project: Project;
  selectedStep: ProjectStep;
  summaries: ProjectSummary[];
  items: ProjectSummaryItem[];
  promptBlocks: PromptBlock[];
  generatedPrompts: GeneratedPrompt[];
  tables: Tables;
  currentUser: AppUser | null;
  onImport: (project: Project, rawText: string) => void;
  onUpdateItem: (itemId: string, payload: Partial<ProjectSummaryItem>) => void;
  onSetSelection: (summaryId: string, itemId: string, isSelected: boolean) => void;
  onAddItem: (summaryId: string, parentId: string, title: string) => void;
  onDeleteItem: (summaryId: string, itemId: string) => void;
  onConsolidate: (summaryId: string) => Promise<ProjectSummary | null>;
  onSaveGeneratedPrompt: (payload: Omit<GeneratedPrompt, "id" | "created_at">) => void;
}) {
  const promptOptionChoices = [
    "Mais tecnico",
    "Mais direto",
    "Incluir tabelas",
    "Considerar legislacao",
    "Apontar pendencias",
    "Formato Word",
  ];
  const [rawText, setRawText] = useState("");
  const [summaryId, setSummaryId] = useState("");
  const [summarySearch, setSummarySearch] = useState("");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [promptScopeIds, setPromptScopeIds] = useState<string[]>([]);
  const [collapsedTopicIds, setCollapsedTopicIds] = useState<string[]>([]);
  const [basePromptId, setBasePromptId] = useState("");
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [selectedPromptOptions, setSelectedPromptOptions] = useState<string[]>(["Mais tecnico", "Formato Word"]);

  const sortedSummaries = useMemo(
    () => [...summaries].sort((left, right) => right.version_number - left.version_number),
    [summaries],
  );

  useEffect(() => {
    if (!summaryId && sortedSummaries[0]) {
      setSummaryId(sortedSummaries[0].id);
      return;
    }

    if (summaryId && !sortedSummaries.some((summary) => summary.id === summaryId)) {
      setSummaryId(sortedSummaries[0]?.id ?? "");
    }
  }, [summaryId, sortedSummaries]);

  const activeSummary = sortedSummaries.find((summary) => summary.id === summaryId) ?? sortedSummaries[0] ?? null;
  const summaryItems = activeSummary ? items.filter((item) => item.summary_id === activeSummary.id).sort(byOrder) : [];
  const selectedItems = summaryItems.filter((item) => item.is_selected);
  const selectedItem = summaryItems.find((item) => item.id === selectedItemId) ?? selectedItems[0] ?? summaryItems[0] ?? null;
  const visibleSummaryItems = getVisibleSummaryItems(summaryItems, collapsedTopicIds, summarySearch);
  const promptScopeItems = promptScopeIds.length
    ? summaryItems.filter((item) => promptScopeIds.includes(item.id)).sort(byOrder)
    : selectedItem
      ? [selectedItem]
      : [];
  const summaryPrompts = activeSummary ? generatedPrompts.filter((prompt) => prompt.summary_id === activeSummary.id) : [];
  const promptCoveredItemIds = new Set(summaryPrompts.flatMap((prompt) => getGeneratedPromptItemIds(prompt)));
  const coveredSelectedCount = selectedItems.filter((item) => promptCoveredItemIds.has(item.id)).length;
  const selectionPercent = summaryItems.length ? Math.round((selectedItems.length / summaryItems.length) * 100) : 0;
  const promptPercent = selectedItems.length ? Math.round((coveredSelectedCount / selectedItems.length) * 100) : 0;
  const basePrompt = tables.prompts.find((prompt) => prompt.id === basePromptId) ?? null;
  const relevantBlocks = promptBlocks.filter((block) => {
    if (block.status !== "ativo") return false;
    if (block.project_type_id && block.project_type_id !== project.project_type_id) return false;
    if (block.journey_step_id && block.journey_step_id !== selectedStep.source_journey_step_id) return false;
    return true;
  });
  const selectedBlocks = relevantBlocks.filter((block) => selectedBlockIds.includes(block.id));
  const finalPrompt = composeGeneratedPrompt({
    project,
    step: selectedStep,
    summary: activeSummary,
    item: selectedItem,
    items: promptScopeItems,
    basePrompt,
    blocks: selectedBlocks,
    promptOptions: selectedPromptOptions,
  });
  const generatedCount = summaryPrompts.length;
  const branchIds = selectedItem ? collectSummaryBranchIds(summaryItems, selectedItem.id) : [];
  const branchTopics = selectedItem ? summaryItems.filter((item) => branchIds.includes(item.id)) : [];
  const collapsibleIds = summaryItems.filter((item) => summaryItems.some((child) => child.parent_id === item.id)).map((item) => item.id);
  const allCollapsed = collapsibleIds.length > 0 && collapsibleIds.every((id) => collapsedTopicIds.includes(id));

  function toggleBlock(blockId: string) {
    setSelectedBlockIds((current) => (current.includes(blockId) ? current.filter((id) => id !== blockId) : [...current, blockId]));
  }

  function togglePromptOption(option: string) {
    setSelectedPromptOptions((current) => (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]));
  }

  function toggleCollapsedTopic(itemId: string) {
    setCollapsedTopicIds((current) => (current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]));
  }

  function togglePromptScopeItem(itemId: string) {
    setPromptScopeIds((current) => (current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]));
    setSelectedItemId(itemId);
  }

  function selectPromptScope(ids: string[]) {
    setPromptScopeIds([...new Set(ids)]);
    setSelectedItemId(ids[0] ?? "");
  }

  async function handleConsolidateActiveSummary() {
    if (!activeSummary) return;
    const nextSummary = await onConsolidate(activeSummary.id);
    if (nextSummary?.id) {
      setSummaryId(nextSummary.id);
      setPromptScopeIds([]);
      setCollapsedTopicIds([]);
      setSummarySearch("");
    }
  }

  function savePromptHistory() {
    if (!activeSummary || !finalPrompt.trim()) {
      return;
    }

    const summaryItemIds = promptScopeItems.map((item) => item.id);

    onSaveGeneratedPrompt({
      project_id: project.id,
      summary_id: activeSummary.id,
      summary_item_id: summaryItemIds[0] ?? selectedItem?.id ?? null,
      base_prompt_id: basePrompt?.id ?? null,
      base_prompt_snapshot: basePrompt?.content ?? null,
      selected_blocks_json: JSON.stringify({
        schemaVersion: 1,
        summaryItemIds,
        promptOptions: selectedPromptOptions,
        promptBlocks: selectedBlocks.map((block) => ({ id: block.id, title: block.title, content: block.content })),
      }),
      final_prompt: finalPrompt,
      notes: summaryItemIds.length > 1 ? `${summaryItemIds.length} topicos selecionados` : selectedItem ? `Topico ${selectedItem.topic_number} - ${selectedItem.title}` : "Prompt geral do sumario",
      ai_tool_id: basePrompt?.ai_tool_id ?? selectedBlocks.find((block) => block.ai_tool_id)?.ai_tool_id ?? null,
      created_by: currentUser?.name ?? null,
    });
  }

  return (
    <section className="work-block summary-panel compact-summary-panel">
      <div className="block-heading summary-heading">
        <div>
          <h2>Sumario inteligente</h2>
          <span className="pending-summary">
            {activeSummary ? `${selectedItems.length}/${summaryItems.length} topicos selecionados - ${generatedCount} prompts salvos` : "Importe ou cole o sumario do projeto"}
          </span>
        </div>
        {activeSummary && (
          <div className="summary-heading-actions">
            <button className="secondary-button" disabled={!activeSummary.consolidated_text} onClick={() => copyToClipboard(activeSummary.consolidated_text ?? "")}>
              <Copy size={16} />
              Copiar consolidado
            </button>
            <button className="secondary-button" onClick={() => void handleConsolidateActiveSummary()} disabled={selectedItems.length === 0}>
              <CheckCircle2 size={16} />
              Consolidar sumario
            </button>
          </div>
        )}
      </div>

      <details className="summary-import-drawer glass-panel">
        <summary>
          <span>Importar ou analisar sumario bruto</span>
          <small>Abra apenas quando precisar colar uma nova estrutura numerada.</small>
        </summary>
        <div className="summary-import-grid">
          <label className="field">
            <span>Colar sumario bruto</span>
            <textarea rows={7} value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="Cole aqui uma estrutura numerada: 1, 1.1, 1.1.1..." />
          </label>
          <div className="summary-import-actions">
            <button
              className="primary-button"
              disabled={!rawText.trim()}
              onClick={() => {
                onImport(project, rawText);
                setRawText("");
              }}
            >
              <Sparkles size={16} />
              Analisar sumario
            </button>
            <p>O sistema separa os topicos numerados, monta a arvore e permite consolidar sem os itens desmarcados.</p>
          </div>
        </div>
      </details>

      {activeSummary ? (
        <div className="summary-workspace summary-workspace-compact">
          <div className="summary-review-card summary-tree-card">
            <div className="summary-toolbar compact-tree-toolbar">
              <SelectField
                label="Versao"
                value={activeSummary.id}
                onChange={setSummaryId}
                options={sortedSummaries.map((summary) => ({ value: summary.id, label: `Versao ${summary.version_number} - ${formatStatus(summary.status)}` }))}
              />
              <div className="summary-meta">
                <StatusPill status={activeSummary.status} />
                <span>{formatSummaryParseStatus(activeSummary.parse_status)}</span>
              </div>
            </div>

            <div className="summary-progress-grid">
              <div>
                <span>Selecao do sumario</span>
                <strong>{selectedItems.length}/{summaryItems.length}</strong>
                <div className="summary-progress-track"><i style={{ width: `${selectionPercent}%` }} /></div>
              </div>
              <div>
                <span>Prompts cobertos</span>
                <strong>{coveredSelectedCount}/{selectedItems.length}</strong>
                <div className="summary-progress-track"><i style={{ width: `${promptPercent}%` }} /></div>
              </div>
            </div>

            <div className="summary-compact-actions">
              <label className="summary-search-field">
                <Search size={15} />
                <input value={summarySearch} onChange={(event) => setSummarySearch(event.target.value)} placeholder="Buscar topico" />
              </label>
              <button className="secondary-button" onClick={() => setCollapsedTopicIds(allCollapsed ? [] : collapsibleIds)}>
                {allCollapsed ? "Expandir tudo" : "Recolher tudo"}
              </button>
              <button className="secondary-button" disabled={!selectedItem} onClick={() => selectPromptScope(branchIds)}>
                Ramo no prompt
              </button>
              <button className="secondary-button" disabled={promptScopeIds.length === 0} onClick={() => setPromptScopeIds([])}>
                Limpar prompt
              </button>
              <button className="secondary-button" disabled={summaryItems.length === 0} onClick={() => selectPromptScope(summaryItems.map((item) => item.id))}>
                Sumario inteiro
              </button>
            </div>

            <div className="summary-item-list compact-tree-list">
              {visibleSummaryItems.map((item) => {
                const childCount = summaryItems.filter((child) => child.parent_id === item.id).length;
                const itemBranchIds = collectSummaryBranchIds(summaryItems, item.id);
                const isPromptScope = promptScopeIds.includes(item.id);
                const generatedForItem = summaryPrompts.filter((prompt) => getGeneratedPromptItemIds(prompt).includes(item.id));
                const coveredInBranch = itemBranchIds.filter((id) => promptCoveredItemIds.has(id)).length;

                return (
                  <article className={`summary-item tree-row level-${Math.min(item.level, 4)} ${item.is_selected ? "selected" : "excluded"} ${selectedItem?.id === item.id ? "active-row" : ""} ${isPromptScope ? "prompt-scope" : ""}`} key={item.id} style={{ "--tree-level": Math.max(0, item.level - 1) } as CSSProperties}>
                    <button className="summary-expand-button" disabled={childCount === 0} onClick={() => toggleCollapsedTopic(item.id)} title={collapsedTopicIds.includes(item.id) ? "Expandir topico" : "Recolher topico"}>
                      {childCount > 0 ? (collapsedTopicIds.includes(item.id) ? "+" : "-") : ""}
                    </button>
                    <button className={`checkbox ${item.is_selected ? "checked" : ""}`} onClick={() => onSetSelection(activeSummary.id, item.id, !item.is_selected)} title="Entrar no sumario consolidado">
                      {item.is_selected && <Check size={14} />}
                    </button>
                    <button className={`summary-topic-button ${selectedItem?.id === item.id ? "active" : ""}`} onClick={() => setSelectedItemId(item.id)}>
                      <strong>{item.topic_number}</strong>
                    </button>
                    <div className="summary-item-main">
                      <InlineText defaultValue={item.title} className="summary-title-input" onSave={(value) => onUpdateItem(item.id, { title: value })} />
                      <div className="summary-item-controls compact-topic-meta">
                        <span className={`summary-status-dot ${item.status}`} title={formatStatus(item.status)} />
                        {childCount > 0 && <span className="summary-mini-chip">{childCount} sub</span>}
                        {coveredInBranch > 0 && <span className="summary-mini-chip covered">{coveredInBranch}/{itemBranchIds.length} prompt</span>}
                        {item.notes && <span className="summary-note-indicator" title={item.notes}>nota</span>}
                        {item.parse_warning && <span className="summary-warning">{item.parse_warning}</span>}
                        {generatedForItem.map((prompt) => (
                          <button className="summary-copy-chip" key={prompt.id} onClick={() => copyToClipboard(prompt.final_prompt)} title={prompt.notes ?? "Copiar prompt salvo"}>
                            <Copy size={13} />
                            Prompt
                          </button>
                        ))}
                      </div>
                    </div>
                    <button className={`icon-button subtle prompt-pick-button ${isPromptScope ? "active" : ""}`} title="Marcar topico para prompt" onClick={() => togglePromptScopeItem(item.id)}>
                      <Sparkles size={15} />
                    </button>
                    <button className="icon-button subtle" title="Usar este ramo para prompt" onClick={() => selectPromptScope(itemBranchIds)}>
                      <GitBranch size={15} />
                    </button>
                    <button className="icon-button subtle" title="Excluir topico" onClick={() => onDeleteItem(activeSummary.id, item.id)}>
                      <Trash2 size={15} />
                    </button>
                  </article>
                );
              })}
            </div>

            <div className="summary-add-row compact-add-row">
              <SelectField label="Dentro de" value={newParentId} onChange={setNewParentId} options={summaryItems.map((item) => ({ value: item.id, label: `${item.topic_number} ${item.title}` }))} emptyLabel="Topico raiz" />
              <Field label="Novo topico" value={newItemTitle} onChange={setNewItemTitle} />
              <button
                className="secondary-button"
                disabled={!newItemTitle.trim()}
                onClick={() => {
                  onAddItem(activeSummary.id, newParentId, newItemTitle);
                  setNewItemTitle("");
                  setNewParentId("");
                }}
              >
                <Plus size={16} />
                Adicionar
              </button>
            </div>
          </div>

          <details className="summary-prompt-card compact-prompt-card compact-composer" open={promptScopeItems.length > 0}>
            <summary>
              <strong>Compor prompt</strong>
              <span>{promptScopeItems.length ? `${promptScopeItems.length} item(ns) na selecao` : "Selecione topicos na arvore"}</span>
            </summary>
            <div className="prompt-scope-strip">
              {promptScopeItems.slice(0, 8).map((item) => <button key={item.id} onClick={() => togglePromptScopeItem(item.id)}>{item.topic_number}</button>)}
              {promptScopeItems.length > 8 && <span>+{promptScopeItems.length - 8}</span>}
              {promptScopeItems.length === 0 && <small>Nenhum topico separado para prompt.</small>}
            </div>
            <SelectField label="Prompt base" value={basePromptId} onChange={setBasePromptId} options={tables.prompts.filter((prompt) => prompt.status !== "arquivado").map((prompt) => ({ value: prompt.id, label: prompt.title }))} emptyLabel="Sem prompt base" />
            <div className="prompt-option-grid">
              {promptOptionChoices.map((option) => (
                <label key={option}>
                  <input type="checkbox" checked={selectedPromptOptions.includes(option)} onChange={() => togglePromptOption(option)} />
                  <span>{option}</span>
                </label>
              ))}
            </div>
            <div className="prompt-block-picker">
              <span>Complementos</span>
              {relevantBlocks.map((block) => (
                <label key={block.id} className="summary-block-option">
                  <input type="checkbox" checked={selectedBlockIds.includes(block.id)} onChange={() => toggleBlock(block.id)} />
                  <span>{block.title}</span>
                </label>
              ))}
              {relevantBlocks.length === 0 && <small>Nenhum complemento ativo para este tipo de projeto/etapa.</small>}
            </div>
            <details className="prompt-preview-drawer">
              <summary>Ver prompt gerado</summary>
              <textarea className="prompt-preview" rows={8} value={finalPrompt} readOnly />
            </details>
            <div className="row-actions prompt-builder-actions">
              <button disabled={!promptScopeItems.length || !finalPrompt.trim()} onClick={() => { void copyText(finalPrompt); savePromptHistory(); }}>
                <Copy size={16} />
                Copiar e salvar
              </button>
              <button disabled={branchTopics.length === 0} onClick={() => selectPromptScope(branchIds)}>
                <GitBranch size={16} />
                Ramo atual
              </button>
            </div>
          </details>
        </div>
      ) : (
        <div className="empty-state compact">
          <Clipboard size={30} />
          <strong>Nenhum sumario importado</strong>
          <span>Cole o sumario do projeto para revisar topicos e gerar prompts por item.</span>
        </div>
      )}
    </section>
  );
}

function getVisibleSummaryItems(items: ProjectSummaryItem[], collapsedIds: string[], searchTerm = "") {
  const collapsed = new Set(collapsedIds);
  const byId = new Map(items.map((item) => [item.id, item]));
  const query = normalizeSearchText(searchTerm);
  const allowedIds = new Set<string>();

  if (query) {
    const addAncestors = (item: ProjectSummaryItem) => {
      allowedIds.add(item.id);
      let parentId = item.parent_id;

      while (parentId) {
        allowedIds.add(parentId);
        parentId = byId.get(parentId)?.parent_id ?? null;
      }
    };
    const addDescendants = (itemId: string) => {
      items.filter((item) => item.parent_id === itemId).forEach((child) => {
        allowedIds.add(child.id);
        addDescendants(child.id);
      });
    };

    items.forEach((item) => {
      const haystack = normalizeSearchText(`${item.topic_number} ${item.title}`);
      if (haystack.includes(query)) {
        addAncestors(item);
        addDescendants(item.id);
      }
    });
  }

  return items.filter((item) => {
    if (query) return allowedIds.has(item.id);

    let parentId = item.parent_id;
    while (parentId) {
      if (collapsed.has(parentId)) return false;
      parentId = byId.get(parentId)?.parent_id ?? null;
    }

    return true;
  });
}

function collectSummaryBranchIds(items: ProjectSummaryItem[], itemId: string) {
  const ids = new Set<string>([itemId]);
  let changed = true;

  while (changed) {
    changed = false;
    items.forEach((item) => {
      if (item.parent_id && ids.has(item.parent_id) && !ids.has(item.id)) {
        ids.add(item.id);
        changed = true;
      }
    });
  }

  return [...ids];
}

function getGeneratedPromptItemIds(prompt: GeneratedPrompt) {
  const ids = new Set<string>();
  if (prompt.summary_item_id) ids.add(prompt.summary_item_id);

  try {
    const parsed = prompt.selected_blocks_json ? JSON.parse(prompt.selected_blocks_json) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const maybeIds = (parsed as { summaryItemIds?: unknown; selectedItemIds?: unknown }).summaryItemIds ?? (parsed as { selectedItemIds?: unknown }).selectedItemIds;
      if (Array.isArray(maybeIds)) {
        maybeIds.forEach((id) => {
          if (typeof id === "string") ids.add(id);
        });
      }
    }
  } catch {
    // Old saved prompts can contain plain block arrays. Keep the direct summary_item_id fallback.
  }

  return [...ids];
}

function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function FileUploadButton({ onUpload }: { onUpload: (file: File) => void }) {
  return (
    <label className="icon-button file-upload-button" title="Enviar arquivo">
      <Upload size={16} />
      <input
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (file) {
            onUpload(file);
            event.currentTarget.value = "";
          }
        }}
      />
    </label>
  );
}

function UserEntryScreen({
  users,
  isLoading,
  notice,
  tableErrors,
  onSelect,
  onCreate,
  onRefresh,
}: {
  users: AppUser[];
  isLoading: boolean;
  notice: string;
  tableErrors: string[];
  onSelect: (userId: string) => void;
  onCreate: (name: string) => void;
  onRefresh: () => void;
}) {
  const [name, setName] = useState("");

  return (
    <main className="user-entry">
      <section className="user-entry-panel">
        <div className="brand">
          <span className="brand-mark">
            <Sparkles size={20} />
          </span>
          <span>Ramos Jornadas</span>
        </div>

        <div className="user-entry-heading">
          <h1>Escolha o usuario</h1>
          <p>Entrada simples para identificar quem esta usando o painel nesta fase.</p>
        </div>

        <div className="user-list">
          {users.map((user) => (
            <button className="user-card" key={user.id} onClick={() => onSelect(user.id)}>
              <span>{getInitials(user.name)}</span>
              <strong>{user.name}</strong>
            </button>
          ))}
          {users.length === 0 && <span className="muted">Nenhum usuario ativo encontrado.</span>}
        </div>

        <form
          className="user-create"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate(name);
            setName("");
          }}
        >
          <Field label="Novo usuario" value={name} onChange={setName} />
          <button className="primary-button" type="submit" disabled={!name.trim() || isLoading}>
            <Plus size={16} />
            Criar e entrar
          </button>
        </form>

        <div className="entry-footer">
          <span>{notice}</span>
          {tableErrors.length > 0 && <span className="table-error-count">{tableErrors.length} pendencia(s)</span>}
          <button className="ghost-button" onClick={onRefresh}>
            <RefreshCw size={16} />
            Sincronizar
          </button>
        </div>
      </section>
    </main>
  );
}

function ChecklistPanel({
  items,
  onAdd,
  onToggle,
  onDelete,
}: {
  items: ProjectChecklistItem[];
  onAdd: (label: string) => void;
  onToggle: (item: ProjectChecklistItem) => void;
  onDelete: (id: string) => void;
}) {
  const [label, setLabel] = useState("");

  return (
    <section className="work-block">
      <div className="block-heading">
        <h2>Checklist</h2>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd(label);
            setLabel("");
          }}
        >
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Adicionar item" />
          <button className="icon-button" type="submit">
            <Plus size={16} />
          </button>
        </form>
      </div>

      <div className="checklist">
        {items.map((item) => (
          <div className="check-row" key={item.id}>
            <button className={`checkbox ${item.is_done ? "checked" : ""}`} onClick={() => onToggle(item)}>
              {item.is_done && <Check size={14} />}
            </button>
            <span>{item.label}</span>
            <button className="icon-button subtle" onClick={() => onDelete(item.id)}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {items.length === 0 && <span className="muted">Nenhum checklist nesta etapa.</span>}
      </div>
    </section>
  );
}

function PromptsPanel({
  tables,
  prompts,
  stepId,
  onAddExisting,
  onAddLocal,
  onDelete,
}: {
  tables: Tables;
  prompts: ProjectStepPrompt[];
  stepId: string;
  onAddExisting: (stepId: string, promptId: string) => void;
  onAddLocal: (stepId: string, title: string, content: string, aiToolId: string) => void;
  onDelete: (id: string) => void;
}) {
  const [promptId, setPromptId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [aiToolId, setAiToolId] = useState("");
  const pendingCount = prompts.filter((prompt) => prompt.prompt_status === "pendente" || !prompt.content.trim()).length;

  return (
    <section className="work-block">
      <div className="block-heading">
        <div>
          <h2>Prompts da etapa</h2>
          {pendingCount > 0 && <span className="pending-summary">{pendingCount} prompt(s) pendente(s) de preenchimento</span>}
        </div>
        <div className="inline-form">
          <select value={promptId} onChange={(event) => setPromptId(event.target.value)}>
            <option value="">Buscar na biblioteca</option>
            {tables.prompts.map((prompt) => (
              <option key={prompt.id} value={prompt.id}>
                {prompt.title}
              </option>
            ))}
          </select>
          <button className="icon-button" onClick={() => { onAddExisting(stepId, promptId); setPromptId(""); }}>
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="prompt-list">
        {prompts.map((prompt) => (
          <article className={`prompt-card ${prompt.prompt_status === "pendente" || !prompt.content.trim() ? "pending" : ""}`} key={prompt.id}>
            <div>
              <div className="prompt-card-title">
                <strong>{prompt.title}</strong>
                <span className={`prompt-status ${prompt.prompt_status}`}>{formatPromptStatus(prompt.prompt_status, prompt.content)}</span>
              </div>
              <span>{findName(tables.ai_tools, prompt.ai_tool_id) || "Ferramenta livre"}</span>
            </div>
            {prompt.content.trim() ? (
              <pre>{prompt.content}</pre>
            ) : (
              <div className="prompt-placeholder">
                <strong>Falta preencher este prompt.</strong>
                <span>{prompt.placeholder_note || "Edite este prompt na etapa ou em Configuracoes antes de usar."}</span>
              </div>
            )}
            <div className="row-actions">
              <button disabled={!prompt.content.trim()} onClick={() => void copyText(prompt.content)}>
                <Copy size={16} />
              </button>
              <button onClick={() => onDelete(prompt.id)}>
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="local-prompt-form">
        <Field label="Prompt rapido da etapa" value={title} onChange={setTitle} />
        <SelectField label="Ferramenta" value={aiToolId} onChange={setAiToolId} options={tables.ai_tools.map(toOption)} />
        <TextArea label="Conteudo" value={content} onChange={setContent} rows={5} />
        <button
          className="secondary-button"
          onClick={() => {
            onAddLocal(stepId, title, content, aiToolId);
            setTitle("");
            setContent("");
            setAiToolId("");
          }}
        >
          <Plus size={16} />
          Adicionar prompt local
        </button>
      </div>
    </section>
  );
}

function PhasePanel({
  phases,
  onAdd,
  onUpdate,
  onDelete,
}: {
  phases: ProjectStepPhase[];
  onAdd: (title: string) => void;
  onUpdate: (phaseId: string, payload: Partial<ProjectStepPhase>) => void;
  onDelete: (phaseId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const doneCount = phases.filter((phase) => phase.status === "concluido").length;

  return (
    <section className="work-block phase-panel">
      <div className="block-heading">
        <div>
          <h2>Fases da etapa</h2>
          <span className="pending-summary">{phases.length ? `${doneCount}/${phases.length} fase(s) concluidas` : "Organize a etapa em fases menores"}</span>
        </div>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd(title);
            setTitle("");
          }}
        >
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Fase 1 - contexto" />
          <button className="icon-button" type="submit" disabled={!title.trim()}>
            <Plus size={16} />
          </button>
        </form>
      </div>

      <div className="phase-grid">
        {phases.map((phase, index) => {
          const blockingPhase = getBlockingPhase(phase, phases);
          const previousPhase = phases[index - 1] ?? null;

          return (
            <article className={`phase-card ${phase.status} ${blockingPhase ? "locked" : ""}`} key={phase.id}>
              <div className="phase-card-head">
                <span className={`phase-node ${phase.status}`}>{phase.phase_order}</span>
                <InlineText defaultValue={phase.title} className="phase-title-input" onSave={(value) => onUpdate(phase.id, { title: value })} />
                <button className="icon-button subtle" onClick={() => onDelete(phase.id)}>
                  <Trash2 size={15} />
                </button>
              </div>

              {blockingPhase && <span className="phase-warning">Depende de: {blockingPhase.title}</span>}

              <TextArea label="Descricao / criterio" value={phase.description} rows={2} onChange={() => undefined} onBlur={(value) => onUpdate(phase.id, { description: value })} />
              <TextArea label="Condicao de conclusao" value={phase.completion_condition} rows={2} onChange={() => undefined} onBlur={(value) => onUpdate(phase.id, { completion_condition: value })} />

              <div className="status-actions phase-status-actions">
                {(["pendente", "em_andamento", "concluido", "bloqueado"] as StepStatus[]).map((status) => (
                  <button
                    key={status}
                    className={`chip ${phase.status === status ? "active" : ""}`}
                    disabled={status !== "pendente" && Boolean(blockingPhase)}
                    onClick={() => onUpdate(phase.id, { status })}
                  >
                    {formatStepStatus(status)}
                  </button>
                ))}
              </div>

              <label className="phase-toggle">
                <input
                  type="checkbox"
                  checked={phase.requires_previous_phase}
                  onChange={(event) =>
                    onUpdate(phase.id, {
                      requires_previous_phase: event.target.checked,
                      prerequisite_phase_id: event.target.checked ? (phase.prerequisite_phase_id ?? previousPhase?.id ?? null) : null,
                    })
                  }
                />
                Exigir fase anterior antes de avancar
              </label>

              <SelectField
                label="Pre-requisito especifico"
                value={phase.prerequisite_phase_id}
                onChange={(value) => onUpdate(phase.id, { prerequisite_phase_id: value || null })}
                options={phases.filter((item) => item.id !== phase.id).map((item) => ({ value: item.id, label: item.title }))}
                emptyLabel="Sem pre-requisito especifico"
              />
            </article>
          );
        })}
        {phases.length === 0 && <span className="muted">Nenhuma fase criada. Use fases para dividir uma etapa longa em partes controlaveis.</span>}
      </div>
    </section>
  );
}

function ContextPanel({
  project,
  step,
  phases,
  contexts,
  onAdd,
  onUpdate,
  onDelete,
}: {
  project: Project;
  step: ProjectStep;
  phases: ProjectStepPhase[];
  contexts: ProjectStepContext[];
  onAdd: (title: string, content: string, phaseId: string) => void;
  onUpdate: (contextId: string, payload: Partial<ProjectStepContext>) => void;
  onDelete: (contextId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [content, setContent] = useState("");

  return (
    <section className="work-block context-panel">
      <div className="block-heading">
        <div>
          <h2>Contextos salvos</h2>
          <span className="pending-summary">Textos reutilizaveis para copiar ou baixar em Markdown</span>
        </div>
      </div>

      <div className="context-form">
        <Field label="Titulo do contexto" value={title} onChange={setTitle} />
        <SelectField label="Fase vinculada" value={phaseId} onChange={setPhaseId} options={phases.map((phase) => ({ value: phase.id, label: phase.title }))} emptyLabel="Contexto geral da etapa" />
        <TextArea label="Texto do contexto" value={content} onChange={setContent} rows={5} />
        <button
          className="secondary-button"
          disabled={!title.trim() || !content.trim()}
          onClick={() => {
            onAdd(title, content, phaseId);
            setTitle("");
            setPhaseId("");
            setContent("");
          }}
        >
          <Plus size={16} />
          Salvar contexto
        </button>
      </div>

      <div className="context-list">
        {contexts.map((context) => {
          const markdown = buildContextMarkdown(project, step, context, phases);
          const phase = phases.find((item) => item.id === context.phase_id);

          return (
            <article className="context-card" key={context.id}>
              <div className="context-card-head">
                <div>
                  <InlineText defaultValue={context.title} className="context-title-input" onSave={(value) => onUpdate(context.id, { title: value })} />
                  <span>{phase ? `Fase: ${phase.title}` : "Contexto geral da etapa"}</span>
                </div>
                <div className="row-actions">
                  <button onClick={() => void copyText(markdown)} title="Copiar contexto em Markdown">
                    <Copy size={16} />
                  </button>
                  <button onClick={() => downloadMarkdown(markdown, `${project.name}-${step.name}-${context.title}.md`)} title="Baixar arquivo Markdown">
                    <Save size={16} />
                  </button>
                  <button onClick={() => onDelete(context.id)} title="Excluir contexto">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <SelectField label="Fase" value={context.phase_id} onChange={(value) => onUpdate(context.id, { phase_id: value || null })} options={phases.map((item) => ({ value: item.id, label: item.title }))} emptyLabel="Contexto geral" />
              <TextArea label="Conteudo" value={context.content} rows={5} onChange={() => undefined} onBlur={(value) => onUpdate(context.id, { content: value })} />
            </article>
          );
        })}
        {contexts.length === 0 && <span className="muted">Nenhum contexto salvo nesta etapa.</span>}
      </div>
    </section>
  );
}
function LinksPanel({
  links,
  onAdd,
  onUpload,
  onDelete,
}: {
  links: ProjectStepLink[];
  onAdd: (title: string, url: string) => void;
  onUpload: (file: File) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  return (
    <section className="work-block">
      <div className="block-heading">
        <h2>Materiais e links</h2>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd(title, url);
            setTitle("");
            setUrl("");
          }}
        >
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Nome" />
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
          <button className="icon-button" type="submit">
            <Plus size={16} />
          </button>
          <FileUploadButton onUpload={onUpload} />
        </form>
      </div>
      <div className="link-list">
        {links.map((link) => (
          <div className="record-row compact" key={link.id}>
            <div>
              <strong>{link.title}</strong>
              <a href={link.url} target="_blank" rel="noreferrer">
                {link.url}
              </a>
            </div>
            <button onClick={() => onDelete(link.id)}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {links.length === 0 && <span className="muted">Nenhum material vinculado.</span>}
      </div>
    </section>
  );
}

function QuickAddStep({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");

  return (
    <form
      className="quick-add"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd(name);
        setName("");
      }}
    >
      <Field label="Adicionar proxima etapa" value={name} onChange={setName} />
      <button className="primary-button" type="submit">
        <Plus size={16} />
        Adicionar etapa
      </button>
    </form>
  );
}

function SettingsView({
  tables,
  activeConfig,
  query,
  setQuery,
  onRefresh,
  onNotice,
  onTables,
}: {
  tables: Tables;
  activeConfig: ConfigModuleKey;
  setActiveConfig: (key: ConfigModuleKey) => void;
  query: string;
  setQuery: (query: string) => void;
  onRefresh: () => void;
  onNotice: (notice: string) => void;
  onTables: (updater: (current: Tables) => Tables) => void;
}) {
  const module = configModules.find((item) => item.key === activeConfig)!;

  return (
    <>
      <section className="topbar">
        <div>
          <h1>Configuracoes</h1>
          <p>Cadastros de apoio para alimentar a execucao dos projetos.</p>
        </div>
      </section>
      <ConfigCrud module={module} tables={tables} query={query} setQuery={setQuery} onRefresh={onRefresh} onNotice={onNotice} onTables={onTables} />
    </>
  );
}

function ConfigCrud({
  module,
  tables,
  query,
  setQuery,
  onRefresh,
  onNotice,
  onTables,
}: {
  module: { key: ConfigModuleKey; label: string; icon: typeof Bot; description: string };
  tables: Tables;
  query: string;
  setQuery: (query: string) => void;
  onRefresh: () => void;
  onNotice: (notice: string) => void;
  onTables: (updater: (current: Tables) => Tables) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<Record<string, unknown>>(createBlankConfig(module.key));
  const records = (tables[module.key] as Array<Record<string, unknown>>).filter((record) => normalizeSearch(record.name, record.title, record.description).includes(query.toLowerCase()));
  const Icon = module.icon;

  useEffect(() => {
    setEditingId(null);
    setFormState(createBlankConfig(module.key));
  }, [module.key]);

  async function saveConfig() {
    if (!supabase) {
      return;
    }

    const payload = normalizePayload(formState);
    const request = editingId ? supabase.from(module.key).update(payload).eq("id", editingId) : supabase.from(module.key).insert(payload);
    const { error } = await request;

    if (error) {
      onNotice(`Erro ao salvar ${module.label}: ${error.message}`);
      return;
    }

    onNotice(editingId ? "Registro atualizado." : "Registro criado.");
    setEditingId(null);
    setFormState(createBlankConfig(module.key));
    onRefresh();
  }

  async function removeConfig(id: string) {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.from(module.key).delete().eq("id", id);

    if (error) {
      onNotice(`Erro ao excluir: ${error.message}`);
      return;
    }

    onTables((current) => ({ ...current, [module.key]: (current[module.key] as Array<{ id: string }>).filter((record) => record.id !== id) }));
  }

  function editConfig(record: Record<string, unknown>) {
    setEditingId(String(record.id));
    setFormState(record);
  }

  return (
    <section className="module-layout">
      <div className="list-panel">
        <div className="panel-heading">
          <div>
            <h2>
              <Icon size={18} /> {module.label}
            </h2>
            <p>{module.description}</p>
          </div>
          <label className="search-field">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar" />
          </label>
        </div>

        <div className="record-list">
          {records.map((record) => (
            <div className="record-row" key={String(record.id)}>
              <div className="record-main">
                {module.key === "ai_tools" && <ToolLogo record={record} />}
                <div>
                  <strong>{getRecordTitle(record)}</strong>
                  <span>{getRecordSubtitle(record, tables)}</span>
                </div>
              </div>
              <div className="row-actions">
                <StatusPill status={String(record.status ?? "ativo")} />
                <button onClick={() => editConfig(record)}>
                  <Pencil size={16} />
                </button>
                <button onClick={() => void removeConfig(String(record.id))}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {records.length === 0 && (
          <div className="empty-state">
            <Icon size={34} />
            <strong>Nenhum registro</strong>
            <span>Use o formulario lateral para cadastrar.</span>
          </div>
        )}
      </div>

      <aside className="form-panel">
        <div className="form-heading">
          <div>
            <h2>{editingId ? "Editar" : "Novo cadastro"}</h2>
            <p>{module.label}</p>
          </div>
          <button className="primary-button" onClick={() => void saveConfig()}>
            <Save size={16} />
            Salvar
          </button>
        </div>
        <ConfigForm moduleKey={module.key} value={formState} tables={tables} onChange={(key, value) => setFormState((current) => ({ ...current, [key]: value }))} />
      </aside>
    </section>
  );
}

function ConfigForm({
  moduleKey,
  value,
  tables,
  onChange,
}: {
  moduleKey: ConfigModuleKey;
  value: Record<string, unknown>;
  tables: Tables;
  onChange: (key: string, value: unknown) => void;
}) {
  if (moduleKey === "ai_tools") {
    return (
      <div className="form-grid">
        <Field label="Nome" value={value.name} onChange={(next) => onChange("name", next)} />
        <TextArea label="Descricao" value={value.description} onChange={(next) => onChange("description", next)} />
        <Field label="Logo URL" value={value.logo_url} onChange={(next) => onChange("logo_url", next)} />
        <Field label="URL de acesso" value={value.access_url} onChange={(next) => onChange("access_url", next)} />
        <TextArea label="Como usar" value={value.usage_instructions} onChange={(next) => onChange("usage_instructions", next)} />
        <ConfigStatusField value={value.status} onChange={(next) => onChange("status", next)} />
      </div>
    );
  }

  if (moduleKey === "app_users") {
    return (
      <div className="form-grid">
        <Field label="Nome" value={value.name} onChange={(next) => onChange("name", next)} />
        <ConfigStatusField value={value.status} onChange={(next) => onChange("status", next)} />
      </div>
    );
  }

  if (moduleKey === "prompt_categories" || moduleKey === "project_types") {
    return (
      <div className="form-grid">
        <Field label="Nome" value={value.name} onChange={(next) => onChange("name", next)} />
        <TextArea label="Descricao" value={value.description} onChange={(next) => onChange("description", next)} />
        <ConfigStatusField value={value.status} onChange={(next) => onChange("status", next)} />
      </div>
    );
  }

  if (moduleKey === "prompts") {
    return (
      <div className="form-grid prompt-config-form">
        <div className="prompt-config-section main">
          <span className="section-kicker">Identificacao</span>
          <Field label="Titulo do prompt" value={value.title} onChange={(next) => onChange("title", next)} />
          <Field label="Descricao curta" value={value.short_description} onChange={(next) => onChange("short_description", next)} />
        </div>

        <div className="prompt-config-section prompt-editor-section">
          <span className="section-kicker">Conteudo reutilizavel</span>
          <TextArea label="Conteudo do prompt" value={value.content} onChange={(next) => onChange("content", next)} rows={10} />
          <PromptVariablesEditor value={String(value.variables ?? "")} onChange={(next) => onChange("variables", next)} />
        </div>

        <div className="prompt-config-section side">
          <span className="section-kicker">Organizacao</span>
          <SelectField label="Categoria" value={value.category_id} onChange={(next) => onChange("category_id", next)} options={tables.prompt_categories.map(toOption)} />
          <SelectField label="Ferramenta" value={value.ai_tool_id} onChange={(next) => onChange("ai_tool_id", next)} options={tables.ai_tools.map(toOption)} />
          <SelectField label="Tipo de projeto" value={value.project_type_id} onChange={(next) => onChange("project_type_id", next)} options={tables.project_types.map(toOption)} />
          <Field label="Versao" value={value.version} onChange={(next) => onChange("version", next)} />
          <ConfigStatusField value={value.status} onChange={(next) => onChange("status", next)} includeDraft />
        </div>
      </div>
    );
  }

  if (moduleKey === "journey_templates") {
    return (
      <div className="form-grid">
        <Field label="Nome do template" value={value.name} onChange={(next) => onChange("name", next)} />
        <TextArea label="Descricao" value={value.description} onChange={(next) => onChange("description", next)} />
        <SelectField label="Tipo de projeto" value={value.project_type_id} onChange={(next) => onChange("project_type_id", next)} options={tables.project_types.map(toOption)} />
        <SelectField
          label="Uso do template"
          value={value.context}
          onChange={(next) => onChange("context", next)}
          options={[
            { value: "projeto", label: "Projetos" },
            { value: "cliente", label: "Clientes" },
            { value: "geral", label: "Geral" },
          ]}
        />
        <ConfigStatusField value={value.status} onChange={(next) => onChange("status", next)} />
      </div>
    );
  }

  if (moduleKey === "journey_steps") {
    return (
      <div className="form-grid">
        <SelectField label="Template" value={value.journey_template_id} onChange={(next) => onChange("journey_template_id", next)} options={tables.journey_templates.map(toOption)} />
        <Field label="Ordem" type="number" value={value.step_order} onChange={(next) => onChange("step_order", Number(next))} />
        <Field label="Nome da etapa" value={value.name} onChange={(next) => onChange("name", next)} />
        <TextArea label="Objetivo" value={value.objective} onChange={(next) => onChange("objective", next)} />
        <SelectField label="Ferramenta recomendada" value={value.ai_tool_id} onChange={(next) => onChange("ai_tool_id", next)} options={tables.ai_tools.map(toOption)} />
        <TextArea label="Checklist" value={value.checklist} onChange={(next) => onChange("checklist", next)} />
        <TextArea label="Instrucoes" value={value.execution_instructions} onChange={(next) => onChange("execution_instructions", next)} />
        <TextArea label="Resultado esperado" value={value.expected_output} onChange={(next) => onChange("expected_output", next)} />
        <ConfigStatusField value={value.status} onChange={(next) => onChange("status", next)} />
      </div>
    );
  }

  if (moduleKey === "prompt_blocks") {
    return (
      <div className="form-grid">
        <Field label="Titulo" value={value.title} onChange={(next) => onChange("title", next)} />
        <Field label="Categoria" value={value.category} onChange={(next) => onChange("category", next)} />
        <TextArea label="Descricao" value={value.description} onChange={(next) => onChange("description", next)} />
        <TextArea label="Conteudo do complemento" value={value.content} onChange={(next) => onChange("content", next)} rows={7} />
        <SelectField label="Ferramenta" value={value.ai_tool_id} onChange={(next) => onChange("ai_tool_id", next)} options={tables.ai_tools.map(toOption)} />
        <SelectField label="Tipo de projeto" value={value.project_type_id} onChange={(next) => onChange("project_type_id", next)} options={tables.project_types.map(toOption)} />
        <SelectField label="Etapa relacionada" value={value.journey_step_id} onChange={(next) => onChange("journey_step_id", next)} options={tables.journey_steps.map(toOption)} />
        <ConfigStatusField value={value.status} onChange={(next) => onChange("status", next)} />
      </div>
    );
  }

  return (
    <div className="form-grid">
      <Field label="Titulo" value={value.title} onChange={(next) => onChange("title", next)} />
      <Field label="Categoria" value={value.category} onChange={(next) => onChange("category", next)} />
      <TextArea label="Descricao" value={value.description} onChange={(next) => onChange("description", next)} />
      <TextArea label="Conteudo" value={value.content} onChange={(next) => onChange("content", next)} rows={7} />
      <SelectField label="Tipo de projeto" value={value.project_type_id} onChange={(next) => onChange("project_type_id", next)} options={tables.project_types.map(toOption)} />
      <SelectField label="Etapa relacionada" value={value.journey_step_id} onChange={(next) => onChange("journey_step_id", next)} options={tables.journey_steps.map(toOption)} />
      <ConfigStatusField value={value.status} onChange={(next) => onChange("status", next)} />
    </div>
  );
}

function PromptVariablesEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const suggestions = ["{{empresa}}", "{{projeto}}", "{{tipo_projeto}}", "{{etapa_atual}}", "{{responsavel}}", "{{data}}", "{{sumario}}", "{{contexto}}"];
  const variables = value.split(",").map((item) => item.trim()).filter(Boolean);

  function addVariable(variableName: string) {
    const next = [...new Set([...variables, variableName])];
    onChange(next.join(", "));
  }

  function removeVariable(variableName: string) {
    onChange(variables.filter((item) => item !== variableName).join(", "));
  }

  return (
    <div className="prompt-variable-editor">
      <label className="field">
        <span>Variaveis usadas no prompt</span>
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="{{empresa}}, {{projeto}}, {{contexto}}" />
      </label>
      <div className="variable-chip-row">
        {suggestions.map((item) => <button className="variable-chip" type="button" key={item} onClick={() => addVariable(item)}>{item}</button>)}
      </div>
      {variables.length > 0 && (
        <div className="variable-selected-row" aria-label="Variaveis cadastradas">
          {variables.map((item) => <button type="button" key={item} onClick={() => removeVariable(item)}>{item} x</button>)}
        </div>
      )}
    </div>
  );
}
function EmptyProjectJourney({ onBack }: { onBack: () => void }) {
  return (
    <div className="empty-state tall">
      <Route size={42} />
      <strong>Nenhum projeto aberto</strong>
      <span>Crie ou selecione um projeto para executar a jornada.</span>
      <button className="primary-button" onClick={onBack}>
        Voltar para projetos
      </button>
    </div>
  );
}

function EmptyClientJourney({ onBack }: { onBack: () => void }) {
  return (
    <div className="empty-state tall">
      <Users size={42} />
      <strong>Nenhum cliente aberto</strong>
      <span>Crie ou selecione um cliente para acompanhar a jornada.</span>
      <button className="primary-button" onClick={onBack}>
        Voltar para clientes
      </button>
    </div>
  );
}

function ClientLogo({ client, large = false }: { client: Client; large?: boolean }) {
  const initials = getInitials(client.name);

  return (
    <span className={`client-logo ${large ? "large" : ""}`}>
      {client.logo_url ? <img src={client.logo_url} alt="" /> : <strong>{initials || "CL"}</strong>}
    </span>
  );
}

function InlineText({ defaultValue, className, onSave }: { defaultValue: string; className?: string; onSave: (value: string) => void }) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => setValue(defaultValue), [defaultValue]);

  return <input className={className} value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => onSave(value)} />;
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
  onBlur,
}: {
  label: string;
  value: unknown;
  rows?: number;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
}) {
  const [localValue, setLocalValue] = useState(String(value ?? ""));

  useEffect(() => setLocalValue(String(value ?? "")), [value]);

  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        rows={rows}
        value={localValue}
        onChange={(event) => {
          setLocalValue(event.target.value);
          onChange(event.target.value);
        }}
        onBlur={() => onBlur?.(localValue)}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  emptyLabel = "Nao vinculado",
  onChange,
}: {
  label: string;
  value: unknown;
  options: Array<{ value: string; label: string }>;
  emptyLabel?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ConfigStatusField({ value, includeDraft = false, onChange }: { value: unknown; includeDraft?: boolean; onChange: (value: string) => void }) {
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

function ToolLogo({ record }: { record: Record<string, unknown> }) {
  const logoUrl = typeof record.logo_url === "string" ? record.logo_url : "";

  if (!logoUrl) {
    return (
      <span className="tool-logo fallback">
        <Bot size={18} />
      </span>
    );
  }

  return (
    <span className="tool-logo">
      <img src={logoUrl} alt="" />
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill ${status}`}>{formatStatus(status)}</span>;
}

function createBlankConfig(moduleKey: ConfigModuleKey) {
  const base = { status: "ativo" as ConfigStatus };

  if (moduleKey === "app_users") {
    return { name: "", ...base };
  }

  if (moduleKey === "ai_tools") {
    return { name: "", description: "", logo_url: "", access_url: "", usage_instructions: "", ...base };
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
      variables: "{{nome_projeto}}, {{empresa}}",
      version: "1.0",
      status: "rascunho" as ConfigStatus,
    };
  }

  if (moduleKey === "journey_templates") {
    return { name: "", description: "", project_type_id: "", context: "projeto", ...base };
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

  if (moduleKey === "prompt_blocks") {
    return { title: "", description: "", content: "", category: "", ai_tool_id: "", project_type_id: "", journey_step_id: "", ...base };
  }

  return { title: "", description: "", content: "", category: "", project_type_id: "", journey_step_id: "", ...base };
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

function normalizeSearch(...values: unknown[]) {
  return values
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function splitChecklist(value: string | null) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function byOrder<T extends { step_order?: number; item_order?: number; prompt_order?: number; link_order?: number; phase_order?: number; context_order?: number; sort_order?: number }>(a: T, b: T) {
  const left = a.step_order ?? a.item_order ?? a.prompt_order ?? a.link_order ?? a.phase_order ?? a.context_order ?? a.sort_order ?? 0;
  const right = b.step_order ?? b.item_order ?? b.prompt_order ?? b.link_order ?? b.phase_order ?? b.context_order ?? b.sort_order ?? 0;
  return left - right;
}

function getOrderColumn(tableName: keyof Tables) {
  if (tableName === "project_steps" || tableName === "journey_steps") {
    return "step_order";
  }

  if (tableName === "client_steps") {
    return "step_order";
  }

  if (tableName === "project_step_checklist_items") {
    return "item_order";
  }

  if (tableName === "client_step_checklist_items") {
    return "item_order";
  }

  if (tableName === "project_step_prompts" || tableName === "step_prompts") {
    return "prompt_order";
  }

  if (tableName === "project_step_links") {
    return "link_order";
  }

  if (tableName === "project_step_phases") {
    return "phase_order";
  }

  if (tableName === "project_step_contexts") {
    return "context_order";
  }

  if (tableName === "project_summary_items") {
    return "sort_order";
  }

  if (tableName === "client_step_links") {
    return "link_order";
  }

  return "created_at";
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
    return `Template: ${findName(tables.journey_templates, String(record.journey_template_id))}`;
  }

  if (record.category) {
    return String(record.category);
  }

  return "Cadastro de apoio da operacao";
}

function findName(records: Array<{ id: string; name: string }>, id: string | null) {
  if (!id) {
    return "";
  }

  return records.find((record) => record.id === id)?.name ?? "";
}

function toOption(record: { id: string; name?: string; title?: string }) {
  return { value: record.id, label: record.name ?? record.title ?? "Sem titulo" };
}

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    ativo: "Ativo",
    inativo: "Inativo",
    rascunho: "Rascunho",
    arquivado: "Arquivado",
    draft: "Rascunho",
    active: "Ativo",
    archived: "Arquivado",
    not_analyzed: "Nao analisado",
    analyzed: "Analisado",
    needs_review: "Precisa revisar",
    reviewed: "Revisado",
    planejado: "Planejado",
    em_implantacao: "Em implantacao",
    em_andamento: "Em andamento",
    concluido: "Concluido",
    desenvolvido: "Desenvolvido",
    em_revisao: "Em revisao",
    bloqueado: "Bloqueado",
  };

  return labels[status] ?? status;
}

function formatStepStatus(status: StepStatus) {
  return formatStatus(status);
}

function formatPromptStatus(status: ProjectStepPrompt["prompt_status"], content: string) {
  if (status === "nao_aplicavel") {
    return "Nao aplicavel";
  }

  if (status === "pendente" || !content.trim()) {
    return "Falta preencher";
  }

  return "Pronto";
}

function getBlockingPhase(phase: ProjectStepPhase | null | undefined, phases: ProjectStepPhase[]) {
  if (!phase) {
    return null;
  }

  const explicitPrerequisite = phase.prerequisite_phase_id ? phases.find((item) => item.id === phase.prerequisite_phase_id) : null;

  if (explicitPrerequisite && explicitPrerequisite.status !== "concluido") {
    return explicitPrerequisite;
  }

  if (!phase.requires_previous_phase) {
    return null;
  }

  const previousPhase = [...phases]
    .filter((item) => item.project_step_id === phase.project_step_id && item.phase_order < phase.phase_order)
    .sort((left, right) => right.phase_order - left.phase_order)[0];

  return previousPhase && previousPhase.status !== "concluido" ? previousPhase : null;
}

function buildConsolidatedSummaryVersion({
  sourceItems,
  selectedItems,
  nextSummaryId,
  projectId,
  now,
}: {
  sourceItems: ProjectSummaryItem[];
  selectedItems: ProjectSummaryItem[];
  nextSummaryId: string;
  projectId: string;
  now: string;
}) {
  const selectedIds = new Set(selectedItems.map((item) => item.id));
  const childrenByParent = new Map<string, ProjectSummaryItem[]>();
  const roots: ProjectSummaryItem[] = [];

  [...sourceItems]
    .filter((item) => selectedIds.has(item.id))
    .sort(byOrder)
    .forEach((item) => {
      const parentKey = item.parent_id && selectedIds.has(item.parent_id) ? item.parent_id : "root";

      if (parentKey === "root") {
        roots.push(item);
      } else {
        childrenByParent.set(parentKey, [...(childrenByParent.get(parentKey) ?? []), item]);
      }
    });

  const idMap = new Map<string, string>();
  selectedItems.forEach((item) => idMap.set(item.id, crypto.randomUUID()));

  const rows: ProjectSummaryItem[] = [];
  const lines: string[] = [];

  const walk = (nodes: ProjectSummaryItem[], prefix: string, level: number, parentOldId: string | null) => {
    [...nodes].sort(byOrder).forEach((item, index) => {
      const topicNumber = prefix ? `${prefix}.${index + 1}` : String(index + 1);
      const id = idMap.get(item.id) ?? crypto.randomUUID();
      const parent_id = parentOldId ? idMap.get(parentOldId) ?? null : null;
      const originalText = `${topicNumber} ${item.title}`;

      rows.push({
        ...item,
        id,
        summary_id: nextSummaryId,
        project_id: projectId,
        parent_id,
        topic_number: topicNumber,
        level,
        sort_order: rows.length + 1,
        original_text: originalText,
        is_selected: true,
        created_at: now,
        updated_at: now,
      });
      lines.push(`${"  ".repeat(Math.max(0, level - 1))}${originalText}`.trimEnd());
      walk(childrenByParent.get(item.id) ?? [], topicNumber, level + 1, item.id);
    });
  };

  walk(roots, "", 1, null);
  return { rows, consolidatedText: lines.join("\n") };
}
function buildProjectSummaryText(items: ProjectSummaryItem[]) {
  const selectedItems = [...items].filter((item) => item.is_selected).sort(byOrder);
  const selectedIds = new Set(selectedItems.map((item) => item.id));
  const childrenByParent = new Map<string, ProjectSummaryItem[]>();
  const roots: ProjectSummaryItem[] = [];

  selectedItems.forEach((item) => {
    const parentKey = item.parent_id && selectedIds.has(item.parent_id) ? item.parent_id : "root";
    if (parentKey === "root") {
      roots.push(item);
    } else {
      childrenByParent.set(parentKey, [...(childrenByParent.get(parentKey) ?? []), item]);
    }
  });

  const lines: string[] = [];
  const walk = (nodes: ProjectSummaryItem[], prefix: string, level: number) => {
    [...nodes].sort(byOrder).forEach((item, index) => {
      const number = prefix ? `${prefix}.${index + 1}` : String(index + 1);
      lines.push(`${"  ".repeat(Math.max(0, level - 1))}${number} ${item.title}`.trimEnd());
      walk(childrenByParent.get(item.id) ?? [], number, level + 1);
    });
  };

  walk(roots, "", 1);
  return lines.join("\n");
}

function composeGeneratedPrompt({
  project,
  step,
  summary,
  item,
  items,
  basePrompt,
  blocks,
  promptOptions,
}: {
  project: Project;
  step: ProjectStep;
  summary: ProjectSummary | null;
  item: ProjectSummaryItem | null;
  items?: ProjectSummaryItem[];
  basePrompt: Prompt | null;
  blocks: PromptBlock[];
  promptOptions?: string[];
}) {
  const header = [
    "# Prompt de desenvolvimento do projeto",
    `Projeto: ${project.name}`,
    project.company ? `Empresa: ${project.company}` : "",
    `Etapa atual: ${step.name}`,
    summary ? `Sumario: versao ${summary.version_number} (${formatStatus(summary.status)})` : "",
  ].filter(Boolean);
  const scopedItems = items?.length ? [...items].sort(byOrder) : item ? [item] : [];
  const summaryContext = summary?.consolidated_text?.trim()
    ? ["## Sumario consolidado", summary.consolidated_text.trim()]
    : [];
  const topic = scopedItems.length
    ? ["## Topicos que devem ser desenvolvidos", ...scopedItems.map((summaryItem) => `${summaryItem.topic_number} ${summaryItem.title}${summaryItem.notes ? `\nNotas internas: ${summaryItem.notes}` : ""}`)]
    : ["## Topicos que devem ser desenvolvidos", "Use o sumario consolidado do projeto como referencia geral."];
  const base = basePrompt?.content?.trim() ? ["## Prompt base", basePrompt.content.trim()] : [
    "## Prompt base",
    "Desenvolva o texto tecnico do projeto ambiental com clareza, coerencia, linguagem profissional e foco em entrega pronta para revisao.",
  ];
  const optionLines = promptOptions?.length
    ? ["## Instrucoes complementares selecionadas", ...promptOptions.map((option) => `- ${option}`)]
    : [];
  const complements = blocks.flatMap((block) => [
    `## Complemento - ${block.title}`,
    block.description ? block.description : "",
    block.content.trim(),
  ]);
  const instruction = [
    "## Formato de saida esperado",
    "Entregue o conteudo ja estruturado para uso em documento tecnico, evitando comentarios sobre o processo e apontando pendencias quando faltarem dados.",
  ];

  return [...header, "", ...base, "", ...summaryContext, "", ...topic, "", ...optionLines, "", ...complements, "", ...instruction]
    .filter((part) => String(part).trim().length > 0)
    .join("\n\n")
    .trim();
}

function formatSummaryParseStatus(status: ProjectSummary["parse_status"]) {
  const labels: Record<ProjectSummary["parse_status"], string> = {
    not_analyzed: "Nao analisado",
    analyzed: "Analisado",
    needs_review: "Precisa revisar",
    reviewed: "Revisado",
  };

  return labels[status];
}
function buildContextMarkdown(project: Project, step: ProjectStep, context: ProjectStepContext, phases: ProjectStepPhase[]) {
  const phase = phases.find((item) => item.id === context.phase_id);
  const parts = [
    `# ${context.title}`,
    "",
    `Projeto: ${project.name}`,
    project.company ? `Empresa: ${project.company}` : "",
    `Etapa: ${step.name}`,
    phase ? `Fase: ${phase.title}` : "Fase: contexto geral da etapa",
    "",
    "## Contexto",
    "",
    context.content.trim(),
  ].filter(Boolean);

  return `${parts.join("\n")}\n`;
}

function downloadMarkdown(markdown: string, fileName: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = slugifyFileName(fileName.endsWith(".md") ? fileName : `${fileName}.md`);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function slugifyFileName(value: string) {
  const extension = value.toLowerCase().endsWith(".md") ? ".md" : "";
  const base = extension ? value.slice(0, -3) : value;
  return `${base.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "contexto"}${extension || ".md"}`;
}
async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };

    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}

function getDefaultClientTemplate(templates: JourneyTemplate[]) {
  return (
    templates.find((template) => template.context === "cliente" && template.name.toLowerCase().includes("integra")) ??
    templates.find((template) => template.context === "cliente")
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
