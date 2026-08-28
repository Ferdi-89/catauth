'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, KeyRound, Shield, RefreshCw, Server, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { api } from '../../../lib/api';

function SSOCallbackContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const state = searchParams.get('state');


  const [loading, setLoading] = useState(true);
  const [tokenData, setTokenData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [introspectResult, setIntrospectResult] = useState<any>(null);
  const [introspectLoading, setIntrospectLoading] = useState(false);

  useEffect(() => {
    async function performExchange() {
      if (!code) {
        setError('No authorization code found in callback URL.');
        setLoading(false);
        return;
      }

      // Node 34 & 35: Token Exchange
      const res = await api.exchangeToken({
        code: code,
        client_id: 'client_portal_alpha',
        client_secret: 'sec_portal_alpha_998811',
        redirect_uri: typeof window !== 'undefined' ? `${window.location.origin}/sso/callback` : '/sso/callback',

      });

      if (res.success && res.data) {
        setTokenData(res.data);
      } else if (res.access_token) {
        // Direct OAuth2 response format
        setTokenData(res);
      } else {
        setError(res.error?.message || 'Token exchange failed.');
      }
      setLoading(false);
    }

    performExchange();
  }, [code]);

  async function handleIntrospect() {
    if (!tokenData?.access_token) return;
    setIntrospectLoading(true);

    const res = await api.introspectToken(tokenData.access_token);
    setIntrospectResult(res);
    setIntrospectLoading(false);
  }

  return (
    <div className="max-w-2xl mx-auto my-8 space-y-6">
      {/* Callback Status Header */}
      <div className="bento-card p-6 border-border flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Mitra App SSO Callback</h2>
            <p className="text-xs text-gray-400 font-mono">Nodes 34 — 39: Token Exchange Complete</p>
          </div>
        </div>
        <Link
          href="/"
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-card hover:bg-border text-xs text-gray-300 border border-border"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>System Hub</span>
        </Link>
      </div>

      {loading ? (
        <div className="bento-card p-12 text-center space-y-4">
          <RefreshCw className="w-8 h-8 text-primary-400 animate-spin mx-auto" />
          <p className="text-xs text-gray-400">Menukar Authorization Code menjadi Access Token & ID Token...</p>
        </div>
      ) : error ? (
        <div className="bento-card p-8 border-crimson-500/30 text-center space-y-4">
          <div className="text-crimson-400 font-bold text-base">Token Exchange Error</div>
          <p className="text-xs text-gray-400">{error}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Tokens Card */}
          <div className="bento-card p-6 space-y-4 border-emerald-500/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center space-x-2">
                <KeyRound className="w-4 h-4 text-emerald-400" />
                <span>Issued Access Token & ID Token</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Expires in: {tokenData?.expires_in || 3600}s
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">Access Token (Bearer)</label>
                <div className="p-3 rounded-xl bg-background/80 border border-border text-primary-300 break-all text-[11px]">
                  {tokenData?.access_token}
                </div>
              </div>

              {tokenData?.id_token && (
                <div>
                  <label className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">ID Token (OIDC Claims)</label>
                  <div className="p-3 rounded-xl bg-background/80 border border-border text-cyan-300 break-all text-[11px]">
                    {tokenData?.id_token}
                  </div>
                </div>
              )}
            </div>

            {/* Test Introspection (Node 40-44) */}
            <div className="pt-3 border-t border-border flex items-center justify-between">
              <button
                onClick={handleIntrospect}
                disabled={introspectLoading}
                className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold flex items-center space-x-2"
              >
                {introspectLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
                <span>Uji Token Introspection (/oauth/introspect)</span>
              </button>
            </div>

            {introspectResult && (
              <div className="p-4 rounded-xl bg-background border border-primary-500/30 space-y-2 font-mono text-xs">
                <div className="text-xs font-bold text-white">Introspection Result (Nodes 40 — 44):</div>
                <pre className="text-[11px] text-gray-300 overflow-x-auto">
                  {JSON.stringify(introspectResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SSOCallbackPage() {
  return (
    <Suspense fallback={
      <div className="max-w-md mx-auto my-12 bento-card p-8 text-center space-y-4">
        <div className="w-8 h-8 rounded-full border-2 border-primary-500 border-t-transparent animate-spin mx-auto"></div>
        <p className="text-xs text-gray-400 font-mono">Memproses Otorisasi OAuth...</p>
      </div>
    }>
      <SSOCallbackContent />
    </Suspense>
  );
}

