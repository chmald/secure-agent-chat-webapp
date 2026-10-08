import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('authConfig', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses SPA client ID for scopes when backend client ID not set', async () => {
    vi.stubEnv('VITE_ENTRA_SPA_CLIENT_ID', 'spa-client-id');
    vi.stubEnv('VITE_ENTRA_TENANT_ID', 'tenant-id');
    vi.stubEnv('VITE_ENTRA_BACKEND_CLIENT_ID', '');
    const { loginRequest } = await import('../../config/authConfig');
    expect(loginRequest.scopes[0]).toBe('api://spa-client-id/Chat.ReadWrite');
  });

  it('uses backend client ID for scopes when set', async () => {
    vi.stubEnv('VITE_ENTRA_SPA_CLIENT_ID', 'spa-client-id');
    vi.stubEnv('VITE_ENTRA_TENANT_ID', 'tenant-id');
    vi.stubEnv('VITE_ENTRA_BACKEND_CLIENT_ID', 'backend-client-id');
    const { loginRequest } = await import('../../config/authConfig');
    expect(loginRequest.scopes[0]).toBe('api://backend-client-id/Chat.ReadWrite');
  });
});
