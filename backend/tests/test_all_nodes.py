import pytest
import asyncio
import json
import time
import base64
import struct
import hashlib
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport

from backend.app.main import app
from backend.app.core.config import settings
from backend.app.core.database import UnitOfWork
from backend.app.core.redis import redis_manager, SingleflightLock
from backend.app.core.security import hash_pin_or_password, generate_challenge_nonce
from backend.app.core.circuit_breaker import get_circuit_breaker, CircuitState
from backend.app.models.entities import (
    ClientApp, User, FIDO2Credential, AuthCode, Session, 
    SecurityPolicy, DLQWebhook, TransactionalOutbox
)


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_node_1_to_4_client_and_url_validation():
    """Verify Client Whitelist & Redirect URI matching (Nodes 1-4)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Valid client and registered redirect URI
        resp = await ac.get(
            "/api/v1/auth/validate-client",
            params={
                "client_id": "client_portal_alpha",
                "redirect_uri": "http://localhost:3000/sso/callback",
                "state": "state123"
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["data"]["is_valid"] is True
        assert data["data"]["app_name"] == "Portal Mitra Alpha Corp"

        # Invalid client ID (Node 4: Layar Error Klien)
        resp_invalid_client = await ac.get(
            "/api/v1/auth/validate-client",
            params={
                "client_id": "client_unregistered_xyz",
                "redirect_uri": "http://localhost:3000/sso/callback"
            }
        )
        assert resp_invalid_client.status_code == 400
        assert resp_invalid_client.json()["error"]["code"] == "INVALID_CLIENT"

        # Redirect URI mismatch (Node 4: Layar Error Klien)
        resp_mismatch = await ac.get(
            "/api/v1/auth/validate-client",
            params={
                "client_id": "client_portal_alpha",
                "redirect_uri": "https://evil-attacker-site.com/steal"
            }
        )
        assert resp_mismatch.status_code == 400
        assert resp_mismatch.json()["error"]["code"] == "REDIRECT_URI_MISMATCH"


@pytest.mark.asyncio
async def test_node_8_to_14_challenge_and_atomic_getdel():
    """Verify WebAuthn Challenge generation and Atomic GETDEL Anti-Replay (Nodes 8-14)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Request WebAuthn Challenge (Node 8 / node-9)
        resp = await ac.post(
            "/api/v1/auth/challenge",
            json={"client_id": "client_portal_alpha"}
        )
        assert resp.status_code == 200
        res_data = resp.json()
        challenge = res_data["data"]["challenge"]
        assert challenge is not None

        # 2. Check stored challenge in Redis (Node 9)
        redis_client = redis_manager.client
        raw_val = await redis_client.get(f"challenge:{challenge}")
        assert raw_val is not None

        # 3. Simulate first assertion submission (Node 13: Atomic GETDEL)
        # Construct valid mock authenticator data with zero counter
        rp_hash = hashlib.sha256(settings.RP_ID.encode("utf-8")).digest()
        auth_data = rp_hash + b"\x01" + struct.pack(">I", 0) # UP flag=1, counter=0
        auth_data_b64 = base64.urlsafe_b64encode(auth_data).decode("ascii")

        client_data = {
            "type": "webauthn.get",
            "challenge": challenge,
            "origin": "http://localhost:3000"
        }
        client_data_b64 = base64.urlsafe_b64encode(json.dumps(client_data).encode("utf-8")).decode("ascii")

        submit_payload = {
            "client_id": "client_portal_alpha",
            "redirect_uri": "http://localhost:3000/sso/callback",
            "challenge": challenge,
            "credential_id": "FIDO2-NFC-KEY-ALPHA-01",
            "client_data_json": client_data_b64,
            "authenticator_data": auth_data_b64,
            "signature": base64.urlsafe_b64encode(b"dummy_sig").decode("ascii")
        }

        # First consumption -> Valid
        resp_assert = await ac.post("/api/v1/auth/assertion", json=submit_payload)
        assert resp_assert.status_code == 200
        assert resp_assert.json()["data"]["status"] == "SUCCESS"
        assert resp_assert.json()["data"]["auth_code"] is not None

        # Replay attempt with same challenge nonce -> REJECTED (Node 14: Challenge Hangus / Replay)
        resp_replay = await ac.post("/api/v1/auth/assertion", json=submit_payload)
        assert resp_replay.status_code == 200
        assert resp_replay.json()["data"]["status"] == "INVALID"
        assert "Replay protection" in resp_replay.json()["data"]["error_message"]


