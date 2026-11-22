#requires -version 5.1
# Instala APENAS roamies-voice.exe, preservando Fish Audio e sidekick.mjs.
param([string]$Pasta = $PSScriptRoot)
$ErrorActionPreference = 'Stop'

try {
    $novo = Join-Path $Pasta 'roamies-voice.exe'
    $verFile = Join-Path $Pasta 'ROAMIES_VERSION.txt'
    $hashFile = Join-Path $Pasta 'SHA256.txt'
    foreach ($f in @($novo, $verFile, $hashFile)) {
        if (-not (Test-Path -LiteralPath $f -PathType Leaf)) {
            throw "Ficheiro em falta: $f. Extrai o ZIP descarregado do GitHub Actions."
        }
    }
    $versao = (Get-Content -LiteralPath $verFile -Raw).Trim()
    if ($versao -notmatch '^\d+\.\d+\.\d+$') { throw "Versao do build invalida: $versao" }
    $hashEsperado = (Get-Content -LiteralPath $hashFile -Raw).Trim()
    if ($hashEsperado -notmatch '^[0-9a-fA-F]{64}$') { throw 'Checksum SHA256.txt invalido.' }
    $hashNovo = (Get-FileHash -LiteralPath $novo -Algorithm SHA256).Hash
    if ($hashNovo -ine $hashEsperado) { throw 'O checksum do executavel nao corresponde ao artifact.' }

    $dirs = @(
        (Join-Path $env:LOCALAPPDATA 'Roamies'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Roamies'),
        (Join-Path $env:ProgramFiles 'Roamies')
    )
    $dir = $null
    foreach ($candidate in $dirs) {
        if (Test-Path -LiteralPath (Join-Path $candidate 'roamies-voice.exe') -PathType Leaf) {
            $dir = $candidate
            break
        }
    }
    if (-not $dir) { throw 'Nao encontrei roamies-voice.exe na instalacao do Roamies.' }

    $app = Join-Path $dir 'Roamies.exe'
    if (-not (Test-Path -LiteralPath $app)) { throw "Roamies.exe em falta: $app" }
    $info = (Get-Item -LiteralPath $app).VersionInfo
    $versaoApp = [regex]::Match([string]$info.ProductVersion, '\d+\.\d+\.\d+').Value
    if (-not $versaoApp) { $versaoApp = [regex]::Match([string]$info.FileVersion, '\d+\.\d+\.\d+').Value }
    if (-not $versaoApp) { throw 'Nao foi possivel verificar a versao do executavel instalado. Instalacao cancelada.' }
    if ($versaoApp -ne $versao) { throw "Versoes incompatíveis: app $versaoApp, helper $versao. Nao vou substituir." }

    $original = Join-Path $dir 'roamies-voice.exe'
    $hashInstalado = (Get-FileHash -LiteralPath $original -Algorithm SHA256).Hash
    if ($hashInstalado -eq $hashNovo) {
        Write-Host 'O helper ALEC ja esta instalado. Nenhuma alteracao necessaria.' -ForegroundColor Green
        exit 0
    }

    Write-Host "App: $dir" -ForegroundColor Cyan
    Write-Host "Versao: $versao; integridade do build: OK" -ForegroundColor Cyan

    $running = @(Get-Process -Name Roamies,roamies-voice -ErrorAction SilentlyContinue)
    if ($running.Count -gt 0) {
        [void](Read-Host 'Fecha completamente o Roamies (tambem na bandeja do Windows) e carrega ENTER')
        $running = @(Get-Process -Name Roamies,roamies-voice -ErrorAction SilentlyContinue)
    }
    if ($running.Count -gt 0) { throw 'Roamies continua em execucao. Nada foi alterado.' }

    $backupDir = Join-Path $HOME 'Downloads\Roamies-Ola-Alec\backup'
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    $backup = Join-Path $backupDir "roamies-voice-original-$versao.exe"
    if (-not (Test-Path -LiteralPath $backup -PathType Leaf)) {
        Copy-Item -LiteralPath $original -Destination $backup -ErrorAction Stop
    }
    if ((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash -eq $hashNovo) {
        throw 'O backup original coincide com a versao personalizada. Operacao cancelada.'
    }

    try {
        Copy-Item -LiteralPath $novo -Destination $original -Force -ErrorAction Stop
        if ((Get-FileHash -LiteralPath $original -Algorithm SHA256).Hash -ne $hashNovo) {
            throw 'A verificacao SHA256 depois da instalacao falhou.'
        }
    } catch {
        Copy-Item -LiteralPath $backup -Destination $original -Force
        throw
    }
    Write-Host 'SUCESSO! Ativacao "Ola Alec" instalada.' -ForegroundColor Green
    Write-Host 'Abre o Roamies > Listening > Hands-free > Wake word = ON.'
    Write-Host 'Diz: "Ola Alec, que horas sao?"'
    Write-Host "Backup: $backup"
    Write-Host 'Atualizacoes automaticas podem repor o helper original.'
} catch {
    Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}