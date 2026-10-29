import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, CheckCircle2, ChevronDown, ClipboardCheck, Copy, ExternalLink, Layers3, Link2, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { copyText } from "../../components/ui/clipboard";
import { buildJourneyLink } from "../projects/journeyLink";
import { browserAccessibleUrl, contextTitleFromContent, serverDirectoryPath, workspaceMissing, workspaceProvider, workspaceStatusLabel, type ProjectWorkspace, type WorkspaceKind, type WorkspaceOverview, type WorkspaceReference } from "./workspaceModel";
import { WorkspaceProviderBadge } from "./WorkspaceProviderBadge";

type Draft = { id: string; kind: WorkspaceKind; title: string; target: string; notes: string };
const emptyDraft = (kind: WorkspaceKind): Draft => ({ id: crypto.randomUUID(), kind, title: "", target: "", notes: "" });
const kindLabels: Record<WorkspaceKind, string> = { directory: "Diretorios do servidor", conversation: "Conversas", support: "Links de apoio" };

async function getWorkspace(baseUrl: string, projectId: string): Promise<ProjectWorkspace> {
  const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/workspace`, { cache: "no-store" });
  const body = await response.json() as { data?: ProjectWorkspace; error?: string };
  if (!response.ok || !body.data) throw new Error(body.error || "Nao foi possivel carregar o local de trabalho.");
  return body.data;
}

type ContextPrompt = { id: string; name: string; content: string };

export function ProjectWorkspacePanel({ baseUrl, projectId, contextPrompts, onChanged, onOpenStep }: { baseUrl: string; projectId: string; contextPrompts: ContextPrompt[]; onChanged: (overview: WorkspaceOverview) => void; onOpenStep: (stepId: string) => void }) {
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistAdding, setChecklistAdding] = useState(false);
  const [contextsOpen, setContextsOpen] = useState(false);
  const [checklistLabel, setChecklistLabel] = useState("");
  const [contextDraft, setContextDraft] = useState({ title: "", content: "" });
  const [contextTitleEdited, setContextTitleEdited] = useState(false);
  const sequence = useRef(0);
  const lastRefresh = useRef(0);

  const refresh = useCallback(async (quiet = false) => {
    const requestId = ++sequence.current;
    if (!quiet) setLoading(true);
    try {
      const next = await getWorkspace(baseUrl, projectId);
      if (requestId !== sequence.current) return;
      setWorkspace((current) => current && current.revision > next.revision ? current : next);
      onChanged(next);
      setError("");
    } catch (cause) {
      if (requestId === sequence.current) setError(cause instanceof Error ? cause.message : "Falha ao atualizar.");
    } finally {
      if (requestId === sequence.current) setLoading(false);
    }
  }, [baseUrl, projectId, onChanged]);

  useEffect(() => {
    setWorkspace(null);
    setDraft(null);
    setChecklistOpen(false);
    setChecklistAdding(false);
    setChecklistLabel("");
    setContextsOpen(false);
    setContextDraft({ title: "", content: "" });
    setContextTitleEdited(false);
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const revalidate = (event: Event) => {
      if (document.visibilityState !== "visible" || (event.type !== "online" && Date.now() - lastRefresh.current < 1000)) return;
      lastRefresh.current = Date.now();
      void refresh(true);
    };
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("focus", revalidate);
    window.addEventListener("online", revalidate);
    return () => { document.removeEventListener("visibilitychange", revalidate); window.removeEventListener("focus", revalidate); window.removeEventListener("online", revalidate); };
  }, [refresh]);

  async function save(references: WorkspaceReference[], conversationNotApplicable: boolean, after?: () => void) {
    if (!workspace || saving) return;
    const requestId = ++sequence.current;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/workspace`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: workspace.revision, conversationNotApplicable, references }),
      });
      const body = await response.json() as { data?: ProjectWorkspace; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error || "Nao foi possivel salvar.");
      if (requestId !== sequence.current) return;
      setWorkspace(body.data);
      onChanged(body.data);
      after?.();
    } catch (cause) {
      if (requestId === sequence.current) setError(cause instanceof Error ? cause.message : "Falha ao salvar. Os ultimos dados validos foram mantidos.");
    } finally {
      if (requestId === sequence.current) setSaving(false);
    }
  }

  function saveDraft() {
    if (!workspace || !draft) return;
    const title = draft.title.trim();
    const target = draft.target.trim();
    if (!title || !target) { setError("Informe nome e caminho ou endereco."); return; }
    if (draft.kind === "directory" && !serverDirectoryPath(target)) { setError("Informe um caminho de diretorio do servidor, como \\\\Servidor\\Projetos\\..."); return; }
    if (draft.kind !== "directory" && !browserAccessibleUrl(target)) { setError("Use um link http ou https valido."); return; }
    const old = workspace.manualReferences.find((ref) => ref.id === draft.id);
    const next: WorkspaceReference = {
      id: draft.id, project_id: projectId, kind: draft.kind, title, target, notes: draft.notes.trim() || null,
      sort_order: old?.sort_order ?? workspace.manualReferences.length,
      created_at: old?.created_at ?? "", updated_at: old?.updated_at ?? "",
    };
    save(old ? workspace.manualReferences.map((ref) => ref.id === old.id ? next : ref) : [...workspace.manualReferences, next], workspace.conversationNotApplicable, () => setDraft(null));
  }

  function deleteReference(ref: WorkspaceReference) {
    if (!workspace || !window.confirm(`Excluir "${ref.title}" deste projeto?`)) return;
    void save(workspace.manualReferences.filter((item) => item.id !== ref.id), workspace.conversationNotApplicable);
  }

  function moveReference(ref: WorkspaceReference, direction: number) {
    if (!workspace) return;
    const next = [...workspace.manualReferences];
    const index = next.findIndex((item) => item.id === ref.id);
    const target = index + direction;
    if (target < 0 || target >= next.length || next[target].kind !== ref.kind) return;
    [next[index], next[target]] = [next[target], next[index]];
    void save(next, workspace.conversationNotApplicable);
  }

  async function mutateWorkspace(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
    if (saving) return false;
    const requestId = ++sequence.current;
    setSaving(true); setError("");
    try {
      const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/workspace/${path}`, {
        method, headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await response.json() as { data?: ProjectWorkspace; error?: string };
      if (!response.ok || !result.data) throw new Error(result.error || "Nao foi possivel salvar.");
      if (requestId !== sequence.current) return;
      setWorkspace(result.data); onChanged(result.data);
      return true;
    } catch (cause) {
      if (requestId === sequence.current) setError(cause instanceof Error ? cause.message : "Falha ao salvar. Os ultimos dados validos foram mantidos.");
    } finally { if (requestId === sequence.current) setSaving(false); }
    return false;
  }

  async function addChecklistItem() {
    const label = checklistLabel.trim();
    if (!label) return;
    if (await mutateWorkspace("checklist", "POST", { label })) {
      setChecklistLabel("");
      setChecklistAdding(false);
    }
    setChecklistOpen(true);
  }

  async function addContext() {
    if (!contextDraft.title.trim() || !contextDraft.content.trim()) { setError("Informe titulo e conteudo do contexto."); return; }
    if (await mutateWorkspace("contexts", "POST", { ...contextDraft, category: null })) {
      setContextDraft({ title: "", content: "" });
      setContextTitleEdited(false);
    }
    setContextsOpen(true);
  }

  if (!workspace) return <section className="workspace-stage-body"><p>{loading ? "Carregando local de trabalho..." : error || "Local de trabalho indisponivel."}</p><button className="secondary-button" type="button" onClick={() => void refresh()}><RefreshCw size={16} /> Tentar novamente</button></section>;

  const missing = workspaceMissing(workspace);
  return <section className="workspace-stage-body" aria-label="Local de trabalho do projeto">
    <div className="workspace-stage-intro">
      <div><h2>Local de trabalho</h2><p>Registre onde estao os materiais e as conversas deste projeto.</p>{workspace.guidance && <p className="workspace-template-guidance">{workspace.guidance}</p>}</div>
      <div className="workspace-stage-actions"><button className="secondary-button" type="button" onClick={() => void copyText(buildJourneyLink(projectId), "Link da jornada")}><Link2 size={15} /> Compartilhar</button><span className={`workspace-state ${workspace.status}`}>{workspaceStatusLabel(workspace.status)}</span></div>
    </div>
    {missing.length > 0 && <p className="workspace-missing">Falta {missing.join(" e ")}.</p>}
    {workspace.status === "organizado" && <p className="workspace-done"><CheckCircle2 size={17} /> Referencias essenciais organizadas.</p>}
    {error && <p className="workspace-error" role="alert">{error} <button type="button" onClick={() => void refresh(true)}>Atualizar dados</button></p>}
    {(["directory", "conversation", "support"] as WorkspaceKind[]).map((kind) => {
      const refs = workspace.references.filter((ref) => ref.kind === kind);
      return <section className="workspace-reference-section" key={kind} aria-label={kindLabels[kind]}>
        <header><h3>{kindLabels[kind]}</h3><div className="workspace-header-actions">
          {kind === "conversation" && refs.length === 0 && <button className="secondary-button workspace-na-button" type="button" aria-pressed={workspace.conversationNotApplicable} disabled={saving} onClick={() => void save(workspace.manualReferences, !workspace.conversationNotApplicable, () => setDraft(null))}>{workspace.conversationNotApplicable ? <RefreshCw size={15} /> : <X size={15} />}{workspace.conversationNotApplicable ? "Reativar" : "Nao se aplica"}</button>}
          <button className="secondary-button" type="button" disabled={saving || (kind === "conversation" && workspace.conversationNotApplicable)} onClick={() => { setDraft(emptyDraft(kind)); setError(""); }}><Plus size={15} /> Adicionar</button>
        </div></header>
        {refs.length === 0 && <p className="workspace-empty">{kind === "support" ? "Nenhum link de apoio cadastrado." : kind === "conversation" && workspace.conversationNotApplicable ? "Conversa marcada como nao aplicavel." : "Nenhuma referencia cadastrada."}</p>}
        <div className="workspace-reference-list">{refs.map((ref) => {
          const accessible = browserAccessibleUrl(ref.target);
          const manualKind = workspace.manualReferences.filter((item) => item.kind === kind);
          const manualIndex = manualKind.findIndex((item) => item.id === ref.id);
          return <article className="workspace-reference" data-provider={workspaceProvider(ref.kind, ref.target)} key={ref.id}>
            <WorkspaceProviderBadge kind={ref.kind} target={ref.target} />
            <div className="workspace-reference-copy"><strong>{ref.title}</strong><span title={ref.target}>{ref.target}</span>{ref.notes && <small>{ref.notes}</small>}{ref.origin ? <small>Da etapa: {ref.origin.stepName}</small> : ref.updated_at && <small>Atualizado em {new Date(ref.updated_at).toLocaleDateString("pt-BR")}</small>}</div>
            <div className="workspace-reference-actions">
              <button className="icon-button" type="button" title={kind === "directory" ? "Copiar caminho" : "Copiar link"} aria-label={`Copiar ${ref.title}`} onClick={() => void copyText(ref.target)}><Copy size={16} /></button>
              {accessible && <a className="icon-button" href={accessible} target="_blank" rel="noopener noreferrer" title="Abrir link" aria-label={`Abrir ${ref.title}`}><ExternalLink size={16} /></a>}
              {ref.origin ? <button className="icon-button" type="button" title={`Abrir etapa ${ref.origin.stepName}`} aria-label={`Abrir etapa de ${ref.title}`} onClick={() => onOpenStep(ref.origin!.stepId)}><ArrowUpRight size={16} /></button> : <>
                <button className="icon-button" type="button" title="Editar" aria-label={`Editar ${ref.title}`} disabled={saving} onClick={() => setDraft({ id: ref.id, kind: ref.kind, title: ref.title, target: ref.target, notes: ref.notes ?? "" })}><Pencil size={16} /></button>
                <button className="icon-button" type="button" title="Mover para cima" aria-label={`Mover ${ref.title} para cima`} disabled={saving || manualIndex === 0} onClick={() => moveReference(ref, -1)}><ArrowUp size={16} /></button>
                <button className="icon-button" type="button" title="Mover para baixo" aria-label={`Mover ${ref.title} para baixo`} disabled={saving || manualIndex === manualKind.length - 1} onClick={() => moveReference(ref, 1)}><ArrowDown size={16} /></button>
                <button className="icon-button danger" type="button" title="Excluir" aria-label={`Excluir ${ref.title}`} disabled={saving} onClick={() => deleteReference(ref)}><Trash2 size={16} /></button>
              </>}
            </div>
          </article>;
        })}</div>
        {draft?.kind === kind && <div className="workspace-reference-form" role="group" aria-label={workspace.manualReferences.some((ref) => ref.id === draft.id) ? "Editar referencia" : "Nova referencia"}>
          <div className="workspace-form-heading"><strong>{workspace.manualReferences.some((ref) => ref.id === draft.id) ? "Editar" : "Adicionar"} {kindLabels[kind].toLowerCase()}</strong><button className="icon-button" type="button" title="Cancelar" onClick={() => setDraft(null)}><X size={17} /></button></div>
          <div className="workspace-reference-fields">
            <label>Nome<input value={draft.title} maxLength={160} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <label>{kind === "directory" ? "Caminho no servidor" : "Link"}<input value={draft.target} maxLength={4000} placeholder={kind === "directory" ? "\\\\Servidor\\Projetos\\..." : "https://..."} onChange={(event) => setDraft({ ...draft, target: event.target.value })} /></label>
          </div>
          <div className="workspace-form-actions">{(draft.target || kind === "directory") && <WorkspaceProviderBadge kind={kind} target={draft.target} />}<button className="primary-button" type="button" disabled={saving} onClick={saveDraft}><Save size={16} /> {saving ? "Salvando..." : "Salvar referencia"}</button></div>
        </div>}
      </section>;
    })}
    <section className="workspace-tool-section" aria-label="Checklist do projeto">
      <header>
        <button className="workspace-tool-toggle" type="button" aria-expanded={checklistOpen} onClick={() => setChecklistOpen((value) => { if (value) setChecklistAdding(false); return !value; })}><ClipboardCheck size={17} /><span>Checklist</span><small>{workspace.checklistItems.filter((item) => item.is_done).length}/{workspace.checklistItems.length}</small><ChevronDown size={16} className={checklistOpen ? "open" : ""} /></button>
        <button className="icon-button" type="button" title="Adicionar item" onClick={() => { setChecklistOpen(true); setChecklistAdding(true); }}><Plus size={16} /></button>
      </header>
      {checklistOpen && <div className="workspace-tool-body">
        {checklistAdding && <div className="workspace-quick-add"><input autoFocus value={checklistLabel} maxLength={300} placeholder="Novo requisito" onChange={(event) => setChecklistLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addChecklistItem(); if (event.key === "Escape") { setChecklistAdding(false); setChecklistLabel(""); } }} /><button className="primary-button compact" type="button" disabled={saving || !checklistLabel.trim()} onClick={() => void addChecklistItem()}><Plus size={15} /> Adicionar</button></div>}
        <div className="workspace-checklist">{workspace.checklistItems.map((item) => <label key={item.id}><input type="checkbox" checked={item.is_done} disabled={saving} onChange={() => void mutateWorkspace(`checklist/${encodeURIComponent(item.id)}`, "PATCH", { isDone: !item.is_done })} /><span>{item.label}</span><button className="icon-button danger" type="button" title="Excluir item" onClick={(event) => { event.preventDefault(); void mutateWorkspace(`checklist/${encodeURIComponent(item.id)}`, "DELETE"); }}><Trash2 size={15} /></button></label>)}</div>
        {!workspace.checklistItems.length && <p className="workspace-empty">Adicione os pre-requisitos e orientacoes deste projeto.</p>}
      </div>}
    </section>
    <section className="workspace-tool-section" aria-label="Contextos do projeto">
      <header>
        <button className="workspace-tool-toggle" type="button" aria-expanded={contextsOpen} onClick={() => setContextsOpen((value) => !value)}><Layers3 size={17} /><span>Contextos</span><small>{workspace.contexts.length}</small><ChevronDown size={16} className={contextsOpen ? "open" : ""} /></button>
        <button className="icon-button" type="button" title="Adicionar contexto" onClick={() => setContextsOpen(true)}><Plus size={16} /></button>
      </header>
      {contextsOpen && <div className="workspace-tool-body">
        {contextPrompts.length > 0 && <div className="workspace-prompt-shortcuts" aria-label="Prompts de contexto">{contextPrompts.slice(0, 3).map((prompt) => <button type="button" key={prompt.id} title={prompt.name} onClick={() => void copyText(prompt.content, prompt.name)}><Copy size={14} /><span>{prompt.name}</span></button>)}</div>}
        <div className="workspace-context-form"><input value={contextDraft.title} maxLength={160} placeholder="Titulo do contexto" onChange={(event) => { setContextTitleEdited(true); setContextDraft({ ...contextDraft, title: event.target.value }); }} /><textarea value={contextDraft.content} maxLength={20000} placeholder="Cole ou escreva o contexto" onChange={(event) => { const content = event.target.value; setContextDraft((current) => ({ ...current, content, title: contextTitleEdited ? current.title : contextTitleFromContent(content) })); }} /><button className="primary-button compact" type="button" disabled={saving || !contextDraft.title.trim() || !contextDraft.content.trim()} onClick={() => void addContext()}><Save size={15} /> Salvar contexto</button></div>
        <div className="workspace-context-list">{workspace.contexts.map((context) => <article key={context.id}><div><strong>{context.title}</strong>{context.category && <small>{context.category}</small>}<p>{context.content}</p>{context.source_client_context_id && <small>Disponivel na biblioteca do cliente · versao {context.source_version}</small>}</div><button className="icon-button danger" type="button" title="Retirar contexto deste projeto" onClick={() => void mutateWorkspace(`contexts/${encodeURIComponent(context.id)}`, "DELETE")}><Trash2 size={15} /></button></article>)}</div>
        {!workspace.contexts.length && <p className="workspace-empty">Nenhum contexto cadastrado nesta Etapa 0.</p>}
      </div>}
    </section>
  </section>;
}
