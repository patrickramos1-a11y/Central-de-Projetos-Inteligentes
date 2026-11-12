import { useState } from "react";
import { ArrowDown, ArrowUp, Ban, Copy, ExternalLink, Link2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { copyText } from "../../components/ui/clipboard";
import { WorkspaceProviderBadge } from "../workspace/WorkspaceProviderBadge";
import { browserAccessibleUrl, serverDirectoryPath } from "../workspace/workspaceModel";
import { readNotApplicableSlots, readRuntimeLinks, readSlots, slotKindLabels, type MaterialSlot, type RuntimeLink, type SlotKind } from "../../../shared/materialsSlots";

type AnyRecord = Record<string, unknown>;
type FixedLink = { id: string; title: string; url: string };

const asRecord = (value: unknown): AnyRecord => (value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {});
const readFixedLinks = (config: unknown): FixedLink[] => (Array.isArray(asRecord(config).links) ? (asRecord(config).links as unknown[]).map(asRecord) : [])
  .map((link) => ({ id: String(link.id ?? crypto.randomUUID()), title: String(link.title ?? ""), url: String(link.url ?? "") }));

const placeholders: Record<SlotKind, string> = {
  any: "Cole o link",
  "google-drive": "Cole o link da pasta ou arquivo no Google Drive",
  notebooklm: "Cole o link do caderno no NotebookLM",
  "google-photos": "Cole o link do álbum no Google Fotos",
  chatgpt: "Cole o link da conversa no ChatGPT",
  claude: "Cole o link da conversa no Claude",
  server: "Cole o caminho da pasta no servidor (ex.: Z:\\...)",
};

function badgeKind(target: string, slotKind?: SlotKind) {
  return slotKind === "server" || serverDirectoryPath(target) ? "directory" as const : "support" as const;
}

/** Suggests a readable title from a pasted URL or path. */
export function titleFromTarget(target: string) {
  const trimmed = target.trim();
  if (serverDirectoryPath(trimmed)) return trimmed.split(/[\\/]/).filter(Boolean).pop() ?? "Pasta do servidor";
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "drive.google.com") return "Google Drive";
    if (host === "docs.google.com") return "Google Docs";
    if (host.includes("notebooklm")) return "NotebookLM";
    if (host.includes("photos")) return "Google Fotos";
    if (host === "chatgpt.com" || host === "chat.openai.com") return "Conversa ChatGPT";
    if (host === "claude.ai") return "Conversa Claude";
    return host;
  } catch {
    return "Link";
  }
}

function LinkActions({ target, onRemove }: { target: string; onRemove?: () => void }) {
  const web = browserAccessibleUrl(target);
  return (
    <span className="rj-link-actions">
      {web && <a className="icon-button" href={web} target="_blank" rel="noreferrer" title="Abrir"><ExternalLink size={14} /></a>}
      <button className="icon-button" type="button" title={web ? "Copiar link" : "Copiar caminho"} onClick={() => void copyText(target, web ? "Link" : "Caminho")}><Copy size={14} /></button>
      {onRemove && <button className="icon-button danger" type="button" title="Remover" onClick={onRemove}><Trash2 size={14} /></button>}
    </span>
  );
}

function SlotFillForm({ slot, onSave }: { slot: MaterialSlot; onSave: (url: string) => void }) {
  const [draft, setDraft] = useState("");
  const submit = () => { if (draft.trim()) { onSave(draft.trim()); setDraft(""); } };
  return (
    <form className="rj-slot-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={placeholders[slot.kind]} aria-label={`Link para ${slot.label}`} />
      <button className="primary-button" type="submit" disabled={!draft.trim()}>Salvar</button>
    </form>
  );
}

