import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

type RadarClient = {
  id: string;
  name: string;
  clientType: "AC" | "AV";
  isActive: boolean;
  logoUrl: string | null;
};

type PlatformClient = {
  id: string;
  name: string;
  company: string | null;
  logo_url: string | null;
  client_kind: "AC" | "AV" | null;
  is_active: boolean;
};

type ImportItem = { source: RadarClient; targets: PlatformClient[]; action: "create" | "update" };

const importFile = fileURLToPath(new URL("../data/imports/radar-vital-clientes-ac-av-2026-10-19.json", import.meta.url));
const defaultApi = "https://central-projetos-ia-api.patrickramos1-a11y.workers.dev";

const aliasTargets: Record<string, string[]> = {
  "NORFRUTAS ACAI PREMIUM": ["ACAI PREMIUM", "ACAI PREMIUIM"],
  "SIMETRIA ICONE": ["SIMETRIA"],
  "PARA SUPER FOODS": ["PARA FOODS"],
  "P S MARTINS RAIZES DA AMAZONIA": ["RAIZES DA AMAZONIA"],
};

export function normalizeClientName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

export function planRadarImport(sources: RadarClient[], existing: PlatformClient[]): ImportItem[] {
  const byName = new Map<string, PlatformClient[]>();
  for (const client of existing) {
    for (const name of new Set([normalizeClientName(client.name), normalizeClientName(client.company ?? "")])) {
      if (!name) continue;
      const matches = byName.get(name) ?? [];
      if (!matches.some((entry) => entry.id === client.id)) matches.push(client);
      byName.set(name, matches);
    }
  }

  return sources
    .filter((source) => source.clientType === "AC" || (source.clientType === "AV" && Boolean(source.logoUrl)))
    .map((source) => {
      const name = normalizeClientName(source.name);
      const keys = aliasTargets[name] ?? [name];
      const targets = [...new Map(keys.flatMap((key) => byName.get(key) ?? []).map((client) => [client.id, client])).values()];
      return { source, targets, action: targets.length ? "update" : "create" };
    });
}

async function api<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, init);
  const body = await response.json() as { data?: T; error?: string };
  if (!response.ok || !body.data) throw new Error(`${path}: ${body.error ?? `HTTP ${response.status}`}`);
  return body.data;
}

async function uploadLogo(base: string, logoUrl: string) {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(logoUrl);
  if (!match) throw new Error("Logo nao esta em um formato de imagem incorporada suportado.");
  const uploaded = await api<{ url: string }>(base, "/api/client-logos", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType: match[1], contentBase64: match[2] }),
  });
  return new URL(uploaded.url, base).toString();
}

async function main() {
  const apply = process.argv.includes("--apply");
  const base = (process.env.RADAR_IMPORT_API_BASE || defaultApi).replace(/\/$/, "");
  const source = JSON.parse(await readFile(importFile, "utf8")) as { clients: RadarClient[] };
  const existing = await api<PlatformClient[]>(base, "/api/tables/clients");
  const plan = planRadarImport(source.clients, existing);
  const skipped = source.clients.length - plan.length;
  console.log(`${apply ? "APLICAR" : "SIMULAR"}: ${plan.length} clientes (${plan.filter((item) => item.action === "create").length} novos, ${plan.filter((item) => item.action === "update").length} conciliados); ${skipped} AV sem logo fora do escopo.`);
  for (const item of plan) {
    console.log(`${item.action === "create" ? "CRIAR" : "ATUALIZAR"} ${item.source.clientType} ${item.source.name} -> ${item.targets.map((target) => target.name).join(", ") || "novo cadastro"}${item.source.logoUrl ? " [logo]" : " [sem logo]"}`);
  }
  if (!apply) return;

  let created = 0;
  let updated = 0;
  let logos = 0;
  for (const item of plan) {
    const sourceLogo = item.source.logoUrl;
    const needsLogo = Boolean(sourceLogo && (item.action === "create" || item.targets.some((target) => !target.logo_url)));
    const logoUrl = needsLogo && sourceLogo ? await uploadLogo(base, sourceLogo) : null;
    if (logoUrl) logos++;
    if (item.action === "create") {
      await api<PlatformClient[]>(base, "/api/tables/clients", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: item.source.name.trim(), company: item.source.name.trim(), client_kind: item.source.clientType,
          logo_url: logoUrl, is_active: item.source.clientType === "AC" && item.source.isActive && Boolean(sourceLogo),
          status: "em_implantacao", notes: "Cadastro importado do Radar Vital.",
        }),
      });
      created++;
    } else {
      for (const target of item.targets) {
        const patch = { client_kind: item.source.clientType, ...(!target.logo_url && logoUrl ? { logo_url: logoUrl } : {}) };
        if (target.client_kind === patch.client_kind && (!("logo_url" in patch) || target.logo_url)) continue;
        await api<PlatformClient[]>(base, `/api/tables/clients/${encodeURIComponent(target.id)}`, {
          method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
        });
        updated++;
      }
    }
  }
  console.log(`Concluido: ${created} criados, ${updated} cadastros atualizados, ${logos} logos enviadas.`);
}

if (import.meta.main) main().catch((error) => { console.error(error); process.exitCode = 1; });
