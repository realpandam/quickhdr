'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { API_URL } from '../../lib/config';

type Phase = 'uploading' | 'processing' | 'done' | 'error';

interface BatchStatus {
    phase: Phase;
    total: number;
    uploaded: number;
    processed: number;
    failed: number;
    image_ids: string[];
}

// Timeout: 20 minut — dost na stažení + zpracování velkého batche
const TIMEOUT_MS = 20 * 60 * 1000;
// Polling interval: každé 4 sekundy
const POLL_INTERVAL_MS = 4000;

function ProcessingPageInner() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const batchId = params.batchId as string;
    const totalFromUrl = parseInt(searchParams.get('count') ?? '0');
    const source = searchParams.get('source') ?? 'dropbox_oauth';
    const sourceName = source === 'google_drive' ? 'Google Drive' : 'Dropboxu';

    const [phase, setPhase] = useState<Phase>('uploading');
    const [status, setStatus] = useState<BatchStatus | null>(null);
    const [timedOut, setTimedOut] = useState(false);

    // Animovaný progress — plynule roste i mezi pollingy
    const [displayProgress, setDisplayProgress] = useState(0);
    const targetProgressRef = useRef<number>(0);
    const animFrameRef = useRef<number>(0);

    // Spusť animaci progress baru
    useEffect(() => {
        const animate = () => {
            setDisplayProgress(prev => {
                const diff = targetProgressRef.current - prev;
                if (Math.abs(diff) < 0.1) return targetProgressRef.current;
                return prev + diff * 0.06;
            });
            animFrameRef.current = requestAnimationFrame(animate);
        };
        animFrameRef.current = requestAnimationFrame(animate);
        return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
    }, []);

    // Polling
    useEffect(() => {
        if (!batchId) return;

        let stopped = false;

        const timeout = setTimeout(() => {
            stopped = true;
            setTimedOut(true);
            setPhase('error');
        }, TIMEOUT_MS);

        const poll = async () => {
            if (stopped) return;

            try {
                const res = await fetch(`${API_URL}/api/enhance/batch-status/${batchId}`);
                if (!res.ok) throw new Error('Chyba serveru');
                const data: BatchStatus = await res.json();

                if (stopped) return;
                setStatus(data);
                setPhase(data.phase);

                // Spočítej target progress
                const total = data.total || totalFromUrl || 1;
                if (data.phase === 'uploading') {
                    // Fáze 1: 0–30 % — čekáme na registraci u Autoenhance
                    targetProgressRef.current = Math.min(28, (data.uploaded / total) * 30);
                } else if (data.phase === 'processing') {
                    // Fáze 2: 30–95 % — AI zpracovává
                    const aiProgress = data.processed / total;
                    targetProgressRef.current = 30 + aiProgress * 65;
                } else if (data.phase === 'done') {
                    targetProgressRef.current = 100;
                }

                if (data.phase === 'done' && data.image_ids.length > 0) {
                    // Krátká pauza aby progress bar dojel na 100 %
                    clearTimeout(timeout);
                    setTimeout(() => {
                        const primary = data.image_ids[0];
                        const rest = data.image_ids.slice(1);
                        const url = rest.length > 0
                            ? `/order/${primary}?groups=${rest.join(',')}`
                            : `/order/${primary}`;
                        router.push(url);
                    }, 800);
                    return;
                }

                if (!stopped) setTimeout(poll, POLL_INTERVAL_MS);
            } catch {
                if (!stopped) setTimeout(poll, POLL_INTERVAL_MS * 2);
            }
        };

        // První poll po 1 sekundě (dáme backendu chvíli na zápis do DB)
        const firstPoll = setTimeout(poll, 1000);

        return () => {
            stopped = true;
            clearTimeout(timeout);
            clearTimeout(firstPoll);
        };
    }, [batchId, totalFromUrl, router]);

    const total = status?.total || totalFromUrl || 0;
    const processed = status?.processed ?? 0;

    const phaseLabel = (() => {
        if (timedOut) return 'Zpracování trvá déle než obvykle…';
        if (phase === 'uploading') return `Stahujeme fotografie z ${sourceName}…`;
        if (phase === 'processing') return processed > 0
            ? `AI zpracovává fotografie… (${processed}/${total} hotovo)`
            : 'AI zpracovává fotografie…';
        if (phase === 'done') return 'Hotovo! Přesměrovávám…';
        return 'Zpracování…';
    })();

    return (
        <main style={{
            minHeight: '100vh',
            background: 'var(--bg)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
        }}>
            <a href="/" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3rem', textDecoration: 'none' }}>
                FASTHDR
            </a>

            <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>

                {phase === 'error' ? (
                    <>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 1.5rem' }}>✗</div>
                        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                            {timedOut ? 'Zpracování trvá příliš dlouho' : 'Nastala chyba'}
                        </h2>
                        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '2rem' }}>
                            {timedOut
                                ? 'Fotografie se stále zpracovávají na pozadí. Zaregistrujte se a pošleme vám email po dokončení.'
                                : 'Omlouváme se, nastala chyba při zpracování. Zkuste to prosím znovu nebo nás kontaktujte.'}
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <a href="/register" className="btn btn-primary" style={{ padding: '10px 24px', fontSize: 14 }}>
                                Vytvořit účet a dostat email
                            </a>
                            <a href="/" className="btn" style={{ padding: '10px 24px', fontSize: 14 }}>
                                Zkusit znovu
                            </a>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Spinner */}
                        <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 2rem' }}>
                            <div style={{
                                width: 64, height: 64,
                                border: '3px solid var(--border)',
                                borderTop: '3px solid var(--accent)',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                            }} />
                            {/* Procenta uprostřed */}
                            {displayProgress > 5 && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 11, fontWeight: 600, color: 'var(--accent)',
                                }}>
                                    {Math.round(displayProgress)}%
                                </div>
                            )}
                        </div>

                        {/* Progress bar */}
                        <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 999, overflow: 'hidden', marginBottom: '1.5rem' }}>
                            <div style={{
                                height: '100%',
                                width: `${displayProgress}%`,
                                background: 'var(--accent)',
                                borderRadius: 999,
                                transition: 'width 0.3s ease',
                            }} />
                        </div>

                        {/* Fáze label */}
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                            {phaseLabel}
                        </h2>

                        {/* Hlavní text */}
                        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '2rem' }}>
                            {total > 0
                                ? `Zpracováváme ${total} ${total === 1 ? 'fotografii' : total < 5 ? 'fotografie' : 'fotografií'} z ${sourceName}.`
                                : `Zpracováváme vaše fotografie z ${sourceName}.`
                            }
                            {' '}
                            <strong style={{ color: 'var(--text-secondary)' }}>Nezavírejte tento prohlížeč.</strong>
                        </p>

                        {/* Divider */}
                        <div style={{ height: 1, background: 'var(--border)', margin: '0 0 1.5rem' }} />

                        {/* CTA pro registraci */}
                        <div style={{
                            padding: '1.25rem',
                            background: 'rgba(123,92,240,0.06)',
                            border: '1px solid rgba(123,92,240,0.2)',
                            borderRadius: 12,
                            textAlign: 'left',
                        }}>
                            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                                💡 Chcete dostat email po dokončení?
                            </p>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1rem', lineHeight: 1.5 }}>
                                Zaregistrujte se zdarma — po zpracování vám pošleme email s odkazem na výsledky a budete je mít uložené v dashboardu.
                            </p>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <a
                                    href="/register"
                                    className="btn btn-primary"
                                    style={{ fontSize: 13, padding: '8px 18px' }}
                                >
                                    Vytvořit účet zdarma
                                </a>
                                <a
                                    href="/login"
                                    className="btn"
                                    style={{ fontSize: 13, padding: '8px 18px' }}
                                >
                                    Přihlásit se
                                </a>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </main>
    );
}

export default function ProcessingPage() {
    return (
        <Suspense fallback={
            <main style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 48, height: 48, border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </main>
        }>
            <ProcessingPageInner />
        </Suspense>
    );
}