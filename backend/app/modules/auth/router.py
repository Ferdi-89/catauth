import hashlib
import json
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.core.database import UnitOfWork
from backend.app.core.redis import redis_manager, SingleflightLock
from backend.app.core.security import (
    generate_challenge_nonce, generate_auth_code_string,
    verify_webauthn_assertion, verify_pin_or_password,
    verify_pkce, create_access_token, create_id_token,
    decode_jwt_token
)
from backend.app.models.entities import (
    ClientApp, User, FIDO2Credential, AuthCode, 
    Session, AuditLog, SecurityPolicy
)
from backend.app.modules.telemetry.service import TelemetryService
from backend.app.schemas.common import (
    StandardResponse, StandardErrorResponse,
    ValidateClientResponse, ChallengeRequest, ChallengeResponse,
    AssertionSubmitRequest, AssertionResultResponse,
    VerifyPinRequest, TokenExchangeRequest, TokenResponse,
    IntrospectRequest, IntrospectResponse
)

logger = logging.getLogger("catauth.auth")

router = APIRouter(tags=["Authentication & WebAuthn SSO"])


@router.get("/auth/validate-client", response_model=StandardResponse[ValidateClientResponse])
async def validate_client_and_url(
    client_id: str,
    redirect_uri: str,
    state: Optional[str] = None,
    nonce: Optional[str] = None,
    tenant_id: str = "default-tenant"
):
    """
    Validates Client ID & Redirect URI Whitelist (Nodes 1, 2, 3, 4).
    """
    async with UnitOfWork(tenant_id=tenant_id) as session:
        stmt = select(ClientApp).where(
            ClientApp.client_id == client_id,
            ClientApp.is_active == True
        )
        client = (await session.execute(stmt)).scalar_one_or_none()

        if not client:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "INVALID_CLIENT",
                    "message": f"Client ID '{client_id}' is not registered or active."
                }
            )

        # Validate redirect URI match against allowed list
        clean_redirect = redirect_uri.strip()
        matched = False
        for allowed in client.redirect_uris:
            if clean_redirect == allowed or clean_redirect.startswith(allowed.rstrip("/")):
                matched = True
                break

        if not matched:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "REDIRECT_URI_MISMATCH",
                    "message": f"Redirect URI '{redirect_uri}' is not in whitelisted redirect URIs for this client."
                }
            )

        response_data = ValidateClientResponse(
            client_id=client.client_id,
            app_name=client.app_name,
            app_logo_url=client.app_logo_url,
            redirect_uri=redirect_uri,
            state=state,
            nonce=nonce,
            rp_id=settings.RP_ID,
            is_valid=True
        )
        return StandardResponse(data=response_data)


@router.post("/auth/challenge", response_model=StandardResponse[ChallengeResponse])
async def request_webauthn_challenge(
    payload: ChallengeRequest,
    tenant_id: str = "default-tenant"
):
    """
    Generates transient cryptographic WebAuthn Challenge & stores in Redis (Nodes 8, 9).
    """
    challenge = generate_challenge_nonce(32)
    challenge_data = {
        "client_id": payload.client_id,
        "tenant_id": tenant_id,
        "user_identifier": payload.user_identifier,
        "created_at": time.time()
    }
    
    # Store challenge with 60s TTL in Redis
    redis_client = redis_manager.client
    await redis_client.setex(
        f"challenge:{challenge}",
        settings.CHALLENGE_TTL_SECONDS,
        json.dumps(challenge_data)
    )

    response = ChallengeResponse(
        challenge=challenge,
        rp_id=settings.RP_ID,
        rp_name=settings.RP_NAME,
        timeout_ms=settings.CHALLENGE_TTL_SECONDS * 1000
    )
    return StandardResponse(data=response)


