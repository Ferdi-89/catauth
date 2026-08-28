'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  Smartphone, AlertTriangle, XCircle, 
  Lock, CheckCircle2, ArrowRight, RefreshCw, Globe, KeyRound, Radio, ShieldAlert,
  ExternalLink, Link2, Key
} from 'lucide-react';
import { api } from '../../../lib/api';

function SSOLoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Query parameters
  const linkId = searchParams.get('link_id') || '';
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
  const [flowState, setFlowState] = useState<
    'IDLE' | 'TAPPING' | 'NEED_PIN' | 'SUCCESS' | 'ERROR_BLOCKED' | 'ERROR_INVALID' | 'ERROR_UNAUTHORIZED_CARD' | 'ERROR_GEOFENCE' | 'ERROR_INCOMPATIBLE'
  >('IDLE');
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

      // Validate Client or Protected Link
      const clientRes = await api.validateClient(linkId || clientId, redirectUri, state, nonce, linkId || undefined);
      if (!clientRes.success) {
        setClientError(clientRes.error?.message || 'Invalid client or protected link parameter.');
        setLoading(false);
        return;
      }
      setClientData(clientRes.data);

      // Check Browser WebAuthn support
      if (typeof window !== 'undefined' && !window.PublicKeyCredential) {
        setBrowserCompatible(false);
        setFlowState('ERROR_INCOMPATIBLE');
        setLoading(false);
        return;
      }

      // Request WebAuthn Challenge
      const chRes = await api.getChallenge(clientId);
      if (chRes.success && chRes.data) {
        setChallenge(chRes.data.challenge);
      } else {
        setClientError('Failed to generate authentication challenge from gateway.');
      }

      setLoading(false);
    }

    initGateway();
  }, [clientId, redirectUri, state, nonce, linkId]);

  // Handle countdown for SSO redirect
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

  // Execute NFC Assertion Tap
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
      credId = 'FIDO2-NFC-KEY-CLONED-99';
      signCount = 30; // CLONED ANOMALY
    }

    // Prepare WebAuthn authenticatorData
    const clientDataObj = {
      type: 'webauthn.get',
      challenge: challenge,
      origin: typeof window !== 'undefined' ? window.location.origin : 'https://catauth.io',
    };
    const clientDataJsonB64 = btoa(JSON.stringify(clientDataObj));
    const dummyAuthData = btoa(`catauth_rpid_hash_32bytes_pad___\x01\x00\x00\x00${String.fromCharCode(signCount)}`);
    const dummySignature = btoa('mock_hardware_ecdsa_signature_payload');

    const res = await api.submitAssertion({
      client_id: clientId,
      link_id: linkId || clientData?.link_id,
      redirect_uri: clientData?.target_redirect_url || redirectUri,
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
    } else if (data.status === 'UNAUTHORIZED_CARD') {
      setFlowState('ERROR_UNAUTHORIZED_CARD');
      setErrorMessage(data.error_message || 'Kartu NFC ini tidak terdaftar dalam whitelist link ini.');
    } else if (data.status === 'GEOFENCE_REJECTED') {
      setFlowState('ERROR_GEOFENCE');
      setErrorMessage(data.error_message || 'Access rejected due to geofencing restriction.');
    } else if (data.status === 'NEED_PIN_MFA' || clientData?.require_pin) {
      setFlowState('NEED_PIN');
      setTempAuthSession(data.temp_auth_session || 'sess_tmp_123');
    } else if (data.status === 'SUCCESS') {
      setFlowState('SUCCESS');
      setAuthCode(data.auth_code);
      setRedirectTarget(data.redirect_target || clientData?.target_redirect_url || '/sso/callback');
    } else {
      setFlowState('ERROR_INVALID');
      setErrorMessage(data.error_message || 'Cryptographic verification failed.');
    }
  }

  // Handle PIN MFA Verification
  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin) return;
    setPinLoading(true);

    const res = await api.verifyPin({
      temp_auth_session: tempAuthSession || 'sess_tmp',
      pin: pin,
      client_id: clientId,
      link_id: linkId || clientData?.link_id,
      redirect_uri: clientData?.target_redirect_url || redirectUri,
      state: state || undefined,
    });

    setPinLoading(false);

    if (res.success && res.data) {
      setFlowState('SUCCESS');
      setAuthCode(res.data.auth_code);
      setRedirectTarget(res.data.redirect_target || clientData?.target_redirect_url || '/sso/callback');
    } else {
      alert(res.error?.message || 'PIN tidak sesuai. Silakan coba lagi (Demo PIN: 123456).');
    }
  }

  // Render Client / Link Error Screen
  if (clientError) {
    return (
      <div className="max-w-md mx-auto my-12 bento-card p-8 text-center space-y-6 border-red-800/40">
        <div className="w-16 h-16 rounded-2xl bg-red-950/40 border border-red-800/40 text-red-400 flex items-center justify-center mx-auto">
          <XCircle className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Protected Link Tidak Ditemukan</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-red-950/40 text-red-400 border border-red-800/40">
            Node 4: Link / Client Whitelist Mismatch
          </span>
          <p className="text-xs text-neutral-400 leading-relaxed pt-2">{clientError}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-md bg-neutral-900 hover:bg-neutral-800 text-xs text-neutral-200 border border-neutral-800"
        >
          Muat Ulang Permintaan
        </button>
      </div>
    );
  }

  // Render Unauthorized Card Screen (Per-Link Card Whitelist Violation)
  if (flowState === 'ERROR_UNAUTHORIZED_CARD') {
    return (
      <div className="max-w-md mx-auto my-12 bento-card p-8 text-center space-y-6 border-red-800/50">
        <div className="w-16 h-16 rounded-2xl bg-red-950/40 border border-red-800/40 text-red-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Kartu Tidak Dikenali / Tidak Diizinkan</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-red-950/40 text-red-400 border border-red-800/40">
            Node 20: Link Whitelist Violation
          </span>
          <p className="text-xs text-neutral-300 leading-relaxed pt-2">{errorMessage}</p>
        </div>
        <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-left text-xs font-mono text-neutral-400 space-y-1">
          <div>Protected Link: <span className="text-white">{clientData?.app_name}</span></div>
          <div>Status: <span className="text-red-400">UNAUTHORIZED_CARD</span></div>
        </div>
        <button
          onClick={() => { setFlowState('IDLE'); setSelectedKey('ALPHA'); }}
          className="w-full py-2.5 rounded-md bg-white hover:bg-neutral-200 text-black text-xs font-semibold"
        >
          Coba Gunakan Kartu Terdaftar (Alpha Key)
        </button>
      </div>
    );
  }

  // Render Revoked Screen
  if (flowState === 'ERROR_BLOCKED') {
    return (
      <div className="max-w-md mx-auto my-12 bento-card p-8 text-center space-y-6 border-red-800/40">
        <div className="w-16 h-16 rounded-2xl bg-red-950/40 border border-red-800/40 text-red-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Token Telah Dicabut</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-red-950/40 text-red-400 border border-red-800/40">
            Node 20: Revocation Lock
          </span>
          <p className="text-xs text-neutral-400 leading-relaxed pt-2">{errorMessage}</p>
        </div>
        <button
          onClick={() => { setFlowState('IDLE'); setSelectedKey('ALPHA'); }}
          className="px-4 py-2 rounded-md bg-white hover:bg-neutral-200 text-black text-xs font-semibold"
        >
          Gunakan Kartu Lain
        </button>
      </div>
    );
  }

  // Render Cloned Screen
  if (flowState === 'ERROR_INVALID') {
    return (
      <div className="max-w-md mx-auto my-12 bento-card p-8 text-center space-y-6 border-red-800/40">
        <div className="w-16 h-16 rounded-2xl bg-red-950/40 border border-red-800/40 text-red-400 flex items-center justify-center mx-auto">
          <XCircle className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Anomali Kloning / Gagal Kriptografis</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-red-950/40 text-red-400 border border-red-800/40">
            Node 22: Cloned Anomaly Blocked
          </span>
          <p className="text-xs text-neutral-400 leading-relaxed pt-2">{errorMessage}</p>
        </div>
        <button
          onClick={() => { setFlowState('IDLE'); setSelectedKey('ALPHA'); }}
          className="px-4 py-2 rounded-md bg-white hover:bg-neutral-200 text-black text-xs font-semibold"
        >
          Coba Lagi dengan Nonce Baru
        </button>
      </div>
    );
  }

  // Render SSO Redirect Screen
  if (flowState === 'SUCCESS') {
    return (
      <div className="max-w-md mx-auto my-12 bento-card p-8 text-center space-y-6 border-emerald-800/40">
        <div className="w-16 h-16 rounded-2xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Otentikasi Berhasil!</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/40">
            Node 32: Layar Pengalihan SSO
          </span>
          <p className="text-xs text-neutral-400 pt-2">
            Mengalihkan ke <strong>{clientData?.app_name}</strong> dalam {countdown} detik...
          </p>
        </div>

        <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-left font-mono text-[11px] space-y-1.5">
          <div className="text-neutral-500">Target Destination:</div>
          <div className="text-cyan-300 break-all">{redirectTarget}</div>
        </div>

        {redirectTarget && (
          <a
            href={redirectTarget}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-md bg-white hover:bg-neutral-200 text-black text-xs font-semibold"
          >
            <span>Lanjutkan Sekarang</span>
            <ArrowRight className="w-4 h-4" />
          </a>
        )}
      </div>
    );
  }

  // Render Secondary PIN Input Modal
  if (flowState === 'NEED_PIN') {
    return (
      <div className="max-w-md mx-auto my-12 bento-card p-8 space-y-6 border-neutral-700">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800 text-white flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white">Verifikasi PIN Tambahan</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-neutral-900 text-neutral-400 border border-neutral-800">
            Node 26: Hash Argon2id PIN Check
          </span>
          <p className="text-xs text-neutral-400">Link ini mewajibkan verifikasi PIN master (Default demo: 123456)</p>
        </div>

        <form onSubmit={handlePinSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">Security PIN (6-Digit)</label>
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="123456"
              className="w-full text-center tracking-widest text-lg font-mono px-4 py-3 rounded-md bg-neutral-900 border border-neutral-800 focus:border-neutral-500 focus:outline-none text-white"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={pinLoading || pin.length < 4}
            className="w-full py-3 rounded-md bg-white hover:bg-neutral-200 disabled:opacity-50 text-black text-xs font-semibold transition-all"
          >
            {pinLoading ? 'Memverifikasi Hash Argon2id...' : 'Konfirmasi & Lanjutkan ke Target'}
          </button>
        </form>
      </div>
    );
  }

  // Default: Main SSO Gateway View
  const allowedCards = clientData?.allowed_card_ids || ['FIDO2-NFC-KEY-ALPHA-01'];

  return (
    <div className="max-w-xl mx-auto my-8 space-y-6">
      {/* Protected Link / Target Preview Header */}
      <div className="bento-card p-6 space-y-3 border-neutral-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-white font-bold">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white">{clientData?.app_name || 'Protected Gateway Link'}</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/50 text-emerald-400 font-mono border border-emerald-800/40">
                  NFC Secured
                </span>
              </div>
              <p className="text-xs text-neutral-400 font-mono">
                {linkId ? `Link ID: ${linkId}` : `Client ID: ${clientId}`}
              </p>
            </div>
          </div>

          <div className="text-right text-[11px] font-mono text-neutral-400">
            <div>RP: {clientData?.rp_id || 'catauth.io'}</div>
            <div className="text-emerald-400">FIDO2 Ready</div>
          </div>
        </div>

        {/* Target Destination Indicator */}
        <div className="p-2.5 rounded-md bg-neutral-950 border border-neutral-800/80 flex items-center justify-between text-xs font-mono">
          <span className="text-neutral-500 flex items-center space-x-1">
            <span>Target Redirect:</span>
          </span>
          <span className="text-cyan-300 truncate max-w-xs">{clientData?.target_redirect_url || redirectUri}</span>
        </div>
      </div>

      {/* NFC Tap Card Prompt */}
      <div className="bento-card p-8 text-center space-y-8 relative overflow-hidden border-neutral-800">
        <div className="space-y-2 relative z-10">
          <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-neutral-900 text-neutral-300 border border-neutral-800">
            Node 10: Layar Prompt FIDO2 NFC
          </span>
          <h3 className="text-2xl font-extrabold text-white">Tempelkan Kartu NFC Anda</h3>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto">
            Dekatkan kartu fisik FIDO2 NFC atau token hardware yang telah diizinkan untuk link ini.
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
        <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 text-left space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-200 flex items-center space-x-1.5">
              <KeyRound className="w-3.5 h-3.5 text-white" />
              <span>Simulasi Kartu Hardware NFC:</span>
            </span>
            <span className="text-[10px] text-neutral-500 font-mono">Pilih Kartu Uji</span>
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
              <div className="flex items-center justify-between">
                <div className="font-semibold text-[11px] text-white">YubiKey 5 NFC (Alpha)</div>
                {allowedCards.includes('FIDO2-NFC-KEY-ALPHA-01') && (
                  <span className="text-[9px] font-mono text-emerald-400">ALLOWED</span>
                )}
              </div>
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
              <div className="flex items-center justify-between">
                <div className="font-semibold text-[11px] text-white">Feitian ePass (Beta)</div>
                {allowedCards.includes('FIDO2-NFC-KEY-BETA-02') ? (
                  <span className="text-[9px] font-mono text-emerald-400">ALLOWED</span>
                ) : (
                  <span className="text-[9px] font-mono text-amber-400">UNWHITELISTED</span>
                )}
              </div>
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

        {/* Action Button */}
        <button
          onClick={handleNFCTap}
          disabled={flowState === 'TAPPING'}
          className="w-full py-3 rounded-md bg-white hover:bg-neutral-200 text-black text-xs font-semibold transition-colors flex items-center justify-center space-x-2"
        >
          {flowState === 'TAPPING' ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Membaca Sinyal NFC & Memverifikasi Whitelist...</span>
            </>
          ) : (
            <>
              <Smartphone className="w-4 h-4" />
              <span>Tap Kartu FIDO2 NFC Sekarang</span>
            </>
          )}
        </button>

        {challenge && (
          <div className="text-[10px] font-mono text-neutral-500 truncate">
            Transient Challenge Nonce: {challenge}
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
        <div className="w-8 h-8 rounded-full border-2 border-white border-t-transparent animate-spin mx-auto"></div>
        <p className="text-xs text-neutral-400 font-mono">Memuat Gateway SSO...</p>
      </div>
    }>
      <SSOLoginContent />
    </Suspense>
  );
}
