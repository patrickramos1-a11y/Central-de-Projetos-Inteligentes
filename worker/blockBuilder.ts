type Env = { DB: D1Database };

type StructureRow = {
  id: string;
  project_step_id: string | null;
  version_number: number;
  revision: number;
  state: "draft" | "published" | "archived";
  title: string;
  document_json: string;
};

type StepBlock = {
  id: string;
  type: string;
  order: number;
  title: string;
  description?: string | null;
  required: boolean;
  visible: boolean;
  editableInExecution: boolean;
  collapsedByDefault: boolean;
  config: Record<string, unknown>;
};

type StepDocument = {
  schemaVersion: number;
  ownerType: "project" | "client" | "template";
  projectId?: string;
  stepId: string;
  structureId: string;
  title: string;
  status: string;
  state: "draft" | "published" | "archived";
  versionNumber: number;
  revision: number;
  blocks: StepBlock[];
  completionRules: Array<{ id: string; type: string; enabled: boolean; message?: string }>;
};

const STEP_SCHEMA_VERSION = 1;
const jsonHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,cf-access-jwt-assertion",
  "content-type": "application/json",
};

export async function handleProjectStepRequest(request: Request, env: Env, stepId: string, parts: string[]) {
  if (request.method === "GET" && parts[0] === "structure") {
    const structure = await ensureDraftStructure(env.DB, stepId);
    return json({ data: await buildPayload(env.DB, stepId, structure) });
  }

  if (request.method === "GET" && parts[0] === "completion") {
    const structure = await ensureDraftStructure(env.DB, stepId);
    const payload = await buildPayload(env.DB, stepId, structure);
    return json({ data: payload.completion });
  }

  if (request.method === "POST" && parts[0] === "blocks" && parts[1] === "reorder") {
    const body = (await request.json()) as { blockIds?: string[] };
    const structure = await ensureDraftStructure(env.DB, stepId);
    const document = parseDocument(structure);
    const orderMap = new Map((body.blockIds ?? []).map((id, index) => [id, index + 1]));
    document.blocks = normalizeBlocks(document.blocks.map((block) => ({ ...block, order: orderMap.get(block.id) ?? block.order })));
    await saveDocument(env.DB, structure, document, "blocks_reordered", null, { blockIds: body.blockIds ?? [] });
    return json({ data: await buildPayload(env.DB, stepId, await getStructureById(env.DB, structure.id)) });
  }

  if (request.method === "POST" && parts[0] === "blocks" && !parts[1]) {
    const body = (await request.json()) as { type?: string; title?: string; parentBlockId?: string | null };
    const structure = await ensureDraftStructure(env.DB, stepId);
    const document = parseDocument(structure);
    const block = createBlock(body.type || "long_text", document.blocks.length + 1, body.title, body.parentBlockId ?? null);
    document.blocks = normalizeBlocks([...document.blocks, block]);
    await saveDocument(env.DB, structure, document, "block_created", block.id, { type: block.type, title: block.title });
    return json({ data: await buildPayload(env.DB, stepId, await getStructureById(env.DB, structure.id)) });
  }

  if (request.method === "PATCH" && parts[0] === "blocks" && parts[1]) {
    const blockId = parts[1];
    const body = (await request.json()) as Partial<StepBlock>;
    const structure = await ensureDraftStructure(env.DB, stepId);
    const document = parseDocument(structure);
    document.blocks = document.blocks.map((block) => block.id === blockId ? {
      ...block,
      title: typeof body.title === "string" ? body.title : block.title,
      description: body.description === undefined ? block.description : body.description,
      required: typeof body.required === "boolean" ? body.required : block.required,
      visible: typeof body.visible === "boolean" ? body.visible : block.visible,
      editableInExecution: typeof body.editableInExecution === "boolean" ? body.editableInExecution : block.editableInExecution,
      collapsedByDefault: typeof body.collapsedByDefault === "boolean" ? body.collapsedByDefault : block.collapsedByDefault,
      config: typeof body.config === "object" && body.config ? { ...block.config, ...body.config } : block.config,
    } : block);
    await saveDocument(env.DB, structure, document, "block_updated", blockId, body as Record<string, unknown>);
    return json({ data: await buildPayload(env.DB, stepId, await getStructureById(env.DB, structure.id)) });
  }

  if (request.method === "DELETE" && parts[0] === "blocks" && parts[1]) {
    const blockId = parts[1];
    const structure = await ensureDraftStructure(env.DB, stepId);
    const document = parseDocument(structure);
    document.blocks = normalizeBlocks(document.blocks.filter((block) => block.id !== blockId && block.config.parentBlockId !== blockId));
    await env.DB.prepare("delete from project_step_block_values where project_step_id = ? and block_id = ?").bind(stepId, blockId).run();
    await saveDocument(env.DB, structure, document, "block_deleted", blockId, {});
    return json({ data: await buildPayload(env.DB, stepId, await getStructureById(env.DB, structure.id)) });
  }

  if (request.method === "PATCH" && parts[0] === "block-values" && parts[1]) {
    const blockId = parts[1];
    const body = (await request.json()) as { value?: unknown; updatedBy?: string };
    const structure = await ensureDraftStructure(env.DB, stepId);
    const document = parseDocument(structure);
    const block = document.blocks.find((item) => item.id === blockId);
    if (!block) return jsonError("Bloco nao encontrado.", 404);
    const completionState = isBlockComplete(block, body.value, []) ? "complete" : isEmpty(body.value) ? "empty" : "partial";
    await upsertBlockValue(env.DB, stepId, structure.id, blockId, body.value ?? null, completionState, body.updatedBy ?? null);
    await logEvent(env.DB, stepId, structure.id, blockId, "block_value_saved", { completionState }, body.updatedBy ?? null);
    const payload = await buildPayload(env.DB, stepId, await getStructureById(env.DB, structure.id));
    await env.DB.prepare("update project_steps set status = ?, updated_at = ? where id = ?").bind(payload.completion.status, new Date().toISOString(), stepId).run();
    return json({ data: payload });
  }

  if (request.method === "POST" && parts[0] === "publish-structure") {
    const structure = await ensureDraftStructure(env.DB, stepId);
    const now = new Date().toISOString();
    await env.DB.prepare("update project_step_structures set state = 'archived', archived_at = ?, updated_at = ? where project_step_id = ? and state = 'published'").bind(now, now, stepId).run();
    await env.DB.prepare("update project_step_structures set state = 'published', published_at = ?, updated_at = ? where id = ?").bind(now, now, structure.id).run();
    await logEvent(env.DB, stepId, structure.id, null, "structure_published", {}, null);
    return json({ data: await buildPayload(env.DB, stepId, await getStructureById(env.DB, structure.id)) });
  }

  return jsonError("Metodo nao permitido.", 405);
}
async function ensureDraftStructure(db: D1Database, stepId: string): Promise<StructureRow> {
  const draft = await db.prepare("select * from project_step_structures where project_step_id = ? and state = 'draft' order by version_number desc limit 1").bind(stepId).first<StructureRow>();
  if (draft) return draft;

  const published = await db.prepare("select * from project_step_structures where project_step_id = ? and state = 'published' order by version_number desc limit 1").bind(stepId).first<StructureRow>();
  if (published) {
    const document = parseDocument(published);
    const id = crypto.randomUUID();
    const version = Number(published.version_number || 1) + 1;
    const cloned = { ...document, structureId: id, state: "draft" as const, versionNumber: version, revision: 1 };
    await insertStructure(db, id, stepId, cloned.title, cloned, version, 1, "draft");
    return getStructureById(db, id);
  }

  const step = await db.prepare("select * from project_steps where id = ?").bind(stepId).first<Record<string, unknown>>();
  if (!step) throw new Error("Etapa nao encontrada.");

  const id = crypto.randomUUID();
  const document = await buildLegacyDocument(db, step, id);
  await insertStructure(db, id, stepId, document.title, document, 1, 1, "draft");
  await logEvent(db, stepId, id, null, "structure_created_from_legacy", { blockCount: document.blocks.length }, null);
  return getStructureById(db, id);
}

