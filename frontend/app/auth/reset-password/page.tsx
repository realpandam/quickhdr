'use client';

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        // Zpracuj token z URL hash (#access_token=...&type=recovery)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
            if (event === 'PASSWORD_RECOVERY') {
                setReady(true);
            }
        });

        // Supabase automaticky detekuje token v URL hash
        supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
            if (session) setReady(true);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setMessage({ text: 'Hesla se neshodují.', type: 'error' });
            return;
        }
        if (password.length < 6) {
            setMessage({ text: 'Heslo musí mít alespoň 6 znaků.', type: 'error' });
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            setMessage({ text: 'Heslo bylo úspěšně změněno.', type: 'success' });
            setTimeout(() => { window.location.href = '/login'; }, 2000);
        } catch (err: any) {
            setMessage({ text: err.message ?? 'Něco se pokazilo', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <main style={{
            minHeight: '100vh', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg)', padding: '2rem',
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
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: '2rem',
                }}>
                    <h1 style={{
                        fontSize: '1.25rem', fontWeight: 600,
                        color: 'var(--text-primary)', marginBottom: '0.5rem',
                    }}>
                        Nové heslo
                    </h1>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                        Zadejte nové heslo pro váš účet.
                    </p>

                    {!ready ? (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' as const }}>
                            Ověřuji odkaz...
                        </p>
                    ) : (
                        <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column' as const, gap: '1rem' }}>
                            <div>
                                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                                    Nové heslo
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    minLength={6}
                                    style={{
                                        width: '100%', padding: '0.6rem 0.75rem',
                                        background: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 'var(--radius)',
                                        color: 'var(--text-primary)',
                                        fontSize: 13, fontFamily: 'inherit', outline: 'none',
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                                    Potvrdit heslo
                                </label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    style={{
                                        width: '100%', padding: '0.6rem 0.75rem',
                                        background: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 'var(--radius)',
                                        color: 'var(--text-primary)',
                                        fontSize: 13, fontFamily: 'inherit', outline: 'none',
                                    }}
                                />
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
                                style={{
                                    width: '100%', justifyContent: 'center',
                                    padding: '0.7rem', fontSize: 14,
                                    opacity: loading ? 0.7 : 1,
                                }}
                            >
                                {loading ? 'Ukládám...' : 'Uložit nové heslo'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </main>
    );
}