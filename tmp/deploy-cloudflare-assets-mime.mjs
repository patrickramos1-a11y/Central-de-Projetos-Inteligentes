import { createHash } from "node:crypto";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const accountId = "0c0f38105ded438d4d7aaf51c91b16bf";
const scriptName = "central-projetos-ia-api";
const apiBase = "https://api.cloudflare.com/client/v4";
const projectRoot = process.cwd();
const sourceAssetsDirectory = path.join(projectRoot, "dist");
const assetsDirectory = path.join(projectRoot, "tmp", "cloudflare-dist-mime");
const workerBundle = path.join(projectRoot, "worker-dist-new", "index.js");
const authFile = path.join(process.env.APPDATA || "", "xdg.config", ".wrangler", "config", "default.toml");

function parseToken(raw) {
  const oauth = raw.match(/^oauth_token\s*=\s*["']([^"']+)["']/m);
  if (oauth?.[1]) return oauth[1];
  const api = raw.match(/^api_token\s*=\s*["']([^"']+)["']/m);
  if (api?.[1]) return api[1];
  throw new Error("Nao encontrei oauth_token/api_token no arquivo de autenticacao do Wrangler.");
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
  };
  return types[extension] || "application/octet-stream";
}

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function prepareAssetsDirectory() {
  if (!fs.existsSync(sourceAssetsDirectory)) throw new Error(`Diretorio dist nao encontrado: ${sourceAssetsDirectory}`);
  fs.rmSync(assetsDirectory, { recursive: true, force: true });
  copyDirectory(sourceAssetsDirectory, assetsDirectory);

  const indexPath = path.join(assetsDirectory, "index.html");
  const assetDir = path.join(assetsDirectory, "assets");
  if (!fs.existsSync(indexPath) || !fs.existsSync(assetDir)) return;

  let html = fs.readFileSync(indexPath, "utf8");
  const timestamp = Date.now();
  for (const entry of fs.readdirSync(assetDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name);
    if (extension !== ".js" && extension !== ".css") continue;
    const fixedName = `${path.basename(entry.name, extension)}-mime-${timestamp}${extension}`;
    fs.copyFileSync(path.join(assetDir, entry.name), path.join(assetDir, fixedName));
    html = html.replaceAll(`/assets/${entry.name}`, `/assets/${fixedName}`);
  }
  fs.writeFileSync(indexPath, html);
}

function createManifest(directory) {
  const manifest = {};
  function walk(currentDir, basePath = "") {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.join(basePath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, relativePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const fileContent = fs.readFileSync(fullPath);
      const extension = path.extname(relativePath).slice(1);
      const contentType = getContentType(relativePath);
      const hash = createHash("sha256")
        .update(fileContent.toString("base64") + extension + contentType + relativePath + "mime-v2")
        .digest("hex")
        .slice(0, 32);
      const manifestPath = `/${relativePath.replace(/\\/g, "/")}`;
      manifest[manifestPath] = { hash, size: fileContent.length };
    }
  }
  walk(directory);
  if (Object.keys(manifest).length === 0) throw new Error("Nenhum asset encontrado.");
  return manifest;
}

async function apiFetch(url, init, expectedDescription) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${expectedDescription} falhou com resposta nao JSON: ${text.slice(0, 500)}`);
  }
  if (!response.ok || json.success === false) {
    throw new Error(`${expectedDescription} falhou: ${JSON.stringify(json.errors || json).slice(0, 1200)}`);
  }
  return json;
}

async function main() {
  if (!fs.existsSync(authFile)) throw new Error(`Arquivo de autenticacao nao encontrado: ${authFile}`);
  if (!fs.existsSync(workerBundle)) throw new Error(`Bundle do Worker nao encontrado: ${workerBundle}`);

  prepareAssetsDirectory();
  const token = parseToken(fs.readFileSync(authFile, "utf8"));
  const manifest = createManifest(assetsDirectory);
  console.log(`Manifesto criado com ${Object.keys(manifest).length} assets.`);

  const uploadSession = await apiFetch(
    `${apiBase}/accounts/${accountId}/workers/scripts/${scriptName}/assets-upload-session`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ manifest }),
    },
    "Criacao da sessao de upload de assets",
  );

  const uploadJwt = uploadSession.result?.jwt;
  const buckets = uploadSession.result?.buckets || [];
  if (!uploadJwt) throw new Error("Sessao de upload nao retornou JWT.");

  let completionJwt = uploadJwt;
  const entriesByHash = new Map(Object.entries(manifest).map(([assetPath, info]) => [info.hash, assetPath]));
  console.log(`Buckets a enviar: ${buckets.length}.`);

  for (const bucket of buckets) {
    const form = new FormData();
    for (const hash of bucket) {
      const assetPath = entriesByHash.get(hash);
      if (!assetPath) throw new Error(`Hash nao encontrado no manifesto: ${hash}`);
      const filePath = path.join(assetsDirectory, assetPath.replace(/^\//, ""));
      const encoded = (await readFile(filePath)).toString("base64");
      form.append(hash, new Blob([encoded], { type: getContentType(assetPath) }), hash);
    }

    const uploadResult = await apiFetch(
      `${apiBase}/accounts/${accountId}/workers/assets/upload?base64=true`,
      { method: "POST", headers: { authorization: `Bearer ${uploadJwt}` }, body: form },
      "Upload de bucket de assets",
    );
    if (uploadResult.result?.jwt) completionJwt = uploadResult.result.jwt;
  }

  const metadata = {
    main_module: "index.js",
    compatibility_date: "2026-06-17",
    assets: {
      jwt: completionJwt,
      config: { not_found_handling: "single-page-application", run_worker_first: ["/api/*", "/jornada/*"] },
    },
    bindings: [
      { type: "assets", name: "ASSETS" },
      { type: "d1", name: "DB", id: "8b150f2d-db0d-433e-8f88-98b5f83b3ef8" },
      { type: "r2_bucket", name: "FILES", bucket_name: "central-projetos-ia-files" },
    ],
    observability: { enabled: true },
  };

  const deployForm = new FormData();
  deployForm.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "metadata.json");
  deployForm.append("index.js", new Blob([await readFile(workerBundle)], { type: "application/javascript+module" }), "index.js");

  const deployResult = await apiFetch(
    `${apiBase}/accounts/${accountId}/workers/scripts/${scriptName}?bindings_inherit=strict`,
    { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: deployForm },
    "Deploy do Worker com assets",
  );

  console.log(`Deploy concluido. Script: ${deployResult.result?.id || scriptName}. has_assets=${deployResult.result?.has_assets}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
