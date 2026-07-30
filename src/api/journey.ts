export type JourneyOwnerType = "project" | "client";

export type JourneyFile = {
  id: string;
  name: string;
  content_type: string | null;
  size_bytes: number;
  url?: string;
  r2_key?: string;
};

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
