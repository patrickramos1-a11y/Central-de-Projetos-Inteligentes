import { BlockConfigEditor, BlockPreview, blockMeta, newTemplateBlock, type PromptOption } from "./BlockConfigEditor";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Archive, ArrowDown, ArrowUp, Copy, Bot, BriefcaseBusiness, Building2, ChevronDown, ChevronRight, CircleGauge, ClipboardCheck, Cloud, Coffee, Compass, Database, FileStack, FileText, FolderTree, Globe2, Hammer, Image, KeyRound, Landmark, Layers3, LayoutTemplate, Lightbulb, Link, ListChecks, Loader2, Map, MessageSquareText, MessagesSquare, NotebookTabs, PackageCheck, PanelTop, Plus, Puzzle, Route, Save, ScanSearch, Search, ShieldCheck, Sparkles, Target, Trash2, Workflow } from "lucide-react";
import type { TemplateBlock } from "./templateModel";

export type StageLibraryItem = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  currentVersion: number;
  usageCount: number;
  projectUsageCount: number;
  clientId: string | null;
  clientName: string | null;
  templateUses: Array<{ templateId: string; templateName: string; templateStepId: string; clientId: string | null; clientName: string | null }>;
  document: { schemaVersion: 1; blocks: TemplateBlock[]; completionRules: Array<{ id: string; type: string; enabled: boolean; message?: string }> };
};

type StageLibraryProps = {
  baseUrl: string;
  clients?: Array<{ id: string; name: string }>;
  scope?: "global" | "client";
  currentUserName?: string | null;
  onChanged?: () => Promise<void>;
  prompts?: PromptOption[];
};

async function stageApi<T>(baseUrl: string, path = "", init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/stage-library${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json() as { data?: T; error?: string };
  if (!response.ok || !body.data) throw new Error(body.error || "Não foi possível atualizar a biblioteca de etapas.");
  return body.data;
}

function block(type: string, order: number): TemplateBlock {
  const title: Record<string, string> = { long_text: "Orientação", prompt: "Prompt", context: "Contexto", checklist: "Checklist", materials: "Materiais e links", file_upload: "Arquivos" };
  const config = type === "checklist" ? { items: [] } : type === "context" ? { contexts: [] } : type === "materials" ? { links: [] } : type === "prompt" ? { contentSnapshot: "" } : { content: "" };
  return { id: crypto.randomUUID(), type, order, title: title[type] ?? "Bloco", required: false, visible: true, editableInExecution: true, collapsedByDefault: false, config };
}

function move<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next;
}

const stageIcons = [Cloud, Bot, MessageSquareText, Map, NotebookTabs, ClipboardCheck, FileText, Layers3, BriefcaseBusiness, Building2, CircleGauge, Coffee, Compass, Database, FileStack, FolderTree, Globe2, Hammer, Image, KeyRound, Landmark, LayoutTemplate, Lightbulb, Link, ListChecks, MessagesSquare, PackageCheck, Puzzle, Route, ScanSearch, ShieldCheck, Sparkles, Target, Workflow];

function stableHash(value: string) {
  return [...value].reduce((hash, character) => ((hash << 5) - hash + character.charCodeAt(0)) | 0, 0);
}

export function stagePresentation(item: Pick<StageLibraryItem, "id" | "name" | "templateUses" | "clientName">, position?: number) {
  const normalized = item.name.toLocaleLowerCase();
  const identity = position ?? Math.abs(stableHash(item.id));
  const Icon = stageIcons[identity % stageIcons.length];
  const baseName = normalized.trim() === "claud" ? "Claude" : normalized.includes("notebookl") ? "NotebookLM" : item.name.trim();
  const source = item.clientName ?? (item.templateUses.length === 1 ? item.templateUses[0].templateName : "");
  return { Icon, hue: (identity * 137.508) % 360, title: source && !baseName.toLocaleLowerCase().includes(source.toLocaleLowerCase()) ? `${baseName} · ${source}` : baseName };
}

function blockPresentation(type: string) {
  const values: Record<string, { label: string; Icon: typeof Layers3 }> = {
    long_text: { label: "Orientação", Icon: FileText },
    prompt: { label: "Prompt", Icon: Bot },
    context: { label: "Contexto", Icon: MessageSquareText },
    checklist: { label: "Checklist", Icon: ListChecks },
    materials: { label: "Materiais", Icon: Link },
    file_upload: { label: "Arquivos", Icon: FolderTree },
  };
  return values[type] ?? { label: type, Icon: Layers3 };
}

