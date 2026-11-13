import {
  normalizeManagementText,
  type ManagementProjectRow,
  type ManagementStatus,
} from "../management/managementModel";
import type { WorkspaceOverview } from "../workspace/workspaceModel";

export type ProjectListStep = {
  project_id: string;
  name: string;
  description?: string | null;
  objective?: string | null;
  status: string;
  is_not_applicable?: boolean | null;
};

export type ProjectListRow = ManagementProjectRow & {
  displayStatus: ManagementStatus;
  workspaceGap: Exclude<ProjectWorkspaceGap, "todos">;
};

export type ProjectGroupBy = "client" | "template" | "status" | "none";
export type ProjectListStatusFilter = "todos" | "em_andamento" | "concluido";
export type ProjectSortColumn = "name" | "client" | "template" | "responsible" | "progress" | "age" | "status";
export type ProjectSortDirection = "asc" | "desc";
export type ProjectProgressBand = "todos" | "0" | "1-49" | "50-99" | "100";
export type ProjectAgeBand = "todos" | "0-7" | "8-30" | "31+" | "unknown";
export type ProjectWorkspaceGap = "todos" | "organized" | "directory" | "conversation" | "both" | "unknown";

export type ProjectListFilters = {
  search: string;
  status: ProjectListStatusFilter;
  responsible: string;
  template: string;
  project?: string;
  client?: string;
  progressBand?: ProjectProgressBand;
  ageBand?: ProjectAgeBand;
  workspaceGap?: ProjectWorkspaceGap;
};

export type ProjectListGroup = {
  key: string;
  label: string;
  rows: ProjectListRow[];
};

export type ProjectAge = {
  label: string;
  detail: string;
  title: string;
  available: boolean;
};

const workspaceGapLabels: Record<Exclude<ProjectWorkspaceGap, "todos">, string> = {
  both: "Diretorio e conversa pendentes",
  directory: "Diretorio pendente",
  conversation: "Conversa pendente",
  unknown: "Local nao verificado",
  organized: "Local organizado",
};

const workspaceGapOrder: Record<Exclude<ProjectWorkspaceGap, "todos">, number> = {
  both: 0,
  directory: 1,
  conversation: 2,
  unknown: 3,
  organized: 4,
};

const projectStatusOrder: Record<ManagementStatus, number> = {
  bloqueado: 0,
  planejado: 1,
  em_andamento: 2,
  concluido: 3,
  arquivado: 4,
};

function projectStatusGroup(row: ProjectListRow) {
  const baseLabel = row.regularizationPending
    ? "Regularizacao pendente"
    : row.displayStatus === "em_andamento" ? "Em andamento"
    : row.displayStatus === "planejado" ? "Planejado"
    : row.displayStatus === "bloqueado" ? "Bloqueado"
    : row.displayStatus === "concluido" ? "Concluido"
    : "Arquivado";
  const showWorkspaceState = row.displayStatus !== "concluido" && row.displayStatus !== "arquivado";
  const label = showWorkspaceState ? `${baseLabel} · ${workspaceGapLabels[row.workspaceGap]}` : baseLabel;
  const regularizationOrder = row.regularizationPending ? 1 : 0;
  const order = projectStatusOrder[row.displayStatus] * 100 + regularizationOrder * 10 + (showWorkspaceState ? workspaceGapOrder[row.workspaceGap] : 0);
  return { key: `status:${String(order).padStart(3, "0")}:${normalizeManagementText(label)}`, label, order };
}

export function projectPrimaryAction(
  row: Pick<ProjectListRow, "historicalStatus" | "displayStatus" | "status" | "progress">,
  workspace?: Pick<WorkspaceOverview, "status">,
): "workspace" | "reopen" | "complete" | "disabled" {
  if (workspace?.status !== "organizado") return "workspace";
  if (row.historicalStatus === "concluido" && row.progress < 100) return "reopen";
  if (row.displayStatus === "concluido" || row.status === "arquivado") return "disabled";
  return "complete";
}

