import { applySummaryVersion } from "./summaryApply";
import { isMaterialsComplete, materialsPendingMessage } from "../shared/materialsSlots";
import { clientContextList, clientContextReconciliation, contextSnapshots, createClientContext, currentContextVersion, getClientContext, prepareProjectContextSave, updateClientContext } from "./clientContexts";
import { createEmptyProjectTemplate, duplicateProjectTemplate, getTemplateEditor, publishTemplateDraft, removeTemplateDraftFile, saveTemplateDraft, stageProjectModelFiles, uploadTemplateDraftFile } from "./templateEditor";
import { sanitizeModelConfig, type TemplateSnapshot } from "../src/features/templates/templateModel";

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
  source?: {
    kind: "stage_library";
    id: string;
    version: number;
    mode: "linked" | "customized";
    updatedAt?: string;
    updatedBy?: string | null;
  };
  blocks: Block[];
  completionRules: Array<{ id: string; type: string; enabled: boolean; message?: string }>;
};

async function canonicalBindingReport(db: D1Database) {
  const [links, documents] = await Promise.all([
    db.prepare("select auto_update, last_sync_status, count(*) as total from project_stage_links group by auto_update, last_sync_status").all<{ auto_update: number; last_sync_status: string; total: number }>(),
    db.prepare("select owner_type, owner_id, step_id, document_json from journey_step_documents where state in ('draft', 'published')").all<{ owner_type: string; owner_id: string; step_id: string; document_json: string }>(),
  ]);
  const report = {
    generatedAt: new Date().toISOString(),
    projectStageLinks: links.results ?? [],
    prompts: { linked: 0, customized: 0, emptySnapshots: [] as Array<{ ownerType: string; ownerId: string; stepId: string; blockId: string; title: string }> },
    stages: { linked: 0, customized: 0, reviewRequired: 0 },
  };
  for (const row of documents.results ?? []) {
    let document: StepDocument & { source?: { mode?: string }; sync?: { status?: string } };
    try { document = JSON.parse(row.document_json) as typeof document; } catch { continue; }
    if (document.source?.mode === "linked") report.stages.linked += 1;
    if (document.source?.mode === "customized") report.stages.customized += 1;
    if (document.sync?.status === "review_required") report.stages.reviewRequired += 1;
    for (const block of document.blocks ?? []) {
      if (block.type !== "prompt") continue;
      if (block.config?.promptId) report.prompts.linked += 1;
      else report.prompts.customized += 1;
      const snapshot = String(block.config?.contentSnapshot ?? "").trim();
      if (!block.config?.promptId && snapshot.length < 40) report.prompts.emptySnapshots.push({ ownerType: row.owner_type, ownerId: row.owner_id, stepId: row.step_id, blockId: block.id, title: block.title });
    }
  }
  return report;
}

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,cf-access-jwt-assertion",
  "content-type": "application/json",
};

export async function handleJourneyDomainRequest(request: Request, env: Env, parts: string[], url: URL): Promise<Response | null> {
  const [api, resource, id, action, nested, nestedId] = parts;
  if (api !== "api") return null;

  if (resource === "admin" && id === "migrate-canonical" && request.method === "POST") {
    return json({ data: await migrateLegacyJourneyData(env.DB) });
  }
  if (resource === "admin" && id === "canonical-binding-report" && request.method === "GET") {
    return json({ data: await canonicalBindingReport(env.DB) });
  }

  if (resource === "journey-rail-preferences" && isOwnerType(id) && action) {
    if (id === "template") return error("Templates nao possuem preferencia de navegacao.", 400);
    const ownerType = id as "project" | "client";
    const userId = String(url.searchParams.get("userId") ?? "").trim();
    if (request.method === "GET") {
      return json(await getRailPreference(env.DB, ownerType, action, userId));
    }
    if (request.method === "PATCH") {
      const body = await request.json() as { userId?: string; isExpanded?: boolean };
      return json(await saveRailPreference(env.DB, ownerType, action, String(body.userId ?? "").trim(), Boolean(body.isExpanded)));
    }
    return error("Metodo nao permitido.", 405);
  }

  if (resource === "journey-steps" && isOwnerType(id) && action) {
    if (nested === "contexts" && nestedId === "import" && request.method === "POST") {
      const body = await request.json<{ blockId?: string; contextIds?: string[]; updatedBy?: string }>();
      return json({ data: await importClientContextsIntoStep(env.DB, id, action, body) });
    }
    if (nested === "contexts" && nestedId === "refresh" && request.method === "POST") {
      const body = await request.json<{ blockId?: string; contextId?: string; updatedBy?: string }>();
      return json({ data: await refreshClientContextInStep(env.DB, id, action, body) });
    }
    if (nested === "contexts" && nestedId === "associate" && request.method === "POST") {
      const body = await request.json<{ blockId?: string; contextIds?: string[]; updatedBy?: string }>();
      return json({ data: await associateExistingProjectContexts(env.DB, id, action, body) });
    }
    return handleGenericStepRequest(request, env, id, action, nested, nestedId, url);
  }

  if (resource === "clients" && id && action === "contexts") {
    if (request.method === "GET" && nested === "reconciliation") return json({ data: await clientContextReconciliation(env.DB, id) });
    if (request.method === "GET" && !nested) return json({ data: await clientContextList(env.DB, id, url.searchParams.get("q") ?? "", url.searchParams.get("archived") === "1", url.searchParams.get("category") ?? "", Number(url.searchParams.get("offset") ?? 0)) });
    if (request.method === "POST" && !nested) return json({ data: await createClientContext(env.DB, id, await request.json()) }, 201);
    if (request.method === "GET" && nested) return json({ data: await getClientContext(env.DB, id, nested) });
    if (request.method === "PATCH" && nested) return json({ data: await updateClientContext(env.DB, id, nested, await request.json()) });
  }

  if (resource === "projects" && id && action === "journey" && request.method === "GET") {
    return json({ data: await getJourney(env.DB, "project", id) });
  }

  if (resource === "clients" && id && action === "journey" && request.method === "GET") {
    return json({ data: await getJourney(env.DB, "client", id) });
  }

  if (resource === "projects" && id && action === "templates" && request.method === "POST") {
    const body = await request.json<{ name?: string; templateId?: string | null; createdBy?: string; presentationDefaults?: Record<string, string[]> }>();
    return json(await saveProjectAsTemplate(env, id, body.name, body.createdBy ?? null, body.templateId ?? null, body.presentationDefaults ?? {}), 201);
  }

  if (resource === "journey-templates" && !id && request.method === "POST") {
    return json({ data: await createEmptyProjectTemplate(env.DB, await request.json()) }, 201);
  }

  if (resource === "journey-templates" && id && action === "editor") {
    if (nested === "files" && request.method === "POST" && !nestedId) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return error("Envie um arquivo.");
      return json({ data: await uploadTemplateDraftFile(env.DB, env.FILES, id, String(form.get("stepId") ?? ""), String(form.get("blockId") ?? ""), file) }, 201);
    }
    if (nested === "files" && request.method === "DELETE" && nestedId) return json({ data: await removeTemplateDraftFile(env.DB, env.FILES, id, nestedId) });
    if (request.method === "GET" && !nested) return json({ data: await getTemplateEditor(env.DB, id) });
    if (request.method === "PUT" && !nested) {
      const body = await request.json<{ snapshot: Parameters<typeof saveTemplateDraft>[2]; expectedRevision: number | null }>();
      return json({ data: await saveTemplateDraft(env.DB, id, body.snapshot, body.expectedRevision) });
    }
  }
  if (resource === "journey-templates" && id && action === "publish" && request.method === "POST") {
    const body = await request.json<{ expectedRevision: number }>();
    return json({ data: await publishTemplateDraft(env.DB, id, body.expectedRevision) });
  }
  if (resource === "journey-templates" && id && action === "duplicate" && request.method === "POST") {
    return json({ data: await duplicateProjectTemplate(env.DB, env.FILES, id) }, 201);
  }

  if (resource === "projects" && id && action === "summary-template" && request.method === "POST") {
    const body = await request.json<{ stepId?: string; blockId?: string; summaryId?: string; createdBy?: string }>();
    return json({ data: await saveProjectSummaryAsTemplate(env.DB, id, body) });
  }

  if (resource === "journey-templates" && id && request.method === "PATCH") {
    const body = await request.json<{ name?: string; description?: string | null; status?: string; project_type_id?: string | null; project_modality_id?: string | null }>();
    return json(await updateJourneyTemplate(env.DB, id, body));
  }

  if (resource === "journey-templates" && id && request.method === "DELETE") {
    return json(await deleteJourneyTemplate(env.DB, id));
  }

  if (resource === "clients" && id && action === "templates" && request.method === "POST") {
    const body = await request.json() as { name?: string; createdBy?: string; presentationDefaults?: Record<string, string[]> };
    return json({ data: await saveClientAsTemplate(env.DB, id, body.name, body.createdBy ?? null, body.presentationDefaults ?? {}) }, 201);
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

  if (resource === "maintenance" && id === "link-project-contexts" && request.method === "POST") {
    return json({ data: await linkAllProjectContextsToClients(env.DB) });
  }

  if (resource === "summaries" && id && action === "apply" && request.method === "POST") {
    return json({ data: await applySummaryVersion(env.DB, id) });
  }

  if (resource === "summaries" && id && action === "consolidate" && request.method === "POST") {
    const body = await request.json<{ createdBy?: string }>();
    return json({ data: await consolidateSummary(env.DB, id, body.createdBy ?? null) }, 201);
  }

  if (resource === "summaries" && id && action === "state" && request.method === "GET") {
    return json(await getSummaryState(env.DB, id));
  }

  if (resource === "summaries" && id && action === "prompts" && request.method === "POST") {
    const body = await request.json<{ promptId?: string; itemIds?: string[]; finalPrompt?: string; basePromptId?: string | null; basePromptSnapshot?: string | null; aiToolId?: string | null; createdBy?: string | null; notes?: string | null }>();
    return json(await saveSummaryPrompt(env.DB, id, body), 201);
  }

  if (resource === "journey-files" && id && action && nested) {
    return handleJourneyFileRequest(request, env, id as OwnerType, action, nested, nestedId, url);
  }

  return null;
}

