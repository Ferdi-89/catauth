'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Play, ShieldAlert, AlertTriangle, CheckCircle2, Zap, Server } from 'lucide-react';
import { api } from '../../../lib/api';
import { DLQWebhook, CircuitBreakerStatus } from '../../../lib/types';

export default function AdminDLQPage() {
  const [dlqItems, setDlqItems] = useState<DLQWebhook[]>([]);
  const [circuitBreakers, setCircuitBreakers] = useState<CircuitBreakerStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [replaying, setReplaying] = useState(false);
  const [replayLog, setReplayLog] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    const [dlqRes, cbRes] = await Promise.all([
      api.listDLQ(),
      api.listCircuitBreakers(),
    ]);

    if (dlqRes.success && dlqRes.data) {
      setDlqItems(dlqRes.data);
    }
    if (cbRes.success && cbRes.data) {
      setCircuitBreakers(cbRes.data);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleReplay(dlqId?: string) {
    setReplaying(true);
    setReplayLog(null);
    const res = await api.replayDLQ(dlqId);
    setReplaying(false);

    if (res.success && res.data) {
      setReplayLog(
        `Job Selesai: ${res.data.total_replayed} pesan diproses (${res.data.succeeded} berhasil, ${res.data.failed} ditahan).`
      );
      loadData();
    } else {
      setReplayLog(`Error: ${res.error?.message}`);
    }
  }

  async function handleOverrideBreaker(clientId: string, state: 'CLOSED' | 'OPEN' | 'HALF_OPEN') {
    const res = await api.overrideCircuitBreaker(clientId, state);
    if (res.success) {
      loadData();
    }
  }

  const pendingCount = dlqItems.filter((i) => i.status === 'PENDING').length;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white tracking-tight">Dead-Letter Queue (DLQ) & Reconciler</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
              Nodes 70, 71, 72
            </span>
          </div>
          <p className="text-xs text-gray-400">Inspeksi event webhook tertahan, pemantauan Prometheus lag alert, dan automated replay reconciliation.</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleReplay()}
            disabled={replaying || pendingCount === 0}
            className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-lg shadow-primary-500/20"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{replaying ? 'Memutar Ulang...' : 'Putar Ulang Seluruh DLQ'}</span>
          </button>

          <button
            onClick={loadData}
            className="p-2 rounded-xl bg-card hover:bg-border text-gray-300 border border-border text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Prometheus Lag Alert Banner (Node 71) */}
      {pendingCount >= 5 && (
        <div className="bento-card p-4 border-crimson-500/50 bg-crimson-500/10 text-crimson-300 flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-crimson-400 animate-pulse" />
            <span>
              PROMETHEUS ALERT TRIGGERED: Antrean DLQ memiliki {pendingCount} pesan tertahan (Melampaui ambang batas 5).
            </span>
          </div>
          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-crimson-500/20 border border-crimson-500/30">
            Node 71: Prometheus Alert
          </span>
        </div>
      )}

      {replayLog && (
        <div className="bento-card p-3 text-xs font-mono bg-primary-500/10 border-primary-500/30 text-primary-300">
          {replayLog}
        </div>
      )}

      {/* Circuit Breaker Control Card (Node 64) */}
      <div className="bento-card p-6 space-y-4 border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Kendali PyBreaker Circuit Breaker</h3>
          </div>
          <span className="text-[10px] font-mono text-gray-400">Node 64: Closed / Open / Half-Open</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {circuitBreakers.map((cb) => (
            <div key={cb.name} className="p-4 rounded-xl bg-background/60 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-200 font-mono">{cb.name}</span>
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

              <div className="pt-2 border-t border-border flex items-center space-x-2">
                <span className="text-[10px] text-gray-500">Override:</span>
                <button
                  onClick={() => handleOverrideBreaker(cb.name.replace('webhook_', ''), 'CLOSED')}
                  className="px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[10px] border border-emerald-500/20"
                >
                  CLOSED (Sehat)
                </button>
                <button
                  onClick={() => handleOverrideBreaker(cb.name.replace('webhook_', ''), 'OPEN')}
                  className="px-2 py-1 rounded bg-crimson-500/10 hover:bg-crimson-500/20 text-crimson-300 text-[10px] border border-crimson-500/20"
                >
                  OPEN (Trip Aktif)
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* DLQ Messages List (Node 70) */}
      <div className="bento-card p-6 space-y-4 border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Server className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-bold text-white">Daftar Pesan Dead-Letter Queue ({dlqItems.length})</h3>
          </div>
          <span className="text-[10px] font-mono text-gray-400">Node 70: Table dlq_webhooks</span>
        </div>

        {dlqItems.length === 0 ? (
          <div className="text-center py-12 text-xs text-gray-400 font-mono space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <p>DLQ bersih! Tidak ada webhook revokasi yang tertahan.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dlqItems.map((item) => (
              <div key={item.id} className="p-4 rounded-xl bg-background/60 border border-border text-xs space-y-2 font-mono">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white">{item.client_id}</span>
                    <span className="text-gray-500">→</span>
                    <span className="text-cyan-300 truncate max-w-sm">{item.target_url}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      item.status === 'PENDING' ? 'bg-crimson-500/20 text-crimson-400 border border-crimson-500/30' :
                      'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {item.status}
                    </span>
                    {item.status === 'PENDING' && (
                      <button
                        onClick={() => handleReplay(item.id)}
                        disabled={replaying}
                        className="px-2.5 py-1 rounded bg-primary-600 hover:bg-primary-500 text-white text-[11px] font-semibold"
                      >
                        Replay
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-[11px] text-rose-400">
                  Last Error: {item.last_error || 'Timeout after 3 attempts'}
                </div>

                <div className="text-[10px] text-gray-500 flex items-center justify-between pt-1 border-t border-border/50">
                  <span>Retries: {item.retry_count} / 3</span>
                  <span>Waktu: {item.created_at ? new Date(item.created_at).toLocaleString() : '-'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
