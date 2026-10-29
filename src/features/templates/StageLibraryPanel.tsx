import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowDown, ArrowUp, Layers3, Loader2, Plus, Save, Search, Trash2 } from "lucide-react";
import type { TemplateBlock } from "./templateModel";

export type StageLibraryItem = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  currentVersion: number;
  usageCount: number;
  document: { schemaVersion: 1; blocks: TemplateBlock[]; completionRules: Array<{ id: string; type: string; enabled: boolean; message?: string }> };
};

async function stageApi<T>(baseUrl: string, path = "", init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/stage-library${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json() as { data?: T; error?: string };
  if (!response.ok || !body.data) throw new Error(body.error || "Nao foi possivel atualizar a biblioteca de etapas.");
  return body.data;
}

function block(type: string, order: number): TemplateBlock {
  const title: Record<string, string> = { long_text: "Orientacao", prompt: "Prompt", context: "Contexto", checklist: "Checklist", materials: "Materiais e links", file_upload: "Arquivos" };
  const config = type === "checklist" ? { items: [] } : type === "context" ? { contexts: [] } : type === "materials" ? { links: [] } : type === "prompt" ? { contentSnapshot: "" } : { content: "" };
  return { id: crypto.randomUUID(), type, order, title: title[type] ?? "Bloco", required: false, visible: true, editableInExecution: true, collapsedByDefault: false, config };
}

function move<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next;
}