async function getRailPreference(db: D1Database, ownerType: "project" | "client", ownerId: string, userId: string) {
  if (!userId) return { isExpanded: false, customized: false };
  const row = await db.prepare("select is_expanded from journey_rail_preferences where user_id = ? and owner_type = ? and owner_id = ?")
    .bind(userId, ownerType, ownerId).first<{ is_expanded?: number }>();
  return { isExpanded: Boolean(row?.is_expanded), customized: Boolean(row) };
}

async function saveRailPreference(db: D1Database, ownerType: "project" | "client", ownerId: string, userId: string, isExpanded: boolean) {
  if (!userId) throw new Error("Informe o usuario da preferencia visual.");
  const now = new Date().toISOString();
  await db.prepare("insert into journey_rail_preferences (id, user_id, owner_type, owner_id, is_expanded, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?) on conflict(user_id, owner_type, owner_id) do update set is_expanded = excluded.is_expanded, updated_at = excluded.updated_at")
    .bind(crypto.randomUUID(), userId, ownerType, ownerId, isExpanded ? 1 : 0, now, now).run();
  return { isExpanded, customized: true };
}

async function handleGenericStepRequest(request: Request, env: Env, ownerType: OwnerType, stepId: string, action?: string, nested?: string, url?: URL) {
  const db = env.DB;
  if (request.method === "POST" && action === "initialize") {
    const body = await request.json().catch(() => ({})) as { templateStepId?: string; createdBy?: string };
    const existing = await getCurrentDocument(db, ownerType, stepId, false);
    if (existing) return json({ data: await genericPayload(db, ownerType, stepId, existing) });
    const step = await getStepRow(db, ownerType, stepId);
    if (!step) return error("Etapa nao encontrada.", 404);
    const templateRow = body.templateStepId
      ? await db.prepare("select * from journey_step_documents where owner_type = 'template' and step_id = ? and state = 'published' order by version_number desc limit 1").bind(body.templateStepId).first<Record<string, unknown>>()
      : null;
    const templateDocument = templateRow ? normalizeDocumentRow(templateRow).document : null;
    const templateStageLink = ownerType === "project" && templateRow
      ? await db.prepare("select stage_id, linked_version, auto_update from template_stage_links where template_step_id = ? and auto_update = 1 limit 1")
        .bind(String(templateRow.step_id)).first<{ stage_id: string; linked_version: number; auto_update: number }>()
      : null;
    let document = templateDocument
      ? createRuntimeDocumentFromTemplate(templateDocument, ownerType, step, stepId)
      : ownerType === "client"
      ? await buildClientLegacyDocument(db, step, crypto.randomUUID())
      : await buildProjectLegacyDocument(db, step, crypto.randomUUID());
    if (ownerType === "project" && templateDocument) {
      document = await materializeProjectSummaryTemplates(db, document, getOwnerId(ownerType, step));
    }
    if (templateStageLink) {
      document = {
        ...document,
        source: {
          kind: "stage_library",
          id: templateStageLink.stage_id,
          version: Number(templateStageLink.linked_version),
          mode: "linked",
          updatedAt: new Date().toISOString(),
          updatedBy: body.createdBy ?? null,
        },
      };
    }
    await insertDocument(db, document, getOwnerId(ownerType, step), body.createdBy ?? null);
    if (templateStageLink) {
      const now = new Date().toISOString();
      await db.prepare("insert into project_stage_links (project_id, project_step_id, stage_id, linked_version, auto_update, last_sync_status, created_at, updated_at) values (?, ?, ?, ?, 1, 'synced', ?, ?) on conflict(project_id, project_step_id) do update set stage_id = excluded.stage_id, linked_version = excluded.linked_version, auto_update = 1, last_sync_status = 'synced', last_sync_error = null, updated_at = excluded.updated_at")
        .bind(getOwnerId(ownerType, step), stepId, templateStageLink.stage_id, Number(templateStageLink.linked_version), now, now).run();
    }
    if (templateRow) await copyTemplateFilesToRuntime(env, ownerType, String(templateRow.step_id), stepId, document.structureId, document.blocks);
    return json({ data: await genericPayload(db, ownerType, stepId, await getCurrentDocument(db, ownerType, stepId)) }, 201);
  }

  if (request.method === "GET" && action === "structure") {
    const document = await getCurrentDocument(db, ownerType, stepId);
    return json({ data: await genericPayload(db, ownerType, stepId, document, url?.searchParams.get("userId")) });
  }

  if (request.method === "PATCH" && action === "presentation") {
    if (ownerType === "template") return error("Templates nao possuem preferencias visuais.", 400);
    const body = await request.json() as { userId?: string; collapsedBlockIds?: string[]; reset?: boolean };
    const userId = String(body.userId ?? "").trim();
    if (!userId) return error("Informe o usuario da preferencia visual.", 400);
    const documentRow = await getCurrentDocument(db, ownerType, stepId);
    const document = normalizeDocumentRow(documentRow).document;
    const validIds = new Set(document.blocks.map((block) => block.id));
    const collapsedBlockIds = Array.from(new Set((body.collapsedBlockIds ?? []).filter((blockId): blockId is string => typeof blockId === "string" && validIds.has(blockId))));
    if (body.reset) {
      await db.prepare("delete from journey_step_view_preferences where user_id = ? and owner_type = ? and owner_step_id = ?").bind(userId, ownerType, stepId).run();
    } else {
      const now = new Date().toISOString();
      await db.prepare("insert into journey_step_view_preferences (id, user_id, owner_type, owner_step_id, collapsed_block_ids_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?) on conflict(user_id, owner_type, owner_step_id) do update set collapsed_block_ids_json = excluded.collapsed_block_ids_json, updated_at = excluded.updated_at")
        .bind(crypto.randomUUID(), userId, ownerType, stepId, JSON.stringify(collapsedBlockIds), now, now).run();
    }
    return json({ data: await genericPayload(db, ownerType, stepId, documentRow, userId) });
  }

  if (request.method === "POST" && action === "blocks" && !nested) {
    const body = await request.json() as { type?: string; title?: string; parentBlockId?: string | null; config?: Record<string, unknown>; updatedBy?: string };
    const documentRow = await getCurrentDocument(db, ownerType, stepId);
    const normalized = normalizeDocumentRow(documentRow).document;
    const block = createGenericBlock(body.type ?? "long_text", normalized.blocks.length + 1, body.title, body.parentBlockId ?? null, body.config);
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
    await removeBlockFromPresentationPreferences(db, ownerType, stepId, nested);
    await saveGenericDocument(db, documentRow, normalized, "block_deleted", nested, {}, null);
    return json({ data: await genericPayload(db, ownerType, stepId, await getCurrentDocument(db, ownerType, stepId)) });
  }

  if (request.method === "PATCH" && action === "block-values" && nested) {
    const body = await request.json() as { value?: unknown; updatedBy?: string };
    const documentRow = await getCurrentDocument(db, ownerType, stepId);
    const document = normalizeDocumentRow(documentRow).document;
    const block = document.blocks.find((candidate) => candidate.id === nested);
    if (!block) return error("Bloco nao encontrado.", 404);
    let value = clearForcedCompletion(body.value);
    const completionState = isEmpty(value) ? "empty" : "partial";
    if (ownerType === "project" && block.type === "context") {
      const previous = await getRuntimeValue(db, ownerType, stepId, nested);
      const previousContexts = Array.isArray(asRecord(previous?.value).contexts) ? asRecord(previous?.value).contexts as Array<Record<string, unknown>> : [];
      const nextContexts = Array.isArray(asRecord(value).contexts) ? asRecord(value).contexts as Array<Record<string, unknown>> : [];
      const prepared = await prepareProjectContextSave(db, stepId, nested, previousContexts as never[], nextContexts as never[]);
      value = { ...asRecord(value), contexts: prepared.contexts };
      await saveContextValueAtomically(db, ownerType, stepId, String(documentRow.id), nested, value, completionState, body.updatedBy ?? null, prepared.statements);
    } else {
      await saveRuntimeValue(db, ownerType, stepId, documentRow.id, nested, value, completionState, body.updatedBy ?? null, "block_value_saved");
    }
    const payload = await genericPayload(db, ownerType, stepId, documentRow);
    await syncStepStatus(db, ownerType, stepId, payload.completion.status);
    return json({ data: payload });
  }

  if (request.method === "POST" && action === "complete") {
    if (ownerType === "template") return error("Templates nao podem ser concluidos.", 400);
    const body = await request.json().catch(() => ({})) as { forcePending?: boolean; updatedBy?: string };
    const documentRow = await getCurrentDocument(db, ownerType, stepId);
    const document = normalizeDocumentRow(documentRow).document;
    const initialCompletion = await calculateRuntimeCompletion(db, ownerType, stepId, documentRow);

    if (!initialCompletion.canComplete && !body.forcePending) {
      return error("Existem blocos pendentes. Confirme a conclusao manual para continuar.", 409);
    }

    if (body.forcePending && !initialCompletion.canComplete) {
      const values = await db.prepare("select * from journey_step_values where owner_type = ? and owner_step_id = ?")
        .bind(ownerType, stepId).all<Record<string, unknown>>();
      const currentValues = new Map((values.results ?? []).map((row) => [String(row.block_id), parseJson(String(row.value_json ?? "null"))]));
      const requiredBlocks = document.blocks.filter((block) => block.required && block.visible !== false && !["section", "short_text", "long_text", "phase", "comment"].includes(block.type));

      for (const block of requiredBlocks) {
        const current = asRecord(currentValues.get(block.id));
        const completed = forceCompleteBlockValue(block, current);
        await saveRuntimeValue(db, ownerType, stepId, String(documentRow.id), block.id, completed, "complete", body.updatedBy ?? null, "block_force_completed");
      }
    }

    const payload = await genericPayload(db, ownerType, stepId, documentRow);
    if (!payload.completion.canComplete) return error("Nao foi possivel concluir todos os blocos da etapa.", 409);
    await syncStepStatus(db, ownerType, stepId, "concluido");
    return json({ data: { ...payload, completion: { ...payload.completion, status: "concluido" } } });
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
  const [values, files] = stepIds.length
    ? await Promise.all([
      db.prepare(`select * from journey_step_values where owner_type = ? and owner_step_id in (${stepIds.map(() => "?").join(",")})`).bind(ownerType, ...stepIds).all(),
      db.prepare(`select * from journey_step_files where owner_type = ? and owner_step_id in (${stepIds.map(() => "?").join(",")}) order by created_at asc`).bind(ownerType, ...stepIds).all(),
    ])
    : [{ results: [] }, { results: [] }];
  const completions = await Promise.all((documentsResult.results ?? []).map(async (row) => ({
    stepId: String((row as Record<string, unknown>).step_id),
    completion: await calculateRuntimeCompletion(db, ownerType, String((row as Record<string, unknown>).step_id), row as Record<string, unknown>),
  })));
  return {
    ownerType,
    entity,
    steps: stepsResult.results ?? [],
    documents: (documentsResult.results ?? []).map(normalizeDocumentRow),
    values: (values.results ?? []).map((value) => ({ ...(value as Record<string, unknown>), value: parseJson(String((value as Record<string, unknown>).value_json ?? "null")) })),
    files: files.results ?? [],
    completions,
  };
}

async function genericPayload(db: D1Database, ownerType: OwnerType, stepId: string, documentRow: Record<string, unknown>, userId?: string | null) {
  const document = normalizeDocumentRow(documentRow).document;
  const values = await db.prepare("select * from journey_step_values where owner_type = ? and owner_step_id = ?").bind(ownerType, stepId).all<Record<string, unknown>>();
  const files = await db.prepare("select * from journey_step_files where owner_type = ? and owner_step_id = ?").bind(ownerType, stepId).all<Record<string, unknown>>();
  const parsedValues = (values.results ?? []).map((value) => ({ ...value, value: parseJson(String(value.value_json ?? "null")) }));
  const completion = await calculateRuntimeCompletion(db, ownerType, stepId, documentRow);
  const presentation = await getPresentationPreference(db, ownerType, stepId, userId, document.blocks);
  return { document, values: parsedValues, files: files.results ?? [], completion, presentation };
}

async function getPresentationPreference(db: D1Database, ownerType: OwnerType, stepId: string, userId: string | null | undefined, blocks: Block[]) {
  const defaults = blocks.filter((block) => Boolean(block.collapsedByDefault)).map((block) => block.id);
  if (!userId || ownerType === "template") return { collapsedBlockIds: defaults, customized: false };
  const row = await db.prepare("select collapsed_block_ids_json from journey_step_view_preferences where user_id = ? and owner_type = ? and owner_step_id = ?")
    .bind(userId, ownerType, stepId).first<Record<string, unknown>>();
  if (!row) return { collapsedBlockIds: defaults, customized: false };
  const validIds = new Set(blocks.map((block) => block.id));
  const collapsedBlockIds = parseJson(String(row.collapsed_block_ids_json ?? "[]"));
  return {
    collapsedBlockIds: Array.isArray(collapsedBlockIds) ? collapsedBlockIds.filter((blockId): blockId is string => typeof blockId === "string" && validIds.has(blockId)) : [],
    customized: true,
  };
}

async function removeBlockFromPresentationPreferences(db: D1Database, ownerType: OwnerType, stepId: string, blockId: string) {
  if (ownerType === "template") return;
  const rows = await db.prepare("select id, collapsed_block_ids_json from journey_step_view_preferences where owner_type = ? and owner_step_id = ?")
    .bind(ownerType, stepId).all<{ id: string; collapsed_block_ids_json?: string }>();
  const now = new Date().toISOString();
  for (const row of rows.results ?? []) {
    const saved = parseJson(String(row.collapsed_block_ids_json ?? "[]"));
    const next = Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string" && id !== blockId) : [];
    if (Array.isArray(saved) && next.length === saved.length) continue;
    await db.prepare("update journey_step_view_preferences set collapsed_block_ids_json = ?, updated_at = ? where id = ?")
      .bind(JSON.stringify(next), now, row.id).run();
  }
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

function createGenericBlock(type: string, order: number, title?: string, parentBlockId: string | null = null, configOverride?: Record<string, unknown>): Block {
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
    minFiles: 1,
    allowMultipleFiles: true,
    maxFiles: 20,
    maxFileSizeMb: 25,
    fileMode: "evidence",
  });
  if (type === "phase") Object.assign(config, { status: "pendente", content: "" });
  Object.assign(config, configOverride ?? {}, { parentBlockId });
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
  const current = asRecord(clearForcedCompletion(value?.value));
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
  const current = asRecord(clearForcedCompletion(value?.value));
  const context = {
    id: crypto.randomUUID(),
    title: String(body.title ?? "Contexto").trim() || "Contexto",
    content: String(body.content ?? "").trim(),
    color: normalizeContextColor(String(body.color ?? "mint")),
    createdAt: new Date().toISOString(),
  };
  if (!context.content) throw new Error("Escreva o conteudo do contexto.");
  const contexts = Array.isArray(current.contexts) ? current.contexts : [];
  let next = { ...current, contexts: [...contexts, context] };
  if (ownerType === "project") {
    const prepared = await prepareProjectContextSave(db, stepId, blockId, contexts, next.contexts);
    next = { ...next, contexts: prepared.contexts };
    await saveContextValueAtomically(db, ownerType, stepId, String(documentRow.id), blockId, next, "complete", createdBy, prepared.statements);
  } else {
    await saveRuntimeValue(db, ownerType, stepId, documentRow.id, blockId, next, "complete", createdBy, "context_created");
  }
  const completion = await calculateRuntimeCompletion(db, ownerType, stepId, documentRow);
  await syncStepStatus(db, ownerType, stepId, completion.status);
  return { context, completion };
}

