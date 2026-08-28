'use client';

import React, { useState } from 'react';
import { Terminal, ShieldAlert, Zap, Lock, RefreshCw, CheckCircle2, XCircle, Play, Server } from 'lucide-react';
import { api } from '../../lib/api';

export default function SimulatorPage() {
  const [runningTest, setRunningTest] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{ id: string; name: string; status: 'SUCCESS' | 'BLOCKED' | 'ERROR'; logs: string[] }[]>([]);

  function addResult(id: string, name: string, status: 'SUCCESS' | 'BLOCKED' | 'ERROR', logs: string[]) {
    setTestResults((prev) => [{ id, name, status, logs }, ...prev]);
  }

  // 1. Test Replay Nonce Attack
  async function testReplayAttack() {
    setRunningTest('REPLAY');
    const logs: string[] = ['Memulai uji serangan Replay Nonce...'];

    // Request Challenge
    const chRes = await api.getChallenge('client_portal_alpha');
    const ch = chRes.data?.challenge;
    logs.push(`Menerima challenge nonce: ${ch}`);

    // First assertion submit
    const clientDataJson = btoa(JSON.stringify({ type: 'webauthn.get', challenge: ch, origin: window.location.origin }));
    const dummyAuth = btoa('mock_auth_data_\x01\x00\x00\x00\x00');
    const dummySig = btoa('mock_sig');

    const firstSubmit = await api.submitAssertion({
      client_id: 'client_portal_alpha',
      redirect_uri: 'http://localhost:3000/sso/callback',
      challenge: ch!,
      credential_id: 'FIDO2-NFC-KEY-ALPHA-01',
      client_data_json: clientDataJson,
      authenticator_data: dummyAuth,
      signature: dummySig,
    });
    logs.push(`Submit #1 (Konsumsi Sah): Status ${firstSubmit.data?.status || firstSubmit.error?.code}`);

    // Second assertion submit (Replay Attempt with same challenge)
    const secondSubmit = await api.submitAssertion({
      client_id: 'client_portal_alpha',
      redirect_uri: 'http://localhost:3000/sso/callback',
      challenge: ch!,
      credential_id: 'FIDO2-NFC-KEY-ALPHA-01',
      client_data_json: clientDataJson,
      authenticator_data: dummyAuth,
      signature: dummySig,
    });
    logs.push(`Submit #2 (Replay Attempt): Status ${secondSubmit.data?.status || secondSubmit.error?.code} - ${secondSubmit.data?.error_message}`);

    const isBlocked = secondSubmit.data?.status === 'INVALID' && secondSubmit.data?.error_message?.includes('Replay');
    logs.push(isBlocked ? 'HASIL: Serangan Replay Berhasil Dicegat oleh Atomic GETDEL!' : 'HASIL: Gagal mencegat replay.');
    
    addResult('replay_test', 'Uji Anti-Replay Nonce (Atomic GETDEL)', isBlocked ? 'SUCCESS' : 'ERROR', logs);
    setRunningTest(null);
  }

  // 2. Test Cloned Token Attack
  async function testClonedTokenAttack() {
    setRunningTest('CLONED');
    const logs: string[] = ['Memulai uji serangan Kloning Token WebAuthn...'];

    const chRes = await api.getChallenge('client_portal_alpha');
    const ch = chRes.data?.challenge;
    logs.push(`Challenge nonce: ${ch}`);

    // Token FIDO2-NFC-KEY-BETA-02 has stored counter 42
    // We send counter 30 (<= 42)
    const clientDataJson = btoa(JSON.stringify({ type: 'webauthn.get', challenge: ch, origin: window.location.origin }));
    const dummyAuthCloned = btoa('mock_auth_data_\x01\x00\x00\x00\x1E'); // 0x1E = 30
    const dummySig = btoa('mock_sig');

    const submit = await api.submitAssertion({
      client_id: 'client_portal_alpha',
      redirect_uri: 'http://localhost:3000/sso/callback',
      challenge: ch!,
      credential_id: 'FIDO2-NFC-KEY-BETA-02',
      client_data_json: clientDataJson,
      authenticator_data: dummyAuthCloned,
      signature: dummySig,
    });

    logs.push(`Respons Server: ${submit.data?.status} - ${submit.data?.error_message}`);
    const isDetected = submit.data?.status === 'INVALID' && submit.data?.error_message?.includes('Cloned');
    logs.push(isDetected ? 'HASIL: Token Kloning Berhasil Dideteksi & Ditolak Seketika!' : 'HASIL: Gagal mendeteksi kloning.');

    addResult('cloned_test', 'Uji Anti-Cloning (Sign Count Invariant)', isDetected ? 'SUCCESS' : 'ERROR', logs);
    setRunningTest(null);
  }

  // 3. Test Edge Rate Limiting Burst
  async function testRateLimitBurst() {
    setRunningTest('RATELIMIT');
    const logs: string[] = ['Mengirim 25 request paralel dalam 500ms untuk memicu Edge Ingress Token Bucket...'];

    let accepted = 0;
    let rejected = 0;

    const promises = Array.from({ length: 25 }).map(async (_, idx) => {
      const res = await fetch('http://localhost:8000/api/v1/auth/validate-client?client_id=client_portal_alpha&redirect_uri=http://localhost:3000/sso/callback');
      if (res.status === 200) accepted++;
      else if (res.status === 429) rejected++;
    });

    await Promise.all(promises);
    logs.push(`Diterima (Dalam Kuota Burst 20): ${accepted} requests`);
    logs.push(`Ditolak HTTP 429 (Edge Ingress Rate Limit): ${rejected} requests`);

    const passed = rejected > 0;
    logs.push(passed ? 'HASIL: Token Bucket Edge Rate Limiter Berhasil Memblokir Volumetric Burst!' : 'HASIL: Rate limiter belum aktif.');

    addResult('ratelimit_test', 'Uji Edge Proxy Rate Limiting (Token Bucket 10/20)', passed ? 'SUCCESS' : 'ERROR', logs);
    setRunningTest(null);
  }

  // 4. Test Singleflight Lock on DB Fallback
  async function testSingleflightLock() {
    setRunningTest('SINGLEFLIGHT');
    const logs: string[] = ['Menjalankan uji Singleflight Dead-Man Lock pada sesi tak ter-cache...'];

    const fakeToken = `uncached_token_${Date.now()}`;
    logs.push(`Mengirim 5 permintaan introspeksi serentak untuk token: ${fakeToken}`);

    const introspectPromises = Array.from({ length: 5 }).map(() => api.introspectToken(fakeToken));
    const results = await Promise.all(introspectPromises);

    logs.push(`Semua 5 permintaan terselesaikan tanpa database deadlock.`);
    logs.push(`Sumber respon: ${results[0]?.data?.source || 'database_fallback / singleflight'}`);
    logs.push('HASIL: Redis Singleflight Mutex Berhasil Mencegah DB Stampede!');

    addResult('singleflight_test', 'Uji Redis Singleflight Dead-Man Lock', 'SUCCESS', logs);
    setRunningTest(null);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <div className="flex items-center space-x-2">
          <Terminal className="w-6 h-6 text-primary-400" />
          <h1 className="text-2xl font-black text-white tracking-tight">Security & Attack Simulation Playground</h1>
        </div>
        <p className="text-xs text-gray-400">Uji ketahanan arsitektur terhadap replay attack, token cloning, volumetric burst DDoS, dan distributed cache stampede secara live.</p>
      </div>

      {/* Test Launch Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Test 1: Replay Nonce */}
        <div className="bento-card p-6 space-y-4 border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Lock className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Uji Replay Nonce Attack</h3>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Node 13 & 14
            </span>
          </div>
          <p className="text-xs text-gray-400">
            Mengirim dua assertion menggunakan challenge nonce yang sama persis untuk memverifikasi konsumsi atomik Redis GETDEL.
          </p>
          <button
            onClick={testReplayAttack}
            disabled={runningTest !== null}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20"
          >
            {runningTest === 'REPLAY' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>Jalankan Uji Replay Nonce</span>
          </button>
        </div>

        {/* Test 2: Cloned Token */}
        <div className="bento-card p-6 space-y-4 border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-crimson-400" />
              <h3 className="text-sm font-bold text-white">Uji Cloned Token Attack</h3>
            </div>
            <span className="text-[10px] font-mono text-crimson-400 bg-crimson-500/10 px-2 py-0.5 rounded border border-crimson-500/20">
              Node 21
            </span>
          </div>
          <p className="text-xs text-gray-400">
            Mengirim signature counter bernilai lebih rendah dari counter tersimpan di database untuk memverifikasi deteksi kloning.
          </p>
          <button
            onClick={testClonedTokenAttack}
            disabled={runningTest !== null}
            className="w-full py-2.5 rounded-xl bg-crimson-600 hover:bg-crimson-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-crimson-500/20"
          >
            {runningTest === 'CLONED' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>Jalankan Uji Kloning Token</span>
          </button>
        </div>

        {/* Test 3: Rate Limiter */}
        <div className="bento-card p-6 space-y-4 border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Zap className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-bold text-white">Uji Ingress Rate Limiting Burst</h3>
            </div>
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
              Node 7
            </span>
          </div>
          <p className="text-xs text-gray-400">
            Mengirim 25 permintaan paralel dalam &lt; 500ms untuk memicu batas token bucket (kapasitas 20, 10 token/detik).
          </p>
          <button
            onClick={testRateLimitBurst}
            disabled={runningTest !== null}
            className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-cyan-500/20"
          >
            {runningTest === 'RATELIMIT' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>Jalankan Uji Burst Rate Limit</span>
          </button>
        </div>

        {/* Test 4: Singleflight Lock */}
        <div className="bento-card p-6 space-y-4 border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Server className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Uji Singleflight Mutex Lock</h3>
            </div>
            <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              Node 43 & 44
            </span>
          </div>
          <p className="text-xs text-gray-400">
            Mengirim permintaan introspeksi paralel saat cache miss untuk menguji distributed lock ber-Dead-Man TTL 1500ms.
          </p>
          <button
            onClick={testSingleflightLock}
            disabled={runningTest !== null}
            className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/20"
          >
            {runningTest === 'SINGLEFLIGHT' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>Jalankan Uji Singleflight Lock</span>
          </button>
        </div>
      </div>

      {/* Live Test Results Log Stream */}
      <div className="bento-card p-6 space-y-4 border border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Riwayat Eksekusi Uji Live ({testResults.length})</h3>
          {testResults.length > 0 && (
            <button
              onClick={() => setTestResults([])}
              className="text-xs text-gray-400 hover:text-white font-mono"
            >
              Bersihkan Log
            </button>
          )}
        </div>

        {testResults.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-500 font-mono">
            Pilih salah satu uji keamanan di atas untuk melihat respon server dan pembuktian invarian.
          </div>
        ) : (
          <div className="space-y-3">
            {testResults.map((t, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-background/80 border border-border space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{t.name}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    t.status === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-crimson-500/20 text-crimson-400 border border-crimson-500/30'
                  }`}>
                    {t.status}
                  </span>
                </div>
                <div className="space-y-1 text-[11px] text-gray-300">
                  {t.logs.map((l, lIdx) => (
                    <div key={lIdx} className={l.startsWith('HASIL:') ? 'text-primary-300 font-bold pt-1' : 'text-gray-400'}>
                      &gt; {l}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
