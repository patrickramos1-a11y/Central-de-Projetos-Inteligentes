import { describe, expect, test } from "bun:test";
import { toWorkspaceOverview, uniqueLegacyNames, validateWorkspaceSubmission } from "../../../worker/projectWorkspace";

const directory = { id: "dir-1", kind: "directory", title: "Pasta", target: "C:\\Projetos\\A", notes: null };
const conversation = { id: "conv-1", kind: "conversation", title: "Conversa principal", target: "https://example.com/chat", notes: "" };

describe("projectWorkspace API validation", () => {
  test("accepts multiple typed references and explicit N/A", () => {
    expect(validateWorkspaceSubmission({ expectedRevision: 0, conversationNotApplicable: false, references: [directory, conversation, { ...directory, id: "dir-2" }] })).toMatchObject({ references: [{ id: "dir-1" }, { id: "conv-1" }, { id: "dir-2" }] });
    expect(validateWorkspaceSubmission({ expectedRevision: 2, conversationNotApplicable: true, references: [directory] })).toMatchObject({ conversationNotApplicable: true });
  });

  test("rejects malformed, duplicate, unsafe links and conflicting N/A", () => {
    expect(typeof validateWorkspaceSubmission({ expectedRevision: 0, conversationNotApplicable: false, references: [directory, directory] })).toBe("string");
    expect(typeof validateWorkspaceSubmission({ expectedRevision: 0, conversationNotApplicable: false, references: [{ ...conversation, target: "file:///etc/passwd" }] })).toBe("string");
    expect(typeof validateWorkspaceSubmission({ expectedRevision: 0, conversationNotApplicable: false, references: [{ ...directory, target: "https://drive.google.com/drive/folders/abc" }] })).toBe("string");
    expect(typeof validateWorkspaceSubmission({ expectedRevision: 0, conversationNotApplicable: false, references: [{ ...directory, target: "Pasta de Trabalho" }] })).toBe("string");
    expect(typeof validateWorkspaceSubmission({ expectedRevision: 0, conversationNotApplicable: true, references: [conversation] })).toBe("string");
    expect(typeof validateWorkspaceSubmission({ expectedRevision: -1, conversationNotApplicable: false, references: [] })).toBe("string");
  });

  test("derives status from boolean essentials, not number of optional links", () => {
    const row = { project_id: "p", conversation_not_applicable: 0, revision: 1 };
    expect(toWorkspaceOverview(row, { project_id: "p", directory_count: 0, conversation_count: 0, support_count: 50 }).status).toBe("nao_iniciado");
    expect(toWorkspaceOverview(row, { project_id: "p", directory_count: 1, conversation_count: 0, support_count: 0 }).status).toBe("parcial");
    expect(toWorkspaceOverview({ ...row, conversation_not_applicable: 1 }, { project_id: "p", directory_count: 1, conversation_count: 0, support_count: 0 }).status).toBe("organizado");
  });

  test("only offers legacy client names that identify one client", () => {
    const client = { id: "one", name: "Advance", company: "Grupo Advance" };
    expect(uniqueLegacyNames(client, [client])).toEqual(["advance", "grupo advance"]);
    expect(uniqueLegacyNames(client, [client, { id: "two", name: "ADVANCE", company: null }])).toEqual(["grupo advance"]);
  });
});
