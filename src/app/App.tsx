import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties, type SetStateAction } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bot,
  CalendarCheck,
  Check,
  ListOrdered,
  MoreHorizontal,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clipboard,
  Copy,
  Download,
  Upload,
  FileText,
  Filter,
  FolderOpen,
  GitBranch,
  GripVertical,
  Layers3,
  Link2,
  ListChecks,
  Loader2,
  PanelLeft,
  PanelTop,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Route,
  Save,
  Search,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { createCloudflareApi } from "../lib/cloudflareApi";
import { createJourneyApi, type JourneyFile } from "../api/journey";
import { createSummaryApi } from "../api/summary";
import { parseProjectSummary } from "../lib/summaryParser";
import { copyText as copyToClipboard } from "../components/ui/clipboard";
import { connectCentralLive, isCentralLiveViewer, publishCentralLiveContext } from "./centralLiveBridge";
import { resolveBoundSummary } from "../features/summary/summaryBinding";
import { replaceSummaryState, shouldApplySummaryState, type SummaryState } from "../features/summary/summaryState";
import { promptToneHue } from "../features/summary/promptTone";
import { cloneSummaryMasterPromptConfig, resolveSummaryMasterPromptConfig, type SummaryPromptAddition, type SummaryPromptConfig } from "../features/summary/masterPrompt";
import { clientKindOptions, validateClientLogo, type ClientKind } from "../features/clients/clientIdentity";
import { ClientContextLibrary } from "../features/clients/ClientContextLibrary";
import { ClientPortfolio } from "../features/clients/ClientPortfolio";
import { buildJourneyLink, readJourneyLink, replaceJourneyLink } from "../features/projects/journeyLink";
import { collapseAllBlockIds, toggleCollapsedBlockIds } from "../features/journey/blockPresentation";
import { interpolateJourneyPrompt, journeyPromptVariableSuggestions } from "../features/journey/promptInterpolation";
import {
  buildManagementAttentionRows,
  buildManagementClientRows,
  buildManagementProjectRows,
  filterManagementProjectRows,
  getProjectClientName,
  managementAttentionLabels,
  type ManagementAttentionKind,
  type ManagementStatus,
} from "../features/management/managementModel";
import {
  buildProjectListRows,
  filterProjectListRows,
  getProjectAge,
  groupProjectListRows,
  projectPrimaryAction,
  sortProjectListRows,
  type ProjectAgeBand,
  type ProjectGroupBy,
  type ProjectListRow,
  type ProjectListStatusFilter,
  type ProjectProgressBand,
  type ProjectSortColumn,
  type ProjectSortDirection,
  type ProjectWorkspaceGap,
} from "../features/projects/projectListModel";
import { availableProjectTemplates, templateAfterTypeChange, templateTypeName } from "../features/projects/templateCatalog";
import { TemplateEditor } from "../features/templates/TemplateEditor";
import { stagePresentation, StageLibraryPanel, type StageLibraryItem } from "../features/templates/StageLibraryPanel";
import { resolvePromptContent } from "../../shared/stepBuilder";
import { mergeSuccessfulTables, replaceProjectRows, shouldApplyRefresh, type TableResult } from "../features/data/refreshState";
import { Toast } from "../components/ui/Toast";
import { ProgressBar } from "../components/ui/ProgressBar";
import { StatusBadge, type StatusTone } from "../components/ui/StatusBadge";
import { AppShell, CommandBar, JourneyContextBar, WorkCanvas } from "../components/ui/LayoutPrimitives";
import { AppSidebar, PageHeader } from "../features/shell/AppSidebar";
import { GlobalSearch } from "../features/shell/GlobalSearch";
import { DeliveriesView } from "../features/deliveries/DeliveriesView";
import { ApplyTemplateDialog } from "../features/projects/ApplyTemplateDialog";
import { ClientPage } from "../features/clients/ClientPage";
import { MaterialsConfigEditor, MaterialsRuntime } from "../features/journey/MaterialsBlock";
import { ProjectWorkspacePanel } from "../features/workspace/ProjectWorkspacePanel";
import { ClientWorkspacesDialog } from "../features/workspace/ClientWorkspacesDialog";
import { selectWorkspaceContextPrompts, WORKSPACE_STEP_ID, type ProjectWorkspace, type WorkspaceOverview } from "../features/workspace/workspaceModel";

type ConfigStatus = "ativo" | "inativo" | "rascunho" | "arquivado";
type ProjectStatus = "planejado" | "em_andamento" | "concluido" | "bloqueado" | "arquivado";
type ClientStatus = "em_implantacao" | "ativo" | "concluido" | "bloqueado" | "arquivado";
type StepStatus = "pendente" | "em_andamento" | "concluido" | "bloqueado";
type ViewMode = "projects" | "journey" | "deliveries" | "projectTemplates" | "clients" | "clientPage" | "clientJourney" | "management" | "settings";
type JourneyMode = "execute" | "edit";

function compactStepLabel(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).join(" ");
}

type RailStep = { id: string; name: string; step_order: number; status: StepStatus; is_not_applicable?: boolean; compact_label?: string; status_label?: string };
type StageImportSelection = { stageId: string; templateStepId: string; name: string; description: string | null };

function JourneyStepRail({ ownerType, ownerId, currentUser, steps, selectedStepId, onSelectStep, onAdd, onOrganize }: { ownerType: "project" | "client"; ownerId: string; currentUser: AppUser | null; steps: RailStep[]; selectedStepId: string; onSelectStep: (id: string) => void; onAdd?: () => void; onOrganize?: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showNotApplicable, setShowNotApplicable] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const preferenceKey = `${ownerType}:${ownerId}:${currentUser?.id ?? ""}`;
  const compactLabel = isExpanded ? "Recolher etapas" : "Expandir etapas";
  const applicableSteps = steps.filter((step) => !step.is_not_applicable);
  const notApplicableSteps = steps.filter((step) => step.is_not_applicable);
  const visibleSteps = showNotApplicable ? [...applicableSteps, ...notApplicableSteps] : applicableSteps;

  useEffect(() => {
    if (!currentUser?.id) return;
    void fetch(`${cloudflareApiUrl}/api/journey-rail-preferences/${ownerType}/${encodeURIComponent(ownerId)}?userId=${encodeURIComponent(currentUser.id)}`)
      .then(async (response) => {
        const body = await response.json() as unknown as { data?: { isExpanded?: boolean } };
        return { response, body };
      })
      .then(({ response, body }) => {
        if (!response.ok) throw new Error("Não foi possível carregar a navegacao da jornada.");
        setIsExpanded(Boolean(body.data?.isExpanded));
        setLoadedKey(preferenceKey);
      })
      .catch(() => setLoadedKey(preferenceKey));
  }, [preferenceKey, ownerId, ownerType, currentUser?.id]);

  function toggleRail() {
    const next = !isExpanded;
    const previous = isExpanded;
    setIsExpanded(next);
    if (!currentUser?.id) return;
    void fetch(`${cloudflareApiUrl}/api/journey-rail-preferences/${ownerType}/${encodeURIComponent(ownerId)}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: currentUser.id, isExpanded: next }),
    }).then(async (response) => {
      if (!response.ok) throw new Error("Não foi possível salvar a navegacao da jornada.");
    }).catch(() => {
      setIsExpanded(previous);
      window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message: "Não foi possível salvar a visualizacao das etapas." } }));
    });
  }

  return <aside className={`step-rail step-rail-navigation ${isExpanded ? "is-expanded" : "is-compact"}`} aria-label="Navegacao de etapas" data-loaded={loadedKey === preferenceKey}>
    <div className="rail-heading"><div><strong>Etapas</strong>{isExpanded && <span>{steps.filter((step) => step.status === "concluido").length} concluidas</span>}</div><div className="rail-heading-actions"><button className="icon-button rail-toggle-button" type="button" title={compactLabel} aria-label={compactLabel} onClick={toggleRail}><PanelLeft size={16} /></button>{onAdd && <button className="icon-button rail-add-button" type="button" title="Adicionar etapa" aria-label="Adicionar etapa" onClick={onAdd}><Plus size={16} /></button>}</div>{isExpanded && onOrganize && <button className="rail-edit-button" type="button" title="Organizar etapas" onClick={onOrganize}><Pencil size={14} /> Editar</button>}</div>
    <nav className="step-rail-list">{visibleSteps.map((step) => {
      const status = step.is_not_applicable ? "nao-aplicavel" : step.status;
      const statusLabel = step.status_label ?? (step.is_not_applicable ? "Não se aplica" : formatStepStatus(step.status));
      return <button key={step.id} className={`step-item ${status} ${selectedStepId === step.id ? "active" : ""}`} type="button" title={`${step.name} - ${statusLabel}`} aria-label={`${step.name} - ${statusLabel}`} aria-current={selectedStepId === step.id ? "step" : undefined} onClick={() => onSelectStep(step.id)}><span className={`step-dot ${status}`}>{step.status === "concluido" && !step.is_not_applicable ? <Check size={13} /> : step.step_order}</span><span className="step-rail-short-label" aria-hidden="true">{step.compact_label ?? compactStepLabel(step.name)}</span><span className="step-rail-details"><strong>{step.name}</strong><small>{statusLabel}</small></span></button>;
    })}{notApplicableSteps.length > 0 && <button className={`step-na-summary ${showNotApplicable ? "expanded" : ""} ${notApplicableSteps.some((step) => step.id === selectedStepId) ? "active" : ""}`} type="button" aria-expanded={showNotApplicable} title={showNotApplicable ? "Recolher etapas que não se aplicam" : `Mostrar ${notApplicableSteps.length} etapa(s) que não se aplicam`} onClick={() => setShowNotApplicable((value) => !value)}><span>{notApplicableSteps.length}</span><small>{isExpanded ? (showNotApplicable ? "Recolher N/A" : "Não se aplicam") : "N/A"}</small><ChevronDown size={14} /></button>}</nav>
  </aside>;
}

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

type ProjectModality = {
  id: string;
  name: string;
  description: string | null;
  project_type_id: string;
  status: ConfigStatus;
  created_at: string;
  updated_at: string | null;
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
  project_modality_id?: string | null;
  context: "projeto" | "cliente" | "geral";
  status: ConfigStatus;
};

type ProjectTemplateSaveRequest = {
  mode: "update" | "create";
  templateId?: string;
  name: string;
  presentationDefaults?: Record<string, string[]>;
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
  client_id: string | null;
  responsible: string | null;
  responsible_user_id: string | null;
  project_type_id: string | null;
  project_modality_id?: string | null;
  journey_template_id: string | null;
  status: ProjectStatus;
  notes: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  completed_at_estimated?: boolean | number | null;
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
  is_not_applicable?: boolean;
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
  prompt_config_json: string | null;
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
  status: "ativo" | "arquivado";
  archived_at: string | null;
};

type GeneratedPromptWrite = Omit<GeneratedPrompt, "id" | "created_at" | "status" | "archived_at">;

const defaultSummaryPromptConfig: SummaryPromptConfig = cloneSummaryMasterPromptConfig();

type Client = {
  id: string;
  name: string;
  company: string | null;
  logo_url: string | null;
  client_kind: ClientKind | null;
  is_active: boolean;
  responsible: string | null;
  responsible_user_id: string | null;
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
  project_modalities: ProjectModality[];
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
const supabase = createCloudflareApi(cloudflareApiUrl);
const journeyApi = createJourneyApi(cloudflareApiUrl);
const summaryApi = createSummaryApi(cloudflareApiUrl);

type UploadedFile = {
  key: string;
  url: string;
};

const emptyTables: Tables = {
  app_users: [],
  ai_tools: [],
  prompt_categories: [],
  project_types: [],
  project_modalities: [],
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

const coreTableNames: Array<keyof Tables> = [
  "app_users", "projects", "project_steps", "clients", "project_types", "project_modalities", "journey_templates",
];
const detailTableNames = ["project_steps", "project_summaries", "project_summary_items", "generated_prompts"] as const;
const initialReadColumns: Partial<Record<keyof Tables, string>> = {
  app_users: "id,name,status,created_at,updated_at",
  projects: "id,name,company,client_id,responsible,responsible_user_id,project_type_id,project_modality_id,journey_template_id,status,notes,completed_at,completed_by,completed_at_estimated,created_at,updated_at",
  project_steps: "id,project_id,source_journey_step_id,name,step_order,status,is_not_applicable,created_at,updated_at",
  clients: "id,name,company,logo_url,client_kind,is_active,responsible,responsible_user_id,project_type_id,journey_template_id,entry_month,status,notes,created_at,updated_at",
  project_types: "id,name,description,status,created_at",
  project_modalities: "id,name,description,project_type_id,status,created_at,updated_at",
  journey_templates: "id,name,description,project_type_id,project_modality_id,context,status,created_at",
};
function activeSecondaryTables(view: ViewMode, activeConfig: ConfigModuleKey, selectedStepId?: string | null): Array<keyof Tables> {
  if (view === "projectTemplates") return ["journey_steps", "step_prompts", "prompts"];
  if (view === "clients") return ["client_steps", "journey_steps"];
  if (view === "clientJourney") return ["client_steps", "client_step_checklist_items", "client_step_links", "prompts", "ai_tools", "prompt_blocks"];
  if (view === "settings") return [...new Set<keyof Tables>([activeConfig, "ai_tools", "prompt_categories", "project_types", "journey_steps"])];
  if (view === "journey") return selectedStepId === WORKSPACE_STEP_ID ? ["prompts"] : ["prompts", "ai_tools", "prompt_blocks", "project_step_prompts", "project_step_checklist_items", "project_step_links", "project_step_phases", "project_step_contexts", "journey_steps", "step_prompts"];
  return [];
}

const projectFormTables: Array<keyof Tables> = ["journey_steps", "step_prompts"];

type Overview = { promptCount: number; summaryProjectIds: string[]; workspaces: WorkspaceOverview[]; clientContextCounts: Array<{ clientId: string; count: number }> };

const configModules: Array<{ key: ConfigModuleKey; label: string; icon: typeof Bot; description: string }> = [
  {
    key: "app_users",
    label: "Usuários",
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
    description: "Organização da biblioteca de prompts por finalidade.",
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
    description: "Etapas padrão usadas ao criar novos projetos.",
  },
  {
    key: "procedures",
    label: "Procedimentos",
    icon: GitBranch,
    description: "Regras internas e instrucoes operacionais.",
  },
];

export default function App() {
  const initialJourneyTarget = useMemo(() => readJourneyLink(), []);
  const [view, setView] = useState<ViewMode>(() => initialJourneyTarget ? "journey" : "projects");
  const [templateEditorTargetId, setTemplateEditorTargetId] = useState<string | null>(null);
  const [templateEditorDirty, setTemplateEditorDirty] = useState(false);
  const navigateFromTemplate = useCallback((next: ViewMode) => {
    if (view === "projectTemplates" && templateEditorDirty && !window.confirm("Há alterações não salvas no template. Sair do editor?")) return;
    setTemplateEditorDirty(false);
    setTemplateEditorTargetId(null);
    setView(next);
  }, [view, templateEditorDirty]);
  const [activeConfig, setActiveConfig] = useState<ConfigModuleKey>("prompts");
  const [tables, setTablesState] = useState<Tables>(emptyTables);
  const localMutationVersionRef = useRef(0);
  const setTables = useCallback((update: SetStateAction<Tables>) => {
    localMutationVersionRef.current += 1;
    setTablesState(update);
  }, []);
  const [currentUserId, setCurrentUserId] = useState(() => localStorage.getItem("central_ia_user_id") ?? "");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => initialJourneyTarget?.projectId ?? null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(() => initialJourneyTarget?.stepId ?? null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientStepId, setSelectedClientStepId] = useState<string | null>(null);
  const [stagePickerProjectId, setStagePickerProjectId] = useState<string | null>(null);
  const [applyTemplateProjectId, setApplyTemplateProjectId] = useState<string | null>(null);
  const [clientPageEditing, setClientPageEditing] = useState<string | null>(null);
  const previousViewRef = useRef<ViewMode | null>(null);
  const currentViewRef = useRef<ViewMode>("projects");
useEffect(() => {    if (view === currentViewRef.current) return;    previousViewRef.current = currentViewRef.current;    currentViewRef.current = view;  }, [view]);
  const [liveJourneyPanel, setLiveJourneyPanel] = useState<JourneyMode>("execute");
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"saving" | "updated" | "error">("saving");
  const [hasLoadedCore, setHasLoadedCore] = useState(false);
  const [loadedSecondaryTables, setLoadedSecondaryTables] = useState<Set<keyof Tables>>(() => new Set());
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [loadedProjectDetails, setLoadedProjectDetails] = useState<Set<string>>(() => new Set());
  const [loadingProjectDetails, setLoadingProjectDetails] = useState<Set<string>>(() => new Set());
  const [projectDetailErrors, setProjectDetailErrors] = useState<Record<string, string>>({});
  const [overview, setOverview] = useState<Overview>({ promptCount: 0, summaryProjectIds: [], workspaces: [], clientContextCounts: [] });
  const onWorkspaceChanged = useCallback((workspace: WorkspaceOverview) => {
    setOverview((current) => {
      const previous = current.workspaces.find((item) => item.projectId === workspace.projectId);
      if (previous && previous.revision > workspace.revision) return current;
      return { ...current, workspaces: [...current.workspaces.filter((item) => item.projectId !== workspace.projectId), workspace] };
    });
  }, []);
  const workspaceRefreshIdsRef = useRef(new Map<string, number>());
  const refreshProjectWorkspace = useCallback(async (projectId: string) => {
    if (!projectId) return;
    const requestId = (workspaceRefreshIdsRef.current.get(projectId) ?? 0) + 1;
    workspaceRefreshIdsRef.current.set(projectId, requestId);
    try {
      const response = await fetch(`${cloudflareApiUrl}/api/projects/${encodeURIComponent(projectId)}/workspace`, { cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao atualizar o local de trabalho.");
      const body = await response.json() as { data?: ProjectWorkspace };
      if (!body.data) throw new Error("Resposta incompleta do local de trabalho.");
      if (workspaceRefreshIdsRef.current.get(projectId) === requestId) onWorkspaceChanged(body.data);
    } catch {
      if (workspaceRefreshIdsRef.current.get(projectId) === requestId) setNotice("O link foi salvo, mas a Etapa 0 não foi atualizada. Tente abrir o local de trabalho novamente.");
    }
  }, [onWorkspaceChanged]);
  const coreInFlightRef = useRef<Promise<void> | null>(null);
  const secondaryInFlightRef = useRef<Promise<void> | null>(null);
  const secondaryInFlightScopeRef = useRef("");
  const detailInFlightRef = useRef(new Map<string, Promise<void>>());
  const coreRequestIdRef = useRef(0);
  const secondaryRequestIdRef = useRef(0);
  const detailRequestIdsRef = useRef(new Map<string, number>());
  const summaryEpochsRef = useRef(new Map<string, number>());
  const summaryReadsRef = useRef(new Map<string, { epoch: number; promise: Promise<boolean> }>());
  const summarySavesRef = useRef(new Map<string, Promise<boolean>>());
  const pendingPromptIdsRef = useRef(new Map<string, { fingerprint: string; id: string }>());
  const failedPromptRef = useRef<GeneratedPromptWrite | null>(null);
  const selectedProjectIdRef = useRef(selectedProjectId);
  selectedProjectIdRef.current = selectedProjectId;
  const lastAutoRefreshRef = useRef(0);
  const lastViewedAreaRef = useRef<ViewMode>("projects");
  const lastReadFailedRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tableErrors, setTableErrors] = useState<string[]>([]);

  useEffect(() => connectCentralLive((context) => {
    const allowedViews: ViewMode[] = ["projects", "journey", "projectTemplates", "clients", "clientJourney", "management", "settings"];
    if (allowedViews.includes(context.view as ViewMode)) setView(context.view as ViewMode);
    if (context.entityId) setSelectedProjectId(context.entityId);
    if (context.stepId) setSelectedStepId(context.stepId);
    if (context.panel === "execute" || context.panel === "edit") setLiveJourneyPanel(context.panel);
  }), []);

  useEffect(() => {
    publishCentralLiveContext({ view, entityId: selectedProjectId ?? undefined,
      stepId: selectedStepId ?? undefined, panel: liveJourneyPanel });
  }, [view, selectedProjectId, selectedStepId, liveJourneyPanel]);

  useEffect(() => {
    replaceJourneyLink(view === "journey" && selectedProjectId
      ? { projectId: selectedProjectId, stepId: selectedStepId || WORKSPACE_STEP_ID }
      : null);
  }, [view, selectedProjectId, selectedStepId]);

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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  function openProjectFromSearch(id: string) {
    setSelectedProjectId(id);
    setSelectedStepId(WORKSPACE_STEP_ID);
    setView("journey");
  }

  const currentSecondaryReady = activeSecondaryTables(view, activeConfig, selectedStepId).every((name) => loadedSecondaryTables.has(name));
  const projectFormReady = projectFormTables.every((name) => loadedSecondaryTables.has(name));
  const headerSyncStatus = syncStatus === "saving" ? "saving" : tableErrors.length > 0 ? "error" : syncStatus;

  useEffect(() => {
    void refreshCore();
  }, []);

  useEffect(() => {
    const changedArea = lastViewedAreaRef.current !== view;
    lastViewedAreaRef.current = view;
    const required = activeSecondaryTables(view, activeConfig, selectedStepId);
    const missing = required.filter((name) => !loadedSecondaryTables.has(name));
    if (missing.length) void refreshSecondary(missing);
    else if (changedArea && required.length) void refreshSecondary(required);
  }, [view, activeConfig, selectedStepId, loadedSecondaryTables]);

  useEffect(() => {
    if (view === "journey" && selectedProjectId && selectedStepId !== WORKSPACE_STEP_ID) void refreshProjectDetails(selectedProjectId);
  }, [view, selectedProjectId, selectedStepId]);

  useEffect(() => {
    const refreshWhenActive = (event: Event) => {
      const minimumGap = view === "journey" ? 1_000 : 15_000;
      if (document.visibilityState !== "visible" || (event.type !== "online" && Date.now() - lastAutoRefreshRef.current < minimumGap)) return;
      lastAutoRefreshRef.current = Date.now();
      void refreshActive(false);
    };
    document.addEventListener("visibilitychange", refreshWhenActive);
    window.addEventListener("focus", refreshWhenActive);
    window.addEventListener("online", refreshWhenActive);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenActive);
      window.removeEventListener("focus", refreshWhenActive);
      window.removeEventListener("online", refreshWhenActive);
    };
  }, [view, selectedProjectId, loadedProjectDetails, tables.project_summaries, activeConfig]);

  useEffect(() => {
    const showToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setNotice(detail?.message || "Ação concluida.");
    };
    window.addEventListener("ramos:toast", showToast);
    return () => window.removeEventListener("ramos:toast", showToast);
  }, []);

  useEffect(() => {
    if (!selectedProjectId && tables.projects.length > 0) {
      setSelectedProjectId(tables.projects[0].id);
    }
  }, [selectedProjectId, tables.projects]);

  useEffect(() => {
    if (selectedProjectId && loadedProjectDetails.has(selectedProjectId) &&
        projectSteps.length > 0 && selectedStepId !== WORKSPACE_STEP_ID &&
        !projectSteps.some((step) => step.id === selectedStepId)) {
      setSelectedStepId(projectSteps[0].id);
    }
  }, [loadedProjectDetails, projectSteps, selectedProjectId, selectedStepId]);

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

  useEffect(() => {
    if (window.parent === window) {
      return;
    }

    const viewLabels: Record<ViewMode, string> = {
      projects: "Projetos",
      journey: selectedProject?.name ?? "Projeto",
      deliveries: "Entregas",
      clientPage: selectedClient?.name ?? "Cliente",
      projectTemplates: "Templates",
      clients: "Clientes",
      clientJourney: selectedClient?.name ?? "Cliente",
      management: "Gestão",
      settings: "Configurações",
    };
    const context = viewLabels[view] ?? "Ramos Jornadas";
    const title = context === "Projetos" ? "Ramos Jornadas" : `Ramos Jornadas · ${context}`;

    window.parent.postMessage(
      {
        appId: "ramos-jornadas",
        title,
        type: "central-ramos-apps:title",
      },
      "*",
    );
  }, [selectedClient?.name, selectedProject?.name, view]);

  async function readTables(names: Array<keyof Tables>): Promise<Array<TableResult<Tables>>> {
    return Promise.all(names.map(async (tableName) => {
      const rows: Tables[keyof Tables] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from(tableName).select(initialReadColumns[tableName] ?? "*").order(getOrderColumn(tableName), { ascending: true }).range(offset, offset + 499);
        if (error || !data) return { tableName, data: null, error: error ?? new Error("Resposta vazia.") };
        rows.push(...data as never[]);
        if (data.length < 500) break;
      }
      return { tableName, data: rows, error: null };
    }));
  }

  function reportReadErrors(names: readonly string[], errors: string[]) {
    setTableErrors((current) => [...current.filter((name) => !names.includes(name)), ...errors]);
    if (errors.length) {
      lastReadFailedRef.current = true;
      setSyncStatus("error");
      setNotice(`Falha ao atualizar: ${errors.join(", ")}. Os ultimos dados validos foram mantidos.`);
    } else if (summarySavesRef.current.size === 0) {
      setSyncStatus("updated");
    }
  }

  function refreshCore(): Promise<void> {
    if (coreInFlightRef.current) return coreInFlightRef.current;
    const requestId = ++coreRequestIdRef.current;
    const promise = (async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const version = localMutationVersionRef.current;
        const [results, overviewResult] = await Promise.all([
          readTables(coreTableNames),
          fetch(`${cloudflareApiUrl}/api/overview`).then(async (response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return (await response.json() as { data: Overview }).data;
          }).then((data) => ({ data, error: null })).catch((error) => ({ data: null, error })),
        ]);
        if (!shouldApplyRefresh(version, localMutationVersionRef.current, requestId, coreRequestIdRef.current)) {
          if (attempt === 0) continue;
          return;
        }
        const userResult = results.find((result) => result.tableName === "app_users");
        if (!userResult?.error && Array.isArray(userResult?.data) && userResult.data.length === 0 && results.every((result) => !result.error)) {
          const { data, error } = await supabase.from<AppUser>("app_users").insert(normalizePayload({
            id: "user-patrick", name: "Patrick", status: "ativo", updated_at: new Date().toISOString(),
          })).select("*").single();
          if (!error && data) userResult.data = [data];
          else userResult.error = error;
        }
        setTablesState((current) => {
          const next = mergeSuccessfulTables(current, results);
          const steps = results.find((result) => result.tableName === "project_steps");
          if (!steps?.error && steps?.data) {
            const existing = new Map(current.project_steps.map((step) => [step.id, step]));
            next.project_steps = (steps.data as ProjectStep[]).map((step) => ({ ...existing.get(step.id), ...step }));
          }
          return next;
        });
        if (overviewResult.data) setOverview((current) => ({ ...overviewResult.data!, clientContextCounts: overviewResult.data!.clientContextCounts ?? [], workspaces: overviewResult.data!.workspaces.map((workspace) => {
          const local = current.workspaces.find((item) => item.projectId === workspace.projectId);
          return local && local.revision > workspace.revision ? local : workspace;
        }) }));
        const errors = results.filter((result) => result.error).map((result) => String(result.tableName));
        if (overviewResult.error) errors.push("overview");
        reportReadErrors([...coreTableNames, "overview"], errors);
        setHasLoadedCore(true);
        return;
      }
    })().finally(() => { coreInFlightRef.current = null; setHasLoadedCore(true); });
    coreInFlightRef.current = promise;
    return promise;
  }

  function refreshSecondary(names: Array<keyof Tables>): Promise<void> {
    const scope = names.join(",");
    if (secondaryInFlightRef.current) {
      if (secondaryInFlightScopeRef.current === scope) return secondaryInFlightRef.current;
      return secondaryInFlightRef.current.then(() => refreshSecondary(names));
    }
    secondaryInFlightScopeRef.current = scope;
    const requestId = ++secondaryRequestIdRef.current;
    setSecondaryLoading(true);
    const promise = (async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const version = localMutationVersionRef.current;
        const results = await readTables(names);
        if (!shouldApplyRefresh(version, localMutationVersionRef.current, requestId, secondaryRequestIdRef.current)) {
          if (attempt === 0) continue;
          return;
        }
        setTablesState((current) => mergeSuccessfulTables(current, results));
        const errors = results.filter((result) => result.error).map((result) => String(result.tableName));
        reportReadErrors(names, errors);
        setLoadedSecondaryTables((current) => {
          const next = new Set(current);
          for (const result of results) if (!result.error) next.add(result.tableName);
          return next.size === current.size ? current : next;
        });
        return;
      }
    })().finally(() => { secondaryInFlightRef.current = null; secondaryInFlightScopeRef.current = ""; setSecondaryLoading(false); });
    secondaryInFlightRef.current = promise;
    return promise;
  }

  function refreshProjectDetails(projectId: string): Promise<void> {
    const existing = detailInFlightRef.current.get(projectId);
    if (existing) return existing;
    const requestId = (detailRequestIdsRef.current.get(projectId) ?? 0) + 1;
    detailRequestIdsRef.current.set(projectId, requestId);
    setLoadingProjectDetails((current) => new Set(current).add(projectId));
    const promise = (async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const version = localMutationVersionRef.current;
        const results = await Promise.all(detailTableNames.map(async (tableName) => {
          const rows: Tables[typeof tableName] = [];
          let error: unknown = null;
          for (let offset = 0; ; offset += 500) {
            const page = await supabase.from(tableName).select("*").eq("project_id", projectId)
              .order(getOrderColumn(tableName), { ascending: true }).range(offset, offset + 499);
            if (page.error || !page.data) { error = page.error ?? new Error("Resposta vazia."); break; }
            rows.push(...page.data as never[]);
            if (page.data.length < 500) break;
          }
          return { tableName, rows, error };
        }));
        if (!shouldApplyRefresh(version, localMutationVersionRef.current, requestId, detailRequestIdsRef.current.get(projectId) ?? 0)) {
          if (attempt === 0) continue;
          return;
        }
        setTablesState((current) => {
          const next = { ...current };
          for (const result of results) {
            if (result.error) continue;
            if (result.tableName === "project_steps") next.project_steps = replaceProjectRows(current.project_steps, projectId, result.rows as ProjectStep[]);
            if (result.tableName === "project_summaries") next.project_summaries = replaceProjectRows(current.project_summaries, projectId, result.rows as ProjectSummary[]);
            if (result.tableName === "project_summary_items") next.project_summary_items = replaceProjectRows(current.project_summary_items, projectId, result.rows as ProjectSummaryItem[]);
            if (result.tableName === "generated_prompts") next.generated_prompts = replaceProjectRows(current.generated_prompts, projectId, result.rows as GeneratedPrompt[]);
          }
          return next;
        });
        const errors = results.filter((result) => result.error).map((result) => result.tableName);
        setProjectDetailErrors((current) => {
          const next = { ...current };
          if (errors.length) next[projectId] = `Falha ao carregar: ${errors.join(", ")}.`;
          else delete next[projectId];
          return next;
        });
        if (errors.length === 0) setLoadedProjectDetails((current) => new Set(current).add(projectId));
        else setNotice(`Falha ao atualizar dados da jornada. Os ultimos dados validos foram mantidos.`);
        reportReadErrors(detailTableNames, errors);
        return;
      }
    })().finally(() => {
      detailInFlightRef.current.delete(projectId);
      setLoadingProjectDetails((current) => { const next = new Set(current); next.delete(projectId); return next; });
    });
    detailInFlightRef.current.set(projectId, promise);
    return promise;
  }

  function applySummaryState(state: SummaryState<ProjectSummary, ProjectSummaryItem, GeneratedPrompt>) {
    setTables((current) => {
      const updated = replaceSummaryState({ summaries: current.project_summaries, items: current.project_summary_items, prompts: current.generated_prompts }, state);
      return { ...current, project_summaries: updated.summaries, project_summary_items: updated.items, generated_prompts: updated.prompts };
    });
  }

  function refreshSummaryState(summaryId: string, projectId: string): Promise<boolean> {
    const epoch = summaryEpochsRef.current.get(summaryId) ?? 0;
    const current = summaryReadsRef.current.get(summaryId);
    if (current?.epoch === epoch) return current.promise;
    const promise = (async () => {
      try {
        const state = await summaryApi.getState(summaryId) as SummaryState<ProjectSummary, ProjectSummaryItem, GeneratedPrompt>;
        if (!shouldApplySummaryState(epoch, summaryEpochsRef.current.get(summaryId) ?? 0, projectId, selectedProjectIdRef.current)) return false;
        applySummaryState(state);
        setTableErrors((errors) => errors.filter((name) => name !== "sumario"));
        return true;
      } catch {
        if (!shouldApplySummaryState(epoch, summaryEpochsRef.current.get(summaryId) ?? 0, projectId, selectedProjectIdRef.current)) return false;
        lastReadFailedRef.current = true;
        setSyncStatus("error");
        setTableErrors((errors) => [...new Set([...errors, "sumario"])]);
        setNotice("Falha ao atualizar o sumário. Os ultimos dados validos foram mantidos.");
        return false;
      }
    })().finally(() => {
      if (summaryReadsRef.current.get(summaryId)?.promise === promise) summaryReadsRef.current.delete(summaryId);
    });
    summaryReadsRef.current.set(summaryId, { epoch, promise });
    return promise;
  }

  async function refreshActive(announce: boolean) {
    if (announce) {
      setIsSyncing(true);
      setSyncStatus("saving");
    }
    lastReadFailedRef.current = false;
    try {
      if (view === "journey" && selectedStepId === WORKSPACE_STEP_ID) { await refreshCore(); return; }
      if (view === "journey" && selectedProjectId && loadedProjectDetails.has(selectedProjectId)) {
        const summaries = tables.project_summaries.filter((summary) => summary.project_id === selectedProjectId && summary.status !== "archived");
        if (summaries.length) await Promise.all(summaries.map((summary) => refreshSummaryState(summary.id, selectedProjectId)));
        else await refreshProjectDetails(selectedProjectId);
        if (!lastReadFailedRef.current) {
          setSyncStatus("updated");
          if (announce) setNotice("Sumário atualizado.");
        }
        return;
      }
      await refreshCore();
      const required = activeSecondaryTables(view, activeConfig, selectedStepId);
      if (required.length) await refreshSecondary(required);
      if (view === "journey" && selectedProjectId) await refreshProjectDetails(selectedProjectId);
      if (!lastReadFailedRef.current) {
        setSyncStatus("updated");
        if (announce) setNotice("Dados atualizados.");
      }
    } finally {
      if (announce) setIsSyncing(false);
    }
  }

  async function loadAll() {
    await refreshActive(true);
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
      setNotice(`Erro ao criar usuário: ${error?.message ?? "erro desconhecido"}`);
      return;
    }

    setTables((current) => ({ ...current, app_users: [...current.app_users, data as AppUser] }));
    selectUser(data.id);
    setNotice(`Usuário ${data.name} criado.`);
  }

  async function createProject(form: NewProjectFormState) {
    if (!supabase || !form.name.trim()) {
      return;
    }

    setIsLoading(true);
    const responsibleUser = tables.app_users.find((user) => user.id === form.responsible_user_id) ?? null;
    let linkedClient = tables.clients.find((client) => client.id === form.client_id) ?? null;
    let projectModalityId = form.project_modality_id;

    if (projectModalityId === "__new") {
      const modalityName = form.new_project_modality_name.trim();
      if (!form.project_type_id || !modalityName) {
        setNotice("Escolha o tipo e informe o nome da nova modalidade.");
        setIsLoading(false);
        return;
      }
      const existing = tables.project_modalities.find((item) => item.project_type_id === form.project_type_id && normalizeSearchText(item.name) === normalizeSearchText(modalityName));
      if (existing) {
        projectModalityId = existing.id;
      } else {
        const { data: modality, error: modalityError } = await supabase
          .from<ProjectModality>("project_modalities")
          .insert(normalizePayload({ id: crypto.randomUUID(), name: modalityName, description: null, project_type_id: form.project_type_id, status: "ativo", updated_at: new Date().toISOString() }))
          .select("*")
          .single();
        if (modalityError || !modality) {
          setNotice(`Não foi possível criar a modalidade: ${modalityError?.message ?? "erro desconhecido"}`);
          setIsLoading(false);
          return;
        }
        projectModalityId = modality.id;
      }
    }

    if (form.client_id === "__new") {
      const clientName = form.new_client_name.trim() || form.company.trim();

      if (!clientName) {
        setNotice("Informe o nome do novo cliente antes de criar o projeto.");
        setIsLoading(false);
        return;
      }

      const { data: client, error: clientError } = await supabase
        .from<Client>("clients")
        .insert(
          normalizePayload({
            name: clientName,
            company: clientName,
            responsible: responsibleUser?.name ?? null,
            responsible_user_id: responsibleUser?.id ?? null,
            project_type_id: form.project_type_id,
            status: "ativo",
            notes: "Cliente criado pelo cadastro rapido de projeto.",
          }),
        )
        .select("*")
        .single();

      if (clientError || !client) {
        setNotice(`Não foi possível criar o cliente vinculado: ${clientError?.message ?? "erro desconhecido"}`);
        setIsLoading(false);
        return;
      }

      linkedClient = client as Client;
    }

    const legacyCompany = linkedClient?.name ?? (form.company.trim() || form.new_client_name.trim());
    const { data: project, error } = await supabase
      .from<Project>("projects")
      .insert(
        normalizePayload({
          name: form.name,
          company: legacyCompany,
          client_id: linkedClient?.id ?? null,
          responsible: responsibleUser?.name ?? null,
          responsible_user_id: responsibleUser?.id ?? null,
          project_type_id: form.project_type_id,
          project_modality_id: projectModalityId || null,
          journey_template_id: form.journey_template_id,
          status: "em_andamento",
          notes: form.notes,
        }),
      )
      .select("*")
      .single();

    if (error || !project) {
      setNotice(`Não foi possível criar o projeto: ${error?.message ?? "erro desconhecido"}`);
      setIsLoading(false);
      return;
    }

    if (form.journey_template_id) await instantiateTemplate(project as Project, form.journey_template_id);

    await loadAll();
    setSelectedProjectId(project.id);
    setSelectedStepId(WORKSPACE_STEP_ID);
    setView("journey");
    setNotice("Projeto criado. Agora a jornada pode ser executada e ajustada.");
    setIsLoading(false);
  }

  async function instantiateTemplate(project: Project, templateId: string) {
    if (!supabase) {
      return;
    }

    const templateSteps = tables.journey_steps.filter((step) => step.journey_template_id === templateId && step.status === "ativo").sort(byOrder);

    if (templateSteps.length === 0) return;

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

      await initializeProjectStep(String(step.id), templateStep.id);

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
          source_journey_step_id: payload.source_journey_step_id ?? null,
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

    if (error || !data) {
      setNotice(`Erro ao criar etapa: ${error?.message ?? "resposta vazia"}`);
      return null;
    }

    const initialized = await initializeProjectStep(String(data.id), payload.source_journey_step_id ?? undefined);
    if (payload.source_journey_step_id && !initialized) {
      await supabase.from("project_steps").delete().eq("id", data.id);
      setNotice("Não foi possível importar a estrutura da etapa. Nenhuma etapa incompleta foi mantida.");
      return null;
    }
    return data as ProjectStep;
  }

  async function initializeProjectStep(stepId: string, templateStepId?: string) {
    try {
      const response = await fetch(`${cloudflareApiUrl}/api/project-steps/${encodeURIComponent(stepId)}/initialize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(templateStepId ? { templateStepId } : {}),
      });
      return response.ok;
    } catch {
      // The canonical migration is additive. A later sync can retry initialization.
      return false;
    }
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

    const previous = tables.projects.find((project) => project.id === projectId);
    const isClosing = payload.status === "concluido" && previous?.status !== "concluido";
    const isReopening = payload.status !== undefined && payload.status !== "concluido" && previous?.status === "concluido";
    const request = { ...payload, ...(isClosing && currentUser ? { completed_by: currentUser.name } : {}), updated_at: new Date().toISOString() };
    const { error } = await supabase.from("projects").update(normalizePayload(request)).eq("id", projectId);

    if (error) {
      setNotice(`Erro ao atualizar projeto: ${error.message}`);
      return;
    }

    const now = new Date().toISOString();
    const completionPatch: Partial<Project> = isClosing
      ? { completed_at: now, completed_by: currentUser?.name ?? null, completed_at_estimated: false }
      : isReopening ? { completed_at: null, completed_by: null, completed_at_estimated: false } : {};
    setTables((current) => ({
      ...current,
      projects: current.projects.map((project) => (project.id === projectId ? { ...project, ...request, ...completionPatch } : project)),
    }));
    // The Worker closes open steps on completion (started -> concluded, untouched -> not applicable).
    if (isClosing) await refreshCore();
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
      setNotice("Não encontrei topicos numerados nesse sumário. Cole uma estrutura como 1, 1.1, 1.1.1.");
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
      prompt_config_json: JSON.stringify(resolveSummaryPromptConfig(null, tables.project_summaries)),
      created_by: currentUser?.name ?? "Patrick",
      updated_at: now,
    });

    const { data: summary, error } = await supabase.from<ProjectSummary>("project_summaries").insert(summaryPayload).select("*").single();

    if (error || !summary) {
      setNotice(`Erro ao importar sumário: ${error?.message ?? "erro desconhecido"}`);
      return;
    }

    const { error: itemsError } = await supabase.from<ProjectSummaryItem>("project_summary_items").insert(itemRows);

    if (itemsError) {
      setNotice(`Sumário criado, mas os topicos falharam: ${itemsError.message}`);
      return;
    }

    setTables((current) => ({
      ...current,
      project_summaries: [...current.project_summaries, summary as ProjectSummary],
      project_summary_items: [...current.project_summary_items, ...(itemRows as ProjectSummaryItem[])],
    }));
    setNotice(`Sumário analisado com ${itemRows.length} topicos. Revise e salve como consolidado.`);
  }

  async function updateProjectSummaryItem(itemId: string, payload: Partial<ProjectSummaryItem>) {
    if (!supabase) {
      return;
    }

    const target = tables.project_summary_items.find((item) => item.id === itemId);
    if (!target) return;

    const now = new Date().toISOString();
    const branchIds = payload.status
      ? collectSummaryBranchIds(tables.project_summary_items.filter((item) => item.summary_id === target.summary_id), itemId)
      : [itemId];
    const updates = await Promise.all(branchIds.map((id) => {
      const nextPayload = id === itemId
        ? normalizePayload({ ...payload, updated_at: now })
        : normalizePayload({ status: payload.status, updated_at: now });
      return supabase.from("project_summary_items").update(nextPayload).eq("id", id);
    }));
    const error = updates.find((result) => result.error)?.error;

    if (error) {
      setNotice(`Erro ao atualizar item do sumário: ${error.message}`);
      return;
    }

    setTables((current) => ({
      ...current,
      project_summary_items: current.project_summary_items.map((item) => {
        if (!branchIds.includes(item.id)) return item;
        return item.id === itemId
          ? { ...item, ...payload, updated_at: now }
          : { ...item, status: payload.status ?? item.status, updated_at: now };
      }),
    }));
  }

  async function updateProjectSummary(summaryId: string, payload: Partial<ProjectSummary>) {
    if (!supabase) {
      return;
    }

    const updatedAt = new Date().toISOString();
    const { error } = await supabase
      .from("project_summaries")
      .update(normalizePayload({ ...payload, updated_at: updatedAt }))
      .eq("id", summaryId);

    if (error) {
      setNotice(`Erro ao atualizar configuracao do sumário: ${error.message}`);
      return;
    }

    setTables((current) => ({
      ...current,
      project_summaries: current.project_summaries.map((item) => (
        item.id === summaryId ? { ...item, ...payload, updated_at: updatedAt } : item
      )),
    }));
    setNotice("Configuração de prompt salva nesta versão do sumário.");
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

  async function moveProjectSummaryItem(summaryId: string, itemId: string, parentId: string | null, targetIndex?: number) {
    if (!supabase) return;

    const items = tables.project_summary_items.filter((item) => item.summary_id === summaryId).sort(byOrder);
    const item = items.find((candidate) => candidate.id === itemId);
    const nextParentId = parentId || null;
    const branchIds = new Set(collectSummaryBranchIds(items, itemId));

    if (!item || (nextParentId && (nextParentId === itemId || branchIds.has(nextParentId)))) {
      setNotice("Um topico não pode ser movido para dentro dele mesmo ou de um subtópico.");
      return;
    }

    const normalized = normalizeProjectSummaryStructure(items, itemId, nextParentId, targetIndex);
    const now = new Date().toISOString();
    const updates = await Promise.all(normalized.map((row) => supabase
      .from("project_summary_items")
      .update(normalizePayload({
        parent_id: row.parent_id,
        topic_number: row.topic_number,
        level: row.level,
        sort_order: row.sort_order,
        original_text: row.original_text,
        updated_at: now,
      }))
      .eq("id", row.id)));
    const error = updates.find((result) => result.error)?.error;

    if (error) {
      setNotice(`Erro ao reorganizar topicos: ${error.message}`);
      return;
    }

    const nextById = new Map(normalized.map((row) => [row.id, { ...row, updated_at: now }]));
    setTables((current) => ({
      ...current,
      project_summary_items: current.project_summary_items.map((currentItem) => nextById.get(currentItem.id) ?? currentItem),
    }));
    setNotice("Estrutura do sumário reorganizada e numeracao atualizada.");
  }

  async function moveProjectSummaryItemToNumber(summaryId: string, itemId: string, topicNumber: string) {
    const normalizedNumber = topicNumber.trim().replace(/\.+$/, "");
    if (!/^\d+(?:\.\d+)*$/.test(normalizedNumber) || normalizedNumber.split(".").some((part) => Number(part) < 1)) {
      setNotice("Informe uma numeracao valida, como 5 ou 5.2.1.");
      return;
    }

    const parts = normalizedNumber.split(".").map(Number);
    const parentNumber = parts.slice(0, -1).join(".");
    const targetIndex = parts[parts.length - 1] - 1;
    const items = tables.project_summary_items.filter((item) => item.summary_id === summaryId);
    const parent = parentNumber ? items.find((item) => item.topic_number === parentNumber) : null;

    if (parentNumber && !parent) {
      setNotice(`O topico ${parentNumber} precisa existir antes de mover este item.`);
      return;
    }

    await moveProjectSummaryItem(summaryId, itemId, parent?.id ?? null, targetIndex);
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

async function applyProjectSummary(summaryId: string): Promise<boolean> {    try {      const applied = await summaryApi.apply(summaryId) as ProjectSummary;      await loadAll();      setNotice(`Versão ${applied.version_number} do sumário aplicada à jornada. O progresso das outras versões foi mantido.`);      return true;    } catch (failure) {      setNotice(`Erro ao aplicar sumário: ${failure instanceof Error ? failure.message : "falha desconhecida"}`);      return false;    }  }
  async function consolidateProjectSummary(summaryId: string): Promise<ProjectSummary | null> {
    if (!supabase) {
      return null;
    }

    // The Worker consolidation is atomic: version activation and dense
    // renumbering either both succeed or the previous version stays intact.
    try {
      const consolidated = await summaryApi.consolidate(summaryId, currentUser?.name ?? null) as ProjectSummary;
      if (consolidated) {
        await loadAll();
        setNotice(consolidated.status === "active" ? `Sumário consolidado e aplicado como versão ${consolidated.version_number}.` : `Versão ${consolidated.version_number} consolidada. Use "Aplicar sumário" para trabalhar nela.`);
        return consolidated;
      }
    } catch {
      // Older deployments keep the legacy fallback below until the Worker is updated.
    }

    const sourceSummary = tables.project_summaries.find((item) => item.id === summaryId);
    const sourceItems = tables.project_summary_items.filter((item) => item.summary_id === summaryId).sort(byOrder);
    const selectedItems = sourceItems.filter((item) => item.is_selected);

    if (!sourceSummary || selectedItems.length === 0) {
      setNotice("Selecione pelo menos um topico antes de consolidar o sumário.");
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
      prompt_config_json: sourceSummary.prompt_config_json ?? "{}",
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
      setNotice(`Erro ao consolidar sumário: ${error?.message ?? "erro desconhecido"}`);
      return null;
    }

    const { error: itemError } = await supabase.from<ProjectSummaryItem>("project_summary_items").insert(normalizedRows.map((row) => normalizePayload(row)));

    if (itemError) {
      setNotice(`Sumário criado, mas houve erro ao criar topicos consolidados: ${itemError.message}`);
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
    setNotice(`Sumário consolidado como versão ${nextVersionNumber}, com ${normalizedRows.length} topicos renumerados.`);
    return insertedSummary as ProjectSummary;
  }

  async function saveGeneratedPrompt(payload: GeneratedPromptWrite) {
    if (!supabase || !payload.summary_id || !payload.final_prompt.trim()) {
      return false;
    }
    const summaryId = payload.summary_id;
    const inFlight = summarySavesRef.current.get(summaryId);
    if (inFlight) return inFlight;
    const fingerprint = JSON.stringify([getGeneratedPromptItemIds(payload), payload.final_prompt, payload.base_prompt_snapshot, payload.notes]);
    const previous = pendingPromptIdsRef.current.get(summaryId);
    const promptId = previous?.fingerprint === fingerprint ? previous.id : crypto.randomUUID();
    pendingPromptIdsRef.current.set(summaryId, { fingerprint, id: promptId });
    const epoch = (summaryEpochsRef.current.get(summaryId) ?? 0) + 1;
    summaryEpochsRef.current.set(summaryId, epoch);
    localMutationVersionRef.current += 1;
    setSyncStatus("saving");
    const promise = (async () => {
      try {
        const state = await summaryApi.savePrompt(summaryId, {
          promptId,
          itemIds: getGeneratedPromptItemIds(payload),
          finalPrompt: payload.final_prompt,
          basePromptId: payload.base_prompt_id,
          basePromptSnapshot: payload.base_prompt_snapshot,
          aiToolId: payload.ai_tool_id,
          createdBy: payload.created_by || currentUser?.name || "Patrick",
          notes: payload.notes,
        }) as SummaryState<ProjectSummary, ProjectSummaryItem, GeneratedPrompt>;
        if (shouldApplySummaryState(epoch, summaryEpochsRef.current.get(summaryId) ?? 0, payload.project_id, selectedProjectIdRef.current)) applySummaryState(state);
        pendingPromptIdsRef.current.delete(summaryId);
        failedPromptRef.current = null;
        setTableErrors((errors) => errors.filter((name) => name !== "sumario"));
        setSyncStatus("updated");
        setNotice("Prompt e topicos do sumário atualizados.");
        return true;
      } catch (error) {
        failedPromptRef.current = payload;
        setSyncStatus("error");
        setTableErrors((errors) => [...new Set([...errors, "sumario"])]);
        setNotice(`Erro ao salvar o prompt do sumário: ${error instanceof Error ? error.message : "tente novamente"}. Os ultimos dados validos foram mantidos.`);
        return false;
      }
    })().finally(() => summarySavesRef.current.delete(summaryId));
    summarySavesRef.current.set(summaryId, promise);
    return promise;
  }

  async function archiveGeneratedPrompt(promptId: string, summaryItemId?: string) {
    if (!supabase) return;

    const prompt = tables.generated_prompts.find((item) => item.id === promptId);
    const linkedItemIds = prompt ? getGeneratedPromptItemIds(prompt) : [];

    if (prompt && summaryItemId && linkedItemIds.length > 1 && linkedItemIds.includes(summaryItemId)) {
      try {
        const parsed = prompt.selected_blocks_json ? JSON.parse(prompt.selected_blocks_json) : null;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const remainingItemIds = linkedItemIds.filter((id) => id !== summaryItemId);
          const selectedBlocks = { ...(parsed as Record<string, unknown>), summaryItemIds: remainingItemIds };
          const nextSummaryItemId = prompt.summary_item_id === summaryItemId ? remainingItemIds[0] ?? null : prompt.summary_item_id;
          const { error } = await supabase
            .from("generated_prompts")
            .update({ selected_blocks_json: JSON.stringify(selectedBlocks), summary_item_id: nextSummaryItemId })
            .eq("id", promptId);

          if (error) throw error;

          setTables((current) => ({
            ...current,
            generated_prompts: current.generated_prompts.map((item) => item.id === promptId
              ? { ...item, selected_blocks_json: JSON.stringify(selectedBlocks), summary_item_id: nextSummaryItemId }
              : item),
          }));
          setNotice("Prompt removido somente deste topico. Os demais vínculos foram preservados.");
          return;
        }
      } catch (error) {
        setNotice(`Erro ao remover o vínculo do prompt: ${error instanceof Error ? error.message : "erro desconhecido"}`);
        return;
      }
    }

    const archivedAt = new Date().toISOString();
    const { error } = await supabase
      .from("generated_prompts")
      .update({ status: "arquivado", archived_at: archivedAt })
      .eq("id", promptId);

    if (error) {
      setNotice(`Erro ao arquivar prompt: ${error.message}`);
      return;
    }

    setTables((current) => ({
      ...current,
      generated_prompts: current.generated_prompts.map((prompt) => (
        prompt.id === promptId ? { ...prompt, status: "arquivado", archived_at: archivedAt } : prompt
      )),
    }));
    setNotice("Prompt arquivado. O histórico foi preservado.");
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
    void refreshProjectWorkspace(tables.project_steps.find((step) => step.id === stepId)?.project_id ?? "");
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

  async function importProjectStages(projectId: string, selections: StageImportSelection[]) {
    if (!selections.length) return false;
    const baseOrder = Math.max(0, ...tables.project_steps.filter((step) => step.project_id === projectId).map((step) => step.step_order));
    const created: ProjectStep[] = [];
    for (const [index, selection] of selections.entries()) {
      const source = tables.journey_steps.find((step) => step.id === selection.templateStepId);
      const step = await createProjectStep(projectId, {
        source_journey_step_id: selection.templateStepId,
        name: selection.name || source?.name || "Etapa importada",
        description: selection.description ?? source?.description ?? "",
        objective: source?.objective ?? "",
        ai_tool_id: source?.ai_tool_id ?? "",
        expected_output: source?.expected_output ?? "",
        execution_instructions: source?.execution_instructions ?? "",
        step_order: baseOrder + index + 1,
      });
      if (!step) break;
      created.push(step);
    }
    if (!created.length) return false;
    await loadAll();
    setSelectedStepId(created[0].id);
    setNotice(`${created.length} ${created.length === 1 ? "etapa importada" : "etapas importadas"} para a jornada.`);
    return created.length === selections.length;
  }

  async function applyTemplateToProject(projectId: string, templateId: string, selections: StageImportSelection[]) {
    const project = tables.projects.find((item) => item.id === projectId);
    const template = tables.journey_templates.find((item) => item.id === templateId);
    const completed = await importProjectStages(projectId, selections);
    if (project && !project.journey_template_id) {
      await updateProject(projectId, {
        journey_template_id: templateId,
        ...(project.project_type_id ? {} : { project_type_id: template?.project_type_id ?? null }),
        ...(project.project_modality_id || !template?.project_modality_id ? {} : { project_modality_id: template.project_modality_id }),
      });
    }
    if (completed) setNotice(`Template "${template?.name ?? ""}" aplicado: ${selections.length} etapa(s) adicionada(s).`);
    return completed;
  }

  async function deleteProjectStep(stepId: string) {
    const orderedSteps = tables.project_steps.filter((step) => step.project_id === selectedProjectId).sort(byOrder);
    const index = orderedSteps.findIndex((step) => step.id === stepId);
    await deleteRecord("project_steps", stepId);
    if (selectedProjectId) void refreshProjectWorkspace(selectedProjectId);

    if (selectedStepId === stepId) {
      setSelectedStepId(orderedSteps[index + 1]?.id ?? orderedSteps[index - 1]?.id ?? "");
    }
    setNotice("Etapa removida da jornada.");
  }

  async function saveProjectAsTemplate(project: Project, request: ProjectTemplateSaveRequest): Promise<boolean> {
    if (!supabase) {
      return false;
    }

    try {
      const response = await fetch(`${cloudflareApiUrl}/api/projects/${encodeURIComponent(project.id)}/templates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: request.name.trim(),
          templateId: request.mode === "update" ? request.templateId ?? null : null,
          createdBy: currentUser?.name ?? null,
          presentationDefaults: request.presentationDefaults,
        }),
      });
      const body = await response.json() as { data?: { id: string; name: string; mode?: "created" | "updated" }; error?: string };
      if (response.ok && body.data) {
        await loadAll();
        setTemplateEditorTargetId(body.data.id);
        setView("projectTemplates");
        setNotice(request.mode === "update" ? `Rascunho de "${body.data.name}" preparado. Revise e publique quando estiver pronto.` : `Template "${body.data.name}" criado. Revise a jornada no editor.`);
        return true;
      }
      setNotice(`Erro ao salvar template: ${body.error ?? "erro desconhecido"}`);
      return false;
    } catch (error) {
      setNotice(`Erro ao salvar template: ${error instanceof Error ? error.message : "Worker indisponivel"}`);
      return false;
    }
  }

  async function updateJourneyTemplate(templateId: string, payload: Pick<JourneyTemplate, "name" | "description" | "status" | "project_type_id" | "project_modality_id">): Promise<boolean> {
    try {
      const response = await fetch(`${cloudflareApiUrl}/api/journey-templates/${encodeURIComponent(templateId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { data?: JourneyTemplate; error?: string };
      if (!response.ok || !body.data) {
        setNotice(`Erro ao editar template: ${body.error ?? "erro desconhecido"}`);
        return false;
      }
      setTables((current) => ({ ...current, journey_templates: current.journey_templates.map((item) => item.id === templateId ? { ...item, ...body.data } : item) }));
      setNotice(`Template "${body.data.name}" atualizado.`);
      return true;
    } catch {
      setNotice("Não foi possível editar o template agora.");
      return false;
    }
  }

  async function renameJourneyTemplateStep(stepId: string, name: string): Promise<boolean> {
    const nextName = name.trim();
    if (!nextName) {
      setNotice("Informe um nome para a etapa.");
      return false;
    }
    const { error } = await supabase.from("journey_steps").update({ name: nextName }).eq("id", stepId);
    if (error) {
      setNotice(`Erro ao renomear etapa: ${error.message}`);
      return false;
    }
    setTables((current) => ({
      ...current,
      journey_steps: current.journey_steps.map((step) => step.id === stepId ? { ...step, name: nextName } : step),
    }));
    setNotice(`Etapa "${nextName}" atualizada.`);
    return true;
  }

  async function archiveJourneyTemplateStep(step: JourneyStep): Promise<boolean> {
    if (!window.confirm(`Retirar a etapa "${step.name}" deste template? Projetos existentes não serão alterados.`)) return false;
    const { error } = await supabase.from("journey_steps").update({ status: "arquivado" }).eq("id", step.id);
    if (error) {
      setNotice(`Erro ao retirar etapa: ${error.message}`);
      return false;
    }
    setTables((current) => ({
      ...current,
      journey_steps: current.journey_steps.map((item) => item.id === step.id ? { ...item, status: "arquivado" } : item),
    }));
    setNotice(`Etapa "${step.name}" retirada do template.`);
    return true;
  }

  async function deleteJourneyTemplate(template: JourneyTemplate) {
    if (!window.confirm(`Excluir o template "${template.name}"? Esta acao remove somente o template e sua estrutura salva.`)) return;
    try {
      const response = await fetch(`${cloudflareApiUrl}/api/journey-templates/${encodeURIComponent(template.id)}`, { method: "DELETE" });
      const body = await response.json() as { data?: { name: string }; error?: string };
      if (!response.ok) {
        setNotice(`Erro ao excluir template: ${body.error ?? "erro desconhecido"}`);
        return;
      }
      await loadAll();
      setNotice(`Template "${body.data?.name ?? template.name}" excluido.`);
    } catch {
      setNotice("Não foi possível excluir o template agora.");
    }
  }


  async function createClientJourney(form: NewClientFormState) {
    if (!supabase || !form.name.trim()) {
      return;
    }
    if (!form.client_kind) { setNotice("Selecione se o novo cliente e AC ou AV."); return; }

    setIsLoading(true);
    let logoUrl = form.logo_url;
    if (form.logo_file) {
      const uploaded = await uploadClientLogo(form.logo_file);
      if (!uploaded) { setIsLoading(false); return; }
      logoUrl = uploaded;
    }
    const templateId = form.journey_template_id || getDefaultClientTemplate(tables.journey_templates)?.id || "";
    const responsibleUser = tables.app_users.find((user) => user.id === form.responsible_user_id) ?? null;
    const { data: client, error } = await supabase
      .from<Client>("clients")
      .insert(
        normalizePayload({
          name: form.name,
          company: form.company,
          logo_url: logoUrl,
          client_kind: form.client_kind || null,
          is_active: true,
          responsible: responsibleUser?.name ?? null,
          responsible_user_id: responsibleUser?.id ?? null,
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
      setNotice(`Não foi possível criar o cliente: ${error?.message ?? "erro desconhecido"}`);
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
    setNotice("Cliente criado. A jornada de entrada já pode ser acompanhada.");
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

      try {
        await fetch(`${cloudflareApiUrl}/api/journey-steps/client/${encodeURIComponent(String(step.id))}/initialize`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ templateStepId: templateStep.id }),
        });
      } catch {
        // Opening the client journey retries this explicit initialization.
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

    if (error || !data) {
      setNotice(`Erro ao criar etapa do cliente: ${error?.message ?? "resposta vazia"}`);
      return null;
    }

    try {
      await fetch(`${cloudflareApiUrl}/api/journey-steps/client/${encodeURIComponent(String(data.id))}/initialize`, { method: "POST" });
    } catch {
      // A retry on opening the journey initializes the canonical document.
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

  async function saveClientIdentity(clientId: string, payload: Partial<Client>, logoFile: File | null): Promise<boolean> {
    if (!supabase) return false;
    let logoUrl = payload.logo_url;
    if (logoFile) {
      const uploaded = await uploadClientLogo(logoFile);
      if (!uploaded) return false;
      logoUrl = uploaded;
    }
    const update = { ...payload, ...(logoFile || "logo_url" in payload ? { logo_url: logoUrl ?? null } : {}), updated_at: new Date().toISOString() };
    const { error } = await supabase.from("clients").update(normalizePayload(update)).eq("id", clientId);
    if (error) { setNotice(`Erro ao atualizar cliente: ${error.message}`); return false; }
    setTables((current) => ({ ...current, clients: current.clients.map((client) => client.id === clientId ? { ...client, ...update } : client) }));
    setNotice("Cadastro do cliente atualizado.");
    return true;
  }

  async function uploadClientLogo(file: File): Promise<string | null> {
    const validationError = validateClientLogo(file);
    if (validationError) { setNotice(validationError); return null; }
    try {
      const response = await fetch(`${cloudflareApiUrl.replace(/\/$/, "")}/api/client-logos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentBase64: await fileToBase64(file), contentType: file.type }),
      });
      const body = await response.json() as { data?: { url: string }; error?: string };
      if (!response.ok || !body.data?.url) throw new Error(body.error ?? "Falha ao enviar logo.");
      const apiOrigin = new URL(cloudflareApiUrl || "/", window.location.origin).origin;
      return new URL(body.data.url, apiOrigin).toString();
    } catch (error) {
      setNotice(`Erro ao enviar logo: ${error instanceof Error ? error.message : "erro desconhecido"}`);
      return null;
    }
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
      setNotice(`Erro ao adicionar evidência do cliente: ${error.message}`);
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
        setNotice(`Erro ao enviar arquivo: ${payload.error ?? "upload não concluido"}`);
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

  async function saveClientAsTemplate(client: Client, request?: { presentationDefaults?: Record<string, string[]> }) {
    if (!supabase) {
      return;
    }

    try {
      const response = await fetch(`${cloudflareApiUrl}/api/clients/${encodeURIComponent(client.id)}/templates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ createdBy: currentUser?.name ?? null, presentationDefaults: request?.presentationDefaults ?? {} }),
      });
      const body = await response.json() as { data?: { name: string }; error?: string };
      if (response.ok && body.data) {
        await loadAll();
        setNotice(`Template "${body.data.name}" salvo com a estrutura de blocos.`);
        return;
      }
    } catch {
      // Compatibility fallback below supports deployments still in transition.
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

  if (!hasLoadedCore) {
    return <div className="startup-loading"><Loader2 className="spin" size={26} /><span>Carregando projetos...</span></div>;
  }

  if (!currentUser) {
    return (
      <UserEntryScreen
        users={activeUsers}
        isLoading={isLoading || isSyncing}
        notice={notice ?? ""}
        tableErrors={tableErrors}
        onSelect={selectUser}
        onCreate={createAppUser}
        onRefresh={() => void loadAll()}
      />
    );
  }

  return (
    <AppShell>
      <AppSidebar
        items={[
          { key: "projects", label: "Projetos", icon: PanelLeft, active: view === "projects" || view === "journey", onSelect: () => navigateFromTemplate("projects") },
          { key: "deliveries", label: "Entregas", icon: CalendarCheck, active: view === "deliveries", onSelect: () => navigateFromTemplate("deliveries") },
          { key: "projectTemplates", label: "Templates", icon: Route, active: view === "projectTemplates", onSelect: () => navigateFromTemplate("projectTemplates") },
          { key: "clients", label: "Clientes", icon: Users, active: view === "clients" || view === "clientJourney", onSelect: () => navigateFromTemplate("clients") },
          { key: "management", label: "Gestão", icon: Layers3, active: view === "management", onSelect: () => navigateFromTemplate("management") },
          { key: "settings", label: "Configurações", icon: Settings, active: view === "settings", onSelect: () => navigateFromTemplate("settings") },
        ]}
        subItemsFor={view === "settings" ? "settings" : undefined}
        subItems={configModules.map((module) => ({ key: module.key, label: module.label, icon: module.icon, active: activeConfig === module.key, onSelect: () => setActiveConfig(module.key) }))}
        userName={currentUser.name}
        onSwitchUser={() => setCurrentUserId("")}
        onOpenSearch={() => setIsSearchOpen(true)}
        syncSlot={
          <div className={`header-sync-status ${headerSyncStatus}`} role="status" aria-live="polite" title={headerSyncStatus === "saving" ? "Salvando ou atualizando dados" : headerSyncStatus === "error" ? "Falha na última atualização" : "Última atualização confirmada"}>
            {headerSyncStatus === "saving" ? <Loader2 className="spin" size={15} /> : headerSyncStatus === "error" ? <X size={15} /> : <CheckCircle2 size={15} />}
            <span>{headerSyncStatus === "saving" ? "Salvando" : headerSyncStatus === "error" ? "Erro" : "Atualizado"}</span>
            {headerSyncStatus === "error" && <button type="button" title="Tentar novamente" aria-label="Tentar novamente" onClick={() => void (failedPromptRef.current && failedPromptRef.current.project_id === selectedProjectIdRef.current ? saveGeneratedPrompt(failedPromptRef.current) : loadAll())}><RefreshCw size={14} /></button>}
          </div>
        }
      />
      {isSearchOpen && (
        <GlobalSearch
          projects={tables.projects}
          clients={tables.clients}
          templates={tables.journey_templates}
          prompts={tables.prompts}
          onClose={() => setIsSearchOpen(false)}
          onOpenProject={(id) => { setIsSearchOpen(false); openProjectFromSearch(id); }}
          onOpenClient={() => { setIsSearchOpen(false); navigateFromTemplate("clients"); }}
          onOpenTemplate={() => { setIsSearchOpen(false); navigateFromTemplate("projectTemplates"); }}
          onOpenPrompt={() => { setIsSearchOpen(false); navigateFromTemplate("settings"); setActiveConfig("prompts" as ConfigModuleKey); }}
        />
      )}

      <main className="workspace">
        {notice && <div className="ui-toast-stack"><Toast message={notice} tone={notice.startsWith("Erro") || notice.startsWith("Falha") || notice.startsWith("Não foi") || notice.startsWith("Nao foi") ? "error" : "success"} onDismiss={() => setNotice(null)} /></div>}

        {view === "projects" && (
          <ProjectsView
            tables={tables}
            workspaces={overview.workspaces}
            summaryProjectIds={overview.summaryProjectIds}
            query={query}
            setQuery={setQuery}
            currentUser={currentUser}
            supportingDataReady={projectFormReady}
            supportingDataLoading={secondaryLoading}
            onPrepareSupportingData={() => void refreshSecondary(projectFormTables)}
            onCreate={createProject}
            onUpdate={updateProject}
            onOpen={(id) => {
              setSelectedProjectId(id);
              setSelectedStepId(WORKSPACE_STEP_ID);
              setView("journey");
            }}
            onDelete={deleteProject}
          />
        )}

        {view === "projectTemplates" && (currentSecondaryReady ? <ProjectTemplatesView tables={tables} currentUserName={currentUser?.name ?? null} query={query} setQuery={setQuery} onUpdate={updateJourneyTemplate} onDelete={deleteJourneyTemplate} onRenameStep={renameJourneyTemplateStep} onRemoveStep={archiveJourneyTemplateStep} onRefresh={loadAll} initialTemplateId={templateEditorTargetId} onEditorClosed={() => setTemplateEditorTargetId(null)} onEditorDirtyChange={setTemplateEditorDirty} /> : <DataAreaLoading loading={secondaryLoading} onRetry={() => void refreshSecondary(activeSecondaryTables(view, activeConfig))} />)}

        {view === "clients" && (currentSecondaryReady ? <ClientsView tables={tables} workspaces={overview.workspaces} clientContextCounts={overview.clientContextCounts} currentUser={currentUser} query={query} setQuery={setQuery} onCreate={createClientJourney} onSaveIdentity={saveClientIdentity} onOpen={(id) => { setSelectedClientId(id); setView("clientPage"); }} onOpenProject={(id) => { setSelectedProjectId(id); setSelectedStepId(WORKSPACE_STEP_ID); setView("journey"); }} baseUrl={cloudflareApiUrl} /> : <DataAreaLoading loading={secondaryLoading} onRetry={() => void refreshSecondary(activeSecondaryTables(view, activeConfig))} />)}

        {view === "deliveries" && (
          <DeliveriesView
            baseUrl={cloudflareApiUrl}
            currentUserName={currentUser.name}
            currentUserId={currentUser.id}
            openProjects={tables.projects}
            onOpenProject={openProjectFromSearch}
          />
        )}

        {view === "management" && (
          <ManagementView
            tables={tables}
            workspaces={overview.workspaces}
            query={query}
            setQuery={setQuery}
            onOpenProject={(id) => {
              setSelectedProjectId(id);
              setSelectedStepId(WORKSPACE_STEP_ID);
              setView("journey");
            }}
            onOpenClient={(id) => {
              setSelectedClientId(id);
              setView("clientPage");
            }}
          />
        )}

        {view === "clientPage" && (() => {
          const client = tables.clients.find((item) => item.id === selectedClientId);
          if (!client) return <div className="empty-state"><strong>Cliente não encontrado</strong></div>;
          return <ClientPage
            baseUrl={cloudflareApiUrl}
            client={client}
            projects={tables.projects.filter((project) => project.client_id === client.id)}
            projectTypes={tables.project_types.filter((type) => type.status !== "arquivado")}
            onBack={() => setView(previousViewRef.current && previousViewRef.current !== "clientPage" && previousViewRef.current !== "journey" ? previousViewRef.current : "clients")}
            onOpenProject={openProjectFromSearch}
            onOpenJourney={(id) => { setSelectedClientId(id); setView("clientJourney"); }}
            onEdit={(id) => setClientPageEditing(id)}
          />;
        })()}
        {clientPageEditing && (() => { const client = tables.clients.find((item) => item.id === clientPageEditing); return client ? <ClientProfileDialog key={client.id} client={client} users={tables.app_users} onClose={() => setClientPageEditing(null)} onSave={saveClientIdentity} /> : null; })()}

        {view === "journey" && selectedStepId === WORKSPACE_STEP_ID && selectedProject && <>
          <section className="journey-hero journey-context-bar"><button className="ghost-button" type="button" onClick={() => setView("projects")}><PanelLeft size={17} /> Projetos</button><div className="journey-context-copy"><span className="eyebrow">Ramos Jornadas</span><h1>{selectedProject.name}</h1><p>{selectedProject.company || "Projeto sem empresa definida"}</p></div></section>
          <section className="journey-layout block-journey-layout">
            <JourneyStepRail ownerType="project" ownerId={selectedProject.id} currentUser={currentUser} steps={[{ id: WORKSPACE_STEP_ID, name: "Local de trabalho", compact_label: "LOCAL TRAB.", step_order: 0, status: overview.workspaces.find((item) => item.projectId === selectedProject.id)?.status === "organizado" ? "concluido" : overview.workspaces.find((item) => item.projectId === selectedProject.id)?.status === "parcial" ? "em_andamento" : "pendente", status_label: overview.workspaces.find((item) => item.projectId === selectedProject.id)?.status === "organizado" ? "Organizado" : overview.workspaces.find((item) => item.projectId === selectedProject.id)?.status === "parcial" ? "Parcial" : "Não iniciado" }, ...projectSteps]} selectedStepId={WORKSPACE_STEP_ID} onSelectStep={setSelectedStepId} onAdd={() => setStagePickerProjectId(selectedProject.id)} />
            <section className="work-surface block-work-surface"><ProjectWorkspacePanel key={selectedProject.id} baseUrl={cloudflareApiUrl} projectId={selectedProject.id} contextPrompts={selectWorkspaceContextPrompts(tables.prompts)} currentUser={currentUser} onChanged={onWorkspaceChanged} onOpenStep={setSelectedStepId} stepCount={tables.project_steps.filter((step) => step.project_id === selectedProject.id).length} templateName={tables.journey_templates.find((template) => template.id === selectedProject.journey_template_id)?.name ?? null} onApplyTemplate={() => setApplyTemplateProjectId(selectedProject.id)} /></section>
          </section>
        </>}

        {view === "journey" && selectedStepId !== WORKSPACE_STEP_ID && (!currentSecondaryReady || (selectedProjectId && !loadedProjectDetails.has(selectedProjectId))) && (
          <DataAreaLoading loading={secondaryLoading || Boolean(selectedProjectId && loadingProjectDetails.has(selectedProjectId))} error={selectedProjectId ? projectDetailErrors[selectedProjectId] : undefined} onRetry={() => { void refreshSecondary(activeSecondaryTables(view, activeConfig)); if (selectedProjectId) void refreshProjectDetails(selectedProjectId); }} />
        )}

        {view === "journey" && selectedStepId !== WORKSPACE_STEP_ID && currentSecondaryReady && selectedProjectId && loadedProjectDetails.has(selectedProjectId) && selectedProject && selectedStep && (
          <JourneyView
            project={selectedProject}
            livePanel={liveJourneyPanel}
            onLivePanelChange={setLiveJourneyPanel}
            workspace={overview.workspaces.find((item) => item.projectId === selectedProject.id)}
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
            onDeleteLink={(id) => { void deleteRecord("project_step_links", id).then(() => refreshProjectWorkspace(selectedProject.id)); }}
            onAddPhase={addProjectStepPhase}
            onUpdatePhase={updateProjectStepPhase}
            onDeletePhase={deleteProjectStepPhase}
            onAddContext={addProjectStepContext}
            onUpdateContext={updateProjectStepContext}
            onDeleteContext={deleteProjectStepContext}
            onAddNextStep={addNextStep}
            onOpenStagePicker={() => setStagePickerProjectId(selectedProject.id)}
            onApplyTemplate={() => setApplyTemplateProjectId(selectedProject.id)}
            onDeleteStep={deleteProjectStep}
            onSaveTemplate={saveProjectAsTemplate}
            currentUser={currentUser}
            onImportSummary={importProjectSummary}
            onUpdateSummary={updateProjectSummary}
            onUpdateSummaryItem={updateProjectSummaryItem}
            onSetSummaryItemSelection={setSummaryItemSelection}
            onAddSummaryItem={addProjectSummaryItem}
            onMoveSummaryItem={moveProjectSummaryItem}
            onMoveSummaryItemToNumber={moveProjectSummaryItemToNumber}
            onDeleteSummaryItem={deleteProjectSummaryItem}
            onConsolidateSummary={consolidateProjectSummary}
            onApplySummary={applyProjectSummary}
            onSaveGeneratedPrompt={saveGeneratedPrompt}
            onArchiveGeneratedPrompt={archiveGeneratedPrompt}
            onCreatePromptFromBlock={createPromptFromBlock}
            onRefreshWorkspace={refreshProjectWorkspace}
          />
        )}

        {view === "journey" && selectedStepId !== WORKSPACE_STEP_ID && currentSecondaryReady && selectedProjectId && loadedProjectDetails.has(selectedProjectId) && (!selectedProject || !selectedStep) && (
          <EmptyProjectJourney onBack={() => setView("projects")} />
        )}

        {view === "clientJourney" && !currentSecondaryReady && <DataAreaLoading loading={secondaryLoading} onRetry={() => void refreshSecondary(activeSecondaryTables(view, activeConfig))} />}

        {view === "clientJourney" && currentSecondaryReady && selectedClient && selectedClientStep && (
          <ClientBlockJourneyView
            client={selectedClient}
            onOpenProject={(id) => { setSelectedProjectId(id); setSelectedStepId(WORKSPACE_STEP_ID); setView("journey"); }}
            steps={clientSteps}
            selectedStep={selectedClientStep}
            tables={tables}
            currentUser={currentUser}
            onSelectStep={setSelectedClientStepId}
            onBack={() => setView("clients")}
            onUpdateStep={updateClientStep}
            onAddNextStep={addNextClientStep}
            onSaveTemplate={saveClientAsTemplate}
            onCreatePromptFromBlock={createPromptFromBlock}
          />
        )}

        {view === "clientJourney" && currentSecondaryReady && (!selectedClient || !selectedClientStep) && (
          <EmptyClientJourney client={selectedClient} onBack={() => setView("clients")} onCreateStep={(clientId) => void addNextClientStep(clientId, "Primeira etapa")} />
        )}

        {view === "settings" && !currentSecondaryReady && <DataAreaLoading loading={secondaryLoading} onRetry={() => void refreshSecondary(activeSecondaryTables(view, activeConfig))} />}

        {view === "settings" && currentSecondaryReady && (
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
        {applyTemplateProjectId && (() => { const project = tables.projects.find((item) => item.id === applyTemplateProjectId); return project ? <ApplyTemplateDialog baseUrl={cloudflareApiUrl} projectName={project.name} currentTemplateId={project.journey_template_id} existingStepNames={tables.project_steps.filter((step) => step.project_id === project.id).map((step) => step.name)} templates={tables.journey_templates} onClose={() => setApplyTemplateProjectId(null)} onApply={async (templateId, selections) => { const ok = await applyTemplateToProject(project.id, templateId, selections); if (ok) setApplyTemplateProjectId(null); return ok; }} /> : null; })()}
        {stagePickerProjectId && <ProjectStagePicker baseUrl={cloudflareApiUrl} project={tables.projects.find((project) => project.id === stagePickerProjectId) ?? null} onClose={() => setStagePickerProjectId(null)} onCreateBlank={async () => { await addNextStep(stagePickerProjectId, "Nova etapa"); setStagePickerProjectId(null); }} onImport={async (selections) => { const completed = await importProjectStages(stagePickerProjectId, selections); if (completed) setStagePickerProjectId(null); return completed; }} />}
      </main>
    </AppShell>
  );
}

function ProjectStagePicker({ baseUrl, project, onClose, onCreateBlank, onImport }: {
  baseUrl: string;
  project: Project | null;
  onClose: () => void;
  onCreateBlank: () => Promise<void>;
  onImport: (selections: StageImportSelection[]) => Promise<boolean>;
}) {
  const [items, setItems] = useState<StageLibraryItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void fetch(`${baseUrl.replace(/\/$/, "")}/api/stage-library?scope=available&clientId=${encodeURIComponent(project?.client_id ?? "")}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { data?: StageLibraryItem[]; error?: string };
        if (!response.ok || !body.data) throw new Error(body.error || "Não foi possível carregar as etapas.");
        setItems(body.data.filter((item) => item.status === "active"));
      })
      .catch((failure) => { if (failure instanceof DOMException && failure.name === "AbortError") return; setError(failure instanceof Error ? failure.message : "Falha ao carregar etapas."); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [baseUrl, project?.client_id]);

  const visible = items.filter((item) => `${item.name} ${item.description ?? ""} ${item.clientName ?? ""} ${item.templateUses.map((use) => use.templateName).join(" ")}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const sourceFor = (item: StageLibraryItem) => item.templateUses.find((use) => use.clientId === project?.client_id)
    ?? item.templateUses.find((use) => use.templateId === project?.journey_template_id)
    ?? item.templateUses[0];

  async function importSelected() {
    const selections = selectedIds.flatMap((id) => {
      const item = items.find((candidate) => candidate.id === id);
      const source = item ? sourceFor(item) : null;
      return item && source ? [{ stageId: item.id, templateStepId: source.templateStepId, name: item.name, description: item.description }] : [];
    });
    if (!selections.length) return;
    setBusy(true); setError("");
    const completed = await onImport(selections);
    if (!completed) setError("A importacao não foi concluida por inteiro. As etapas confirmadas foram mantidas.");
    setBusy(false);
  }

  return <div className="modal-backdrop project-stage-picker-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="project-stage-picker glass-panel" role="dialog" aria-modal="true" aria-label="Adicionar etapas ao projeto" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-heading"><div><span className="eyebrow">Jornada do projeto</span><h2>Adicionar etapas</h2><p>Crie uma etapa vazia ou selecione varias etapas salvas.</p></div><button className="icon-button" type="button" title="Fechar" onClick={onClose}><X size={18} /></button></div>
      <button className="project-stage-blank" type="button" disabled={busy} onClick={() => { setBusy(true); void onCreateBlank().finally(() => setBusy(false)); }}><Plus size={20} /><span><strong>Criar etapa em branco</strong><small>Comece sem blocos e configure a estrutura depois.</small></span></button>
      <label className="search-field project-stage-search"><Search size={16} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar etapa, template ou cliente" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="project-stage-picker-list">
        {loading && <p role="status"><Loader2 className="spin" size={17} /> Carregando biblioteca...</p>}
        {!loading && visible.map((item) => { const presentation = stagePresentation(item); const Icon = presentation.Icon; const source = sourceFor(item); return <label className={`project-stage-option ${source ? "" : "unavailable"}`} key={item.id}>
          <input type="checkbox" disabled={!source || busy} checked={selectedIds.includes(item.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />
          <span className="stage-library-item-icon"><Icon size={18} /></span>
          <span><strong>{presentation.title}</strong><small>{item.description || "Sem descrição"}</small><em>{source ? `Origem: ${source.templateName} · ${item.document.blocks.length} blocos` : "Disponível depois de vincular a etapa a um template"}</em></span>
        </label>; })}
        {!loading && !visible.length && <p className="workspace-empty">Nenhuma etapa encontrada.</p>}
      </div>
      <div className="inline-actions project-stage-picker-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="button" disabled={busy || !selectedIds.length} onClick={() => void importSelected()}>{busy ? <Loader2 className="spin" size={16} /> : <Layers3 size={16} />} Importar selecionadas ({selectedIds.length})</button></div>
    </section>
  </div>;
}

function DataAreaLoading({ loading, error, onRetry }: { loading: boolean; error?: string; onRetry: () => void }) {
  return <section className="data-area-loading" role="status">
    {loading ? <><Loader2 className="spin" size={22} /> Carregando dados desta área...</> : <><span>{error ?? "Não foi possível atualizar esta área."}</span><button className="secondary-button" onClick={onRetry}><RefreshCw size={16} /> Tentar novamente</button></>}
  </section>;
}

type NewProjectFormState = {
  name: string;
  company: string;
  client_id: string;
  new_client_name: string;
  responsible_user_id: string;
  project_type_id: string;
  project_modality_id: string;
  new_project_modality_name: string;
  journey_template_id: string;
  notes: string;
};

type NewClientFormState = {
  name: string;
  company: string;
  logo_url: string;
  logo_file: File | null;
  client_kind: ClientKind | "";
  responsible_user_id: string;
  project_type_id: string;
  journey_template_id: string;
  entry_month: string;
  notes: string;
};

const projectColumns: { key: ProjectSortColumn; label: string }[] = [
  { key: "client", label: "Cliente" },
  { key: "name", label: "Projeto" },
  { key: "template", label: "Tipo" },
  { key: "responsible", label: "Responsável" },
  { key: "age", label: "Tempo" },
  { key: "progress", label: "Execução" },
  { key: "status", label: "Status" },
];

function ProjectsView({
  tables,
  workspaces,
  summaryProjectIds,
  supportingDataReady,
  supportingDataLoading,
  onPrepareSupportingData,
  query,
  setQuery,
  currentUser,
  onCreate,
  onUpdate,
  onOpen,
  onDelete,
}: {
  tables: Tables;
  workspaces: WorkspaceOverview[];
  summaryProjectIds: string[];
  supportingDataReady: boolean;
  supportingDataLoading: boolean;
  onPrepareSupportingData: () => void;
  query: string;
  setQuery: (query: string) => void;
  currentUser: AppUser | null;
  onCreate: (form: NewProjectFormState) => void;
  onUpdate: (id: string, payload: Partial<Project>) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ProjectListStatusFilter>("em_andamento");
  const [responsibleFilter, setResponsibleFilter] = useState("todos");
  const [templateFilter, setTemplateFilter] = useState("todos");
  const [projectFilter, setProjectFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("todos");
  const [progressBand, setProgressBand] = useState<ProjectProgressBand>("todos");
  const [ageBand, setAgeBand] = useState<ProjectAgeBand>("todos");
  const [workspaceGapFilter, setWorkspaceGapFilter] = useState<ProjectWorkspaceGap>("todos");
  const [sortColumn, setSortColumn] = useState<ProjectSortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<ProjectSortDirection>("asc");
  const [groupBy, setGroupBy] = useState<ProjectGroupBy>("none");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [projectCompanyDraft, setProjectCompanyDraft] = useState("");
  const [projectClientDraft, setProjectClientDraft] = useState("");
  const [projectResponsibleUserDraft, setProjectResponsibleUserDraft] = useState("");
  const [projectTypeDraft, setProjectTypeDraft] = useState("");
  const [projectModalityDraft, setProjectModalityDraft] = useState("");
  const activeUsers = tables.app_users.filter((user) => user.status === "ativo");
  const managementRows = useMemo(() => buildManagementProjectRows({
    projects: tables.projects,
    clients: tables.clients,
    projectTypes: tables.project_types,
    templates: tables.journey_templates,
    users: tables.app_users,
    steps: tables.project_steps,
    workspaces,
  }), [tables.projects, tables.clients, tables.project_types, tables.journey_templates, tables.app_users, tables.project_steps, workspaces]);
  const activeSummaryProjectIds = useMemo(() => [
    ...summaryProjectIds,
    ...tables.project_summaries.filter((summary) => summary.status !== "archived").map((summary) => summary.project_id),
  ], [summaryProjectIds, tables.project_summaries]);
  const projectRows = useMemo(() => buildProjectListRows(
    managementRows,
    tables.project_steps,
    activeSummaryProjectIds,
    workspaces,
  ), [managementRows, tables.project_steps, activeSummaryProjectIds, workspaces]);
  const filteredRows = useMemo(() => filterProjectListRows(projectRows, {
    search: query,
    status: statusFilter,
    responsible: responsibleFilter,
    template: templateFilter,
    project: projectFilter,
    client: clientFilter,
    progressBand,
    ageBand,
    workspaceGap: workspaceGapFilter,
  }), [projectRows, query, statusFilter, responsibleFilter, templateFilter, projectFilter, clientFilter, progressBand, ageBand, workspaceGapFilter]);
  const sortedRows = useMemo(() => sortColumn ? sortProjectListRows(filteredRows, sortColumn, sortDirection) : filteredRows, [filteredRows, sortColumn, sortDirection]);
  const groupedRows = useMemo(() => groupProjectListRows(sortedRows, groupBy), [sortedRows, groupBy]);
  const responsibleOptions = useMemo(() => [...new Set(projectRows.map((row) => row.responsibleName).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [projectRows]);
  const templateOptions = useMemo(() => [...new Set(projectRows.map((row) => row.projectTypeName))].sort((a, b) => a.localeCompare(b)), [projectRows]);
  const clientOptions = useMemo(() => [...new Set(projectRows.map((row) => row.clientName))].sort((a, b) => a.localeCompare(b)), [projectRows]);

  function toggleSort(column: ProjectSortColumn) {
    if (sortColumn === column) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSortColumn(column); setSortDirection("asc"); }
  }

  function columnFilterControl(column: ProjectSortColumn) {
    if (column === "name") return <input aria-label="Filtrar por projeto" placeholder="Nome do projeto" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} />;
    if (column === "client") return <select aria-label="Filtrar por cliente" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}><option value="todos">Todos os clientes</option>{clientOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select>;
    if (column === "template") return <select aria-label="Filtrar por template" value={templateFilter} onChange={(event) => setTemplateFilter(event.target.value)}><option value="todos">Todos os templates</option>{templateOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select>;
    if (column === "responsible") return <select aria-label="Filtrar por responsavel" value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)}><option value="todos">Todos os responsaveis</option>{responsibleOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select>;
    if (column === "progress") return <select aria-label="Filtrar por execução" value={progressBand} onChange={(event) => setProgressBand(event.target.value as ProjectProgressBand)}><option value="todos">Qualquer progresso</option><option value="0">0%</option><option value="1-49">1-49%</option><option value="50-99">50-99%</option><option value="100">100%</option></select>;
    if (column === "age") return <select aria-label="Filtrar por tempo" value={ageBand} onChange={(event) => setAgeBand(event.target.value as ProjectAgeBand)}><option value="todos">Qualquer tempo</option><option value="0-7">Ate 7 dias</option><option value="8-30">8 a 30 dias</option><option value="31+">Mais de 30 dias</option><option value="unknown">Sem tempo registrado</option></select>;
    return <div className="projects-status-filter-fields">
      <select aria-label="Filtrar por status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ProjectListStatusFilter)}><option value="todos">Todos os status</option><option value="em_andamento">Em andamento</option><option value="concluido">Concluídos</option></select>
      <select aria-label="Filtrar pendencias do local de trabalho" value={workspaceGapFilter} onChange={(event) => setWorkspaceGapFilter(event.target.value as ProjectWorkspaceGap)}><option value="todos">Qualquer situação</option><option value="directory">Diretório pendente</option><option value="conversation">Conversa pendente</option><option value="both">Diretório e conversa pendentes</option><option value="organized">Local organizado</option></select>
    </div>;
  }

  function columnFilterActive(column: ProjectSortColumn) {
    return column === "name" ? Boolean(projectFilter) : column === "client" ? clientFilter !== "todos" : column === "template" ? templateFilter !== "todos" : column === "responsible" ? responsibleFilter !== "todos" : column === "progress" ? progressBand !== "todos" : column === "age" ? ageBand !== "todos" : statusFilter !== "todos" || workspaceGapFilter !== "todos";
  }

  function toggleGroup(key: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectGrouping(value: ProjectGroupBy) {
    setGroupBy(value);
    setExpandedGroups(new Set());
  }

  function completeProject(row: ProjectListRow) {
    if (workspaces.find((item) => item.projectId === row.id)?.status !== "organizado") {
      onOpen(row.id);
      return;
    }
    const unfinished = row.totalSteps - row.completedSteps;
    if (unfinished > 0 && !window.confirm(`Concluir o projeto "${row.name}"?\n\n${unfinished} etapa(s) ainda estão abertas:\n• as que já foram iniciadas serão marcadas como concluídas;\n• as que nem começaram passarão para "Não se aplica".`)) return;
    onUpdate(row.id, { status: "concluido" });
  }

  function openProjectEditor(project: Project) {
    setEditingProject(project);
    setProjectNameDraft(project.name);
    setProjectCompanyDraft(project.company ?? "");
    setProjectClientDraft(project.client_id ?? resolveLegacyClientId(project.company, tables.clients));
    setProjectResponsibleUserDraft(resolveResponsibleUserId(project, tables.app_users));
    setProjectTypeDraft(project.project_type_id ?? "");
    setProjectModalityDraft(project.project_modality_id ?? "");
  }

  function saveProjectEditor() {
    if (!editingProject || !projectNameDraft.trim()) return;
    if (!projectTypeDraft) { window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message: "Selecione o tipo de projeto." } })); return; }
    const responsibleUser = tables.app_users.find((user) => user.id === projectResponsibleUserDraft) ?? null;
    const linkedClient = tables.clients.find((client) => client.id === projectClientDraft) ?? null;
    onUpdate(editingProject.id, {
      name: projectNameDraft.trim(),
      company: linkedClient?.name ?? (projectCompanyDraft.trim() || null),
      client_id: linkedClient?.id ?? null,
      responsible: responsibleUser?.name ?? null,
      responsible_user_id: responsibleUser?.id ?? null,
      project_type_id: projectTypeDraft || null,
      project_modality_id: projectModalityDraft || null,
    });
    setEditingProject(null);
  }

  return (
    <div className="projects-page">
      <header className="projects-page-heading">
        <div className="projects-page-title">
          <h1>Projetos</h1>
          <span>{tables.projects.length} projetos · {tables.clients.length} clientes</span>
        </div>
        <button className="primary-button" type="button" onClick={() => { if (!supportingDataReady) onPrepareSupportingData(); setShowForm(true); }}>
          <Plus size={17} />
          Novo projeto
        </button>
      </header>

      <section className="projects-portfolio" aria-labelledby="projects-portfolio-heading">
        <div className="projects-portfolio-heading">
          <h2 id="projects-portfolio-heading">Carteira de projetos</h2>
          <span aria-live="polite">{filteredRows.length} de {projectRows.length}</span>
        </div>

        <div className="projects-toolbar">
          <label className="projects-search">
            <Search size={17} aria-hidden="true" />
            <input aria-label="Buscar projetos por nome, cliente, template ou responsavel" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar projeto, cliente ou template" />
          </label>
          <div className="projects-segment-field">
            <span>Status</span>
            <div className="projects-segment projects-status-segment" role="group" aria-label="Filtrar projetos por status">
              <button type="button" aria-pressed={statusFilter === "todos"} aria-label="Todos os projetos" title="Todos os projetos" onClick={() => setStatusFilter("todos")}><ListChecks size={15} aria-hidden="true" /><span>Todos</span></button>
              <button type="button" aria-pressed={statusFilter === "em_andamento"} aria-label="Projetos em andamento" title="Em andamento, incluindo planejados e bloqueados" onClick={() => setStatusFilter("em_andamento")}><RefreshCw size={15} aria-hidden="true" /><span>Em andamento</span></button>
              <button type="button" aria-pressed={statusFilter === "concluido"} aria-label="Projetos concluidos" title="Projetos concluidos" onClick={() => setStatusFilter("concluido")}><CheckCircle2 size={15} aria-hidden="true" /><span>Concluídos</span></button>
            </div>
          </div>
          <div className="projects-segment-field projects-owner-filter">
            <span>Responsável</span>
            <div className="projects-owner-segment" role="group" aria-label="Filtrar por responsavel">
              <button className="projects-owner-filter-button all" type="button" aria-label="Todos os responsaveis" title="Todos os responsaveis" aria-pressed={responsibleFilter === "todos"} onClick={() => setResponsibleFilter("todos")}>
                <Users size={14} aria-hidden="true" />
              </button>
              {responsibleOptions.map((name) => (
                <button className="projects-owner-filter-button" data-tone={projectOwnerTone(name)} type="button" key={name} aria-label={`Filtrar por ${name}`} title={name} aria-pressed={responsibleFilter === name} onClick={() => setResponsibleFilter(name)}>
                  {getInitials(name) || "?"}
                </button>
              ))}
            </div>
          </div>
          <label className="projects-filter">
            <span>Tipo</span>
            <select value={templateFilter} onChange={(event) => setTemplateFilter(event.target.value)}>
              <option value="todos">Todos</option>
              {templateOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <div className="projects-segment-field projects-group-filter">
            <span>Agrupar por</span>
            <div className="projects-segment projects-group-segment" role="group" aria-label="Agrupar projetos">
              <button type="button" aria-pressed={groupBy === "none"} title="Mostrar lista sem agrupamento" onClick={() => selectGrouping("none")}><PanelTop size={15} aria-hidden="true" /><span>Lista</span></button>
              <button type="button" aria-pressed={groupBy === "client"} title="Agrupar por cliente, inicialmente recolhido" onClick={() => selectGrouping("client")}><Users size={15} aria-hidden="true" /><span>Cliente</span></button>
              <button type="button" aria-pressed={groupBy === "template"} title="Agrupar por tipo de projeto, inicialmente recolhido" onClick={() => selectGrouping("template")}><Layers3 size={15} aria-hidden="true" /><span>Tipo</span></button>
              <button type="button" aria-pressed={groupBy === "status"} title="Agrupar por status e pendencias do local, inicialmente recolhido" onClick={() => selectGrouping("status")}><ListChecks size={15} aria-hidden="true" /><span>Status</span></button>
            </div>
          </div>
          <div className="projects-mobile-controls">
            <label>Ordenar por<select aria-label="Ordenar projetos" value={sortColumn ? `${sortColumn}:${sortDirection}` : "recent"} onChange={(event) => {
              if (event.target.value === "recent") { setSortColumn(null); return; }
              const [column, direction] = event.target.value.split(":") as [ProjectSortColumn, ProjectSortDirection];
              setSortColumn(column); setSortDirection(direction);
            }}><option value="recent">Atualização recente</option>{projectColumns.flatMap(({ key, label }) => [<option key={`${key}:asc`} value={`${key}:asc`}>{label} crescente</option>, <option key={`${key}:desc`} value={`${key}:desc`}>{label} decrescente</option>])}</select></label>
            <details className="projects-mobile-filters"><summary><Filter size={15} /> Filtros das colunas</summary><div>{projectColumns.map(({ key, label }) => <div className="projects-mobile-filter-field" key={key}><span>{label}</span>{columnFilterControl(key)}</div>)}</div></details>
          </div>
        </div>

        <div className="projects-column-head">
          {projectColumns.map(({ key, label }) => <div className="projects-column-control" key={key}>
            <button className="projects-column-sort" type="button" aria-label={`Ordenar por ${label.toLowerCase()}${sortColumn === key ? `, ordem ${sortDirection === "asc" ? "crescente" : "decrescente"}` : ""}`} aria-pressed={sortColumn === key} onClick={() => toggleSort(key)}><span>{label}</span>{sortColumn !== key ? <ArrowUpDown size={13} /> : sortDirection === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />}</button>
            <details className="projects-column-filter" data-active={columnFilterActive(key)}><summary title={`Filtrar ${label.toLowerCase()}`} aria-label={`Filtrar ${label.toLowerCase()}`}><Filter size={13} /></summary><div className="projects-column-filter-menu"><strong>{label}</strong>{columnFilterControl(key)}</div></details>
          </div>)}
          <span>Ações</span>
        </div>
        {groupedRows.map((group) => {
          const isCollapsed = groupBy !== "none" && !expandedGroups.has(group.key);
          return (
            <section className="projects-group" key={group.key} aria-label={group.label || "Todos os projetos"}>
              {groupBy !== "none" && (
                <button className="projects-group-heading" data-tone={projectOwnerTone(group.key)} type="button" aria-expanded={!isCollapsed} onClick={() => toggleGroup(group.key)}>
                  <ChevronDown className={isCollapsed ? "collapsed" : ""} size={16} aria-hidden="true" />
                  {groupBy === "client" && <ClientLogo client={tables.clients.find((client) => client.id === group.rows[0]?.clientId) ?? { name: group.label, logo_url: null }} small />}
                  <strong>{group.label}</strong>
                  <span>{group.rows.length}</span>
                </button>
              )}
              {!isCollapsed && <div className="projects-rows" role="list">
                {group.rows.map((row) => (
                  <ProjectPortfolioRow
                    key={row.id}
                    row={row}
                    client={tables.clients.find((client) => client.id === row.clientId) ?? null}
                    workspace={workspaces.find((item) => item.projectId === row.id)}
                    onOpen={() => onOpen(row.id)}
                    onShare={() => void copyToClipboard(buildJourneyLink(row.id), "Link da jornada")}
                    onEdit={() => { const project = tables.projects.find((item) => item.id === row.id); if (project) openProjectEditor(project); }}
                    onComplete={() => completeProject(row)}
                    onReopen={() => onUpdate(row.id, { status: "em_andamento" })}
                    onDelete={() => onDelete(row.id)}
                    projectTypes={tables.project_types.filter((type) => type.status === "ativo")}
                    onChangeType={(typeId) => onUpdate(row.id, { project_type_id: typeId, project_modality_id: null })}
                  />
                ))}
              </div>}
            </section>
          );
        })}

        {filteredRows.length === 0 && (
          <div className="projects-empty-state">
            <Search size={22} aria-hidden="true" />
            <strong>Nenhum projeto encontrado</strong>
            <span>Ajuste a busca ou os filtros.</span>
          </div>
        )}
      </section>

      {showForm && <NewProjectDialog onClose={() => setShowForm(false)}>
        {supportingDataReady
          ? <NewProjectPanel tables={tables} currentUser={currentUser} onCreate={onCreate} onClose={() => setShowForm(false)} />
          : <DataAreaLoading loading={supportingDataLoading} onRetry={onPrepareSupportingData} />}
      </NewProjectDialog>}

      {editingProject && (
        <div className="modal-backdrop project-editor-backdrop" role="dialog" aria-modal="true" aria-label="Editar projeto">
          <form className="project-editor-modal glass-panel" onSubmit={(event) => { event.preventDefault(); saveProjectEditor(); }}>
            <div className="modal-heading">
              <div><span className="eyebrow">Dados do projeto</span><h2>Editar projeto</h2></div>
              <button className="icon-button" type="button" title="Fechar" onClick={() => setEditingProject(null)}><X size={17} /></button>
            </div>
            <div className="project-editor-fields">
              <Field label="Nome do projeto" value={projectNameDraft} onChange={setProjectNameDraft} />
              <ClientSearchSelect label="Cliente vinculado" value={projectClientDraft} clients={tables.clients} onChange={(value) => { setProjectClientDraft(value); const client = tables.clients.find((item) => item.id === value); if (client) setProjectCompanyDraft(client.name); }} />
              <SelectField label="Responsável" value={projectResponsibleUserDraft} onChange={setProjectResponsibleUserDraft} options={activeUsers.map(toOption)} />
              <SelectField label="Tipo de projeto *" value={projectTypeDraft} onChange={(value) => { setProjectTypeDraft(value); setProjectModalityDraft(""); }} options={tables.project_types.filter((item) => item.status === "ativo").map(toOption)} emptyLabel="Selecione o tipo" />
              <SelectField label="Modalidade" value={projectModalityDraft} onChange={setProjectModalityDraft} options={tables.project_modalities.filter((item) => item.status === "ativo" && item.project_type_id === projectTypeDraft).map(toOption)} />
            </div>
            <div className="inline-actions project-editor-actions">
              <button className="secondary-button" type="button" onClick={() => setEditingProject(null)}>Cancelar</button>
              <button className="primary-button" type="submit" disabled={!projectNameDraft.trim() || !projectTypeDraft}><Save size={16} /> Salvar alterações</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function projectOwnerTone(name: string) {
  const knownOwnerTones: Record<string, number> = { DARLEY: 5, GABI: 1, JR: 3, PATRICK: 2, VANESSA: 4 };
  const knownTone = knownOwnerTones[name.trim().toUpperCase()];
  if (knownTone) return knownTone;
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return (hash % 5) + 1;
}

function ProjectPortfolioRow({ row, client, workspace, onOpen, onShare, onEdit, onComplete, onReopen, onDelete, projectTypes = [], onChangeType }: {
  projectTypes?: Array<{ id: string; name: string }>;
  onChangeType?: (typeId: string) => void;
  row: ProjectListRow;
  client: Client | null;
  workspace?: WorkspaceOverview;
  onOpen: () => void;
  onShare: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onDelete: () => void;
}) {
  const ownerName = row.responsibleName || "Sem responsavel";
  const ownerInitials = row.responsibleName
    ? row.responsibleName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
    : "?";
  const age = getProjectAge(row);
  const workspaceGapLabel = {
    directory: "Diretório pendente",
    conversation: "Link de conversa pendente",
    both: "Diretório e link pendentes",
    organized: "Local organizado",
    unknown: "",
  }[row.workspaceGap];
  const showWorkspaceGap = workspaceGapLabel && (row.displayStatus !== "concluido" && row.displayStatus !== "arquivado" || row.regularizationPending);
  const primaryAction = projectPrimaryAction(row, workspace);
  const primaryActionLabel = primaryAction === "workspace"
    ? `Completar local de trabalho de ${row.name}${workspaceGapLabel ? `: ${workspaceGapLabel.toLowerCase()}` : ""}`
    : primaryAction === "reopen" ? `Reabrir ${row.name}` : primaryAction === "disabled" ? "Projeto já concluido ou arquivado" : `Concluir ${row.name}`;
  const clientNameParts = row.clientName.trim().split(/\s+/);
  const clientFirstLine = clientNameParts.shift() ?? row.clientName;
  const clientSecondLine = clientNameParts.join(" ");
  const hasClientName = Boolean(row.clientName && row.clientName !== "Sem cliente vinculado");
  const projectDisplayName = hasClientName ? `${row.name} - ${row.clientName}` : row.name;

  return (
    <article className="projects-row" role="listitem" data-status={row.displayStatus}>
      <span className="projects-cell projects-client" title={row.clientName}>
        {client?.logo_url
          ? <ClientLogo client={client} small />
          : <span className="projects-client-name"><span>{clientFirstLine}</span>{clientSecondLine && <span>{clientSecondLine}</span>}</span>}
      </span>
      <div className="projects-cell projects-project">
        <button type="button" onClick={onOpen} title={projectDisplayName}>
          <span className="projects-project-name">{row.name}</span>
          {hasClientName && <span className="projects-project-company"> - {row.clientName}</span>}
        </button>
      </div>
      <span className={`projects-cell projects-type ${row.hasProjectTypeLink ? "" : "is-missing"}`} title={row.templateName !== "Sem template" ? `Template: ${row.templateName}` : "Clique para classificar o tipo"}>
        {onChangeType ? (
          <select className="rj-type-select" aria-label={`Tipo de ${row.name}`} value={row.hasProjectTypeLink ? row.projectTypeId : ""} onChange={(event) => event.target.value && onChangeType(event.target.value)}>
            {!row.hasProjectTypeLink && <option value="">Classificar…</option>}
            {projectTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
        ) : row.projectTypeName}
      </span>
      <span className="projects-cell projects-owner">
        <span className="projects-owner-tag" data-tone={projectOwnerTone(ownerName)} title={`Responsável: ${ownerName}`}>
          <span className="projects-owner-initials" aria-hidden="true">{ownerInitials}</span>{ownerName}
        </span>
      </span>
      <span className={`projects-cell projects-age ${age.available ? "" : "unavailable"}`} title={age.title} aria-label={age.title}>
        <strong>{age.label}</strong><small>{age.detail}</small>
      </span>
      <span className="projects-cell projects-execution" aria-label={`${row.completedSteps} de ${row.totalSteps} etapas concluídas; ${row.progress}% do projeto`}>
        <strong>{row.totalSteps ? `${row.completedSteps}/${row.totalSteps}` : "Sem etapas"}</strong>
        <progress value={row.progress} max={100} aria-label={`Progresso de ${row.name}`} />
        <span>{row.progress}%</span>
      </span>
      <span className="projects-cell projects-status">{row.regularizationPending ? <StatusPill status="regularizacao_pendente" /> : <StatusPill status={row.displayStatus} />}{showWorkspaceGap && <small className={`projects-workspace-gap ${row.workspaceGap}`} title={`Local de trabalho: ${workspaceGapLabel}`}>{workspaceGapLabel}</small>}</span>
      <div className="projects-cell projects-actions">
        <button className="projects-action-button complete" type="button" title={primaryActionLabel} aria-label={primaryActionLabel} disabled={primaryAction === "disabled"} onClick={primaryAction === "workspace" ? onOpen : primaryAction === "reopen" ? onReopen : onComplete}>{primaryAction === "workspace" ? <FolderOpen size={16} aria-hidden="true" /> : primaryAction === "reopen" ? <RefreshCw size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}</button>
        <button className="projects-action-button share" type="button" title={`Copiar link da jornada ${row.name}`} aria-label={`Copiar link da jornada ${row.name}`} onClick={onShare}><Link2 size={16} aria-hidden="true" /></button>
        <button className="projects-action-button edit" type="button" title={`Editar ${row.name}`} aria-label={`Editar ${row.name}`} onClick={onEdit}><Pencil size={16} aria-hidden="true" /></button>
        <button className="projects-action-button danger" type="button" title={`Excluir ${row.name}`} aria-label={`Excluir ${row.name}`} onClick={onDelete}><Trash2 size={16} aria-hidden="true" /></button>
      </div>
    </article>
  );
}

function NewProjectDialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="project-create-dialog"
      aria-label="Criar projeto"
      onClose={onClose}
      onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current?.close(); }}
    >
      {children}
    </dialog>
  );
}

function ProjectTemplatesView({
  tables,
  currentUserName,
  query,
  setQuery,
  onUpdate,
  onDelete,
  onRenameStep,
  onRemoveStep,
  onRefresh,
  initialTemplateId,
  onEditorClosed,
  onEditorDirtyChange,
}: {
  tables: Tables;
  currentUserName: string | null;
  query: string;
  setQuery: (query: string) => void;
  onUpdate: (templateId: string, payload: Pick<JourneyTemplate, "name" | "description" | "status" | "project_type_id" | "project_modality_id">) => Promise<boolean>;
  onDelete: (template: JourneyTemplate) => Promise<void>;
  onRenameStep: (stepId: string, name: string) => Promise<boolean>;
  onRemoveStep: (step: JourneyStep) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  initialTemplateId: string | null;
  onEditorClosed: () => void;
  onEditorDirtyChange: (dirty: boolean) => void;
}) {
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(initialTemplateId);
  const [autoStagePickerTemplateId, setAutoStagePickerTemplateId] = useState<string | null>(null);
  const [templateSection, setTemplateSection] = useState<"templates" | "stages" | "clientStages">("templates");
  const [createError, setCreateError] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingStepName, setEditingStepName] = useState("");
  const [stepBusyId, setStepBusyId] = useState<string | null>(null);
  const allTemplates = tables.journey_templates
    .filter((template) => template.context === "projeto" || template.context === "geral")
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const templates = allTemplates.filter((template) =>
    (typeFilter === "all" || (typeFilter === "unclassified" ? !template.project_type_id : template.project_type_id === typeFilter))
    && normalizeSearch(template.name, template.description, templateTypeName(template, tables.project_types), tables.project_modalities.find((item) => item.id === template.project_modality_id)?.name).includes(query.toLowerCase()),
  );
  const templateGroups = [...new Set(templates.map((template) => template.project_type_id || "unclassified"))]
    .sort((a, b) => {
      if (a === "unclassified") return 1;
      if (b === "unclassified") return -1;
      return templateTypeName({ project_type_id: a }, tables.project_types).localeCompare(templateTypeName({ project_type_id: b }, tables.project_types), "pt-BR");
    });
  async function createEmptyTemplate() {
    setCreateError("");
    try {
      const response = await fetch(`${cloudflareApiUrl}/api/journey-templates`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Novo template" }) });
      const body = await response.json() as { data?: { data?: { id: string } } | { id: string }; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error ?? "Não foi possível criar o template.");
      const result = (body.data as { data?: { id: string } }).data ?? body.data as { id: string };
      if (!result?.id) throw new Error("Resposta incompleta ao criar o template.");
      await onRefresh(); setEditingTemplateId(result.id);
    } catch (failure) { setCreateError(failure instanceof Error ? failure.message : "Falha ao criar template."); }
  }

  if (editingTemplateId) return <TemplateEditor baseUrl={cloudflareApiUrl} templateId={editingTemplateId} projectTypes={tables.project_types.filter((item) => item.status === "ativo")} projectModalities={tables.project_modalities} clients={tables.clients} prompts={tables.prompts.map((prompt) => ({ id: prompt.id, name: prompt.title, content: prompt.content }))} onClose={() => { setEditingTemplateId(null); setAutoStagePickerTemplateId(null); onEditorClosed(); }} onOpenTemplate={setEditingTemplateId} onPublished={onRefresh} onDirtyChange={onEditorDirtyChange} openStagePickerOnLoad={autoStagePickerTemplateId === editingTemplateId} />;

  return (
    <>
      <section className="topbar">
        <div>
          <h1>Templates</h1>
          <p>Modelos de jornadas que podem ser usados para criar novos projetos.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => void createEmptyTemplate()}><Plus size={17} /> Novo template</button>
      </section>
      {createError && <p role="alert" className="form-error">{createError}</p>}

      <div className="template-section-tabs" role="tablist" aria-label="Organização dos modelos"><button type="button" role="tab" aria-selected={templateSection === "templates"} onClick={() => setTemplateSection("templates")}><Route size={16} /> Templates</button><button type="button" role="tab" aria-selected={templateSection === "stages"} onClick={() => setTemplateSection("stages")}><Layers3 size={16} /> Etapas salvas</button><button type="button" role="tab" aria-selected={templateSection === "clientStages"} onClick={() => setTemplateSection("clientStages")}><Users size={16} /> Etapas dos clientes</button></div>

      {templateSection === "stages" ? <StageLibraryPanel baseUrl={cloudflareApiUrl} scope="global" currentUserName={currentUserName} onChanged={onRefresh} prompts={tables.prompts.filter((prompt) => prompt.status !== "arquivado").map((prompt) => ({ id: prompt.id, name: prompt.title, content: prompt.content }))} /> : templateSection === "clientStages" ? <StageLibraryPanel baseUrl={cloudflareApiUrl} scope="client" clients={tables.clients.map((client) => ({ id: client.id, name: client.name }))} currentUserName={currentUserName} onChanged={onRefresh} /> : <>

      <section className="list-panel">
        <div className="panel-heading template-panel-heading">
          <div>
            <h2>Templates de projeto</h2>
            <p>Veja a estrutura salva, as etapas e os prompts pendentes de preenchimento.</p>
          </div>
          <div className="template-toolbar">
            <label className="search-field">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar template ou tipo" aria-label="Buscar template ou tipo" />
            </label>
            <label className="template-type-filter"><span>Tipo de projeto</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">Todos ({allTemplates.length})</option>
              {tables.project_types.filter((type) => allTemplates.some((template) => template.project_type_id === type.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map((type) => <option key={type.id} value={type.id}>{type.name} ({allTemplates.filter((template) => template.project_type_id === type.id).length})</option>)}
              {allTemplates.some((template) => !template.project_type_id) && <option value="unclassified">Sem tipo ({allTemplates.filter((template) => !template.project_type_id).length})</option>}
            </select></label>
          </div>
        </div>

        {templateGroups.map((groupId) => <section className="template-type-group" key={groupId} aria-label={`Templates de ${templateTypeName({ project_type_id: groupId === "unclassified" ? null : groupId }, tables.project_types)}`}>
          <header className="template-type-heading"><Layers3 size={17} aria-hidden="true" /><h3>{templateTypeName({ project_type_id: groupId === "unclassified" ? null : groupId }, tables.project_types)}</h3><span>{templates.filter((template) => (template.project_type_id || "unclassified") === groupId).length}</span></header>
          <div className="template-grid">
          {templates.filter((template) => (template.project_type_id || "unclassified") === groupId).map((template) => {
            const steps = tables.journey_steps.filter((step) => step.journey_template_id === template.id && step.status === "ativo").sort(byOrder);
            const stepIds = new Set(steps.map((step) => step.id));
            const prompts = tables.step_prompts.filter((prompt) => stepIds.has(prompt.journey_step_id));
            const pendingPrompts = prompts.filter((prompt) => prompt.prompt_status === "pendente" || !String(prompt.content ?? "").trim()).length;

            return (
              <article
                className="template-card template-card-compact"
                key={template.id}
                tabIndex={0}
                role="button"
                onClick={() => setEditingTemplateId(template.id)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setEditingTemplateId(template.id); } }}
              >
                <div className="project-card-head">
                  <strong>{template.name}</strong>
                  <StatusPill status={template.status} />
                </div>
                <p>{template.description || "Template sem descrição."}</p>
                <div className="template-meta">
                  <span className="template-type-chip">{templateTypeName(template, tables.project_types)}</span>
                  {template.project_modality_id && <span className="template-type-chip">{tables.project_modalities.find((item) => item.id === template.project_modality_id)?.name ?? "Modalidade indisponivel"}</span>}
                  <span>{steps.length} etapas</span>
                  <span>{prompts.length} prompts</span>
                  {pendingPrompts > 0 && <span className="warning-chip">{pendingPrompts} pendentes</span>}
                </div>
                <div className="template-card-stage-list" aria-label={`Etapas de ${template.name}`}>
                  {steps.map((step, index) => <div className="template-card-stage-row" key={step.id}>
                    <span>{index + 1}</span>
                    {editingStepId === step.id ? <form className="template-stage-inline-form" onSubmit={(event) => {
                      event.preventDefault(); event.stopPropagation(); setStepBusyId(step.id);
                      void onRenameStep(step.id, editingStepName).then((saved) => { if (saved) setEditingStepId(null); }).finally(() => setStepBusyId(null));
                    }} onClick={(event) => event.stopPropagation()}>
                      <input autoFocus value={editingStepName} onChange={(event) => setEditingStepName(event.target.value)} aria-label={`Novo nome de ${step.name}`} />
                      <button className="icon-button" type="submit" title="Salvar nome" disabled={stepBusyId === step.id}><Check size={15} /></button>
                      <button className="icon-button" type="button" title="Cancelar" onClick={() => setEditingStepId(null)}><X size={15} /></button>
                    </form> : <strong>{step.name}</strong>}
                    <small>{step.description || "Sem descrição"}</small>
                    <span className="template-stage-inline-actions">
                      <button className="icon-button" type="button" title={`Renomear ${step.name}`} onClick={(event) => { event.stopPropagation(); setEditingStepId(step.id); setEditingStepName(step.name); }}><Pencil size={14} /></button>
                      <button className="icon-button danger" type="button" title={`Retirar ${step.name} deste template`} disabled={stepBusyId === step.id} onClick={(event) => { event.stopPropagation(); setStepBusyId(step.id); void onRemoveStep(step).finally(() => setStepBusyId(null)); }}><Trash2 size={14} /></button>
                    </span>
                  </div>)}
                  {!steps.length && <p>Nenhuma etapa. Abra o editor para montar este template.</p>}
                </div>
                <div className="template-card-actions">
                  <button className="secondary-button compact" type="button" onClick={(event) => { event.stopPropagation(); setEditingTemplateId(template.id); }}><Route size={16} /> Organizar etapas</button>
                  <button className="secondary-button compact" type="button" onClick={(event) => { event.stopPropagation(); setAutoStagePickerTemplateId(template.id); setEditingTemplateId(template.id); }}><Plus size={16} /> Adicionar etapa</button>
                  <button className="icon-button danger" type="button" title="Excluir template" onClick={(event) => { event.stopPropagation(); void onDelete(template); }}><Trash2 size={18} /></button>
                </div>
              </article>
            );
          })}
          </div>
        </section>)}

        {templates.length === 0 && (
          <div className="empty-state">
            <Route size={34} />
            <strong>Nenhum template encontrado</strong>
            <span>Cadastre ou salve uma jornada real como template.</span>
          </div>
        )}
      </section>

      </>}

    </>
  );
}

function NewProjectPanel({ tables, currentUser, onCreate, onClose }: { tables: Tables; currentUser: AppUser | null; onCreate: (form: NewProjectFormState) => void; onClose: () => void }) {
  const activeUsers = tables.app_users.filter((user) => user.status === "ativo");
  const [form, setForm] = useState<NewProjectFormState>({
    name: "",
    company: "",
    client_id: "",
    new_client_name: "",
    responsible_user_id: currentUser?.id ?? "",
    project_type_id: "",
    project_modality_id: "",
    new_project_modality_name: "",
    journey_template_id: "",
    notes: "",
  });
  const projectTemplates = availableProjectTemplates(tables.journey_templates, form.project_type_id, form.project_modality_id === "__new" ? "" : form.project_modality_id);

  return (
    <section className="form-panel inline-panel">
      <div className="form-heading">
        <div>
          <h2>Criar projeto</h2>
        </div>
        <button className="icon-button" type="button" title="Fechar" aria-label="Fechar criacao de projeto" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="form-grid">
        <Field label="Nome do projeto" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
        <ClientSearchSelect
          label="Cliente"
          value={form.client_id}
          clients={tables.clients}
          allowCreate
          onChange={(value) => {
            const client = tables.clients.find((item) => item.id === value);
            setForm({ ...form, client_id: value, company: client?.name ?? form.company, new_client_name: value === "__new" ? form.new_client_name : "" });
          }}
        />
        {form.client_id === "__new" && <Field label="Novo cliente" value={form.new_client_name} onChange={(value) => setForm({ ...form, new_client_name: value, company: value })} />}
        <SelectField label="Responsável" value={form.responsible_user_id} onChange={(value) => setForm({ ...form, responsible_user_id: value })} options={activeUsers.map(toOption)} />
        <SelectField label="Tipo de projeto *" emptyLabel="Selecione o tipo" value={form.project_type_id} onChange={(value) => setForm((current) => ({ ...current, project_type_id: value, project_modality_id: "", new_project_modality_name: "", journey_template_id: templateAfterTypeChange(current.journey_template_id, value, "", tables.journey_templates) }))} options={tables.project_types.filter((type) => type.status === "ativo" || type.id === form.project_type_id).map(toOption)} />
        <ModalitySearchSelect
          value={form.project_modality_id}
          projectTypeId={form.project_type_id}
          modalities={tables.project_modalities}
          newName={form.new_project_modality_name}
          onChange={(value, newName = "") => setForm((current) => ({ ...current, project_modality_id: value, new_project_modality_name: newName, journey_template_id: templateAfterTypeChange(current.journey_template_id, current.project_type_id, value === "__new" ? "" : value, tables.journey_templates) }))}
        />
        <SelectField
          label="Template"
          value={form.journey_template_id}
          onChange={(value) => {
            const template = tables.journey_templates.find((item) => item.id === value);
            setForm((current) => ({ ...current, journey_template_id: value, project_type_id: template?.project_type_id ?? current.project_type_id, project_modality_id: template?.project_modality_id ?? current.project_modality_id, new_project_modality_name: "" }));
          }}
          options={projectTemplates.map((template) => ({ value: template.id, label: `${template.name} · ${templateTypeName(template, tables.project_types)}` }))}
          emptyLabel="Comecar vazio"
        />
        <TextArea label="Observações iniciais" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
      </div>
      <div className="project-create-footer">
        <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
        {!form.project_type_id && <span className="rj-muted">Escolha o tipo de projeto para criar.</span>}
        <button className="primary-button" type="button" disabled={!form.name.trim() || !form.project_type_id} onClick={() => onCreate(form)}><Save size={16} />Criar jornada</button>
      </div>
    </section>
  );
}

function ManagementView({
  tables,
  workspaces,
  query,
  setQuery,
  onOpenProject,
  onOpenClient,
}: {
  tables: Tables;
  workspaces: WorkspaceOverview[];
  query: string;
  setQuery: (query: string) => void;
  onOpenProject: (id: string) => void;
  onOpenClient: (id: string) => void;
}) {
  const [view, setView] = useState<"attention" | "portfolio" | "clients">("attention");
  const [attentionFilter, setAttentionFilter] = useState<ManagementAttentionKind | "ativos">("ativos");
  const [clientFilter, setClientFilter] = useState("todos");
  const [responsibleFilter, setResponsibleFilter] = useState("todos");
  const [typeFilter, setTypeFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState<ManagementStatus | "todos">("todos");
  const activeUsers = tables.app_users.filter((user) => user.status === "ativo");
  const projectRows = buildManagementProjectRows({
    projects: tables.projects,
    clients: tables.clients,
    projectTypes: tables.project_types,
    users: tables.app_users,
    steps: tables.project_steps,
    workspaces,
  }).sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  const filteredRows = filterManagementProjectRows(projectRows, {
    search: query,
    clientId: clientFilter,
    responsibleUserId: responsibleFilter,
    projectTypeId: typeFilter,
    status: statusFilter,
  });
  const searchedRows = filterManagementProjectRows(projectRows, { search: query });
  const clientRows = buildManagementClientRows(tables.clients, projectRows).sort((a, b) => b.projectCount - a.projectCount || a.name.localeCompare(b.name));
  const activeProjects = projectRows.filter((row) => !["concluido", "arquivado"].includes(row.status));
  const allAttentionRows = buildManagementAttentionRows(projectRows);
  const activeAttentionCount = allAttentionRows.filter((row) => row.status !== "concluido").length;
  const filteredAttentionRows = buildManagementAttentionRows(searchedRows);
  const attentionRows = filteredAttentionRows.filter((row) => attentionFilter === "ativos" ? row.status !== "concluido" : row.reasons.includes(attentionFilter));
  const visibleActiveProjects = activeProjects.filter((row) => searchedRows.some((searched) => searched.id === row.id));
  const visibleClients = clientRows.filter((client) => client.projectCount > 0 && normalizeSearchText(`${client.name} ${client.company}`).includes(normalizeSearchText(query)));
  const attentionKinds: ManagementAttentionKind[] = ["regularizacao_pendente", "bloqueado", "sem_cliente", "sem_responsavel", "sem_tipo", "concluido_com_etapas_abertas"];

  const STALE_DAYS = 14;
  const now = Date.now();
  const workspaceOf = (id: string) => workspaces.find((item) => item.projectId === id);
  const isActive = (row: { status: string }) => !["concluido", "arquivado"].includes(row.status);
  const daysSince = (iso: string) => iso ? Math.floor((now - new Date(iso).getTime()) / 86_400_000) : 0;
  const staleRows = searchedRows.filter((row) => isActive(row) && daysSince(row.updatedAt) >= STALE_DAYS).sort((a, b) => daysSince(b.updatedAt) - daysSince(a.updatedAt));
  const workspacePendingRows = searchedRows.filter((row) => isActive(row) && workspaceOf(row.id)?.status !== "organizado");
  type Focus = ManagementAttentionKind | "ativos" | "parados" | "local";
  const [focus, setFocus] = useState<Focus>("parados");
  const focusRows = focus === "parados" ? staleRows
    : focus === "local" ? workspacePendingRows
      : focus === "ativos" ? searchedRows.filter(isActive)
        : filteredAttentionRows.filter((row) => row.reasons.includes(focus));
  const reasonsFor = (id: string) => filteredAttentionRows.find((row) => row.id === id)?.reasons ?? [];
  const people = activeUsers.map((user) => {
    const mine = projectRows.filter((row) => row.responsibleUserId === user.id);
    const active = mine.filter(isActive);
    return {
      user,
      active: active.length,
      stale: active.filter((row) => daysSince(row.updatedAt) >= STALE_DAYS).length,
      localPending: active.filter((row) => workspaceOf(row.id)?.status !== "organizado").length,
      done30: mine.filter((row) => row.status === "concluido" && daysSince(row.updatedAt) <= 30).length,
      top: [...active].sort((a, b) => daysSince(b.updatedAt) - daysSince(a.updatedAt)).slice(0, 4),
    };
  }).filter((person) => person.active || person.done30);
  const focusOptions: Array<{ key: Focus; label: string; count: number; tone?: string }> = [
    { key: "parados", label: `Parados há ${STALE_DAYS}+ dias`, count: staleRows.length, tone: "warning" },
    { key: "local", label: "Local de trabalho pendente", count: workspacePendingRows.length, tone: "warning" },
    ...attentionKinds.map((kind) => ({ key: kind as Focus, label: managementAttentionLabels[kind], count: filteredAttentionRows.filter((row) => row.reasons.includes(kind)).length })),
    { key: "ativos", label: "Todos em andamento", count: searchedRows.filter(isActive).length },
  ];

  return (
    <>
      <PageHeader title="Gestão" subtitle="O que precisa de atenção agora, por motivo, responsável e cliente." />

      <div className="management-view-bar rj-management-bar">
        <div className="projects-segment" role="group" aria-label="Visão da gestão">
          <button type="button" aria-pressed={view === "attention"} onClick={() => setView("attention")}><ListChecks size={16} />Atenção <span>{staleRows.length + activeAttentionCount}</span></button>
          <button type="button" aria-pressed={view === "portfolio"} onClick={() => setView("portfolio")}><UserRound size={16} />Responsáveis</button>
          <button type="button" aria-pressed={view === "clients"} onClick={() => setView("clients")}><Users size={16} />Clientes</button>
        </div>
        <label className="rj-search-box rj-management-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar projeto ou cliente" aria-label="Buscar na gestão" /></label>
      </div>

      {view === "attention" && <section className="rj-attention">
        <div className="rj-attention-kpis">
          {focusOptions.filter((option) => option.count > 0 || option.key === "parados" || option.key === "ativos").map((option) => (
            <button key={option.key} type="button" className={`rj-attention-kpi ${focus === option.key ? "is-active" : ""} ${option.tone && option.count ? `is-${option.tone}` : ""}`} onClick={() => setFocus(option.key)}>
              <strong>{option.count}</strong><span>{option.label}</span>
            </button>
          ))}
        </div>
        <div className="rj-card rj-attention-list">
          {focusRows.map((row) => {
            const workspace = workspaceOf(row.id);
            const idle = daysSince(row.updatedAt);
            return (
              <div className="rj-attention-row" key={row.id}>
                <div className="rj-attention-id">
                  <button type="button" className="management-link" onClick={() => onOpenProject(row.id)}>{row.name}</button>
                  <small>{row.clientId ? <button type="button" className="rj-link-button" onClick={() => onOpenClient(row.clientId!)}>{row.clientName}</button> : row.clientName} · {row.responsibleName || "Sem responsável"} · {row.projectTypeName}</small>
                </div>
                <div className="rj-attention-tags">
                  {idle >= STALE_DAYS && isActive(row) && <span className="management-reason is-stale">sem movimento há {idle} dias</span>}
                  {isActive(row) && workspace?.status !== "organizado" && <span className="management-reason">local de trabalho {workspace?.status === "parcial" ? "parcial" : "pendente"}</span>}
                  {reasonsFor(row.id).map((reason) => <span key={reason} className={`management-reason ${reason}`}>{managementAttentionLabels[reason]}</span>)}
                </div>
                <span className="rj-attention-next">{row.nextStepName ? `Próxima: ${row.nextStepName}` : ""}</span>
                <span className="management-attention-progress">{row.completedSteps}/{row.totalSteps} etapas</span>
                <button type="button" className="secondary-button" onClick={() => onOpenProject(row.id)}>Abrir <ChevronRight size={15} /></button>
              </div>
            );
          })}
          {focusRows.length === 0 && <div className="empty-state"><CheckCircle2 size={28} /><strong>Nada nesta fila</strong><span>Nenhum projeto com este motivo de atenção.</span></div>}
        </div>
      </section>}

      {view === "portfolio" && <section className="rj-people">
        {people.map((person) => (
          <article className="rj-card rj-person" key={person.user.id}>
            <header><span className="rj-avatar">{person.user.name.slice(0, 1).toUpperCase()}</span><strong>{person.user.name}</strong></header>
            <div className="rj-person-stats">
              <span><strong>{person.active}</strong> em andamento</span>
              <span className={person.stale ? "is-warning" : ""}><strong>{person.stale}</strong> parados</span>
              <span className={person.localPending ? "is-warning" : ""}><strong>{person.localPending}</strong> local pendente</span>
              <span className="is-good"><strong>{person.done30}</strong> concluídos (30 dias)</span>
            </div>
            {person.top.length > 0 && <ul>{person.top.map((row) => <li key={row.id}><button type="button" onClick={() => onOpenProject(row.id)}><span>{row.name}<small>{row.clientName}</small></span><em>{daysSince(row.updatedAt)}d</em></button></li>)}</ul>}
          </article>
        ))}
        {people.length === 0 && <div className="empty-state"><Users size={28} /><strong>Nenhum responsável com projetos</strong></div>}
      </section>}

      {view === "clients" && <section className="list-panel management-panel">
        <div className="panel-heading">
          <div>
            <h2>Clientes consolidados</h2>
            <p>Clique num cliente para abrir a página dele.</p>
          </div>
        </div>
        <div className="management-client-grid">
          {visibleClients.map((client) => (
            <button className="management-client-card" type="button" key={client.id} onClick={() => onOpenClient(client.id)}>
              <span className="management-client-title"><ClientLogo client={tables.clients.find((item) => item.id === client.id) ?? { name: client.name, logo_url: null }} /><strong>{client.name}</strong>{tables.clients.find((item) => item.id === client.id)?.client_kind && <span className="client-kind-badge">{tables.clients.find((item) => item.id === client.id)?.client_kind}</span>}</span>
              <div className="management-client-stats">
                <small>{client.projectCount} projeto(s)</small>
                <small>{client.activeProjectCount} ativo(s)</small>
                <small>{client.completedProjectCount} concluído(s)</small>
              </div>
              <div className="progress-bar"><span style={{ width: `${client.averageProgress}%` }} /></div>
              <small>{client.averageProgress}% de progresso médio</small>
            </button>
          ))}
        </div>
        {visibleClients.length === 0 && <div className="empty-state"><Users size={28} /><strong>Nenhum cliente encontrado</strong></div>}
      </section>}
    </>
  );
}

function ClientsView({
  tables,
  workspaces,
  clientContextCounts,
  baseUrl,
  currentUser,
  query,
  setQuery,
  onCreate,
  onSaveIdentity,
  onOpen,
  onOpenProject,
}: {
  tables: Tables;
  workspaces: WorkspaceOverview[];
  clientContextCounts: Array<{ clientId: string; count: number }>;
  baseUrl: string;
  currentUser: AppUser | null;
  query: string;
  setQuery: (query: string) => void;
  onCreate: (form: NewClientFormState) => void;
  onSaveIdentity: (id: string, payload: Partial<Client>, logoFile: File | null) => Promise<boolean>;
  onOpen: (id: string) => void;
  onOpenProject: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [workspaceClient, setWorkspaceClient] = useState<Client | null>(null);
  const [contextClient, setContextClient] = useState<Client | null>(null);

  const activeClients = tables.clients.filter((client) => client.is_active && client.status !== "arquivado");
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
          <span>Etapas concluídas</span>
          <strong>{doneSteps}</strong>
        </article>
        <article className="metric-card">
          <span>Etapas bloqueadas</span>
          <strong>{blockedSteps}</strong>
        </article>
      </section>

      {showForm && <NewClientPanel tables={tables} currentUser={currentUser} onCreate={onCreate} />}

      <section className="list-panel">
        <div className="panel-heading">
          <div>
            <h2>Carteira de clientes</h2>
            <p>Compare clientes, contextos, locais de projetos e links em uma unica lista.</p>
          </div>
        </div>
        <ClientPortfolio
          baseUrl={baseUrl}
          clients={tables.clients}
          projects={tables.projects}
          users={tables.app_users}
          workspaces={workspaces}
          contextCounts={clientContextCounts}
          query={query}
          setQuery={setQuery}
          onOpenClient={onOpen}
          onOpenProject={onOpenProject}
          onEditClient={(id) => setEditingClient(tables.clients.find((client) => client.id === id) ?? null)}
          onActivateClient={(id) => void onSaveIdentity(id, { is_active: true }, null)}
          onOpenContexts={(id) => setContextClient(tables.clients.find((client) => client.id === id) ?? null)}
          onOpenWorkspaces={(id) => setWorkspaceClient(tables.clients.find((client) => client.id === id) ?? null)}
          projectTypes={tables.project_types.filter((type) => type.status !== "arquivado")}
        />
      </section>
      {editingClient && <ClientProfileDialog key={editingClient.id} client={editingClient} users={tables.app_users} onClose={() => setEditingClient(null)} onSave={onSaveIdentity} />}
      {workspaceClient && <ClientWorkspacesDialog baseUrl={baseUrl} clientId={workspaceClient.id} clientName={workspaceClient.name} onClose={() => setWorkspaceClient(null)} onOpenProject={onOpenProject} />}
      {contextClient && <ClientContextLibrary key={contextClient.id} baseUrl={baseUrl} clientId={contextClient.id} clientName={contextClient.name} onClose={() => setContextClient(null)} />}
    </>
  );
}

function NewClientPanel({ tables, currentUser, onCreate }: { tables: Tables; currentUser: AppUser | null; onCreate: (form: NewClientFormState) => void }) {
  const defaultTemplate = getDefaultClientTemplate(tables.journey_templates);
  const activeUsers = tables.app_users.filter((user) => user.status === "ativo");
  const [form, setForm] = useState<NewClientFormState>({
    name: "",
    company: "",
    logo_url: "",
    logo_file: null,
    client_kind: "",
    responsible_user_id: currentUser?.id ?? "",
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
        <ClientLogoPicker name={form.name} logoUrl={form.logo_url} file={form.logo_file} onFile={(file) => setForm((current) => ({ ...current, logo_file: file }))} onRemove={() => setForm((current) => ({ ...current, logo_file: null, logo_url: "" }))} />
        <SelectField label="Categoria do cliente" value={form.client_kind} onChange={(value) => setForm({ ...form, client_kind: value as ClientKind | "" })} options={clientKindOptions} emptyLabel="Não definida" />
        <SelectField label="Responsável interno" value={form.responsible_user_id} onChange={(value) => setForm({ ...form, responsible_user_id: value })} options={activeUsers.map(toOption)} />
        <Field label="Mes de entrada" value={form.entry_month} onChange={(value) => setForm({ ...form, entry_month: value })} />
        <SelectField label="Produto / tipo" value={form.project_type_id} onChange={(value) => setForm({ ...form, project_type_id: value })} options={tables.project_types.map(toOption)} />
        <SelectField
          label="Template de jornada"
          value={form.journey_template_id}
          onChange={(value) => setForm({ ...form, journey_template_id: value })}
          options={clientTemplates.map(toOption)}
          emptyLabel="Comecar vazio"
        />
        <TextArea label="Observações iniciais" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
      </div>
    </section>
  );
}

function ClientProfileDialog({ client, users, onClose, onSave }: {
  client: Client;
  users: AppUser[];
  onClose: () => void;
  onSave: (id: string, payload: Partial<Client>, logoFile: File | null) => Promise<boolean>;
}) {
  const [name, setName] = useState(client.name);
  const [company, setCompany] = useState(client.company ?? "");
  const [clientKind, setClientKind] = useState<ClientKind | "">(client.client_kind ?? "");
  const [logoUrl, setLogoUrl] = useState(client.logo_url ?? "");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isActive, setIsActive] = useState(client.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Informe o nome do cliente."); return; }
    setSaving(true);
    const saved = await onSave(client.id, {
      name: name.trim(), company: company.trim() || null,
      client_kind: clientKind || null, logo_url: logoUrl || null,
      is_active: isActive,
    }, logoFile);
    setSaving(false);
    if (saved) onClose();
    else setError("Não foi possível salvar. Confira a mensagem acima e tente novamente.");
  }

  return <div className="modal-backdrop" role="presentation" onClick={onClose}>
    <form className="client-profile-dialog glass-panel" role="dialog" aria-modal="true" aria-label={`Editar ${client.name}`} onClick={(event) => event.stopPropagation()} onSubmit={(event) => void submit(event)}>
      <div className="modal-heading"><h2>Editar cliente</h2><button className="icon-button" type="button" title="Fechar" onClick={onClose}><X size={17} /></button></div>
      <div className="form-grid">
        <Field label="Nome do cliente" value={name} onChange={setName} />
        <Field label="Empresa / unidade" value={company} onChange={setCompany} />
        <ClientLogoPicker name={name} logoUrl={logoUrl} file={logoFile} onFile={setLogoFile} onRemove={() => { setLogoFile(null); setLogoUrl(""); }} />
        <SelectField label="Categoria do cliente" value={clientKind} onChange={(value) => setClientKind(value as ClientKind | "")} options={clientKindOptions} emptyLabel="Não definida" />
        <label className="client-active-field"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> Cliente ativo na lista</label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="inline-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Salvar cliente</button></div>
    </form>
  </div>;
}

function ClientLogoPicker({ name, logoUrl, file, onFile, onRemove }: {
  name: string;
  logoUrl: string;
  file: File | null;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <div className="client-logo-field">
    <span className="field-label">Logo do cliente</span>
    <div className="client-logo-input-row">
      <ClientLogo client={{ name, logo_url: previewUrl || logoUrl }} />
      <label className="secondary-button client-logo-upload"><Upload size={16} /> Escolher imagem<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) { const message = validateClientLogo(selected); setError(message ?? ""); if (!message) onFile(selected); } event.currentTarget.value = ""; }} /></label>
      {(file || logoUrl) && <button className="icon-button" type="button" title="Remover logo" aria-label="Remover logo" onClick={onRemove}><Trash2 size={16} /></button>}
    </div>
    {error && <small className="form-error" role="alert">{error}</small>}
    <small>PNG, JPEG, WebP ou GIF, ate 3 MB.</small>
  </div>;
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
  onSaveTemplate: (client: Client, request?: { presentationDefaults?: Record<string, string[]> }) => void | Promise<void>;
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
        <aside className="step-rail collapsible-rail">
          <div className="rail-heading">
            <strong>Jornada</strong>
            <span>{doneSteps} concluidas</span>
          </div>
          {steps.map((step) => (
            <button key={step.id} className={`step-item ${selectedStep.id === step.id ? "active" : ""}`} title={step.name} onClick={() => onSelectStep(step.id)}>
              <span className={`step-dot ${step.status}`}>
                {step.status === "concluido" ? <Check size={13} /> : step.step_order}
              </span>
              <span className="step-rail-short-label" aria-hidden="true">{compactStepLabel(step.name)}</span>
              <span className="step-rail-details">
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
            <TextArea label="Pre-requisito / evidência para concluir" value={selectedStep.required_evidence_label} onChange={() => undefined} onBlur={(value) => onUpdateStep(selectedStep.id, { required_evidence_label: value })} />
            <TextArea label="Observações da etapa" value={selectedStep.notes} onChange={() => undefined} onBlur={(value) => onUpdateStep(selectedStep.id, { notes: value })} />
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
              { value: "concluido", label: "Concluído" },
              { value: "bloqueado", label: "Bloqueado" },
              { value: "arquivado", label: "Arquivado" },
            ]}
          />
        </aside>
      </section>
    </>
  );
}

function ClientBlockJourneyView({
  client,
  onOpenProject,
  steps,
  selectedStep,
  tables,
  currentUser,
  onSelectStep,
  onBack,
  onUpdateStep,
  onAddNextStep,
  onSaveTemplate,
  onCreatePromptFromBlock,
}: {
  client: Client;
  onOpenProject: (id: string) => void;
  steps: ClientStep[];
  selectedStep: ClientStep;
  tables: Tables;
  currentUser: AppUser | null;
  onSelectStep: (id: string) => void;
  onBack: () => void;
  onUpdateStep: (id: string, patch: Partial<ClientStep>) => void;
  onAddNextStep: (clientId: string, name: string) => void;
  onSaveTemplate: (client: Client, request?: { presentationDefaults?: Record<string, string[]> }) => void | Promise<void>;
  onCreatePromptFromBlock: (payload: { title: string; content: string; ai_tool_id?: string | null; short_description?: string | null }) => Promise<Prompt | null>;
}) {
  const [payload, setPayload] = useState<StepBuilderPayload | null>(null);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [mode, setMode] = useState<JourneyMode>("execute");
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newStepName, setNewStepName] = useState("");
  const [templatePresentationDefaults, setTemplatePresentationDefaults] = useState<Record<string, string[]>>({});
  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Set<string>>(() => new Set());
  const presentationSaveQueueRef = useRef(Promise.resolve());
  const done = steps.filter((step) => step.status === "concluido").length;
  const progress = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const base = `${cloudflareApiUrl}/api/journey-steps/client/${encodeURIComponent(selectedStep.id)}`;

  useEffect(() => { void loadStructure(); }, [selectedStep.id]);

  async function request(path: string, init?: RequestInit) {
    const response = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const body = await response.json() as { data?: StepBuilderPayload | { data?: StepBuilderPayload }; error?: string };
    const payload = (body.data && typeof body.data === "object" && "data" in body.data
      ? body.data.data
      : body.data) as StepBuilderPayload | undefined;
    if (!response.ok || !payload) throw new Error(body.error ?? "Não foi possível atualizar a etapa do cliente.");
    return payload;
  }

  async function loadStructure() {
    try {
      let response = await fetch(`${base}/structure?userId=${encodeURIComponent(currentUser?.id ?? "")}`);
      if (response.status === 404 || response.status === 500) response = await fetch(`${base}/initialize`, { method: "POST" });
      const body = await response.json() as { data?: StepBuilderPayload | { data?: StepBuilderPayload }; error?: string };
      const payload = (body.data && typeof body.data === "object" && "data" in body.data
        ? body.data.data
        : body.data) as StepBuilderPayload | undefined;
      if (!response.ok || !payload) throw new Error(body.error ?? "Não foi possível carregar a jornada.");
      setPayload(payload);
      setCollapsedBlockIds(new Set(payload.presentation?.collapsedBlockIds ?? []));
    } catch (error) {
      window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message: error instanceof Error ? error.message : "Falha ao carregar a jornada do cliente." } }));
    }
  }

  async function addBlock(item: BlockCatalogItem | string) {
    const catalogItem = typeof item === "string" ? blockCatalog.find((candidate) => candidate.type === item) ?? { key: item, type: item, label: item, icon: FileText } : item;
    const next = await request("/blocks", { method: "POST", body: JSON.stringify({ type: catalogItem.type, title: catalogItem.title, config: catalogItem.config, updatedBy: currentUser?.name ?? null }) });
    setPayload(next);
    setEditingBlockId(next.document.blocks[next.document.blocks.length - 1]?.id ?? null);
    setIsAdding(false);
  }

  async function updateBlock(blockId: string, patch: Partial<StepBuilderBlock>) {
    setPayload(await request(`/blocks/${encodeURIComponent(blockId)}`, { method: "PATCH", body: JSON.stringify({ ...patch, updatedBy: currentUser?.name ?? null }) }));
  }

  async function saveValue(blockId: string, value: unknown) {
    const next = await request(`/block-values/${encodeURIComponent(blockId)}`, { method: "PATCH", body: JSON.stringify({ value, updatedBy: currentUser?.name ?? null }) });
    setPayload(next);
    if (next.completion.status !== selectedStep.status) onUpdateStep(selectedStep.id, { status: next.completion.status });
  }

  async function completeCurrentStep() {
    if (!payload) return;
    const forcePending = !payload.completion.canComplete;
    if (forcePending && !window.confirm(`Esta etapa possui ${payload.completion.reasons.length} bloco(s) pendente(s). Deseja concluir esses blocos e finalizar a etapa?`)) return;
    try {
      const next = await request("/complete", { method: "POST", body: JSON.stringify({ forcePending, updatedBy: currentUser?.name ?? null }) });
      setPayload(next);
      onUpdateStep(selectedStep.id, { status: "concluido" });
      window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message: forcePending ? "Blocos pendentes concluidos e etapa finalizada." : "Etapa concluida." } }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message: error instanceof Error ? error.message : "Não foi possível concluir a etapa." } }));
    }
  }

  function updatePresentation(update: (current: Set<string>) => Set<string>, reset = false) {
    setCollapsedBlockIds((current) => {
      const previous = new Set(current);
      const next = update(new Set(current));
      presentationSaveQueueRef.current = presentationSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const saved = await request("/presentation", {
            method: "PATCH",
            body: JSON.stringify({ userId: currentUser?.id, collapsedBlockIds: [...next], reset }),
          });
          setPayload(saved);
          setCollapsedBlockIds(new Set(saved.presentation?.collapsedBlockIds ?? []));
        })
        .catch((error) => {
          setCollapsedBlockIds(previous);
          window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message: error instanceof Error ? error.message : "Não foi possível salvar a visualizacao da etapa." } }));
        });
      return next;
    });
  }

  function move(blockId: string, direction: -1 | 1) {
    if (!payload) return;
    const blockIds = payload.document.blocks.map((block) => block.id);
    const index = blockIds.indexOf(blockId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= blockIds.length) return;
    [blockIds[index], blockIds[nextIndex]] = [blockIds[nextIndex], blockIds[index]];
    void request("/blocks/reorder", { method: "POST", body: JSON.stringify({ blockIds, updatedBy: currentUser?.name ?? null }) }).then(setPayload);
  }

  const projectLike: Project = { id: client.id, name: client.name, company: client.company, client_id: client.id, responsible: getResponsibleName(client, tables.app_users), responsible_user_id: client.responsible_user_id, project_type_id: client.project_type_id, journey_template_id: client.journey_template_id, status: "em_andamento", notes: client.notes, created_at: client.created_at, updated_at: client.updated_at };
  const stepLike: ProjectStep = { id: selectedStep.id, project_id: client.id, source_journey_step_id: selectedStep.source_journey_step_id, name: selectedStep.name, description: selectedStep.description, step_order: selectedStep.step_order, objective: selectedStep.objective, ai_tool_id: null, expected_output: selectedStep.required_evidence_label, execution_instructions: null, status: selectedStep.status, notes: selectedStep.notes };
  const blocks = payload?.document.blocks ?? [];

  return (
    <>
      <JourneyContextBar>
        <button className="ghost-button" onClick={onBack}><PanelLeft size={17} /> Clientes</button>
        <div className="client-journey-identity"><ClientLogo client={client} large /><div className="journey-context-copy"><span className="eyebrow">Ramos Jornadas</span><h1>{client.name} {client.client_kind && <span className="client-kind-badge">{client.client_kind}</span>}</h1><p>{client.company || "Jornada do cliente"}</p></div></div>
        <div className="journey-progress"><strong>{progress}%</strong><div className="progress-bar"><span style={{ width: `${progress}%` }} /></div></div>
      </JourneyContextBar>
      <div className="client-workspace-shortcut"><button className="secondary-button" type="button" onClick={() => setShowWorkspaces(true)}><FolderOpen size={16} /> Locais de projetos</button></div>
      <section className="journey-layout block-journey-layout">
        <JourneyStepRail ownerType="client" ownerId={client.id} currentUser={currentUser} steps={steps} selectedStepId={selectedStep.id} onSelectStep={onSelectStep} />
        <section className="work-surface block-work-surface">
          <div className={`journey-command-bar mode-${mode}`}>
            <div className="journey-step-identity"><span className="eyebrow">Etapa do cliente</span>{mode === "edit" ? <InlineText defaultValue={selectedStep.name} className="inline-title" onSave={(name) => onUpdateStep(selectedStep.id, { name })} /> : <strong className="journey-step-title">{selectedStep.name}</strong>}</div>
            <div className="journey-mode-switch"><button className={mode === "execute" ? "active" : ""} onClick={() => setMode("execute")}><CheckCircle2 size={15} /> Executar</button><button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}><Pencil size={15} /> Editar estrutura</button></div>
            <div className="journey-block-view-actions" role="group" aria-label="Visibilidade dos blocos"><button className="secondary-button" type="button" onClick={() => updatePresentation(() => new Set())}><ChevronDown size={16} /> Abrir todos</button><button className="secondary-button" type="button" onClick={() => updatePresentation(() => collapseAllBlockIds(blocks.map((block) => block.id)))}><ChevronUp size={16} /> Recolher todos</button><button className="ghost-button" type="button" onClick={() => updatePresentation(() => new Set(), true)} title="Abrir todos e esquecer esta preferencia"><RefreshCw size={15} /> Restaurar</button></div>
            <button className="secondary-button" type="button" disabled={!payload} title={payload?.completion.canComplete ? "Concluir etapa" : "Concluir os blocos pendentes e finalizar a etapa"} onClick={() => void completeCurrentStep()}><CheckCircle2 size={16} /> Concluir</button>
            {mode === "edit" && <><form className="quick-step-form" onSubmit={(event) => { event.preventDefault(); onAddNextStep(client.id, newStepName || "Nova etapa"); setNewStepName(""); }}><input value={newStepName} onChange={(event) => setNewStepName(event.target.value)} placeholder="Nova etapa" /><button className="secondary-button"><Plus size={16} /> Adicionar etapa</button></form><div className="block-add-wrap"><button className="primary-button" onClick={() => setIsAdding((open) => !open)}><Plus size={17} /> Adicionar bloco</button>{isAdding && <BlockTypeMenu onSelect={addBlock} />}</div><button className="secondary-button" type="button" onClick={() => { const next = { ...templatePresentationDefaults, [selectedStep.id]: [...collapsedBlockIds] }; setTemplatePresentationDefaults(next); window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message: "Visual inicial desta etapa será salvo no template." } })); }}><PanelTop size={16} /> Salvar visual inicial</button><button className="secondary-button" onClick={() => onSaveTemplate(client, { presentationDefaults: templatePresentationDefaults })}><Save size={16} /> Salvar template</button></>}
          </div>
          <div className="step-auto-status"><span className={`chip active ${payload?.completion.status ?? selectedStep.status}`}>{formatStepStatus(payload?.completion.status ?? selectedStep.status)}</span><span>{payload ? `${payload.completion.completedBlocks}/${payload.completion.totalBlocks} blocos completos` : "Carregando blocos"}</span><div className="progress-bar"><span style={{ width: `${payload?.completion.progress ?? 0}%` }} /></div></div>
          {!payload && <div className="empty-state compact"><Loader2 className="spin" size={23} /> Carregando jornada...</div>}
          {payload && !blocks.length && <div className="empty-block-canvas"><Sparkles size={30} /><strong>Etapa limpa</strong><span>{mode === "edit" ? "Adicione apenas os blocos necessarios." : "Esta etapa ainda não possui conteúdo para executar."}</span>{mode === "edit" && <button className="primary-button" onClick={() => setIsAdding(true)}><Plus size={16} /> Adicionar primeiro bloco</button>}</div>}
          <div className="block-canvas">{blocks.map((block, index) => <StepBuilderBlockCard key={block.id} block={block} index={index} total={blocks.length} value={payload?.values.find((value) => value.block_id === block.id)?.value} tables={tables} summaries={[]} summaryItems={[]} generatedPrompts={[]} project={projectLike} selectedStep={stepLike} currentUser={currentUser} onUpdateSummaryItem={() => undefined} onSetSummaryItemSelection={() => undefined} onDeleteSummaryItem={() => undefined} onSaveGeneratedPrompt={async () => false} onArchiveGeneratedPrompt={() => undefined} onCreatePromptFromBlock={onCreatePromptFromBlock} mode={mode} isEditing={mode === "edit" && editingBlockId === block.id} isCollapsed={collapsedBlockIds.has(block.id)} onToggleCollapse={() => updatePresentation((current) => toggleCollapsedBlockIds(current, block.id))} onDuplicate={() => void addBlock(block.type)} onEdit={() => setEditingBlockId((current) => current === block.id ? null : block.id)} onUpdate={(patch) => void updateBlock(block.id, patch)} onDelete={() => void request(`/blocks/${encodeURIComponent(block.id)}`, { method: "DELETE" }).then(setPayload)} onMove={move} onSaveValue={(value) => void saveValue(block.id, value)} onOpenSummary={() => undefined} ownerType="client" />)}</div>
        </section>
      </section>
      {showWorkspaces && <ClientWorkspacesDialog baseUrl={cloudflareApiUrl} clientId={client.id} clientName={client.name} onClose={() => setShowWorkspaces(false)} onOpenProject={onOpenProject} />}
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
        <h2>Evidências e arquivos</h2>
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
        {links.length === 0 && <span className="muted">Nenhuma evidência vinculada.</span>}
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
  files: JourneyRuntimeFile[];
  completion: { status: StepStatus; progress: number; completedBlocks: number; totalBlocks: number; canComplete: boolean; reasons: Array<{ message: string; blockId?: string }> };
  presentation?: { collapsedBlockIds: string[]; customized: boolean };
};

type BlockCatalogItem = { key: string; type: string; label: string; icon: typeof Layers3; title?: string; config?: Record<string, unknown> };

const blockCatalog: BlockCatalogItem[] = [
  { key: "phase", type: "phase", label: "Fase", icon: Layers3 },
  { key: "short_text", type: "short_text", label: "Texto simples", icon: Pencil },
  { key: "long_text", type: "long_text", label: "Texto longo", icon: FileText },
  { key: "short_answer", type: "short_answer", label: "Resposta curta", icon: Pencil },
  { key: "long_answer", type: "long_answer", label: "Resposta longa", icon: FileText },
  { key: "checklist", type: "checklist", label: "Checklist", icon: ListChecks },
  { key: "prompt", type: "prompt", label: "Prompt", icon: Clipboard },
  { key: "context", type: "context", label: "Contexto", icon: Copy },
  { key: "project_summary", type: "project_summary", label: "Sumário", icon: GitBranch },
  { key: "materials", type: "materials", label: "Links e materiais", icon: Link2, title: "Links e materiais", config: { links: [] } },
  { key: "evidence", type: "file_upload", label: "Evidência / envio", icon: Upload, title: "Evidências", config: { fileMode: "evidence", acceptedFileTypes: [], allowMultipleFiles: true } },
  { key: "resource_pack", type: "file_upload", label: "Arquivos e modelos", icon: Download, title: "Arquivos e modelos", config: { fileMode: "resource_pack", acceptedFileTypes: [], allowMultipleFiles: true } },
  { key: "comment", type: "comment", label: "Comentario", icon: FileText },
];

function JourneyView({
  project,
  livePanel,
  onLivePanelChange,
  workspace,
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
  onOpenStagePicker,
  onApplyTemplate,
  onDeleteStep,
  onSaveTemplate,
  currentUser,
  onImportSummary,
  onUpdateSummary,
  onUpdateSummaryItem,
  onSetSummaryItemSelection,
  onAddSummaryItem,
  onMoveSummaryItem,
  onMoveSummaryItemToNumber,
  onDeleteSummaryItem,
  onConsolidateSummary,
  onApplySummary,
  onSaveGeneratedPrompt,
  onArchiveGeneratedPrompt,
  onCreatePromptFromBlock,
  onRefreshWorkspace,
}: {
  project: Project;
  livePanel: JourneyMode;
  onLivePanelChange: (mode: JourneyMode) => void;
  workspace?: WorkspaceOverview;
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
  onOpenStagePicker: () => void;
  onApplyTemplate?: () => void;
  onDeleteStep: (stepId: string) => void;
  onSaveTemplate: (project: Project, request: ProjectTemplateSaveRequest) => Promise<boolean>;
  currentUser: AppUser | null;
  onImportSummary: (project: Project, rawText: string) => void;
  onUpdateSummary: (summaryId: string, payload: Partial<ProjectSummary>) => void;
  onUpdateSummaryItem: (itemId: string, payload: Partial<ProjectSummaryItem>) => void;
  onSetSummaryItemSelection: (summaryId: string, itemId: string, isSelected: boolean) => void;
  onAddSummaryItem: (summaryId: string, parentId: string, title: string) => void;
  onMoveSummaryItem: (summaryId: string, itemId: string, parentId: string | null, targetIndex?: number) => void;
  onMoveSummaryItemToNumber: (summaryId: string, itemId: string, topicNumber: string) => void;
  onDeleteSummaryItem: (summaryId: string, itemId: string) => void;
  onConsolidateSummary: (summaryId: string) => Promise<ProjectSummary | null>;
  onApplySummary?: (summaryId: string) => Promise<boolean>;
  onSaveGeneratedPrompt: (payload: GeneratedPromptWrite) => Promise<boolean>;
  onArchiveGeneratedPrompt: (promptId: string, summaryItemId?: string) => void;
  onCreatePromptFromBlock: (payload: { title: string; content: string; ai_tool_id?: string | null; short_description?: string | null }) => Promise<Prompt | null>;
  onRefreshWorkspace: (projectId: string) => Promise<void>;
}) {
  const applicableSteps = steps.filter((step) => !step.is_not_applicable);
  const doneSteps = applicableSteps.filter((step) => step.status === "concluido").length;
  const progress = Math.round(((doneSteps + (workspace?.status === "organizado" ? 1 : 0)) / (applicableSteps.length + 1)) * 100);
  const [payload, setPayload] = useState<StepBuilderPayload | null>(null);
  const [isLoadingBlocks, setIsLoadingBlocks] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [newStepName, setNewStepName] = useState("");
  const [isStepManagerOpen, setIsStepManagerOpen] = useState(false);
  const [isTemplateSaveOpen, setIsTemplateSaveOpen] = useState(false);
  const [templateSaveMode, setTemplateSaveMode] = useState<"update" | "create">("create");
  const [templateTargetId, setTemplateTargetId] = useState("");
  const [templateNameDraft, setTemplateNameDraft] = useState("");
  const [templatePresentationDefaults, setTemplatePresentationDefaults] = useState<Record<string, string[]>>({});
  const [summaryEditorOpen, setSummaryEditorOpen] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Set<string>>(() => new Set());
  const presentationSaveQueueRef = useRef(Promise.resolve());
  const journeyMode = livePanel;
  const setJourneyMode = onLivePanelChange;
  const summaries = tables.project_summaries.filter((summary) => summary.project_id === project.id);
  const summaryItems = tables.project_summary_items.filter((item) => item.project_id === project.id).sort(byOrder);
  const generatedPrompts = tables.generated_prompts.filter((prompt) => prompt.project_id === project.id);
  const projectTemplates = tables.journey_templates.filter((template) => template.context === "projeto" || template.context === "geral");

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
      const next = await stepRequest(`/structure?userId=${encodeURIComponent(currentUser?.id ?? "")}`);
      setPayload(next);
      setCollapsedBlockIds(new Set(next.presentation?.collapsedBlockIds ?? []));
      if (!isCentralLiveViewer() && !selectedStep.is_not_applicable && next.completion.status !== selectedStep.status) {
        void onUpdateStep(selectedStep.id, { status: next.completion.status });
      }
    } finally {
      setIsLoadingBlocks(false);
    }
  }

  async function addBlock(item: BlockCatalogItem | string) {
    const catalogItem = typeof item === "string" ? blockCatalog.find((candidate) => candidate.type === item) ?? { key: item, type: item, label: item, icon: FileText } : item;
    const next = await stepRequest("/blocks", { method: "POST", body: JSON.stringify({ type: catalogItem.type, title: catalogItem.title, config: catalogItem.config }) });
    setPayload(next);
    const createdId = next.document.blocks[next.document.blocks.length - 1]?.id ?? null;
    setEditingBlockId(createdId);
    if (createdId) setCollapsedBlockIds((current) => { const collapsed = new Set(current); collapsed.delete(createdId); return collapsed; });
    setIsAddMenuOpen(false);
  }

  async function updateBlock(blockId: string, patch: Partial<StepBuilderBlock>) {
    const next = await stepRequest(`/blocks/${encodeURIComponent(blockId)}`, { method: "PATCH", body: JSON.stringify(patch) });
    setPayload(next);
    if (payload?.document.blocks.some((block) => block.id === blockId && block.type === "materials")) void onRefreshWorkspace(project.id);
  }

  async function deleteBlock(blockId: string) {
    setPayload(await stepRequest(`/blocks/${encodeURIComponent(blockId)}`, { method: "DELETE" }));
    if (payload?.document.blocks.some((block) => block.id === blockId && block.type === "materials")) void onRefreshWorkspace(project.id);
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
    if (block.type === "materials") void onRefreshWorkspace(project.id);
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
    if (next.document.blocks.some((block) => block.id === blockId && block.type === "materials")) void onRefreshWorkspace(project.id);
    if (!selectedStep.is_not_applicable && next.completion.status !== selectedStep.status) onUpdateStep(selectedStep.id, { status: next.completion.status });
  }

  async function completeCurrentStep() {
    if (!payload || selectedStep.is_not_applicable) return;
    const forcePending = !payload.completion.canComplete;
    if (forcePending && !window.confirm(`Esta etapa possui ${payload.completion.reasons.length} bloco(s) pendente(s). Deseja concluir esses blocos e finalizar a etapa?`)) return;
    try {
      const next = await stepRequest("/complete", { method: "POST", body: JSON.stringify({ forcePending, updatedBy: currentUser?.name ?? null }) });
      setPayload(next);
      onUpdateStep(selectedStep.id, { status: "concluido" });
      window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message: forcePending ? "Blocos pendentes concluidos e etapa finalizada." : "Etapa concluida." } }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message: error instanceof Error ? error.message : "Não foi possível concluir a etapa." } }));
    }
  }

  function updatePresentation(update: (current: Set<string>) => Set<string>, reset = false) {
    setCollapsedBlockIds((current) => {
      const previous = new Set(current);
      const next = update(new Set(current));
      presentationSaveQueueRef.current = presentationSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const saved = await stepRequest("/presentation", {
            method: "PATCH",
            body: JSON.stringify({ userId: currentUser?.id, collapsedBlockIds: [...next], reset }),
          });
          setPayload(saved);
          setCollapsedBlockIds(new Set(saved.presentation?.collapsedBlockIds ?? []));
        })
        .catch((error) => {
          setCollapsedBlockIds(previous);
          window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message: error instanceof Error ? error.message : "Não foi possível salvar a visualizacao da etapa." } }));
        });
      return next;
    });
  }

  const blocks = payload?.document.blocks ?? [];
  const completion = payload?.completion;

  function switchJourneyMode(nextMode: JourneyMode) {
    setJourneyMode(nextMode);
    setIsAddMenuOpen(false);
    if (nextMode === "execute") setEditingBlockId(null);
  }

  function moveJourneyStep(stepId: string, direction: -1 | 1) {
    const ordered = [...steps].sort(byOrder);
    const index = ordered.findIndex((step) => step.id === stepId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;

    const current = ordered[index];
    const target = ordered[targetIndex];
    onUpdateStep(current.id, { step_order: target.step_order });
    onUpdateStep(target.id, { step_order: current.step_order });
  }

  function openTemplateSave() {
    const linkedTemplate = projectTemplates.find((template) => template.id === project.journey_template_id) ?? null;
    setTemplateSaveMode(linkedTemplate ? "update" : "create");
    setTemplateTargetId(linkedTemplate?.id ?? "");
    setTemplateNameDraft(linkedTemplate?.name ?? `${project.name} - template`);
    setIsTemplateSaveOpen(true);
  }

  async function submitTemplateSave() {
    const target = projectTemplates.find((template) => template.id === templateTargetId);
    const saved = await onSaveTemplate(project, {
      mode: templateSaveMode,
      templateId: templateSaveMode === "update" ? target?.id : undefined,
      name: templateNameDraft.trim() || target?.name || `${project.name} - template`,
      presentationDefaults: templatePresentationDefaults,
    });
    if (saved) setIsTemplateSaveOpen(false);
  }

  return (
    <>
      <section className="journey-hero journey-context-bar">
        <button className="ghost-button" onClick={onBack}>
          <PanelLeft size={17} /> Projetos
        </button>
        <div className="journey-context-copy">
          <span className="eyebrow">Ramos Jornadas</span>
          <h1>{project.name}</h1>
          <p>{project.company || "Projeto sem empresa definida"}</p>
        </div>
        <div className="journey-progress"><ProgressBar value={progress} label="Progresso" detail={`${progress}%`} /></div>
      </section>

      <section className="journey-layout block-journey-layout">
        <JourneyStepRail ownerType="project" ownerId={project.id} currentUser={currentUser} steps={[{ id: WORKSPACE_STEP_ID, name: "Local de trabalho", compact_label: "LOCAL TRAB.", step_order: 0, status: workspace?.status === "organizado" ? "concluido" : workspace?.status === "parcial" ? "em_andamento" : "pendente", status_label: workspace?.status === "organizado" ? "Organizado" : workspace?.status === "parcial" ? "Parcial" : "Não iniciado" }, ...steps]} selectedStepId={selectedStepId} onSelectStep={onSelectStep} onAdd={onOpenStagePicker} onOrganize={() => setIsStepManagerOpen(true)} />

        <section className="work-surface block-work-surface">
          <CommandBar mode={journeyMode}>
            <div className="journey-step-identity">
              <span className="eyebrow">{journeyMode === "edit" ? "Personalizando estrutura" : "Etapa"}</span>
              {journeyMode === "edit" ? (
                <InlineText defaultValue={selectedStep.name} className="inline-title" onSave={(value) => onUpdateStep(selectedStep.id, { name: value })} />
              ) : (
                <strong className="journey-step-title">{selectedStep.name}</strong>
              )}
            </div>
            {journeyMode === "edit" ? (
              <div className="rj-step-actions">
                <div className="block-add-wrap">
                  <button className="primary-button" type="button" onClick={() => setIsAddMenuOpen((value) => !value)}><Plus size={17} /> Adicionar bloco</button>
                  {isAddMenuOpen && <BlockTypeMenu onSelect={addBlock} />}
                </div>
                <button className="secondary-button" type="button" onClick={() => {
                  setTemplatePresentationDefaults((current) => ({ ...current, [selectedStep.id]: [...collapsedBlockIds] }));
                  window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message: "Visual inicial desta etapa será salvo com o template." } }));
                }}><PanelTop size={16} /> Salvar visual inicial</button>
                <button className="secondary-button" type="button" onClick={openTemplateSave}><Save size={16} /> Salvar como template</button>
                <button className="primary-button" type="button" onClick={() => switchJourneyMode("execute")}><Check size={16} /> Concluir personalização</button>
              </div>
            ) : (
              <div className="rj-step-actions">
                <button className={`secondary-button ${selectedStep.is_not_applicable ? "is-not-applicable" : ""}`} type="button" onClick={() => onUpdateStep(selectedStep.id, { is_not_applicable: !selectedStep.is_not_applicable })}>{selectedStep.is_not_applicable ? <RefreshCw size={16} /> : <X size={16} />}{selectedStep.is_not_applicable ? " Voltar a aplicar" : " Não se aplica"}</button>
                <button className="primary-button" type="button" disabled={Boolean(selectedStep.is_not_applicable) || !completion} title={selectedStep.is_not_applicable ? "Esta etapa foi marcada como não aplicável" : completion?.canComplete ? "Concluir etapa" : "Concluir os blocos pendentes e finalizar a etapa"} onClick={() => void completeCurrentStep()}><CheckCircle2 size={17} /> Concluir etapa</button>
                <StepMoreMenu
                  groups={[
                    [
                      { label: "Abrir todos os blocos", icon: ChevronDown, onSelect: () => updatePresentation(() => new Set()) },
                      { label: "Recolher todos os blocos", icon: ChevronUp, onSelect: () => updatePresentation(() => collapseAllBlockIds(blocks.map((block) => block.id))) },
                      { label: "Restaurar visual padrão", icon: RefreshCw, onSelect: () => updatePresentation(() => new Set(), true) },
                    ],
                    [
                      { label: "Adicionar etapa", icon: Plus, onSelect: onOpenStagePicker },
                      ...(onApplyTemplate ? [{ label: "Aplicar template", icon: Layers3, onSelect: onApplyTemplate }] : []),
                      { label: "Organizar etapas", icon: ListOrdered, onSelect: () => setIsStepManagerOpen(true) },
                    ],
                    [
                      { label: "Personalizar estrutura desta etapa", hint: "Avançado: muda só este projeto. Para todos, edite em Templates.", icon: Pencil, onSelect: () => switchJourneyMode("edit") },
                    ],
                  ]}
                />
              </div>
            )}
          </CommandBar>
          {journeyMode === "edit" && <div className="rj-edit-banner" role="status"><Pencil size={16} /><span>Você está personalizando a estrutura <strong>só deste projeto</strong>. Para mudar a etapa em todos os projetos, edite em <strong>Templates</strong>.</span></div>}
          <div className="step-auto-status">
            <StatusBadge tone={selectedStep.is_not_applicable ? "pending" : statusTone(completion?.status ?? selectedStep.status)}>{selectedStep.is_not_applicable ? "Não se aplica" : formatStepStatus(completion?.status ?? selectedStep.status)}</StatusBadge>
            <span>{completion ? `${completion.completedBlocks}/${completion.totalBlocks} blocos completos` : "Carregando blocos"}</span>
            <ProgressBar value={completion?.progress ?? 0} />
          </div>
          {!selectedStep.is_not_applicable && completion && !completion.canComplete && completion.reasons.length > 0 && (
            <div className="step-completion-hint" role="status"><span>Para concluir esta etapa:</span> {completion.reasons[0].message}</div>
          )}

          {isLoadingBlocks && <div className="empty-state compact"><Loader2 className="spin" size={24} /> Carregando construtor da etapa...</div>}

          {!isLoadingBlocks && blocks.length === 0 && (
            <div className="empty-block-canvas">
              <Sparkles size={34} />
              <strong>Etapa limpa</strong>
              <span>{journeyMode === "edit" ? "Adicione apenas os blocos que fazem sentido para esta etapa." : "Esta etapa ainda não possui conteúdo para executar."}</span>
              {journeyMode === "edit" ? (
                <button className="primary-button" onClick={() => setIsAddMenuOpen(true)}><Plus size={17} /> Adicionar primeiro bloco</button>
              ) : (
                <button className="secondary-button" onClick={() => switchJourneyMode("edit")}><Pencil size={17} /> Personalizar esta etapa</button>
              )}
            </div>
          )}

          <WorkCanvas>
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
                onArchiveGeneratedPrompt={onArchiveGeneratedPrompt}
                onCreatePromptFromBlock={onCreatePromptFromBlock}
                mode={journeyMode}
                isEditing={journeyMode === "edit" && editingBlockId === block.id}
                isCollapsed={collapsedBlockIds.has(block.id)}
                onToggleCollapse={() => updatePresentation((current) => toggleCollapsedBlockIds(current, block.id))}
                onDuplicate={() => duplicateBlock(block)}
                onEdit={() => {
                  setEditingBlockId(editingBlockId === block.id ? null : block.id);
                  updatePresentation((current) => { current.delete(block.id); return current; });
                }}
                onUpdate={(patch) => updateBlock(block.id, patch)}
                onDelete={() => deleteBlock(block.id)}
                onMove={moveBlock}
                onSaveValue={(value) => saveBlockValue(block.id, value)}
                onOpenSummary={() => setSummaryEditorOpen(true)}
                files={payload?.files ?? []}
              />
            ))}
          </WorkCanvas>
        </section>
      </section>

      {summaryEditorOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="summary-modal glass-panel">
            <div className="modal-heading">
              <div><span className="eyebrow">Editor dedicado</span><h2>Sumário inteligente</h2></div>
              <button className="icon-button" onClick={() => setSummaryEditorOpen(false)}>×</button>
            </div>
            <ProjectSummaryPanel
              project={project}
              summaries={summaries}
              allSummaries={tables.project_summaries}
              items={summaryItems}
              onImport={onImportSummary}
              onUpdateSummary={onUpdateSummary}
              onUpdateItem={onUpdateSummaryItem}
              onSetSelection={onSetSummaryItemSelection}
              onAddItem={onAddSummaryItem}
              onMoveItem={onMoveSummaryItem}
              onMoveItemToNumber={onMoveSummaryItemToNumber}
              onDeleteItem={onDeleteSummaryItem}
              onConsolidate={onConsolidateSummary}
              onApply={onApplySummary}
            />
          </div>
        </div>
      )}

      {isTemplateSaveOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsTemplateSaveOpen(false)}>
          <section className="template-save-modal glass-panel" role="dialog" aria-modal="true" aria-label="Salvar estrutura como template" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div><span className="eyebrow">Salvar template</span><h2>Estrutura da jornada</h2><p>Checklists e confirmações continuam vazios. Apenas contextos fixados no modo Editar estrutura entram no template.</p></div>
              <button className="icon-button" type="button" title="Fechar" onClick={() => setIsTemplateSaveOpen(false)}><X size={18} /></button>
            </div>
            <div className="template-save-mode" role="group" aria-label="Destino do template">
              <button className={templateSaveMode === "update" ? "active" : ""} type="button" disabled={projectTemplates.length === 0} onClick={() => { setTemplateSaveMode("update"); const fallback = projectTemplates.find((template) => template.id === project.journey_template_id) ?? projectTemplates[0]; setTemplateTargetId(fallback?.id ?? ""); setTemplateNameDraft(fallback?.name ?? ""); }}>Atualizar template existente</button>
              <button className={templateSaveMode === "create" ? "active" : ""} type="button" onClick={() => { setTemplateSaveMode("create"); setTemplateNameDraft(`${project.name} - template`); }}>Criar novo template</button>
            </div>
            {templateSaveMode === "update" && (
              <label className="field"><span>Template a atualizar</span><select value={templateTargetId} onChange={(event) => { const selected = projectTemplates.find((template) => template.id === event.target.value); setTemplateTargetId(event.target.value); setTemplateNameDraft(selected?.name ?? ""); }}><option value="">Selecione o template</option>{projectTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
            )}
            <Field label={templateSaveMode === "update" ? "Nome do template" : "Nome do novo template"} value={templateNameDraft} onChange={setTemplateNameDraft} />
            <div className="inline-actions"><button className="secondary-button" type="button" onClick={() => setIsTemplateSaveOpen(false)}>Cancelar</button><button className="primary-button" type="button" disabled={!templateNameDraft.trim() || (templateSaveMode === "update" && !templateTargetId)} onClick={() => void submitTemplateSave()}><Save size={16} /> {templateSaveMode === "update" ? "Atualizar template" : "Criar template"}</button></div>
          </section>
        </div>
      )}

      {isStepManagerOpen && (
        <div className="modal-backdrop step-manager-backdrop" role="dialog" aria-modal="true" aria-label="Organizar etapas da jornada">
          <div className="step-manager-modal glass-panel">
            <div className="modal-heading">
              <div><span className="eyebrow">Organização da jornada</span><h2>Etapas do projeto</h2></div>
              <button className="icon-button" type="button" title="Fechar" onClick={() => setIsStepManagerOpen(false)}><X size={17} /></button>
            </div>
            <form className="step-manager-add" onSubmit={(event) => { event.preventDefault(); onAddNextStep(project.id, newStepName || "Nova etapa"); setNewStepName(""); }}>
              <input value={newStepName} onChange={(event) => setNewStepName(event.target.value)} placeholder="Nome da nova etapa" aria-label="Nome da nova etapa" />
              <button className="primary-button compact" type="submit"><Plus size={15} /> Adicionar etapa</button>
            </form>
            <div className="step-manager-list">
              {[...steps].sort(byOrder).map((step, index) => (
                <article className={`step-manager-row ${step.is_not_applicable ? "nao-aplicavel" : ""} ${step.id === selectedStepId ? "active" : ""}`} key={step.id}>
                  <button className="step-manager-select" type="button" onClick={() => { onSelectStep(step.id); setIsStepManagerOpen(false); }}>
                    <span className={`step-dot ${step.is_not_applicable ? "nao-aplicavel" : step.status}`}>{step.status === "concluido" && !step.is_not_applicable ? <Check size={13} /> : index + 1}</span>
                    <span><strong>{step.name}</strong><small>{step.is_not_applicable ? "Não se aplica" : formatStepStatus(step.status)}</small></span>
                  </button>
                  <div className="step-manager-actions">
                    <button className="icon-button subtle" type="button" title="Subir etapa" disabled={index === 0} onClick={() => moveJourneyStep(step.id, -1)}>↑</button>
                    <button className="icon-button subtle" type="button" title="Descer etapa" disabled={index === steps.length - 1} onClick={() => moveJourneyStep(step.id, 1)}>↓</button>
                    <button className="icon-button danger" type="button" title="Excluir etapa" onClick={() => onDeleteStep(step.id)}><Trash2 size={15} /></button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BlockTypeMenu({ onSelect }: { onSelect: (item: BlockCatalogItem) => void }) {
  return (
    <div className="block-type-menu glass-panel">
      {blockCatalog.map((item) => {
        const Icon = item.icon;
        return <button key={item.key} type="button" onClick={() => onSelect(item)}><Icon size={16} /> {item.label}</button>;
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
  onArchiveGeneratedPrompt,
  onCreatePromptFromBlock,
  mode,
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
  files = [],
  ownerType = "project",
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
  onSaveGeneratedPrompt: (payload: GeneratedPromptWrite) => Promise<boolean>;
  onArchiveGeneratedPrompt: (promptId: string, summaryItemId?: string) => void;
  onCreatePromptFromBlock: (payload: { title: string; content: string; ai_tool_id?: string | null; short_description?: string | null }) => Promise<Prompt | null>;
  mode: JourneyMode;
  isEditing: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onUpdate: (patch: Partial<StepBuilderBlock>) => void;
  onDelete: () => void;
  onMove: (blockId: string, direction: -1 | 1) => void;
  onSaveValue: (value: unknown) => void | Promise<void>;
  onOpenSummary: () => void;
  files?: JourneyRuntimeFile[];
  ownerType?: "project" | "client";
}) {
  const Icon = blockCatalog.find((item) => item.type === block.type)?.icon ?? Layers3;
  const parentClass = block.config.parentBlockId ? " nested-block" : "";
  const linkedPrompt = block.type === "prompt" ? tables.prompts.find((prompt) => prompt.id === block.config.promptId) ?? null : null;
  const blockDetail = block.type === "prompt"
    ? String(block.config.description ?? linkedPrompt?.short_description ?? "").trim()
    : blockTypeText(block.type);
  const blockState = getCollapsedBlockState(block, value, summaries, summaryItems, files);
  return (
    <article className={`step-builder-block ${block.type}${parentClass} ${isCollapsed ? "is-collapsed" : ""}`}>
      <div className="block-card-heading">
        <div><Icon size={18} /><div><strong>{block.title}</strong>{(blockDetail || block.required) && <span>{blockDetail}{block.required ? `${blockDetail ? " - " : ""}obrigatório` : ""}</span>}{isCollapsed && blockState.label && <div className="collapsed-block-state"><span className={`collapsed-block-status ${blockState.tone}`}>{blockState.label}</span>{blockState.detail && <span className="collapsed-block-detail">{blockState.detail}</span>}</div>}</div></div>
        <div className="block-card-actions">
          <button className="icon-button block-collapse-button" type="button" title={isCollapsed ? "Expandir bloco" : "Recolher bloco"} aria-label={isCollapsed ? "Expandir bloco" : "Recolher bloco"} onClick={onToggleCollapse}>{isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button>
          {mode === "edit" && (
            <>
              <button className="icon-button" type="button" title="Mover para cima" onClick={() => onMove(block.id, -1)} disabled={index === 0}>↑</button>
              <button className="icon-button" type="button" title="Mover para baixo" onClick={() => onMove(block.id, 1)} disabled={index === total - 1}>↓</button>
              <button className="icon-button" type="button" title="Duplicar bloco" onClick={onDuplicate}><Copy size={15} /></button>
              <button className="icon-button" type="button" title="Editar bloco" onClick={onEdit}><Pencil size={15} /></button>
              <button className="icon-button danger" type="button" title="Excluir bloco" onClick={onDelete}><Trash2 size={15} /></button>
            </>
          )}
        </div>
      </div>

      {!isCollapsed && isEditing && <BlockSettings block={block} tables={tables} onUpdate={onUpdate} onCreatePromptFromBlock={onCreatePromptFromBlock} />}
      {!isCollapsed && <BlockBody block={block} value={value} mode={mode} summaries={summaries} summaryItems={summaryItems} generatedPrompts={generatedPrompts} project={project} selectedStep={selectedStep} tables={tables} currentUser={currentUser} onUpdateSummaryItem={onUpdateSummaryItem} onSetSummaryItemSelection={onSetSummaryItemSelection} onDeleteSummaryItem={onDeleteSummaryItem} onSaveGeneratedPrompt={onSaveGeneratedPrompt} onArchiveGeneratedPrompt={onArchiveGeneratedPrompt} onSaveValue={onSaveValue} onOpenSummary={onOpenSummary} onUpdate={onUpdate} ownerType={ownerType} />}
    </article>
  );
}

function getCollapsedBlockState(block: StepBuilderBlock, value: any, summaries: ProjectSummary[], summaryItems: ProjectSummaryItem[], files: JourneyRuntimeFile[] = []) {
  const complete = (label: string, detail = "") => ({ tone: "complete", label, detail });
  const pending = (label: string, detail = "") => ({ tone: "pending", label, detail });
  const active = (label: string, detail = "") => ({ tone: "active", label, detail });

  if (value?.forceCompleted) return complete("Concluído", "Confirmado ao finalizar a etapa");

  if (block.type === "checklist") {
    const items = Array.isArray(block.config.items) ? block.config.items as Array<any> : [];
    const requiredItems = items.filter((item) => item.required !== false);
    const checked = value?.checked ?? Object.fromEntries(items.map((item) => [item.id, Boolean(item.done)]));
    const done = requiredItems.filter((item) => checked[item.id]).length;
    return requiredItems.length === 0 ? pending("Sem itens") : done === requiredItems.length ? complete("Checklist concluido", `${done}/${requiredItems.length} itens`) : active("Checklist em andamento", `${done}/${requiredItems.length} itens`);
  }

  if (block.type === "prompt") {
    const copies = Number(value?.copyCount ?? 0);
    const attachmentCount = files.filter((file) => file.block_id === block.id).length;
    const attachmentDetail = Boolean(block.config.attachmentsRequired) ? ` - ${attachmentCount} arquivo(s)` : "";
    if (value?.applied) return complete("Aplicado", `${copies ? `${copies} copia(s)` : "Confirmado"}${attachmentDetail}`);
    if (copies) return active("Copiado", `${copies} copia(s)${attachmentDetail}`);
    return block.required ? pending("Pendente", "Ainda não copiado") : { tone: "", label: "", detail: "" };
  }

  if (block.type === "context") {
    const runtimeContexts = Array.isArray(value?.contexts) ? value.contexts : [];
    const templateContexts = Array.isArray(block.config.contexts) ? block.config.contexts.filter((item: { pinned?: boolean }) => item.pinned) : [];
    const contexts = [...templateContexts, ...runtimeContexts];
    return contexts.length ? complete("Contexto salvo", `${contexts.length} contexto(s)`) : block.required ? pending("Sem contexto") : { tone: "", label: "", detail: "" };
  }

  if (block.type === "materials") {
    const templateLinks = Array.isArray(block.config.links) ? block.config.links : [];
    const runtimeLinks = Array.isArray(value?.links) ? value.links : [];
    const links = [...templateLinks, ...runtimeLinks];
    return links.length ? complete("Materiais adicionados", `${links.length} link(s)`) : block.required ? pending("Sem materiais") : { tone: "", label: "", detail: "" };
  }

  if (block.type === "file_upload") {
    const attached = files.filter((file) => file.block_id === block.id);
    if (block.config.fileMode === "resource_pack") return complete("Materiais de apoio", attached.length ? `${attached.length} arquivo(s)` : "Disponível no template");
    return attached.length ? complete("Arquivo anexado", `${attached.length} arquivo(s)`) : block.required ? pending("Aguardando arquivo") : { tone: "", label: "", detail: "" };
  }

  if (block.type === "project_summary") {
    const summary = resolveBoundSummary(summaries, String(block.config.summaryId ?? ""));
    const items = summary ? summaryItems.filter((item) => item.summary_id === summary.id && item.is_selected) : [];
    const done = items.filter((item) => item.status === "concluido").length;
    if (!summary) return pending("Sem sumário vinculado");
    return items.length && done === items.length ? complete("Sumário concluido", `${done}/${items.length} topicos`) : active("Sumário em andamento", `${done}/${items.length} topicos`);
  }

  if (block.type === "short_answer" || block.type === "long_answer") return String(value ?? "").trim() ? complete("Respondido") : pending("Aguardando resposta");
  if (block.type === "short_text" || block.type === "long_text") return String(block.config.content ?? "").trim() ? complete("Orientação disponível") : { tone: "", label: "", detail: "" };
  if (block.type === "phase") return block.config.status === "concluido" ? complete("Fase concluida") : { tone: "", label: "", detail: "" };
  return block.required ? pending("Obrigatório") : { tone: "", label: "", detail: "" };
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
        <span>Título do bloco</span>
        <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} onBlur={saveTitle} />
      </label>
      <label className="checkline"><input type="checkbox" checked={block.required} onChange={(event) => onUpdate({ required: event.target.checked })} /> Obrigatório para concluir</label>
      {(block.type === "short_text" || block.type === "long_text") && (
        <label className="field text-block-config">
          <span>Texto informativo</span>
          <textarea
            value={draftInfoText}
            rows={block.type === "long_text" ? 5 : 2}
            placeholder="Escreva a orientação que deve aparecer na jornada"
            onChange={(event) => setDraftInfoText(event.target.value)}
            onBlur={saveInfoText}
          />
        </label>
      )}
      {block.type === "prompt" && <PromptBlockSettings block={block} tables={tables} onUpdate={onUpdate} onCreatePromptFromBlock={onCreatePromptFromBlock} />}
      {block.type === "file_upload" && <FileUploadBlockSettings block={block} onUpdate={onUpdate} />}
      {block.type === "project_summary" && <SelectField label="Versão do sumário" value={String(block.config.summaryId ?? "")} onChange={(summaryId) => onUpdate({ config: { summaryId } })} options={tables.project_summaries.map((summary) => ({ value: summary.id, label: `Versão ${summary.version_number} - ${summary.status}` }))} emptyLabel="Não vinculado" />}
    </div>
  );
}

function FileUploadBlockSettings({ block, onUpdate }: { block: StepBuilderBlock; onUpdate: (patch: Partial<StepBuilderBlock>) => void }) {
  const fileMode = block.config.fileMode === "resource_pack" ? "resource_pack" : "evidence";
  const allowMultiple = block.config.allowMultipleFiles !== false;
  const maxFiles = Math.max(1, Number(block.config.maxFiles ?? 20));
  const minFiles = Math.max(1, Number(block.config.minFiles ?? 1));
  const maxFileSizeMb = Math.max(1, Number(block.config.maxFileSizeMb ?? 25));

  return (
    <section className="file-block-settings">
      <div className="block-settings-heading">
        <strong>Uso dos arquivos</strong>
        <span>Defina se este bloco recebe evidências da execução ou arquivos-modelo do template.</span>
      </div>
      <div className="file-mode-options">
        <button className={`file-mode-option ${fileMode === "evidence" ? "active" : ""}`} type="button" onClick={() => onUpdate({ config: { fileMode: "evidence" } })}>
          <Upload size={16} /><span><strong>Evidências</strong><small>Arquivos enviados durante a execução.</small></span>
        </button>
        <button className={`file-mode-option ${fileMode === "resource_pack" ? "active" : ""}`} type="button" onClick={() => onUpdate({ config: { fileMode: "resource_pack" } })}>
          <Download size={16} /><span><strong>Arquivos e modelos</strong><small>Conjunto salvo no template para baixar na jornada.</small></span>
        </button>
      </div>
      {fileMode === "resource_pack" && <p className="file-mode-help">Adicione os arquivos abaixo. Ao salvar ou atualizar o template, este conjunto será disponibilizado nas novas jornadas criadas a partir dele.</p>}
      <div className="file-limit-grid">
        <label className="field"><span>Quantidade minima</span><input type="number" min="1" max={maxFiles} value={minFiles} onChange={(event) => onUpdate({ config: { minFiles: Math.min(maxFiles, Math.max(1, Number(event.target.value) || 1)) } })} /></label>
        <label className="field"><span>Quantidade maxima</span><input type="number" min="1" max="100" value={maxFiles} onChange={(event) => onUpdate({ config: { maxFiles: Math.max(1, Number(event.target.value) || 1) } })} /></label>
        <label className="field"><span>Limite por arquivo (MB)</span><input type="number" min="1" max="500" value={maxFileSizeMb} onChange={(event) => onUpdate({ config: { maxFileSizeMb: Math.max(1, Number(event.target.value) || 1) } })} /></label>
        <label className="checkline"><input type="checkbox" checked={allowMultiple} onChange={(event) => onUpdate({ config: { allowMultipleFiles: event.target.checked } })} /> Permitir varios arquivos de uma vez</label>
      </div>
    </section>
  );
}
function BlockBody({
  block,
  value,
  mode,
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
  onArchiveGeneratedPrompt,
  onSaveValue,
  onOpenSummary,
  onUpdate,
  ownerType = "project",
}: {
  block: StepBuilderBlock;
  value: any;
  mode: JourneyMode;
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
  onSaveGeneratedPrompt: (payload: GeneratedPromptWrite) => Promise<boolean>;
  onArchiveGeneratedPrompt: (promptId: string, summaryItemId?: string) => void;
  onSaveValue: (value: unknown) => void | Promise<void>;
  onOpenSummary: () => void;
  onUpdate: (patch: Partial<StepBuilderBlock>) => void;
  ownerType?: "project" | "client";
}) {
  if (block.type === "phase") {
    return <PhaseBlock block={block} isStructureEditing={mode === "edit"} onUpdate={onUpdate} />;
  }

  if (block.type === "checklist") {
    return <ChecklistBlock block={block} value={value} isStructureEditing={mode === "edit"} onSaveValue={onSaveValue} onUpdate={onUpdate} />;
  }

  if (block.type === "prompt") {
    return <PromptExecutionBlock block={block} value={value} tables={tables} stepId={selectedStep.id} currentUser={currentUser} ownerType={ownerType} project={project} selectedStep={selectedStep} isStructureEditing={mode === "edit"} onSaveValue={onSaveValue} onUpdate={onUpdate} />;
  }

  if (block.type === "context") {
    return <ContextBlock block={block} value={value} isStructureEditing={mode === "edit"} onUpdate={onUpdate} onSaveValue={onSaveValue} clientId={project.client_id ?? (ownerType === "client" ? project.id : null)} stepId={selectedStep.id} ownerType={ownerType} />;
  }

  if (block.type === "materials") {
    return <MaterialsBlock block={block} value={value} isStructureEditing={mode === "edit"} currentUserName={currentUser?.name ?? null} onUpdate={onUpdate} onSaveValue={onSaveValue} />;
  }

  if (block.type === "project_summary") {
    return (
      <LegacySummaryOperationalBlock
        block={block}
        value={value}
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
        onArchiveGeneratedPrompt={onArchiveGeneratedPrompt}
        onSaveValue={onSaveValue}
        onOpenSummary={onOpenSummary}
        isStructureEditing={mode === "edit"}
      />
    );
  }

  if (block.type === "file_upload") {
    return <FileRuntimeBlock block={block} stepId={selectedStep.id} currentUser={currentUser} ownerType={ownerType} isStructureEditing={mode === "edit"} />;
  }

  if (block.type === "comment") {
    const content = String(block.config.content ?? "").trim();
    return mode === "edit"
      ? <textarea className="compact-textarea" value={content} placeholder="Comentario pequeno" onChange={(event) => onUpdate({ config: { content: event.target.value } })} />
      : <div className="informative-text-block comment">{content || <span>Comentario ainda não configurado.</span>}</div>;
  }

  if (block.type === "short_text" || block.type === "long_text") {
    const content = String(block.config.content ?? block.config.placeholder ?? "").trim();
    return (
      <div className={`informative-text-block ${block.type}`}>
        {content ? <p>{content}</p> : <span>Edite este bloco para escrever a orientação.</span>}
      </div>
    );
  }

  if (block.type === "short_answer" || block.type === "long_answer") {
    return <AnswerBlock block={block} value={value} onSaveValue={onSaveValue} />;
  }

  const content = String(block.config.content ?? value ?? "");
  return mode === "edit"
    ? <textarea className="compact-textarea" value={content} placeholder="Digite o conteúdo" onChange={(event) => onUpdate({ config: { content: event.target.value } })} onBlur={() => onSaveValue(content)} />
    : <div className="informative-text-block"><p>{content || "Bloco ainda não configurado."}</p></div>;
}

function AnswerBlock({ block, value, onSaveValue }: { block: StepBuilderBlock; value: unknown; onSaveValue: (value: unknown) => void }) {
  const [draft, setDraft] = useState(String(value ?? ""));
  useEffect(() => setDraft(String(value ?? "")), [value]);
  const long = block.type === "long_answer";
  const save = () => {
    if (draft !== String(value ?? "")) onSaveValue(draft);
  };
  return (
    <label className="answer-block">
      <span>{String(block.config.placeholder ?? (long ? "Escreva a resposta" : "Digite a resposta"))}</span>
      {long
        ? <textarea rows={Number(block.config.rows ?? 5)} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={save} />
        : <input value={draft} maxLength={Number(block.config.maxLength ?? 180)} onChange={(event) => setDraft(event.target.value)} onBlur={save} />}
    </label>
  );
}

type JourneyRuntimeFile = JourneyFile;

function FileRuntimeBlock({ block, stepId, currentUser, ownerType, label = "Anexar evidência", onFilesChange, isStructureEditing = false }: { block: StepBuilderBlock; stepId: string; currentUser: AppUser | null; ownerType: "project" | "client"; label?: string; onFilesChange?: (files: JourneyRuntimeFile[]) => void; isStructureEditing?: boolean }) {
  const [files, setFiles] = useState<JourneyRuntimeFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const isResourcePack = block.type === "file_upload" && block.config.fileMode === "resource_pack";
  const canManageFiles = !isResourcePack || isStructureEditing;
  const allowMultiple = block.config.allowMultipleFiles !== false;
  const uploadLabel = isResourcePack ? "Adicionar arquivo de modelo" : label;

  const refresh = async () => {
    try {
      const nextFiles = await journeyApi.listFiles(ownerType, stepId, block.id);
      setFiles(nextFiles);
      onFilesChange?.(nextFiles);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar os arquivos.");
    }
  };

  useEffect(() => { void refresh(); }, [stepId, block.id]);

  useEffect(() => { onFilesChange?.(files); }, [files, onFilesChange]);

  async function upload(selectedFiles: FileList | File[] | null) {
    const nextFiles = selectedFiles ? Array.from(selectedFiles) : [];
    if (!nextFiles.length) return;
    setIsLoading(true);
    setMessage("");
    try {
      const uploaded = await Promise.all(nextFiles.map((file) => journeyApi.uploadFile(ownerType, stepId, block.id, file, currentUser?.name)));
      setFiles((current) => [...uploaded, ...current]);
      const description = uploaded.length === 1 ? `${uploaded[0].name} anexado com sucesso.` : `${uploaded.length} arquivos anexados com sucesso.`;
      window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message: description } }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload não concluido.");
    } finally {
      setIsLoading(false);
    }
  }

  async function remove(fileId: string) {
    try {
      await journeyApi.deleteFile(ownerType, stepId, block.id, fileId);
      setFiles((current) => current.filter((file) => file.id !== fileId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível remover o arquivo.");
    }
  }

  function downloadFile(file: JourneyRuntimeFile) {
    const anchor = document.createElement("a");
    anchor.href = file.url ?? `/api/files/${encodeURIComponent(file.r2_key ?? "")}`;
    anchor.download = file.name;
    anchor.rel = "noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function downloadAll() {
    if (!files.length) return;
    files.forEach((file, index) => window.setTimeout(() => downloadFile(file), index * 180));
    const description = files.length === 1 ? "Arquivo de modelo baixado." : `${files.length} arquivos de modelo foram preparados para download.`;
    window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message: description } }));
  }

  return (
    <div className={`file-runtime-block ${isResourcePack ? "resource-pack" : "evidence-files"}`}>
      {isResourcePack && !isStructureEditing ? (
        <div className="resource-pack-actions">
          <button className="secondary-button" type="button" disabled={!files.length} onClick={downloadAll}><Download size={15} /> Baixar arquivos e modelos{files.length ? ` (${files.length})` : ""}</button>
          <span className="muted">Conjunto de apoio configurado no template.</span>
        </div>
      ) : (
        <label className="secondary-button upload-runtime-button">
          <Upload size={15} /> {isLoading ? "Enviando..." : uploadLabel}
          <input type="file" multiple={allowMultiple} disabled={isLoading} onChange={(event) => { void upload(event.currentTarget.files); event.currentTarget.value = ""; }} />
        </label>
      )}
      {message && <span className="field-error">{message}</span>}
      <div className="runtime-file-list">
        {files.map((file) => <div key={file.id} className="runtime-file-row"><a href={file.url ?? `/api/files/${encodeURIComponent(file.r2_key ?? "")}`} target="_blank" rel="noreferrer"><FileText size={15} /> {file.name}</a><span>{Math.max(1, Math.ceil(file.size_bytes / 1024))} KB</span>{canManageFiles && <button className="icon-button danger" type="button" onClick={() => void remove(file.id)} title="Remover arquivo"><Trash2 size={14} /></button>}</div>)}
        {!files.length && <span className="muted">{isResourcePack ? "Nenhum arquivo de modelo configurado." : "Nenhuma evidência anexada."}</span>}
      </div>
    </div>
  );
}

type PromptBlockRuntimeValue = {
  copyCount?: number;
  lastCopiedAt?: string | null;
  applied?: boolean;
  appliedAt?: string | null;
  conditionChecks?: Record<string, boolean>;
  forceCompleted?: boolean;
  forceCompletedAt?: string | null;
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
  const sourcePrompt = tables.prompts.find((prompt) => prompt.id === block.config.sourcePromptId) ?? null;
  const [draftPromptText, setDraftPromptText] = useState(resolvePromptContent(block.config, selectedPrompt?.content));
  const [draftDescription, setDraftDescription] = useState(String(block.config.description ?? selectedPrompt?.short_description ?? ""));
  const [draftExpectedOutput, setDraftExpectedOutput] = useState(String(block.config.expectedOutput ?? ""));
  const [draftCondition, setDraftCondition] = useState("");
  const toolId = String(block.config.toolId ?? selectedPrompt?.ai_tool_id ?? "");
  const canSaveToLibrary = Boolean(draftPromptText.trim()) && !selectedPrompt;
  const applicationConditions = Array.isArray(block.config.applicationConditions)
    ? block.config.applicationConditions as Array<{ id: string; label: string; required?: boolean }>
    : [];

  useEffect(() => {
    const nextSelectedPrompt = tables.prompts.find((prompt) => prompt.id === block.config.promptId) ?? null;
    setDraftPromptText(resolvePromptContent(block.config, nextSelectedPrompt?.content));
    setDraftDescription(String(block.config.description ?? nextSelectedPrompt?.short_description ?? ""));
    setDraftExpectedOutput(String(block.config.expectedOutput ?? ""));
  }, [block.id, block.config.promptId, block.config.contentSnapshot, block.config.description, block.config.expectedOutput, tables.prompts]);

  function linkPrompt(promptId: string) {
    const prompt = tables.prompts.find((item) => item.id === promptId) ?? null;

    if (!prompt) {
      onUpdate({ config: { promptId: null, contentSnapshot: draftPromptText, description: draftDescription, expectedOutput: draftExpectedOutput, toolId } });
      return;
    }

    setDraftPromptText(prompt.content ?? "");
    onUpdate({
      title: prompt.title,
      config: {
        promptId: prompt.id,
        sourcePromptId: prompt.id,
        contentSnapshot: prompt.content,
        toolId: prompt.ai_tool_id ?? "",
        description: prompt.short_description ?? draftDescription,
        expectedOutput: draftExpectedOutput,
      },
    });
  }

  function savePromptDraft() {
    const currentPromptText = resolvePromptContent(block.config, selectedPrompt?.content);
    const currentExpectedOutput = String(block.config.expectedOutput ?? "");
    if (draftPromptText !== currentPromptText || draftExpectedOutput !== currentExpectedOutput || draftDescription !== String(block.config.description ?? selectedPrompt?.short_description ?? "")) {
      onUpdate({ config: { contentSnapshot: draftPromptText, description: draftDescription, expectedOutput: draftExpectedOutput, promptId: block.config.promptId ?? null, toolId } });
    }
  }

  function unlinkPrompt() {
    onUpdate({
      config: {
        promptId: null,
        sourcePromptId: block.config.sourcePromptId ?? selectedPrompt?.id ?? null,
        contentSnapshot: resolvePromptContent(block.config, selectedPrompt?.content),
        description: draftDescription,
        expectedOutput: draftExpectedOutput,
        toolId,
      },
    });
  }

  async function saveToLibrary() {
    const created = await onCreatePromptFromBlock({
      title: block.title || "Prompt da etapa",
      content: draftPromptText,
      ai_tool_id: toolId || null,
      short_description: draftDescription || `Criado no bloco ${block.title || "Prompt"}`,
    });

    if (!created) return;
    setDraftPromptText(created.content ?? "");
    onUpdate({
      title: created.title,
      config: {
        promptId: created.id,
        sourcePromptId: created.id,
        contentSnapshot: created.content,
        toolId: created.ai_tool_id ?? "",
        description: created.short_description ?? draftDescription,
        expectedOutput: draftExpectedOutput,
      },
    });
  }

  function addApplicationCondition() {
    const label = draftCondition.trim();
    if (!label) return;
    onUpdate({ config: { applicationConditions: [...applicationConditions, { id: crypto.randomUUID(), label, required: true }] } });
    setDraftCondition("");
  }

  function removeApplicationCondition(conditionId: string) {
    onUpdate({ config: { applicationConditions: applicationConditions.filter((condition) => condition.id !== conditionId) } });
  }

  return (
    <div className="prompt-block-settings">
      <SelectField
        label="Prompt da biblioteca"
        value={String(block.config.promptId ?? "")}
        onChange={linkPrompt}
        options={tables.prompts.filter((prompt) => prompt.status !== "arquivado").map((prompt) => ({ value: prompt.id, label: prompt.title }))}
        emptyLabel="Prompt avulso / não vinculado"
      />
      {selectedPrompt && <div className="prompt-library-link-note"><span>Este texto acompanha automaticamente as atualizações da biblioteca.</span><button className="secondary-button" type="button" onClick={unlinkPrompt}>Desvincular para personalizar</button></div>}
      {!selectedPrompt && sourcePrompt && <div className="prompt-library-link-note"><span>Personalizado a partir de {sourcePrompt.title}. Alterações da biblioteca não são aplicadas enquanto estiver desvinculado.</span><button className="secondary-button" type="button" onClick={() => linkPrompt(sourcePrompt.id)}>Restaurar vínculo</button></div>}
      <section className="prompt-condition-config" aria-label="Fontes do contexto automático">
        <div className="prompt-condition-heading"><strong>Contexto automático</strong><span>Defina o que acompanha a cópia deste prompt.</span></div>
        {([
          ["projectNotes", "Observações do projeto"],
          ["projectContexts", "Contextos vinculados ao projeto"],
          ["projectLinks", "Materiais e links do projeto"],
          ["summary", "Sumário consolidado"],
        ] as const).map(([key, label]) => <label className="check-item-row compact" key={key}>
          <input type="checkbox" checked={key === "projectNotes" ? block.config.contextSources?.[key] !== false : Boolean(block.config.contextSources?.[key])} onChange={(event) => onUpdate({ config: { contextSources: { ...(block.config.contextSources ?? {}), [key]: event.target.checked } } })} />
          <span className="check-item-control">{(key === "projectNotes" ? block.config.contextSources?.[key] !== false : Boolean(block.config.contextSources?.[key])) && <Check size={16} />}</span><span>{label}</span>
        </label>)}
      </section>
      <label className="field prompt-content-config">
        <span>Orientação breve</span>
        <input value={draftDescription} placeholder="Ex.: envie este prompt junto com o projeto consolidado" onChange={(event) => setDraftDescription(event.target.value)} onBlur={savePromptDraft} />
      </label>
      <SelectField label="Ferramenta" value={toolId} onChange={(nextToolId) => onUpdate({ config: { toolId: nextToolId, contentSnapshot: draftPromptText, description: draftDescription, expectedOutput: draftExpectedOutput, promptId: block.config.promptId ?? null } })} options={tables.ai_tools.map((tool) => ({ value: tool.id, label: tool.name }))} emptyLabel="Não vinculado" />
      <label className="field prompt-content-config">
        <span>Texto do prompt</span>
        <textarea value={draftPromptText} rows={6} placeholder="Cole o prompt ou selecione um da biblioteca" disabled={Boolean(selectedPrompt)} onChange={(event) => setDraftPromptText(event.target.value)} onBlur={savePromptDraft} />
      </label>
      <label className="field prompt-content-config">
        <span>Resultado esperado</span>
        <input value={draftExpectedOutput} placeholder="Ex.: apresentacao por topicos gerada no NotebookLM" onChange={(event) => setDraftExpectedOutput(event.target.value)} onBlur={savePromptDraft} />
      </label>
      <section className="prompt-attachment-config" aria-label="Arquivos de apoio do prompt">
        <div className="prompt-condition-heading"><strong>Arquivos de apoio</strong><span>Habilite somente quando este prompt precisar entregar ou receber arquivos.</span></div>
        <label className="check-item-row compact">
          <input
            type="checkbox"
            checked={Boolean(block.config.attachmentsEnabled)}
            onChange={(event) => onUpdate({ config: { attachmentsEnabled: event.target.checked, attachmentsRequired: event.target.checked ? Boolean(block.config.attachmentsRequired) : false, allowMultipleFiles: true } })}
          />
          <span className="check-item-control">{block.config.attachmentsEnabled && <Check size={16} />}</span>
          <span>Permitir anexar arquivos de apoio</span>
        </label>
        {block.config.attachmentsEnabled && (
          <label className="check-item-row compact">
            <input type="checkbox" checked={Boolean(block.config.attachmentsRequired)} onChange={(event) => onUpdate({ config: { attachmentsRequired: event.target.checked } })} />
            <span className="check-item-control">{block.config.attachmentsRequired && <Check size={16} />}</span>
            <span>Exigir pelo menos um arquivo para confirmar a aplicação</span>
          </label>
        )}
      </section>
      <section className="prompt-condition-config" aria-label="Condições para confirmar aplicação">
        <div className="prompt-condition-heading"><strong>Condições para confirmar aplicação</strong><span>Opcional: sem condição, a confirmação é direta.</span></div>
        {applicationConditions.map((condition) => (
          <div className="prompt-condition-row" key={condition.id}>
            <CheckCircle2 size={14} />
            <span>{condition.label}</span>
            <button className="icon-button danger" type="button" title="Remover condição" onClick={() => removeApplicationCondition(condition.id)}><Trash2 size={14} /></button>
          </div>
        ))}
        <div className="inline-form prompt-condition-add"><input value={draftCondition} placeholder="Ex.: envio junto com o projeto consolidado" onChange={(event) => setDraftCondition(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addApplicationCondition(); } }} /><button className="secondary-button" type="button" onClick={addApplicationCondition}><Plus size={15} /> Condição</button></div>
      </section>
      <div className="inline-actions prompt-settings-actions">
        <button className="secondary-button" type="button" onClick={savePromptDraft}><Save size={15} /> Salvar alterações</button>
        <button className="secondary-button" type="button" disabled={!canSaveToLibrary} onClick={() => void saveToLibrary()}><Save size={15} /> Salvar na biblioteca e vincular</button>
      </div>
    </div>
  );
}

function PromptExecutionBlock({ block, value, tables, stepId, currentUser, ownerType, project, selectedStep, isStructureEditing, onSaveValue, onUpdate }: { block: StepBuilderBlock; value: any; tables: Tables; stepId: string; currentUser: AppUser | null; ownerType: "project" | "client"; project: Project; selectedStep: ProjectStep; isStructureEditing: boolean; onSaveValue: (value: unknown) => void; onUpdate: (patch: Partial<StepBuilderBlock>) => void }) {
  const runtimeValue = value && typeof value === "object" && !Array.isArray(value) ? value as PromptBlockRuntimeValue : {};
  const linkedPrompt = tables.prompts.find((prompt) => prompt.id === block.config.promptId) ?? null;
  const tool = tables.ai_tools.find((item) => item.id === (linkedPrompt?.ai_tool_id ?? block.config.toolId)) ?? null;
  const rawPromptText = resolvePromptContent(block.config, linkedPrompt?.content).trim();
  const projectType = tables.project_types.find((item) => item.id === project.project_type_id)?.name ?? null;
  const latestSummary = tables.project_summaries.filter((summary) => summary.project_id === project.id && summary.consolidated_text).sort((left, right) => right.version_number - left.version_number)[0] ?? null;
  const responsibleName = getResponsibleName(project, tables.app_users);
  const contextSources = (block.config.contextSources && typeof block.config.contextSources === "object" ? block.config.contextSources : {}) as { projectNotes?: boolean; projectContexts?: boolean; projectLinks?: boolean; summary?: boolean };
  const projectStepIds = new Set(tables.project_steps.filter((item) => item.project_id === project.id).map((item) => item.id));
  const contextSections = [
    contextSources.projectNotes !== false && project.notes ? `OBSERVACOES DO PROJETO:\n${project.notes}` : "",
    contextSources.projectContexts && tables.project_step_contexts.filter((item) => projectStepIds.has(item.project_step_id) && item.status !== "arquivado").map((item) => `CONTEXTO - ${item.title}:\n${item.content}`).join("\n\n"),
    contextSources.projectLinks && tables.project_step_links.filter((item) => projectStepIds.has(item.project_step_id)).map((item) => `MATERIAL - ${item.title}: ${item.url}${item.notes ? ` (${item.notes})` : ""}`).join("\n"),
  ].filter(Boolean).join("\n\n");
  const promptText = interpolateJourneyPrompt(rawPromptText, { projectName: project.name, company: project.company, projectType, stepName: selectedStep.name, responsible: responsibleName, context: contextSections, summary: contextSources.summary === false ? null : latestSummary?.consolidated_text ?? null }).trim();
  const expectedOutput = String(block.config.expectedOutput ?? "").trim();
  const copyCount = Number(runtimeValue.copyCount ?? 0);
  const isApplied = Boolean(runtimeValue.applied || runtimeValue.forceCompleted);
  const conditions = Array.isArray(block.config.applicationConditions)
    ? block.config.applicationConditions as Array<{ id: string; label: string; required?: boolean }>
    : [];
  const conditionChecks = runtimeValue.conditionChecks ?? {};
  const requiredConditions = conditions.filter((condition) => condition.required !== false);
  const attachmentsEnabled = Boolean(block.config.attachmentsEnabled);
  const attachmentsRequired = attachmentsEnabled && Boolean(block.config.attachmentsRequired);
  const [attachedFiles, setAttachedFiles] = useState<JourneyRuntimeFile[]>([]);
  const conditionsComplete = requiredConditions.every((condition) => Boolean(conditionChecks[condition.id]));
  const canConfirm = conditionsComplete && (!attachmentsRequired || attachedFiles.length > 0);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const hasConditions = requiredConditions.length > 0 || attachmentsRequired;

  function persist(next: PromptBlockRuntimeValue) {
    onSaveValue({ ...runtimeValue, ...next });
  }

  async function copyPrompt() {
    if (!promptText) return;
    const copied = await copyToClipboard(promptText, "Prompt");
    if (!copied) return;
    setCopyFeedback(true);
    window.setTimeout(() => setCopyFeedback(false), 1400);
    persist({ copyCount: copyCount + 1, lastCopiedAt: new Date().toISOString() });
  }

  function toggleApplied() {
    if (isApplied) {
      persist({ applied: false, appliedAt: null });
      return;
    }
    if (!canConfirm) return;
    persist({ applied: true, appliedAt: new Date().toISOString() });
  }

  function setCondition(conditionId: string, checked: boolean) {
    persist({ conditionChecks: { ...conditionChecks, [conditionId]: checked } });
  }

  if (!promptText) {
    return (
      <div className="prompt-execution-card empty">
        <div>
          <strong>Prompt ainda não configurado</strong>
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
          <span>{tool?.name ?? "Ferramenta não vinculada"}{expectedOutput ? ` - ${expectedOutput}` : ""}</span>
        </div>
        <div className="prompt-execution-stats">
          <span>{copyCount} copia(s)</span>
          {(block.required || isApplied) && <span>{isApplied ? "Aplicado" : "Pendente"}</span>}
        </div>
      </div>
      <div className="prompt-execution-actions">
        <button className={`primary-button copy-feedback-button ${copyFeedback ? "copied" : ""}`} type="button" onClick={copyPrompt}><Copy size={15} /> {copyFeedback ? "Copiado!" : "Copiar prompt"}</button>
        <button className={`secondary-button ${isApplied ? "is-applied" : ""}`} type="button" disabled={!isApplied && !canConfirm} onClick={toggleApplied}><CheckCircle2 size={15} /> {isApplied ? "Aplicado" : "Confirmar aplicação"}</button>
        {isStructureEditing && <button className="icon-button subtle" type="button" title="Atualizar título pelo prompt vinculado" disabled={!linkedPrompt} onClick={() => linkedPrompt && onUpdate({ title: linkedPrompt.title })}><RefreshCw size={14} /></button>}
      </div>
      {isStructureEditing && rawPromptText && <details className="prompt-interpolation-preview"><summary>Previa com dados da jornada</summary><pre>{promptText}</pre></details>}
      {hasConditions && !isApplied && (
        <div className="prompt-conditions-runtime" role="group" aria-label="Condições da aplicação">
          <strong>Confirme as condições antes de aplicar</strong>
          {conditions.map((condition) => <label className={`check-item-row compact ${conditionChecks[condition.id] ? "done" : ""}`} key={condition.id}><input type="checkbox" checked={Boolean(conditionChecks[condition.id])} onChange={(event) => setCondition(condition.id, event.target.checked)} /><span className="check-item-control">{conditionChecks[condition.id] && <Check size={14} />}</span><span>{condition.label}</span></label>)}
          {attachmentsRequired && <div className={`prompt-attachment-requirement ${attachedFiles.length ? "complete" : "pending"}`}><FileText size={14} /><span>{attachedFiles.length ? `${attachedFiles.length} arquivo(s) de apoio anexado(s)` : "Anexe pelo menos um arquivo de apoio"}</span></div>}
          <span className="prompt-conditions-help">Marque todas as condições para habilitar a confirmação acima.</span>
        </div>
      )}
      {attachmentsEnabled && <FileRuntimeBlock block={block} stepId={stepId} currentUser={currentUser} ownerType={ownerType} label="Anexar arquivos de apoio" onFilesChange={setAttachedFiles} />}
    </div>
  );
}
function LegacySummaryOperationalBlock({
  block,
  value,
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
  onArchiveGeneratedPrompt,
  onSaveValue,
  onOpenSummary,
  isStructureEditing,
}: {
  block: StepBuilderBlock;
  value: any;
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
  onSaveGeneratedPrompt: (payload: GeneratedPromptWrite) => Promise<boolean>;
  onArchiveGeneratedPrompt: (promptId: string, summaryItemId?: string) => void;
  onSaveValue: (value: unknown) => void;
  onOpenSummary: () => void;
  isStructureEditing: boolean;
}) {
  const [summarySearch, setSummarySearch] = useState("");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [collapsedTopicIds, setCollapsedTopicIds] = useState<string[]>([]);
  const [promptScopeIds, setPromptScopeIds] = useState<string[]>([]);
  const [selectedPromptOptions, setSelectedPromptOptions] = useState<string[]>([]);
  const [statusMenuItemId, setStatusMenuItemId] = useState<string | null>(null);
  const initializedSummaryId = useRef<string | null>(null);

  const summary = resolveBoundSummary(summaries, String(block.config.summaryId ?? ""));
  const items = summary ? summaryItems.filter((item) => item.summary_id === summary.id).sort(byOrder) : [];
  const selectedItems = items.filter((item) => item.is_selected);
  const visibleItems = getVisibleSummaryItems(items, collapsedTopicIds, summarySearch);
  const summaryPrompts = summary ? generatedPrompts
    .filter((prompt) => prompt.summary_id === summary.id && prompt.status !== "arquivado")
    .sort((left, right) => left.created_at.localeCompare(right.created_at)) : [];
  const promptCoveredItemIds = new Set(summaryPrompts.flatMap((prompt) => getGeneratedPromptItemIds(prompt)));
  const coveredSelectedCount = selectedItems.filter((item) => promptCoveredItemIds.has(item.id)).length;
  const summaryStatusOptions: SummaryItemStatus[] = ["pendente", "em_andamento", "desenvolvido", "em_revisao", "concluido", "bloqueado", "arquivado"];
  const completedSelectedCount = selectedItems.filter((item) => item.status === "concluido" || item.status === "desenvolvido").length;
  const reviewSelectedCount = selectedItems.filter((item) => item.status === "em_revisao").length;
  const blockedSelectedCount = selectedItems.filter((item) => item.status === "bloqueado").length;
  const selectedPromptItems = promptScopeIds.length ? items.filter((item) => promptScopeIds.includes(item.id)).sort(byOrder) : [];
  const summaryPromptConfig = resolveSummaryPromptConfig(summary, tables.project_summaries);
  const promptAdditions = summaryPromptConfig.additions ?? [];
  const basePromptText = summaryPromptConfig.basePromptSnapshot?.trim() ?? "";
  const triggerPromptText = summaryPromptConfig.triggerPromptSnapshot?.trim() ?? "";
  const projectType = tables.project_types.find((item) => item.id === project.project_type_id)?.name ?? null;
  const projectStepIds = new Set(tables.project_steps.filter((item) => item.project_id === project.id).map((item) => item.id));
  const operationalContext = [
    project.notes?.trim() ?? "",
    ...tables.project_step_contexts
      .filter((context) => projectStepIds.has(context.project_step_id) && context.status !== "arquivado")
      .map((context) => `${context.title}: ${context.content}`.trim()),
    ...tables.project_step_links
      .filter((link) => projectStepIds.has(link.project_step_id))
      .map((link) => `${link.title}: ${link.url}`),
  ].filter(Boolean).join("\n\n") || "Nenhum contexto adicional foi cadastrado para este projeto.";
  const resolvedTriggerPromptText = triggerPromptText
    ? interpolateJourneyPrompt(triggerPromptText, {
      projectName: project.name,
      company: project.company,
      projectType,
      stepName: selectedStep.name,
      responsible: getResponsibleName(project, tables.app_users),
      context: operationalContext,
      summary: summary?.consolidated_text?.trim() ?? null,
    }).trim()
    : "";
  const basePrompt = basePromptText
    ? { id: "", content: basePromptText, ai_tool_id: null, title: "Prompt base desta versão" } as Pick<Prompt, "id" | "content" | "ai_tool_id" | "title">
    : null;
  const selectedPromptAdditions = promptAdditions.filter((addition) => selectedPromptOptions.includes(addition.id));
  const finalPrompt = composeGeneratedPrompt({
    project,
    step: selectedStep,
    summary,
    item: selectedPromptItems[0] ?? selectedItems[0] ?? items[0] ?? null,
    items: selectedPromptItems,
    basePrompt,
    blocks: [],
    projectContext: operationalContext,
    promptOptions: selectedPromptAdditions.map((addition) => `${addition.label}: ${addition.content}`),
  });
  const collapsibleIds = items.filter((item) => items.some((child) => child.parent_id === item.id)).map((item) => item.id);
  const allCollapsed = collapsibleIds.length > 0 && collapsibleIds.every((id) => collapsedTopicIds.includes(id));
  const versionStateLabel = summary?.status === "active" ? "Versão em uso" : "Versão em edicao";
  const versionStateHelp = summary?.status === "active" ? "Esta e a versão aplicada na jornada." : "Rascunho para revisar antes de ativar.";

  useEffect(() => {
    if (!summary || initializedSummaryId.current === summary.id) return;
    initializedSummaryId.current = summary.id;
    setCollapsedTopicIds(collapsibleIds);
    setPromptScopeIds([]);
    setStatusMenuItemId(null);
  }, [summary?.id, collapsibleIds]);

  useEffect(() => {
    setSelectedPromptOptions(promptAdditions.filter((addition) => addition.enabledByDefault).map((addition) => addition.id));
  }, [summary?.id, summary?.prompt_config_json]);

  function toggleCollapsedTopic(itemId: string) {
    const branchCollapsibleIds = collectSummaryBranchIds(items, itemId).filter((id) => collapsibleIds.includes(id));
    setCollapsedTopicIds((current) => current.includes(itemId)
      ? current.filter((id) => !branchCollapsibleIds.includes(id))
      : [...new Set([...current, itemId])]);
  }

  function selectPromptScope(ids: string[]) {
    setPromptScopeIds([...new Set(ids)]);
  }

  function togglePromptScopeBranch(ids: string[]) {
    const allSelected = ids.every((id) => promptScopeIds.includes(id));
    setPromptScopeIds((current) => allSelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  }

  function togglePromptOption(option: string) {
    setSelectedPromptOptions((current) => (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]));
  }

  async function saveComposedPrompt() {
    if (isSavingPrompt || !summary || !basePrompt || !finalPrompt.trim() || selectedPromptItems.length === 0) return;
    setIsSavingPrompt(true);
    const summaryItemIds = selectedPromptItems.map((item) => item.id);
    try {
      await onSaveGeneratedPrompt({
        project_id: project.id,
        summary_id: summary.id,
        summary_item_id: summaryItemIds[0] ?? null,
        base_prompt_id: null,
        base_prompt_snapshot: basePrompt.content,
        selected_blocks_json: JSON.stringify({ schemaVersion: 1, summaryItemIds, promptOptions: selectedPromptAdditions, promptBlocks: [] }),
        final_prompt: finalPrompt,
        notes: summaryItemIds.length > 1 ? `${summaryItemIds.length} topicos selecionados` : selectedPromptItems[0] ? `Topico ${selectedPromptItems[0].topic_number} - ${selectedPromptItems[0].title}` : "Prompt geral do sumário",
        ai_tool_id: null,
        created_by: currentUser?.name ?? null,
      });
    } finally {
      setIsSavingPrompt(false);
    }
  }

  function updateSummaryItemStatus(item: ProjectSummaryItem, status: SummaryItemStatus) {
    const ids = collectSummaryBranchIds(items, item.id);
    ids.forEach((id) => onUpdateItem(id, { status }));
    setStatusMenuItemId(null);
  }

  function completeSelectedTopics() {
    const selected = new Set(promptScopeIds);
    const selectedRoots = items.filter((item) => selected.has(item.id) && (!item.parent_id || !selected.has(item.parent_id)));
    selectedRoots.forEach((item) => updateSummaryItemStatus(item, "concluido"));
  }

  async function saveSummaryToTemplate() {
    if (!summary) return;
    if (!project.journey_template_id) {
      window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message: "Salve a jornada como template antes de salvar o sumário." } }));
      return;
    }
    setIsSavingTemplate(true);
    try {
      const response = await fetch(`${cloudflareApiUrl}/api/projects/${encodeURIComponent(project.id)}/summary-template`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepId: selectedStep.id, blockId: block.id, summaryId: summary.id, createdBy: currentUser?.name ?? null }),
      });
      const body = await response.json() as { data?: { itemCount?: number }; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar o sumário no template.");
      window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message: `Sumário salvo no template com ${body.data?.itemCount ?? 0} topico(s) e configurações de prompt.` } }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message: error instanceof Error ? error.message : "Não foi possível salvar o sumário no template." } }));
    } finally {
      setIsSavingTemplate(false);
    }
  }

  if (!summary) {
    return (
      <div className="summary-operational-block empty-summary-operational">
        <div className="empty-state compact">
          <GitBranch size={28} />
          <strong>Nenhum sumário vinculado</strong>
          <span>Abra o editor para importar e selecionar a estrutura do sumário.</span>
          <button className="primary-button" type="button" onClick={onOpenSummary}>Editar estrutura do sumário</button>
        </div>
      </div>
    );
  }

  return (
    <div className="summary-operational-block">
      <div className="summary-operational-head slim-summary-head">
        <div>
          <span className={`summary-version-state ${summary.status === "active" ? "active" : "draft"}`}>{versionStateLabel}</span>
          <strong>Versao {summary.version_number}</strong>
          <span>{versionStateHelp} {selectedItems.length}/{items.length} topicos no sumario · {coveredSelectedCount} topico(s) com prompt.</span>
        </div>
        <div className="inline-actions">
          {isStructureEditing && <button className="secondary-button" type="button" disabled={isSavingTemplate} onClick={() => void saveSummaryToTemplate()} title="Salva a estrutura, seleção e configuracao de prompts deste sumário no template vinculado"><Save size={15} /> {isSavingTemplate ? "Salvando..." : "Salvar sumário no template"}</button>}
          <button className="secondary-button" type="button" disabled={!summary.consolidated_text} onClick={() => void copyToClipboard(summary.consolidated_text ?? "", "Sumário consolidado")}><Copy size={15} /> Copiar sumário</button>
          <button className="secondary-button" type="button" disabled={!resolvedTriggerPromptText} title={resolvedTriggerPromptText ? "Copiar prompt de gatilho do sumário" : "Configure o prompt de gatilho no editor"} onClick={() => void copyToClipboard(resolvedTriggerPromptText, "Prompt de gatilho")}><Copy size={15} /> Copiar gatilho</button>
          <button className={`secondary-button ${value?.completed ? "is-applied" : ""}`} type="button" disabled={selectedItems.length === 0 || !selectedItems.every((item) => item.status === "concluido")} onClick={() => onSaveValue({ ...(value && typeof value === "object" ? value : {}), completed: true, summaryId: summary.id, summaryVersion: summary.version_number, completedAt: new Date().toISOString() })}><CheckCircle2 size={15} /> {value?.completed ? "Sumário concluido" : "Concluir sumário"}</button>
          <button className="primary-button" type="button" onClick={onOpenSummary}><GitBranch size={15} /> Editar estrutura do sumário</button>
        </div>
      </div>

      <div className="summary-operational-metrics" aria-label="Resumo operacional do sumário">
        <div><strong>{selectedItems.length}/{items.length}</strong><span>Selecionados</span></div>
        <div><strong>{completedSelectedCount}</strong><span>Finalizados</span></div>
        <div><strong>{reviewSelectedCount}</strong><span>Em revisao</span></div>
        <div><strong>{blockedSelectedCount}</strong><span>Bloqueados</span></div>
        <div><strong>{coveredSelectedCount}</strong><span>Topicos com prompt</span></div>
      </div>

      <div className="summary-operational-tools">
        <label className="summary-search-field">
          <Search size={15} />
          <input value={summarySearch} onChange={(event) => setSummarySearch(event.target.value)} placeholder="Buscar topico" />
        </label>
        <button className="secondary-button" type="button" disabled={!allCollapsed && collapsedTopicIds.length === 0} onClick={() => setCollapsedTopicIds([])}>Ver tudo</button>
        <button className="secondary-button summary-bulk-complete" type="button" disabled={promptScopeIds.length === 0} onClick={completeSelectedTopics}><CheckCircle2 size={15} /> Concluir selecionados</button>
        <button className="secondary-button" type="button" disabled={allCollapsed} onClick={() => setCollapsedTopicIds(collapsibleIds)}>So capitulos</button>
        <button className="secondary-button" type="button" disabled={items.length === 0} onClick={() => selectPromptScope(items.map((item) => item.id))}>Selecionar sumário inteiro</button>
        <button className="secondary-button" type="button" disabled={promptScopeIds.length === 0} onClick={() => setPromptScopeIds([])}>Limpar prompt</button>
      </div>

      {promptScopeIds.length > 0 && (
        <div className="summary-floating-composer">
          <div className="summary-composer-selection"><strong>{promptScopeIds.length} topico(s) selecionado(s)</strong><span>Estes itens vao compor o prompt desta versão.</span></div>
          <div className="prompt-option-grid mini-options">
            {promptAdditions.length ? promptAdditions.map((addition, index) => {
              const AdditionIcon = summaryAdditionIcon(addition.label);
              const labelDensity = addition.label.trim().length <= 12
                ? "label-short"
                : addition.label.trim().length >= 23
                  ? "label-long"
                  : "label-medium";
              return (
                <label className={`summary-option-card ${labelDensity} tone-${index % 5} ${selectedPromptOptions.includes(addition.id) ? "selected" : ""}`} key={addition.id}>
                  <input type="checkbox" checked={selectedPromptOptions.includes(addition.id)} onChange={() => togglePromptOption(addition.id)} />
                  <AdditionIcon size={14} aria-hidden="true" />
                  <span>{addition.label}</span>
                </label>
              );
            }) : <span className="summary-additions-empty">Configure adicionais no editor do sumário.</span>}
          </div>
          <button className="summary-composer-save-card primary-button" type="button" disabled={!basePrompt || isSavingPrompt} onClick={() => void saveComposedPrompt()}>{isSavingPrompt ? <Loader2 className="spin" size={15} /> : <Save size={15} />} {isSavingPrompt ? "Salvando" : "Salvar prompt"}</button>
          <button className="summary-composer-trigger-card secondary-button" type="button" disabled={!resolvedTriggerPromptText} title={resolvedTriggerPromptText ? "Copiar prompt fixo para iniciar a execução" : "Configure o prompt de gatilho no editor"} onClick={() => void copyToClipboard(resolvedTriggerPromptText, "Prompt de gatilho")}><Copy size={15} /> Copiar gatilho</button>
        </div>
      )}

      <div className="summary-operational-tree">
        {visibleItems.map((item) => {
          const childCount = items.filter((child) => child.parent_id === item.id).length;
          const branchIds = collectSummaryBranchIds(items, item.id);
          const selectedInBranch = branchIds.filter((id) => promptScopeIds.includes(id)).length;
          const isPromptScope = selectedInBranch === branchIds.length && branchIds.length > 0;
          const isPromptScopePartial = selectedInBranch > 0 && !isPromptScope;
          const generatedForItem = summaryPrompts.filter((prompt) => getGeneratedPromptItemIds(prompt).includes(item.id));
          const coveredInBranch = branchIds.filter((id) => promptCoveredItemIds.has(id)).length;

          return (
            <article className={`summary-item tree-row operational-row level-${Math.min(item.level, 4)} ${item.is_selected ? "selected" : "excluded"} ${isPromptScope ? "prompt-scope" : ""} ${statusMenuItemId === item.id ? "status-menu-open" : ""}`} key={item.id} style={{ "--tree-level": Math.max(0, item.level - 1) } as CSSProperties}>
              <button className="summary-expand-button" disabled={childCount === 0} onClick={() => toggleCollapsedTopic(item.id)} title={collapsedTopicIds.includes(item.id) ? "Expandir topico" : "Recolher topico"}>{childCount > 0 ? (collapsedTopicIds.includes(item.id) ? "+" : "-") : ""}</button>
              {isStructureEditing ? (
                <button className={`checkbox ${item.is_selected ? "checked" : ""}`} onClick={() => onSetSelection(summary.id, item.id, !item.is_selected)} title="Entrar no sumário consolidado">{item.is_selected && <Check size={14} />}</button>
              ) : <button
                className={`checkbox prompt-scope-checkbox ${isPromptScope ? "checked" : ""} ${isPromptScopePartial ? "partial" : ""}`}
                onClick={() => togglePromptScopeBranch(branchIds)}
                title={childCount > 0 ? "Selecionar este capitulo e seus subtitulos para o prompt" : "Selecionar este topico para o prompt"}
              >{isPromptScope ? <Check size={14} /> : isPromptScopePartial ? "-" : ""}</button>}
              <span className="summary-topic-number">{item.topic_number}</span>
              <div className="summary-item-main">
                {isStructureEditing ? (
                  <InlineText defaultValue={item.title} className="summary-title-input" onSave={(value) => onUpdateItem(item.id, { title: value })} />
                ) : <strong className="summary-topic-title">{item.title}</strong>}
                <div className="summary-item-controls compact-topic-meta">
                  <div className="summary-status-control">
                    <button className={`summary-status-trigger ${item.status}`} type="button" onClick={(event) => { event.stopPropagation(); setStatusMenuItemId((current) => current === item.id ? null : item.id); }}>
                      <span className={`summary-status-dot ${item.status}`} />
                      {formatStatus(item.status)}
                      <ChevronDown size={12} aria-hidden="true" />
                    </button>
                    {statusMenuItemId === item.id && (
                      <div className="summary-status-menu" role="menu">
                        {summaryStatusOptions.map((status) => <button key={status} className={status === item.status ? "active" : ""} type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); updateSummaryItemStatus(item, status); }}>{formatStatus(status)}</button>)}
                      </div>
                    )}
                  </div>
                  {childCount > 0 && <span className="summary-mini-chip">{childCount} sub</span>}
                  {coveredInBranch > 0 && <span className="summary-mini-chip covered" title={`${coveredInBranch} de ${branchIds.length} topico(s) deste ramo possuem prompt gerado.`}>{coveredInBranch} de {branchIds.length} com prompt</span>}
                  {generatedForItem.map((prompt) => {
                    const promptNumber = summaryPrompts.findIndex((candidate) => candidate.id === prompt.id) + 1;
                    return (
                      <span className="summary-generated-prompt" key={prompt.id}>
                        <button className="summary-copy-chip prompt-tone" style={{ "--summary-prompt-hue": promptToneHue(prompt.id) } as CSSProperties} onClick={() => void copyToClipboard(prompt.final_prompt, `Prompt v${promptNumber}`)}><Copy size={13} /> Prompt v{promptNumber}</button>
                        <button className="summary-archive-prompt" type="button" title={`Remover somente o Prompt v${promptNumber} deste topico`} onClick={() => onArchiveGeneratedPrompt(prompt.id, item.id)}><X size={12} /></button>
                      </span>
                    );
                  })}
                </div>
              </div>
              {isStructureEditing && <button className="icon-button subtle operational-danger-action" title="Excluir topico" onClick={() => onDeleteItem(summary.id, item.id)}><Trash2 size={15} /></button>}
            </article>
          );
        })}
      </div>
    </div>
  );
}

type SummaryTechnicalExecutionBlockProps = {
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
  onSaveGeneratedPrompt: (payload: GeneratedPromptWrite) => Promise<boolean>;
  onOpenSummary: () => void;
  isStructureEditing: boolean;
};

function SummaryTechnicalExecutionBlock({
  block,
  project,
  selectedStep,
  tables,
  summaries,
  summaryItems,
  generatedPrompts,
  currentUser,
  onUpdateItem,
  onSaveGeneratedPrompt,
  onOpenSummary,
  isStructureEditing,
}: SummaryTechnicalExecutionBlockProps) {
  const [viewMode, setViewMode] = useState<"progress" | "compose">("progress");
  const [summarySearch, setSummarySearch] = useState("");
  const [collapsedTopicIds, setCollapsedTopicIds] = useState<string[]>([]);
  const [promptScopeIds, setPromptScopeIds] = useState<string[]>([]);
  const [focusedTopicId, setFocusedTopicId] = useState<string | null>(null);
  const [basePromptId, setBasePromptId] = useState("");
  const [selectedPromptOptions, setSelectedPromptOptions] = useState<string[]>(["Mais técnico", "Formato Word"]);

  const summary = resolveBoundSummary(summaries, String(block.config.summaryId ?? ""));
  const items = summary ? summaryItems.filter((item) => item.summary_id === summary.id).sort(byOrder) : [];
  const selectedItems = items.filter((item) => item.is_selected);
  const visibleItems = getVisibleSummaryItems(items, collapsedTopicIds, summarySearch);
  const summaryPrompts = summary ? generatedPrompts.filter((prompt) => prompt.summary_id === summary.id) : [];
  const promptCoveredItemIds = new Set(summaryPrompts.flatMap((prompt) => getGeneratedPromptItemIds(prompt)));
  const focusedItem = items.find((item) => item.id === focusedTopicId) ?? null;
  const focusedPrompts = focusedItem ? summaryPrompts.filter((prompt) => getGeneratedPromptItemIds(prompt).includes(focusedItem.id)) : [];
  const selectedPromptItems = items.filter((item) => promptScopeIds.includes(item.id)).sort(byOrder);
  const basePrompt = tables.prompts.find((prompt) => prompt.id === basePromptId) ?? null;
  const collapsibleIds = items.filter((item) => items.some((child) => child.parent_id === item.id)).map((item) => item.id);
  const allCollapsed = collapsibleIds.length > 0 && collapsibleIds.every((id) => collapsedTopicIds.includes(id));
  const completedCount = selectedItems.filter((item) => item.status === "concluido" || item.status === "desenvolvido").length;
  const coveredSelectedCount = selectedItems.filter((item) => promptCoveredItemIds.has(item.id)).length;
  const versionStateLabel = summary?.status === "active" ? "Versão em uso" : "Versão em edicao";
  const versionStateHelp = summary?.status === "active" ? "Aplicada nesta jornada." : "Rascunho para revisar antes de ativar.";
  const finalPrompt = composeGeneratedPrompt({
    project,
    step: selectedStep,
    summary,
    item: selectedPromptItems[0] ?? focusedItem ?? selectedItems[0] ?? items[0] ?? null,
    items: selectedPromptItems,
    basePrompt,
    blocks: [],
    promptOptions: selectedPromptOptions,
  });

  function toggleCollapsedTopic(itemId: string) {
    setCollapsedTopicIds((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
  }

  function togglePromptScopeItem(itemId: string) {
    setPromptScopeIds((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
    setFocusedTopicId(itemId);
  }

  function selectPromptScope(ids: string[]) {
    setPromptScopeIds([...new Set(ids)]);
    setFocusedTopicId(ids[0] ?? null);
  }

  function exitComposeMode() {
    setViewMode("progress");
    setPromptScopeIds([]);
  }

  function togglePromptOption(option: string) {
    setSelectedPromptOptions((current) => current.includes(option) ? current.filter((item) => item !== option) : [...current, option]);
  }

  async function copyAndSavePrompt() {
    if (!summary || !finalPrompt.trim() || selectedPromptItems.length === 0) return;
    const summaryItemIds = selectedPromptItems.map((item) => item.id);
    const copied = await copyToClipboard(finalPrompt, "Composicao de prompt");
    if (!copied) return;
    await onSaveGeneratedPrompt({
      project_id: project.id,
      summary_id: summary.id,
      summary_item_id: summaryItemIds[0] ?? null,
      base_prompt_id: basePrompt?.id ?? null,
      base_prompt_snapshot: basePrompt?.content ?? null,
      selected_blocks_json: JSON.stringify({ schemaVersion: 1, summaryItemIds, promptOptions: selectedPromptOptions, promptBlocks: [] }),
      final_prompt: finalPrompt,
      notes: summaryItemIds.length > 1 ? `${summaryItemIds.length} topicos selecionados` : selectedPromptItems[0] ? `Topico ${selectedPromptItems[0].topic_number} - ${selectedPromptItems[0].title}` : "Prompt geral do sumário",
      ai_tool_id: basePrompt?.ai_tool_id ?? null,
      created_by: currentUser?.name ?? null,
    });
  }

  if (!summary) {
    return (
      <div className="summary-technical-empty">
        <GitBranch size={26} />
        <strong>Nenhum sumário vinculado</strong>
        <span>Abra o editor para importar e consolidar a estrutura do projeto.</span>
        <button className="primary-button" type="button" onClick={onOpenSummary}><GitBranch size={15} /> Editar estrutura do sumário</button>
      </div>
    );
  }

  return (
    <section className={`summary-technical-workspace ${viewMode === "compose" ? "is-composing" : "is-progress"}`}>
      <header className="summary-technical-header">
        <div className="summary-technical-version">
          <span className={`summary-version-state ${summary.status === "active" ? "active" : "draft"}`}>{versionStateLabel}</span>
          <strong>Versao {summary.version_number}</strong>
          <span>{isStructureEditing ? "Os topicos sao editados no editor dedicado." : versionStateHelp}</span>
        </div>
        <div className="summary-technical-progress" aria-label="Progresso do sumário">
          <span><b>{selectedItems.length}</b> topicos</span>
          <span><b>{completedCount}</b> finalizados</span>
          <span><b>{coveredSelectedCount}</b> com prompt</span>
        </div>
        <div className="summary-technical-actions">
          <button className="icon-button summary-copy-summary" type="button" disabled={!summary.consolidated_text} onClick={() => void copyToClipboard(summary.consolidated_text ?? "", "Sumário consolidado")} title="Copiar sumário consolidado"><Copy size={15} /></button>
          <button className="secondary-button summary-editor-trigger" type="button" onClick={onOpenSummary}><GitBranch size={15} /> Editar estrutura</button>
        </div>
      </header>

      <div className="summary-technical-toolbar">
        <label className="summary-search-field technical-search">
          <Search size={15} />
          <input value={summarySearch} onChange={(event) => setSummarySearch(event.target.value)} placeholder="Buscar topico" />
        </label>
        <button className="secondary-button" type="button" disabled={collapsedTopicIds.length === 0} onClick={() => setCollapsedTopicIds([])}>Expandir tudo</button>
        <button className="secondary-button" type="button" disabled={allCollapsed || collapsibleIds.length === 0} onClick={() => setCollapsedTopicIds(collapsibleIds)}>Recolher tudo</button>
        {viewMode === "progress" ? (
          <button className="primary-button summary-compose-trigger" type="button" onClick={() => setViewMode("compose")}><Sparkles size={15} /> Compor prompt</button>
        ) : (
          <>
            <button className="secondary-button" type="button" onClick={() => selectPromptScope(items.filter((item) => item.is_selected).map((item) => item.id))}>Selecionar sumário</button>
            <button className="secondary-button" type="button" disabled={promptScopeIds.length === 0} onClick={() => setPromptScopeIds([])}>Limpar</button>
            <button className="secondary-button" type="button" onClick={exitComposeMode}><X size={15} /> Sair da composicao</button>
          </>
        )}
      </div>

      <div className="summary-technical-layout">
        <div className="summary-tree-shell">
          <div className="summary-tree-columns" aria-hidden="true">
            <span>Estrutura</span><span>Estado</span><span>Prompt</span>
          </div>
          <div className="summary-technical-tree">
            {visibleItems.map((item) => {
              const childCount = items.filter((child) => child.parent_id === item.id).length;
              const branchIds = collectSummaryBranchIds(items, item.id);
              const hasPrompt = summaryPrompts.some((prompt) => getGeneratedPromptItemIds(prompt).includes(item.id));
              const prompt = summaryPrompts.find((candidate) => getGeneratedPromptItemIds(candidate).includes(item.id));
              const isFocused = item.id === focusedTopicId;
              const isInScope = promptScopeIds.includes(item.id);
              const rowLevel = Math.min(item.level, 4);

              return (
                <article className={`summary-technical-row level-${rowLevel} ${item.is_selected ? "included" : "excluded"} ${isFocused ? "focused" : ""} ${isInScope ? "in-prompt-scope" : ""}`} key={item.id} style={{ "--tree-level": Math.max(0, item.level - 1) } as CSSProperties}>
                  <button className="summary-tree-expand" type="button" disabled={childCount === 0} onClick={() => toggleCollapsedTopic(item.id)} title={collapsedTopicIds.includes(item.id) ? "Expandir topico" : "Recolher topico"}>
                    {childCount > 0 ? (collapsedTopicIds.includes(item.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />) : null}
                  </button>
                  {viewMode === "compose" && (
                    <button className={`summary-compose-checkbox ${isInScope ? "checked" : ""}`} type="button" onClick={() => togglePromptScopeItem(item.id)} aria-label={`Incluir ${item.title} na composicao`} aria-pressed={isInScope}>
                      {isInScope && <Check size={14} />}
                    </button>
                  )}
                  <button className="summary-tree-topic" type="button" onClick={() => setFocusedTopicId(item.id)}>
                    <span className="summary-technical-number">{item.topic_number}</span>
                    <strong>{item.title}</strong>
                  </button>
                  <span className={`summary-technical-status ${item.status}`} title={formatStatus(item.status)} aria-label={formatStatus(item.status)} />
                  {hasPrompt && prompt ? (
                    <button className="summary-row-prompt" type="button" onClick={() => void copyToClipboard(prompt.final_prompt, "Prompt do topico")} title="Copiar prompt vinculado"><Copy size={14} /></button>
                  ) : <span className="summary-row-prompt-placeholder" title="Sem prompt vinculado" />}
                  {viewMode === "compose" && childCount > 0 && (
                    <button className="summary-branch-select" type="button" onClick={() => selectPromptScope(branchIds)} title="Selecionar este ramo para compor o prompt"><GitBranch size={14} /></button>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        {focusedItem && (
          <SummaryTopicInspector
            item={focusedItem}
            prompt={focusedPrompts[0] ?? null}
            childCount={items.filter((child) => child.parent_id === focusedItem.id).length}
            viewMode={viewMode}
            onClose={() => setFocusedTopicId(null)}
            onUpdateStatus={(status) => onUpdateItem(focusedItem.id, { status })}
            onCopyPrompt={() => focusedPrompts[0] && void copyToClipboard(focusedPrompts[0].final_prompt, "Prompt do topico")}
            onComposeBranch={() => {
              setViewMode("compose");
              selectPromptScope(collectSummaryBranchIds(items, focusedItem.id));
            }}
          />
        )}
      </div>

      {viewMode === "compose" && (
        <SummaryComposerTray
          count={selectedPromptItems.length}
          basePromptId={basePromptId}
          promptOptions={selectedPromptOptions}
          prompts={tables.prompts.filter((prompt) => prompt.status !== "arquivado")}
          onBasePromptChange={setBasePromptId}
          onToggleOption={togglePromptOption}
          onClear={() => setPromptScopeIds([])}
          onCancel={exitComposeMode}
          onCopy={() => void copyAndSavePrompt()}
        />
      )}
    </section>
  );
}

function SummaryTopicInspector({ item, prompt, childCount, viewMode, onClose, onUpdateStatus, onCopyPrompt, onComposeBranch }: {
  item: ProjectSummaryItem;
  prompt: GeneratedPrompt | null;
  childCount: number;
  viewMode: "progress" | "compose";
  onClose: () => void;
  onUpdateStatus: (status: SummaryItemStatus) => void;
  onCopyPrompt: () => void;
  onComposeBranch: () => void;
}) {
  const statuses: SummaryItemStatus[] = ["pendente", "em_andamento", "desenvolvido", "em_revisao", "concluido", "bloqueado", "arquivado"];
  return (
    <aside className="summary-topic-inspector" aria-label={`Detalhes do topico ${item.topic_number}`}>
      <div className="summary-inspector-heading">
        <span>Topico selecionado</span>
        <button className="icon-button" type="button" onClick={onClose} title="Fechar detalhes"><X size={15} /></button>
      </div>
      <strong>{item.topic_number} {item.title}</strong>
      <label className="summary-inspector-field">
        <span>Estado do trabalho</span>
        <select value={item.status} onChange={(event) => onUpdateStatus(event.target.value as SummaryItemStatus)}>
          {statuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}
        </select>
      </label>
      <div className="summary-inspector-meta">
        <span>{childCount ? `${childCount} subtópico(s)` : "Tópico final"}</span>
        <span>{prompt ? "Prompt vinculado" : "Sem prompt vinculado"}</span>
      </div>
      {prompt ? (
        <button className="secondary-button summary-inspector-copy" type="button" onClick={onCopyPrompt}><Copy size={15} /> Copiar prompt</button>
      ) : (
        <button className="secondary-button summary-inspector-compose" type="button" onClick={onComposeBranch}><Sparkles size={15} /> Compor para este {childCount ? "ramo" : "topico"}</button>
      )}
      {viewMode === "compose" && <small>Use a caixa na arvore para incluir ou retirar este topico da composicao.</small>}
    </aside>
  );
}

function SummaryComposerTray({ count, basePromptId, promptOptions, prompts, onBasePromptChange, onToggleOption, onClear, onCancel, onCopy }: {
  count: number;
  basePromptId: string;
  promptOptions: string[];
  prompts: Prompt[];
  onBasePromptChange: (value: string) => void;
  onToggleOption: (option: string) => void;
  onClear: () => void;
  onCancel: () => void;
  onCopy: () => void;
}) {
  const options = ["Mais técnico", "Mais direto", "Incluir tabelas", "Considerar legislacao", "Apontar pendencias", "Formato Word"];
  return (
    <footer className="summary-composer-tray" aria-label="Compor prompt">
      <div className="summary-composer-count"><span>Compor prompt</span><strong>{count} topico(s) selecionado(s)</strong></div>
      <label className="summary-composer-base"><span>Prompt base</span><select value={basePromptId} onChange={(event) => onBasePromptChange(event.target.value)}><option value="">Sem prompt base</option>{prompts.map((prompt) => <option key={prompt.id} value={prompt.id}>{prompt.title}</option>)}</select></label>
      <div className="summary-composer-options">
        {options.map((option) => <label key={option}><input type="checkbox" checked={promptOptions.includes(option)} onChange={() => onToggleOption(option)} />{option}</label>)}
      </div>
      <div className="summary-composer-actions">
        <button className="icon-button" type="button" onClick={onClear} disabled={count === 0} title="Limpar seleção"><X size={15} /></button>
        <button className="secondary-button" type="button" onClick={onCancel}>Cancelar</button>
        <button className="primary-button" type="button" onClick={onCopy} disabled={count === 0}><Copy size={15} /> Copiar e salvar</button>
      </div>
    </footer>
  );
}

function PhaseBlock({ block, isStructureEditing, onUpdate }: { block: StepBuilderBlock; isStructureEditing: boolean; onUpdate: (patch: Partial<StepBuilderBlock>) => void }) {
  if (!isStructureEditing) {
    const description = String(block.config.content ?? "").trim();
    return <div className="phase-block-body phase-execution"><span className={`chip ${String(block.config.status ?? "pendente")}`}>{formatStepStatus(String(block.config.status ?? "pendente") as StepStatus)}</span>{description && <p>{description}</p>}</div>;
  }

  return (
    <div className="phase-block-body">
      <SelectField label="Status da fase" value={String(block.config.status ?? "pendente")} onChange={(status) => onUpdate({ config: { status } })} options={["pendente", "em_andamento", "concluido", "bloqueado"].map((status) => ({ value: status, label: formatStepStatus(status as StepStatus) }))} />
      <textarea value={String(block.config.content ?? "")} placeholder="Descreva a fase" onChange={(event) => onUpdate({ config: { content: event.target.value } })} />
      <label className="checkline"><input type="checkbox" checked={Boolean(block.config.requiresPreviousPhase)} onChange={(event) => onUpdate({ config: { requiresPreviousPhase: event.target.checked } })} /> Exigir fase anterior concluida</label>
    </div>
  );
}

function ChecklistBlock({ block, value, isStructureEditing, onSaveValue, onUpdate }: { block: StepBuilderBlock; value: any; isStructureEditing: boolean; onSaveValue: (value: unknown) => void; onUpdate: (patch: Partial<StepBuilderBlock>) => void }) {
  const [newItem, setNewItem] = useState("");
  const items = Array.isArray(block.config.items) ? block.config.items as Array<any> : [];
  const persistedChecked = value?.checked ?? Object.fromEntries(items.map((item) => [item.id, Boolean(item.done)]));
  const [optimisticChecked, setOptimisticChecked] = useState<Record<string, boolean>>(persistedChecked);
  const latestCheckedRef = useRef<Record<string, boolean>>(persistedChecked);
  const latestPersistedRef = useRef<Record<string, boolean>>(persistedChecked);
  const saveTimerRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingWritesRef = useRef(0);
  const latestChangeRef = useRef(0);
  const onSaveValueRef = useRef(onSaveValue);

  useEffect(() => {
    onSaveValueRef.current = onSaveValue;
  }, [onSaveValue]);

  useEffect(() => {
    latestPersistedRef.current = persistedChecked;
    if (saveTimerRef.current === null && pendingWritesRef.current === 0) {
      latestCheckedRef.current = persistedChecked;
      setOptimisticChecked(persistedChecked);
    }
  }, [JSON.stringify(persistedChecked)]);

  function queueSave(checked: Record<string, boolean>, changeId: number) {
    pendingWritesRef.current += 1;
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await Promise.resolve(onSaveValueRef.current({ ...(value && typeof value === "object" ? value : {}), checked }));
        } catch (error) {
          console.error("Não foi possível salvar o checklist.", error);
          if (changeId === latestChangeRef.current) {
            latestCheckedRef.current = latestPersistedRef.current;
            setOptimisticChecked(latestPersistedRef.current);
          }
        } finally {
          pendingWritesRef.current -= 1;
        }
      });
  }

  function scheduleSave(checked: Record<string, boolean>) {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    const changeId = ++latestChangeRef.current;
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      queueSave(checked, changeId);
    }, 240);
  }

  useEffect(() => () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      queueSave(latestCheckedRef.current, latestChangeRef.current);
    }
  }, []);

  const requiredItems = items.filter((item) => item.required !== false);
  const doneCount = requiredItems.filter((item) => optimisticChecked[item.id]).length;
  const progress = requiredItems.length ? Math.round((doneCount / requiredItems.length) * 100) : 0;
  const setChecked = (itemId: string, done: boolean) => {
    const next = { ...optimisticChecked, [itemId]: done };
    latestCheckedRef.current = next;
    setOptimisticChecked(next);
    scheduleSave(next);
  };
  const completeAll = () => {
    const next = Object.fromEntries(items.map((item) => [item.id, true]));
    latestCheckedRef.current = next;
    setOptimisticChecked(next);
    scheduleSave(next);
  };
  const addItem = () => {
    if (!newItem.trim()) return;
    onUpdate({ config: { items: [...items, { id: crypto.randomUUID(), label: newItem.trim(), order: items.length + 1, required: true, requiresFile: false, acceptedFileTypes: [] }] } });
    setNewItem("");
  };
  const removeItem = (itemId: string) => onUpdate({ config: { items: items.filter((item) => item.id !== itemId) } });
  return (
    <div className="checklist-block-body">
      <div className="checklist-progress" aria-label={`Checklist: ${doneCount} de ${requiredItems.length} itens concluidos`}>
        <span>{doneCount}/{requiredItems.length || 0} concluidos</span>
        <div className="progress-bar"><span style={{ width: `${progress}%` }} /></div>
        <strong>{progress}%</strong>
      </div>
      {!isStructureEditing && items.length > 0 && doneCount < requiredItems.length && <button className="secondary-button checklist-complete-all" type="button" onClick={completeAll}><CheckCircle2 size={14} /> Concluir tudo</button>}
      {items.map((item) => (
        <label key={item.id} className={`check-item-row ${optimisticChecked[item.id] ? "done" : ""}`}><input type="checkbox" checked={Boolean(optimisticChecked[item.id])} onChange={(event) => setChecked(item.id, event.target.checked)} /><span className="check-item-control">{optimisticChecked[item.id] && <Check size={14} />}</span><span>{item.label}</span>{isStructureEditing && <button className="icon-button danger" type="button" onClick={() => removeItem(item.id)}><Trash2 size={13} /></button>}</label>
      ))}
      {isStructureEditing && <div className="inline-form"><input value={newItem} onChange={(event) => setNewItem(event.target.value)} placeholder="Novo item" /><button className="secondary-button" type="button" onClick={addItem}><Plus size={15} /> Item</button></div>}
    </div>
  );
}

function MaterialsBlock({ block, value, isStructureEditing, currentUserName, onUpdate, onSaveValue }: { block: StepBuilderBlock; value: any; isStructureEditing: boolean; currentUserName: string | null; onUpdate: (patch: Partial<StepBuilderBlock>) => void; onSaveValue: (value: unknown) => void }) {
  if (isStructureEditing) return <MaterialsConfigEditor config={block.config} onChange={(patch) => onUpdate({ config: { ...block.config, ...patch } })} />;
  return <MaterialsRuntime config={block.config} value={value} currentUserName={currentUserName} onSaveValue={onSaveValue} />;
}

function ContextBlock({ block, value, isStructureEditing, onUpdate, onSaveValue, clientId, stepId, ownerType }: { block: StepBuilderBlock; value: any; isStructureEditing: boolean; onUpdate: (patch: Partial<StepBuilderBlock>) => void; onSaveValue: (value: unknown) => void | Promise<void>; clientId: string | null; stepId: string; ownerType: "project" | "client" }) {
  const contextColors = ["mint", "teal", "amber", "blue", "rose", "slate"];
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftColor, setDraftColor] = useState("mint");
  const [draftPinned, setDraftPinned] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [autoDraftTitle, setAutoDraftTitle] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [library, setLibrary] = useState<Array<{ id: string; title: string; content: string; category: string | null; version: number; created_at?: string }>>([]);
  const autoAssociatedRef = useRef(false);
  const [libraryResults, setLibraryResults] = useState<typeof library>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryOffset, setLibraryOffset] = useState(0);
  const [libraryHasMore, setLibraryHasMore] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  const [selectedLocalIds, setSelectedLocalIds] = useState<string[]>([]);
  const [contextError, setContextError] = useState("");
  const [saving, setSaving] = useState(false);
  type ContextCard = { id: string; title: string; content: string; color?: string; pinned?: boolean; sourceContextId?: string; sourceVersion?: number; createdAt?: string };
  const templateContexts = Array.isArray(block.config.contexts) ? block.config.contexts as ContextCard[] : [];
  const runtimeContexts = Array.isArray(value?.contexts) ? value.contexts as ContextCard[] : [];
  const legacyContent = String(block.config.content ?? "");
  const legacyContexts: ContextCard[] = legacyContent.trim()
    ? [{ id: "legacy-context", title: block.title || "Contexto", content: legacyContent, color: "mint", pinned: true }]
    : [];
  // Execution owns its cards. Only cards explicitly pinned in Edit structure are inherited from a template.
  const contexts = isStructureEditing
    ? (templateContexts.length > 0 ? templateContexts : legacyContexts)
    : [...(templateContexts.length > 0 ? templateContexts.filter((item) => item.pinned) : legacyContexts), ...runtimeContexts];
  const isWriting = editingId !== null;

  useEffect(() => {
    if (!clientId || (!showImport && !runtimeContexts.some((item) => item.sourceContextId))) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setContextError(""); setLibraryLoading(true);
      void fetch(`${cloudflareApiUrl}/api/clients/${encodeURIComponent(clientId)}/contexts?q=${encodeURIComponent(librarySearch)}&offset=${libraryOffset}`, { signal: controller.signal })
        .then(async (response) => { const body = await response.json() as { data?: { data?: typeof library } | typeof library; error?: string }; if (!response.ok || !body.data) throw new Error(body.error ?? "Falha ao carregar contextos."); return (body.data as { data?: typeof library }).data ?? body.data as typeof library; })
        .then((items) => { if (!controller.signal.aborted) { setLibrary((current) => { const byId = new Map(current.map((item) => [item.id, item])); items.forEach((item) => byId.set(item.id, item)); return [...byId.values()]; }); setLibraryResults((current) => libraryOffset ? [...current, ...items.filter((item) => !current.some((previous) => previous.id === item.id))] : items); setLibraryHasMore(items.length === 100); } })
        .catch((failure) => { if (!controller.signal.aborted) setContextError(failure instanceof Error ? failure.message : "Falha ao carregar contextos."); })
        .finally(() => { if (!controller.signal.aborted) setLibraryLoading(false); });
    }, librarySearch ? 180 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [clientId, showImport, librarySearch, libraryOffset, libraryRefreshKey, runtimeContexts.map((item) => `${item.sourceContextId}:${item.sourceVersion}`).join("|")]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") { setLibraryOffset(0); setLibraryRefreshKey((current) => current + 1); } };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  function resetForm() {
    setEditingId(null);
    setDraftTitle("");
    setDraftContent("");
    setDraftColor("mint");
    setDraftPinned(false);
    setAutoDraftTitle("");
  }

  function startNew() {
    setEditingId("new");
    setDraftTitle("");
    setDraftContent("");
    setDraftColor(contextColors[contexts.length % contextColors.length]);
    setDraftPinned(false);
    setAutoDraftTitle("");
  }

  function startEdit(item: ContextCard) {
    setEditingId(item.id);
    setDraftTitle(item.title);
    setDraftContent(item.content);
    setDraftColor(item.color || "mint");
    setDraftPinned(Boolean(item.pinned));
    setAutoDraftTitle("");
  }

  function updateDraftTitle(value: string) {
    setDraftTitle(value);
    setAutoDraftTitle("");
  }

  function updateDraftContent(value: string) {
    setDraftContent(value);
    const nextTitle = inferContextTitle(value);
    const canUseSuggestion = !draftTitle.trim() || (!!autoDraftTitle && draftTitle === autoDraftTitle);
    if (nextTitle && canUseSuggestion) {
      setDraftTitle(nextTitle);
      setAutoDraftTitle(nextTitle);
    }
  }

  function pasteContextIntoTitle(event: ClipboardEvent<HTMLInputElement>) {
    const pastedText = event.clipboardData.getData("text");
    if (!/\r?\n/.test(pastedText)) return;
    event.preventDefault();
    const nextTitle = inferContextTitle(pastedText);
    setDraftContent(pastedText);
    setDraftTitle(nextTitle);
    setAutoDraftTitle(nextTitle);
  }

  async function saveContext(updateClientSource = false) {
    if (!draftTitle.trim() && !draftContent.trim()) return;
    const editableContexts = isStructureEditing ? contexts : runtimeContexts;
    const normalizedContexts = editableContexts.map((item) => ({ ...item, id: item.id === "legacy-context" ? crypto.randomUUID() : item.id }));
    const original = runtimeContexts.find((item) => item.id === editingId);
    const nextItem: ContextCard = {
      ...original,
      id: editingId && editingId !== "new" && editingId !== "legacy-context" ? editingId : crypto.randomUUID(),
      title: draftTitle.trim() || "Contexto sem título",
      content: draftContent.trim(),
      color: draftColor,
      pinned: draftPinned,
      createdAt: original?.createdAt ?? new Date().toISOString(),
    };
    const next = editingId && editingId !== "new"
      ? normalizedContexts.map((item) => item.id === editingId || (editingId === "legacy-context" && item.content === legacyContent) ? nextItem : item)
      : [...normalizedContexts, nextItem];
    setSaving(true); setContextError("");
    try {
      if (updateClientSource && original?.sourceContextId && clientId) {
        const response = await fetch(`${cloudflareApiUrl}/api/clients/${encodeURIComponent(clientId)}/contexts/${encodeURIComponent(original.sourceContextId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: nextItem.title, content: nextItem.content, expectedVersion: original.sourceVersion }) });
        const body = await response.json() as { data?: { data?: { version: number } } | { version: number }; error?: string };
        if (!response.ok || !body.data) throw new Error(body.error ?? "Falha ao atualizar a biblioteca.");
        nextItem.sourceVersion = (body.data as { data?: { version: number } }).data?.version ?? (body.data as { version: number }).version;
      }
      const saved = next.map((item) => item.id === nextItem.id ? nextItem : item);
      if (isStructureEditing) onUpdate({ config: { contexts: saved, content: "" } });
      else await onSaveValue({ contexts: saved.map((item) => ({ ...item, pinned: false })) });
      resetForm();
    } catch (failure) { setContextError(failure instanceof Error ? failure.message : "Falha ao salvar contexto."); }
    finally { setSaving(false); }
  }

  async function importSelected() {
    const additions = library.filter((item) => selectedLibraryIds.includes(item.id)).map((item) => ({ id: crypto.randomUUID(), title: item.title, content: item.content, color: "mint", pinned: isStructureEditing, sourceContextId: item.id, sourceVersion: item.version, createdAt: item.created_at ?? new Date().toISOString() }));
    if (!additions.length) return;
    setSaving(true); setContextError("");
    try {
      if (isStructureEditing) onUpdate({ config: { contexts: [...contexts, ...additions], content: "" } });
      else await onSaveValue({ contexts: [...runtimeContexts, ...additions] });
      setSelectedLibraryIds([]); setShowImport(false);
    } catch (failure) { setContextError(failure instanceof Error ? failure.message : "Falha ao importar contextos."); }
    finally { setSaving(false); }
  }

  useEffect(() => {
    if (autoAssociatedRef.current || isStructureEditing || ownerType !== "project" || !clientId) return;
    const localIds = runtimeContexts.filter((item) => !item.sourceContextId && item.title.trim() && item.content.trim()).map((item) => item.id);
    if (!localIds.length) return;
    autoAssociatedRef.current = true;
    void associateContexts(localIds);
  }, [clientId, isStructureEditing, ownerType, runtimeContexts.map((item) => `${item.id}:${item.sourceContextId ?? ""}`).join("|")]);

  async function associateContexts(ids: string[]) {
    setSaving(true); setContextError("");
    try {
      const response = await fetch(`${cloudflareApiUrl}/api/journey-steps/project/${encodeURIComponent(stepId)}/contexts/associate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ blockId: block.id, contextIds: ids }) });
      const body = await response.json() as { data?: { data?: StepBuilderPayload } | StepBuilderPayload; error?: string };
      const result = body.data && "data" in body.data ? body.data.data : body.data as StepBuilderPayload | undefined;
      if (!response.ok || !result) throw new Error(body.error ?? "Falha ao vincular contextos ao cliente.");
      const next = result.values.find((item) => item.block_id === block.id)?.value;
      if (next) await onSaveValue(next);
    } catch (failure) { setContextError(failure instanceof Error ? failure.message : "Falha ao vincular contextos ao cliente."); }
    finally { setSaving(false); }
  }

  async function associateSelected() {
    if (!selectedLocalIds.length || ownerType !== "project") return;
    setSaving(true); setContextError("");
    try {
      const response = await fetch(`${cloudflareApiUrl}/api/journey-steps/project/${encodeURIComponent(stepId)}/contexts/associate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ blockId: block.id, contextIds: selectedLocalIds }) });
      const body = await response.json() as { data?: { data?: StepBuilderPayload } | StepBuilderPayload; error?: string };
      const result = body.data && "data" in body.data ? body.data.data : body.data as StepBuilderPayload | undefined;
      if (!response.ok || !result) throw new Error(body.error ?? "Falha ao associar contextos.");
      const next = result.values.find((item) => item.block_id === block.id)?.value;
      await onSaveValue(next);
      setSelectedLocalIds([]);
    } catch (failure) { setContextError(failure instanceof Error ? failure.message : "Falha ao associar contextos."); }
    finally { setSaving(false); }
  }

  function patchContext(itemId: string, patch: Partial<ContextCard>) {
    const normalizedContexts = contexts.map((item) => ({ ...item, id: item.id === "legacy-context" ? crypto.randomUUID() : item.id }));
    onUpdate({ config: { contexts: normalizedContexts.map((item) => item.id === itemId || (itemId === "legacy-context" && item.content === legacyContent) ? { ...item, ...patch } : item), content: "" } });
  }

  async function removeContext(itemId: string) {
    const removed = contexts.find((item) => item.id === itemId);
    if (!removed) return;
    if (!window.confirm(`Excluir o contexto "${removed.title}" deste ${isStructureEditing ? "template" : "projeto"}?`)) return;
    const next = contexts.filter((item) => item.id !== itemId);
    if (isStructureEditing) onUpdate({ config: { contexts: next, content: "" } });
    else await onSaveValue({ contexts: next.filter((item) => !item.pinned) });
    if (editingId === itemId) resetForm();
    if (!isStructureEditing && clientId && removed.sourceContextId && window.confirm(`Excluir "${removed.title}" também da biblioteca de contextos do cliente?\n\nOK: exclui do cliente (deixa de aparecer para novos projetos).\nCancelar: mantém no cliente.`)) {
      try {
        const response = await fetch(`${cloudflareApiUrl}/api/clients/${encodeURIComponent(clientId)}/contexts/${encodeURIComponent(removed.sourceContextId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "archived" }) });
        if (!response.ok) { const body = await response.json() as { error?: string }; throw new Error(body.error ?? "Falha ao excluir do cliente."); }
        setLibrary((current) => current.filter((item) => item.id !== removed.sourceContextId));
        setLibraryResults((current) => current.filter((item) => item.id !== removed.sourceContextId));
        window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message: "Contexto excluído também da biblioteca do cliente." } }));
      } catch (failure) { setContextError(failure instanceof Error ? failure.message : "Falha ao excluir do cliente."); }
    }
  }

  return (
    <div className="context-library compact-context-library">
      <div className="context-library-head">
        <span>{contexts.length ? `${contexts.length} contexto(s)` : "Nenhum contexto salvo neste bloco"}</span>
        {clientId && <button className="secondary-button" type="button" onClick={() => setShowImport((current) => !current)}><Layers3 size={15} /> Puxar contextos do cliente</button>}
        <button className="secondary-button" type="button" onClick={startNew}><Plus size={15} /> Adicionar contexto</button>
      </div>
      {contextError && <p className="form-error" role="alert">{contextError}</p>}
      {clientId && ownerType === "project" && !isStructureEditing && <p className="rj-context-hint">Contextos novos entram automaticamente na biblioteca do cliente.</p>}
      {showImport && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowImport(false)}><section className="rj-dialog rj-context-import" role="dialog" aria-modal="true" aria-label="Puxar contextos do cliente" onMouseDown={(event) => event.stopPropagation()}><header className="rj-dialog-head"><div><h2>Puxar contextos do cliente</h2><p>Selecione os contextos que entram neste {isStructureEditing ? "template" : "projeto"}.</p></div><button className="rj-icon-button" type="button" aria-label="Fechar" onClick={() => setShowImport(false)}><X size={18} /></button></header><div className="context-import-panel"><label className="search-field"><Search size={15} /><input value={librarySearch} onChange={(event) => { setLibrarySearch(event.target.value); setLibraryOffset(0); }} placeholder="Buscar na biblioteca do cliente" /></label><div className="context-import-list">{libraryLoading && <p role="status"><Loader2 className="spin" size={15} /> Buscando contextos...</p>}{libraryResults.map((item) => { const already = runtimeContexts.some((card) => card.sourceContextId === item.id); return <label key={item.id} className={already ? "is-disabled" : ""}><input type="checkbox" disabled={already} checked={selectedLibraryIds.includes(item.id)} onChange={(event) => setSelectedLibraryIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span><strong>{item.title}</strong>{already ? <small>Já está neste projeto</small> : item.content && <small>{item.content.slice(0, 140)}</small>}</span></label>; })}{!libraryLoading && !libraryResults.length && <p className="rj-muted">Nenhum contexto encontrado.</p>}{libraryHasMore && <button className="secondary-button" type="button" disabled={libraryLoading} onClick={() => setLibraryOffset((current) => current + 100)}>Carregar mais</button>}</div><div className="inline-actions"><button className="secondary-button" type="button" onClick={() => setShowImport(false)}>Cancelar</button><button className="primary-button" type="button" disabled={saving || selectedLibraryIds.length === 0} onClick={() => void importSelected()}>Importar selecionados ({selectedLibraryIds.length})</button></div></div></section></div>}

      {isWriting && (
        <div className="context-compose compact-context-compose">
          <input value={draftTitle} onChange={(event) => updateDraftTitle(event.target.value)} onPaste={pasteContextIntoTitle} placeholder="Título do contexto" />
          <textarea value={draftContent} onChange={(event) => updateDraftContent(event.target.value)} placeholder="Cole aqui o contexto" rows={5} />
          <div className="context-form-row">
            <div className="context-color-picker">
              {contextColors.map((color) => <button key={color} type="button" className={`context-color-dot ${color} ${draftColor === color ? "active" : ""}`} onClick={() => setDraftColor(color)} />)}
            </div>
            {isStructureEditing && <label className="checkline"><input type="checkbox" checked={draftPinned} onChange={(event) => setDraftPinned(event.target.checked)} /> Fixar no template</label>}
          </div>
          <div className="inline-actions">
            {!isStructureEditing && editingId !== "new" && clientId && runtimeContexts.some((item) => item.id === editingId && item.sourceContextId)
              ? <><button className="primary-button" type="button" disabled={saving} onClick={() => void saveContext(true)}><Save size={15} /> Salvar (projeto e cliente)</button><button className="secondary-button" type="button" disabled={saving} onClick={() => void saveContext()}>Salvar só neste projeto</button></>
              : <button className="primary-button" type="button" disabled={saving} onClick={() => void saveContext()}><Save size={15} /> Salvar contexto</button>}
            <button className="secondary-button" type="button" onClick={resetForm}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="context-card-grid compact-context-grid">
        {contexts.map((item) => (
          <article className={`context-mini-card compact-context-card ${item.color || "mint"} ${item.pinned ? "pinned" : ""}`} key={item.id} onClick={() => void copyToClipboard(item.content, "Contexto")} title="Clique para copiar o contexto">
            <strong>{item.title}</strong>
            {(() => { const created = item.createdAt ?? library.find((source) => source.id === item.sourceContextId)?.created_at; const hasUpdate = library.some((source) => source.id === item.sourceContextId && source.version > Number(item.sourceVersion ?? 0)); return (created || hasUpdate) ? <small className="context-card-meta">{created ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(created)) : ""}{hasUpdate ? `${created ? " · " : ""}atualização disponível` : ""}</small> : null; })()}
            {item.pinned && <span className="context-pin-label" aria-label="Conteúdo do template" title="Conteúdo do template">T</span>}
            {isStructureEditing && <div className="context-mini-actions" onClick={(event) => event.stopPropagation()}>
              <button className={`icon-button ${item.pinned ? "active" : ""}`} type="button" title="Salvar no template" onClick={() => patchContext(item.id, { pinned: !item.pinned })}><Save size={14} /></button>
              <button className="icon-button" type="button" title="Copiar contexto" onClick={(event) => { event.stopPropagation(); void copyToClipboard(item.content, "Contexto"); }}><Copy size={14} /></button>
              <button className="icon-button" type="button" title="Editar contexto" onClick={() => startEdit(item)}><Pencil size={14} /></button>
              <button className="icon-button danger" type="button" title="Excluir contexto" onClick={() => void removeContext(item.id)}><Trash2 size={14} /></button>
            </div>}
            {!isStructureEditing && !item.pinned && <div className="context-mini-actions" onClick={(event) => event.stopPropagation()}><button className="icon-button" type="button" title="Editar apenas aqui" onClick={() => startEdit(item)}><Pencil size={14} /></button>{library.find((source) => source.id === item.sourceContextId && source.version > Number(item.sourceVersion ?? 0)) && <button className="icon-button" type="button" title="Atualizar copia da biblioteca" onClick={() => { const source = library.find((candidate) => candidate.id === item.sourceContextId); if (source && window.confirm("Atualizar esta copia para a versão atual da biblioteca?")) void onSaveValue({ contexts: runtimeContexts.map((candidate) => candidate.id === item.id ? { ...candidate, title: source.title, content: source.content, sourceVersion: source.version } : candidate) }); }}><RefreshCw size={14} /></button>}<button className="icon-button" type="button" title="Copiar contexto" onClick={() => void copyToClipboard(item.content, "Contexto")}><Copy size={14} /></button><button className="icon-button danger" type="button" title="Excluir contexto" onClick={() => void removeContext(item.id)}><Trash2 size={14} /></button></div>}
          </article>
        ))}
      </div>
    </div>
  );
}

function blockTypeText(type: string) {
  return blockCatalog.find((item) => item.type === type)?.label ?? type;
}

function summaryAdditionIcon(label: string) {
  const normalized = normalizeSearchText(label);
  if (normalized.includes("tabela")) return ListChecks;
  if (normalized.includes("grafico") || normalized.includes("visual")) return Sparkles;
  if (normalized.includes("fluxograma") || normalized.includes("cronograma")) return Route;
  if (normalized.includes("legislacao") || normalized.includes("norma")) return Clipboard;
  if (normalized.includes("pendencia")) return CheckCircle2;
  return FileText;
}

function ProjectSummaryPanel({
  project,
  summaries,
  allSummaries,
  items,
  onImport,
  onUpdateSummary,
  onUpdateItem,
  onSetSelection,
  onAddItem,
  onMoveItem,
  onMoveItemToNumber,
  onDeleteItem,
  onConsolidate,
  onApply,
}: {
  project: Project;
  summaries: ProjectSummary[];
  allSummaries: ProjectSummary[];
  items: ProjectSummaryItem[];
  onImport: (project: Project, rawText: string) => void;
  onUpdateSummary: (summaryId: string, payload: Partial<ProjectSummary>) => void;
  onUpdateItem: (itemId: string, payload: Partial<ProjectSummaryItem>) => void;
  onSetSelection: (summaryId: string, itemId: string, isSelected: boolean) => void;
  onAddItem: (summaryId: string, parentId: string, title: string) => void;
  onMoveItem: (summaryId: string, itemId: string, parentId: string | null, targetIndex?: number) => void;
  onMoveItemToNumber: (summaryId: string, itemId: string, topicNumber: string) => void;
  onDeleteItem: (summaryId: string, itemId: string) => void;
  onConsolidate: (summaryId: string) => Promise<ProjectSummary | null>;
  onApply?: (summaryId: string) => Promise<boolean>;
}) {
  const [rawText, setRawText] = useState("");
  const [applying, setApplying] = useState(false);
  const [summaryId, setSummaryId] = useState("");
  const [summarySearch, setSummarySearch] = useState("");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [collapsedTopicIds, setCollapsedTopicIds] = useState<string[]>([]);
  const [promptConfig, setPromptConfig] = useState<SummaryPromptConfig>({});
  const [editingAdditionId, setEditingAdditionId] = useState<string | "new" | null>(null);
  const [additionLabel, setAdditionLabel] = useState("");
  const [additionContent, setAdditionContent] = useState("");
  const [addingChildOfId, setAddingChildOfId] = useState<string | null>(null);
  const [childTitle, setChildTitle] = useState("");
  const [editingTopicNumberId, setEditingTopicNumberId] = useState<string | null>(null);
  const [topicNumberDraft, setTopicNumberDraft] = useState("");
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

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
  const visibleSummaryItems = getVisibleSummaryItems(summaryItems, collapsedTopicIds, summarySearch);
  const selectionPercent = summaryItems.length ? Math.round((selectedItems.length / summaryItems.length) * 100) : 0;
  const collapsibleIds = summaryItems.filter((item) => summaryItems.some((child) => child.parent_id === item.id)).map((item) => item.id);
  const allCollapsed = collapsibleIds.length > 0 && collapsibleIds.every((id) => collapsedTopicIds.includes(id));

  useEffect(() => {
    setPromptConfig(resolveSummaryPromptConfig(activeSummary, allSummaries));
    setEditingAdditionId(null);
    setAdditionLabel("");
    setAdditionContent("");
    setAddingChildOfId(null);
    setChildTitle("");
    setEditingTopicNumberId(null);
    setTopicNumberDraft("");
  }, [activeSummary?.id, activeSummary?.prompt_config_json, allSummaries]);

  function toggleCollapsedTopic(itemId: string) {
    setCollapsedTopicIds((current) => (current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]));
  }

  async function handleConsolidateActiveSummary() {
    if (!activeSummary) return;
    const nextSummary = await onConsolidate(activeSummary.id);
    if (nextSummary?.id) {
      setSummaryId(nextSummary.id);
      setCollapsedTopicIds([]);
      setSummarySearch("");
    }
  }

  function updatePromptConfig(patch: Partial<SummaryPromptConfig>) {
    setPromptConfig((current) => ({ ...current, ...patch }));
  }

  function openAdditionEditor(addition?: SummaryPromptAddition) {
    setEditingAdditionId(addition?.id ?? "new");
    setAdditionLabel(addition?.label ?? "");
    setAdditionContent(addition?.content ?? "");
  }

  function savePromptAddition() {
    if (!editingAdditionId || !additionLabel.trim() || !additionContent.trim()) return;
    const nextAddition: SummaryPromptAddition = {
      id: editingAdditionId === "new" ? crypto.randomUUID() : editingAdditionId,
      label: additionLabel.trim(),
      content: additionContent.trim(),
      enabledByDefault: false,
    };
    updatePromptConfig({
      additions: editingAdditionId === "new"
        ? [...(promptConfig.additions ?? []), nextAddition]
        : (promptConfig.additions ?? []).map((item) => item.id === nextAddition.id ? { ...item, ...nextAddition } : item),
    });
    setEditingAdditionId(null);
    setAdditionLabel("");
    setAdditionContent("");
  }

  function savePromptConfig() {
    if (!activeSummary) return;
    onUpdateSummary(activeSummary.id, { prompt_config_json: JSON.stringify(promptConfig) });
  }

  return (
    <section className="work-block summary-panel compact-summary-panel">
      <div className="block-heading summary-heading rj-summary-head">
        <div className="rj-summary-title">
          <h2>Sumário inteligente</h2>
          {activeSummary ? (
            <div className="rj-summary-version">
              <select aria-label="Versão do sumário" value={activeSummary.id} onChange={(event) => setSummaryId(event.target.value)}>
                {sortedSummaries.map((summary) => <option key={summary.id} value={summary.id}>Versão {summary.version_number} · {summaryVersionLabel(summary)}</option>)}
              </select>
              <span className={`rj-version-pill is-${summaryVersionTone(activeSummary)}`}>{summaryVersionLabel(activeSummary)}</span>
              <span className="rj-muted">{selectedItems.length}/{summaryItems.length} tópicos selecionados</span>
            </div>
          ) : <span className="pending-summary">Importe ou cole o sumário do projeto</span>}
        </div>
        {activeSummary && (
          <div className="summary-heading-actions">
            <button className="secondary-button" disabled={!activeSummary.consolidated_text} onClick={() => void copyToClipboard(activeSummary.consolidated_text ?? "", "Sumário consolidado")}>
              <Copy size={16} />
              Copiar consolidado
            </button>
            <button className="secondary-button" title="Valida a estrutura e cria uma nova versão consolidada, sem trocar a versão em uso" onClick={() => void handleConsolidateActiveSummary()} disabled={selectedItems.length === 0}>
              <CheckCircle2 size={16} />
              Consolidar sumário
            </button>
            {onApply && <button className="primary-button" title={activeSummary.status === "active" ? "Esta é a versão em uso na jornada" : !activeSummary.consolidated_text ? "Consolide esta versão antes de aplicar" : "Usar esta versão na jornada (as outras versões guardam o progresso)"} disabled={applying || activeSummary.status === "active" || !activeSummary.consolidated_text} onClick={async () => { setApplying(true); try { await onApply(activeSummary.id); } finally { setApplying(false); } }}>
              {applying ? <Loader2 className="spin" size={16} /> : <PlayCircle size={16} />}
              {activeSummary.status === "active" ? "Em uso" : "Aplicar sumário"}
            </button>}
          </div>
        )}
      </div>
      <div className="rj-summary-tools">

      <details className="summary-import-drawer glass-panel">
        <summary>
          <span>Importar ou analisar sumário bruto</span>
          <small>Abra apenas quando precisar colar uma nova estrutura numerada.</small>
        </summary>
        <div className="summary-import-grid">
          <label className="field">
            <span>Colar sumário bruto</span>
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

      {activeSummary && (
        <details className="summary-prompt-settings">
          <summary>
            <span>Sumário Mestre Ramos</span>
            <small>Configuracao unica e completa aplicada a todas as versoes · versao {activeSummary.version_number}</small>
          </summary>
          <div className="summary-prompt-settings-body">
            <label className="field summary-base-prompt-field">
              <span>Prompt base canonico</span>
              <textarea
                rows={4}
                value={promptConfig.basePromptSnapshot ?? ""}
                readOnly
              />
            </label>
            <label className="field summary-base-prompt-field">
              <span>Gatilho canonico</span>
              <textarea
                rows={3}
                value={promptConfig.triggerPromptSnapshot ?? ""}
                readOnly
              />
            </label>
            <p className="summary-prompt-variable-help">O prompt aplica o projeto, empresa, contexto cadastrado, sumário consolidado e topicos selecionados. Versoes e prompts antigos permanecem preservados como histórico.</p>

            <div className="summary-additions-editor">
              <div className="summary-additions-heading"><strong>Instrucoes adicionais</strong><span>Entram na composicao quando selecionadas na execução.</span></div>
              <div className="summary-addition-card-grid">
                {(promptConfig.additions ?? []).map((addition) => (
                  <article className="summary-addition-row" key={addition.id}>
                    <strong title={addition.content}>{addition.label}</strong>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </details>
      )}
      </div>

      {activeSummary ? (
        <div className="summary-workspace summary-workspace-compact summary-editor-technical">
          <div className="summary-review-card summary-tree-card">
            <div className="summary-toolbar compact-tree-toolbar">
              <div className="summary-meta">
                <span>{formatSummaryParseStatus(activeSummary.parse_status)}</span>
              </div>
            </div>

            <div className="summary-progress-grid summary-structure-progress">
              <div>
                <span>Seleção do sumário</span>
                <strong>{selectedItems.length}/{summaryItems.length}</strong>
                <div className="summary-progress-track"><i style={{ width: `${selectionPercent}%` }} /></div>
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
            </div>

            <div className="summary-item-list compact-tree-list summary-editor-tree-list">
              {visibleSummaryItems.map((item) => {
                const childCount = summaryItems.filter((child) => child.parent_id === item.id).length;

                return (
                  <Fragment key={item.id}>
                    <article
                      className={`summary-item tree-row level-${Math.min(item.level, 4)} ${item.is_selected ? "selected" : "excluded"}`}
                      style={{ "--tree-level": Math.max(0, item.level - 1) } as CSSProperties}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggedItemId && draggedItemId !== item.id) onMoveItem(activeSummary.id, draggedItemId, item.id);
                        setDraggedItemId(null);
                      }}
                    >
                      <span className="summary-drag-handle" draggable title="Arraste para transformar em subtópico" onDragStart={() => setDraggedItemId(item.id)} onDragEnd={() => setDraggedItemId(null)}><GripVertical size={15} /></span>
                      <button className="summary-expand-button" disabled={childCount === 0} onClick={() => toggleCollapsedTopic(item.id)} title={collapsedTopicIds.includes(item.id) ? "Expandir topico" : "Recolher topico"}>
                        {childCount > 0 ? (collapsedTopicIds.includes(item.id) ? "+" : "-") : ""}
                      </button>
                      <button className={`checkbox ${item.is_selected ? "checked" : ""}`} onClick={() => onSetSelection(activeSummary.id, item.id, !item.is_selected)} title="Entrar no sumário consolidado">
                        {item.is_selected && <Check size={14} />}
                      </button>
                      <div className="summary-topic-hierarchy">
                        {editingTopicNumberId === item.id ? (
                          <input
                            autoFocus
                            className="summary-topic-number-input"
                            value={topicNumberDraft}
                            onChange={(event) => setTopicNumberDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                event.currentTarget.dataset.committed = "true";
                                onMoveItemToNumber(activeSummary.id, item.id, topicNumberDraft);
                                setEditingTopicNumberId(null);
                              }
                              if (event.key === "Escape") setEditingTopicNumberId(null);
                            }}
                            onBlur={(event) => {
                              if (event.currentTarget.dataset.committed !== "true" && topicNumberDraft.trim() && topicNumberDraft.trim() !== item.topic_number) onMoveItemToNumber(activeSummary.id, item.id, topicNumberDraft);
                              setEditingTopicNumberId(null);
                            }}
                            aria-label={`Nova numeracao para ${item.title}`}
                          />
                        ) : (
                          <button className="summary-topic-button" type="button" title="Editar numeracao e reposicionar topico" onClick={() => { setEditingTopicNumberId(item.id); setTopicNumberDraft(item.topic_number); }}><strong>{item.topic_number}</strong></button>
                        )}
                      </div>
                      <div className="summary-item-main">
                        <InlineText defaultValue={item.title} className="summary-title-input" onSave={(value) => onUpdateItem(item.id, { title: value })} />
                        <div className="summary-item-controls compact-topic-meta">
                          <span className={`summary-status-dot ${item.status}`} title={formatStatus(item.status)} />
                          {item.parse_warning && <span className="summary-warning">{item.parse_warning}</span>}
                        </div>
                      </div>
                      <button className="icon-button subtle summary-add-child-button" title="Adicionar subtópico" onClick={() => { setAddingChildOfId(item.id); setChildTitle(""); }}><Plus size={15} /></button>
                      <button className="icon-button subtle" title="Excluir topico" onClick={() => onDeleteItem(activeSummary.id, item.id)}><Trash2 size={15} /></button>
                    </article>
                    {addingChildOfId === item.id && (
                      <form className="summary-inline-child-form" style={{ "--tree-level": Math.max(0, item.level) } as CSSProperties} onSubmit={(event) => { event.preventDefault(); if (!childTitle.trim()) return; onAddItem(activeSummary.id, item.id, childTitle); setAddingChildOfId(null); setChildTitle(""); }}>
                        <input autoFocus value={childTitle} onChange={(event) => setChildTitle(event.target.value)} placeholder={`Adicionar subtópico em ${item.topic_number}`} />
                        <button className="primary-button" type="submit" disabled={!childTitle.trim()}>Adicionar</button>
                        <button className="secondary-button" type="button" onClick={() => { setAddingChildOfId(null); setChildTitle(""); }}>Cancelar</button>
                      </form>
                    )}
                  </Fragment>
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

        </div>
      ) : (
        <div className="empty-state compact">
          <Clipboard size={30} />
          <strong>Nenhum sumário importado</strong>
          <span>Cole o sumário do projeto para revisar topicos e gerar prompts por item.</span>
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

function getGeneratedPromptItemIds(prompt: Pick<GeneratedPrompt, "summary_item_id" | "selected_blocks_json">) {
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
    <main className="user-entry" data-central-live-local>
      <section className="user-entry-panel">
        <div className="brand">
          <span className="brand-mark">
            <img className="brand-mark-image" src="/brand/ramos-jornadas-icon-v3.png" alt="" />
          </span>
          <span>Ramos Jornadas</span>
        </div>

        <div className="user-entry-heading">
          <h1>Escolha o usuário</h1>
          <p>Entrada simples para identificar quem esta usando o painel nesta fase.</p>
        </div>

        <div className="user-list">
          {users.map((user) => (
            <button className="user-card" key={user.id} onClick={() => onSelect(user.id)}>
              <span>{getInitials(user.name)}</span>
              <strong>{user.name}</strong>
            </button>
          ))}
          {users.length === 0 && <span className="muted">Nenhum usuário ativo encontrado.</span>}
        </div>

        <form
          className="user-create"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate(name);
            setName("");
          }}
        >
          <Field label="Novo usuário" value={name} onChange={setName} />
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
                <span>{prompt.placeholder_note || "Edite este prompt na etapa ou em Configurações antes de usar."}</span>
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
        <TextArea label="Conteúdo" value={content} onChange={setContent} rows={5} />
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
          <span className="pending-summary">{phases.length ? `${doneCount}/${phases.length} fase(s) concluídas` : "Organize a etapa em fases menores"}</span>
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

              <TextArea label="Descrição / criterio" value={phase.description} rows={2} onChange={() => undefined} onBlur={(value) => onUpdate(phase.id, { description: value })} />
              <TextArea label="Condicao de conclusão" value={phase.completion_condition} rows={2} onChange={() => undefined} onBlur={(value) => onUpdate(phase.id, { completion_condition: value })} />

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
        <Field label="Título do contexto" value={title} onChange={setTitle} />
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
              <TextArea label="Conteúdo" value={context.content} rows={5} onChange={() => undefined} onBlur={(value) => onUpdate(context.id, { content: value })} />
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
      <Field label="Adicionar próxima etapa" value={name} onChange={setName} />
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
  setActiveConfig,
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
      <PageHeader title={`Configurações · ${module.label}`} subtitle={module.description}>
        <label className="rj-config-mobile-select">
          <span>Seção</span>
          <select value={activeConfig} onChange={(event) => setActiveConfig(event.target.value as ConfigModuleKey)}>
            {configModules.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
      </PageHeader>
      <div className="rj-settings-layout">
        <nav className="rj-settings-nav" aria-label="Seções de configuração">{configModules.map((item) => { const Icon = item.icon; return <button key={item.key} type="button" className={item.key === activeConfig ? "is-active" : ""} onClick={() => setActiveConfig(item.key)}><Icon size={16} /><span>{item.label}</span></button>; })}</nav>
        <div className="rj-settings-content"><ConfigCrud module={module} tables={tables} query={query} setQuery={setQuery} onRefresh={onRefresh} onNotice={onNotice} onTables={onTables} /></div>
      </div>
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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [toolFilter, setToolFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "recent">("name");
  const isPrompts = module.key === "prompts";
  const allRecords = tables[module.key] as Array<Record<string, unknown>>;
  const records = allRecords
    .filter((record) => normalizeSearchText(normalizeSearch(record.name, record.title, record.description, record.short_description, isPrompts ? record.content : "")).includes(normalizeSearchText(query)))
    .filter((record) => statusFilter === "todos" || String(record.status ?? "ativo") === statusFilter)
    .filter((record) => !categoryFilter || record.category_id === categoryFilter)
    .filter((record) => !toolFilter || record.ai_tool_id === toolFilter)
    .filter((record) => !typeFilter || record.project_type_id === typeFilter)
    .sort((a, b) => sortBy === "recent"
      ? String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? ""))
      : getRecordTitle(a).localeCompare(getRecordTitle(b), "pt-BR"));
  const statusCounts = allRecords.reduce<Record<string, number>>((counts, record) => { const key = String(record.status ?? "ativo"); counts[key] = (counts[key] ?? 0) + 1; return counts; }, {});
  const hasField = (field: string) => allRecords.some((record) => field in record) || field in createBlankConfig(module.key);
  const Icon = module.icon;
  const nameOf = (list: Array<{ id: string; name?: string; title?: string }>, id: unknown) => { const item = list.find((entry) => entry.id === id); return item ? String(item.name ?? item.title ?? "") : ""; };

  useEffect(() => {
    setEditingId(null);
    setFormState(createBlankConfig(module.key));
    setIsFormOpen(false);
    setStatusFilter("todos");
    setCategoryFilter("");
    setToolFilter("");
    setTypeFilter("");
  }, [module.key]);

  useEffect(() => {
    if (!isFormOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setIsFormOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFormOpen]);

  async function saveConfig() {
    if (!supabase) {
      return;
    }

    setSaving(true);
    const payload = normalizePayload(formState);
    const request = editingId ? supabase.from(module.key).update(payload).eq("id", editingId) : supabase.from(module.key).insert(payload);
    const { data, error } = await request;
    setSaving(false);

    if (error) {
      onNotice(`Erro ao salvar ${module.label}: ${error.message}`);
      return;
    }

    const saved = Array.isArray(data) ? data[0] as { id: string } | undefined : undefined;
    if (!saved) {
      onNotice(`Erro ao salvar ${module.label}: resposta vazia do servidor.`);
      return;
    }
    onTables((current) => ({
      ...current,
      [module.key]: editingId
        ? (current[module.key] as Array<{ id: string }>).map((record) => record.id === saved.id ? saved : record)
        : [...current[module.key], saved],
    }));
    onNotice(editingId ? "Registro atualizado." : "Registro criado.");
    setEditingId(null);
    setFormState(createBlankConfig(module.key));
    setIsFormOpen(false);
  }

  async function removeConfig(record: Record<string, unknown>) {
    if (!supabase) {
      return;
    }
    if (!window.confirm(`Excluir "${getRecordTitle(record)}"? Esta ação não pode ser desfeita. Para tirar de uso sem apagar, mude a situação para Arquivado.`)) return;

    const id = String(record.id);
    const { error } = await supabase.from(module.key).delete().eq("id", id);

    if (error) {
      onNotice(`Erro ao excluir: ${error.message}`);
      return;
    }

    onTables((current) => ({ ...current, [module.key]: (current[module.key] as Array<{ id: string }>).filter((item) => item.id !== id) }));
    if (editingId === id) setIsFormOpen(false);
    onNotice("Registro excluído.");
  }

  function editConfig(record: Record<string, unknown>) {
    setEditingId(String(record.id));
    setFormState(record);
    setIsFormOpen(true);
  }

  function duplicateConfig(record: Record<string, unknown>) {
    const { id: _id, created_at: _created, updated_at: _updated, ...rest } = record;
    setEditingId(null);
    setFormState({ ...rest, title: rest.title ? `${String(rest.title)} (cópia)` : rest.title, name: rest.name ? `${String(rest.name)} (cópia)` : rest.name, status: isPrompts ? "rascunho" : rest.status });
    setIsFormOpen(true);
  }

  function openNewRecord() {
    setEditingId(null);
    setFormState(createBlankConfig(module.key));
    setIsFormOpen(true);
  }

  const statusLabels: Record<string, string> = { ativo: "Ativos", rascunho: "Rascunhos", inativo: "Inativos", arquivado: "Arquivados" };

  return (
    <section className={`rj-config ${isPrompts ? "is-prompts" : ""}`}>
      <div className="rj-config-toolbar">
        <label className="rj-search-box rj-config-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isPrompts ? "Buscar por título, descrição ou texto do prompt" : `Buscar em ${module.label.toLowerCase()}`} /></label>
        {isPrompts && <label className="rj-select-inline"><span>Categoria</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">Todas</option>{tables.prompt_categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {(isPrompts || module.key === "prompt_blocks") && <label className="rj-select-inline"><span>Ferramenta</span><select value={toolFilter} onChange={(event) => setToolFilter(event.target.value)}><option value="">Todas</option>{tables.ai_tools.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {hasField("project_type_id") && module.key !== "project_types" && <label className="rj-select-inline"><span>Tipo</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">Todos</option>{tables.project_types.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <label className="rj-select-inline"><span>Ordem</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as "name" | "recent")}><option value="name">Nome</option><option value="recent">Mais recentes</option></select></label>
        <button className="primary-button" type="button" onClick={openNewRecord}><Plus size={16} /> {isPrompts ? "Novo prompt" : "Novo cadastro"}</button>
      </div>
      <div className="rj-chip-row">
        <button type="button" className={statusFilter === "todos" ? "is-active" : ""} onClick={() => setStatusFilter("todos")}>Todos <span>{allRecords.length}</span></button>
        {Object.entries(statusCounts).sort(([a], [b]) => (["ativo", "rascunho", "inativo", "arquivado"].indexOf(a) - ["ativo", "rascunho", "inativo", "arquivado"].indexOf(b))).map(([status, count]) => <button key={status} type="button" className={statusFilter === status ? "is-active" : ""} onClick={() => setStatusFilter(status)}>{statusLabels[status] ?? status} <span>{count}</span></button>)}
      </div>

      <div className="rj-config-list" role="list">
        {records.map((record) => {
          const category = isPrompts ? nameOf(tables.prompt_categories, record.category_id) : "";
          const tool = record.ai_tool_id ? nameOf(tables.ai_tools, record.ai_tool_id) : "";
          const type = record.project_type_id ? nameOf(tables.project_types, record.project_type_id) : "";
          const description = String(record.short_description ?? record.description ?? "").trim();
          return (
            <article className={`rj-config-row ${editingId === String(record.id) && isFormOpen ? "is-active" : ""}`} role="listitem" key={String(record.id)} onClick={() => editConfig(record)}>
              {module.key === "ai_tools" ? <ToolLogo record={record} /> : <span className="rj-config-icon"><Icon size={16} /></span>}
              <div className="rj-config-main">
                <strong>{getRecordTitle(record)}</strong>
                {description ? <small>{description}</small> : <small className="rj-muted">{getRecordSubtitle(record, tables)}</small>}
              </div>
              <div className="rj-config-tags">
                {category && <span className="rj-tag">{category}</span>}
                {tool && <span className="rj-tag is-tool">{tool}</span>}
                {type && <span className="rj-tag is-type">{type}</span>}
                {isPrompts && record.version ? <span className="rj-tag is-soft">v{String(record.version)}</span> : null}
              </div>
              <StatusPill status={String(record.status ?? "ativo")} />
              <div className="row-actions" onClick={(event) => event.stopPropagation()}>
                {isPrompts && <button type="button" title="Copiar texto do prompt" onClick={() => void copyToClipboard(String(record.content ?? ""), "Prompt")}><Copy size={15} /></button>}
                {(isPrompts || module.key === "prompt_blocks") && <button type="button" title="Duplicar" onClick={() => duplicateConfig(record)}><Layers3 size={15} /></button>}
                <button type="button" title="Editar" onClick={() => editConfig(record)}><Pencil size={15} /></button>
                <button type="button" title="Excluir" onClick={() => void removeConfig(record)}><Trash2 size={15} /></button>
              </div>
            </article>
          );
        })}
        {records.length === 0 && (
          <div className="empty-state">
            <Icon size={34} />
            <strong>{allRecords.length ? "Nada encontrado com esses filtros" : "Nenhum registro"}</strong>
            <span>{allRecords.length ? "Ajuste a busca ou os filtros." : `Clique em "${isPrompts ? "Novo prompt" : "Novo cadastro"}" para criar o primeiro.`}</span>
          </div>
        )}
      </div>

      {isFormOpen && (
        <div className="rj-drawer-backdrop" role="presentation" onMouseDown={() => setIsFormOpen(false)}>
          <aside className={`rj-drawer ${isPrompts ? "is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={editingId ? "Editar cadastro" : "Novo cadastro"} onMouseDown={(event) => event.stopPropagation()}>
            <header className="rj-drawer-head">
              <div><span className="eyebrow">{module.label}</span><h2>{editingId ? getRecordTitle(formState) || "Editar" : isPrompts ? "Novo prompt" : "Novo cadastro"}</h2></div>
              <button className="rj-icon-button" type="button" aria-label="Fechar" onClick={() => setIsFormOpen(false)}><X size={18} /></button>
            </header>
            <div className="rj-drawer-body"><ConfigForm moduleKey={module.key} value={formState} tables={tables} onChange={(key, value) => setFormState((current) => ({ ...current, [key]: value }))} /></div>
            <footer className="rj-drawer-foot">
              {editingId && <button className="secondary-button danger" type="button" onClick={() => void removeConfig(formState)}><Trash2 size={15} /> Excluir</button>}
              <span className="rj-spacer" />
              <button className="secondary-button" type="button" onClick={() => setIsFormOpen(false)}>Cancelar</button>
              <button className="primary-button" type="button" disabled={saving} onClick={() => void saveConfig()}>{saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Salvar</button>
            </footer>
          </aside>
        </div>
      )}
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
        <TextArea label="Descrição" value={value.description} onChange={(next) => onChange("description", next)} />
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
        <TextArea label="Descrição" value={value.description} onChange={(next) => onChange("description", next)} />
        <ConfigStatusField value={value.status} onChange={(next) => onChange("status", next)} />
      </div>
    );
  }

  if (moduleKey === "prompts") {
    return (
      <div className="form-grid prompt-config-form">
        <div className="prompt-config-section main">
          <span className="section-kicker">Identificação</span>
          <Field label="Título do prompt" value={value.title} onChange={(next) => onChange("title", next)} />
          <Field label="Descrição curta" value={value.short_description} onChange={(next) => onChange("short_description", next)} />
        </div>

        <div className="prompt-config-section prompt-editor-section">
          <span className="section-kicker">Conteúdo reutilizavel</span>
          <TextArea label="Conteúdo do prompt" value={value.content} onChange={(next) => onChange("content", next)} rows={10} />
          <PromptVariablesEditor value={String(value.variables ?? "")} onChange={(next) => onChange("variables", next)} />
        </div>

        <div className="prompt-config-section side">
          <span className="section-kicker">Organização</span>
          <SelectField label="Categoria" value={value.category_id} onChange={(next) => onChange("category_id", next)} options={tables.prompt_categories.map(toOption)} />
          <SelectField label="Ferramenta" value={value.ai_tool_id} onChange={(next) => onChange("ai_tool_id", next)} options={tables.ai_tools.map(toOption)} />
          <SelectField label="Tipo de projeto" value={value.project_type_id} onChange={(next) => onChange("project_type_id", next)} options={tables.project_types.map(toOption)} />
          <Field label="Versão" value={value.version} onChange={(next) => onChange("version", next)} />
          <ConfigStatusField value={value.status} onChange={(next) => onChange("status", next)} includeDraft />
        </div>
      </div>
    );
  }

  if (moduleKey === "journey_templates") {
    return (
      <div className="form-grid">
        <Field label="Nome do template" value={value.name} onChange={(next) => onChange("name", next)} />
        <TextArea label="Descrição" value={value.description} onChange={(next) => onChange("description", next)} />
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
        <Field label="Título" value={value.title} onChange={(next) => onChange("title", next)} />
        <Field label="Categoria" value={value.category} onChange={(next) => onChange("category", next)} />
        <TextArea label="Descrição" value={value.description} onChange={(next) => onChange("description", next)} />
        <TextArea label="Conteúdo do complemento" value={value.content} onChange={(next) => onChange("content", next)} rows={7} />
        <SelectField label="Ferramenta" value={value.ai_tool_id} onChange={(next) => onChange("ai_tool_id", next)} options={tables.ai_tools.map(toOption)} />
        <SelectField label="Tipo de projeto" value={value.project_type_id} onChange={(next) => onChange("project_type_id", next)} options={tables.project_types.map(toOption)} />
        <SelectField label="Etapa relacionada" value={value.journey_step_id} onChange={(next) => onChange("journey_step_id", next)} options={tables.journey_steps.map(toOption)} />
        <ConfigStatusField value={value.status} onChange={(next) => onChange("status", next)} />
      </div>
    );
  }

  return (
    <div className="form-grid">
      <Field label="Título" value={value.title} onChange={(next) => onChange("title", next)} />
      <Field label="Categoria" value={value.category} onChange={(next) => onChange("category", next)} />
      <TextArea label="Descrição" value={value.description} onChange={(next) => onChange("description", next)} />
      <TextArea label="Conteúdo" value={value.content} onChange={(next) => onChange("content", next)} rows={7} />
      <SelectField label="Tipo de projeto" value={value.project_type_id} onChange={(next) => onChange("project_type_id", next)} options={tables.project_types.map(toOption)} />
      <SelectField label="Etapa relacionada" value={value.journey_step_id} onChange={(next) => onChange("journey_step_id", next)} options={tables.journey_steps.map(toOption)} />
      <ConfigStatusField value={value.status} onChange={(next) => onChange("status", next)} />
    </div>
  );
}

function PromptVariablesEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const suggestions = journeyPromptVariableSuggestions;
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
        <span>Variáveis usadas no prompt</span>
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="{{empresa}}, {{projeto}}, {{contexto}}" />
      </label>
      <div className="variable-chip-row">
        {suggestions.map((item) => <button className="variable-chip" type="button" key={item} onClick={() => addVariable(item)}>{item}</button>)}
      </div>
      {variables.length > 0 && (
        <div className="variable-selected-row" aria-label="Variáveis cadastradas">
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

function EmptyClientJourney({ client, onBack, onCreateStep }: { client: Client | null; onBack: () => void; onCreateStep: (clientId: string) => void }) {
  return (
    <div className="empty-state tall">
      {client ? <ClientLogo client={client} large /> : <Users size={42} />}
      <strong>{client?.name ?? "Nenhum cliente aberto"}</strong>
      {client?.client_kind && <span className="client-kind-badge">{client.client_kind}</span>}
      <span>{client ? "Este cliente ainda não tem etapas de jornada." : "Crie ou selecione um cliente para acompanhar a jornada."}</span>
      {client && <button className="secondary-button" onClick={() => onCreateStep(client.id)}><Plus size={16} /> Criar primeira etapa</button>}
      <button className="primary-button" onClick={onBack}>
        Voltar para clientes
      </button>
    </div>
  );
}

function ClientLogo({ client, large = false, small = false }: { client: Pick<Client, "name" | "logo_url">; large?: boolean; small?: boolean }) {
  const initials = getInitials(client.name);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [client.logo_url]);

  return (
    <span className={`client-logo ${large ? "large" : ""} ${small ? "small" : ""}`} aria-hidden="true">
      {client.logo_url && !imageFailed ? <img src={client.logo_url} alt="" onError={() => setImageFailed(true)} /> : <strong>{initials || "CL"}</strong>}
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

function ClientSearchSelect({ label, value, clients, onChange, allowCreate = false }: {
  label: string;
  value: string;
  clients: Client[];
  onChange: (value: string) => void;
  allowCreate?: boolean;
}) {
  const listId = useId();
  const selected = clients.find((client) => client.id === value);
  const selectedLabel = selected?.name ?? (value === "__new" ? "Criar novo cliente" : "");
  const [search, setSearch] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => { if (!open) setSearch(selectedLabel); }, [selectedLabel, open]);
  const normalized = normalizeSearchText(search);
  const filtered = clients
    .filter((client) => normalizeSearchText(normalizeSearch(client.name, client.company, client.client_kind)).includes(normalized))
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name))
    .slice(0, 15);
  const optionCount = filtered.length + Number(allowCreate);

  function select(nextValue: string) {
    onChange(nextValue);
    setSearch(clients.find((client) => client.id === nextValue)?.name ?? "Criar novo cliente");
    setOpen(false);
  }

  return <div className="field client-search-select" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setSearch(selectedLabel); }
  }}>
    <span>{label}</span>
    <div className="client-search-input"><Search size={16} aria-hidden="true" /><input type="text" role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open} aria-controls={listId} placeholder="Digite para buscar cliente" value={search} onFocus={(event) => { setOpen(true); event.currentTarget.select(); }} onChange={(event) => { setSearch(event.target.value); setActiveIndex(0); setOpen(true); }} onKeyDown={(event) => {
      if (event.key === "Escape") { setOpen(false); setSearch(selectedLabel); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActiveIndex((current) => Math.max(0, Math.min(optionCount - 1, current + (event.key === "ArrowDown" ? 1 : -1)))); }
      if (event.key === "Enter" && open && optionCount) { event.preventDefault(); select(activeIndex < filtered.length ? filtered[activeIndex].id : "__new"); }
    }} /></div>
    {open && <div id={listId} className="client-search-results" role="listbox" aria-label={`Resultados para ${label}`}>
      {filtered.map((client, index) => <button type="button" role="option" aria-selected={index === activeIndex} className="client-search-result" key={client.id} onClick={() => select(client.id)}><ClientLogo client={client} small /><span>{client.name}</span>{client.client_kind && <span className="client-kind-badge">{client.client_kind}</span>}{!client.is_active && <small>Inativo</small>}</button>)}
      {!filtered.length && <span className="client-search-empty">Nenhum cliente encontrado</span>}
      {allowCreate && <button type="button" role="option" aria-selected={activeIndex === filtered.length} className="client-search-result create" onClick={() => select("__new")}><Plus size={16} /> Criar novo cliente</button>}
    </div>}
  </div>;
}

function ModalitySearchSelect({ value, projectTypeId, modalities, newName, onChange }: {
  value: string;
  projectTypeId: string;
  modalities: ProjectModality[];
  newName: string;
  onChange: (value: string, newName?: string) => void;
}) {
  const listId = useId();
  const selected = modalities.find((item) => item.id === value);
  const selectedLabel = value === "__new" ? newName : selected?.name ?? "";
  const [search, setSearch] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) setSearch(selectedLabel); }, [open, selectedLabel]);
  const normalized = normalizeSearchText(search);
  const filtered = modalities
    .filter((item) => item.project_type_id === projectTypeId && item.status === "ativo")
    .filter((item) => normalizeSearchText(item.name).includes(normalized))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 20);
  const exact = modalities.some((item) => item.project_type_id === projectTypeId && normalizeSearchText(item.name) === normalized);
  const canCreate = Boolean(projectTypeId && search.trim() && !exact);

  function select(nextValue: string, nextName = "") {
    onChange(nextValue, nextName);
    setSearch(nextValue === "__new" ? nextName : modalities.find((item) => item.id === nextValue)?.name ?? "");
    setOpen(false);
  }

  return <div className="field client-search-select" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setSearch(selectedLabel); }
  }}>
    <span>Modalidade</span>
    <div className="client-search-input"><Search size={16} aria-hidden="true" /><input
      type="text"
      role="combobox"
      aria-label="Modalidade"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={listId}
      disabled={!projectTypeId}
      placeholder={projectTypeId ? "Digite para buscar ou criar" : "Escolha primeiro o tipo"}
      value={search}
      onFocus={(event) => { setOpen(true); event.currentTarget.select(); }}
      onChange={(event) => { setSearch(event.target.value); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); setSearch(selectedLabel); }
        if (event.key === "Enter" && open) {
          event.preventDefault();
          if (filtered[0]) select(filtered[0].id);
          else if (canCreate) select("__new", search.trim());
        }
      }}
    /></div>
    {open && projectTypeId && <div id={listId} className="client-search-results" role="listbox" aria-label="Modalidades disponiveis">
      {filtered.map((item) => <button type="button" role="option" aria-selected={item.id === value} className="client-search-result" key={item.id} onClick={() => select(item.id)}><Layers3 size={16} /><span>{item.name}</span></button>)}
      {!filtered.length && !canCreate && <span className="client-search-empty">Nenhuma modalidade encontrada</span>}
      {canCreate && <button type="button" role="option" aria-selected={value === "__new"} className="client-search-result create" onClick={() => select("__new", search.trim())}><Plus size={16} /> Criar modalidade “{search.trim()}”</button>}
    </div>}
  </div>;
}

function SelectField({
  label,
  value,
  options,
  emptyLabel = "Não vinculado",
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
  return String(record.name ?? record.title ?? "Sem título");
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

  return "Cadastro de apoio da operação";
}

function findName(records: Array<{ id: string; name: string }>, id: string | null) {
  if (!id) {
    return "";
  }

  return records.find((record) => record.id === id)?.name ?? "";
}

function resolveLegacyClientId(company: string | null, clients: Client[]) {
  const normalizedCompany = normalizeSearchText(company ?? "");
  if (!normalizedCompany) {
    return "";
  }

  return clients.find((client) => normalizeSearchText(client.name) === normalizedCompany || normalizeSearchText(client.company ?? "") === normalizedCompany)?.id ?? "";
}

type ResponsibleOwner = {
  responsible: string | null;
  responsible_user_id?: string | null;
};

function resolveResponsibleUserId(owner: ResponsibleOwner, users: AppUser[]) {
  if (owner.responsible_user_id && users.some((user) => user.id === owner.responsible_user_id)) {
    return owner.responsible_user_id;
  }

  const legacyName = owner.responsible?.trim();
  if (!legacyName) {
    return "";
  }

  return users.find((user) => normalizeSearchText(user.name) === normalizeSearchText(legacyName))?.id ?? "";
}

function getResponsibleName(owner: ResponsibleOwner, users: AppUser[]) {
  const linkedUser = owner.responsible_user_id ? users.find((user) => user.id === owner.responsible_user_id) : null;
  return linkedUser?.name ?? owner.responsible ?? "";
}

function toOption(record: { id: string; name?: string; title?: string }) {
  return { value: record.id, label: record.name ?? record.title ?? "Sem título" };
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
    not_analyzed: "Não analisado",
    analyzed: "Analisado",
    needs_review: "Precisa revisar",
    reviewed: "Revisado",
    planejado: "Planejado",
    em_implantacao: "Em implantacao",
    em_andamento: "Em andamento",
    regularizacao_pendente: "Regularizacao pendente",
    concluido: "Concluído",
    desenvolvido: "Desenvolvido",
    em_revisao: "Em revisao",
    bloqueado: "Bloqueado",
  };

  return labels[status] ?? status;
}

function formatStepStatus(status: StepStatus) {
  return formatStatus(status);
}

function statusTone(status: string): StatusTone {
  if (status === "concluido" || status === "ativo" || status === "active") return "complete";
  if (status === "em_andamento" || status === "em_implantacao" || status === "desenvolvido" || status === "em_revisao") return "active";
  if (status === "bloqueado") return "danger";
  return "pending";
}

function formatPromptStatus(status: ProjectStepPrompt["prompt_status"], content: string) {
  if (status === "nao_aplicavel") {
    return "Não aplicavel";
  }

  if (status === "pendente" || !content.trim()) {
    return "Falta preencher";
  }

  return "Pronto";
}

function inferContextTitle(content: string) {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
  return firstLine.replace(/^#{1,6}\s+/, "").slice(0, 120).trim();
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

function normalizeProjectSummaryStructure(items: ProjectSummaryItem[], movedItemId: string, nextParentId: string | null, targetIndex?: number) {
  const movedItem = items.find((item) => item.id === movedItemId);
  if (!movedItem) return items;

  const childrenByParent = new Map<string | null, ProjectSummaryItem[]>();
  const updatedParents = new Map(items.map((item) => [item.id, item.id === movedItemId ? nextParentId : item.parent_id]));

  items
    .filter((item) => item.id !== movedItemId)
    .forEach((item) => {
      const parentId = updatedParents.get(item.id) ?? null;
      childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), item]);
    });

  const targetChildren = [...(childrenByParent.get(nextParentId) ?? [])].sort((left, right) => left.sort_order - right.sort_order);
  const insertionIndex = Math.max(0, Math.min(targetIndex ?? targetChildren.length, targetChildren.length));
  targetChildren.splice(insertionIndex, 0, movedItem);
  childrenByParent.set(nextParentId, targetChildren);

  const orderedChildren = (parentId: string | null) => [...(childrenByParent.get(parentId) ?? [])];

  const normalized: ProjectSummaryItem[] = [];
  const walk = (parentId: string | null, prefix: string, level: number) => {
    orderedChildren(parentId).forEach((item, index) => {
      const topicNumber = prefix ? `${prefix}.${index + 1}` : String(index + 1);
      const resolvedParentId = updatedParents.get(item.id) ?? null;
      normalized.push({
        ...item,
        parent_id: resolvedParentId,
        topic_number: topicNumber,
        level,
        sort_order: normalized.length + 1,
        original_text: `${topicNumber} ${item.title}`,
      });
      walk(item.id, topicNumber, level + 1);
    });
  };

  walk(null, "", 1);
  return normalized;
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

function parseSummaryPromptConfig(raw: string | null | undefined): SummaryPromptConfig {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as SummaryPromptConfig;
    return {
      basePromptId: typeof parsed.basePromptId === "string" ? parsed.basePromptId : null,
      basePromptSnapshot: typeof parsed.basePromptSnapshot === "string" ? parsed.basePromptSnapshot : "",
      triggerPromptSnapshot: typeof parsed.triggerPromptSnapshot === "string" ? parsed.triggerPromptSnapshot : "",
      additions: Array.isArray(parsed.additions)
        ? parsed.additions
          .filter((addition): addition is SummaryPromptAddition => Boolean(addition && typeof addition.id === "string" && typeof addition.label === "string" && typeof addition.content === "string"))
          .map((addition) => ({ ...addition, enabledByDefault: Boolean(addition.enabledByDefault) }))
        : [],
    };
  } catch {
    return {};
  }
}

function cloneSummaryPromptConfig(config: SummaryPromptConfig): SummaryPromptConfig {
  return {
    basePromptId: config.basePromptId ?? null,
    basePromptSnapshot: config.basePromptSnapshot ?? "",
    triggerPromptSnapshot: config.triggerPromptSnapshot ?? "",
    additions: (config.additions ?? []).map((addition) => ({ ...addition })),
  };
}

function hasSummaryPromptConfig(config: SummaryPromptConfig) {
  return Boolean(
    config.basePromptSnapshot?.trim()
    || config.triggerPromptSnapshot?.trim()
    || config.additions?.length,
  );
}

function summaryPromptConfigScore(config: SummaryPromptConfig) {
  return (config.basePromptSnapshot?.trim() ? 50 : 0)
    + (config.triggerPromptSnapshot?.trim() ? 25 : 0)
    + (config.additions?.length ?? 0);
}

function mergeSummaryPromptConfig(base: SummaryPromptConfig, override: SummaryPromptConfig): SummaryPromptConfig {
  const useOwnBase = Boolean(override.basePromptSnapshot?.trim());
  const useOwnTrigger = Boolean(override.triggerPromptSnapshot?.trim());
  const useOwnAdditions = Boolean(override.additions?.length);
  return {
    basePromptId: useOwnBase ? override.basePromptId ?? null : base.basePromptId ?? null,
    basePromptSnapshot: useOwnBase ? override.basePromptSnapshot : base.basePromptSnapshot,
    triggerPromptSnapshot: useOwnTrigger ? override.triggerPromptSnapshot : base.triggerPromptSnapshot,
    additions: (useOwnAdditions ? override.additions ?? [] : base.additions ?? []).map((addition) => ({ ...addition })),
  };
}

function resolveSummaryPromptConfig(summary: ProjectSummary | null | undefined, allSummaries: ProjectSummary[]) {
  // Historic versions retain their prompt_config_json for audit and for every
  // generated prompt snapshot already saved. New executions must always begin
  // with the same complete instruction set, rather than inheriting a thin
  // project-local configuration from another summary.
  void summary;
  void allSummaries;
  return resolveSummaryMasterPromptConfig();
}

function composeGeneratedPrompt({
  project,
  step,
  summary,
  item,
  items,
  basePrompt,
  blocks,
  projectContext,
  promptOptions,
}: {
  project: Project;
  step: ProjectStep;
  summary: ProjectSummary | null;
  item: ProjectSummaryItem | null;
  items?: ProjectSummaryItem[];
  basePrompt: Pick<Prompt, "id" | "content" | "ai_tool_id"> | null;
  blocks: PromptBlock[];
  projectContext?: string | null;
  promptOptions?: string[];
}) {
  const header = [
    "# Prompt de desenvolvimento do projeto",
    `Projeto: ${project.name}`,
    project.company ? `Empresa: ${project.company}` : "",
    `Etapa atual: ${step.name}`,
    summary ? `Sumário: versão ${summary.version_number} (${formatStatus(summary.status)})` : "",
  ].filter(Boolean);
  const scopedItems = items?.length ? [...items].sort(byOrder) : item ? [item] : [];
  const selectedTopicsText = scopedItems.length
    ? scopedItems.map((summaryItem) => `${summaryItem.topic_number} ${summaryItem.title}${summaryItem.notes ? `\nNotas internas: ${summaryItem.notes}` : ""}`).join("\n")
    : "Use o sumário consolidado do projeto como referencia geral.";
  const rawBasePrompt = basePrompt?.content?.trim() ?? "";
  if (!rawBasePrompt) return "";
  const usesSummaryVariable = rawBasePrompt.includes("{{sumario_consolidado}}");
  const usesTopicsVariable = rawBasePrompt.includes("{{topicos_selecionados}}");
  const resolvedBasePrompt = interpolateJourneyPrompt(rawBasePrompt, {
    projectName: project.name,
    company: project.company,
    projectType: null,
    stepName: step.name,
    responsible: project.responsible,
    context: projectContext ?? project.notes,
    summary: summary?.consolidated_text?.trim() ?? null,
  }).split("{{topicos_selecionados}}").join(selectedTopicsText);
  const summaryContext = !usesSummaryVariable && summary?.consolidated_text?.trim()
    ? ["## Sumário consolidado", summary.consolidated_text.trim()]
    : [];
  const topic = !usesTopicsVariable ? ["## Topicos que devem ser desenvolvidos", selectedTopicsText] : [];
  const base = ["## Prompt base", resolvedBasePrompt];
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
    "Entregue o conteúdo já estruturado para uso em documento técnico, evitando comentarios sobre o processo e apontando pendencias quando faltarem dados.",
  ];

  return [...header, "", ...base, "", ...summaryContext, "", ...topic, "", ...optionLines, "", ...complements, "", ...instruction]
    .filter((part) => String(part).trim().length > 0)
    .join("\n\n")
    .trim();
}

function formatSummaryParseStatus(status: ProjectSummary["parse_status"]) {
  const labels: Record<ProjectSummary["parse_status"], string> = {
    not_analyzed: "Não analisado",
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

type StepMenuItem = { label: string; hint?: string; icon: typeof Plus; onSelect: () => void };

function StepMoreMenu({ groups }: { groups: StepMenuItem[][] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return (
    <div className="rj-more" ref={ref}>
      <button className="secondary-button rj-more-trigger" type="button" aria-haspopup="menu" aria-expanded={open} title="Mais ações" onClick={() => setOpen((value) => !value)}><MoreHorizontal size={18} /></button>
      {open && (
        <div className="rj-more-menu" role="menu">
          {groups.filter((group) => group.length).map((group, index) => (
            <div className="rj-more-group" key={index}>
              {group.map((item) => {
                const Icon = item.icon;
                return <button key={item.label} type="button" role="menuitem" onClick={() => { setOpen(false); item.onSelect(); }}><Icon size={16} /><span><strong>{item.label}</strong>{item.hint && <small>{item.hint}</small>}</span></button>;
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function summaryVersionLabel(summary: Pick<ProjectSummary, "status" | "consolidated_text">) {
  if (summary.status === "active") return "Em uso";
  if (summary.status === "archived") return "Arquivada";
  return summary.consolidated_text ? "Consolidada" : "Rascunho";
}

function summaryVersionTone(summary: Pick<ProjectSummary, "status" | "consolidated_text">) {
  if (summary.status === "active") return "active";
  if (summary.status === "archived") return "archived";
  return summary.consolidated_text ? "ready" : "draft";
}
