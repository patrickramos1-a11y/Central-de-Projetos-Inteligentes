import { Bot, FileText, FolderTree, Layers3, Link, ListChecks, MessageSquareText, Plus, Trash2 } from "lucide-react";
import { MaterialsConfigEditor } from "../journey/MaterialsBlock";
import { readSlots, slotKindLabels } from "../../../shared/materialsSlots";
import { WorkspaceProviderBadge } from "../workspace/WorkspaceProviderBadge";
import type { TemplateBlock } from "./templateModel";

type AnyRecord = Record<string, unknown>;
export type PromptOption = { id: string; name: string; content: string };

const list = (value: unknown): AnyRecord[] => (Array.isArray(value) ? value.filter((item): item is AnyRecord => Boolean(item) && typeof item === "object") : []);

export const blockTypeMeta: Record<string, { label: string; Icon: typeof Layers3 }> = {
  long_text: { label: "Orientação", Icon: FileText },
  short_text: { label: "Texto", Icon: FileText },
  phase: { label: "Fase", Icon: Layers3 },
  prompt: { label: "Prompt", Icon: Bot },
  context: { label: "Contexto", Icon: MessageSquareText },
  checklist: { label: "Checklist", Icon: ListChecks },
  materials: { label: "Links e diretórios", Icon: Link },
  file_upload: { label: "Arquivos", Icon: FolderTree },
};

export function blockMeta(type: string) {
  return blockTypeMeta[type] ?? { label: type, Icon: Layers3 };
}

export function newTemplateBlock(type: string, order: number): TemplateBlock {
  const config: AnyRecord = type === "checklist" ? { items: [] }
    : type === "context" ? { contexts: [] }
      : type === "materials" ? { links: [], slots: [] }
        : type === "prompt" ? { contentSnapshot: "", applicationConditions: [] }
          : type === "file_upload" ? { fileMode: "evidence", minFiles: 1 }
            : { content: "" };
  return { id: crypto.randomUUID(), type, order, title: blockMeta(type).label, required: type !== "long_text", visible: true, editableInExecution: true, collapsedByDefault: false, config };
}

/**
 * Full configuration of a template/stage block: the same options the
 * project "personalizar" mode offers, so stages are built where they belong.
 */
