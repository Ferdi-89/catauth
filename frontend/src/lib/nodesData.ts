import { WorkflowNode } from './types';

export const WORKFLOW_NODES: WorkflowNode[] = [
  {
    id: "node-1",
    nodeNumber: 1,
    type: "TRIGGER",
    title: "Inisiasi Login Klien",
    purpose: "Pengguna diarahkan dari website mitra ke gateway autentikasi membawa parameter client_id, redirect_uri, state, dan nonce.",
    contract: "HTTP GET /sso/login?client_id=...&redirect_uri=...&state=...&nonce=...",
    incoming: [],
    outgoing: ["node-2"]
  },
  {
    id: "node-2",
    nodeNumber: 2,
    type: "SCREEN",
    title: "Halaman Gateway SSO",
    purpose: "Antarmuka gerbang login yang memuat profil aplikasi klien dan mempersiapkan proses WebAuthn API.",
    contract: "UI Rendering, Client app logo, RP Name, WebAuthn detection state",
    incoming: ["node-1"],
    outgoing: ["node-3"]
  },
  {
    id: "node-3",
    nodeNumber: 3,
    type: "CONDITION",
    title: "Validasi Client & URL",
    purpose: "Memeriksa apakah client_id terdaftar dan redirect_uri cocok dengan daftar putih yang disimpan di Supabase.",
    contract: "DB Lookup client_apps WHERE client_id=:id AND is_active=true",
    branchTargets: ["Branch 1: True (Klien Sah)", "Branch 2: False (Klien Ilegal)"],
    incoming: ["node-2"],
    outgoing: ["node-4", "node-5"]
  },
  {
    id: "node-4",
    nodeNumber: 4,
    type: "SCREEN",
    title: "Layar Error Klien",
    purpose: "Menampilkan pesan galat bahwa aplikasi pemanggil tidak sah atau parameter redirect tidak terdaftar.",
    contract: "HTTP 400 Bad Request Display (INVALID_CLIENT / REDIRECT_URI_MISMATCH)",
    incoming: ["node-3"],
    outgoing: []
  },
  {
    id: "node-5",
    nodeNumber: 5,
    type: "CONDITION",
    title: "Cek Dukungan WebAuthn NFC",
    purpose: "Memverifikasi ketersediaan navigator.credentials dan otentikator FIDO2/WebAuthn pada peramban perangkat.",
    contract: "Browser check: typeof window.PublicKeyCredential !== 'undefined'",
    branchTargets: ["Branch 1: True (FIDO2 Tersedia)", "Branch 2: False (FIDO2 Absen)"],
    incoming: ["node-3"],
    outgoing: ["node-6", "node-12"]
  },
  {
    id: "node-6",
    nodeNumber: 6,
    type: "SCREEN",
    title: "Layar Tak Kompatibel",
    purpose: "Memberitahu pengguna bahwa proses login memerlukan peramban dan perangkat yang mendukung WebAuthn/FIDO2 NFC.",
    contract: "Browser ineligibility notification screen",
    incoming: ["node-5"],
    outgoing: []
  },
  {
    id: "node-7",
    nodeNumber: 7,
    type: "AUTH",
    title: "Edge Proxy Rate Limiter",
    purpose: "Filter rate-limiting token bucket pada layer Ingress/Edge Proxy (Envoy/Cloudflare) sebelum request menyentuh worker FastAPI.",
    contract: "Token Bucket (10 req/s, burst 20). Returns HTTP 429 if depleted.",
    incoming: ["node-5"],
    outgoing: ["node-9"]
  },
  {
    id: "node-8",
    nodeNumber: 8,
    type: "API",
    title: "Request WebAuthn Challenge",
    purpose: "API FastAPI membuat cryptographic challenge terenkripsi sebelum browser memanggil API navigator.credentials.get().",
    contract: "POST /api/v1/auth/challenge -> { challenge, rp_id, timeout_ms }",
    incoming: ["node-12"],
    outgoing: ["node-10"]
  },
  {
    id: "node-9",
    nodeNumber: 9,
    type: "CACHE",
    title: "Simpan Challenge Sesi",
    purpose: "Menyimpan transient challenge nonce di Redis dengan masa berlaku sangat singkat (TTL 60 detik).",
    contract: "Redis SETEX challenge:<nonce> 60 <metadata_json>",
    incoming: ["node-9"],
    outgoing: ["node-7"]
  },
  {
    id: "node-10",
    nodeNumber: 10,
    type: "SCREEN",
    title: "Layar Prompt FIDO2 NFC",
    purpose: "Menampilkan panduan visual dengan WebAuthn options dan challenge yang diterima untuk menempelkan kartu kunci NFC.",
    contract: "Concentric radar wave animation & navigator.credentials.get() prompt",
    incoming: ["node-10"],
    outgoing: ["node-8"]
  },
  {
    id: "node-11",
    nodeNumber: 11,
    type: "TRIGGER",
    title: "Tap FIDO2 NFC Selesai",
    purpose: "Browser menerima assertion cryptographic signature dari kartu token NFC via WebAuthn CTAP API.",
    contract: "WebAuthn PublicKeyCredential assertion response received",
    incoming: ["node-7"],
    outgoing: ["node-11"]
  },
  {
    id: "node-12",
    nodeNumber: 12,
    type: "API",
    title: "Submit Assertion FIDO2",
    purpose: "Menerima payload authenticatorData, clientDataJSON, credentialId, dan signature dari WebAuthn frontend.",
    contract: "POST /api/v1/auth/assertion -> Evaluates signature & anti-cloning",
    incoming: ["node-8"],
    outgoing: ["node-66"]
  },
  {
    id: "node-13",
    nodeNumber: 13,
    type: "CACHE",
    title: "Atomic GETDEL Challenge",
    purpose: "Mengeksekusi perintah Redis 'GETDEL challenge:<id>' secara atomik untuk memvalidasi dan langsung menghapus challenge nonce.",
    contract: "Redis GETDEL challenge:<id> (Anti-Replay Attack Guarantee)",
    incoming: ["node-11"],
    outgoing: ["node-67"]
  },
  {
    id: "node-14",
    nodeNumber: 14,
    type: "CONDITION",
    title: "Validasi Nonce GETDEL",
    purpose: "Memeriksa apakah challenge nonce berhasil diambil dari Redis sebelum kadaluwarsa dan belum pernah dikonsumsi sebelumnya.",
    contract: "Evaluate GETDEL result != null",
    branchTargets: ["Branch 1: True (Fresh Nonce)", "Branch 2: False (Hangus/Replay)"],
    incoming: ["node-66"],
    outgoing: ["node-18", "node-13"]
  },
  {
    id: "node-15",
    nodeNumber: 15,
    type: "LOGIC-MULTI",
    title: "Resolusi GeoIP & Metadata",
    purpose: "Mengekstrak lokasi perkiraan (negara, kota, koordinat), User-Agent, dan reputasi IP pengguna.",
    contract: "Extract CF-Connecting-IP, MaxMind/Simulated GeoIP, User-Agent parser",
    incoming: ["node-67"],
    outgoing: ["node-61"]
  },
  {
    id: "node-16",
    nodeNumber: 16,
    type: "DATABASE",
    title: "Supavisor Connection Pooler",
    purpose: "Proxy connection pooler PostgreSQL mode transaction untuk mencegah kehabisan koneksi akibat lonjakan request.",
    contract: "Supavisor Transaction Pooler connection checkout",
    incoming: ["node-13"],
    outgoing: ["node-62"]
  },
  {
    id: "node-17",
    nodeNumber: 17,
    type: "AUTH",
    title: "Unit-of-Work SET LOCAL Guard",
    purpose: "Middleware Unit-of-Work membungkus query dalam blok eksplisit 'BEGIN...COMMIT' dan mengeksekusi 'SET LOCAL app.current_tenant_id = :id'.",
    contract: "BEGIN; SET LOCAL app.current_tenant_id = :tenant_id; (Zero-Bleeding RLS)",
    incoming: ["node-61"],
    outgoing: ["node-14"]
  },
  {
    id: "node-18",
    nodeNumber: 18,
    type: "DATABASE",
    title: "Query Kredensial FIDO2",
    purpose: "Mengambil data public key, sign_count, status kredensial, dan identitas pengguna dari database Supabase.",
    contract: "SELECT * FROM fido2_credentials WHERE credential_id=:id",
    incoming: ["node-62"],
    outgoing: ["node-15"]
  },
  {
    id: "node-19",
    nodeNumber: 19,
    type: "CONDITION",
    title: "Status Kredensial Aktif?",
    purpose: "Memeriksa apakah kredensial NFC dalam status aktif dan tidak berada dalam status revoked atau suspended.",
    contract: "Evaluate cred.is_active == true",
    branchTargets: ["Branch 1: True (Kredensial Aktif)", "Branch 2: False (Kredensial Terblokir)"],
    incoming: ["node-14"],
    outgoing: ["node-16", "node-17"]
  },
  {
    id: "node-20",
    nodeNumber: 20,
    type: "SCREEN",
    title: "Layar Kartu Diblokir",
    purpose: "Menampilkan peringatan bahwa kartu token NFC telah dinonaktifkan oleh administrator sistem.",
    contract: "Card revocation alert screen with support guidance",
    incoming: ["node-15"],
    outgoing: []
  },
  {
    id: "node-21",
    nodeNumber: 21,
    type: "CONDITION",
    title: "Validasi Assertion & RP ID",
    purpose: "Verifikasi kriptografis signature WebAuthn, validasi ketat rpId/origin whitelist, dan toleransi sign_count anti-kloning.",
    contract: "Strict origin binding, static zero tolerance (stored==0 & in==0 OK), cloned rejection (in<=stored when stored>0)",
    branchTargets: ["Branch 1: True (Assertion & RP Sah)", "Branch 2: False (Assertion Invalid)"],
    incoming: ["node-15"],
    outgoing: ["node-18", "node-19"]
  },
  {
    id: "node-22",
    nodeNumber: 22,
    type: "SCREEN",
    title: "Layar Gagal Kredensial",
    purpose: "Menampilkan indikator bahwa verifikasi kriptografi WebAuthn gagal, nonce kadaluwarsa, atau token terdeteksi mengalami cloning.",
    contract: "Signature failure / Cloned token anomaly screen",
    incoming: ["node-67", "node-17"],
    outgoing: []
  },
  {
    id: "node-23",
    nodeNumber: 23,
    type: "CONDITION",
    title: "Evaluasi Geofence Akses",
    purpose: "Memvalidasi apakah lokasi geografis login diizinkan sesuai aturan keamanan yang diatur pada dashboard admin.",
    contract: "Evaluate country in policy.allowed_countries",
    branchTargets: ["Branch 1: True (Lokasi Sah)", "Branch 2: False (Lokasi Ditolak)"],
    incoming: ["node-17"],
    outgoing: ["node-20", "node-21"]
  },
  {
    id: "node-24",
    nodeNumber: 24,
    type: "SCREEN",
    title: "Layar Akses Terisolasi",
    purpose: "Menampilkan penolakan akses karena pembatasan wilayah (Geofencing Policy Restriction).",
    contract: "Geofence restriction notice with origin country tag",
    incoming: ["node-19"],
    outgoing: []
  },
  {
    id: "node-25",
    nodeNumber: 25,
    type: "LOGIC-MULTI",
    title: "Evaluasi Kebutuhan MFA",
    purpose: "Mengevaluasi apakah kebijakan keamanan klien mewajibkan PIN tambahan atau autentikasi biometrik sekunder.",
    contract: "Evaluate policy.require_pin_mfa && user.pin_hash != null",
    branchTargets: ["Branch 1: Bebas MFA", "Branch 2: Butuh Verifikasi PIN"],
    incoming: ["node-19"],
    outgoing: ["node-22", "node-24"]
  },
  {
    id: "node-26",
    nodeNumber: 26,
    type: "SCREEN",
    title: "Layar Input PIN Tambahan",
    purpose: "Formulir PIN keamanan untuk verifikasi ganda kepemilikan fisik kartu NFC.",
    contract: "Secure 6-digit numeric PIN modal input",
    incoming: ["node-21"],
    outgoing: ["node-23"]
  },
  {
    id: "node-27",
    nodeNumber: 27,
    type: "API",
    title: "Validasi PIN Pengguna",
    purpose: "Endpoint FastAPI untuk memverifikasi hash PIN kartu pengguna menggunakan algoritma Argon2id.",
    contract: "POST /api/v1/auth/verify-pin -> Argon2id verification",
    incoming: ["node-22"],
    outgoing: ["node-24"]
  },
  {
    id: "node-28",
    nodeNumber: 28,
    type: "DATABASE",
    title: "Simpan Audit Log Otentikasi",
    purpose: "Mencatat rekaman login mencakup ID pengguna, Credential ID, IP, kota, negara, dan peramban ke Supabase.",
    contract: "INSERT INTO audit_logs (tenant_id, user_id, event_type, status, ...) VALUES (...)",
    incoming: ["node-23", "node-21"],
    outgoing: ["node-25", "node-26"]
  },
  {
    id: "node-29",
    nodeNumber: 29,
    type: "DATABASE",
    title: "Generate Auth Code",
    purpose: "Menerbitkan Authorization Code satu kali pakai (Single-Use) dengan status used=false dan masa kedaluwarsa 30 detik.",
    contract: "INSERT INTO auth_codes (code, client_id, user_id, used=false, expires_at=now+30s)",
    incoming: ["node-24"],
    outgoing: ["node-28"]
  },
  {
    id: "node-30",
    nodeNumber: 30,
    type: "QUEUE",
    title: "Antrean Telemetri Celery",
    purpose: "Mendorong payload metrik login ke message broker Redis untuk diproses pekerja latar belakang Celery.",
    contract: "Redis Celery queue push: tasks.aggregate_telemetry",
    incoming: ["node-24"],
    outgoing: ["node-27", "node-56"]
  },
  {
    id: "node-31",
    nodeNumber: 31,
    type: "NOTIFICATION",
    title: "Notifikasi Peringatan Login",
    purpose: "Mengirimkan email peringatan atau webhook keamanan jika terdeteksi login dari lokasi baru atau tidak biasa.",
    contract: "Security anomaly alert email / webhook dispatcher",
    incoming: ["node-26"],
    outgoing: []
  },
  {
    id: "node-32",
    nodeNumber: 32,
    type: "SCREEN",
    title: "Layar Pengalihan SSO",
    purpose: "Tampilan transisi sukses yang mengeksekusi pengalihan otomatis browser kembali ke website mitra.",
    contract: "Animated redirect screen with countdown timer (3s auto-redirect)",
    incoming: ["node-25"],
    outgoing: ["node-29"]
  },
  {
    id: "node-33",
    nodeNumber: 33,
    type: "EXTERNAL",
    title: "Redirect ke Client Website",
    purpose: "Mengirimkan sinyal HTTP redirect 302 membawa parameter code dan state ke callback URI aplikasi klien.",
    contract: "HTTP 302 Found -> redirect_uri?code=:code&state=:state",
    incoming: ["node-28"],
    outgoing: []
  },
  {
    id: "node-34",
    nodeNumber: 34,
    type: "TRIGGER",
    title: "Klien Request Tukar Token",
    purpose: "Server backend website mitra memanggil endpoint /oauth/token untuk menukar code dengan token identitas.",
    contract: "POST /oauth/token (grant_type=authorization_code, code, client_id, client_secret)",
    incoming: [],
    outgoing: ["node-31"]
  },
  {
    id: "node-35",
    nodeNumber: 35,
    type: "API",
    title: "Endpoint OAuth Token Exchange",
    purpose: "Handler FastAPI untuk pemrosesan pertukaran otorisasi kode menjadi Access Token dan ID Token JWT.",
    contract: "FastAPI OAuth2 Token handler with PKCE & Client Secret validation",
    incoming: ["node-30"],
    outgoing: ["node-32"]
  },
  {
    id: "node-36",
    nodeNumber: 36,
    type: "AUTH",
    title: "Verifikasi Secret Klien",
    purpose: "Memvalidasi client_secret dan signature PKCE untuk memastikan pertukaran token dilakukan oleh server klien resmi.",
    contract: "Argon2 client_secret verify & RFC 7636 S256 PKCE challenge verification",
    incoming: ["node-31"],
    outgoing: ["node-33"]
  },
  {
    id: "node-37",
    nodeNumber: 37,
    type: "DATABASE",
    title: "Atomic Consume Auth Code",
    purpose: "Mengeksekusi query atomic 'UPDATE auth_codes SET used=true WHERE code=:code AND used=false RETURNING *'.",
    contract: "Atomic single-use code consumption in UnitOfWork transaction",
    incoming: ["node-32"],
    outgoing: ["node-34"]
  },
  {
    id: "node-38",
    nodeNumber: 38,
    type: "DATABASE",
    title: "Terbitkan Sesi & JWT Token",
    purpose: "Membuat payload JWT berisikan klaim identitas pengguna, scope, durasi TTL sesi, dan menyimpannya di Supabase.",
    contract: "Issue Access Token JWT, ID Token JWT, INSERT INTO sessions",
    incoming: ["node-33"],
    outgoing: ["node-35"]
  },
  {
    id: "node-39",
    nodeNumber: 39,
    type: "CACHE",
    title: "Registrasi Sesi Aktif Redis",
    purpose: "Menyimpan key sesi aktif dengan masa berlaku TTL sesuai konfigurasi admin untuk kebutuhan verifikasi kilat in-memory.",
    contract: "Redis SETEX session:<token_hash> <ttl> <session_json>",
    incoming: ["node-34", "node-64"],
    outgoing: []
  },
  {
    id: "node-40",
    nodeNumber: 40,
    type: "TRIGGER",
    title: "Klien Cek Introspeksi Token",
    purpose: "Resource server atau aplikasi klien mengirimkan request introspeksi token ke endpoint /oauth/introspect.",
    contract: "POST /oauth/introspect (token=:token)",
    incoming: [],
    outgoing: ["node-36"]
  },
  {
    id: "node-41",
    nodeNumber: 41,
    type: "API",
    title: "Endpoint Introspeksi Token",
    purpose: "Handler backend /oauth/introspect untuk mengevaluasi keabsahan token secara non-blocking.",
    contract: "FastAPI RFC 7662 token introspection endpoint",
    incoming: ["node-63"],
    outgoing: ["node-64"]
  },
  {
    id: "node-42",
    nodeNumber: 42,
    type: "CONDITION",
    title: "Cek Cache Sesi Redis",
    purpose: "Mengecek keberadaan token langsung pada in-memory Redis session store tanpa disk I/O ke PostgreSQL.",
    contract: "Redis GET session:<token_hash>",
    branchTargets: ["Branch 1: True (Sesi Aktif di Redis)", "Branch 2: False (Cache Miss / Stampede Guard)"],
    incoming: ["node-36"],
    outgoing: ["node-35", "node-69"]
  },
  {
    id: "node-43",
    nodeNumber: 43,
    type: "CACHE",
    title: "Singleflight Lock Dead-Man TTL",
    purpose: "Distributed mutex lock Redis ber-dead-man expiration (TTL 1500ms) dengan jittered backoff retry untuk mencegah cache stampede.",
    contract: "Redis SET lock:singleflight:<id> <token> NX PX 1500 + Jitter backoff",
    incoming: ["node-64"],
    outgoing: ["node-65"]
  },
  {
    id: "node-44",
    nodeNumber: 44,
    type: "DATABASE",
    title: "Fallback Verifikasi DB",
    purpose: "Query tunggal verifikasi sesi ke PostgreSQL dalam transaksi unit-of-work SET LOCAL RLS setelah memenangkan singleflight lock.",
    contract: "SELECT * FROM sessions WHERE token_hash=:hash -> Replenishes Redis",
    incoming: ["node-69"],
    outgoing: []
  },
  {
    id: "node-45",
    nodeNumber: 45,
    type: "TRIGGER",
    title: "Admin Buka Portal Kelola",
    purpose: "Administrator mengakses rute khusus /admin untuk mengelola konfigurasi dan memantau keamanan.",
    contract: "Browser navigation to /admin/dashboard",
    incoming: [],
    outgoing: ["node-38"]
  },
  {
    id: "node-46",
    nodeNumber: 46,
    type: "SCREEN",
    title: "Layar Login Administrator",
    purpose: "Antarmuka masuk khusus administrator dengan proteksi kredensial master dan autentikasi dua faktor.",
    contract: "Admin credentials authentication UI",
    incoming: ["node-37"],
    outgoing: ["node-39"]
  },
  {
    id: "node-47",
    nodeNumber: 47,
    type: "AUTH",
    title: "Admin RBAC & JWT Check",
    purpose: "Verifikasi role-based access control memastikan hanya akun dengan hak akses admin yang diizinkan masuk.",
    contract: "POST /api/v1/admin/login -> JWT claims validation with role=='admin'",
    incoming: ["node-38"],
    outgoing: ["node-40"]
  },
  {
    id: "node-48",
    nodeNumber: 48,
    type: "SCREEN",
    title: "Admin Dashboard Bento UI",
    purpose: "Pusat kendali utama bertata letak Bento Grid yang menampilkan widget metrik, grafik trafik, dan ringkasan status sistem.",
    contract: "Bento Grid Dashboard with real-time charts, telemetry map, circuit breaker status",
    incoming: ["node-39"],
    outgoing: ["node-41", "node-44", "node-47", "node-48", "node-49"]
  },
  {
    id: "node-49",
    nodeNumber: 49,
    type: "SCREEN",
    title: "Layar Registrasi Klien",
    purpose: "Panel formulir untuk mendaftarkan website baru, mengatur nama aplikasi, domain asal, dan URL redirect tujuan.",
    contract: "Client app registration form & credential generator",
    incoming: ["node-40"],
    outgoing: ["node-42"]
  },
  {
    id: "node-50",
    nodeNumber: 50,
    type: "API",
    title: "Endpoint CRUD Aplikasi Klien",
    purpose: "REST API untuk membuat, memperbarui, dan menghasilkan pasangan Client ID serta Client Secret.",
    contract: "GET/POST/PUT/DELETE /api/v1/admin/clients",
    incoming: ["node-41"],
    outgoing: ["node-43"]
  },
  {
    id: "node-51",
    nodeNumber: 51,
    type: "DATABASE",
    title: "Tabel Registry Klien RLS",
    purpose: "Tabel Supabase penyimpan metadata website terdaftar yang dilindungi transaksi unit-of-work SET LOCAL RLS.",
    contract: "Table client_apps (client_id, client_secret_hash, redirect_uris, allowed_origins)",
    incoming: ["node-42"],
    outgoing: []
  },
  {
    id: "node-52",
    nodeNumber: 52,
    type: "SCREEN",
    title: "Layar Kelola Token FIDO2",
    purpose: "Antarmuka untuk mendaftarkan Credential ID WebAuthn baru, menautkan ke identitas pengguna, dan mengatur public key.",
    contract: "Hardware token manager with real-time sign_count monitor & revocation toggles",
    incoming: ["node-40"],
    outgoing: ["node-45"]
  },
  {
    id: "node-53",
    nodeNumber: 53,
    type: "API",
    title: "Endpoint Provisioning FIDO2",
    purpose: "Handler backend untuk registrasi public key COSE token, inisialisasi counter sign_count, dan pairing identitas.",
    contract: "POST /api/v1/admin/credentials/enroll, PATCH /status",
    incoming: ["node-44"],
    outgoing: ["node-46"]
  },
  {
    id: "node-54",
    nodeNumber: 54,
    type: "DATABASE",
    title: "Tabel Kredensial FIDO2 RLS",
    purpose: "Penyimpanan data relasional Credential ID, hash identitas, dan kunci publik COSE/PEM dengan isolasi RLS multi-tenant.",
    contract: "Table fido2_credentials (credential_id, public_key_cose, sign_count, is_active)",
    incoming: ["node-45"],
    outgoing: []
  },
  {
    id: "node-55",
    nodeNumber: 55,
    type: "SCREEN",
    title: "Layar Telemetri & Peta Akses",
    purpose: "Visualisasi interaktif peta dunia dengan penandaan lokasi akses, penghitung total pengguna, dan log waktu nyata.",
    contract: "Interactive Geo Map with glowing access points and live audit event stream",
    incoming: ["node-40"],
    outgoing: []
  },
  {
    id: "node-56",
    nodeNumber: 56,
    type: "API",
    title: "Endpoint Metrik & Geografis",
    purpose: "API analitik yang menyediakan data agregat jumlah kunjungan, sebaran wilayah, peramban, dan durasi sesi.",
    contract: "GET /api/v1/telemetry/dashboard -> { total_auth, success_rate, countries, logs }",
    incoming: ["node-40"],
    outgoing: []
  },
  {
    id: "node-57",
    nodeNumber: 57,
    type: "SCREEN",
    title: "Layar Kebijakan Keamanan & TTL",
    purpose: "Panel konfigurasi durasi validitas sesi, aturan geofencing negara, ambang batas brute force, dan kebijakan MFA.",
    contract: "Security policies & TTL management form",
    incoming: ["node-40"],
    outgoing: ["node-50"]
  },
  {
    id: "node-58",
    nodeNumber: 58,
    type: "API",
    title: "Endpoint Update Kebijakan",
    purpose: "Menyimpan perubahan parameter durasi sesi dan aturan pembatasan akses keamanan ke database Supabase via pooler.",
    contract: "GET/PUT /api/v1/admin/policies",
    incoming: ["node-49"],
    outgoing: []
  },
  {
    id: "node-59",
    nodeNumber: 59,
    type: "TRIGGER",
    title: "Admin Cabut Sesi / Blokir",
    purpose: "Aksi manual administrator untuk memutus sesi aktif pengguna atau memblokir kredensial token FIDO2.",
    contract: "Admin action trigger from dashboard or emergency revoke button",
    incoming: [],
    outgoing: ["node-52"]
  },
  {
    id: "node-60",
    nodeNumber: 60,
    type: "API",
    title: "Endpoint Revokasi Seketika",
    purpose: "Handler FastAPI untuk memproses pencabutan sesi dan memicu transaksi outbox revokasi.",
    contract: "POST /api/v1/admin/revoke -> Initiates ACID Outbox write",
    incoming: ["node-51"],
    outgoing: ["node-53"]
  },
  {
    id: "node-61",
    nodeNumber: 61,
    type: "DATABASE",
    title: "Transactional Outbox WAL",
    purpose: "Menulis status token blacklist dan event revokasi ke tabel outbox dalam transaksi eksplisit ACID PostgreSQL via Supavisor Pooler.",
    contract: "BEGIN; UPDATE sessions SET is_revoked=true; INSERT INTO transactional_outbox; COMMIT;",
    incoming: ["node-52"],
    outgoing: ["node-70"]
  },
  {
    id: "node-62",
    nodeNumber: 62,
    type: "QUEUE",
    title: "WAL CDC Outbox Engine",
    purpose: "Consumer event berbasis PostgreSQL Logical Replication (WAL CDC) yang mengalirkan mutasi outbox ke Redis Streams secara real-time.",
    contract: "Zero-Polling WAL CDC stream to Redis Streams outbox:events",
    incoming: ["node-53"],
    outgoing: ["node-54"]
  },
  {
    id: "node-63",
    nodeNumber: 63,
    type: "CACHE",
    title: "Purge Cache Sesi Redis",
    purpose: "Worker outbox CDC mengeksekusi penghapusan key sesi aktif di Redis secara instan begitu event terbaca dari stream WAL.",
    contract: "Redis DEL session:<token_hash> (Instant session revocation in-memory)",
    incoming: ["node-70"],
    outgoing: ["node-68"]
  },
  {
    id: "node-64",
    nodeNumber: 64,
    type: "CONDITION",
    title: "Evaluasi Circuit Breaker",
    purpose: "Memeriksa status proteksi PyBreaker pada endpoint webhook mitra untuk mencegah worker starvation saat mitra down.",
    contract: "Evaluate CircuitBreaker.is_available() (CLOSED vs OPEN vs HALF_OPEN)",
    branchTargets: ["Branch 1: True (Circuit Closed / Sehat)", "Branch 2: False (Circuit Open / Trip Aktif)"],
    incoming: ["node-54", "node-72"],
    outgoing: ["node-55", "node-60"]
  },
  {
    id: "node-65",
    nodeNumber: 65,
    type: "NOTIFICATION",
    title: "Broadcast Webhook Logout",
    purpose: "Worker outbox relay mengirimkan webhook Back-Channel Logout dengan timeout 2000ms dan exponential backoff 3x.",
    contract: "HTTP POST client_app.webhook_logout_url (Timeout 2000ms, Backoff: 100ms, 200ms, 400ms)",
    incoming: ["node-68"],
    outgoing: ["node-59"]
  },
  {
    id: "node-66",
    nodeNumber: 66,
    type: "QUEUE",
    title: "Worker Agregasi Telemetri",
    purpose: "Pekerja latar belakang Celery pada runtime Render yang mengagregasi data log login ke tabel analitik via pooler.",
    contract: "Background telemetry aggregation & aggregation counters",
    incoming: ["node-26"],
    outgoing: ["node-57"]
  },
  {
    id: "node-67",
    nodeNumber: 67,
    type: "STORAGE",
    title: "Arsip Log Audit S3",
    purpose: "Penyimpanan cadangan jangka panjang untuk log audit keamanan dalam format terkompresi dan terenkripsi.",
    contract: "Compressed encrypted S3 Glacier audit archive",
    incoming: ["node-56"],
    outgoing: []
  },
  {
    id: "node-68",
    nodeNumber: 68,
    type: "COMMENT",
    title: "Dokumentasi Arsitektur V8",
    purpose: "Arsitektur V8: Edge Proxy Ingress Rate Limiting (Envoy/Cloudflare), Zero-Polling Postgres WAL CDC Outbox ke Redis Streams, dan Automated Prometheus DLQ Lag Alerting + Reconciler Replay Job.",
    contract: "Margaret Architecture Blueprint Schema v0.3.0 Specifications",
    incoming: [],
    outgoing: []
  },
  {
    id: "node-69",
    nodeNumber: 69,
    type: "CONDITION",
    title: "Status Webhook Klien",
    purpose: "Evaluasi apakah webhook logout berhasil diterima mitra dalam ambang batas timeout 2000ms setelah 3 kali percobaan.",
    contract: "Evaluate HTTP 2xx vs 3x timeout/failure",
    branchTargets: ["Branch 1: True (Webhook Diterima)", "Branch 2: False (Timeout / Gagal 3x)"],
    incoming: ["node-55"],
    outgoing: ["node-60"]
  },
  {
    id: "node-70",
    nodeNumber: 70,
    type: "QUEUE",
    title: "DLQ Webhook Revokasi",
    purpose: "Dead-Letter Queue penampung event webhook revokasi yang gagal terkirim atau ditolak circuit breaker guna inspeksi dan rekonsiliasi.",
    contract: "Table dlq_webhooks (status=PENDING, retry_count=3)",
    incoming: ["node-68", "node-59"],
    outgoing: ["node-71", "node-72"]
  },
  {
    id: "node-71",
    nodeNumber: 71,
    type: "NOTIFICATION",
    title: "Prometheus Lag & DLQ Alert",
    purpose: "Sistem pemantauan metric Prometheus/Grafana dengan threshold alert otomatis saat DLQ lag menumpuk akibat trip breaker.",
    contract: "Prometheus alert when dlq_messages_pending > threshold (5)",
    incoming: ["node-60"],
    outgoing: []
  },
  {
    id: "node-72",
    nodeNumber: 72,
    type: "API",
    title: "DLQ Replay & Reconciler Job",
    purpose: "Endpoint rekonsiliasi dan cron background job otomatis untuk memutar ulang (replay) event tertahan di DLQ ketika circuit breaker kembali pulih.",
    contract: "POST /api/v1/dlq/replay -> Iterates pending DLQ items and re-evaluates Circuit Breaker",
    incoming: ["node-60"],
    outgoing: ["node-68"]
  }
];
