type Env = { DB: D1Database; FILES?: R2Bucket };
type OwnerType = "project" | "client" | "template";

type Block = {
  id: string;
  type: string;
  order: number;
  title: string;
  required?: boolean;
  visible?: boolean;
  editableInExecution?: boolean;
  collapsedByDefault?: boolean;
  config?: Record<string, unknown>;
};

type StepDocument = {
  schemaVersion: number;
  ownerType: OwnerType;
  projectId?: string;
  clientId?: string;
  templateId?: string;
  stepId: string;
  structureId: string;
  title: string;
  status: string;
  state: "draft" | "published" | "archived";
  versionNumber: number;
  revision: number;
  blocks: Block[];
  completionRules: Array<{ id: string; type: string; enabled: boolean; message?: string }>;
};

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,cf-access-jwt-assertion",
  "content-type": "application/json",
};

export async function handleJourneyDomainRequest(request: Request, env: Env, parts: string[], url: URL): Promise<Response | null> {
  const [api, resource, id, action, nested, nestedId] = parts;
  if (api !== "api") return null;

  if (resource === "admin" && id === "migrate-canonical" && request.method === "POST") {
    return json({ data: await migrateLegacyJourneyData(env.DB) });
  }

  if (resource === "journey-steps" && isOwnerType(id) && action) {
    return handleGenericStepRequest(request, env, id, action, nested, nestedId);
  }

  if (resource === "projects" && id && action === "journey" && request.method === "GET") {
    return json({ data: await getJourney(env.DB, "project", id) });
  }

  if (resource === "clients" && id && action === "journey" && request.method === "GET") {
    return json({ data: await getJourney(env.DB, "client", id) });
  }

  if (resource === "projects" && id && action === "templates" && request.method === "POST") {
    const body = await request.json<{ name?: string; templateId?: string | null; createdBy?: string }>();
    return json(await saveProjectAsTemplate(env, id, body.name, body.createdBy ?? null, body.templateId ?? null), 201);
  }

  if (resource === "journey-templates" && id && request.method === "PATCH") {
    const body = await request.json<{ name?: string; description?: string | null; status?: string }>();
    return json(await updateJourneyTemplate(env.DB, id, body));
  }

  if (resource === "journey-templates" && id && request.method === "DELETE") {
    return json(await deleteJourneyTemplate(env.DB, id));
  }

  if (resource === "clients" && id && action === "templates" && request.method === "POST") {
    const body = await request.json() as { name?: string; createdBy?: string };
    return json({ data: await saveClientAsTemplate(env.DB, id, body.name, body.createdBy ?? null) }, 201);
  }

  if ((resource === "project-steps" || resource === "client-steps") && id && action === "checklists" && nested && nestedId && request.method === "PATCH") {
    const body = await request.json<{ checked?: boolean; updatedBy?: string }>();
    const ownerType: OwnerType = resource === "project-steps" ? "project" : "client";
    return json({ data: await updateChecklistItem(env.DB, ownerType, id, nested, nestedId, Boolean(body.checked), body.updatedBy ?? null) });
  }

  if ((resource === "project-steps" || resource === "client-steps") && id && action === "contexts" && request.method === "POST") {
    const body = await request.json<{ blockId?: string; title?: string; content?: string; color?: string; createdBy?: string }>();
    const ownerType: OwnerType = resource === "project-steps" ? "project" : "client";
    if (!body.blockId) return error("Informe o bloco de contexto.");
    return json({ data: await createRuntimeContext(env.DB, ownerType, id, body.blockId, body, body.createdBy ?? null) }, 201);
  }

  if (resource === "summaries" && id && action === "consolidate" && request.method === "POST") {
    const body = await request.json<{ createdBy?: string }>();
    return json({ data: await consolidateSummary(env.DB, id, body.createdBy ?? null) }, 201);
  }

  if (resource === "summaries" && id && action === "prompts" && request.method === "POST") {
    const body = await request.json<{ itemIds?: string[]; finalPrompt?: string; basePromptId?: string | null; basePromptSnapshot?: string | null; aiToolId?: string | null; createdBy?: string | null; notes?: string | null }>();
    return json({ data: await saveSummaryPrompt(env.DB, id, body) }, 201);
  }

  if (resource === "journey-files" && id && action && nested) {
    return handleJourneyFileRequest(request, env, id as OwnerType, action, nested, nestedId, url);
  }

  return null;
}

