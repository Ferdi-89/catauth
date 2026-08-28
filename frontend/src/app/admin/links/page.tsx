'use client';

import React, { useState, useEffect } from 'react';
import { 
  Link2, Plus, ExternalLink, ShieldCheck, Key, RefreshCw, 
  Trash2, Edit3, CheckCircle2, Copy, Check, Lock, Smartphone, Globe, ShieldAlert,
  CreditCard, Cpu, AlertTriangle
} from 'lucide-react';
import { api } from '../../../lib/api';
import { ProtectedLink, FIDO2Credential } from '../../../lib/types';

export default function AdminLinksPage() {
  const [links, setLinks] = useState<ProtectedLink[]>([]);
  const [credentials, setCredentials] = useState<FIDO2Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal State for Create / Edit
  const [showModal, setShowModal] = useState(false);
  const [editingLink, setEditingLink] = useState<ProtectedLink | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [requirePin, setRequirePin] = useState(false);
  const [geofenceEnabled, setGeofenceEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modal NFC Scan State
  const [scanningNFCInModal, setScanningNFCInModal] = useState(false);
  const [registeringWebAuthnInModal, setRegisteringWebAuthnInModal] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<string | null>(null);

  // Manual Add Card Form inside Modal
  const [showAddCard, setShowAddCard] = useState(false);
  const [newCardLabel, setNewCardLabel] = useState('');
  const [newCardId, setNewCardId] = useState('');

  async function loadData() {
    setLoading(true);
    const [linksRes, credsRes] = await Promise.all([
      api.listProtectedLinks(),
      api.listCredentials(),
    ]);

    if (linksRes.success && linksRes.data) {
      setLinks(linksRes.data);
    }
    if (credsRes.success && credsRes.data) {
      setCredentials(credsRes.data);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function handleOpenCreate() {
    setEditingLink(null);
    setTitle('');
    setDescription('');
    setTargetUrl('https://example.com/target-dashboard');
    setSelectedCards(['FIDO2-NFC-KEY-ALPHA-01']); // Default to Alpha
    setRequirePin(false);
    setGeofenceEnabled(false);
    setShowModal(true);
    setShowAddCard(false);
    setModalFeedback(null);
  }

  function handleOpenEdit(link: ProtectedLink) {
    setEditingLink(link);
    setTitle(link.title);
    setDescription(link.description);
    setTargetUrl(link.target_redirect_url);
    setSelectedCards(link.allowed_card_ids || []);
    setRequirePin(link.require_pin);
    setGeofenceEnabled(link.geofence_enabled);
    setShowModal(true);
    setShowAddCard(false);
    setModalFeedback(null);
  }

  async function handleSubmitLink(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !targetUrl.trim()) return;

    setSaving(true);

    if (editingLink) {
      // Update
      const res = await api.updateProtectedLink(editingLink.id, {
        title,
        description,
        target_redirect_url: targetUrl,
        allowed_card_ids: selectedCards,
        require_pin: requirePin,
        geofence_enabled: geofenceEnabled,
      });
      if (res.success) {
        setShowModal(false);
        loadData();
      } else {
        alert(res.error?.message || 'Gagal memperbarui link.');
      }
    } else {
      // Create
      const res = await api.createProtectedLink({
        title,
        description,
        target_redirect_url: targetUrl,
        allowed_card_ids: selectedCards,
        require_pin: requirePin,
        geofence_enabled: geofenceEnabled,
      });
      if (res.success) {
        setShowModal(false);
        loadData();
      } else {
        alert(res.error?.message || 'Gagal membuat link.');
      }
    }
    setSaving(false);
  }

  async function handleDeleteLink(id: string, title: string) {
    if (!confirm(`Hapus Protected Link "${title}"?`)) return;
    const res = await api.deleteProtectedLink(id);
    if (res.success) {
      loadData();
    }
  }

  async function handleToggleStatus(link: ProtectedLink) {
    const res = await api.updateProtectedLink(link.id, {
      is_active: !link.is_active,
    });
    if (res.success) {
      loadData();
    }
  }

  function handleCopyGatewayUrl(linkId: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const gatewayUrl = `${origin}/sso/login?link_id=${linkId}`;
    navigator.clipboard.writeText(gatewayUrl);
    setCopiedId(linkId);
    setTimeout(() => setCopiedId(null), 2500);
  }

  // 1-Tap Physical NFC Direct Scan inside Modal (Web NFC)
  async function handleTapScanPhysicalCard() {
    if (typeof window === 'undefined' || !('NDEFReader' in window)) {
      alert('Fitur Web NFC langsung memerlukan Google Chrome pada HP Android ber-NFC. Untuk browser lain, Anda dapat menggunakan tombol FIDO2 atau Input Manual.');
      return;
    }

    setScanningNFCInModal(true);
    setModalFeedback('Membuka sensor NFC... Silakan tempelkan kartu fisik (e-Money / Flazz / e-KTP / Tag) ke belakang HP sekarang!');

    try {
      const NDEFReaderClass = (window as any).NDEFReader;
      const ndef = new NDEFReaderClass();
      await ndef.scan();

      ndef.onreadingerror = () => {
        alert('Gagal membaca kartu NFC. Pastikan kartu didekatkan dengan stabil.');
        setScanningNFCInModal(false);
      };

      ndef.onreading = async (event: any) => {
        const serial = event.serialNumber;
        const rawUid = serial ? serial.replace(/:/g, '').toUpperCase() : 'TAG';
        const credId = `NFC-UID-${rawUid}`;

        setScanningNFCInModal(false);

        const labelPrompt = prompt(`Kartu NFC Terdeteksi! (Serial: ${serial || rawUid})\nBeri nama kartu:`, `Kartu Fisik (${rawUid.substring(0, 6)})`);
        const finalLabel = labelPrompt?.trim() || `Kartu Fisik (${rawUid.substring(0, 6)})`;

        // Register new card
        const res = await api.registerCredential({
          user_id: 'usr_demo_john_doe',
          credential_id: credId,
          label: finalLabel,
          transports: ['nfc'],
        });

        if (res.success) {
          const updatedCreds = await api.listCredentials();
          if (updatedCreds.data) {
            setCredentials(updatedCreds.data);
          }
          // Automatically select/check this new card in the whitelist!
          setSelectedCards((prev) => Array.from(new Set([...prev, credId])));
          setModalFeedback(`Kartu "${finalLabel}" [${credId}] berhasil didaftarkan dan OTOMATIS dicentang dalam whitelist link ini!`);
        } else {
          alert(res.error?.message || 'Gagal menyimpan kartu ke database.');
        }
      };
    } catch (err: any) {
      console.warn('Web NFC registration error:', err);
      setScanningNFCInModal(false);
      if (err.name === 'NotAllowedError') {
        alert('Izin akses NFC ditolak pada browser.');
      } else {
        alert(`Pemindaian NFC: ${err.message || 'NFC tidak aktif.'}`);
      }
    }
  }

  // FIDO2 Key Registration inside Modal
  async function handleRegisterFIDO2Card() {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      alert('Browser Anda tidak mendukung WebAuthn API.');
      return;
    }

    setRegisteringWebAuthnInModal(true);
    setModalFeedback(null);

    try {
      const randomChallenge = new Uint8Array(32);
      window.crypto.getRandomValues(randomChallenge);
      const userId = new Uint8Array(16);
      window.crypto.getRandomValues(userId);

      const credential: any = await navigator.credentials.create({
        publicKey: {
          challenge: randomChallenge,
          rp: { name: 'Catauth', id: window.location.hostname },
          user: { id: userId, name: 'admin@catauth.io', displayName: 'Administrator' },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
          authenticatorSelection: { authenticatorAttachment: 'cross-platform', userVerification: 'preferred' },
          timeout: 60000,
        },
      });

      if (credential) {
        const rawIdArray = new Uint8Array(credential.rawId);
        const hexId = Array.from(rawIdArray).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        const shortCredId = `FIDO2-NFC-${hexId.substring(0, 16)}`;

        const labelPrompt = prompt('Kunci FIDO2 Terdeteksi! Beri nama label:', `YubiKey (${hexId.substring(0, 6)})`);
        const finalLabel = labelPrompt?.trim() || `YubiKey (${hexId.substring(0, 6)})`;

        const res = await api.registerCredential({
          user_id: 'usr_admin_master',
          credential_id: shortCredId,
          label: finalLabel,
          transports: ['nfc', 'usb'],
        });

        if (res.success) {
          const updatedCreds = await api.listCredentials();
          if (updatedCreds.data) {
            setCredentials(updatedCreds.data);
          }
          setSelectedCards((prev) => Array.from(new Set([...prev, shortCredId])));
          setModalFeedback(`Kunci FIDO2 "${finalLabel}" berhasil didaftarkan dan OTOMATIS dicentang!`);
        }
      }
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        alert(`Pendaftaran FIDO2: ${err.message}`);
      }
    } finally {
      setRegisteringWebAuthnInModal(false);
    }
  }

  async function handleCreateNewCard(e: React.FormEvent) {
    e.preventDefault();
    if (!newCardLabel.trim()) return;
    const credId = newCardId.trim() || `FIDO2-NFC-${Date.now().toString(36).toUpperCase()}`;

    const res = await api.registerCredential({
      user_id: 'usr_demo_john_doe',
      credential_id: credId,
      label: newCardLabel,
      transports: ['nfc'],
    });

    if (res.success) {
      const updatedCreds = await api.listCredentials();
      if (updatedCreds.data) {
        setCredentials(updatedCreds.data);
      }
      setSelectedCards([...selectedCards, credId]);
      setShowAddCard(false);
      setNewCardLabel('');
      setNewCardId('');
      setModalFeedback(`Kartu "${newCardLabel}" berhasil ditambahkan dan dicentang.`);
    }
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Protected Gateway Links
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-800">
              NFC Access & Whitelist Hub
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Buat tautan gateway terproteksi, tentukan URL target redirect, dan kelola whitelist kartu hardware NFC yang diizinkan untuk setiap tautan.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="px-4 py-2 rounded-md bg-white text-black font-medium text-sm hover:bg-neutral-200 transition-colors inline-flex items-center space-x-2 shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Protected Link Baru</span>
        </button>
      </div>

      {/* Grid of Protected Links */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="bento-card p-6 border-neutral-800 animate-pulse h-56"></div>
          ))}
        </div>
      ) : links.length === 0 ? (
        <div className="bento-card p-12 text-center space-y-4 border-neutral-800">
          <Link2 className="w-10 h-10 text-neutral-500 mx-auto" />
          <h3 className="text-base font-bold text-white">Belum Ada Protected Link</h3>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto">
            Buat tautan proteksi pertama Anda untuk mengamankan halaman web dengan otentikasi hardware NFC.
          </p>
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 rounded-md bg-white text-black font-medium text-xs hover:bg-neutral-200"
          >
            + Buat Protected Link Sekarang
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {links.map((link) => {
            const isCopied = copiedId === link.id;
            return (
              <div
                key={link.id}
                className={`bento-card p-6 space-y-5 border transition-all flex flex-col justify-between ${
                  link.is_active ? 'border-neutral-800 hover:border-neutral-700' : 'border-neutral-900 opacity-60'
                }`}
              >
                <div className="space-y-4">
                  {/* Top Bar: Title, Status, and Controls */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <h3 className="font-bold text-white text-base tracking-tight">{link.title}</h3>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                            link.is_active
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                              : 'bg-neutral-900 text-neutral-500 border border-neutral-800'
                          }`}
                        >
                          {link.is_active ? 'ACTIVE' : 'PAUSED'}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400 leading-relaxed">{link.description}</p>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => handleOpenEdit(link)}
                        className="p-1.5 rounded hover:bg-neutral-900 text-neutral-400 hover:text-white"
                        title="Edit Konfigurasi"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteLink(link.id, link.title)}
                        className="p-1.5 rounded hover:bg-red-950/50 text-neutral-500 hover:text-red-400"
                        title="Hapus Link"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Target Redirect Preview */}
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-neutral-500 font-mono">Target Destination URL:</span>
                      <a
                        href={link.target_redirect_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 hover:underline flex items-center space-x-1 text-[11px] font-mono"
                      >
                        <span>Kunjungi</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-xs font-mono text-cyan-300 truncate font-semibold">
                      {link.target_redirect_url}
                    </p>
                  </div>

                  {/* Allowed NFC Cards Whitelist Summary */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400 font-mono flex items-center space-x-1">
                        <Key className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Whitelist Kartu NFC ({link.allowed_card_ids?.length || 0})</span>
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {link.allowed_card_ids?.map((cardId) => {
                        const credObj = credentials.find((c) => c.credential_id === cardId);
                        return (
                          <span
                            key={cardId}
                            className="inline-flex items-center space-x-1 text-[10px] font-mono px-2 py-1 rounded bg-neutral-900 text-neutral-300 border border-neutral-800"
                          >
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            <span>{credObj ? credObj.label : cardId}</span>
                          </span>
                        );
                      })}
                      {(!link.allowed_card_ids || link.allowed_card_ids.length === 0) && (
                        <span className="text-[11px] text-red-400 font-mono">
                          ⚠️ Belum ada kartu yang diizinkan (Akses akan ditolak)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Live Metrics */}
                  <div className="grid grid-cols-3 gap-2 text-center pt-2">
                    <div className="p-2 rounded bg-neutral-950 border border-neutral-800/80">
                      <div className="text-[10px] font-mono text-neutral-500">Total Taps</div>
                      <div className="text-sm font-mono font-bold text-white">{link.total_taps}</div>
                    </div>
                    <div className="p-2 rounded bg-neutral-950 border border-neutral-800/80">
                      <div className="text-[10px] font-mono text-neutral-500">Lolos (Pass)</div>
                      <div className="text-sm font-mono font-bold text-emerald-400">{link.successful_passes}</div>
                    </div>
                    <div className="p-2 rounded bg-neutral-950 border border-neutral-800/80">
                      <div className="text-[10px] font-mono text-neutral-500">Diblokir</div>
                      <div className="text-sm font-mono font-bold text-red-400">{link.blocked_attempts}</div>
                    </div>
                  </div>
                </div>

                {/* Bottom Bar: 1-Click Copy Gateway URL & Status Toggle */}
                <div className="pt-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleCopyGatewayUrl(link.id)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center space-x-1.5 ${
                      isCopied
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-white hover:bg-neutral-200 text-black'
                    }`}
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{isCopied ? 'Tersalin!' : 'Salin Link Gateway SSO'}</span>
                  </button>

                  <button
                    onClick={() => handleToggleStatus(link)}
                    className={`px-2.5 py-1.5 rounded text-xs font-mono transition-colors border ${
                      link.is_active
                        ? 'bg-neutral-900 hover:bg-neutral-800 text-neutral-400 border-neutral-800'
                        : 'bg-emerald-950/40 hover:bg-emerald-900 text-emerald-400 border-emerald-800/40'
                    }`}
                  >
                    {link.is_active ? 'Jeda Link' : 'Aktifkan'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bento-card max-w-xl w-full p-6 border-neutral-700 bg-black space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  {editingLink ? 'Edit Protected Link' : 'Buat Protected Link Baru'}
                </h3>
                <p className="text-xs text-neutral-400">
                  Tentukan URL tujuan dan kartu NFC yang berhak membuka link ini.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-neutral-500 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Modal Feedback Alert */}
            {modalFeedback && (
              <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-800/50 text-emerald-300 text-xs font-mono flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{modalFeedback}</span>
                </div>
                <button onClick={() => setModalFeedback(null)} className="text-emerald-400 hover:text-white ml-2">✕</button>
              </div>
            )}

            <form onSubmit={handleSubmitLink} className="space-y-4">
              {/* Link Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-300">
                  Nama Link / Proyek <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Portal Karyawan Produksi, Dashboard VIP"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-neutral-900 border border-neutral-800 text-sm text-white focus:outline-none focus:border-neutral-500 font-sans"
                />
              </div>

              {/* Target Redirect URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-300">
                  Target Redirect Destination URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://app-anda.com/dashboard atau /sso/callback"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-neutral-900 border border-neutral-800 text-sm text-cyan-300 font-mono focus:outline-none focus:border-neutral-500"
                />
                <p className="text-[11px] text-neutral-500">
                  Pengguna akan otomatis dialihkan ke URL ini setelah tap kartu NFC mereka lolos verifikasi.
                </p>
              </div>

              {/* NFC Whitelist Selector + Direct Tap Adding */}
              <div className="space-y-2.5 pt-2 border-t border-neutral-800">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <label className="text-xs font-medium text-white flex items-center space-x-1.5">
                    <Key className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Pilih Kartu NFC yang Dikenali (Whitelist)</span>
                  </label>

                  {/* 1-Tap NFC Add Buttons */}
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleTapScanPhysicalCard}
                      disabled={scanningNFCInModal}
                      className="px-2.5 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-cyan-300 border border-cyan-800/60 font-mono text-[11px] flex items-center space-x-1"
                    >
                      {scanningNFCInModal ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
                          <span>Membaca Kartu HP...</span>
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-3 h-3" />
                          <span>📲 Tap Kartu Fisik HP</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleRegisterFIDO2Card}
                      disabled={registeringWebAuthnInModal}
                      className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 font-mono text-[11px] flex items-center space-x-1"
                    >
                      <Cpu className="w-3 h-3" />
                      <span>FIDO2</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowAddCard(!showAddCard)}
                      className="text-[11px] text-neutral-400 hover:text-white underline font-mono"
                    >
                      {showAddCard ? 'Batal' : '+ Input Manual'}
                    </button>
                  </div>
                </div>

                {/* Sub-form: Add Custom Card Inline */}
                {showAddCard && (
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 space-y-2 animate-in fade-in duration-100">
                    <span className="text-[11px] font-bold text-white block">Daftarkan Kartu Manual Baru:</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Label (e.g. Kartu e-Money Ferdi)"
                        value={newCardLabel}
                        onChange={(e) => setNewCardLabel(e.target.value)}
                        className="px-2.5 py-1.5 rounded bg-neutral-900 border border-neutral-800 text-xs text-white"
                      />
                      <input
                        type="text"
                        placeholder="Card ID (Auto-generate jika kosong)"
                        value={newCardId}
                        onChange={(e) => setNewCardId(e.target.value)}
                        className="px-2.5 py-1.5 rounded bg-neutral-900 border border-neutral-800 text-xs text-cyan-300 font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleCreateNewCard}
                      className="px-3 py-1 rounded bg-white text-black font-medium text-xs hover:bg-neutral-200"
                    >
                      Simpan & Tambahkan ke Whitelist
                    </button>
                  </div>
                )}

                {/* List of Known Cards Checkboxes */}
                <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 space-y-2 max-h-48 overflow-y-auto">
                  {credentials.map((cred) => {
                    const isChecked = selectedCards.includes(cred.credential_id);
                    return (
                      <label
                        key={cred.credential_id}
                        className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                          isChecked ? 'bg-neutral-900 border border-neutral-700' : 'hover:bg-neutral-900/50'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCards([...selectedCards, cred.credential_id]);
                              } else {
                                setSelectedCards(selectedCards.filter((id) => id !== cred.credential_id));
                              }
                            }}
                            className="rounded border-neutral-700 bg-neutral-800 text-white focus:ring-0"
                          />
                          <div>
                            <span className="text-xs font-medium text-white block">{cred.label}</span>
                            <span className="text-[10px] font-mono text-neutral-500">{cred.credential_id}</span>
                          </div>
                        </div>

                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                            cred.is_active
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                              : 'bg-red-950/60 text-red-400 border border-red-800/40'
                          }`}
                        >
                          {cred.is_active ? 'ACTIVE' : 'REVOKED'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Security Toggles */}
              <div className="space-y-2 pt-2 border-t border-neutral-800">
                <label className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 cursor-pointer">
                  <div>
                    <span className="text-xs font-medium text-white block">Wajibkan PIN MFA Tambahan</span>
                    <span className="text-[10px] text-neutral-500">Minta input 6-digit PIN setelah tap kartu NFC berhasil</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={requirePin}
                    onChange={(e) => setRequirePin(e.target.checked)}
                    className="rounded border-neutral-700 bg-neutral-800 text-white"
                  />
                </label>

                <label className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 cursor-pointer">
                  <div>
                    <span className="text-xs font-medium text-white block">Proteksi Geofencing (ID, SG, US)</span>
                    <span className="text-[10px] text-neutral-500">Blokir tap yang berasal dari luar wilayah yang diizinkan</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={geofenceEnabled}
                    onChange={(e) => setGeofenceEnabled(e.target.checked)}
                    className="rounded border-neutral-700 bg-neutral-800 text-white"
                  />
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-md hover:bg-neutral-900 text-neutral-400 text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving || selectedCards.length === 0}
                  className="px-5 py-2 rounded-md bg-white hover:bg-neutral-200 disabled:opacity-50 text-black text-xs font-semibold"
                >
                  {saving ? 'Menyimpan...' : editingLink ? 'Simpan Perubahan' : 'Buat Protected Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