async function saveContextValueAtomically(db: D1Database, ownerType: OwnerType, stepId: string, documentId: string, blockId: string, value: unknown, completionState: string, updatedBy: string | null, extra: D1PreparedStatement[] = []) {
  const existing = await getRuntimeValue(db, ownerType, stepId, blockId);
  const timestamp = new Date().toISOString();
  const write = existing
    ? db.prepare("update journey_step_values set document_id = ?, value_json = ?, completion_state = ?, updated_by = ?, updated_at = ? where id = ?")
      .bind(documentId, JSON.stringify(value), completionState, updatedBy, timestamp, existing.id)
    : db.prepare("insert into journey_step_values (id, owner_type, owner_step_id, document_id, block_id, value_json, completion_state, updated_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), ownerType, stepId, documentId, blockId, JSON.stringify(value), completionState, updatedBy, timestamp, timestamp);
  const event = db.prepare("insert into journey_step_events (id, owner_type, owner_step_id, document_id, block_id, event_type, event_payload_json, created_by, created_at) values (?, ?, ?, ?, ?, 'context_value_saved', ?, ?, ?)")
    .bind(crypto.randomUUID(), ownerType, stepId, documentId, blockId, JSON.stringify({ contextCount: Array.isArray(asRecord(value).contexts) ? (asRecord(value).contexts as unknown[]).length : 0 }), updatedBy, timestamp);
  await db.batch([...extra, write, event]);
}

async function contextUseOwner(db: D1Database, ownerType: OwnerType, stepId: string) {
  if (ownerType === "project") {
    const row = await db.prepare("select p.client_id from project_steps s join projects p on p.id = s.project_id where s.id = ?").bind(stepId).first<{ client_id: string | null }>();
    return row?.client_id ?? null;
  }
  if (ownerType === "client") {
    const row = await db.prepare("select client_id from client_steps where id = ?").bind(stepId).first<{ client_id: string }>();
    return row?.client_id ?? null;
  }
  return null;
}

async function importClientContextsIntoStep(db: D1Database, ownerType: OwnerType, stepId: string, body: { blockId?: string; contextIds?: string[]; updatedBy?: string }) {
  if (ownerType === "template") throw new Error("Importe contextos no rascunho do template.");
  const blockId = String(body.blockId ?? "");
  const clientId = await contextUseOwner(db, ownerType, stepId);
  if (!clientId) throw new Error("Vincule um cliente antes de importar contextos.");
  const documentRow = await getCurrentDocument(db, ownerType, stepId);
  const document = normalizeDocumentRow(documentRow).document;
  if (!document.blocks.some((block) => block.id === blockId && block.type === "context")) throw new Error("Bloco de contexto nao encontrado.");
  const current = await getRuntimeValue(db, ownerType, stepId, blockId);
  const value = asRecord(current?.value);
  const contexts = Array.isArray(value.contexts) ? value.contexts : [];
  const imported = await contextSnapshots(db, clientId, body.contextIds ?? []);
  await saveContextValueAtomically(db, ownerType, stepId, String(documentRow.id), blockId, { ...value, contexts: [...contexts, ...imported] }, "partial", body.updatedBy ?? null);
  const payload = await genericPayload(db, ownerType, stepId, documentRow);
  await syncStepStatus(db, ownerType, stepId, payload.completion.status);
  return payload;
}

async function refreshClientContextInStep(db: D1Database, ownerType: OwnerType, stepId: string, body: { blockId?: string; contextId?: string; updatedBy?: string }) {
  if (ownerType === "template") throw new Error("Atualize o rascunho do template.");
  const clientId = await contextUseOwner(db, ownerType, stepId);
  if (!clientId) throw new Error("Cliente nao vinculado.");
  const blockId = String(body.blockId ?? "");
  const documentRow = await getCurrentDocument(db, ownerType, stepId);
  const document = normalizeDocumentRow(documentRow).document;
  if (!document.blocks.some((block) => block.id === blockId && block.type === "context")) throw new Error("Bloco de contexto nao encontrado.");
  const current = await getRuntimeValue(db, ownerType, stepId, blockId);
  const value = asRecord(current?.value);
  const contexts = Array.isArray(value.contexts) ? value.contexts as Array<Record<string, unknown>> : [];
  const selected = contexts.find((item) => item.id === body.contextId);
  if (!selected?.sourceContextId) throw new Error("Contexto vinculado nao encontrado neste bloco.");
  const source = await currentContextVersion(db, clientId, String(selected.sourceContextId));
  if (source.status !== "active") throw new Error("A fonte esta arquivada. O texto em uso foi preservado.");
  const next = contexts.map((item) => item.id === body.contextId ? { ...item, title: source.title, content: source.content, sourceVersion: source.version } : item);
  await saveContextValueAtomically(db, ownerType, stepId, String(documentRow.id), blockId, { ...value, contexts: next }, "partial", body.updatedBy ?? null);
  return genericPayload(db, ownerType, stepId, documentRow);
}

async function associateExistingProjectContexts(db: D1Database, ownerType: OwnerType, stepId: string, body: { blockId?: string; contextIds?: string[]; updatedBy?: string }) {
  if (ownerType !== "project") throw new Error("A revisao de contextos locais pertence ao projeto.");
  const blockId = String(body.blockId ?? "");
  const documentRow = await getCurrentDocument(db, ownerType, stepId);
  const document = normalizeDocumentRow(documentRow).document;
  if (!document.blocks.some((block) => block.id === blockId && block.type === "context")) throw new Error("Bloco de contexto nao encontrado.");
  const current = await getRuntimeValue(db, ownerType, stepId, blockId);
  const value = asRecord(current?.value);
  const contexts = Array.isArray(value.contexts) ? value.contexts as Array<Record<string, unknown>> : [];
  const selected = new Set(body.contextIds ?? []);
  if (!selected.size || contexts.filter((item) => selected.has(String(item.id)) && !item.sourceContextId).length !== selected.size) throw new Error("Selecione contextos locais existentes para associar.");
  const prepared = await prepareProjectContextSave(db, stepId, blockId, contexts.filter((item) => !selected.has(String(item.id))) as never[], contexts as never[]);
  if (!prepared.statements.length) throw new Error("Vincule um cliente antes de associar contextos.");
  await saveContextValueAtomically(db, ownerType, stepId, String(documentRow.id), blockId, { ...value, contexts: prepared.contexts }, "partial", body.updatedBy ?? null, prepared.statements);
  return genericPayload(db, ownerType, stepId, documentRow);
}

/**
 * Every context written in a project whose client is known belongs to that
 * client's library. Older projects kept "local" contexts; this links them all
 * (idempotent: already linked cards are skipped).
 */
async function linkAllProjectContextsToClients(db: D1Database) {
  const rows = await db.prepare(`select v.owner_step_id as step_id, v.block_id, v.value_json
    from journey_step_values v
    join project_steps s on s.id = v.owner_step_id
    join projects p on p.id = s.project_id
    where v.owner_type = 'project' and p.client_id is not null and v.value_json like '%"contexts"%'`).all<{ step_id: string; block_id: string; value_json: string }>();
  let blocks = 0;
  let linked = 0;
  const failures: Array<{ stepId: string; blockId: string; error: string }> = [];
  for (const row of rows.results ?? []) {
    let value: Record<string, unknown>;
    try { value = JSON.parse(row.value_json); } catch { continue; }
    const contexts = Array.isArray(value.contexts) ? value.contexts as Array<Record<string, unknown>> : [];
    const ids = contexts
      .filter((item) => !item.sourceContextId && String(item.title ?? "").trim() && String(item.content ?? "").trim())
      .map((item) => String(item.id));
    if (!ids.length) continue;
    blocks += 1;
    try {
      await associateExistingProjectContexts(db, "project", row.step_id, { blockId: row.block_id, contextIds: ids, updatedBy: "Vínculo automático" });
      linked += ids.length;
    } catch (failure) {
      failures.push({ stepId: row.step_id, blockId: row.block_id, error: failure instanceof Error ? failure.message : String(failure) });
    }
  }
  return { blocks, linked, failures };
}

async function saveProjectAsTemplate(
  env: Env,
  projectId: string,
  requestedName?: string,
  createdBy: string | null = null,
  existingTemplateId: string | null = null,
  presentationDefaults: Record<string, string[]> = {},
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
    const editor = await getTemplateEditor(db, templateId!);
    const sourceSteps = await db.prepare("select * from project_steps where project_id = ? order by step_order asc").bind(projectId).all<Record<string, unknown>>();
    const existingStepIds = new Set(editor.published.steps.map((step) => step.id));
    const steps: TemplateSnapshot["steps"] = [];
    const fileMapping: Array<{ projectStepId: string; templateStepId: string; blockIds: string[] }> = [];
    for (const projectStep of sourceSteps.results ?? []) {
      const linkedId = String(projectStep.source_journey_step_id ?? "");
      const stepId = existingStepIds.has(linkedId) ? linkedId : crypto.randomUUID();
      const sourceRow = await getCurrentDocument(db, "project", String(projectStep.id), false);
      const source = sourceRow ? normalizeDocumentRow(sourceRow).document : await buildProjectLegacyDocument(db, projectStep, crypto.randomUUID());
      const hasDefault = Object.prototype.hasOwnProperty.call(presentationDefaults, String(projectStep.id));
      const withPresentation = hasDefault ? { ...source, blocks: source.blocks.map((block) => ({ ...block, collapsedByDefault: (presentationDefaults[String(projectStep.id)] ?? []).includes(block.id) })) } : source;
      const document = await createProjectTemplateDocument(withPresentation, templateId!, stepId, String(projectStep.name ?? source.title));
      fileMapping.push({ projectStepId: String(projectStep.id), templateStepId: stepId, blockIds: document.blocks.filter((block) => block.type === "prompt" || block.type === "file_upload" && block.config?.fileMode === "resource_pack").map((block) => block.id) });
      steps.push({ id: stepId, name: String(projectStep.name ?? source.title), description: String(projectStep.description ?? ""), stepOrder: steps.length + 1, document: document as TemplateSnapshot["steps"][number]["document"] });
    }
    const snapshot: TemplateSnapshot = { ...editor.published, name, description: `Atualizado a partir do projeto ${project.name ?? ""}.`, projectTypeId: project.project_type_id == null ? null : String(project.project_type_id), projectModalityId: project.project_modality_id == null ? null : String(project.project_modality_id), steps };
    await saveTemplateDraft(db, templateId!, snapshot, editor.draftRevision);
    await stageProjectModelFiles(db, env.FILES, templateId!, fileMapping);
    return { id: templateId, name, mode, draft: true };
  } else {
    await db.prepare("insert into journey_templates (id, name, description, project_type_id, project_modality_id, context, status, created_at) values (?, ?, ?, ?, ?, 'projeto', 'ativo', ?)")
      .bind(templateId, name, `Criado a partir do projeto ${project.name ?? ""}.`, project.project_type_id ?? null, project.project_modality_id ?? null, now).run();
  }

  const steps = await db.prepare("select * from project_steps where project_id = ? order by step_order asc").bind(projectId).all<Record<string, unknown>>();
  for (const projectStep of steps.results ?? []) {
    const templateStepId = crypto.randomUUID();
    await db.prepare("insert into journey_steps (id, journey_template_id, name, description, step_order, objective, ai_tool_id, expected_output, checklist, execution_instructions, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, '', ?, 'ativo', ?)")
      .bind(templateStepId, templateId, projectStep.name ?? "Etapa", projectStep.description ?? null, projectStep.step_order ?? 1, projectStep.objective ?? null, projectStep.ai_tool_id ?? null, projectStep.expected_output ?? null, projectStep.execution_instructions ?? null, now).run();

    const source = await getCurrentDocument(db, "project", String(projectStep.id), false);
    if (!source) continue;
    const sourceDocument = normalizeDocumentRow(source).document;
    const stepId = String(projectStep.id);
    const hasPresentationDefault = Object.prototype.hasOwnProperty.call(presentationDefaults, stepId);
    const documentWithPresentation = hasPresentationDefault
      ? { ...sourceDocument, blocks: sourceDocument.blocks.map((block) => ({ ...block, collapsedByDefault: (presentationDefaults[stepId] ?? []).includes(block.id) })) }
      : sourceDocument;
    const templateDocument = await createProjectTemplateDocument(documentWithPresentation, templateId, templateStepId, String(projectStep.name ?? sourceDocument.title));
    await insertDocument(db, templateDocument, templateId, createdBy);
    await copyProjectFilesToTemplate(env, String(projectStep.id), templateStepId, templateDocument.structureId, templateDocument.blocks, createdBy);
  }
  await db.prepare("update projects set journey_template_id = ?, updated_at = ? where id = ?").bind(templateId, now, projectId).run();
  return { id: templateId, name, mode };
}

