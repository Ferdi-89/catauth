from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import UnitOfWork
from backend.app.core.circuit_breaker import get_circuit_breaker, CircuitState, circuit_breakers
from backend.app.models.entities import DLQWebhook
from backend.app.modules.outbox_dlq.service import OutboxDLQService
from backend.app.schemas.common import StandardResponse, DLQReplayRequest

router = APIRouter(prefix="/dlq", tags=["DLQ & Reconciler"])


@router.get("/list", response_model=StandardResponse)
async def list_dlq_messages(
    tenant_id: str = "default-tenant",
    status_filter: Optional[str] = None
):
    """
    List messages in Dead-Letter Queue (Node 70 / node-60).
    """
    async with UnitOfWork(tenant_id=tenant_id) as session:
        stmt = select(DLQWebhook).where(DLQWebhook.tenant_id == tenant_id)
        if status_filter:
            stmt = stmt.where(DLQWebhook.status == status_filter)
        stmt = stmt.order_by(desc(DLQWebhook.created_at)).limit(50)
        
        items = (await session.execute(stmt)).scalars().all()
        
        data = [
            {
                "id": item.id,
                "outbox_event_id": item.outbox_event_id,
                "client_id": item.client_id,
                "target_url": item.target_url,
                "payload": item.payload,
                "retry_count": item.retry_count,
                "last_error": item.last_error,
                "status": item.status,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "updated_at": item.updated_at.isoformat() if item.updated_at else None
            }
            for item in items
        ]
        return StandardResponse(data=data)


@router.post("/replay", response_model=StandardResponse)
async def trigger_dlq_replay(
    payload: DLQReplayRequest,
    tenant_id: str = "default-tenant"
):
    """
    Triggers automated or manual DLQ replay reconciliation (Node 72 / node-72).
    """
    result = await OutboxDLQService.reconcile_and_replay_dlq(
        tenant_id=tenant_id,
        dlq_id=payload.dlq_id
    )
    return StandardResponse(data=result, message="DLQ Reconciliation job executed.")


@router.get("/circuit-breakers", response_model=StandardResponse)
async def list_circuit_breakers():
    """
    Inspects state of all PyBreaker circuit breakers (Node 64 / node-68).
    """
    statuses = [cb.get_status() for cb in circuit_breakers.values()]
    # If empty, include default
    if not statuses:
        statuses.append(get_circuit_breaker("global_webhook").get_status())
    return StandardResponse(data=statuses)


@router.post("/circuit-breakers/override", response_model=StandardResponse)
async def override_circuit_breaker(client_id: str, new_state: CircuitState):
    """
    Manually overrides circuit breaker state (CLOSED, OPEN, HALF_OPEN) for testing.
    """
    breaker = get_circuit_breaker(client_id)
    breaker.force_state(new_state)
    return StandardResponse(data=breaker.get_status(), message=f"Circuit breaker set to {new_state}")
