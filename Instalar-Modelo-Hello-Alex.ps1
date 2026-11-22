#requires -version 5.1
# ALEC V5: instalar um modelo hello_alex.onnx autocontido, criado no Colab.
# Este script NUNCA publica o modelo nem o carrega para o GitHub.
param([Parameter(Mandatory=$true)][string]$Zip)
$ErrorActionPreference = 'Stop'
$temp = Join-Path $env:TEMP ("alec-hello-alex-" + [guid]::NewGuid().ToString("N"))
$destDir = Join-Path $env:USERPROFILE "Roamies\Data"
$dest = Join-Path $destDir "hello_alex.onnx"
$previous = $null
try {
    if (-not (Test-Path -LiteralPath $Zip -PathType Leaf)) { throw "ZIP não encontrado: $Zip" }
    New-Item -ItemType Directory -Path $temp -Force | Out-Null
    Expand-Archive -LiteralPath $Zip -DestinationPath $temp -Force
    $models = @(Get-ChildItem -LiteralPath $temp -Filter 'hello_alex.onnx' -Recurse -File)
    if ($models.Count -ne 1) { throw "O ZIP deve conter exactamente um ficheiro hello_alex.onnx. Encontrados: $($models.Count)" }
    $src = $models[0].FullName
    if ((Get-Item -LiteralPath $src).Length -lt 512) { throw 'O ficheiro ONNX é demasiado pequeno.' }
    if ((Get-Item -LiteralPath $src).Length -gt 40MB) { throw 'Modelo inesperadamente grande, máximo 40MB.' }

    $dirs = @(
        (Join-Path $env:LOCALAPPDATA "Roamies"),
        (Join-Path $env:LOCALAPPDATA "Programs\Roamies"),
        (Join-Path $env:ProgramFiles "Roamies")
    )
    $exe = $null
    foreach ($dir in $dirs) {
        $candidate = Join-Path $dir "roamies-voice.exe"
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { $exe = $candidate; break }
    }
    if (-not $exe) { throw "O componente roamies-voice.exe não foi encontrado. Instala primeiro o pacote ALEC V5." }

    $busy = @(Get-Process -Name Roamies,roamies-voice -ErrorAction SilentlyContinue)
    if ($busy.Count -gt 0) { throw "Fecha completamente o Roamies antes de instalar o modelo." }
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    if (Test-Path -LiteralPath $dest -PathType Leaf) {
        $previous = Join-Path $temp "hello_alex-anterior.onnx"
        Copy-Item -LiteralPath $dest -Destination $previous -ErrorAction Stop
    }
    Copy-Item -LiteralPath $src -Destination $dest -Force
    $output = & $exe --test-neural 2>$null | Out-String
    $code = $LASTEXITCODE
    try { $response = $output | ConvertFrom-Json } catch { $response = $null }
    if ($code -ne 0 -or $null -eq $response -or $response.ok -ne $true) {
        if ($previous) { Copy-Item -LiteralPath $previous -Destination $dest -Force }
        else { Remove-Item -LiteralPath $dest -Force }
        throw "O modelo não passou no teste de inferência do ALEC. Detalhes: $output"
    }

    # A activação por ruído da V3/V4 fica desactivada; a voz Hello Alex
    # é processada pelo motor neural, e o Parakeet fica para os comandos.
    Remove-Item -LiteralPath (Join-Path $destDir 'alec-double-clap.flag') -Force -ErrorAction SilentlyContinue
    Write-Host "SUCESSO! Modelo neural Hello Alex validado e instalado." -ForegroundColor Green
    Write-Host "Ficheiro local: $dest"
    Write-Host "Abre Roamies > Listening > Hands-free > Wake word ON."
    Write-Host 'Diz "Hello Alex", faz uma pequena pausa e depois o comando.'
} catch {
    Write-Host "FALHA: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
