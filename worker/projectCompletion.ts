type DataRecord = Record<string, unknown>;

export type StepCompletionInput = {
  id: string;
  status: string;
  is_not_applicable: number | boolean | null;
  has_progress: number | boolean | null;
};

export type StepCompletionAction = { id: string; action: "complete" | "not_applicable" };

/**
 * Closing a project closes its journey too:
 * - steps already started (status, filled blocks, files or checked items) become concluded;
 * - steps never touched become "Nao se aplica".
 * Steps already concluded or not applicable are left untouched.
 */
export function planStepsOnProjectCompletion(steps: StepCompletionInput[]): StepCompletionAction[] {
  return steps.flatMap((step): StepCompletionAction[] => {
    if (Number(step.is_not_applicable ?? 0) === 1 || step.is_not_applicable === true) return [];
    if (step.status === "concluido") return [];
    const started = step.status === "em_andamento" || step.status === "bloqueado" || Number(step.has_progress ?? 0) > 0 || step.has_progress === true;
    return [{ id: step.id, action: started ? "complete" : "not_applicable" }];
  });
}

const stepProgressSql = `
select s.id, s.status, s.is_not_applicable,
  (
    (select count(*) from journey_step_values v where v.owner_type = 'project' and v.owner_step_id = s.id and v.completion_state in ('partial', 'complete'))
    + (select count(*) from journey_step_files f where f.owner_type = 'project' and f.owner_step_id = s.id)
    + (select count(*) from project_step_checklist_items c where c.project_step_id = s.id and c.is_done = 1)
  ) as has_progress
from project_steps s
where s.project_id = ?`;

export async function readProjectStatus(db: D1Database, projectId: string) {
  return db.prepare("select status, completed_at from projects where id = ?").bind(projectId).first<{ status: string; completed_at: string | null }>();
}

/**
 * Adjusts a projects PATCH so completion metadata is always consistent and,
 * when the project transitions to concluded, closes its open steps.
 * Returns the counts applied so the client can inform the user.
 */
export async function applyProjectStatusTransition(db: D1Database, projectId: string, patch: DataRecord, previous: { status: string; completed_at: string | null } | null) {
  if (typeof patch.status !== "string" || !previous) return { completed: 0, notApplicable: 0 };
  const now = new Date().toISOString();

  if (patch.status === "concluido" && previous.status !== "concluido") {
    patch.completed_at = typeof patch.completed_at === "string" && patch.completed_at ? patch.completed_at : now;
    patch.completed_at_estimated = 0;
    const { results } = await db.prepare(stepProgressSql).bind(projectId).all<StepCompletionInput>();
    const actions = planStepsOnProjectCompletion(results ?? []);
    const statements = actions.map((item) => item.action === "complete"
      ? db.prepare("update project_steps set status = 'concluido', updated_at = ? where id = ?").bind(now, item.id)
      : db.prepare("update project_steps set is_not_applicable = 1, updated_at = ? where id = ?").bind(now, item.id));
    if (statements.length) await db.batch(statements);
    return {
      completed: actions.filter((item) => item.action === "complete").length,
      notApplicable: actions.filter((item) => item.action === "not_applicable").length,
    };
  }

  if (patch.status !== "concluido" && previous.status === "concluido") {
    patch.completed_at = null;
    patch.completed_by = null;
    patch.completed_at_estimated = 0;
  }
  return { completed: 0, notApplicable: 0 };
}

/**
 * Applies the completion rule to projects concluded before it existed:
 * started steps become concluded, untouched steps become not applicable.
 * Idempotent; projects without open steps are skipped.
 */
export async function closeOpenStepsOfConcludedProjects(db: D1Database) {
  const projects = await db.prepare(`select distinct p.id, p.name from projects p
    join project_steps s on s.project_id = p.id
    where p.status = 'concluido' and coalesce(s.is_not_applicable, 0) = 0 and s.status != 'concluido'`).all<{ id: string; name: string }>();
  const now = new Date().toISOString();
  const result = { projects: 0, completed: 0, notApplicable: 0, details: [] as Array<{ name: string; completed: number; notApplicable: number }> };
  for (const project of projects.results ?? []) {
    const { results } = await db.prepare(stepProgressSql).bind(project.id).all<StepCompletionInput>();
    const actions = planStepsOnProjectCompletion(results ?? []);
    if (!actions.length) continue;
    await db.batch(actions.map((item) => item.action === "complete"
      ? db.prepare("update project_steps set status = 'concluido', updated_at = ? where id = ?").bind(now, item.id)
      : db.prepare("update project_steps set is_not_applicable = 1, updated_at = ? where id = ?").bind(now, item.id)));
    const completed = actions.filter((item) => item.action === "complete").length;
    result.projects += 1;
    result.completed += completed;
    result.notApplicable += actions.length - completed;
    result.details.push({ name: project.name, completed, notApplicable: actions.length - completed });
  }
  return result;
}
