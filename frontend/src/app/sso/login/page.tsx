'use client';

import React, { useState, useEffect, Suspense } from 'react';

import { useSearchParams, useRouter } from 'next/navigation';
import { 
  ShieldCheck, Smartphone, AlertTriangle, XCircle, 
  Lock, CheckCircle2, ArrowRight, RefreshCw, Globe, KeyRound, Radio, ShieldAlert 
} from 'lucide-react';
import { api } from '../../../lib/api';

function SSOLoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();


  // Query parameters
  const clientId = searchParams.get('client_id') || 'client_portal_alpha';
  const redirectUri = searchParams.get('redirect_uri') || '/sso/callback';

  const state = searchParams.get('state') || 'demo_state_123';
  const nonce = searchParams.get('nonce') || 'demo_nonce_xyz';

  // State machine
  const [loading, setLoading] = useState(true);
  const [clientData, setClientData] = useState<any>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [browserCompatible, setBrowserCompatible] = useState(true);
  const [challenge, setChallenge] = useState<string | null>(null);

  // Authentication status
  const [flowState, setFlowState] = useState<'IDLE' | 'TAPPING' | 'NEED_PIN' | 'SUCCESS' | 'ERROR_BLOCKED' | 'ERROR_INVALID' | 'ERROR_GEOFENCE' | 'ERROR_INCOMPATIBLE'>('IDLE');
  const [errorMessage, setErrorMessage] = useState('');
  const [tempAuthSession, setTempAuthSession] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [redirectTarget, setRedirectTarget] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);

  // Available test keys for simulation
  const [selectedKey, setSelectedKey] = useState<'ALPHA' | 'BETA' | 'REVOKED' | 'CLONED'>('ALPHA');

  // 1. Initial Validation on Mount (Nodes 1 to 5)
  useEffect(() => {
    async function initGateway() {
      setLoading(true);

      // Node 3 & 4: Validate Client & URL
      const clientRes = await api.validateClient(clientId, redirectUri, state, nonce);
      if (!clientRes.success) {
        setClientError(clientRes.error?.message || 'Invalid client application parameter.');
        setLoading(false);
        return;
      }
      setClientData(clientRes.data);

      // Node 5 & 6: Check Browser WebAuthn support
      if (typeof window !== 'undefined' && !window.PublicKeyCredential) {
        setBrowserCompatible(false);
        setFlowState('ERROR_INCOMPATIBLE');
        setLoading(false);
        return;
      }

      // Node 8 & 9: Request WebAuthn Challenge
      const chRes = await api.getChallenge(clientId);
      if (chRes.success && chRes.data) {
        setChallenge(chRes.data.challenge);
      } else {
        setClientError('Failed to generate authentication challenge from gateway.');
      }

      setLoading(false);
    }

    initGateway();
  }, [clientId, redirectUri, state, nonce]);

  // Handle countdown for SSO redirect (Node 32 & 33)
  useEffect(() => {
    let timer: any;
    if (flowState === 'SUCCESS' && redirectTarget) {
      if (countdown > 0) {
        timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      } else {
        window.location.href = redirectTarget;
      }
    }
    return () => clearTimeout(timer);
  }, [flowState, redirectTarget, countdown]);

  // Execute NFC Assertion Tap (Nodes 10 to 22)
  async function handleNFCTap() {
    if (!challenge) return;
    setFlowState('TAPPING');
    setErrorMessage('');

    // Simulate 600ms hardware NFC scanning delay
    await new Promise((r) => setTimeout(r, 600));

    // Construct test payload based on selected key
    let credId = 'FIDO2-NFC-KEY-ALPHA-01';
    let signCount = 0;

    if (selectedKey === 'BETA') {
      credId = 'FIDO2-NFC-KEY-BETA-02';
      signCount = 50; // Valid increment (> 42)
    } else if (selectedKey === 'REVOKED') {
      credId = 'FIDO2-NFC-KEY-REVOKED-03';
      signCount = 10;
    } else if (selectedKey === 'CLONED') {
      credId = 'FIDO2-NFC-KEY-BETA-02';
      signCount = 30; // CLONED ANOMALY (<= 42 stored)
    }

    // Prepare WebAuthn authenticatorData (RP ID hash + UP flag + uint32 counter)
    const clientDataObj = {
      type: 'webauthn.get',
      challenge: challenge,
      origin: window.location.origin,
    };
    const clientDataJsonB64 = btoa(JSON.stringify(clientDataObj));

    // Mock binary auth data
    const dummyAuthData = btoa(`catauth_rpid_hash_32bytes_pad___\x01\x00\x00\x00${String.fromCharCode(signCount)}`);
    const dummySignature = btoa('mock_hardware_ecdsa_signature_payload');

    const res = await api.submitAssertion({
      client_id: clientId,
      redirect_uri: redirectUri,
      challenge: challenge,
      credential_id: credId,
      client_data_json: clientDataJsonB64,
      authenticator_data: dummyAuthData,
      signature: dummySignature,
      state: state || undefined,
      nonce: nonce || undefined,
    });

    if (!res.success || !res.data) {
      setFlowState('ERROR_INVALID');
      setErrorMessage(res.error?.message || 'Authentication failed.');
      return;
    }

    const data = res.data;

    if (data.status === 'BLOCKED') {
      setFlowState('ERROR_BLOCKED');
      setErrorMessage(data.error_message || 'Hardware token is revoked or blocked.');
    } else if (data.status === 'GEOFENCE_REJECTED') {
      setFlowState('ERROR_GEOFENCE');
      setErrorMessage(data.error_message || 'Access rejected due to geofencing restriction.');
    } else if (data.status === 'NEED_PIN_MFA') {
      setFlowState('NEED_PIN');
      setTempAuthSession(data.temp_auth_session);
    } else if (data.status === 'SUCCESS') {
      setFlowState('SUCCESS');
      setAuthCode(data.auth_code);
      setRedirectTarget(data.redirect_url);
    } else {
      setFlowState('ERROR_INVALID');
      setErrorMessage(data.error_message || 'Cryptographic verification failed.');
    }
  }

  // Handle PIN MFA Verification (Node 26 & 27)
  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tempAuthSession || !pin) return;
    setPinLoading(true);

    const res = await api.verifyPin({
      temp_auth_session: tempAuthSession,
      pin: pin,
      client_id: clientId,
      redirect_uri: redirectUri,
      state: state || undefined,
      nonce: nonce || undefined,
    });

    setPinLoading(false);

    if (res.success && res.data && res.data.status === 'SUCCESS') {
      setFlowState('SUCCESS');
      setAuthCode(res.data.auth_code);
      setRedirectTarget(res.data.redirect_url);
    } else {
      alert(res.error?.message || 'Invalid PIN entered. Please try again.');
    }
  }

  // Render Client Error Screen (Node 4)
  if (clientError) {
    return (
      <div className="max-w-md mx-auto my-12 bento-card p-8 text-center space-y-6 border-crimson-500/30">
        <div className="w-16 h-16 rounded-2xl bg-crimson-500/10 border border-crimson-500/20 text-crimson-500 flex items-center justify-center mx-auto">
          <XCircle className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Layar Error Klien</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-crimson-500/10 text-crimson-400 border border-crimson-500/20">
            Node 4: Klien Ilegal / Mismatch
          </span>
          <p className="text-xs text-gray-400 leading-relaxed pt-2">{clientError}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-xl bg-card hover:bg-border text-xs text-gray-300 border border-border"
        >
          Muat Ulang Permintaan
        </button>
      </div>
    );
  }

  // Render Browser Incompatible Screen (Node 6)
  if (flowState === 'ERROR_INCOMPATIBLE') {
    return (
      <div className="max-w-md mx-auto my-12 bento-card p-8 text-center space-y-6 border-amber-500/30">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Layar Tak Kompatibel</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Node 6: FIDO2 / WebAuthn Absen
          </span>
          <p className="text-xs text-gray-400 leading-relaxed pt-2">
            Perangkat atau peramban Anda tidak mendukung WebAuthn / FIDO2 API. Silakan gunakan Chrome, Firefox, Safari, atau Edge terbaru.
          </p>
        </div>
      </div>
    );
  }

  // Render Card Blocked Screen (Node 20)
  if (flowState === 'ERROR_BLOCKED') {
    return (
      <div className="max-w-md mx-auto my-12 bento-card p-8 text-center space-y-6 border-crimson-500/40">
        <div className="w-16 h-16 rounded-2xl bg-crimson-500/10 border border-crimson-500/20 text-crimson-500 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Layar Kartu Diblokir</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-crimson-500/10 text-crimson-400 border border-crimson-500/20">
            Node 20: Kredensial Nonaktif
          </span>
          <p className="text-xs text-gray-400 leading-relaxed pt-2">{errorMessage}</p>
        </div>
        <button
          onClick={() => { setFlowState('IDLE'); setSelectedKey('ALPHA'); }}
          className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-xs font-semibold text-white"
        >
          Coba Token Lain
        </button>
      </div>
    );
  }

  // Render Geofence Blocked Screen (Node 24)
  if (flowState === 'ERROR_GEOFENCE') {
    return (
      <div className="max-w-md mx-auto my-12 bento-card p-8 text-center space-y-6 border-amber-500/30">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
          <Globe className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Layar Akses Terisolasi</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Node 24: Geofencing Restriction
          </span>
          <p className="text-xs text-gray-400 leading-relaxed pt-2">{errorMessage}</p>
        </div>
        <button
          onClick={() => setFlowState('IDLE')}
          className="px-4 py-2 rounded-xl bg-card hover:bg-border text-xs text-gray-300 border border-border"
        >
          Kembali ke Gerbang
        </button>
      </div>
    );
  }

  // Render Credential Invalid / Cloned Screen (Node 22)
  if (flowState === 'ERROR_INVALID') {
    return (
      <div className="max-w-md mx-auto my-12 bento-card p-8 text-center space-y-6 border-crimson-500/40">
        <div className="w-16 h-16 rounded-2xl bg-crimson-500/10 border border-crimson-500/20 text-crimson-400 flex items-center justify-center mx-auto">
          <XCircle className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Layar Gagal Kredensial</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-crimson-500/10 text-crimson-400 border border-crimson-500/20">
            Node 22: Assertion / Cloned Anomaly
          </span>
          <p className="text-xs text-gray-400 leading-relaxed pt-2">{errorMessage}</p>
        </div>
        <button
          onClick={() => { setFlowState('IDLE'); setSelectedKey('ALPHA'); }}
          className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-xs font-semibold text-white"
        >
          Coba Lagi dengan Nonce Baru
        </button>
      </div>
    );
  }

  // Render SSO Redirect Screen (Node 32 & 33)
  if (flowState === 'SUCCESS') {
    return (
      <div className="max-w-md mx-auto my-12 bento-card p-8 text-center space-y-6 border-emerald-500/40">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Otentikasi Berhasil!</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Node 32: Layar Pengalihan SSO
          </span>
          <p className="text-xs text-gray-400 pt-2">
            Mengalihkan browser kembali ke <strong>{clientData?.app_name}</strong> dalam {countdown} detik...
          </p>
        </div>

        <div className="p-3 rounded-xl bg-background/60 border border-border text-left font-mono text-[11px] space-y-1">
          <div className="text-gray-500">Single-Use Auth Code:</div>
          <div className="text-emerald-400 truncate">{authCode}</div>
        </div>

        {redirectTarget && (
          <a
            href={redirectTarget}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
          >
            <span>Lanjutkan Sekarang</span>
            <ArrowRight className="w-4 h-4" />
          </a>
        )}
      </div>
    );
  }

  // Render Secondary PIN Input Modal (Node 26)
  if (flowState === 'NEED_PIN') {
    return (
      <div className="max-w-md mx-auto my-12 bento-card p-8 space-y-6 border-indigo-500/30">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white">Verifikasi PIN Tambahan</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
            Node 26: Layar Input PIN Tambahan (Argon2id)
          </span>
          <p className="text-xs text-gray-400">Kebijakan keamanan mewajibkan verifikasi PIN master (Default demo: 123456)</p>
        </div>

        <form onSubmit={handlePinSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Security PIN (6-Digit)</label>
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="123456"
              className="w-full text-center tracking-widest text-lg font-mono px-4 py-3 rounded-xl bg-background border border-border focus:border-primary-500 focus:outline-none text-white"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={pinLoading || pin.length < 4}
            className="w-full py-3 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-primary-500/25 transition-all"
          >
            {pinLoading ? 'Memverifikasi Hash Argon2id...' : 'Konfirmasi & Terbitkan Token'}
          </button>
        </form>
      </div>
    );
  }

  // Default: Main SSO Gateway View (Node 2, 7, 8, 9, 10)
  return (
    <div className="max-w-xl mx-auto my-8 space-y-6">
      {/* Client Profile Header (Node 2) */}
      <div className="bento-card p-6 flex items-center justify-between border border-border">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-400 font-bold text-lg">
            {clientData?.app_name ? clientData.app_name[0] : 'S'}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-white">{clientData?.app_name || 'Portal Mitra'}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono border border-emerald-500/20">
                Verified Mitra
              </span>
            </div>
            <p className="text-xs text-gray-400 font-mono">Client ID: {clientId}</p>
          </div>
        </div>

        <div className="text-right text-[11px] font-mono text-gray-400">
          <div>RP: {clientData?.rp_id || 'catauth.io'}</div>
          <div className="text-emerald-400">FIDO2 Ready</div>
        </div>
      </div>

      {/* NFC Tap Card Prompt (Node 10 / node-7) */}
      <div className="bento-card p-8 text-center space-y-8 relative overflow-hidden border-primary-500/30">
        <div className="space-y-2 relative z-10">
          <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-primary-500/20 text-primary-300 border border-primary-500/30">
            Node 10: Layar Prompt FIDO2 NFC
          </span>
          <h3 className="text-2xl font-extrabold text-white">Tempelkan Kartu / Kunci Token NFC</h3>
          <p className="text-xs text-gray-300 max-w-sm mx-auto">
            Dekatkan kartu fisik FIDO2 NFC atau masukkan token keamanan hardware Anda ke pembaca.
          </p>
        </div>

        {/* Concentric Radar Wave Animation */}
        <div className="relative w-48 h-48 mx-auto flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-neutral-700 animate-radar-ping"></div>
          <div className="absolute inset-6 rounded-full border border-neutral-800 animate-radar-ping" style={{ animationDelay: '0.8s' }}></div>
          <div className="absolute inset-12 rounded-full border border-neutral-800 animate-radar-ping" style={{ animationDelay: '1.6s' }}></div>
          
          <div className="relative z-10 w-24 h-24 rounded-2xl bg-neutral-950 border border-neutral-800 flex flex-col items-center justify-center shadow-2xl">
            <Radio className="w-7 h-7 text-white animate-pulse" />
            <span className="text-[10px] font-mono font-semibold text-neutral-300 mt-1">NFC SCAN</span>
          </div>
        </div>

        {/* Hardware Token Selector for Testing/Simulation */}
        <div className="p-4 rounded-xl bg-neutral-950 border border-border text-left space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-200 flex items-center space-x-1.5">
              <KeyRound className="w-3.5 h-3.5 text-white" />
              <span>Simulasi Kartu Hardware:</span>
            </span>
            <span className="text-[10px] text-neutral-500 font-mono">Pilih Kondisi Uji</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSelectedKey('ALPHA')}
              className={`p-2.5 rounded-lg border text-left transition-all ${
                selectedKey === 'ALPHA'
                  ? 'bg-neutral-900 border-white text-white'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <div className="font-semibold text-[11px] text-white">YubiKey 5 NFC (Alpha)</div>
              <div className="text-[10px] text-neutral-500">Static zero counter (0)</div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedKey('BETA')}
              className={`p-2.5 rounded-lg border text-left transition-all ${
                selectedKey === 'BETA'
                  ? 'bg-neutral-900 border-white text-white'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <div className="font-semibold text-[11px] text-white">Feitian ePass (Beta)</div>
              <div className="text-[10px] text-neutral-500">Counter tracking (&gt; 42)</div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedKey('CLONED')}
              className={`p-2.5 rounded-lg border text-left transition-all ${
                selectedKey === 'CLONED'
                  ? 'bg-neutral-900 border-red-500 text-white'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <div className="font-semibold text-[11px] text-red-400">Uji Kloning Token</div>
              <div className="text-[10px] text-neutral-500">Counter mundur (30 &le; 42)</div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedKey('REVOKED')}
              className={`p-2.5 rounded-lg border text-left transition-all ${
                selectedKey === 'REVOKED'
                  ? 'bg-neutral-900 border-amber-500 text-white'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <div className="font-semibold text-[11px] text-amber-400">Uji Kartu Terblokir</div>
              <div className="text-[10px] text-neutral-500">Revoked NFC token</div>
            </button>
          </div>
        </div>

        {/* Action Button (Node 11 / node-8) */}
        <button
          onClick={handleNFCTap}
          disabled={flowState === 'TAPPING'}
          className="w-full py-3 rounded-md bg-white hover:bg-neutral-200 text-black text-xs font-semibold transition-colors flex items-center justify-center space-x-2"
        >
          {flowState === 'TAPPING' ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Membaca Sinyal NFC & Memverifikasi Assertion...</span>
            </>
          ) : (
            <>
              <Smartphone className="w-4 h-4" />
              <span>Tap Kartu FIDO2 NFC Sekarang</span>
            </>
          )}
        </button>


        {challenge && (
          <div className="text-[10px] font-mono text-gray-500 truncate">
            Transient Nonce (60s TTL): {challenge}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SSOLoginPage() {
  return (
    <Suspense fallback={
      <div className="max-w-md mx-auto my-12 bento-card p-8 text-center space-y-4">
        <div className="w-8 h-8 rounded-full border-2 border-primary-500 border-t-transparent animate-spin mx-auto"></div>
        <p className="text-xs text-gray-400 font-mono">Memuat Gateway SSO...</p>
      </div>
    }>
      <SSOLoginContent />
    </Suspense>
  );
}

