# Infrastructure - Azure Bicep Templates

**AI Assistance**: See `.github/skills/writing-bicep-templates/SKILL.md` for Bicep patterns.

## Overview

Infrastructure as Code (IaC) using Azure Bicep, deployed via Azure Developer CLI (azd). Provisions:

- **Azure Container Registry** (Basic tier) - Private image storage
- **Azure Container Apps Environment** - Serverless container runtime
- **Azure Container App** - Single container (frontend + backend)
- **Log Analytics Workspace** - Centralized logging (30-day retention)
- **Application Insights (Backend)** - OpenTelemetry traces and metrics (`appi-<token>`)
- **Application Insights (Frontend)** - Browser telemetry (`appi-fe-<token>`, separate resource to isolate browser metrics)
- **User-Assigned Managed Identity** - Regional isolation, used for ACR pull + AI Foundry RBAC + OBO FIC. Always created (OBO changes only how it is used, not whether it exists)
- **Entra SPA App Registration** - Microsoft Graph Bicep extension (`Microsoft.Graph/applications@v1.0`)
- **Entra Backend App** (opt-in, `enableObo=true`) - OBO with FIC, `requiredResourceAccess`, admin consent via `oauth2PermissionGrants`
- **RBAC Assignments** - MI → AI Foundry access (via Azure CLI, not Bicep); MI → ACR pull (via Bicep)

## Architecture

```text
Subscription (deployment scope)
├── Resource Group (auto-created)
├── User-Assigned Managed Identity (isolationScope: Regional)
│   └── Used for: ACR pull, AI Foundry RBAC, OBO FIC
├── Entra SPA App Registration (Microsoft Graph Bicep)
│   ├── SPA redirect URIs (localhost; FQDN added by postprovision)
│   └── Chat.ReadWrite scope
├── Entra Backend App (conditional: enableObo=true)
│   ├── FIC → user-assigned MI (secretless OBO)
│   ├── requiredResourceAccess → Azure Machine Learning Services
│   ├── oauth2PermissionGrants → admin consent
│   └── knownClientApplications → SPA app
├── Container Registry (ACR, adminUserEnabled: false)
│   └── AcrPull role → user-assigned MI
├── Application Insights (Backend: appi-xxx)
│   └── OpenTelemetry traces, metrics, distributed tracing
├── Application Insights (Frontend: appi-fe-xxx)
│   └── Browser telemetry (separate resource)
├── Container Apps Environment
│   └── Container App (web)
│       ├── User-assigned identity only
│       ├── ACR pull via MI (no admin credentials)
│       ├── Scale: 0-3 replicas
│       └── Ingress: HTTPS external
└── Log Analytics Workspace (shared by both App Insights resources)

RBAC (via Azure CLI in postprovision.ps1):
└── User-Assigned MI → Cognitive Services User + Cognitive Services OpenAI Contributor + Azure AI Developer on AI Foundry resource
```

## Files

| File | Purpose |
|------|---------|
| `main.bicep` | Orchestration (subscription scope) |
| `main-infrastructure.bicep` | Shared resources (ACR, Log Analytics, Application Insights, Container Apps Env) |
| `main-app.bicep` | Container App configuration |
| `entra-app.bicep` | Entra app registration (Microsoft Graph Bicep extension) |
| `bicepconfig.json` | Bicep configuration (Microsoft Graph v1.0 extension reference) |
| `main.parameters.json` | Parameter values (environment name, location) |
| `abbreviations.json` | Azure resource naming abbreviations |

## Key Features

- **Subscription Scope**: Single deployment creates resource group + all resources
- **Parallel Provisioning**: ARM auto-parallelizes independent modules — `infrastructure` and `entraApp` deploy simultaneously when `enableObo=false`. With OBO enabled, `entraApp` waits for `infrastructure` (needs MI principal ID for FIC).
- **Unique Naming**: `uniqueString()` prevents naming conflicts
- **Scale-to-Zero**: Container App scales down when idle (cost savings)
- **Managed Identity**: User-assigned MI with `isolationScope: Regional` for ACR pull + AI Foundry + OBO
- **RBAC Automation**: Auto-assigns `Cognitive Services User` + `Cognitive Services OpenAI Contributor` + `Azure AI Developer` roles to AI Foundry

## Deployment

### Via azd (recommended)

```powershell
# Initial deployment
azd up  # Provisions + deploys code

# Update infrastructure only
azd provision

# Change AI Foundry resource
azd env set AI_FOUNDRY_RESOURCE_GROUP <resource-group>
azd env set AI_FOUNDRY_RESOURCE_NAME <resource-name>
azd provision  # Updates RBAC
```

### Direct Bicep (advanced)

