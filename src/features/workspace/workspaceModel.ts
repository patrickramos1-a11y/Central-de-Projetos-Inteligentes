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

export type ProjectWorkspace = WorkspaceOverview & {
  references: WorkspaceReference[];
  manualReferences: WorkspaceReference[];
  guidance: string;
};

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
