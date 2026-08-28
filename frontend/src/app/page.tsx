import React from 'react';
import Link from 'next/link';
import {
  ShieldCheck, Radio, Activity, GitGraph, Zap,
  Lock, ArrowRight, RefreshCw, Cpu, Server, KeyRound, Check,
  BookOpen, Code2, Link2, Key, Globe, Shield, Terminal
} from 'lucide-react';

export default function HomePage() {
  const PILLARS = [
    {
      title: 'WebAuthn / FIDO2 NFC Gateway',
      description: 'Zero-trust hardware NFC tap (e-Money, Flazz, e-KTP, YubiKey) dengan anti-cloning zero sign_count.',
      tag: 'Gateway & SSO',
      href: '/sso/login?client_id=client_portal_alpha&redirect_uri=/sso/callback&state=demo_state_123',
    },
    {
      title: 'Universal Embed API & SDK',
      description: 'Pasang 1 baris kode HTML atau panggil REST API untuk mengamankan website luar via NFC login.',
      tag: 'Embed & REST API',
      href: '/admin/embed',
    },
    {
      title: 'Protected Links & Whitelisting',
      description: 'Hubungkan URL target ke whitelist kartu fisik tertentu. Hanya kartu terdaftar yang dapat lolos.',
      tag: 'Access Control',
      href: '/admin/links',
    },
    {
      title: 'Hardware NFC & Account Vault',
      description: 'Ikatkan kartu fisik ke data akun (Nama, Email, Role) dengan auto-rehydration Supabase.',
      tag: 'User Identity',
      href: '/admin/keys',
    },
    {
      title: 'Real-time Telemetry & Logs',
      description: 'Live monitoring audit trail, status circuit breaker PyBreaker, dan GeoIP traffic distribution.',
      tag: 'Telemetry & CDC',
      href: '/admin/dashboard',
    },
    {
      title: 'Interactive 72-Node Topology',
      description: 'Visualisasi interaktif 72 workflow node arsitektur Margaret Blueprint dari edge hingga CDC outbox.',
      tag: 'Margaret Engine',
      href: '/admin/topology',
    },
  ];

  return (
    <div className="space-y-16 py-8">
      {/* Vercel-Style Hero Section */}
      <section className="text-center space-y-6 max-w-3xl mx-auto pt-6">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-xs font-mono text-neutral-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Catauth Sovereign Identity v1.0 • Margaret Architecture</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
          Sovereign NFC Auth & Telemetry Gateway
        </h1>

        <p className="text-base sm:text-lg text-neutral-400 max-w-2xl mx-auto leading-relaxed">
          Platform otentikasi zero-trust berbasis kartu fisik NFC (e-Money / Flazz / e-KTP / YubiKey) dengan perlindungan anti-cloning, Singleflight distributed locking, dan REST API embed instan.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/sso/login?client_id=client_portal_alpha&redirect_uri=/sso/callback&state=demo_state_123"
            className="px-6 py-2.5 rounded-md bg-white text-black font-semibold text-sm hover:bg-neutral-200 transition-colors inline-flex items-center space-x-2 shadow-lg"
          >
            <Cpu className="w-4 h-4" />
            <span>Uji Gateway SSO NFC</span>
          </Link>

          <Link
            href="/admin/embed"
            className="px-6 py-2.5 rounded-md bg-neutral-900 text-cyan-300 border border-cyan-800/60 font-medium text-sm hover:bg-neutral-800 transition-colors inline-flex items-center space-x-2"
          >
            <Code2 className="w-4 h-4" />
            <span>Dokumentasi Embed API</span>
          </Link>

          <Link
            href="/admin/dashboard"
            className="px-6 py-2.5 rounded-md bg-neutral-950 text-neutral-200 border border-neutral-800 font-medium text-sm hover:bg-neutral-900 hover:border-neutral-700 transition-colors inline-flex items-center space-x-2"
          >
            <Activity className="w-4 h-4" />
            <span>Admin Telemetry</span>
          </Link>
        </div>
      </section>

      {/* 4-Step Quick Flow Banner */}
      <section className="bento-card p-6 sm:p-8 border-neutral-800 bg-neutral-950/60 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-neutral-900 pb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span>Alur Penggunaan Sistem Catauth (Standard Workflow)</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Dari pendaftaran kartu fisik hingga verifikasi login dan telemetri real-time.
            </p>
          </div>
          <Link
            href="/admin/embed"
            className="text-xs font-mono text-cyan-400 hover:underline flex items-center space-x-1"
          >
            <span>Buka Petunjuk Integrasi</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1 */}
          <div className="p-4 rounded-xl bg-black border border-neutral-800 space-y-2">
            <span className="text-[11px] font-mono text-cyan-400 font-bold">01. BINDING</span>
            <h3 className="text-sm font-bold text-white">Daftarkan Kartu NFC</h3>
            <p className="text-xs text-neutral-400">
              Tap kartu fisik di HP untuk mendaftarkan UID dan mengaitkannya ke Nama, Email, & Role.
            </p>
            <Link href="/admin/keys" className="text-[11px] text-neutral-300 hover:text-white font-mono inline-flex items-center space-x-1 pt-1">
              <span>Ke Menu Keys</span> &rarr;
            </Link>
          </div>

          {/* 2 */}
          <div className="p-4 rounded-xl bg-black border border-neutral-800 space-y-2">
            <span className="text-[11px] font-mono text-emerald-400 font-bold">02. WHITELIST</span>
            <h3 className="text-sm font-bold text-white">Buat Protected Link</h3>
            <p className="text-xs text-neutral-400">
              Buat link akses dan tentukan kartu mana yang diberi izin membuka target redirect URL.
            </p>
            <Link href="/admin/links" className="text-[11px] text-neutral-300 hover:text-white font-mono inline-flex items-center space-x-1 pt-1">
              <span>Ke Menu Links</span> &rarr;
            </Link>
          </div>

          {/* 3 */}
          <div className="p-4 rounded-xl bg-black border border-neutral-800 space-y-2">
            <span className="text-[11px] font-mono text-amber-400 font-bold">03. INTEGRATION</span>
            <h3 className="text-sm font-bold text-white">Embed API / SDK</h3>
            <p className="text-xs text-neutral-400">
              Pasang tombol SDK 1-baris atau panggil endpoint REST API langsung dari backend Anda.
            </p>
            <Link href="/admin/embed" className="text-[11px] text-neutral-300 hover:text-white font-mono inline-flex items-center space-x-1 pt-1">
              <span>Ke Embed Hub</span> &rarr;
            </Link>
          </div>

          {/* 4 */}
          <div className="p-4 rounded-xl bg-black border border-neutral-800 space-y-2">
            <span className="text-[11px] font-mono text-purple-400 font-bold">04. TELEMETRY</span>
            <h3 className="text-sm font-bold text-white">Live Monitoring</h3>
            <p className="text-xs text-neutral-400">
              Setiap tap kartu dipantau live. Admin dapat mencabut hak akses seketika via CDC WAL.
            </p>
            <Link href="/admin/dashboard" className="text-[11px] text-neutral-300 hover:text-white font-mono inline-flex items-center space-x-1 pt-1">
              <span>Ke Dashboard</span> &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Architecture Pillars Grid */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight uppercase">Fitur & Modul Utama</h2>
            <p className="text-xs text-neutral-400">Semua modul dibangun di atas standar arsitektur enterprise Margaret 72-Node.</p>
          </div>
          <Link href="/admin/topology" className="text-xs text-neutral-400 hover:text-white font-mono flex items-center space-x-1">
            <span>Lihat Topologi 72-Node</span>
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
                <Check className="w-3.5 h-3.5 text-emerald-400 mr-1.5" />
                <span>Terintegrasi & Terverifikasi</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
