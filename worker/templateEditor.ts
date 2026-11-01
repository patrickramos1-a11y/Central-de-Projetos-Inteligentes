import { duplicateTemplateSnapshot, type TemplateBlock, type TemplateSnapshot, type TemplateStep } from "../src/features/templates/templateModel";

type Row = Record<string, unknown>;
const stamp = () => new Date().toISOString();
type TemplateFile = { id: string; step_id: string; block_id: string; r2_key: string; name: string; content_type: string | null; size_bytes: number; description: string | null; created_at: string };

function modelBlockIds(snapshot: TemplateSnapshot) {
  return new Set(snapshot.steps.flatMap((step) => step.document.blocks
    .filter((block) => block.type === "prompt" || block.type === "file_upload" && block.config.fileMode === "resource_pack")
    .map((block) => `${step.id}:${block.id}`)));
}

async function publishedFileRows(db: D1Database, templateId: string): Promise<TemplateFile[]> {
  const result = await db.prepare("select f.id, f.owner_step_id as step_id, f.block_id, f.r2_key, f.name, f.content_type, f.size_bytes, f.description, f.created_at from journey_step_files f join journey_steps s on s.id = f.owner_step_id where f.owner_type = 'template' and s.journey_template_id = ? order by f.created_at, f.id")
    .bind(templateId).all<TemplateFile>();
  return result.results ?? [];
}

async function draftFileRows(db: D1Database, templateId: string): Promise<TemplateFile[]> {
  const result = await db.prepare("select id, step_id, block_id, r2_key, name, content_type, size_bytes, description, created_at from template_draft_files where template_id = ? order by created_at, id")
    .bind(templateId).all<TemplateFile>();
  return result.results ?? [];
}

function parseSnapshot(raw: unknown): TemplateSnapshot {
  if (typeof raw === "string") return JSON.parse(raw) as TemplateSnapshot;
  return raw as TemplateSnapshot;
}

async function hydrateStageSources(db: D1Database, snapshot: TemplateSnapshot) {
  const links = await db.prepare("select template_step_id, stage_id, linked_version from template_stage_links where template_id = ?")
    .bind(snapshot.templateId).all<{ template_step_id: string; stage_id: string; linked_version: number }>();
  const byStep = new Map((links.results ?? []).map((link) => [link.template_step_id, link]));
  return { ...snapshot, steps: snapshot.steps.map((step) => {
    const link = byStep.get(step.id);
    return link ? { ...step, sourceStageId: link.stage_id, sourceStageVersion: Number(link.linked_version) } : step;
  }) };
}

function normalizeSnapshot(raw: TemplateSnapshot, templateId: string): TemplateSnapshot {
  if (!raw || !Array.isArray(raw.steps)) throw new Error("Estrutura do template invalida.");
  const name = String(raw.name ?? "").trim();
  if (!name) throw new Error("Informe o nome do template.");
  const ids = new Set<string>();
  const steps = raw.steps.map((step, index) => {
    const id = String(step.id ?? "").trim();
    const stepName = String(step.name ?? "").trim();
    if (!id || ids.has(id) || !stepName) throw new Error("Etapas precisam de identificadores e nomes unicos.");
    ids.add(id);
    const blocks = Array.isArray(step.document?.blocks) ? step.document.blocks : [];
    const blockIds = new Set<string>();
    const normalizedBlocks = blocks.map((block, blockIndex) => {
      const blockId = String(block.id ?? "").trim();
      if (!blockId || blockIds.has(blockId)) throw new Error("Blocos precisam de identificadores unicos.");
      blockIds.add(blockId);
      return { ...block, id: blockId, order: blockIndex + 1, title: String(block.title ?? "").trim() || "Bloco", config: block.config && typeof block.config === "object" ? block.config : {} };
    });
    return {
      id,
      sourceStageId: step.sourceStageId || null,
      sourceStageVersion: Number(step.sourceStageVersion) || null,
      name: stepName,
      description: String(step.description ?? ""),
      stepOrder: index + 1,
      document: {
        ...step.document,
        schemaVersion: 1 as const,
        ownerType: "template" as const,
        templateId,
        stepId: id,
        structureId: String(step.document?.structureId ?? crypto.randomUUID()),
        title: stepName,
        status: "ativo",
        state: "draft" as const,
        blocks: normalizedBlocks,
        completionRules: Array.isArray(step.document?.completionRules) ? step.document.completionRules : [],
      },
    };
  });
  return {
    schemaVersion: 1,
    templateId,
    name,
    description: String(raw.description ?? ""),
    projectTypeId: raw.projectTypeId || null,
    projectModalityId: raw.projectModalityId || null,
    clientId: raw.clientId || null,
    workspaceGuidance: String(raw.workspaceGuidance ?? ""),
    steps,
  };
}