type SummaryTemplateItem = {
  key: string;
  parentKey: string | null;
  topicNumber: string;
  title: string;
  level: number;
  sortOrder: number;
  originalText: string;
  isSelected: boolean;
  notes: string | null;
  parseConfidence: number | null;
  parseWarning: string | null;
};

type SummaryTemplateSnapshot = {
  schemaVersion: 1;
  savedAt: string;
  rawText: string;
  consolidatedText: string | null;
  parseStatus: string;
  promptConfigJson: string;
  items: SummaryTemplateItem[];
};

async function saveProjectSummaryAsTemplate(
  db: D1Database,
  projectId: string,
  body: { stepId?: string; blockId?: string; summaryId?: string; createdBy?: string },
) {
  const stepId = String(body.stepId ?? "").trim();
  const blockId = String(body.blockId ?? "").trim();
  const summaryId = String(body.summaryId ?? "").trim();
  if (!stepId || !blockId || !summaryId) throw new Error("Informe a etapa, o bloco e a versao do sumario.");

  const project = await db.prepare("select journey_template_id from projects where id = ?").bind(projectId).first<Record<string, unknown>>();
  const templateId = String(project?.journey_template_id ?? "").trim();
  if (!templateId) throw new Error("Salve ou vincule esta jornada a um template antes de salvar o sumario.");

  const projectStep = await db.prepare("select id, source_journey_step_id from project_steps where id = ? and project_id = ?")
    .bind(stepId, projectId).first<Record<string, unknown>>();
  const templateStepId = String(projectStep?.source_journey_step_id ?? "").trim();
  if (!templateStepId) throw new Error("Esta etapa nao possui uma origem no template vinculado.");

  const runtimeRow = await getCurrentDocument(db, "project", stepId, false);
  const runtimeBlock = runtimeRow ? normalizeDocumentRow(runtimeRow).document.blocks.find((block) => block.id === blockId && block.type === "project_summary") : null;
  if (!runtimeBlock || String(runtimeBlock.config?.summaryId ?? "") !== summaryId) {
    throw new Error("O bloco de sumario nao corresponde a versao selecionada nesta etapa.");
  }

  const summary = await db.prepare("select * from project_summaries where id = ? and project_id = ?")
    .bind(summaryId, projectId).first<Record<string, unknown>>();
  if (!summary) throw new Error("A versao do sumario nao pertence a este projeto.");

  const summaryItems = await db.prepare("select * from project_summary_items where summary_id = ? order by sort_order asc")
    .bind(summaryId).all<Record<string, unknown>>();
  const snapshot: SummaryTemplateSnapshot = {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    rawText: String(summary.raw_text ?? ""),
    consolidatedText: summary.consolidated_text == null ? null : String(summary.consolidated_text),
    parseStatus: String(summary.parse_status ?? "reviewed"),
    promptConfigJson: String(summary.prompt_config_json ?? "{}"),
    items: (summaryItems.results ?? []).map((item) => ({
      key: String(item.id),
      parentKey: item.parent_id == null ? null : String(item.parent_id),
      topicNumber: String(item.topic_number ?? ""),
      title: String(item.title ?? "Topico"),
      level: Number(item.level ?? 1),
      sortOrder: Number(item.sort_order ?? 0),
      originalText: String(item.original_text ?? ""),
      isSelected: Number(item.is_selected ?? 0) === 1 || item.is_selected === true,
      notes: item.notes == null ? null : String(item.notes),
      parseConfidence: item.parse_confidence == null ? null : Number(item.parse_confidence),
      parseWarning: item.parse_warning == null ? null : String(item.parse_warning),
    })),
  };

  const templateRow = await db.prepare("select * from journey_step_documents where owner_type = 'template' and owner_id = ? and step_id = ? and state in ('draft', 'published') order by case state when 'published' then 0 else 1 end, version_number desc limit 1")
    .bind(templateId, templateStepId).first<Record<string, unknown>>();
  if (!templateRow) throw new Error("A estrutura correspondente no template nao foi encontrada.");
  const templateDocument = normalizeDocumentRow(templateRow).document;
  const blockFound = templateDocument.blocks.some((block) => block.id === blockId && block.type === "project_summary");
  if (!blockFound) throw new Error("O bloco de sumario nao corresponde a estrutura do template.");

  const document = {
    ...templateDocument,
    revision: Number(templateRow.revision ?? templateDocument.revision ?? 1) + 1,
    blocks: templateDocument.blocks.map((block) => block.id === blockId
      ? { ...block, config: { ...(block.config ?? {}), summaryId: null, summaryTemplate: snapshot } }
      : block),
  };
  const now = new Date().toISOString();
  await db.prepare("update journey_step_documents set revision = ?, document_json = ?, updated_at = ? where id = ?")
    .bind(document.revision, JSON.stringify(document), now, templateRow.id).run();
  await logGenericEvent(db, "template", templateStepId, String(templateRow.id), blockId, "summary_template_saved", { summaryId, itemCount: snapshot.items.length }, body.createdBy ?? null);
  return { templateId, stepId: templateStepId, blockId, itemCount: snapshot.items.length, savedAt: snapshot.savedAt };
}