async function handleGenericStepRequest(request: Request, env: Env, ownerType: OwnerType, stepId: string, action?: string, nested?: string) {
  const db = env.DB;
  if (request.method === "POST" && action === "initialize") {
    const body = await request.json().catch(() => ({})) as { templateStepId?: string };
    const existing = await getCurrentDocument(db, ownerType, stepId, false);
    if (existing) return json({ data: await genericPayload(db, ownerType, stepId, existing) });
    const step = await getStepRow(db, ownerType, stepId);
    if (!step) return error("Etapa nao encontrada.", 404);
    const templateRow = body.templateStepId
      ? await db.prepare("select * from journey_step_documents where owner_type = 'template' and step_id = ? and state in ('draft', 'published') order by case state when 'published' then 0 else 1 end, version_number desc limit 1").bind(body.templateStepId).first<Record<string, unknown>>()
      : null;
    const templateDocument = templateRow ? normalizeDocumentRow(templateRow).document : null;
    const document = templateDocument
      ? createRuntimeDocumentFromTemplate(templateDocument, ownerType, step, stepId)
      : ownerType === "client"
      ? await buildClientLegacyDocument(db, step, crypto.randomUUID())
      : await buildProjectLegacyDocument(db, step, crypto.randomUUID());
    await insertDocument(db, document, getOwnerId(ownerType, step), null);
    if (templateRow) await copyTemplateFilesToRuntime(env, ownerType, String(templateRow.step_id), stepId, document.structureId, document.blocks);
    return json({ data: await genericPayload(db, ownerType, stepId, await getCurrentDocument(db, ownerType, stepId)) }, 201);
  }

  if (request.method === "GET" && action === "structure") {
    const document = await getCurrentDocument(db, ownerType, stepId);
    return json({ data: await genericPayload(db, ownerType, stepId, document) });
  }

  if (request.method === "POST" && action === "blocks" && !nested) {
    const body = await request.json() as { type?: string; title?: string; parentBlockId?: string | null; updatedBy?: string };
    const documentRow = await getCurrentDocument(db, ownerType, stepId);
    const normalized = normalizeDocumentRow(documentRow).document;
    const block = createGenericBlock(body.type ?? "long_text", normalized.blocks.length + 1, body.title, body.parentBlockId ?? null);
    normalized.blocks = normalizeBlocks([...normalized.blocks, block]);
    await saveGenericDocument(db, documentRow, normalized, "block_created", block.id, { type: block.type }, body.updatedBy ?? null);
    return json({ data: await genericPayload(db, ownerType, stepId, await getCurrentDocument(db, ownerType, stepId)) }, 201);
  }

  if (request.method === "POST" && action === "blocks" && nested === "reorder") {
    const body = await request.json() as { blockIds?: string[]; updatedBy?: string };
    const documentRow = await getCurrentDocument(db, ownerType, stepId);
    const normalized = normalizeDocumentRow(documentRow).document;
    const order = new Map((body.blockIds ?? []).map((blockId, index) => [blockId, index + 1]));
    normalized.blocks = normalizeBlocks(normalized.blocks.map((block) => ({ ...block, order: order.get(block.id) ?? block.order })));
    await saveGenericDocument(db, documentRow, normalized, "blocks_reordered", null, { blockIds: body.blockIds ?? [] }, body.updatedBy ?? null);
    return json({ data: await genericPayload(db, ownerType, stepId, await getCurrentDocument(db, ownerType, stepId)) });
  }

  if (request.method === "PATCH" && action === "blocks" && nested) {
    const body = await request.json() as Partial<Block> & { updatedBy?: string };
    const documentRow = await getCurrentDocument(db, ownerType, stepId);
    const normalized = normalizeDocumentRow(documentRow).document;
    if (!normalized.blocks.some((block) => block.id === nested)) return error("Bloco nao encontrado.", 404);
    normalized.blocks = normalized.blocks.map((block) => block.id === nested ? {
      ...block,
      title: typeof body.title === "string" ? body.title : block.title,
      required: typeof body.required === "boolean" ? body.required : Boolean(block.required),
      visible: typeof body.visible === "boolean" ? body.visible : block.visible,
      editableInExecution: typeof body.editableInExecution === "boolean" ? body.editableInExecution : block.editableInExecution,
      collapsedByDefault: typeof body.collapsedByDefault === "boolean" ? body.collapsedByDefault : block.collapsedByDefault,
      config: body.config && typeof body.config === "object" ? { ...(block.config ?? {}), ...body.config } : block.config,
    } : block);
    await saveGenericDocument(db, documentRow, normalized, "block_updated", nested, body, body.updatedBy ?? null);
    return json({ data: await genericPayload(db, ownerType, stepId, await getCurrentDocument(db, ownerType, stepId)) });
  }

  if (request.method === "DELETE" && action === "blocks" && nested) {
    const documentRow = await getCurrentDocument(db, ownerType, stepId);
    const normalized = normalizeDocumentRow(documentRow).document;
    normalized.blocks = normalizeBlocks(normalized.blocks.filter((block) => block.id !== nested && block.config?.parentBlockId !== nested));
    await db.prepare("delete from journey_step_values where owner_type = ? and owner_step_id = ? and block_id = ?").bind(ownerType, stepId, nested).run();
    await saveGenericDocument(db, documentRow, normalized, "block_deleted", nested, {}, null);
    return json({ data: await genericPayload(db, ownerType, stepId, await getCurrentDocument(db, ownerType, stepId)) });
  }

  if (request.method === "PATCH" && action === "block-values" && nested) {
    const body = await request.json() as { value?: unknown; updatedBy?: string };
    const documentRow = await getCurrentDocument(db, ownerType, stepId);
    const document = normalizeDocumentRow(documentRow).document;
    const block = document.blocks.find((candidate) => candidate.id === nested);
    if (!block) return error("Bloco nao encontrado.", 404);
    const completionState = isEmpty(body.value) ? "empty" : "partial";
    await saveRuntimeValue(db, ownerType, stepId, documentRow.id, nested, body.value ?? null, completionState, body.updatedBy ?? null, "block_value_saved");
    const payload = await genericPayload(db, ownerType, stepId, documentRow);
    await syncStepStatus(db, ownerType, stepId, payload.completion.status);
    return json({ data: payload });
  }

  return error("Metodo nao permitido.", 405);
}

async function getJourney(db: D1Database, ownerType: OwnerType, ownerId: string) {
  const entityTable = ownerType === "project" ? "projects" : "clients";
  const stepTable = ownerType === "project" ? "project_steps" : "client_steps";
  const ownerColumn = ownerType === "project" ? "project_id" : "client_id";
  const [entity, stepsResult, documentsResult] = await Promise.all([
    db.prepare(`select * from ${entityTable} where id = ?`).bind(ownerId).first(),
    db.prepare(`select * from ${stepTable} where ${ownerColumn} = ? order by step_order asc`).bind(ownerId).all(),
    db.prepare("select * from journey_step_documents where owner_type = ? and owner_id = ? and state != 'archived' order by version_number desc, updated_at desc")
      .bind(ownerType, ownerId).all(),
  ]);
  if (!entity) throw new Error("Jornada nao encontrada.");
  const stepIds = (stepsResult.results ?? []).map((step) => String((step as Record<string, unknown>).id));
  const values = stepIds.length
    ? await db.prepare(`select * from journey_step_values where owner_type = ? and owner_step_id in (${stepIds.map(() => "?").join(",")})`).bind(ownerType, ...stepIds).all()
    : { results: [] };
  return {
    ownerType,
    entity,
    steps: stepsResult.results ?? [],
    documents: (documentsResult.results ?? []).map(normalizeDocumentRow),
    values: (values.results ?? []).map((value) => ({ ...(value as Record<string, unknown>), value: parseJson(String((value as Record<string, unknown>).value_json ?? "null")) })),
  };
}

async function genericPayload(db: D1Database, ownerType: OwnerType, stepId: string, documentRow: Record<string, unknown>) {
  const document = normalizeDocumentRow(documentRow).document;
  const values = await db.prepare("select * from journey_step_values where owner_type = ? and owner_step_id = ?").bind(ownerType, stepId).all<Record<string, unknown>>();
  const files = await db.prepare("select * from journey_step_files where owner_type = ? and owner_step_id = ?").bind(ownerType, stepId).all<Record<string, unknown>>();
  const parsedValues = (values.results ?? []).map((value) => ({ ...value, value: parseJson(String(value.value_json ?? "null")) }));
  const completion = await calculateRuntimeCompletion(db, ownerType, stepId, documentRow);
  return { document, values: parsedValues, files: files.results ?? [], completion };
}

async function getStepRow(db: D1Database, ownerType: OwnerType, stepId: string) {
  const table = ownerType === "project" ? "project_steps" : ownerType === "client" ? "client_steps" : "journey_steps";
  return db.prepare(`select * from ${table} where id = ?`).bind(stepId).first<Record<string, unknown>>();
}

function getOwnerId(ownerType: OwnerType, step: Record<string, unknown>) {
  return ownerType === "project" ? String(step.project_id ?? "") : ownerType === "client" ? String(step.client_id ?? "") : String(step.journey_template_id ?? "");
}

function createRuntimeDocumentFromTemplate(templateDocument: StepDocument, ownerType: OwnerType, step: Record<string, unknown>, stepId: string): StepDocument {
  return {
    ...templateDocument,
    ownerType,
    projectId: ownerType === "project" ? getOwnerId(ownerType, step) : undefined,
    clientId: ownerType === "client" ? getOwnerId(ownerType, step) : undefined,
    templateId: undefined,
    stepId,
    structureId: crypto.randomUUID(),
    title: String(step.name ?? templateDocument.title),
    state: "draft",
    versionNumber: 1,
    revision: 1,
    // A project summary belongs to a single execution and cannot be reused by a template.
    blocks: templateDocument.blocks.map((block) => ownerType === "project" && block.type === "project_summary"
      ? { ...block, config: { ...(block.config ?? {}), summaryId: null } }
      : block),
  };
}

