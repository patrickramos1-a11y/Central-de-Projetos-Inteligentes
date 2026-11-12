// "Links e diretórios" block: the template defines expected link slots
// (e.g. "Projetos básicos — Google Drive") and each project fills them.
// Filled slots are stored as runtime links tagged with slotId so existing
// readers (Local de trabalho, Gestão) keep seeing them as ordinary links.

export type SlotKind = "any" | "google-drive" | "notebooklm" | "google-photos" | "chatgpt" | "claude" | "server";

export type MaterialSlot = { id: string; label: string; kind: SlotKind; required: boolean; hint?: string };
export type RuntimeLink = { id: string; title: string; url: string; slotId?: string; updatedBy?: string | null; updatedAt?: string };

type AnyRecord = Record<string, unknown>;
const asRecord = (value: unknown): AnyRecord => (value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {});

export const slotKindLabels: Record<SlotKind, string> = {
  any: "Qualquer link",
  "google-drive": "Google Drive",
  notebooklm: "NotebookLM",
  "google-photos": "Google Fotos",
  chatgpt: "ChatGPT",
  claude: "Claude",
  server: "Pasta do servidor",
};

export function readSlots(config: unknown, options: { includeIncomplete?: boolean } = {}): MaterialSlot[] {
  const raw = asRecord(config).slots;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const slot = asRecord(item);
    const id = String(slot.id ?? "").trim();
    const label = String(slot.label ?? "").trim();
    if (!id || (!label && !options.includeIncomplete)) return [];
    const kind = (Object.keys(slotKindLabels) as SlotKind[]).includes(slot.kind as SlotKind) ? slot.kind as SlotKind : "any";
    return [{ id, label, kind, required: slot.required !== false, hint: typeof slot.hint === "string" && slot.hint.trim() ? slot.hint.trim() : undefined }];
  });
}

export function readRuntimeLinks(value: unknown): RuntimeLink[] {
  const raw = asRecord(value).links;
  return Array.isArray(raw) ? raw.map(asRecord).filter((link) => String(link.url ?? "").trim()).map((link) => ({
    id: String(link.id ?? ""), title: String(link.title ?? ""), url: String(link.url ?? ""),
    slotId: typeof link.slotId === "string" ? link.slotId : undefined,
    updatedBy: typeof link.updatedBy === "string" ? link.updatedBy : null,
    updatedAt: typeof link.updatedAt === "string" ? link.updatedAt : undefined,
  })) : [];
}

export function readNotApplicableSlots(value: unknown): Set<string> {
  const raw = asRecord(asRecord(value).slotNotApplicable);
  return new Set(Object.entries(raw).filter(([, flag]) => Boolean(flag)).map(([id]) => id));
}

/** Slots that still block completion. */
export function pendingRequiredSlots(config: unknown, value: unknown): MaterialSlot[] {
  const filled = new Set(readRuntimeLinks(value).map((link) => link.slotId).filter(Boolean));
  const notApplicable = readNotApplicableSlots(value);
  return readSlots(config).filter((slot) => slot.required && !filled.has(slot.id) && !notApplicable.has(slot.id));
}

/**
 * Completion for the materials block.
 * - With slots: every required slot is filled or marked not applicable
 *   (a block whose slots are all optional is complete once anything is filled).
 * - Without slots (legacy): at least one link exists.
 */
export function isMaterialsComplete(config: unknown, value: unknown): boolean {
  const slots = readSlots(config);
  const fixedLinks = Array.isArray(asRecord(config).links) ? asRecord(config).links as unknown[] : [];
  const runtime = readRuntimeLinks(value);
  if (slots.length) {
    if (pendingRequiredSlots(config, value).length) return false;
    if (slots.some((slot) => slot.required)) return true;
    return runtime.length > 0 || readNotApplicableSlots(value).size > 0;
  }
  return [...fixedLinks.map(asRecord), ...runtime].some((link) => String((link as AnyRecord).url ?? "").trim().length > 0);
}

export function materialsPendingMessage(config: unknown, value: unknown, blockTitle: string): string {
  const pending = pendingRequiredSlots(config, value);
  if (!pending.length) return `Conclua ${blockTitle}.`;
  return pending.length === 1 ? `Preencha o link "${pending[0].label}" em ${blockTitle}.` : `Preencha ${pending.length} links pendentes em ${blockTitle}.`;
}
