function Start-HookLog {
    param(
        [Parameter(Mandatory = $true)][string]$HookName,
        [string]$EnvironmentName
    )

    $script:HookTranscriptStarted = $false
    $script:HookLogFile = $null

    $envName = $EnvironmentName
    if ([string]::IsNullOrWhiteSpace($envName)) {
        $envName = $env:AZURE_ENV_NAME
    }
    if ([string]::IsNullOrWhiteSpace($envName) -and (Get-Command azd -EA SilentlyContinue)) {
        try {
            $envName = (azd env get-value AZURE_ENV_NAME 2>$null | Select-Object -First 1)
        } catch { }
    }
    if ([string]::IsNullOrWhiteSpace($envName)) { $envName = "default" }

    $projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
    $logDir = Join-Path (Join-Path (Join-Path $projectRoot ".azure") $envName) "logs"

    try {
        if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $script:HookLogFile = Join-Path $logDir "$timestamp-$HookName.log"
        Start-Transcript -Path $script:HookLogFile -Append | Out-Null
        $script:HookTranscriptStarted = $true
        Write-Host "[LOG] Capturing output to $script:HookLogFile" -ForegroundColor DarkGray
    } catch {
        Write-Host "[WARN] Could not start transcript: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

function Stop-HookLog {
    if ($script:HookTranscriptStarted) {
        try { Stop-Transcript | Out-Null } catch { }
    }
}