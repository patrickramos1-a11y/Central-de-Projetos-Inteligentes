import { describe, expect, test } from "bun:test";
import { browserAccessibleUrl, workspaceMissing, workspaceProvider, workspaceStatus } from "./workspaceModel";
import { buildManagementAttentionRows, buildManagementClientRows, buildManagementProjectRows } from "../management/managementModel";
import { buildProjectListRows, filterProjectListRows } from "../projects/projectListModel";

const pending = { projectId: "p", directoryCount: 0, conversationCount: 0, supportCount: 0, conversationNotApplicable: false, revision: 0, status: "nao_iniciado" as const };
const organized = { ...pending, directoryCount: 1, conversationNotApplicable: true, revision: 1, status: "organizado" as const };

describe("local de trabalho", () => {
  test("requires a directory and a conversation or explicit not applicable", () => {
    expect(workspaceStatus(0, 0, false)).toBe("nao_iniciado");
    expect(workspaceStatus(1, 0, false)).toBe("parcial");
    expect(workspaceStatus(0, 2, false)).toBe("parcial");
    expect(workspaceStatus(1, 0, true)).toBe("organizado");
    expect(workspaceStatus(1, 3, false)).toBe("organizado");
    expect(workspaceMissing(pending)).toHaveLength(2);
    expect(workspaceMissing(organized)).toEqual([]);
  });

  test("only opens browser-safe URLs, never local paths", () => {
    expect(browserAccessibleUrl("https://example.com/path")).toBe("https://example.com/path");
    expect(browserAccessibleUrl("C:\\Projetos\\Cliente")).toBeNull();
    expect(browserAccessibleUrl("file:///C:/Projetos")).toBeNull();
    expect(browserAccessibleUrl("javascript:alert(1)")).toBeNull();
  });

  test("identifies provider badges from the destination without changing the reference kind", () => {
    expect(workspaceProvider("directory", "\\\\Servidor\\Projetos\\PCA")).toBe("server");
    expect(workspaceProvider("conversation", "https://chatgpt.com/g/project/c/123")).toBe("chatgpt");
    expect(workspaceProvider("conversation", "https://claude.ai/chat/123")).toBe("claude");
    expect(workspaceProvider("support", "https://notebooklm.google.com/notebook/123")).toBe("notebooklm");
    expect(workspaceProvider("support", "https://drive.google.com/drive/folders/123")).toBe("google-drive");
    expect(workspaceProvider("support", "https://example.com/file")).toBe("link");
  });

  test("historically completed project needs regularization without changing its saved status", () => {
    const input = { projects: [{ id: "p", name: "Antigo", status: "concluido" as const }], clients: [], users: [], projectTypes: [], steps: [{ id: "s", project_id: "p", status: "concluido" }] };
    const before = buildManagementProjectRows({ ...input, workspaces: [pending] });
    expect(input.projects[0].status).toBe("concluido");
    expect(before[0]).toMatchObject({ historicalStatus: "concluido", status: "em_andamento", regularizationPending: true, completedSteps: 1, totalSteps: 2, progress: 50 });
    expect(buildManagementAttentionRows(before)[0].reasons).toEqual(["regularizacao_pendente"]);
    expect(buildManagementClientRows([], before)).toEqual([]);
    const list = buildProjectListRows(before, [{ project_id: "p", name: "Entrega", status: "concluido" }], [], [pending]);
    expect(list[0].displayStatus).toBe("em_andamento");
    expect(filterProjectListRows(list, { search: "", status: "concluido", responsible: "todos", template: "todos" })).toHaveLength(0);

    const after = buildManagementProjectRows({ ...input, workspaces: [organized] });
    expect(after[0]).toMatchObject({ historicalStatus: "concluido", status: "concluido", regularizationPending: false, completedSteps: 2, totalSteps: 2, progress: 100 });
    const completedList = buildProjectListRows(after, [{ project_id: "p", name: "Entrega", status: "concluido" }], [], [organized]);
    expect(filterProjectListRows(completedList, { search: "", status: "concluido", responsible: "todos", template: "todos" })).toHaveLength(1);
  });

  test("new project gets one fixed step without inflating progress from extra links", () => {
    const input = { projects: [{ id: "p", name: "Novo", status: "em_andamento" as const }], clients: [], users: [], projectTypes: [], steps: [] };
    expect(buildManagementProjectRows({ ...input, workspaces: [pending] })[0]).toMatchObject({ totalSteps: 1, completedSteps: 0, progress: 0 });
    expect(buildManagementProjectRows({ ...input, workspaces: [{ ...organized, directoryCount: 8, conversationCount: 5 }] })[0]).toMatchObject({ totalSteps: 1, completedSteps: 1, progress: 100 });
    const list = buildProjectListRows(buildManagementProjectRows({ ...input, workspaces: [organized] }), [], [], [organized]);
    expect(list[0].displayStatus).toBe("em_andamento");
  });
});
