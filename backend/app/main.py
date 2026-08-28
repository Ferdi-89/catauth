import logging
from contextlib import asynccontextmanager
from typing import Any, Dict
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.core.config import settings
from backend.app.core.database import init_db
from backend.app.core.redis import redis_manager
from backend.app.core.rate_limiter import EdgeProxyRateLimitMiddleware
from backend.app.seed import seed_database

# Import routers
from backend.app.modules.auth.router import router as auth_router
from backend.app.modules.clients.router import router as clients_router
from backend.app.modules.credentials.router import router as credentials_router
from backend.app.modules.admin.router import router as admin_router
from backend.app.modules.telemetry.router import router as telemetry_router
from backend.app.modules.outbox_dlq.router import router as outbox_dlq_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
)
logger = logging.getLogger("catauth.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    logger.info("Starting Catauth Modular Monolith & Event-Driven CDC Engine...")
    
    # Initialize DB & Seed Demo Data
    await init_db()
    await seed_database()
    
    # Initialize Redis Manager (Live connection or In-Memory fallback)
    await redis_manager.initialize()
    
    logger.info("Catauth Engine is ready to receive requests.")
    yield
    logger.info("Shutting down Catauth Engine...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="WebAuthn/FIDO2 NFC Authentication Gateway & Admin Telemetry",
    lifespan=lifespan
)

# 1. CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow development frontends and mitra apps
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Edge Ingress Proxy Rate Limiter Middleware (Node 7 / node-12)
app.add_middleware(EdgeProxyRateLimitMiddleware)


# Standardized Error Handlers
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail
    if isinstance(detail, dict):
        code = detail.get("code", "HTTP_ERROR")
        message = detail.get("message", str(detail))
        details = detail.get("details")
    else:
        code = f"HTTP_{exc.status_code}"
        message = str(detail)
        details = None

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": code,
                "message": message,
                "details": details
            }
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Invalid request payload structure.",
                "details": {"errors": exc.errors()}
            }
        }
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled internal server error: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected internal server error occurred.",
                "details": {"error_type": type(exc).__name__, "message": str(exc)}
            }
        }
    )


# Health Check
@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "HEALTHY",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION
    }


# Standard Prometheus Metrics Root Endpoint
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from fastapi import Response

@app.get("/metrics", tags=["Telemetry & Metrics"])
async def root_prometheus_metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)



# Mock Partner Webhook Endpoint for testing Back-Channel Logout & Circuit Breakers (Node 65, 69, 70)
mock_webhook_state = {"simulate_failure": False, "received_events": []}

@app.post("/api/v1/mock/webhook-logout", tags=["Mock Partner Webhook"])
async def mock_mitra_webhook(request: Request):
    """
    Mock Partner Webhook to verify back-channel logout reception or simulate partner failure.
    """
    payload = await request.json()
    mock_webhook_state["received_events"].append(payload)
    
    if mock_webhook_state["simulate_failure"]:
        logger.warning("Mock partner webhook simulated 500 server error!")
        return JSONResponse(status_code=500, content={"error": "Partner backend service down"})
    
    logger.info(f"Mock partner webhook successfully received logout payload: {payload.get('event')}")
    return {"status": "ACKNOWLEDGED", "event": payload.get("event")}


@app.post("/api/v1/mock/toggle-webhook-failure", tags=["Mock Partner Webhook"])
async def toggle_mock_webhook_failure(simulate_failure: bool):
    """Toggle failure simulation on mock partner webhook."""
    mock_webhook_state["simulate_failure"] = simulate_failure
    return {"simulate_failure": simulate_failure}


# Mount Routers
# Authentication & OAuth routes
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(auth_router) # Support top-level /oauth/token & /oauth/introspect

# Admin & Management routes
app.include_router(admin_router, prefix=settings.API_V1_STR)
app.include_router(clients_router, prefix=settings.API_V1_STR)
app.include_router(credentials_router, prefix=settings.API_V1_STR)
app.include_router(telemetry_router, prefix=settings.API_V1_STR)
app.include_router(outbox_dlq_router, prefix=settings.API_V1_STR)
app.include_router(telemetry_router) # Support top-level /metrics