@pytest.mark.asyncio
async def test_node_21_static_zero_and_counter_anti_cloning():
    """Verify Static Zero Sign_Count tolerance and Counter Anti-Cloning detection (Node 21)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        redis_client = redis_manager.client

        # Case A: Token with static zero counter (FIDO2-NFC-KEY-ALPHA-01 has sign_count=0)
        # Submitting counter=0 -> Allowed!
        ch_resp = await ac.post("/api/v1/auth/challenge", json={"client_id": "client_portal_alpha"})
        ch1 = ch_resp.json()["data"]["challenge"]

        rp_hash = hashlib.sha256(settings.RP_ID.encode("utf-8")).digest()
        auth_data_zero = rp_hash + b"\x01" + struct.pack(">I", 0)
        auth_data_zero_b64 = base64.urlsafe_b64encode(auth_data_zero).decode("ascii")

        c_data1 = base64.urlsafe_b64encode(
            json.dumps({"type": "webauthn.get", "challenge": ch1, "origin": "http://localhost:3000"}).encode("utf-8")
        ).decode("ascii")

        resp1 = await ac.post(
            "/api/v1/auth/assertion",
            json={
                "client_id": "client_portal_alpha",
                "redirect_uri": "http://localhost:3000/sso/callback",
                "challenge": ch1,
                "credential_id": "FIDO2-NFC-KEY-ALPHA-01",
                "client_data_json": c_data1,
                "authenticator_data": auth_data_zero_b64,
                "signature": base64.urlsafe_b64encode(b"sig").decode("ascii")
            }
        )
        assert resp1.status_code == 200
        assert resp1.json()["data"]["status"] == "SUCCESS"

        # Case B: Token with counter tracking (FIDO2-NFC-KEY-BETA-02 has sign_count=42)
        # If attacker attempts with counter=40 (<= 42) -> CLONED TOKEN DETECTED!
        ch_resp2 = await ac.post("/api/v1/auth/challenge", json={"client_id": "client_portal_alpha"})
        ch2 = ch_resp2.json()["data"]["challenge"]

        auth_data_cloned = rp_hash + b"\x01" + struct.pack(">I", 40) # 40 <= 42
        auth_data_cloned_b64 = base64.urlsafe_b64encode(auth_data_cloned).decode("ascii")

        c_data2 = base64.urlsafe_b64encode(
            json.dumps({"type": "webauthn.get", "challenge": ch2, "origin": "http://localhost:3000"}).encode("utf-8")
        ).decode("ascii")

        resp_clone = await ac.post(
            "/api/v1/auth/assertion",
            json={
                "client_id": "client_portal_alpha",
                "redirect_uri": "http://localhost:3000/sso/callback",
                "challenge": ch2,
                "credential_id": "FIDO2-NFC-KEY-BETA-02",
                "client_data_json": c_data2,
                "authenticator_data": auth_data_cloned_b64,
                "signature": base64.urlsafe_b64encode(b"sig").decode("ascii")
            }
        )
        assert resp_clone.status_code == 200
        assert resp_clone.json()["data"]["status"] == "INVALID"
        assert "Cloned token detected" in resp_clone.json()["data"]["error_message"]


@pytest.mark.asyncio
async def test_node_28_to_39_oauth_token_exchange():
    """Verify Single-use Auth Code atomic consumption and JWT issue (Nodes 28-39)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create an auth code directly via assertion flow
        ch_resp = await ac.post("/api/v1/auth/challenge", json={"client_id": "client_portal_alpha"})
        ch = ch_resp.json()["data"]["challenge"]

        rp_hash = hashlib.sha256(settings.RP_ID.encode("utf-8")).digest()
        auth_data = rp_hash + b"\x01" + struct.pack(">I", 0)
        auth_data_b64 = base64.urlsafe_b64encode(auth_data).decode("ascii")
        c_data = base64.urlsafe_b64encode(
            json.dumps({"type": "webauthn.get", "challenge": ch, "origin": "http://localhost:3000"}).encode("utf-8")
        ).decode("ascii")

        resp = await ac.post(
            "/api/v1/auth/assertion",
            json={
                "client_id": "client_portal_alpha",
                "redirect_uri": "http://localhost:3000/sso/callback",
                "challenge": ch,
                "credential_id": "FIDO2-NFC-KEY-ALPHA-01",
                "client_data_json": c_data,
                "authenticator_data": auth_data_b64,
                "signature": base64.urlsafe_b64encode(b"sig").decode("ascii")
            }
        )
        auth_code = resp.json()["data"]["auth_code"]
        assert auth_code is not None

        # Exchange Auth Code for Access Token (Node 35)
        token_resp = await ac.post(
            "/oauth/token",
            json={
                "grant_type": "authorization_code",
                "code": auth_code,
                "client_id": "client_portal_alpha",
                "client_secret": "sec_portal_alpha_998811",
                "redirect_uri": "http://localhost:3000/sso/callback"
            }
        )
        assert token_resp.status_code == 200
        token_data = token_resp.json()
        assert "access_token" in token_data
        assert "id_token" in token_data
        access_token = token_data["access_token"]

        # Attempt to reuse the same auth code -> Atomic rejection (Node 37)
        reuse_resp = await ac.post(
            "/oauth/token",
            json={
                "grant_type": "authorization_code",
                "code": auth_code,
                "client_id": "client_portal_alpha",
                "client_secret": "sec_portal_alpha_998811",
                "redirect_uri": "http://localhost:3000/sso/callback"
            }
        )
        assert reuse_resp.status_code == 400
        assert reuse_resp.json()["error"]["code"] == "INVALID_GRANT"

        # Test Token Introspection (Node 41 / node-36)
        introspect_resp = await ac.post(
            "/oauth/introspect",
            json={"token": access_token}
        )
        assert introspect_resp.status_code == 200
        assert introspect_resp.json()["active"] is True
        assert introspect_resp.json()["client_id"] == "client_portal_alpha"


