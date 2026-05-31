'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { API_URL } from '../../lib/config';

type Status = 'loading' | 'processing' | 'done' | 'error';

const PRICE_CZK = parseInt(process.env.NEXT_PUBLIC_PRICE_CZK || '25');

function isValidIco(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) return false;
  const d = ico.split('').map(Number);
  const sum = d.slice(0, 7).reduce((acc, v, i) => acc + v * (8 - i), 0);
  const rem = sum % 11;
  const check = rem === 0 ? 1 : rem === 1 ? 0 : 11 - rem;
  return check === d[7];
}

async function fetchAres(ico: string): Promise<{
  name?: string; street?: string; city?: string; zip?: string; dic?: string;
} | null> {
  try {
    const res = await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`);
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.sidlo;
    return {
      name: data.obchodniJmeno ?? '',
      street: addr ? `${addr.nazevUlice ?? addr.nazevObce ?? ''} ${addr.cisloDomovni ?? ''}`.trim() : '',
      city: addr?.nazevObce ?? '',
      zip: addr?.psc ? String(addr.psc) : '',
      dic: data.dic ?? '',
    };
  } catch { return null; }
}

interface GroupState {
  groupId: string;
  orderId: string;
  status: Status;
  enhancedUrl: string | null;
  progress: number;
  isHdrPending: boolean;
}

// ── Skeleton shimmer pro načítající se foto ───────────────────────────────────
function PhotoSkeleton() {
  return (
    <div style={{
      width: '100%', paddingBottom: '66%', position: 'relative',
      borderRadius: 12, overflow: 'hidden', background: 'var(--bg-secondary)',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-card, #1a1a2e) 50%, var(--bg-secondary) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
      }} />
      <style>{`@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
    </div>
  );
}

