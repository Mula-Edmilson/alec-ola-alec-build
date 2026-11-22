#requires -version 5.1
<#
  Diagnostico ALEC V2. Regista trechos transcritos APENAS enquanto
  o sinalizador local esta activo. Nao envia audio nem logs para a cloud.
  Depois de testar, usa -Acao Recolher para desligar e ver o resultado.
#>
param(
    [ValidateSet('Ativar','Recolher','Desativar')]
    [string]$Acao = 'Recolher'
)
$ErrorActionPreference = 'Stop'
$data = Join-Path $HOME 'Roamies\Data'
$flag = Join-Path $data 'alec-wake-debug.flag'
$logs = Join-Path $data 'logs'
try {
    switch ($Acao) {
        'Ativar' {
            New-Item -Path $data -ItemType Directory -Force | Out-Null
            Set-Content -LiteralPath $flag -Value 'diagnostico temporario autorizado' -Encoding ascii
            Write-Host 'Diagnostico ACTIVADO temporariamente.' -ForegroundColor Yellow
            Write-Host 'Com Wake word ON, diz "Ola Alec" 3 vezes, com pausas entre tentativas.'
            Write-Host 'Depois executa o comando com -Acao Recolher para desligar e consultar o resultado.'
        }
        'Desativar' {
            Remove-Item -LiteralPath $flag -Force -ErrorAction SilentlyContinue
            Write-Host 'Diagnostico DESACTIVADO.' -ForegroundColor Green
        }
        'Recolher' {
            Remove-Item -LiteralPath $flag -Force -ErrorAction SilentlyContinue
            Write-Host 'Diagnostico DESACTIVADO. A procurar transcricoes locais:' -ForegroundColor Green
            $files = @(
                (Join-Path $logs 'sidekick-voice.log.old'),
                (Join-Path $logs 'sidekick-voice.log')
            )
            $lines = @()
            foreach ($f in $files) {
                if (Test-Path -LiteralPath $f -PathType Leaf) {
                    $lines += @(Get-Content -LiteralPath $f -ErrorAction Stop |
                        Where-Object { $_ -match 'ALEC_WAKE_DEBUG' } |
                        Select-Object -Last 25)
                }
            }
            if ($lines.Count -eq 0) {
                Write-Host 'Nenhuma transcricao encontrada. Confirma Listening > Hands-free > Wake word ON.'
                Write-Host "Consulta tambem: $logs"
            } else {
                Write-Host 'As linhas abaixo podem conter fala privada. Revê antes de partilhar.' -ForegroundColor Yellow
                $lines | Select-Object -Last 20
            }
        }
    }
} catch {
    Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
