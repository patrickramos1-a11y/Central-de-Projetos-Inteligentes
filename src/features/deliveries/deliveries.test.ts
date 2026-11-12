import { describe, expect, test } from "bun:test";
import { buildDeliveryReport, formatWeeklySummary, teamWeekStart, type DeliveryProjectRow } from "../../../shared/deliveries";

// Wednesday 12/11/2026 15:00 UTC (12:00 in Belém)
const now = Date.parse("2026-11-12T15:00:00Z");

const project = (patch: Partial<DeliveryProjectRow>): DeliveryProjectRow => ({
  id: "p", name: "Projeto", company: "Cliente", client_id: null, responsible: "JR", status: "em_andamento",
  created_at: "2026-11-10T13:00:00Z", completed_at: null, completed_by: null, completed_at_estimated: 0, ...patch,
});

describe("delivery report", () => {
  test("weeks start on Monday in team time", () => {
    expect(teamWeekStart(now)).toBe("2026-11-09");
    // Monday 02:00 UTC is still Sunday 23:00 in Belém.
    expect(teamWeekStart(Date.parse("2026-11-09T02:00:00Z"))).toBe("2026-11-02");
  });

  test("counts created, completed and open projects per week", () => {
    const report = buildDeliveryReport([
      project({ id: "a", created_at: "2026-11-03T12:00:00Z" }),
      project({ id: "b", created_at: "2026-11-04T12:00:00Z", status: "concluido", completed_at: "2026-11-11T12:00:00Z", completed_by: "Patrick" }),
      project({ id: "c", created_at: "2026-11-10T12:00:00Z" }),
    ], [
      { person: "Vanessa", at: "2026-11-10 14:00:00", project_id: "a", kind: "block" },
      { person: "Vanessa", at: "2026-11-11T14:00:00Z", project_id: "c", kind: "reference" },
    ], { weeks: 2, now });

    const [previous, current] = report.weeks;
    expect(previous.start).toBe("2026-11-02");
    expect(previous.created.map((item) => item.id)).toEqual(["b", "a"]);
    expect(previous.openAtEnd).toBe(2);
    expect(current.created.map((item) => item.id)).toEqual(["c"]);
    expect(current.completed.map((item) => item.id)).toEqual(["b"]);
    expect(current.openAtEnd).toBe(2);
    expect(current.activePeople).toBe(1);

    const vanessa = report.people.find((item) => item.name === "Vanessa")!;
    expect(vanessa.weeks["2026-11-09"]).toEqual({ created: 0, completed: 0, activities: 1, references: 1, projects: 2 });
    expect(report.people.find((item) => item.name === "Patrick")!.weeks["2026-11-09"].completed).toBe(1);

    const summary = formatWeeklySummary(report, "2026-11-09");
    expect(summary).toContain("Entregues: 1");
    expect(summary).toContain("Vanessa");
  });
});
