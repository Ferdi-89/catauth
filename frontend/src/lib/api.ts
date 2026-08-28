import { StandardResponse } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';


async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<StandardResponse<T>> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: data.error || {
          code: `HTTP_${res.status}`,
          message: data.message || res.statusText || 'Request failed',
          details: data,
        },
      };
    }

    return data;
  } catch (err: any) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: err.message || 'Failed to connect to Catauth API backend.',
      },
    };
  }
}

export const api = {
  // Protected Links Hub
  listProtectedLinks: () => {
    return request<ProtectedLink[]>('/api/v1/links');
  },

  getProtectedLink: (id: string) => {
    return request<ProtectedLink>(`/api/v1/links/${id}`);
  },

  createProtectedLink: (payload: {
    title: string;
    slug?: string;
    target_redirect_url: string;
    allowed_card_ids: string[];
    require_pin?: boolean;
    geofence_enabled?: boolean;
    allowed_countries?: string[];
  }) => {
    return request<ProtectedLink>('/api/v1/links', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateProtectedLink: (id: string, payload: Partial<ProtectedLink>) => {
    return request<ProtectedLink>(`/api/v1/links/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteProtectedLink: (id: string) => {
    return request(`/api/v1/links/${id}`, {
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

  // Telemetry & Audit Logs
  getDashboardTelemetry: (linkId?: string) => {
    const q = linkId && linkId !== 'all' ? `?link_id=${linkId}` : '';
    return request<DashboardTelemetry>(`/api/v1/telemetry/dashboard${q}`);
  },

  getAuditLogs: (limit = 20, linkId?: string) => {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (linkId && linkId !== 'all') params.set('link_id', linkId);
    return request<AuditLog[]>(`/api/v1/telemetry/audit-logs?${params.toString()}`);
  },

  // Clients & Credentials Management
  listClients: () => {
    return request<ClientApp[]>('/api/v1/clients');
  },

  createClient: (payload: {
    app_name: string;
    redirect_uris: string[];
    allowed_origins: string[];
    webhook_logout_url?: string;
  }) => {
    return request<ClientApp>('/api/v1/clients', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  listCredentials: () => {
    return request<FIDO2Credential[]>('/api/v1/credentials/tokens');
  },

  registerCredential: (payload: {
    user_id: string;
    credential_id: string;
    label: string;
    aaguid?: string;
    transports?: string[];
  }) => {
    return request<FIDO2Credential>('/api/v1/credentials/tokens', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
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
