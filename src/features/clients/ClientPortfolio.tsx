import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, ChevronDown, ChevronRight, Copy, ExternalLink, Filter, FolderOpen, Layers3, Loader2, Pencil, Search, UserRound } from "lucide-react";
import { copyText } from "../../components/ui/clipboard";
import type { WorkspaceOverview, WorkspaceReference } from "../workspace/workspaceModel";
import { browserAccessibleUrl, workspaceProvider, type ProjectWorkspace } from "../workspace/workspaceModel";
import { WorkspaceProviderBadge } from "../workspace/WorkspaceProviderBadge";
import { buildClientPortfolioRows, filterClientPortfolioRows, sortClientPortfolioRows, type ClientPortfolioSortColumn, type ClientPortfolioSortDirection } from "./clientPortfolioModel";

type PortfolioClient = {
  id: string; name: string; company: string | null; logo_url: string | null; client_kind: "AC" | "AV" | null; is_active: boolean;
  responsible: string | null; responsible_user_id: string | null; status: string; created_at: string; updated_at: string;
};
type PortfolioProject = { id: string; name: string; company: string | null; client_id: string | null; status: string };
type PortfolioUser = { id: string; name: string };
type PortfolioContext = {
  id: string; title: string; content: string; category: string | null; version: number; origin_type: "client" | "project";
  origin_project_id: string | null; updated_at: string;
};
type ClientWorkspace = { project: { id: string; name: string; status: string; linkType: "explicit" | "legacy" }; workspace: ProjectWorkspace };
type LoadedDetails = { contexts: PortfolioContext[]; workspaces: ClientWorkspace[]; contextError: string; workspaceError: string };

function unwrapData<T>(body: unknown): T {
  let value = body as { data?: unknown } | unknown;
  while (value && typeof value === "object" && "data" in value) value = (value as { data: unknown }).data;
  return value as T;
}

function ClientMark({ client }: { client: PortfolioClient }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [client.logo_url]);
  const initials = client.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CL";
  return <span className="client-logo small" aria-hidden="true">{client.logo_url && !failed ? <img src={client.logo_url} alt="" onError={() => setFailed(true)} /> : <strong>{initials}</strong>}</span>;
}

function CountFilter({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <label className="client-column-number-filter"><span>Minimo</span><input type="number" min="0" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} /></label>;
}

function ColumnHeader({ label, column, activeColumn, direction, onSort, children }: {
  label: string; column: ClientPortfolioSortColumn; activeColumn: ClientPortfolioSortColumn; direction: ClientPortfolioSortDirection;
  onSort: (column: ClientPortfolioSortColumn) => void; children?: React.ReactNode;
}) {
  return <div className="client-column-control">
    <button type="button" className="client-column-sort" onClick={() => onSort(column)} title={`Ordenar por ${label}`} aria-label={`Ordenar por ${label}`}>
      <span>{label}</span><ArrowUpDown size={13} className={activeColumn === column ? direction : ""} />
    </button>
    {children && <details className="client-column-filter"><summary title={`Filtrar ${label}`} aria-label={`Filtrar ${label}`}><Filter size={13} /></summary><div>{children}</div></details>}
  </div>;
}

function DetailActions({ target, projectId, onOpenProject }: { target: string; projectId?: string | null; onOpenProject: (id: string) => void }) {
  const url = browserAccessibleUrl(target);
  return <span className="client-detail-actions">
    <button className="icon-button" type="button" title="Copiar" aria-label="Copiar" onClick={() => void copyText(target)}><Copy size={15} /></button>
    {url && <a className="icon-button" href={url} target="_blank" rel="noopener noreferrer" title="Abrir link" aria-label="Abrir link"><ExternalLink size={15} /></a>}
    {projectId && <button className="icon-button" type="button" title="Ir para o projeto" aria-label="Ir para o projeto" onClick={() => onOpenProject(projectId)}><FolderOpen size={15} /></button>}
  </span>;
}

