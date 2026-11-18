import { WORKSPACE_STEP_ID } from "../workspace/workspaceModel";

export type JourneyLinkTarget = { projectId: string; stepId: string };

export type JourneyLinkLabels = { company?: string | null; project?: string | null };

function slugPart(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
}

export function buildJourneyLink(projectId: string, stepId = WORKSPACE_STEP_ID, source = window.location.href, labels?: JourneyLinkLabels) {
  const url = new URL(source);
  const slug = [slugPart(labels?.company), slugPart(labels?.project)].filter(Boolean).join("-");
  if (slug) url.pathname = `/jornada/${slug}`;
  url.searchParams.set("project", projectId);
  url.searchParams.set("step", stepId);
  return url.toString();
}

export function readJourneyLink(source = window.location.href): JourneyLinkTarget | null {
  const url = new URL(source);
  const projectId = url.searchParams.get("project")?.trim() ?? "";
  if (!projectId) return null;
  return { projectId, stepId: url.searchParams.get("step")?.trim() || WORKSPACE_STEP_ID };
}

export function replaceJourneyLink(target: JourneyLinkTarget | null) {
  const url = new URL(window.location.href);
  if (target) {
    url.searchParams.set("project", target.projectId);
    url.searchParams.set("step", target.stepId);
  } else {
    url.searchParams.delete("project");
    url.searchParams.delete("step");
  }
  window.history.replaceState(null, "", url);
}
