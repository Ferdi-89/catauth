import datetime
import uuid
from typing import Optional, List
from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, ForeignKey, 
    Text, Float, JSON, Index, BigInteger
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

def generate_uuid() -> str:
    return str(uuid.uuid4())

def utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


class Tenant(Base):
    """
    Multi-tenant isolation root entity.
    Scoped by SET LOCAL app.current_tenant_id (Node 17 / node-62).
    """
    __tablename__ = "tenants"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # Relationships
    clients = relationship("ClientApp", back_populates="tenant", cascade="all, delete-orphan")
    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    credentials = relationship("FIDO2Credential", back_populates="tenant", cascade="all, delete-orphan")
    policies = relationship("SecurityPolicy", back_populates="tenant", uselist=False, cascade="all, delete-orphan")


class ClientApp(Base):
    """
    Registered SSO Client Website / Relying Party (Node 51 / node-43).
    Whitelisted client_id, allowed redirect_uris, and webhook endpoint for Back-Channel Logout.
    """
    __tablename__ = "client_apps"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(64), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(String(128), unique=True, nullable=False, index=True)
    client_secret_hash = Column(String(255), nullable=False)
    app_name = Column(String(255), nullable=False)
    app_logo_url = Column(String(512), nullable=True)
    redirect_uris = Column(JSON, nullable=False, default=list)  # List[str]
    allowed_origins = Column(JSON, nullable=False, default=list) # List[str]
    webhook_logout_url = Column(String(512), nullable=True)     # Node 65: Back-channel logout URL
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="clients")
    auth_codes = relationship("AuthCode", back_populates="client", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="client")


class User(Base):
    """
    User identity record.
    """
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(64), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    username = Column(String(128), nullable=False)
    email = Column(String(255), nullable=False, index=True)
    display_name = Column(String(255), nullable=False)
    pin_hash = Column(String(255), nullable=True) # Argon2id hash for secondary MFA (Node 27)
    role = Column(String(32), default="user", nullable=False) # 'admin', 'user', 'auditor'
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="users")
    credentials = relationship("FIDO2Credential", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="user")


class FIDO2Credential(Base):
    """
    Hardware Token WebAuthn/FIDO2 NFC Credential Registry (Node 18, 19, 21, 53, 54).
    Enforces sign_count anti-cloning check and active status.
    """
    __tablename__ = "fido2_credentials"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(64), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    credential_id = Column(String(255), unique=True, nullable=False, index=True) # Base64URL credential ID
    public_key_cose = Column(Text, nullable=False) # COSE / PEM encoded public key
    sign_count = Column(BigInteger, default=0, nullable=False) # Counter anti-cloning tracking (Node 21)
    aaguid = Column(String(64), nullable=True)
    label = Column(String(128), default="YubiKey / FIDO2 NFC Card", nullable=False)
    transports = Column(JSON, default=lambda: ["nfc", "usb", "internal"], nullable=False)
    is_active = Column(Boolean, default=True, nullable=False) # Node 19: Active vs Revoked
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    revocation_reason = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="credentials")
    user = relationship("User", back_populates="credentials")


