import React from 'react';
import Link from 'next/link';
import { 
  ShieldCheck, Radio, Activity, GitGraph, Zap, 
  Lock, ArrowRight, RefreshCw, Cpu, Server, KeyRound, Check
} from 'lucide-react';

export default function HomePage() {
  const PILLARS = [
    {
      title: 'WebAuthn / FIDO2 NFC',
      description: 'Strict RP origin binding & static zero sign_count counter anti-cloning tolerance.',
      tag: 'Node 1 — 33',
      href: '/sso/login?client_id=client_portal_alpha&redirect_uri=http://localhost:3000/sso/callback&state=demo_state_123',
    },
    {
      title: 'Edge Ingress Rate Limiting',
      description: 'Token Bucket rate limiter (10 req/s, burst 20) with Envoy proxy DDoS protection.',
      tag: 'Node 7',
      href: '/simulator',
    },
    {
      title: 'Atomic Nonce Anti-Replay',
      description: 'Single-step Redis GETDEL challenge consumption eliminating replay attacks.',
      tag: 'Node 13 & 14',
      href: '/simulator',
    },
    {
      title: 'Singleflight Dead-Man Lock',
      description: 'Distributed mutex (1500ms TTL) with jittered backoff preventing DB cache stampedes.',
      tag: 'Node 43 & 44',
      href: '/simulator',
    },
    {
      title: 'Supavisor Unit-of-Work RLS',
      description: 'Explicit BEGIN...SET LOCAL tenant_id...COMMIT isolation for poolers.',
      tag: 'Node 29 & 50',
      href: '/admin/clients',
    },
    {
      title: 'Postgres WAL CDC & DLQ',
      description: 'Zero-polling logical replication outbox with PyBreaker & automated replay.',
      tag: 'Node 59 — 72',
      href: '/admin/dlq',
    },
  ];

  return (
    <div className="space-y-16 py-8">
      {/* Vercel-Style Hero Section */}
      <section className="text-center space-y-6 max-w-3xl mx-auto pt-6">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-xs font-mono text-neutral-300">
          <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
          <span>Margaret Architecture Blueprint v0.3.0</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
          High-Performance NFC Auth & Telemetry Gateway
        </h1>

        <p className="text-base sm:text-lg text-neutral-400 max-w-2xl mx-auto leading-relaxed">
          Zero-trust FIDO2 NFC authentication engine with Edge Proxy rate limiting, atomic nonce consumption, Redis Singleflight distributed locking, and WAL CDC event outbox.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/sso/login?client_id=client_portal_alpha&redirect_uri=http://localhost:3000/sso/callback&state=demo_state_123"
            className="px-6 py-2.5 rounded-md bg-white text-black font-medium text-sm hover:bg-neutral-200 transition-colors inline-flex items-center space-x-2"
          >
            <span>Launch SSO Gateway</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            href="/admin/topology"
            className="px-6 py-2.5 rounded-md bg-neutral-950 text-neutral-200 border border-neutral-800 font-medium text-sm hover:bg-neutral-900 hover:border-neutral-700 transition-colors inline-flex items-center space-x-2"
          >
            <span>Explore 72-Node Graph</span>
          </Link>
        </div>
      </section>

      {/* Architecture Pillars Grid */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight uppercase">Core Architectural Pillars</h2>
            <p className="text-xs text-neutral-400">Formal security invariants enforced across all 72 workflow graph nodes.</p>
          </div>
          <Link href="/admin/topology" className="text-xs text-neutral-400 hover:text-white font-mono flex items-center space-x-1">
            <span>View All Nodes</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PILLARS.map((p) => (
            <Link
              key={p.title}
              href={p.href}
              className="bento-card p-6 flex flex-col justify-between group cursor-pointer"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-neutral-400 px-2 py-0.5 rounded bg-neutral-950 border border-neutral-800">
                    {p.tag}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-neutral-600 group-hover:text-white transition-colors" />
                </div>
                <h3 className="text-base font-semibold text-white tracking-tight">
                  {p.title}
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  {p.description}
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-neutral-900 flex items-center text-[11px] font-mono text-neutral-500">
                <Check className="w-3.5 h-3.5 text-white mr-1.5" />
                <span>Verified by Automated Test Suite</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Quick Access Matrix */}
      <section className="bento-card p-8 border border-border">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
          <div className="space-y-2">
            <div className="font-semibold text-white">Live Admin Telemetry</div>
            <p className="text-neutral-400">Monitor real-time throughput, active FIDO2 sessions, Prometheus metrics, and global access map.</p>
            <Link href="/admin/dashboard" className="text-white hover:underline inline-block pt-1">
              Open Dashboard &rarr;
            </Link>
          </div>

          <div className="space-y-2">
            <div className="font-semibold text-white">Attack Simulator Playground</div>
            <p className="text-neutral-400">Execute replay nonce bursts, cloned token injections, and distributed singleflight mutex tests live.</p>
            <Link href="/simulator" className="text-white hover:underline inline-block pt-1">
              Open Sandbox &rarr;
            </Link>
          </div>

          <div className="space-y-2">
            <div className="font-semibold text-white">DLQ Replay Center</div>
            <p className="text-neutral-400">Inspect failed webhook payloads, PyBreaker circuit breaker trip states, and trigger reconciliations.</p>
            <Link href="/admin/dlq" className="text-white hover:underline inline-block pt-1">
              Open Reconciler &rarr;
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
