export interface StandardResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface ClientApp {
  id: string;
  client_id: string;
  client_secret_raw?: string;
  app_name: string;
  app_logo_url?: string;
  redirect_uris: string[];
  allowed_origins: string[];
  webhook_logout_url?: string;
  is_active: boolean;
  created_at?: string;
}

export interface FIDO2Credential {
  id: string;
  user_id: string;
  credential_id: string;
  label: string;
  sign_count: number;
  aaguid?: string;
  transports: string[];
  is_active: boolean;
  revoked_at?: string;
  revocation_reason?: string;
  last_used_at?: string;
  created_at?: string;
}

export interface SecurityPolicy {
  id: string;
  session_ttl_sec: number;
  challenge_ttl_sec: number;
  require_pin_mfa: boolean;
  geofence_enabled: boolean;
  allowed_countries: string[];
  brute_force_threshold: number;
  dlq_lag_threshold: number;
  updated_at?: string;
}

export interface AuditLog {
  id: string;
  event_type: string;
  status: string;
  user_id?: string;
  client_id?: string;
  ip_address?: string;
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  browser?: string;
  os_name?: string;
  created_at: string;
}

export interface DLQWebhook {
  id: string;
  outbox_event_id?: string;
  client_id: string;
  target_url: string;
  payload: any;
  retry_count: number;
  last_error?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface CircuitBreakerStatus {
  name: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failure_count: number;
  fail_max: number;
  reset_timeout_seconds: number;
  time_in_current_state_seconds: number;
  is_available: boolean;
}

export interface DashboardTelemetry {
  total_authentications: number;
  success_authentications: number;
  failed_authentications: number;
  success_rate: number;
  active_sessions: number;
  dlq_pending_count: number;
  countries: { country: string; count: number }[];
  recent_logs: AuditLog[];
  timestamp: string;
}

export type NodeType =
  | 'TRIGGER'
  | 'SCREEN'
  | 'CONDITION'
  | 'AUTH'
  | 'API'
  | 'CACHE'
  | 'DATABASE'
  | 'QUEUE'
  | 'NOTIFICATION'
  | 'EXTERNAL'
  | 'STORAGE'
  | 'COMMENT'
  | 'LOGIC-MULTI';


export interface WorkflowNode {
  id: string;
  nodeNumber: number;
  type: NodeType;
  title: string;
  purpose: string;
  contract: string;
  branchTargets?: string[];
  incoming: string[];
  outgoing: string[];
}
