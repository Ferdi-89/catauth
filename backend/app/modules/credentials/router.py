from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update, desc
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import UnitOfWork
from backend.app.models.entities import FIDO2Credential, User
from backend.app.schemas.common import (
    StandardResponse, FIDO2CredentialEnrollRequest
)

router = APIRouter(prefix="/admin/credentials", tags=["Admin - FIDO2 Token Provisioning"])


@router.get("", response_model=StandardResponse)
async def list_credentials(tenant_id: str = "default-tenant"):
    """
    Lists registered FIDO2 hardware tokens (Node 52 / node-44).
    """
    async with UnitOfWork(tenant_id=tenant_id) as session:
        stmt = select(FIDO2Credential).where(
            FIDO2Credential.tenant_id == tenant_id
        ).order_by(desc(FIDO2Credential.created_at))
        
        creds = (await session.execute(stmt)).scalars().all()
        
        data = [
            {
                "id": c.id,
                "user_id": c.user_id,
                "credential_id": c.credential_id,
                "label": c.label,
                "sign_count": c.sign_count,
                "aaguid": c.aaguid,
                "transports": c.transports,
                "is_active": c.is_active,
                "revoked_at": c.revoked_at.isoformat() if c.revoked_at else None,
                "revocation_reason": c.revocation_reason,
                "last_used_at": c.last_used_at.isoformat() if c.last_used_at else None,
                "created_at": c.created_at.isoformat() if c.created_at else None
            }
            for c in creds
        ]
        return StandardResponse(data=data)


@router.post("/enroll", response_model=StandardResponse)
async def enroll_fido2_credential(
    payload: FIDO2CredentialEnrollRequest,
    tenant_id: str = "default-tenant"
):
    """
    Enrolls and pairs a new WebAuthn/FIDO2 NFC Hardware Token to a user (Node 53 & 54).
    """
    async with UnitOfWork(tenant_id=tenant_id) as session:
        # Check user exists
        user_stmt = select(User).where(User.id == payload.user_id, User.tenant_id == tenant_id)
        user = (await session.execute(user_stmt)).scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        # Check existing credential ID
        existing_stmt = select(FIDO2Credential).where(
            FIDO2Credential.credential_id == payload.credential_id
        )
        existing = (await session.execute(existing_stmt)).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=400, detail="Credential ID already registered.")

        new_cred = FIDO2Credential(
            tenant_id=tenant_id,
            user_id=payload.user_id,
            credential_id=payload.credential_id,
            public_key_cose=payload.public_key_cose,
            sign_count=payload.sign_count,
            label=payload.label,
            aaguid=payload.aaguid,
            transports=payload.transports,
            is_active=True
        )
        session.add(new_cred)
        await session.flush()

        return StandardResponse(
            data={"id": new_cred.id, "credential_id": new_cred.credential_id, "label": new_cred.label},
            message="FIDO2 Hardware token successfully enrolled and paired."
        )


@router.patch("/{credential_id}/status", response_model=StandardResponse)
async def toggle_credential_status(
    credential_id: str,
    is_active: bool,
    reason: Optional[str] = "Admin action",
    tenant_id: str = "default-tenant"
):
    """
    Blocks or reactivates a FIDO2 token (Node 19 & 20).
    """
    async with UnitOfWork(tenant_id=tenant_id) as session:
        stmt = select(FIDO2Credential).where(
            FIDO2Credential.credential_id == credential_id,
            FIDO2Credential.tenant_id == tenant_id
        )
        cred = (await session.execute(stmt)).scalar_one_or_none()
        if not cred:
            raise HTTPException(status_code=404, detail="Credential token not found.")

        cred.is_active = is_active
        if not is_active:
            cred.revoked_at = datetime.now(timezone.utc)
            cred.revocation_reason = reason
        else:
            cred.revoked_at = None
            cred.revocation_reason = None

        return StandardResponse(
            message=f"Credential status updated to {'Active' if is_active else 'Blocked'}."
        )