export function StageLibraryPanel({ baseUrl, onChanged }: { baseUrl: string; onChanged?: () => Promise<void> }) {
  const [items, setItems] = useState<StageLibraryItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<StageLibraryItem | null>(null);
  const [query, setQuery] = useState("");
  const [newBlockType, setNewBlockType] = useState("long_text");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load(preferredId?: string) {
    setBusy(true); setError("");
    try {
      const next = await stageApi<StageLibraryItem[]>(baseUrl);
      setItems(next);
      const id = preferredId ?? selectedId;
      const selected = next.find((item) => item.id === id) ?? next.find((item) => item.status === "active") ?? null;
      setSelectedId(selected?.id ?? ""); setDraft(selected ? structuredClone(selected) : null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar etapas."); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, [baseUrl]);
  const visible = useMemo(() => items.filter((item) => `${item.name} ${item.description ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [items, query]);

  async function createStage() {
    setBusy(true); setError("");
    try {
      const created = await stageApi<StageLibraryItem>(baseUrl, "", { method: "POST", body: JSON.stringify({ name: "Nova etapa" }) });
      await load(created.id); setMessage("Etapa criada. Configure os blocos e salve a primeira revisao.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao criar etapa."); setBusy(false); }
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const updated = await stageApi<StageLibraryItem & { updatedTemplates: number }>(baseUrl, `/${encodeURIComponent(draft.id)}`, { method: "PUT", body: JSON.stringify({ expectedVersion: draft.currentVersion, name: draft.name, description: draft.description, document: draft.document }) });
      await load(updated.id); await onChanged?.();
      setMessage(`Versao ${updated.currentVersion} salva. ${updated.updatedTemplates} template(s) vinculado(s) atualizado(s); projetos existentes foram preservados.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar etapa."); setBusy(false); }
  }

  async function archive() {
    if (!draft || !window.confirm(`Arquivar a etapa ${draft.name}? Os templates e projetos existentes serao preservados.`)) return;
    setBusy(true); setError("");
    try { await stageApi(baseUrl, `/${encodeURIComponent(draft.id)}`, { method: "DELETE" }); await load(); await onChanged?.(); setMessage("Etapa arquivada."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao arquivar etapa."); setBusy(false); }
  }

  function updateBlocks(blocks: TemplateBlock[]) {
    setDraft((current) => current ? { ...current, document: { ...current.document, blocks: blocks.map((item, index) => ({ ...item, order: index + 1 })) } } : current);
  }

  return <section className="stage-library-layout">
    <aside className="stage-library-list">
      <div className="stage-library-list-head"><label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar etapa" /></label><button className="icon-button" type="button" title="Nova etapa" onClick={() => void createStage()}><Plus size={17} /></button></div>
      {busy && !items.length && <p role="status"><Loader2 className="spin" size={16} /> Carregando...</p>}
      {visible.map((item) => <button className={`stage-library-list-item ${selectedId === item.id ? "active" : ""}`} type="button" key={item.id} onClick={() => { setSelectedId(item.id); setDraft(structuredClone(item)); setMessage(""); }}><Layers3 size={16} /><span><strong>{item.name}</strong><small>v{item.currentVersion} · {item.usageCount} template(s)</small></span>{item.status === "archived" && <em>Arquivada</em>}</button>)}
      {!visible.length && !busy && <p className="workspace-empty">Nenhuma etapa encontrada.</p>}
    </aside>
    <main className="stage-library-editor">
      {draft ? <>
        <header><div><span className="eyebrow">Etapa compartilhada · versao {draft.currentVersion}</span><h2>{draft.name}</h2><p>Alteracoes salvas atualizam os templates vinculados, sem modificar projetos existentes.</p></div><div className="inline-actions"><button className="secondary-button" type="button" disabled={busy || draft.status === "archived"} onClick={() => void archive()}><Archive size={16} /> Arquivar</button><button className="primary-button" type="button" disabled={busy || !draft.name.trim() || draft.status === "archived"} onClick={() => void save()}>{busy ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Salvar nova versao</button></div></header>
        {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="template-editor-notice" role="status">{message}</p>}
        <div className="stage-library-meta"><label className="field"><span>Nome da etapa</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="field"><span>Descricao</span><input value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label></div>
        <div className="stage-library-add"><select value={newBlockType} onChange={(event) => setNewBlockType(event.target.value)}><option value="long_text">Orientacao</option><option value="prompt">Prompt</option><option value="context">Contexto</option><option value="checklist">Checklist</option><option value="materials">Materiais</option><option value="file_upload">Arquivos</option></select><button className="secondary-button" type="button" onClick={() => updateBlocks([...draft.document.blocks, block(newBlockType, draft.document.blocks.length + 1)])}><Plus size={15} /> Adicionar bloco</button></div>
        <div className="stage-library-blocks">{draft.document.blocks.map((item, index) => <article key={item.id}><div className="stage-library-block-order"><button className="icon-button" type="button" title="Mover para cima" disabled={index === 0} onClick={() => updateBlocks(move(draft.document.blocks, index, -1))}><ArrowUp size={14} /></button><button className="icon-button" type="button" title="Mover para baixo" disabled={index === draft.document.blocks.length - 1} onClick={() => updateBlocks(move(draft.document.blocks, index, 1))}><ArrowDown size={14} /></button></div><div className="stage-library-block-fields"><label className="field"><span>Titulo</span><input value={item.title} onChange={(event) => updateBlocks(draft.document.blocks.map((candidate) => candidate.id === item.id ? { ...candidate, title: event.target.value } : candidate))} /></label><span className="template-type-chip">{item.type}</span>{["long_text", "prompt"].includes(item.type) && <label className="field full"><span>{item.type === "prompt" ? "Texto-modelo do prompt" : "Conteudo"}</span><textarea rows={3} value={String(item.config[item.type === "prompt" ? "contentSnapshot" : "content"] ?? "")} onChange={(event) => { const key = item.type === "prompt" ? "contentSnapshot" : "content"; updateBlocks(draft.document.blocks.map((candidate) => candidate.id === item.id ? { ...candidate, config: { ...candidate.config, [key]: event.target.value } } : candidate)); }} /></label>}</div><button className="icon-button danger" type="button" title="Remover bloco" onClick={() => updateBlocks(draft.document.blocks.filter((candidate) => candidate.id !== item.id))}><Trash2 size={15} /></button></article>)}</div>
        {!draft.document.blocks.length && <div className="empty-state"><Layers3 size={28} /><strong>Etapa sem blocos</strong><span>Adicione os blocos que farao parte dos templates.</span></div>}
      </> : <div className="empty-state"><Layers3 size={30} /><strong>Biblioteca de etapas</strong><span>Crie ou selecione uma etapa para editar.</span></div>}
    </main>
  </section>;
}
