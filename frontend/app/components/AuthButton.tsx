'use client';

import type { User } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState('/');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentPath(window.location.pathname);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  if (loading) return (
    <a href="/login" className="header-login-btn" style={{ opacity: 0.5 }}>
      Přihlásit se
    </a>
  );

  if (user) {
    const name = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? '';
    const initials = name[0]?.toUpperCase() ?? '?';

    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Přímý odkaz — Moje fotografie */}
          <a href="/dashboard" className="header-auth-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            Moje fotografie
          </a>

          {/* Kontextové menu */}
          <div ref={ref} style={{ position: 'relative' }}>
            <button
              onClick={() => setOpen(o => !o)}
              className={`user-menu-trigger${open ? ' user-menu-trigger--open' : ''}`}
              aria-expanded={open}
              aria-haspopup="true"
            >
              <div className="user-avatar">{initials}</div>
              <svg
                width="11" height="11"
                viewBox="0 0 24 24"
                fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{
                  transition: 'transform 0.2s',
                  transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                  opacity: 0.55,
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {open && (
              <div className="user-menu-dropdown">
                {/* Hlavička */}
                <div style={{
                  padding: '0.85rem 1rem 0.75rem',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Přihlášen jako</p>
                  <p style={{
                    fontSize: 13, fontWeight: 600,
                    color: 'var(--text-primary)', margin: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: 210,
                  }}>
                    {user.email}
                  </p>
                </div>

                {/* Položky */}
                <div style={{ padding: '0.4rem' }}>
                  <a href="/dashboard" className="user-menu-item" onClick={() => setOpen(false)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                    Moje fotografie
                  </a>
                  <a href="/auth/account" className="user-menu-item" onClick={() => setOpen(false)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                    </svg>
                    Nastavení účtu
                  </a>
                </div>

                {/* Odhlásit */}
                <div style={{ padding: '0.4rem', borderTop: '1px solid var(--border)' }}>
                  <button onClick={handleSignOut} className="user-menu-item user-menu-signout">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Odhlásit se
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <style>{`
          .user-menu-trigger {
            display: flex;
            align-items: center;
            gap: 5px;
            background: transparent;
            border: none;
            border-radius: var(--radius);
            padding: 3px 8px 3px 3px;
            cursor: pointer;
            color: var(--text-secondary);
            font-family: inherit;
            transition: background 0.2s, box-shadow 0.25s, color 0.2s, transform 0.15s;
          }
          .user-menu-trigger:hover,
          .user-menu-trigger--open {
            background: rgba(139,92,246,0.09);
            box-shadow: 0 0 0 3px rgba(139,92,246,0.18), 0 4px 18px rgba(107,71,220,0.38);
            color: var(--text-primary);
            transform: translateY(-1px);
          }
          .user-menu-trigger:active {
            transform: translateY(0);
          }

          .user-avatar {
            width: 26px;
            height: 26px;
            border-radius: 50%;
            background: linear-gradient(135deg, #6B47DC, #8B5CF6);
            color: #fff;
            font-size: 11px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }

          .user-menu-dropdown {
            position: absolute;
            top: calc(100% + 8px);
            right: 0;
            min-width: 235px;
            background: var(--bg-secondary, var(--bg));
            border: 1px solid rgba(139,92,246,0.25);
            border-radius: 12px;
            box-shadow: 0 16px 48px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.12), 0 0 0 1px rgba(139,92,246,0.08);
            overflow: hidden;
            animation: menuFadeIn 0.15s ease;
            z-index: 200;
          }
          @keyframes menuFadeIn {
            from { opacity: 0; transform: translateY(-6px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0)   scale(1); }
          }

          .user-menu-item {
            width: 100%;
            display: flex;
            align-items: center;
            gap: 9px;
            padding: 0.55rem 0.75rem;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            color: var(--text-secondary);
            text-decoration: none;
            background: transparent;
            border: none;
            cursor: pointer;
            font-family: inherit;
            transition: background 0.15s, color 0.15s, box-shadow 0.15s;
            text-align: left;
          }
          .user-menu-item:hover {
            background: rgba(139,92,246,0.12);
            color: var(--text-primary);
            box-shadow: inset 0 0 0 1px rgba(139,92,246,0.2);
          }

          .user-menu-signout { color: var(--text-muted); }
          .user-menu-signout:hover {
            background: rgba(239,68,68,0.09);
            color: #ef4444;
            box-shadow: inset 0 0 0 1px rgba(239,68,68,0.18);
          }
        `}</style>
      </>
    );
  }

  return (
    <a
      href={`/login?returnTo=${encodeURIComponent(currentPath)}`}
      className="header-login-btn"
    >
      Přihlásit se
    </a>
  );
}
