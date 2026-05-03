'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const WARNING_BEFORE_MS = 5 * 60 * 1000; // 5 minut před vypršením

export default function SessionTimeout() {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(300);

  useEffect(() => {
    let warningTimeout: NodeJS.Timeout;
    let countdownInterval: NodeJS.Timeout;

    const scheduleWarning = (expiresAt: number) => {
      clearTimeout(warningTimeout);
      clearInterval(countdownInterval);

      const now = Date.now();
      const expiresMs = expiresAt * 1000;
      const warningAt = expiresMs - WARNING_BEFORE_MS;
      const delay = warningAt - now;

      if (delay <= 0) return;

      warningTimeout = setTimeout(() => {
        setShowWarning(true);
        setSecondsLeft(300);

        countdownInterval = setInterval(() => {
          setSecondsLeft(prev => {
            if (prev <= 1) {
              clearInterval(countdownInterval);
              supabase.auth.signOut();
              window.location.href = '/login';
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }, delay);
    };

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.expires_at) {
        scheduleWarning(session.expires_at);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setShowWarning(false);
      clearTimeout(warningTimeout);
      clearInterval(countdownInterval);
      if (session?.expires_at) {
        scheduleWarning(session.expires_at);
      }
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(warningTimeout);
      clearInterval(countdownInterval);
    };
  }, []);

  const handleExtend = async () => {
    const { error } = await supabase.auth.refreshSession();
    if (!error) {
      setShowWarning(false);
    }
  };

  if (!showWarning) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div style={{
      position: 'fixed' as const,
      bottom: '2rem',
      right: '2rem',
      zIndex: 999,
      background: 'var(--bg-card)',
      border: '1px solid var(--accent-glow)',
      borderRadius: 'var(--radius)',
      padding: '1.25rem 1.5rem',
      boxShadow: 'var(--shadow-md)',
      maxWidth: 320,
      animation: 'fadeUp 0.3s ease',
    }}>
      <p style={{
        fontSize: 13, fontWeight: 600,
        color: 'var(--text-primary)',
        marginBottom: '0.5rem',
      }}>
        Relace brzy vyprší
      </p>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Budete odhlášeni za{' '}
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
          {minutes}:{seconds.toString().padStart(2, '0')}
        </span>
        . Chcete zůstat přihlášeni?
      </p>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={handleExtend}
          className="btn btn-primary"
          style={{ fontSize: 12, padding: '6px 16px', flex: 1, justifyContent: 'center' }}
        >
          Zůstat přihlášen
        </button>
        <button
          onClick={() => supabase.auth.signOut().then(() => { window.location.href = '/login'; })}
          className="btn"
          style={{ fontSize: 12, padding: '6px 16px' }}
        >
          Odhlásit
        </button>
      </div>
    </div>
  );
}