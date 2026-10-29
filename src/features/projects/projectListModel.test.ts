import { describe, expect, test } from "bun:test";
import { buildManagementProjectRows } from "../management/managementModel";
import { buildProjectListRows, filterProjectListRows, getProjectAge, groupProjectListRows, projectPrimaryAction, projectWorkspaceGap, sortProjectListRows } from "./projectListModel";

const baseRows = buildManagementProjectRows({
  clients: [{ id: "client-1", name: "Bento Sushi" }, { id: "client-2", name: "Advance" }],
  projectTypes: [{ id: "type-pca", name: "PCA" }, { id: "type-ria", name: "RIA" }],
  templates: [{ id: "template-pca", name: "Template PCA" }, { id: "template-ria", name: "Template RIA" }],
  users: [{ id: "user-1", name: "Patrick" }],
  projects: [
    { id: "pca", name: "PCA Bento Sushi", company: "Bento Sushi", client_id: null, project_type_id: null, journey_template_id: "template-pca", responsible: "Patrick", responsible_user_id: null, status: "em_andamento", updated_at: "2026-01-02" },
    { id: "ria", name: "RIA Advance", company: "Outro nome", client_id: "client-2", project_type_id: null, journey_template_id: "template-ria", responsible: null, responsible_user_id: "user-1", status: "em_andamento", updated_at: "2026-01-03" },
  ],
  steps: [],
});