// ── Foto s loaderem ───────────────────────────────────────────────────────────
function PhotoWithLoader({ src, alt, onClick, isSelected, showOverlay, price }: {
  src: string; alt: string; onClick: () => void;
  isSelected: boolean; showOverlay: boolean; price: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative', borderRadius: 12, overflow: 'hidden',
        border: isSelected ? '2px solid #7B5CF0' : '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease',
      }}
    >
      {/* Skeleton dokud se foto nenačte */}
      {!loaded && !error && <PhotoSkeleton />}

      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => { setLoaded(true); setError(true); }}
        style={{
          width: '100%', display: loaded ? 'block' : 'none',
          transition: 'transform 0.4s ease',
        }}
        onMouseEnter={e => { if (!showOverlay) (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.03)'; }}
        onMouseLeave={e => (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)'}
      />

      {/* Checkmark v levém horním rohu */}
      {loaded && showOverlay && (
        <div style={{
          position: 'absolute', top: 10, left: 10,
          width: 26, height: 26, borderRadius: 6,
          background: isSelected ? '#7B5CF0' : 'rgba(0,0,0,0.45)',
          border: isSelected ? 'none' : '2px solid rgba(255,255,255,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s ease',
          backdropFilter: 'blur(4px)',
        }}>
          {isSelected && <span style={{ color: '#fff', fontSize: 14, lineHeight: 1 }}>✓</span>}
        </div>
      )}

      {/* Lupa badge vpravo nahoře — pouze když NENÍ v selection módu */}
      {loaded && !showOverlay && (
        <div style={{
          position: 'absolute', top: 12, right: 12,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
          padding: '6px 10px', display: 'flex', alignItems: 'center',
          gap: 5, fontSize: 12, color: '#fff', fontWeight: 500,
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 14 }}>🔍</span> Klikněte pro přiblížení
        </div>
      )}

      {/* Spodní overlay — výběr/cena v multi módu, nebo jen info v single módu */}
      {loaded && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: isSelected
            ? 'rgba(123,92,240,0.85)'
            : 'linear-gradient(transparent, rgba(0,0,0,0.7))',
          padding: showOverlay ? '10px 14px' : '2rem 1rem 1rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          transition: 'background 0.2s ease',
        }}>
          {showOverlay ? (
            <>
              <span style={{ fontSize: 13, color: '#fff', fontWeight: isSelected ? 600 : 400, opacity: isSelected ? 1 : 0.7 }}>
                {isSelected ? 'Vybráno ke koupi' : 'Klikněte pro výběr'}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{price} Kč</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Náhled s vodoznakem</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{price} Kč</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OrderPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const primaryId = params.imageId as string;

  const groupsParam = searchParams.get('groups');
  const allGroupIds: string[] = [
    primaryId,
    ...(groupsParam ? groupsParam.split(',').filter(Boolean) : []),
  ];

  const [groups, setGroups] = useState<GroupState[]>(() =>
    allGroupIds.map(id => ({
      groupId: id,
      orderId: id.startsWith('hdr_pending_') ? id.replace('hdr_pending_', '') : id,
      status: 'loading' as Status,
      enhancedUrl: null,
      progress: 0,
      isHdrPending: id.startsWith('hdr_pending_'),
    }))
  );

  const [activeIdx, setActiveIdx] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState(false);
  const prefetchedRef = useRef<Set<string>>(new Set());

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [consentError, setConsentError] = useState('');

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
  const [buyLoading, setBuyLoading] = useState(false);

  const updateGroup = (groupId: string, patch: Partial<GroupState>) => {
    setGroups(prev => prev.map(g => g.groupId === groupId ? { ...g, ...patch } : g));
  };

  // ── Prefetch sousedních fotek ─────────────────────────────────────────────
  useEffect(() => {
    const toPrefetch = [activeIdx - 1, activeIdx, activeIdx + 1, activeIdx + 2]
      .filter(i => i >= 0 && i < groups.length)
      .map(i => groups[i])
      .filter(g => g?.enhancedUrl && !prefetchedRef.current.has(g.groupId));

    toPrefetch.forEach(g => {
      if (!g.enhancedUrl) return;
      const img = new Image();
      img.src = g.enhancedUrl;
      prefetchedRef.current.add(g.groupId);
    });
  }, [activeIdx, groups]);

  // ── Polling pro každou skupinu ────────────────────────────────────────────
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    groups.forEach(group => {
      let progressInterval: ReturnType<typeof setInterval>;
      let pollInterval: ReturnType<typeof setInterval>;

      progressInterval = setInterval(() => {
        setGroups(prev => prev.map(g =>
          g.groupId === group.groupId && g.status !== 'done' && g.status !== 'error'
            ? { ...g, progress: Math.min(g.progress + Math.random() * 2, 90) }
            : g
        ));
      }, 1000);

      if (group.isHdrPending) {
        pollInterval = setInterval(async () => {
          try {
            const res = await fetch(`${API_URL}/api/enhance/hdr/order/${group.orderId}/status`);
            const { is_merging, is_processing, image_ids } = await res.json();
            const done = !is_merging && !is_processing && image_ids?.length > 0;
            if (done) {
              clearInterval(pollInterval);
              clearInterval(progressInterval);

              if (image_ids.length === 1) {
                const finalImageId = image_ids[0];
                setGroups(prev => prev.map(g =>
                  g.groupId === group.groupId
                    ? { ...g, groupId: finalImageId, status: 'done', progress: 100,
                        enhancedUrl: `${API_URL}/api/enhance/enhanced/${finalImageId}`,
                        isHdrPending: false }
                    : g
                ));
              } else {
                const newGroups: GroupState[] = image_ids.map((id: string) => ({
                  groupId: id, orderId: id, status: 'done' as Status,
                  enhancedUrl: `${API_URL}/api/enhance/enhanced/${id}`,
                  progress: 100, isHdrPending: false,
                }));
                setGroups(prev => [
                  ...prev.filter(g => g.groupId !== group.groupId),
                  ...newGroups,
                ]);
              }
            } else {
              updateGroup(group.groupId, { status: 'processing' });
            }
          } catch {
            clearInterval(pollInterval);
            clearInterval(progressInterval);
            updateGroup(group.groupId, { status: 'error' });
          }
        }, 3000);
      } else {
        pollInterval = setInterval(async () => {
          try {
            const res = await fetch(`${API_URL}/api/enhance/status/${group.groupId}`);
            const { status: apiStatus } = await res.json();
            if (apiStatus === 'processed') {
              clearInterval(pollInterval);
              clearInterval(progressInterval);
              updateGroup(group.groupId, {
                status: 'done', progress: 100,
                enhancedUrl: `${API_URL}/api/enhance/enhanced/${group.groupId}`,
              });
            } else if (apiStatus === 'failed' || apiStatus === 'error') {
              clearInterval(pollInterval);
              clearInterval(progressInterval);
              updateGroup(group.groupId, { status: 'error' });
            } else {
              updateGroup(group.groupId, { status: 'processing' });
            }
          } catch {
            clearInterval(pollInterval);
            clearInterval(progressInterval);
            updateGroup(group.groupId, { status: 'error' });
          }
        }, 3000);
      }

      cleanups.push(() => {
        clearInterval(progressInterval);
        clearInterval(pollInterval);
      });
    });

    return () => cleanups.forEach(fn => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Timeout pojistka ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      setGroups(prev => prev.map(g =>
        g.status !== 'done' ? { ...g, status: 'error' } : g
      ));
    }, 10 * 60 * 1000);
    return () => clearTimeout(t);
  }, []);

  // ── ARES ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isValidIco(billingIco)) { setAresStatus('idle'); return; }
    setIcoError('');
    let cancelled = false;
    setAresLoading(true);
    fetchAres(billingIco).then(data => {
      if (cancelled) return;
      setAresLoading(false);
      if (!data) { setAresStatus('notfound'); return; }
      setAresStatus('ok');
      if (data.name) setBillingName(data.name);
      if (data.street) setBillingStreet(data.street);
      if (data.city) setBillingCity(data.city);
      if (data.zip) setBillingZip(data.zip);
      if (data.dic) setBillingDic(data.dic);
    });
    return () => { cancelled = true; };
  }, [billingIco]);

  // ── Klávesnice carousel ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setActiveIdx(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setActiveIdx(i => Math.min(groups.length - 1, i + 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [groups.length]);

  // ── Auto-select hotových skupin ───────────────────────────────────────────
  useEffect(() => {
    const doneIds = groups.filter(g => g.status === 'done').map(g => g.groupId);
    if (doneIds.length > 0) {
      setSelected(prev => {
        const next = new Set(prev);
        doneIds.forEach(id => next.add(id));
        return next;
      });
    }
  }, [groups]);

  // ── Platba ────────────────────────────────────────────────────────────────
  const handleBuy = async () => {
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailValid) { setEmailError('Zadejte prosím platný email'); return; }
    setEmailError('');
    if (!agreedToTerms || !agreedToPrivacy) {
      setConsentError('Pro dokončení objednávky je nutné odsouhlasit oba body níže.');
      return;
    }
    setConsentError('');
    if (wantsInvoice && billingIco && !isValidIco(billingIco)) {
      setIcoError('Neplatné IČO — zkontrolujte prosím zadané číslo');
      return;
    }
    setIcoError('');

    const selectedGroups = groups.filter(g => selected.has(g.groupId) && g.status === 'done');
    if (selectedGroups.length === 0) return;

    setBuyLoading(true);
    try {
      if (wantsInvoice || billingIco) {
        await fetch(`${API_URL}/api/billing/save-details`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_id: selectedGroups[0].groupId,
            wants_invoice: wantsInvoice,
            billing_name: billingName || null,
            billing_ico: billingIco || null,
            billing_dic: billingDic || null,
            billing_street: billingStreet || null,
            billing_city: billingCity || null,
            billing_zip: billingZip || null,
            billing_country: 'CZ',
          }),
        });
      }

      const imageIds = selectedGroups.map(g => g.groupId);
      const res = await fetch(`${API_URL}/api/payments/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_id: imageIds[0],
          image_ids: imageIds,
          filename: imageIds.length > 1 ? `${imageIds.length} HDR fotografií` : 'fotografie.jpg',
          user_id: null,
          email,
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error('Chyba při vytváření platby:', err);
    } finally {
      setBuyLoading(false);
    }
  };

  // ── Computed ──────────────────────────────────────────────────────────────
  const activeGroup = groups[activeIdx];
  const allDone = groups.every(g => g.status === 'done' || g.status === 'error');
  const anyDone = groups.some(g => g.status === 'done');
  const allFailed = groups.every(g => g.status === 'error');
  const selectedDoneGroups = groups.filter(g => selected.has(g.groupId) && g.status === 'done');
  const totalPrice = selectedDoneGroups.length * PRICE_CZK;
  const canBuy = selectedDoneGroups.length > 0 && agreedToTerms && agreedToPrivacy;
  const currentlyMultiGroup = groups.length > 1;

  const toggleSelect = (groupId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const doneIds = groups.filter(g => g.status === 'done').map(g => g.groupId);
    const allSelected = doneIds.every(id => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(doneIds));
  };

  const inputStyle = (hasError = false): React.CSSProperties => ({
    width: '100%', padding: '11px 14px', background: 'var(--bg)',
    border: `1px solid ${hasError ? '#ef4444' : 'var(--border)'}`,
    borderRadius: 8, color: 'var(--text-primary)', fontSize: 14,
    fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
  });

  const labelStyle: React.CSSProperties = {
    fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6,
  };

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '2rem',
    }}>
      <a href="/" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3rem', textDecoration: 'none' }}>
        FASTHDR
      </a>

      <div style={{ maxWidth: 580, width: '100%', textAlign: 'center' }}>

        {allFailed ? (
          <>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 1.5rem' }}>✗</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Zpracování selhalo</h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.6 }}>
              {currentlyMultiGroup ? 'Bohužel se nepodařilo zpracovat žádnou z HDR skupin.' : 'Omlouváme se, došlo k chybě při zpracování fotografie.'}<br />
              Zkuste to prosím znovu nebo nás kontaktujte na{' '}
              <a href="mailto:info@fasthdr.cz" style={{ color: 'var(--accent)' }}>info@fasthdr.cz</a>.
            </p>
            <a href="/" className="btn btn-primary" style={{ padding: '10px 24px', fontSize: 14 }}>Zkusit znovu</a>
          </>
        ) : (
          <>
            {/* ── Hlavička ── */}
            {allDone && anyDone ? (
              <>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 1.5rem' }}>✓</div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  {currentlyMultiGroup
                    ? `${groups.filter(g => g.status === 'done').length} z ${groups.length} fotografií připraveno!`
                    : 'Fotografie je připravena!'}
                </h2>
              </>
            ) : (
              <>
                <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 999, overflow: 'hidden', marginBottom: '2rem' }}>
                  <div style={{ height: '100%', width: `${activeGroup?.progress ?? 0}%`, background: 'var(--accent)', borderRadius: 999, transition: 'width 1s ease' }} />
                </div>
                <div style={{ width: 48, height: 48, border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', margin: '0 auto 1.5rem', animation: 'spin 1s linear infinite' }} />
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  {currentlyMultiGroup ? 'Zpracováváme vaše HDR fotografie…' : 'Zpracováváme vaši fotografii…'}
                </h2>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '2rem' }}>
                  AI zpracování obvykle trvá 1–3 minuty.<br />
                  Tuto stránku neopouštějte — výsledek se zobrazí automaticky.
                </p>
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '2rem' }}>
                  💡 <a href="/login" style={{ color: 'var(--accent)' }}>Přihlaste se</a> a výsledky se vám uloží do Moje fotografie.
                </div>
              </>
            )}

            {/* ── Carousel / Náhled ── */}
            {anyDone && (
              <div style={{ marginBottom: '1.5rem' }}>

                {/* ── Navigace — POUZE nahoře, bez chevronů přes obrázek ── */}
                {currentlyMultiGroup && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <button
                      onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
                      disabled={activeIdx === 0}
                      style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: activeIdx === 0 ? 'not-allowed' : 'pointer', opacity: activeIdx === 0 ? 0.3 : 1, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >‹</button>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
                      Skupina {activeIdx + 1} / {groups.length}
                    </span>
                    <button
                      onClick={() => setActiveIdx(i => Math.min(groups.length - 1, i + 1))}
                      disabled={activeIdx === groups.length - 1}
                      style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: activeIdx === groups.length - 1 ? 'not-allowed' : 'pointer', opacity: activeIdx === groups.length - 1 ? 0.3 : 1, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >›</button>
                  </div>
                )}

                {/* ── Foto s varianta C výběrem ── */}
                {activeGroup?.status === 'done' && activeGroup.enhancedUrl ? (
                  <PhotoWithLoader
                    src={activeGroup.enhancedUrl}
                    alt="Upravená fotografie"
                    isSelected={selected.has(activeGroup.groupId)}
                    showOverlay={currentlyMultiGroup}
                    price={PRICE_CZK}
                    onClick={() => {
                      if (currentlyMultiGroup) {
                        // Klik na foto = výběr/zrušení (varianta C)
                        toggleSelect(activeGroup.groupId);
                      } else {
                        // Single foto — klik = lightbox
                        setLightbox(true);
                      }
                    }}
                  />
                ) : activeGroup?.status === 'processing' || activeGroup?.status === 'loading' ? (
                  <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)', height: 240, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {currentlyMultiGroup ? `Zpracovávám skupinu ${activeIdx + 1}…` : 'Zpracovávám…'}
                    </p>
                  </div>
                ) : activeGroup?.status === 'error' ? (
                  <div style={{ borderRadius: 12, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ fontSize: 13, color: '#ef4444' }}>
                      {currentlyMultiGroup ? `Zpracování skupiny ${activeIdx + 1} selhalo` : 'Zpracování selhalo'}
                    </p>
                  </div>
                ) : null}

                {/* Slider dots */}
                {currentlyMultiGroup && (
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                    {groups.map((g, i) => (
                      <div
                        key={g.groupId}
                        onClick={() => setActiveIdx(i)}
                        title={`Skupina ${i + 1}${g.status === 'done' ? ' — hotovo' : g.status === 'error' ? ' — chyba' : ' — zpracovávám'}`}
                        style={{
                          width: i === activeIdx ? 20 : 8, height: 8, borderRadius: 4,
                          background: g.status === 'error' ? '#ef4444'
                            : selected.has(g.groupId) ? 'var(--accent)'
                            : g.status === 'done' ? 'rgba(var(--accent-rgb,100,200,255),0.4)'
                            : 'var(--border)',
                          cursor: 'pointer', transition: 'all 0.2s ease',
                          outline: i === activeIdx ? '2px solid var(--accent)' : 'none',
                          outlineOffset: 2,
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Vybrat vše */}
                {currentlyMultiGroup && groups.some(g => g.status === 'done') && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: '0.75rem' }}>
                    <div
                      onClick={toggleSelectAll}
                      style={{
                        width: 18, height: 18, borderRadius: 4,
                        border: `2px solid ${groups.filter(g => g.status === 'done').every(g => selected.has(g.groupId)) ? 'var(--accent)' : 'var(--border)'}`,
                        background: groups.filter(g => g.status === 'done').every(g => selected.has(g.groupId)) ? 'var(--accent)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', transition: 'all 0.15s ease', flexShrink: 0,
                      }}
                    >
                      {groups.filter(g => g.status === 'done').every(g => selected.has(g.groupId)) && <span style={{ color: '#000', fontSize: 11, lineHeight: 1 }}>✓</span>}
                    </div>
                    <span onClick={toggleSelectAll} style={{ fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                      Vybrat vše ({groups.filter(g => g.status === 'done').length} hotových)
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── Checkout formulář ── */}
            {anyDone && (
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem', marginBottom: '1rem', textAlign: 'left' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Dokončit objednávku
                </p>

                {currentlyMultiGroup && (
                  <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, background: selectedDoneGroups.length > 0 ? 'rgba(var(--accent-rgb,100,200,255),0.06)' : 'var(--bg)', border: `1px solid ${selectedDoneGroups.length > 0 ? 'var(--accent)' : 'var(--border)'}`, transition: 'all 0.2s ease' }}>
                    {selectedDoneGroups.length > 0 ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
                          {selectedDoneGroups.length} {selectedDoneGroups.length === 1 ? 'fotografie' : 'fotografie'} vybrány
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{totalPrice} Kč</span>
                      </div>
                    ) : (
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
                        Klikněte na fotografie které chcete zakoupit
                      </p>
                    )}
                  </div>
                )}

                <label style={labelStyle}>Email pro zaslání potvrzení <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="email" placeholder="vas@email.cz" value={email}
                  onChange={e => { setEmail(e.target.value); setEmailError(''); }}
                  style={{ ...inputStyle(!!emailError), marginBottom: emailError ? 4 : 16 }}
                />
                {emailError && <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 16 }}>{emailError}</p>}

                <div onClick={() => setWantsInvoice(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${wantsInvoice ? 'var(--accent)' : 'var(--border)'}`, background: wantsInvoice ? 'rgba(var(--accent-rgb,100,200,255),0.06)' : 'var(--bg)', cursor: 'pointer', marginBottom: 16, transition: 'all 0.2s ease', userSelect: 'none' }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `2px solid ${wantsInvoice ? 'var(--accent)' : 'var(--border)'}`, background: wantsInvoice ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease' }}>
                    {wantsInvoice && <span style={{ color: '#000', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                  </div>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Chci fakturu na firmu</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>(nepovinné)</span>
                  </div>
                </div>

                <div style={{ overflow: 'hidden', maxHeight: wantsInvoice ? 600 : 0, opacity: wantsInvoice ? 1 : 0, transition: 'max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease', marginBottom: wantsInvoice ? 16 : 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
                    <div>
                      <label style={labelStyle}>IČO <span style={{ color: '#ef4444' }}>*</span></label>
                      <div style={{ position: 'relative' }}>
                        <input type="text" placeholder="12345678" value={billingIco} maxLength={8}
                          onChange={e => { const v = e.target.value.replace(/\D/g, ''); setBillingIco(v); setIcoError(''); setAresStatus('idle'); }}
                          style={{ ...inputStyle(!!icoError), paddingRight: aresLoading ? 40 : 14 }}
                        />
                        {aresLoading && <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, border: '2px solid var(--border)', borderTop: '2px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                        {aresStatus === 'ok' && !aresLoading && <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 600, color: '#4ade80', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 4, padding: '2px 7px' }}>✓ ARES</div>}
                      </div>
                      {icoError && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{icoError}</p>}
                      {aresStatus === 'ok' && !aresLoading && <p style={{ fontSize: 12, color: '#4ade80', marginTop: 4 }}>Údaje doplněny z ARES</p>}
                      {aresStatus === 'notfound' && !aresLoading && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>IČO nenalezeno — vyplňte ručně</p>}
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '4px 0 16px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={agreedToTerms} onChange={e => { setAgreedToTerms(e.target.checked); setConsentError(''); }}
                      style={{ marginTop: 2, accentColor: 'var(--accent)', flexShrink: 0, width: 16, height: 16 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      Souhlasím s{' '}<a href="/podminky" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Všeobecnými obchodními podmínkami</a>{' '}
                      a výslovně žádám o zahájení zpracování před uplynutím lhůty pro odstoupení od smlouvy.
                      Beru na vědomí, že tímto ztrácím právo na odstoupení od smlouvy.{' '}
                      <span style={{ color: '#ef4444' }}>*</span>
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={agreedToPrivacy} onChange={e => { setAgreedToPrivacy(e.target.checked); setConsentError(''); }}
                      style={{ marginTop: 2, accentColor: 'var(--accent)', flexShrink: 0, width: 16, height: 16 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      Souhlasím se{' '}<a href="/ochrana-soukromi" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Zásadami ochrany osobních údajů</a>{' '}
                      a beru na vědomí, že nahrané fotografie budou uloženy po dobu maximálně 7 dnů a poté trvale smazány.{' '}
                      <span style={{ color: '#ef4444' }}>*</span>
                    </span>
                  </label>
                  {consentError && <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{consentError}</p>}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={handleBuy} className="btn btn-primary" disabled={!canBuy || buyLoading}
                    style={{ flex: 2, padding: '13px', fontSize: 15, fontWeight: 700, borderRadius: 8, opacity: (!canBuy || buyLoading) ? 0.5 : 1, cursor: (!canBuy || buyLoading) ? 'not-allowed' : 'pointer' }}
                  >
                    {buyLoading ? 'Načítám…'
                      : currentlyMultiGroup && selectedDoneGroups.length > 0
                        ? `Koupit ${selectedDoneGroups.length} ${selectedDoneGroups.length === 1 ? 'fotografii' : 'fotografie'} — ${totalPrice} Kč`
                        : `Koupit & Stáhnout — ${PRICE_CZK} Kč`}
                  </button>
                  <a href="/" className="btn" style={{ flex: 1, padding: '13px', fontSize: 14, textAlign: 'center', borderRadius: 8 }}>
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
            )}

            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <a href="/login" style={{ color: 'var(--accent)' }}>Přihlaste se</a>{' '}
              pro uložení do Moje fotografie a pohodlný přístup kdykoliv.
            </p>
          </>
        )}
      </div>

      {/* Lightbox — pouze pro single foto */}
      {lightbox && activeGroup?.enhancedUrl && (
        <div onClick={() => setLightbox(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', animation: 'fadeIn 0.2s ease' }}>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(rgba(0,0,0,0.6), transparent)' }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>Náhled s vodoznakem</span>
            <button onClick={() => setLightbox(false)} style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
          <img src={activeGroup.enhancedUrl} alt="Náhled" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 30px 80px rgba(0,0,0,0.6)', animation: 'zoomIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)', cursor: 'default' }} />
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

export default function OrderPage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 48, height: 48, border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </main>
    }>
      <OrderPageInner />
    </Suspense>
  );
}