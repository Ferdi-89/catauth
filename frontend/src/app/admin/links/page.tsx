'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Plus, Link2, ExternalLink, Copy, Check, Shield, Key, 
  Trash2, Edit3, Activity, ArrowRight, ToggleLeft, ToggleRight, Sparkles 
} from 'lucide-react';
import { api } from '../../../lib/api';
import { ProtectedLink, FIDO2Credential } from '../../../lib/types';

export default function ProtectedLinksPage() {
  const [links, setLinks] = useState<ProtectedLink[]>([]);
  const [credentials, setCredentials] = useState<FIDO2Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingLink, setEditingLink] = useState<ProtectedLink | null>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [targetUrl, setTargetUrl] = useState('/sso/callback');
  const [selectedCards, setSelectedCards] = useState<string[]>(['FIDO2-NFC-KEY-ALPHA-01']);
  const [requirePin, setRequirePin] = useState(false);
  const [geofenceEnabled, setGeofenceEnabled] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Inline New Card Registration Modal
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
    setSlug('');
    setTargetUrl('/sso/callback');
    setSelectedCards(['FIDO2-NFC-KEY-ALPHA-01']);
    setRequirePin(false);
    setGeofenceEnabled(true);
    setShowModal(true);
  }

  function handleOpenEdit(link: ProtectedLink) {
    setEditingLink(link);
    setTitle(link.title);
    setSlug(link.slug);
    setTargetUrl(link.target_redirect_url);
    setSelectedCards(link.allowed_card_ids || []);
    setRequirePin(link.require_pin);
    setGeofenceEnabled(link.geofence_enabled);
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !targetUrl.trim()) return;
    if (selectedCards.length === 0) {
      alert('Pilih setidaknya 1 kartu NFC yang diizinkan untuk link ini!');
      return;
    }

    setFormSubmitting(true);
    if (editingLink) {
      const res = await api.updateProtectedLink(editingLink.id, {
        title,
        slug: slug || title.toLowerCase().replace(/[^a-z0-9]/g, '-'),
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
      const res = await api.createProtectedLink({
        title,
        slug: slug || title.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        target_redirect_url: targetUrl,
        allowed_card_ids: selectedCards,
        require_pin: requirePin,
        geofence_enabled: geofenceEnabled,
      });
      if (res.success) {
        setShowModal(false);
        loadData();
      } else {
        alert(res.error?.message || 'Gagal membuat link baru.');
      }
    }
    setFormSubmitting(false);
  }

  async function handleDelete(id: string, title: string) {
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
        <div className="bento-card p-12 text-center border-neutral-800 space-y-4">
          <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400 flex items-center justify-center mx-auto">
            <Link2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">Belum Ada Protected Link</h3>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            Mulai dengan membuat tautan pertama Anda untuk mengunci aplikasi atau dashboard dengan kartu fisik NFC.
          </p>
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 rounded-md bg-white text-black font-medium text-xs hover:bg-neutral-200"
          >
            Buat Link Pertama
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {links.map((link) => {
            const passRate = link.total_taps > 0 
              ? Math.round((link.successful_passes / link.total_taps) * 100) 
              : 100;
            const isCopied = copiedId === link.id;

            return (
              <div
                key={link.id}
                className="bento-card p-6 border-neutral-800 hover:border-neutral-700 transition-all flex flex-col justify-between space-y-5 relative group"
              >
                {/* Card Header */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-base font-bold text-white group-hover:text-white transition-colors">
                          {link.title}
                        </h3>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                            link.is_active
                              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                              : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                          }`}
                        >
                          {link.is_active ? 'ACTIVE' : 'PAUSED'}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-neutral-500 block">
                        ID: {link.id} • Slug: /{link.slug}
                      </span>
                    </div>

                    {/* Quick Action Toggles */}
                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => handleToggleStatus(link)}
                        title={link.is_active ? 'Pause Link' : 'Activate Link'}
                        className="p-1.5 rounded hover:bg-neutral-900 text-neutral-400 hover:text-white"
                      >
                        {link.is_active ? (
                          <ToggleRight className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-neutral-600" />
                        )}
                      </button>
                      <button
                        onClick={() => handleOpenEdit(link)}
                        title="Edit Link & Whitelist"
                        className="p-1.5 rounded hover:bg-neutral-900 text-neutral-400 hover:text-white"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(link.id, link.title)}
                        title="Hapus Link"
                        className="p-1.5 rounded hover:bg-neutral-900 text-neutral-400 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Target Redirect URL Box */}
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800/80 space-y-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 block">
                      Target Destination (Setelah Tap Lolos):
                    </span>
                    <div className="flex items-center space-x-1.5 text-xs font-mono text-cyan-300 break-all">
                      <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 text-neutral-500" />
                      <span>{link.target_redirect_url}</span>
                    </div>
                  </div>

                  {/* Whitelisted Cards List */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 block">
                      Kartu NFC Terotorisasi ({link.allowed_card_ids.length} Kartu Dikenali):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {link.allowed_card_ids.map((cardId) => {
                        const matchedCred = credentials.find((c) => c.credential_id === cardId);
                        return (
                          <span
                            key={cardId}
                            className="inline-flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-800"
                          >
                            <Key className="w-2.5 h-2.5 text-neutral-400" />
                            <span>{matchedCred?.label || cardId}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Metrics & Bottom Actions */}
                <div className="pt-4 border-t border-neutral-800/80 space-y-4">
                  {/* Stats Bar */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded bg-neutral-950 border border-neutral-900">
                      <span className="text-[10px] font-mono text-neutral-500 block">Total Taps</span>
                      <span className="text-sm font-bold text-white font-mono">{link.total_taps}</span>
                    </div>
                    <div className="p-2 rounded bg-neutral-950 border border-neutral-900">
                      <span className="text-[10px] font-mono text-neutral-500 block">Pass Rate</span>
                      <span className="text-sm font-bold text-emerald-400 font-mono">{passRate}%</span>
                    </div>
                    <div className="p-2 rounded bg-neutral-950 border border-neutral-900">
                      <span className="text-[10px] font-mono text-neutral-500 block">Blocked</span>
                      <span className="text-sm font-bold text-red-400 font-mono">{link.blocked_attempts}</span>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      onClick={() => handleCopyGatewayUrl(link.id)}
                      className="px-3 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 text-xs font-medium inline-flex items-center space-x-1.5 transition-colors"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-neutral-400" />
                          <span>Salin Link Gateway</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center space-x-2">
                      <Link
                        href={`/admin/dashboard?link_id=${link.id}`}
                        className="px-3 py-1.5 rounded hover:bg-neutral-900 text-neutral-400 hover:text-white text-xs font-medium inline-flex items-center space-x-1 transition-colors"
                      >
                        <Activity className="w-3.5 h-3.5" />
                        <span>Pantau Telemetry</span>
                      </Link>

                      <Link
                        href={`/sso/login?link_id=${link.id}`}
                        target="_blank"
                        className="px-3 py-1.5 rounded bg-white text-black font-medium text-xs hover:bg-neutral-200 inline-flex items-center space-x-1 transition-colors"
                      >
                        <span>Uji Tap Gateway</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Protected Link Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bento-card max-w-xl w-full p-6 border-neutral-700 bg-black space-y-6 my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div className="flex items-center space-x-2">
                <Link2 className="w-5 h-5 text-white" />
                <h3 className="text-lg font-bold text-white">
                  {editingLink ? 'Edit Protected Link' : 'Buat Protected Link Baru'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-neutral-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
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

              {/* NFC Whitelist Selector */}
              <div className="space-y-2 pt-2 border-t border-neutral-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-white flex items-center space-x-1.5">
                    <Key className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Pilih Kartu NFC yang Dikenali (Whitelist)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddCard(true)}
                    className="text-[11px] text-neutral-400 hover:text-white underline font-mono"
                  >
                    + Daftarkan Kartu Baru
                  </button>
                </div>

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

              {/* Form Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-md hover:bg-neutral-900 text-neutral-400 hover:text-white text-xs font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 rounded-md bg-white text-black font-medium text-xs hover:bg-neutral-200 transition-colors disabled:opacity-50"
                >
                  {formSubmitting ? 'Menyimpan...' : (editingLink ? 'Perbarui Link' : 'Buat & Terbitkan Link')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Card Mini Modal */}
      {showAddCard && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bento-card max-w-md w-full p-6 border-neutral-700 bg-black space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-white">Daftarkan Kartu Hardware NFC Baru</h3>
            <form onSubmit={handleCreateNewCard} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-neutral-300">Nama / Label Kartu</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master YubiKey CFO, Kartu Akses Tim Alpha"
                  value={newCardLabel}
                  onChange={(e) => setNewCardLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800 text-sm text-white focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-neutral-300">Credential ID / Token Serial (Opsional)</label>
                <input
                  type="text"
                  placeholder="e.g. FIDO2-NFC-KEY-DELTA-04 (Auto-generate jika kosong)"
                  value={newCardId}
                  onChange={(e) => setNewCardId(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800 text-sm font-mono text-cyan-300 focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddCard(false)}
                  className="px-3 py-1.5 rounded hover:bg-neutral-900 text-neutral-400 text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-white text-black font-medium text-xs hover:bg-neutral-200"
                >
                  Simpan & Tambahkan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
