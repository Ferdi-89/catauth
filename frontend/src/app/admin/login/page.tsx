'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ShieldCheck, KeyRound, Smartphone, Cpu, Lock, ArrowRight, 
  CheckCircle2, AlertCircle, RefreshCw, Key, ShieldAlert, Sparkles, Terminal
} from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [scanningNFC, setScanningNFC] = useState(false);
  const [scanningFIDO2, setScanningFIDO2] = useState(false);
  const [showPasscode, setShowPasscode] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if already logged in
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const existingToken = localStorage.getItem('catauth_admin_token');
      if (existingToken) {
        // Already authenticated
        router.push('/admin/dashboard');
      }
    }
  }, [router]);

  async function handleAdminAuthSuccess(data: any) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('catauth_admin_token', data.token);
      localStorage.setItem('catauth_admin_user', JSON.stringify(data.user));
    }
    setStatusMessage(data.message || 'Otentikasi Berhasil! Mengalihkan ke Dashboard...');
    setTimeout(() => {
      router.push('/admin/dashboard');
    }, 800);
  }

  // 1-Tap Web NFC Direct Scan (Android Chrome)
  async function handleWebNFCLogin() {
    setErrorMessage(null);
    setStatusMessage(null);

    if (typeof window === 'undefined' || !('NDEFReader' in window)) {
      setErrorMessage('Browser ini belum mendukung Web NFC. Silakan gunakan Google Chrome di HP Android ber-NFC, atau masuk dengan Kunci FIDO2 / Master Passcode.');
      return;
    }

    setScanningNFC(true);
    setStatusMessage('Membuka sensor NFC... Silakan tempelkan kartu fisik (e-Money / Flazz / e-KTP) ke belakang HP sekarang!');

    try {
      const NDEFReaderClass = (window as any).NDEFReader;
      const ndef = new NDEFReaderClass();
      await ndef.scan();

      ndef.onreadingerror = () => {
        setErrorMessage('Gagal membaca kartu NFC. Pastikan kartu didekatkan dengan stabil.');
        setScanningNFC(false);
      };

      ndef.onreading = async (event: any) => {
        const serial = event.serialNumber;
        const rawUid = serial ? serial.replace(/:/g, '').toUpperCase() : 'CARD';
        const cardId = `NFC-UID-${rawUid}`;

        setStatusMessage(`Kartu terdeteksi (${serial || rawUid}). Memvalidasi hak akses Admin...`);
        setScanningNFC(false);

        try {
          const res = await fetch('/api/v1/admin/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card_id: cardId, method: 'NFC' }),
          });
          const data = await res.json();

          if (data.success && data.authenticated) {
            handleAdminAuthSuccess(data);
          } else {
            setErrorMessage(data.error?.message || 'Akses Admin ditolak.');
          }
        } catch (err: any) {
          setErrorMessage('Gagal menghubungi server verifikasi.');
        }
      };
    } catch (err: any) {
      console.warn('NFC Error:', err);
      setScanningNFC(false);
      if (err.name === 'NotAllowedError') {
        setErrorMessage('Izin pemindaian NFC ditolak pada browser.');
      } else {
        setErrorMessage(`NFC Error: ${err.message || 'Pastikan fitur NFC aktif di HP Anda.'}`);
      }
    }
  }

  // FIDO2 / YubiKey WebAuthn Login
  async function handleFIDO2Login() {
    setErrorMessage(null);
    setStatusMessage(null);

    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      setErrorMessage('Browser tidak mendukung WebAuthn FIDO2.');
      return;
    }

    setScanningFIDO2(true);
    setStatusMessage('Silakan sentuh kunci YubiKey atau lakukan verifikasi Passkey...');

    try {
      const randomChallenge = new Uint8Array(32);
      window.crypto.getRandomValues(randomChallenge);

      const credential: any = await navigator.credentials.get({
        publicKey: {
          challenge: randomChallenge,
          rpId: window.location.hostname,
          userVerification: 'preferred',
          timeout: 60000,
        },
      });

      if (credential) {
        const rawIdArray = new Uint8Array(credential.rawId);
        const hexId = Array.from(rawIdArray).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        const shortCredId = `FIDO2-NFC-${hexId.substring(0, 16)}`;

        const res = await fetch('/api/v1/admin/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ card_id: shortCredId, method: 'FIDO2' }),
        });
        const data = await res.json();

        if (data.success && data.authenticated) {
          handleAdminAuthSuccess(data);
        } else {
          setErrorMessage(data.error?.message || 'Kunci FIDO2 ditolak.');
        }
      }
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        setErrorMessage(`WebAuthn: ${err.message}`);
      }
    } finally {
      setScanningFIDO2(false);
    }
  }

  // Master Passcode Login
  async function handlePasscodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode.trim()) return;

    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/v1/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.trim(), method: 'PASSCODE' }),
      });
      const data = await res.json();

      if (data.success && data.authenticated) {
        handleAdminAuthSuccess(data);
      } else {
        setErrorMessage(data.error?.message || 'Master Passcode salah.');
      }
    } catch (err: any) {
      setErrorMessage('Terjadi kesalahan koneksi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Shield Branding Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex relative items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center shadow-2xl relative z-10">
              <ShieldCheck className="w-8 h-8 text-white animate-pulse" />
            </div>
            <div className="absolute inset-0 bg-white/10 blur-xl rounded-full"></div>
          </div>

          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              CATAUTH ADMIN GATEWAY
            </h1>
            <p className="text-xs text-neutral-400 mt-1">
              Otentikasi Kriptografis Hardware & Pusat Kontrol Keamanan
            </p>
          </div>
        </div>

        {/* Main Auth Card */}
        <div className="bento-card p-6 border-neutral-800 bg-neutral-950/80 backdrop-blur-xl space-y-5 shadow-2xl">
          {/* Status / Error Notifications */}
          {statusMessage && (
            <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs font-mono flex items-center space-x-2 animate-in fade-in duration-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-950/60 border border-red-800/60 text-red-300 text-xs font-mono flex items-center space-x-2 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Primary Action: 1-Tap Physical NFC Key (Android Web NFC) */}
          <div className="space-y-3">
            <button
              onClick={handleWebNFCLogin}
              disabled={scanningNFC || scanningFIDO2 || loading}
              className={`w-full py-3.5 px-4 rounded-lg font-semibold text-sm transition-all flex items-center justify-center space-x-2.5 shadow-lg ${
                scanningNFC
                  ? 'bg-cyan-950 border border-cyan-800 text-cyan-300 animate-pulse'
                  : 'bg-white hover:bg-neutral-200 text-black'
              }`}
            >
              {scanningNFC ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Membaca Kartu NFC... Tempelkan ke HP</span>
                </>
              ) : (
                <>
                  <Smartphone className="w-4 h-4" />
                  <span>📲 Tap Kartu Fisik HP (NFC)</span>
                </>
              )}
            </button>

            {/* Secondary Action: FIDO2 YubiKey Hardware Token */}
            <button
              onClick={handleFIDO2Login}
              disabled={scanningNFC || scanningFIDO2 || loading}
              className="w-full py-2.5 px-4 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 font-medium text-xs transition-colors flex items-center justify-center space-x-2"
            >
              {scanningFIDO2 ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Menunggu Kunci FIDO2...</span>
                </>
              ) : (
                <>
                  <Cpu className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Kunci Hardware FIDO2 (YubiKey / Passkey)</span>
                </>
              )}
            </button>
          </div>

          <div className="relative flex items-center justify-center py-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-neutral-900"></div></div>
            <span className="relative bg-neutral-950 px-2 text-[10px] font-mono text-neutral-600 uppercase tracking-widest">
              Atau Cadangan Darurat
            </span>
          </div>

          {/* Master Passcode Toggle / Form */}
          {!showPasscode ? (
            <button
              type="button"
              onClick={() => setShowPasscode(true)}
              className="w-full py-2 text-center text-xs font-mono text-neutral-400 hover:text-white transition-colors"
            >
              🔑 Masuk dengan Master Passcode ➔
            </button>
          ) : (
            <form onSubmit={handlePasscodeSubmit} className="space-y-3 pt-1 animate-in fade-in duration-150">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <label className="font-mono text-neutral-400">Master Passcode / PIN:</label>
                  <button
                    type="button"
                    onClick={() => setShowPasscode(false)}
                    className="text-neutral-500 hover:text-white text-[10px]"
                  >
                    Tutup
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="Masukkan Passcode Admin (catauth2026)"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800 text-xs text-white focus:outline-none focus:border-neutral-500 font-mono tracking-wider"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !passcode.trim()}
                className="w-full py-2 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white font-medium text-xs transition-colors flex items-center justify-center space-x-1.5"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                <span>Verifikasi Master Passcode</span>
              </button>
            </form>
          )}

          {/* Security Telemetry Footer */}
          <div className="pt-3 border-t border-neutral-900 text-center">
            <div className="inline-flex items-center space-x-1.5 text-[10px] font-mono text-neutral-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>Zero-Password • Supabase Persistent Vault Active</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