@router.post("/auth/assertion", response_model=StandardResponse[AssertionResultResponse])
async def submit_fido2_assertion(
    request: Request,
    payload: AssertionSubmitRequest
):
    """
    Submits and verifies WebAuthn/FIDO2 NFC Assertion (Nodes 11-29).
    Includes: Atomic GETDEL, Strict RP ID Origin check, sign_count Anti-Cloning, Geofencing, and MFA Check.
    """
    redis_client = redis_manager.client

    # 1. Node 13 & 14: Atomic GETDEL Challenge Nonce (Anti-Replay Attack)
    challenge_raw = await redis_client.getdel(f"challenge:{payload.challenge}")
    if not challenge_raw:
        # Challenge not found or already consumed
        logger.warning(f"Replay attack or expired challenge nonce: {payload.challenge}")
        return StandardResponse(
            data=AssertionResultResponse(
                status="INVALID",
                error_message="Challenge nonce expired or already consumed (Replay protection)."
            )
        )

    challenge_info = json.loads(challenge_raw)
    tenant_id = challenge_info.get("tenant_id", "default-tenant")

    # 2. Node 15: Resolve GeoIP & User-Agent metadata
    geo_meta = TelemetryService.resolve_geoip_and_metadata(request)

    # 3. Node 16 & 17: Unit-of-Work SET LOCAL Transaction Guard
    async with UnitOfWork(tenant_id=tenant_id) as session:
        # Load client app
        client_stmt = select(ClientApp).where(ClientApp.client_id == payload.client_id)
        client_app = (await session.execute(client_stmt)).scalar_one_or_none()
        if not client_app or not client_app.is_active:
            return StandardResponse(
                data=AssertionResultResponse(status="INVALID", error_message="Invalid client application.")
            )

        # 4. Node 18: Query FIDO2 Credential
        cred_stmt = select(FIDO2Credential).where(
            FIDO2Credential.credential_id == payload.credential_id
        )
        cred = (await session.execute(cred_stmt)).scalar_one_or_none()

        if not cred:
            await TelemetryService.record_audit_log(
                session=session,
                tenant_id=tenant_id,
                event_type="login_failed",
                status="FAILED",
                client_id=payload.client_id,
                geo_metadata=geo_meta,
                details={"reason": "Unknown credential ID", "credential_id": payload.credential_id}
            )
            return StandardResponse(
                data=AssertionResultResponse(status="INVALID", error_message="Credential token not recognized.")
            )

        # 5. Node 19 & 20: Status Kredensial Aktif?
        if not cred.is_active:
            await TelemetryService.record_audit_log(
                session=session,
                tenant_id=tenant_id,
                event_type="login_blocked",
                status="BLOCKED",
                user_id=cred.user_id,
                credential_id=cred.credential_id,
                client_id=payload.client_id,
                geo_metadata=geo_meta,
                details={"reason": "Credential revoked or inactive"}
            )
            return StandardResponse(
                data=AssertionResultResponse(status="BLOCKED", error_message="Hardware token has been revoked by admin.")
            )

        # Load user
        user_stmt = select(User).where(User.id == cred.user_id)
        user = (await session.execute(user_stmt)).scalar_one_or_none()
        if not user or not user.is_active:
            return StandardResponse(
                data=AssertionResultResponse(status="BLOCKED", error_message="User account is deactivated.")
            )

        # 6. Node 21: Validasi Assertion, Strict RP ID, and Static Zero Sign_Count Tolerance
        allowed_origins = client_app.allowed_origins + settings.ORIGIN_WHITELIST
        is_valid, error_msg, new_sign_count = verify_webauthn_assertion(
            client_data_json_b64=payload.client_data_json,
            authenticator_data_b64=payload.authenticator_data,
            signature_b64=payload.signature,
            public_key_cose_or_pem=cred.public_key_cose,
            stored_sign_count=cred.sign_count,
            expected_challenge=payload.challenge,
            expected_rp_id=settings.RP_ID,
            allowed_origins=allowed_origins
        )

        if not is_valid:
            status_flag = "ANOMALY" if "Cloned token" in error_msg else "FAILED"
            await TelemetryService.record_audit_log(
                session=session,
                tenant_id=tenant_id,
                event_type="cloned_token_detected" if "Cloned" in error_msg else "login_failed",
                status=status_flag,
                user_id=user.id,
                credential_id=cred.credential_id,
                client_id=payload.client_id,
                geo_metadata=geo_meta,
                details={"error": error_msg, "incoming_sign_count": new_sign_count}
            )
            return StandardResponse(
                data=AssertionResultResponse(status="INVALID", error_message=error_msg)
            )

        # Update credential counter & last used
        cred.sign_count = new_sign_count
        cred.last_used_at = datetime.now(timezone.utc)

        # 7. Node 23 & 24: Evaluasi Geofence Akses
        policy_stmt = select(SecurityPolicy).where(SecurityPolicy.tenant_id == tenant_id)
        policy = (await session.execute(policy_stmt)).scalar_one_or_none()
        
        country = geo_meta.get("country", "ID")
        if policy and policy.geofence_enabled:
            if country not in policy.allowed_countries:
                await TelemetryService.record_audit_log(
                    session=session,
                    tenant_id=tenant_id,
                    event_type="geofence_blocked",
                    status="BLOCKED",
                    user_id=user.id,
                    credential_id=cred.credential_id,
                    client_id=payload.client_id,
                    geo_metadata=geo_meta,
                    details={"blocked_country": country, "allowed": policy.allowed_countries}
                )
                return StandardResponse(
                    data=AssertionResultResponse(
                        status="GEOFENCE_REJECTED",
                        error_message=f"Access from region '{country}' is restricted by organization policy."
                    )
                )

        # 8. Node 25 & 26: Evaluasi Kebutuhan MFA (Secondary PIN)
        require_pin = bool(policy and policy.require_pin_mfa and user.pin_hash)
        if require_pin:
            # Store temporary auth session in Redis for PIN prompt (300s TTL)
            temp_session_id = generate_challenge_nonce(24)
            temp_data = {
                "user_id": user.id,
                "tenant_id": tenant_id,
                "credential_id": cred.credential_id,
                "client_id": payload.client_id,
                "redirect_uri": payload.redirect_uri,
                "state": payload.state,
                "nonce": payload.nonce,
                "geo_meta": geo_meta
            }
            await redis_client.setex(f"temp_auth:{temp_session_id}", 300, json.dumps(temp_data))
            
            return StandardResponse(
                data=AssertionResultResponse(
                    status="NEED_PIN_MFA",
                    user_id=user.id,
                    username=user.username,
                    display_name=user.display_name,
                    requires_pin=True,
                    temp_auth_session=temp_session_id
                )
            )

        # 9. Node 28 & 29: Save Audit Log & Generate Single-Use Auth Code
        await TelemetryService.record_audit_log(
            session=session,
            tenant_id=tenant_id,
            event_type="login_success",
            status="SUCCESS",
            user_id=user.id,
            credential_id=cred.credential_id,
            client_id=payload.client_id,
            geo_metadata=geo_meta,
            details={"auth_method": "FIDO2_NFC"}
        )

        auth_code_str = generate_auth_code_string(36)
        auth_code = AuthCode(
            code=auth_code_str,
            tenant_id=tenant_id,
            client_id=payload.client_id,
            user_id=user.id,
            credential_id=cred.credential_id,
            redirect_uri=payload.redirect_uri,
            state=payload.state,
            nonce=payload.nonce,
            used=False,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=settings.AUTH_CODE_TTL_SECONDS)
        )
        session.add(auth_code)

        delimiter = "&" if "?" in payload.redirect_uri else "?"
        redirect_target = f"{payload.redirect_uri}{delimiter}code={auth_code_str}"
        if payload.state:
            redirect_target += f"&state={payload.state}"

        return StandardResponse(
            data=AssertionResultResponse(
                status="SUCCESS",
                user_id=user.id,
                username=user.username,
                display_name=user.display_name,
                auth_code=auth_code_str,
                redirect_url=redirect_target
            )
        )