export function projectWorkspaceGap(workspace?: Pick<WorkspaceOverview, "directoryCount" | "conversationCount" | "conversationNotApplicable">): Exclude<ProjectWorkspaceGap, "todos"> {
  if (!workspace) return "unknown";
  const missingDirectory = workspace.directoryCount === 0;
  const missingConversation = workspace.conversationCount === 0 && !workspace.conversationNotApplicable;
  if (missingDirectory && missingConversation) return "both";
  if (missingDirectory) return "directory";
  if (missingConversation) return "conversation";
  return "organized";
}

export function getProjectAge(row: Pick<ProjectListRow, "createdAt" | "displayStatus">, now = new Date()): ProjectAge {
  const created = new Date(row.createdAt);
  if (!row.createdAt || !Number.isFinite(created.getTime())) {
    return { label: "-", detail: "sem inicio", title: "A data de criacao deste projeto nao foi registrada.", available: false };
  }

  const started = created.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const shortStart = created.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  if (row.displayStatus === "concluido") {
    return { label: "-", detail: `inicio ${shortStart}`, title: `Criado em ${started}; data de conclusao nao registrada.`, available: false };
  }
  if (row.displayStatus === "arquivado") {
    return { label: "-", detail: `inicio ${shortStart}`, title: `Criado em ${started}; tempo ate o arquivamento nao registrado.`, available: false };
  }

  const days = Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86_400_000));
  return {
    label: days === 0 ? "Hoje" : `${days} ${days === 1 ? "dia" : "dias"}`,
    detail: `desde ${shortStart}`,
    title: `Criado em ${started}; ${days} ${days === 1 ? "dia decorrido" : "dias decorridos"}.`,
    available: true,
  };
}

function elapsedProjectDays(row: Pick<ProjectListRow, "createdAt" | "displayStatus">, now: Date): number | null {
  if (row.displayStatus === "concluido" || row.displayStatus === "arquivado") return null;
  const started = new Date(row.createdAt).getTime();
  return row.createdAt && Number.isFinite(started) ? Math.max(0, Math.floor((now.getTime() - started) / 86_400_000)) : null;
}

export function sortProjectListRows(rows: ProjectListRow[], column: ProjectSortColumn, direction: ProjectSortDirection, now = new Date()): ProjectListRow[] {
  const textFor = (row: ProjectListRow) => column === "name" ? row.name : column === "client" ? row.clientName : column === "template" ? row.projectTypeName : row.responsibleName;
  const numberFor = (row: ProjectListRow) => column === "progress" ? row.progress : elapsedProjectDays(row, now);
  return [...rows].sort((a, b) => {
    if (column === "progress" || column === "age") {
      const left = numberFor(a);
      const right = numberFor(b);
      if (left == null || right == null) return left == null && right == null ? a.name.localeCompare(b.name, "pt-BR") : left == null ? 1 : -1;
      if (left !== right) return (left - right) * (direction === "asc" ? 1 : -1);
    } else if (column === "status") {
      const left = projectStatusGroup(a);
      const right = projectStatusGroup(b);
      const difference = left.order - right.order || left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base" });
      if (difference) return difference * (direction === "asc" ? 1 : -1);
    } else {
      const difference = textFor(a).localeCompare(textFor(b), "pt-BR", { sensitivity: "base", numeric: true });
      if (difference) return difference * (direction === "asc" ? 1 : -1);
    }
    return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base", numeric: true }) || a.id.localeCompare(b.id);
  });
}

function isSummaryStep(step: ProjectListStep) {
  return normalizeManagementText([step.name, step.description, step.objective].filter(Boolean).join(" ")).includes("SUMARIO");
}

