'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, Radio, Layers, Key, Server, Terminal, Sliders, AlertCircle } from 'lucide-react';

export function Navigation() {

  const pathname = usePathname();

  const navItems = [
    { label: 'Overview', href: '/', icon: Layers },
    { label: 'SSO Gateway', href: '/sso/login?client_id=client_portal_alpha&redirect_uri=/sso/callback&state=demo_state_123', icon: Radio },

    { label: 'Telemetry', href: '/admin/dashboard', icon: Server },
    { label: 'Topology 72N', href: '/admin/topology', icon: Layers },
    { label: 'Clients', href: '/admin/clients', icon: Shield },
    { label: 'Keys', href: '/admin/keys', icon: Key },
    { label: 'Policies', href: '/admin/policies', icon: Sliders },
    { label: 'DLQ', href: '/admin/dlq', icon: AlertCircle },
    { label: 'Simulator', href: '/simulator', icon: Terminal },
  ];

  return (
    <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo & Brand (Vercel Triangle mark) */}
          <div className="flex items-center space-x-6">
            <Link href="/" className="flex items-center space-x-2.5 group">
              <div className="w-6 h-6 flex items-center justify-center">
                <svg viewBox="0 0 76 65" fill="none" className="w-5 h-5 text-white">
                  <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="currentColor" />
                </svg>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-semibold tracking-tight text-white">
                  CATAUTH
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-400 border border-neutral-800">
                  v0.3.0
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center space-x-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href.split('?')[0];
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-neutral-900 text-white border border-neutral-800'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-950'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Action & Live Status */}
          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-2 px-2.5 py-1 rounded-full bg-neutral-950 border border-neutral-800 text-[11px] font-mono text-neutral-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>RP: catauth.io</span>
            </div>

            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1 rounded-md text-xs font-medium bg-white text-black hover:bg-neutral-200 transition-colors"
            >
              API Docs
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navigation;

