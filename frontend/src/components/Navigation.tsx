'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Shield, Radio, Layers, Key, Server, Terminal, Sliders, 
  AlertCircle, Link2, Lock, Code2, LogOut, User, ShieldCheck 
} from 'lucide-react';

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [adminUser, setAdminUser] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('catauth_admin_user');
      const token = localStorage.getItem('catauth_admin_token');
      if (token && userStr) {
        try {
          setAdminUser(JSON.parse(userStr));
        } catch {
          setAdminUser(null);
        }
      } else {
        setAdminUser(null);
      }
    }
  }, [pathname]);

  function handleLogout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('catauth_admin_token');
      localStorage.removeItem('catauth_admin_user');
    }
    setAdminUser(null);
    router.push('/admin/login');
  }

  // If on SSO gateway login or callback, or admin login, show a clean, secure kiosk header without full navigation
  const isSSO = pathname.startsWith('/sso');
  const isAdminLogin = pathname === '/admin/login';

  if (isSSO || isAdminLogin) {
    return (
      <header className="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-neutral-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Minimalist Gateway Branding */}
            <Link href="/" className="flex items-center space-x-2.5">
              <div className="w-6 h-6 flex items-center justify-center">
                <svg viewBox="0 0 76 65" fill="none" className="w-5 h-5 text-white">
                  <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="currentColor" />
                </svg>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-semibold tracking-tight text-white">
                  CATAUTH
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 flex items-center space-x-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>{isAdminLogin ? 'Admin Gatekeeper' : 'Secure SSO Gateway'}</span>
                </span>
              </div>
            </Link>

            {/* Security Indicator */}
            <div className="flex items-center space-x-2 text-[11px] font-mono text-neutral-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="hidden sm:inline">Hardware Encrypted • Zero Password</span>
            </div>
          </div>
        </div>
      </header>
    );
  }

  // Admin Navigation Items
  const navItems = [
    { label: 'Overview', href: '/', icon: Layers },
    { label: 'Links', href: '/admin/links', icon: Link2 },
    { label: 'Embed API', href: '/admin/embed', icon: Code2 },
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
          {/* Logo & Brand */}
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
                  Admin Hub
                </span>
              </div>
            </Link>

            {/* Desktop Admin Navigation Links */}
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

          {/* Right Action & Admin Session Status */}
          <div className="flex items-center space-x-3">
            {adminUser ? (
              <div className="flex items-center space-x-2.5">
                <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-neutral-900 border border-neutral-800 text-xs font-mono">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-white font-medium">{adminUser.name || 'Admin'}</span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                    {adminUser.role || 'ADMIN'}
                  </span>
                </div>

                <button
                  onClick={handleLogout}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-neutral-900 hover:bg-red-950/60 text-neutral-400 hover:text-red-400 border border-neutral-800 hover:border-red-800/40 transition-colors flex items-center space-x-1"
                  title="Keluar dari sesi Admin"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Keluar</span>
                </button>
              </div>
            ) : (
              <Link
                href="/admin/login"
                className="px-3 py-1 rounded-md text-xs font-medium bg-white text-black hover:bg-neutral-200 transition-colors flex items-center space-x-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Masuk Admin</span>
              </Link>
            )}

            <Link
              href="/admin/embed"
              className="hidden lg:inline-flex px-3 py-1 rounded-md text-xs font-medium bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 transition-colors"
            >
              Embed API
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navigation;
