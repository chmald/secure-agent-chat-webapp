# Environment Variables Reference

This document lists the environment variables that change **Bicep provisioning** and **application runtime** behavior. Set azd variables with `azd env set <NAME> <value>` (stored in `.azure/<env>/.env`). Backend runtime variables can also be set in a local `.env` for development.

> **Legend**
> - **Input** — you set it; it changes behavior.
> - **Output** — written back by `azd`/Bicep after provision. Do **not** rely on pre-setting these (they get overwritten).

---

## 1. Reusing an existing AI Foundry resource / agent

Set these to skip auto-discovery and point at an **existing** AI Foundry project and agent. If `AI_AGENT_ENDPOINT` is set, `preprovision.ps1` skips resource discovery entirely.

| Variable | Type | Effect |
|----------|------|--------|
| `AI_AGENT_ENDPOINT` | Input | AI Foundry project endpoint (`https://<resource>.services.ai.azure.com/api/projects/<project>`). Passed to Bicep (`aiAgentEndpoint`) and surfaced to the backend as `AI_AGENT_ENDPOINT`. Required by the backend at runtime. |
| `AI_AGENT_ID` | Input | Agent name (v2 API), e.g. `my-agent`. Passed to Bicep (`aiAgentId`) and required by the backend at runtime. |
| `AI_AGENT_VERSION` | Input | Pins a specific agent version. Unset → newest version resolved at runtime. |
| `AI_FOUNDRY_RESOURCE_NAME` | Input | Disambiguates which AIServices resource to use when multiple exist; used for discovery and cross-RG RBAC. Auto-set by discovery if unset. |
| `AI_FOUNDRY_RESOURCE_GROUP` | Output | RG of the discovered AI Foundry resource. Used for cross-RG RBAC and `azd down` cleanup. |
| `AI_FOUNDRY_LOCATION` | Output | Region of the discovered AI Foundry resource. |

### Portal-emitted aliases

The AI Foundry portal's **"View sample app code"** emits these. `preprovision.ps1` maps them to the `AI_*` variables above (only if the target is not already set). They can live in azd env **or** a root `.env` file.

| Portal variable | Maps to |
|-----------------|---------|
| `AZURE_EXISTING_AIPROJECT_ENDPOINT` | `AI_AGENT_ENDPOINT` |
| `AZURE_EXISTING_AGENT_ID` (format `name:version`) | `AI_AGENT_ID` (+ `AI_AGENT_VERSION` if a version suffix is present) |
| `AZURE_EXISTING_RESOURCE_ID` | `AI_FOUNDRY_RESOURCE_NAME` (extracted from the ARM path) |

---

## 2. Entra ID / authentication & OBO

| Variable | Type | Effect |
|----------|------|--------|
| `ENABLE_OBO` | Input | `true`/`false` (default `false`). Drives Bicep `enableObo`: creates the backend API app registration, the Azure ML Services admin-consent grant, and (via `postprovision.ps1`) the Federated Identity Credential. Switches the backend into On-Behalf-Of mode. |
| `USE_UNIFIED_APP_CLIENT` | Input | `true`/`false` (default `false`). With `ENABLE_OBO=true`, combines the SPA client and the OBO backend into a **single** app registration instead of two. When `true`, `ENTRA_BACKEND_CLIENT_ID` equals `ENTRA_SPA_CLIENT_ID`. No effect when OBO is disabled. |
| `ENTRA_TENANT_ID` | Input | Tenant ID. Auto-detected from `az account` in `preprovision.ps1` if unset. Passed to Bicep (`entraTenantId`) and used by the backend for OBO + JWT validation. |
| `ENTRA_SERVICE_MANAGEMENT_REFERENCE` | Input | GUID required by some orgs (e.g. Microsoft) on Entra app registrations. Set before `azd up`; Bicep passes it to the Microsoft Graph extension. |
| `ENTRA_EXISTING_SPA_CLIENT_ID` | Input | Reuse an **existing** SPA app registration instead of creating one. When set, Bicep skips SPA app creation and wires this client ID through. The `preprovision` hook validates it (warnings only). |
| `ENTRA_EXISTING_BACKEND_CLIENT_ID` | Input | Reuse an **existing** backend (OBO) app registration in two-app mode (`ENABLE_OBO=true`, `USE_UNIFIED_APP_CLIENT=false`). When set, Bicep skips backend app creation. |
| `ENTRA_SPA_CLIENT_ID` | **Output** | Client ID of the SPA app registration **created by Bicep**. Written back to env and injected into the frontend build. Pre-setting does **not** reuse an existing app (see note below). |
| `ENTRA_BACKEND_CLIENT_ID` | **Output** | Client ID of the backend app registration (only when `ENABLE_OBO=true`). Written back to env; its presence + `ENTRA_TENANT_ID` is what activates OBO mode at backend runtime. Pre-setting does **not** reuse an existing app. |
| `ENTRA_APP_OBJECT_ID` / `ENTRA_BACKEND_APP_OBJECT_ID` | Output | Object IDs of the created apps, used by `postprovision.ps1` (redirect URIs, FIC). |

### ⚠️ App registrations: created by default, or reuse an existing one

By default the SPA app in [infra/entra-app.bicep](infra/entra-app.bicep) is created **unconditionally**, and the backend app is gated by `ENABLE_OBO` (skipped when `USE_UNIFIED_APP_CLIENT=true`). `ENTRA_SPA_CLIENT_ID` and `ENTRA_BACKEND_CLIENT_ID` are **Bicep outputs**, so `azd` overwrites any values you pre-set under those names.

