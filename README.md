# CATAUTH — Sovereign Web NFC & FIDO2 Identity Gateway

[![Blueprint: Margaret 72-Node](https://img.shields.io/badge/Architecture-Margaret%2072--Node%20Blueprint-black?style=flat-square)](https://github.com/Ferdi-89/catauth)
[![Security: FIDO2 / Web NFC](https://img.shields.io/badge/Security-Zero--Trust%20WebAuthn%20NFC-emerald?style=flat-square)](https://github.com/Ferdi-89/catauth)
[![Tests: 100% Passed](https://img.shields.io/badge/Tests-9%2F9%20Passing-brightgreen?style=flat-square)](https://github.com/Ferdi-89/catauth)

**Catauth** adalah platform otentikasi zero-trust berbasis kartu fisik NFC (e-Money / Flazz / e-KTP / Mifare / YubiKey FIDO2) yang dilengkapi dengan sistem **Protected Links Hub**, **User Identity Binding**, **Edge Rate Limiting**, **Redis Singleflight Locking**, dan **Universal Embed API / SDK** untuk login 1-tap di website apa pun.

---

## 🚀 Alur Penggunaan (Standard Flow Usage)

Berikut adalah 4 langkah standar untuk mengimplementasikan dan menggunakan Catauth:

```
+------------------+       +-------------------+       +---------------------+       +-----------------------+
|  1. BINDING      |  -->  |  2. WHITELIST     |  -->  |  3. INTEGRATION     |  -->  |  4. TELEMETRY         |
|  Tap kartu NFC   |       |  Buat link akses  |       |  Pasang 1-Line SDK  |       |  Pantau tap kartu     |
|  & kaitkan akun  |       |  & pilih kartu    |       |  atau REST API      |       |  secara real-time     |
+------------------+       +-------------------+       +---------------------+       +-----------------------+
```

1. **Pendaftaran Kartu & Profil Akun (`/admin/keys`)**
   * Buka menu *Hardware Keys & User Vault*.
   * Tempelkan kartu fisik ke HP via sensor Web NFC (atau scan kunci FIDO2/Passkey).
   * Masukkan identitas pemilik akun: Nama Lengkap, User ID, Email, dan Role (`ADMIN`, `MANAGER`, `STAFF`, dll).
2. **Konfigurasi Akses Protected Link (`/admin/links`)**
   * Buat Protected Link baru (misal: *Alpha Portal*, *Finance Dashboard*).
   * Tentukan Target Redirect URL dan pilih daftar kartu NFC yang diizinkan (*whitelisted*).
3. **Integrasi ke Website Luar (`/admin/embed`)**
   * Pasang script SDK 1 baris kode di HTML, atau gunakan komponen React/Next.js, atau panggil REST API backend (`POST /api/v1/auth/verify-card`).
4. **Verifikasi & Telemetri Real-time (`/admin/dashboard`)**
   * Pengguna melakukan 1-Tap kartu NFC di HP mereka.
   * Sistem otomatis memvalidasi keaslian kartu dan mencocokkannya dengan whitelist link.
   * Admin memantau log akses, geographic distribution, dan status circuit breaker secara live.

---

## ⚡ Prosedur Integrasi Embed API & SDK

### 1. Metode 1-Line HTML / JavaScript SDK (Universal)
Cukup sertakan SDK di website Anda:

```html
<!-- 1. Pasang Script SDK Catauth -->
<script src="https://catauth.vercel.app/sdk/catauth.js"></script>

<!-- 2. Tambahkan wadah tombol Login -->
<div id="catauth-login-container"></div>

<script>
  // 3. Render tombol 'Sign in with Catauth NFC'
  Catauth.renderButton('#catauth-login-container', {
    linkId: 'lnk_alpha_portal',
    theme: 'dark',
    text: 'Sign in with Catauth NFC',
    onSuccess: function(authData) {
      console.log('Login Berhasil!', authData);
      // authData.user -> { user_id, name, user_email, user_role, card_id }
      // authData.auth_token -> Signed JWT Token
      localStorage.setItem('auth_token', authData.auth_token);
      window.location.href = authData.redirect_url || '/dashboard';
    },
    onError: function(err) {
      alert('Login Gagal: ' + err.message);
    }
  });
</script>
```

### 2. Metode REST API Backend (Direct Auth)
Kirim permintaan `POST` langsung dari backend server Anda:

**Endpoint:** `POST https://catauth.vercel.app/api/v1/auth/verify-card`  
**Headers:** `Content-Type: application/json`

#### cURL Request
```bash
curl -X POST "https://catauth.vercel.app/api/v1/auth/verify-card" \
  -H "Content-Type: application/json" \
  -d '{
    "card_id": "NFC-UID-04A23B4C",
    "link_id": "lnk_alpha_portal"
  }'
```

#### Node.js / Express
```javascript
const response = await fetch('https://catauth.vercel.app/api/v1/auth/verify-card', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    card_id: req.body.card_id,
    link_id: 'lnk_alpha_portal'
  }),
});

const result = await response.json();
if (result.authenticated) {
  req.session.user = result.user;
  res.json({ success: true, user: result.user });
}
```

#### Python (FastAPI / Flask)
```python
import requests

response = requests.post(
    "https://catauth.vercel.app/api/v1/auth/verify-card",
    json={"card_id": card_id, "link_id": "lnk_alpha_portal"},
    timeout=5
)
data = response.json()
if data.get("authenticated"):
    user_data = data.get("user")
```

#### Format JSON Response Berhasil (200 OK)
```json
{
  "success": true,
  "authenticated": true,
  "user": {
    "user_id": "usr_ferdi_admin",
    "name": "Ferdi Pratama",
    "user_email": "ferdi@catauth.io",
    "user_role": "ADMIN",
    "card_id": "FIDO2-NFC-KEY-ALPHA-01",
    "card_label": "YubiKey 5 NFC (Alpha Key)"
  },
  "auth_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "redirect_url": "https://alpha.internal-portal.corp/dashboard",
  "link": {
    "id": "lnk_alpha_portal",
    "title": "Alpha Internal Portal"
  }
}
```

---

## 🛠️ Struktur Direktori Proyek

```
Catauth/
├── backend/                        # FastAPI Async Python Engine (72 Workflow Nodes)
│   ├── app/
│   │   ├── core/                   # Config, Database, Redis GETDEL, Security, Rate Limiter
│   │   ├── models/                 # SQLAlchemy ORM Entities
│   │   ├── modules/
│   │   │   ├── admin/              # RBAC & Immediate Revocation CDC
│   │   │   ├── auth/               # WebAuthn, Challenge, PIN MFA, OAuth Tokens
│   │   │   ├── clients/            # Client Apps Management
│   │   │   ├── credentials/        # FIDO2 Hardware Token Vault
│   │   │   ├── outbox_dlq/         # Postgres WAL CDC & DLQ Reconciler
│   │   │   └── telemetry/          # Audit Logs & Prometheus Metrics
│   │   └── main.py                 # FastAPI App & Lifespan Hooks
│   └── tests/                      # Automated Pytest Suite (9/9 Nodes Passing)
├── frontend/                       # Next.js 14 App Router + Tailwind Bento Grid UI
│   ├── public/sdk/catauth.js       # Universal 1-Line Web NFC Client SDK
│   └── src/
│       ├── app/
│       │   ├── page.tsx            # System Overview & Implementation Flow
│       │   ├── admin/login/        # Admin Gatekeeper (Web NFC / FIDO2 / Passcode)
│       │   ├── admin/dashboard/    # Bento Grid Telemetry & Real-time Audit Stream
│       │   ├── admin/embed/        # Embed API Hub, SDK Snippets & Live Tester
│       │   ├── admin/keys/         # Hardware NFC & User Account Vault
│       │   ├── admin/links/        # Protected Links Hub & Card Whitelisting
│       │   ├── admin/topology/     # Interactive 72-Node Live Topology Explorer
│       │   ├── sso/login/          # SSO Gateway (Hardware NFC / WebAuthn Tap)
│       │   └── api/v1/             # Next.js Serverless Edge API Mirror
│       ├── components/             # Navigation & Reusable Bento Grid Components
│       └── lib/                    # Typed API Client, Supabase Vault & Node Datasets
├── package.json                    # Root package descriptor for Vercel
├── vercel.json                     # Vercel Deployment Configuration
└── README.md
```

---

## 💻 Menjalankan di Lingkungan Lokal

### 1. Backend Server (FastAPI on Port 8000)
```bash
# Aktifkan virtual environment
.\venv\Scripts\activate

# Jalankan FastAPI dengan uvicorn
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
* **Swagger API Docs:** `http://localhost:8000/docs`
* **Prometheus Metrics:** `http://localhost:8000/metrics`

### 2. Frontend Server (Next.js 14 on Port 3000)
```bash
cd frontend
npm run dev
```
Buka `http://localhost:3000` di browser Anda.

### 3. Menjalankan Automated Test Suite
```bash
.\venv\Scripts\pytest backend\tests\ -v
```
Seluruh 9 node tes integrasi tervalidasi dan lulus 100%.

---

## 🔒 Fitur Keamanan Utama
* **Hardware-Bound Identity:** Anti-cloning dengan zero `sign_count` strict tolerance.
* **Atomic Nonce Consumption:** Redis `GETDEL` mencegah segala bentuk serangan replay dalam 1 langkah atomik.
* **Singleflight Dead-Man Lock:** Distributed mutex 1500ms TTL mencegah database cache stampede.
* **Tenant Isolation:** Supavisor unit-of-work `SET LOCAL app.current_tenant_id` untuk proteksi multi-tenant.
* **Instant Revocation Outbox:** CDC WAL streaming untuk membatalkan sesi seketika saat kartu hilang atau dicabut.

---
*(c) 2026 Catauth Sovereign Identity. All rights reserved.*
