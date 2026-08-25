'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Boxes,
  ChevronDown,
  FolderKanban,
  Gauge,
  LogOut,
  PlayCircle,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { clearSession, getSession, type Session } from '@/lib/api';
import { LoadingBlock } from './ui';

const navigation = [
  { href: '/dashboard', label: 'Overview', icon: Gauge },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/executions', label: 'Executions', icon: PlayCircle },
  { href: '/assets', label: 'Assets', icon: Boxes },
  { href: '/settings/providers', label: 'Providers', icon: Settings2 },
];

export function AppShell({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setCurrentSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    const current = getSession();
    if (!current) router.replace('/login');
    setCurrentSession(current);
  }, [router]);

  if (session === undefined) return <LoadingBlock label="Opening workspace" />;
  if (!session) return null;

  return (
    <div className={`app-shell ${compact ? 'app-shell-compact' : ''}`}>
      <aside className="app-sidebar">
        <Link className="brand" href="/dashboard" aria-label="GenFlow dashboard">
          <span className="brand-mark"><Sparkles size={17} /></span>
          <span>GenFlow</span>
          <span className="brand-beta">beta</span>
        </Link>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navigation.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} className={active ? 'nav-link active' : 'nav-link'} href={item.href} title={item.label}>
                <item.icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-profile">
          <span className="avatar">{session.user.displayName.slice(0, 2).toUpperCase()}</span>
          <span className="profile-copy">
            <strong>{session.user.displayName}</strong>
            <small>{session.identity.role.toLowerCase()}</small>
          </span>
          <button
            className="icon-button"
            title="Sign out"
            onClick={() => {
              clearSession();
              router.replace('/login');
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="page-actions">{actions}</div>
    </header>
  );
}
