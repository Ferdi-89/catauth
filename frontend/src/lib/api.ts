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
  // SSO & WebAuthn
  validateClient: (clientId: string, redirectUri: string, state?: string, nonce?: string) => {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      ...(state ? { state } : {}),
      ...(nonce ? { nonce } : {}),
    });
    return request(`/api/v1/auth/validate-client?${params.toString()}`);
  },

  getChallenge: (clientId: string, userIdentifier?: string) => {
    return request('/api/v1/auth/challenge', {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, user_identifier: userIdentifier }),
    });
  },

  submitAssertion: (payload: {
    client_id: string;
    redirect_uri: string;
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
    nonce?: string;
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
    redirect_uri: string;
    code_verifier?: string;
  }) => {
    return request('/oauth/token', {
      method: 'POST',
      body: JSON.stringify({
        grant_type: 'authorization_code',
        ...payload,
      }),
    });
  },

  introspectToken: (token: string) => {
    return request('/oauth/introspect', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },

  // Admin & Telemetry
  getDashboardTelemetry: () => {
    return request('/api/v1/telemetry/dashboard');
  },

  listClients: () => {
    return request('/api/v1/admin/clients');
  },

  createClient: (payload: {
    app_name: string;
    redirect_uris: string[];
    allowed_origins: string[];
    webhook_logout_url?: string;
  }) => {
    return request('/api/v1/admin/clients', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  listCredentials: () => {
    return request('/api/v1/admin/credentials');
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
    return request('/api/v1/admin/revoke', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  listDLQ: (statusFilter?: string) => {
    const q = statusFilter ? `?status_filter=${statusFilter}` : '';
    return request(`/api/v1/dlq/list${q}`);
  },

  replayDLQ: (dlqId?: string) => {
    return request('/api/v1/dlq/replay', {
      method: 'POST',
      body: JSON.stringify({ dlq_id: dlqId }),
    });
  },

  listCircuitBreakers: () => {
    return request('/api/v1/dlq/circuit-breakers');
  },

  overrideCircuitBreaker: (clientId: string, newState: 'CLOSED' | 'OPEN' | 'HALF_OPEN') => {
    return request(`/api/v1/dlq/circuit-breakers/override?client_id=${clientId}&new_state=${newState}`, {
      method: 'POST',
    });
  },
};
