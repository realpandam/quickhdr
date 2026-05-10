'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { API_URL } from '../../lib/config';

type Status = 'loading' | 'processing' | 'done' | 'error';

export default function OrderPage() {
  const params = useParams();
  const imageId = params.imageId as string;

  const [status, setStatus] = useState<Status>('loading');
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!imageId) return;

    let progressInterval: ReturnType<typeof setInterval>;
    let pollInterval: ReturnType<typeof setInterval>;

    // Animovaný progress bar — roste pomalu do 90%
    progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 2;
      });
    }, 1000);

    // Polling každé 3s
    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/enhance/status/${imageId}`);
        const { status: apiStatus } = await res.json();

        if (apiStatus === 'processed') {
          clearInterval(pollInterval);
          clearInterval(progressInterval);
          setProgress(100);
          setEnhancedUrl(`${API_URL}/api/enhance/enhanced/${imageId}`);
          setStatus('done');
        } else if (apiStatus === 'failed' || apiStatus === 'error') {
          clearInterval(pollInterval);
          clearInterval(progressInterval);
          setStatus('error');
        } else {
          setStatus('processing');
        }
      } catch {
        clearInterval(pollInterval);
        clearInterval(progressInterval);
        setStatus('error');
      }
    }, 3000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(progressInterval);
    };
  }, [imageId]);

  const handleBuy = async () => {
    try {
      const res = await fetch(`${API_URL}/api/payments/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_id: imageId,
          filename: 'fotografie.jpg',
          user_id: null,
          email: null,
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error('Chyba při vytváření platby:', err);
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <a href="/" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3rem', textDecoration: 'none' }}>
        FASTHDR
      </a>

      <div style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>

        {(status === 'loading' || status === 'processing') && (
          <>
            <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 999, overflow: 'hidden', marginBottom: '2rem' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', borderRadius: 999, transition: 'width 1s ease' }} />
            </div>
            <div style={{ width: 48, height: 48, border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', margin: '0 auto 1.5rem', animation: 'spin 1s linear infinite' }} />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Zpracováváme vaši fotografii…
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '2rem' }}>
              AI zpracování obvykle trvá 1–3 minuty.<br />
              Tuto stránku neopouštějte — výsledek se zobrazí automaticky.
            </p>
            <div style={{ padding: '1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              💡 <a href="/login" style={{ color: 'var(--accent)' }}>Přihlaste se</a> a výsledky se vám uloží do Moje fotografie — nebudete muset čekat na stránce.
            </div>
          </>
        )}

        {status === 'done' && enhancedUrl && (
          <>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 1.5rem' }}>
              ✓
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Fotografie je připravena!
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Níže vidíte náhled s vodoznakem. Pro stažení v plném rozlišení bez vodoznaku dokončete platbu.
            </p>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: '1.5rem' }}>
              <img src={enhancedUrl} alt="Upravená fotografie" style={{ width: '100%', display: 'block' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <button onClick={handleBuy} className="btn btn-primary" style={{ padding: '10px 24px', fontSize: 14 }}>
                Koupit & Stáhnout — 59 Kč
              </button>
              <a href="/" className="btn" style={{ padding: '10px 24px', fontSize: 14 }}>
                Zpracovat další fotografii
              </a>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Fotografie je dostupná po dobu 7 dní.{' '}
              <a href="/login" style={{ color: 'var(--accent)' }}>Přihlaste se</a>{' '}
              pro uložení do Moje fotografie a pohodlný přístup kdykoliv.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 1.5rem' }}>
              ✗
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Zpracování selhalo
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.6 }}>
              Omlouváme se, došlo k chybě při zpracování fotografie.<br />
              Zkuste to prosím znovu nebo nás kontaktujte na{' '}
              <a href="mailto:info@fasthdr.cz" style={{ color: 'var(--accent)' }}>info@fasthdr.cz</a>.
            </p>
            <a href="/" className="btn btn-primary" style={{ padding: '10px 24px', fontSize: 14 }}>
              Zkusit znovu
            </a>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}