export function StageLibraryPanel({ baseUrl, clients = [], scope = "global", currentUserName = null, onChanged, prompts = [] }: StageLibraryProps) {
  const [items, setItems] = useState<StageLibraryItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<StageLibraryItem | null>(null);
  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived">("active");
  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Set<string>>(new Set());
  const [newBlockType, setNewBlockType] = useState("long_text");
  const [busy, setBusy] = useState(true);
  const [tab, setTab] = useState<"structure" | "preview" | "usage">("structure");
  const [usageFilter, setUsageFilter] = useState<"all" | "used" | "unused" | "duplicates">("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load(preferredId?: string) {
    setBusy(true); setError("");
    try {
      const next = await stageApi<StageLibraryItem[]>(baseUrl, `?scope=${scope}`);
      setItems(next);
      const id = preferredId ?? selectedId;
      const selected = next.find((item) => item.id === id) ?? next.find((item) => item.status === statusFilter) ?? null;
      setSelectedId(selected?.id ?? ""); setDraft(selected ? structuredClone(selected) : null);
      setCollapsedBlockIds(new Set(selected?.document.blocks.map((item) => item.id) ?? []));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar etapas."); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, [baseUrl, scope]);
  const visible = useMemo(() => items.filter((item) => {
    const haystack = `${item.name} ${item.description ?? ""} ${item.clientName ?? ""} ${item.templateUses.map((use) => use.templateName).join(" ")}`.toLocaleLowerCase();
    return item.status === statusFilter && haystack.includes(query.toLocaleLowerCase()) && (!clientFilter || item.clientId === clientFilter);
  }), [items, query, clientFilter, statusFilter]);

  function selectStage(item: StageLibraryItem) {
    setSelectedId(item.id);
    setDraft(structuredClone(item));
    setCollapsedBlockIds(new Set(item.document.blocks.map((block) => block.id)));
    setMessage("");
  }

  function selectStatus(status: "active" | "archived") {
    setStatusFilter(status);
    const selected = items.find((item) => item.status === status) ?? null;
    setSelectedId(selected?.id ?? "");
    setDraft(selected ? structuredClone(selected) : null);
    setCollapsedBlockIds(new Set(selected?.document.blocks.map((item) => item.id) ?? []));
    setMessage("");
  }

  async function createStage() {
    setBusy(true); setError("");
    try {
      const clientId = scope === "client" ? clientFilter || clients[0]?.id || null : null;
      if (scope === "client" && !clientId) throw new Error("Selecione o cliente antes de criar uma etapa exclusiva.");
      const created = await stageApi<StageLibraryItem>(baseUrl, "", { method: "POST", body: JSON.stringify({ name: "Nova etapa", clientId, createdBy: currentUserName }) });
      await load(created.id); setMessage("Etapa criada. Configure os blocos e salve a primeira revisao.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao criar etapa."); setBusy(false); }
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const updated = await stageApi<StageLibraryItem & { updatedTemplates: number; updatedProjects: number; reviewRequired: number }>(baseUrl, `/${encodeURIComponent(draft.id)}`, { method: "PUT", body: JSON.stringify({ expectedVersion: draft.currentVersion, name: draft.name, description: draft.description, clientId: scope === "client" ? draft.clientId : null, document: draft.document, updatedBy: currentUserName }) });
      await load(updated.id); await onChanged?.();
      setMessage(`Versão ${updated.currentVersion} salva. ${updated.updatedTemplates} template(s) e ${updated.updatedProjects} projeto(s) vinculado(s) atualizados.${updated.reviewRequired ? ` ${updated.reviewRequired} item(ns) requer(em) revisão.` : ""}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar etapa."); setBusy(false); }
  }

  async function archive() {
    if (!draft || !window.confirm(`Arquivar a etapa ${draft.name}? Os templates e projetos existentes serão preservados.`)) return;
    setBusy(true); setError("");
    try { await stageApi(baseUrl, `/${encodeURIComponent(draft.id)}`, { method: "DELETE" }); await load(); await onChanged?.(); setMessage("Etapa arquivada."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao arquivar etapa."); setBusy(false); }
  }

  function updateBlocks(blocks: TemplateBlock[]) {
    setDraft((current) => current ? { ...current, document: { ...current.document, blocks: blocks.map((item, index) => ({ ...item, order: index + 1 })) } } : current);
  }

  function toggleBlock(blockId: string) {
    setCollapsedBlockIds((current) => {
      const next = new Set(current);
      if (next.has(blockId)) next.delete(blockId); else next.add(blockId);
      return next;
    });
  }

  function saveInitialView() {
    if (!draft) return;
    updateBlocks(draft.document.blocks.map((item) => ({ ...item, collapsedByDefault: collapsedBlockIds.has(item.id) })));
    setMessage("Visual inicial preparado. Salve uma nova versão para aplica-lo aos templates vinculados.");
  }

  const original = items.find((item) => item.id === draft?.id) ?? null;
  const dirty = Boolean(draft && original && JSON.stringify({ n: draft.name, d: draft.description ?? "", c: draft.clientId, b: draft.document.blocks }) !== JSON.stringify({ n: original.name, d: original.description ?? "", c: original.clientId, b: original.document.blocks }));
  const normalizedName = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const duplicateNames = useMemo(() => {
    const counts = new globalThis.Map<string, number>();
    items.filter((item) => item.status === "active").forEach((item) => counts.set(normalizedName(item.name), (counts.get(normalizedName(item.name)) ?? 0) + 1));
    return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
  }, [items]);
  const listed = visible.filter((item) => usageFilter === "all" || (usageFilter === "used" ? item.usageCount > 0 : usageFilter === "unused" ? item.usageCount === 0 : duplicateNames.has(normalizedName(item.name))));

  function updateBlock(next: TemplateBlock) {
    if (!draft) return;
    updateBlocks(draft.document.blocks.map((candidate) => candidate.id === next.id ? next : candidate));
  }

  function addBlock(type: string) {
    if (!draft) return;
    const next = newTemplateBlock(type, draft.document.blocks.length + 1);
    updateBlocks([...draft.document.blocks, next]);
    setCollapsedBlockIds((current) => { const value = new Set(current); value.delete(next.id); return value; });
  }

  function duplicateBlock(index: number) {
    if (!draft) return;
    const item = draft.document.blocks[index];
    const copy = { ...structuredClone(item), id: crypto.randomUUID(), title: `${item.title} (cópia)` };
    const next = [...draft.document.blocks];
    next.splice(index + 1, 0, copy);
    updateBlocks(next);
  }

  return <section className="stage-library-layout rj-stage-library">
    <aside className="stage-library-list rj-stage-list">
      <div className="rj-stage-list-head">
        <label className="rj-search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar etapa ou template" /></label>
        <button className="primary-button" type="button" onClick={() => void createStage()}><Plus size={16} /> Nova etapa</button>
      </div>
      {scope === "client" && <select aria-label="Filtrar etapas por cliente" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}><option value="">Todos os clientes</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>}
      <div className="rj-chip-row" role="tablist" aria-label="Estado das etapas">
        <button type="button" className={statusFilter === "active" ? "is-active" : ""} onClick={() => selectStatus("active")}>Ativas <span>{items.filter((item) => item.status === "active").length}</span></button>
        <button type="button" className={statusFilter === "archived" ? "is-active" : ""} onClick={() => selectStatus("archived")}>Arquivadas <span>{items.filter((item) => item.status === "archived").length}</span></button>
      </div>
      {statusFilter === "active" && <div className="rj-chip-row is-small">
        {([["all", "Todas"], ["used", "Em uso"], ["unused", "Sem uso"], ["duplicates", "Nomes repetidos"]] as const).map(([key, label]) => <button key={key} type="button" className={usageFilter === key ? "is-active" : ""} onClick={() => setUsageFilter(key)}>{label}</button>)}
      </div>}
      {busy && !items.length && <p role="status"><Loader2 className="spin" size={16} /> Carregando...</p>}
      <div className="rj-stage-items">{listed.map((item, index) => {
        const presentation = stagePresentation(item, index);
        const Icon = presentation.Icon;
        const repeated = duplicateNames.has(normalizedName(item.name));
        return <button className={`rj-stage-item ${selectedId === item.id ? "is-active" : ""}`} style={{ "--stage-hue": presentation.hue } as CSSProperties} type="button" key={item.id} onClick={() => selectStage(item)}>
          <span className="stage-library-item-icon"><Icon size={17} /></span>
          <span className="rj-stage-item-text"><strong>{presentation.title}</strong><small>{item.document.blocks.length} bloco(s) · {item.usageCount ? `${item.usageCount} template(s)` : "sem uso"}{item.projectUsageCount ? ` · ${item.projectUsageCount} projeto(s)` : ""}</small>{item.description && <small className="rj-stage-desc">{item.description}</small>}</span>
          {repeated && <em className="rj-badge is-warning" title="Existe outra etapa ativa com o mesmo nome">repetida</em>}
          {item.status === "archived" && <em className="rj-badge">arquivada</em>}
        </button>;
      })}</div>
      {!listed.length && !busy && <p className="workspace-empty">Nenhuma etapa encontrada.</p>}
    </aside>
    <main className="stage-library-editor rj-stage-editor">
      {draft ? <>
        <header className="rj-stage-head">
          <div>
            <span className="eyebrow">Etapa {draft.clientName ? `exclusiva de ${draft.clientName}` : "global"} · versão {draft.currentVersion}{dirty ? " · alterações não publicadas" : ""}</span>
            <h2>{stagePresentation(draft).title}</h2>
          </div>
          <div className="inline-actions">
            <button className="secondary-button" type="button" disabled={busy || draft.status === "archived"} onClick={() => void archive()}><Archive size={16} /> Arquivar</button>
            {dirty && <button className="secondary-button" type="button" disabled={busy} onClick={() => original && selectStage(original)}>Descartar</button>}
            <button className="primary-button" type="button" disabled={busy || !dirty || !draft.name.trim() || draft.status === "archived"} onClick={() => setConfirmOpen(true)}>{busy ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Publicar versão {draft.currentVersion + 1}</button>
          </div>
        </header>
        {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="template-editor-notice" role="status">{message}</p>}
        <div className="rj-tabs" role="tablist">
          {([["structure", "Estrutura"], ["preview", "Prévia"], ["usage", `Uso (${draft.usageCount})`]] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>{label}</button>)}
        </div>

        {tab === "structure" && <>
          <div className="stage-library-meta">
            <label className="field"><span>Nome da etapa</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label className="field"><span>Descrição</span><input value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Objetivo e quando esta etapa deve ser usada" /></label>
            {scope === "client" && <label className="field"><span>Cliente exclusivo</span><select value={draft.clientId ?? ""} onChange={(event) => setDraft({ ...draft, clientId: event.target.value || null, clientName: clients.find((client) => client.id === event.target.value)?.name ?? null })}><option value="">Etapa global</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>}
          </div>
          <div className="rj-blocks-toolbar">
            <span className="rj-muted">{draft.document.blocks.length} bloco(s)</span>
            <span className="stage-library-view-actions"><button className="secondary-button compact" type="button" onClick={() => setCollapsedBlockIds(new Set())}>Abrir todos</button><button className="secondary-button compact" type="button" onClick={() => setCollapsedBlockIds(new Set(draft.document.blocks.map((item) => item.id)))}>Recolher todos</button><button className="secondary-button compact" type="button" onClick={saveInitialView} title="Os blocos recolhidos agora começam recolhidos nos projetos"><PanelTop size={15} /> Usar como visual inicial</button></span>
          </div>
          <div className="rj-stage-blocks">{draft.document.blocks.map((item, index) => {
            const collapsed = collapsedBlockIds.has(item.id);
            const meta = blockMeta(item.type);
            const BlockIcon = meta.Icon;
            return <article className={`rj-stage-block ${collapsed ? "is-collapsed" : ""}`} key={item.id}>
              <div className="rj-stage-block-head">
                <button className="rj-stage-block-title" type="button" aria-expanded={!collapsed} onClick={() => toggleBlock(item.id)}><span className="stage-library-block-icon"><BlockIcon size={17} /></span><span><strong>{item.title || meta.label}</strong><small>{meta.label}{item.required ? " · obrigatório" : ""} · bloco {index + 1} de {draft.document.blocks.length}</small></span>{collapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}</button>
                <div className="rj-stage-block-actions">
                  <button className="icon-button" type="button" title="Mover para cima" disabled={index === 0} onClick={() => updateBlocks(move(draft.document.blocks, index, -1))}><ArrowUp size={14} /></button>
                  <button className="icon-button" type="button" title="Mover para baixo" disabled={index === draft.document.blocks.length - 1} onClick={() => updateBlocks(move(draft.document.blocks, index, 1))}><ArrowDown size={14} /></button>
                  <button className="icon-button" type="button" title="Duplicar bloco" onClick={() => duplicateBlock(index)}><Copy size={14} /></button>
                  <button className="icon-button danger" type="button" title="Remover bloco" onClick={() => { if (window.confirm(`Remover o bloco "${item.title}"?`)) updateBlocks(draft.document.blocks.filter((candidate) => candidate.id !== item.id)); }}><Trash2 size={14} /></button>
                </div>
              </div>
              {!collapsed && <BlockConfigEditor block={item} prompts={prompts} onChange={updateBlock} />}
            </article>;
          })}</div>
          {!draft.document.blocks.length && <div className="empty-state"><Layers3 size={28} /><strong>Etapa sem blocos</strong><span>Escolha abaixo os blocos que fazem parte desta etapa.</span></div>}
          <div className="rj-add-block">
            <span>Adicionar bloco</span>
            {["long_text", "prompt", "checklist", "materials", "context", "file_upload"].map((type) => { const meta = blockMeta(type); const AddIcon = meta.Icon; return <button key={type} className="secondary-button" type="button" onClick={() => addBlock(type)}><AddIcon size={15} /> {meta.label}</button>; })}
          </div>
        </>}

        {tab === "preview" && <div className="rj-stage-preview">
          <p className="rj-muted">Assim a etapa aparece num projeto novo. Os campos são preenchidos na execução.</p>
          <div className="rj-preview-frame">
            <div className="rj-preview-bar"><strong>{draft.name}</strong><span className="rj-fake-button">Não se aplica</span><span className="rj-fake-button is-primary">Concluir etapa</span></div>
            {draft.document.blocks.map((item) => <BlockPreview key={item.id} block={item} />)}
            {!draft.document.blocks.length && <p className="rj-muted">Etapa sem blocos.</p>}
          </div>
        </div>}

        {tab === "usage" && <div className="rj-stage-usage">
          <p>{draft.usageCount} template(s) e {draft.projectUsageCount} projeto(s) usam esta etapa. Ao publicar uma nova versão, os templates e os projetos com atualização automática recebem a estrutura nova; o que já foi preenchido nos projetos é mantido.</p>
          {draft.templateUses.length ? <ul className="rj-usage-list">{draft.templateUses.map((use) => <li key={`${use.templateId}:${use.templateStepId}`}><Route size={15} /><strong>{use.templateName}</strong>{use.clientName && <small>{use.clientName}</small>}</li>)}</ul> : <p className="rj-muted">Ainda não está em nenhum template. Adicione-a pelo editor de templates.</p>}
        </div>}
      </> : <div className="empty-state"><Layers3 size={30} /><strong>Biblioteca de etapas</strong><span>Crie ou selecione uma etapa para editar.</span></div>}
    </main>
    {confirmOpen && draft && <div className="modal-backdrop" role="presentation" onMouseDown={() => setConfirmOpen(false)}>
      <section className="rj-dialog rj-confirm" role="dialog" aria-modal="true" aria-label="Publicar versão" onMouseDown={(event) => event.stopPropagation()}>
        <header className="rj-dialog-head"><div><span className="eyebrow">{draft.name}</span><h2>Publicar versão {draft.currentVersion + 1}?</h2></div></header>
        <div className="rj-confirm-body">
          <p><strong>{draft.usageCount}</strong> template(s) e <strong>{draft.projectUsageCount}</strong> projeto(s) vinculados recebem a nova estrutura.</p>
          <ul>
            <li>O que já foi preenchido nos projetos (links, checklists, contextos, arquivos) é mantido.</li>
            <li>Blocos removidos ficam guardados como histórico se tiverem conteúdo.</li>
            <li>Projetos concluídos não são reabertos.</li>
          </ul>
        </div>
        <footer className="rj-dialog-foot"><button className="secondary-button" type="button" onClick={() => setConfirmOpen(false)}>Cancelar</button><button className="primary-button" type="button" disabled={busy} onClick={() => { setConfirmOpen(false); void save(); }}><Save size={16} /> Publicar</button></footer>
      </section>
    </div>}
  </section>;
}
