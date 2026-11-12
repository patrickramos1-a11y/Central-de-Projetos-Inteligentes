import { useEffect, useRef, useState } from "react";
import { Archive, Check, Loader2, Plus, Search, X } from "lucide-react";

type ClientContext = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  status: "active" | "archived";
  version: number;
  origin_type: "client" | "project";
  origin_project_id: string | null;
  created_at: string;
  updated_at: string;
};
type Reconciliation = { candidates: Array<{ projectName: string; title: string; content: string; origin: "canonical" | "legacy"; possibleDuplicates: string[] }>; ambiguousCount: number };

async function contextApi<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json() as { data?: { data?: T } | T; error?: string };
  const data = body.data && typeof body.data === "object" && "data" in body.data ? body.data.data : body.data as T | undefined;
  if (!response.ok || data === undefined) throw new Error(body.error ?? "Falha ao carregar contextos.");
  return data;
}

export function ClientContextLibrary({ baseUrl, clientId, clientName, onClose }: { baseUrl: string; clientId: string; clientName: string; onClose: () => void }) {
  const [items, setItems] = useState<ClientContext[]>([]);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<ClientContext | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const version = useRef(0);

  useEffect(() => {
    const request = ++version.current;
    const timer = window.setTimeout(() => {
      setLoading(true); setError("");
      void contextApi<ClientContext[]>(baseUrl, `/clients/${encodeURIComponent(clientId)}/contexts?archived=${showArchived ? 1 : 0}&q=${encodeURIComponent(search)}&offset=${offset}`)
      .then((result) => { if (request === version.current) { setItems((current) => offset ? [...current, ...result.filter((item) => !current.some((existing) => existing.id === item.id))] : result); setHasMore(result.length === 100); } })
      .catch((failure) => { if (request === version.current) setError(failure instanceof Error ? failure.message : "Falha ao carregar biblioteca."); })
      .finally(() => { if (request === version.current) setLoading(false); });
    }, search ? 180 : 0);
    return () => { window.clearTimeout(timer); version.current += 1; };
  }, [baseUrl, clientId, showArchived, search, offset, refreshKey]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") { setOffset(0); setRefreshKey((current) => current + 1); } };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  function begin(item: ClientContext | "new") {
    setEditing(item); setTitle(item === "new" ? "" : item.title); setContent(item === "new" ? "" : item.content); setCategory(item === "new" ? "" : item.category ?? ""); setError("");
  }

  async function save() {
    if (!title.trim() || !content.trim()) { setError("Informe título e conteúdo."); return; }
    setBusy(true); setError("");
    try {
      const isNew = editing === "new";
      const item = await contextApi<ClientContext>(baseUrl, `/clients/${encodeURIComponent(clientId)}/contexts${isNew ? "" : `/${encodeURIComponent((editing as ClientContext).id)}`}`, {
        method: isNew ? "POST" : "PATCH",
        body: JSON.stringify({ title: title.trim(), content: content.trim(), category: category.trim() || null, ...(isNew ? {} : { expectedVersion: (editing as ClientContext).version }) }),
      });
      setItems((current) => [item, ...current.filter((candidate) => candidate.id !== item.id)]); setEditing(null); setOffset(0); setRefreshKey((current) => current + 1);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao salvar contexto."); }
    finally { setBusy(false); }
  }

  async function archive(item: ClientContext) {
    if (!window.confirm(`Arquivar ${item.title}? Os usos existentes permanecem intactos.`)) return;
    setBusy(true); setError("");
    try {
      const next = await contextApi<ClientContext>(baseUrl, `/clients/${encodeURIComponent(clientId)}/contexts/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify({ status: "archived", expectedVersion: item.version }) });
      setItems((current) => showArchived ? current.map((candidate) => candidate.id === next.id ? next : candidate) : current.filter((candidate) => candidate.id !== next.id)); setOffset(0); setRefreshKey((current) => current + 1);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao arquivar contexto."); }
    finally { setBusy(false); }
  }

  async function reviewLegacy() {
    setBusy(true); setError("");
    try { setReconciliation(await contextApi<Reconciliation>(baseUrl, `/clients/${encodeURIComponent(clientId)}/contexts/reconciliation`)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao revisar contextos antigos."); }
    finally { setBusy(false); }
  }

  const visible = items;
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="client-context-library glass-panel" role="dialog" aria-modal="true" aria-label={`Contextos de ${clientName}`} onMouseDown={(event) => event.stopPropagation()}>
    <header className="modal-heading"><div><span className="eyebrow">Cliente</span><h2>Contextos de {clientName}</h2></div><button className="icon-button" type="button" title="Fechar" onClick={onClose}><X size={18} /></button></header>
    <div className="client-context-toolbar"><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0); }} placeholder="Buscar contexto ou categoria" /></label><label className="checkline"><input type="checkbox" checked={showArchived} onChange={(event) => { setShowArchived(event.target.checked); setOffset(0); }} /> Mostrar arquivados</label><button className="secondary-button" type="button" disabled={busy} onClick={() => void reviewLegacy()}>Revisar antigos</button><button className="primary-button" type="button" onClick={() => begin("new")}><Plus size={16} /> Novo contexto</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {reconciliation && <section className="client-context-reconciliation"><div><strong>{reconciliation.candidates.length} contexto(s) ainda locais</strong><span>{reconciliation.ambiguousCount} possivel(is) duplicata(s). Nenhum texto foi unido automaticamente.</span><button className="icon-button" type="button" title="Fechar revisao" onClick={() => setReconciliation(null)}><X size={15} /></button></div>{reconciliation.candidates.map((candidate, index) => <article key={`${candidate.projectName}-${candidate.title}-${index}`}><strong>{candidate.title}</strong><small>{candidate.projectName} · {candidate.origin === "legacy" ? "Registro legado" : "Bloco da jornada"}{candidate.possibleDuplicates.length ? " · Revisar título semelhante na biblioteca" : ""}</small><p>{candidate.content}</p></article>)}</section>}
    {editing && <div className="client-context-form"><label className="field"><span>Título</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field"><span>Categoria</span><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Ex.: dados tecnicos" /></label><label className="field"><span>Conteúdo</span><textarea rows={6} value={content} onChange={(event) => setContent(event.target.value)} /></label><div className="inline-actions"><button className="secondary-button" type="button" onClick={() => setEditing(null)}>Cancelar</button><button className="primary-button" type="button" disabled={busy} onClick={() => void save()}>{busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />} Salvar</button></div></div>}
    <div className="client-context-list">{loading && <p role="status"><Loader2 className="spin" size={17} /> Carregando contextos...</p>}{visible.map((item) => <article key={item.id} className="client-context-item"><div><strong>{item.title}</strong><span>{item.category || "Sem categoria"} · v{item.version} · {item.origin_type === "project" ? "Projeto" : "Cliente"}{item.status === "archived" ? " · Arquivado" : ""}</span></div><p>{item.content}</p><small>Atualizado em {new Date(item.updated_at).toLocaleDateString("pt-BR")}</small><div className="inline-actions"><button className="secondary-button" type="button" onClick={() => begin(item)}>Editar</button>{item.status === "active" && <button className="icon-button" type="button" title="Arquivar contexto" disabled={busy} onClick={() => void archive(item)}><Archive size={16} /></button>}</div></article>)}{!loading && !visible.length && !error && <p className="empty-state compact">Nenhum contexto para os filtros atuais.</p>}{hasMore && <button className="secondary-button" type="button" disabled={loading} onClick={() => setOffset((current) => current + 100)}>Carregar mais</button>}</div>
  </section></div>;
}
