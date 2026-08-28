import {
  StandardResponse,
  ClientApp,
  FIDO2Credential,
  ProtectedLink,
  AuditLog,
  DashboardTelemetry as TelemetryDashboard,
} from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

async function request<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<StandardResponse<T>> {
  const url = `${BASE_URL}${endpoint}`;
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });

    const data = await response.json();
    return data;
  } catch (error: any) {
    console.error(`API Error [${endpoint}]:`, error);
    return {
      success: false,
      error: {
        code: 'NETWORK_OR_SERVER_ERROR',
        message: error.message || 'Gagal menghubungi server.',
      },
    };
  }
}

// LocalStorage Persistence Layer for Serverless Cold-Start Resilience
const STORAGE_CUSTOM_KEYS = 'catauth_custom_credentials';
const STORAGE_CUSTOM_LINKS = 'catauth_custom_links';

function getLocalCustomKeys(): FIDO2Credential[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(STORAGE_CUSTOM_KEYS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveLocalCustomKey(cred: FIDO2Credential) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getLocalCustomKeys();
    const filtered = existing.filter((c) => c.credential_id !== cred.credential_id);
    filtered.push(cred);
    localStorage.setItem(STORAGE_CUSTOM_KEYS, JSON.stringify(filtered));
  } catch (err) {
    console.warn('LocalStorage save error:', err);
  }
}

function getLocalCustomLinks(): ProtectedLink[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(STORAGE_CUSTOM_LINKS);
    return data ? JSON.parse(data) : [];
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
      const serverIds = new Set(res.data.map((l) => l.id));
      for (const localLink of localLinks) {
        if (!serverIds.has(localLink.id)) {
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

  getProtectedLink: (id: string) => {
    return request<ProtectedLink>(`/api/v1/links/${id}`);
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

  deleteProtectedLink: async (id: string) => {
    if (typeof window !== 'undefined') {
      try {
        const existing = getLocalCustomLinks();
        const filtered = existing.filter((l) => l.id !== id);
        localStorage.setItem(STORAGE_CUSTOM_LINKS, JSON.stringify(filtered));
      } catch (e) {
        console.warn('LocalStorage error:', e);
      }
    }
    return request(`/api/v1/links/${id}`, {
      method: 'DELETE',
    });
  },

  // Direct Auth & WebAuthn / Web NFC Assertion
  getAuthChallenge: (clientId: string, linkId?: string) => {
    const params = new URLSearchParams({ client_id: clientId });
    if (linkId) params.set('link_id', linkId);
    return request(`/api/v1/auth/challenge?${params.toString()}`);
  },

  submitAssertion: (payload: {
    client_id: string;
    credential_id: string;
    challenge: string;
    authenticator_data: string;
    client_data_json: string;
    signature: string;
    link_id?: string;
    user_handle?: string;
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

  // Hardware Credentials Vault (with LocalStorage Rehydration & User Profile)
  listCredentials: async () => {
    const res = await request<FIDO2Credential[]>('/api/v1/credentials/tokens');
    const localKeys = getLocalCustomKeys();

    if (res.success && res.data) {
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
    user_name?: string;
    user_email?: string;
    user_role?: string;
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

  updateCredentialProfile: async (payload: {
    credential_id: string;
    user_id?: string;
    user_name?: string;
    user_email?: string;
    user_role?: string;
    label?: string;
  }) => {
    const res = await request<FIDO2Credential>('/api/v1/credentials/tokens', {
      method: 'PUT',
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
};
