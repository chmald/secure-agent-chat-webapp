extension microsoftGraphV1

@description('Name suffix for the Entra app (e.g., environment name)')
param environmentName string

@description('Service Management Reference GUID (required by some orgs)')
param serviceManagementReference string = ''

@description('Enable OBO backend API app registration for user-delegated access to Agent Service')
param enableObo bool = false

@description('When true (with enableObo), the SPA and backend (OBO) share ONE app registration instead of two. Set via USE_UNIFIED_APP_CLIENT.')
param useUnifiedAppClient bool = false

@description('Reuse an EXISTING SPA app registration (client ID) instead of creating one. Set via ENTRA_EXISTING_SPA_CLIENT_ID.')
param existingSpaClientId string = ''

@description('Reuse an EXISTING backend (OBO) app registration (client ID) instead of creating one, in two-app mode. Set via ENTRA_EXISTING_BACKEND_CLIENT_ID.')
param existingBackendClientId string = ''

// ============================================================================
// Well-known first-party app IDs and scope IDs (stable across all Entra tenants)
// ============================================================================

// Azure Machine Learning Services — the resource behind https://ai.azure.com/.default
// This is what AIProjectClient.AuthorizationScopes requests (verified via SDK reflection).
// ⚠️ NOT the same as "Microsoft Cognitive Services" (7d312290-...) — a common mistake.
var azureMachineLearningAppId = '18a66f5f-dbdf-4c17-9dd7-1634712a9cbe'
var azureMachineLearningUserImpersonationScopeId = '1a7925b5-f871-417a-9b8b-303f9f29fa10'

// Deterministic scope ID — stable across redeployments
var chatReadWriteScopeId = guid(resourceGroup().id, environmentName, 'Chat.ReadWrite')

// ============================================================================
// App Registration
// Created unless an existing SPA client ID is supplied (ENTRA_EXISTING_SPA_CLIENT_ID).
// In unified mode (enableObo && useUnifiedAppClient) this single app ALSO serves
// as the OBO middle-tier: it carries the Azure ML user_impersonation permission
// and (via postprovision) a Federated Identity Credential. Otherwise OBO uses a
// separate backend app registration declared below.
// ============================================================================

// Reuse an existing app registration instead of creating one when a client ID is provided
var createSpaApp = empty(existingSpaClientId)

resource app 'Microsoft.Graph/applications@v1.0' = if (createSpaApp) {
  uniqueName: 'ai-foundry-agent-${environmentName}'
  displayName: 'ai-foundry-agent-${environmentName}'
  signInAudience: 'AzureADMyOrg'
  serviceManagementReference: empty(serviceManagementReference) ? null : serviceManagementReference
  spa: {
    redirectUris: [
      'http://localhost:5173'
      'http://localhost:8080'
    ]
  }
  api: {
    // In separate mode the backend app lists this SPA as a known client; the SPA
    // itself needs none. In unified mode client and resource are the same app.
    knownClientApplications: []
    oauth2PermissionScopes: [
      {
        adminConsentDescription: 'Allows the app to read and write chat messages'
        adminConsentDisplayName: 'Read and write chat messages'
        id: chatReadWriteScopeId
        isEnabled: true
        type: 'User'
        userConsentDescription: 'Allows the app to read and write your chat messages'
        userConsentDisplayName: 'Read and write your chat messages'
        value: 'Chat.ReadWrite'
      }
    ]
  }
  // Unified OBO only: request delegated user_impersonation on Azure ML Services
  // (ai.azure.com). Empty otherwise, so MI-only and two-app OBO are unaffected.
  requiredResourceAccess: (enableObo && useUnifiedAppClient) ? [
    {
      resourceAppId: azureMachineLearningAppId
      resourceAccess: [
        {
          id: azureMachineLearningUserImpersonationScopeId
          type: 'Scope' // Delegated permission
        }
      ]
    }
  ] : []
}

resource sp 'Microsoft.Graph/servicePrincipals@v1.0' = if (createSpaApp) {
  appId: app.appId
}

// ============================================================================
// Backend API App Registration for OBO (two-app mode only)
// Created when OBO is enabled and useUnifiedAppClient is false.
// ============================================================================

