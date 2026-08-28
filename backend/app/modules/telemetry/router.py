from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from backend.app.core.database import UnitOfWork
from backend.app.modules.telemetry.service import TelemetryService
from backend.app.schemas.common import StandardResponse

router = APIRouter(prefix="/telemetry", tags=["Telemetry & Metrics"])


@router.get("/dashboard", response_model=StandardResponse)
async def get_dashboard_telemetry(tenant_id: str = "default-tenant"):
    """
    Returns aggregated metrics, active sessions, and recent logs (Node 56 / node-48).
    """
    async with UnitOfWork(tenant_id=tenant_id) as session:
        metrics = await TelemetryService.get_dashboard_metrics(session, tenant_id)
        return StandardResponse(data=metrics)


@router.get("/metrics")
async def prometheus_metrics():
    """
    Prometheus metrics exporter endpoint (Node 71 / node-71).
    """
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
