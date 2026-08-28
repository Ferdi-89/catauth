'use client';

import React, { useState, useEffect } from 'react';
import {
  Code2, Copy, Check, Terminal, Globe, Server, Smartphone,
  Key, ShieldCheck, Sparkles, RefreshCw, ExternalLink, Play,
  Layers, ArrowRight, CheckCircle2, AlertCircle, FileCode,
  Shield, Cpu, BookOpen, ChevronRight, Lock
} from 'lucide-react';
import { api } from '../../../lib/api';
import { ProtectedLink } from '../../../lib/types';

export default function AdminEmbedPage() {
  const [links, setLinks] = useState<ProtectedLink[]>([]);
  const [selectedLinkId, setSelectedLinkId] = useState<string>('');
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'GUIDE' | 'HTML_WIDGET' | 'REACT' | 'BACKEND_API' | 'LIVE_TESTER'>('GUIDE');
  const [backendLang, setBackendLang] = useState<'curl' | 'node' | 'python' | 'php' | 'go'>('curl');

  // Live tester state
  const [testCardId, setTestCardId] = useState('FIDO2-NFC-KEY-ALPHA-01');
  const [testLoading, setTestLoading] = useState(false);
  const [testResponse, setTestResponse] = useState<any>(null);

  useEffect(() => {
    async function load() {
      const res = await api.listProtectedLinks();
      if (res.success && res.data && res.data.length > 0) {
        setLinks(res.data);
        setSelectedLinkId(res.data[0].id);
      }
    }
    load();
  }, []);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://catauth.vercel.app';
  const targetLink = links.find((l) => l.id === selectedLinkId) || links[0];
  const effectiveLinkId = targetLink ? targetLink.id : 'lnk_alpha_portal';

  function copyCode(code: string, id: string) {
    navigator.clipboard.writeText(code);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  // Code Snippets
  const htmlSnippet = `<!-- 1. Muat SDK Catauth Universal Web NFC -->
<script src="${origin}/sdk/catauth.js"></script>

<!-- 2. Elemen wadah tombol login -->
<div id="catauth-login-container"></div>

<script>
  // 3. Inisialisasi dan render tombol "Sign in with Catauth NFC"
  Catauth.renderButton('#catauth-login-container', {
    linkId: '${effectiveLinkId}',
    theme: 'dark', // 'dark' | 'light'
    text: 'Sign in with Catauth NFC',
    onSuccess: function(authData) {
      console.log('Login Berhasil!', authData);
      // authData.user -> { user_id, name, user_email, user_role, card_id }
      // authData.auth_token -> Signed JWT Token

      // Simpan session & alihkan pengguna:
      localStorage.setItem('auth_token', authData.auth_token);
      window.location.href = '${targetLink?.target_redirect_url || '/dashboard'}';
    },
    onError: function(err) {
      alert('Login Gagal: ' + err.message);
    }
  });
</script>`;

  const reactSnippet = `'use client';
import React, { useState } from 'react';

export default function CatauthNFCButton() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleNFCScan() {
    setStatus(null);
    setLoading(true);

    try {
      // 1. Periksa dukungan Web NFC pada browser (Android Chrome)
      if (!('NDEFReader' in window)) {
        // Fallback ke redirect gateway popup SSO
        window.location.href = '${origin}/sso/login?link_id=${effectiveLinkId}';
        return;
      }

      const NDEFReaderClass = (window as any).NDEFReader;
      const ndef = new NDEFReaderClass();
      await ndef.scan();
      setStatus('Tempelkan kartu NFC ke belakang HP...');

      ndef.onreading = async (event: any) => {
        const serial = event.serialNumber;
        const rawUid = serial ? serial.replace(/:/g, '').toUpperCase() : 'CARD';
        const cardId = 'NFC-UID-' + rawUid;

        setStatus('Kartu terdeteksi: ' + cardId + '. Memvalidasi...');

        // 2. Kirim UID ke Direct Auth API Catauth
        const res = await fetch('${origin}/api/v1/auth/verify-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            card_id: cardId,
            link_id: '${effectiveLinkId}',
          }),
        });

        const data = await res.json();
        if (data.authenticated) {
          localStorage.setItem('auth_token', data.auth_token);
          setStatus('Sukses! Selamat datang, ' + data.user.name);
          setTimeout(() => {
            window.location.href = '${targetLink?.target_redirect_url || '/dashboard'}';
          }, 800);
        } else {
          setStatus('Ditolak: ' + (data.error?.message || 'Kartu tidak diizinkan.'));
          setLoading(false);
        }
      };
    } catch (err: any) {
      setStatus('Error: ' + err.message);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleNFCScan}
        disabled={loading}
        className="px-6 py-3 rounded-lg bg-black text-white border border-neutral-700 font-semibold flex items-center space-x-2 hover:bg-neutral-900 transition-colors"
      >
        <span>📲 Tap Kartu NFC untuk Login</span>
      </button>
      {status && <p className="text-xs font-mono text-cyan-400">{status}</p>}
    </div>
  );
}`;

  const curlSnippet = `curl -X POST "${origin}/api/v1/auth/verify-card" \\
  -H "Content-Type: application/json" \\
  -d '{
    "card_id": "NFC-UID-04A23B4C",
    "link_id": "${effectiveLinkId}"
  }'`;

  const nodeSnippet = `// Node.js (Express / Fastify / NestJS)
import express from 'express';

const app = express();
app.use(express.json());

app.post('/api/auth/nfc-login', async (req, res) => {
  const { card_id } = req.body;

  try {
    // Verifikasi hardware card UID ke Catauth Auth Engine
    const response = await fetch('${origin}/api/v1/auth/verify-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id: card_id,
        link_id: '${effectiveLinkId}'
      })
    });

    const result = await response.json();

    if (result.authenticated) {
      // Buat session lokal di backend Anda
      req.session.user = result.user;
      return res.json({ success: true, redirect_url: result.redirect_url, user: result.user });
    }

    return res.status(401).json({ success: false, message: result.error?.message });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});`;

  const pythonSnippet = `# Python (FastAPI / Flask / Django)
import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

class NFCLoginRequest(BaseModel):
    card_id: str

@app.post("/api/auth/nfc-login")
def verify_nfc_card(payload: NFCLoginRequest):
    catauth_url = "${origin}/api/v1/auth/verify-card"
    body = {
        "card_id": payload.card_id,
        "link_id": "${effectiveLinkId}"
    }

    res = requests.post(catauth_url, json=body, timeout=5)
    data = res.json()

    if data.get("authenticated"):
        # User terautentikasi & kartu terdaftar
        user = data.get("user")
        return {"status": "SUCCESS", "user": user, "auth_token": data.get("auth_token")}

    raise HTTPException(status_code=401, detail=data.get("error", {}).get("message", "Akses ditolak"))`;

  const phpSnippet = `<?php
// PHP (Laravel / Symfony / Native PHP)
$cardId = $_POST['card_id'] ?? 'NFC-UID-04A23B4C';

$payload = json_encode([
    "card_id" => $cardId,
    "link_id" => "${effectiveLinkId}"
]);

$ch = curl_init("${origin}/api/v1/auth/verify-card");
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 5);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$result = json_decode($response, true);

if ($result && isset($result['authenticated']) && $result['authenticated'] === true) {
    // Sesi berhasil dibuat
    $_SESSION['user_id']   = $result['user']['user_id'];
    $_SESSION['user_name'] = $result['user']['name'];
    $_SESSION['role']      = $result['user']['user_role'];

    header("Location: " . ($result['redirect_url'] ?? '/dashboard'));
    exit;
} else {
    echo "Login Ditolak: " . ($result['error']['message'] ?? 'Kartu tidak valid.');
}`;

  const goSnippet = `// Golang (Fiber / Gin / Standard Net/HTTP)
package main

import (
	"bytes"
	"encoding/json"
	"net/http"
)

type AuthRequest struct {
	CardID string \`json:"card_id"\`
	LinkID string \`json:"link_id"\`
}

func verifyNFC(w http.ResponseWriter, r *http.Request) {
	reqBody, _ := json.Marshal(AuthRequest{
		CardID: "NFC-UID-04A23B4C",
		LinkID: "${effectiveLinkId}",
	})

	resp, err := http.Post("${origin}/api/v1/auth/verify-card", "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	if auth, ok := result["authenticated"].(bool); ok && auth {
		// Sukses autentikasi
		w.Write([]byte("Otentikasi Berhasil!"))
		return
	}
	http.Error(w, "Akses NFC Ditolak", http.StatusUnauthorized)
}`;

  // Run live test
  async function handleRunLiveTest() {
    setTestLoading(true);
    try {
      const res = await fetch(`${origin}/api/v1/auth/verify-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: testCardId,
          link_id: effectiveLinkId,
        }),
      });
      const data = await res.json();
      setTestResponse(data);
    } catch (err: any) {
      setTestResponse({ error: err.message });
    }
    setTestLoading(false);
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Embed API & Prosedur Integrasi
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
              REST & SDK v1.0
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Panduan lengkap, diagram alur, SDK 1 baris kode, dan REST API untuk memasang login NFC di website apa pun.
          </p>
        </div>

        {/* Link Selector */}
        {links.length > 0 && (
          <div className="flex items-center space-x-2 bg-neutral-900 border border-neutral-800 p-2 rounded-lg">
            <label className="text-xs text-neutral-400 font-mono">Protected Link:</label>
            <select
              value={selectedLinkId}
              onChange={(e) => setSelectedLinkId(e.target.value)}
              className="px-2.5 py-1 rounded bg-black border border-neutral-700 text-xs text-white font-mono focus:outline-none"
            >
              {links.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title} ({l.id})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 pb-3">
        <button
          onClick={() => setActiveTab('GUIDE')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'GUIDE' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white bg-neutral-950'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>📖 Prosedur & Alur Penggunaan</span>
        </button>

        <button
          onClick={() => setActiveTab('HTML_WIDGET')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'HTML_WIDGET' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white bg-neutral-950'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>🌐 1-Line HTML SDK</span>
        </button>

        <button
          onClick={() => setActiveTab('REACT')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'REACT' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white bg-neutral-950'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>⚛️ React / Next.js Component</span>
        </button>

        <button
          onClick={() => setActiveTab('BACKEND_API')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'BACKEND_API' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white bg-neutral-950'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>⚡ Backend REST API</span>
        </button>

        <button
          onClick={() => setActiveTab('LIVE_TESTER')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'LIVE_TESTER' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white bg-neutral-950'
          }`}
        >
          <Play className="w-3.5 h-3.5" />
          <span>🧪 Live API Tester</span>
        </button>
      </div>

      {/* Tab 0: Comprehensive Flow Guide & Usage Procedure */}
      {activeTab === 'GUIDE' && (
        <div className="space-y-6">
          {/* Step by Step Implementation Sequence */}
          <div className="bento-card p-6 border-neutral-800 space-y-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>4 Langkah Cepat Mengintegrasikan Catauth ke Website Anda</span>
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Ikuti 4 prosedur standar berikut untuk mengamankan halaman atau endpoint aplikasi Anda menggunakan otentikasi hardware NFC.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Step 1 */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-neutral-900 text-cyan-300 border border-cyan-800/40">
                    Langkah 1
                  </span>
                  <Key className="w-4 h-4 text-cyan-400" />
                </div>
                <h3 className="text-sm font-bold text-white">Daftarkan Kartu Fisik & Akun</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Buka menu <strong className="text-neutral-200">Keys & User Vault</strong>, lalu tap kartu fisik (e-Money / Flazz / e-KTP / YubiKey) untuk mendaftarkan UID dan mengaitkannya dengan akun user (Nama, Email, Role).
                </p>
              </div>

              {/* Step 2 */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-neutral-900 text-emerald-300 border border-emerald-800/40">
                    Langkah 2
                  </span>
                  <Shield className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="text-sm font-bold text-white">Buat Protected Link & Whitelist</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Buka menu <strong className="text-neutral-200">Protected Links</strong>, buat link baru dan tentukan URL tujuan (target redirect) serta kartu mana saja yang diizinkan mengakses link tersebut.
                </p>
              </div>

              {/* Step 3 */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-neutral-900 text-amber-300 border border-amber-800/40">
                    Langkah 3
                  </span>
                  <Code2 className="w-4 h-4 text-amber-400" />
                </div>
                <h3 className="text-sm font-bold text-white">Pasang Widget atau REST API</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Salin 1 baris kode HTML SDK atau hubungkan endpoint <code className="text-neutral-200">POST /api/v1/auth/verify-card</code> pada form login aplikasi web / mobile Anda.
                </p>
              </div>

              {/* Step 4 */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-neutral-900 text-purple-300 border border-purple-800/40">
                    Langkah 4
                  </span>
                  <Cpu className="w-4 h-4 text-purple-400" />
                </div>
                <h3 className="text-sm font-bold text-white">Verifikasi Session & Audit Log</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  User melakukan 1-Tap NFC di HP. Backend menerima JWT Token bertanda tangan, dan admin dapat memantau setiap tap secara real-time di <strong className="text-neutral-200">Admin Telemetry</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Architecture Flow Diagram */}
          <div className="bento-card p-6 border-neutral-800 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Diagram Alur Autentikasi Hardware (Zero-Trust NFC)</span>
            </h3>

            <div className="p-4 rounded-xl bg-black border border-neutral-800 text-xs font-mono space-y-3">
              <div className="flex items-center space-x-2 text-cyan-300">
                <span>[1. Client Web / App]</span>
                <span>──────── (User Tap Kartu NFC di HP) ───────➔</span>
                <span>[Web NFC NDEFReader]</span>
              </div>
              <div className="flex items-center space-x-2 text-emerald-300">
                <span>[Web NFC / App]</span>
                <span>──────── POST /api/v1/auth/verify-card ───────➔</span>
                <span>[Catauth Gateway]</span>
              </div>
              <div className="flex items-center space-x-2 text-amber-300">
                <span>[Catauth Gateway]</span>
                <span>──────── Periksa Whitelist & Status Kartu ──────➔</span>
                <span>[Vault / Supabase]</span>
              </div>
              <div className="flex items-center space-x-2 text-purple-300">
                <span>[Catauth Gateway]</span>
                <span>──────── Response 200 OK + Signed JWT Token ──➔</span>
                <span>[Client Web / App]</span>
              </div>
              <div className="flex items-center space-x-2 text-emerald-400 font-bold">
                <span>[Client Web / App]</span>
                <span>──────── Auto Login & Redirect ke Target ─────➔</span>
                <span>[Protected Area]</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 1: HTML Widget */}
      {activeTab === 'HTML_WIDGET' && (
        <div className="space-y-6">
          <div className="bento-card p-6 space-y-4 border-neutral-800">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-bold text-white text-sm">1-Line Universal HTML / JavaScript SDK</h3>
                <p className="text-xs text-neutral-400">
                  Pasang tombol "Sign in with Catauth NFC" di website statis, WordPress, PHP, atau framework apa pun.
                </p>
              </div>

              <button
                onClick={() => copyCode(htmlSnippet, 'html')}
                className="px-3 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-xs font-mono text-neutral-300 border border-neutral-800 flex items-center space-x-1.5 self-start sm:self-auto"
              >
                {copiedIndex === 'html' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedIndex === 'html' ? 'Tersalin!' : 'Salin Kode HTML'}</span>
              </button>
            </div>

            <pre className="p-4 rounded-lg bg-black border border-neutral-800 text-xs font-mono text-cyan-300 overflow-x-auto">
              {htmlSnippet}
            </pre>
          </div>
        </div>
      )}

      {/* Tab 2: React */}
      {activeTab === 'REACT' && (
        <div className="bento-card p-6 space-y-4 border-neutral-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="font-bold text-white text-sm">Komponen React / Next.js (TypeScript)</h3>
              <p className="text-xs text-neutral-400">
                Panggil sensor Web NFC secara langsung menggunakan custom React Hook atau Button Component.
              </p>
            </div>

            <button
              onClick={() => copyCode(reactSnippet, 'react')}
              className="px-3 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-xs font-mono text-neutral-300 border border-neutral-800 flex items-center space-x-1.5 self-start sm:self-auto"
            >
              {copiedIndex === 'react' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedIndex === 'react' ? 'Tersalin!' : 'Salin React Code'}</span>
            </button>
          </div>

          <pre className="p-4 rounded-lg bg-black border border-neutral-800 text-xs font-mono text-emerald-400 overflow-x-auto">
            {reactSnippet}
          </pre>
        </div>
      )}

      {/* Tab 3: Backend REST API */}
      {activeTab === 'BACKEND_API' && (
        <div className="space-y-5">
          {/* Sub Language Selector */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'curl', label: 'cURL' },
              { id: 'node', label: 'Node.js / Express' },
              { id: 'python', label: 'Python (FastAPI / Django)' },
              { id: 'php', label: 'PHP / Laravel' },
              { id: 'go', label: 'Golang' },
            ].map((lang) => (
              <button
                key={lang.id}
                onClick={() => setBackendLang(lang.id as any)}
                className={`px-3 py-1.5 rounded text-xs font-mono font-medium transition-colors ${
                  backendLang === lang.id
                    ? 'bg-neutral-800 text-white border border-neutral-700'
                    : 'bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-900'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>

          {/* Active Backend Code Box */}
          <div className="bento-card p-6 space-y-4 border-neutral-800">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs font-mono uppercase">
                {backendLang} Integration Code
              </span>
              <button
                onClick={() => {
                  const codeMap: any = {
                    curl: curlSnippet,
                    node: nodeSnippet,
                    python: pythonSnippet,
                    php: phpSnippet,
                    go: goSnippet,
                  };
                  copyCode(codeMap[backendLang], backendLang);
                }}
                className="px-3 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-xs font-mono text-neutral-300 border border-neutral-800 flex items-center space-x-1.5"
              >
                {copiedIndex === backendLang ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedIndex === backendLang ? 'Tersalin!' : 'Salin Kode'}</span>
              </button>
            </div>

            <pre className="p-4 rounded-lg bg-black border border-neutral-800 text-xs font-mono text-cyan-300 overflow-x-auto">
              {backendLang === 'curl' && curlSnippet}
              {backendLang === 'node' && nodeSnippet}
              {backendLang === 'python' && pythonSnippet}
              {backendLang === 'php' && phpSnippet}
              {backendLang === 'go' && goSnippet}
            </pre>
          </div>
        </div>
      )}

      {/* Tab 4: Live Tester */}
      {activeTab === 'LIVE_TESTER' && (
        <div className="bento-card p-6 space-y-5 border-neutral-800">
          <div>
            <h3 className="font-bold text-white text-sm">Uji Coba Langsung Endpoint Verifikasi API</h3>
            <p className="text-xs text-neutral-400">
              Kirim request langsung ke <code>POST /api/v1/auth/verify-card</code> untuk melihat format respons autentikasi secara live.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-neutral-300 font-mono">Card ID / Serial UID:</label>
              <input
                type="text"
                value={testCardId}
                onChange={(e) => setTestCardId(e.target.value)}
                placeholder="FIDO2-NFC-KEY-ALPHA-01 atau NFC-UID-..."
                className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800 text-xs font-mono text-cyan-300"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-neutral-300 font-mono">Protected Link ID:</label>
              <input
                type="text"
                disabled
                value={effectiveLinkId}
                className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800 text-xs font-mono text-neutral-400"
              />
            </div>
          </div>

          <button
            onClick={handleRunLiveTest}
            disabled={testLoading}
            className="px-5 py-2.5 rounded-md bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors flex items-center space-x-2"
          >
            {testLoading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Memverifikasi...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Kirim Permintaan Verifikasi API</span>
              </>
            )}
          </button>

          {testResponse && (
            <div className="p-4 rounded-lg bg-black border border-neutral-800 space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between text-[11px] text-neutral-400 border-b border-neutral-900 pb-2">
                <span>Respons API:</span>
                <span className={testResponse.authenticated ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                  {testResponse.authenticated ? '200 OK — AUTHENTICATED' : 'ERROR / REJECTED'}
                </span>
              </div>
              <pre className="text-[11px] text-cyan-300 overflow-x-auto max-h-64">
                {JSON.stringify(testResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