async function insertStructure(db: D1Database, id: string, stepId: string, title: string, document: StepDocument, version: number, revision: number, state: string) {
  await db.prepare("insert into project_step_structures (id, owner_type, project_step_id, schema_version, version_number, revision, state, title, document_json, created_at, updated_at) values (?, 'project', ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, stepId, STEP_SCHEMA_VERSION, version, revision, state, title, JSON.stringify(document), new Date().toISOString(), new Date().toISOString())
    .run();
}

async function buildLegacyDocument(db: D1Database, step: Record<string, unknown>, structureId: string): Promise<StepDocument> {
  const blocks: StepBlock[] = [];
  const stepId = String(step.id);
  const projectId = String(step.project_id ?? "");
  const add = (block: StepBlock) => blocks.push({ ...block, order: blocks.length + 1 });
  const addLong = (title: string, value: unknown, legacySource: string) => {
    const content = String(value ?? "").trim();
    if (content) add(createBlock("long_text", blocks.length + 1, title, null, { mode: "input", content, rows: 4, legacySource }));
  };

  addLong("Objetivo da etapa", step.objective, "project_steps.objective");
  addLong("Instrucoes de execucao", step.execution_instructions, "project_steps.execution_instructions");
  addLong("Resultado esperado", step.expected_output, "project_steps.expected_output");
  addLong("Observacoes da execucao", step.notes, "project_steps.notes");

  const phases = await db.prepare("select * from project_step_phases where project_step_id = ? order by phase_order asc").bind(stepId).all<Record<string, unknown>>();
  for (const phase of phases.results ?? []) {
    add(createBlock("phase", blocks.length + 1, String(phase.title ?? "Fase"), null, {
      legacySource: "project_step_phases",
      legacyId: String(phase.id),
      content: phase.description ?? "",
      status: phase.status ?? "pendente",
      requiresPreviousPhase: Boolean(phase.requires_previous_phase),
      prerequisitePhaseId: phase.prerequisite_phase_id ?? null,
      completionCondition: phase.completion_condition ?? null,
    }));
  }

  const checklist = await db.prepare("select * from project_step_checklist_items where project_step_id = ? order by item_order asc").bind(stepId).all<Record<string, unknown>>();
  if ((checklist.results ?? []).length) {
    add(createBlock("checklist", blocks.length + 1, "Checklist", null, {
      legacySource: "project_step_checklist_items",
      completionMode: "all_required",
      items: (checklist.results ?? []).map((item, index) => ({
        id: String(item.id),
        label: String(item.label ?? "Item"),
        order: Number(item.item_order ?? index + 1),
        required: true,
        requiresFile: false,
        acceptedFileTypes: [],
        done: Boolean(item.is_done),
      })),
    }));
  }

  const prompts = await db.prepare("select * from project_step_prompts where project_step_id = ? order by prompt_order asc").bind(stepId).all<Record<string, unknown>>();
  for (const prompt of prompts.results ?? []) {
    add(createBlock("prompt", blocks.length + 1, String(prompt.title ?? "Prompt"), null, {
      legacySource: "project_step_prompts",
      legacyId: String(prompt.id),
      promptId: prompt.prompt_id ?? null,
      toolId: prompt.ai_tool_id ?? null,
      contentSnapshot: prompt.content ?? "",
      expectedOutput: prompt.usage_notes ?? prompt.placeholder_note ?? "",
      executionMode: "manual",
      promptStatus: prompt.prompt_status ?? "pendente",
    }));
  }

  const contexts = await db.prepare("select * from project_step_contexts where project_step_id = ? order by context_order asc").bind(stepId).all<Record<string, unknown>>();
  for (const context of contexts.results ?? []) {
    add(createBlock("context", blocks.length + 1, String(context.title ?? "Contexto"), null, {
      legacySource: "project_step_contexts",
      legacyId: String(context.id),
      phaseId: context.phase_id ?? null,
      content: context.content ?? "",
      compact: true,
    }));
  }

  const links = await db.prepare("select * from project_step_links where project_step_id = ? order by link_order asc").bind(stepId).all<Record<string, unknown>>();
  if ((links.results ?? []).length) {
    add(createBlock("materials", blocks.length + 1, "Materiais e links", null, {
      legacySource: "project_step_links",
      links: (links.results ?? []).map((link) => ({ id: String(link.id), title: String(link.title ?? "Link"), url: String(link.url ?? ""), notes: link.notes ?? null })),
    }));
  }

  const summary = await getSummaryForStep(db, step);
  if (summary) {
    add(createBlock("project_summary", blocks.length + 1, "Sumario inteligente", null, {
      summaryId: String(summary.id),
      compact: true,
      legacySource: "project_summaries",
    }));
  }

  return {
    schemaVersion: STEP_SCHEMA_VERSION,
    ownerType: "project",
    projectId,
    stepId,
    structureId,
    title: String(step.name ?? "Etapa"),
    status: String(step.status ?? "pendente"),
    state: "draft",
    versionNumber: 1,
    revision: 1,
    blocks: normalizeBlocks(blocks),
    completionRules: [{ id: crypto.randomUUID(), type: "required_blocks_completed", enabled: true }],
  };
}

async function getSummaryForStep(db: D1Database, step: Record<string, unknown>) {
  const projectId = String(step.project_id ?? "");
  const summaries = await db.prepare("select * from project_summaries where project_id = ? order by case status when 'active' then 0 else 1 end, version_number desc limit 1").bind(projectId).all<Record<string, unknown>>();
  const summary = summaries.results?.[0];
  if (!summary) return null;

  const steps = await db.prepare("select id, name, objective, description, execution_instructions, step_order from project_steps where project_id = ? order by step_order asc").bind(projectId).all<Record<string, unknown>>();
  const allSteps = steps.results ?? [];
  const summaryStep = allSteps.find((item) => normalizeText(`${item.name ?? ""} ${item.objective ?? ""} ${item.description ?? ""} ${item.execution_instructions ?? ""}`).includes("sumario")) ?? allSteps[0];
  return summaryStep && String(summaryStep.id) === String(step.id) ? summary : null;
}

function createBlock(type: string, order: number, title?: string, parentBlockId?: string | null, extraConfig?: Record<string, unknown>): StepBlock {
  const config: Record<string, unknown> = { parentBlockId: parentBlockId ?? null };
  if (type === "long_text") Object.assign(config, { mode: "input", content: "", rows: 4 });
  if (type === "short_text") Object.assign(config, { placeholder: "" });
  if (type === "checklist") Object.assign(config, { items: [], completionMode: "all_required" });
  if (type === "prompt") Object.assign(config, { contentSnapshot: "", expectedOutput: "", executionMode: "manual" });
  if (type === "context") Object.assign(config, { content: "", compact: true });
  if (type === "project_summary") Object.assign(config, { summaryId: null, compact: true });
  if (type === "materials") Object.assign(config, { links: [] });
  if (type === "file_upload") Object.assign(config, { acceptedFileTypes: ["pdf", "jpg", "png"], maxFiles: 10 });
  if (type === "phase") Object.assign(config, { status: "pendente", content: "" });

  Object.assign(config, extraConfig ?? {});

  return {
    id: crypto.randomUUID(),
    type,
    order,
    title: title?.trim() || blockTypeLabel(type),
    required: false,
    visible: true,
    editableInExecution: true,
    collapsedByDefault: false,
    config,
  };
}

function blockTypeLabel(type: string) {
  const labels: Record<string, string> = {
    phase: "Fase",
    section: "Secao",
    short_text: "Texto curto",
    long_text: "Texto longo",
    checklist: "Checklist",
    prompt: "Prompt",
    context: "Contexto",
    project_summary: "Sumario inteligente",
    materials: "Materiais e links",
    file_upload: "Upload de arquivo",
    comment: "Comentario",
    status: "Status",
    responsible: "Responsavel",
    date: "Data",
  };
  return labels[type] ?? "Bloco";
}

function parseDocument(row: StructureRow): StepDocument {
  const parsed = JSON.parse(row.document_json || "{}") as StepDocument;
  return {
    ...parsed,
    structureId: row.id,
    state: row.state,
    versionNumber: Number(row.version_number),
    revision: Number(row.revision),
    blocks: normalizeBlocks(parsed.blocks ?? []),
  };
}

function normalizeBlocks(blocks: StepBlock[]) {
  return [...blocks].sort((left, right) => Number(left.order) - Number(right.order)).map((block, index) => ({ ...block, order: index + 1 }));
}

async function saveDocument(db: D1Database, structure: StructureRow, document: StepDocument, eventType: string, blockId: string | null, payload: Record<string, unknown>) {
  const nextRevision = Number(structure.revision || 1) + 1;
  const nextDocument = { ...document, revision: nextRevision, blocks: normalizeBlocks(document.blocks) };
  await db.prepare("update project_step_structures set document_json = ?, revision = ?, title = ?, updated_at = ? where id = ?").bind(JSON.stringify(nextDocument), nextRevision, nextDocument.title, new Date().toISOString(), structure.id).run();
  await logEvent(db, String(structure.project_step_id), structure.id, blockId, eventType, payload, null);
}

async function getStructureById(db: D1Database, id: string) {
  const row = await db.prepare("select * from project_step_structures where id = ?").bind(id).first<StructureRow>();
  if (!row) throw new Error("Estrutura nao encontrada.");
  return row;
}

async function buildPayload(db: D1Database, stepId: string, structure: StructureRow) {
  const document = parseDocument(structure);
  const values = await db.prepare("select * from project_step_block_values where project_step_id = ?").bind(stepId).all<Record<string, unknown>>();
  const files = await db.prepare("select * from project_step_block_files where project_step_id = ?").bind(stepId).all<Record<string, unknown>>();
  const parsedValues = (values.results ?? []).map((row) => ({ ...row, value: safeJson(String(row.value_json ?? "null")) }));
  const completion = calculateCompletion(document, parsedValues, files.results ?? []);
  return { structure, document, values: parsedValues, files: files.results ?? [], completion };
}

async function upsertBlockValue(db: D1Database, stepId: string, structureId: string, blockId: string, value: unknown, completionState: string, updatedBy: string | null) {
  const existing = await db.prepare("select id from project_step_block_values where project_step_id = ? and block_id = ?").bind(stepId, blockId).first<{ id: string }>();
  const now = new Date().toISOString();
  const valueJson = JSON.stringify(value ?? null);
  if (existing) {
    await db.prepare("update project_step_block_values set structure_id = ?, value_json = ?, completion_state = ?, updated_by = ?, updated_at = ? where id = ?").bind(structureId, valueJson, completionState, updatedBy, now, existing.id).run();
    return;
  }
  await db.prepare("insert into project_step_block_values (id, project_step_id, structure_id, block_id, value_json, completion_state, updated_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), stepId, structureId, blockId, valueJson, completionState, updatedBy, now, now).run();
}

async function logEvent(db: D1Database, stepId: string, structureId: string, blockId: string | null, eventType: string, payload: Record<string, unknown>, createdBy: string | null) {
  await db.prepare("insert into project_step_block_events (id, project_step_id, structure_id, block_id, event_type, event_payload_json, created_by, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), stepId, structureId, blockId, eventType, JSON.stringify(payload), createdBy, new Date().toISOString()).run();
}

function calculateCompletion(document: StepDocument, valueRows: Array<Record<string, unknown>>, fileRows: Array<Record<string, unknown>>) {
  const valueMap = new Map(valueRows.map((row) => [String(row.block_id), row.value]));
  const progressBlocks = document.blocks.filter((block) => block.visible && !["section", "phase", "comment"].includes(block.type));
  const requiredBlocks = progressBlocks.filter((block) => block.required);
  const measuredBlocks = requiredBlocks.length ? requiredBlocks : progressBlocks;
  const completed = measuredBlocks.filter((block) => isBlockComplete(block, valueMap.get(block.id), fileRows));
  const reasons = measuredBlocks.filter((block) => !isBlockComplete(block, valueMap.get(block.id), fileRows)).map((block) => ({ code: "required_block_incomplete", message: `Preencha o bloco ${block.title}.`, blockId: block.id }));
  const total = measuredBlocks.length;
  const progress = total ? Math.round((completed.length / total) * 100) : 0;
  const anyContent = progressBlocks.some((block) => isBlockComplete(block, valueMap.get(block.id), fileRows) || !isEmpty(valueMap.get(block.id)) || !isEmpty(block.config.content) || !isEmpty(block.config.contentSnapshot));
  const status = total > 0 && completed.length === total ? "concluido" : anyContent ? "em_andamento" : "pendente";
  return { status, progress, completedBlocks: completed.length, totalBlocks: total, canComplete: total > 0 && completed.length === total, reasons };
}

function isBlockComplete(block: StepBlock, value: unknown, fileRows: Array<Record<string, unknown>>) {
  if (block.type === "file_upload") return fileRows.some((file) => file.block_id === block.id);
  if (block.type === "project_summary") return Boolean(block.config.summaryId);
  if (block.type === "materials") return Array.isArray(block.config.links) && block.config.links.length > 0;
  if (block.type === "prompt") return !isEmpty(block.config.contentSnapshot) || !isEmpty(value);
  if (block.type === "checklist") {
    const items = Array.isArray(block.config.items) ? (block.config.items as Array<Record<string, unknown>>) : [];
    if (!items.length) return false;
    const checked = typeof value === "object" && value && "checked" in value ? (value as { checked?: Record<string, boolean> }).checked ?? {} : {};
    return items.filter((item) => item.required !== false).every((item) => Boolean(checked[String(item.id)] ?? item.done));
  }
  return !isEmpty(value) || !isEmpty(block.config.content);
}

function isEmpty(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function safeJson(value: string) {
  try { return JSON.parse(value); } catch { return null; }
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

function jsonError(error: string, status = 400) {
  return json({ data: null, error }, status);
}
