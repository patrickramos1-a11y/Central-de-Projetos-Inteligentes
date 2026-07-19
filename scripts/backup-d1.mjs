import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const database = process.env.D1_DATABASE_NAME || "central-projetos-ia";
const outputDirectory = path.resolve("cloudflare/backups");
const command = process.execPath;
const execFileAsync = promisify(execFile);

async function execute(commandText) {
  let lastError = "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { stdout, stderr } = await execFileAsync(command, ["x", "wrangler", "d1", "execute", database, "--remote", "--command", commandText, "--json"], {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      });
      const output = stdout.trim();
      if (output) return JSON.parse(output)[0]?.results ?? [];
      if (!stderr.trim()) return [];
      lastError = stderr.trim();
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

mkdirSync(outputDirectory, { recursive: true });
const filename = `d1-snapshot-${snapshot.generatedAt.replace(/[:.]/g, "-")}.json`;
const outputPath = path.join(outputDirectory, filename);
writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

console.log(`Snapshot criado: ${outputPath} (${tables.length} tabelas).`);
