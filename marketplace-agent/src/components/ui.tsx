import Link from 'next/link';
import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-line bg-panel p-5 ${className}`}>{children}</div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-xs font-bold tracking-widest text-slate-400">{children}</h2>;
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-300',
  SOLD: 'bg-sky-500/15 text-sky-300',
  DRAFT: 'bg-slate-500/15 text-slate-300',
  PUBLISHING: 'bg-amber-500/15 text-amber-300',
  PAUSED: 'bg-slate-500/15 text-slate-300',
  FAILED: 'bg-rose-500/15 text-rose-300',
  HOT_LEAD: 'bg-orange-500/20 text-orange-300',
  NEGOTIATING: 'bg-amber-500/15 text-amber-300',
  INTERESTED: 'bg-sky-500/15 text-sky-300',
  QUESTION: 'bg-indigo-500/15 text-indigo-300',
  NEW: 'bg-slate-500/15 text-slate-300',
  LOW_INTENT: 'bg-slate-600/25 text-slate-400',
  SPAM: 'bg-rose-500/15 text-rose-300',
  CLOSED: 'bg-slate-600/25 text-slate-400',
};

export function Badge({ status }: { status: string }) {
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status] || 'bg-slate-500/15 text-slate-300'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="text-center">
      <div className="text-3xl font-bold text-white">{value}</div>
      <div className="mt-1 text-[11px] font-semibold tracking-widest text-slate-400">{label}</div>
    </Card>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
}) {
  const styles = {
    primary: 'bg-blue-600 hover:bg-blue-500 text-white',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-white',
    danger: 'bg-rose-600 hover:bg-rose-500 text-white',
    ghost: 'border border-line text-slate-300 hover:bg-slate-800',
  }[variant];
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-600"
    >
      {children}
    </Link>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs} second${secs === 1 ? '' : 's'} ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleString();
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