@router.post("/auth/verify-pin", response_model=StandardResponse[AssertionResultResponse])
async def verify_secondary_pin(payload: VerifyPinRequest):
    """
    Verifies Argon2id secondary PIN for MFA step (Node 26, 27, 28, 29).
    """
    redis_client = redis_manager.client

    temp_raw = await redis_client.getdel(f"temp_auth:{payload.temp_auth_session}")
    if not temp_raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "EXPIRED_SESSION", "message": "MFA session expired. Please tap NFC card again."}
        )

    temp_data = json.loads(temp_raw)
    tenant_id = temp_data.get("tenant_id", "default-tenant")
    user_id = temp_data.get("user_id")

    async with UnitOfWork(tenant_id=tenant_id) as session:
        user_stmt = select(User).where(User.id == user_id)
        user = (await session.execute(user_stmt)).scalar_one_or_none()

        if not user or not user.pin_hash:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "PIN_NOT_SET", "message": "No security PIN configured for user."}
            )

        # Verify Argon2id hash
        pin_valid = verify_pin_or_password(user.pin_hash, payload.pin)
        if not pin_valid:
            await TelemetryService.record_audit_log(
                session=session,
                tenant_id=tenant_id,
                event_type="mfa_pin_failed",
                status="FAILED",
                user_id=user.id,
                client_id=payload.client_id,
                geo_metadata=temp_data.get("geo_meta"),
                details={"reason": "Invalid Argon2id PIN"}
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_PIN", "message": "Incorrect security PIN entered."}
            )

        # Audit success
        await TelemetryService.record_audit_log(
            session=session,
            tenant_id=tenant_id,
            event_type="mfa_pin_success",
            status="SUCCESS",
            user_id=user.id,
            credential_id=temp_data.get("credential_id"),
            client_id=payload.client_id,
            geo_metadata=temp_data.get("geo_meta"),
            details={"auth_method": "FIDO2_NFC_WITH_ARGON2_PIN"}
        )

        # Issue single-use Auth Code
        auth_code_str = generate_auth_code_string(36)
        auth_code = AuthCode(
            code=auth_code_str,
            tenant_id=tenant_id,
            client_id=payload.client_id,
            user_id=user.id,
            credential_id=temp_data.get("credential_id"),
            redirect_uri=payload.redirect_uri,
            state=payload.state,
            nonce=payload.nonce,
            used=False,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=settings.AUTH_CODE_TTL_SECONDS)
        )
        session.add(auth_code)

        delimiter = "&" if "?" in payload.redirect_uri else "?"
        redirect_target = f"{payload.redirect_uri}{delimiter}code={auth_code_str}"
        if payload.state:
            redirect_target += f"&state={payload.state}"

        return StandardResponse(
            data=AssertionResultResponse(
                status="SUCCESS",
                user_id=user.id,
                username=user.username,
                display_name=user.display_name,
                auth_code=auth_code_str,
                redirect_url=redirect_target
            )
        )


