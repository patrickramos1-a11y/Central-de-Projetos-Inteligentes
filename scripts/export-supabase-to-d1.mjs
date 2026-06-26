import { mkdir, writeFile } from "node:fs/promises";

const tables = [
  "ai_tools",
  "prompt_categories",
  "project_types",
  "prompts",
  "journey_templates",
  "journey_steps",
  "step_prompts",
  "procedures",
  "projects",
  "project_steps",
  "project_step_checklist_items",
  "project_step_prompts",
  "project_step_links",
  "clients",
  "client_steps",
  "client_step_checklist_items",
  "client_step_links",
];

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY.");
  process.exit(1);
}

const outputDir = new URL("../cloudflare/import/", import.meta.url);
const outputFile = new URL("supabase-data.sql", outputDir);
const statements = [
  "PRAGMA foreign_keys = OFF;",
  "BEGIN TRANSACTION;",
];

for (const table of tables) {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  url.searchParams.set("select", "*");
  url.searchParams.set("order", "created_at.asc");

  const response = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Falha ao exportar ${table}: ${response.status} ${await response.text()}`);
  }

  const rows = await response.json();

  for (const row of rows) {
    const keys = Object.keys(row);

    if (keys.length === 0) {
      continue;
    }

    statements.push(
      `INSERT OR REPLACE INTO ${table} (${keys.join(", ")}) VALUES (${keys.map((key) => toSqlValue(row[key])).join(", ")});`,
    );
  }
}

statements.push("COMMIT;", "PRAGMA foreign_keys = ON;");

await mkdir(outputDir, { recursive: true });
await writeFile(outputFile, `${statements.join("\n")}\n`, "utf8");

console.log(`Arquivo gerado: ${outputFile.pathname}`);

function toSqlValue(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}
