'use client';

import type { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import Header from '../../components/Header';
import { supabase } from '../../lib/supabase';

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [consent, setConsent] = useState<{ agreed_to_terms_at: string; agreed_to_privacy_at: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Změna hesla
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Smazání účtu
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const isEmailProvider = user?.app_metadata?.provider === 'email' ||
    user?.app_metadata?.providers?.includes('email');
  const isGoogleProvider = user?.app_metadata?.providers?.includes('google');

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/login';
        return;
      }
      setUser(user);

      const { data } = await supabase
        .from('user_consents')
        .select('agreed_to_terms_at, agreed_to_privacy_at')
        .eq('user_id', user.id)
        .single();

      setConsent(data);
      setLoading(false);
    };
    init();
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ text: 'Nová hesla se neshodují.', type: 'error' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMessage({ text: 'Heslo musí mít alespoň 6 znaků.', type: 'error' });
      return;
    }

    setPasswordLoading(true);
    setPasswordMessage(null);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setPasswordMessage({ text: error.message, type: 'error' });
    } else {
      setPasswordMessage({ text: 'Heslo bylo úspěšně změněno.', type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
    setPasswordLoading(false);
  };

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Načítám...</p>
      </main>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.6rem 0.75rem',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Header />

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '4rem 2rem' }}>
        <h1 style={{
          fontSize: '1.75rem', fontWeight: 700,
          letterSpacing: '-0.02em', color: 'var(--text-primary)',
          marginBottom: '0.5rem',
        }}>
          Nastavení účtu
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '3rem' }}>
          Správa vašeho účtu a osobních údajů
        </p>

        {/* ── Osobní údaje ── */}
        <Section title="Osobní údaje">
          <Row label="Jméno" value={user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '—'} />
          <Row label="E-mail" value={user?.email ?? '—'} />
          <Row label="Poskytovatelé přihlášení" value={
            (user?.app_metadata?.providers ?? [])
              .map((p: string) => p === 'google' ? 'Google' : 'E-mail a heslo')
              .join(', ')
          } />
          <Row label="Datum registrace" value={
            user?.created_at
              ? new Date(user.created_at).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })
              : '—'
          } />
          <Row label="Poslední přihlášení" value={
            user?.last_sign_in_at
              ? new Date(user.last_sign_in_at).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : '—'
          } />
        </Section>

        {/* ── Souhlas ── */}
        <Section title="Souhlas s podmínkami">
          {consent ? (
            <>
              <Row label="Souhlas s VOP udělen" value={
                new Date(consent.agreed_to_terms_at).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              } />
              <Row label="Souhlas s GDPR udělen" value={
                new Date(consent.agreed_to_privacy_at).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              } />
              <div style={{
                marginTop: '1rem', padding: '0.75rem 1rem',
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 8,
              }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                  Pro odvolání souhlasu s{' '}
                  <a href="/podminky" target="_blank" style={{ color: 'var(--accent)' }}>VOP</a>
                  {' '}nebo{' '}
                  <a href="/ochrana-soukromi" target="_blank" style={{ color: 'var(--accent)' }}>Zásadami ochrany osobních údajů</a>
                  {' '}nás kontaktujte na{' '}
                  <a href="mailto:info@fasthdr.cz" style={{ color: 'var(--accent)' }}>info@fasthdr.cz</a>.
                  Odvolání souhlasu povede k deaktivaci vašeho účtu, neboť souhlas je nezbytný pro využívání Služby.
                </p>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13, color: '#f97316' }}>
              Souhlas s podmínkami nebyl zaznamenán. Kontaktujte nás na{' '}
              <a href="mailto:info@fasthdr.cz" style={{ color: 'var(--accent)' }}>info@fasthdr.cz</a>.
            </p>
          )}
        </Section>

        {/* ── Změna hesla — pouze pro email uživatele ── */}
        {isEmailProvider && !isGoogleProvider && (
          <Section title="Změna hesla">
            <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  Nové heslo
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  Potvrdit nové heslo
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  style={inputStyle}
                />
              </div>

              {passwordMessage && (
                <p style={{
                  fontSize: 13,
                  color: passwordMessage.type === 'error' ? '#ef4444' : 'var(--progress-done)',
                  padding: '0.5rem 0.75rem',
                  background: passwordMessage.type === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(74,222,128,0.08)',
                  borderRadius: 'var(--radius)',
                  border: `1px solid ${passwordMessage.type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(74,222,128,0.2)'}`,
                }}>
                  {passwordMessage.text}
                </p>
              )}

              <button
                type="submit"
                disabled={passwordLoading || !newPassword || !confirmPassword}
                className="btn btn-primary"
                style={{ alignSelf: 'flex-start', opacity: passwordLoading ? 0.7 : 1 }}
              >
                {passwordLoading ? 'Ukládám...' : 'Změnit heslo'}
              </button>
            </form>
          </Section>
        )}

        {isGoogleProvider && (
          <Section title="Změna hesla">
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Váš účet je přihlášen přes Google. Heslo spravujte přímo v{' '}
              <a href="https://myaccount.google.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                Google účtu
              </a>.
            </p>
          </Section>
        )}

        {/* ── Vaše data ── */}
        <Section title="Vaše data">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '0.75rem' }}>
            Máte právo požádat o přístup ke svým osobním údajům, jejich opravu nebo přenositelnost.
            Více informací najdete v{' '}
            <a href="/ochrana-soukromi" style={{ color: 'var(--accent)' }}>Zásadách ochrany osobních údajů</a>.
          </p>
          <a
            href="mailto:info@fasthdr.cz?subject=Žádost o přístup k osobním údajům"
            className="btn"
            style={{ fontSize: 13, display: 'inline-flex' }}
          >
            Požádat o export dat
          </a>
        </Section>

        {/* ── Smazání účtu ── */}
        <Section title="Smazání účtu">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
            Smazání účtu je nevratné. Všechna vaše data včetně historie objednávek budou trvale odstraněna.
            Fakturační údaje uchováváme po dobu 10 let dle zákona o účetnictví.
          </p>
          <a
            href="mailto:info@fasthdr.cz?subject=Žádost o smazání účtu&body=Žádám o smazání mého účtu a všech přidružených osobních údajů."
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '8px 16px',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius)',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            Požádat o smazání účtu
          </a>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Žádost vyřídíme do 30 dnů od doručení.
          </p>
        </Section>

        {/* ── Odhlásit se ── */}
        <div style={{ marginTop: '1rem' }}>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = '/';
            }}
            className="btn"
            style={{ fontSize: 13 }}
          >
            Odhlásit se
          </button>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      marginBottom: '2.5rem',
      paddingBottom: '2.5rem',
      borderBottom: '1px solid var(--border)',
    }}>
      <h2 style={{
        fontSize: '0.95rem', fontWeight: 600,
        color: 'var(--text-primary)', marginBottom: '1.25rem',
        letterSpacing: '-0.01em',
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0.6rem 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}