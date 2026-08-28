'use client';

import React, { useState, useEffect } from 'react';
import { 
  KeyRound, Shield, Ban, CheckCircle2, RefreshCw, Smartphone, Plus, 
  Trash2, ShieldCheck, ShieldAlert, Cpu, Sparkles, Check, CreditCard, Info,
  UserCheck, Mail, User, ShieldCheck as RoleIcon, Edit3
} from 'lucide-react';
import { api } from '../../../lib/api';
import { FIDO2Credential } from '../../../lib/types';

export default function AdminKeysPage() {
  const [credentials, setCredentials] = useState<FIDO2Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [registeringWebAuthn, setRegisteringWebAuthn] = useState(false);
  const [scanningNFC, setScanningNFC] = useState(false);
  
  // Registration Modal State
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [modalType, setModalType] = useState<'NFC' | 'FIDO2' | 'MANUAL'>('NFC');
  const [formCardId, setFormCardId] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formUserName, setFormUserName] = useState('Ferdi Pratama');
  const [formUserId, setFormUserId] = useState('usr_ferdi_admin');
  const [formEmail, setFormEmail] = useState('ferdi@catauth.io');
  const [formRole, setFormRole] = useState('ADMIN');

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCred, setEditingCred] = useState<FIDO2Credential | null>(null);

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
    setFeedback('Membuka sensor NFC... Silakan tempelkan kartu fisik ke belakang HP sekarang!');

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
        setFormCardId(credId);
        setFormLabel(`Kartu NFC Fisik (${rawUid.substring(0, 6)})`);
        setModalType('NFC');
        setShowRegisterModal(true);
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

        setFormCardId(shortCredId);
        setFormLabel(`YubiKey FIDO2 (${hexId.substring(0, 6)})`);
        setModalType('FIDO2');
        setShowRegisterModal(true);
      }
    } catch (err: any) {
      console.warn('WebAuthn registration error:', err);
      if (err.name !== 'NotAllowedError') {
        alert(`Pendaftaran WebAuthn: ${err.message || 'Gagal membaca kunci hardware.'}`);
      }
    } finally {
      setRegisteringWebAuthn(false);
    }
  }

  function handleOpenManual() {
    setFormCardId(`NFC-UID-${Date.now().toString(36).toUpperCase()}`);
    setFormLabel('Kartu e-Money / Flazz Baru');
    setModalType('MANUAL');
    setShowRegisterModal(true);
  }

  async function handleSaveRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!formLabel.trim() || !formUserName.trim()) return;

    const res = await api.registerCredential({
      user_id: formUserId || `usr_${formUserName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      user_name: formUserName,
      user_email: formEmail,
      user_role: formRole,
      credential_id: formCardId,
      label: formLabel,
      transports: modalType === 'FIDO2' ? ['nfc', 'usb'] : ['nfc'],
    });

    if (res.success) {
      setShowRegisterModal(false);
      setFeedback(`Kartu "${formLabel}" [${formCardId}] berhasil diikatkan ke akun ${formUserName}!`);
      loadCredentials();
    } else {
      alert(res.error?.message || 'Gagal mendaftarkan kartu.');
    }
  }

  function handleOpenEdit(cred: FIDO2Credential) {
    setEditingCred(cred);
    setFormCardId(cred.credential_id);
    setFormLabel(cred.label);
    setFormUserName(cred.user_name || cred.label);
    setFormUserId(cred.user_id);
    setFormEmail(cred.user_email || `${cred.user_id}@catauth.io`);
    setFormRole(cred.user_role || 'ADMIN');
    setShowEditModal(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCred) return;

    const res = await api.updateCredentialProfile({
      credential_id: editingCred.credential_id,
      user_id: formUserId,
      user_name: formUserName,
      user_email: formEmail,
      user_role: formRole,
      label: formLabel,
    });

    if (res.success) {
      setShowEditModal(false);
      setFeedback(`Profil akun pemilik kartu "${formLabel}" berhasil diperbarui.`);
      loadCredentials();
    } else {
      alert(res.error?.message || 'Gagal memperbarui akun.');
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
              Hardware NFC & User Account Vault
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-800">
              Identity Binding & WebAuthn
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Hubungkan kartu fisik (e-Money / e-KTP / YubiKey) ke akun pengguna Anda (Nama, Email, Role). Ketika kartu di-tap, sistem langsung mengetahui akun yang login.
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
            onClick={handleOpenManual}
            className="px-3 py-2 rounded-md bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 font-medium text-xs transition-colors"
          >
            + Input Manual
          </button>

          {/* Web NFC Tap Registration Button */}
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
                <span>📲 Tap Kartu Fisik HP</span>
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
            <div className="space-y-3.5">
              {/* Card Label & Status */}
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    c.is_active 
                      ? 'bg-neutral-900 border border-neutral-800 text-cyan-400' 
                      : 'bg-red-950/40 border border-red-800/40 text-red-400'
                  }`}>
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">{c.label}</h3>
                    <p className="text-[10px] font-mono text-cyan-400 truncate max-w-[150px] font-semibold">{c.credential_id}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => handleOpenEdit(c)}
                    className="p-1.5 rounded hover:bg-neutral-900 text-neutral-400 hover:text-white"
                    title="Edit Profil Pemilik Akun"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    c.is_active 
                      ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/40' 
                      : 'bg-red-950/60 text-red-400 border border-red-800/40'
                  }`}>
                    {c.is_active ? 'ACTIVE' : 'REVOKED'}
                  </span>
                </div>
              </div>

              {/* Linked User Account Profile (The Account Information!) */}
              <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800/90 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-neutral-500 font-mono">Akun Terikat (User Profile):</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/40 font-bold">
                    {c.user_role || 'ADMIN'}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">{c.user_name || c.label}</span>
                </div>
                <div className="text-[11px] font-mono text-neutral-400 flex items-center space-x-1">
                  <Mail className="w-3 h-3 text-neutral-500" />
                  <span className="truncate">{c.user_email || `${c.user_id}@catauth.io`}</span>
                </div>
              </div>

              {/* Signature Counter & Details */}
              <div className="text-xs font-mono space-y-1.5 text-neutral-400">
                <div className="flex items-center justify-between p-2 rounded bg-neutral-950/60 border border-neutral-900">
                  <span className="text-[11px] text-neutral-500">Sign Counter:</span>
                  <span className="text-white font-bold">{c.sign_count} taps</span>
                </div>
                {c.revocation_reason && (
                  <div className="text-red-400 font-mono text-[11px]">Alasan Blokir: {c.revocation_reason}</div>
                )}
              </div>
            </div>

            {/* Bottom Action Toggle */}
            <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between">
              <button
                onClick={() => handleOpenEdit(c)}
                className="text-[11px] text-cyan-400 hover:underline font-mono"
              >
                Ubah Info Akun ➔
              </button>

              <button
                onClick={() => handleToggleStatus(c.credential_id, c.is_active)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  c.is_active
                    ? 'bg-neutral-900 hover:bg-red-950 text-neutral-300 hover:text-red-400 border border-neutral-800'
                    : 'bg-white hover:bg-neutral-200 text-black'
                }`}
              >
                {c.is_active ? 'Cabut Akses' : 'Aktifkan'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Registration Modal (Binding NFC Card to Account Information) */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bento-card max-w-lg w-full p-6 border-neutral-700 bg-black space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Hubungkan Kartu NFC ke Akun Pengguna
                </h3>
                <p className="text-xs text-neutral-400">
                  Tentukan akun yang akan otomatis login ketika kartu fisik ini ditempelkan.
                </p>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-neutral-500 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRegister} className="space-y-3.5">
              {/* Card Hardware Details */}
              <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 space-y-1">
                <span className="text-[10px] font-mono text-neutral-500 block">UID Kartu Hardware Terdeteksi:</span>
                <span className="text-xs font-mono font-bold text-cyan-300">{formCardId}</span>
              </div>

              {/* Label Kartu */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-neutral-300">
                  Label Kartu Fisik <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. e-Money Mandiri Utama, Flazz BCA Ferdi"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800 text-sm text-white focus:outline-none focus:border-neutral-500"
                />
              </div>

              {/* Account Information Section */}
              <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800 space-y-3">
                <span className="text-xs font-bold text-white block flex items-center space-x-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <span>Informasi Akun Pemilik:</span>
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400">Nama Lengkap Pemilik</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ferdi Pratama"
                      value={formUserName}
                      onChange={(e) => setFormUserName(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-neutral-900 border border-neutral-800 text-xs text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400">User ID / Username</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. usr_ferdi_admin"
                      value={formUserId}
                      onChange={(e) => setFormUserId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-neutral-900 border border-neutral-800 text-xs text-cyan-300 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400">Email Akun</label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. ferdi@perusahaan.com"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-neutral-900 border border-neutral-800 text-xs text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400">Role / Hak Akses</label>
                    <select
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-neutral-900 border border-neutral-800 text-xs text-white"
                    >
                      <option value="ADMIN">ADMIN (Superuser)</option>
                      <option value="MANAGER">MANAGER (Supervisor)</option>
                      <option value="STAFF">STAFF (Karyawan)</option>
                      <option value="VIP_USER">VIP_USER (Nasabah VIP)</option>
                      <option value="OPERATOR">OPERATOR (Shift Lapangan)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-3 py-1.5 rounded hover:bg-neutral-900 text-neutral-400 text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-white text-black font-semibold text-xs hover:bg-neutral-200"
                >
                  Simpan & Hubungkan ke Akun
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Account Modal */}
      {showEditModal && editingCred && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bento-card max-w-lg w-full p-6 border-neutral-700 bg-black space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Edit Akun Pemilik Kartu
                </h3>
                <p className="text-xs text-neutral-400">
                  Ubah nama, email, dan role yang terikat dengan kartu {editingCred.credential_id}.
                </p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-neutral-500 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-medium text-neutral-300">Label Kartu Fisik</label>
                <input
                  type="text"
                  required
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800 text-sm text-white"
                />
              </div>

              <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400">Nama Lengkap</label>
                    <input
                      type="text"
                      required
                      value={formUserName}
                      onChange={(e) => setFormUserName(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-neutral-900 border border-neutral-800 text-xs text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400">User ID</label>
                    <input
                      type="text"
                      required
                      value={formUserId}
                      onChange={(e) => setFormUserId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-neutral-900 border border-neutral-800 text-xs text-cyan-300 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400">Email Akun</label>
                    <input
                      type="email"
                      required
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-neutral-900 border border-neutral-800 text-xs text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400">Role / Hak Akses</label>
                    <select
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-neutral-900 border border-neutral-800 text-xs text-white"
                    >
                      <option value="ADMIN">ADMIN (Superuser)</option>
                      <option value="MANAGER">MANAGER (Supervisor)</option>
                      <option value="STAFF">STAFF (Karyawan)</option>
                      <option value="VIP_USER">VIP_USER (Nasabah VIP)</option>
                      <option value="OPERATOR">OPERATOR (Shift Lapangan)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-3 py-1.5 rounded hover:bg-neutral-900 text-neutral-400 text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-white text-black font-semibold text-xs hover:bg-neutral-200"
                >
                  Simpan Perubahan Akun
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
