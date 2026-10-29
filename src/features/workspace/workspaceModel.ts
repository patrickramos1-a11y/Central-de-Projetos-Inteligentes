export const WORKSPACE_STEP_ID = "__project_workspace__";

export type WorkspaceKind = "directory" | "conversation" | "support";
export type WorkspaceProvider = "server" | "chatgpt" | "claude" | "notebooklm" | "google-drive" | "link";
export type WorkspaceStatus = "nao_iniciado" | "parcial" | "organizado";

export type WorkspaceReference = {
  id: string;
  project_id: string;
  kind: WorkspaceKind;
  title: string;
  target: string;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  origin?: { type: "journey"; stepId: string; stepName: string; blockTitle: string };
};

export type WorkspaceOverview = {
  projectId: string;
  directoryCount: number;
  conversationCount: number;
  supportCount: number;
  conversationNotApplicable: boolean;
  revision: number;
  status: WorkspaceStatus;
};

export type WorkspaceChecklistItem = {
  id: string;
  project_id: string;
  label: string;
  is_done: boolean;
  item_order: number;
  created_at: string;
  updated_at: string;
};

export type WorkspaceContext = {
  id: string;
  project_id: string;
  title: string;
  content: string;
  category: string | null;
  source_client_context_id: string | null;
  source_version: number | null;
  context_order: number;
  created_at: string;
  updated_at: string;
};

export type ProjectWorkspace = WorkspaceOverview & {
  references: WorkspaceReference[];
  manualReferences: WorkspaceReference[];
  checklistItems: WorkspaceChecklistItem[];
  contexts: WorkspaceContext[];
  guidance: string;
};

export type WorkspaceContextPrompt = { id: string; name: string; content: string };

const canonicalContextPrompts = [
  { id: "fe70d1e9-c897-46a3-b724-66a74ac242c5", tokens: ["criacao", "contexto", "conversa"] },
  { id: "4f391d66-1de0-4213-8683-1e28f505e482", tokens: ["extracao", "dados", "arquivos"] },
  { id: "e57aae02-0dcb-47ad-890f-9b7745aae850", tokens: ["consolidacao", "contextos", "comentarios", "diretrizes"] },
] as const;

function normalizedPromptTitle(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function selectWorkspaceContextPrompts(prompts: Array<{ id: string; title: string; content: string }>): WorkspaceContextPrompt[] {
  const selected = new Set<string>();
  return canonicalContextPrompts.flatMap((definition) => {
    const prompt = prompts.find((item) => item.id === definition.id)
      ?? prompts.find((item) => {
        const title = normalizedPromptTitle(item.title);
        return definition.tokens.every((token) => title.includes(token));
      });
    if (!prompt || selected.has(prompt.id)) return [];
    selected.add(prompt.id);
    return [{ id: prompt.id, name: prompt.title, content: prompt.content }];
  });
}

export function contextTitleFromContent(content: string): string {
  return content.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 160) ?? "";
}

export function workspaceStatus(directoryCount: number, conversationCount: number, conversationNotApplicable: boolean): WorkspaceStatus {
  if (directoryCount > 0 && (conversationCount > 0 || conversationNotApplicable)) return "organizado";
  if (directoryCount > 0 || conversationCount > 0 || conversationNotApplicable) return "parcial";
  return "nao_iniciado";
}

export function workspaceMissing(value: Pick<WorkspaceOverview, "directoryCount" | "conversationCount" | "conversationNotApplicable">): string[] {
  const missing: string[] = [];
  if (!value.directoryCount) missing.push("um diretorio do servidor");
  if (!value.conversationCount && !value.conversationNotApplicable) missing.push("um link de conversa ou a marcacao Nao se aplica");
  return missing;
}

export function workspaceStatusLabel(status: WorkspaceStatus): string {
  return status === "organizado" ? "Organizado" : status === "parcial" ? "Parcial" : "Nao iniciado";
}

export function browserAccessibleUrl(target: string): string | null {
  try {
    const url = new URL(target);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function serverDirectoryPath(target: string): boolean {
  return /^(?:[a-z]:[\\/]|\\\\|\/\/)/i.test(target.trim());
}

export function workspaceProvider(kind: WorkspaceKind, target: string): WorkspaceProvider {
  if (kind === "directory") return "server";
  const webUrl = browserAccessibleUrl(target);
  if (!webUrl) return "link";
  const host = new URL(webUrl).hostname.toLowerCase();
  if (host === "chatgpt.com" || host === "chat.openai.com") return "chatgpt";
  if (host === "claude.ai") return "claude";
  if (host === "notebooklm.google.com" || host === "notebook.google.com") return "notebooklm";
  if (host === "drive.google.com") return "google-drive";
  return "link";
}