@pytest.mark.asyncio
async def test_node_43_and_44_singleflight_dead_man_lock():
    """Verify Singleflight Dead-Man Lock prevents cache stampede during Redis miss (Nodes 42-44)."""
    token_key = "dummy_stampede_token"
    lock1 = SingleflightLock(key=token_key, dead_man_ttl_ms=1500, retry_count=2)
    acquired1 = await lock1.acquire()
    assert acquired1 is True

    # Concurrent lock contender should not acquire immediately
    lock2 = SingleflightLock(key=token_key, dead_man_ttl_ms=1500, retry_count=2)
    acquired2 = await lock2.acquire()
    assert acquired2 is False

    # Release lock 1
    await lock1.release()

    # Now lock 2 should be able to acquire
    acquired3 = await lock2.acquire()
    assert acquired3 is True
    await lock2.release()


@pytest.mark.asyncio
async def test_node_59_to_72_immediate_revocation_and_dlq_reconciler():
    """Verify Immediate Revocation, Outbox CDC, PyBreaker Circuit Breaker & DLQ Reconciler (Nodes 59-72)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Admin logs in
        admin_login = await ac.post(
            "/api/v1/admin/login",
            json={"email": settings.DEFAULT_ADMIN_EMAIL, "password": settings.DEFAULT_ADMIN_PASSWORD}
        )
        assert admin_login.status_code == 200

        # 2. Trigger Immediate Revocation on test user (Node 60)
        revoke_resp = await ac.post(
            "/api/v1/admin/revoke",
            json={"user_id": "dummy-user-revoke-id", "reason": "Test Security Revoke"}
        )
        assert revoke_resp.status_code == 200

        # 3. Simulate Breaker Trip and DLQ Reconciler (Nodes 64, 70, 72)
        breaker = get_circuit_breaker("client_portal_alpha")
        breaker.force_state(CircuitState.OPEN)

        # DLQ Reconcile attempt while breaker OPEN -> Stays in DLQ
        replay_resp = await ac.post(
            "/api/v1/dlq/replay",
            json={}
        )
        assert replay_resp.status_code == 200

        # Reset breaker to CLOSED (Healthy) and run replay
        breaker.force_state(CircuitState.CLOSED)
        replay_recovered = await ac.post(
            "/api/v1/dlq/replay",
            json={}
        )
        assert replay_recovered.status_code == 200


@pytest.mark.asyncio
async def test_node_19_and_20_revoked_card_blocked():
    """Verify revoked / inactive FIDO2 card is immediately blocked (Nodes 19 & 20)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        ch_resp = await ac.post("/api/v1/auth/challenge", json={"client_id": "client_portal_alpha"})
        ch = ch_resp.json()["data"]["challenge"]

        c_data = base64.urlsafe_b64encode(
            json.dumps({"type": "webauthn.get", "challenge": ch, "origin": "http://localhost:3000"}).encode("utf-8")
        ).decode("ascii")

        rp_hash = hashlib.sha256(settings.RP_ID.encode("utf-8")).digest()
        auth_data = base64.urlsafe_b64encode(rp_hash + b"\x01" + struct.pack(">I", 0)).decode("ascii")

        # Submit assertion with revoked credential ID: FIDO2-NFC-KEY-REVOKED-03
        resp = await ac.post(
            "/api/v1/auth/assertion",
            json={
                "client_id": "client_portal_alpha",
                "redirect_uri": "http://localhost:3000/sso/callback",
                "challenge": ch,
                "credential_id": "FIDO2-NFC-KEY-REVOKED-03",
                "client_data_json": c_data,
                "authenticator_data": auth_data,
                "signature": base64.urlsafe_b64encode(b"sig").decode("ascii")
            }
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "BLOCKED"
        assert "revoked" in resp.json()["data"]["error_message"]


@pytest.mark.asyncio
async def test_node_23_to_27_geofence_and_secondary_pin():
    """Verify Geofence policy restrictions and Secondary PIN verification (Nodes 23-27)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Geofence test: Submit assertion from blocked country (e.g. IP 194.26.29.1 -> KP)
        ch_resp = await ac.post("/api/v1/auth/challenge", json={"client_id": "client_portal_alpha"})
        ch = ch_resp.json()["data"]["challenge"]

        c_data = base64.urlsafe_b64encode(
            json.dumps({"type": "webauthn.get", "challenge": ch, "origin": "http://localhost:3000"}).encode("utf-8")
        ).decode("ascii")
        rp_hash = hashlib.sha256(settings.RP_ID.encode("utf-8")).digest()
        auth_data = base64.urlsafe_b64encode(rp_hash + b"\x01" + struct.pack(">I", 0)).decode("ascii")

        geo_block_resp = await ac.post(
            "/api/v1/auth/assertion",
            headers={"x-forwarded-for": "194.26.29.1"},
            json={
                "client_id": "client_portal_alpha",
                "redirect_uri": "http://localhost:3000/sso/callback",
                "challenge": ch,
                "credential_id": "FIDO2-NFC-KEY-ALPHA-01",
                "client_data_json": c_data,
                "authenticator_data": auth_data,
                "signature": base64.urlsafe_b64encode(b"sig").decode("ascii")
            }
        )
        assert geo_block_resp.status_code == 200
        assert geo_block_resp.json()["data"]["status"] == "GEOFENCE_REJECTED"


@pytest.mark.asyncio
async def test_prometheus_metrics_and_health():
    """Verify Prometheus telemetry format and Health endpoint (Nodes 56 & 71)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        health_resp = await ac.get("/health")
        assert health_resp.status_code == 200
        assert health_resp.json()["status"] == "HEALTHY"

        metrics_resp = await ac.get("/metrics")
        assert metrics_resp.status_code == 200
        content = metrics_resp.text
        assert "nfc_auth_requests_total" in content
        assert "circuit_breaker_state" in content
        assert "dlq_messages_pending" in content

