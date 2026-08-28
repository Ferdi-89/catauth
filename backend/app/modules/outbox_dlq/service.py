import asyncio
import json
import logging
import time
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.core.redis import redis_manager
from backend.app.core.circuit_breaker import get_circuit_breaker, CircuitState
from backend.app.core.database import UnitOfWork
from backend.app.models.entities import TransactionalOutbox, DLQWebhook, ClientApp
from backend.app.modules.telemetry.service import DLQ_PENDING_GAUGE, CIRCUIT_BREAKER_GAUGE

logger = logging.getLogger("catauth.outbox_dlq")


class OutboxDLQService:
    """
    Zero-Polling Postgres WAL CDC Outbox, Redis Streams Purge,
    PyBreaker Webhook Dispatcher, and Automated DLQ Reconciler (Nodes 61-72).
    """

    @staticmethod
    async def publish_outbox_to_stream(outbox_event: TransactionalOutbox) -> str:
        """
        Publishes transactional outbox event to Redis Streams `outbox:events` (Node 62 / node-70).
        Emulates PostgreSQL Logical Replication WAL CDC.
        """
        client = redis_manager.client
        payload_str = json.dumps(outbox_event.payload) if isinstance(outbox_event.payload, dict) else str(outbox_event.payload)
        
        event_data = {
            "outbox_id": str(outbox_event.id),
            "tenant_id": str(outbox_event.tenant_id),
            "event_type": str(outbox_event.event_type),
            "aggregate_type": str(outbox_event.aggregate_type),
            "aggregate_id": str(outbox_event.aggregate_id),
            "payload": payload_str,
            "created_at": outbox_event.created_at.isoformat() if outbox_event.created_at else datetime.now(timezone.utc).isoformat()
        }
        
        entry_id = await client.xadd("outbox:events", event_data)
        logger.info(f"WAL CDC Engine streamed event {outbox_event.event_type} [ID: {entry_id}] to Redis Streams")
        return entry_id

    @staticmethod
    async def process_stream_event(event_data: Dict[str, Any]):
        """
        Consumes event from stream, purges session in Redis, and initiates partner webhook dispatch (Nodes 63, 64, 65).
        """
        event_type = event_data.get("event_type")
        payload_raw = event_data.get("payload", "{}")
        payload = json.loads(payload_raw) if isinstance(payload_raw, str) else payload_raw
        tenant_id = event_data.get("tenant_id", "default-tenant")

        logger.info(f"Stream Consumer received event: {event_type} for aggregate {event_data.get('aggregate_id')}")

        if event_type == "session.revoked":
            token_hash = payload.get("token_hash")
            session_id = payload.get("session_id")
            client_id = payload.get("client_id")
            
            # Node 63: Purge Cache Sesi Redis
            redis_client = redis_manager.client
            if token_hash:
                await redis_client.delete(f"session:{token_hash}")
                logger.info(f"Purged Redis active session cache key: session:{token_hash}")
            if session_id:
                await redis_client.delete(f"session:id:{session_id}")

            # Node 64 & 65: Dispatch Back-Channel Webhook to Client App
            if client_id:
                asyncio.create_task(
                    OutboxDLQService.dispatch_webhook_with_circuit_breaker(
                        tenant_id=tenant_id,
                        client_id=client_id,
                        event_id=event_data.get("outbox_id"),
                        payload=payload
                    )
                )

    @staticmethod
    async def dispatch_webhook_with_circuit_breaker(
        tenant_id: str,
        client_id: str,
        event_id: Optional[str],
        payload: Dict[str, Any]
    ) -> bool:
        """
        Dispatches Back-Channel Logout Webhook with PyBreaker & Exponential Backoff (Nodes 64, 65, 69, 70).
        """
        breaker = get_circuit_breaker(client_id)
        CIRCUIT_BREAKER_GAUGE.labels(client_id=client_id).set(
            0 if breaker.state == CircuitState.CLOSED else (1 if breaker.state == CircuitState.HALF_OPEN else 2)
        )

        # 1. Look up client webhook URL
        webhook_url = None
        async with UnitOfWork(tenant_id=tenant_id) as session:
            stmt = select(ClientApp).where(ClientApp.client_id == client_id)
            client_app = (await session.execute(stmt)).scalar_one_or_none()
            if client_app and client_app.webhook_logout_url:
                webhook_url = client_app.webhook_logout_url

        if not webhook_url:
            logger.info(f"Client {client_id} has no webhook_logout_url configured; skipping broadcast.")
            return True

        # 2. Node 64: Evaluasi Circuit Breaker
        if not breaker.is_available():
            logger.warning(
                f"Circuit Breaker is OPEN for client {client_id}! Bypassing webhook call directly to DLQ."
            )
            await OutboxDLQService.route_to_dlq(
                tenant_id=tenant_id,
                outbox_event_id=event_id,
                client_id=client_id,
                target_url=webhook_url,
                payload=payload,
                error_msg="Circuit breaker is OPEN (Fail-fast protection)"
            )
            return False

        # 3. Node 65: Broadcast Webhook with 2000ms timeout and 3x retry exponential backoff
        timeout_seconds = settings.WEBHOOK_TIMEOUT_MS / 1000.0
        success = False
        last_error = ""

        async with httpx.AsyncClient(timeout=timeout_seconds) as http_client:
            for attempt in range(1, settings.WEBHOOK_MAX_RETRIES + 1):
                try:
                    logger.info(
                        f"Dispatching Back-Channel Logout to {webhook_url} (Attempt {attempt}/{settings.WEBHOOK_MAX_RETRIES})"
                    )
                    resp = await http_client.post(
                        webhook_url,
                        json={
                            "event": "backchannel_logout",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "data": payload
                        }
                    )
                    if 200 <= resp.status_code < 300:
                        logger.info(f"Webhook successfully delivered to {webhook_url} (HTTP {resp.status_code})")
                        breaker.record_success()
                        success = True
                        break
                    else:
                        last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                        breaker.record_failure()
                except Exception as e:
                    last_error = str(e)
                    breaker.record_failure()
                    logger.warning(f"Webhook delivery attempt {attempt} failed: {e}")

                # Exponential backoff: 0.1s, 0.2s, 0.4s
                if attempt < settings.WEBHOOK_MAX_RETRIES:
                    await asyncio.sleep(0.1 * (2 ** (attempt - 1)))

        CIRCUIT_BREAKER_GAUGE.labels(client_id=client_id).set(
            0 if breaker.state == CircuitState.CLOSED else (1 if breaker.state == CircuitState.HALF_OPEN else 2)
        )

        # 4. Node 69 & Node 70: If all retries failed, route to DLQ
        if not success:
            logger.error(f"Webhook delivery to {webhook_url} failed after 3 attempts. Routing to DLQ.")
            await OutboxDLQService.route_to_dlq(
                tenant_id=tenant_id,
                outbox_event_id=event_id,
                client_id=client_id,
                target_url=webhook_url,
                payload=payload,
                error_msg=last_error
            )
            return False

        return True

    @staticmethod
    async def route_to_dlq(
        tenant_id: str,
        outbox_event_id: Optional[str],
        client_id: str,
        target_url: str,
        payload: Dict[str, Any],
        error_msg: str
    ) -> DLQWebhook:
        """
        Saves failed webhook to Dead-Letter Queue (DLQ) and updates Prometheus metrics (Node 70 & 71).
        """
        async with UnitOfWork(tenant_id=tenant_id) as session:
            dlq_item = DLQWebhook(
                tenant_id=tenant_id,
                outbox_event_id=outbox_event_id,
                client_id=client_id,
                target_url=target_url,
                payload=payload,
                retry_count=settings.WEBHOOK_MAX_RETRIES,
                last_error=error_msg,
                status="PENDING"
            )
            session.add(dlq_item)
            await session.flush()
            
            # Count pending DLQ
            count_stmt = select(DLQWebhook).where(
                DLQWebhook.tenant_id == tenant_id,
                DLQWebhook.status == "PENDING"
            )
            count = len((await session.execute(count_stmt)).scalars().all())
            DLQ_PENDING_GAUGE.set(count)
            
            if count >= settings.PROMETHEUS_DLQ_ALERT_THRESHOLD:
                logger.critical(
                    f"PROMETHEUS ALERT TRIGGERED! DLQ pending messages ({count}) exceeded threshold ({settings.PROMETHEUS_DLQ_ALERT_THRESHOLD})"
                )

            return dlq_item

    @staticmethod
    async def reconcile_and_replay_dlq(tenant_id: str, dlq_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Automated DLQ Reconciler Replay Job (Node 72 / node-72).
        Attempts to replay pending DLQ messages when Circuit Breaker recovers.
        """
        replayed = 0
        succeeded = 0
        failed = 0

        async with UnitOfWork(tenant_id=tenant_id) as session:
            if dlq_id:
                stmt = select(DLQWebhook).where(
                    DLQWebhook.id == dlq_id,
                    DLQWebhook.tenant_id == tenant_id
                )
            else:
                stmt = select(DLQWebhook).where(
                    DLQWebhook.tenant_id == tenant_id,
                    DLQWebhook.status == "PENDING"
                )
            
            items = (await session.execute(stmt)).scalars().all()
            
            for item in items:
                replayed += 1
                breaker = get_circuit_breaker(item.client_id)
                # If circuit breaker is now healthy or half-open
                if breaker.is_available():
                    # Attempt single replay
                    try:
                        async with httpx.AsyncClient(timeout=2.0) as http_client:
                            resp = await http_client.post(
                                item.target_url,
                                json={
                                    "event": "backchannel_logout_reconciled",
                                    "dlq_id": item.id,
                                    "timestamp": datetime.now(timezone.utc).isoformat(),
                                    "data": item.payload
                                }
                            )
                            if 200 <= resp.status_code < 300:
                                item.status = "RECONCILED"
                                breaker.record_success()
                                succeeded += 1
                            else:
                                item.last_error = f"Replay HTTP {resp.status_code}: {resp.text[:200]}"
                                breaker.record_failure()
                                failed += 1
                    except Exception as e:
                        item.last_error = f"Replay exception: {str(e)}"
                        breaker.record_failure()
                        failed += 1
                else:
                    item.last_error = "Reconciler skipped: Circuit breaker remains OPEN"
                    failed += 1

        return {
            "total_replayed": replayed,
            "succeeded": succeeded,
            "failed": failed,
            "status": "COMPLETED"
        }