async function templateRow(db: D1Database, id: string) {
  const row = await db.prepare("select id, name, description, project_type_id, project_modality_id, context, status, created_at from journey_templates where id = ? and context in ('projeto', 'geral')")
    .bind(id).first<Row>();
  if (!row) throw new Error("Template de projeto nao encontrado.");
  return row;
}

async function legacyPublishedSnapshot(db: D1Database, id: string): Promise<TemplateSnapshot> {
  const template = await templateRow(db, id);
  const guidance = await db.prepare("select guidance from template_workspace_guidance where template_id = ?").bind(id).first<{ guidance: string }>();
  const stepRows = await db.prepare("select id, name, description, step_order, objective, execution_instructions, expected_output from journey_steps where journey_template_id = ? and status = 'ativo' order by step_order, id")
    .bind(id).all<Row>();
  const steps: TemplateStep[] = [];
  for (const row of stepRows.results ?? []) {
    const stepId = String(row.id);
    const canonical = await db.prepare("select document_json from journey_step_documents where owner_type = 'template' and step_id = ? and state = 'published' limit 1")
      .bind(stepId).first<{ document_json: string }>();
    const legacyPrompts = canonical ? [] : (await db.prepare("select id, prompt_id, title, content, ai_tool_id, is_required, prompt_order, usage_notes from step_prompts where journey_step_id = ? order by prompt_order")
      .bind(stepId).all<Row>()).results ?? [];
    const blocks: TemplateBlock[] = [];
    if (!canonical) {
      for (const [title, text] of [["Objetivo da etapa", row.objective], ["Instrucoes de execucao", row.execution_instructions], ["Resultado esperado", row.expected_output]] as const) {
        if (String(text ?? "").trim()) blocks.push({ id: crypto.randomUUID(), type: "long_text", order: blocks.length + 1, title, required: false, visible: true, config: { mode: "info", content: String(text) } });
      }
    }
    blocks.push(...legacyPrompts.map((prompt, index) => ({
      id: String(prompt.id), type: "prompt", order: index + 1, title: String(prompt.title ?? "Prompt"), required: Number(prompt.is_required ?? 1) === 1, visible: true, editableInExecution: true,
      config: { promptId: prompt.prompt_id ?? null, contentSnapshot: prompt.content ?? "", toolId: prompt.ai_tool_id ?? null, expectedOutput: prompt.usage_notes ?? "" },
    })));
    blocks.forEach((block, index) => { block.order = index + 1; });
    const document = canonical ? JSON.parse(canonical.document_json) as TemplateStep["document"] : {
      schemaVersion: 1, ownerType: "template" as const, templateId: id, stepId, structureId: crypto.randomUUID(), title: String(row.name), status: "ativo", state: "published" as const,
      versionNumber: 1, revision: 1, blocks, completionRules: [],
    };
    steps.push({ id: stepId, name: String(row.name), description: String(row.description ?? ""), stepOrder: Number(row.step_order), document });
  }
  return { schemaVersion: 1, templateId: id, name: String(template.name), description: String(template.description ?? ""), projectTypeId: template.project_type_id == null ? null : String(template.project_type_id), projectModalityId: template.project_modality_id == null ? null : String(template.project_modality_id), clientId: null, workspaceGuidance: String(guidance?.guidance ?? ""), steps };
}