function readSummaryTemplateSnapshot(value: unknown): SummaryTemplateSnapshot | null {
  const snapshot = asRecord(value);
  if (Number(snapshot.schemaVersion) !== 1 || !Array.isArray(snapshot.items)) return null;
  return {
    schemaVersion: 1,
    savedAt: String(snapshot.savedAt ?? ""),
    rawText: String(snapshot.rawText ?? ""),
    consolidatedText: snapshot.consolidatedText == null ? null : String(snapshot.consolidatedText),
    parseStatus: String(snapshot.parseStatus ?? "reviewed"),
    promptConfigJson: String(snapshot.promptConfigJson ?? "{}"),
    items: snapshot.items.map((item) => {
      const record = asRecord(item);
      return {
        key: String(record.key ?? crypto.randomUUID()),
        parentKey: record.parentKey == null ? null : String(record.parentKey),
        topicNumber: String(record.topicNumber ?? ""),
        title: String(record.title ?? "Topico"),
        level: Number(record.level ?? 1),
        sortOrder: Number(record.sortOrder ?? 0),
        originalText: String(record.originalText ?? ""),
        isSelected: Boolean(record.isSelected),
        notes: record.notes == null ? null : String(record.notes),
        parseConfidence: record.parseConfidence == null ? null : Number(record.parseConfidence),
        parseWarning: record.parseWarning == null ? null : String(record.parseWarning),
      };
    }),
  };
}

