const baseUrl = "https://central-projetos-ia-api.patrickramos1-a11y.workers.dev";
const driveUrl = "https://drive.google.com/open?id=1fAYy741I0hMgJRaDLPV8zQreQufJquIY&usp=drive_fs";
const apply = process.argv.includes("--apply");

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}: ${body.error ?? body.message ?? "Erro desconhecido"}`);
  return body.data;
}

const [users, projects] = await Promise.all([
  request("/api/tables/app_users?select=id,name&order=id&limit=1000"),
  request("/api/tables/projects?select=id,name,responsible_user_id,responsible&order=id&limit=1000"),
]);
const owners = users.filter((user) => user.name?.trim().toLocaleLowerCase("pt-BR") === "patrick");
if (owners.length !== 1) throw new Error(`Esperado um unico usuario Patrick; encontrados ${owners.length}.`);
const selected = projects.filter((project) => project.responsible_user_id === owners[0].id);
if (selected.length !== 24) throw new Error(`Escopo alterado: esperados 24 projetos do Patrick; encontrados ${selected.length}.`);
const legacy = projects.filter((project) => !project.responsible_user_id && project.responsible?.trim().toLocaleLowerCase("pt-BR") === "patrick");
if (legacy.length) throw new Error(`${legacy.length} projetos com responsavel Patrick nao possuem vinculo de usuario; revisar antes de prosseguir.`);

let added = 0;
let existing = 0;
for (const project of selected) {
  let saved = false;
  for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
    const workspace = await request(`/api/projects/${encodeURIComponent(project.id)}/workspace`);
    if (workspace.references.some((ref) => ref.target === driveUrl)) {
      existing += 1;
      saved = true;
      break;
    }
    if (!apply) {
      added += 1;
      saved = true;
      break;
    }
    const reference = {
      id: `drive-acervo-${project.id}`,
      kind: "support",
      title: "Acervo geral de projetos no Google Drive",
      target: driveUrl,
      notes: null,
    };
    const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(project.id)}/workspace`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedRevision: workspace.revision,
        conversationNotApplicable: workspace.conversationNotApplicable,
        references: [...workspace.manualReferences, reference],
      }),
    });
    if (response.status === 409) continue;
    const body = await response.json();
    if (!response.ok) throw new Error(`${project.id}: HTTP ${response.status}: ${body.error ?? body.message ?? "Erro desconhecido"}`);
    if (!body.data?.manualReferences?.some((ref) => ref.kind === "support" && ref.target === driveUrl)) throw new Error(`${project.id}: Worker nao confirmou a referencia.`);
    if (body.data.directoryCount !== workspace.directoryCount) throw new Error(`${project.id}: contagem de diretorios mudou inesperadamente.`);
    added += 1;
    saved = true;
  }
  if (!saved) throw new Error(`${project.id}: conflito de revisao apos tres tentativas.`);
}

if (apply) {
  for (const project of selected) {
    const workspace = await request(`/api/projects/${encodeURIComponent(project.id)}/workspace`);
    if (!workspace.references.some((ref) => ref.kind === "support" && ref.target === driveUrl)) throw new Error(`${project.id}: referencia ausente na verificacao final.`);
  }
}
console.log(`${apply ? "Aplicacao" : "Previa"}: ${selected.length} projetos do Patrick; ${added} ${apply ? "adicionados" : "a adicionar"}; ${existing} ja continham o link. Diretorios do servidor preservados.`);