function createGenericBlock(type: string, order: number, title?: string, parentBlockId: string | null = null): Block {
  const config: Record<string, unknown> = { parentBlockId };
  if (type === "short_text") Object.assign(config, { mode: "info", content: "", maxLength: 180 });
  if (type === "long_text") Object.assign(config, { mode: "info", content: "", rows: 5 });
  if (type === "short_answer") Object.assign(config, { mode: "input", placeholder: "Digite a resposta", maxLength: 180 });
  if (type === "long_answer") Object.assign(config, { mode: "input", placeholder: "Digite a resposta", rows: 5 });
  if (type === "checklist") Object.assign(config, { items: [], completionMode: "all_required" });
  if (type === "prompt") Object.assign(config, {
    promptId: null,
    contentSnapshot: "",
    expectedOutput: "",
    executionMode: "manual",
    attachmentsEnabled: false,
    attachmentsRequired: false,
    allowMultipleFiles: true,
    maxFiles: 20,
    maxFileSizeMb: 25,
  });
  if (type === "context") Object.assign(config, { contexts: [] });
  if (type === "materials") Object.assign(config, { links: [] });
  if (type === "file_upload") Object.assign(config, {
    // An empty acceptedFileTypes array means every format is accepted.
    acceptedFileTypes: [],
    allowMultipleFiles: true,
    maxFiles: 20,
    maxFileSizeMb: 25,
    fileMode: "evidence",
  });
  if (type === "phase") Object.assign(config, { status: "pendente", content: "" });
  return { id: crypto.randomUUID(), type, order, title: title?.trim() || genericBlockLabel(type), required: false, visible: true, editableInExecution: true, collapsedByDefault: false, config };
}

function genericBlockLabel(type: string) {
  return ({ phase: "Fase", short_text: "Texto curto", long_text: "Texto longo", short_answer: "Resposta curta", long_answer: "Resposta longa", checklist: "Checklist", prompt: "Prompt", context: "Contexto", project_summary: "Sumario inteligente", materials: "Materiais e links", file_upload: "Evidencias", comment: "Comentario" } as Record<string, string>)[type] ?? "Bloco";
}

function normalizeBlocks(blocks: Block[]) { return [...blocks].sort((left, right) => left.order - right.order).map((block, index) => ({ ...block, order: index + 1 })); }

async function saveGenericDocument(db: D1Database, documentRow: Record<string, unknown>, document: StepDocument, eventType: string, blockId: string | null, payload: unknown, createdBy: string | null) {
  const revision = Number(documentRow.revision ?? 1) + 1;
  const nextDocument = { ...document, revision, blocks: normalizeBlocks(document.blocks) };
  const now = new Date().toISOString();
  await db.prepare("update journey_step_documents set title = ?, revision = ?, document_json = ?, updated_at = ? where id = ?")
    .bind(nextDocument.title, revision, JSON.stringify(nextDocument), now, documentRow.id).run();
  await logGenericEvent(db, nextDocument.ownerType, nextDocument.stepId, String(documentRow.id), blockId, eventType, payload, createdBy);
}

async function updateChecklistItem(db: D1Database, ownerType: OwnerType, stepId: string, blockId: string, itemId: string, checked: boolean, updatedBy: string | null) {
  const documentRow = await getCurrentDocument(db, ownerType, stepId);
  const document = normalizeDocumentRow(documentRow).document;
  const block = document.blocks.find((candidate) => candidate.id === blockId && candidate.type === "checklist");
  if (!block) throw new Error("Checklist nao encontrado nesta etapa.");
  const value = await getRuntimeValue(db, ownerType, stepId, blockId);
  const current = asRecord(value?.value);
  const checkedItems = asRecord(current.checked);
  const next = { ...current, checked: { ...checkedItems, [itemId]: checked }, updatedAt: new Date().toISOString() };
  await saveRuntimeValue(db, ownerType, stepId, documentRow.id, blockId, next, checked ? "partial" : "partial", updatedBy, "checklist_item_updated");
  const completion = await calculateRuntimeCompletion(db, ownerType, stepId, documentRow);
  await syncStepStatus(db, ownerType, stepId, completion.status);
  return { value: next, completion };
}

async function createRuntimeContext(
  db: D1Database,
  ownerType: OwnerType,
  stepId: string,
  blockId: string,
  body: { title?: string; content?: string; color?: string },
  createdBy: string | null,
) {
  const documentRow = await getCurrentDocument(db, ownerType, stepId);
  const document = normalizeDocumentRow(documentRow).document;
  const block = document.blocks.find((candidate) => candidate.id === blockId && candidate.type === "context");
  if (!block) throw new Error("Bloco de contexto nao encontrado.");
  const value = await getRuntimeValue(db, ownerType, stepId, blockId);
  const current = asRecord(value?.value);
  const context = {
    id: crypto.randomUUID(),
    title: String(body.title ?? "Contexto").trim() || "Contexto",
    content: String(body.content ?? "").trim(),
    color: normalizeContextColor(String(body.color ?? "mint")),
    createdAt: new Date().toISOString(),
  };
  if (!context.content) throw new Error("Escreva o conteudo do contexto.");
  const contexts = Array.isArray(current.contexts) ? current.contexts : [];
  const next = { ...current, contexts: [...contexts, context] };
  await saveRuntimeValue(db, ownerType, stepId, documentRow.id, blockId, next, "complete", createdBy, "context_created");
  const completion = await calculateRuntimeCompletion(db, ownerType, stepId, documentRow);
  await syncStepStatus(db, ownerType, stepId, completion.status);
  return { context, completion };
}