/** Execution view: slots defined by the template + free extra links. */
export function MaterialsRuntime({ config, value, currentUserName, onSaveValue }: { config: unknown; value: unknown; currentUserName: string | null; onSaveValue: (value: unknown) => void }) {
  const slots = readSlots(config);
  const fixed = readFixedLinks(config).filter((link) => link.url.trim());
  const runtime = readRuntimeLinks(value);
  const notApplicable = readNotApplicableSlots(value);
  const extras = runtime.filter((link) => !link.slotId || !slots.some((slot) => slot.id === link.slotId));
  const [extraUrl, setExtraUrl] = useState("");
  const [extraTitle, setExtraTitle] = useState("");
  const base = asRecord(value);

  const save = (links: RuntimeLink[], naMap?: Record<string, boolean>) => onSaveValue({ ...base, links, slotNotApplicable: naMap ?? Object.fromEntries([...notApplicable].map((id) => [id, true])) });
  const stamp = (link: Omit<RuntimeLink, "updatedBy" | "updatedAt">): RuntimeLink => ({ ...link, updatedBy: currentUserName, updatedAt: new Date().toISOString() });

  const fillSlot = (slot: MaterialSlot, url: string) => {
    const rest = runtime.filter((link) => link.slotId !== slot.id);
    const naMap = Object.fromEntries([...notApplicable].filter((id) => id !== slot.id).map((id) => [id, true]));
    save([...rest, stamp({ id: crypto.randomUUID(), slotId: slot.id, title: slot.label, url })], naMap);
  };
  const clearSlot = (slot: MaterialSlot) => save(runtime.filter((link) => link.slotId !== slot.id));
  const toggleNotApplicable = (slot: MaterialSlot) => {
    const next = new Set(notApplicable);
    if (next.has(slot.id)) next.delete(slot.id); else next.add(slot.id);
    save(runtime.filter((link) => link.slotId !== slot.id || !next.has(slot.id)), Object.fromEntries([...next].map((id) => [id, true])));
  };
  const addExtra = () => {
    if (!extraUrl.trim()) return;
    save([...runtime, stamp({ id: crypto.randomUUID(), title: extraTitle.trim() || titleFromTarget(extraUrl), url: extraUrl.trim() })]);
    setExtraUrl(""); setExtraTitle("");
  };

  return (
    <div className="rj-materials">
      {slots.length > 0 && (
        <ul className="rj-slots">
          {slots.map((slot) => {
            const filled = runtime.find((link) => link.slotId === slot.id);
            const na = notApplicable.has(slot.id);
            return (
              <li key={slot.id} className={`rj-slot ${filled ? "is-filled" : na ? "is-na" : slot.required ? "is-pending" : ""}`}>
                <div className="rj-slot-head">
                  <WorkspaceProviderBadge kind={slot.kind === "server" ? "directory" : "support"} target={filled?.url ?? (slot.kind === "google-drive" ? "https://drive.google.com" : slot.kind === "notebooklm" ? "https://notebooklm.google.com" : slot.kind === "google-photos" ? "https://photos.google.com" : slot.kind === "chatgpt" ? "https://chatgpt.com" : slot.kind === "claude" ? "https://claude.ai" : "")} />
                  <span className="rj-slot-title"><strong>{slot.label}</strong>{slot.required && !filled && !na && <em>obrigatório</em>}{slot.hint && <small>{slot.hint}</small>}</span>
                  {!filled && <button className="rj-link-button" type="button" onClick={() => toggleNotApplicable(slot)}>{na ? <><RotateCcw size={13} /> Voltar a aplicar</> : <><Ban size={13} /> Não se aplica</>}</button>}
                </div>
                {filled ? (
                  <div className="rj-slot-value">
                    <span className="rj-slot-target" title={filled.url}>{filled.url}</span>
                    <LinkActions target={filled.url} onRemove={() => clearSlot(slot)} />
                    {(filled.updatedBy || filled.updatedAt) && <small className="rj-muted">{[filled.updatedBy, filled.updatedAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(filled.updatedAt)) : null].filter(Boolean).join(" · ")}</small>}
                  </div>
                ) : na ? <p className="rj-muted">Marcado como não se aplica neste projeto.</p> : <SlotFillForm slot={slot} onSave={(url) => fillSlot(slot, url)} />}
              </li>
            );
          })}
        </ul>
      )}

      {fixed.length > 0 && (
        <div className="rj-fixed-links">
          <span className="rj-group-label">Links de referência do template</span>
          {fixed.map((link) => <div className="rj-link-row" key={link.id}><WorkspaceProviderBadge kind={badgeKind(link.url)} target={link.url} /><span className="rj-link-title">{link.title || titleFromTarget(link.url)}</span><LinkActions target={link.url} /></div>)}
        </div>
      )}

      {extras.length > 0 && (
        <div className="rj-fixed-links">
          <span className="rj-group-label">{slots.length ? "Outros links deste projeto" : "Links deste projeto"}</span>
          {extras.map((link) => <div className="rj-link-row" key={link.id}><WorkspaceProviderBadge kind={badgeKind(link.url)} target={link.url} /><span className="rj-link-title">{link.title || titleFromTarget(link.url)}</span><LinkActions target={link.url} onRemove={() => save(runtime.filter((item) => item.id !== link.id))} /></div>)}
        </div>
      )}

      <form className="rj-extra-form" onSubmit={(event) => { event.preventDefault(); addExtra(); }}>
        <Link2 size={15} />
        <input value={extraUrl} onChange={(event) => { setExtraUrl(event.target.value); }} placeholder={slots.length ? "Adicionar outro link ou pasta" : "Cole um link ou caminho de pasta"} aria-label="Novo link" />
        <input value={extraTitle} onChange={(event) => setExtraTitle(event.target.value)} placeholder={extraUrl ? titleFromTarget(extraUrl) : "Nome (opcional)"} aria-label="Nome do link" />
        <button className="secondary-button" type="submit" disabled={!extraUrl.trim()}><Plus size={15} /> Adicionar</button>
      </form>
    </div>
  );
}