export async function getTemplateEditor(db: D1Database, id: string) {
  const publishedRow = await db.prepare("select * from journey_template_versions where template_id = ? and state = 'published' order by version_number desc limit 1").bind(id).first<Row>();
  const draftRow = await db.prepare("select * from journey_template_versions where template_id = ? and state = 'draft' limit 1").bind(id).first<Row>();
  const published = await hydrateStageSources(db, publishedRow ? parseSnapshot(publishedRow.snapshot_json) : await legacyPublishedSnapshot(db, id));
  const snapshot = await hydrateStageSources(db, draftRow ? parseSnapshot(draftRow.snapshot_json) : published);
  const files = draftRow ? await draftFileRows(db, id) : await publishedFileRows(db, id);
  const allowed = modelBlockIds(snapshot);
  return {
    snapshot,
    published,
    files: files.filter((file) => allowed.has(`${file.step_id}:${file.block_id}`)),
    draftRevision: draftRow ? Number(draftRow.revision) : null,
    draftVersion: draftRow ? Number(draftRow.version_number) : null,
    publishedVersion: publishedRow ? Number(publishedRow.version_number) : published.steps.length ? 1 : 0,
    hasDraft: Boolean(draftRow),
  };
}

export async function createEmptyProjectTemplate(db: D1Database, body: { name?: string; projectTypeId?: string | null; projectModalityId?: string | null }) {
  const name = String(body.name ?? "Novo template").trim() || "Novo template";
  const id = crypto.randomUUID();
  await db.prepare("insert into journey_templates (id, name, description, project_type_id, project_modality_id, context, status, created_at) values (?, ?, '', ?, ?, 'projeto', 'inativo', ?)")
    .bind(id, name, body.projectTypeId || null, body.projectModalityId || null, stamp()).run();
  return { id, name };
}

