import json
import logging
import random
import time
from typing import Dict, Any, Optional, Tuple, List
from datetime import datetime, timezone, timedelta
from fastapi import Request
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

from backend.app.models.entities import AuditLog, Session, User, DLQWebhook
from backend.app.core.config import settings

logger = logging.getLogger("catauth.telemetry")

# Prometheus Metrics Definitions
AUTH_REQUESTS_TOTAL = Counter(
    "nfc_auth_requests_total",
    "Total NFC / WebAuthn authentication attempts",
    ["status", "client_id"]
)
AUTH_LATENCY_HISTOGRAM = Histogram(
    "nfc_auth_duration_seconds",
    "Time spent in WebAuthn authentication flow",
    ["step"]
)
CIRCUIT_BREAKER_GAUGE = Gauge(
    "circuit_breaker_state",
    "Current state of circuit breaker (0=CLOSED, 1=HALF_OPEN, 2=OPEN)",
    ["client_id"]
)
DLQ_PENDING_GAUGE = Gauge(
    "dlq_messages_pending",
    "Number of messages pending in Dead-Letter Queue"
)
RATE_LIMIT_BLOCKED_TOTAL = Counter(
    "rate_limit_blocked_total",
    "Total requests blocked by Edge Ingress Rate Limiter"
)


# Simulated GeoIP lookup mapping
GEOIP_MAPPING = {
    "127.0.0.1": {"country": "ID", "city": "Jakarta", "lat": -6.2088, "lng": 106.8456, "reputation": "CLEAN"},
    "localhost": {"country": "ID", "city": "Jakarta", "lat": -6.2088, "lng": 106.8456, "reputation": "CLEAN"},
    "103.10.67.1": {"country": "ID", "city": "Surabaya", "lat": -7.2575, "lng": 112.7521, "reputation": "CLEAN"},
    "13.229.0.1": {"country": "SG", "city": "Singapore", "lat": 1.3521, "lng": 103.8198, "reputation": "CLEAN"},
    "54.240.196.1": {"country": "US", "city": "Seattle", "lat": 47.6062, "lng": -122.3321, "reputation": "CLEAN"},
    "133.242.0.1": {"country": "JP", "city": "Tokyo", "lat": 35.6762, "lng": 139.6503, "reputation": "CLEAN"},
    "185.220.101.5": {"country": "RU", "city": "Moscow", "lat": 55.7558, "lng": 37.6173, "reputation": "SUSPICIOUS_VPN"},
    "194.26.29.1": {"country": "KP", "city": "Pyongyang", "lat": 39.0392, "lng": 125.7625, "reputation": "BLOCKED_REGION"},
}