function ReferenceTable({ title, items, empty, onOpenProject }: {
  title: string;
  items: Array<{ id: string; projectId: string; projectName: string; reference: WorkspaceReference }>;
  empty: string;
  onOpenProject: (id: string) => void;
}) {
  return <section className="client-detail-section">
    <header><strong>{title}</strong><span>{items.length}</span></header>
    {items.length ? <div className="client-detail-table">{items.map(({ id, projectId, projectName, reference }) => <div className="client-detail-row" data-provider={workspaceProvider(reference.kind, reference.target)} key={id}>
      <WorkspaceProviderBadge kind={reference.kind} target={reference.target} />
      <span><strong>{reference.title}</strong><small>{projectName}</small></span>
      <span className="client-detail-target" title={reference.target}>{reference.target}</span>
      <DetailActions target={reference.target} projectId={projectId} onOpenProject={onOpenProject} />
    </div>)}</div> : <p>{empty}</p>}
  </section>;
}

function ClientExpansion({ client, details, loading, onOpenClient, onOpenProject, onOpenContexts, onOpenWorkspaces }: {
  client: PortfolioClient; details?: LoadedDetails; loading: boolean; onOpenClient: (id: string) => void;
  onOpenProject: (id: string) => void; onOpenContexts: (id: string) => void; onOpenWorkspaces: (id: string) => void;
}) {
  const projects = new Map((details?.workspaces ?? []).map((item) => [item.project.id, item.project.name]));
  const flattened = (details?.workspaces ?? []).flatMap((item) => item.workspace.references.map((reference) => ({ id: `${item.project.id}:${reference.id}`, projectId: item.project.id, projectName: item.project.name, reference })));
  const directories = flattened.filter((item) => item.reference.kind === "directory");
  const links = flattened.filter((item) => item.reference.kind !== "directory");
  return <div className="client-portfolio-expansion">
    <div className="client-expansion-toolbar">
      <span>Informacoes consolidadas de {client.name}</span>
      <div><button className="secondary-button" type="button" onClick={() => onOpenContexts(client.id)}><Layers3 size={15} /> Gerenciar contextos</button><button className="secondary-button" type="button" onClick={() => onOpenWorkspaces(client.id)}><FolderOpen size={15} /> Ver locais completos</button><button className="secondary-button" type="button" onClick={() => onOpenClient(client.id)}><UserRound size={15} /> Abrir cliente</button></div>
    </div>
    {loading && <p className="client-detail-loading" role="status"><Loader2 className="spin" size={17} /> Carregando detalhes...</p>}
    {details && <div className="client-expansion-grid">
      <section className="client-detail-section contexts">
        <header><strong>Contextos</strong><span>{details.contexts.length}</span></header>
        {details.contextError && <p className="client-detail-error" role="alert">{details.contextError}</p>}
        {details.contexts.length ? <div className="client-detail-table">{details.contexts.map((context) => <div className="client-detail-row context" key={context.id}>
          <Layers3 size={16} />
          <span><strong>{context.title}</strong><small>{context.category || "Sem categoria"} · v{context.version}</small></span>
          <span className="client-detail-target" title={context.content}>{context.content}</span>
          <DetailActions target={context.content} projectId={context.origin_project_id && projects.has(context.origin_project_id) ? context.origin_project_id : null} onOpenProject={onOpenProject} />
        </div>)}</div> : !details.contextError && <p>Nenhum contexto ativo vinculado.</p>}
      </section>
      {details.workspaceError && <p className="client-detail-error" role="alert">{details.workspaceError}</p>}
      <ReferenceTable title="Diretórios e locais" items={directories} empty="Nenhum diretorio de servidor cadastrado." onOpenProject={onOpenProject} />
      <ReferenceTable title="Links vinculados" items={links} empty="Nenhum link de conversa ou apoio cadastrado." onOpenProject={onOpenProject} />
    </div>}
  </div>;
}

