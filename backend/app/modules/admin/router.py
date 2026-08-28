import logging
from datetime import datetime, timezone
import hashlib
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("catauth.admin")


from backend.app.core.config import settings
from backend.app.core.database import UnitOfWork
from backend.app.core.security import (
    verify_pin_or_password, create_access_token, decode_jwt_token
)
from backend.app.models.entities import (
    User, SecurityPolicy, Session, TransactionalOutbox, FIDO2Credential
)
from backend.app.modules.outbox_dlq.service import OutboxDLQService
from backend.app.schemas.common import (
    StandardResponse, AdminLoginRequest, AdminLoginResponse,
    SecurityPolicyUpdateRequest, RevokeSessionRequest
)

router = APIRouter(prefix="/admin", tags=["Admin Portal & Security Policies"])


@router.post("/login", response_model=StandardResponse[AdminLoginResponse])
async def admin_login(payload: AdminLoginRequest, tenant_id: str = "default-tenant"):
    """
    Administrator Authentication with RBAC check (Nodes 46 & 47).
    """
    async with UnitOfWork(tenant_id=tenant_id) as session:
        stmt = select(User).where(
            User.email == payload.email,
            User.role == "admin",
            User.is_active == True
        )
        admin_user = (await session.execute(stmt)).scalar_one_or_none()

        # Fallback check against default admin config if DB user not found
        if not admin_user:
            if payload.email == settings.DEFAULT_ADMIN_EMAIL and payload.password == settings.DEFAULT_ADMIN_PASSWORD:
                token = create_access_token(
                    user_id="root-admin",
                    client_id="catauth-admin-console",
                    tenant_id=tenant_id,
                    scope="admin:all"
                )
                return StandardResponse(
                    data=AdminLoginResponse(
                        access_token=token,
                        admin_user={
                            "id": "root-admin",
                            "email": settings.DEFAULT_ADMIN_EMAIL,
                            "display_name": "Root Security Administrator",
                            "role": "admin"
                        }
                    ),
                    message="Admin authenticated successfully."
                )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_CREDENTIALS", "message": "Invalid administrator email or password."}
            )

        token = create_access_token(
            user_id=admin_user.id,
            client_id="catauth-admin-console",
            tenant_id=tenant_id,
            scope="admin:all"
        )
        return StandardResponse(
            data=AdminLoginResponse(
                access_token=token,
                admin_user={
                    "id": admin_user.id,
                    "email": admin_user.email,
                    "display_name": admin_user.display_name,
                    "role": admin_user.role
                }
            ),
            message="Admin authenticated successfully."
        )


@router.get("/policies", response_model=StandardResponse)
async def get_security_policies(tenant_id: str = "default-tenant"):
    """
    Retrieves current Security Policies and TTL configurations (Node 57 / node-49).
    """
    async with UnitOfWork(tenant_id=tenant_id) as session:
        stmt = select(SecurityPolicy).where(SecurityPolicy.tenant_id == tenant_id)
        policy = (await session.execute(stmt)).scalar_one_or_none()
        
        if not policy:
            # Create default policy
            policy = SecurityPolicy(
                tenant_id=tenant_id,
                session_ttl_sec=settings.SESSION_TTL_SECONDS,
                challenge_ttl_sec=settings.CHALLENGE_TTL_SECONDS,
                require_pin_mfa=False,
                geofence_enabled=False,
                allowed_countries=["ID", "SG", "US", "JP", "MY", "GB", "DE"]
            )
            session.add(policy)
            await session.flush()

        data = {
            "id": policy.id,
            "session_ttl_sec": policy.session_ttl_sec,
            "challenge_ttl_sec": policy.challenge_ttl_sec,
            "require_pin_mfa": policy.require_pin_mfa,
            "geofence_enabled": policy.geofence_enabled,
            "allowed_countries": policy.allowed_countries,
            "brute_force_threshold": policy.brute_force_threshold,
            "dlq_lag_threshold": policy.dlq_lag_threshold,
            "updated_at": policy.updated_at.isoformat() if policy.updated_at else None
        }
        return StandardResponse(data=data)


