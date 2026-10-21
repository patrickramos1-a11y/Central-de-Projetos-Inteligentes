import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, FolderOpen, RefreshCw, Search, X } from "lucide-react";
import { copyText } from "../../components/ui/clipboard";
import { browserAccessibleUrl, workspaceStatusLabel, type ProjectWorkspace } from "./workspaceModel";

type ClientWorkspace = { project: { id: string; name: string; status: string; linkType: "explicit" | "legacy" }; workspace: ProjectWorkspace };

export function ClientWorkspacesDialog({ baseUrl, clientId, clientName, onClose, onOpenProject }: {
  baseUrl: string; clientId: string; clientName: string; onClose: () => void; onOpenProject: (id: string) => void;
}) {
  const [items, setItems] = useState<ClientWorkspace[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const lastRefresh = useRef(0);

  async function refresh() {
    const requestId = ++sequence.current;
    setLoading(true);
    try {
      const response = await fetch(`${baseUrl}/api/clients/${encodeURIComponent(clientId)}/workspaces`, { cache: "no-store" });
      const body = await response.json() as { data?: ClientWorkspace[]; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error || "Nao foi possivel carregar os locais de trabalho.");
      if (requestId === sequence.current) { setItems(body.data); setError(""); }
    } catch (cause) {
      if (requestId === sequence.current) setError(cause instanceof Error ? cause.message : "Falha ao atualizar.");
    } finally { if (requestId === sequence.current) setLoading(false); }
  }

  useEffect(() => { void refresh(); return () => { sequence.current += 1; }; }, [clientId]);
  useEffect(() => {
    const revalidate = (event: Event) => {
      if (document.visibilityState !== "visible" || (event.type !== "online" && Date.now() - lastRefresh.current < 1000)) return;
      lastRefresh.current = Date.now();
      void refresh();
    };
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("focus", revalidate);
    window.addEventListener("online", revalidate);
    return () => { document.removeEventListener("visibilitychange", revalidate); window.removeEventListener("focus", revalidate); window.removeEventListener("online", revalidate); };
  }, [clientId]);

  const visible = items.filter((item) => `${item.project.name} ${item.workspace.references.map((ref) => `${ref.title} ${ref.target}`).join(" ")}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="client-workspaces-dialog glass-panel" role="dialog" aria-modal="true" aria-label={`Locais de trabalho de ${clientName}`} onMouseDown={(event) => event.stopPropagation()}>
      <header className="modal-heading"><div><span className="eyebrow">Cliente</span><h2>Locais de trabalho</h2><p>{clientName}</p></div><button className="icon-button" type="button" title="Fechar" onClick={onClose}><X size={18} /></button></header>
      <div className="client-workspaces-tools"><label className="search-field"><Search size={16} /><input aria-label="Buscar projetos ou referencias" placeholder="Buscar projeto ou referencia" value={query} onChange={(event) => setQuery(event.target.value)} /></label><button className="icon-button" type="button" title="Atualizar" onClick={() => void refresh()}><RefreshCw size={17} /></button></div>
      {error && <p className="workspace-error" role="alert">{error}</p>}
      {loading && !items.length && <p>Carregando projetos...</p>}
      <div className="client-workspaces-list">{visible.map(({ project, workspace }) => <article className="client-workspace-project" key={project.id}>
        <header><div><strong>{project.name}</strong><small>{project.linkType === "legacy" ? "Associacao legada por nome; revise o vinculo" : "Cliente vinculado"}</small></div><span className={`workspace-state ${workspace.status}`}>{workspaceStatusLabel(workspace.status)}</span><button className="secondary-button" type="button" onClick={() => onOpenProject(project.id)}><FolderOpen size={16} /> Abrir projeto</button></header>
        {workspace.references.length ? <ul>{workspace.references.map((ref) => <li key={ref.id}><span className="workspace-kind-label">{ref.kind === "directory" ? "Diretorio" : ref.kind === "conversation" ? "Conversa" : "Apoio"}</span><span className="workspace-ref-text"><strong>{ref.title}</strong><small>{ref.target}</small></span><button className="icon-button" type="button" title="Copiar" onClick={() => void copyText(ref.target)}><Copy size={15} /></button>{browserAccessibleUrl(ref.target) && <a className="icon-button" title="Abrir link" href={browserAccessibleUrl(ref.target)!} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /></a>}</li>)}</ul> : <p>Nenhuma referencia cadastrada.</p>}
        {workspace.conversationNotApplicable && <small>Conversa: nao se aplica.</small>}
      </article>)}</div>
      {!loading && visible.length === 0 && <p>Nenhum projeto encontrado para esta busca.</p>}
    </section>
  </div>;
}