export function buildProjectListRows(rows: ManagementProjectRow[], steps: ProjectListStep[], summaryProjectIds: string[], workspaces?: WorkspaceOverview[]): ProjectListRow[] {
  const stepsByProject = new Map<string, ProjectListStep[]>();
  const projectsWithSummary = new Set(summaryProjectIds);
  const workspaceByProject = workspaces ? new Map(workspaces.map((workspace) => [workspace.projectId, workspace])) : null;

  for (const step of steps) {
    const projectSteps = stepsByProject.get(step.project_id) ?? [];
    projectSteps.push(step);
    stepsByProject.set(step.project_id, projectSteps);
  }

  return rows.map((row) => {
    const applicable = (stepsByProject.get(row.id) ?? []).filter((step) => !step.is_not_applicable);
    const completedSteps = applicable.filter((step) =>
      step.status === "concluido" && (projectsWithSummary.has(row.id) || !isSummaryStep(step))
    ).length;
    const organized = workspaceByProject?.get(row.id)?.status === "organizado";
    const totalWithWorkspace = applicable.length + (workspaceByProject ? 1 : 0);
    const completedWithWorkspace = completedSteps + (workspaceByProject && organized ? 1 : 0);
    const progress = totalWithWorkspace ? Math.round((completedWithWorkspace / totalWithWorkspace) * 100) : 0;
    const displayStatus = row.status === "bloqueado" || row.status === "arquivado" || row.status === "concluido"
      ? row.status
      : row.regularizationPending ? "em_andamento"
      : progress === 100 && applicable.length > 0
        ? "concluido"
        : progress > 0 ? "em_andamento" : row.status;

    return { ...row, completedSteps: completedWithWorkspace, totalSteps: totalWithWorkspace, progress, displayStatus, workspaceGap: projectWorkspaceGap(workspaceByProject?.get(row.id)) };
  }).sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
}

export function filterProjectListRows(rows: ProjectListRow[], filters: ProjectListFilters, now = new Date()) {
  const search = normalizeManagementText(filters.search);
  const project = normalizeManagementText(filters.project ?? "");

  return rows.filter((row) => {
    if (filters.status === "concluido" && row.displayStatus !== "concluido") return false;
    if (filters.status === "em_andamento" && (row.displayStatus === "concluido" || row.displayStatus === "arquivado")) return false;
    if (filters.responsible !== "todos" && row.responsibleName !== filters.responsible) return false;
    if (filters.template !== "todos" && row.projectTypeName !== filters.template) return false;
    if (filters.workspaceGap && filters.workspaceGap !== "todos" && row.workspaceGap !== filters.workspaceGap) return false;
    if (project && !normalizeManagementText(row.name).includes(project)) return false;
    if (filters.client && filters.client !== "todos" && row.clientName !== filters.client) return false;
    if (filters.progressBand && filters.progressBand !== "todos") {
      const progress = row.progress;
      if (filters.progressBand === "0" && progress !== 0) return false;
      if (filters.progressBand === "1-49" && (progress < 1 || progress > 49)) return false;
      if (filters.progressBand === "50-99" && (progress < 50 || progress > 99)) return false;
      if (filters.progressBand === "100" && progress !== 100) return false;
    }
    if (filters.ageBand && filters.ageBand !== "todos") {
      const days = elapsedProjectDays(row, now);
      if (filters.ageBand === "unknown" ? days !== null : days === null) return false;
      if (days !== null && filters.ageBand === "0-7" && days > 7) return false;
      if (days !== null && filters.ageBand === "8-30" && (days < 8 || days > 30)) return false;
      if (days !== null && filters.ageBand === "31+" && days < 31) return false;
    }
    if (!search) return true;

    return normalizeManagementText([
      row.name,
      row.clientName,
      row.legacyCompany,
      row.projectTypeName,
      row.projectTypeName,
      row.templateName,
      row.responsibleName,
    ].join(" ")).includes(search);
  });
}

export function groupProjectListRows(rows: ProjectListRow[], groupBy: ProjectGroupBy): ProjectListGroup[] {
  if (groupBy === "none") return [{ key: "all", label: "", rows }];

  const groups = new Map<string, ProjectListGroup>();
  for (const row of rows) {
    const statusGroup = groupBy === "status" ? projectStatusGroup(row) : null;
    const label = statusGroup?.label ?? (groupBy === "client" ? row.clientName : row.projectTypeName);
    const identifier = groupBy === "client" ? row.clientId : groupBy === "template" ? row.templateId : null;
    const key = statusGroup?.key ?? `${groupBy}:${identifier || normalizeManagementText(label)}`;
    const group = groups.get(key) ?? { key, label, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const result = [...groups.values()];
  return groupBy === "status" ? result.sort((left, right) => left.key.localeCompare(right.key)) : result;
}
