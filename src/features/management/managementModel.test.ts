import { describe, expect, test } from "bun:test";
import {
  buildManagementAttentionRows,
  buildManagementClientRows,
  buildManagementProjectRows,
  filterManagementProjectRows,
  getProjectClientName,
  inferProjectTypeId,
  inferProjectTypeName,
  resolveProjectClient,
} from "./managementModel";

const clients = [
  { id: "client-1", name: "Bento Sushi", company: "Bento Sushi" },
  { id: "client-2", name: "Advance", company: "Advance" },
];

const projectTypes = [
  { id: "type-pca", name: "PCA" },
  { id: "type-ria", name: "RIA" },
  { id: "type-rca-pca", name: "RCA/PCA" },
];

const users = [{ id: "user-patrick", name: "Patrick" }];

describe("managementModel", () => {
  test("resolves project client by explicit id before legacy company text", () => {
    const client = resolveProjectClient({ client_id: "client-2", company: "Bento Sushi" }, clients);
    expect(client?.name).toBe("Advance");
    expect(getProjectClientName({ client_id: "client-2", company: "Bento Sushi" }, clients)).toBe("Advance");
  });

  test("resolves project client by legacy company when client_id is missing", () => {
    const client = resolveProjectClient({ client_id: null, company: " bento sushi " }, clients);
    expect(client?.id).toBe("client-1");
  });

  test("infers common project type aliases from project names", () => {
    expect(inferProjectTypeName("PCA do Bento Sushi")).toBe("PCA");
    expect(inferProjectTypeName("RCA + PCA - obra")).toBe("RCA/PCA");
    expect(inferProjectTypeName("RIA Advance")).toBe("RIA");
    expect(inferProjectTypeId({ name: "RIA Advance", project_type_id: null }, projectTypes)).toBe("type-ria");
  });

  test("keeps the existing type when already linked", () => {
    expect(inferProjectTypeId({ name: "Projeto especial", project_type_id: "type-pca" }, projectTypes)).toBe("type-pca");
  });

  test("builds management rows with progress, filters and client consolidation", () => {
    const rows = buildManagementProjectRows({
      clients,
      projectTypes,
      users,
      projects: [
        {
          id: "project-1",
          name: "PCA do Bento Sushi",
          company: "Bento Sushi",
          client_id: null,
          responsible: "Patrick",
          responsible_user_id: null,
          project_type_id: null,
          status: "em_andamento",
          created_at: "2026-01-01",
          updated_at: "2026-01-02",
        },
        {
          id: "project-2",
          name: "Projeto personalizado",
          company: "",
          client_id: "client-2",
          responsible: null,
          responsible_user_id: "user-patrick",
          project_type_id: "",
          status: "planejado",
          created_at: "2026-01-01",
          updated_at: "2026-01-03",
        },
      ],
      steps: [
        { id: "step-1", project_id: "project-1", name: "Inicio", step_order: 1, status: "concluido" },
        { id: "step-2", project_id: "project-1", name: "Contexto", step_order: 2, status: "pendente" },
        { id: "step-3", project_id: "project-1", status: "concluido", is_not_applicable: true },
      ],
    });

    expect(rows[0]).toMatchObject({
      clientId: "client-1",
      clientName: "Bento Sushi",
      hasClientLink: false,
      projectTypeId: "type-pca",
      hasProjectTypeLink: false,
      responsibleUserId: "user-patrick",
      progress: 50,
      totalSteps: 2,
      completedSteps: 1,
      nextStepName: "Contexto",
    });

    expect(filterManagementProjectRows(rows, { search: "advance", clientId: "todos" })).toHaveLength(1);
    expect(filterManagementProjectRows(rows, { projectTypeId: "type-pca" })).toHaveLength(1);

    const clientRows = buildManagementClientRows(clients, rows);
    expect(clientRows.find((client) => client.id === "client-1")).toMatchObject({ projectCount: 1, averageProgress: 50 });
  });

  test("prioritizes blocked projects and only reports attention from recorded data", () => {
    const rows = buildManagementProjectRows({
      clients,
      projectTypes,
      users,
      projects: [
        { id: "missing", name: "Personalizado", status: "em_andamento", created_at: "2026-01-01" },
        { id: "done", name: "RIA Advance", client_id: "client-2", responsible: "Patrick", project_type_id: "type-ria", status: "concluido", created_at: "2026-01-02" },
        { id: "blocked", name: "PCA Bento", client_id: "client-1", responsible: "Patrick", project_type_id: "type-pca", status: "bloqueado", created_at: "2026-01-03" },
        { id: "archived", name: "Arquivo", status: "arquivado" },
      ],
      steps: [
        { id: "step-1", project_id: "done", status: "concluido" },
        { id: "step-2", project_id: "done", status: "pendente" },
      ],
    });
    const attention = buildManagementAttentionRows(rows);
    expect(attention.map((row) => row.id)).toEqual(["blocked", "done", "missing"]);
    expect(attention.find((row) => row.id === "done")?.reasons).toEqual(["concluido_com_etapas_abertas"]);
    expect(attention.find((row) => row.id === "missing")?.reasons).toEqual(["sem_cliente", "sem_responsavel", "sem_tipo"]);
    expect(attention.some((row) => row.id === "archived")).toBe(false);
  });
});
