[CmdletBinding()]
param([string]$Destino = (Join-Path $HOME 'Downloads\ALEC-Roamies-0.1.51'))
$ErrorActionPreference = 'Stop'
# Download only: do not run the upstream installer over the user's customized installation.
$release = Invoke-RestMethod -Uri 'https://api.github.com/repos/KenKaiii/Roamies/releases/tags/v0.1.51' -Headers @{'User-Agent'='ALEC-Upgrade-Preparation';'Accept'='application/vnd.github+json'}
if ($release.tag_name -ne 'v0.1.51' -or $release.draft -or $release.prerelease) { throw 'Release inesperada.' }
$asset = @($release.assets | Where-Object { $_.name -eq 'Roamies_0.1.51_x64-setup.exe' })
if ($asset.Count -ne 1 -or $asset[0].digest -notmatch '^sha256:([a-fA-F0-9]{64})$') { throw 'Asset ou SHA-256 oficial indisponivel. Nada foi instalado.' }
$expected = $Matches[1].ToLowerInvariant()
$expectedUrl = 'https://github.com/KenKaiii/Roamies/releases/download/v0.1.51/Roamies_0.1.51_x64-setup.exe'
if ($asset[0].browser_download_url -ne $expectedUrl) { throw 'URL inesperada.' }
New-Item -ItemType Directory -Force -Path $Destino | Out-Null
$target = Join-Path $Destino $asset[0].name
if (Test-Path -LiteralPath $target) {
  if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Ja existe um ficheiro diferente. Nao sera substituido.' }
} else {
  $tmp = $target + '.' + [guid]::NewGuid().ToString('N') + '.download'
  try {
    Invoke-WebRequest -Uri $expectedUrl -UseBasicParsing -OutFile $tmp
    if ((Get-FileHash -LiteralPath $tmp -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'SHA-256 diferente. Download rejeitado.' }
    Move-Item -LiteralPath $tmp -Destination $target
  } finally {
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force }
  }
}
Write-Host "Instalador oficial verificado: $target"
Write-Warning 'APENAS PREPARADO. Nao executar sobre o Roamies personalizado ate validar a migracao do Bridge, da voz e do helper.'
