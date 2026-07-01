import { handleProjectStepRequest } from "./blockBuilder";

type Env = {
  DB: D1Database;
  FILES?: R2Bucket;
  ASSETS?: Fetcher;
};

type RecordValue = string | number | boolean | null;
type DataRecord = Record<string, RecordValue | undefined>;

const tableColumns: Record<string, string[]> = {
  app_users: ["id", "name", "status", "created_at", "updated_at"],
  ai_tools: ["id", "name", "description", "logo_url", "access_url", "usage_instructions", "status", "created_at"],
  prompt_categories: ["id", "name", "description", "status", "created_at"],
  project_types: ["id", "name", "description", "status", "created_at"],
  prompts: ["id", "title", "short_description", "content", "category_id", "ai_tool_id", "project_type_id", "variables", "version", "status", "created_at"],
  journey_templates: ["id", "name", "description", "project_type_id", "context", "status", "created_at"],
  journey_steps: ["id", "journey_template_id", "name", "description", "step_order", "objective", "ai_tool_id", "expected_output", "checklist", "execution_instructions", "status", "created_at"],
  step_prompts: ["id", "journey_step_id", "prompt_id", "title", "content", "ai_tool_id", "prompt_status", "is_required", "placeholder_note", "prompt_order", "usage_notes", "created_at"],
  procedures: ["id", "title", "description", "content", "category", "project_type_id", "journey_step_id", "status", "created_at"],
  projects: ["id", "name", "company", "responsible", "project_type_id", "journey_template_id", "status", "notes", "created_at", "updated_at"],
  project_steps: ["id", "project_id", "source_journey_step_id", "name", "description", "step_order", "objective", "ai_tool_id", "expected_output", "execution_instructions", "status", "notes", "created_at", "updated_at"],
  project_step_checklist_items: ["id", "project_step_id", "label", "is_done", "item_order", "created_at"],
  project_step_prompts: ["id", "project_step_id", "prompt_id", "title", "content", "ai_tool_id", "prompt_status", "is_required", "placeholder_note", "prompt_order", "usage_notes", "created_at"],
  project_step_links: ["id", "project_step_id", "title", "url", "notes", "link_order", "created_at"],
  project_step_phases: ["id", "project_step_id", "title", "description", "phase_order", "status", "requires_previous_phase", "prerequisite_phase_id", "completion_condition", "created_at", "updated_at"],
  project_step_contexts: ["id", "project_step_id", "phase_id", "title", "content", "context_order", "status", "created_at", "updated_at"],
  project_summaries: ["id", "project_id", "raw_text", "consolidated_text", "version_number", "status", "parse_status", "item_count", "selected_item_count", "created_by", "created_at", "updated_at", "activated_at", "archived_at"],
  project_summary_items: ["id", "summary_id", "project_id", "parent_id", "topic_number", "title", "level", "sort_order", "original_text", "is_selected", "status", "notes", "parse_confidence", "parse_warning", "created_at", "updated_at"],
  prompt_blocks: ["id", "title", "description", "content", "category", "ai_tool_id", "project_type_id", "journey_step_id", "status", "created_at", "updated_at"],
  generated_prompts: ["id", "project_id", "summary_id", "summary_item_id", "base_prompt_id", "base_prompt_snapshot", "selected_blocks_json", "final_prompt", "notes", "ai_tool_id", "created_by", "created_at"],
  project_step_structures: ["id", "owner_type", "project_step_id", "client_step_id", "template_step_id", "schema_version", "version_number", "revision", "state", "title", "document_json", "created_by", "created_at", "updated_at", "published_at", "archived_at"],
  project_step_block_values: ["id", "project_step_id", "structure_id", "block_id", "value_json", "completion_state", "updated_by", "created_at", "updated_at"],
  project_step_block_files: ["id", "project_step_id", "structure_id", "block_id", "item_id", "name", "content_type", "size_bytes", "version_number", "description", "approval_status", "url", "created_by", "created_at"],
  project_step_block_events: ["id", "project_step_id", "structure_id", "block_id", "event_type", "event_payload_json", "created_by", "created_at"],
  clients: ["id", "name", "company", "logo_url", "responsible", "project_type_id", "journey_template_id", "entry_month", "status", "notes", "created_at", "updated_at"],
  client_steps: ["id", "client_id", "source_journey_step_id", "name", "description", "step_order", "objective", "required_evidence_label", "status", "notes", "due_date", "completed_at", "created_at", "updated_at"],
  client_step_checklist_items: ["id", "client_step_id", "label", "is_done", "item_order", "created_at"],
  client_step_links: ["id", "client_step_id", "title", "url", "notes", "link_order", "created_at"],
};

const booleanColumns = new Set(["is_done", "is_required", "requires_previous_phase", "is_selected"]);

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,cf-access-jwt-assertion",
};

export default {
  async fetch(request: Request, env: Env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const parts = url.pathname.split("/").filter(Boolean);

      if (url.pathname === "/api/health") {
        return json({ ok: true, storage: "cloudflare-d1" });
      }

      if (parts[0] === "api" && parts[1] === "project-steps" && parts[2]) {
        return handleProjectStepRequest(request, env, parts[2], parts.slice(3));
      }

      if (parts[0] === "api" && parts[1] === "tables") {
        return handleTableRequest(request, env, parts[2], parts[3], url);
      }

      if (parts[0] === "api" && parts[1] === "files") {
        return handleFileRequest(request, env, parts.slice(2), url);
      }

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return jsonError("Rota nao encontrada.", 404);
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Erro interno.", 500);
    }
  },
};