@router.put("/policies", response_model=StandardResponse)
async def update_security_policies(
    payload: SecurityPolicyUpdateRequest,
    tenant_id: str = "default-tenant"
):
    """
    Updates Security Policies & TTL (Node 58 / node-50).
    """
    async with UnitOfWork(tenant_id=tenant_id) as session:
        stmt = select(SecurityPolicy).where(SecurityPolicy.tenant_id == tenant_id)
        policy = (await session.execute(stmt)).scalar_one_or_none()
        
        if not policy:
            policy = SecurityPolicy(tenant_id=tenant_id)
            session.add(policy)

        if payload.session_ttl_sec is not None:
            policy.session_ttl_sec = payload.session_ttl_sec
        if payload.challenge_ttl_sec is not None:
            policy.challenge_ttl_sec = payload.challenge_ttl_sec
        if payload.require_pin_mfa is not None:
            policy.require_pin_mfa = payload.require_pin_mfa
        if payload.geofence_enabled is not None:
            policy.geofence_enabled = payload.geofence_enabled
        if payload.allowed_countries is not None:
            policy.allowed_countries = payload.allowed_countries
        if payload.brute_force_threshold is not None:
            policy.brute_force_threshold = payload.brute_force_threshold
        if payload.dlq_lag_threshold is not None:
            policy.dlq_lag_threshold = payload.dlq_lag_threshold

        return StandardResponse(message="Security policies and TTL configurations updated successfully.")


@router.post("/revoke", response_model=StandardResponse)
async def immediate_session_revocation(
    payload: RevokeSessionRequest,
    tenant_id: str = "default-tenant"
):
    """
    Immediate Session Revocation & Transactional Outbox Write (Nodes 59, 60, 61, 62).
    Executes atomic blacklist and writes event to outbox table inside unit-of-work BEGIN...COMMIT.
    """
    outbox_event = None

    async with UnitOfWork(tenant_id=tenant_id) as session:
        # 1. Look up session(s) to revoke
        target_sessions = []
        if payload.session_id:
            stmt = select(Session).where(Session.id == payload.session_id, Session.tenant_id == tenant_id)
            s = (await session.execute(stmt)).scalar_one_or_none()
            if s:
                target_sessions.append(s)
        elif payload.token_hash:
            stmt = select(Session).where(Session.token_hash == payload.token_hash, Session.tenant_id == tenant_id)
            s = (await session.execute(stmt)).scalar_one_or_none()
            if s:
                target_sessions.append(s)
        elif payload.user_id:
            stmt = select(Session).where(
                Session.user_id == payload.user_id,
                Session.tenant_id == tenant_id,
                Session.is_revoked == False
            )
            target_sessions = list((await session.execute(stmt)).scalars().all())

        if not target_sessions:
            # Even if no active session found, we acknowledge revocation
            logger.info(f"No active session matched for revocation: {payload}")
            return StandardResponse(message="Session was already inactive or not found.")

        # 2. Mark sessions revoked in DB
        revoked_ids = []
        for s in target_sessions:
            s.is_revoked = True
            s.revoked_at = datetime.now(timezone.utc)
            revoked_ids.append(s.id)

            # 3. Node 61: ACID Transactional Outbox WAL Write
            outbox_record = TransactionalOutbox(
                tenant_id=tenant_id,
                event_type="session.revoked",
                aggregate_type="Session",
                aggregate_id=s.id,
                payload={
                    "session_id": s.id,
                    "token_hash": s.token_hash,
                    "user_id": s.user_id,
                    "client_id": s.client_id,
                    "reason": payload.reason,
                    "revoked_at": s.revoked_at.isoformat()
                },
                processed=False
            )
            session.add(outbox_record)
            outbox_event = outbox_record

        await session.flush()

    # 4. Node 62 & Node 63: Stream to Redis Streams & Purge Cache immediately
    if outbox_event:
        await OutboxDLQService.publish_outbox_to_stream(outbox_event)
        await OutboxDLQService.process_stream_event({
            "outbox_id": str(outbox_event.id),
            "tenant_id": outbox_event.tenant_id,
            "event_type": outbox_event.event_type,
            "aggregate_id": outbox_event.aggregate_id,
            "payload": outbox_event.payload
        })

    return StandardResponse(
        data={"revoked_sessions_count": len(revoked_ids), "session_ids": revoked_ids},
        message=f"Successfully revoked {len(revoked_ids)} session(s) and published CDC outbox event."
    )