```powershell
az deployment sub create \
  --location eastus \
  --template-file main.bicep \
  --parameters main.parameters.json \
  --parameters environmentName=myenv
```

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `environmentName` | (required) | Unique identifier (appended to resource names) |
| `location` | (required) | Azure region |
| `webImageName` | `mcr.microsoft.com/k8se/quickstart:latest` | Container image (placeholder during initial provision) |
| `serviceManagementReference` | (empty) | Service Management Reference GUID (required by some orgs for Entra app registration) |
| `entraTenantId` | `tenant().tenantId` | Entra tenant ID (auto-detected or from azd) |
| `aiAgentEndpoint` | (from azd) | AI Agent endpoint URL |
| `aiAgentId` | (from azd) | Agent name |
| `enableObo` | `false` | Enable OBO backend app + FIC + admin consent (backend app in Bicep; FIC + admin consent in postprovision.ps1) |

## Outputs

| Output | Purpose |
|--------|---------|
| `AZURE_CONTAINER_APP_NAME` | Container App name (for deployment scripts) |
| `AZURE_CONTAINER_REGISTRY_NAME` | ACR name (for image push) |
| `AZURE_RESOURCE_GROUP_NAME` | Resource group name |
| `WEB_ENDPOINT` | Application FQDN with https:// |
| `WEB_IDENTITY_PRINCIPAL_ID` | Managed identity principal ID (for RBAC via CLI) |
| `ENTRA_SPA_CLIENT_ID` | Entra app client ID (generated by Bicep) |
| `ENTRA_APP_OBJECT_ID` | Entra app object ID (for postprovision updates) |
| `ENTRA_BACKEND_CLIENT_ID` | Backend app client ID (empty when OBO disabled) |
| `ENTRA_BACKEND_APP_OBJECT_ID` | Backend app object ID (empty when OBO disabled) |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Backend App Insights connection string |
| `APPLICATIONINSIGHTS_FRONTEND_CONNECTION_STRING` | Frontend App Insights connection string (passed as Docker build arg) |

## Resource Configuration

### Container App

- **Compute**: 0.5 vCPU, 1GB RAM (parameterized — override via `cpu` and `memory` params in `core/host/container-app.bicep`)
- **Scaling**: 0-3 replicas (parameterized — override via `minReplicas` and `maxReplicas` params in `core/host/container-app.bicep`)
- **Ingress**: External HTTPS on port 8080
- **Identity**: User-assigned MI only (ACR pull, AI Foundry RBAC, OBO FIC)
- **ACR Pull**: Managed identity with `acrPull` role assignment (no admin credentials)
- **Health Probes**:
  - **Liveness**: `GET /api/health` every 30s (failureThreshold: 3)
  - **Startup**: `GET /api/health` every 10s with 5s initial delay (failureThreshold: 30)

### Container Registry

- **Tier**: Basic (sufficient for single app)
- **Admin**: Disabled
- **Pull Authentication**: User-assigned MI with `AcrPull` role (no admin credentials)
- **Public Access**: Disabled

### Log Analytics

- **Retention**: 30 days (parameterized — override via `retentionInDays` param in `core/host/log-analytics.bicep`)
- **Pricing**: Pay-as-you-go (5GB/month free tier)

### Overriding Resource Defaults

Pass parameters when deploying via Bicep directly, or edit the module defaults:

```bicep
// In container-app.bicep — change defaults
param cpu string = '1.0'        // default: '0.5'
param memory string = '2Gi'     // default: '1Gi'
param minReplicas int = 1       // default: 0
param maxReplicas int = 5       // default: 3
```

## Cost Optimization

- **Scale-to-zero**: Automatically enabled (no cost when idle)
- **Basic ACR**: Lowest tier ($5/month)
- **Shared environment**: Multiple apps can share Container Apps Environment

Estimated monthly cost: **$10-15** (varies by usage).

## Security

- ✅ User-assigned managed identity with regional isolation (zero secrets — no admin credentials, no client secrets)
- ✅ Private container registry (ACR)
- ✅ HTTPS-only ingress
- ✅ Least-privilege RBAC (Cognitive Services User + Cognitive Services OpenAI Contributor + Azure AI Developer)
- ✅ No public IP addresses

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Deployment fails | Check `az deployment sub show -n <deployment-name>` |
| RBAC not working | Verify `WEB_IDENTITY_PRINCIPAL_ID` has role on AI Foundry resource |
| Scale-to-zero not working | Check HTTP/TCP health probes (must succeed) |
| Name conflicts | Change `environmentName` parameter |

## Customization

### Change Scaling Limits

Edit `main-app.bicep`:
```bicep
scale: {
  minReplicas: 1  // Change from 0 to prevent scale-to-zero
  maxReplicas: 10  // Change from 3 for more scale
}
```

### Change Resource Tier

Edit `main-infrastructure.bicep`:
```bicep
sku: {
  name: 'Standard'  // Upgrade from Basic
}
```

### Add Environment Variables

Edit `main-app.bicep`:
```bicep
env: [
  { name: 'CUSTOM_VAR', value: 'custom-value' }
]
```

## Validation

```powershell
# Test Bicep syntax
az bicep build --file main.bicep

# What-if deployment
az deployment sub what-if \
  --location eastus \
  --template-file main.bicep \
  --parameters main.parameters.json
```

For AI-assisted development, see `.github/skills/writing-bicep-templates/SKILL.md`.
