'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Activity, Shield, Users, Server, Globe, RefreshCw, 
  AlertTriangle, CheckCircle2, XCircle, Zap, Ban, Play, ArrowUpRight, ShieldAlert 
} from 'lucide-react';
import { api } from '../../../lib/api';
import { DashboardTelemetry, CircuitBreakerStatus, AuditLog } from '../../../lib/types';

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardTelemetry | null>(null);
  const [circuitBreakers, setCircuitBreakers] = useState<CircuitBreakerStatus[]>([]);
  const [revokeUserId, setRevokeUserId] = useState('');
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeFeedback, setRevokeFeedback] = useState<string | null>(null);
  const [dlqReplaying, setDlqReplaying] = useState(false);

  // Fetch telemetry and circuit breakers
  async function loadData() {
    setLoading(true);
    const [dashRes, cbRes] = await Promise.all([
      api.getDashboardTelemetry(),
      api.listCircuitBreakers(),
    ]);

    if (dashRes.success && dashRes.data) {
      setMetrics(dashRes.data);
    }
    if (cbRes.success && cbRes.data) {
      setCircuitBreakers(cbRes.data);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // Polling dashboard every 5s
    return () => clearInterval(interval);
  }, []);

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
      alert(`DLQ Reconciled: ${res.data?.succeeded} succeeded, ${res.data?.failed} failed.`);
      loadData();
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black tracking-tight text-white">Admin Telemetry Bento Grid</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary-500/20 text-primary-300 border border-primary-500/30">
              Node 48: Bento UI
            </span>
          </div>
          <p className="text-xs text-gray-400">Live operational status, telemetry metrics, circuit breakers, and CDC pipeline.</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={loadData}
            className="p-2 rounded-xl bg-card hover:bg-border text-gray-300 border border-border transition-colors text-xs flex items-center space-x-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>
          <Link
            href="/admin/topology"
            className="px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold flex items-center space-x-1.5"
          >
            <span>72-Node Graph Visualizer</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Bento Grid Top Row: 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Authentications */}
        <div className="bento-card p-5 space-y-2 border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">Total Otentikasi</span>
            <div className="w-8 h-8 rounded-lg bg-primary-500/10 text-primary-400 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {metrics?.total_authentications ?? 0}
          </div>
          <div className="text-[11px] text-gray-400 flex items-center space-x-2">
            <span className="text-emerald-400 font-mono font-medium">{metrics?.success_authentications ?? 0} Berhasil</span>
            <span>•</span>
            <span className="text-crimson-400 font-mono font-medium">{metrics?.failed_authentications ?? 0} Gagal</span>
          </div>
        </div>

        {/* Success Rate */}
        <div className="bento-card p-5 space-y-2 border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">Success Rate</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">
            {metrics?.success_rate ?? 100}%
          </div>
          <div className="text-[11px] text-gray-400">
            Strict RP & Anti-Cloning Invariant Active
          </div>
        </div>

        {/* Active Sessions */}
        <div className="bento-card p-5 space-y-2 border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">Sesi Aktif (Redis & DB)</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-cyan-300 font-mono">
            {metrics?.active_sessions ?? 0}
          </div>
          <div className="text-[11px] text-gray-400">
            Redis In-Memory Key Store Synced
          </div>
        </div>

        {/* DLQ Pending Alert (Node 71) */}
        <div className={`bento-card p-5 space-y-2 border ${
          (metrics?.dlq_pending_count || 0) > 0 ? 'border-crimson-500/40 bg-crimson-500/5' : 'border-border'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">DLQ Pending Webhooks</span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-mono flex items-center space-x-2">
            <span>{metrics?.dlq_pending_count ?? 0}</span>
            {(metrics?.dlq_pending_count || 0) >= 5 && (
              <span className="text-xs font-sans font-bold px-2 py-0.5 rounded bg-crimson-500 text-white animate-pulse">
                LAG ALERT!
              </span>
            )}
          </div>
          <div className="text-[11px] text-gray-400 flex items-center justify-between">
            <span>Prometheus Threshold: 5</span>
            {(metrics?.dlq_pending_count || 0) > 0 && (
              <button
                onClick={handleDLQReplay}
                disabled={dlqReplaying}
                className="text-primary-400 hover:underline font-semibold"
              >
                Replay DLQ
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Middle Bento Row: Global Access Map + Circuit Breakers & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Global Access Map & Country Distribution (Node 55) */}
        <div className="bento-card p-6 lg:col-span-2 space-y-4 border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white">Layar Telemetri & Peta Akses Global</h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              Node 55: Live GeoIP
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {metrics?.countries.map((c) => (
              <div key={c.country} className="p-3 rounded-xl bg-background/60 border border-border flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                  <span className="font-semibold text-gray-200">Region {c.country}</span>
                </div>
                <span className="font-mono text-cyan-300 font-bold">{c.count} logins</span>
              </div>
            ))}
            {(!metrics?.countries || metrics.countries.length === 0) && (
              <div className="text-xs text-gray-500 font-mono py-4">Belum ada sebaran wilayah login.</div>
            )}
          </div>

          <div className="p-4 rounded-xl bg-background/40 border border-border/50 text-xs text-gray-400 flex items-center justify-between">
            <span>Unit-of-Work Supavisor SET LOCAL Tenant RLS Active</span>
            <span className="text-emerald-400 font-mono">Zero Bleeding Verified</span>
          </div>
        </div>

        {/* Circuit Breakers & Instant Revocation Action (Nodes 59-64) */}
        <div className="bento-card p-6 space-y-5 border border-border flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Status Circuit Breakers</h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                Node 64
              </span>
            </div>

            {/* Circuit Breaker States */}
            <div className="space-y-2">
              {circuitBreakers.map((cb) => (
                <div key={cb.name} className="p-3 rounded-xl bg-background/60 border border-border text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium text-gray-300">{cb.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                      cb.state === 'CLOSED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      cb.state === 'OPEN' ? 'bg-crimson-500/20 text-crimson-400 border border-crimson-500/30' :
                      'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}>
                      {cb.state}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 flex items-center justify-between">
                    <span>Failures: {cb.failure_count}/{cb.fail_max}</span>
                    <span>Reset: {cb.reset_timeout_seconds}s</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Immediate Revocation Form (Node 59 & 60) */}
          <div className="space-y-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                <Ban className="w-3.5 h-3.5 text-crimson-400" />
                <span>Pencabutan Sesi Seketika</span>
              </span>
              <span className="text-[10px] font-mono text-gray-400">Node 59 & 60</span>
            </div>

            <form onSubmit={handleRevoke} className="space-y-2">
              <input
                type="text"
                value={revokeUserId}
                onChange={(e) => setRevokeUserId(e.target.value)}
                placeholder="User ID / Session ID..."
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-white focus:outline-none focus:border-crimson-500"
              />
              <button
                type="submit"
                disabled={revokeLoading || !revokeUserId}
                className="w-full py-2 rounded-lg bg-crimson-600 hover:bg-crimson-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center justify-center space-x-1.5"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>{revokeLoading ? 'Memproses Revokasi WAL...' : 'Cabut Akses Seketika'}</span>
              </button>
            </form>

            {revokeFeedback && (
              <div className="text-[11px] text-primary-300 font-mono bg-primary-500/10 p-2 rounded border border-primary-500/20">
                {revokeFeedback}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Bento Row: Real-time Audit Logs Stream (Node 28 & 56) */}
      <div className="bento-card p-6 space-y-4 border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Live Security Audit & Telemetry Stream</h3>
          </div>
          <span className="text-xs font-mono text-gray-400">Node 28: Audit Log Table (SET LOCAL)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-gray-400 border-b border-border text-[11px]">
                <th className="pb-3 font-medium">Event Type</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Client ID</th>
                <th className="pb-3 font-medium">IP & Region</th>
                <th className="pb-3 font-medium">Browser / OS</th>
                <th className="pb-3 font-medium">Waktu (UTC)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {metrics?.recent_logs.map((log) => (
                <tr key={log.id} className="hover:bg-background/40 transition-colors">
                  <td className="py-2.5 font-bold text-gray-200">{log.event_type}</td>
                  <td className="py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      log.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      log.status === 'BLOCKED' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      'bg-crimson-500/10 text-crimson-400 border border-crimson-500/20'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-gray-400">{log.client_id || '-'}</td>
                  <td className="py-2.5 text-gray-300">{log.ip_address} ({log.country || 'ID'})</td>
                  <td className="py-2.5 text-gray-400">{log.browser} / {log.os_name || 'OS'}</td>
                  <td className="py-2.5 text-gray-500">{log.created_at ? new Date(log.created_at).toLocaleTimeString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
