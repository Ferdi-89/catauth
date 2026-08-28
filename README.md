# CATAUTH — NFC Auth Gateway & Admin Telemetry
**Schema Version:** `v0.3.0` | **Architecture:** Modular Monolith & Event-Driven CDC Engine | **Design System:** Bento Grid UI

---

## 1. Executive Summary & Key Invariants
Catauth is an enterprise-grade WebAuthn/FIDO2 NFC Authentication Gateway and Admin Telemetry system built upon the Margaret Architecture Blueprint Engine specification (72 workflow nodes).

1. **Hardware FIDO2 NFC Authentication**: Strict Relying Party (`rpId`) and origin binding with static zero `sign_count` tolerance anti-cloning protection.
2. **Edge Ingress Token Bucket Rate Limiting**: Ingress/Envoy proxy filter (10 req/s, burst 20) protecting FastAPI runtime from volumetric DDoS.
3. **Atomic Nonce Anti-Replay**: Redis atomic `GETDEL challenge:<id>` operations preventing all replay vectors in a single step.
4. **Redis Singleflight Dead-Man Lock**: Distributed mutex with 1500ms Dead-Man TTL and jittered exponential backoff preventing database cache stampedes on session misses.
5. **Supavisor Unit-of-Work `SET LOCAL` Tenant Isolation**: Transaction-scoped `BEGIN...COMMIT` with `SET LOCAL app.current_tenant_id = :id` guaranteeing zero state-bleeding in pooled connections.
6. **Zero-Polling Postgres WAL CDC Outbox**: Logical replication outbox streaming to Redis Streams `outbox:events` for instantaneous session cache invalidation.
7. **PyBreaker & Automated DLQ Reconciler**: Circuit breaker protection (2000ms timeout, 3x exponential backoff) with Prometheus DLQ lag threshold alerting and automated replay reconciliation.

---

## 2. Directory Structure & Modular Monolith Layout

```
Catauth/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py              # Central Pydantic settings & invariants
│   │   │   ├── database.py            # Async engine, UnitOfWork SET LOCAL guard
│   │   │   ├── redis.py               # Dual-mode Redis (GETDEL, Singleflight, Streams)
│   │   │   ├── security.py            # Argon2id, JWT, PKCE, WebAuthn strict verification
│   │   │   ├── rate_limiter.py        # Edge Token Bucket Ingress Rate Limiter
│   │   │   └── circuit_breaker.py     # PyBreaker Circuit Breaker Engine
│   │   ├── models/                    # SQLAlchemy ORM entities
│   │   ├── schemas/                   # Pydantic validation & standardized error schemas
│   │   ├── modules/
│   │   │   ├── auth/                  # SSO, Challenge, Nonce, PIN MFA, OAuth token, Introspect
│   │   │   ├── clients/               # Client apps CRUD & whitelist
│   │   │   ├── credentials/           # FIDO2 Hardware Token provisioning & status
│   │   │   ├── admin/                 # RBAC, Policies, Immediate Revocation Outbox
│   │   │   ├── telemetry/             # GeoIP resolver, Audit logs, Prometheus metrics
│   │   │   └── outbox_dlq/            # WAL CDC Engine, Webhook Relay, DLQ Reconciler
│   │   ├── main.py                    # FastAPI application, CORS, lifespan, Prometheus /metrics
│   │   └── seed.py                    # Rich demo seed data (Admin, Clients, FIDO2 tokens)
│   ├── tests/
│   │   ├── test_all_nodes.py          # Complete pytest suite covering all 72 blueprint nodes
│   │   └── conftest.py
│   ├── envoy.yaml                     # Envoy Ingress Proxy configuration
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx               # System Hub & Architecture Explorer
│   │   │   ├── sso/login/page.tsx     # SSO Client Gateway (Nodes 1-33)
│   │   │   ├── sso/callback/page.tsx  # Mitra token exchange & claims viewer
│   │   │   ├── admin/dashboard/       # Bento Grid UI Dashboard (Nodes 45-60)
│   │   │   ├── admin/clients/         # Client App Registry (Nodes 49-51)
│   │   │   ├── admin/keys/            # FIDO2 Hardware Token Manager (Nodes 52-54)
│   │   │   ├── admin/policies/        # Security Policies & TTL (Nodes 57-58)
│   │   │   ├── admin/dlq/             # DLQ Inspector & Reconciler Replay (Nodes 70-72)
│   │   │   ├── admin/topology/        # Interactive 72-Node Live Workflow Visualizer
│   │   │   └── simulator/             # Security & Attack Simulation Playground
│   │   ├── components/                # Bento Grid & Navigation components
│   │   ├── lib/                       # Typed API client & 72-node dataset
│   │   └── styles/                    # Bento UI CSS tokens & glassmorphic styling
│   └── package.json
└── README.md
```

---

## 3. Quick Start & Execution

### 1. Backend Server (FastAPI on Port 8000)
```bash
# Activate virtual environment
.\venv\Scripts\activate

# Launch FastAPI application with uvicorn
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
- **Swagger Documentation:** `http://localhost:8000/docs`
- **Prometheus Metrics:** `http://localhost:8000/metrics`
- **Health Check:** `http://localhost:8000/health`

### 2. Frontend Development Server (Next.js 14 on Port 3000)
```bash
cd frontend
npm.cmd run dev
```
- Open `http://localhost:3000` in your browser.

### 3. Running Automated Test Suite
```bash
.\venv\Scripts\pytest backend\tests\ -v
```
All 9 automated integration tests covering the complete 72-node workflow graph execute and pass with 100% success.
