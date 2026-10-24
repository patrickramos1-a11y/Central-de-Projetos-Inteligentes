import type { WorkspaceOverview } from "../workspace/workspaceModel";

export type ClientPortfolioSortColumn = "name" | "kind" | "responsible" | "projects" | "contexts" | "directories" | "links" | "status";
export type ClientPortfolioSortDirection = "asc" | "desc";

export type ClientPortfolioRow = {
  id: string;
  name: string;
  company: string;
  logoUrl: string | null;
  kind: "AC" | "AV" | null;
  responsibleName: string;
  projectCount: number;
  contextCount: number;
  directoryCount: number;
  linkCount: number;
  status: string;
  isActive: boolean;
  updatedAt: string;
};

type ClientInput = {
  id: string;
  name: string;
  company?: string | null;
  logo_url?: string | null;
  client_kind?: "AC" | "AV" | null;
  responsible?: string | null;
  responsible_user_id?: string | null;
  status: string;
  is_active: boolean;
  updated_at?: string;
  created_at?: string;
};

type ProjectInput = { id: string; client_id?: string | null; company?: string | null };
type UserInput = { id: string; name: string };
type ContextCount = { clientId: string; count: number };

function normalized(value: string | null | undefined) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
}

function legacyClientId(project: ProjectInput, clients: ClientInput[]) {
  if (project.client_id) return project.client_id;
  const company = normalized(project.company);
  if (!company) return "";
  const matches = clients.filter((client) => normalized(client.name) === company || normalized(client.company) === company);
  return matches.length === 1 ? matches[0].id : "";
}

export function buildClientPortfolioRows({
  clients,
  projects,
  users,
  workspaces,
  contextCounts,
}: {
  clients: ClientInput[];
  projects: ProjectInput[];
  users: UserInput[];
  workspaces: WorkspaceOverview[];
  contextCounts: ContextCount[];
}): ClientPortfolioRow[] {
  const workspaceByProject = new Map(workspaces.map((workspace) => [workspace.projectId, workspace]));
  const contextCountByClient = new Map(contextCounts.map((item) => [item.clientId, Number(item.count) || 0]));
  const projectIdsByClient = new Map<string, string[]>();

  for (const project of projects) {
    const clientId = legacyClientId(project, clients);
    if (clientId) projectIdsByClient.set(clientId, [...(projectIdsByClient.get(clientId) ?? []), project.id]);
  }

  return clients.map((client) => {
    const projectIds = projectIdsByClient.get(client.id) ?? [];
    const linkedWorkspaces = projectIds.map((id) => workspaceByProject.get(id)).filter((item): item is WorkspaceOverview => Boolean(item));
    const linkedUser = users.find((user) => user.id === client.responsible_user_id);
    return {
      id: client.id,
      name: client.name,
      company: client.company?.trim() || "Sem empresa informada",
      logoUrl: client.logo_url ?? null,
      kind: client.client_kind ?? null,
      responsibleName: linkedUser?.name ?? client.responsible?.trim() ?? "Sem responsavel",
      projectCount: projectIds.length,
      contextCount: contextCountByClient.get(client.id) ?? 0,
      directoryCount: linkedWorkspaces.reduce((total, item) => total + item.directoryCount, 0),
      linkCount: linkedWorkspaces.reduce((total, item) => total + item.conversationCount + item.supportCount, 0),
      status: client.status,
      isActive: client.is_active,
      updatedAt: client.updated_at ?? client.created_at ?? "",
    };
  });
}

export function sortClientPortfolioRows(rows: ClientPortfolioRow[], column: ClientPortfolioSortColumn, direction: ClientPortfolioSortDirection) {
  const multiplier = direction === "asc" ? 1 : -1;
  const value = (row: ClientPortfolioRow): string | number => {
    if (column === "name") return row.name;
    if (column === "kind") return row.kind ?? "";
    if (column === "responsible") return row.responsibleName;
    if (column === "projects") return row.projectCount;
    if (column === "contexts") return row.contextCount;
    if (column === "directories") return row.directoryCount;
    if (column === "links") return row.linkCount;
    return column === "status" ? `${row.isActive ? "0" : "1"}-${row.status}` : row.updatedAt;
  };
  return [...rows].sort((left, right) => {
    const a = value(left);
    const b = value(right);
    if (typeof a === "number" && typeof b === "number") return (a - b) * multiplier;
    return String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base", numeric: true }) * multiplier;
  });
}

export function filterClientPortfolioRows(rows: ClientPortfolioRow[], filters: {
  query: string;
  kind: "all" | "AC" | "AV";
  responsible: string;
  status: string;
  showInactive: boolean;
  minimumProjects: number;
  minimumContexts: number;
  minimumDirectories: number;
  minimumLinks: number;
}) {
  const query = normalized(filters.query);
  return rows.filter((row) => {
    if (!filters.showInactive && !row.isActive) return false;
    if (filters.kind !== "all" && row.kind !== filters.kind) return false;
    if (filters.responsible !== "all" && row.responsibleName !== filters.responsible) return false;
    if (filters.status === "active" && !row.isActive) return false;
    if (filters.status === "inactive" && row.isActive) return false;
    if (!filters.status.startsWith("_") && !["all", "active", "inactive"].includes(filters.status) && row.status !== filters.status) return false;
    if (row.projectCount < filters.minimumProjects || row.contextCount < filters.minimumContexts || row.directoryCount < filters.minimumDirectories || row.linkCount < filters.minimumLinks) return false;
    return !query || normalized(`${row.name} ${row.company} ${row.kind ?? ""} ${row.responsibleName}`).includes(query);
  });
}