/** Structure editor used by the stage library, template editor and project personalization. */
export function MaterialsConfigEditor({ config, onChange }: { config: unknown; onChange: (patch: AnyRecord) => void }) {
  const slots = readSlots(config, { includeIncomplete: true });
  const fixed = readFixedLinks(config);
  const setSlots = (next: MaterialSlot[]) => onChange({ slots: next });
  const updateSlot = (index: number, patch: Partial<MaterialSlot>) => setSlots(slots.map((slot, current) => current === index ? { ...slot, ...patch } : slot));
  const moveSlot = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= slots.length) return;
    const next = [...slots];
    [next[index], next[target]] = [next[target], next[index]];
    setSlots(next);
  };

  return (
    <div className="rj-materials-editor">
      <div className="rj-editor-section">
        <div className="rj-editor-section-head"><strong>Links que cada projeto deve preencher</strong><small>Ex.: "Projetos básicos" no Google Drive. Aparece como um espaço vazio com o ícone do serviço.</small></div>
        {slots.map((slot, index) => (
          <div className="rj-slot-editor" key={slot.id}>
            <div className="rj-slot-editor-order">
              <button className="icon-button" type="button" title="Subir" disabled={index === 0} onClick={() => moveSlot(index, -1)}><ArrowUp size={13} /></button>
              <button className="icon-button" type="button" title="Descer" disabled={index === slots.length - 1} onClick={() => moveSlot(index, 1)}><ArrowDown size={13} /></button>
            </div>
            <label className="field"><span>Nome</span><input value={slot.label} placeholder="Projetos básicos" onChange={(event) => updateSlot(index, { label: event.target.value })} /></label>
            <label className="field"><span>Onde fica</span><select value={slot.kind} onChange={(event) => updateSlot(index, { kind: event.target.value as SlotKind })}>{(Object.keys(slotKindLabels) as SlotKind[]).map((kind) => <option key={kind} value={kind}>{slotKindLabels[kind]}</option>)}</select></label>
            <label className="field rj-slot-editor-hint"><span>Orientação (opcional)</span><input value={slot.hint ?? ""} placeholder="Pasta compartilhada com o cliente" onChange={(event) => updateSlot(index, { hint: event.target.value })} /></label>
            <label className="rj-check"><input type="checkbox" checked={slot.required} onChange={(event) => updateSlot(index, { required: event.target.checked })} /> Obrigatório</label>
            <button className="icon-button danger" type="button" title="Remover espaço" onClick={() => setSlots(slots.filter((_, current) => current !== index))}><Trash2 size={14} /></button>
          </div>
        ))}
        <button className="secondary-button" type="button" onClick={() => setSlots([...slots, { id: crypto.randomUUID(), label: "", kind: "google-drive", required: true }])}><Plus size={14} /> Adicionar espaço de link</button>
      </div>

      <div className="rj-editor-section">
        <div className="rj-editor-section-head"><strong>Links de referência (iguais para todos os projetos)</strong><small>Ex.: modelo de documento, pasta padrão. Opcional.</small></div>
        {fixed.map((link, index) => (
          <div className="rj-fixed-editor" key={link.id}>
            <input aria-label="Nome do link" value={link.title} placeholder="Nome" onChange={(event) => onChange({ links: fixed.map((item, current) => current === index ? { ...item, title: event.target.value } : item) })} />
            <input aria-label="Endereço do link" value={link.url} placeholder="https://" onChange={(event) => onChange({ links: fixed.map((item, current) => current === index ? { ...item, url: event.target.value } : item) })} />
            <button className="icon-button danger" type="button" title="Remover link" onClick={() => onChange({ links: fixed.filter((_, current) => current !== index) })}><Trash2 size={14} /></button>
          </div>
        ))}
        <button className="secondary-button" type="button" onClick={() => onChange({ links: [...fixed, { id: crypto.randomUUID(), title: "", url: "" }] })}><Plus size={14} /> Adicionar link de referência</button>
      </div>
    </div>
  );
}
