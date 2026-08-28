from typing import Generic, TypeVar, Optional, Any, Dict, List
from pydantic import BaseModel, Field, ConfigDict

T = TypeVar("T")


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


class StandardResponse(BaseModel, Generic[T]):
    success: bool = True
    data: Optional[T] = None
    message: Optional[str] = None


class StandardErrorResponse(BaseModel):
    success: bool = False
    error: ErrorDetail


# --- Auth & WebAuthn Schemas ---

class ValidateClientRequest(BaseModel):
    client_id: str
    redirect_uri: str
    state: Optional[str] = None
    nonce: Optional[str] = None


class ValidateClientResponse(BaseModel):
    client_id: str
    app_name: str
    app_logo_url: Optional[str] = None
    redirect_uri: str
    state: Optional[str] = None
    nonce: Optional[str] = None
    rp_id: str
    is_valid: bool


class ChallengeRequest(BaseModel):
    client_id: str
    user_identifier: Optional[str] = None  # username or email if known


class ChallengeResponse(BaseModel):
    challenge: str
    rp_id: str
    rp_name: str
    timeout_ms: int = 60000
    allow_credentials: List[Dict[str, Any]] = []


class AssertionSubmitRequest(BaseModel):
    client_id: str
    redirect_uri: str
    challenge: str
    credential_id: str
    client_data_json: str
    authenticator_data: str
    signature: str
    state: Optional[str] = None
    nonce: Optional[str] = None


class AssertionResultResponse(BaseModel):
    status: str # 'SUCCESS', 'NEED_PIN_MFA', 'GEOFENCE_REJECTED', 'BLOCKED', 'INVALID'
    user_id: Optional[str] = None
    username: Optional[str] = None
    display_name: Optional[str] = None
    requires_pin: bool = False
    temp_auth_session: Optional[str] = None
    auth_code: Optional[str] = None
    redirect_url: Optional[str] = None
    error_message: Optional[str] = None


class VerifyPinRequest(BaseModel):
    temp_auth_session: str
    pin: str
    client_id: str
    redirect_uri: str
    state: Optional[str] = None
    nonce: Optional[str] = None


class TokenExchangeRequest(BaseModel):
    grant_type: str = "authorization_code"
    code: str
    client_id: str
    client_secret: Optional[str] = None
    redirect_uri: str
    code_verifier: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    id_token: Optional[str] = None
    scope: str = "openid profile email"


class IntrospectRequest(BaseModel):
    token: str
    token_type_hint: Optional[str] = "access_token"


class IntrospectResponse(BaseModel):
    active: bool
    scope: Optional[str] = None
    client_id: Optional[str] = None
    sub: Optional[str] = None
    exp: Optional[int] = None
    iat: Optional[int] = None
    source: Optional[str] = None # 'redis_cache' vs 'database_fallback'


# --- Admin & Management Schemas ---

class AdminLoginRequest(BaseModel):
    email: str
    password: str


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    admin_user: Dict[str, Any]


class ClientCreateRequest(BaseModel):
    app_name: str
    app_logo_url: Optional[str] = None
    redirect_uris: List[str]
    allowed_origins: List[str]
    webhook_logout_url: Optional[str] = None


class ClientUpdateRequest(BaseModel):
    app_name: Optional[str] = None
    app_logo_url: Optional[str] = None
    redirect_uris: Optional[List[str]] = None
    allowed_origins: Optional[List[str]] = None
    webhook_logout_url: Optional[str] = None
    is_active: Optional[bool] = None


class FIDO2CredentialEnrollRequest(BaseModel):
    user_id: str
    credential_id: str
    public_key_cose: str
    sign_count: int = 0
    label: str = "YubiKey / FIDO2 NFC Card"
    aaguid: Optional[str] = None
    transports: List[str] = ["nfc", "usb", "internal"]


class SecurityPolicyUpdateRequest(BaseModel):
    session_ttl_sec: Optional[int] = None
    challenge_ttl_sec: Optional[int] = None
    require_pin_mfa: Optional[bool] = None
    geofence_enabled: Optional[bool] = None
    allowed_countries: Optional[List[str]] = None
    brute_force_threshold: Optional[int] = None
    dlq_lag_threshold: Optional[int] = None


class RevokeSessionRequest(BaseModel):
    session_id: Optional[str] = None
    token_hash: Optional[str] = None
    user_id: Optional[str] = None
    credential_id: Optional[str] = None
    reason: str = "Admin manual revocation"


class DLQReplayRequest(BaseModel):
    dlq_id: Optional[str] = None # If None, replay all pending DLQ items
