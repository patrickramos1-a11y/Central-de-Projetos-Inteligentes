import { browserAccessibleUrl, serverDirectoryPath, type WorkspaceKind, type WorkspaceReference } from "../src/features/workspace/workspaceModel";

type LinkedRow = {
  project_id: string;
  step_id: string;
  step_name: string;
  block_title: string | null;
  source_type: string;
  source_id: string;
  link_id: string | null;
  link_index: string;
  title: string | null;
  target: string | null;
  updated_at: string | null;
};

const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function classifyJourneyLink(title: string, target: string): WorkspaceKind {
  const name = plain(title);
  if (serverDirectoryPath(target)) return "directory";
  const webUrl = browserAccessibleUrl(target);
  if (!webUrl) return "support";
  const url = new URL(webUrl);
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  if (host === "notebooklm.google.com" || /notebook\s*lm|noteb+ok/.test(name)) return "support";
  if (host === "chatgpt.com" || host === "chat.openai.com") return /\/(?:c|share)\/[^/]+/.test(path) ? "conversation" : "support";
  if (host === "claude.ai") return /\/chat\/[^/]+/.test(path) ? "conversation" : "support";
  if (host === "gemini.google.com") return /\/app\/[^/]+/.test(path) ? "conversation" : "support";
  if (host === "drive.google.com" || host.endsWith(".sharepoint.com") || host === "onedrive.live.com") return "support";
  if (/convers|conservsa|\bchat\b/.test(name)) return "conversation";
  return "support";
}

export function normalizeManualReference(ref: WorkspaceReference): WorkspaceReference {
  const webUrl = browserAccessibleUrl(ref.target);
  if (!webUrl) return ref;
  const host = new URL(webUrl).hostname.toLowerCase();
  const knownService = ["chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com", "drive.google.com", "notebooklm.google.com", "onedrive.live.com"].includes(host) || host.endsWith(".sharepoint.com");
  if (ref.kind !== "directory" && !knownService) return ref;
  const inferred = classifyJourneyLink(ref.title, ref.target);
  return inferred === ref.kind ? ref : { ...ref, kind: inferred };
}

function canonicalTarget(target: string) {
  try {
    const url = new URL(target.trim());
    if (url.protocol === "http:" || url.protocol === "https:") return url.href.replace(/\/$/, "");
  } catch { /* Local paths remain text. */ }
  return target.trim().toLowerCase();
}

export function mergeWorkspaceReferences(manual: WorkspaceReference[], linked: WorkspaceReference[]) {
  const seen = new Set(manual.map((ref) => canonicalTarget(ref.target)));
  const result = [...manual];
  for (const ref of linked) {
    const key = canonicalTarget(ref.target);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

export function toLinkedReference(row: LinkedRow): WorkspaceReference | null {
  const target = row.target?.trim();
  if (!target) return null;
  const title = row.title?.trim() || "Link da jornada";
  const titleUrl = browserAccessibleUrl(title);
  const destination = browserAccessibleUrl(target);
  const targetUrl = destination ? new URL(destination) : null;
  const conversationInTitle = titleUrl && classifyJourneyLink("", titleUrl) === "conversation";
  const isChatGptProject = targetUrl && ["chatgpt.com", "chat.openai.com"].includes(targetUrl.hostname.toLowerCase()) && targetUrl.pathname.endsWith("/project");
  const resolvedTarget = titleUrl && conversationInTitle && isChatGptProject ? titleUrl : target;
  return {
    id: `journey:${row.source_type}:${row.source_id}:${row.link_id || row.link_index}`,
    project_id: row.project_id,
    kind: classifyJourneyLink(title, resolvedTarget),
    title: resolvedTarget !== target ? "Conversa do projeto" : title,
    target: resolvedTarget,
    notes: null,
    sort_order: 0,
    created_at: row.updated_at || "",
    updated_at: row.updated_at || "",
    origin: { type: "journey", stepId: row.step_id, stepName: row.step_name, blockTitle: row.block_title || "Links e materiais" },
  };
}

export async function readLinkedWorkspaceReferences(db: D1Database, projectId?: string) {
  const filter = projectId ? "and s.project_id = ?" : "";
  const sql = `
    select s.project_id, s.id step_id, s.name step_name, b.value ->> '$.title' block_title,
      'value' source_type, v.id source_id, l.value ->> '$.id' link_id, cast(l.key as text) link_index,
      l.value ->> '$.title' title, l.value ->> '$.url' target, coalesce(v.updated_at, v.created_at) updated_at
    from journey_step_values v
    join journey_step_documents d on d.id = v.document_id and d.owner_type = 'project' and d.state in ('draft', 'published')
    join project_steps s on s.id = d.step_id and s.project_id = d.owner_id
    join json_each(d.document_json, '$.blocks') b on b.value ->> '$.id' = v.block_id and b.value ->> '$.type' = 'materials'
    join json_each(v.value_json, '$.links') l
    where v.owner_type = 'project' and (d.state = 'draft' or not exists (
      select 1 from journey_step_documents newer where newer.owner_type = 'project' and newer.step_id = d.step_id and newer.state = 'draft'
    )) ${filter}
    union all
    select s.project_id, s.id, s.name, 'Links da etapa',
      'legacy', l.id, l.id, cast(l.link_order as text), l.title, l.url, l.created_at
    from project_step_links l join project_steps s on s.id = l.project_step_id
    where 1 = 1 ${filter}`;
  const bindings = projectId ? [projectId, projectId] : [];
  const rows = await db.prepare(sql).bind(...bindings).all<LinkedRow>();
  return (rows.results ?? []).map(toLinkedReference).filter((ref): ref is WorkspaceReference => Boolean(ref));
}
