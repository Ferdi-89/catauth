'use client';

import React, { useState, useEffect } from 'react';
import { KeyRound, Shield, Ban, CheckCircle2, RefreshCw, Smartphone, Plus } from 'lucide-react';
import { api } from '../../../lib/api';
import { FIDO2Credential } from '../../../lib/types';

export default function AdminKeysPage() {
  const [credentials, setCredentials] = useState<FIDO2Credential[]>([]);
  const [loading, setLoading] = useState(true);

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

  async function handleToggleStatus(credId: string, currentActive: boolean) {
    const reason = !currentActive ? 'Admin reactivated' : 'Admin manual security revocation';
    const res = await api.toggleCredentialStatus(credId, !currentActive, reason);
    if (res.success) {
      loadCredentials();
    } else {
      alert(res.error?.message || 'Failed to update token status.');
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white tracking-tight">Manajemen Kunci Token FIDO2 NFC</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary-500/20 text-primary-300 border border-primary-500/30">
              Node 52, 53, 54
            </span>
          </div>
          <p className="text-xs text-gray-400">Pendaftaran hardware token WebAuthn, inspeksi counter sign_count anti-kloning, dan kendali pemblokiran seketika.</p>
        </div>

        <button
          onClick={loadCredentials}
          className="p-2 rounded-xl bg-card hover:bg-border text-gray-300 border border-border text-xs flex items-center space-x-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Segarkan Data</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {credentials.map((c) => (
          <div
            key={c.id}
            className={`bento-card p-6 space-y-4 border ${
              c.is_active ? 'border-border hover:border-primary-500/40' : 'border-crimson-500/30 bg-crimson-500/5'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  c.is_active ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20' : 'bg-crimson-500/10 text-crimson-400 border border-crimson-500/20'
                }`}>
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-xs">{c.label}</h3>
                  <p className="text-[10px] font-mono text-gray-400 truncate max-w-[140px]">{c.credential_id}</p>
                </div>
              </div>

              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                c.is_active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-crimson-500/20 text-crimson-400 border border-crimson-500/30'
              }`}>
                {c.is_active ? 'ACTIVE' : 'REVOKED'}
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between p-2 rounded-lg bg-background/60 border border-border">
                <span className="text-gray-400 text-[11px]">Signature Counter:</span>
                <span className="text-cyan-300 font-bold">{c.sign_count}</span>
              </div>

              <div className="text-[11px] text-gray-400 space-y-1">
                <div>Transports: {c.transports.join(', ')}</div>
                {c.last_used_at && (
                  <div>Terakhir Digunakan: {new Date(c.last_used_at).toLocaleTimeString()}</div>
                )}
                {c.revocation_reason && (
                  <div className="text-crimson-400">Alasan Blokir: {c.revocation_reason}</div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-between">
              <button
                onClick={() => handleToggleStatus(c.credential_id, c.is_active)}
                className={`w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors ${
                  c.is_active
                    ? 'bg-crimson-500/20 hover:bg-crimson-500/30 text-crimson-300 border border-crimson-500/30'
                    : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {c.is_active ? (
                  <>
                    <Ban className="w-3.5 h-3.5" />
                    <span>Cabut / Blokir Kunci Token</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Aktifkan Kembali Token</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
