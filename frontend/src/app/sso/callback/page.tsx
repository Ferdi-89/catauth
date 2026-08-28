'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, KeyRound, Shield, RefreshCw, Server, ArrowLeft, CreditCard, User, Lock, Copy, Check } from 'lucide-react';
import Link from 'next/link';
import { api } from '../../../lib/api';

function SSOCallbackContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const authStatus = searchParams.get('auth_status') || 'SUCCESS';
  const userId = searchParams.get('user_id') || 'usr_demo_john_doe';
  const cardId = searchParams.get('card_id') || 'FIDO2-NFC-KEY-ALPHA-01';
  const cardLabel = searchParams.get('card_label') || 'Kunci Hardware NFC Terverifikasi';
  const rawAuthToken = searchParams.get('auth_token');
  const linkId = searchParams.get('link_id');

  const [loading, setLoading] = useState(true);
  const [tokenData, setTokenData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [introspectResult, setIntrospectResult] = useState<any>(null);
  const [introspectLoading, setIntrospectLoading] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  useEffect(() => {
    async function performExchange() {
      if (!code) {
        setLoading(false);
        return;
      }

      const res = await api.exchangeToken({
        code: code,
        client_id: 'client_portal_alpha',
        client_secret: 'sec_portal_alpha_998811',
        redirect_uri: typeof window !== 'undefined' ? `${window.location.origin}/sso/callback` : '/sso/callback',
      });

      if (res.success && res.data) {
        setTokenData(res.data);
      } else if (res.access_token) {
        setTokenData(res);
      }
      setLoading(false);
    }

    performExchange();
  }, [code]);

  async function handleIntrospect() {
    const tokenToUse = tokenData?.access_token || rawAuthToken;
    if (!tokenToUse) return;
    setIntrospectLoading(true);

    const res = await api.introspectToken(tokenToUse);
    setIntrospectResult(res);
    setIntrospectLoading(false);
  }

  function handleCopyToken() {
    const token = rawAuthToken || tokenData?.access_token || '';
    navigator.clipboard.writeText(token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  }

  return (
    <div className="max-w-2xl mx-auto my-8 space-y-6">
      {/* Callback Status Header */}
      <div className="bento-card p-6 border-emerald-800/40 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Target Destination: Kredensial Berhasil Diterima</h2>
            <p className="text-xs text-neutral-400 font-mono">Status: {authStatus} • Hardware Auth Verified</p>
          </div>
        </div>
        <Link
          href="/"
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-xs text-neutral-300 border border-neutral-800"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Dashboard Admin</span>
        </Link>
      </div>

      {/* Received Credentials Breakdown */}
      <div className="bento-card p-6 space-y-4 border-neutral-800">
        <h3 className="text-sm font-bold text-white flex items-center space-x-2">
          <CreditCard className="w-4 h-4 text-cyan-400" />
          <span>Informasi Kredensial yang Dibawa dari Gateway</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 space-y-1">
            <span className="text-neutral-500 text-[10px] uppercase">Kartu NFC yang Digunakan:</span>
            <div className="text-white font-bold">{cardLabel}</div>
            <div className="text-[10px] text-cyan-400 truncate">{cardId}</div>
          </div>

          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 space-y-1">
            <span className="text-neutral-500 text-[10px] uppercase">User ID yang Terverifikasi:</span>
            <div className="text-emerald-400 font-bold">{userId}</div>
            <div className="text-[10px] text-neutral-500">Method: WEBAUTHN_NFC</div>
          </div>

          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 space-y-1">
            <span className="text-neutral-500 text-[10px] uppercase">Authorization Code:</span>
            <div className="text-neutral-300 font-mono text-[11px] truncate">{code || 'N/A'}</div>
          </div>

          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 space-y-1">
            <span className="text-neutral-500 text-[10px] uppercase">Link ID Ref:</span>
            <div className="text-neutral-300 font-mono text-[11px] truncate">{linkId || 'default'}</div>
          </div>
        </div>

        {/* Signed JWT Token */}
        {(rawAuthToken || tokenData?.access_token) && (
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono text-neutral-400 uppercase">
                Signed Auth Token (JWT / Bearer)
              </label>
              <button
                onClick={handleCopyToken}
                className="text-[10px] font-mono text-cyan-400 hover:text-white flex items-center space-x-1"
              >
                {copiedToken ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedToken ? 'Tersalin' : 'Salin Token'}</span>
              </button>
            </div>
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-cyan-300 break-all text-[10px] font-mono max-h-24 overflow-y-auto">
              {rawAuthToken || tokenData?.access_token}
            </div>
          </div>
        )}

        {/* Code Snippet Guide for Target Website Developers */}
        <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-900 space-y-2 text-xs">
          <span className="text-neutral-300 font-semibold block text-[11px]">
            💡 Cara Website Anda Membaca Data Ini (Frontend / Backend):
          </span>
          <pre className="p-2.5 rounded bg-black border border-neutral-800 font-mono text-[10px] text-emerald-400 overflow-x-auto">
{`// Di halaman website tujuan Anda (JavaScript/React/Next.js):
const params = new URLSearchParams(window.location.search);
const userId = params.get('user_id');       // "usr_demo_john_doe"
const cardId = params.get('card_id');       // "NFC-UID-04A23B4C"
const cardName = params.get('card_label');  // "e-Money BCA Ferdi"
const token = params.get('auth_token');     // JWT Token terverifikasi

// Simpan session atau login-kan user secara instan!
localStorage.setItem('auth_token', token);`}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function SSOCallbackPage() {
  return (
    <Suspense fallback={
      <div className="max-w-md mx-auto my-12 bento-card p-8 text-center space-y-4">
        <div className="w-8 h-8 rounded-full border-2 border-white border-t-transparent animate-spin mx-auto"></div>
        <p className="text-xs text-neutral-400 font-mono">Memuat Callback Kredensial...</p>
      </div>
    }>
      <SSOCallbackContent />
    </Suspense>
  );
}
