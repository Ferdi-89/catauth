'use client';

import React, { useState, useEffect } from 'react';
import { 
  KeyRound, Shield, Ban, CheckCircle2, RefreshCw, Smartphone, Plus, 
  Trash2, ShieldCheck, ShieldAlert, Cpu, Sparkles, Check, CreditCard, Info 
} from 'lucide-react';
import { api } from '../../../lib/api';
import { FIDO2Credential } from '../../../lib/types';

export default function AdminKeysPage() {
  const [credentials, setCredentials] = useState<FIDO2Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [registeringWebAuthn, setRegisteringWebAuthn] = useState(false);
  const [scanningNFC, setScanningNFC] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualLabel, setManualLabel] = useState('');
  const [manualId, setManualId] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  async function loadCredentials() {
    setLoading(true);
    const res = await api.listCredentials();
    if (res.success && res.data) {
      setCredentials(res.data);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadCredentials();
  }, []);

  // Web NFC Direct Scan Registration (for e-Money, Flazz, e-KTP, Mifare, NFC Tags)
  async function handleRegisterWebNFC() {
    if (typeof window === 'undefined' || !('NDEFReader' in window)) {
      alert('Fitur Web NFC langsung memerlukan Google Chrome pada HP Android ber-NFC.');
      return;
    }

    setScanningNFC(true);
    setFeedback('Membuka sensor NFC... Silakan tempelkan kartu ke belakang HP!');

    try {
      const NDEFReaderClass = (window as any).NDEFReader;
      const ndef = new NDEFReaderClass();
      await ndef.scan();

      ndef.onreadingerror = () => {
        alert('Gagal membaca kartu NFC. Pastikan kartu didekatkan dengan stabil.');
        setScanningNFC(false);
      };

      ndef.onreading = async (event: any) => {
        const serial = event.serialNumber;
        const rawUid = serial ? serial.replace(/:/g, '').toUpperCase() : 'TAG';
        const credId = `NFC-UID-${rawUid}`;

        setScanningNFC(false);

        const labelPrompt = prompt(`Kartu NFC Terdeteksi! (Serial: ${serial || rawUid})\nBeri nama/label untuk kartu ini:`, `Kartu NFC (${rawUid.substring(0, 6)})`);
        const finalLabel = labelPrompt?.trim() || `Kartu NFC (${rawUid.substring(0, 6)})`;

        const res = await api.registerCredential({
          user_id: 'usr_demo_john_doe',
          credential_id: credId,
          label: finalLabel,
          transports: ['nfc'],
        });

        if (res.success) {
          setFeedback(`Kartu fisik "${finalLabel}" [${credId}] berhasil didaftarkan!`);
          loadCredentials();
        } else {
          alert(res.error?.message || 'Gagal menyimpan kartu ke database.');
        }
      };
    } catch (err: any) {
      console.warn('Web NFC registration error:', err);
      setScanningNFC(false);
      if (err.name === 'NotAllowedError') {
        alert('Izin akses NFC ditolak pada browser.');
      } else {
        alert(`Pemindaian NFC: ${err.message || 'NFC tidak aktif.'}`);
      }
    }
  }

  // Real Native WebAuthn Registration (FIDO2 Hardware Key / YubiKey / Passkey)
  async function handleRegisterRealWebAuthn() {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      alert('Browser Anda tidak mendukung WebAuthn API untuk pendaftaran hardware token.');
      return;
    }

    setRegisteringWebAuthn(true);
    setFeedback(null);

    try {
      const randomChallenge = new Uint8Array(32);
      window.crypto.getRandomValues(randomChallenge);

      const userId = new Uint8Array(16);
      window.crypto.getRandomValues(userId);

      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge: randomChallenge,
        rp: {
          name: 'Catauth Sovereign Identity Gateway',
          id: window.location.hostname,
        },
        user: {
          id: userId,
          name: 'admin@catauth.io',
          displayName: 'Administrator (Hardware Token)',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'cross-platform',
          userVerification: 'preferred',
          requireResidentKey: false,
        },
        timeout: 60000,
        attestation: 'none',
      };

      const credential: any = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions,
      });

      if (credential) {
        const rawIdArray = new Uint8Array(credential.rawId);
        const hexId = Array.from(rawIdArray).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        const shortCredId = `FIDO2-NFC-${hexId.substring(0, 16)}`;

        const labelPrompt = prompt('Kunci Hardware Terdeteksi! Beri nama/label untuk kartu ini:', `Hardware Key (${hexId.substring(0, 8)})`);
        const finalLabel = labelPrompt?.trim() || `Hardware Key (${hexId.substring(0, 8)})`;

        const transports = credential.response?.getTransports?.() || ['nfc', 'usb'];

        const res = await api.registerCredential({
          user_id: 'usr_admin_master',
          credential_id: shortCredId,
          label: finalLabel,
          transports: transports.length > 0 ? transports : ['nfc', 'usb'],
        });

        if (res.success) {
          setFeedback(`Kunci hardware fisik "${finalLabel}" [${shortCredId}] berhasil didaftarkan secara kriptografis!`);
          loadCredentials();
        } else {
          alert(res.error?.message || 'Gagal menyimpan kredensial ke server.');
        }
      }
    } catch (err: any) {
      console.warn('WebAuthn registration error:', err);
      if (err.name === 'NotAllowedError') {
        alert('Pendaftaran dibatalkan atau waktu tunggu habis.');
      } else {
        alert(`Pendaftaran WebAuthn: ${err.message || 'Gagal membaca kunci hardware.'}`);
      }
    } finally {
      setRegisteringWebAuthn(false);
    }
  }

  // Handle Manual Registration
  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualLabel.trim()) return;

    const credId = manualId.trim() || `FIDO2-NFC-${Date.now().toString(36).toUpperCase()}`;

    const res = await api.registerCredential({
      user_id: 'usr_demo_john_doe',
      credential_id: credId,
      label: manualLabel,
      transports: ['nfc'],
    });

    if (res.success) {
      setShowManualModal(false);
      setManualLabel('');
      setManualId('');
      setFeedback(`Kunci "${manualLabel}" berhasil ditambahkan.`);
      loadCredentials();
    } else {
      alert(res.error?.message || 'Gagal mendaftarkan kunci.');
    }
  }

  async function handleToggleStatus(credId: string, currentActive: boolean) {
    const reason = !currentActive ? 'Admin reactivated token' : 'Admin security revocation lock';
    const res = await api.toggleCredentialStatus(credId, !currentActive, reason);
    if (res.success) {
      setFeedback(`Status token ${credId} berhasil diubah.`);
      loadCredentials();
    } else {
      alert(res.error?.message || 'Gagal mengubah status token.');
    }
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Manajemen Kunci Hardware FIDO2 NFC
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-800">
              WebAuthn / Web NFC Vault
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Pendaftaran kartu fisik (e-Money / e-KTP / YubiKey / NFC tag), inspeksi counter tanda tangan anti-kloning, dan pencabutan status kunci seketika.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={loadCredentials}
            className="p-2 rounded-md bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 text-xs flex items-center space-x-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>

          <button
            onClick={() => setShowManualModal(true)}
            className="px-3 py-2 rounded-md bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 font-medium text-xs transition-colors"
          >
            + Input Manual
          </button>

          {/* Web NFC Tap Registration Button (for e-Money, Flazz, e-KTP) */}
          <button
            onClick={handleRegisterWebNFC}
            disabled={scanningNFC}
            className="px-3.5 py-2 rounded-md bg-neutral-900 hover:bg-neutral-800 text-cyan-300 border border-cyan-800/60 font-medium text-xs transition-colors inline-flex items-center space-x-1.5"
          >
            {scanningNFC ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span className="text-white">Tempelkan Kartu ke HP...</span>
              </>
            ) : (
              <>
                <CreditCard className="w-3.5 h-3.5" />
                <span>📲 Tap Kartu Fisik HP (e-Money/e-KTP)</span>
              </>
            )}
          </button>

          {/* WebAuthn FIDO2 Key Registration */}
          <button
            onClick={handleRegisterRealWebAuthn}
            disabled={registeringWebAuthn}
            className="px-4 py-2 rounded-md bg-white text-black font-medium text-xs hover:bg-neutral-200 transition-colors inline-flex items-center space-x-1.5 shadow-sm disabled:opacity-50"
          >
            {registeringWebAuthn ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Menunggu Tap FIDO2...</span>
              </>
            ) : (
              <>
                <Cpu className="w-3.5 h-3.5" />
                <span>Kunci FIDO2 (YubiKey)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success Feedback Alert */}
      {feedback && (
        <div className="bento-card p-3.5 border-emerald-800/60 bg-emerald-950/40 text-emerald-300 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{feedback}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Credentials Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {credentials.map((c) => (
          <div
            key={c.id}
            className={`bento-card p-6 space-y-4 border transition-all flex flex-col justify-between ${
              c.is_active 
                ? 'border-neutral-800 hover:border-neutral-700' 
                : 'border-red-950/80 bg-red-950/10'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    c.is_active 
                      ? 'bg-neutral-900 border border-neutral-800 text-white' 
                      : 'bg-red-950/40 border border-red-800/40 text-red-400'
                  }`}>
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">{c.label}</h3>
                    <p className="text-[10px] font-mono text-neutral-500 truncate max-w-[150px]">{c.credential_id}</p>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  c.is_active 
                    ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/40' 
                    : 'bg-red-950/60 text-red-400 border border-red-800/40'
                }`}>
                  {c.is_active ? 'ACTIVE' : 'REVOKED'}
                </span>
              </div>

              {/* Signature Counter & Invariant */}
              <div className="space-y-2 text-xs font-mono pt-1">
                <div className="flex items-center justify-between p-2.5 rounded bg-neutral-950 border border-neutral-900">
                  <span className="text-neutral-400 text-[11px]">Signature Counter:</span>
                  <span className="text-cyan-300 font-bold font-mono">{c.sign_count}</span>
                </div>

                <div className="text-[11px] text-neutral-400 space-y-1">
                  <div>Transports: <span className="text-neutral-300">{c.transports.join(', ')}</span></div>
                  <div>Terdaftar: <span className="text-neutral-500">{new Date(c.created_at || '').toLocaleDateString()}</span></div>
                  {c.revocation_reason && (
                    <div className="text-red-400 font-mono">Alasan Blokir: {c.revocation_reason}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Action Toggle */}
            <div className="pt-4 border-t border-neutral-800/80 flex items-center justify-between">
              <span className="text-[10px] font-mono text-neutral-500">
                {c.is_active ? 'Keamanan Normal' : 'Akses Ditolak di Semua Link'}
              </span>

              <button
                onClick={() => handleToggleStatus(c.credential_id, c.is_active)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  c.is_active
                    ? 'bg-neutral-900 hover:bg-red-950 text-neutral-300 hover:text-red-400 border border-neutral-800'
                    : 'bg-white hover:bg-neutral-200 text-black'
                }`}
              >
                {c.is_active ? 'Cabut Akses (Revoke)' : 'Aktifkan Kembali'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Manual Card Registration Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bento-card max-w-md w-full p-6 border-neutral-700 bg-black space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-white">Input Manual Data Kartu NFC</h3>
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-neutral-300">Label / Nama Kartu <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master YubiKey CFO, Kartu Akses Tim Alpha"
                  value={manualLabel}
                  onChange={(e) => setManualLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800 text-sm text-white focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-neutral-300">Credential ID / Token Serial</label>
                <input
                  type="text"
                  placeholder="e.g. FIDO2-NFC-DELTA-05 (Auto-generate jika kosong)"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800 text-sm font-mono text-cyan-300 focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-3 py-1.5 rounded hover:bg-neutral-900 text-neutral-400 text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-white text-black font-medium text-xs hover:bg-neutral-200"
                >
                  Daftarkan Kunci
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
