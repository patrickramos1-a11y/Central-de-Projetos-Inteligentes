import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowDown, ArrowUp, Bot, ClipboardCheck, Cloud, FileText, Layers3, Loader2, Map, MessageSquareText, NotebookTabs, Plus, Save, Search, Trash2 } from "lucide-react";
import type { TemplateBlock } from "./templateModel";

export type StageLibraryItem = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  currentVersion: number;
  usageCount: number;
  clientId: string | null;
  clientName: string | null;
  templateUses: Array<{ templateId: string; templateName: string; templateStepId: string; clientId: string | null; clientName: string | null }>;
  document: { schemaVersion: 1; blocks: TemplateBlock[]; completionRules: Array<{ id: string; type: string; enabled: boolean; message?: string }> };
};

type StageLibraryProps = {
  baseUrl: string;
  clients?: Array<{ id: string; name: string }>;
  scope?: "global" | "client";
  onChanged?: () => Promise<void>;
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

export function stagePresentation(item: Pick<StageLibraryItem, "name" | "templateUses" | "clientName">) {
  const normalized = item.name.toLocaleLowerCase();
  const Icon = /claud/.test(normalized) ? Cloud
    : /gpt/.test(normalized) ? Bot
      : /context/.test(normalized) ? MessageSquareText
        : /mapa/.test(normalized) ? Map
          : /notebook/.test(normalized) ? NotebookTabs
            : /plano|check|cadastro/.test(normalized) ? ClipboardCheck
              : /contrato|relat|sum[aá]rio/.test(normalized) ? FileText
                : Layers3;
  const baseName = normalized.trim() === "claud" ? "Claude" : normalized.includes("notebookl") ? "NotebookLM" : item.name.trim();
  const source = item.clientName ?? (item.templateUses.length === 1 ? item.templateUses[0].templateName : "");
  return { Icon, title: source && !baseName.toLocaleLowerCase().includes(source.toLocaleLowerCase()) ? `${baseName} · ${source}` : baseName };
}

export function StageLibraryPanel({ baseUrl, clients = [], scope = "global", onChanged }: StageLibraryProps) {
  const [items, setItems] = useState<StageLibraryItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<StageLibraryItem | null>(null);
  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [newBlockType, setNewBlockType] = useState("long_text");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load(preferredId?: string) {
    setBusy(true); setError("");
    try {
      const next = await stageApi<StageLibraryItem[]>(baseUrl, `?scope=${scope}`);
      setItems(next);
      const id = preferredId ?? selectedId;
      const selected = next.find((item) => item.id === id) ?? next.find((item) => item.status === "active") ?? null;
      setSelectedId(selected?.id ?? ""); setDraft(selected ? structuredClone(selected) : null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar etapas."); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, [baseUrl, scope]);
  const visible = useMemo(() => items.filter((item) => {
    const haystack = `${item.name} ${item.description ?? ""} ${item.clientName ?? ""} ${item.templateUses.map((use) => use.templateName).join(" ")}`.toLocaleLowerCase();
    return haystack.includes(query.toLocaleLowerCase()) && (!clientFilter || item.clientId === clientFilter);
  }), [items, query, clientFilter]);

  async function createStage() {
    setBusy(true); setError("");
    try {
      const clientId = scope === "client" ? clientFilter || clients[0]?.id || null : null;
      if (scope === "client" && !clientId) throw new Error("Selecione o cliente antes de criar uma etapa exclusiva.");
      const created = await stageApi<StageLibraryItem>(baseUrl, "", { method: "POST", body: JSON.stringify({ name: "Nova etapa", clientId }) });
      await load(created.id); setMessage("Etapa criada. Configure os blocos e salve a primeira revisao.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao criar etapa."); setBusy(false); }
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const updated = await stageApi<StageLibraryItem & { updatedTemplates: number }>(baseUrl, `/${encodeURIComponent(draft.id)}`, { method: "PUT", body: JSON.stringify({ expectedVersion: draft.currentVersion, name: draft.name, description: draft.description, clientId: scope === "client" ? draft.clientId : null, document: draft.document }) });
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
      <div className="stage-library-list-head"><label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar etapa, template ou origem" /></label>{scope === "client" && <select aria-label="Filtrar etapas por cliente" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}><option value="">Todos os clientes</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>}<button className="secondary-button compact" type="button" title="Nova etapa" onClick={() => void createStage()}><Plus size={17} /> Nova etapa</button></div>
      {busy && !items.length && <p role="status"><Loader2 className="spin" size={16} /> Carregando...</p>}
      <div className="stage-library-catalog">{visible.map((item) => { const presentation = stagePresentation(item); const Icon = presentation.Icon; return <button className={`stage-library-list-item ${selectedId === item.id ? "active" : ""}`} type="button" key={item.id} onClick={() => { setSelectedId(item.id); setDraft(structuredClone(item)); setMessage(""); }}><span className="stage-library-item-icon"><Icon size={18} /></span><span><strong>{presentation.title}</strong><small>v{item.currentVersion} · {item.document.blocks.length} bloco(s) · {item.usageCount} template(s)</small><small>{item.templateUses.length ? `Usada em: ${item.templateUses.map((use) => use.templateName).join(", ")}` : "Ainda nao vinculada a template"}</small><p>{item.description || "Sem descricao. Abra para documentar o objetivo desta etapa."}</p></span>{item.status === "archived" && <em>Arquivada</em>}</button>; })}</div>
      {!visible.length && !busy && <p className="workspace-empty">Nenhuma etapa encontrada.</p>}
    </aside>
    <main className="stage-library-editor">
      {draft ? <>
        <header><div><span className="eyebrow">Etapa compartilhada · versao {draft.currentVersion}</span><h2>{stagePresentation(draft).title}</h2><p>Alteracoes salvas atualizam os templates vinculados, sem modificar projetos existentes.</p></div><div className="inline-actions"><button className="secondary-button" type="button" disabled={busy || draft.status === "archived"} onClick={() => void archive()}><Archive size={16} /> Arquivar</button><button className="primary-button" type="button" disabled={busy || !draft.name.trim() || draft.status === "archived"} onClick={() => void save()}>{busy ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Salvar nova versao</button></div></header>
        {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="template-editor-notice" role="status">{message}</p>}
        <div className="stage-library-origin"><strong>Origem e uso</strong><span>{draft.clientName ? `Exclusiva de ${draft.clientName}` : "Etapa global"}</span>{draft.templateUses.map((use) => <span key={`${use.templateId}:${use.templateStepId}`}>{use.templateName}{use.clientName ? ` · ${use.clientName}` : ""}</span>)}</div>
        <div className="stage-library-meta"><label className="field"><span>Nome da etapa</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="field"><span>Descricao</span><input value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Objetivo, extensao e quando esta etapa deve ser usada" /></label>{scope === "client" && <label className="field"><span>Cliente exclusivo</span><select value={draft.clientId ?? ""} onChange={(event) => setDraft({ ...draft, clientId: event.target.value || null, clientName: clients.find((client) => client.id === event.target.value)?.name ?? null })}><option value="">Etapa global</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>}</div>
        <div className="stage-library-add"><select value={newBlockType} onChange={(event) => setNewBlockType(event.target.value)}><option value="long_text">Orientacao</option><option value="prompt">Prompt</option><option value="context">Contexto</option><option value="checklist">Checklist</option><option value="materials">Materiais</option><option value="file_upload">Arquivos</option></select><button className="secondary-button" type="button" onClick={() => updateBlocks([...draft.document.blocks, block(newBlockType, draft.document.blocks.length + 1)])}><Plus size={15} /> Adicionar bloco</button></div>
        <div className="stage-library-blocks">{draft.document.blocks.map((item, index) => <article key={item.id}><div className="stage-library-block-order"><button className="icon-button" type="button" title="Mover para cima" disabled={index === 0} onClick={() => updateBlocks(move(draft.document.blocks, index, -1))}><ArrowUp size={14} /></button><button className="icon-button" type="button" title="Mover para baixo" disabled={index === draft.document.blocks.length - 1} onClick={() => updateBlocks(move(draft.document.blocks, index, 1))}><ArrowDown size={14} /></button></div><div className="stage-library-block-fields"><div className="stage-library-block-title"><span className="template-type-chip">{item.type}</span><label className="field"><span>Titulo</span><input value={item.title} onChange={(event) => updateBlocks(draft.document.blocks.map((candidate) => candidate.id === item.id ? { ...candidate, title: event.target.value } : candidate))} /></label></div>{["long_text", "prompt"].includes(item.type) && <label className="field full"><span>{item.type === "prompt" ? "Texto-modelo do prompt" : "Conteudo"}</span><textarea rows={4} value={String(item.config[item.type === "prompt" ? "contentSnapshot" : "content"] ?? "")} onChange={(event) => { const key = item.type === "prompt" ? "contentSnapshot" : "content"; updateBlocks(draft.document.blocks.map((candidate) => candidate.id === item.id ? { ...candidate, config: { ...candidate.config, [key]: event.target.value } } : candidate)); }} /></label>}</div><button className="icon-button danger" type="button" title="Remover bloco" onClick={() => updateBlocks(draft.document.blocks.filter((candidate) => candidate.id !== item.id))}><Trash2 size={15} /></button></article>)}</div>
        {!draft.document.blocks.length && <div className="empty-state"><Layers3 size={28} /><strong>Etapa sem blocos</strong><span>Adicione os blocos que farao parte dos templates.</span></div>}
      </> : <div className="empty-state"><Layers3 size={30} /><strong>Biblioteca de etapas</strong><span>Crie ou selecione uma etapa para editar.</span></div>}
    </main>
  </section>;
}
