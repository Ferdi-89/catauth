import secrets
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import UnitOfWork
from backend.app.core.security import hash_pin_or_password
from backend.app.models.entities import ClientApp
from backend.app.schemas.common import (
    StandardResponse, ClientCreateRequest, ClientUpdateRequest
)

router = APIRouter(prefix="/admin/clients", tags=["Admin - Client Management"])


@router.get("", response_model=StandardResponse)
async def list_clients(tenant_id: str = "default-tenant"):
    """
    Lists registered client applications (Node 49 / node-41).
    """
    async with UnitOfWork(tenant_id=tenant_id) as session:
        stmt = select(ClientApp).where(ClientApp.tenant_id == tenant_id)
        clients = (await session.execute(stmt)).scalars().all()
        
        data = [
            {
                "id": c.id,
                "client_id": c.client_id,
                "app_name": c.app_name,
                "app_logo_url": c.app_logo_url,
                "redirect_uris": c.redirect_uris,
                "allowed_origins": c.allowed_origins,
                "webhook_logout_url": c.webhook_logout_url,
                "is_active": c.is_active,
                "created_at": c.created_at.isoformat() if c.created_at else None
            }
            for c in clients
        ]
        return StandardResponse(data=data)


@router.post("", response_model=StandardResponse)
async def create_client(
    payload: ClientCreateRequest,
    tenant_id: str = "default-tenant"
):
    """
    Registers a new client website with generated client_id and raw secret (Node 50 & 51).
    """
    client_id = f"client_{secrets.token_urlsafe(12)}"
    raw_secret = f"sec_{secrets.token_urlsafe(32)}"
    secret_hash = hash_pin_or_password(raw_secret)

    async with UnitOfWork(tenant_id=tenant_id) as session:
        new_client = ClientApp(
            tenant_id=tenant_id,
            client_id=client_id,
            client_secret_hash=secret_hash,
            app_name=payload.app_name,
            app_logo_url=payload.app_logo_url,
            redirect_uris=payload.redirect_uris,
            allowed_origins=payload.allowed_origins,
            webhook_logout_url=payload.webhook_logout_url,
            is_active=True
        )
        session.add(new_client)
        await session.flush()

        return StandardResponse(
            data={
                "id": new_client.id,
                "client_id": new_client.client_id,
                "client_secret_raw": raw_secret,  # Shown only upon creation
                "app_name": new_client.app_name,
                "redirect_uris": new_client.redirect_uris,
                "allowed_origins": new_client.allowed_origins,
                "webhook_logout_url": new_client.webhook_logout_url
            },
            message="Client application registered successfully. Save the client_secret_raw securely!"
        )


@router.put("/{client_id}", response_model=StandardResponse)
async def update_client(
    client_id: str,
    payload: ClientUpdateRequest,
    tenant_id: str = "default-tenant"
):
    """
    Updates client application metadata.
    """
    async with UnitOfWork(tenant_id=tenant_id) as session:
        stmt = select(ClientApp).where(
            ClientApp.client_id == client_id,
            ClientApp.tenant_id == tenant_id
        )
        client = (await session.execute(stmt)).scalar_one_or_none()
        if not client:
            raise HTTPException(status_code=404, detail="Client app not found.")

        if payload.app_name is not None:
            client.app_name = payload.app_name
        if payload.app_logo_url is not None:
            client.app_logo_url = payload.app_logo_url
        if payload.redirect_uris is not None:
            client.redirect_uris = payload.redirect_uris
        if payload.allowed_origins is not None:
            client.allowed_origins = payload.allowed_origins
        if payload.webhook_logout_url is not None:
            client.webhook_logout_url = payload.webhook_logout_url
        if payload.is_active is not None:
            client.is_active = payload.is_active

        return StandardResponse(message="Client updated successfully.")


@router.delete("/{client_id}", response_model=StandardResponse)
async def delete_client(client_id: str, tenant_id: str = "default-tenant"):
    """
    Deletes a registered client application.
    """
    async with UnitOfWork(tenant_id=tenant_id) as session:
        stmt = select(ClientApp).where(
            ClientApp.client_id == client_id,
            ClientApp.tenant_id == tenant_id
        )
        client = (await session.execute(stmt)).scalar_one_or_none()
        if not client:
            raise HTTPException(status_code=404, detail="Client app not found.")

        await session.delete(client)
        return StandardResponse(message=f"Client '{client_id}' removed successfully.")
