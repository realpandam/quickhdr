'use client';

import type { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState('/');

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
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <a href="/dashboard" className="header-auth-link" style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <div style={{
            width: 24, height: 24,
            borderRadius: '50%',
            border: '1px solid var(--accent-glow)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 700,
            background: 'linear-gradient(135deg, #6B47DC, #8B5CF6)',
            color: '#fff',
          }}>
            {user.email?.[0].toUpperCase()}
          </div>
          Moje fotografie
        </a>
        <button onClick={handleSignOut} className="header-signout-btn">
          Odhlásit
        </button>
      </div>
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