class AuthCode(Base):
    """
    Single-Use Authorization Code (Node 29 / node-25 & Node 37 / node-33).
    Atomically consumed with `UPDATE auth_codes SET used=true WHERE code=:code AND used=false`.
    """
    __tablename__ = "auth_codes"

    code = Column(String(128), primary_key=True)
    tenant_id = Column(String(64), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(String(128), ForeignKey("client_apps.client_id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    credential_id = Column(String(255), nullable=True)
    redirect_uri = Column(String(512), nullable=False)
    state = Column(String(255), nullable=True)
    nonce = Column(String(255), nullable=True)
    code_challenge = Column(String(255), nullable=True)
    code_challenge_method = Column(String(32), default="S256", nullable=True)
    used = Column(Boolean, default=False, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    client = relationship("ClientApp", back_populates="auth_codes")


class Session(Base):
    """
    Active User Session (Node 38, 39, 42, 44).
    Syncs with Redis key-value cache and subject to immediate revocation & outbox purge.
    """
    __tablename__ = "sessions"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(64), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(String(128), ForeignKey("client_apps.client_id", ondelete="CASCADE"), nullable=False, index=True)
    credential_id = Column(String(255), nullable=True)
    token_hash = Column(String(255), unique=True, nullable=False, index=True)
    is_revoked = Column(Boolean, default=False, nullable=False, index=True)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)
    country = Column(String(64), nullable=True)
    city = Column(String(64), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", back_populates="sessions")
    client = relationship("ClientApp", back_populates="sessions")


class AuditLog(Base):
    """
    Security Audit & Telemetry Log (Node 28 / node-24 & Node 66 / node-56).
    Captures user, credential, IP, Geo, Browser, and outcome.
    """
    __tablename__ = "audit_logs"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(64), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    credential_id = Column(String(255), nullable=True, index=True)
    client_id = Column(String(128), nullable=True, index=True)
    event_type = Column(String(64), nullable=False, index=True) # 'login_success', 'login_failed', 'session_revoked', 'cloned_detected', etc.
    ip_address = Column(String(64), nullable=True)
    country = Column(String(64), nullable=True)
    city = Column(String(64), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    browser = Column(String(128), nullable=True)
    os_name = Column(String(128), nullable=True)
    status = Column(String(32), nullable=False) # 'SUCCESS', 'FAILED', 'BLOCKED', 'ANOMALY'
    details_json = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    # Relationships
    user = relationship("User", back_populates="audit_logs")


class SecurityPolicy(Base):
    """
    Dynamic Tenant Security Policies & TTL (Node 57 / node-49 & Node 58 / node-50).
    """
    __tablename__ = "security_policies"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(64), ForeignKey("tenants.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    session_ttl_sec = Column(Integer, default=3600, nullable=False)
    challenge_ttl_sec = Column(Integer, default=60, nullable=False)
    require_pin_mfa = Column(Boolean, default=False, nullable=False) # Node 25: MFA rule
    geofence_enabled = Column(Boolean, default=False, nullable=False) # Node 23: Geofence rule
    allowed_countries = Column(JSON, default=lambda: ["ID", "SG", "US", "JP", "MY", "GB", "DE"], nullable=False)
    brute_force_threshold = Column(Integer, default=5, nullable=False)
    dlq_lag_threshold = Column(Integer, default=5, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="policies")


class TransactionalOutbox(Base):
    """
    Transactional Outbox for Zero-Polling Postgres WAL CDC to Redis Streams (Node 61 / node-53 & Node 62 / node-70).
    Written atomically inside Unit-of-Work BEGIN...COMMIT transaction.
    """
    __tablename__ = "transactional_outbox"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(64), nullable=False, index=True)
    event_type = Column(String(64), nullable=False, index=True) # 'session.revoked', 'credential.blocked', 'client.updated'
    aggregate_type = Column(String(64), nullable=False) # 'Session', 'FIDO2Credential'
    aggregate_id = Column(String(128), nullable=False, index=True)
    payload = Column(JSON, nullable=False)
    processed = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


class DLQWebhook(Base):
    """
    Dead-Letter Queue (DLQ) repository for failed webhook deliveries (Node 70 / node-60 & Node 72 / node-72).
    """
    __tablename__ = "dlq_webhooks"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    tenant_id = Column(String(64), nullable=False, index=True)
    outbox_event_id = Column(String(64), nullable=True)
    client_id = Column(String(128), nullable=False, index=True)
    target_url = Column(String(512), nullable=False)
    payload = Column(JSON, nullable=False)
    retry_count = Column(Integer, default=0, nullable=False)
    max_retries = Column(Integer, default=3, nullable=False)
    last_error = Column(Text, nullable=True)
    status = Column(String(32), default="PENDING", nullable=False, index=True) # 'PENDING', 'RECONCILED', 'DEAD'
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


# Indexing
Index("idx_auth_code_lookup", AuthCode.code, AuthCode.used, AuthCode.expires_at)
Index("idx_session_lookup", Session.token_hash, Session.is_revoked, Session.expires_at)
Index("idx_credential_active", FIDO2Credential.credential_id, FIDO2Credential.is_active)