async function saveProjectAsTemplate(
  env: Env,
  projectId: string,
  requestedName?: string,
  createdBy: string | null = null,
  existingTemplateId: string | null = null,
) {
  const db = env.DB;
  const project = await db.prepare("select * from projects where id = ?").bind(projectId).first<Record<string, unknown>>();
  if (!project) throw new Error("Projeto nao encontrado.");
  const now = new Date().toISOString();
  let templateId = existingTemplateId;
  let mode: "created" | "updated" = "created";
  let currentTemplate: Record<string, unknown> | null = null;

  if (templateId) {
    currentTemplate = await db.prepare("select * from journey_templates where id = ? and context in ('projeto', 'geral')")
      .bind(templateId).first<Record<string, unknown>>();
    if (!currentTemplate) throw new Error("Template de projeto nao encontrado.");
    mode = "updated";
  } else {
    templateId = crypto.randomUUID();
  }

  const name = String(requestedName ?? currentTemplate?.name ?? `${project.name} - template`).trim() || "Template de jornada";

  if (mode === "updated") {
    await db.batch([
      db.prepare("delete from journey_step_values where owner_type = 'template' and owner_step_id in (select id from journey_steps where journey_template_id = ?)").bind(templateId),
      db.prepare("delete from journey_step_files where owner_type = 'template' and owner_step_id in (select id from journey_steps where journey_template_id = ?)").bind(templateId),
      db.prepare("delete from journey_step_events where owner_type = 'template' and owner_step_id in (select id from journey_steps where journey_template_id = ?)").bind(templateId),
      db.prepare("delete from journey_step_documents where owner_type = 'template' and owner_id = ?").bind(templateId),
      db.prepare("delete from journey_steps where journey_template_id = ?").bind(templateId),
      db.prepare("update journey_templates set name = ?, description = ?, project_type_id = ?, context = 'projeto', status = 'ativo' where id = ?")
        .bind(name, `Atualizado a partir do projeto ${project.name ?? ""}.`, project.project_type_id ?? null, templateId),
    ]);
  } else {
    await db.prepare("insert into journey_templates (id, name, description, project_type_id, context, status, created_at) values (?, ?, ?, ?, 'projeto', 'ativo', ?)")
      .bind(templateId, name, `Criado a partir do projeto ${project.name ?? ""}.`, project.project_type_id ?? null, now).run();
  }

  const steps = await db.prepare("select * from project_steps where project_id = ? order by step_order asc").bind(projectId).all<Record<string, unknown>>();
  for (const projectStep of steps.results ?? []) {
    const templateStepId = crypto.randomUUID();
    await db.prepare("insert into journey_steps (id, journey_template_id, name, description, step_order, objective, ai_tool_id, expected_output, checklist, execution_instructions, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, '', ?, 'ativo', ?)")
      .bind(templateStepId, templateId, projectStep.name ?? "Etapa", projectStep.description ?? null, projectStep.step_order ?? 1, projectStep.objective ?? null, projectStep.ai_tool_id ?? null, projectStep.expected_output ?? null, projectStep.execution_instructions ?? null, now).run();

    const source = await getCurrentDocument(db, "project", String(projectStep.id), false);
    if (!source) continue;
    const sourceDocument = normalizeDocumentRow(source).document;
    const templateDocument = await createProjectTemplateDocument(sourceDocument, templateId, templateStepId, String(projectStep.name ?? sourceDocument.title));
    await insertDocument(db, templateDocument, templateId, createdBy);
    await copyProjectFilesToTemplate(env, String(projectStep.id), templateStepId, templateDocument.structureId, templateDocument.blocks, createdBy);
  }
  await db.prepare("update projects set journey_template_id = ?, updated_at = ? where id = ?").bind(templateId, now, projectId).run();
  return { id: templateId, name, mode };
}

async function createProjectTemplateDocument(
  sourceDocument: StepDocument,
  templateId: string,
  templateStepId: string,
  title: string,
): Promise<StepDocument> {
  return {
    ...sourceDocument,
    ownerType: "template",
    projectId: undefined,
    templateId,
    stepId: templateStepId,
    structureId: crypto.randomUUID(),
    title,
    state: "published",
    versionNumber: 1,
    revision: 1,
    // Execution contexts remain with the project. Only contexts deliberately pinned in edit mode are reusable.
    blocks: sourceDocument.blocks.map((block) => {
      if (block.type !== "context") return block;
      const configured = Array.isArray(block.config?.contexts) ? (block.config?.contexts as Array<Record<string, unknown>>) : [];
      const contexts = configured.filter((context) => Boolean(context.pinned) && String(context.content ?? "").trim());
      return { ...block, config: { ...(block.config ?? {}), contexts } };
    }),
  };
}

async function updateJourneyTemplate(db: D1Database, templateId: string, patch: { name?: string; description?: string | null; status?: string }) {
  const template = await db.prepare("select * from journey_templates where id = ?").bind(templateId).first<Record<string, unknown>>();
  if (!template) throw new Error("Template nao encontrado.");
  const name = String(patch.name ?? template.name ?? "").trim();
  if (!name) throw new Error("Informe o nome do template.");
  const description = patch.description === undefined ? template.description ?? null : patch.description;
  const status = ["ativo", "inativo", "arquivado"].includes(String(patch.status)) ? patch.status : template.status ?? "ativo";
  await db.prepare("update journey_templates set name = ?, description = ?, status = ? where id = ?")
    .bind(name, description, status, templateId).run();
  return { ...template, id: templateId, name, description, status };
}

async function deleteJourneyTemplate(db: D1Database, templateId: string) {
  const template = await db.prepare("select * from journey_templates where id = ?").bind(templateId).first<Record<string, unknown>>();
  if (!template) throw new Error("Template nao encontrado.");
  await db.batch([
    db.prepare("delete from journey_step_values where owner_type = 'template' and owner_step_id in (select id from journey_steps where journey_template_id = ?)").bind(templateId),
    db.prepare("delete from journey_step_files where owner_type = 'template' and owner_step_id in (select id from journey_steps where journey_template_id = ?)").bind(templateId),
    db.prepare("delete from journey_step_events where owner_type = 'template' and owner_step_id in (select id from journey_steps where journey_template_id = ?)").bind(templateId),
    db.prepare("delete from journey_step_documents where owner_type = 'template' and owner_id = ?").bind(templateId),
    db.prepare("delete from journey_steps where journey_template_id = ?").bind(templateId),
    db.prepare("delete from journey_templates where id = ?").bind(templateId),
  ]);
  return { id: templateId, name: String(template.name ?? "Template") };
}

async function saveClientAsTemplate(db: D1Database, clientId: string, requestedName?: string, createdBy: string | null = null) {
  const client = await db.prepare("select * from clients where id = ?").bind(clientId).first<Record<string, unknown>>();
  if (!client) throw new Error("Cliente nao encontrado.");
  const templateId = crypto.randomUUID();
  const now = new Date().toISOString();
  const name = String(requestedName ?? `${client.name} - template`).trim() || "Template de cliente";
  await db.prepare("insert into journey_templates (id, name, description, project_type_id, context, status, created_at) values (?, ?, ?, ?, 'cliente', 'ativo', ?)")
    .bind(templateId, name, `Criado a partir da jornada de ${client.name ?? "cliente"}.`, client.project_type_id ?? null, now).run();
  const steps = await db.prepare("select * from client_steps where client_id = ? order by step_order asc").bind(clientId).all<Record<string, unknown>>();
  for (const clientStep of steps.results ?? []) {
    const templateStepId = crypto.randomUUID();
    await db.prepare("insert into journey_steps (id, journey_template_id, name, description, step_order, objective, expected_output, checklist, status, created_at) values (?, ?, ?, ?, ?, ?, ?, '', 'ativo', ?)")
      .bind(templateStepId, templateId, clientStep.name ?? "Etapa", clientStep.description ?? null, clientStep.step_order ?? 1, clientStep.objective ?? null, clientStep.required_evidence_label ?? null, now).run();
    const source = await getCurrentDocument(db, "client", String(clientStep.id), false);
    if (!source) continue;
    const sourceDocument = normalizeDocumentRow(source).document;
    const templateDocument: StepDocument = {
      ...sourceDocument,
      ownerType: "template",
      clientId: undefined,
      stepId: templateStepId,
      structureId: crypto.randomUUID(),
      title: String(clientStep.name ?? sourceDocument.title),
      state: "published",
      versionNumber: 1,
      revision: 1,
      blocks: sourceDocument.blocks.map((block) => block.type === "context"
        ? { ...block, config: { ...(block.config ?? {}), contexts: Array.isArray(block.config?.contexts) ? (block.config?.contexts as Array<Record<string, unknown>>).filter((context) => Boolean(context.pinned)) : [] } }
        : block),
    };
    await insertDocument(db, templateDocument, templateId, createdBy);
  }
  return { id: templateId, name };
}

