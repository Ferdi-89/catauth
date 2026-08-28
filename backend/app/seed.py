import asyncio
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select

from backend.app.core.config import settings
from backend.app.core.database import init_db, UnitOfWork
from backend.app.core.security import hash_pin_or_password
from backend.app.models.entities import (
    Tenant, ClientApp, User, FIDO2Credential, SecurityPolicy, AuditLog
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("catauth.seed")


async def seed_database():
    """Seeds rich demo datasets for testing and demonstration."""
    await init_db()

    tenant_id = "default-tenant"

    async with UnitOfWork(tenant_id=tenant_id) as session:
        # 1. Tenant
        tenant_stmt = select(Tenant).where(Tenant.id == tenant_id)
        tenant = (await session.execute(tenant_stmt)).scalar_one_or_none()
        if not tenant:
            tenant = Tenant(
                id=tenant_id,
                name="Catauth Global Enterprise",
                slug="catauth-global"
            )
            session.add(tenant)
            await session.flush()
            logger.info("Created Tenant: Catauth Global Enterprise")

        # 2. Security Policy
        policy_stmt = select(SecurityPolicy).where(SecurityPolicy.tenant_id == tenant_id)
        policy = (await session.execute(policy_stmt)).scalar_one_or_none()
        if not policy:
            policy = SecurityPolicy(
                tenant_id=tenant_id,
                session_ttl_sec=3600,
                challenge_ttl_sec=60,
                require_pin_mfa=False,
                geofence_enabled=True,
                allowed_countries=["ID", "SG", "US", "JP", "MY", "GB", "DE"],
                brute_force_threshold=5,
                dlq_lag_threshold=5
            )
            session.add(policy)
            logger.info("Created Security Policy with Geofencing enabled.")

        # 3. Admin User
        admin_stmt = select(User).where(User.email == settings.DEFAULT_ADMIN_EMAIL)
        admin_user = (await session.execute(admin_stmt)).scalar_one_or_none()
        if not admin_user:
            admin_user = User(
                tenant_id=tenant_id,
                username="admin_secops",
                email=settings.DEFAULT_ADMIN_EMAIL,
                display_name="Security Operations Administrator",
                pin_hash=hash_pin_or_password(settings.DEFAULT_ADMIN_PIN),
                role="admin"
            )
            session.add(admin_user)
            await session.flush()
            logger.info(f"Created Admin User: {settings.DEFAULT_ADMIN_EMAIL}")

        # 4. Standard User
        user_stmt = select(User).where(User.email == "budi.santoso@perusahaan.co.id")
        std_user = (await session.execute(user_stmt)).scalar_one_or_none()
        if not std_user:
            std_user = User(
                tenant_id=tenant_id,
                username="budi_santoso",
                email="budi.santoso@perusahaan.co.id",
                display_name="Budi Santoso (Enterprise User)",
                pin_hash=hash_pin_or_password("123456"),
                role="user"
            )
            session.add(std_user)
            await session.flush()
            logger.info("Created User: budi.santoso@perusahaan.co.id")

        # 5. Client Apps
        # Client 1: Portal Mitra Alpha
        client1_stmt = select(ClientApp).where(ClientApp.client_id == "client_portal_alpha")
        client1 = (await session.execute(client1_stmt)).scalar_one_or_none()
        if not client1:
            client1 = ClientApp(
                tenant_id=tenant_id,
                client_id="client_portal_alpha",
                client_secret_hash=hash_pin_or_password("sec_portal_alpha_998811"),
                app_name="Portal Mitra Alpha Corp",
                app_logo_url="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&q=80",
                redirect_uris=[
                    "http://localhost:3000/sso/callback",
                    "http://localhost:3000/simulator",
                    "https://mitra-alpha.catauth.io/callback"
                ],
                allowed_origins=[
                    "http://localhost:3000",
                    "http://127.0.0.1:3000",
                    "https://catauth.io"
                ],
                webhook_logout_url="http://127.0.0.1:8000/api/v1/mock/webhook-logout",
                is_active=True
            )
            session.add(client1)
            logger.info("Created Client: Portal Mitra Alpha Corp")

        # Client 2: Fintech PaySecure Gateway
        client2_stmt = select(ClientApp).where(ClientApp.client_id == "client_fintech_paysecure")
        client2 = (await session.execute(client2_stmt)).scalar_one_or_none()
        if not client2:
            client2 = ClientApp(
                tenant_id=tenant_id,
                client_id="client_fintech_paysecure",
                client_secret_hash=hash_pin_or_password("sec_fintech_secret_445566"),
                app_name="Fintech PaySecure Gateway",
                app_logo_url="https://images.unsplash.com/photo-1563986768609-322da13575f3?w=100&q=80",
                redirect_uris=[
                    "http://localhost:3000/sso/callback",
                    "https://paysecure.catauth.io/callback"
                ],
                allowed_origins=[
                    "http://localhost:3000",
                    "http://127.0.0.1:3000"
                ],
                webhook_logout_url="http://127.0.0.1:8000/api/v1/mock/webhook-logout",
                is_active=True
            )
            session.add(client2)
            logger.info("Created Client: Fintech PaySecure Gateway")

        # 6. FIDO2 Hardware Tokens
        # Token 1: Valid YubiKey 5 NFC (Static zero sign_count support)
        cred1_stmt = select(FIDO2Credential).where(FIDO2Credential.credential_id == "FIDO2-NFC-KEY-ALPHA-01")
        if not (await session.execute(cred1_stmt)).scalar_one_or_none():
            cred1 = FIDO2Credential(
                tenant_id=tenant_id,
                user_id=std_user.id,
                credential_id="FIDO2-NFC-KEY-ALPHA-01",
                public_key_cose="MOCK_VALID_FIDO2_KEY",
                sign_count=0, # Static zero counter
                label="YubiKey 5 NFC (Master Badge)",
                aaguid="cbfeee-4567-89ab-cdef-0123456789ab",
                transports=["nfc", "usb"],
                is_active=True
            )
            session.add(cred1)
            logger.info("Created Credential: FIDO2-NFC-KEY-ALPHA-01 (YubiKey 5 NFC)")

        # Token 2: Counter Tracking Token
        cred2_stmt = select(FIDO2Credential).where(FIDO2Credential.credential_id == "FIDO2-NFC-KEY-BETA-02")
        if not (await session.execute(cred2_stmt)).scalar_one_or_none():
            cred2 = FIDO2Credential(
                tenant_id=tenant_id,
                user_id=std_user.id,
                credential_id="FIDO2-NFC-KEY-BETA-02",
                public_key_cose="MOCK_VALID_FIDO2_KEY",
                sign_count=42, # Non-zero counter
                label="Feitian ePass FIDO2 NFC Card",
                aaguid="fa8823-1122-3344-5566-778899aabbcc",
                transports=["nfc"],
                is_active=True
            )
            session.add(cred2)
            logger.info("Created Credential: FIDO2-NFC-KEY-BETA-02 (Feitian ePass)")

        # Token 3: Revoked Token (For Node 20 testing)
        cred3_stmt = select(FIDO2Credential).where(FIDO2Credential.credential_id == "FIDO2-NFC-KEY-REVOKED-03")
        if not (await session.execute(cred3_stmt)).scalar_one_or_none():
            cred3 = FIDO2Credential(
                tenant_id=tenant_id,
                user_id=std_user.id,
                credential_id="FIDO2-NFC-KEY-REVOKED-03",
                public_key_cose="MOCK_VALID_FIDO2_KEY",
                sign_count=10,
                label="Suspended Lost NFC Token",
                aaguid="000000-0000-0000-0000-000000000000",
                transports=["nfc"],
                is_active=False,
                revoked_at=datetime.now(timezone.utc) - timedelta(days=2),
                revocation_reason="Reported lost by employee"
            )
            session.add(cred3)
            logger.info("Created Credential: FIDO2-NFC-KEY-REVOKED-03 (Suspended)")

        # 7. Initial Telemetry & Audit Logs
        audit_count_stmt = select(AuditLog).where(AuditLog.tenant_id == tenant_id)
        existing_audits = (await session.execute(audit_count_stmt)).scalars().all()
        if len(existing_audits) < 5:
            sample_logs = [
                AuditLog(
                    tenant_id=tenant_id,
                    user_id=std_user.id,
                    credential_id="FIDO2-NFC-KEY-ALPHA-01",
                    client_id="client_portal_alpha",
                    event_type="login_success",
                    ip_address="127.0.0.1",
                    country="ID",
                    city="Jakarta",
                    latitude=-6.2088,
                    longitude=106.8456,
                    browser="Chrome",
                    os_name="Windows",
                    status="SUCCESS",
                    created_at=datetime.now(timezone.utc) - timedelta(minutes=45)
                ),
                AuditLog(
                    tenant_id=tenant_id,
                    user_id=std_user.id,
                    credential_id="FIDO2-NFC-KEY-BETA-02",
                    client_id="client_fintech_paysecure",
                    event_type="login_success",
                    ip_address="13.229.0.1",
                    country="SG",
                    city="Singapore",
                    latitude=1.3521,
                    longitude=103.8198,
                    browser="Firefox",
                    os_name="macOS",
                    status="SUCCESS",
                    created_at=datetime.now(timezone.utc) - timedelta(hours=2)
                ),
                AuditLog(
                    tenant_id=tenant_id,
                    user_id=std_user.id,
                    credential_id="FIDO2-NFC-KEY-REVOKED-03",
                    client_id="client_portal_alpha",
                    event_type="login_blocked",
                    ip_address="103.10.67.1",
                    country="ID",
                    city="Surabaya",
                    latitude=-7.2575,
                    longitude=112.7521,
                    browser="Safari",
                    os_name="iOS",
                    status="BLOCKED",
                    created_at=datetime.now(timezone.utc) - timedelta(hours=5)
                ),
                AuditLog(
                    tenant_id=tenant_id,
                    user_id=std_user.id,
                    credential_id="FIDO2-NFC-KEY-ALPHA-01",
                    client_id="client_portal_alpha",
                    event_type="geofence_blocked",
                    ip_address="194.26.29.1",
                    country="KP",
                    city="Pyongyang",
                    latitude=39.0392,
                    longitude=125.7625,
                    browser="Chrome",
                    os_name="Linux",
                    status="BLOCKED",
                    created_at=datetime.now(timezone.utc) - timedelta(hours=8)
                ),
            ]
            session.add_all(sample_logs)
            logger.info("Created Sample Telemetry Audit Logs.")

    logger.info("Database seeding completed successfully.")


if __name__ == "__main__":
    asyncio.run(seed_database())