describe("projectListModel", () => {
  test("shows a folder action until the work location is organized", () => {
    const row = { historicalStatus: "em_andamento" as const, displayStatus: "em_andamento" as const, status: "em_andamento" as const, progress: 22 };
    expect(projectPrimaryAction(row)).toBe("workspace");
    expect(projectPrimaryAction(row, { status: "parcial" })).toBe("workspace");
    expect(projectPrimaryAction(row, { status: "organizado" })).toBe("complete");
    expect(projectPrimaryAction({ ...row, historicalStatus: "concluido", progress: 80 }, { status: "organizado" })).toBe("reopen");
    expect(projectPrimaryAction({ ...row, status: "arquivado" }, { status: "organizado" })).toBe("disabled");
  });
  test("uses the same summary-aware progress as the project cards", () => {
    const steps = [
      { project_id: "pca", name: "Contexto", status: "concluido" },
      { project_id: "pca", name: "Sumario", status: "concluido" },
      { project_id: "ria", name: "Iniciar", status: "concluido" },
    ];
    const withoutSummary = buildProjectListRows(baseRows, steps, []);
    expect(withoutSummary.find((row) => row.id === "pca")).toMatchObject({ completedSteps: 1, totalSteps: 2, progress: 50, displayStatus: "em_andamento" });

    const withSummary = buildProjectListRows(baseRows, steps, ["pca"]);
    expect(withSummary.find((row) => row.id === "pca")).toMatchObject({ completedSteps: 2, progress: 100, displayStatus: "concluido" });
    expect(withSummary.find((row) => row.id === "ria")?.displayStatus).toBe("concluido");
  });

  test("groups by linked or legacy client, template, operational status, or no group", () => {
    const rows = buildProjectListRows(baseRows, [], []);
    expect(groupProjectListRows(rows, "client").map((group) => group.label)).toEqual(["Advance", "Bento Sushi"]);
    expect(groupProjectListRows(rows, "template").map((group) => group.label)).toEqual(["Template RIA", "Template PCA"]);
    expect(groupProjectListRows(rows, "status").map((group) => group.label)).toEqual(["Em andamento · Local nao verificado"]);
    expect(groupProjectListRows(rows, "none")).toHaveLength(1);
  });

  test("filters by effective status, client, template and responsible name", () => {
    const rows = buildProjectListRows(baseRows, [{ project_id: "ria", name: "Iniciar", status: "concluido" }], []);
const defaults = { search: "", status: "todos" as const, responsible: "todos", template: "todos" };
    expect(filterProjectListRows(rows, { ...defaults, status: "concluido" }).map((row) => row.id)).toEqual(["ria"]);
    expect(filterProjectListRows(rows, { ...defaults, search: "bento", template: "Template PCA", responsible: "Patrick" }).map((row) => row.id)).toEqual(["pca"]);
    expect(filterProjectListRows(rows, { ...defaults, search: "advance" }).map((row) => row.id)).toEqual(["ria"]);
  });

  test("sorts data columns and combines column filters without mutating the source rows", () => {
    const rows = buildProjectListRows(baseRows, [{ project_id: "ria", name: "Iniciar", status: "concluido" }], []);
    const original = rows.map((row) => row.id);
    expect(sortProjectListRows(rows, "progress", "asc").map((row) => row.id)).toEqual(["pca", "ria"]);
    expect(sortProjectListRows(rows, "client", "desc").map((row) => row.id)).toEqual(["pca", "ria"]);
    expect(rows.map((row) => row.id)).toEqual(original);
    const defaults = { search: "", status: "todos" as const, responsible: "todos", template: "todos" };
    expect(filterProjectListRows(rows, { ...defaults, project: "Bento", client: "Bento Sushi", progressBand: "0" }).map((row) => row.id)).toEqual(["pca"]);
    expect(filterProjectListRows(rows, { ...defaults, progressBand: "100" }).map((row) => row.id)).toEqual(["ria"]);
    expect(filterProjectListRows(rows, { ...defaults, ageBand: "unknown" }).map((row) => row.id)).toEqual(original);
  });

  test("distinguishes directory, conversation, both, and organized without changing project status", () => {
    expect(projectWorkspaceGap()).toBe("unknown");
    expect(projectWorkspaceGap({ directoryCount: 0, conversationCount: 0, conversationNotApplicable: false })).toBe("both");
    expect(projectWorkspaceGap({ directoryCount: 0, conversationCount: 1, conversationNotApplicable: false })).toBe("directory");
    expect(projectWorkspaceGap({ directoryCount: 1, conversationCount: 0, conversationNotApplicable: false })).toBe("conversation");
    expect(projectWorkspaceGap({ directoryCount: 1, conversationCount: 0, conversationNotApplicable: true })).toBe("organized");

    const rows = buildProjectListRows(baseRows, [], [], [
      { projectId: "pca", directoryCount: 0, conversationCount: 1, supportCount: 1, conversationNotApplicable: false, revision: 1, status: "parcial" },
      { projectId: "ria", directoryCount: 1, conversationCount: 0, supportCount: 0, conversationNotApplicable: true, revision: 1, status: "organizado" },
    ]);
    expect(rows.find((row) => row.id === "pca")).toMatchObject({ displayStatus: "em_andamento", workspaceGap: "directory" });
    expect(rows.find((row) => row.id === "ria")?.workspaceGap).toBe("organized");
    expect(groupProjectListRows(rows, "status").map((group) => group.label)).toEqual([
      "Em andamento · Diretorio pendente",
      "Em andamento · Local organizado",
    ]);
    expect(sortProjectListRows(rows, "status", "asc").map((row) => row.id)).toEqual(["pca", "ria"]);
    expect(sortProjectListRows(rows, "status", "desc").map((row) => row.id)).toEqual(["ria", "pca"]);
    const defaults = { search: "", status: "em_andamento" as const, responsible: "todos", template: "todos" };
    expect(filterProjectListRows(rows, { ...defaults, workspaceGap: "directory" }).map((row) => row.id)).toEqual(["pca"]);
    expect(filterProjectListRows(rows, { ...defaults, workspaceGap: "organized" }).map((row) => row.id)).toEqual(["ria"]);
    expect(filterProjectListRows(rows, { ...defaults, workspaceGap: "both" })).toEqual([]);
  });

  test("keeps explicit project completion even with pending steps", () => {
    const completed = buildManagementProjectRows({
      projects: [{ id: "manual", name: "Manual", status: "concluido", created_at: "2026-01-01" }],
      clients: [], projectTypes: [], users: [], steps: [],
    });
    const rows = buildProjectListRows(completed, [{ project_id: "manual", name: "Entrega", status: "pendente" }], []);
    expect(rows[0]).toMatchObject({ displayStatus: "concluido", progress: 0, completedSteps: 0, totalSteps: 1 });
    expect(filterProjectListRows(rows, { search: "", status: "concluido", responsible: "todos", template: "todos" })).toHaveLength(1);
    expect(filterProjectListRows(rows, { search: "", status: "em_andamento", responsible: "todos", template: "todos" })).toHaveLength(0);
  });

  test("open filter includes planned and blocked projects but not archived", () => {
    const rows = buildProjectListRows(buildManagementProjectRows({
      projects: [
        { id: "planned", name: "Planejado", status: "planejado" },
        { id: "blocked", name: "Bloqueado", status: "bloqueado" },
        { id: "archived", name: "Arquivado", status: "arquivado" },
      ],
      clients: [], projectTypes: [], users: [], steps: [],
    }), [], []);
    const filters = { search: "", status: "em_andamento" as const, responsible: "todos", template: "todos" };
    expect(filterProjectListRows(rows, filters).map((row) => row.id)).toEqual(["planned", "blocked"]);
  });

  test("shows elapsed days only while open, without inventing a completion date", () => {
    const ongoing = { createdAt: "2026-10-17T12:00:00Z", displayStatus: "em_andamento" as const };
    expect(getProjectAge(ongoing, new Date("2026-10-19T12:00:00Z"))).toMatchObject({ label: "2 dias", available: true });
    expect(getProjectAge({ ...ongoing, displayStatus: "concluido" }, new Date("2026-10-19T12:00:00Z"))).toMatchObject({ label: "-", detail: "inicio 17/10", available: false });
    expect(getProjectAge({ createdAt: "", displayStatus: "planejado" }, new Date("2026-10-19T12:00:00Z"))).toMatchObject({ label: "-", available: false });
  });
});
