#requires -version 5.1
# Restaura o executavel nativo de voz do Roamies, sem alterar sidekick.mjs.
$ErrorActionPreference = 'Stop'
try {
    $dirs = @(
        (Join-Path $env:LOCALAPPDATA 'Roamies'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Roamies'),
        (Join-Path $env:ProgramFiles 'Roamies')
    )
    $dir = $null
    foreach ($p in $dirs) {
        if (Test-Path -LiteralPath (Join-Path $p 'roamies-voice.exe') -PathType Leaf) {
            $dir = $p; break
        }
    }
    if (-not $dir) { throw 'Instalacao do Roamies nao localizada.' }
    $app = Join-Path $dir 'Roamies.exe'
    $info = (Get-Item -LiteralPath $app).VersionInfo
    $versao = [regex]::Match([string]$info.ProductVersion, '\d+\.\d+\.\d+').Value
    if (-not $versao) { $versao = [regex]::Match([string]$info.FileVersion, '\d+\.\d+\.\d+').Value }
    if (-not $versao) { throw 'Versao do Roamies desconhecida.' }
    $backup = Join-Path $HOME "Downloads\Roamies-Ola-Alec\backup\roamies-voice-original-$versao.exe"
    if (-not (Test-Path -LiteralPath $backup -PathType Leaf)) { throw "Backup em falta: $backup" }
    if (@(Get-Process -Name Roamies,roamies-voice -ErrorAction SilentlyContinue).Count -gt 0) {
        [void](Read-Host 'Fecha o Roamies completamente e carrega ENTER')
    }
    if (@(Get-Process -Name Roamies,roamies-voice -ErrorAction SilentlyContinue).Count -gt 0) {
        throw 'Roamies ainda aberto; restauracao cancelada.'
    }
    $target = Join-Path $dir 'roamies-voice.exe'
    Copy-Item -LiteralPath $backup -Destination $target -Force -ErrorAction Stop
    if ((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash -ne
        (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash) {
        throw 'Verificacao do backup reposto falhou.'
    }
    Remove-Item -LiteralPath (Join-Path $env:USERPROFILE 'Roamies\Data\alec-double-clap.flag') -Force -ErrorAction SilentlyContinue
    Write-Host 'Executavel de voz original restaurado. O Fish Audio permanece inalterado.' -ForegroundColor Green
} catch {
    Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}