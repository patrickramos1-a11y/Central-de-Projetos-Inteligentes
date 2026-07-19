param(
  [string]$Database = $(if ($env:D1_DATABASE_NAME) { $env:D1_DATABASE_NAME } else { "central-projetos-ia" })
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$wrangler = Join-Path $root "node_modules\.bin\wrangler.exe"
$outputDirectory = Join-Path $root "cloudflare\backups"

if (-not (Test-Path -LiteralPath $wrangler)) {
  throw "Wrangler local nao encontrado em $wrangler"
}

function Invoke-D1Query([string]$Sql, [bool]$RequireRows = $false) {
  $lastError = ""
  for ($attempt = 1; $attempt -le 3; $attempt += 1) {
    $output = & $wrangler d1 execute $Database --remote --command $Sql --json 2>&1
    $json = ($output -join "`n").Trim()

    if ($LASTEXITCODE -eq 0 -and $json) {
      $response = $json | ConvertFrom-Json
      $rows = @($response[0].results)
      if (-not $RequireRows -or $rows.Count -gt 0) { return $rows }
      $lastError = "A consulta retornou uma lista vazia."
    } elseif ($LASTEXITCODE -eq 0 -and -not $RequireRows) {
      return @()
    } else {
      $lastError = $output -join [Environment]::NewLine
    }

    Start-Sleep -Milliseconds (500 * $attempt)
  }

  throw "Falha ao exportar consulta D1: $Sql`n$lastError"
}

$tables = @(Invoke-D1Query "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV', 'd1_migrations') ORDER BY name" $true |
  ForEach-Object { [string]$_.name } |
  Where-Object { $_ -match '^[A-Za-z_][A-Za-z0-9_]*$' })

$requiredTables = @("app_users", "projects", "project_steps", "project_step_structures")
$missing = @($requiredTables | Where-Object { $_ -notin $tables })
if ($tables.Count -lt $requiredTables.Count -or $missing.Count -gt 0) {
  throw "Snapshot invalido: $($tables.Count) tabelas encontradas. Faltando: $($missing -join ', ')."
}

$snapshotTables = [ordered]@{}
foreach ($table in $tables) {
  $snapshotTables[$table] = @(Invoke-D1Query "SELECT * FROM `"$table`"")
}

$snapshot = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  database = $Database
  tables = $snapshotTables
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$fileName = "d1-snapshot-$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ss-fffZ')).json"
$outputPath = Join-Path $outputDirectory $fileName
$snapshot | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $outputPath -Encoding utf8

Write-Output "Snapshot criado: $outputPath ($($tables.Count) tabelas)."
