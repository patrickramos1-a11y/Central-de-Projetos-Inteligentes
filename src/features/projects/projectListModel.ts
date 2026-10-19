import {
  normalizeManagementText,
  type ManagementProjectRow,
  type ManagementStatus,
} from "../management/managementModel";

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
};

export type ProjectGroupBy = "client" | "type" | "none";
export type ProjectListStatusFilter = "todos" | "em_andamento" | "concluido";

export type ProjectListFilters = {
  search: string;
  status: ProjectListStatusFilter;
  responsible: string;
  type: string;
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

function isSummaryStep(step: ProjectListStep) {
  return normalizeManagementText([step.name, step.description, step.objective].filter(Boolean).join(" ")).includes("SUMARIO");
}

export function buildProjectListRows(rows: ManagementProjectRow[], steps: ProjectListStep[], summaryProjectIds: string[]): ProjectListRow[] {
  const stepsByProject = new Map<string, ProjectListStep[]>();
  const projectsWithSummary = new Set(summaryProjectIds);

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
    const totalSteps = applicable.length;
    const progress = totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0;
    const displayStatus = row.status === "bloqueado" || row.status === "arquivado" || row.status === "concluido"
      ? row.status
      : progress === 100 && totalSteps > 0
        ? "concluido"
        : progress > 0 ? "em_andamento" : row.status;

    return { ...row, completedSteps, totalSteps, progress, displayStatus };
  }).sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
}

export function filterProjectListRows(rows: ProjectListRow[], filters: ProjectListFilters) {
  const search = normalizeManagementText(filters.search);

  return rows.filter((row) => {
    if (filters.status === "concluido" && row.displayStatus !== "concluido") return false;
    if (filters.status === "em_andamento" && (row.displayStatus === "concluido" || row.displayStatus === "arquivado")) return false;
    if (filters.responsible !== "todos" && row.responsibleName !== filters.responsible) return false;
    if (filters.type !== "todos" && row.projectTypeName !== filters.type) return false;
    if (!search) return true;

    return normalizeManagementText([
      row.name,
      row.clientName,
      row.legacyCompany,
      row.projectTypeName,
      row.responsibleName,
    ].join(" ")).includes(search);
  });
}

export function groupProjectListRows(rows: ProjectListRow[], groupBy: ProjectGroupBy): ProjectListGroup[] {
  if (groupBy === "none") return [{ key: "all", label: "", rows }];

  const groups = new Map<string, ProjectListGroup>();
  for (const row of rows) {
    const label = groupBy === "client" ? row.clientName : row.projectTypeName;
    const identifier = groupBy === "client" ? row.clientId : row.projectTypeId;
    const key = `${groupBy}:${identifier || normalizeManagementText(label)}`;
    const group = groups.get(key) ?? { key, label, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  return [...groups.values()];
}
