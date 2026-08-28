import {
  APIResponse,
  TelemetryDashboard,
  AuditLog,
  ClientApp,
  FIDO2Credential,
  ProtectedLink,
} from './types';

// Standalone Next.js 14 API Route Handlers
const API_BASE_URL = '';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<APIResponse<T>> {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const res = await fetch(url, {
      ...options,
      headers,
    });

    const data = await res.json();
    return data;
  } catch (err: any) {
    console.error(`API Request Error [${endpoint}]:`, err);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: err.message || 'Gagal terhubung ke gateway API.',
      },
    };
  }
}

// Local storage keys for persistent offline/cold-start resilience
const STORAGE_CUSTOM_KEYS = 'catauth_custom_keys_v1';
const STORAGE_CUSTOM_LINKS = 'catauth_custom_links_v1';

function getLocalCustomKeys(): FIDO2Credential[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_KEYS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalCustomKey(key: FIDO2Credential) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getLocalCustomKeys();
    const filtered = existing.filter((k) => k.credential_id !== key.credential_id);
    filtered.push(key);
    localStorage.setItem(STORAGE_CUSTOM_KEYS, JSON.stringify(filtered));
  } catch (err) {
    console.warn('LocalStorage save error:', err);
  }
}

function getLocalCustomLinks(): ProtectedLink[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_LINKS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalCustomLink(link: ProtectedLink) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getLocalCustomLinks();
    const filtered = existing.filter((l) => l.id !== link.id);
    filtered.push(link);
    localStorage.setItem(STORAGE_CUSTOM_LINKS, JSON.stringify(filtered));
  } catch (err) {
    console.warn('LocalStorage save error:', err);
  }
}

