# Azure Developer CLI Hooks

**AI Assistance**: See `.github/skills/deploying-to-azure/SKILL.md` for deployment patterns.

## Hook Execution Order

| Phase | Command | Hooks Executed | Duration |
|-------|---------|----------------|----------|
| **Deploy** | `azd up` | preprovision → provision → postprovision → predeploy | 10-12 min |
| **Code Only** | `azd deploy` | predeploy | 3-5 min |
| **Teardown** | `azd down` | (resources deleted) → postdown | 2-3 min |
| **Reprovision** | `azd provision` | preprovision → provision → postprovision | 2-3 min |

## Logging

All hooks start a PowerShell transcript automatically and write logs to `.azure/<env>/logs/` with timestamped filenames (one per hook run). The transcript captures the same console output shown during `azd` execution for post-run troubleshooting.

## Hook Details

| Hook | Purpose | Key Actions | Outputs |
|------|---------|-------------|---------|
| **preprovision.ps1** | Discover AI Foundry + configure agent | • Discovers AI Foundry resources<br>• Auto-detects tenant ID<br>• Discovers agent in project | AI Foundry env vars |
| **postprovision.ps1** | Configure Entra app + RBAC + local config | • Sets `identifierUri` on Entra app (can't be done in Bicep — self-references `appId`)<br>• Updates redirect URIs with production URL<br>• Assigns `Cognitive Services OpenAI Contributor` + `Azure AI Developer` roles to AI Foundry<br>• Generates local dev config files (`.env`, `.env.local`) | Configured Entra app + RBAC + local config |
| **predeploy.ps1** | Build container image | • Detects Docker availability<br>• Passes `APPLICATIONINSIGHTS_FRONTEND_CONNECTION_STRING` as Docker build arg for frontend browser telemetry<br>• Local Docker build + push OR ACR cloud build<br>• Updates Container App if it exists | Container image in ACR |
| **postdown.ps1** | Cleanup (optional) | • Removes RBAC assignment<br>• Deletes Entra app (Graph resources aren't tied to RGs)<br>• Optionally removes Docker images | Clean slate |

## Entra App Registration

The Entra app is created **declaratively via Bicep** (`infra/entra-app.bicep`) using the Microsoft Graph Bicep extension.

**What Bicep handles**: App creation, display name, sign-in audience, SPA redirect URIs (localhost only), `Chat.ReadWrite` scope, service principal, and `serviceManagementReference`.

**What postprovision handles**: `identifierUri` (requires auto-generated `appId`), Container App FQDN redirect URI, and local dev config generation.

## Module Scripts

### modules/Get-AIFoundryAgents.ps1

Discovers agents in a Microsoft Foundry project via REST API (`/agents?api-version=2025-11-15-preview`).

**Usage**:
```powershell
# Basic usage
$agents = & "$PSScriptRoot/modules/Get-AIFoundryAgents.ps1" `
    -ProjectEndpoint $endpoint

# Quiet mode (suppress console output)
$agents = & "$PSScriptRoot/modules/Get-AIFoundryAgents.ps1" `
    -ProjectEndpoint $endpoint -Quiet

# Custom token
$agents = & "$PSScriptRoot/modules/Get-AIFoundryAgents.ps1" `
    -ProjectEndpoint $endpoint -AccessToken $token
```

**Returns**: Array of agent objects (`name`, `id`, `versions`). Handles pagination automatically.

## Testing

```powershell
# Test individual hooks
.\hooks\preprovision.ps1
.\hooks\postprovision.ps1  # Requires provisioned infrastructure
.\hooks\postdown.ps1

# Test full flow
azd up
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| App registration fails with policy error | Run `azd env set ENTRA_SERVICE_MANAGEMENT_REFERENCE 'guid'` then `azd up` (Bicep passes it to Microsoft Graph extension) |
| Provision fails | Verify Azure CLI auth: `az account show` |
| Predeploy Docker build fails | Check Docker running: `docker version` (falls back to ACR cloud build) |
| AI Foundry not found | Create resource at [ai.azure.com](https://ai.azure.com) or use [foundry-samples Bicep templates](https://github.com/microsoft-foundry/foundry-samples/tree/main/infrastructure/infrastructure-setup-bicep) |
| Multiple AI Foundry resources | Set `AI_FOUNDRY_RESOURCE_NAME` or select when prompted |
| RBAC assignment fails | Verify you have User Access Administrator role on AI Foundry resource |

### App Registration Policies

Some organizations require [`serviceManagementReference`](https://learn.microsoft.com/en-us/powershell/module/microsoft.graph.applications/invoke-mginstantiateapplicationtemplate) for app registrations.

**Quick fix**:
```powershell
azd env set ENTRA_SERVICE_MANAGEMENT_REFERENCE 'your-guid-here'
azd up
```

**Persistent fix** (environment variable):
```powershell
[System.Environment]::SetEnvironmentVariable('ENTRA_SERVICE_MANAGEMENT_REFERENCE', 'your-guid-here', 'User')
# Restart terminal
```

Contact your Entra ID admin for the required GUID.

### Multiple AI Foundry Resources

If you have multiple AI Foundry resources in your subscription, the preprovision hook will prompt you to select one. 

**To skip the prompt**, pre-configure your preferred resource:
```powershell
azd env set AI_FOUNDRY_RESOURCE_NAME "your-ai-foundry-resource-name"
```

## Customization

### Change Default Behavior

| Change | File | Modification |
|--------|------|-------------|
| Always clean Docker images | `postdown.ps1` | Set `$cleanDockerImages = $true` |
| Change ports | `start-local-dev.ps1` + Entra app URIs | Update port references |
| Skip auto-opening browser | `postprovision.ps1` | Comment out `Start-Process` line |

## See Also

- `.github/hooks/` — Copilot agent hooks (commit gate, custom workflow policies). These are **different** from the azd deployment hooks in this directory.
