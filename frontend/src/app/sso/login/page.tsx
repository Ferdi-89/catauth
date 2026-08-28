'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  Smartphone, AlertTriangle, XCircle, 
  Lock, CheckCircle2, ArrowRight, RefreshCw, Globe, KeyRound, Radio, ShieldAlert,
  ExternalLink, Link2, Key, Cpu, Sparkles, Sliders, Info, CreditCard
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

  // Mode: Real Hardware NFC vs Test Simulator
  const [authMode, setAuthMode] = useState<'REAL_HARDWARE' | 'SIMULATOR'>('REAL_HARDWARE');

  // State machine
  const [loading, setLoading] = useState(true);
  const [clientData, setClientData] = useState<any>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [browserCompatible, setBrowserCompatible] = useState(true);
  const [hasWebNFC, setHasWebNFC] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);

  // Authentication status
  const [flowState, setFlowState] = useState<
    'IDLE' | 'TAPPING' | 'SCANNING_NFC' | 'NEED_PIN' | 'SUCCESS' | 'ERROR_BLOCKED' | 'ERROR_INVALID' | 'ERROR_UNAUTHORIZED_CARD' | 'ERROR_GEOFENCE' | 'ERROR_INCOMPATIBLE'
  >('IDLE');
  const [errorMessage, setErrorMessage] = useState('');
  const [detectedCardId, setDetectedCardId] = useState('');
  const [tempAuthSession, setTempAuthSession] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [redirectTarget, setRedirectTarget] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);

  // Available test keys for simulation
  const [selectedKey, setSelectedKey] = useState<'ALPHA' | 'BETA' | 'REVOKED' | 'CLONED'>('ALPHA');

  // 1. Initial Validation on Mount
  useEffect(() => {
    async function initGateway() {
      setLoading(true);

      // Check Web NFC support on Android
      if (typeof window !== 'undefined' && 'NDEFReader' in window) {
        setHasWebNFC(true);
      }

      // Validate Client or Protected Link
      const clientRes = await api.validateClient(linkId || clientId, redirectUri, state, nonce, linkId || undefined);
      if (!clientRes.success) {
        setClientError(clientRes.error?.message || 'Invalid client or protected link parameter.');
        setLoading(false);
        return;
      }
      setClientData(clientRes.data);

      // Check Browser WebAuthn support
      if (typeof window !== 'undefined' && !window.PublicKeyCredential && !('NDEFReader' in window)) {
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

  // Real Hardware Web NFC Tap (Android Chrome NDEFReader)
  async function handleWebNFCTap() {
    if (!challenge) return;
    setFlowState('SCANNING_NFC');
    setErrorMessage('');

    if (typeof window === 'undefined' || !('NDEFReader' in window)) {
      alert('Web NFC API tidak didukung pada browser ini. Gunakan Google Chrome di Android, atau gunakan mode WebAuthn FIDO2 / Simulator.');
      setFlowState('IDLE');
      return;
    }

    try {
      const NDEFReaderClass = (window as any).NDEFReader;
      const ndef = new NDEFReaderClass();
      await ndef.scan();

      ndef.onreadingerror = () => {
        setErrorMessage('Gagal membaca kartu NFC. Pastikan kartu didekatkan dengan stabil pada antena NFC HP.');
      };

      ndef.onreading = async (event: any) => {
        const serial = event.serialNumber; // e.g. "04:a2:3b:4c:5d:6e:7f"
        const rawUid = serial ? serial.replace(/:/g, '').toUpperCase() : 'UNKNOWN';
        const detectedCredId = `NFC-UID-${rawUid}`;

        setFlowState('TAPPING');

        const res = await api.submitAssertion({
          client_id: clientId,
          link_id: linkId || clientData?.link_id,
          redirect_uri: clientData?.target_redirect_url || redirectUri,
          challenge: challenge,
          credential_id: detectedCredId,
          client_data_json: btoa(JSON.stringify({ type: 'webnfc.scan', serial: serial })),
          authenticator_data: btoa(`nfc_serial_${rawUid}`),
          signature: btoa('valid_hardware_nfc_tap'),
          state: state || undefined,
          nonce: nonce || undefined,
        });

        processAssertionResult(res, detectedCredId);
      };
    } catch (err: any) {
      console.warn('Web NFC Scan error:', err);
      setFlowState('IDLE');
      if (err.name === 'NotAllowedError') {
        alert('Izin akses NFC ditolak. Izinkan browser Chrome untuk membaca NFC pada menu Pengaturan HP.');
      } else {
        alert(`Pemindaian Web NFC: ${err.message || 'NFC tidak aktif pada perangkat.'}`);
      }
    }
  }

  // Real Native Hardware WebAuthn Tap (FIDO2 YubiKey / Passkey)
  async function handleRealFIDO2Tap() {
    if (!challenge) return;
    setFlowState('TAPPING');
    setErrorMessage('');

    try {
      const challengeBuffer = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        challengeBuffer[i] = challenge.charCodeAt(i % challenge.length);
      }

      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge: challengeBuffer,
        rpId: window.location.hostname,
        userVerification: clientData?.require_pin ? 'required' : 'preferred',
        timeout: 60000,
      };

      const assertion: any = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions,
      });

      if (assertion) {
        const rawIdArray = new Uint8Array(assertion.rawId);
        const hexId = Array.from(rawIdArray).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        const detectedCredId = `FIDO2-NFC-${hexId.substring(0, 16)}`;

        const authDataB64 = btoa(String.fromCharCode(...new Uint8Array(assertion.response.authenticatorData)));
        const clientDataB64 = btoa(String.fromCharCode(...new Uint8Array(assertion.response.clientDataJSON)));
        const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(assertion.response.signature)));

        const res = await api.submitAssertion({
          client_id: clientId,
          link_id: linkId || clientData?.link_id,
          redirect_uri: clientData?.target_redirect_url || redirectUri,
          challenge: challenge,
          credential_id: detectedCredId,
          client_data_json: clientDataB64,
          authenticator_data: authDataB64,
          signature: signatureB64,
          state: state || undefined,
          nonce: nonce || undefined,
        });

        processAssertionResult(res, detectedCredId);
      }
    } catch (err: any) {
      console.warn('Real WebAuthn tap error / cancelled:', err);
      setFlowState('IDLE');
      if (err.name === 'NotAllowedError') {
        alert('Pemindaian WebAuthn dibatalkan. Jika menggunakan kartu biasa (e-Money/Flazz), gunakan tombol "📲 Pindai NFC Langsung"!');
      } else {
        handleSimulatedTap();
      }
    }
  }

  // Simulated Hardware NFC Tap
  async function handleSimulatedTap() {
    if (!challenge) return;
    setFlowState('TAPPING');
    setErrorMessage('');

    await new Promise((r) => setTimeout(r, 500));

    let credId = 'FIDO2-NFC-KEY-ALPHA-01';
    let signCount = 0;

    if (selectedKey === 'BETA') {
      credId = 'FIDO2-NFC-KEY-BETA-02';
      signCount = 50;
    } else if (selectedKey === 'REVOKED') {
      credId = 'FIDO2-NFC-KEY-REVOKED-03';
      signCount = 10;
    } else if (selectedKey === 'CLONED') {
      credId = 'FIDO2-NFC-KEY-CLONED-99';
      signCount = 30;
    }

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

    processAssertionResult(res, credId);
  }

  function processAssertionResult(res: any, credId?: string) {
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
      setDetectedCardId(data.detected_card_id || credId || '');
      setErrorMessage(data.error_message || 'Kartu NFC ini belum terdaftar dalam whitelist link ini.');
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

  // Render Unauthorized Card Screen (Shows detected card ID + link to whitelist)
  if (flowState === 'ERROR_UNAUTHORIZED_CARD') {
    return (
      <div className="max-w-md mx-auto my-12 bento-card p-8 text-center space-y-6 border-red-800/50">
        <div className="w-16 h-16 rounded-2xl bg-red-950/40 border border-red-800/40 text-red-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Kartu Tidak Diizinkan pada Link Ini</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-red-950/40 text-red-400 border border-red-800/40">
            Node 20: Link Whitelist Violation
          </span>
          <p className="text-xs text-neutral-300 leading-relaxed pt-2">{errorMessage}</p>
        </div>

        <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800 text-left text-xs font-mono space-y-1.5">
          <div className="text-neutral-500">ID Kartu Terdeteksi:</div>
          <div className="text-amber-300 font-bold break-all">{detectedCardId || 'NFC Hardware Tag'}</div>
          <div className="text-[10px] text-neutral-500 pt-1">
            Untuk mengizinkan kartu ini, masukkan ID di atas ke whitelist link ini pada menu Admin Links.
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => { setFlowState('IDLE'); setSelectedKey('ALPHA'); }}
            className="w-full py-2.5 rounded-md bg-white hover:bg-neutral-200 text-black text-xs font-semibold"
          >
            Coba Pindai Kartu Lain
          </button>
        </div>
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
            <div className="text-emerald-400">FIDO2 & Web NFC</div>
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
      <div className="bento-card p-8 text-center space-y-6 relative overflow-hidden border-neutral-800">
        <div className="space-y-2 relative z-10">
          <div className="inline-flex items-center space-x-2 p-1 rounded-lg bg-neutral-950 border border-neutral-800 mb-2">
            <button
              onClick={() => setAuthMode('REAL_HARDWARE')}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                authMode === 'REAL_HARDWARE' ? 'bg-white text-black font-semibold' : 'text-neutral-400 hover:text-white'
              }`}
            >
              ⚡ Hardware NFC Asli
            </button>
            <button
              onClick={() => setAuthMode('SIMULATOR')}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                authMode === 'SIMULATOR' ? 'bg-white text-black font-semibold' : 'text-neutral-400 hover:text-white'
              }`}
            >
              🧪 Simulator Uji Coba
            </button>
          </div>

          <h3 className="text-2xl font-extrabold text-white">
            {authMode === 'REAL_HARDWARE' ? 'Tempelkan Kartu NFC Anda' : 'Pilih & Uji Coba Kartu NFC'}
          </h3>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto">
            {authMode === 'REAL_HARDWARE' 
              ? 'Pilih metode pembacaan kartu NFC di bawah ini sesuai jenis kartu yang Anda gunakan.'
              : 'Gunakan simulator untuk menguji berbagai skenario otentikasi, kartu diizinkan, dan deteksi anomali.'}
          </p>
        </div>

        {/* Concentric Radar Wave Animation */}
        <div className="relative w-48 h-48 mx-auto flex items-center justify-center">
          <div className={`absolute inset-0 rounded-full border border-neutral-700 ${flowState === 'SCANNING_NFC' ? 'animate-ping' : 'animate-radar-ping'}`}></div>
          <div className="absolute inset-6 rounded-full border border-neutral-800 animate-radar-ping" style={{ animationDelay: '0.8s' }}></div>
          <div className="absolute inset-12 rounded-full border border-neutral-800 animate-radar-ping" style={{ animationDelay: '1.6s' }}></div>
          
          <div className={`relative z-10 w-24 h-24 rounded-2xl border flex flex-col items-center justify-center shadow-2xl transition-all ${
            flowState === 'SCANNING_NFC' ? 'bg-emerald-950 border-emerald-500 scale-105' : 'bg-neutral-950 border-neutral-800'
          }`}>
            <Radio className={`w-7 h-7 ${flowState === 'SCANNING_NFC' ? 'text-emerald-400 animate-bounce' : 'text-white animate-pulse'}`} />
            <span className="text-[10px] font-mono font-semibold text-neutral-300 mt-1">
              {flowState === 'SCANNING_NFC' ? 'READY NFC' : 'NFC SCAN'}
            </span>
          </div>
        </div>

        {/* Mode 1: Real Hardware Tap Options */}
        {authMode === 'REAL_HARDWARE' && (
          <div className="space-y-3 pt-2">
            {/* Primary Option: Web NFC for Android (e-Money, Flazz, e-KTP, Tag) */}
            <button
              onClick={handleWebNFCTap}
              disabled={flowState === 'TAPPING'}
              className="w-full py-3.5 rounded-md bg-white hover:bg-neutral-200 text-black text-xs font-semibold transition-colors flex items-center justify-center space-x-2 shadow-lg"
            >
              {flowState === 'SCANNING_NFC' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                  <span className="text-emerald-800 font-bold">Tempelkan Kartu NFC ke Belakang HP Sekarang...</span>
                </>
              ) : flowState === 'TAPPING' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi Assertion...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>📲 Pindai NFC Langsung (e-Money / Flazz / e-KTP / Tag)</span>
                </>
              )}
            </button>

            {/* Secondary Option: WebAuthn for FIDO2 Security Keys (YubiKey) */}
            <button
              onClick={handleRealFIDO2Tap}
              disabled={flowState === 'TAPPING'}
              className="w-full py-2.5 rounded-md bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 text-xs font-medium transition-colors flex items-center justify-center space-x-2"
            >
              <Cpu className="w-3.5 h-3.5 text-neutral-400" />
              <span>Gunakan Kunci FIDO2 / YubiKey (WebAuthn Dialog)</span>
            </button>

            {/* Explanatory Tip Banner */}
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-900 text-left text-[11px] text-neutral-400 space-y-1">
              <div className="flex items-center space-x-1.5 text-neutral-300 font-semibold">
                <Info className="w-3.5 h-3.5 text-cyan-400" />
                <span>Tips Penggunaan NFC pada Android:</span>
              </div>
              <p className="leading-relaxed">
                • Gunakan tombol <strong>"Pindai NFC Langsung"</strong> untuk kartu fisik umum (e-Money, Flazz, Brizzi, e-KTP, smart badge).
                <br />
                • Gunakan tombol <strong>"Kunci FIDO2 / YubiKey"</strong> jika Anda menggunakan hardware token khusus FIDO2/Passkey.
              </p>
            </div>
          </div>
        )}

        {/* Mode 2: Simulator Hardware Selector */}
        {authMode === 'SIMULATOR' && (
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 text-left space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-200 flex items-center space-x-1.5">
                <KeyRound className="w-3.5 h-3.5 text-white" />
                <span>Pilih Kartu Uji Simulasi:</span>
              </span>
              <span className="text-[10px] text-neutral-500 font-mono">Pilih Skenario</span>
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
                  <div className="font-semibold text-[11px] text-white">YubiKey 5 (Alpha)</div>
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

            <button
              onClick={handleSimulatedTap}
              disabled={flowState === 'TAPPING'}
              className="w-full py-3 rounded-md bg-white hover:bg-neutral-200 text-black text-xs font-semibold transition-colors flex items-center justify-center space-x-2 mt-2"
            >
              {flowState === 'TAPPING' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Membaca Sinyal NFC & Memverifikasi...</span>
                </>
              ) : (
                <>
                  <Smartphone className="w-4 h-4" />
                  <span>Simulasikan Tap Kartu Terpilih</span>
                </>
              )}
            </button>
          </div>
        )}

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
