#!/usr/bin/env pwsh
# Pre-provision: Discovers AI Foundry resources and configures agent
# Entra app registration is handled declaratively by Bicep (infra/entra-app.bicep)

$ErrorActionPreference = "Stop"
$env:PYTHONIOENCODING = "utf-8"
. "$PSScriptRoot/modules/HookLogging.ps1"
Start-HookLog -HookName "preprovision" -EnvironmentName $env:AZURE_ENV_NAME

Write-Host "Pre-Provision: AI Foundry Discovery" -ForegroundColor Cyan

# Check prerequisites
foreach ($cmd in @('pwsh', 'az')) {
    if (-not (Get-Command $cmd -EA SilentlyContinue)) {
        Write-Host "[ERROR] $cmd not found. See: https://learn.microsoft.com/cli/azure/install-azure-cli" -ForegroundColor Red
        exit 1
    }
}

$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "[ERROR] Not logged in to Azure. Run 'azd auth login'" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Azure CLI: $($account.user.name)" -ForegroundColor Green

# Get environment
$envName = (azd env get-value AZURE_ENV_NAME 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($envName)) { $envName = $env:AZURE_ENV_NAME }
if ([string]::IsNullOrWhiteSpace($envName)) {
    Write-Host "[ERROR] AZURE_ENV_NAME not set. Run 'azd init' first." -ForegroundColor Red
    exit 1
}

# Auto-detect tenant if not set
$tenantId = (azd env get-value ENTRA_TENANT_ID 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($tenantId)) {
    $tenantId = $account.tenantId
    azd env set ENTRA_TENANT_ID $tenantId
}
Write-Host "[OK] Tenant: $tenantId" -ForegroundColor Green

Write-Host "[OK] Environment: $envName" -ForegroundColor Green

