import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, CheckCircle2, Copy, ExternalLink, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { copyText } from "../../components/ui/clipboard";
import { browserAccessibleUrl, workspaceMissing, workspaceStatusLabel, type ProjectWorkspace, type WorkspaceKind, type WorkspaceOverview, type WorkspaceReference } from "./workspaceModel";

type Draft = { id: string; kind: WorkspaceKind; title: string; target: string; notes: string };
const emptyDraft = (kind: WorkspaceKind): Draft => ({ id: crypto.randomUUID(), kind, title: "", target: "", notes: "" });
const kindLabels: Record<WorkspaceKind, string> = { directory: "Diretorios e pastas", conversation: "Conversas", support: "Links de apoio" };

async function getWorkspace(baseUrl: string, projectId: string): Promise<ProjectWorkspace> {
  const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/workspace`, { cache: "no-store" });
  const body = await response.json() as { data?: ProjectWorkspace; error?: string };
  if (!response.ok || !body.data) throw new Error(body.error || "Nao foi possivel carregar o local de trabalho.");
  return body.data;
}

export function ProjectWorkspacePanel({ baseUrl, projectId, onChanged, onOpenStep }: { baseUrl: string; projectId: string; onChanged: (overview: WorkspaceOverview) => void; onOpenStep: (stepId: string) => void }) {
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
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

  useEffect(() => { setWorkspace(null); setDraft(null); void refresh(); }, [refresh]);
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

  if (!workspace) return <section className="workspace-stage-body"><p>{loading ? "Carregando local de trabalho..." : error || "Local de trabalho indisponivel."}</p><button className="secondary-button" type="button" onClick={() => void refresh()}><RefreshCw size={16} /> Tentar novamente</button></section>;

  const missing = workspaceMissing(workspace);
  return <section className="workspace-stage-body" aria-label="Local de trabalho do projeto">
    <div className="workspace-stage-intro">
      <div><h2>Local de trabalho</h2><p>Registre onde estao os materiais e as conversas deste projeto.</p>{workspace.guidance && <p className="workspace-template-guidance">{workspace.guidance}</p>}</div>
      <span className={`workspace-state ${workspace.status}`}>{workspaceStatusLabel(workspace.status)}</span>
    </div>
    {missing.length > 0 && <p className="workspace-missing">Falta {missing.join(" e ")}.</p>}
    {workspace.status === "organizado" && <p className="workspace-done"><CheckCircle2 size={17} /> Referencias essenciais organizadas.</p>}
    {error && <p className="workspace-error" role="alert">{error} <button type="button" onClick={() => void refresh(true)}>Atualizar dados</button></p>}
    {(["directory", "conversation", "support"] as WorkspaceKind[]).map((kind) => {
      const refs = workspace.references.filter((ref) => ref.kind === kind);
      return <section className="workspace-reference-section" key={kind} aria-label={kindLabels[kind]}>
        <header><h3>{kindLabels[kind]}</h3><button className="secondary-button" type="button" disabled={saving || (kind === "conversation" && workspace.conversationNotApplicable)} onClick={() => { setDraft(emptyDraft(kind)); setError(""); }}><Plus size={15} /> Adicionar</button></header>
        {kind === "conversation" && <label className="workspace-na" title={refs.some((ref) => ref.origin) ? "A jornada possui conversas vinculadas. Edite-as na etapa de origem." : undefined}><input type="checkbox" checked={workspace.conversationNotApplicable} disabled={saving || refs.some((ref) => ref.origin)} onChange={(event) => {
          const checked = event.target.checked;
          if (checked && refs.length && !window.confirm("Marcar Nao se aplica remove os links de conversa deste projeto. Continuar?")) return;
          void save(checked ? workspace.manualReferences.filter((ref) => ref.kind !== "conversation") : workspace.manualReferences, checked, () => setDraft(null));
        }} /> Nao se aplica a este projeto</label>}
        {refs.length === 0 && <p className="workspace-empty">{kind === "support" ? "Nenhum link de apoio cadastrado." : kind === "conversation" && workspace.conversationNotApplicable ? "Conversa marcada como nao aplicavel." : "Nenhuma referencia cadastrada."}</p>}
        <div className="workspace-reference-list">{refs.map((ref) => {
          const accessible = browserAccessibleUrl(ref.target);
          const manualKind = workspace.manualReferences.filter((item) => item.kind === kind);
          const manualIndex = manualKind.findIndex((item) => item.id === ref.id);
          return <article className="workspace-reference" key={ref.id}>
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
      </section>;
    })}
    {draft && <div className="workspace-reference-form" role="group" aria-label={workspace.manualReferences.some((ref) => ref.id === draft.id) ? "Editar referencia" : "Nova referencia"}>
      <div className="workspace-form-heading"><strong>{workspace.manualReferences.some((ref) => ref.id === draft.id) ? "Editar" : "Adicionar"} {kindLabels[draft.kind].toLowerCase()}</strong><button className="icon-button" type="button" title="Cancelar" onClick={() => setDraft(null)}><X size={17} /></button></div>
      <label>Nome<input value={draft.title} maxLength={160} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>{draft.kind === "directory" ? "Caminho ou URL" : "Link"}<input value={draft.target} maxLength={4000} placeholder={draft.kind === "directory" ? "C:\\Projetos\\... ou https://..." : "https://..."} onChange={(event) => setDraft({ ...draft, target: event.target.value })} /></label>
      <label>Observacao (opcional)<textarea value={draft.notes} maxLength={2000} rows={2} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
      <button className="primary-button" type="button" disabled={saving} onClick={saveDraft}><Save size={16} /> {saving ? "Salvando..." : "Salvar referencia"}</button>
    </div>}
  </section>;
}