async function consolidateSummary(db: D1Database, summaryId: string, createdBy: string | null) {
  const summary = await db.prepare("select * from project_summaries where id = ?").bind(summaryId).first<Record<string, unknown>>();
  if (!summary) throw new Error("Sumario nao encontrado.");
  const sourceItems = await db.prepare("select * from project_summary_items where summary_id = ? order by sort_order asc").bind(summaryId).all<Record<string, unknown>>();
  const normalized = normalizeSelectedSummaryItems(sourceItems.results ?? []);
  if (normalized.length === 0) throw new Error("Selecione pelo menos um topico para consolidar.");
  const nextId = crypto.randomUUID();
  const now = new Date().toISOString();
  const nextVersion = Number(summary.version_number ?? 0) + 1;
  const consolidatedText = normalized.map((item) => `${item.topic_number} ${item.title}`).join("\n");
  const statements: D1PreparedStatement[] = [
    db.prepare("update project_summaries set status = 'archived', archived_at = ?, updated_at = ? where project_id = ? and status = 'active'")
      .bind(now, now, summary.project_id),
    db.prepare("insert into project_summaries (id, project_id, raw_text, consolidated_text, version_number, status, parse_status, item_count, selected_item_count, prompt_config_json, created_by, created_at, updated_at, activated_at) values (?, ?, ?, ?, ?, 'active', 'reviewed', ?, ?, ?, ?, ?, ?, ?)")
      .bind(nextId, summary.project_id, summary.raw_text ?? "", consolidatedText, nextVersion, normalized.length, normalized.length, summary.prompt_config_json ?? "{}", createdBy, now, now, now),
  ];
  for (const item of normalized) {
    statements.push(db.prepare("insert into project_summary_items (id, summary_id, project_id, parent_id, topic_number, title, level, sort_order, original_text, is_selected, status, notes, parse_confidence, parse_warning, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)")
      .bind(item.id, nextId, summary.project_id, item.parent_id, item.topic_number, item.title, item.level, item.sort_order, item.original_text ?? "", item.status ?? "pendente", item.notes ?? null, item.parse_confidence ?? 1, item.parse_warning ?? null, now, now));
  }
  await db.batch(statements);
  return await db.prepare("select * from project_summaries where id = ?").bind(nextId).first();
}