async function materializeProjectSummaryTemplates(db: D1Database, document: StepDocument, projectId: string): Promise<StepDocument> {
  let blocks = document.blocks;
  for (const block of document.blocks) {
    if (block.type !== "project_summary") continue;
    const snapshot = readSummaryTemplateSnapshot(block.config?.summaryTemplate);
    if (!snapshot) continue;

    const summaryId = crypto.randomUUID();
    const now = new Date().toISOString();
    const itemIds = new Map(snapshot.items.map((item) => [item.key, crypto.randomUUID()]));
    await db.prepare("insert into project_summaries (id, project_id, raw_text, consolidated_text, version_number, status, parse_status, item_count, selected_item_count, prompt_config_json, created_by, created_at, updated_at, activated_at) values (?, ?, ?, ?, 1, 'active', ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(summaryId, projectId, snapshot.rawText, snapshot.consolidatedText, snapshot.parseStatus, snapshot.items.length, snapshot.items.filter((item) => item.isSelected).length, snapshot.promptConfigJson, null, now, now, now).run();
    if (snapshot.items.length) {
      await db.batch(snapshot.items.map((item) => db.prepare("insert into project_summary_items (id, summary_id, project_id, parent_id, topic_number, title, level, sort_order, original_text, is_selected, status, notes, parse_confidence, parse_warning, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?, ?)")
        .bind(itemIds.get(item.key), summaryId, projectId, item.parentKey ? itemIds.get(item.parentKey) ?? null : null, item.topicNumber, item.title, item.level, item.sortOrder, item.originalText, item.isSelected ? 1 : 0, item.notes, item.parseConfidence, item.parseWarning, now, now)));
    }
    blocks = blocks.map((candidate) => {
      if (candidate.id !== block.id) return candidate;
      const { summaryTemplate: _summaryTemplate, ...config } = candidate.config ?? {};
      return { ...candidate, config: { ...config, summaryId } };
    });
  }
  return { ...document, blocks };
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
    blocks: sourceDocument.blocks.map((block) => ({
      ...block,
      config: sanitizeModelConfig(block.type, (block.config ?? {}) as Record<string, unknown>),
    })),
  };
}