export async function saveTemplateDraft(db: D1Database, id: string, raw: TemplateSnapshot, expectedRevision: number | null) {
  await templateRow(db, id);
  const snapshot = normalizeSnapshot(raw, id);
  if (snapshot.projectTypeId) {
    const type = await db.prepare("select id from project_types where id = ?").bind(snapshot.projectTypeId).first();
    if (!type) throw new Error("Tipo de projeto nao encontrado.");
  }
  if (snapshot.projectModalityId) {
    const modality = await db.prepare("select id from project_modalities where id = ? and project_type_id = ?").bind(snapshot.projectModalityId, snapshot.projectTypeId).first();
    if (!modality) throw new Error("Modalidade nao pertence ao tipo selecionado.");
  }
  if (snapshot.clientId) {
    const client = await db.prepare("select id from clients where id = ?").bind(snapshot.clientId).first();
    if (!client) throw new Error("Cliente nao encontrado.");
  }
  const current = await db.prepare("select id, revision from journey_template_versions where template_id = ? and state = 'draft'").bind(id).first<Row>();
  const timestamp = stamp();
  if (current) {
    if (Number(current.revision) !== expectedRevision) throw new Error("Rascunho alterado em outra sessao. Recarregue antes de salvar.");
    const result = await db.prepare("update journey_template_versions set snapshot_json = ?, revision = revision + 1, updated_at = ? where id = ? and revision = ?")
      .bind(JSON.stringify(snapshot), timestamp, current.id, expectedRevision).run();
    if (Number(result.meta?.changes ?? 0) !== 1) throw new Error("Rascunho alterado em outra sessao.");
    return { snapshot, draftRevision: Number(current.revision) + 1 };
  }
  if (expectedRevision !== null) throw new Error("Rascunho nao encontrado. Recarregue antes de salvar.");
  const published = await db.prepare("select max(version_number) as version from journey_template_versions where template_id = ? and state = 'published'").bind(id).first<{ version: number | null }>();
  const legacy = published?.version ? null : await legacyPublishedSnapshot(db, id);
  const version = Number(published?.version ?? (legacy?.steps.length ? 1 : 0)) + 1;
  const allowed = modelBlockIds(snapshot);
  const sourceFiles = (await publishedFileRows(db, id)).filter((file) => allowed.has(`${file.step_id}:${file.block_id}`));
  await db.batch([
    db.prepare("insert into journey_template_versions (id, template_id, version_number, revision, state, snapshot_json, created_at, updated_at) values (?, ?, ?, 1, 'draft', ?, ?, ?)")
      .bind(crypto.randomUUID(), id, version, JSON.stringify(snapshot), timestamp, timestamp),
    ...sourceFiles.map((file) => db.prepare("insert into template_draft_files (id, template_id, step_id, block_id, r2_key, name, content_type, size_bytes, description, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), id, file.step_id, file.block_id, file.r2_key, file.name, file.content_type, file.size_bytes, file.description, timestamp)),
  ]);
  return { snapshot, draftRevision: 1 };
}

export async function uploadTemplateDraftFile(db: D1Database, files: R2Bucket | undefined, id: string, stepId: string, blockId: string, file: File) {
  if (!files) throw new Error("Armazenamento de arquivos indisponivel.");
  const draft = await db.prepare("select snapshot_json from journey_template_versions where template_id = ? and state = 'draft'").bind(id).first<{ snapshot_json: string }>();
  if (!draft) throw new Error("Salve o rascunho antes de adicionar arquivos.");
  const snapshot = parseSnapshot(draft.snapshot_json);
  if (!modelBlockIds(snapshot).has(`${stepId}:${blockId}`)) throw new Error("Este bloco nao aceita arquivos-modelo.");
  const block = snapshot.steps.find((step) => step.id === stepId)?.document.blocks.find((item) => item.id === blockId);
  if (block?.type === "prompt" && !block.config.attachmentsEnabled) throw new Error("Habilite anexos no prompt antes de enviar um arquivo-modelo.");
  const maxSizeMb = Math.max(1, Number(block?.config.maxFileSizeMb ?? 25));
  if (!file.size || file.size > maxSizeMb * 1024 * 1024) throw new Error(`O arquivo deve ter ate ${maxSizeMb} MB.`);
  const count = await db.prepare("select count(*) as total from template_draft_files where template_id = ? and step_id = ? and block_id = ?")
    .bind(id, stepId, blockId).first<{ total: number }>();
  if (Number(count?.total ?? 0) >= Math.max(1, Number(block?.config.maxFiles ?? 20))) throw new Error("Limite de arquivos deste bloco atingido.");
  const fileId = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "arquivo";
  const key = `journeys/template-draft/${id}/${stepId}/${blockId}/${fileId}-${safeName}`;
  await files.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
  try {
    await db.prepare("insert into template_draft_files (id, template_id, step_id, block_id, r2_key, name, content_type, size_bytes, description, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, null, ?)")
      .bind(fileId, id, stepId, blockId, key, file.name, file.type || null, file.size, stamp()).run();
  } catch (error) { await files.delete(key); throw error; }
  return { id: fileId, step_id: stepId, block_id: blockId, r2_key: key, name: file.name, content_type: file.type || null, size_bytes: file.size };
}

export async function removeTemplateDraftFile(db: D1Database, files: R2Bucket | undefined, id: string, fileId: string) {
  const row = await db.prepare("select r2_key from template_draft_files where id = ? and template_id = ?").bind(fileId, id).first<{ r2_key: string }>();
  if (!row) throw new Error("Arquivo do rascunho nao encontrado.");
  await db.prepare("delete from template_draft_files where id = ? and template_id = ?").bind(fileId, id).run();
  if (files && row.r2_key.startsWith(`journeys/template-draft/${id}/`)) await files.delete(row.r2_key);
  return { id: fileId };
}

export async function stageProjectModelFiles(db: D1Database, files: R2Bucket | undefined, templateId: string, mapping: Array<{ projectStepId: string; templateStepId: string; blockIds: string[] }>) {
  const copied: Array<{ stepId: string; blockId: string; source: TemplateFile; key: string }> = [];
  try {
    for (const item of mapping) {
      const rows = await db.prepare("select id, owner_step_id as step_id, block_id, r2_key, name, content_type, size_bytes, description, created_at from journey_step_files where owner_type = 'project' and owner_step_id = ?")
        .bind(item.projectStepId).all<TemplateFile>();
      for (const source of rows.results ?? []) {
        if (!item.blockIds.includes(source.block_id)) continue;
        if (!files) throw new Error("Armazenamento de arquivos indisponivel para salvar recursos-modelo.");
        const object = await files.get(source.r2_key);
        if (!object) throw new Error(`Arquivo-modelo ausente: ${source.name}.`);
        const key = `journeys/template-draft/${templateId}/${item.templateStepId}/${source.block_id}/${crypto.randomUUID()}-${source.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120)}`;
        await files.put(key, object.body, { httpMetadata: { contentType: source.content_type || "application/octet-stream" } });
        copied.push({ stepId: item.templateStepId, blockId: source.block_id, source, key });
      }
    }
    await db.batch([
      db.prepare("delete from template_draft_files where template_id = ?").bind(templateId),
      ...copied.map(({ stepId, blockId, source, key }) => db.prepare("insert into template_draft_files (id, template_id, step_id, block_id, r2_key, name, content_type, size_bytes, description, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), templateId, stepId, blockId, key, source.name, source.content_type, source.size_bytes, source.description, stamp())),
    ]);
  } catch (error) {
    if (files) await Promise.allSettled(copied.map((item) => files.delete(item.key)));
    throw error;
  }
}

export async function publishTemplateDraft(db: D1Database, id: string, expectedRevision: number) {
  const draft = await db.prepare("select * from journey_template_versions where template_id = ? and state = 'draft'").bind(id).first<Row>();
  if (!draft || Number(draft.revision) !== expectedRevision) throw new Error("Salve o rascunho atualizado antes de publicar.");
  const snapshot = normalizeSnapshot(parseSnapshot(draft.snapshot_json), id);
  if (!snapshot.steps.length) throw new Error("Adicione pelo menos uma etapa antes de publicar.");
  const currentSteps = await db.prepare("select id from journey_steps where journey_template_id = ?").bind(id).all<{ id: string }>();
  const knownSteps = new Set((currentSteps.results ?? []).map((step) => step.id));
  const included = new Set(snapshot.steps.map((step) => step.id));
  const previousVersion = await db.prepare("select id from journey_template_versions where template_id = ? and state = 'published' limit 1").bind(id).first();
  const timestamp = stamp();
  const statements: D1PreparedStatement[] = [];
  const guardId = crypto.randomUUID();
  statements.push(db.prepare("insert into template_publish_guards (id, valid) values (?, (select case when revision = ? and state = 'draft' then 1 else 0 end from journey_template_versions where id = ?))")
    .bind(guardId, expectedRevision, draft.id));
  const activeFiles = (await draftFileRows(db, id)).filter((file) => modelBlockIds(snapshot).has(`${file.step_id}:${file.block_id}`));
  const documentIds = new Map<string, string>();
  if (!previousVersion && knownSteps.size) {
    const previous = await legacyPublishedSnapshot(db, id);
    const legacyVersionId = crypto.randomUUID();
    statements.push(db.prepare("insert into journey_template_versions (id, template_id, version_number, revision, state, snapshot_json, created_at, updated_at, published_at) values (?, ?, 1, 1, 'published', ?, ?, ?, ?)")
      .bind(legacyVersionId, id, JSON.stringify(previous), timestamp, timestamp, timestamp));
    for (const file of await publishedFileRows(db, id)) {
      statements.push(db.prepare("insert into template_version_files (id, version_id, step_id, block_id, r2_key, name, content_type, size_bytes, description, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), legacyVersionId, file.step_id, file.block_id, file.r2_key, file.name, file.content_type, file.size_bytes, file.description, timestamp));
    }
  }
  for (const step of snapshot.steps) {
    if (step.sourceStageId) {
      const source = await db.prepare("select current_version from journey_stage_library where id = ? and status = 'active'").bind(step.sourceStageId).first<{ current_version: number }>();
      if (!source) throw new Error(`A etapa compartilhada ${step.name} nao esta mais disponivel.`);
      step.sourceStageVersion = Number(source.current_version);
    }
    if (knownSteps.has(step.id)) {
      statements.push(db.prepare("update journey_steps set name = ?, description = ?, step_order = ?, status = 'ativo' where id = ? and journey_template_id = ?")
        .bind(step.name, step.description || null, step.stepOrder, step.id, id));
    } else {
      statements.push(db.prepare("insert into journey_steps (id, journey_template_id, name, description, step_order, checklist, status, created_at) values (?, ?, ?, ?, ?, '', 'ativo', ?)")
        .bind(step.id, id, step.name, step.description || null, step.stepOrder, timestamp));
    }
    const existing = await db.prepare("select id from journey_step_documents where owner_type = 'template' and step_id = ? and state = 'published'").bind(step.id).first<{ id: string }>();
    documentIds.set(step.id, existing?.id ?? String(step.document.structureId));
    const document = { ...step.document, state: "published", versionNumber: Number(draft.version_number), revision: Number(step.document.revision ?? 1) + 1, title: step.name };
    if (existing) {
      statements.push(db.prepare("update journey_step_documents set title = ?, version_number = ?, revision = ?, document_json = ?, updated_at = ?, published_at = ? where id = ?")
        .bind(step.name, document.versionNumber, document.revision, JSON.stringify(document), timestamp, timestamp, existing.id));
    } else {
      statements.push(db.prepare("insert into journey_step_documents (id, owner_type, owner_id, step_id, schema_version, version_number, revision, state, title, document_json, created_at, updated_at, published_at) values (?, 'template', ?, ?, 1, ?, ?, 'published', ?, ?, ?, ?, ?)")
        .bind(document.structureId, id, step.id, document.versionNumber, document.revision, step.name, JSON.stringify(document), timestamp, timestamp, timestamp));
    }
    statements.push(db.prepare("delete from step_prompts where journey_step_id = ?").bind(step.id));
    for (const block of step.document.blocks.filter((item) => item.type === "prompt")) {
      statements.push(db.prepare("insert into step_prompts (id, journey_step_id, prompt_id, title, content, ai_tool_id, prompt_status, is_required, prompt_order, usage_notes, created_at) values (?, ?, ?, ?, ?, ?, 'preenchido', ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), step.id, block.config.promptId ?? null, block.title, block.config.contentSnapshot ?? "", block.config.toolId ?? null, block.required ? 1 : 0, block.order, block.config.expectedOutput ?? null, timestamp));
    }
  }
  for (const old of knownSteps) {
    if (!included.has(old)) statements.push(db.prepare("update journey_steps set status = 'arquivado' where id = ? and journey_template_id = ?").bind(old, id));
  }
  statements.push(db.prepare("delete from template_stage_links where template_id = ?").bind(id));
  for (const step of snapshot.steps.filter((item) => item.sourceStageId)) {
    statements.push(db.prepare("insert into template_stage_links (template_id, template_step_id, stage_id, linked_version, auto_update, created_at, updated_at) values (?, ?, ?, ?, 1, ?, ?)")
      .bind(id, step.id, step.sourceStageId, step.sourceStageVersion ?? 1, timestamp, timestamp));
  }
  statements.push(db.prepare("delete from journey_step_files where owner_type = 'template' and owner_step_id in (select id from journey_steps where journey_template_id = ?)").bind(id));
  for (const file of activeFiles) {
    statements.push(db.prepare("insert into journey_step_files (id, owner_type, owner_step_id, document_id, block_id, item_id, r2_key, name, content_type, size_bytes, description, created_by, created_at) values (?, 'template', ?, ?, ?, null, ?, ?, ?, ?, ?, null, ?)")
      .bind(crypto.randomUUID(), file.step_id, documentIds.get(file.step_id), file.block_id, file.r2_key, file.name, file.content_type, file.size_bytes, file.description, timestamp));
    statements.push(db.prepare("insert into template_version_files (id, version_id, step_id, block_id, r2_key, name, content_type, size_bytes, description, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), draft.id, file.step_id, file.block_id, file.r2_key, file.name, file.content_type, file.size_bytes, file.description, timestamp));
  }
  statements.push(db.prepare("delete from template_draft_files where template_id = ?").bind(id));
  statements.push(db.prepare("update journey_templates set name = ?, description = ?, project_type_id = ?, project_modality_id = ?, status = 'ativo' where id = ?")
    .bind(snapshot.name, snapshot.description || null, snapshot.projectTypeId, snapshot.projectModalityId, id));
  statements.push(db.prepare("delete from journey_template_client_scopes where template_id = ?").bind(id));
  if (snapshot.clientId) {
    statements.push(db.prepare("insert into journey_template_client_scopes (template_id, client_id, created_at, updated_at) values (?, ?, ?, ?)")
      .bind(id, snapshot.clientId, timestamp, timestamp));
  }
  statements.push(db.prepare("insert into template_workspace_guidance (template_id, guidance, updated_at) values (?, ?, ?) on conflict(template_id) do update set guidance = excluded.guidance, updated_at = excluded.updated_at")
    .bind(id, snapshot.workspaceGuidance, timestamp));
  statements.push(db.prepare("update journey_template_versions set state = 'published', snapshot_json = ?, updated_at = ?, published_at = ? where id = ? and revision = ? and state = 'draft'")
    .bind(JSON.stringify(snapshot), timestamp, timestamp, draft.id, expectedRevision));
  statements.push(db.prepare("delete from template_publish_guards where id = ?").bind(guardId));
  const results = await db.batch(statements);
  if (Number(results.at(-2)?.meta?.changes ?? 0) !== 1) throw new Error("Rascunho alterado antes da publicacao.");
  return { version: draft.version_number, snapshot };
}

export async function duplicateProjectTemplate(db: D1Database, files: R2Bucket | undefined, id: string) {
  const editor = await getTemplateEditor(db, id);
  const newId = crypto.randomUUID();
  const snapshot = duplicateTemplateSnapshot(editor.published, newId);
  const timestamp = stamp();
  const copied: Array<{ source: TemplateFile; stepId: string; blockId: string; key: string }> = [];
  const sourceFiles = await publishedFileRows(db, id);
  try {
    for (const [stepIndex, sourceStep] of editor.published.steps.entries()) {
      const destinationStep = snapshot.steps[stepIndex];
      for (const [blockIndex, sourceBlock] of sourceStep.document.blocks.entries()) {
        const destinationBlock = destinationStep.document.blocks[blockIndex];
        if (!modelBlockIds(snapshot).has(`${destinationStep.id}:${destinationBlock.id}`)) continue;
        for (const source of sourceFiles.filter((file) => file.step_id === sourceStep.id && file.block_id === sourceBlock.id)) {
          if (!files) throw new Error("Armazenamento de arquivos indisponivel para duplicar recursos-modelo.");
          const object = await files.get(source.r2_key);
          if (!object) throw new Error(`Arquivo-modelo ausente: ${source.name}.`);
          const key = `journeys/template-draft/${newId}/${destinationStep.id}/${destinationBlock.id}/${crypto.randomUUID()}-${source.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120)}`;
          await files.put(key, object.body, { httpMetadata: { contentType: source.content_type || "application/octet-stream" } });
          copied.push({ source, stepId: destinationStep.id, blockId: destinationBlock.id, key });
        }
      }
    }
    await db.batch([
    db.prepare("insert into journey_templates (id, name, description, project_type_id, project_modality_id, context, status, created_at) values (?, ?, ?, ?, ?, 'projeto', 'inativo', ?)")
      .bind(newId, snapshot.name, snapshot.description || null, snapshot.projectTypeId, snapshot.projectModalityId, timestamp),
    db.prepare("insert into journey_template_versions (id, template_id, version_number, revision, state, snapshot_json, created_at, updated_at) values (?, ?, 1, 1, 'draft', ?, ?, ?)")
      .bind(crypto.randomUUID(), newId, JSON.stringify(snapshot), timestamp, timestamp),
    ...copied.map(({ source, stepId, blockId, key }) => db.prepare("insert into template_draft_files (id, template_id, step_id, block_id, r2_key, name, content_type, size_bytes, description, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), newId, stepId, blockId, key, source.name, source.content_type, source.size_bytes, source.description, timestamp)),
    ]);
  } catch (error) {
    if (files) await Promise.allSettled(copied.map((item) => files.delete(item.key)));
    throw error;
  }
  return { id: newId, snapshot };
}
