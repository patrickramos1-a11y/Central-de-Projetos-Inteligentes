import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronLeft, Copy, Eye, Layers3, Loader2, Plus, Save, Search, Trash2, X } from "lucide-react";
import type { TemplateBlock, TemplateSnapshot, TemplateStep } from "./templateModel";
import { stagePresentation, type StageLibraryItem } from "./StageLibraryPanel";

type Option = { id: string; name: string };
type LibraryContext = { id: string; title: string; content: string; category: string | null; status: string; version: number };
type TemplateFile = { id: string; step_id: string; block_id: string; r2_key: string; name: string; size_bytes: number };
type EditorPayload = { snapshot: TemplateSnapshot; published: TemplateSnapshot; files: TemplateFile[]; draftRevision: number | null; publishedVersion: number; hasDraft: boolean };
type Props = {
  baseUrl: string;
  templateId: string;
  projectTypes: Option[];
  clients: Option[];
  prompts: Array<Option & { content: string }>;
  onClose: () => void;
  onOpenTemplate: (id: string) => void;
  onPublished: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
};

async function api<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json() as { data?: { data?: T } | T; error?: string };
  const result = body.data && typeof body.data === "object" && "data" in body.data ? body.data.data : body.data as T | undefined;
  if (!response.ok || !result) throw new Error(body.error ?? "Nao foi possivel concluir a operacao.");
  return result;
}

function newStep(templateId: string, order: number): TemplateStep {
  const id = crypto.randomUUID();
  return { id, name: `Nova etapa ${order}`, description: "", stepOrder: order, document: { schemaVersion: 1, ownerType: "template", templateId, stepId: id, structureId: crypto.randomUUID(), title: `Nova etapa ${order}`, status: "ativo", state: "draft", versionNumber: 1, revision: 1, blocks: [], completionRules: [] } };
}

function newBlock(type: string, order: number): TemplateBlock {
  const labels: Record<string, string> = { long_text: "Orientacao", short_text: "Texto", prompt: "Prompt", context: "Contexto", materials: "Materiais e links", checklist: "Checklist", file_upload: "Arquivos-modelo", phase: "Fase", project_summary: "Sumario inteligente" };
  const config: Record<string, unknown> = type === "context" ? { contexts: [] } : type === "materials" ? { links: [] } : type === "checklist" ? { items: [] } : type === "file_upload" ? { fileMode: "resource_pack", minFiles: 1 } : type === "prompt" ? { promptId: null, contentSnapshot: "", expectedOutput: "", applicationConditions: [] } : { content: "" };
  return { id: crypto.randomUUID(), type, order, title: labels[type] ?? "Bloco", required: false, visible: true, editableInExecution: true, collapsedByDefault: false, config };
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const result = [...items];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}