export function ClientPortfolio({
  baseUrl, clients, projects, users, workspaces, contextCounts, query, setQuery, onOpenClient, onOpenProject, onEditClient, onActivateClient, onOpenContexts, onOpenWorkspaces,
}: {
  baseUrl: string; clients: PortfolioClient[]; projects: PortfolioProject[]; users: PortfolioUser[]; workspaces: WorkspaceOverview[];
  contextCounts: Array<{ clientId: string; count: number }>; query: string; setQuery: (value: string) => void;
  onOpenClient: (id: string) => void; onOpenProject: (id: string) => void; onEditClient: (id: string) => void;
  onActivateClient: (id: string) => void; onOpenContexts: (id: string) => void; onOpenWorkspaces: (id: string) => void;
}) {
  const [kind, setKind] = useState<"all" | "AC" | "AV">("all");
  const [showInactive, setShowInactive] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, LoadedDetails>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const requestVersion = useRef<Record<string, number>>({});
  const [sortColumn, setSortColumn] = useState<ClientPortfolioSortColumn>("name");
  const [sortDirection, setSortDirection] = useState<ClientPortfolioSortDirection>("asc");
  const [responsible, setResponsible] = useState("all");
  const [status, setStatus] = useState("all");
  const [minimumProjects, setMinimumProjects] = useState(0);
  const [minimumContexts, setMinimumContexts] = useState(0);
  const [minimumDirectories, setMinimumDirectories] = useState(0);
  const [minimumLinks, setMinimumLinks] = useState(0);

  const rows = useMemo(() => buildClientPortfolioRows({ clients, projects, users, workspaces, contextCounts }), [clients, projects, users, workspaces, contextCounts]);
  const visible = useMemo(() => sortClientPortfolioRows(filterClientPortfolioRows(rows, { query, kind, responsible, status, showInactive, minimumProjects, minimumContexts, minimumDirectories, minimumLinks }), sortColumn, sortDirection), [rows, query, kind, responsible, status, showInactive, minimumProjects, minimumContexts, minimumDirectories, minimumLinks, sortColumn, sortDirection]);
  const responsibleOptions = [...new Set(rows.map((row) => row.responsibleName))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const statusOptions = [...new Set(rows.map((row) => row.status))].sort();

  function sort(column: ClientPortfolioSortColumn) {
    if (column === sortColumn) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSortColumn(column); setSortDirection("asc"); }
  }

  async function loadDetails(clientId: string) {
    const version = (requestVersion.current[clientId] ?? 0) + 1;
    requestVersion.current[clientId] = version;
    setLoading((current) => new Set(current).add(clientId));
    const [contextsResult, workspacesResult] = await Promise.allSettled([
      fetch(`${baseUrl}/api/clients/${encodeURIComponent(clientId)}/contexts?offset=0`, { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error((body as { error?: string }).error || "Falha ao carregar contextos."); return unwrapData<PortfolioContext[]>(body); }),
      fetch(`${baseUrl}/api/clients/${encodeURIComponent(clientId)}/workspaces`, { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error((body as { error?: string }).error || "Falha ao carregar locais."); return unwrapData<ClientWorkspace[]>(body); }),
    ]);
    if (requestVersion.current[clientId] !== version) return;
    setDetails((current) => ({ ...current, [clientId]: {
      contexts: contextsResult.status === "fulfilled" ? contextsResult.value : current[clientId]?.contexts ?? [],
      workspaces: workspacesResult.status === "fulfilled" ? workspacesResult.value : current[clientId]?.workspaces ?? [],
      contextError: contextsResult.status === "rejected" ? (contextsResult.reason instanceof Error ? contextsResult.reason.message : "Falha ao carregar contextos.") : "",
      workspaceError: workspacesResult.status === "rejected" ? (workspacesResult.reason instanceof Error ? workspacesResult.reason.message : "Falha ao carregar locais.") : "",
    } }));
    setLoading((current) => { const next = new Set(current); next.delete(clientId); return next; });
  }

  function toggle(clientId: string) {
    const isOpening = !expanded.has(clientId);
    setExpanded((current) => { const next = new Set(current); next.has(clientId) ? next.delete(clientId) : next.add(clientId); return next; });
    if (isOpening && !details[clientId] && !loading.has(clientId)) void loadDetails(clientId);
  }

  return <section className="client-portfolio">
    <div className="client-portfolio-toolbar">
      <div className="client-kind-tabs" role="tablist" aria-label="Categoria de clientes">
        {(["all", "AC", "AV"] as const).map((value) => <button type="button" role="tab" aria-selected={kind === value} className={kind === value ? "active" : ""} key={value} onClick={() => setKind(value)}>{value === "all" ? "Todos" : value}</button>)}
      </div>
      <label className="search-field clients-search-field"><Search size={17} /><input aria-label="Buscar clientes pelo nome, empresa, categoria ou responsavel" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, empresa, categoria ou responsavel" /></label>
      <button className="secondary-button client-inactive-toggle" type="button" aria-pressed={showInactive} onClick={() => setShowInactive((value) => !value)}>{showInactive ? "Ocultar inativos" : "Ver inativos"}</button>
      <span className="client-result-count">{visible.length} de {rows.length}</span>
    </div>

    <div className="client-portfolio-table" role="table" aria-label="Carteira de clientes">
      <div className="client-portfolio-head" role="row">
        <ColumnHeader label="Cliente" column="name" activeColumn={sortColumn} direction={sortDirection} onSort={sort}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar nome" /></ColumnHeader>
        <ColumnHeader label="Tipo" column="kind" activeColumn={sortColumn} direction={sortDirection} onSort={sort}><select value={kind} onChange={(event) => setKind(event.target.value as "all" | "AC" | "AV")}><option value="all">Todos</option><option value="AC">AC</option><option value="AV">AV</option></select></ColumnHeader>
        <ColumnHeader label="Responsável" column="responsible" activeColumn={sortColumn} direction={sortDirection} onSort={sort}><select value={responsible} onChange={(event) => setResponsible(event.target.value)}><option value="all">Todos</option>{responsibleOptions.map((item) => <option key={item}>{item}</option>)}</select></ColumnHeader>
        <ColumnHeader label="Projetos" column="projects" activeColumn={sortColumn} direction={sortDirection} onSort={sort}><CountFilter value={minimumProjects} onChange={setMinimumProjects} /></ColumnHeader>
        <ColumnHeader label="Contextos" column="contexts" activeColumn={sortColumn} direction={sortDirection} onSort={sort}><CountFilter value={minimumContexts} onChange={setMinimumContexts} /></ColumnHeader>
        <ColumnHeader label="Locais" column="directories" activeColumn={sortColumn} direction={sortDirection} onSort={sort}><CountFilter value={minimumDirectories} onChange={setMinimumDirectories} /></ColumnHeader>
        <ColumnHeader label="Links" column="links" activeColumn={sortColumn} direction={sortDirection} onSort={sort}><CountFilter value={minimumLinks} onChange={setMinimumLinks} /></ColumnHeader>
        <ColumnHeader label="Status" column="status" activeColumn={sortColumn} direction={sortDirection} onSort={sort}><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option>{statusOptions.map((item) => <option value={item} key={item}>{item.replace(/_/g, " ")}</option>)}</select></ColumnHeader>
        <span>Ações</span>
      </div>
      <div className="client-portfolio-body">{visible.map((row) => {
        const client = clients.find((item) => item.id === row.id)!;
        const isExpanded = expanded.has(row.id);
        return <div className={`client-portfolio-entry ${isExpanded ? "expanded" : ""}`} key={row.id}>
          <div className="client-portfolio-row" role="row">
            <button className="client-primary-cell" type="button" onClick={() => toggle(row.id)} aria-expanded={isExpanded}><span className="client-expand-icon">{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span><ClientMark client={client} /><span><strong>{row.name}</strong><small>{row.company}</small></span></button>
            <span data-label="Tipo">{row.kind ? <span className={`client-kind-badge ${row.kind.toLowerCase()}`}>{row.kind}</span> : <small>Não definido</small>}</span>
            <span data-label="Responsável" className="client-responsible"><UserRound size={14} /> {row.responsibleName}</span>
            <strong data-label="Projetos" className="client-count projects">{row.projectCount}</strong>
            <strong data-label="Contextos" className="client-count contexts">{row.contextCount}</strong>
            <strong data-label="Locais" className="client-count directories">{row.directoryCount}</strong>
            <strong data-label="Links" className="client-count links">{row.linkCount}</strong>
            <span data-label="Status"><span className={`client-status-chip ${row.isActive ? "active" : "inactive"}`}>{row.isActive ? row.status.replace(/_/g, " ") : "Inativo"}</span></span>
            <span className="client-row-actions"><button className="icon-button" type="button" title="Editar cadastro" aria-label={`Editar ${row.name}`} onClick={() => onEditClient(row.id)}><Pencil size={15} /></button>{!row.isActive && <button className="icon-button activate" type="button" title="Ativar cliente" aria-label={`Ativar ${row.name}`} onClick={() => onActivateClient(row.id)}><UserRound size={15} /></button>}</span>
          </div>
          {isExpanded && <ClientExpansion client={client} details={details[row.id]} loading={loading.has(row.id)} onOpenClient={onOpenClient} onOpenProject={onOpenProject} onOpenContexts={onOpenContexts} onOpenWorkspaces={onOpenWorkspaces} />}
        </div>;
      })}</div>
    </div>
    {!visible.length && <div className="empty-state"><UserRound size={32} /><strong>Nenhum cliente encontrado</strong><span>Ajuste as abas, filtros ou a busca.</span></div>}
  </section>;
}
