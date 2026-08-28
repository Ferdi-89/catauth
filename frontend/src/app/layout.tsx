import '../styles/globals.css';
import { Navigation } from '../components/Navigation';

export const metadata = {
  title: 'Catauth — NFC Auth Gateway & Admin Telemetry',
  description: 'Enterprise WebAuthn/FIDO2 NFC Gateway with Edge Proxy Rate Limiting, Zero-Polling WAL CDC, and Bento Grid Admin Telemetry.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground bg-vercel-canvas min-h-screen flex flex-col antialiased selection:bg-neutral-800 selection:text-white">
        <Navigation />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <footer className="border-t border-border py-6 text-center text-xs text-neutral-500 font-mono">
          Catauth Architecture V8 — Modular Monolith & Event-Driven CDC Engine © 2026
        </footer>
      </body>
    </html>

  );
}