To **reuse an existing app registration**, set `ENTRA_EXISTING_SPA_CLIENT_ID` (and, for two-app OBO, `ENTRA_EXISTING_BACKEND_CLIENT_ID`). Bicep then skips creation and passes those IDs through. The `preprovision` hook validates the supplied app(s) and emits **non-blocking warnings** if expected configuration (scope, identifier URI, redirect URIs, OBO permission/FIC) is missing; the `postprovision` hook configures the reused app best-effort and warns instead of failing if it lacks write access.

### OBO app topology (`ENABLE_OBO=true`)

| `USE_UNIFIED_APP_CLIENT` | Result |
|--------------------------|--------|
| `false` (default) | Two app registrations: SPA client + dedicated backend (OBO) app. `ENTRA_BACKEND_CLIENT_ID` ≠ `ENTRA_SPA_CLIENT_ID`. |
| `true` | One app registration serving both roles. The SPA app carries the Azure ML `user_impersonation` permission and the FIC. `ENTRA_BACKEND_CLIENT_ID` = `ENTRA_SPA_CLIENT_ID`. |

---

## 3. Backend runtime auth credential selection

The backend chooses its `TokenCredential` from these (see [backend/WebApp.Api/Services/AgentFrameworkService.cs](backend/WebApp.Api/Services/AgentFrameworkService.cs)):

| Variable | Type | Effect |
|----------|------|--------|
| `ASPNETCORE_ENVIRONMENT` | Input | `Development` uses `ChainedTokenCredential(AzureCliCredential, AzureDeveloperCliCredential)`. Otherwise production credential logic applies. |
| `ENTRA_BACKEND_CLIENT_ID` | Input/Output | Present + `ENTRA_TENANT_ID` set + not Development → **OBO mode** (`OnBehalfOfCredential`). |
| `MANAGED_IDENTITY_CLIENT_ID` | Input/Output | User-assigned MI client ID. Used for **MI-only mode** and as the FIC assertion identity in OBO mode. (`OBO_MANAGED_IDENTITY_CLIENT_ID` is a deprecated alias.) |
| `AzureAd__ClientId` / `AzureAd:ClientId` | Input | Entra app client ID for inbound JWT validation. |
| `AzureAd__TenantId` / `AzureAd:TenantId` | Input | Tenant ID; fallback for `ENTRA_TENANT_ID`. |

MI-only and OBO are mutually exclusive — `ENTRA_BACKEND_CLIENT_ID` is the switch.

---

## 4. Core azd / deployment

| Variable | Type | Effect |
|----------|------|--------|
| `AZURE_ENV_NAME` | Input | azd environment name (set by `azd init`). Used in resource names and hook logging. |
| `AZURE_LOCATION` | Input | Deployment region. `preprovision.ps1` warns on mismatch with the AI Foundry region. |
| `AZURE_SUBSCRIPTION_ID` | Input | Target subscription. Used for cross-RG RBAC and teardown. |
| `SERVICE_WEB_IMAGE_NAME` | Input | Pre-built container image to deploy (Bicep `webImageName`). Defaults to a placeholder image on first provision, then the built image. |
| `CLEAN_DOCKER_IMAGES` | Input | `true` → `postdown.ps1` prunes local Docker images during `azd down`. |

---

## 5. Observability

| Variable | Type | Effect |
|----------|------|--------|
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Output | Backend Azure Monitor OpenTelemetry export. Provisioned by Bicep, surfaced as a Container App env var. |
| `APPLICATIONINSIGHTS_FRONTEND_CONNECTION_STRING` | Output | Frontend browser telemetry; injected at Docker build time as `VITE_APPLICATIONINSIGHTS_CONNECTION_STRING`. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Input | Optional OTLP exporter endpoint (see [backend/WebApp.ServiceDefaults/Extensions.cs](backend/WebApp.ServiceDefaults/Extensions.cs)). |

---

## 6. Frontend build-time (Docker build args → `VITE_*`)

Set on the Docker build; consumed by Vite (see [deployment/docker/frontend.Dockerfile](deployment/docker/frontend.Dockerfile)). `postprovision.ps1` writes the corresponding `VITE_*` values into `frontend/.env.local` for local dev.

| Build arg | Becomes | Effect |
|-----------|---------|--------|
| `ENTRA_SPA_CLIENT_ID` | `VITE_ENTRA_SPA_CLIENT_ID` | SPA MSAL client ID. |
| `ENTRA_TENANT_ID` | `VITE_ENTRA_TENANT_ID` | Tenant for MSAL authority. |
| `ENTRA_BACKEND_CLIENT_ID` | `VITE_ENTRA_BACKEND_CLIENT_ID` | Backend API scope (OBO only). |
| `APPLICATIONINSIGHTS_FRONTEND_CONNECTION_STRING` | `VITE_APPLICATIONINSIGHTS_CONNECTION_STRING` | Browser telemetry. |

---

## Quick recipes

**Reuse an existing AI Foundry agent (no resource creation for AI):**
```powershell
azd env set AI_AGENT_ENDPOINT "https://<resource>.services.ai.azure.com/api/projects/<project>"
azd env set AI_AGENT_ID "<agent-name>"
# optional:
azd env set AI_AGENT_VERSION "<version>"
```

**Enable OBO (creates a backend app registration + FIC):**
```powershell
azd env set ENABLE_OBO true
# optional: combine SPA + backend into one app registration
azd env set USE_UNIFIED_APP_CLIENT true
azd env set ENTRA_SERVICE_MANAGEMENT_REFERENCE "<guid>"   # if required by your org
```

> Reusing an **existing** Entra app registration: set `ENTRA_EXISTING_SPA_CLIENT_ID` (and `ENTRA_EXISTING_BACKEND_CLIENT_ID` for two-app OBO) — see §2.
