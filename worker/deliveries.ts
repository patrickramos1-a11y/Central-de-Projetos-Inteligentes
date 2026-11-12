import { buildDeliveryReport, type ActivityRow, type DeliveryProjectRow } from "../shared/deliveries";

type Env = { DB: D1Database };

const MAX_WEEKS = 26;

// Autosave fires many block_value_saved events; one "activity" is one block
// touched by one person within the same hour.
const activitySql = `
select e.created_by as person, min(e.created_at) as at, s.project_id as project_id,
  case e.event_type when 'file_uploaded' then 'file' when 'block_force_completed' then 'completion' else 'block' end as kind
from journey_step_events e
left join project_steps s on s.id = e.owner_step_id
where e.owner_type = 'project'
  and e.event_type in ('block_value_saved', 'file_uploaded', 'block_force_completed', 'context_value_saved')
  and e.created_by is not null and trim(e.created_by) != ''
  and e.created_at >= ?
group by e.created_by, e.owner_step_id, coalesce(e.block_id, ''), e.event_type, substr(replace(e.created_at, 'T', ' '), 1, 13)
union all
select r.actor_name as person, r.created_at as at, r.project_id as project_id, 'reference' as kind
from project_workspace_reference_events r
where r.action in ('created', 'updated') and r.actor_name is not null and r.created_at >= ?`;

export async function handleDeliveriesRequest(request: Request, env: Env, parts: string[], url: URL) {
  if (parts[0] !== "api" || parts[1] !== "deliveries" || request.method !== "GET") return null;
  const weeks = Math.min(MAX_WEEKS, Math.max(1, Number(url.searchParams.get("weeks") ?? 12) || 12));
  const now = Date.now();
  const since = new Date(now - (weeks * 7 + 8) * 86_400_000);
  const sinceIso = since.toISOString();
  const sinceSql = sinceIso.replace("T", " ").slice(0, 19);

  const [projects, activity] = await Promise.all([
    env.DB.prepare("select id, name, company, client_id, responsible, status, created_at, completed_at, completed_by, completed_at_estimated from projects").all<DeliveryProjectRow>(),
    env.DB.prepare(activitySql).bind(sinceSql, sinceIso).all<ActivityRow>(),
  ]);

  const report = buildDeliveryReport(projects.results ?? [], activity.results ?? [], { weeks, now });
  return new Response(JSON.stringify({ data: report }), {
    headers: { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" },
  });
}