export function TemplateEditor({ baseUrl, templateId, projectTypes, clients, prompts, onClose, onOpenTemplate, onPublished, onDirtyChange }: Props) {
  const [loaded, setLoaded] = useState<EditorPayload | null>(null);
  const [snapshot, setSnapshot] = useState<TemplateSnapshot | null>(null);
  const [baseline, setBaseline] = useState("");
  const [selectedStepId, setSelectedStepId] = useState("");
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [newBlockType, setNewBlockType] = useState("long_text");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showStagePicker, setShowStagePicker] = useState(false);
  const [stageLibrary, setStageLibrary] = useState<StageLibraryItem[]>([]);
  const [stageSearch, setStageSearch] = useState("");
  const [library, setLibrary] = useState<LibraryContext[]>([]);
  const [libraryResults, setLibraryResults] = useState<LibraryContext[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryOffset, setLibraryOffset] = useState(0);
  const [libraryHasMore, setLibraryHasMore] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  const [libraryPreviewId, setLibraryPreviewId] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const requestVersion = useRef(0);
  const libraryRequestVersion = useRef(0);
  const dirty = snapshot !== null && JSON.stringify(snapshot) !== baseline;
  const step = selectedStepId ? snapshot?.steps.find((item) => item.id === selectedStepId) ?? snapshot?.steps[0] : undefined;
  const selectedBlock = step?.document.blocks.find((item) => item.id === selectedBlockId) ?? null;

  useEffect(() => {
    const version = ++requestVersion.current;
    setLoaded(null); setSnapshot(null); setError(""); setNotice(""); setShowImport(false); setPreview(false);
    void api<EditorPayload>(baseUrl, `/journey-templates/${encodeURIComponent(templateId)}/editor`)
      .then((result) => {
        if (version !== requestVersion.current) return;
        setLoaded(result); setSnapshot(result.snapshot); setBaseline(JSON.stringify(result.snapshot)); setSelectedStepId(result.snapshot.steps[0]?.id ?? "");
      })
      .catch((failure) => { if (version === requestVersion.current) setError(failure instanceof Error ? failure.message : "Falha ao abrir template."); });
    return () => { requestVersion.current += 1; };
  }, [baseUrl, templateId]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!snapshot?.clientId) { setLibrary([]); setLibraryResults([]); setSelectedLibraryIds([]); return; }
    const version = ++libraryRequestVersion.current;
    const timer = window.setTimeout(() => {
      setLibraryError(""); setLibraryLoading(true);
      void api<LibraryContext[]>(baseUrl, `/clients/${encodeURIComponent(snapshot.clientId!)}/contexts?q=${encodeURIComponent(librarySearch)}&offset=${libraryOffset}`)
        .then((items) => {
          if (version !== libraryRequestVersion.current) return;
          setLibrary((current) => {
            const byId = new Map(current.map((item) => [item.id, item]));
            items.forEach((item) => byId.set(item.id, item));
            return [...byId.values()];
          });
          setLibraryResults((current) => libraryOffset ? [...current, ...items.filter((item) => !current.some((existing) => existing.id === item.id))] : items);
          setLibraryHasMore(items.length === 100);
        })
        .catch((failure) => { if (version === libraryRequestVersion.current) setLibraryError(failure instanceof Error ? failure.message : "Falha ao carregar contextos."); })
        .finally(() => { if (version === libraryRequestVersion.current) setLibraryLoading(false); });
    }, librarySearch ? 180 : 0);
    return () => { window.clearTimeout(timer); libraryRequestVersion.current += 1; };
  }, [baseUrl, snapshot?.clientId, librarySearch, libraryOffset, libraryRefreshKey]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") { setLibraryOffset(0); setLibraryRefreshKey((current) => current + 1); } };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  function leave() {
    if (dirty && !window.confirm("Ha alteracoes nao salvas. Sair do editor?")) return;
    onClose();
  }

  function change(update: (current: TemplateSnapshot) => TemplateSnapshot) {
    setSnapshot((current) => current ? update(current) : current);
    setNotice("");
  }

  function changeStep(stepId: string, update: (current: TemplateStep) => TemplateStep) {
    change((current) => ({ ...current, steps: current.steps.map((item) => item.id === stepId ? update(item) : item) }));
  }

  function changeBlock(blockId: string, update: (current: TemplateBlock) => TemplateBlock) {
    if (!step) return;
    changeStep(step.id, (current) => ({ ...current, document: { ...current.document, blocks: current.document.blocks.map((item) => item.id === blockId ? update(item) : item) } }));
  }

  function changeConfig(key: string, value: unknown) {
    if (!selectedBlock) return;
    changeBlock(selectedBlock.id, (current) => ({ ...current, config: { ...current.config, [key]: value } }));
  }

  async function save(): Promise<number | null> {
    if (!snapshot || !loaded || busy) return null;
    if (!dirty && loaded.hasDraft) return loaded.draftRevision;
    setBusy(true); setError("");
    try {
      const result = await api<{ snapshot: TemplateSnapshot; draftRevision: number }>(baseUrl, `/journey-templates/${encodeURIComponent(templateId)}/editor`, { method: "PUT", body: JSON.stringify({ snapshot, expectedRevision: loaded.draftRevision }) });
      setLoaded((current) => current ? { ...current, hasDraft: true, draftRevision: result.draftRevision, snapshot: result.snapshot } : current);
      setSnapshot(result.snapshot); setBaseline(JSON.stringify(result.snapshot)); setNotice("Rascunho salvo.");
      return result.draftRevision;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha ao salvar rascunho.");
      return null;
    } finally { setBusy(false); }
  }

  async function uploadModelFile(file: File, stepId: string, blockId: string) {
    if (!loaded || !snapshot) return;
    if (await save() === null) return;
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.set("stepId", stepId); form.set("blockId", blockId); form.set("file", file);
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/journey-templates/${encodeURIComponent(templateId)}/editor/files`, { method: "POST", body: form });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Falha ao enviar arquivo-modelo.");
      const fresh = await api<EditorPayload>(baseUrl, `/journey-templates/${encodeURIComponent(templateId)}/editor`);
      setLoaded((current) => current ? { ...current, files: fresh.files } : current);
      setNotice("Arquivo incluido no rascunho. Publique a versao para usa-lo em novos projetos.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao enviar arquivo-modelo."); }
    finally { setBusy(false); }
  }

  async function removeModelFile(file: TemplateFile) {
    if (!loaded || !window.confirm(`Retirar ${file.name} do rascunho? A versao publicada permanece intacta ate publicar.`)) return;
    const wasDraft = loaded.hasDraft;
    if (await save() === null) return;
    setBusy(true); setError("");
    try {
      const staged = wasDraft ? file : (await api<EditorPayload>(baseUrl, `/journey-templates/${encodeURIComponent(templateId)}/editor`)).files
        .find((item) => item.step_id === file.step_id && item.block_id === file.block_id && item.r2_key === file.r2_key);
      if (!staged) throw new Error("Arquivo do rascunho nao encontrado. Reabra o template.");
      await api(baseUrl, `/journey-templates/${encodeURIComponent(templateId)}/editor/files/${encodeURIComponent(staged.id)}`, { method: "DELETE" });
      setLoaded((current) => current ? { ...current, files: current.files.filter((item) => item.r2_key !== file.r2_key) } : current);
      setNotice("Arquivo retirado do rascunho. Publique a versao para aplicar a mudanca.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao retirar arquivo-modelo."); }
    finally { setBusy(false); }
  }

  async function publish() {
    if (!snapshot || !loaded || busy) return;
    let revision = loaded.draftRevision;
    if (dirty || revision === null) revision = await save();
    if (revision === null) return;
    setBusy(true); setError("");
    try {
      await api(baseUrl, `/journey-templates/${encodeURIComponent(templateId)}/publish`, { method: "POST", body: JSON.stringify({ expectedRevision: revision }) });
      const fresh = await api<EditorPayload>(baseUrl, `/journey-templates/${encodeURIComponent(templateId)}/editor`);
      setLoaded(fresh); setSnapshot(fresh.snapshot); setBaseline(JSON.stringify(fresh.snapshot)); setNotice(`Versao ${fresh.publishedVersion} publicada. Projetos existentes nao foram alterados.`);
      await onPublished();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao publicar."); }
    finally { setBusy(false); }
  }

  async function duplicate() {
    if (dirty && !window.confirm("A duplicacao usa a versao publicada. Continuar sem as alteracoes deste rascunho?")) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ id: string }>(baseUrl, `/journey-templates/${encodeURIComponent(templateId)}/duplicate`, { method: "POST" });
      await onPublished(); onOpenTemplate(result.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao duplicar."); }
    finally { setBusy(false); }
  }

  function addStep() {
    if (!snapshot) return;
    const item = newStep(snapshot.templateId, snapshot.steps.length + 1);
    change((current) => ({ ...current, steps: [...current.steps, item] })); setSelectedStepId(item.id); setSelectedBlockId("");
  }

  async function openStagePicker() {
    setError(""); setBusy(true);
    try {
      const stages = await api<StageLibraryItem[]>(baseUrl, `/stage-library?scope=available${snapshot?.clientId ? `&clientId=${encodeURIComponent(snapshot.clientId)}` : ""}`);
      setStageLibrary(stages.filter((item) => item.status === "active")); setShowStagePicker(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao carregar etapas salvas."); }
    finally { setBusy(false); }
  }

  function addSharedStage(source: StageLibraryItem) {
    if (!snapshot) return;
    const id = crypto.randomUUID();
    const item: TemplateStep = {
      id, sourceStageId: source.id, sourceStageVersion: source.currentVersion, name: source.name, description: source.description ?? "", stepOrder: snapshot.steps.length + 1,
      document: { schemaVersion: 1, ownerType: "template", templateId: snapshot.templateId, stepId: id, structureId: crypto.randomUUID(), title: source.name, status: "ativo", state: "draft", versionNumber: 1, revision: 1, blocks: structuredClone(source.document.blocks), completionRules: structuredClone(source.document.completionRules) },
    };
    change((current) => ({ ...current, steps: [...current.steps, item] })); setSelectedStepId(id); setSelectedBlockId(""); setShowStagePicker(false);
  }

  function reorderSteps(index: number, direction: -1 | 1) {
    change((current) => ({ ...current, steps: moveItem(current.steps, index, direction).map((item, order) => ({ ...item, stepOrder: order + 1 })) }));
  }

  function addBlock() {
    if (!step) return;
    const block = newBlock(newBlockType, step.document.blocks.length + 1);
    changeStep(step.id, (current) => ({ ...current, document: { ...current.document, blocks: [...current.document.blocks, block] } }));
    setSelectedBlockId(block.id);
  }

  function reorderBlocks(index: number, direction: -1 | 1) {
    if (!step) return;
    changeStep(step.id, (current) => ({ ...current, document: { ...current.document, blocks: moveItem(current.document.blocks, index, direction).map((item, order) => ({ ...item, order: order + 1 })) } }));
  }

  function importContexts() {
    if (!selectedBlock || selectedBlock.type !== "context") return;
    const existing = Array.isArray(selectedBlock.config.contexts) ? selectedBlock.config.contexts as Array<Record<string, unknown>> : [];
    const additions = library.filter((item) => selectedLibraryIds.includes(item.id)).map((item) => ({ id: crypto.randomUUID(), title: item.title, content: item.content, color: "mint", pinned: true, sourceContextId: item.id, sourceVersion: item.version }));
    changeConfig("contexts", [...existing, ...additions]); setSelectedLibraryIds([]); setShowImport(false);
  }

  async function updateClientSource(item: Record<string, unknown>, index: number) {
    if (!snapshot?.clientId || !item.sourceContextId || !selectedBlock) return;
    if (!window.confirm("Atualizar o contexto da biblioteca do cliente? Os usos existentes nao mudam automaticamente.")) return;
    setBusy(true); setError("");
    try {
      const updated = await api<LibraryContext>(baseUrl, `/clients/${encodeURIComponent(snapshot.clientId)}/contexts/${encodeURIComponent(String(item.sourceContextId))}`, {
        method: "PATCH",
        body: JSON.stringify({ title: String(item.title ?? ""), content: String(item.content ?? ""), expectedVersion: Number(item.sourceVersion) }),
      });
      setLibrary((current) => current.map((source) => source.id === updated.id ? updated : source));
      setLibraryResults((current) => current.map((source) => source.id === updated.id ? updated : source));
      const contexts = Array.isArray(selectedBlock.config.contexts) ? selectedBlock.config.contexts as Array<Record<string, unknown>> : [];
      changeConfig("contexts", contexts.map((context, position) => position === index ? { ...context, sourceVersion: updated.version } : context));
      setNotice("Biblioteca atualizada. Salve o rascunho para registrar esta copia no template.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha ao atualizar contexto do cliente.");
    } finally { setBusy(false); }
  }

  if (!snapshot || !loaded) return <section className="template-editor-loading" role="status">{error || <><Loader2 size={20} className="spin" /> Carregando template...</>}</section>;

  const cards = selectedBlock && Array.isArray(selectedBlock.config.contexts) ? selectedBlock.config.contexts as Array<Record<string, unknown>> : [];
  const links = selectedBlock && Array.isArray(selectedBlock.config.links) ? selectedBlock.config.links as Array<Record<string, unknown>> : [];
  const checklist = selectedBlock && Array.isArray(selectedBlock.config.items) ? selectedBlock.config.items as Array<Record<string, unknown>> : [];
  const conditions = selectedBlock && Array.isArray(selectedBlock.config.applicationConditions) ? selectedBlock.config.applicationConditions as Array<Record<string, unknown>> : [];
  const visibleLibrary = libraryResults;

  return <section className="template-editor" aria-label={`Editar template ${snapshot.name}`}>
    <header className="template-editor-header">
      <button className="secondary-button" type="button" onClick={leave}><ChevronLeft size={16} /> Voltar</button>
      <div><span className="eyebrow">Template de projeto · {loaded.hasDraft ? "Rascunho" : `Versao ${loaded.publishedVersion}`}</span><h1>{snapshot.name}</h1></div>
      <div className="template-editor-actions">
        <button className="secondary-button" type="button" onClick={() => setPreview((value) => !value)}><Eye size={16} /> {preview ? "Editar" : "Pre-visualizar novo projeto"}</button>
        <button className="secondary-button" type="button" onClick={() => void duplicate()} disabled={busy}><Copy size={16} /> Duplicar como novo template</button>
        <button className="secondary-button" type="button" onClick={() => void save()} disabled={busy || !dirty && loaded.hasDraft}><Save size={16} /> Salvar rascunho</button>
        <button className="primary-button" type="button" onClick={() => void publish()} disabled={busy || !snapshot.steps.length}>{busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />} Publicar versao</button>
      </div>
    </header>
    {error && <div className="form-error" role="alert">{error}</div>}{notice && <div className="template-editor-notice" role="status">{notice}</div>}
    {!preview && <div className="template-editor-meta">
      <label className="field"><span>Nome</span><input value={snapshot.name} onChange={(event) => change((current) => ({ ...current, name: event.target.value }))} /></label>
      <label className="field"><span>Descricao</span><input value={snapshot.description} onChange={(event) => change((current) => ({ ...current, description: event.target.value }))} /></label>
      <label className="field"><span>Tipo de projeto</span><select value={snapshot.projectTypeId ?? ""} onChange={(event) => change((current) => ({ ...current, projectTypeId: event.target.value || null }))}><option value="">Geral</option>{projectTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><span>Cliente dos contextos</span><select value={snapshot.clientId ?? ""} onChange={(event) => change((current) => ({ ...current, clientId: event.target.value || null }))}><option value="">Sem cliente vinculado</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field template-workspace-guidance"><span>Orientacao do Local de trabalho</span><input value={snapshot.workspaceGuidance} onChange={(event) => change((current) => ({ ...current, workspaceGuidance: event.target.value }))} placeholder="Explique onde cadastrar diretórios e conversas" /></label>
    </div>}
    <div className="template-editor-layout">
      <aside className="template-editor-rail" aria-label="Etapas do template">
        <div className="template-editor-rail-head"><strong>Etapas</strong>{!preview && <div className="template-editor-rail-actions"><button className="icon-button" type="button" title="Puxar etapa da biblioteca" onClick={() => void openStagePicker()}><Layers3 size={17} /></button><button className="icon-button" type="button" title="Criar etapa personalizada" onClick={addStep}><Plus size={17} /></button></div>}</div>
        <button className="template-editor-step workspace" type="button" aria-current={!step ? "step" : undefined} onClick={() => { setSelectedStepId(""); setSelectedBlockId(""); }}><span>0</span> Local de trabalho</button>
        {snapshot.steps.map((item, index) => <div key={item.id} className={`template-editor-step ${step?.id === item.id ? "active" : ""}`}>
          <button type="button" onClick={() => { setSelectedStepId(item.id); setSelectedBlockId(""); }}><span>{index + 1}</span>{item.name}</button>
          {!preview && <div className="template-editor-step-actions"><button className="icon-button" type="button" title="Mover etapa para cima" disabled={index === 0} onClick={() => reorderSteps(index, -1)}><ArrowUp size={14} /></button><button className="icon-button" type="button" title="Mover etapa para baixo" disabled={index === snapshot.steps.length - 1} onClick={() => reorderSteps(index, 1)}><ArrowDown size={14} /></button><button className="icon-button danger" type="button" title="Remover etapa" onClick={() => { if (!window.confirm(`Remover a etapa ${item.name} do rascunho?`)) return; change((current) => ({ ...current, steps: current.steps.filter((candidate) => candidate.id !== item.id).map((candidate, order) => ({ ...candidate, stepOrder: order + 1 })) })); if (selectedStepId === item.id) setSelectedStepId(snapshot.steps.find((candidate) => candidate.id !== item.id)?.id ?? ""); }}><Trash2 size={14} /></button></div>}
        </div>)}
      </aside>
      <main className="template-editor-main">
        {!step ? <div className="template-editor-empty"><h2>Local de trabalho</h2><p>Diretorios do servidor e links de conversa pertencem a cada projeto. O template guarda apenas orientacao.</p><p>{snapshot.workspaceGuidance || "Nenhuma orientacao definida."}</p></div> : <>
          <div className="template-editor-step-heading"><div>{preview || step.sourceStageId ? <><h2>{step.name}</h2>{step.sourceStageId && <p className="template-shared-stage-note"><Layers3 size={15} /> Etapa compartilhada v{step.sourceStageVersion}. Edite em Etapas salvas para atualizar todos os templates vinculados.</p>}</> : <><label className="field"><span>Nome da etapa</span><input value={step.name} onChange={(event) => changeStep(step.id, (current) => ({ ...current, name: event.target.value, document: { ...current.document, title: event.target.value } }))} /></label><label className="field"><span>Descricao</span><input value={step.description} onChange={(event) => changeStep(step.id, (current) => ({ ...current, description: event.target.value }))} /></label></>}</div><span>{step.document.blocks.length} blocos</span></div>
          {!preview && !step.sourceStageId && <div className="template-editor-add-block"><select aria-label="Tipo de bloco" value={newBlockType} onChange={(event) => setNewBlockType(event.target.value)}>{Object.entries({ long_text: "Orientacao", short_text: "Texto", prompt: "Prompt", context: "Contexto", materials: "Materiais e links", checklist: "Checklist", file_upload: "Arquivos-modelo", phase: "Fase", project_summary: "Sumario inteligente" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="secondary-button" type="button" onClick={addBlock}><Plus size={16} /> Adicionar bloco</button></div>}
          <div className="template-editor-blocks">{step.document.blocks.map((block, index) => <article key={block.id} className={`template-editor-block ${selectedBlockId === block.id ? "active" : ""}`}>
            <div className="template-editor-block-head"><button type="button" onClick={() => setSelectedBlockId(selectedBlockId === block.id ? "" : block.id)}><strong>{block.title}</strong><span>{block.type}</span></button>{!preview && !step.sourceStageId && <div className="template-editor-block-actions"><button className="icon-button" type="button" title="Mover bloco para cima" disabled={index === 0} onClick={() => reorderBlocks(index, -1)}><ArrowUp size={15} /></button><button className="icon-button" type="button" title="Mover bloco para baixo" disabled={index === step.document.blocks.length - 1} onClick={() => reorderBlocks(index, 1)}><ArrowDown size={15} /></button><button className="icon-button danger" type="button" title="Remover bloco" onClick={() => { if (!window.confirm(`Remover o bloco ${block.title}?`)) return; changeStep(step.id, (current) => ({ ...current, document: { ...current.document, blocks: current.document.blocks.filter((item) => item.id !== block.id).map((item, order) => ({ ...item, order: order + 1 })) } })); setSelectedBlockId(""); }}><Trash2 size={15} /></button></div>}</div>
            {(selectedBlockId === block.id || preview) && <div className="template-editor-block-body">{preview || step.sourceStageId ? <>{["long_text", "short_text", "phase"].includes(block.type) && <p>{String(block.config.content ?? "")}</p>}{block.type === "prompt" && <p>{String(block.config.contentSnapshot ?? "Prompt vinculado")}</p>}{block.type === "context" && (Array.isArray(block.config.contexts) ? block.config.contexts as Array<Record<string, unknown>> : []).map((item) => <p key={String(item.id)}><strong>{String(item.title)}</strong><br />{String(item.content)}</p>)}</> : <>
              <label className="field"><span>Titulo do bloco</span><input value={block.title} onChange={(event) => changeBlock(block.id, (current) => ({ ...current, title: event.target.value }))} /></label>
              <div className="template-editor-toggles"><label><input type="checkbox" checked={Boolean(block.required)} onChange={(event) => changeBlock(block.id, (current) => ({ ...current, required: event.target.checked }))} /> Obrigatorio</label><label><input type="checkbox" checked={block.visible !== false} onChange={(event) => changeBlock(block.id, (current) => ({ ...current, visible: event.target.checked }))} /> Visivel</label><label><input type="checkbox" checked={Boolean(block.collapsedByDefault)} onChange={(event) => changeBlock(block.id, (current) => ({ ...current, collapsedByDefault: event.target.checked }))} /> Recolhido no visual inicial</label></div>
              {["long_text", "short_text", "phase"].includes(block.type) && <label className="field"><span>Conteudo</span><textarea rows={4} value={String(block.config.content ?? "")} onChange={(event) => changeConfig("content", event.target.value)} /></label>}
              {block.type === "prompt" && <><label className="field"><span>Prompt vinculado</span><select value={String(block.config.promptId ?? "")} onChange={(event) => { const prompt = prompts.find((item) => item.id === event.target.value); changeBlock(block.id, (current) => ({ ...current, config: { ...current.config, promptId: prompt?.id ?? null, contentSnapshot: prompt?.content ?? "" } })); }}><option value="">Texto personalizado</option>{prompts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>Texto-modelo do prompt</span><textarea rows={5} value={String(block.config.contentSnapshot ?? "")} onChange={(event) => changeConfig("contentSnapshot", event.target.value)} /></label><label className="field"><span>Resultado esperado</span><textarea rows={2} value={String(block.config.expectedOutput ?? "")} onChange={(event) => changeConfig("expectedOutput", event.target.value)} /></label><label className="checkline"><input type="checkbox" checked={Boolean(block.config.attachmentsEnabled)} onChange={(event) => changeConfig("attachmentsEnabled", event.target.checked)} /> Permitir anexos</label><h4>Condicoes de aplicacao</h4>{conditions.map((condition, conditionIndex) => <div className="template-editor-inline" key={String(condition.id)}><input value={String(condition.label ?? "")} onChange={(event) => changeConfig("applicationConditions", conditions.map((item, index) => index === conditionIndex ? { ...item, label: event.target.value } : item))} /><button className="icon-button danger" type="button" title="Remover condicao" onClick={() => changeConfig("applicationConditions", conditions.filter((_, index) => index !== conditionIndex))}><Trash2 size={14} /></button></div>)}<button className="secondary-button" type="button" onClick={() => changeConfig("applicationConditions", [...conditions, { id: crypto.randomUUID(), label: "", required: true }])}><Plus size={14} /> Condicao</button></>}
              {block.type === "checklist" && <><h4>Itens</h4>{checklist.map((item, itemIndex) => <div className="template-editor-inline" key={String(item.id)}><input value={String(item.label ?? "")} onChange={(event) => changeConfig("items", checklist.map((candidate, index) => index === itemIndex ? { ...candidate, label: event.target.value } : candidate))} /><button className="icon-button danger" type="button" title="Remover item" onClick={() => changeConfig("items", checklist.filter((_, index) => index !== itemIndex))}><Trash2 size={14} /></button></div>)}<button className="secondary-button" type="button" onClick={() => changeConfig("items", [...checklist, { id: crypto.randomUUID(), label: "", required: true }])}><Plus size={14} /> Item</button></>}
              {block.type === "materials" && <><h4>Materiais-modelo</h4>{links.map((link, linkIndex) => <div className="template-editor-inline" key={String(link.id)}><input aria-label="Nome do material" value={String(link.title ?? "")} onChange={(event) => changeConfig("links", links.map((item, index) => index === linkIndex ? { ...item, title: event.target.value } : item))} /><input aria-label="Link do material" value={String(link.url ?? "")} onChange={(event) => changeConfig("links", links.map((item, index) => index === linkIndex ? { ...item, url: event.target.value } : item))} /><button className="icon-button danger" type="button" title="Remover material" onClick={() => changeConfig("links", links.filter((_, index) => index !== linkIndex))}><Trash2 size={14} /></button></div>)}<button className="secondary-button" type="button" onClick={() => changeConfig("links", [...links, { id: crypto.randomUUID(), title: "", url: "", modelResource: true }])}><Plus size={14} /> Material</button></>}
              {block.type === "file_upload" && <><label className="field"><span>Uso do arquivo</span><select value={String(block.config.fileMode ?? "resource_pack")} onChange={(event) => changeConfig("fileMode", event.target.value)}><option value="resource_pack">Arquivo-modelo</option><option value="evidence">Evidencia futura</option></select></label><label className="field"><span>Quantidade minima</span><input type="number" min="1" value={Number(block.config.minFiles ?? 1)} onChange={(event) => changeConfig("minFiles", Number(event.target.value) || 1)} /></label></>}
              {(block.type === "file_upload" && block.config.fileMode !== "evidence" || block.type === "prompt" && (Boolean(block.config.attachmentsEnabled) || loaded.files.some((file) => file.step_id === step.id && file.block_id === block.id))) && <div className="template-editor-files"><strong>Arquivos-modelo</strong>{loaded.files.filter((file) => file.step_id === step.id && file.block_id === block.id).map((file) => <div className="template-editor-inline" key={file.id}><a href={`${baseUrl.replace(/\/$/, "")}/api/files/${encodeURIComponent(file.r2_key)}`} target="_blank" rel="noreferrer">{file.name}</a><small>{Math.ceil(file.size_bytes / 1024)} KB</small><button className="icon-button danger" type="button" title={`Retirar ${file.name}`} disabled={busy} onClick={() => void removeModelFile(file)}><Trash2 size={14} /></button></div>)}{(block.type !== "prompt" || Boolean(block.config.attachmentsEnabled)) && <label className="secondary-button template-editor-file-input"><Plus size={14} /> Adicionar arquivo<input type="file" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadModelFile(file, step.id, block.id); }} /></label>}</div>}
              {block.type === "context" && <><div className="template-editor-context-head"><h4>Contextos-modelo</h4><button className="secondary-button" type="button" disabled={!snapshot.clientId} title={!snapshot.clientId ? "Selecione o cliente do template primeiro" : undefined} onClick={() => setShowImport(true)}><Plus size={14} /> Puxar contextos do cliente</button></div>{cards.map((item, cardIndex) => { const current = library.find((source) => source.id === item.sourceContextId); return <div className="template-editor-context" key={String(item.id)}><label className="field"><span>Titulo (editar apenas aqui)</span><input value={String(item.title ?? "")} onChange={(event) => changeConfig("contexts", cards.map((candidate, index) => index === cardIndex ? { ...candidate, title: event.target.value } : candidate))} /></label><label className="field"><span>Conteudo (editar apenas aqui)</span><textarea rows={3} value={String(item.content ?? "")} onChange={(event) => changeConfig("contexts", cards.map((candidate, index) => index === cardIndex ? { ...candidate, content: event.target.value } : candidate))} /></label>{Boolean(item.sourceContextId) && <small>Origem: versao {String(item.sourceVersion ?? 1)}{current && current.version > Number(item.sourceVersion ?? 0) ? " · Atualizacao disponivel" : ""}</small>}<div className="template-editor-inline"><button className="icon-button" type="button" title="Mover contexto para cima" disabled={cardIndex === 0} onClick={() => changeConfig("contexts", moveItem(cards, cardIndex, -1))}><ArrowUp size={14} /></button><button className="icon-button" type="button" title="Mover contexto para baixo" disabled={cardIndex === cards.length - 1} onClick={() => changeConfig("contexts", moveItem(cards, cardIndex, 1))}><ArrowDown size={14} /></button>{current && current.version > Number(item.sourceVersion ?? 0) && <button className="secondary-button" type="button" onClick={() => { if (window.confirm("Substituir a copia neste rascunho pela versao atual do cliente?")) changeConfig("contexts", cards.map((candidate, index) => index === cardIndex ? { ...candidate, title: current.title, content: current.content, sourceVersion: current.version } : candidate)); }}>Atualizar copia</button>}{Boolean(item.sourceContextId) && <button className="secondary-button" type="button" disabled={busy} onClick={() => void updateClientSource(item, cardIndex)}>Atualizar contexto do cliente</button>}<button className="icon-button danger" type="button" title="Retirar contexto" onClick={() => changeConfig("contexts", cards.filter((_, index) => index !== cardIndex))}><Trash2 size={14} /></button></div></div>; })}<button className="secondary-button" type="button" onClick={() => changeConfig("contexts", [...cards, { id: crypto.randomUUID(), title: "Novo contexto", content: "", pinned: true, color: "mint" }])}><Plus size={14} /> Contexto-modelo</button></>}
            </>}</div>}
          </article>)}</div>
        </>}
      </main>
    </div>
    {showImport && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowImport(false)}><section className="template-context-picker glass-panel" role="dialog" aria-modal="true" aria-label="Puxar contextos do cliente" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><h2>Puxar contextos do cliente</h2><button className="icon-button" type="button" title="Fechar" onClick={() => setShowImport(false)}><X size={18} /></button></div><label className="search-field"><Search size={16} /><input value={librarySearch} onChange={(event) => { setLibrarySearch(event.target.value); setLibraryOffset(0); }} placeholder="Buscar titulo, conteudo ou categoria" /></label>{libraryError && <p role="alert" className="form-error">{libraryError}</p>}<div className="template-context-picker-list">{libraryLoading && <p role="status"><Loader2 className="spin" size={15} /> Buscando contextos...</p>}{visibleLibrary.map((item) => <div key={item.id} className="template-context-picker-item"><label><input type="checkbox" checked={selectedLibraryIds.includes(item.id)} onChange={(event) => setSelectedLibraryIds((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} /><strong>{item.title}</strong><small>{item.category || "Sem categoria"} · v{item.version}</small></label><button className="icon-button" type="button" title="Previa" onClick={() => setLibraryPreviewId(libraryPreviewId === item.id ? "" : item.id)}><Eye size={16} /></button>{libraryPreviewId === item.id && <p>{item.content}</p>}</div>)}{libraryHasMore && <button className="secondary-button" type="button" disabled={libraryLoading} onClick={() => setLibraryOffset((current) => current + 100)}>Carregar mais</button>}</div><div className="inline-actions"><button className="secondary-button" type="button" onClick={() => setShowImport(false)}>Cancelar</button><button className="primary-button" type="button" disabled={!selectedLibraryIds.length} onClick={importContexts}>Importar selecionados ({selectedLibraryIds.length})</button></div></section></div>}
    {showStagePicker && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowStagePicker(false)}><section className="template-context-picker glass-panel" role="dialog" aria-modal="true" aria-label="Puxar etapa da biblioteca" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><h2>Puxar etapa da biblioteca</h2><p>Etapas exclusivas aparecem somente quando o template esta vinculado ao mesmo cliente.</p></div><button className="icon-button" type="button" title="Fechar" onClick={() => setShowStagePicker(false)}><X size={18} /></button></div><label className="search-field"><Search size={16} /><input value={stageSearch} onChange={(event) => setStageSearch(event.target.value)} placeholder="Buscar etapa, template ou cliente" /></label><div className="template-stage-picker-list">{stageLibrary.filter((item) => `${item.name} ${item.description ?? ""} ${item.clientName ?? ""} ${item.templateUses.map((use) => use.templateName).join(" ")}`.toLocaleLowerCase().includes(stageSearch.toLocaleLowerCase())).map((item) => { const presentation = stagePresentation(item); const Icon = presentation.Icon; return <article key={item.id}><span className="stage-library-item-icon"><Icon size={18} /></span><div><strong>{presentation.title}</strong><small>v{item.currentVersion} · {item.usageCount} template(s) · {item.document.blocks.length} blocos</small><small>{item.clientName ? `Exclusiva de ${item.clientName}` : "Etapa global"}</small><p>{item.description || "Sem descricao cadastrada."}</p>{item.templateUses.length > 0 && <p className="template-stage-origin">Origem: {item.templateUses.map((use) => use.templateName).join(", ")}</p>}</div><button className="primary-button compact" type="button" onClick={() => addSharedStage(item)}><Plus size={15} /> Adicionar</button></article>; })}</div></section></div>}
  </section>;
}
