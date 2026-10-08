#!/usr/bin/env pwsh
# Post-down: Cleanup Entra app, role assignments, and local config after azd down

$ErrorActionPreference = "Continue"
. "$PSScriptRoot/modules/HookLogging.ps1"
Start-HookLog -HookName "postdown" -EnvironmentName $env:AZURE_ENV_NAME

Write-Host "Post-Down Cleanup" -ForegroundColor Cyan

$envName = $env:AZURE_ENV_NAME

# Remove role assignment from AI Foundry resource (if it exists)
$webIdentityPrincipalId = (azd env get-value WEB_IDENTITY_PRINCIPAL_ID 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1
$aiFoundryResourceGroup = (azd env get-value AI_FOUNDRY_RESOURCE_GROUP 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1
$aiFoundryResourceName = (azd env get-value AI_FOUNDRY_RESOURCE_NAME 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1
$subscriptionId = (azd env get-value AZURE_SUBSCRIPTION_ID 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1

if ($webIdentityPrincipalId -and $aiFoundryResourceGroup -and $aiFoundryResourceName -and $subscriptionId) {
    Write-Host "Removing role assignment from AI Foundry resource..." -ForegroundColor Yellow
    
    $scope = "/subscriptions/$subscriptionId/resourceGroups/$aiFoundryResourceGroup/providers/Microsoft.CognitiveServices/accounts/$aiFoundryResourceName"
    
    $roles = @("Cognitive Services User", "Cognitive Services OpenAI Contributor", "Azure AI Developer")
    foreach ($roleName in $roles) {
        az role assignment delete `
            --assignee $webIdentityPrincipalId `
            --role $roleName `
            --scope $scope 2>&1 | Out-Null
        
        Write-Host "[OK] $roleName — removed (if it existed)" -ForegroundColor Green
    }
}

# Delete Entra app (Graph resources are NOT tied to Azure resource groups — azd down won't clean them up)
if ($envName) {
    $clientId = (azd env get-value ENTRA_SPA_CLIENT_ID 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1
    $deleted = $false
    if (-not [string]::IsNullOrWhiteSpace($clientId)) {
        az ad app delete --id $clientId 2>&1 | Out-Null
        Write-Host "[OK] Entra app deleted: $clientId" -ForegroundColor Green
        $deleted = $true
    }
    if (-not $deleted) {
        # Fallback: look up by display name (matches Bicep uniqueName pattern)
        $appName = "ai-foundry-agent-$envName"
        $app = az ad app list --display-name $appName --query "[0].appId" -o tsv 2>$null
        if ($app) {
            az ad app delete --id $app 2>&1 | Out-Null
            Write-Host "[OK] Entra app deleted (by name): $appName" -ForegroundColor Green
        }
    }
}

# Delete local config files
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
@(
    "frontend/.env.local",
    "backend/WebApp.Api/.env"
) | ForEach-Object {
    $path = Join-Path $projectRoot $_
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "[OK] Deleted $_" -ForegroundColor Green
    }
}

# Delete azd environment folder (stop logging first to release file lock)
if ($envName) {
    $envFolder = Join-Path $projectRoot ".azure" $envName
    if (Test-Path $envFolder) {
        Stop-HookLog  # Release log file before deleting folder
        Remove-Item $envFolder -Recurse -Force
        Write-Host "[OK] Deleted .azure/$envName" -ForegroundColor Green
    }
}

# Optional Docker cleanup
if ($env:CLEAN_DOCKER_IMAGES -eq "true" -and (Get-Command docker -EA SilentlyContinue)) {
    docker images --filter "reference=*azurecr.io/web:*" -q | ForEach-Object { docker rmi $_ -f 2>$null }
    Write-Host "[OK] Docker images cleaned" -ForegroundColor Green
}

Write-Host "[OK] Cleanup complete. Run 'azd up' to redeploy." -ForegroundColor Green
