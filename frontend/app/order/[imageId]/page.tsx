'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { API_URL } from '../../lib/config';

type Status = 'loading' | 'processing' | 'done' | 'error';

const PRICE_CZK = parseInt(process.env.NEXT_PUBLIC_PRICE_CZK || '25');

// ─── IČO validace (modulo 11) ─────────────────────────────────────────────────
function isValidIco(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) return false;
  const d = ico.split('').map(Number);
  const sum = d.slice(0, 7).reduce((acc, v, i) => acc + v * (8 - i), 0);
  const rem = sum % 11;
  const check = rem === 0 ? 1 : rem === 1 ? 0 : 11 - rem;
  return check === d[7];
}

// ─── ARES lookup ──────────────────────────────────────────────────────────────
async function fetchAres(ico: string): Promise<{
  name?: string; street?: string; city?: string; zip?: string; dic?: string;
} | null> {
  try {
    const res = await fetch(
      `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.sidlo;
    return {
      name:   data.obchodniJmeno ?? '',
      street: addr ? `${addr.nazevUlice ?? addr.nazevObce ?? ''} ${addr.cisloDomovni ?? ''}`.trim() : '',
      city:   addr?.nazevObce ?? '',
      zip:    addr?.psc ? String(addr.psc) : '',
      dic:    data.dic ?? '',
    };
  } catch {
    return null;
  }
}

export default function OrderPage() {
  const params = useParams();
  const imageId = params.imageId as string;

  const [status, setStatus] = useState<Status>('loading');
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  // Základní kontaktní údaje
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  // Souhlas s VOP — povinný pro GoPay
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [consentError, setConsentError] = useState('');

  // Fakturační sekce
  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [billingName, setBillingName] = useState('');
  const [billingIco, setBillingIco] = useState('');
  const [billingDic, setBillingDic] = useState('');
  const [billingStreet, setBillingStreet] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingZip, setBillingZip] = useState('');
  const [icoError, setIcoError] = useState('');
  const [aresLoading, setAresLoading] = useState(false);
  const [aresStatus, setAresStatus] = useState<'idle' | 'ok' | 'notfound'>('idle');

  const isHdr = imageId?.startsWith('hdr_pending_');
  const orderId = isHdr ? imageId.replace('hdr_pending_', '') : null;

  // ── Polling ────────────────────────────────────────────────────────────────

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

  // ── ARES auto-lookup při validním IČO ────────────────────────────────────

  useEffect(() => {
    if (!isValidIco(billingIco)) {
      setAresStatus('idle');
      return;
    }
    setIcoError('');
    let cancelled = false;
    setAresLoading(true);
    fetchAres(billingIco).then(data => {
      if (cancelled) return;
      setAresLoading(false);
      if (!data) { setAresStatus('notfound'); return; }
      setAresStatus('ok');
      if (data.name)   setBillingName(data.name);
      if (data.street) setBillingStreet(data.street);
      if (data.city)   setBillingCity(data.city);
      if (data.zip)    setBillingZip(data.zip);
      if (data.dic)    setBillingDic(data.dic);
    });
    return () => { cancelled = true; };
  }, [billingIco]);

  // ── Platba ────────────────────────────────────────────────────────────────

  const handleBuy = async () => {
    // Validace emailu
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailValid) {
      setEmailError('Zadejte prosím platný email');
      return;
    }
    setEmailError('');

    // Validace souhlasů
    if (!agreedToTerms || !agreedToPrivacy) {
      setConsentError('Pro dokončení objednávky je nutné odsouhlasit oba body níže.');
      return;
    }
    setConsentError('');

    // Validace IČO pokud chce fakturu
    if (wantsInvoice && billingIco && !isValidIco(billingIco)) {
      setIcoError('Neplatné IČO — zkontrolujte prosím zadané číslo');
      return;
    }
    setIcoError('');

    try {
      // Nejdřív ulož fakturační údaje
      if (wantsInvoice || billingIco) {
        await fetch(`${API_URL}/api/billing/save-details`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_id:       imageId,
            wants_invoice:  wantsInvoice,
            billing_name:   billingName   || null,
            billing_ico:    billingIco    || null,
            billing_dic:    billingDic    || null,
            billing_street: billingStreet || null,
            billing_city:   billingCity   || null,
            billing_zip:    billingZip    || null,
            billing_country: 'CZ',
          }),
        });
      }

      // Pak vytvoř checkout
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

  // ── Input style helper ────────────────────────────────────────────────────

  const inputStyle = (hasError = false): React.CSSProperties => ({
    width: '100%',
    padding: '11px 14px',
    background: 'var(--bg)',
    border: `1px solid ${hasError ? '#ef4444' : 'var(--border)'}`,
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 14,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    outline: 'none',
  });

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: 'var(--text-muted)',
    display: 'block',
    marginBottom: 6,
  };

  // ── Render ─────────────────────────────────────────────────────────────────

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
              <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#fff', fontWeight: 500, pointerEvents: 'none' }}>
                <span style={{ fontSize: 14 }}>🔍</span> Klikněte pro přiblížení
              </div>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', padding: '2rem 1rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Náhled s vodoznakem</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{PRICE_CZK} Kč</span>
              </div>
            </div>

            {/* ── Checkout karta ── */}
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem', marginBottom: '1rem', textAlign: 'left' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Dokončit objednávku
              </p>

              {/* Email */}
              <label style={labelStyle}>
                Email pro zaslání potvrzení <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="email"
                placeholder="vas@email.cz"
                value={email}
                onChange={e => { setEmail(e.target.value); setEmailError(''); }}
                style={{ ...inputStyle(!!emailError), marginBottom: emailError ? 4 : 16 }}
              />
              {emailError && (
                <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 16 }}>{emailError}</p>
              )}

              {/* ── Faktura checkbox ── */}
              <div
                onClick={() => setWantsInvoice(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${wantsInvoice ? 'var(--accent)' : 'var(--border)'}`,
                  background: wantsInvoice ? 'rgba(var(--accent-rgb,100,200,255),0.06)' : 'var(--bg)',
                  cursor: 'pointer',
                  marginBottom: 16,
                  transition: 'all 0.2s ease',
                  userSelect: 'none',
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                  border: `2px solid ${wantsInvoice ? 'var(--accent)' : 'var(--border)'}`,
                  background: wantsInvoice ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}>
                  {wantsInvoice && <span style={{ color: '#000', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                </div>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Chci fakturu na firmu</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>(nepovinné)</span>
                </div>
              </div>

              {/* ── Fakturační formulář ── */}
              <div style={{
                overflow: 'hidden',
                maxHeight: wantsInvoice ? 600 : 0,
                opacity: wantsInvoice ? 1 : 0,
                transition: 'max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease',
                marginBottom: wantsInvoice ? 16 : 0,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
                  <div>
                    <label style={labelStyle}>IČO <span style={{ color: '#ef4444' }}>*</span></label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="12345678"
                        value={billingIco}
                        maxLength={8}
                        onChange={e => {
                          const v = e.target.value.replace(/\D/g, '');
                          setBillingIco(v);
                          setIcoError('');
                          setAresStatus('idle');
                        }}
                        style={{ ...inputStyle(!!icoError), paddingRight: aresLoading ? 40 : 14 }}
                      />
                      {aresLoading && (
                        <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, border: '2px solid var(--border)', borderTop: '2px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      )}
                      {aresStatus === 'ok' && !aresLoading && (
                        <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 600, color: '#4ade80', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 4, padding: '2px 7px' }}>✓ ARES</div>
                      )}
                    </div>
                    {icoError && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{icoError}</p>}
                    {aresStatus === 'ok' && !aresLoading && <p style={{ fontSize: 12, color: '#4ade80', marginTop: 4 }}>Údaje doplněny z ARES</p>}
                    {aresStatus === 'notfound' && !aresLoading && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>IČO nenalezeno v ARES — vyplňte údaje ručně</p>}
                  </div>
                  <div>
                    <label style={labelStyle}>Název firmy / jméno <span style={{ color: '#ef4444' }}>*</span></label>
                    <input type="text" placeholder="Realitní makléř s.r.o." value={billingName} onChange={e => setBillingName(e.target.value)} style={inputStyle()} />
                  </div>
                  <div>
                    <label style={labelStyle}>DIČ <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(volitelné)</span></label>
                    <input type="text" placeholder="CZ12345678" value={billingDic} onChange={e => setBillingDic(e.target.value)} style={inputStyle()} />
                  </div>
                  <div>
                    <label style={labelStyle}>Ulice a č.p. <span style={{ color: '#ef4444' }}>*</span></label>
                    <input type="text" placeholder="Vinohradská 100" value={billingStreet} onChange={e => setBillingStreet(e.target.value)} style={inputStyle()} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Město <span style={{ color: '#ef4444' }}>*</span></label>
                      <input type="text" placeholder="Praha" value={billingCity} onChange={e => setBillingCity(e.target.value)} style={inputStyle()} />
                    </div>
                    <div>
                      <label style={labelStyle}>PSČ <span style={{ color: '#ef4444' }}>*</span></label>
                      <input type="text" placeholder="120 00" value={billingZip} maxLength={6} onChange={e => setBillingZip(e.target.value)} style={inputStyle()} />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Souhlas s VOP — POVINNÝ pro GoPay ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '4px 0 16px' }}>

                {/* Checkbox 1 — VOP + předčasné plnění */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={e => { setAgreedToTerms(e.target.checked); setConsentError(''); }}
                    style={{ marginTop: 2, accentColor: 'var(--accent)', flexShrink: 0, width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Souhlasím s{' '}
                    <a href="/podminky" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                      Všeobecnými obchodními podmínkami
                    </a>
                    {' '}a výslovně žádám o zahájení zpracování před uplynutím lhůty pro odstoupení od smlouvy.
                    Beru na vědomí, že tímto ztrácím právo na odstoupení od smlouvy.{' '}
                    <span style={{ color: '#ef4444' }}>*</span>
                  </span>
                </label>

                {/* Checkbox 2 — GDPR */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={agreedToPrivacy}
                    onChange={e => { setAgreedToPrivacy(e.target.checked); setConsentError(''); }}
                    style={{ marginTop: 2, accentColor: 'var(--accent)', flexShrink: 0, width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Souhlasím se{' '}
                    <a href="/ochrana-soukromi" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                      Zásadami ochrany osobních údajů
                    </a>
                    {' '}a beru na vědomí, že nahrané fotografie budou uloženy po dobu maximálně 7 dnů a poté trvale smazány.{' '}
                    <span style={{ color: '#ef4444' }}>*</span>
                  </span>
                </label>

                {consentError && (
                  <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{consentError}</p>
                )}
              </div>

              {/* ── CTA tlačítka ── */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={handleBuy}
                  className="btn btn-primary"
                  disabled={!agreedToTerms || !agreedToPrivacy}
                  style={{
                    flex: 2, padding: '13px', fontSize: 15, fontWeight: 700, borderRadius: 8,
                    opacity: (!agreedToTerms || !agreedToPrivacy) ? 0.5 : 1,
                    cursor: (!agreedToTerms || !agreedToPrivacy) ? 'not-allowed' : 'pointer',
                  }}
                >
                  Koupit & Stáhnout — {PRICE_CZK} Kč
                </button>
                <a
                  href="/"
                  className="btn"
                  style={{ flex: 1, padding: '13px', fontSize: 14, textAlign: 'center', borderRadius: 8 }}
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
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 1.5rem' }}>✗</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Zpracování selhalo</h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.6 }}>
              Omlouváme se, došlo k chybě při zpracování fotografie.<br />
              Zkuste to prosím znovu nebo nás kontaktujte na{' '}
              <a href="mailto:info@fasthdr.cz" style={{ color: 'var(--accent)' }}>info@fasthdr.cz</a>.
            </p>
            <a href="/" className="btn btn-primary" style={{ padding: '10px 24px', fontSize: 14 }}>Zkusit znovu</a>
          </>
        )}
      </div>

      {/* ── Lightbox ── */}
      {lightbox && (
        <div
          onClick={() => setLightbox(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', animation: 'fadeIn 0.2s ease' }}
        >
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(rgba(0,0,0,0.6), transparent)' }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>Náhled s vodoznakem</span>
            <button onClick={() => setLightbox(false)} style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
          <img src={enhancedUrl!} alt="Náhled" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 30px 80px rgba(0,0,0,0.6)', animation: 'zoomIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)', cursor: 'default' }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '24px 20px', background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
            <button onClick={e => { e.stopPropagation(); setLightbox(false); }} className="btn btn-primary" style={{ padding: '12px 32px', fontSize: 14, fontWeight: 700 }}>
              Koupit & Stáhnout — {PRICE_CZK} Kč
            </button>
            <button onClick={e => { e.stopPropagation(); setLightbox(false); }} className="btn" style={{ padding: '12px 20px', fontSize: 14 }}>Zavřít</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </main>
  );
}