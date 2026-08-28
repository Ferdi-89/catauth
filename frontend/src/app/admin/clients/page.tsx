'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Shield, Globe, Trash2, Key, CheckCircle2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { ClientApp } from '../../../lib/types';

export default function AdminClientsPage() {
  const [clients, setClients] = useState<ClientApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [appName, setAppName] = useState('');
  const [redirectUris, setRedirectUris] = useState('http://localhost:3000/sso/callback');
  const [allowedOrigins, setAllowedOrigins] = useState('http://localhost:3000');
  const [webhookLogoutUrl, setWebhookLogoutUrl] = useState('http://localhost:8000/api/v1/mock/webhook-logout');
  const [createdClient, setCreatedClient] = useState<any>(null);

  async function loadClients() {
    setLoading(true);
    const res = await api.listClients();
    if (res.success && res.data) {
      setClients(res.data);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadClients();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await api.createClient({
      app_name: appName,
      redirect_uris: redirectUris.split(',').map((s) => s.trim()).filter(Boolean),
      allowed_origins: allowedOrigins.split(',').map((s) => s.trim()).filter(Boolean),
      webhook_logout_url: webhookLogoutUrl,
    });

    if (res.success && res.data) {
      setCreatedClient(res.data);
      setShowModal(false);
      setAppName('');
      loadClients();
    } else {
      alert(res.error?.message || 'Failed to create client.');
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white tracking-tight">Manajemen Aplikasi Klien (SSO)</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary-500/20 text-primary-300 border border-primary-500/30">
              Node 49 & 50
            </span>
          </div>
          <p className="text-xs text-gray-400">Pendaftaran website mitra, konfigurasi redirect URI, whitelist origin, dan Back-Channel Webhook.</p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold flex items-center space-x-2 transition-colors shadow-lg shadow-primary-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>Daftarkan Aplikasi Baru</span>
        </button>
      </div>

      {createdClient && (
        <div className="bento-card p-6 border-emerald-500/40 bg-emerald-500/5 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-emerald-400 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Aplikasi Berhasil Didaftarkan! Simpan Kredensial Berikut:</span>
            </span>
            <button onClick={() => setCreatedClient(null)} className="text-gray-400 hover:text-white">✕</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-background p-4 rounded-xl border border-border">
            <div>
              <span className="text-gray-500 block">Client ID:</span>
              <span className="text-white font-bold">{createdClient.client_id}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Client Secret (Raw):</span>
              <span className="text-amber-400 font-bold break-all">{createdClient.client_secret_raw}</span>
            </div>
          </div>
        </div>
      )}

      {/* Client List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {clients.map((c) => (
          <div key={c.id} className="bento-card p-6 space-y-4 border border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-primary-500/10 border border-primary-500/20 text-primary-400 flex items-center justify-center font-bold">
                  {c.app_name[0]}
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">{c.app_name}</h3>
                  <p className="text-[11px] font-mono text-gray-400">{c.client_id}</p>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                c.is_active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-gray-500/10 text-gray-400'
              }`}>
                {c.is_active ? 'Active' : 'Disabled'}
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div>
                <span className="text-gray-500 block text-[10px]">Whitelisted Redirect URIs:</span>
                <div className="text-gray-300 text-[11px] truncate">
                  {c.redirect_uris.join(', ')}
                </div>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px]">Allowed Web Origins:</span>
                <div className="text-gray-300 text-[11px] truncate">
                  {c.allowed_origins.join(', ')}
                </div>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px]">Back-Channel Webhook URL:</span>
                <div className="text-cyan-300 text-[11px] truncate">
                  {c.webhook_logout_url || 'Tidak dikonfigurasi'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Dialog */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bento-card p-6 max-w-lg w-full space-y-4 border-primary-500/30">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Daftarkan Aplikasi Klien Baru</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-300 font-medium mb-1">Nama Aplikasi Mitra</label>
                <input
                  type="text"
                  required
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="Contoh: E-Commerce Storefront"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">Redirect URIs (Pisahkan koma)</label>
                <input
                  type="text"
                  required
                  value={redirectUris}
                  onChange={(e) => setRedirectUris(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-white font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">Allowed Origins (Pisahkan koma)</label>
                <input
                  type="text"
                  required
                  value={allowedOrigins}
                  onChange={(e) => setAllowedOrigins(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-white font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">Back-Channel Logout Webhook URL</label>
                <input
                  type="url"
                  value={webhookLogoutUrl}
                  onChange={(e) => setWebhookLogoutUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-white font-mono text-[11px]"
                />
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg bg-card hover:bg-border text-gray-300 border border-border"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-semibold"
                >
                  Simpan & Buat Kredensial
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