@router.post("/oauth/token", response_model=TokenResponse)
async def oauth_token_exchange(payload: TokenExchangeRequest):
    """
    OAuth 2.0 Token Exchange Endpoint (Nodes 34-39).
    Atomically consumes Auth Code and issues JWT Access & ID tokens.
    """
    if payload.grant_type != "authorization_code":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "UNSUPPORTED_GRANT_TYPE", "message": "Only 'authorization_code' grant type is supported."}
        )

    # Unit-of-Work transaction
    async with UnitOfWork() as session:
        # 1. Node 36: Verify client application
        client_stmt = select(ClientApp).where(
            ClientApp.client_id == payload.client_id,
            ClientApp.is_active == True
        )
        client_app = (await session.execute(client_stmt)).scalar_one_or_none()
        if not client_app:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_CLIENT", "message": "Client authentication failed."}
            )

        # If client_secret provided, verify Argon2/Bcrypt hash
        if payload.client_secret:
            if not verify_pin_or_password(client_app.client_secret_hash, payload.client_secret):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail={"code": "INVALID_CLIENT_SECRET", "message": "Invalid client secret."}
                )

        # 2. Node 37: Atomic Consume Auth Code
        # UPDATE auth_codes SET used=true WHERE code=:code AND used=false AND expires_at > now RETURNING *
        code_stmt = select(AuthCode).where(
            AuthCode.code == payload.code,
            AuthCode.client_id == payload.client_id,
            AuthCode.used == False,
            AuthCode.expires_at > datetime.now(timezone.utc)
        ).with_for_update()

        auth_code = (await session.execute(code_stmt)).scalar_one_or_none()
        if not auth_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_GRANT", "message": "Authorization code is invalid, expired, or already used."}
            )

        # Mark code as consumed atomically
        auth_code.used = True

        # PKCE check if code_challenge was stored
        if auth_code.code_challenge:
            if not payload.code_verifier or not verify_pkce(payload.code_verifier, auth_code.code_challenge, auth_code.code_challenge_method):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": "INVALID_PKCE", "message": "PKCE code verifier does not match code challenge."}
                )

        # Fetch user
        user_stmt = select(User).where(User.id == auth_code.user_id)
        user = (await session.execute(user_stmt)).scalar_one()

        # 3. Node 38: Issue JWT Access Token & ID Token
        access_token = create_access_token(
            user_id=user.id,
            client_id=client_app.client_id,
            tenant_id=auth_code.tenant_id
        )
        id_token = create_id_token(
            user_id=user.id,
            email=user.email,
            display_name=user.display_name,
            client_id=client_app.client_id,
            tenant_id=auth_code.tenant_id,
            nonce=auth_code.nonce
        )

        token_hash = hashlib.sha256(access_token.encode("utf-8")).hexdigest()

        # Create Session record in DB
        db_session = Session(
            tenant_id=auth_code.tenant_id,
            user_id=user.id,
            client_id=client_app.client_id,
            credential_id=auth_code.credential_id,
            token_hash=token_hash,
            is_revoked=False,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=settings.SESSION_TTL_SECONDS)
        )
        session.add(db_session)
        await session.flush()

        # 4. Node 39: Registrasi Sesi Aktif Redis (TTL synced)
        redis_client = redis_manager.client
        session_cache_data = {
            "session_id": db_session.id,
            "user_id": user.id,
            "client_id": client_app.client_id,
            "tenant_id": auth_code.tenant_id,
            "is_revoked": False,
            "scope": "openid profile email",
            "expires_at": int(db_session.expires_at.timestamp())
        }
        await redis_client.setex(
            f"session:{token_hash}",
            settings.SESSION_TTL_SECONDS,
            json.dumps(session_cache_data)
        )

        return TokenResponse(
            access_token=access_token,
            token_type="Bearer",
            expires_in=settings.SESSION_TTL_SECONDS,
            id_token=id_token,
            scope="openid profile email"
        )


