'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Mode = 'login' | 'register' | 'forgot';

interface FormErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Velmi slabé', color: '#ef4444' };
  if (score === 2) return { score, label: 'Slabé', color: '#f97316' };
  if (score === 3) return { score, label: 'Středně silné', color: '#eab308' };
  if (score === 4) return { score, label: 'Silné', color: '#22c55e' };
  return { score, label: 'Velmi silné', color: '#16a34a' };
}

function translateError(message: string): string {
  const map: Record<string, string> = {
    'Invalid login credentials': 'Nesprávný email nebo heslo.',
    'Email not confirmed': 'Email nebyl potvrzen. Zkontrolujte schránku.',
    'User already registered': 'Uživatel s tímto emailem již existuje.',
    'Password should be at least 6 characters': 'Heslo musí mít alespoň 6 znaků.',
    'Failed to fetch': 'Nepodařilo se připojit k serveru. Zkuste to znovu.',
    'Email logins are disabled': 'Přihlášení emailem je dočasně nedostupné.',
  };
  return map[message] ?? message;
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);

  const [submitCount, setSubmitCount] = useState(0);
  const [lastSubmit, setLastSubmit] = useState<number>(0);
  const RATE_LIMIT_MS = 3000; // 3 sekundy mezi pokusy
  const MAX_ATTEMPTS = 5; // max 5 pokusů
  const [blocked, setBlocked] = useState(false);
  const [blockTimer, setBlockTimer] = useState(0);

  const [returnTo, setReturnTo] = useState('/dashboard');

  const strength = mode === 'register' ? getPasswordStrength(password) : null;

  const [rememberEmail, setRememberEmail] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('savedEmail');
    if (saved) {
      setEmail(saved);
      setRememberEmail(true);
    }
  }, []);

  useEffect(() => {
    if (!blocked) {
      return
    };

    const interval = setInterval(() => {
      setBlockTimer(prev => {
        if (prev <= 1) {
          setBlocked(false);
          setSubmitCount(0);
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [blocked]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('returnTo');
    if (redirect) setReturnTo(redirect);
  }, []);

  const validate = (): FormErrors => {
    const errs: FormErrors = {};
    if (!email) {
      errs.email = 'Email je povinný.';
    } else if (!validateEmail(email)) {
      errs.email = 'Zadejte platný email.';
    }
    if (!password) {
      errs.password = 'Heslo je povinné.';
    } else if (mode === 'register' && password.length < 6) {
      errs.password = 'Heslo musí mít alespoň 6 znaků.';
    }
    if (mode === 'register' && password !== confirmPassword) {
      errs.confirmPassword = 'Hesla se neshodují.';
    }
    return errs;
  };

  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    setErrors(validate());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Rate limiting check
    const now = Date.now();
    if (blocked) return;
    if (now - lastSubmit < RATE_LIMIT_MS) return;

    const newCount = submitCount + 1;
    setSubmitCount(newCount);
    setLastSubmit(now);

    if (newCount >= MAX_ATTEMPTS) {
      setBlocked(true);
      setBlockTimer(30); // zablokuj na 30 sekund
      setMessage({ text: 'Příliš mnoho pokusů. Zkuste to znovu za 30 sekund.', type: 'error' });
      return;
    }

    setTouched({ email: true, password: true, confirmPassword: true });
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    if (rememberEmail) {
      localStorage.setItem('savedEmail', email);
    } else {
      localStorage.removeItem('savedEmail');
    }

    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'register') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage({ text: 'Účet byl vytvořen. Můžete se přihlásit.', type: 'success' });
        setMode('login');
        setPassword('');
        setConfirmPassword('');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = returnTo;
      }
    } catch (err: any) {
      setMessage({ text: translateError(err.message ?? 'Něco se pokazilo'), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !validateEmail(email)) {
      setErrors({ email: 'Zadejte platný email.' });
      setTouched({ email: true });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) throw error;
      setMessage({
        text: 'Odkaz pro reset hesla byl odeslán na váš email.',
        type: 'success',
      });
    } catch (err: any) {
      setMessage({ text: translateError(err.message ?? 'Něco se pokazilo'), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('returnTo') ?? '/dashboard';
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?returnTo=${returnTo}` },
    });
  };

  const handleGitHub = async () => {
    setLoading(true);
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('returnTo') ?? '/dashboard';
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?returnTo=${returnTo}` },
    });
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setErrors({});
    setTouched({});
    setMessage(null);
    setPassword('');
    setConfirmPassword('');
  };

  const inputStyle = (field: keyof FormErrors): React.CSSProperties => ({
    width: '100%',
    padding: '0.6rem 0.75rem',
    paddingRight: field === 'password' || field === 'confirmPassword' ? '2.5rem' : '0.75rem',
    background: 'var(--bg-tertiary)',
    border: `1px solid ${touched[field] && errors[field] ? '#ef4444' : 'var(--border)'}`,
    borderRadius: 'var(--radius)',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 0.15s',
  });

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '2rem',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <a href="/" style={{
          display: 'block', fontSize: 14, fontWeight: 600,
          color: 'var(--text-primary)', marginBottom: '2.5rem',
          textAlign: 'center' as const,
        }}>
          Filip Zemek
          <span style={{ fontWeight: 300, color: 'var(--text-muted)', marginLeft: 6 }}>AI Retušování</span>
        </a>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '2rem',
        }}>
          <h1 style={{
            fontSize: '1.25rem', fontWeight: 600,
            letterSpacing: '-0.01em', color: 'var(--text-primary)',
            marginBottom: '0.5rem',
          }}>
            {mode === 'login' ? 'Přihlásit se' : 'Vytvořit účet'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            {mode === 'login'
              ? 'Přihlaste se pro přístup k vašim fotografiím.'
              : 'Vytvořte si účet a ukládejte upravené fotografie.'}
          </p>

          {/* OAuth */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.75rem', marginBottom: '1.5rem' }}>
            <button onClick={handleGoogle} disabled={loading} className="btn" style={{
              width: '100%', justifyContent: 'center', padding: '0.65rem', fontSize: 13, gap: 8,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Pokračovat s Google
            </button>
            <button onClick={handleGitHub} disabled={loading} className="btn" style={{
              width: '100%', justifyContent: 'center', padding: '0.65rem', fontSize: 13, gap: 8,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              Pokračovat s GitHub
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>nebo</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {mode === 'forgot' ? (
            <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column' as const, gap: '1rem' }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Zadejte váš email a my vám pošleme odkaz pro reset hesla.
              </p>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onBlur={() => handleBlur('email')}
                  placeholder="vas@email.cz"
                  autoComplete="email"
                  style={inputStyle('email')}
                />
                {touched.email && errors.email && (
                  <p style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{errors.email}</p>
                )}
              </div>

              {message && (
                <p style={{
                  fontSize: 13,
                  color: message.type === 'error' ? '#ef4444' : 'var(--progress-done)',
                  padding: '0.5rem 0.75rem',
                  background: message.type === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(74,222,128,0.08)',
                  borderRadius: 'var(--radius)',
                  border: `1px solid ${message.type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(74,222,128,0.2)'}`,
                }}>
                  {message.text}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '0.7rem', fontSize: 14, opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Odesílám...' : 'Odeslat odkaz'}
              </button>

              <button
                type="button"
                onClick={() => { setMode('login'); setMessage(null); setErrors({}); setTouched({}); }}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--text-muted)', fontSize: 13,
                  cursor: 'pointer', padding: 0, textAlign: 'center' as const,
                }}
              >
                ← Zpět na přihlášení
              </button>
            </form>
          ) : (


            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' as const, gap: '1rem' }}>
              {/* Email */}
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); if (touched.email) setErrors(validate()); }}
                  onBlur={() => handleBlur('email')}
                  placeholder="vas@email.cz"
                  autoComplete="email"
                  style={inputStyle('email')}
                />
                {touched.email && errors.email && (
                  <p style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{errors.email}</p>
                )}
              </div>

              <label className="toggle-wrap" style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                userSelect: 'none' as const,
                marginTop: 4,
              }}>
                <input
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={e => setRememberEmail(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                Zapamatovat email
              </label>

              {/* Heslo */}
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  Heslo
                </label>
                <div style={{ position: 'relative' as const }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); if (touched.password) setErrors(validate()); }}
                    onBlur={() => handleBlur('password')}
                    placeholder="••••••••"
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    style={inputStyle('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute' as const, right: 10, top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none', border: 'none',
                      color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 0,
                    }}
                  >
                    {showPassword ? '🙈' : '👁'}
                  </button>
                </div>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setErrors({}); setTouched({}); setMessage(null); }}
                    style={{
                      background: 'none', border: 'none',
                      color: 'var(--text-muted)', fontSize: 11,
                      cursor: 'pointer', padding: 0,
                      marginTop: 6, display: 'block',
                      textAlign: 'right' as const, width: '100%',
                    }}
                  >
                    Zapomenuté heslo?
                  </button>
                )}
                {touched.password && errors.password && (
                  <p style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{errors.password}</p>
                )}

                {/* Síla hesla */}
                {mode === 'register' && password && strength && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{
                      height: 3, background: 'var(--progress-bg)',
                      borderRadius: 999, overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${(strength.score / 5) * 100}%`,
                        background: strength.color,
                        transition: 'width 0.3s ease, background 0.3s ease',
                      }} />
                    </div>
                    <p style={{ fontSize: 11, color: strength.color, marginTop: 4 }}>
                      {strength.label}
                    </p>
                  </div>
                )}
              </div>

              {/* Potvrzení hesla — pouze při registraci */}
              {mode === 'register' && (
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                    Potvrdit heslo
                  </label>
                  <div style={{ position: 'relative' as const }}>
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => { setConfirmPassword(e.target.value); if (touched.confirmPassword) setErrors(validate()); }}
                      onBlur={() => handleBlur('confirmPassword')}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      style={inputStyle('confirmPassword')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      style={{
                        position: 'absolute' as const, right: 10, top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none', border: 'none',
                        color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 0,
                      }}
                    >
                      {showConfirm ? '🙈' : '👁'}
                    </button>
                  </div>
                  {touched.confirmPassword && errors.confirmPassword && (
                    <p style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{errors.confirmPassword}</p>
                  )}
                  {confirmPassword && !errors.confirmPassword && password === confirmPassword && (
                    <p style={{ fontSize: 11, color: 'var(--progress-done)', marginTop: 4 }}>✓ Hesla se shodují</p>
                  )}
                </div>
              )}

              {/* Globální zpráva */}
              {message && (
                <p style={{
                  fontSize: 13,
                  color: message.type === 'error' ? '#ef4444' : 'var(--progress-done)',
                  padding: '0.5rem 0.75rem',
                  background: message.type === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(74,222,128,0.08)',
                  borderRadius: 'var(--radius)',
                  border: `1px solid ${message.type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(74,222,128,0.2)'}`,
                }}>
                  {message.text}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || blocked}
                className="btn btn-primary"
                style={{
                  width: '100%', justifyContent: 'center',
                  padding: '0.7rem', fontSize: 14, marginTop: 4,
                  opacity: loading || blocked ? 0.7 : 1,
                }}
              >
                {blocked
                  ? `Příliš mnoho pokusů — čekejte ${blockTimer}s`
                  : loading
                    ? 'Načítám...'
                    : mode === 'login' ? 'Přihlásit se' : 'Vytvořit účet'}
              </button>
            </form>
          )}

          {/* Přepnutí módu */}
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' as const, marginTop: '1.25rem' }}>
            {mode === 'login' ? 'Nemáte účet?' : 'Již máte účet?'}{' '}
            <button
              onClick={switchMode}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, cursor: 'pointer', padding: 0 }}
            >
              {mode === 'login' ? 'Registrovat se' : 'Přihlásit se'}
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}