'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  Activity, Shield, Users, Server, Globe, RefreshCw, 
  AlertTriangle, CheckCircle2, XCircle, Zap, Ban, Play, ArrowUpRight, ShieldAlert,
  Link2, Key, ExternalLink, Filter
} from 'lucide-react';
import { api } from '../../../lib/api';
import { DashboardTelemetry, CircuitBreakerStatus, AuditLog, ProtectedLink } from '../../../lib/types';

function AdminDashboardContent() {
  const searchParams = useSearchParams();
  const initialLinkId = searchParams.get('link_id') || 'all';

  const [loading, setLoading] = useState(true);
  const [selectedLinkId, setSelectedLinkId] = useState<string>(initialLinkId);
  const [links, setLinks] = useState<ProtectedLink[]>([]);
  const [metrics, setMetrics] = useState<any | null>(null);
  const [circuitBreakers, setCircuitBreakers] = useState<CircuitBreakerStatus[]>([]);
  const [revokeUserId, setRevokeUserId] = useState('');
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeFeedback, setRevokeFeedback] = useState<string | null>(null);
  const [dlqReplaying, setDlqReplaying] = useState(false);

  // Fetch telemetry and circuit breakers
  async function loadData() {
    setLoading(true);
    const [dashRes, cbRes, linksRes] = await Promise.all([
      api.getDashboardTelemetry(selectedLinkId),
      api.listCircuitBreakers(),
      api.listProtectedLinks(),
    ]);

    if (dashRes.success && dashRes.data) {
      setMetrics(dashRes.data);
    }
    if (cbRes.success && cbRes.data) {
      setCircuitBreakers(cbRes.data);
    }
    if (linksRes.success && linksRes.data) {
      setLinks(linksRes.data);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // Polling dashboard every 5s
    return () => clearInterval(interval);
  }, [selectedLinkId]);

  // Handle Immediate Revocation (Nodes 59-63)
  async function handleRevoke(e: React.FormEvent) {
    e.preventDefault();
    if (!revokeUserId) return;
    setRevokeLoading(true);
    setRevokeFeedback(null);

    const res = await api.revokeSession({
      user_id: revokeUserId,
      reason: 'Security Incident / Admin Manual Revocation',
    });

    setRevokeLoading(false);
    if (res.success) {
      setRevokeFeedback(res.message || 'Session successfully revoked & WAL CDC outbox event emitted.');
      setRevokeUserId('');
      loadData();
    } else {
      setRevokeFeedback(`Error: ${res.error?.message}`);
    }
  }

  // Handle DLQ Replay (Node 72)
  async function handleDLQReplay() {
    setDlqReplaying(true);
    const res = await api.replayDLQ();
    setDlqReplaying(false);
    if (res.success) {
      alert(`DLQ Reconciled: ${res.data?.total_replayed} replayed successfully.`);
      loadData();
    }
  }

  const selectedLinkObj = links.find((l) => l.id === selectedLinkId);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Link Filter */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black tracking-tight text-white">Admin Telemetry Bento Grid</h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-800">
              Live Monitoring
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Pantau metrik otentikasi NFC, alur CDC WAL, status sirkuit, dan audit log secara terpusat atau per-Protected Link.
          </p>
        </div>

        {/* Link Filter & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Protected Link Dropdown Selector */}
          <div className="flex items-center space-x-2 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-md">
            <Filter className="w-3.5 h-3.5 text-neutral-400" />
            <select
              value={selectedLinkId}
              onChange={(e) => setSelectedLinkId(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none cursor-pointer font-sans"
            >
              <option value="all" className="bg-black text-white">Semua Protected Link (Global)</option>
              {links.map((link) => (
                <option key={link.id} value={link.id} className="bg-black text-white">
                  {link.title} ({link.slug})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={loadData}
            className="p-2 rounded-md bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition-colors text-xs flex items-center space-x-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>

          <Link
            href="/admin/links"
            className="px-3 py-1.5 rounded-md bg-white text-black font-medium text-xs hover:bg-neutral-200 transition-colors flex items-center space-x-1.5"
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Kelola Link</span>
          </Link>
        </div>
      </div>

      {/* Selected Link Context Banner */}
      {selectedLinkObj && (
        <div className="bento-card p-4 border-neutral-800 bg-neutral-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            <div>
              <span className="text-neutral-400 font-mono">Memantau Link: </span>
              <strong className="text-white">{selectedLinkObj.title}</strong>
              <span className="text-neutral-500 font-mono ml-2">({selectedLinkObj.id})</span>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-neutral-400 font-mono">
            <span>Target: <span className="text-cyan-300">{selectedLinkObj.target_redirect_url}</span></span>
            <Link
              href={`/sso/login?link_id=${selectedLinkObj.id}`}
              target="_blank"
              className="text-white hover:underline flex items-center space-x-1"
            >
              <span>Uji Gateway</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      {/* Row 1: KPI Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Authentications */}
        <div className="bento-card p-5 space-y-2 border-neutral-800">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-mono">
            <span>TOTAL NFC TAPS</span>
            <Activity className="w-4 h-4 text-white" />
          </div>
          <div className="text-3xl font-extrabold text-white tracking-tight font-mono">
            {metrics?.total_authentications ?? 0}
          </div>
          <div className="text-[11px] text-neutral-500">
            {selectedLinkId === 'all' ? 'Akumulasi seluruh link aktif' : `Akses pada ${selectedLinkObj?.title || 'link ini'}`}
          </div>
        </div>

        {/* Metric 2: Success Rate */}
        <div className="bento-card p-5 space-y-2 border-neutral-800">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-mono">
            <span>PASS RATE</span>
            <Shield className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 tracking-tight font-mono">
            {metrics?.success_rate ?? 100}%
          </div>
          <div className="text-[11px] text-emerald-500/80">
            {metrics?.success_authentications ?? 0} kartu berhasil lolos verifikasi
          </div>
        </div>

        {/* Metric 3: Blocked / Anomalies */}
        <div className="bento-card p-5 space-y-2 border-neutral-800">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-mono">
            <span>BLOCKED & ANOMALIES</span>
            <ShieldAlert className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-3xl font-extrabold text-red-400 tracking-tight font-mono">
            {metrics?.failed_authentications ?? 0}
          </div>
          <div className="text-[11px] text-red-400/80">
            Kartu unwhitelisted, kloning, atau dicabut
          </div>
        </div>

        {/* Metric 4: Active Sessions */}
        <div className="bento-card p-5 space-y-2 border-neutral-800">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-mono">
            <span>ACTIVE SESSIONS</span>
            <Users className="w-4 h-4 text-white" />
          </div>
          <div className="text-3xl font-extrabold text-white tracking-tight font-mono">
            {metrics?.active_sessions ?? 0}
          </div>
          <div className="text-[11px] text-neutral-500">
            Distributed Singleflight Lock Active
          </div>
        </div>
      </div>

      {/* Row 2: GeoIP Distribution & Operational Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Geographic & Invariant Health */}
        <div className="lg:col-span-2 space-y-6">
          {/* GeoIP Distribution Card */}
          <div className="bento-card p-6 space-y-4 border-neutral-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-white" />
                <h3 className="text-sm font-bold text-white">Geographic Traffic Distribution</h3>
              </div>
              <span className="text-xs font-mono text-neutral-500">MaxMind GeoIP2</span>
            </div>

            <div className="space-y-3">
              {metrics?.countries.map((c: any) => {
                const total = metrics.total_authentications || 1;
                const pct = Math.min(100, Math.round((c.count / total) * 100));
                return (
                  <div key={c.country} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-neutral-300 font-bold">{c.country}</span>
                      <span className="text-neutral-500">{c.count} taps ({pct}%)</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-neutral-900 overflow-hidden">
                      <div
                        className="h-full bg-white transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right 1 Col: Circuit Breakers & Emergency Revocation */}
        <div className="space-y-6">
          {/* Circuit Breakers Card */}
          <div className="bento-card p-6 space-y-4 border-neutral-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">PyBreaker Webhooks</h3>
              </div>
              <span className="text-[10px] font-mono text-neutral-500">Automated Circuit</span>
            </div>

            <div className="space-y-2.5">
              {circuitBreakers.map((cb) => (
                <div key={cb.name} className="p-3 rounded-md bg-neutral-950 border border-neutral-800/80 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-neutral-300 truncate max-w-[140px]">{cb.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                      cb.state === 'CLOSED' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40' :
                      cb.state === 'OPEN' ? 'bg-red-950/60 text-red-400 border border-red-800/40' :
                      'bg-amber-950/60 text-amber-400 border border-amber-800/40'
                    }`}>
                      {cb.state}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-neutral-500 flex items-center justify-between">
                    <span>Failures: {cb.failure_count}/{cb.fail_max}</span>
                    <span>Reset: {cb.reset_timeout_seconds}s</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Immediate Revocation Form */}
          <div className="bento-card p-6 space-y-4 border-neutral-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Ban className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-bold text-white">Pencabutan Sesi (CDC)</h3>
              </div>
              <span className="text-[10px] font-mono text-neutral-500">Outbox Event</span>
            </div>

            <form onSubmit={handleRevoke} className="space-y-2.5">
              <input
                type="text"
                value={revokeUserId}
                onChange={(e) => setRevokeUserId(e.target.value)}
                placeholder="User ID / Session Token..."
                className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800 text-xs text-white focus:outline-none font-mono"
              />
              <button
                type="submit"
                disabled={revokeLoading || !revokeUserId}
                className="w-full py-2 rounded bg-red-950/80 hover:bg-red-900 border border-red-800/60 disabled:opacity-50 text-red-200 text-xs font-semibold transition-colors flex items-center justify-center space-x-1.5"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>{revokeLoading ? 'Memproses Revokasi WAL...' : 'Cabut Akses Seketika'}</span>
              </button>
            </form>

            {revokeFeedback && (
              <div className="text-[11px] text-neutral-300 font-mono bg-neutral-900 p-2 rounded border border-neutral-800">
                {revokeFeedback}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Real-time Audit Logs Stream Filtered per Link */}
      <div className="bento-card p-6 space-y-4 border-neutral-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-white" />
            <h3 className="text-sm font-bold text-white">
              Live Security Audit & Telemetry Stream {selectedLinkObj ? `— [${selectedLinkObj.title}]` : ''}
            </h3>
          </div>
          <span className="text-xs font-mono text-neutral-500">
            {metrics?.recent_logs?.length ?? 0} Real-time Events
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-neutral-500 border-b border-neutral-800 text-[11px]">
                <th className="pb-3 font-medium">Event Type</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Link Target</th>
                <th className="pb-3 font-medium">Hardware Card</th>
                <th className="pb-3 font-medium">IP & Region</th>
                <th className="pb-3 font-medium">Waktu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900">
              {metrics?.recent_logs?.map((log: any) => (
                <tr key={log.id} className="hover:bg-neutral-900/40 transition-colors">
                  <td className="py-2.5 font-bold text-neutral-200">{log.event_type}</td>
                  <td className="py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      log.status === 'SUCCESS' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40' :
                      log.status === 'SECURITY_BLOCKED' ? 'bg-red-950/60 text-red-400 border border-red-800/40' :
                      'bg-amber-950/60 text-amber-400 border border-amber-800/40'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-neutral-300">{log.link_title || log.client_id || '-'}</td>
                  <td className="py-2.5 text-neutral-400">{log.card_label || log.card_id || 'Hardware Token'}</td>
                  <td className="py-2.5 text-neutral-400">{log.ip_address} ({log.country || 'ID'})</td>
                  <td className="py-2.5 text-neutral-500">{log.created_at ? new Date(log.created_at).toLocaleTimeString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={
      <div className="bento-card p-12 text-center border-neutral-800 space-y-4">
        <div className="w-8 h-8 rounded-full border-2 border-white border-t-transparent animate-spin mx-auto"></div>
        <p className="text-xs text-neutral-400 font-mono">Memuat Dashboard Telemetry...</p>
      </div>
    }>
      <AdminDashboardContent />
    </Suspense>
  );
}
