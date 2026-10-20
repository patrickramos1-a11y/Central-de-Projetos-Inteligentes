import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backupDir = join(root, "cloudflare", "backups");
const snapshotPath = resolve(process.argv[2] ?? "");
if (!snapshotPath.startsWith(`${backupDir}\\`) && !snapshotPath.startsWith(`${backupDir}/`)) {
  throw new Error("Informe um snapshot em cloudflare/backups.");
}

const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8").replace(/^\uFEFF/, "")) as {
  database: string;
  tables: Record<string, Array<Record<string, string | number | boolean | null>>>;
};
if (snapshot.database !== "central-projetos-ia" || !Array.isArray(snapshot.tables.projects) || !Array.isArray(snapshot.tables.clients)) {
  throw new Error("Snapshot D1 invalido.");
}

const stateDir = join(root, ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");
const candidates = readdirSync(stateDir).filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
let database: Database | undefined;
for (const name of candidates) {
  const candidate = new Database(join(stateDir, name));
  if (candidate.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'").get()) {
    database = candidate;
    break;
  }
  candidate.close();
}
if (!database) throw new Error("Banco D1 local nao encontrado. Execute bun run cf:d1:migrate:local primeiro.");

try {
  const existing = database.query("SELECT COUNT(*) AS count FROM projects").get() as { count: number };
  if (existing.count > 0) throw new Error("O D1 local ja possui projetos. Nenhum dado foi alterado.");

  database.exec("PRAGMA foreign_keys = OFF");
  const restore = database.transaction(() => {
    for (const [table, rows] of Object.entries(snapshot.tables)) {
      if (!/^[a-z_][a-z0-9_]*$/.test(table) || rows.length === 0) continue;
      const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      if (columns.some((column) => !/^[a-z_][a-z0-9_]*$/.test(column))) throw new Error(`Coluna invalida em ${table}.`);
      const sql = `INSERT OR REPLACE INTO "${table}" (${columns.map((column) => `"${column}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`;
      const statement = database.query(sql);
      for (const row of rows) statement.run(...columns.map((column) => typeof row[column] === "boolean" ? Number(row[column]) : row[column] ?? null));
    }
  });
  restore();
  database.exec("PRAGMA foreign_keys = ON");
  const count = database.query("SELECT COUNT(*) AS count FROM projects").get() as { count: number };
  console.log(`D1 local restaurado: ${count.count} projetos do snapshot ${snapshotPath}.`);
} finally {
  database.close();
}
