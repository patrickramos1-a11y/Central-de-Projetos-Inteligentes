// Weekly delivery report shared by the Worker (aggregation) and the UI (types/helpers).
// Weeks run Monday 00:00 → Sunday 23:59 in the team's timezone (Belém, UTC-3).

export const TEAM_UTC_OFFSET_HOURS = -3;

export type DeliveryProjectRow = {
  id: string;
  name: string;
  company: string | null;
  client_id: string | null;
  responsible: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  completed_by: string | null;
  completed_at_estimated: number | boolean | null;
};

export type ActivityRow = { person: string; at: string; project_id: string | null; kind: "block" | "file" | "reference" | "completion" };

export type DeliveryProject = { id: string; name: string; company: string | null; clientId: string | null; responsible: string | null; at: string; estimated?: boolean; by?: string | null };

export type DeliveryWeek = {
  start: string; // YYYY-MM-DD (Monday, team time)
  end: string; // YYYY-MM-DD (Sunday)
  created: DeliveryProject[];
  completed: DeliveryProject[];
  openAtEnd: number;
  activities: number;
  activePeople: number;
};

export type PersonWeek = { created: number; completed: number; activities: number; references: number; projects: number };

export type DeliveryPerson = {
  name: string;
  weeks: Record<string, PersonWeek>;
  days: Record<string, number>; // YYYY-MM-DD → activities (last 14 days)
  lastActivity: string | null;
};

export type DeliveryReport = { generatedAt: string; weeks: DeliveryWeek[]; people: DeliveryPerson[] };

const DAY_MS = 86_400_000;

function parseInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = /T/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? null : time;
}

