#requires -version 5.1
<#
    ALEC: controlo da activacao por DUAS PALMADAS RAPIDAS.
    Nao instala componentes, nem altera a voz clonada Fish Audio.
    Por seguranca, so funciona quando Wake word estiver activado.
#>
param(
    [ValidateSet('Ativar','Desativar','Estado')]
    [string]$Acao = 'Estado'
)
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:USERPROFILE 'Roamies\Data'
$flag = Join-Path $dir 'alec-double-clap.flag'
try {
    switch ($Acao) {
        'Ativar' {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            [IO.File]::WriteAllText($flag, 'on')
            Write-Host 'PALMADA DUPLA ATIVADA no ALEC.' -ForegroundColor Green
            Write-Host 'Em Listening > Hands-free, mantem Wake word = ON.'
            Write-Host 'Faz duas palmadas secas (intervalo ~0,2 a 0,5 segundos) e fala depois de abrir o microfone.'
        }
        'Desativar' {
            Remove-Item -LiteralPath $flag -Force -ErrorAction SilentlyContinue
            Write-Host 'PALMADA DUPLA DESATIVADA. A activacao por voz continua disponivel.' -ForegroundColor Yellow
        }
        'Estado' {
            if (Test-Path -LiteralPath $flag -PathType Leaf) {
                Write-Host 'PALMADA DUPLA: ATIVA' -ForegroundColor Green
            } else {
                Write-Host 'PALMADA DUPLA: DESATIVADA' -ForegroundColor Yellow
            }
        }
    }
} catch {
    Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