async function handleTableRequest(request: Request, env: Env, tableName = "", id = "", url: URL) {
  const columns = tableColumns[tableName];

  if (!columns) {
    return jsonError("Tabela nao permitida.", 400);
  }

  if (request.method === "GET") {
    const order = url.searchParams.get("order") || "created_at";
    const direction = url.searchParams.get("ascending") === "false" ? "DESC" : "ASC";
    const orderColumn = columns.includes(order) ? order : "created_at";
    const { results } = await env.DB.prepare(`select * from ${tableName} order by ${orderColumn} ${direction}`).all();
    return json({ data: normalizeRows(results ?? []) });
  }

  if (request.method === "POST") {
    const body = await request.json();
    const rows = Array.isArray(body) ? body : [body];
    const inserted = [];

    for (const row of rows) {
      const normalized = normalizeRecord(row as DataRecord, columns, true);
      await insertRecord(env.DB, tableName, normalized);
      inserted.push(await getById(env.DB, tableName, String(normalized.id)));
    }

    return json({ data: normalizeRows(inserted.filter(Boolean)) });
  }

  if (request.method === "PATCH" && id) {
    const body = (await request.json()) as DataRecord;
    const normalized = normalizeRecord(body, columns, false);
    await updateRecord(env.DB, tableName, id, normalized);
    return json({ data: normalizeRows([await getById(env.DB, tableName, id)].filter(Boolean)) });
  }

  if (request.method === "DELETE" && id) {
    await env.DB.prepare(`delete from ${tableName} where id = ?`).bind(id).run();
    return json({ data: [] });
  }

  return jsonError("Metodo nao permitido.", 405);
}

async function handleFileRequest(request: Request, env: Env, pathParts: string[], url: URL) {
  if (!env.FILES) {
    return jsonError("R2 ainda nao esta habilitado nesta conta Cloudflare.", 503);
  }

  if (request.method === "GET" && pathParts.length === 0) {
    const prefix = url.searchParams.get("prefix") ?? "";
    const listed = await env.FILES.list({ prefix });
    return json({ data: listed.objects.map((object) => ({ key: object.key, size: object.size, uploaded: object.uploaded })) });
  }

  const key = decodeURIComponent(pathParts.join("/"));

  if (request.method === "POST" && pathParts.length === 0) {
    const body = (await request.json()) as { name?: string; contentBase64?: string; contentType?: string };
    const fileKey = `${crypto.randomUUID()}-${sanitizeFileName(body.name ?? "arquivo")}`;
    const bytes = decodeBase64(body.contentBase64 ?? "");
    await env.FILES.put(fileKey, bytes.buffer, { httpMetadata: { contentType: body.contentType ?? "application/octet-stream" } });
    return json({ data: { key: fileKey, url: `/api/files/${encodeURIComponent(fileKey)}` } });
  }

  if (request.method === "GET" && key) {
    const object = await env.FILES.get(key);

    if (!object) {
      return jsonError("Arquivo nao encontrado.", 404);
    }

    return new Response(object.body, {
      headers: {
        ...corsHeaders,
        "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      },
    });
  }

  if (request.method === "DELETE" && key) {
    await env.FILES.delete(key);
    return json({ data: [] });
  }

  return jsonError("Metodo nao permitido.", 405);
}

function normalizeRecord(record: DataRecord, columns: string[], includeId: boolean) {
  const normalized: DataRecord = {};

  if (includeId) {
    normalized.id = typeof record.id === "string" && record.id ? record.id : crypto.randomUUID();
  }

  for (const [key, value] of Object.entries(record)) {
    if (!columns.includes(key) || key === "id" || value === undefined) {
      continue;
    }

    normalized[key] = booleanColumns.has(key) ? (value ? 1 : 0) : value;
  }

  return normalized;
}

function normalizeRows(rows: unknown[]) {
  return rows.map((row) => {
    const next = { ...(row as Record<string, unknown>) };

    for (const column of booleanColumns) {
      if (column in next) {
        next[column] = Boolean(next[column]);
      }
    }

    return next;
  });
}

async function insertRecord(db: D1Database, tableName: string, record: DataRecord) {
  const keys = Object.keys(record);
  const placeholders = keys.map(() => "?").join(", ");
  await db.prepare(`insert into ${tableName} (${keys.join(", ")}) values (${placeholders})`).bind(...keys.map((key) => record[key] ?? null)).run();
}

async function updateRecord(db: D1Database, tableName: string, id: string, record: DataRecord) {
  const keys = Object.keys(record);

  if (keys.length === 0) {
    return;
  }

  await db.prepare(`update ${tableName} set ${keys.map((key) => `${key} = ?`).join(", ")} where id = ?`).bind(...keys.map((key) => record[key] ?? null), id).run();
}

async function getById(db: D1Database, tableName: string, id: string) {
  return db.prepare(`select * from ${tableName} where id = ?`).bind(id).first();
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "arquivo";
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
    },
  });
}

function jsonError(error: string, status = 400) {
  return json({ data: null, error }, status);
}

