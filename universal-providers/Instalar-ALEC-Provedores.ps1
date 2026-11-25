[CmdletBinding()]
param(
  [ValidateSet('Estado','Instalar','Restaurar')]
  [string]$Acao = 'Estado',
  [string[]]$ModelosCloudflare = @(),
  [string]$Manifesto
)
$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'patch-providers.mjs'
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) { throw 'Falta patch-providers.mjs. Extrai o ZIP completo.' }
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if ($node) { $exe = $node.Source }
else {
  $root = Join-Path $env:LOCALAPPDATA 'Roamies'
  $exe = Join-Path $root 'sidecar\node.exe'
  if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'Node.js 22+ nao encontrado.' }
}
$version = & $exe --version
if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) { throw 'Node.js 22 ou superior necessario.' }
switch ($Acao) {
  'Estado' { & $exe $scriptPath status }
  'Instalar' { & $exe $scriptPath install @ModelosCloudflare }
  'Restaurar' {
    if (-not $Manifesto) { throw 'Indica o caminho do manifesto apresentado pelo instalador.' }
    & $exe $scriptPath restore $Manifesto
  }
}
if ($LASTEXITCODE -ne 0) { throw 'Operacao nao concluida; consulta a mensagem acima.' }
