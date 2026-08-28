import time
import logging
from typing import Optional, Tuple
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from backend.app.core.config import settings
from backend.app.core.redis import redis_manager

logger = logging.getLogger("catauth.rate_limiter")


class TokenBucketRateLimiter:
    """
    Edge Proxy / Ingress Token Bucket Rate Limiter (Node 7 / node-12).
    Evaluated before requests touch FastAPI core application logic.
    Protects against volumetric DDoS and endpoint exhaustion.
    """

    def __init__(self, rate: float = 10.0, capacity: int = 20):
        self.rate = rate          # Tokens per second
        self.capacity = capacity  # Max burst tokens

    async def check_rate_limit(self, client_ip: str, path: str) -> Tuple[bool, int, float]:
        """
        Checks and consumes a token for the given client_ip + path bucket.
        Returns: (allowed: bool, remaining_tokens: int, reset_time: float)
        """
        now = time.time()
        bucket_key = f"rate_limit:{client_ip}:{path}"
        redis_client = redis_manager.client

        # Fetch bucket state: string format "tokens:last_updated"
        state = await redis_client.get(bucket_key)
        if state:
            try:
                tokens_str, last_updated_str = state.split(":")
                tokens = float(tokens_str)
                last_updated = float(last_updated_str)
            except Exception:
                tokens = float(self.capacity)
                last_updated = now
        else:
            tokens = float(self.capacity)
            last_updated = now

        # Replenish tokens based on elapsed time
        elapsed = now - last_updated
        tokens = min(float(self.capacity), tokens + (elapsed * self.rate))

        if tokens >= 1.0:
            # Consume 1 token
            tokens -= 1.0
            new_state = f"{tokens}:{now}"
            # TTL: ceil(capacity / rate) + 5
            await redis_client.setex(bucket_key, int(self.capacity / self.rate) + 10, new_state)
            return True, int(tokens), now + (1.0 / self.rate)
        else:
            # Rate limit exceeded
            retry_after = (1.0 - tokens) / self.rate
            return False, 0, now + retry_after


rate_limiter = TokenBucketRateLimiter(
    rate=settings.RATE_LIMIT_TOKENS_PER_SEC,
    capacity=settings.RATE_LIMIT_BURST_CAPACITY
)


class EdgeProxyRateLimitMiddleware(BaseHTTPMiddleware):
    """
    FastAPI Middleware simulating Edge Proxy Ingress Rate Limiting (Envoy/Cloudflare).
    """

    async def dispatch(self, request: Request, call_next):
        # Exclude static assets and health metrics from strict rate limiting
        if request.url.path in ["/health", "/metrics", "/docs", "/openapi.json"] or request.url.path.startswith("/static"):
            return await call_next(request)

        client_ip = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for") or request.client.host
        path = request.url.path

        allowed, remaining, reset_time = await rate_limiter.check_rate_limit(client_ip, path)

        if not allowed:
            logger.warning(f"Edge Ingress Rate limit exceeded for IP {client_ip} on {path}")
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "success": False,
                    "error": {
                        "code": "RATE_LIMIT_EXCEEDED",
                        "message": "Too many requests. Edge proxy rate limit triggered.",
                        "details": {"remaining": 0, "reset_in_seconds": round(reset_time - time.time(), 2)}
                    }
                },
                headers={
                    "Retry-After": str(max(1, int(reset_time - time.time()))),
                    "X-RateLimit-Limit": str(settings.RATE_LIMIT_BURST_CAPACITY),
                    "X-RateLimit-Remaining": "0"
                }
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(settings.RATE_LIMIT_BURST_CAPACITY)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response
