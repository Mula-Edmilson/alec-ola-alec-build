#requires -version 5.1
<#
ALEC V4 — Aprender assinatura acústica de 3 exemplos de PALMADA DUPLA.
Não necessita de Python, Rust, internet, cloud, conta, novas dependências.
O helper nativo usa o microfone e guarda só valores numéricos em JSON.
#>
param(
    [ValidateSet('Gravar','Estado','Apagar')]
    [string]$Acao = 'Gravar'
)
$ErrorActionPreference = 'Stop'
$profile = Join-Path $env:USERPROFILE 'Roamies\Data\alec-clap-profile.json'
try {
    if ($Acao -eq 'Estado') {
        if (Test-Path -LiteralPath $profile -PathType Leaf) {
            $p = Get-Content -LiteralPath $profile -Raw | ConvertFrom-Json
            if ($p.version -eq 1 -and @($p.templates).Count -eq 3) {
                Write-Host 'ALEC: perfil aprendido com 3 pares de palmadas.' -ForegroundColor Green
            } else {
                Write-Host 'ALEC: perfil invalido. Recomendo repetir a calibracao.' -ForegroundColor Yellow
            }
        } else {
            Write-Host 'ALEC: sem perfil; usa a deteccao automatica V3.' -ForegroundColor Yellow
        }
        return
    }

    if ($Acao -eq 'Apagar') {
        Remove-Item -LiteralPath $profile -Force -ErrorAction SilentlyContinue
        Write-Host 'Perfil de palmadas apagado. O helper volta ao detector V3 no proximo arranque.' -ForegroundColor Green
        return
    }

    $running = @(Get-Process -Name Roamies,roamies-voice -ErrorAction SilentlyContinue)
    if ($running.Count -gt 0) {
        Write-Host 'Fecha o Roamies completamente (inclusive a bandeja do Windows).' -ForegroundColor Yellow
        [void](Read-Host 'Depois de fechares o Roamies, carrega ENTER')
        $running = @(Get-Process -Name Roamies,roamies-voice -ErrorAction SilentlyContinue)
        if ($running.Count -gt 0) {
            throw 'O Roamies ainda está em execução. Fecha-o primeiro para gravar as palmadas com o microfone livre.'
        }
    }

    $paths = @(
        (Join-Path $env:LOCALAPPDATA 'Roamies\roamies-voice.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Roamies\roamies-voice.exe'),
        (Join-Path $env:ProgramFiles 'Roamies\roamies-voice.exe')
    )
    $exe = $paths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    if (-not $exe) { throw 'roamies-voice.exe nao foi encontrado. Instala primeiro ALEC V4.' }

    Write-Host ''
    Write-Host 'ALEC V4 - APRENDIZAGEM DA TUA PALMADA DUPLA' -ForegroundColor Cyan
    Write-Host 'A gravacao fica em RAM; o ficheiro final guarda apenas caracteristicas numericas.'
    Write-Host 'Serão pedidos 3 exemplos da mesma palma dupla, com ritmos ligeiramente diferentes.'
    Write-Host 'Microfone: dispositivo PREDEFINIDO de gravacao no Windows.' -ForegroundColor Yellow
    Write-Host ''
    & $exe --clap-calibrate
    if ($LASTEXITCODE -ne 0) { throw "A calibracao terminou com codigo $LASTEXITCODE. Verifica o microfone e repete." }

    $flag = Join-Path $env:USERPROFILE 'Roamies\Data\alec-double-clap.flag'
    New-Item -ItemType Directory -Path (Split-Path -Parent $flag) -Force | Out-Null
    [IO.File]::WriteAllText($flag, 'on')
    Write-Host 'Palmada dupla ligada. Abre o Roamies e deixa Wake word ON.' -ForegroundColor Green
} catch {
    Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}