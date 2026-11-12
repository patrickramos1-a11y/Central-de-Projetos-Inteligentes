// "Aplicar sumário": choose which consolidated version the journey works on.
// Each version keeps its own topic statuses and prompts, so switching back and
// forth never loses progress. Only consolidated versions can be applied.

type Row = Record<string, unknown>;

/** Repoints project_summary blocks of the project to the applied version. */
export function rebindSummaryBlocks(documentJson: string, projectSummaryIds: Set<string>, nextSummaryId: string): string | null {
  let document: { blocks?: Array<Row> };
  try { document = JSON.parse(documentJson); } catch { return null; }
  if (!Array.isArray(document.blocks)) return null;
  let changed = false;
  document.blocks = document.blocks.map((block) => {
    if (block.type !== "project_summary") return block;
    const config = (block.config && typeof block.config === "object" ? block.config : {}) as Row;
    const bound = String(config.summaryId ?? "");
    if (bound === nextSummaryId || (bound && !projectSummaryIds.has(bound))) return block;
    changed = true;
    return { ...block, config: { ...config, summaryId: nextSummaryId } };
  });
  return changed ? JSON.stringify(document) : null;
}

export async function applySummaryVersion(db: D1Database, summaryId: string) {
  const summary = await db.prepare("select * from project_summaries where id = ?").bind(summaryId).first<Row>();
  if (!summary) throw new Error("Sumário não encontrado.");
  if (summary.status === "active") return summary;
  if (!String(summary.consolidated_text ?? "").trim()) throw new Error("Consolide esta versão antes de aplicá-la.");
  const projectId = String(summary.project_id);
  const now = new Date().toISOString();

  const versions = await db.prepare("select id from project_summaries where project_id = ?").bind(projectId).all<{ id: string }>();
  const versionIds = new Set((versions.results ?? []).map((row) => row.id));
  const documents = await db.prepare("select id, document_json from journey_step_documents where owner_type = 'project' and owner_id = ? and state in ('draft', 'published')")
    .bind(projectId).all<{ id: string; document_json: string }>();

  const statements: D1PreparedStatement[] = [
    // The previous version stays available (consolidated, not archived) so it can be applied again.
    db.prepare("update project_summaries set status = 'draft', updated_at = ? where project_id = ? and status = 'active' and id != ?").bind(now, projectId, summaryId),
    db.prepare("update project_summaries set status = 'active', activated_at = ?, archived_at = null, updated_at = ? where id = ?").bind(now, now, summaryId),
  ];
  for (const document of documents.results ?? []) {
    const next = rebindSummaryBlocks(document.document_json, versionIds, summaryId);
    if (next) statements.push(db.prepare("update journey_step_documents set document_json = ?, updated_at = ? where id = ?").bind(next, now, document.id));
  }
  await db.batch(statements);
  return await db.prepare("select * from project_summaries where id = ?").bind(summaryId).first();
}
