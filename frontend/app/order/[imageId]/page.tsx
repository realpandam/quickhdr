'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { API_URL } from '../../lib/config';

type Status = 'loading' | 'processing' | 'done' | 'error';

const PRICE_CZK = parseInt(process.env.PRICE_CZK || '25');

export default function OrderPage() {
  const params = useParams();
  const imageId = params.imageId as string;

  const [status, setStatus] = useState<Status>('loading');
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [lightbox, setLightbox] = useState(false);

  const isHdr = imageId?.startsWith('hdr_pending_');
  const orderId = isHdr ? imageId.replace('hdr_pending_', '') : null;

  useEffect(() => {
    if (!imageId) return;

    let progressInterval: ReturnType<typeof setInterval>;
    let pollInterval: ReturnType<typeof setInterval>;

    progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 2;
      });
    }, 1000);

    pollInterval = setInterval(async () => {
      try {
        if (isHdr && orderId) {
          const res = await fetch(`${API_URL}/api/enhance/hdr/order/${orderId}/status`);
          const { is_merging, is_processing, image_ids } = await res.json();
          const done = !is_merging && !is_processing && image_ids?.length > 0;
          if (done) {
            clearInterval(pollInterval);
            clearInterval(progressInterval);
            setProgress(100);
            setEnhancedUrl(`${API_URL}/api/enhance/enhanced/${image_ids[0]}`);
            setStatus('done');
          } else {
            setStatus('processing');
          }
          return;
        }

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
  }, [imageId, isHdr, orderId]);

  const handleBuy = async () => {
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailValid) {
      setEmailError('Zadejte prosím platný email');
      return;
    }
    setEmailError('');
    try {
      const res = await fetch(`${API_URL}/api/payments/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_id: imageId,
          filename: 'fotografie.jpg',
          user_id: null,
          email,
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error('Chyba při vytváření platby:', err);
    }
  };

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
      <a href="/" style={{
        fontSize: 14, fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: '3rem', textDecoration: 'none',
      }}>
        FASTHDR
      </a>

      <div style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>

        {/* ── Loading / Processing ── */}
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
              💡 <a href="/login" style={{ color: 'var(--accent)' }}>Přihlaste se</a> a výsledky
              se vám uloží do Moje fotografie — nebudete muset čekat na stránce.
            </div>
          </>
        )}

        {/* ── Done ── */}
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

            {/* Fotka s lupou */}
            <div
              onClick={() => setLightbox(true)}
              style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: '1.5rem', border: '1px solid var(--border)', cursor: 'zoom-in' }}
            >
              <img
                src={enhancedUrl}
                alt="Upravená fotografie"
                style={{ width: '100%', display: 'block', transition: 'transform 0.4s ease' }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              />
              {/* Zoom hint */}
              <div style={{
                position: 'absolute', top: 12, right: 12,
                background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8, padding: '6px 10px',
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, color: '#fff', fontWeight: 500,
                pointerEvents: 'none',
              }}>
                <span style={{ fontSize: 14 }}>🔍</span> Klikněte pro přiblížení
              </div>
              {/* Bottom overlay */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                padding: '2rem 1rem 1rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
              }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Náhled s vodoznakem</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{PRICE_CZK} Kč</span>
              </div>
            </div>

            {/* Checkout karta */}
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem', marginBottom: '1rem', textAlign: 'left' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '1rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                Dokončit objednávku
              </p>

              <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Email pro zaslání potvrzení <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="email"
                placeholder="vas@email.cz"
                value={email}
                onChange={e => { setEmail(e.target.value); setEmailError(''); }}
                style={{
                  width: '100%', padding: '11px 14px',
                  background: 'var(--bg)',
                  border: `1px solid ${emailError ? '#ef4444' : 'var(--border)'}`,
                  borderRadius: 8, color: 'var(--text-primary)',
                  fontSize: 14, fontFamily: 'inherit',
                  boxSizing: 'border-box' as const, outline: 'none',
                  marginBottom: emailError ? 4 : 16,
                }}
              />
              {emailError && (
                <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 16 }}>{emailError}</p>
              )}

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={handleBuy}
                  className="btn btn-primary"
                  style={{ flex: 2, padding: '13px', fontSize: 15, fontWeight: 700, borderRadius: 8 }}
                >
                  Koupit & Stáhnout — {PRICE_CZK} Kč
                </button>
                <a
                  href="/"
                  className="btn"
                  style={{ flex: 1, padding: '13px', fontSize: 14, textAlign: 'center' as const, borderRadius: 8 }}
                >
                  Další foto
                </a>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: '0.75rem', justifyContent: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>🔒 Zabezpečená platba</span>
                <span style={{ color: 'var(--border)' }}>·</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Dostupné 7 dní</span>
                <span style={{ color: 'var(--border)' }}>·</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Plné rozlišení</span>
              </div>
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <a href="/login" style={{ color: 'var(--accent)' }}>Přihlaste se</a>{' '}
              pro uložení do Moje fotografie a pohodlný přístup kdykoliv.
            </p>
          </>
        )}

        {/* ── Error ── */}
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

      {/* ── Lightbox ── */}
      {lightbox && (
        <div
          onClick={() => setLightbox(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.95)',
            backdropFilter: 'blur(12px)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {/* Toolbar */}
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0,
            padding: '16px 20px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'linear-gradient(rgba(0,0,0,0.6), transparent)',
          }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
              Náhled s vodoznakem
            </span>
            <button
              onClick={() => setLightbox(false)}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff', fontSize: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            >
              ✕
            </button>
          </div>

          {/* Fotka */}
          <img
            src={enhancedUrl!}
            alt="Náhled"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '90vw', maxHeight: '82vh',
              objectFit: 'contain', borderRadius: 8,
              boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
              animation: 'zoomIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              cursor: 'default',
            }}
          />

          {/* Bottom CTA */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            padding: '24px 20px',
            background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
            display: 'flex', justifyContent: 'center', gap: '0.75rem',
          }}>
            <button
              onClick={e => { e.stopPropagation(); setLightbox(false); }}
              className="btn btn-primary"
              style={{ padding: '12px 32px', fontSize: 14, fontWeight: 700 }}
            >
              Koupit & Stáhnout — {PRICE_CZK} Kč
            </button>
            <button
              onClick={e => { e.stopPropagation(); setLightbox(false); }}
              className="btn"
              style={{ padding: '12px 20px', fontSize: 14 }}
            >
              Zavřít
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes zoomIn {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </main>
  );
}