class TelemetryService:
    """
    Telemetry & GeoIP Resolution Service (Node 15, 28, 30, 56, 66, 71).
    """

    @staticmethod
    def resolve_geoip_and_metadata(request: Request, client_ip_override: Optional[str] = None) -> Dict[str, Any]:
        """
        Resolves GeoIP and User-Agent metadata (Node 15 / node-13).
        """
        ip = client_ip_override or request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for") or (request.client.host if request.client else "127.0.0.1")
        if "," in ip:
            ip = ip.split(",")[0].strip()

        # Check simulated map or generate consistent geo from IP hash
        if ip in GEOIP_MAPPING:
            geo_info = GEOIP_MAPPING[ip]
        else:
            # Default to Jakarta / Singapore fallback
            geo_info = {
                "country": request.headers.get("cf-ipcountry", "ID"),
                "city": "Jakarta",
                "lat": -6.2088,
                "lng": 106.8456,
                "reputation": "CLEAN"
            }

        user_agent_str = request.headers.get("user-agent", "Mozilla/5.0 Chrome/122.0.0")
        
        # Parse basic browser
        browser = "Chrome"
        if "Firefox" in user_agent_str:
            browser = "Firefox"
        elif "Safari" in user_agent_str and "Chrome" not in user_agent_str:
            browser = "Safari"
        elif "Edge" in user_agent_str:
            browser = "Edge"

        os_name = "Windows"
        if "Macintosh" in user_agent_str:
            os_name = "macOS"
        elif "Linux" in user_agent_str:
            os_name = "Linux"
        elif "Android" in user_agent_str:
            os_name = "Android"
        elif "iPhone" in user_agent_str or "iPad" in user_agent_str:
            os_name = "iOS"

        return {
            "ip": ip,
            "country": geo_info["country"],
            "city": geo_info["city"],
            "latitude": geo_info["lat"],
            "longitude": geo_info["lng"],
            "reputation": geo_info["reputation"],
            "browser": browser,
            "os_name": os_name,
            "user_agent": user_agent_str
        }

    @staticmethod
    async def record_audit_log(
        session: AsyncSession,
        tenant_id: str,
        event_type: str,
        status: str,
        user_id: Optional[str] = None,
        credential_id: Optional[str] = None,
        client_id: Optional[str] = None,
        geo_metadata: Optional[Dict[str, Any]] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> AuditLog:
        """
        Saves Audit Log into database (Node 28 / node-24) & increments Prometheus counter.
        """
        geo = geo_metadata or {}
        audit = AuditLog(
            tenant_id=tenant_id,
            user_id=user_id,
            credential_id=credential_id,
            client_id=client_id,
            event_type=event_type,
            ip_address=geo.get("ip"),
            country=geo.get("country"),
            city=geo.get("city"),
            latitude=geo.get("latitude"),
            longitude=geo.get("longitude"),
            browser=geo.get("browser"),
            os_name=geo.get("os_name"),
            status=status,
            details_json=details or {}
        )
        session.add(audit)
        
        # Prometheus metric bump
        AUTH_REQUESTS_TOTAL.labels(status=status, client_id=client_id or "unknown").inc()
        return audit

    @staticmethod
    async def get_dashboard_metrics(session: AsyncSession, tenant_id: str) -> Dict[str, Any]:
        """
        Aggregates dashboard stats and geographic distribution (Node 56 / node-48).
        """
        now = datetime.now(timezone.utc)
        one_day_ago = now - timedelta(days=1)

        # 1. Total Audits and success/failure counts in last 24h
        total_logs_stmt = select(func.count(AuditLog.id)).where(AuditLog.tenant_id == tenant_id)
        total_logs = (await session.execute(total_logs_stmt)).scalar() or 0

        success_stmt = select(func.count(AuditLog.id)).where(
            AuditLog.tenant_id == tenant_id,
            AuditLog.status == "SUCCESS"
        )
        success_count = (await session.execute(success_stmt)).scalar() or 0

        failed_stmt = select(func.count(AuditLog.id)).where(
            AuditLog.tenant_id == tenant_id,
            AuditLog.status.in_(["FAILED", "BLOCKED", "ANOMALY"])
        )
        failed_count = (await session.execute(failed_stmt)).scalar() or 0

        # 2. Active Sessions count
        active_sessions_stmt = select(func.count(Session.id)).where(
            Session.tenant_id == tenant_id,
            Session.is_revoked == False,
            Session.expires_at > now
        )
        active_sessions = (await session.execute(active_sessions_stmt)).scalar() or 0

        # 3. Country distribution
        country_stmt = select(
            AuditLog.country, func.count(AuditLog.id)
        ).where(
            AuditLog.tenant_id == tenant_id
        ).group_by(AuditLog.country).order_by(desc(func.count(AuditLog.id))).limit(10)
        
        country_rows = (await session.execute(country_stmt)).all()
        countries = [{"country": r[0] or "Unknown", "count": r[1]} for r in country_rows]

        # 4. Recent audit logs
        recent_stmt = select(AuditLog).where(
            AuditLog.tenant_id == tenant_id
        ).order_by(desc(AuditLog.created_at)).limit(20)
        recent_rows = (await session.execute(recent_stmt)).scalars().all()
        
        recent_logs = [
            {
                "id": a.id,
                "event_type": a.event_type,
                "status": a.status,
                "user_id": a.user_id,
                "client_id": a.client_id,
                "ip_address": a.ip_address,
                "country": a.country,
                "city": a.city,
                "latitude": a.latitude,
                "longitude": a.longitude,
                "browser": a.browser,
                "created_at": a.created_at.isoformat() if a.created_at else None
            }
            for a in recent_rows
        ]

        # 5. DLQ Pending Count
        dlq_pending_stmt = select(func.count(DLQWebhook.id)).where(
            DLQWebhook.tenant_id == tenant_id,
            DLQWebhook.status == "PENDING"
        )
        dlq_pending_count = (await session.execute(dlq_pending_stmt)).scalar() or 0
        DLQ_PENDING_GAUGE.set(dlq_pending_count)

        return {
            "total_authentications": total_logs,
            "success_authentications": success_count,
            "failed_authentications": failed_count,
            "success_rate": round((success_count / total_logs * 100) if total_logs > 0 else 100.0, 2),
            "active_sessions": active_sessions,
            "dlq_pending_count": dlq_pending_count,
            "countries": countries,
            "recent_logs": recent_logs,
            "timestamp": now.isoformat()
        }