export const api = {
  // Telemetry
  getDashboardTelemetry: (linkId?: string) => {
    const q = linkId ? `?link_id=${linkId}` : '';
    return request<TelemetryDashboard>(`/api/v1/telemetry/dashboard${q}`);
  },

  getAuditLogs: (limit = 10, linkId?: string) => {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (linkId) params.set('link_id', linkId);
    return request<AuditLog[]>(`/api/v1/telemetry/audit-logs?${params.toString()}`);
  },

  // Protected Links Hub (CRUD with LocalStorage Rehydration)
  listProtectedLinks: async () => {
    const res = await request<ProtectedLink[]>('/api/v1/links');
    const localLinks = getLocalCustomLinks();

    if (res.success && res.data) {
      // If server cold-started, rehydrate missing local links to server
      const serverIds = new Set(res.data.map((l) => l.id));
      for (const localLink of localLinks) {
        if (!serverIds.has(localLink.id)) {
          // Re-post to server store
          api.createProtectedLink(localLink);
          res.data.push(localLink);
        }
      }
    }
    return res;
  },

  createProtectedLink: async (payload: {
    id?: string;
    title: string;
    description?: string;
    target_redirect_url: string;
    allowed_card_ids: string[];
    require_pin?: boolean;
    geofence_enabled?: boolean;
  }) => {
    const res = await request<ProtectedLink>('/api/v1/links', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.success && res.data) {
      saveLocalCustomLink(res.data);
    }
    return res;
  },

  updateProtectedLink: async (id: string, payload: Partial<ProtectedLink>) => {
    const res = await request<ProtectedLink>(`/api/v1/links/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (res.success && res.data) {
      saveLocalCustomLink(res.data);
    }
    return res;
  },

  deleteProtectedLink: (id: string) => {
    if (typeof window !== 'undefined') {
      try {
        const local = getLocalCustomLinks().filter((l) => l.id !== id);
        localStorage.setItem(STORAGE_CUSTOM_LINKS, JSON.stringify(local));
      } catch {}
    }
    return request<void>(`/api/v1/links/${id}`, {
      method: 'DELETE',
    });
  },

  // SSO & WebAuthn
  validateClient: (clientIdOrLinkId: string, redirectUri?: string, state?: string, nonce?: string, linkId?: string) => {
    const params = new URLSearchParams();
    if (linkId) {
      params.set('link_id', linkId);
    } else if (clientIdOrLinkId.startsWith('lnk_') || !clientIdOrLinkId.startsWith('client_')) {
      params.set('link_id', clientIdOrLinkId);
    } else {
      params.set('client_id', clientIdOrLinkId);
    }
    if (redirectUri) params.set('redirect_uri', redirectUri);
    if (state) params.set('state', state);
    if (nonce) params.set('nonce', nonce);

    return request(`/api/v1/auth/validate-client?${params.toString()}`);
  },

  getChallenge: (clientId: string, userIdentifier?: string) => {
    return request('/api/v1/auth/challenge', {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, user_identifier: userIdentifier }),
    });
  },

  submitAssertion: (payload: {
    client_id?: string;
    link_id?: string;
    redirect_uri?: string;
    challenge: string;
    credential_id: string;
    client_data_json: string;
    authenticator_data: string;
    signature: string;
    state?: string;
    nonce?: string;
  }) => {
    return request('/api/v1/auth/assertion', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  verifyPin: (payload: {
    temp_auth_session: string;
    pin: string;
    client_id: string;
    redirect_uri: string;
    state?: string;
    link_id?: string;
  }) => {
    return request('/api/v1/auth/verify-pin', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  exchangeToken: (payload: {
    code: string;
    client_id: string;
    client_secret?: string;
    redirect_uri?: string;
    code_verifier?: string;
  }) => {
    return request('/api/v1/oauth/token', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  introspectToken: (token: string) => {
    return request('/api/v1/oauth/introspect', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },

  // Admin & Clients Management
  listClients: () => {
    return request<ClientApp[]>('/api/v1/clients');
  },

  registerClient: (payload: { app_name: string; redirect_uris: string[]; origin: string }) => {
    return request<ClientApp>('/api/v1/clients', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Hardware Credentials Vault (with LocalStorage Rehydration)
  listCredentials: async () => {
    const res = await request<FIDO2Credential[]>('/api/v1/credentials/tokens');
    const localKeys = getLocalCustomKeys();

    if (res.success && res.data) {
      // Rehydrate local custom cards to server if cold-started
      const serverCredIds = new Set(res.data.map((c) => c.credential_id));
      for (const localKey of localKeys) {
        if (!serverCredIds.has(localKey.credential_id)) {
          api.registerCredential(localKey);
          res.data.push(localKey);
        }
      }
    }
    return res;
  },

  registerCredential: async (payload: {
    user_id: string;
    credential_id: string;
    label: string;
    aaguid?: string;
    transports?: string[];
    sign_count?: number;
  }) => {
    const res = await request<FIDO2Credential>('/api/v1/credentials/tokens', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.success && res.data) {
      saveLocalCustomKey(res.data);
    }
    return res;
  },

  toggleCredentialStatus: (credentialId: string, isActive: boolean, reason?: string) => {
    return request(`/api/v1/admin/credentials/${credentialId}/status?is_active=${isActive}&reason=${encodeURIComponent(reason || '')}`, {
      method: 'PATCH',
    });
  },

  getPolicies: () => {
    return request('/api/v1/admin/policies');
  },

  updatePolicies: (payload: any) => {
    return request('/api/v1/admin/policies', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  revokeSession: (payload: { session_id?: string; token_hash?: string; user_id?: string; reason?: string }) => {
    return request('/api/v1/admin/sessions/revoke', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  listDLQ: (statusFilter?: string) => {
    const q = statusFilter ? `?status_filter=${statusFilter}` : '';
    return request(`/api/v1/admin/dlq${q}`);
  },

  replayDLQ: (dlqId?: string) => {
    return request('/api/v1/admin/dlq/replay', {
      method: 'POST',
      body: JSON.stringify({ dlq_id: dlqId }),
    });
  },

  listCircuitBreakers: () => {
    return request('/api/v1/admin/circuit-breakers');
  },

  overrideCircuitBreaker: (clientId: string, newState: 'CLOSED' | 'OPEN' | 'HALF_OPEN') => {
    return request('/api/v1/admin/circuit-breakers', {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, state: newState }),
    });
  },
};
