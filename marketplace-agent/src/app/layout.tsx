import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import AgentBar from '@/components/AgentBar';

export const metadata: Metadata = {
  title: 'Marketplace Sales Agent',
  description: 'AI sales agent for Facebook Marketplace',
};

const NAV = [
  { href: '/', label: 'DASHBOARD' },
  { href: '/products', label: 'PRODUCTS' },
  { href: '/leads', label: 'LEADS' },
  { href: '/agent', label: 'AGENT' },
  { href: '/settings', label: 'SETTINGS' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-line bg-panel">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
            <Link href="/" className="text-sm font-bold tracking-widest text-white">
              MARKETPLACE&nbsp;AGENT
            </Link>
            <nav className="flex flex-wrap gap-4 text-xs font-semibold tracking-widest text-slate-400">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-white">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <AgentBar />
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