var useSeparateBackend = enableObo && !useUnifiedAppClient
// Reuse an existing backend app registration when its client ID is provided
var createBackendApp = useSeparateBackend && empty(existingBackendClientId)
var backendChatScopeId = guid(resourceGroup().id, environmentName, 'Backend.Chat.ReadWrite')

resource backendApp 'Microsoft.Graph/applications@v1.0' = if (createBackendApp) {
  uniqueName: 'ai-foundry-agent-backend-${environmentName}'
  displayName: 'ai-foundry-agent-backend-${environmentName}'
  signInAudience: 'AzureADMyOrg'
  serviceManagementReference: empty(serviceManagementReference) ? null : serviceManagementReference
  web: {
    redirectUris: []
  }
  api: {
    // SPA is a known client — enables combined consent (user consents to SPA + backend in one prompt)
    knownClientApplications: [createSpaApp ? app.appId : existingSpaClientId]
    oauth2PermissionScopes: [
      {
        adminConsentDescription: 'Allows the backend to access AI Agent Service on behalf of the user'
        adminConsentDisplayName: 'Access AI Agent Service on behalf of user'
        id: backendChatScopeId
        isEnabled: true
        type: 'User'
        userConsentDescription: 'Allows the app to access AI services on your behalf'
        userConsentDisplayName: 'Access AI services on your behalf'
        value: 'Chat.ReadWrite'
      }
    ]
  }
  // requiredResourceAccess for Azure ML Services / user_impersonation
  requiredResourceAccess: [
    {
      resourceAppId: azureMachineLearningAppId
      resourceAccess: [
        {
          id: azureMachineLearningUserImpersonationScopeId
          type: 'Scope' // Delegated permission
        }
      ]
    }
  ]

  // NOTE: FIC (federatedIdentityCredentials) is NOT declared here.
  // Graph API eventual consistency causes the FIC child resource to fail
  // when the parent app hasn't replicated yet. FIC is created in postprovision.ps1
  // which runs after Bicep completes and Graph has had time to replicate.
}

resource backendSp 'Microsoft.Graph/servicePrincipals@v1.0' = if (createBackendApp) {
  appId: createBackendApp ? backendApp.appId : 'placeholder'
}

// ============================================================================
// Admin Consent — grant delegated access to Azure ML Services (ai.azure.com)
// for the OBO token exchange. The grant targets whichever app does OBO.
// ============================================================================

// Look up the Azure Machine Learning Services service principal in the tenant
resource azureMachineLearningServiceSp 'Microsoft.Graph/servicePrincipals@v1.0' existing = if (enableObo) {
  appId: azureMachineLearningAppId
}

// Unified mode: grant the single app's SP consent to Azure ML user_impersonation.
// Skipped when reusing an existing app (postprovision grants consent best-effort).
resource oboAdminConsentUnified 'Microsoft.Graph/oauth2PermissionGrants@v1.0' = if (enableObo && useUnifiedAppClient && createSpaApp) {
  clientId: sp.id
  consentType: 'AllPrincipals'
  resourceId: azureMachineLearningServiceSp.id
  scope: 'user_impersonation'
}

// Two-app mode: grant the backend app's SP consent to Azure ML user_impersonation.
// Skipped when reusing an existing backend app.
resource oboAdminConsentSeparate 'Microsoft.Graph/oauth2PermissionGrants@v1.0' = if (createBackendApp) {
  clientId: backendSp.id
  consentType: 'AllPrincipals'
  resourceId: azureMachineLearningServiceSp.id
  scope: 'user_impersonation'
}

// Outputs resolve to the created resource, or to the supplied existing client ID
// when reusing. Object-id outputs are empty for reused apps (hooks resolve via az).
output clientAppId string = createSpaApp ? app.appId : existingSpaClientId
output appObjectId string = createSpaApp ? app.id : ''
output backendClientAppId string = !enableObo ? '' : (useUnifiedAppClient ? (createSpaApp ? app.appId : existingSpaClientId) : (createBackendApp ? backendApp.appId : existingBackendClientId))
output backendAppObjectId string = !enableObo ? '' : (useUnifiedAppClient ? (createSpaApp ? app.id : '') : (createBackendApp ? backendApp.id : ''))
