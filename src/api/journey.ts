export type JourneyOwnerType = "project" | "client";

export type JourneyFile = {
  id: string;
  owner_type?: JourneyOwnerType;
  owner_step_id?: string;
  block_id?: string;
  item_id?: string | null;
  name: string;
  content_type: string | null;
  size_bytes: number;
  url?: string;
  r2_key?: string;
};

export type JourneySnapshot = {
  ownerType: JourneyOwnerType;
  entity: Record<string, unknown>;
  steps: Array<Record<string, unknown>>;
  documents: Array<{ document: { stepId: string; title: string } & Record<string, unknown> }>;
  values: Array<{ owner_step_id: string; value: unknown } & Record<string, unknown>>;
  files: Array<{ owner_step_id: string } & JourneyFile & Record<string, unknown>>;
  completions: Array<{ stepId: string; completion: { progress: number; canComplete?: boolean; reasons?: unknown[] } }>;
};

export type NormalizedJourneySnapshot = JourneySnapshot & {
  documentsByStep: Map<string, JourneySnapshot["documents"][number]["document"]>;
  valuesByStep: Map<string, JourneySnapshot["values"]>;
  filesByStep: Map<string, JourneySnapshot["files"]>;
  completionByStep: Map<string, JourneySnapshot["completions"][number]["completion"]>;
};

export function normalizeJourneySnapshot(snapshot: JourneySnapshot): NormalizedJourneySnapshot {
  const documentsByStep = new Map(snapshot.documents.map((row) => [row.document.stepId, row.document]));
  const valuesByStep = new Map(snapshot.steps.map((step) => {
    const stepId = String(step.id ?? "");
    return [stepId, snapshot.values.filter((value) => String(value.owner_step_id) === stepId)];
  }));
  const filesByStep = new Map(snapshot.steps.map((step) => {
    const stepId = String(step.id ?? "");
    return [stepId, snapshot.files.filter((file) => String(file.owner_step_id) === stepId)];
  }));
  const completionByStep = new Map(snapshot.completions.map((item) => [item.stepId, item.completion]));
  return { ...snapshot, documentsByStep, valuesByStep, filesByStep, completionByStep };
}

type ApiEnvelope<T> = { data?: T; error?: string };

function unwrapJourneyData<T>(body: ApiEnvelope<T | ApiEnvelope<T>>): T | undefined {
  const data = body.data;
  if (data && typeof data === "object" && !Array.isArray(data) && "data" in data) {
    return (data as ApiEnvelope<T>).data;
  }
  return data as T | undefined;
}

function endpoint(baseUrl: string, ownerType: JourneyOwnerType, stepId: string, blockId: string) {
  return `${baseUrl.replace(/\/$/, "")}/api/journey-files/${ownerType}/${encodeURIComponent(stepId)}/${encodeURIComponent(blockId)}`;
}

async function readJson<T>(response: Response): Promise<ApiEnvelope<T>> {
  return response.json().catch(() => ({})) as Promise<ApiEnvelope<T>>;
}

export function createJourneyApi(baseUrl: string) {
  return {
    async getJourney(ownerType: JourneyOwnerType, ownerId: string) {
      const resource = ownerType === "project" ? "projects" : "clients";
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/${resource}/${encodeURIComponent(ownerId)}/journey`);
      const body = await readJson<JourneySnapshot | ApiEnvelope<JourneySnapshot>>(response);
      const snapshot = unwrapJourneyData(body);
      if (!response.ok || !snapshot) throw new Error(body.error ?? "Nao foi possivel carregar a jornada.");
      return normalizeJourneySnapshot(snapshot);
    },

    async listFiles(ownerType: JourneyOwnerType, stepId: string, blockId: string) {
      const response = await fetch(endpoint(baseUrl, ownerType, stepId, blockId));
      const body = await readJson<JourneyFile[] | ApiEnvelope<JourneyFile[]>>(response);
      if (!response.ok) throw new Error(body.error ?? "Nao foi possivel carregar os arquivos.");
      const files = unwrapJourneyData(body);
      return Array.isArray(files) ? files : [];
    },

    async uploadFile(ownerType: JourneyOwnerType, stepId: string, blockId: string, file: File, createdBy?: string) {
      const form = new FormData();
      form.set("file", file);
      if (createdBy) form.set("createdBy", createdBy);
      const response = await fetch(endpoint(baseUrl, ownerType, stepId, blockId), { method: "POST", body: form });
      const body = await readJson<JourneyFile | ApiEnvelope<JourneyFile>>(response);
      const uploaded = unwrapJourneyData(body);
      if (!response.ok || !uploaded) throw new Error(body.error ?? "Upload nao concluido.");
      return uploaded;
    },

    async deleteFile(ownerType: JourneyOwnerType, stepId: string, blockId: string, fileId: string) {
      const response = await fetch(`${endpoint(baseUrl, ownerType, stepId, blockId)}/${encodeURIComponent(fileId)}`, { method: "DELETE" });
      const body = await readJson<unknown>(response);
      if (!response.ok) throw new Error(body.error ?? "Nao foi possivel remover o arquivo.");
    },
  };
}
