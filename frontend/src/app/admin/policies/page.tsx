'use client';

import React, { useState, useEffect } from 'react';
import { Shield, Clock, Lock, Globe, Save, CheckCircle2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { SecurityPolicy } from '../../../lib/types';

export default function AdminPoliciesPage() {
  const [policy, setPolicy] = useState<SecurityPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Form states
  const [sessionTtl, setSessionTtl] = useState(3600);
  const [challengeTtl, setChallengeTtl] = useState(60);
  const [requirePinMfa, setRequirePinMfa] = useState(false);
  const [geofenceEnabled, setGeofenceEnabled] = useState(true);
  const [allowedCountries, setAllowedCountries] = useState('ID, SG, US, JP, MY, GB, DE');

  async function loadPolicy() {
    setLoading(true);
    const res = await api.getPolicies();
    if (res.success && res.data) {
      setPolicy(res.data);
      setSessionTtl(res.data.session_ttl_sec);
      setChallengeTtl(res.data.challenge_ttl_sec);
      setRequirePinMfa(res.data.require_pin_mfa);
      setGeofenceEnabled(res.data.geofence_enabled);
      setAllowedCountries((res.data.allowed_countries || []).join(', '));
    }
    setLoading(false);
  }

  useEffect(() => {
    loadPolicy();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    const countriesArray = allowedCountries.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

    const res = await api.updatePolicies({
      session_ttl_sec: sessionTtl,
      challenge_ttl_sec: challengeTtl,
      require_pin_mfa: requirePinMfa,
      geofence_enabled: geofenceEnabled,
      allowed_countries: countriesArray,
    });

    setSaving(false);
    if (res.success) {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      loadPolicy();
    } else {
      alert(res.error?.message || 'Failed to save policies.');
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div>
        <div className="flex items-center space-x-2">
          <h1 className="text-2xl font-black text-white tracking-tight">Kebijakan Keamanan & TTL Sesi</h1>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary-500/20 text-primary-300 border border-primary-500/30">
            Node 57 & 58
          </span>
        </div>
        <p className="text-xs text-gray-400">Atur durasi kedaluwarsa sesi token, pembatasan geofencing negara, dan kewajiban PIN MFA sekunder.</p>
      </div>

      {savedSuccess && (
        <div className="bento-card p-4 border-emerald-500/40 bg-emerald-500/10 text-emerald-300 flex items-center space-x-2 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Kebijakan keamanan berhasil diperbarui dan diterapkan ke seluruh pooler!</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* TTL Settings */}
        <div className="bento-card p-6 space-y-4 border border-border">
          <div className="flex items-center space-x-2 text-sm font-bold text-white border-b border-border pb-3">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span>Pengaturan Durasi TTL Token & Challenge</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-gray-300 font-medium mb-1">
                Session TTL (Detik): <span className="font-mono text-cyan-300 font-bold">{sessionTtl}s ({Math.round(sessionTtl / 60)} menit)</span>
              </label>
              <input
                type="range"
                min={300}
                max={86400}
                step={300}
                value={sessionTtl}
                onChange={(e) => setSessionTtl(Number(e.target.value))}
                className="w-full accent-primary-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-gray-300 font-medium mb-1">
                Challenge Nonce TTL (Detik): <span className="font-mono text-primary-300 font-bold">{challengeTtl}s</span>
              </label>
              <input
                type="range"
                min={15}
                max={300}
                step={5}
                value={challengeTtl}
                onChange={(e) => setChallengeTtl(Number(e.target.value))}
                className="w-full accent-primary-500 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* MFA & Geofencing Policies */}
        <div className="bento-card p-6 space-y-4 border border-border">
          <div className="flex items-center space-x-2 text-sm font-bold text-white border-b border-border pb-3">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Kebijakan Multi-Factor & Pembatasan Wilayah</span>
          </div>

          <div className="space-y-4 text-xs">
            {/* Require PIN MFA Toggle (Node 25) */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-background/60 border border-border">
              <div className="space-y-0.5">
                <div className="font-semibold text-gray-200">Wajibkan Verifikasi PIN Sekunder (MFA)</div>
                <div className="text-[11px] text-gray-400">Memerlukan input PIN Argon2id setelah tap NFC berhasil (Node 25 / node-21).</div>
              </div>
              <input
                type="checkbox"
                checked={requirePinMfa}
                onChange={(e) => setRequirePinMfa(e.target.checked)}
                className="w-4 h-4 accent-primary-600 rounded cursor-pointer"
              />
            </div>

            {/* Geofencing Toggle (Node 23) */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-background/60 border border-border">
              <div className="space-y-0.5">
                <div className="font-semibold text-gray-200">Aktifkan Pembatasan Geofencing Negara</div>
                <div className="text-[11px] text-gray-400">Menolak login di luar daftar whitelist negara (Node 23 / node-19).</div>
              </div>
              <input
                type="checkbox"
                checked={geofenceEnabled}
                onChange={(e) => setGeofenceEnabled(e.target.checked)}
                className="w-4 h-4 accent-primary-600 rounded cursor-pointer"
              />
            </div>

            {/* Allowed Countries */}
            <div>
              <label className="block text-gray-300 font-medium mb-1">Daftar Negara Diizinkan (Kode ISO 2-huruf, pisahkan koma)</label>
              <input
                type="text"
                value={allowedCountries}
                onChange={(e) => setAllowedCountries(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-white font-mono text-xs focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-primary-500/25 transition-all"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Menyimpan ke Database...' : 'Simpan Pembaruan Kebijakan'}</span>
        </button>
      </form>
    </div>
  );
}