# ---------------------------------------------------------------------------
# Validate EXISTING Entra app registration(s) when reuse is requested.
# Warnings only — this never fails the deployment if config can't be confirmed.
# ---------------------------------------------------------------------------
$existingSpaClientId = (azd env get-value ENTRA_EXISTING_SPA_CLIENT_ID 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1
$existingBackendClientId = (azd env get-value ENTRA_EXISTING_BACKEND_CLIENT_ID 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1
$oboEnabledVal = (azd env get-value ENABLE_OBO 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1
$unifiedClientVal = (azd env get-value USE_UNIFIED_APP_CLIENT 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1

function Test-ExistingEntraApp {
    param([string]$ClientId, [string]$Role, [bool]$ExpectObo)
    if ([string]::IsNullOrWhiteSpace($ClientId)) { return }
    Write-Host "Validating existing $Role app registration ($ClientId)..." -ForegroundColor Cyan
    try {
        $appJson = az ad app show --id $ClientId 2>$null
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($appJson)) {
            Write-Host "[WARN] Could not read app '$ClientId'. Ensure it exists and you have permission. Continuing." -ForegroundColor Yellow
            return
        }
        $appObj = $appJson | ConvertFrom-Json

        # Exposed Chat.ReadWrite delegated scope
        $scopes = @($appObj.api.oauth2PermissionScopes | ForEach-Object { $_.value })
        if ($scopes -notcontains 'Chat.ReadWrite') {
            Write-Host "[WARN] $Role app is missing the 'Chat.ReadWrite' delegated scope. The app may not authorize chat requests." -ForegroundColor Yellow
        }

        # identifierUri api://{clientId}
        if (@($appObj.identifierUris) -notcontains "api://$ClientId") {
            Write-Host "[WARN] $Role app has no 'api://$ClientId' identifier URI. Token scope resolution may fail (postprovision will attempt to set it)." -ForegroundColor Yellow
        }

        # SPA platform redirect URIs (only meaningful for the SPA-facing app)
        if ($Role -eq 'SPA' -and @($appObj.spa.redirectUris).Count -eq 0) {
            Write-Host "[WARN] SPA app has no SPA-platform redirect URIs. MSAL.js login will fail until they are added (postprovision will attempt to add them)." -ForegroundColor Yellow
        }

        # OBO: Azure ML user_impersonation permission + a federated identity credential
        if ($ExpectObo) {
            $hasAml = $false
            foreach ($rra in @($appObj.requiredResourceAccess)) {
                if ($rra.resourceAppId -eq '18a66f5f-dbdf-4c17-9dd7-1634712a9cbe') { $hasAml = $true }
            }
            if (-not $hasAml) {
                Write-Host "[WARN] $Role app is missing Azure Machine Learning Services 'user_impersonation' permission required for OBO." -ForegroundColor Yellow
            }
            $fic = az ad app federated-credential list --id $ClientId 2>$null | ConvertFrom-Json
            if (-not $fic -or @($fic).Count -eq 0) {
                Write-Host "[WARN] $Role app has no federated identity credential. Secretless OBO requires one (postprovision will attempt to add it)." -ForegroundColor Yellow
            }
        }

        Write-Host "[OK] Validated existing $Role app (any warnings above are non-blocking)." -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Validation of $Role app '$ClientId' could not complete: $($_.Exception.Message). Continuing." -ForegroundColor Yellow
    }
}

if ($existingSpaClientId -or $existingBackendClientId) {
    $isObo = ($oboEnabledVal -eq 'true')
    $isUnified = ($unifiedClientVal -eq 'true')
    # In unified mode the SPA app is also the OBO app, so expect OBO config on it.
    Test-ExistingEntraApp -ClientId $existingSpaClientId -Role 'SPA' -ExpectObo:($isObo -and $isUnified)
    if ($isObo -and -not $isUnified) {
        Test-ExistingEntraApp -ClientId $existingBackendClientId -Role 'backend' -ExpectObo:$true
    }
}

# Map portal variables (AZURE_EXISTING_*) to app variables if present
# The AI Foundry portal's "View sample app code" emits these when linking to this repo.
# Users may paste them into azd env (.azure/<env>/.env) or a root .env file.
$portalEndpoint = (azd env get-value AZURE_EXISTING_AIPROJECT_ENDPOINT 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1
$portalAgentId = (azd env get-value AZURE_EXISTING_AGENT_ID 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1
$portalResourceId = (azd env get-value AZURE_EXISTING_RESOURCE_ID 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1

# Also check for a root .env file — the portal says "put in your .env file" without
# specifying which one, so many users create one at the repo root.
$rootEnvFile = Join-Path $PSScriptRoot "../../.env"
if (Test-Path $rootEnvFile) {
    $rootEnvVars = @{}
    foreach ($line in Get-Content $rootEnvFile) {
        $line = $line.Trim()
        if ($line -and -not $line.StartsWith('#')) {
            $eqIdx = $line.IndexOf('=')
            if ($eqIdx -gt 0) {
                $key = $line.Substring(0, $eqIdx).Trim()
                $value = $line.Substring($eqIdx + 1).Trim().Trim('"')
                $rootEnvVars[$key] = $value
            }
        }
    }
    if (-not $portalEndpoint -and $rootEnvVars['AZURE_EXISTING_AIPROJECT_ENDPOINT']) {
        $portalEndpoint = $rootEnvVars['AZURE_EXISTING_AIPROJECT_ENDPOINT']
    }
    if (-not $portalAgentId -and $rootEnvVars['AZURE_EXISTING_AGENT_ID']) {
        $portalAgentId = $rootEnvVars['AZURE_EXISTING_AGENT_ID']
    }
    if (-not $portalResourceId -and $rootEnvVars['AZURE_EXISTING_RESOURCE_ID']) {
        $portalResourceId = $rootEnvVars['AZURE_EXISTING_RESOURCE_ID']
    }
}

if ($portalEndpoint -or $portalAgentId -or $portalResourceId) {
    Write-Host "Mapping portal variables (AZURE_EXISTING_*)..." -ForegroundColor Cyan

    if ($portalEndpoint) {
        $currentEndpoint = (azd env get-value AI_AGENT_ENDPOINT 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1
        if ([string]::IsNullOrWhiteSpace($currentEndpoint)) {
            azd env set AI_AGENT_ENDPOINT $portalEndpoint
            Write-Host "[OK] Mapped AZURE_EXISTING_AIPROJECT_ENDPOINT -> AI_AGENT_ENDPOINT" -ForegroundColor Green
        }
    }

    if ($portalAgentId) {
        $currentAgentId = (azd env get-value AI_AGENT_ID 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1
        if ([string]::IsNullOrWhiteSpace($currentAgentId)) {
            # Portal format is "name:version" (e.g. "dadjokes:2") — split and map
            # If no version suffix, AI_AGENT_VERSION remains unset (defaults to latest)
            $parts = $portalAgentId -split ':', 2
            $agentName = $parts[0].Trim()
            azd env set AI_AGENT_ID $agentName
            Write-Host "[OK] Mapped AZURE_EXISTING_AGENT_ID -> AI_AGENT_ID=$agentName" -ForegroundColor Green

            $agentVersion = if ($parts.Count -gt 1) { $parts[1].Trim() } else { '' }
            if ($agentVersion) {
                azd env set AI_AGENT_VERSION $agentVersion
                Write-Host "[OK] Mapped agent version -> AI_AGENT_VERSION=$agentVersion" -ForegroundColor Green
            }
        }
    }

    if ($portalResourceId) {
        $currentResourceName = (azd env get-value AI_FOUNDRY_RESOURCE_NAME 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1
        if ([string]::IsNullOrWhiteSpace($currentResourceName)) {
            # Extract resource name from ARM path: .../accounts/<name>
            $resourceName = (($portalResourceId -split '/accounts/')[-1] -split '/' | Select-Object -First 1).Trim()
            if ($resourceName) {
                azd env set AI_FOUNDRY_RESOURCE_NAME $resourceName
                Write-Host "[OK] Mapped AZURE_EXISTING_RESOURCE_ID -> AI_FOUNDRY_RESOURCE_NAME=$resourceName" -ForegroundColor Green
            }
        }
    }
}

# Discover AI Foundry resources
Write-Host "Discovering AI Foundry resources..." -ForegroundColor Cyan

$existingEndpoint = (azd env get-value AI_AGENT_ENDPOINT 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1

if ([string]::IsNullOrWhiteSpace($existingEndpoint)) {
    $configuredResourceName = (azd env get-value AI_FOUNDRY_RESOURCE_NAME 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1
    
    # Auto-discover
    $resources = az cognitiveservices account list --query "[?kind=='AIServices']" | ConvertFrom-Json
    if (-not $resources -or $resources.Count -eq 0) {
        Write-Host "[ERROR] No AI Foundry resources found. Create one at https://ai.azure.com" -ForegroundColor Red
        exit 1
    }
    
    $selected = $null
    
    if ($resources.Count -eq 1) {
        # Single resource - use it directly
        $selected = $resources[0]
        Write-Host "[OK] Found 1 AI Foundry resource: $($selected.name)" -ForegroundColor Green
    } else {
        # Multiple resources - use configured name or fallback to first
        if (-not [string]::IsNullOrWhiteSpace($configuredResourceName)) {
            $matched = @($resources | Where-Object { $_.name -eq $configuredResourceName.Trim() })
            if ($matched.Count -ge 1) {
                $selected = $matched[0]
                Write-Host "[OK] Using configured: $($selected.name)" -ForegroundColor Green
            } else {
                Write-Host "[!] AI_FOUNDRY_RESOURCE_NAME '$configuredResourceName' not found." -ForegroundColor Yellow
            }
        }
        
        if (-not $selected) {
            Write-Host "[!] Multiple AI Foundry resources found:" -ForegroundColor Yellow
            for ($i = 0; $i -lt $resources.Count; $i++) {
                $r = $resources[$i]
                Write-Host "    [$($i+1)] $($r.name)  (RG: $($r.resourceGroup), Region: $($r.location))" -ForegroundColor White
            }
            
            # Check if running interactively
            $isInteractive = [Environment]::UserInteractive -and -not [Console]::IsInputRedirected
            
            if ($isInteractive) {
                $choice = (Read-Host "Select (1-$($resources.Count)) or press Enter for [1]").Trim()
                if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }
                $idx = [int]$choice - 1
                if ($idx -ge 0 -and $idx -lt $resources.Count) {
                    $selected = $resources[$idx]
                } else {
                    $selected = $resources[0]
                }
                Write-Host "[OK] Selected: $($selected.name)" -ForegroundColor Green
            } else {
                # Non-interactive: auto-select first and warn
                $selected = $resources[0]
                Write-Host "[!] Non-interactive mode: using first resource '$($selected.name)'" -ForegroundColor Yellow
                Write-Host "    To specify: azd env set AI_FOUNDRY_RESOURCE_NAME <name>" -ForegroundColor Yellow
            }
        }
    }
    
    Write-Host "[OK] Using AI Foundry resource: $($selected.name)" -ForegroundColor Green
    
    # Region safety check: warn if AI Foundry resource is in a different region than deployment
    $deploymentLocation = (azd env get-value AZURE_LOCATION 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1
    $aiFoundryLocation = $selected.location
    if (-not [string]::IsNullOrWhiteSpace($deploymentLocation) -and -not [string]::IsNullOrWhiteSpace($aiFoundryLocation)) {
        if ($deploymentLocation.Replace(' ','').ToLower() -ne $aiFoundryLocation.Replace(' ','').ToLower()) {
            Write-Host "[WARN] Region mismatch: deploying to '$deploymentLocation' but AI Foundry is in '$aiFoundryLocation'" -ForegroundColor Yellow
            Write-Host "  The user-assigned MI has isolationScope=Regional. Cross-region RBAC assignments" -ForegroundColor Yellow
            Write-Host "  still work, but for best resilience consider co-locating resources." -ForegroundColor Yellow
            Write-Host "  To change: azd env set AZURE_LOCATION $aiFoundryLocation" -ForegroundColor Gray
        } else {
            Write-Host "[OK] Region match: $deploymentLocation" -ForegroundColor Green
        }
    }
    
    # Get first project
    $projectsUrl = "https://management.azure.com$($selected.id)/projects?api-version=2025-12-01"
    $projects = az rest --method get --url $projectsUrl --query "value" 2>$null | ConvertFrom-Json
    if (-not $projects -or $projects.Count -eq 0) {
        Write-Host "[ERROR] No projects found. Create one at https://ai.azure.com" -ForegroundColor Red
        exit 1
    }
    $projectName = $projects[0].name.Split('/')[-1]
    
    $aiEndpoint = "https://$($selected.name).services.ai.azure.com/api/projects/$projectName"
    azd env set AI_FOUNDRY_RESOURCE_GROUP $selected.resourceGroup
    azd env set AI_FOUNDRY_RESOURCE_NAME $selected.name
    azd env set AI_FOUNDRY_LOCATION $selected.location
    azd env set AI_AGENT_ENDPOINT $aiEndpoint
    
    Write-Host "[OK] Endpoint: $aiEndpoint" -ForegroundColor Green
} else {
    Write-Host "[OK] Using pre-configured endpoint" -ForegroundColor Green
    $aiEndpoint = $existingEndpoint
}

# Discover agent if not set
$agentId = (azd env get-value AI_AGENT_ID 2>&1) | Where-Object { $_ -notmatch 'ERROR' } | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($agentId)) {
    try {
        $agents = & "$PSScriptRoot/modules/Get-AIFoundryAgents.ps1" -ProjectEndpoint $aiEndpoint
        if ($agents -and $agents.Count -gt 0) {
            $agentId = $agents[0].name
            azd env set AI_AGENT_ID $agentId
            Write-Host "[OK] Agent: $agentId" -ForegroundColor Green
        }
    } catch { }
}
if ([string]::IsNullOrWhiteSpace($agentId)) {
    Write-Host "[ERROR] AI_AGENT_ID required. Run: azd env set AI_AGENT_ID <name>" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Pre-provision complete" -ForegroundColor Green

if ($script:HookLogFile) {
    Write-Host "[LOG] Log file: $script:HookLogFile" -ForegroundColor DarkGray
}
Stop-HookLog