@router.post("/oauth/introspect", response_model=IntrospectResponse)
async def introspect_token(payload: IntrospectRequest):
    """
    Token Introspection with Redis In-Memory Lookup, Singleflight Dead-Man Lock, and DB Fallback (Nodes 40-44).
    """
    token_hash = hashlib.sha256(payload.token.encode("utf-8")).hexdigest()
    redis_client = redis_manager.client

    # 1. Node 42: Cek Cache Sesi Redis (In-Memory Acceleration)
    cached_session = await redis_client.get(f"session:{token_hash}")
    if cached_session:
        data = json.loads(cached_session)
        if not data.get("is_revoked", False) and data.get("expires_at", 0) > time.time():
            return IntrospectResponse(
                active=True,
                scope=data.get("scope", "openid profile email"),
                client_id=data.get("client_id"),
                sub=data.get("user_id"),
                exp=data.get("expires_at"),
                source="redis_in_memory"
            )
        else:
            return IntrospectResponse(active=False, source="redis_in_memory")

    # 2. Node 43: Singleflight Lock with Dead-Man TTL & Jitter Backoff (Stampede Guard)
    lock = SingleflightLock(key=token_hash, dead_man_ttl_ms=settings.SINGLEFLIGHT_DEAD_MAN_TTL_MS)
    acquired = await lock.acquire()

    if not acquired:
        # Another request won the lock and populated Redis; read from Redis again
        cached_after_wait = await redis_client.get(f"session:{token_hash}")
        if cached_after_wait:
            data = json.loads(cached_after_wait)
            return IntrospectResponse(
                active=(not data.get("is_revoked", False) and data.get("expires_at", 0) > time.time()),
                scope=data.get("scope", "openid profile email"),
                client_id=data.get("client_id"),
                sub=data.get("user_id"),
                exp=data.get("expires_at"),
                source="redis_singleflight_waiter"
            )

    # 3. Node 44: Fallback Verifikasi DB (Under Unit-of-Work SET LOCAL)
    try:
        async with UnitOfWork() as session:
            stmt = select(Session).where(
                Session.token_hash == token_hash,
                Session.is_revoked == False,
                Session.expires_at > datetime.now(timezone.utc)
            )
            db_session = (await session.execute(stmt)).scalar_one_or_none()

            if db_session:
                # Populate Redis cache
                session_cache_data = {
                    "session_id": db_session.id,
                    "user_id": db_session.user_id,
                    "client_id": db_session.client_id,
                    "tenant_id": db_session.tenant_id,
                    "is_revoked": False,
                    "scope": "openid profile email",
                    "expires_at": int(db_session.expires_at.timestamp())
                }
                ttl = max(1, int(db_session.expires_at.timestamp() - time.time()))
                await redis_client.setex(f"session:{token_hash}", ttl, json.dumps(session_cache_data))

                return IntrospectResponse(
                    active=True,
                    scope="openid profile email",
                    client_id=db_session.client_id,
                    sub=db_session.user_id,
                    exp=int(db_session.expires_at.timestamp()),
                    source="database_fallback"
                )
            else:
                return IntrospectResponse(active=False, source="database_fallback")
    finally:
        if acquired:
            await lock.release()
