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

const TIMEOUT_MS = 20 * 60 * 1000;
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

    const [displayProgress, setDisplayProgress] = useState(0);
    const targetProgressRef = useRef<number>(0);
    const animFrameRef = useRef<number>(0);

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

                const total = data.total || totalFromUrl || 1;
                if (data.phase === 'uploading') {
                    targetProgressRef.current = Math.min(28, (data.uploaded / total) * 30);
                } else if (data.phase === 'processing') {
                    targetProgressRef.current = 30 + (data.processed / total) * 65;
                } else if (data.phase === 'done') {
                    targetProgressRef.current = 100;
                }

                if (data.phase === 'done' && data.image_ids.length > 0) {
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
                                ? 'Fotografie se stále zpracovávají na pozadí. Zkuste to znovu nebo nás kontaktujte.'
                                : 'Omlouváme se, nastala chyba při zpracování. Zkuste to prosím znovu nebo nás kontaktujte na info@fasthdr.cz.'}
                        </p>
                        <a href="/" className="btn btn-primary" style={{ padding: '10px 24px', fontSize: 14 }}>
                            Zkusit znovu
                        </a>
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
                        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '1.25rem' }}>
                            {total > 0
                                ? `Zpracováváme ${total} ${total === 1 ? 'fotografii' : total < 5 ? 'fotografie' : 'fotografií'} z ${sourceName}.`
                                : `Zpracováváme vaše fotografie z ${sourceName}.`
                            }
                            {' '}
                            <strong style={{ color: 'var(--text-secondary)' }}>Nezavírejte tento prohlížeč.</strong>
                            {' '}Po dokončení se výsledky zobrazí automaticky.
                        </p>

                        {/* Info o emailu — bez odkazů */}
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                            Zpracování může trvat až několik minut. Přihlášeným uživatelům pošleme výsledky přímo na email — nemusí u obrazovky čekat.
                        </p>
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