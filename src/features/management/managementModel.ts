export type ManagementStatus = "planejado" | "em_andamento" | "concluido" | "bloqueado" | "arquivado";

export type ManagementProject = {
  id: string;
  name: string;
  company?: string | null;
  client_id?: string | null;
  responsible?: string | null;
  responsible_user_id?: string | null;
  project_type_id?: string | null;
  status: ManagementStatus;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ManagementClient = {
  id: string;
  name: string;
  company?: string | null;
  responsible?: string | null;
  responsible_user_id?: string | null;
  status?: string | null;
};

export type ManagementProjectType = {
  id: string;
  name: string;
};

export type ManagementUser = {
  id: string;
  name: string;
};

export type ManagementStep = {
  id: string;
  project_id: string;
  status: string;
  is_not_applicable?: boolean | null;
};

export type ManagementProjectRow = {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string;
  legacyCompany: string;
  responsibleUserId: string;
  responsibleName: string;
  projectTypeId: string;
  projectTypeName: string;
  status: ManagementStatus;
  progress: number;
  totalSteps: number;
  completedSteps: number;
  updatedAt: string;
};

export type ManagementClientRow = {
  id: string;
  name: string;
  company: string;
  responsibleName: string;
  projectCount: number;
  activeProjectCount: number;
  completedProjectCount: number;
  averageProgress: number;
};

export type ManagementFilters = {
  search?: string;
  clientId?: string;
  responsibleUserId?: string;
  projectTypeId?: string;
  status?: ManagementStatus | "todos";
};

const PROJECT_TYPE_ALIASES: Array<{ idHint: string; label: string; match: RegExp }> = [
  { idHint: "rca-pca", label: "RCA/PCA", match: /\bRCA\b[\s/+-]*(?:E\s+)?\bPCA\b|\bPCA\b[\s/+-]*(?:E\s+)?\bRCA\b/ },
  { idHint: "pca", label: "PCA", match: /\bPCA\b|PLANO\s+DE\s+CONTROLE\s+AMBIENTAL/ },
  { idHint: "ria", label: "RIA", match: /\bRIA\b|RELATORIO\s+DE\s+IMPACTO\s+AMBIENTAL/ },
  { idHint: "rce", label: "RCE", match: /\bRCE\b/ },
  { idHint: "peaa", label: "PEAA", match: /\bPEAA\b/ },
  { idHint: "pgrs", label: "PGRS", match: /\bPGRS\b|RESIDUOS\s+SOLIDOS/ },
  { idHint: "memorial", label: "Memorial", match: /\bMEMORIAL\b/ },
  { idHint: "manual-boas-praticas", label: "Manual de Boas Praticas", match: /\bMANUAL\b|BOAS\s+PRATICAS/ },
  { idHint: "pop", label: "POP", match: /\bPOP\b|PROCEDIMENTO\s+OPERACIONAL\s+PADRAO/ },
  { idHint: "politica-ambiental", label: "Politica ambiental", match: /POLITICA\s+AMBIENTAL/ },
  { idHint: "relatorio-tecnico", label: "Relatorio tecnico", match: /RELATORIO\s+TECNICO/ },
  { idHint: "projeto-ete", label: "Projeto de ETE", match: /\bETE\b|ESTACAO\s+DE\s+TRATAMENTO/ },
  { idHint: "procedimento-operacional", label: "Procedimento operacional", match: /PROCEDIMENTO\s+OPERACIONAL|DOSAGEM/ },
];

export function normalizeManagementText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchKey(value: unknown) {
  return normalizeManagementText(value).toLowerCase();
}

export function resolveProjectClient(project: Pick<ManagementProject, "client_id" | "company">, clients: ManagementClient[]) {
  if (project.client_id) {
    const linked = clients.find((client) => client.id === project.client_id);
    if (linked) return linked;
  }

  const legacyCompany = normalizeSearchKey(project.company);
  if (!legacyCompany) return null;

  return clients.find((client) => normalizeSearchKey(client.name) === legacyCompany || normalizeSearchKey(client.company) === legacyCompany) ?? null;
}

export function getProjectClientName(project: Pick<ManagementProject, "client_id" | "company">, clients: ManagementClient[]) {
  const client = resolveProjectClient(project, clients);
  return client?.name ?? project.company?.trim() ?? "Sem cliente vinculado";
}

export function inferProjectTypeName(projectName: string) {
  const normalized = normalizeManagementText(projectName);
  return PROJECT_TYPE_ALIASES.find((alias) => alias.match.test(normalized))?.label ?? "";
}

export function inferProjectTypeId(project: Pick<ManagementProject, "name" | "project_type_id">, projectTypes: ManagementProjectType[]) {
  if (project.project_type_id && projectTypes.some((type) => type.id === project.project_type_id)) {
    return project.project_type_id;
  }

  const inferredName = inferProjectTypeName(project.name);
  if (!inferredName) return "";

  const inferredKey = normalizeSearchKey(inferredName);
  const alias = PROJECT_TYPE_ALIASES.find((item) => item.label === inferredName);

  return (
    projectTypes.find((type) => normalizeSearchKey(type.name) === inferredKey)?.id ??
    projectTypes.find((type) => alias && normalizeSearchKey(type.id).includes(alias.idHint))?.id ??
    ""
  );
}

export function resolveResponsibleName(owner: Pick<ManagementProject, "responsible" | "responsible_user_id">, users: ManagementUser[]) {
  return users.find((user) => user.id === owner.responsible_user_id)?.name ?? owner.responsible?.trim() ?? "";
}

export function resolveResponsibleUserId(owner: Pick<ManagementProject, "responsible" | "responsible_user_id">, users: ManagementUser[]) {
  if (owner.responsible_user_id && users.some((user) => user.id === owner.responsible_user_id)) {
    return owner.responsible_user_id;
  }

  const legacyName = normalizeSearchKey(owner.responsible);
  if (!legacyName) return "";

  return users.find((user) => normalizeSearchKey(user.name) === legacyName)?.id ?? "";
}

export function calculateProjectProgress(projectId: string, steps: ManagementStep[]) {
  const applicable = steps.filter((step) => step.project_id === projectId && !step.is_not_applicable);
  const completed = applicable.filter((step) => step.status === "concluido").length;

  return {
    totalSteps: applicable.length,
    completedSteps: completed,
    progress: applicable.length ? Math.round((completed / applicable.length) * 100) : 0,
  };
}

export function buildManagementProjectRows(input: {
  projects: ManagementProject[];
  clients: ManagementClient[];
  projectTypes: ManagementProjectType[];
  users: ManagementUser[];
  steps: ManagementStep[];
}) {
  return input.projects.map<ManagementProjectRow>((project) => {
    const client = resolveProjectClient(project, input.clients);
    const projectTypeId = inferProjectTypeId(project, input.projectTypes);
    const progress = calculateProjectProgress(project.id, input.steps);
    const inferredType = inferProjectTypeName(project.name);
    const typeName = input.projectTypes.find((type) => type.id === projectTypeId)?.name ?? inferredType;

    return {
      id: project.id,
      name: project.name,
      clientId: client?.id ?? project.client_id ?? null,
      clientName: client?.name ?? project.company?.trim() ?? "Sem cliente vinculado",
      legacyCompany: project.company?.trim() ?? "",
      responsibleUserId: resolveResponsibleUserId(project, input.users),
      responsibleName: resolveResponsibleName(project, input.users),
      projectTypeId,
      projectTypeName: typeName || "Sem tipo definido",
      status: project.status,
      updatedAt: project.updated_at ?? project.created_at ?? "",
      ...progress,
    };
  });
}

export function buildManagementClientRows(clients: ManagementClient[], projectRows: ManagementProjectRow[]) {
  return clients.map<ManagementClientRow>((client) => {
    const projects = projectRows.filter((project) => project.clientId === client.id);
    const activeProjectCount = projects.filter((project) => !["concluido", "arquivado"].includes(project.status)).length;
    const completedProjectCount = projects.filter((project) => project.status === "concluido" || project.progress === 100).length;
    const averageProgress = projects.length ? Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length) : 0;

    return {
      id: client.id,
      name: client.name,
      company: client.company?.trim() ?? "",
      responsibleName: client.responsible?.trim() ?? "",
      projectCount: projects.length,
      activeProjectCount,
      completedProjectCount,
      averageProgress,
    };
  });
}

export function filterManagementProjectRows(rows: ManagementProjectRow[], filters: ManagementFilters) {
  const search = normalizeSearchKey(filters.search);

  return rows.filter((row) => {
    if (filters.clientId && filters.clientId !== "todos" && row.clientId !== filters.clientId) return false;
    if (filters.responsibleUserId && filters.responsibleUserId !== "todos" && row.responsibleUserId !== filters.responsibleUserId) return false;
    if (filters.projectTypeId && filters.projectTypeId !== "todos" && row.projectTypeId !== filters.projectTypeId) return false;
    if (filters.status && filters.status !== "todos" && row.status !== filters.status) return false;
    if (!search) return true;

    return normalizeSearchKey([row.name, row.clientName, row.legacyCompany, row.projectTypeName, row.responsibleName].join(" ")).includes(search);
  });
}