/** Calendar date (YYYY-MM-DD) of an instant in team time. */
export function teamDay(instant: number) {
  return new Date(instant + TEAM_UTC_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
}

/** Monday (YYYY-MM-DD, team time) of the week containing the instant. */
export function teamWeekStart(instant: number) {
  const local = new Date(instant + TEAM_UTC_OFFSET_HOURS * 3_600_000);
  const weekday = (local.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - weekday * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function personKey(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

export function buildDeliveryReport(projects: DeliveryProjectRow[], activity: ActivityRow[], options: { weeks: number; now: number }): DeliveryReport {
  const currentWeek = teamWeekStart(options.now);
  const starts = Array.from({ length: options.weeks }, (_, index) => addDays(currentWeek, -7 * (options.weeks - 1 - index)));
  const weekSet = new Set(starts);
  const weeks = new Map<string, DeliveryWeek>(starts.map((start) => [start, { start, end: addDays(start, 6), created: [], completed: [], openAtEnd: 0, activities: 0, activePeople: 0 }]));
  const people = new Map<string, DeliveryPerson>();
  const personWeekProjects = new Map<string, Set<string>>();
  const weekPeople = new Map<string, Set<string>>();
  const firstDay = addDays(teamDay(options.now), -13);

  const person = (name: string) => {
    let entry = people.get(name);
    if (!entry) {
      entry = { name, weeks: {}, days: {}, lastActivity: null };
      people.set(name, entry);
    }
    return entry;
  };
  const personWeek = (name: string, week: string) => {
    const entry = person(name);
    entry.weeks[week] ??= { created: 0, completed: 0, activities: 0, references: 0, projects: 0 };
    return entry.weeks[week];
  };

  for (const project of projects) {
    const created = parseInstant(project.created_at);
    const completed = project.status === "concluido" ? parseInstant(project.completed_at) : null;
    const base = { id: project.id, name: project.name, company: project.company, clientId: project.client_id, responsible: project.responsible };
    if (created !== null) {
      const week = teamWeekStart(created);
      if (weekSet.has(week)) {
        weeks.get(week)!.created.push({ ...base, at: new Date(created).toISOString() });
        const owner = personKey(project.responsible);
        if (owner) personWeek(owner, week).created += 1;
      }
    }
    if (completed !== null) {
      const week = teamWeekStart(completed);
      if (weekSet.has(week)) {
        const estimated = Number(project.completed_at_estimated ?? 0) === 1 || project.completed_at_estimated === true;
        weeks.get(week)!.completed.push({ ...base, at: new Date(completed).toISOString(), estimated, by: project.completed_by });
        const owner = personKey(project.completed_by) ?? personKey(project.responsible);
        if (owner) personWeek(owner, week).completed += 1;
      }
    }
    // Open at the end of each week: created before the week ended and not completed by then.
    if (created !== null && project.status !== "arquivado") {
      for (const start of starts) {
        const weekEnd = Date.parse(`${addDays(start, 7)}T00:00:00Z`) - TEAM_UTC_OFFSET_HOURS * 3_600_000;
        if (created < weekEnd && (completed === null || completed >= weekEnd) && (project.status !== "concluido" || completed !== null)) weeks.get(start)!.openAtEnd += 1;
      }
    }
  }

  for (const row of activity) {
    const name = personKey(row.person);
    const at = parseInstant(row.at);
    if (!name || at === null) continue;
    const week = teamWeekStart(at);
    const day = teamDay(at);
    const entry = person(name);
    const iso = new Date(at).toISOString();
    if (!entry.lastActivity || iso > entry.lastActivity) entry.lastActivity = iso;
    if (day >= firstDay) entry.days[day] = (entry.days[day] ?? 0) + 1;
    if (!weekSet.has(week)) continue;
    const stats = personWeek(name, week);
    if (row.kind === "reference") stats.references += 1;
    else stats.activities += 1;
    weeks.get(week)!.activities += 1;
    if (row.project_id) {
      const key = `${name}|${week}`;
      const set = personWeekProjects.get(key) ?? new Set<string>();
      set.add(row.project_id);
      personWeekProjects.set(key, set);
      stats.projects = set.size;
    }
    const active = weekPeople.get(week) ?? new Set<string>();
    active.add(name);
    weekPeople.set(week, active);
  }

  for (const [week, set] of weekPeople) weeks.get(week)!.activePeople = set.size;
  for (const week of weeks.values()) {
    week.created.sort((a, b) => b.at.localeCompare(a.at));
    week.completed.sort((a, b) => b.at.localeCompare(a.at));
  }

  return {
    generatedAt: new Date(options.now).toISOString(),
    weeks: starts.map((start) => weeks.get(start)!),
    people: [...people.values()].sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "")),
  };
}

const longDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** Plain-text weekly summary ready to paste into WhatsApp or e-mail. */
export function formatWeeklySummary(report: DeliveryReport, weekStart: string) {
  const week = report.weeks.find((item) => item.start === weekStart);
  if (!week) return "";
  const lines = [`*Ramos Jornadas — semana ${longDate(week.start)} a ${longDate(week.end)}*`, ""];
  lines.push(`✅ Entregues: ${week.completed.length}`);
  week.completed.forEach((item) => lines.push(`• ${item.company ? `${item.company} — ` : ""}${item.name}${item.by || item.responsible ? ` (${item.by || item.responsible})` : ""}`));
  lines.push("", `🆕 Novas jornadas: ${week.created.length}`);
  week.created.forEach((item) => lines.push(`• ${item.company ? `${item.company} — ` : ""}${item.name}${item.responsible ? ` (${item.responsible})` : ""}`));
  lines.push("", `📂 Em andamento no fim da semana: ${week.openAtEnd}`);
  const team = report.people
    .map((person) => ({ name: person.name, stats: person.weeks[week.start] }))
    .filter((item) => item.stats && (item.stats.activities || item.stats.completed || item.stats.created || item.stats.references));
  if (team.length) {
    lines.push("", "👥 Equipe:");
    team.forEach(({ name, stats }) => lines.push(`• ${name}: ${stats!.completed} entregue(s), ${stats!.created} nova(s), ${stats!.projects} projeto(s) movimentado(s), ${stats!.activities + stats!.references} registro(s)`));
  }
  return lines.join("\n");
}
