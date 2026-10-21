import { describe, expect, test } from "bun:test";
import { buildManagementProjectRows } from "../management/managementModel";
import { buildProjectListRows, filterProjectListRows, getProjectAge, groupProjectListRows, projectPrimaryAction, sortProjectListRows } from "./projectListModel";

const baseRows = buildManagementProjectRows({
  clients: [{ id: "client-1", name: "Bento Sushi" }, { id: "client-2", name: "Advance" }],
  projectTypes: [{ id: "type-pca", name: "PCA" }, { id: "type-ria", name: "RIA" }],
  users: [{ id: "user-1", name: "Patrick" }],
  projects: [
    { id: "pca", name: "PCA Bento Sushi", company: "Bento Sushi", client_id: null, project_type_id: null, responsible: "Patrick", responsible_user_id: null, status: "em_andamento", updated_at: "2026-01-02" },
    { id: "ria", name: "RIA Advance", company: "Outro nome", client_id: "client-2", project_type_id: null, responsible: null, responsible_user_id: "user-1", status: "em_andamento", updated_at: "2026-01-03" },
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

  test("groups by linked or legacy client, type, or no group", () => {
    const rows = buildProjectListRows(baseRows, [], []);
    expect(groupProjectListRows(rows, "client").map((group) => group.label)).toEqual(["Advance", "Bento Sushi"]);
    expect(groupProjectListRows(rows, "type").map((group) => group.label)).toEqual(["RIA", "PCA"]);
    expect(groupProjectListRows(rows, "none")).toHaveLength(1);
  });

  test("filters by effective status, client, type and responsible name", () => {
    const rows = buildProjectListRows(baseRows, [{ project_id: "ria", name: "Iniciar", status: "concluido" }], []);
    const defaults = { search: "", status: "todos" as const, responsible: "todos", type: "todos" };
    expect(filterProjectListRows(rows, { ...defaults, status: "concluido" }).map((row) => row.id)).toEqual(["ria"]);
    expect(filterProjectListRows(rows, { ...defaults, search: "bento", type: "PCA", responsible: "Patrick" }).map((row) => row.id)).toEqual(["pca"]);
    expect(filterProjectListRows(rows, { ...defaults, search: "advance" }).map((row) => row.id)).toEqual(["ria"]);
  });

  test("sorts data columns and combines column filters without mutating the source rows", () => {
    const rows = buildProjectListRows(baseRows, [{ project_id: "ria", name: "Iniciar", status: "concluido" }], []);
    const original = rows.map((row) => row.id);
    expect(sortProjectListRows(rows, "progress", "asc").map((row) => row.id)).toEqual(["pca", "ria"]);
    expect(sortProjectListRows(rows, "client", "desc").map((row) => row.id)).toEqual(["pca", "ria"]);
    expect(rows.map((row) => row.id)).toEqual(original);
    const defaults = { search: "", status: "todos" as const, responsible: "todos", type: "todos" };
    expect(filterProjectListRows(rows, { ...defaults, project: "Bento", client: "Bento Sushi", progressBand: "0" }).map((row) => row.id)).toEqual(["pca"]);
    expect(filterProjectListRows(rows, { ...defaults, progressBand: "100" }).map((row) => row.id)).toEqual(["ria"]);
    expect(filterProjectListRows(rows, { ...defaults, ageBand: "unknown" }).map((row) => row.id)).toEqual(original);
  });

  test("keeps explicit project completion even with pending steps", () => {
    const completed = buildManagementProjectRows({
      projects: [{ id: "manual", name: "Manual", status: "concluido", created_at: "2026-01-01" }],
      clients: [], projectTypes: [], users: [], steps: [],
    });
    const rows = buildProjectListRows(completed, [{ project_id: "manual", name: "Entrega", status: "pendente" }], []);
    expect(rows[0]).toMatchObject({ displayStatus: "concluido", progress: 0, completedSteps: 0, totalSteps: 1 });
    expect(filterProjectListRows(rows, { search: "", status: "concluido", responsible: "todos", type: "todos" })).toHaveLength(1);
    expect(filterProjectListRows(rows, { search: "", status: "em_andamento", responsible: "todos", type: "todos" })).toHaveLength(0);
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
    const filters = { search: "", status: "em_andamento" as const, responsible: "todos", type: "todos" };
    expect(filterProjectListRows(rows, filters).map((row) => row.id)).toEqual(["planned", "blocked"]);
  });

  test("shows elapsed days only while open, without inventing a completion date", () => {
    const ongoing = { createdAt: "2026-10-17T12:00:00Z", displayStatus: "em_andamento" as const };
    expect(getProjectAge(ongoing, new Date("2026-10-19T12:00:00Z"))).toMatchObject({ label: "2 dias", available: true });
    expect(getProjectAge({ ...ongoing, displayStatus: "concluido" }, new Date("2026-10-19T12:00:00Z"))).toMatchObject({ label: "-", detail: "inicio 17/10", available: false });
    expect(getProjectAge({ createdAt: "", displayStatus: "planejado" }, new Date("2026-10-19T12:00:00Z"))).toMatchObject({ label: "-", available: false });
  });
});
