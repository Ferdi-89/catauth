'use client';

import React, { useState, useEffect } from 'react';
import { 
  Code2, Copy, Check, Terminal, Globe, Server, Smartphone, 
  Key, ShieldCheck, Sparkles, RefreshCw, ExternalLink, Play 
} from 'lucide-react';
import { api } from '../../../lib/api';
import { ProtectedLink } from '../../../lib/types';

export default function AdminEmbedPage() {
  const [links, setLinks] = useState<ProtectedLink[]>([]);
  const [selectedLinkId, setSelectedLinkId] = useState<string>('');
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'HTML_WIDGET' | 'REACT' | 'BACKEND_API' | 'LIVE_TESTER'>('HTML_WIDGET');

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

  // 1. HTML Snippet
  const htmlSnippet = `<!-- 1. Pasang Script SDK Catauth di website Anda -->
<script src="${origin}/sdk/catauth.js"></script>

<!-- 2. Tambahkan wadah tombol Login -->
<div id="catauth-login-container"></div>

<script>
  // 3. Render tombol Login dengan 1 baris kode
  Catauth.renderButton('#catauth-login-container', {
    linkId: '${effectiveLinkId}',
    theme: 'dark', // 'dark' | 'light'
    text: 'Sign in with Catauth NFC',
    onSuccess: function(authData) {
      console.log('Login Berhasil!', authData);
      // authData.user -> { user_id, name, card_id, card_label }
      // authData.auth_token -> Signed JWT Token
      
      // Simpan session & login-kan user seketika:
      localStorage.setItem('auth_token', authData.auth_token);
      window.location.href = '/dashboard';
    },
    onError: function(err) {
      alert('Login Gagal: ' + err.message);
    }
  });
</script>`;

  // 2. React / Next.js Snippet
  const reactSnippet = `'use client';
import { useEffect } from 'react';

export default function LoginPage() {
  async function handleNFCLogin() {
    try {
      // Panggil scanner Web NFC Catauth langsung
      const res = await fetch('${origin}/api/v1/auth/verify-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: 'NFC-UID-04A23B4C', // atau dari navigator NFC
          link_id: '${effectiveLinkId}',
        }),
      });

      const data = await res.json();
      if (data.authenticated) {
        localStorage.setItem('token', data.auth_token);
        alert('Selamat datang, ' + data.user.name);
        window.location.href = '/dashboard';
      }
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <button 
      onClick={handleNFCLogin}
      className="px-6 py-3 rounded-lg bg-black text-white font-semibold flex items-center gap-2 border border-neutral-700"
    >
      <span>📲 Tap Kartu NFC untuk Login</span>
    </button>
  );
}`;

  // 3. Backend REST API Snippets (cURL, Node.js, PHP, Python)
  const curlSnippet = `curl -X POST "${origin}/api/v1/auth/verify-card" \\
  -H "Content-Type: application/json" \\
  -d '{
    "card_id": "NFC-UID-04A23B4C",
    "link_id": "${effectiveLinkId}"
  }'`;

  const phpSnippet = `<?php
// PHP Backend Verification
$payload = json_encode([
    "card_id" => "NFC-UID-04A23B4C",
    "link_id" => "${effectiveLinkId}"
]);

$ch = curl_init("${origin}/api/v1/auth/verify-card");
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type:application/json']);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$result = json_decode(curl_exec($ch), true);
curl_close($ch);

if ($result['authenticated']) {
    $_SESSION['user_id'] = $result['user']['user_id'];
    $_SESSION['card_id'] = $result['user']['card_id'];
    header("Location: /dashboard");
}`;

  const nodeSnippet = `// Node.js / Express Backend
const response = await fetch('${origin}/api/v1/auth/verify-card', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    card_id: 'NFC-UID-04A23B4C',
    link_id: '${effectiveLinkId}',
  }),
});

const data = await response.json();
if (data.authenticated) {
  // Login session created!
  req.session.userId = data.user.user_id;
  req.session.authToken = data.auth_token;
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
              Embed Widget & REST API Hub
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-neutral-900 text-cyan-300 border border-cyan-800/50">
              Direct Auth API v1.0
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Pasang tombol login NFC di website lain atau integrasikan verifikasi kartu langsung via REST API ke backend aplikasi Anda.
          </p>
        </div>

        {/* Link Selector */}
        {links.length > 0 && (
          <div className="flex items-center space-x-2">
            <label className="text-xs text-neutral-400 font-mono">Protected Link:</label>
            <select
              value={selectedLinkId}
              onChange={(e) => setSelectedLinkId(e.target.value)}
              className="px-3 py-1.5 rounded-md bg-neutral-900 border border-neutral-800 text-xs text-white font-mono focus:outline-none"
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
      <div className="flex items-center space-x-2 border-b border-neutral-800 pb-3">
        <button
          onClick={() => setActiveTab('HTML_WIDGET')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
            activeTab === 'HTML_WIDGET' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
          }`}
        >
          🌐 1-Line HTML Widget (JS SDK)
        </button>

        <button
          onClick={() => setActiveTab('REACT')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
            activeTab === 'REACT' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
          }`}
        >
          ⚛️ React / Next.js Component
        </button>

        <button
          onClick={() => setActiveTab('BACKEND_API')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
            activeTab === 'BACKEND_API' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
          }`}
        >
          ⚡ Backend REST API (Node / PHP / cURL)
        </button>

        <button
          onClick={() => setActiveTab('LIVE_TESTER')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
            activeTab === 'LIVE_TESTER' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
          }`}
        >
          🧪 Live API Tester
        </button>
      </div>

      {/* Tab 1: HTML Widget */}
      {activeTab === 'HTML_WIDGET' && (
        <div className="space-y-6">
          <div className="bento-card p-6 space-y-4 border-neutral-800">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-sm">Pasang Tombol Login "Sign in with Catauth NFC"</h3>
                <p className="text-xs text-neutral-400">
                  Cukup sertakan script SDK di HTML website Anda, tombol login NFC otomatis muncul dan mengautentikasi pengguna.
                </p>
              </div>

              <button
                onClick={() => copyCode(htmlSnippet, 'html')}
                className="px-3 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-xs font-mono text-neutral-300 border border-neutral-800 flex items-center space-x-1.5"
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
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white text-sm">Integrasi React / Next.js</h3>
              <p className="text-xs text-neutral-400">
                Panggil endpoint API Catauth langsung dari komponen React atau custom auth handler Anda.
              </p>
            </div>

            <button
              onClick={() => copyCode(reactSnippet, 'react')}
              className="px-3 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-xs font-mono text-neutral-300 border border-neutral-800 flex items-center space-x-1.5"
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
        <div className="grid grid-cols-1 gap-6">
          {/* cURL */}
          <div className="bento-card p-6 space-y-3 border-neutral-800">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs font-mono">1. cURL Request</span>
              <button
                onClick={() => copyCode(curlSnippet, 'curl')}
                className="text-[11px] font-mono text-neutral-400 hover:text-white flex items-center space-x-1"
              >
                {copiedIndex === 'curl' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>Salin</span>
              </button>
            </div>
            <pre className="p-3 rounded bg-black border border-neutral-800 text-[11px] font-mono text-cyan-300 overflow-x-auto">
              {curlSnippet}
            </pre>
          </div>

          {/* Node.js */}
          <div className="bento-card p-6 space-y-3 border-neutral-800">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs font-mono">2. Node.js / Express</span>
              <button
                onClick={() => copyCode(nodeSnippet, 'node')}
                className="text-[11px] font-mono text-neutral-400 hover:text-white flex items-center space-x-1"
              >
                {copiedIndex === 'node' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>Salin</span>
              </button>
            </div>
            <pre className="p-3 rounded bg-black border border-neutral-800 text-[11px] font-mono text-emerald-400 overflow-x-auto">
              {nodeSnippet}
            </pre>
          </div>

          {/* PHP */}
          <div className="bento-card p-6 space-y-3 border-neutral-800">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs font-mono">3. PHP / Laravel</span>
              <button
                onClick={() => copyCode(phpSnippet, 'php')}
                className="text-[11px] font-mono text-neutral-400 hover:text-white flex items-center space-x-1"
              >
                {copiedIndex === 'php' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>Salin</span>
              </button>
            </div>
            <pre className="p-3 rounded bg-black border border-neutral-800 text-[11px] font-mono text-amber-300 overflow-x-auto">
              {phpSnippet}
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