async function saveSummaryPrompt(db: D1Database, summaryId: string, body: { itemIds?: string[]; finalPrompt?: string; basePromptId?: string | null; basePromptSnapshot?: string | null; aiToolId?: string | null; createdBy?: string | null; notes?: string | null }) {
  const summary = await db.prepare("select * from project_summaries where id = ?").bind(summaryId).first<Record<string, unknown>>();
  if (!summary) throw new Error("Sumario nao encontrado.");
  const itemIds = Array.from(new Set((body.itemIds ?? []).filter(Boolean)));
  const finalPrompt = String(body.finalPrompt ?? "").trim();
  if (!finalPrompt || itemIds.length === 0) throw new Error("Selecione topicos e gere o prompt antes de salvar.");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare("insert into generated_prompts (id, project_id, summary_id, summary_item_id, base_prompt_id, base_prompt_snapshot, selected_blocks_json, final_prompt, notes, ai_tool_id, created_by, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, summary.project_id, summaryId, itemIds[0], body.basePromptId ?? null, body.basePromptSnapshot ?? null, JSON.stringify({ schemaVersion: 1, summaryItemIds: itemIds }), finalPrompt, body.notes ?? `${itemIds.length} topicos selecionados`, body.aiToolId ?? null, body.createdBy ?? null, now).run();
  return await db.prepare("select * from generated_prompts where id = ?").bind(id).first();
}

async function handleJourneyFileRequest(request: Request, env: Env, ownerType: OwnerType, stepId: string, blockId: string, fileId: string | undefined, _url: URL) {
  if (!env.FILES) return error("R2 ainda nao esta habilitado nesta conta Cloudflare.", 503);
  if (!isOwnerType(ownerType)) return error("Tipo de jornada invalido.");
  const documentRow = await getCurrentDocument(env.DB, ownerType, stepId);
  const document = normalizeDocumentRow(documentRow).document;
  const block = document.blocks.find((candidate) => candidate.id === blockId && (candidate.type === "file_upload" || candidate.type === "prompt"));
  if (!block) return error("Bloco de arquivos nao encontrado.", 404);
  if (block.type === "prompt" && !Boolean(block.config?.attachmentsEnabled)) {
    return error("Os arquivos de apoio nao estao habilitados neste prompt.", 409);
  }

  if (request.method === "GET") {
    const records = await env.DB.prepare("select * from journey_step_files where owner_type = ? and owner_step_id = ? and block_id = ? order by created_at desc")
      .bind(ownerType, stepId, blockId).all();
    return json(records.results ?? []);
  }

  if (request.method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return error("Envie um arquivo.");
    const maxSizeMb = Number(block.config?.maxFileSizeMb ?? 25);
    if (file.size > maxSizeMb * 1024 * 1024) return error(`O arquivo excede ${maxSizeMb} MB.`);
    const accepted = block.type === "file_upload"
      ? []
      : Array.isArray(block.config?.acceptedFileTypes) ? block.config?.acceptedFileTypes.map(String) : [];
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (accepted.length > 0 && !accepted.includes(extension) && !accepted.includes(file.type)) return error("Tipo de arquivo nao aceito neste bloco.");
    const maxFiles = Math.max(1, Math.floor(Number(block.config?.maxFiles ?? 20) || 20));
    const count = await env.DB.prepare("select count(*) as total from journey_step_files where owner_type = ? and owner_step_id = ? and block_id = ?")
      .bind(ownerType, stepId, blockId).first<{ total: number }>();
    if (Number(count?.total ?? 0) >= maxFiles) return error(`Este bloco aceita no maximo ${maxFiles} arquivo(s).`);
    const id = crypto.randomUUID();
    const key = `journeys/${ownerType}/${stepId}/${blockId}/${id}-${sanitizeFileName(file.name)}`;
    await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    const now = new Date().toISOString();
    await env.DB.prepare("insert into journey_step_files (id, owner_type, owner_step_id, document_id, block_id, item_id, r2_key, name, content_type, size_bytes, description, created_by, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, ownerType, stepId, documentRow.id, blockId, form.get("itemId")?.toString() ?? null, key, file.name, file.type || null, file.size, form.get("description")?.toString() ?? null, form.get("createdBy")?.toString() ?? null, now).run();
    await logGenericEvent(env.DB, ownerType, stepId, documentRow.id, blockId, "file_uploaded", { id, name: file.name, size: file.size }, form.get("createdBy")?.toString() ?? null);
    return json({ id, name: file.name, content_type: file.type, size_bytes: file.size, url: `/api/files/${encodeURIComponent(key)}` }, 201);
  }

  if (request.method === "DELETE" && fileId) {
    const record = await env.DB.prepare("select * from journey_step_files where id = ? and owner_type = ? and owner_step_id = ? and block_id = ?")
      .bind(fileId, ownerType, stepId, blockId).first<Record<string, unknown>>();
    if (!record) return error("Arquivo nao encontrado.", 404);
    await env.FILES.delete(String(record.r2_key));
    await env.DB.prepare("delete from journey_step_files where id = ?").bind(fileId).run();
    await logGenericEvent(env.DB, ownerType, stepId, documentRow.id, blockId, "file_deleted", { id: fileId }, null);
    return json([]);
  }
  return error("Metodo nao permitido.", 405);
}

async function copyProjectFilesToTemplate(env: Env, projectStepId: string, templateStepId: string, templateDocumentId: string, blocks: Block[], createdBy: string | null) {
  const blockIds = new Set(blocks.filter((block) => block.type === "prompt" || block.type === "file_upload").map((block) => block.id));
  if (!blockIds.size || !env.FILES) return;
  const rows = await env.DB.prepare("select * from journey_step_files where owner_type = 'project' and owner_step_id = ? order by created_at asc").bind(projectStepId).all<Record<string, unknown>>();
  for (const row of rows.results ?? []) {
    const blockId = String(row.block_id ?? "");
    if (!blockIds.has(blockId)) continue;
    const source = await env.FILES.get(String(row.r2_key));
    if (!source) continue;
    const id = crypto.randomUUID();
    const key = `journeys/template/${templateStepId}/${blockId}/${id}-${sanitizeFileName(String(row.name ?? "arquivo"))}`;
    await env.FILES.put(key, source.body, { httpMetadata: { contentType: String(row.content_type ?? "application/octet-stream") } });
    await env.DB.prepare("insert into journey_step_files (id, owner_type, owner_step_id, document_id, block_id, item_id, r2_key, name, content_type, size_bytes, description, created_by, created_at) values (?, 'template', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, templateStepId, templateDocumentId, blockId, row.item_id ?? null, key, row.name ?? "arquivo", row.content_type ?? null, row.size_bytes ?? 0, row.description ?? null, createdBy, new Date().toISOString()).run();
  }
}

async function copyTemplateFilesToRuntime(env: Env, ownerType: Exclude<OwnerType, "template">, templateStepId: string, runtimeStepId: string, runtimeDocumentId: string, blocks: Block[]) {
  const blockIds = new Set(blocks.filter((block) => block.type === "prompt" || block.type === "file_upload").map((block) => block.id));
  if (!blockIds.size || !env.FILES) return;
  const rows = await env.DB.prepare("select * from journey_step_files where owner_type = 'template' and owner_step_id = ? order by created_at asc").bind(templateStepId).all<Record<string, unknown>>();
  for (const row of rows.results ?? []) {
    const blockId = String(row.block_id ?? "");
    if (!blockIds.has(blockId)) continue;
    const source = await env.FILES.get(String(row.r2_key));
    if (!source) continue;
    const id = crypto.randomUUID();
    const key = `journeys/${ownerType}/${runtimeStepId}/${blockId}/${id}-${sanitizeFileName(String(row.name ?? "arquivo"))}`;
    await env.FILES.put(key, source.body, { httpMetadata: { contentType: String(row.content_type ?? "application/octet-stream") } });
    await env.DB.prepare("insert into journey_step_files (id, owner_type, owner_step_id, document_id, block_id, item_id, r2_key, name, content_type, size_bytes, description, created_by, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, ownerType, runtimeStepId, runtimeDocumentId, blockId, row.item_id ?? null, key, row.name ?? "arquivo", row.content_type ?? null, row.size_bytes ?? 0, row.description ?? null, row.created_by ?? null, new Date().toISOString()).run();
  }
}

async function migrateLegacyJourneyData(db: D1Database) {
  let projectsCreated = 0;
  let clientsCreated = 0;
  const projectSteps = await db.prepare("select * from project_steps order by created_at asc").all<Record<string, unknown>>();
  for (const step of projectSteps.results ?? []) {
    const exists = await getCurrentDocument(db, "project", String(step.id), false);
    if (exists) continue;
    const document = await buildProjectLegacyDocument(db, step, crypto.randomUUID());
    await insertDocument(db, document, String(step.project_id ?? ""), null);
    projectsCreated += 1;
  }
  const clientSteps = await db.prepare("select * from client_steps order by created_at asc").all<Record<string, unknown>>();
  for (const step of clientSteps.results ?? []) {
    const exists = await getCurrentDocument(db, "client", String(step.id), false);
    if (exists) continue;
    const document = await buildClientLegacyDocument(db, step, crypto.randomUUID());
    await insertDocument(db, document, String(step.client_id ?? ""), null);
    clientsCreated += 1;
  }
  return { projectsCreated, clientsCreated };
}

async function buildProjectLegacyDocument(db: D1Database, step: Record<string, unknown>, structureId: string): Promise<StepDocument> {
  const blocks: Block[] = [];
  const add = (type: string, title: string, config: Record<string, unknown> = {}, required = false) => blocks.push({ id: crypto.randomUUID(), type, order: blocks.length + 1, title, required, visible: true, editableInExecution: true, collapsedByDefault: false, config });
  for (const [title, field] of [["Objetivo da etapa", "objective"], ["Instrucoes de execucao", "execution_instructions"], ["Resultado esperado", "expected_output"], ["Observacoes", "notes"]] as const) {
    const content = String(step[field] ?? "").trim();
    if (content) add("long_text", title, { mode: "info", content, rows: 4, legacySource: `project_steps.${field}` });
  }
  const checklist = await db.prepare("select * from project_step_checklist_items where project_step_id = ? order by item_order asc").bind(step.id).all<Record<string, unknown>>();
  if ((checklist.results ?? []).length) add("checklist", "Checklist", { items: (checklist.results ?? []).map((item, index) => ({ id: String(item.id), label: item.label, order: Number(item.item_order ?? index + 1), required: true, requiresFile: false, acceptedFileTypes: [], done: Boolean(item.is_done) })) }, true);
  const prompts = await db.prepare("select * from project_step_prompts where project_step_id = ? order by prompt_order asc").bind(step.id).all<Record<string, unknown>>();
  for (const prompt of prompts.results ?? []) add("prompt", String(prompt.title ?? "Prompt"), { promptId: prompt.prompt_id ?? null, toolId: prompt.ai_tool_id ?? null, contentSnapshot: prompt.content ?? "", expectedOutput: prompt.usage_notes ?? "" }, Boolean(prompt.is_required));
  const contexts = await db.prepare("select * from project_step_contexts where project_step_id = ? order by context_order asc").bind(step.id).all<Record<string, unknown>>();
  if ((contexts.results ?? []).length) add("context", "Contextos", { contexts: (contexts.results ?? []).map((context) => ({ id: String(context.id), title: context.title ?? "Contexto", content: context.content ?? "", color: "mint", pinned: false })) });
  const links = await db.prepare("select * from project_step_links where project_step_id = ? order by link_order asc").bind(step.id).all<Record<string, unknown>>();
  if ((links.results ?? []).length) add("materials", "Materiais e links", { links: (links.results ?? []).map((link) => ({ id: String(link.id), title: link.title ?? "Link", url: link.url ?? "", notes: link.notes ?? null })) });
  return makeDocument("project", String(step.project_id ?? ""), String(step.id), structureId, String(step.name ?? "Etapa"), String(step.status ?? "pendente"), blocks);
}

async function buildClientLegacyDocument(db: D1Database, step: Record<string, unknown>, structureId: string): Promise<StepDocument> {
  const blocks: Block[] = [];
  const add = (type: string, title: string, config: Record<string, unknown> = {}, required = false) => blocks.push({ id: crypto.randomUUID(), type, order: blocks.length + 1, title, required, visible: true, editableInExecution: true, collapsedByDefault: false, config });
  for (const [title, field] of [["Objetivo da etapa", "objective"], ["Evidencia para concluir", "required_evidence_label"], ["Observacoes", "notes"]] as const) {
    const content = String(step[field] ?? "").trim();
    if (content) add("long_text", title, { mode: "info", content, rows: 4, legacySource: `client_steps.${field}` });
  }
  const checklist = await db.prepare("select * from client_step_checklist_items where client_step_id = ? order by item_order asc").bind(step.id).all<Record<string, unknown>>();
  if ((checklist.results ?? []).length) add("checklist", "Checklist", { items: (checklist.results ?? []).map((item, index) => ({ id: String(item.id), label: item.label, order: Number(item.item_order ?? index + 1), required: true, requiresFile: false, acceptedFileTypes: [], done: Boolean(item.is_done) })) }, true);
  const links = await db.prepare("select * from client_step_links where client_step_id = ? order by link_order asc").bind(step.id).all<Record<string, unknown>>();
  if ((links.results ?? []).length) add("materials", "Materiais e links", { links: (links.results ?? []).map((link) => ({ id: String(link.id), title: link.title ?? "Link", url: link.url ?? "", notes: link.notes ?? null })) });
  return makeDocument("client", String(step.client_id ?? ""), String(step.id), structureId, String(step.name ?? "Etapa"), String(step.status ?? "pendente"), blocks);
}

function makeDocument(ownerType: OwnerType, ownerId: string, stepId: string, structureId: string, title: string, status: string, blocks: Block[]): StepDocument {
  return {
    schemaVersion: 1,
    ownerType,
    ...(ownerType === "project" ? { projectId: ownerId } : ownerType === "client" ? { clientId: ownerId } : { templateId: ownerId }),
    stepId,
    structureId,
    title,
    status,
    state: "draft",
    versionNumber: 1,
    revision: 1,
    blocks: blocks.map((block, index) => ({ ...block, order: index + 1 })),
    completionRules: [{ id: crypto.randomUUID(), type: "required_blocks_completed", enabled: true }],
  };
}

async function getCurrentDocument(db: D1Database, ownerType: OwnerType, stepId: string, required = true) {
  const row = await db.prepare("select * from journey_step_documents where owner_type = ? and step_id = ? and state in ('draft', 'published') order by case state when 'draft' then 0 else 1 end, version_number desc limit 1")
    .bind(ownerType, stepId).first<Record<string, unknown>>();
  if (!row && required) throw new Error("Estrutura canonica ainda nao foi inicializada para esta etapa.");
  return row;
}

async function insertDocument(db: D1Database, document: StepDocument, ownerId: string, createdBy: string | null) {
  const now = new Date().toISOString();
  await db.prepare("insert into journey_step_documents (id, owner_type, owner_id, step_id, schema_version, version_number, revision, state, title, document_json, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(document.structureId, document.ownerType, ownerId, document.stepId, document.schemaVersion, document.versionNumber, document.revision, document.state, document.title, JSON.stringify(document), createdBy, now, now).run();
  await logGenericEvent(db, document.ownerType, document.stepId, document.structureId, null, "structure_initialized", { blockCount: document.blocks.length }, createdBy);
}

async function getRuntimeValue(db: D1Database, ownerType: OwnerType, stepId: string, blockId: string) {
  const row = await db.prepare("select * from journey_step_values where owner_type = ? and owner_step_id = ? and block_id = ?").bind(ownerType, stepId, blockId).first<Record<string, unknown>>();
  return row ? { ...row, value: parseJson(String(row.value_json ?? "null")) } : null;
}

async function saveRuntimeValue(db: D1Database, ownerType: OwnerType, stepId: string, documentId: string, blockId: string, value: unknown, completionState: string, updatedBy: string | null, eventType: string) {
  const existing = await getRuntimeValue(db, ownerType, stepId, blockId);
  const now = new Date().toISOString();
  if (existing) {
    await db.prepare("update journey_step_values set document_id = ?, value_json = ?, completion_state = ?, updated_by = ?, updated_at = ? where id = ?")
      .bind(documentId, JSON.stringify(value), completionState, updatedBy, now, existing.id).run();
  } else {
    await db.prepare("insert into journey_step_values (id, owner_type, owner_step_id, document_id, block_id, value_json, completion_state, updated_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), ownerType, stepId, documentId, blockId, JSON.stringify(value), completionState, updatedBy, now, now).run();
  }
  await logGenericEvent(db, ownerType, stepId, documentId, blockId, eventType, { completionState }, updatedBy);
}

async function calculateRuntimeCompletion(db: D1Database, ownerType: OwnerType, stepId: string, documentRow: Record<string, unknown>) {
  const document = normalizeDocumentRow(documentRow).document;
  const valueRows = await db.prepare("select * from journey_step_values where owner_type = ? and owner_step_id = ?").bind(ownerType, stepId).all<Record<string, unknown>>();
  const values = new Map((valueRows.results ?? []).map((row) => [String(row.block_id), parseJson(String(row.value_json ?? "null"))]));
  const fileRows = await db.prepare("select * from journey_step_files where owner_type = ? and owner_step_id = ?").bind(ownerType, stepId).all<Record<string, unknown>>();
  const files = fileRows.results ?? [];
  const requiredBlocks = document.blocks.filter((block) => block.required && block.visible !== false && !["short_text", "long_text", "phase"].includes(block.type));
  let total = 0;
  let done = 0;
  const reasons: Array<{ blockId: string; message: string }> = [];
  for (const block of requiredBlocks) {
    total += 1;
    const value = values.get(block.id);
    let complete = false;
    if (block.type === "checklist") {
      const checked = asRecord(asRecord(value).checked);
      const items = Array.isArray(block.config?.items) ? block.config?.items as Array<Record<string, unknown>> : [];
      complete = items.filter((item) => item.required !== false).every((item) => Boolean(checked[String(item.id)]));
    } else if (block.type === "prompt") {
      const promptValue = asRecord(value);
      const conditions = Array.isArray(block.config?.applicationConditions)
        ? block.config.applicationConditions as Array<Record<string, unknown>>
        : [];
      const checks = asRecord(promptValue.conditionChecks);
      const conditionsComplete = conditions
        .filter((condition) => condition.required !== false)
        .every((condition) => Boolean(checks[String(condition.id ?? "")]));
      const requiresAttachment = Boolean(block.config?.attachmentsEnabled) && Boolean(block.config?.attachmentsRequired);
      const hasAttachment = files.some((file) => String(file.block_id) === block.id);
      complete = Boolean(promptValue.applied) && conditionsComplete && (!requiresAttachment || hasAttachment);
    }
    else if (block.type === "context") complete = Array.isArray(asRecord(value).contexts) && (asRecord(value).contexts as unknown[]).length > 0;
    else if (block.type === "file_upload") complete = files.some((file) => String(file.block_id) === block.id);
    else if (block.type === "materials") complete = Array.isArray(asRecord(value).links) && (asRecord(value).links as unknown[]).length > 0;
    else if (block.type === "project_summary") complete = await isProjectSummaryComplete(db, ownerType, stepId, block);
    else complete = !isEmpty(value);
    if (complete) done += 1;
    else reasons.push({ blockId: block.id, message: block.type === "project_summary" ? "Conclua todos os topicos selecionados do sumario." : `Conclua ${block.title}.` });
  }
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);
  const status = reasons.length === 0 && total > 0 ? "concluido" : done > 0 || valueRows.results?.length ? "em_andamento" : "pendente";
  return { status, progress, completedBlocks: done, totalBlocks: total, canComplete: reasons.length === 0, reasons };
}

async function syncStepStatus(db: D1Database, ownerType: OwnerType, stepId: string, status: string) {
  if (ownerType === "template") return;
  if (ownerType === "project") {
    const step = await db.prepare("select is_not_applicable from project_steps where id = ?").bind(stepId).first<Record<string, unknown>>();
    if (Number(step?.is_not_applicable ?? 0) === 1) return;
  }
  const table = ownerType === "project" ? "project_steps" : "client_steps";
  const fields = ownerType === "client" && status === "concluido" ? ", completed_at = ?" : "";
  const params = ownerType === "client" && status === "concluido"
    ? [status, new Date().toISOString(), new Date().toISOString(), stepId]
    : [status, new Date().toISOString(), stepId];
  await db.prepare(`update ${table} set status = ?, updated_at = ?${fields} where id = ?`).bind(...params).run();
}

async function isProjectSummaryComplete(db: D1Database, ownerType: OwnerType, stepId: string, block: Block) {
  if (ownerType !== "project") return false;
  const step = await db.prepare("select project_id from project_steps where id = ?").bind(stepId).first<Record<string, unknown>>();
  const projectId = String(step?.project_id ?? "");
  if (!projectId) return false;
  const activeSummary = await db.prepare("select id from project_summaries where project_id = ? and status in ('active', 'ativo') order by version_number desc limit 1").bind(projectId).first<Record<string, unknown>>();
  const summaryId = String(activeSummary?.id ?? block.config?.summaryId ?? "");
  if (!summaryId) return false;
  const selected = await db.prepare("select status from project_summary_items where summary_id = ? and is_selected = 1").bind(summaryId).all<Record<string, unknown>>();
  const items = selected.results ?? [];
  return items.length > 0 && items.every((item) => String(item.status) === "concluido");
}

async function logGenericEvent(db: D1Database, ownerType: OwnerType, stepId: string, documentId: string | null, blockId: string | null, eventType: string, payload: unknown, createdBy: string | null) {
  await db.prepare("insert into journey_step_events (id, owner_type, owner_step_id, document_id, block_id, event_type, event_payload_json, created_by, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), ownerType, stepId, documentId, blockId, eventType, JSON.stringify(payload ?? {}), createdBy, new Date().toISOString()).run();
}

function normalizeDocumentRow(row: Record<string, unknown>) {
  const parsed = parseJson(String(row.document_json ?? "{}")) as Partial<StepDocument>;
  const document: StepDocument = {
    schemaVersion: Number(row.schema_version ?? parsed.schemaVersion ?? 1),
    ownerType: String(row.owner_type ?? parsed.ownerType ?? "project") as OwnerType,
    projectId: parsed.projectId,
    clientId: parsed.clientId,
    templateId: parsed.templateId,
    stepId: String(row.step_id ?? parsed.stepId ?? ""),
    structureId: String(row.id),
    title: String(row.title ?? parsed.title ?? "Etapa"),
    status: String(parsed.status ?? "pendente"),
    state: String(row.state ?? parsed.state ?? "draft") as StepDocument["state"],
    versionNumber: Number(row.version_number ?? parsed.versionNumber ?? 1),
    revision: Number(row.revision ?? parsed.revision ?? 1),
    blocks: Array.isArray(parsed.blocks) ? parsed.blocks.map((block, index) => ({ ...block, order: Number(block.order ?? index + 1), config: block.config ?? {} })) : [],
    completionRules: Array.isArray(parsed.completionRules) ? parsed.completionRules : [],
  };
  return { ...row, document };
}

function normalizeSelectedSummaryItems(rows: Record<string, unknown>[]) {
  const selected = rows.filter((row) => Boolean(row.is_selected));
  const sourceIds = new Set(selected.map((row) => String(row.id)));
  const idMap = new Map<string, string>();
  selected.forEach((row) => idMap.set(String(row.id), crypto.randomUUID()));
  const siblingCounters = new Map<string, number>();
  const numberById = new Map<string, string>();
  return selected.map((row, index) => {
    const sourceParent = String(row.parent_id ?? "");
    let selectedParent = sourceParent;
    while (selectedParent && !sourceIds.has(selectedParent)) {
      const parent = rows.find((candidate) => String(candidate.id) === selectedParent);
      selectedParent = parent ? String(parent.parent_id ?? "") : "";
    }
    const parentKey = selectedParent || "root";
    const position = (siblingCounters.get(parentKey) ?? 0) + 1;
    siblingCounters.set(parentKey, position);
    const number = selectedParent ? `${numberById.get(selectedParent) ?? ""}.${position}` : String(position);
    numberById.set(String(row.id), number);
    return {
      ...row,
      id: idMap.get(String(row.id))!,
      parent_id: selectedParent ? idMap.get(selectedParent) ?? null : null,
      topic_number: number,
      level: number.split(".").length,
      sort_order: index + 1,
    };
  });
}

function parseJson(value: string) { try { return JSON.parse(value); } catch { return null; } }
function asRecord(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function isEmpty(value: unknown) { return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0) || (typeof value === "object" && value !== null && Object.keys(value as Record<string, unknown>).length === 0); }
function sanitizeFileName(value: string) { return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "arquivo"; }
function normalizeContextColor(value: string) { return ["mint", "teal", "amber", "blue", "rose", "slate"].includes(value) ? value : "mint"; }
function isOwnerType(value: string): value is OwnerType { return value === "project" || value === "client" || value === "template"; }
function json(data: unknown, status = 200) { return new Response(JSON.stringify({ data }), { status, headers }); }
function error(message: string, status = 400) { return new Response(JSON.stringify({ data: null, error: message }), { status, headers }); }
