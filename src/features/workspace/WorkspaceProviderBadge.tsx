import { FolderClosed, Link2 } from "lucide-react";
import { workspaceProvider, type WorkspaceKind } from "./workspaceModel";

const providers = {
  chatgpt: { label: "ChatGPT", image: "/ai-tools/chatgpt.png" },
  claude: { label: "Claude", image: "/ai-tools/claude.png" },
  notebooklm: { label: "NotebookLM", image: "/ai-tools/notebooklm.png" },
  "google-drive": { label: "Google Drive", image: "/ai-tools/google-drive.png" },
} as const;

export function WorkspaceProviderBadge({ kind, target }: { kind: WorkspaceKind; target: string }) {
  const provider = workspaceProvider(kind, target);
  if (provider === "server") return <span className="workspace-provider-badge" data-provider={provider}><FolderClosed size={16} aria-hidden="true" /><span>Servidor</span></span>;
  if (provider === "link") return <span className="workspace-provider-badge" data-provider={provider}><Link2 size={16} aria-hidden="true" /><span>Link</span></span>;
  const { label, image } = providers[provider];
  return <span className="workspace-provider-badge" data-provider={provider}><img src={image} alt="" aria-hidden="true" /><span>{label}</span></span>;
}