async function updateJourneyTemplate(db: D1Database, templateId: string, patch: { name?: string; description?: string | null; status?: string; project_type_id?: string | null; project_modality_id?: string | null }) {
  const template = await db.prepare("select * from journey_templates where id = ?").bind(templateId).first<Record<string, unknown>>();
  if (!template) throw new Error("Template nao encontrado.");
  const name = String(patch.name ?? template.name ?? "").trim();
  if (!name) throw new Error("Informe o nome do template.");
  const description = patch.description === undefined ? template.description ?? null : patch.description;
  const status = ["ativo", "inativo", "arquivado"].includes(String(patch.status)) ? patch.status : template.status ?? "ativo";
  const projectTypeId = patch.project_type_id === undefined ? template.project_type_id ?? null : String(patch.project_type_id ?? "").trim() || null;
  const projectModalityId = patch.project_modality_id === undefined ? template.project_modality_id ?? null : String(patch.project_modality_id ?? "").trim() || null;
  if (projectTypeId) {
    const projectType = await db.prepare("select id from project_types where id = ?").bind(projectTypeId).first();
    if (!projectType) throw new Error("Tipo de projeto nao encontrado.");
  }
  if (projectModalityId) {
    const projectModality = await db.prepare("select id from project_modalities where id = ? and project_type_id = ?").bind(projectModalityId, projectTypeId).first();
    if (!projectModality) throw new Error("Modalidade nao pertence ao tipo selecionado.");
  }
  await db.prepare("update journey_templates set name = ?, description = ?, status = ?, project_type_id = ?, project_modality_id = ? where id = ?")
    .bind(name, description, status, projectTypeId, projectModalityId, templateId).run();
  return { ...template, id: templateId, name, description, status, project_type_id: projectTypeId, project_modality_id: projectModalityId };
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

async function saveClientAsTemplate(
  db: D1Database,
  clientId: string,
  requestedName?: string,
  createdBy: string | null = null,
  presentationDefaults: Record<string, string[]> = {},
) {
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
    const sourceStepId = String(clientStep.id);
    const hasPresentationDefault = Object.prototype.hasOwnProperty.call(presentationDefaults, sourceStepId);
    const documentWithPresentation = hasPresentationDefault
      ? {
        ...sourceDocument,
        blocks: sourceDocument.blocks.map((block) => ({
          ...block,
          collapsedByDefault: (presentationDefaults[sourceStepId] ?? []).includes(block.id),
        })),
      }
      : sourceDocument;
    const templateDocument: StepDocument = {
      ...documentWithPresentation,
      ownerType: "template",
      clientId: undefined,
      stepId: templateStepId,
      structureId: crypto.randomUUID(),
      title: String(clientStep.name ?? sourceDocument.title),
      state: "published",
      versionNumber: 1,
      revision: 1,
      blocks: documentWithPresentation.blocks.map((block) => block.type === "context"
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
  const latest = await db.prepare("select max(version_number) as version from project_summaries where project_id = ?").bind(summary.project_id).first<{ version: number | null }>();
  const versionNumber = Math.max(nextVersion, Number(latest?.version ?? 0) + 1);
  const hasActive = await db.prepare("select 1 as found from project_summaries where project_id = ? and status = 'active' and consolidated_text is not null limit 1").bind(summary.project_id).first();
  const status = hasActive ? "draft" : "active";
  const statements: D1PreparedStatement[] = [
    db.prepare("insert into project_summaries (id, project_id, raw_text, consolidated_text, version_number, status, parse_status, item_count, selected_item_count, prompt_config_json, created_by, created_at, updated_at, activated_at) values (?, ?, ?, ?, ?, ?, 'reviewed', ?, ?, ?, ?, ?, ?, ?)")
      .bind(nextId, summary.project_id, summary.raw_text ?? "", consolidatedText, versionNumber, status, normalized.length, normalized.length, summary.prompt_config_json ?? "{}", createdBy, now, now, status === "active" ? now : null),
  ];
  for (const item of normalized) {
    statements.push(db.prepare("insert into project_summary_items (id, summary_id, project_id, parent_id, topic_number, title, level, sort_order, original_text, is_selected, status, notes, parse_confidence, parse_warning, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)")
      .bind(item.id, nextId, summary.project_id, item.parent_id, item.topic_number, item.title, item.level, item.sort_order, item.original_text ?? "", item.status ?? "pendente", item.notes ?? null, item.parse_confidence ?? 1, item.parse_warning ?? null, now, now));
  }
  await db.batch(statements);
  return await db.prepare("select * from project_summaries where id = ?").bind(nextId).first();
}

async function getSummaryState(db: D1Database, summaryId: string) {
  const [summary, items, prompts] = await Promise.all([
    db.prepare("select * from project_summaries where id = ?").bind(summaryId).first<Record<string, unknown>>(),
    db.prepare("select * from project_summary_items where summary_id = ? order by sort_order asc").bind(summaryId).all<Record<string, unknown>>(),
    db.prepare("select * from generated_prompts where summary_id = ? order by created_at asc").bind(summaryId).all<Record<string, unknown>>(),
  ]);
  if (!summary) throw new Error("Sumario nao encontrado.");
  return { summary, items: items.results ?? [], prompts: prompts.results ?? [] };
}

async function saveSummaryPrompt(db: D1Database, summaryId: string, body: { promptId?: string; itemIds?: string[]; finalPrompt?: string; basePromptId?: string | null; basePromptSnapshot?: string | null; aiToolId?: string | null; createdBy?: string | null; notes?: string | null }) {
  const summary = await db.prepare("select * from project_summaries where id = ?").bind(summaryId).first<Record<string, unknown>>();
  if (!summary) throw new Error("Sumario nao encontrado.");
  const itemIds = Array.from(new Set((body.itemIds ?? []).filter(Boolean)));
  const finalPrompt = String(body.finalPrompt ?? "").trim();
  if (!finalPrompt || itemIds.length === 0) throw new Error("Selecione topicos e gere o prompt antes de salvar.");
  const items = await db.prepare("select id, parent_id, status from project_summary_items where summary_id = ?").bind(summaryId)
    .all<{ id: string; parent_id: string | null; status: string }>();
  const byId = new Map((items.results ?? []).map((item) => [item.id, item]));
  if (itemIds.some((id) => !byId.has(id))) throw new Error("Um ou mais topicos nao pertencem a este sumario.");
  const id = body.promptId ?? crypto.randomUUID();
  const previous = await db.prepare("select summary_id from generated_prompts where id = ?").bind(id).first<{ summary_id: string }>();
  if (previous && previous.summary_id !== summaryId) throw new Error("Identificador de prompt ja utilizado.");
  const toStart = new Set<string>();
  for (const rootId of itemIds) {
    if (byId.get(rootId)?.status !== "pendente") continue;
    toStart.add(rootId);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of items.results ?? []) {
        if (item.parent_id && toStart.has(item.parent_id) && !toStart.has(item.id)) {
          toStart.add(item.id);
          changed = true;
        }
      }
    }
  }
  const now = new Date().toISOString();
  if (!previous) {
    const statements: D1PreparedStatement[] = [db.prepare("insert into generated_prompts (id, project_id, summary_id, summary_item_id, base_prompt_id, base_prompt_snapshot, selected_blocks_json, final_prompt, notes, ai_tool_id, created_by, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, summary.project_id, summaryId, itemIds[0], body.basePromptId ?? null, body.basePromptSnapshot ?? null, JSON.stringify({ schemaVersion: 1, summaryItemIds: itemIds }), finalPrompt, body.notes ?? `${itemIds.length} topicos selecionados`, body.aiToolId ?? null, body.createdBy ?? null, now)];
    for (const itemId of toStart) {
      statements.push(db.prepare("update project_summary_items set status = 'em_andamento', updated_at = ? where id = ? and status = 'pendente'").bind(now, itemId));
    }
    await db.batch(statements);
  }
  return getSummaryState(db, summaryId);
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
  // Runtime evidence belongs to the real project. Only explicit resource packs
  // and prompt attachments are reusable assets for a future template.
  const blockIds = new Set(blocks
    .filter((block) => block.type === "prompt" || (block.type === "file_upload" && block.config?.fileMode === "resource_pack"))
    .map((block) => block.id));
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
  const blockIds = new Set(blocks
    .filter((block) => block.type === "prompt" || (block.type === "file_upload" && block.config?.fileMode === "resource_pack"))
    .map((block) => block.id));
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
  const summariesBound = await bindUnboundProjectSummaries(db);
  return { projectsCreated, clientsCreated, summariesBound };
}

/** Binds legacy summary blocks once so all surfaces use one summary version. */
async function bindUnboundProjectSummaries(db: D1Database) {
  const rows = await db.prepare("select * from journey_step_documents where owner_type = 'project' and state in ('draft', 'published') order by updated_at desc").all<Record<string, unknown>>();
  let summariesBound = 0;

  for (const row of rows.results ?? []) {
    const document = normalizeDocumentRow(row).document;
    const unboundBlocks = document.blocks.filter((block) => block.type === "project_summary" && !String(block.config?.summaryId ?? "").trim());
    if (!unboundBlocks.length || !document.projectId) continue;

    const summary = await db.prepare("select id from project_summaries where project_id = ? and status in ('active', 'ativo') order by version_number desc limit 1")
      .bind(document.projectId)
      .first<Record<string, unknown>>();
    if (!summary?.id) continue;

    const summaryId = String(summary.id);
    const boundDocument = {
      ...document,
      revision: Number(row.revision ?? document.revision ?? 1) + 1,
      blocks: document.blocks.map((block) => block.type === "project_summary" && !String(block.config?.summaryId ?? "").trim()
        ? { ...block, config: { ...(block.config ?? {}), summaryId } }
        : block),
    };
    const now = new Date().toISOString();
    await db.prepare("update journey_step_documents set revision = ?, document_json = ?, updated_at = ? where id = ?")
      .bind(boundDocument.revision, JSON.stringify(boundDocument), now, row.id)
      .run();
    await logGenericEvent(db, "project", document.stepId, String(row.id), null, "summary_bound", { summaryId }, null);
    summariesBound += unboundBlocks.length;
  }

  return summariesBound;
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
  const requiredBlocks = document.blocks.filter((block) => block.required && block.visible !== false && !["section", "short_text", "long_text", "phase", "comment"].includes(block.type));
  let total = 0;
  let done = 0;
  const reasons: Array<{ blockId: string; message: string }> = [];
  for (const block of requiredBlocks) {
    total += 1;
    const value = values.get(block.id);
    let complete = false;
    if (Boolean(asRecord(value).forceCompleted)) {
      complete = true;
    } else if (block.type === "checklist") {
      const checked = asRecord(asRecord(value).checked);
      const items = Array.isArray(block.config?.items) ? block.config?.items as Array<Record<string, unknown>> : [];
      const requiredItems = items.filter((item) => item.required !== false);
      complete = requiredItems.length > 0 && requiredItems.every((item) => Boolean(checked[String(item.id)] ?? item.done));
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
    else if (block.type === "file_upload") complete = files.filter((file) => String(file.block_id) === block.id).length >= Math.max(1, Number(block.config?.minFiles ?? 1));
    else if (block.type === "materials") complete = isMaterialsComplete(block.config, value);
    else if (block.type === "project_summary") complete = await isProjectSummaryComplete(db, ownerType, stepId, block, value);
    else complete = !isEmpty(value);
    if (complete) done += 1;
    else reasons.push({ blockId: block.id, message: block.type === "project_summary" ? "Conclua todos os tópicos selecionados do sumário." : block.type === "materials" ? materialsPendingMessage(block.config, value, block.title) : `Conclua ${block.title}.` });
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

async function isProjectSummaryComplete(db: D1Database, ownerType: OwnerType, stepId: string, block: Block, value: unknown) {
  if (ownerType !== "project") return false;
  const runtime = asRecord(value);
  if (!Boolean(runtime.completed)) return false;
  const summaryId = String(block.config?.summaryId ?? "").trim();
  if (!summaryId || String(runtime.summaryId ?? "") !== summaryId) return false;
  const summary = await db.prepare("select status from project_summaries where id = ?").bind(summaryId).first<Record<string, unknown>>();
  if (!summary || !["active", "ativo"].includes(String(summary.status))) return false;
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
function clearForcedCompletion(value: unknown) {
  const record = asRecord(value);
  if (!record.forceCompleted) return value;
  const { forceCompleted: _forceCompleted, forceCompletedAt: _forceCompletedAt, ...next } = record;
  return next;
}
function forceCompleteBlockValue(block: Block, value: Record<string, any>) {
  const now = new Date().toISOString();
  const next: Record<string, any> = { ...value, forceCompleted: true, forceCompletedAt: now };
  if (block.type === "checklist") {
    const items = Array.isArray(block.config?.items) ? block.config.items as Array<Record<string, unknown>> : [];
    const checked = asRecord(value.checked);
    next.checked = { ...checked, ...Object.fromEntries(items.filter((item) => item.required !== false).map((item) => [String(item.id), true])) };
  }
  if (block.type === "prompt") {
    const conditions = Array.isArray(block.config?.applicationConditions) ? block.config.applicationConditions as Array<Record<string, unknown>> : [];
    const conditionChecks = asRecord(value.conditionChecks);
    next.applied = true;
    next.appliedAt = value.appliedAt ?? now;
    next.conditionChecks = { ...conditionChecks, ...Object.fromEntries(conditions.filter((condition) => condition.required !== false).map((condition) => [String(condition.id ?? ""), true])) };
  }
  return next;
}
function isEmpty(value: unknown) { return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0) || (typeof value === "object" && value !== null && Object.keys(value as Record<string, unknown>).length === 0); }
function sanitizeFileName(value: string) { return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "arquivo"; }
function normalizeContextColor(value: string) { return ["mint", "teal", "amber", "blue", "rose", "slate"].includes(value) ? value : "mint"; }
function isOwnerType(value: string): value is OwnerType { return value === "project" || value === "client" || value === "template"; }
function json(data: unknown, status = 200) { return new Response(JSON.stringify({ data }), { status, headers }); }
function error(message: string, status = 400) { return new Response(JSON.stringify({ data: null, error: message }), { status, headers }); }
