'use client';

import { useEffect, useState } from 'react';
import { API_URL } from '../lib/config';

type Status = 'processing' | 'done' | 'error' | 'loading';

export default function ResultPage({ params }: { params: { imageId: string } }) {
  const [status, setStatus] = useState<Status>('loading');
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/enhance/status/${params.imageId}`);
        const { status } = await res.json();

        if (status === 'processed') {
          clearInterval(poll);
          setEnhancedUrl(`${API_URL}/api/enhance/enhanced/${params.imageId}`);
          setStatus('done');
        } else if (status === 'failed' || status === 'error') {
          clearInterval(poll);
          setStatus('error');
        } else {
          setStatus('processing');
        }
      } catch {
        clearInterval(poll);
        setStatus('error');
      }
    }, 3000);

    return () => clearInterval(poll);
  }, [params.imageId]);

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 560, width: '100%', padding: '2rem', textAlign: 'center' }}>
        <a href="/" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '3rem' }}>
          FASTHDR
        </a>

        {status === 'loading' || status === 'processing' ? (
          <>
            {/* Progress bar animovaný */}
            <div style={{ width: '100%', height: 3, background: 'var(--border)', borderRadius: 999, overflow: 'hidden', marginBottom: '1.5rem' }}>
              <div style={{
                height: '100%', background: 'var(--accent)',
                borderRadius: 999,
                animation: 'progress-indeterminate 1.5s ease-in-out infinite',
                width: '40%',
              }} />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Zpracováváme vaši fotografii…
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              AI zpracování obvykle trvá 1–3 minuty. Tuto stránku neopouštějte.
            </p>
          </>
        ) : status === 'done' && enhancedUrl ? (
          <>
            <div style={{ fontSize: 48, marginBottom: '1rem' }}>✓</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Fotografie je připravena!
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.6 }}>
              Náhled s vodoznakem. Pro stažení v plném rozlišení bez vodoznaku dokončete platbu.
            </p>
            {/* Náhled s vodoznakem */}
            <img
              src={enhancedUrl}
              alt="Upravená fotografie"
              style={{ width: '100%', borderRadius: 8, marginBottom: '1.5rem', border: '1px solid var(--border)' }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={async () => {
                  const res = await fetch(`${API_URL}/api/payments/create-checkout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image_id: params.imageId, filename: 'fotografie.jpg' }),
                  });
                  const data = await res.json();
                  if (data.url) window.location.href = data.url;
                }}
                className="btn btn-primary"
                style={{ padding: '10px 24px', fontSize: 14 }}
              >
                Koupit & Stáhnout — 59 Kč
              </button>
              <a href="/" className="btn" style={{ padding: '10px 24px', fontSize: 14 }}>
                Zpracovat další
              </a>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: '1rem' }}>
              Fotografie je dostupná po dobu 7 dní.{' '}
              <a href="/login" style={{ color: 'var(--accent)' }}>Přihlaste se</a> pro uložení do Moje fotografie.
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 48, marginBottom: '1rem' }}>✗</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Zpracování selhalo
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: '2rem' }}>
              Omlouváme se, došlo k chybě. Zkuste to prosím znovu.
            </p>
            <a href="/" className="btn btn-primary" style={{ padding: '10px 24px', fontSize: 14 }}>
              Zkusit znovu
            </a>
          </>
        )}
      </div>

      <style>{`
        @keyframes progress-indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </main>
  );
}