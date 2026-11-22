#requires -version 5.1
<#
ALEC Modelos Livres para Roamies 0.1.49
Este instalador modifica APENAS sidecar\sidekick.mjs.
Ficheiros de voz, Fish Audio, memoria, configuracoes e executaveis nao sao tocados.
Se o hash do sidekick nao corresponder ao compilado original, RECUSA instalar.
A utilizacao de -Acao Restaurar repoe a copia guardada antes da instalacao.
#>
param(
    [ValidateSet('Estado','Instalar','Restaurar')]
    [string]$Acao = 'Estado',
    [string]$Instalacao = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $dir 'MANIFESTO.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw 'MANIFESTO.json em falta. Extrai todos os ficheiros do ZIP para a mesma pasta.'
}
$m = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($m.version -ne '0.1.49' -or $m.scope -ne 'sidecar/sidekick.mjs') {
    throw 'Manifesto nao autorizado para Roamies 0.1.49.'
}
$payload = Join-Path $dir 'sidekick-ALEC-modelos.mjs'
if (-not (Test-Path -LiteralPath $payload -PathType Leaf)) {
    throw 'Ficheiro sidekick-ALEC-modelos.mjs em falta.'
}
function Hash([string]$file) {
    return (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
}
if ((Hash $payload) -ne [string]$m.patchedSha256) {
    throw 'Integridade do pacote falhou. Nao foi alterada a instalacao.'
}
$backupBase = Join-Path $env:USERPROFILE 'Roamies\Backups\ALEC-ModelosLivres-0149'
function Find-Installation {
    $roots = New-Object System.Collections.Generic.List[string]
    if ($Instalacao) {
        $roots.Add([IO.Path]::GetFullPath($Instalacao))
    } else {
        foreach ($candidate in @(
            (Join-Path $env:LOCALAPPDATA 'Roamies'),
            (Join-Path $env:LOCALAPPDATA 'Programs\Roamies'),
            (Join-Path $env:ProgramFiles 'Roamies'),
            $(if ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)')) { Join-Path ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)')) 'Roamies' })
        )) {
            if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Container)) {
                $roots.Add($candidate)
            }
        }
    }
    $found = @()
    foreach ($root in $roots) {
        $exe = Join-Path $root 'Roamies.exe'
        if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { continue }
        foreach ($rel in @('sidecar\sidekick.mjs','resources\sidecar\sidekick.mjs')) {
            $file = Join-Path $root $rel
            if (Test-Path -LiteralPath $file -PathType Leaf) {
                $found += [pscustomobject]@{ Root=$root; File=$file; Exe=$exe }
            }
        }
    }
    if ($found.Count -ne 1) {
        throw "Esperava encontrar uma instalacao do Roamies e um sidekick.mjs. Encontradas: $($found.Count). Utiliza -Instalacao 'C:\CAMINHO\Roamies' se necessario."
    }
    return $found[0]
}
$target = Find-Installation
$version = [string](Get-Item -LiteralPath $target.Exe).VersionInfo.ProductVersion
if ($version -and $version -notmatch '^0\.1\.49($|\.)') {
    throw "Roamies instalado: $version. Este patch aceita apenas a versao 0.1.49."
}
$originalHash = [string]$m.originalSha256
$patchedHash = [string]$m.patchedSha256
$currentHash = Hash $target.File
if ($Acao -eq 'Estado') {
    Write-Host "Roamies: $($target.Root)"
    Write-Host "Versao reportada: $version"
    if ($currentHash -eq $originalHash) {
        Write-Host 'Estado: original 0.1.49 reconhecido; o patch pode ser aplicado.' -ForegroundColor Green
    } elseif ($currentHash -eq $patchedHash) {
        Write-Host 'Estado: ALEC Modelos Livres ja instalado.' -ForegroundColor Green
    } else {
        Write-Host 'Estado: sidekick.mjs personalizado/desconhecido. INSTALACAO BLOQUEADA.' -ForegroundColor Yellow
    }
    Write-Host "SHA256: $currentHash"
    return
}
$running = @(Get-Process -Name 'Roamies','roamies-node','roamies-voice' -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) {
    throw 'Fecha o Roamies completamente, inclusive o icone perto do relogio do Windows, antes de continuar.'
}
if ($Acao -eq 'Instalar') {
    if ($currentHash -eq $patchedHash) {
        Write-Host 'Ja esta instalado. Nenhuma alteracao realizada.' -ForegroundColor Green
        return
    }
    if ($currentHash -ne $originalHash) {
        throw 'Proteccao activada: o sidekick actual foi modificado ou tem outra compilacao. Nada foi alterado.'
    }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backupDir = Join-Path $backupBase $stamp
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    $backup = Join-Path $backupDir 'sidekick-original.mjs'
    Copy-Item -LiteralPath $target.File -Destination $backup -ErrorAction Stop
    if ((Hash $backup) -ne $originalHash) { throw 'Backup nao coincide. Instalacao recusada.' }
    $record = @{
        target=$target.File
        originalSha256=$originalHash
        patchedSha256=$patchedHash
        appVersion='0.1.49'
        created=(Get-Date).ToString('o')
    }
    $record | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupDir 'backup.json') -Encoding UTF8
    $temp = Join-Path (Split-Path -Parent $target.File) ('sidekick.alec-' + [guid]::NewGuid().ToString('N') + '.tmp')
    try {
        Copy-Item -LiteralPath $payload -Destination $temp -ErrorAction Stop
        if ((Hash $temp) -ne $patchedHash) { throw 'Verificacao da copia temporaria falhou.' }
        Move-Item -LiteralPath $temp -Destination $target.File -Force -ErrorAction Stop
        if ((Hash $target.File) -ne $patchedHash) { throw 'Verificacao apos a substituicao falhou.' }
        Write-Host 'SUCESSO: apenas sidecar\sidekick.mjs foi substituido.' -ForegroundColor Green
        Write-Host "Backup e comando de recuperacao em: $backupDir"
        Write-Host 'Reabre o Roamies, conecta o Ollama e verifica os modelos no selector.'
    } catch {
        if (Test-Path -LiteralPath $temp) {
            Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
        }
        Copy-Item -LiteralPath $backup -Destination $target.File -Force -ErrorAction Stop
        throw "Instalacao interrompida; original restaurado. Causa: $($_.Exception.Message)"
    }
    return
}
# Restaurar: apenas se o ficheiro actual corresponde ao nosso patch instalado.
if ($currentHash -eq $originalHash) {
    Write-Host 'O original ja esta presente. Nada a restaurar.' -ForegroundColor Green
    return
}
if ($currentHash -ne $patchedHash) {
    throw 'Recuperacao bloqueada: o ficheiro actual foi alterado depois do patch. Nao irei sobrescrever outra personalizacao.'
}
if (-not (Test-Path -LiteralPath $backupBase -PathType Container)) {
    throw 'Nao foi encontrado backup local. Nao vou inventar um ficheiro original.'
}
$backups = @(Get-ChildItem -LiteralPath $backupBase -Directory | Sort-Object Name -Descending)
$selected = $null
foreach ($entry in $backups) {
    $meta = Join-Path $entry.FullName 'backup.json'
    $file = Join-Path $entry.FullName 'sidekick-original.mjs'
    if (-not (Test-Path -LiteralPath $meta -PathType Leaf) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) { continue }
    $rec = Get-Content -LiteralPath $meta -Raw | ConvertFrom-Json
    if ($rec.target -eq $target.File -and $rec.originalSha256 -eq $originalHash -and (Hash $file) -eq $originalHash) {
        $selected = $file
        break
    }
}
if (-not $selected) { throw 'Nao existe backup integro associado a esta instalacao.' }
Copy-Item -LiteralPath $selected -Destination $target.File -Force -ErrorAction Stop
if ((Hash $target.File) -ne $originalHash) {
    throw 'A restauracao nao passou na verificacao de integridade.'
}
Write-Host 'RESTAURADO: sidekick.mjs original Roamies 0.1.49.' -ForegroundColor Green
Write-Host 'A voz Hello Alec, Fish Audio, memorias e configuracoes nao foram alteradas.'
