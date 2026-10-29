import { WORKSPACE_STEP_ID } from "../workspace/workspaceModel";

export type JourneyLinkTarget = { projectId: string; stepId: string };

export function buildJourneyLink(projectId: string, stepId = WORKSPACE_STEP_ID, source = window.location.href) {
  const url = new URL(source);
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