export function BlockConfigEditor({ block, prompts, onChange }: { block: TemplateBlock; prompts: PromptOption[]; onChange: (next: TemplateBlock) => void }) {
  const setConfig = (patch: AnyRecord) => onChange({ ...block, config: { ...block.config, ...patch } });
  const items = list(block.config.items);
  const contexts = list(block.config.contexts);
  const conditions = list(block.config.applicationConditions);

  return (
    <div className="rj-block-config">
      <div className="rj-block-config-row">
        <label className="field"><span>Título do bloco</span><input value={block.title} onChange={(event) => onChange({ ...block, title: event.target.value })} /></label>
        <div className="rj-block-flags">
          <label className="rj-check"><input type="checkbox" checked={Boolean(block.required)} onChange={(event) => onChange({ ...block, required: event.target.checked })} /> Obrigatório para concluir</label>
          <label className="rj-check"><input type="checkbox" checked={Boolean(block.collapsedByDefault)} onChange={(event) => onChange({ ...block, collapsedByDefault: event.target.checked })} /> Começa recolhido</label>
        </div>
      </div>

      {["long_text", "short_text", "phase"].includes(block.type) && (
        <label className="field"><span>Conteúdo / orientação</span><textarea rows={5} value={String(block.config.content ?? "")} onChange={(event) => setConfig({ content: event.target.value })} placeholder="O que a pessoa precisa saber ou fazer nesta etapa" /></label>
      )}

      {block.type === "prompt" && (
        <>
          <label className="field"><span>Prompt da biblioteca</span>
            <select value={String(block.config.promptId ?? "")} onChange={(event) => { const prompt = prompts.find((item) => item.id === event.target.value); setConfig({ promptId: prompt?.id ?? null, contentSnapshot: prompt?.content ?? block.config.contentSnapshot ?? "" }); }}>
              <option value="">Texto personalizado</option>
              {prompts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field"><span>{block.config.promptId ? "Texto atual (vem da biblioteca)" : "Texto do prompt"}</span><textarea rows={6} value={String(block.config.contentSnapshot ?? "")} readOnly={Boolean(block.config.promptId)} onChange={(event) => setConfig({ contentSnapshot: event.target.value })} /></label>
          <label className="field"><span>Resultado esperado</span><textarea rows={2} value={String(block.config.expectedOutput ?? "")} onChange={(event) => setConfig({ expectedOutput: event.target.value })} /></label>
          <label className="rj-check"><input type="checkbox" checked={Boolean(block.config.attachmentsEnabled)} onChange={(event) => setConfig({ attachmentsEnabled: event.target.checked })} /> Permitir anexar o resultado</label>
          <div className="rj-editor-section">
            <div className="rj-editor-section-head"><strong>Condições para dar como aplicado</strong><small>Itens que a pessoa marca antes de concluir o prompt.</small></div>
            {conditions.map((condition, index) => (
              <div className="rj-inline-row" key={String(condition.id)}>
                <input value={String(condition.label ?? "")} placeholder="Ex.: revisei o texto gerado" onChange={(event) => setConfig({ applicationConditions: conditions.map((item, current) => current === index ? { ...item, label: event.target.value } : item) })} />
                <button className="icon-button danger" type="button" title="Remover condição" onClick={() => setConfig({ applicationConditions: conditions.filter((_, current) => current !== index) })}><Trash2 size={14} /></button>
              </div>
            ))}
            <button className="secondary-button" type="button" onClick={() => setConfig({ applicationConditions: [...conditions, { id: crypto.randomUUID(), label: "", required: true }] })}><Plus size={14} /> Condição</button>
          </div>
        </>
      )}

      {block.type === "checklist" && (
        <div className="rj-editor-section">
          <div className="rj-editor-section-head"><strong>Itens do checklist</strong></div>
          {items.map((item, index) => (
            <div className="rj-inline-row" key={String(item.id)}>
              <input value={String(item.label ?? "")} placeholder={`Item ${index + 1}`} onChange={(event) => setConfig({ items: items.map((candidate, current) => current === index ? { ...candidate, label: event.target.value } : candidate) })} />
              <label className="rj-check"><input type="checkbox" checked={item.required !== false} onChange={(event) => setConfig({ items: items.map((candidate, current) => current === index ? { ...candidate, required: event.target.checked } : candidate) })} /> Obrigatório</label>
              <button className="icon-button danger" type="button" title="Remover item" onClick={() => setConfig({ items: items.filter((_, current) => current !== index) })}><Trash2 size={14} /></button>
            </div>
          ))}
          <button className="secondary-button" type="button" onClick={() => setConfig({ items: [...items, { id: crypto.randomUUID(), label: "", required: true }] })}><Plus size={14} /> Item</button>
        </div>
      )}

      {block.type === "context" && (
        <div className="rj-editor-section">
          <div className="rj-editor-section-head"><strong>Contextos-modelo</strong><small>Textos fixos que todo projeto recebe. Os contextos do cliente são puxados no projeto.</small></div>
          {contexts.map((item, index) => (
            <div className="rj-context-editor" key={String(item.id)}>
              <input value={String(item.title ?? "")} placeholder="Título" onChange={(event) => setConfig({ contexts: contexts.map((candidate, current) => current === index ? { ...candidate, title: event.target.value, pinned: true } : candidate) })} />
              <textarea rows={3} value={String(item.content ?? "")} placeholder="Conteúdo" onChange={(event) => setConfig({ contexts: contexts.map((candidate, current) => current === index ? { ...candidate, content: event.target.value, pinned: true } : candidate) })} />
              <button className="icon-button danger" type="button" title="Remover contexto" onClick={() => setConfig({ contexts: contexts.filter((_, current) => current !== index) })}><Trash2 size={14} /></button>
            </div>
          ))}
          <button className="secondary-button" type="button" onClick={() => setConfig({ contexts: [...contexts, { id: crypto.randomUUID(), title: "", content: "", pinned: true }] })}><Plus size={14} /> Contexto-modelo</button>
        </div>
      )}

      {block.type === "materials" && <MaterialsConfigEditor config={block.config} onChange={setConfig} />}

      {block.type === "file_upload" && (
        <div className="rj-block-config-row">
          <label className="field"><span>Uso</span><select value={String(block.config.fileMode ?? "evidence")} onChange={(event) => setConfig({ fileMode: event.target.value })}><option value="evidence">Evidência que o projeto anexa</option><option value="resource_pack">Arquivo-modelo do template</option></select></label>
          <label className="field"><span>Quantidade mínima</span><input type="number" min={1} value={Number(block.config.minFiles ?? 1)} onChange={(event) => setConfig({ minFiles: Math.max(1, Number(event.target.value) || 1) })} /></label>
        </div>
      )}
    </div>
  );
}

/** Read-only rendering of a block as the project will see it (no inputs). */
export function BlockPreview({ block }: { block: TemplateBlock }) {
  const meta = blockMeta(block.type);
  const Icon = meta.Icon;
  const items = list(block.config.items);
  const contexts = list(block.config.contexts);
  const slots = block.type === "materials" ? readSlots(block.config) : [];
  const fixed = list(block.config.links).filter((link) => String(link.url ?? "").trim());
  const content = String(block.config.content ?? block.config.contentSnapshot ?? "").trim();
  return (
    <article className={`rj-preview-block type-${block.type}`}>
      <header><Icon size={17} /><strong>{block.title || meta.label}</strong><small>{meta.label}{block.required ? " · obrigatório" : ""}</small></header>
      {content && <p className="rj-preview-text">{content.length > 420 ? `${content.slice(0, 420)}…` : content}</p>}
      {block.type === "prompt" && <div className="rj-preview-actions"><span className="rj-fake-button is-primary">Copiar prompt</span><span className="rj-fake-button">Confirmar aplicação</span></div>}
      {block.type === "checklist" && (items.length ? <ul className="rj-preview-checks">{items.map((item) => <li key={String(item.id)}><span className="rj-fake-check" />{String(item.label || "Item sem nome")}</li>)}</ul> : <p className="rj-muted">Checklist sem itens.</p>)}
      {block.type === "context" && <div className="rj-preview-contexts">{contexts.map((item) => <span key={String(item.id)}>{String(item.title || "Contexto")}</span>)}<span className="is-ghost">+ contextos do cliente</span></div>}
      {block.type === "materials" && (
        <div className="rj-preview-slots">
          {slots.map((slot) => <div className="rj-preview-slot" key={slot.id}><WorkspaceProviderBadge kind={slot.kind === "server" ? "directory" : "support"} target={slot.kind === "google-drive" ? "https://drive.google.com" : slot.kind === "notebooklm" ? "https://notebooklm.google.com" : slot.kind === "google-photos" ? "https://photos.google.com" : slot.kind === "chatgpt" ? "https://chatgpt.com" : slot.kind === "claude" ? "https://claude.ai" : ""} /><strong>{slot.label}</strong>{slot.required && <em>obrigatório</em>}<small>{slotKindLabels[slot.kind]} · a preencher no projeto</small></div>)}
          {fixed.map((link) => <div className="rj-preview-slot is-fixed" key={String(link.id)}><Link size={15} /><strong>{String(link.title || link.url)}</strong><small>link de referência</small></div>)}
          {!slots.length && !fixed.length && <p className="rj-muted">Campo livre para colar links no projeto.</p>}
        </div>
      )}
      {block.type === "file_upload" && <p className="rj-muted">{block.config.fileMode === "resource_pack" ? "Arquivos-modelo disponíveis para baixar." : `Espaço para anexar ${Number(block.config.minFiles ?? 1)} arquivo(s).`}</p>}
    </article>
  );
}
