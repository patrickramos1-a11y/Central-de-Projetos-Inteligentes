export type TemplateBlock = {
  id: string;
  type: string;
  order: number;
  title: string;
  required?: boolean;
  visible?: boolean;
  editableInExecution?: boolean;
  collapsedByDefault?: boolean;
  config: Record<string, unknown>;
};

export type TemplateStep = {
  id: string;
  sourceStageId?: string | null;
  sourceStageVersion?: number | null;
  name: string;
  description: string;
  stepOrder: number;
  document: {
    schemaVersion: number;
    ownerType: "template";
    templateId: string;
    stepId: string;
    structureId: string;
    title: string;
    status: string;
    state: "draft" | "published";
    versionNumber: number;
    revision: number;
    blocks: TemplateBlock[];
    completionRules: Array<{ id: string; type: string; enabled: boolean; message?: string }>;
  };
};

export type TemplateSnapshot = {
  schemaVersion: 1;
  templateId: string;
  name: string;
  description: string;
  projectTypeId: string | null;
  projectModalityId?: string | null;
  clientId: string | null;
  workspaceGuidance: string;
  steps: TemplateStep[];
};

export function duplicateTemplateSnapshot(source: TemplateSnapshot, templateId: string): TemplateSnapshot {
  return {
    ...source,
    templateId,
    name: `${source.name} - copia`,
    steps: source.steps.map((step, stepIndex) => {
      const stepId = crypto.randomUUID();
      const blockIds = new Map(step.document.blocks.map((block) => [block.id, crypto.randomUUID()]));
      return {
        ...step,
        id: stepId,
        stepOrder: stepIndex + 1,
        document: {
          ...step.document,
          templateId,
          stepId,
          structureId: crypto.randomUUID(),
          state: "draft",
          versionNumber: 1,
          revision: 1,
          blocks: step.document.blocks.map((block, index) => ({
            ...block,
            id: blockIds.get(block.id)!,
            order: index + 1,
            config: { ...sanitizeModelConfig(block.type, block.config), parentBlockId: block.config.parentBlockId ? blockIds.get(String(block.config.parentBlockId)) ?? null : null },
          })),
        },
      };
    }),
  };
}

export function sanitizeModelConfig(type: string, input: Record<string, unknown>): Record<string, unknown> {
  const config = { ...input };
  for (const key of ["summaryId", "projectId", "conversationUrl", "directory", "serverPath", "evidence", "runtimeValue", "completedAt", "copyCount", "applied", "files", "fileIds", "uploadedFiles", "attachments", "evidenceFiles"]) delete config[key];
  if (type === "context") {
    config.contexts = (Array.isArray(input.contexts) ? input.contexts : [])
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && Boolean((item as Record<string, unknown>).pinned))
      .map((item) => ({ ...item, id: crypto.randomUUID(), pinned: true }));
  }
  if (type === "materials") {
    config.links = (Array.isArray(input.links) ? input.links : [])
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && (item as Record<string, unknown>).modelResource !== false && !isPrivateExecutionLink(item as Record<string, unknown>))
      .map((item) => ({ id: crypto.randomUUID(), title: String(item.title ?? ""), url: String(item.url ?? ""), modelResource: true }));
  }
  return config;
}

function isPrivateExecutionLink(item: Record<string, unknown>) {
  const title = String(item.title ?? "").toLocaleLowerCase();
  const url = String(item.url ?? "").toLocaleLowerCase();
  return /conversa|chat particular|diretorio do servidor/.test(title)
    || /^\\\\/.test(url)
    || /chatgpt\.com\/(?:share\/|c\/|g\/g-p-[^?#]+|g\/[^?#]+\/c\/)|claude\.ai\/chat\//.test(url)
    || /drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|open\?id=)/.test(url);
}
