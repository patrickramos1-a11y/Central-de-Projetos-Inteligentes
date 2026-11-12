import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, FolderOpen, Layers3, Link2, Loader2, Pencil, Route, Search } from "lucide-react";
import { copyText } from "../../components/ui/clipboard";
import { WorkspaceProviderBadge } from "../workspace/WorkspaceProviderBadge";
import { browserAccessibleUrl, displayDirectoryPath, type ProjectWorkspace, type WorkspaceReference } from "../workspace/workspaceModel";

type PageClient = { id: string; name: string; company: string | null; logo_url: string | null; client_kind: "AC" | "AV" | null; is_active: boolean };
type PageProject = { id: string; name: string; status: string; project_type_id: string | null; created_at: string; updated_at: string; completed_at?: string | null };
type PageContext = { id: string; title: string; content: string; category: string | null; origin_project_id: string | null; created_at?: string; updated_at: string };
type ClientWorkspace = { project: { id: string; name: string; status: string }; workspace: ProjectWorkspace };

function unwrap<T>(body: unknown): T {
  let value = body as unknown;
  while (value && typeof value === "object" && "data" in (value as object)) value = (value as { data: unknown }).data;
  return value as T;
}

const shortDate = (iso?: string | null) => (iso ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(iso)) : "");

/** Client page: identity, projects, contexts and every directory/link of its projects. */
export function ClientPage({ baseUrl, client, projects, projectTypes, onBack, onOpenProject, onOpenJourney, onEdit }: {
  baseUrl: string;
  client: PageClient;
  projects: PageProject[];
  projectTypes: Array<{ id: string; name: string }>;
  onBack: () => void;
  onOpenProject: (id: string) => void;
  onOpenJourney: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const [contexts, setContexts] = useState<PageContext[]>([]);
  const [workspaces, setWorkspaces] = useState<ClientWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contextQuery, setContextQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setLogoFailed(false);
    const base = baseUrl.replace(/\/$/, "");
    Promise.allSettled([
      fetch(`${base}/api/clients/${encodeURIComponent(client.id)}/contexts?offset=0`, { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error((body as { error?: string }).error || "Falha ao carregar contextos."); return unwrap<PageContext[]>(body); }),
      fetch(`${base}/api/clients/${encodeURIComponent(client.id)}/workspaces`, { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error((body as { error?: string }).error || "Falha ao carregar locais."); return unwrap<ClientWorkspace[]>(body); }),
    ]).then(([contextResult, workspaceResult]) => {
      if (!active) return;
      if (contextResult.status === "fulfilled") setContexts(contextResult.value); else setError(String(contextResult.reason?.message ?? contextResult.reason));
      if (workspaceResult.status === "fulfilled") setWorkspaces(workspaceResult.value); else setError((current) => current || String(workspaceResult.reason?.message ?? workspaceResult.reason));
      setLoading(false);
    });
    return () => { active = false; };
  }, [baseUrl, client.id]);

  const typeName = (id: string | null) => projectTypes.find((type) => type.id === id)?.name ?? "Sem tipo";
  const ordered = useMemo(() => [...projects].sort((a, b) => (a.status === "concluido" ? 1 : 0) - (b.status === "concluido" ? 1 : 0) || b.updated_at.localeCompare(a.updated_at)), [projects]);
  const visibleProjects = ordered.filter((project) => typeFilter === "all" || project.project_type_id === typeFilter);
  const usedTypes = projectTypes.filter((type) => projects.some((project) => project.project_type_id === type.id));
  const references = workspaces.flatMap((item) => item.workspace.references.map((reference) => ({ projectId: item.project.id, projectName: item.project.name, reference })));
  const directories = references.filter((item) => item.reference.kind === "directory");
  const links = references.filter((item) => item.reference.kind !== "directory");
  const projectName = (id: string | null) => projects.find((project) => project.id === id)?.name;
  const normalized = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visibleContexts = contexts.filter((context) => normalized(`${context.title} ${context.content}`).includes(normalized(contextQuery)));
  const active = projects.filter((project) => project.status !== "concluido" && project.status !== "arquivado").length;
  const initials = client.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  const ReferenceRow = ({ item }: { item: { projectId: string; projectName: string; reference: WorkspaceReference } }) => {
    const url = browserAccessibleUrl(item.reference.target);
    return (
      <li className="rj-client-ref">
        <WorkspaceProviderBadge kind={item.reference.kind} target={item.reference.target} />
        <span className="rj-client-ref-text"><strong>{item.reference.title}</strong><small title={item.reference.target}>{displayDirectoryPath(item.reference.target)}</small></span>
        <button className="rj-link-button" type="button" onClick={() => onOpenProject(item.projectId)} title="Abrir projeto">{item.projectName}</button>
        <span className="rj-link-actions">
          {url && <a className="icon-button" href={url} target="_blank" rel="noreferrer" title="Abrir"><ExternalLink size={14} /></a>}
          <button className="icon-button" type="button" title="Copiar" onClick={() => void copyText(item.reference.target, url ? "Link" : "Caminho")}><Copy size={14} /></button>
        </span>
      </li>
    );
  };

  return (
    <div className="rj-client-page">
      <button className="rj-back" type="button" onClick={onBack}><ArrowLeft size={16} /> Voltar</button>
      <header className="rj-client-hero">
        <span className="rj-client-logo">{client.logo_url && !logoFailed ? <img src={client.logo_url} alt="" onError={() => setLogoFailed(true)} /> : <strong>{initials}</strong>}</span>
        <div className="rj-client-identity">
          <div className="rj-client-name"><h1>{client.name}</h1>{client.client_kind && <span className={`client-kind-badge ${client.client_kind.toLowerCase()}`}>{client.client_kind}</span>}{!client.is_active && <span className="rj-badge">inativo</span>}</div>
          {client.company && client.company !== client.name && <p>{client.company}</p>}
          <div className="rj-client-stats">
            <span><strong>{projects.length}</strong> projeto(s)</span>
            <span><strong>{active}</strong> em andamento</span>
            <span><strong>{contexts.length}</strong> contexto(s)</span>
            <span><strong>{directories.length}</strong> pasta(s)</span>
            <span><strong>{links.length}</strong> link(s)</span>
          </div>
        </div>
        <div className="rj-client-actions">
          <button className="secondary-button" type="button" onClick={() => onEdit(client.id)}><Pencil size={15} /> Editar cadastro</button>
          <button className="secondary-button" type="button" onClick={() => onOpenJourney(client.id)}><Route size={15} /> Jornada do cliente</button>
        </div>
      </header>
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="rj-client-grid">
        <section className="rj-card">
          <header className="rj-section-head"><FolderOpen size={17} /><h3>Projetos</h3><span className="rj-muted">{visibleProjects.length}</span></header>
          {usedTypes.length > 1 && <div className="rj-chip-row is-small"><button type="button" className={typeFilter === "all" ? "is-active" : ""} onClick={() => setTypeFilter("all")}>Todos</button>{usedTypes.map((type) => <button key={type.id} type="button" className={typeFilter === type.id ? "is-active" : ""} onClick={() => setTypeFilter(type.id)}>{type.name}</button>)}</div>}
          {visibleProjects.length ? (
            <ul className="rj-client-projects">
              {visibleProjects.map((project) => (
                <li key={project.id}>
                  <button type="button" onClick={() => onOpenProject(project.id)}>
                    <span className="rj-client-project-name"><strong>{project.name}</strong><small>{typeName(project.project_type_id)}</small></span>
                    <span className={`rj-status-dot ${project.status === "concluido" ? "is-done" : "is-open"}`}>{project.status === "concluido" ? <><CheckCircle2 size={13} /> Concluído {shortDate(project.completed_at)}</> : "Em andamento"}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="rj-muted">Nenhum projeto.</p>}
        </section>

        <section className="rj-card">
          <header className="rj-section-head"><Layers3 size={17} /><h3>Contextos</h3><span className="rj-muted">{contexts.length}</span></header>
          {contexts.length > 4 && <label className="rj-search-box"><Search size={15} /><input value={contextQuery} onChange={(event) => setContextQuery(event.target.value)} placeholder="Buscar nos contextos" /></label>}
          {loading ? <p className="rj-muted"><Loader2 className="spin" size={15} /> Carregando…</p> : visibleContexts.length ? (
            <div className="rj-client-contexts">
              {visibleContexts.map((context) => (
                <article key={context.id} className="rj-client-context" title="Clique para copiar" onClick={() => void copyText(context.content, "Contexto")}>
                  <strong>{context.title}</strong>
                  <p>{context.content}</p>
                  <small>{[shortDate(context.created_at ?? context.updated_at), projectName(context.origin_project_id)].filter(Boolean).join(" · ")}</small>
                </article>
              ))}
            </div>
          ) : <p className="rj-muted">Nenhum contexto cadastrado para este cliente.</p>}
        </section>
      </div>

      <section className="rj-card">
        <header className="rj-section-head"><Link2 size={17} /><h3>Pastas e links dos projetos</h3><span className="rj-muted">{references.length}</span></header>
        {loading ? <p className="rj-muted"><Loader2 className="spin" size={15} /> Carregando…</p> : (
          <div className="rj-client-refs">
            <div><span className="rj-group-label">Pastas do servidor</span>{directories.length ? <ul>{directories.map((item) => <ReferenceRow key={`${item.projectId}:${item.reference.id}`} item={item} />)}</ul> : <p className="rj-muted">Nenhuma pasta registrada.</p>}</div>
            <div><span className="rj-group-label">Links</span>{links.length ? <ul>{links.map((item) => <ReferenceRow key={`${item.projectId}:${item.reference.id}`} item={item} />)}</ul> : <p className="rj-muted">Nenhum link registrado.</p>}</div>
          </div>
        )}
      </section>
    </div>
  );
}
