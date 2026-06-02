'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { API_URL } from '../lib/config';

function SuccessContent() {
  const searchParams = useSearchParams();
  const image_id = searchParams.get('image_id');
  const gopay_id = searchParams.get('gopay_id') || searchParams.get('id');
  
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!gopay_id || !image_id) {
      setStatus('error');
      return;
    }

    fetch(`${API_URL}/api/payments/verify/${gopay_id}`)
      .then(res => res.json())
      .then(data => {
        if (data.paid) {
          setDownloadUrl(`${API_URL}/api/enhance/enhanced/${image_id}?preview=false`);
          setStatus('ready');

          // GA4: track dokončenou platbu
          if (typeof window !== 'undefined' && (window as any).trackEvent) {
            (window as any).trackEvent('purchase', {
              event_category: 'ecommerce',
              transaction_id: gopay_id,
              currency: 'CZK',
              value: (data.count ?? 1) * 25,
              items: [{
                item_name: 'HDR fotografie',
                quantity: data.count ?? 1,
                price: 25,
                currency: 'CZK',
              }],
            });
          }
        } else {
          setStatus('error');
        }
      })
      .catch(() => setStatus('error'));
  }, [gopay_id, image_id]);

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '2rem',
    }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>

        {status === 'loading' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Ověřuji platbu...
            </p>
            <div style={{ height: 2, background: 'var(--progress-bg)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: '60%',
                background: 'var(--accent)', borderRadius: 999,
                animation: 'shimmer 1.5s infinite',
              }} />
            </div>
          </>
        )}

        {status === 'ready' && downloadUrl && (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--accent-muted)',
              border: '1px solid var(--accent-glow)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, margin: '0 auto 1.5rem',
              color: 'var(--accent)',
            }}>
              ✓
            </div>
            <h1 style={{
              fontSize: '1.75rem', fontWeight: 700,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)', marginBottom: '0.75rem',
            }}>
              Platba proběhla úspěšně
            </h1>
            <p style={{
              fontSize: 14, color: 'var(--text-secondary)',
              marginBottom: '2rem', lineHeight: 1.7,
            }}>
              Vaše fotografie je připravena ke stažení v plném rozlišení.
            </p>
            <a
              href={downloadUrl}
              download
              className="btn btn-primary"
              style={{ fontSize: 14, padding: '0.875rem 2.5rem' }}
            >
              Stáhnout fotografii
            </a>
            <div style={{ marginTop: '1.5rem' }}>
              <a href="/" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Zpět na hlavní stránku
              </a>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 style={{
              fontSize: '1.75rem', fontWeight: 700,
              color: 'var(--text-primary)', marginBottom: '0.75rem',
            }}>
              Něco se pokazilo
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: '2rem' }}>
              Nepodařilo se ověřit platbu. Kontaktujte nás na info@fasthdr.cz
            </p>
            <a href="/" className="btn">Zpět na hlavní stránku</a>
          </>
        )}

      </div>
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Načítám...</p>
      </main>
    }>
      <SuccessContent />
    </Suspense>
  );
}