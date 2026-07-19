import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const database = process.env.D1_DATABASE_NAME || "central-projetos-ia";
const outputDirectory = path.resolve("cloudflare/backups");
// Calling `bun x wrangler` through execFile drops stdout on Windows. Use the
// local Wrangler binary directly so a backup can be verified before a migration.
const command = path.resolve(
  process.platform === "win32" ? "node_modules/.bin/wrangler.exe" : "node_modules/.bin/wrangler",
);

async function execute(commandText) {
  let lastError = "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = Bun.spawnSync(
        [command, "d1", "execute", database, "--remote", "--command", commandText, "--json"],
        { stdout: "pipe", stderr: "pipe" },
      );
      const output = result.stdout.toString().trim();
      const errors = result.stderr.toString().trim();
      if (result.exitCode === 0 && output) return JSON.parse(output)[0]?.results ?? [];
      // Wrangler occasionally omits JSON for a successful empty result set.
      if (result.exitCode === 0 && !output && !errors) return [];
      lastError = errors || `Wrangler finalizou com codigo ${result.exitCode}.`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 600));
  }

  throw new Error(`Nao foi possivel exportar a consulta: ${commandText}. ${lastError}`.trim());
}

const tables = (await execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV', 'd1_migrations') ORDER BY name"))
  .map((row) => String(row.name))
  .filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name));

const rows = [];
for (const table of tables) {
  rows.push([table, await execute(`SELECT * FROM "${table}"`)]);
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  database,
  tables: Object.fromEntries(rows),
};

const requiredTables = ["app_users", "projects", "project_steps", "project_step_structures"];
const missingRequiredTables = requiredTables.filter((table) => !(table in snapshot.tables));
if (tables.length < requiredTables.length || missingRequiredTables.length > 0) {
  throw new Error(
    `Snapshot invalido: ${tables.length} tabelas encontradas. Faltando: ${missingRequiredTables.join(", ") || "nenhuma"}.`,
  );
}

mkdirSync(outputDirectory, { recursive: true });
const filename = `d1-snapshot-${snapshot.generatedAt.replace(/[:.]/g, "-")}.json`;
const outputPath = path.join(outputDirectory, filename);
writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

console.log(`Snapshot criado: ${outputPath} (${tables.length} tabelas).`);
