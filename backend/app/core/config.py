import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "NFC Auth Gateway & Admin Telemetry"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Secret Keys & Cryptography
    SECRET_KEY: str = os.getenv("SECRET_KEY", "catauth-super-secret-key-production-hardened-2026-xyz")
    ALGORITHM: str = "HS256"
    
    # WebAuthn / FIDO2 Relying Party Configuration
    RP_ID: str = os.getenv("RP_ID", "localhost")
    RP_NAME: str = "Catauth NFC Gateway"
    ORIGIN_WHITELIST: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://catauth.io",
        "https://auth.catauth.io",
        "http://localhost:8000"
    ]
    
    # Database (Default to SQLite for zero-config portable runtime, Postgres/Supavisor capable)
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./catauth.db")
    
    # Redis & Streams
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    USE_MOCK_REDIS_IF_UNAVAILABLE: bool = True
    
    # TTL & Token Expiry Configurations
    CHALLENGE_TTL_SECONDS: int = 60           # Node 9: 60s transient challenge nonce
    AUTH_CODE_TTL_SECONDS: int = 30           # Node 29: 30s single-use auth code
    SESSION_TTL_SECONDS: int = 3600           # Node 38/39: 1 hour default session
    SINGLEFLIGHT_DEAD_MAN_TTL_MS: int = 1500  # Node 43: 1500ms dead-man lock
    
    # Edge Proxy Rate Limiting (Token Bucket)
    RATE_LIMIT_TOKENS_PER_SEC: float = 10.0   # Node 7: 10 req/s replenishment
    RATE_LIMIT_BURST_CAPACITY: int = 20       # Node 7: 20 max burst tokens
    
    # Circuit Breaker & Webhook
    CIRCUIT_BREAKER_FAIL_MAX: int = 3         # Node 64: 3 failures trip the breaker
    CIRCUIT_BREAKER_RESET_TIMEOUT_SEC: float = 10.0
    WEBHOOK_TIMEOUT_MS: int = 2000            # Node 65: 2000ms timeout
    WEBHOOK_MAX_RETRIES: int = 3              # Node 65: 3x exponential backoff
    
    # Prometheus & DLQ Thresholds
    PROMETHEUS_DLQ_ALERT_THRESHOLD: int = 5   # Node 71: Alert when DLQ messages exceed 5
    
    # Admin Credentials for bootstrapping
    DEFAULT_ADMIN_EMAIL: str = "admin@catauth.io"
    DEFAULT_ADMIN_PASSWORD: str = "AdminPass123!Secure"
    DEFAULT_ADMIN_PIN: str = "123456"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
