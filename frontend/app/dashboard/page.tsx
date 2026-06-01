'use client';

import type { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import Header from '../components/Header';
import { API_URL } from '../lib/config';
import { supabase } from '../lib/supabase';

interface Order {
  id: string;
  image_id: string;
  filename: string;
  amount_czk: number;
  payment_status: string;
  created_at: string;
  expires_at: string;
  hdr_order_id: string | null;
  upload_batch_id: string | null;
  batch_name: string | null;
  uol_invoice_id: string | null;
  uol_invoice_pdf_url: string | null;
}

interface BatchGroup {
  batch_id: string;
  orders: Order[];
  name: string;
  created_at: string;
  isExpired: boolean;
  paidCount: number;
  totalCount: number;
}

interface LightboxState {
  orders: Order[];
  index: number;
}

const PAGE_SIZE = 10;

const SEARCH_PLACEHOLDERS = [
  'Hledat podle názvu…',
  'Např. DSC01220.ARW…',
  'Název souboru…',
];

const isHdrPending = (image_id: string) => image_id?.startsWith('hdr_pending_');

function groupOrders(orders: Order[]): BatchGroup[] {
  const map = new Map<string, Order[]>();
  for (const order of orders) {
    const key = order.upload_batch_id
      ?? (order.hdr_order_id ? `hdr_${order.hdr_order_id}` : `single_${order.id}`);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(order);
  }
  return Array.from(map.entries()).map(([batch_id, orders]) => {
    const sorted = [...orders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const firstName = sorted[0]?.filename ?? '';
    const baseName = firstName.replace(/\.[^.]+$/, '');
    const customName = sorted[0]?.batch_name;
    const name = customName || (orders.length > 1 ? `${baseName} + ${orders.length - 1} dalších` : firstName || 'Bez názvu');
    const isExpired = sorted.every(o => new Date(o.expires_at) < new Date());
    const paidCount = orders.filter(o => o.payment_status === 'paid').length;
    return { batch_id, orders: sorted, name, created_at: sorted[0]?.created_at ?? '', isExpired, paidCount, totalCount: orders.length };
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// ── Thumbnail s loaderem ──────────────────────────────────────────────────────
function DashboardThumb({
  imageId, filename, pending, isSelected, onClick, onLoaded,
}: {
  imageId: string; filename: string; pending: boolean;
  isSelected: boolean; onClick: () => void; onLoaded: (imageId: string) => void;
}) {
  const [imgState, setImgState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (pending || imgState !== 'error') return;
    const t = setTimeout(() => { setImgState('loading'); setRetryKey(k => k + 1); }, 8000);
    return () => clearTimeout(t);
  }, [imgState, pending]);

  const isLoaded = imgState === 'loaded';

  return (
    <div
      onClick={() => { if (!pending && isLoaded) onClick(); }}
      title={!pending && isLoaded ? 'Klikněte pro přiblížení' : undefined}
      style={{
        position: 'relative', width: '100%', paddingBottom: '75%',
        background: 'var(--bg-secondary)',
        cursor: (!pending && isLoaded) ? 'zoom-in' : 'default',
        overflow: 'hidden', borderRadius: 7, marginBottom: 8,
        outline: isSelected ? '2px solid #7B5CF0' : 'none',
        outlineOffset: '-2px', transition: 'outline 0.15s ease',
      }}
    >
      {(pending || !isLoaded) && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <div style={{
            width: 26, height: 26, border: '3px solid var(--border)',
            borderTop: '3px solid var(--accent)', borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: '0 8px', lineHeight: 1.4 }}>
            Zpracovává se…
          </span>
        </div>
      )}
      {!pending && (
        <img
          key={retryKey}
          src={`${API_URL}/api/enhance/enhanced/${imageId}?preview=true&quality=60`}
          alt={filename}
          onLoad={() => { setImgState('loaded'); onLoaded(imageId); }}
          onError={() => setImgState('error')}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', opacity: isLoaded ? 1 : 0,
            transition: 'opacity 0.3s ease, transform 0.3s ease',
          }}
          onMouseEnter={e => { if (isLoaded) (e.target as HTMLImageElement).style.transform = 'scale(1.05)'; }}
          onMouseLeave={e => { (e.target as HTMLImageElement).style.transform = 'scale(1)'; }}
        />
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'az' | 'za'>('newest');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [page, setPage] = useState(1);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [openBatches, setOpenBatches] = useState<Set<string>>(new Set());
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [editingBatch, setEditingBatch] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Sledujeme které image_id se úspěšně načetly (= Autoenhance zpracoval)
  // Skupina je "processing" dokud se aspoň jedna fotka nenačte
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const markLoaded = useCallback((imageId: string) => {
    setLoadedImages(prev => {
      if (prev.has(imageId)) return prev;
      const next = new Set(prev); next.add(imageId); return next;
    });
  }, []);

  // Skupina se zpracovává pokud obsahuje hdr_pending_ order.
  // Non-HDR nelze spolehlivě detekovat bez lazy load (thumbnaily se načítají
  // až po otevření skupiny) — locked skupina by nikdy nešla otevřít.
  // Proto lockujeme POUZE HDR pending skupiny.
  const isGroupProcessing = useCallback((group: BatchGroup): boolean => {
    if (group.isExpired) return false;
    return group.orders.some(o => isHdrPending(o.image_id));
  }, []);

  const [placeholderText, setPlaceholderText] = useState('');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const placeholderRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let charIdx = 0;
    let deleting = false;
    let currentPhrase = SEARCH_PLACEHOLDERS[placeholderIdx];
    const tick = () => {
      if (!deleting) {
        charIdx++;
        setPlaceholderText(currentPhrase.slice(0, charIdx));
        if (charIdx === currentPhrase.length) { deleting = true; placeholderRef.current = setTimeout(tick, 1800); }
        else placeholderRef.current = setTimeout(tick, 60);
      } else {
        charIdx--;
        setPlaceholderText(currentPhrase.slice(0, charIdx));
        if (charIdx === 0) {
          deleting = false;
          const next = (placeholderIdx + 1) % SEARCH_PLACEHOLDERS.length;
          setPlaceholderIdx(next);
          currentPhrase = SEARCH_PLACEHOLDERS[next];
          placeholderRef.current = setTimeout(tick, 400);
        } else placeholderRef.current = setTimeout(tick, 30);
      }
    };
    placeholderRef.current = setTimeout(tick, 600);
    return () => { if (placeholderRef.current) clearTimeout(placeholderRef.current); };
  }, [placeholderIdx]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/login'; return; }
      setUser(user);
      await supabase.from('orders').delete().eq('user_id', user.id).lt('expires_at', new Date().toISOString());
      const { data } = await supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      const loaded = (data ?? []) as Order[];
      setOrders(loaded);
      const groups = groupOrders(loaded);
      if (groups.length > 0) setOpenBatches(new Set([groups[0].batch_id]));
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (editingBatch && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingBatch]);

  useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox(prev => prev && prev.index < prev.orders.length - 1 ? { ...prev, index: prev.index + 1 } : prev);
      if (e.key === 'ArrowLeft') setLightbox(prev => prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox]);

  const openLightbox = (orders: Order[], index: number) => {
    if (isHdrPending(orders[index]?.image_id)) return;
    setLightbox({ orders, index });
  };

  const toggleBatch = (batchId: string) => {
    setOpenBatches(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  const toggleOrder = (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleSelectAll = (group: BatchGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    const groupIds = group.orders
      .filter(o => new Date(o.expires_at) > new Date() && !isHdrPending(o.image_id) && loadedImages.has(o.image_id))
      .map(o => o.id);
    const allSelected = groupIds.every(id => selectedOrders.has(id));
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (allSelected) groupIds.forEach(id => next.delete(id));
      else groupIds.forEach(id => next.add(id));
      return next;
    });
  };

  const startRename = (group: BatchGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBatch(group.batch_id);
    setEditingValue(group.name);
  };

  const saveRename = async (group: BatchGroup) => {
    const newName = editingValue.trim();
    setEditingBatch(null);
    if (!newName || newName === group.name) return;
    const imageIds = group.orders.map(o => o.id);
    await supabase.from('orders').update({ batch_name: newName }).in('id', imageIds).eq('user_id', user!.id);
    setOrders(prev => prev.map(o => imageIds.includes(o.id) ? { ...o, batch_name: newName } : o));
  };

  const cancelRename = () => { setEditingBatch(null); setEditingValue(''); };

  const getSelectedOrderObjects = () => orders.filter(o => selectedOrders.has(o.id));

  const selectedPaid = getSelectedOrderObjects().filter(o => o.payment_status === 'paid' && new Date(o.expires_at) > new Date());
  const selectedPending = getSelectedOrderObjects().filter(o =>
    o.payment_status !== 'paid' && new Date(o.expires_at) > new Date()
    && !isHdrPending(o.image_id) && loadedImages.has(o.image_id)
  );

  const handleBuySelected = async () => {
    if (!user || selectedPending.length === 0) return;
    const { data: consent } = await supabase.from('user_consents').select('agreed_to_terms_at').eq('user_id', user.id).single();
    if (!consent?.agreed_to_terms_at) { window.location.href = '/?consent=required'; return; }
    setCheckoutLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/payments/create-checkout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_ids: selectedPending.map(o => o.image_id),
          image_id: selectedPending[0].image_id,
          filename: `${selectedPending.length} fotografií`,
          user_id: user.id, email: user.email ?? null,
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally { setCheckoutLoading(false); }
  };

  const handleBuy = async (order: Order) => {
    if (!user) return;
    const { data: consent } = await supabase.from('user_consents').select('agreed_to_terms_at').eq('user_id', user.id).single();
    if (!consent?.agreed_to_terms_at) { window.location.href = '/?consent=required'; return; }
    const res = await fetch(`${API_URL}/api/payments/create-checkout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_id: order.image_id, filename: order.filename, user_id: user.id, email: user.email ?? null }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  };

  const handleDelete = async (orderId: string) => {
    await supabase.from('orders').delete().eq('id', orderId).eq('user_id', user!.id);
    setOrders(prev => prev.filter(o => o.id !== orderId));
    setSelectedOrders(prev => { const next = new Set(prev); next.delete(orderId); return next; });
  };

  const handleDeleteBatch = async (batchOrders: Order[]) => {
    const ids = batchOrders.map(o => o.id);
    await supabase.from('orders').delete().in('id', ids).eq('user_id', user!.id);
    setOrders(prev => prev.filter(o => !ids.includes(o.id)));
    setSelectedOrders(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; });
  };

  const handleDeleteExpired = async () => {
    const expiredIds = orders.filter(o => new Date(o.expires_at) < new Date()).map(o => o.id);
    await supabase.from('orders').delete().in('id', expiredIds).eq('user_id', user!.id);
    setOrders(prev => prev.filter(o => new Date(o.expires_at) >= new Date()));
    setSelectedOrders(prev => { const next = new Set(prev); expiredIds.forEach(id => next.delete(id)); return next; });
  };

  const getCountdown = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return null;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const allGroups = groupOrders(orders);

  const filteredGroups = allGroups
    .filter(g => {
      if (filter === 'paid') return g.paidCount === g.totalCount;
      if (filter === 'pending') return g.paidCount < g.totalCount;
      return true;
    })
    .filter(g => !search || g.orders.some(o => o.filename?.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => {
      if (sort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sort === 'az') return a.name.localeCompare(b.name);
      if (sort === 'za') return b.name.localeCompare(a.name);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const totalPages = Math.ceil(filteredGroups.length / PAGE_SIZE);
  const paginatedGroups = filteredGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [filter, sort, search]);

  const totalPhotos = orders.length;
  const expiredCount = orders.filter(o => new Date(o.expires_at) < new Date()).length;
  const hasSelection = selectedOrders.size > 0;

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Načítám...</p>
      </main>
    );
  }

  const filterBtnStyle = (active: boolean) => ({
    padding: '8px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'rgba(var(--accent-rgb, 100,200,255), 0.12)' : 'var(--bg-secondary)',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    cursor: 'pointer', transition: 'all 0.2s ease', fontFamily: 'inherit',
    boxShadow: active ? '0 0 12px rgba(var(--accent-rgb, 100,200,255), 0.25)' : 'none',
  } as React.CSSProperties);

  const currentLightboxOrder = lightbox ? lightbox.orders[lightbox.index] : null;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Header />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 'clamp(2.5rem, 5vw, 3.5rem) clamp(1.5rem, 4vw, 2.5rem)' }}>

        <div style={{ marginBottom: '3rem' }}>
          <h1 style={{ fontSize: 'clamp(2.2rem, 6vw, 3rem)', fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
            Vaše fotografie
          </h1>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {allGroups.length} {allGroups.length === 1 ? 'skupina' : allGroups.length < 5 ? 'skupiny' : 'skupin'} · {totalPhotos} fotek
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2.5rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' as const, alignItems: 'center' }}>
            <a href="/#editor" style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '10px 24px', background: 'var(--accent)', color: '#000',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14,
              fontWeight: 700, transition: 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
              textDecoration: 'none', fontFamily: 'inherit',
              boxShadow: '0 8px 24px rgba(var(--accent-rgb, 100, 200, 255), 0.3)',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 14px 36px rgba(var(--accent-rgb, 100, 200, 255), 0.45)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 8px 24px rgba(var(--accent-rgb, 100, 200, 255), 0.3)'; }}
            >
              + Nahrát
            </a>
            {expiredCount > 0 && (
              <button onClick={handleDeleteExpired} style={{
                padding: '10px 20px', background: 'transparent', color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, cursor: 'pointer',
                fontSize: 13, fontWeight: 600, transition: 'all 0.2s ease', fontFamily: 'inherit',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                🗑 Smazat vypršené ({expiredCount})
              </button>
            )}
          </div>

          {orders.length > 0 && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' as const }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-muted)', pointerEvents: 'none', opacity: search ? 0 : 1 }}>🔍</span>
                <input type="text" placeholder={search ? '' : placeholderText} value={search}
                  onChange={e => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
                  style={{
                    padding: '9px 14px 9px 34px', background: 'var(--bg-secondary)',
                    border: `1px solid ${searchFocused || search ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 8, color: 'var(--text-primary)', fontSize: 13,
                    fontFamily: 'inherit', width: 200, transition: 'all 0.25s ease', outline: 'none',
                    boxShadow: searchFocused || search ? '0 0 0 3px rgba(var(--accent-rgb, 100,200,255), 0.12)' : 'none',
                  }} />
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', background: 'var(--bg-secondary)', padding: '4px', borderRadius: 10, border: '1px solid var(--border)' }}>
                {(['all', 'paid', 'pending'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={filterBtnStyle(filter === f)}>
                    {f === 'all' ? 'Vše' : f === 'paid' ? '✓ Zaplacené' : '⏳ Čekající'}
                  </button>
                ))}
              </div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, pointerEvents: 'none', color: 'var(--text-muted)' }}>
                  {sort === 'newest' ? '↓' : sort === 'oldest' ? '↑' : sort === 'az' ? 'A' : 'Z'}
                </span>
                <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} style={{
                  padding: '9px 32px 9px 28px', background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)',
                  fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', appearance: 'none',
                }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  <option value="newest">Nejnovější</option>
                  <option value="oldest">Nejstarší</option>
                  <option value="az">A → Z</option>
                  <option value="za">Z → A</option>
                </select>
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, pointerEvents: 'none', color: 'var(--text-muted)' }}>▼</span>
              </div>
            </div>
          )}
        </div>

        {/* Multiselect action bar */}
        <div style={{
          overflow: 'hidden', maxHeight: hasSelection ? 80 : 0, opacity: hasSelection ? 1 : 0,
          transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease',
          marginBottom: hasSelection ? '1.25rem' : 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '12px 18px', borderRadius: 10,
            background: 'rgba(123,92,240,0.08)', border: '1px solid rgba(123,92,240,0.25)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
              {selectedOrders.size} {selectedOrders.size === 1 ? 'fotografie' : selectedOrders.size < 5 ? 'fotografie' : 'fotografií'} vybrány
              {selectedPending.length > 0 && ` · ${selectedPending.reduce((s, o) => s + (o.amount_czk ?? 25), 0)} Kč`}
            </span>
            {selectedPaid.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {selectedPaid.length} zaplaceno — klikni na fotku ke stažení
              </span>
            )}
            {selectedPending.length > 0 && (
              <button onClick={handleBuySelected} disabled={checkoutLoading} style={{
                padding: '8px 20px', background: 'var(--accent)', color: '#000',
                border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13,
                fontWeight: 700, fontFamily: 'inherit', opacity: checkoutLoading ? 0.6 : 1,
              }}>
                {checkoutLoading ? 'Načítám…' : `Koupit ${selectedPending.length > 1 ? `${selectedPending.length} fotek` : 'fotku'}`}
              </button>
            )}
            <button onClick={() => setSelectedOrders(new Set())} style={{
              padding: '8px 14px', background: 'transparent', color: 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer',
              fontSize: 13, fontFamily: 'inherit',
            }}>
              Zrušit výběr
            </button>
          </div>
        </div>

        {orders.length === 0 ? (
          <div style={{ textAlign: 'center' as const, padding: '4rem 2rem' }}>
            <div style={{ fontSize: 64, marginBottom: '1.5rem', opacity: 0.5 }}>📷</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Zatím žádné fotografie</h2>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '2rem' }}>Začněte nahráváním první fotografie</p>
            <a href="/#editor" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '12px 32px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 15, fontWeight: 700, textDecoration: 'none', fontFamily: 'inherit' }}>
              Nahrát fotografie
            </a>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div style={{ textAlign: 'center' as const, padding: '3rem 2rem' }}>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Žádné fotografie neodpovídají hledaným kritériím</p>
            <button onClick={() => { setFilter('all'); setSearch(''); setSort('newest'); }} style={{ padding: '10px 28px', fontSize: 14, fontWeight: 600, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
              Zrušit filtry
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '2rem' }}>
              {paginatedGroups.map((group, gIdx) => {
                const isOpen = openBatches.has(group.batch_id);
                const batchExpired = group.isExpired;
                const minExpiry = group.orders.reduce((min, o) => o.expires_at < min ? o.expires_at : min, group.orders[0]?.expires_at ?? '');
                const countdown = getCountdown(minExpiry);
                const allPaid = group.paidCount === group.totalCount;
                const isSingle = group.totalCount === 1;
                const activeOrders = group.orders.filter(o => new Date(o.expires_at) > new Date());
                const selectableOrders = activeOrders.filter(o => !isHdrPending(o.image_id) && loadedImages.has(o.image_id));
                const allGroupSelected = selectableOrders.length > 0 && selectableOrders.every(o => selectedOrders.has(o.id));
                const someGroupSelected = selectableOrders.some(o => selectedOrders.has(o.id));
                const isEditing = editingBatch === group.batch_id;

                // ── Klíčová logika: skupina se zpracovává ──────────────────
                const groupProcessing = isGroupProcessing(group);

                return (
                  <div key={group.batch_id} className="batch-card" style={{
                    borderRadius: 12,
                    border: batchExpired ? '1px solid rgba(239,68,68,0.25)' : '1px solid var(--border)',
                    background: 'var(--bg-card)', overflow: 'hidden',
                    animation: `slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1) ${gIdx * 0.05}s both`,
                    transition: 'box-shadow 0.25s ease, border-color 0.25s ease',
                    // Vizuální zašednutí celé karty při zpracování
                    opacity: groupProcessing ? 0.6 : 1,
                    pointerEvents: groupProcessing ? 'none' : 'auto',
                  }}>

                    {/* Batch header */}
                    <div
                      onClick={() => !isEditing && !groupProcessing && toggleBatch(group.batch_id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '13px 16px',
                        cursor: isEditing || groupProcessing ? 'default' : 'pointer',
                        borderBottom: isOpen ? '1px solid var(--border)' : 'none',
                        background: batchExpired ? 'rgba(239,68,68,0.03)' : 'var(--bg-card)',
                        transition: 'background 0.2s',
                        opacity: batchExpired ? 0.75 : 1,
                        userSelect: 'none' as const,
                      }}
                      onMouseEnter={e => { if (!isEditing && !groupProcessing) (e.currentTarget as HTMLDivElement).style.background = batchExpired ? 'rgba(239,68,68,0.06)' : 'var(--bg-secondary)'; }}
                      onMouseLeave={e => { if (!isEditing && !groupProcessing) (e.currentTarget as HTMLDivElement).style.background = batchExpired ? 'rgba(239,68,68,0.03)' : 'var(--bg-card)'; }}
                    >
                      {/* Select all — skryj při zpracování */}
                      {!batchExpired && !groupProcessing && selectableOrders.length > 0 && (
                        <div
                          onClick={e => toggleSelectAll(group, e)}
                          style={{
                            width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                            border: `2px solid ${allGroupSelected ? '#7B5CF0' : someGroupSelected ? '#7B5CF0' : 'var(--border)'}`,
                            background: allGroupSelected ? '#7B5CF0' : someGroupSelected ? 'rgba(123,92,240,0.2)' : 'var(--bg-secondary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', transition: 'all 0.15s ease',
                          }}
                        >
                          {allGroupSelected && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
                          {someGroupSelected && !allGroupSelected && <span style={{ color: '#7B5CF0', fontSize: 12, lineHeight: 1 }}>–</span>}
                        </div>
                      )}

                      <div style={{
                        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                        background: batchExpired ? 'rgba(239,68,68,0.12)' : groupProcessing ? 'rgba(123,92,240,0.08)' : 'rgba(123,92,240,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
                      }}>
                        {batchExpired ? '⏰' : groupProcessing ? (
                          <div style={{ width: 16, height: 16, border: '2px solid var(--border)', borderTop: '2px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        ) : isSingle ? '🖼️' : '📁'}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isEditing && !groupProcessing ? (
                          <input
                            ref={renameInputRef}
                            value={editingValue}
                            onChange={e => setEditingValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveRename(group);
                              if (e.key === 'Escape') cancelRename();
                            }}
                            onBlur={() => saveRename(group)}
                            onClick={e => e.stopPropagation()}
                            style={{
                              width: '100%', fontSize: 14, fontWeight: 600,
                              color: 'var(--text-primary)', background: 'var(--bg-secondary)',
                              border: '1.5px solid var(--accent)', borderRadius: 6,
                              padding: '4px 8px', outline: 'none', fontFamily: 'inherit',
                              boxShadow: '0 0 0 3px rgba(123,92,240,0.15)',
                            }}
                            placeholder="Název skupiny…"
                            maxLength={80}
                          />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <p
                              onClick={e => !batchExpired && !groupProcessing && startRename(group, e)}
                              title={batchExpired || groupProcessing ? undefined : 'Klikněte pro přejmenování'}
                              style={{
                                fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
                                margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                cursor: batchExpired || groupProcessing ? 'default' : 'text',
                                padding: '4px 6px', borderRadius: 5, marginLeft: -6,
                                transition: 'background 0.15s ease',
                              }}
                              onMouseEnter={e => { if (!batchExpired && !groupProcessing) (e.currentTarget as HTMLParagraphElement).style.background = 'var(--bg-secondary)'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLParagraphElement).style.background = 'transparent'; }}
                            >
                              {group.name}
                            </p>
                            {!batchExpired && !groupProcessing && (
                              <span
                                onClick={e => startRename(group, e)}
                                title="Přejmenovat"
                                style={{ fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', opacity: 0.5, flexShrink: 0, transition: 'opacity 0.15s' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.opacity = '1'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.opacity = '0.5'; }}
                              >
                                ✎
                              </span>
                            )}
                          </div>
                        )}
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                          {new Date(group.created_at).toLocaleDateString('cs-CZ')}
                          {groupProcessing && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>· Zpracovává se…</span>}
                          {!groupProcessing && countdown && !batchExpired && ` · Vyprší za ${countdown}`}
                          {batchExpired && <span style={{ color: '#ef4444' }}> · Vypršelo</span>}
                        </p>
                      </div>

                      {/* Badges — skryj delete při zpracování */}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        {groupProcessing ? (
                          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(123,92,240,0.12)', color: 'var(--accent)' }}>
                            ⏳ Zpracovává se
                          </span>
                        ) : batchExpired ? (
                          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>Vypršelo</span>
                        ) : allPaid ? (
                          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>✓ Zaplaceno</span>
                        ) : (
                          <>
                            {group.paidCount > 0 && <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>✓ {group.paidCount}</span>}
                            <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(251,146,60,0.12)', color: '#fb923c' }}>⏳ {group.totalCount - group.paidCount} ke koupi</span>
                          </>
                        )}
                        {!isSingle && (
                          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                            {group.totalCount} fotek
                          </span>
                        )}
                        {/* 🗑 batch delete — pouze pokud NENÍ zpracovávání */}
                        {!groupProcessing && (
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteBatch(group.orders); }}
                            title="Smazat skupinu"
                            style={{
                              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: 'transparent', border: '1px solid transparent', borderRadius: 6,
                              color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.3)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; }}
                          >
                            🗑
                          </button>
                        )}
                        <span style={{ fontSize: 15, color: 'var(--text-muted)', transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block', marginLeft: 2 }}>
                          ▾
                        </span>
                      </div>
                    </div>

                    {/* Expanded content — celý blok disabled při zpracování */}
                    <div style={{
                      display: 'grid',
                      gridTemplateRows: isOpen ? '1fr' : '0fr',
                      transition: 'grid-template-rows 0.35s cubic-bezier(0.4,0,0.2,1)',
                    }}>
                      <div style={{ overflow: 'hidden' }}>
                        {/* Overlay při zpracování — zakryje celý obsah */}
                        {groupProcessing && isOpen && (
                          <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            gap: 12, padding: '2.5rem 1rem',
                            background: 'var(--bg-card)',
                          }}>
                            <div style={{
                              width: 36, height: 36, border: '3px solid var(--border)',
                              borderTop: '3px solid var(--accent)', borderRadius: '50%',
                              animation: 'spin 1s linear infinite',
                            }} />
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
                              Fotografie se zpracovávají…<br />
                              <span style={{ fontSize: 12, opacity: 0.7 }}>Pošleme vám email až budou připraveny.</span>
                            </p>
                          </div>
                        )}

                        {/* Fotky — zobrazí se jen pokud není zpracování */}
                        {!groupProcessing && (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1px', background: 'var(--border)' }}>
                              {group.orders.map((order, oIdx) => {
                                const expired = new Date(order.expires_at) < new Date();
                                const isPaid = order.payment_status === 'paid';
                                const countdown = getCountdown(order.expires_at);
                                const isSelected = selectedOrders.has(order.id);

                                return (
                                  <div key={order.id} style={{
                                    background: isSelected ? 'rgba(123,92,240,0.06)' : 'var(--bg-card)',
                                    padding: '10px', transition: 'background 0.15s ease',
                                    animation: isOpen ? `fadeInPhoto 0.3s ease ${oIdx * 0.03}s both` : 'none',
                                    position: 'relative' as const,
                                  }}>
                                    {/* Checkbox — jen pro hotové nezaplacené */}
                                    {!expired && isPaid === false && loadedImages.has(order.image_id) && (
                                      <div
                                        onClick={e => toggleOrder(order.id, e)}
                                        style={{
                                          position: 'absolute' as const, top: 18, left: 18, zIndex: 2,
                                          width: 18, height: 18, borderRadius: 4,
                                          border: `2px solid ${isSelected ? '#7B5CF0' : 'rgba(255,255,255,0.7)'}`,
                                          background: isSelected ? '#7B5CF0' : 'rgba(0,0,0,0.35)',
                                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          cursor: 'pointer', transition: 'all 0.15s ease',
                                          backdropFilter: 'blur(4px)',
                                        }}
                                      >
                                        {isSelected && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1 }}>✓</span>}
                                      </div>
                                    )}

                                    <div style={{ position: 'relative' as const }}>
                                      <DashboardThumb
                                        imageId={order.image_id}
                                        filename={order.filename}
                                        pending={isHdrPending(order.image_id)}
                                        isSelected={isSelected}
                                        onClick={() => openLightbox(group.orders, oIdx)}
                                        onLoaded={markLoaded}
                                      />
                                      {isPaid && !expired && loadedImages.has(order.image_id) && (
                                        <div style={{ position: 'absolute' as const, top: 5, right: 5, background: 'rgba(74,222,128,0.9)', borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700, color: '#052e16', zIndex: 1 }}>✓</div>
                                      )}
                                    </div>

                                    <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {order.filename && !order.filename.match(/^[0-9a-f-]{36}/) ? order.filename : 'Bez názvu'}
                                    </p>

                                    {countdown && (
                                      <p style={{ fontSize: 10, color: expired ? '#ef4444' : countdown.startsWith('0h') ? '#f97316' : 'var(--text-muted)', margin: '0 0 7px' }}>
                                        {expired ? 'Vypršelo' : `Vyprší za ${countdown}`}
                                      </p>
                                    )}

                                    <div style={{ display: 'flex', gap: 5 }}>
                                      {isPaid && !expired ? (
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                          <a
                                            href={`${API_URL}/api/enhance/enhanced/${order.image_id}?preview=false`}
                                            download={order.filename && !order.filename.match(/^[0-9a-f-]{36}/) ? `enhanced_${order.filename}` : `foto_${order.image_id.slice(0, 8)}.jpg`}
                                            style={{ textAlign: 'center', padding: '6px 8px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 700, textDecoration: 'none', display: 'block', fontFamily: 'inherit' }}
                                          >
                                            Stáhnout
                                          </a>
                                          {order.uol_invoice_id && (
                                            <a
                                              href={`${API_URL}/api/billing/invoice/${order.image_id}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              onClick={async (e) => {
                                                e.preventDefault();
                                                try {
                                                  const res = await fetch(`${API_URL}/api/billing/invoice/${order.image_id}`);
                                                  const { url } = await res.json();
                                                  if (url) window.open(url, '_blank');
                                                } catch { console.error('Nepodařilo se načíst fakturu'); }
                                              }}
                                              style={{ textAlign: 'center', padding: '5px 8px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', fontSize: 10, fontWeight: 600, textDecoration: 'none', display: 'block', fontFamily: 'inherit', transition: 'all 0.15s ease' }}
                                              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)'; }}
                                              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)'; }}
                                            >
                                              📄 Faktura
                                            </a>
                                          )}
                                        </div>
                                      ) : !expired && loadedImages.has(order.image_id) ? (
                                        <button onClick={() => handleBuy(order)} style={{ flex: 1, padding: '6px 8px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>
                                          Koupit
                                        </button>
                                      ) : expired ? (
                                        <button onClick={() => handleDelete(order.id)} style={{ flex: 1, padding: '6px 8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
                                          🗑
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                {group.paidCount} z {group.totalCount} zaplaceno · {group.orders.reduce((s, o) => s + (o.amount_czk || 0), 0)} Kč celkem
                              </span>
                              {batchExpired && (
                                <button onClick={() => handleDeleteBatch(group.orders)} style={{ padding: '6px 14px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                                  🗑 Smazat skupinu
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '2rem 0', flexWrap: 'wrap' }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: '9px 16px', fontSize: 14, fontWeight: 600, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1, fontFamily: 'inherit' }}>
                  ← Předchozí
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => Math.abs(p - page) <= 2 || p === 1 || p === totalPages)
                  .map((p, idx, arr) => (
                    <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ color: 'var(--text-muted)' }}>…</span>}
                      <button onClick={() => setPage(p)} style={{ padding: '9px 14px', fontSize: 14, fontWeight: p === page ? 700 : 600, background: p === page ? 'var(--accent)' : 'var(--bg)', color: p === page ? '#000' : 'var(--text-secondary)', border: '1px solid', borderColor: p === page ? 'var(--accent)' : 'var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {p}
                      </button>
                    </div>
                  ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ padding: '9px 16px', fontSize: 14, fontWeight: 600, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1, fontFamily: 'inherit' }}>
                  Další →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && currentLightboxOrder && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.96)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', animation: 'fadeIn 0.2s ease' }}
          onClick={() => setLightbox(null)}
        >
          {lightbox.index > 0 && (
            <button onClick={e => { e.stopPropagation(); setLightbox(prev => prev ? { ...prev, index: prev.index - 1 } : prev); }}
              style={{ position: 'fixed', left: 20, top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%', color: '#fff', fontSize: 22, cursor: 'pointer', backdropFilter: 'blur(8px)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; }}
            >←</button>
          )}
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: '90vw' }}>
            <img key={currentLightboxOrder.image_id}
              src={`${API_URL}/api/enhance/enhanced/${currentLightboxOrder.image_id}?preview=true&quality=90`}
              alt={currentLightboxOrder.filename}
              style={{ maxWidth: '85vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 25px 60px rgba(0,0,0,0.5)', animation: 'zoomIn 0.25s cubic-bezier(0.34,1.56,0.64,1)' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                {lightbox.index + 1} / {lightbox.orders.length} · {currentLightboxOrder.filename && !currentLightboxOrder.filename.match(/^[0-9a-f-]{36}/) ? currentLightboxOrder.filename : 'Bez názvu'}
              </span>
              {currentLightboxOrder.payment_status === 'paid' && new Date(currentLightboxOrder.expires_at) > new Date() && (
                <a href={`${API_URL}/api/enhance/enhanced/${currentLightboxOrder.image_id}?preview=false`}
                  download={currentLightboxOrder.filename && !currentLightboxOrder.filename.match(/^[0-9a-f-]{36}/) ? `enhanced_${currentLightboxOrder.filename}` : `foto_${currentLightboxOrder.image_id.slice(0, 8)}.jpg`}
                  onClick={e => e.stopPropagation()}
                  style={{ padding: '6px 16px', background: 'var(--accent)', color: '#000', borderRadius: 6, fontSize: 12, fontWeight: 700, textDecoration: 'none', fontFamily: 'inherit' }}>
                  Stáhnout
                </a>
              )}
            </div>
            {lightbox.orders.length > 1 && (
              <div style={{ display: 'flex', gap: 6 }}>
                {lightbox.orders.map((_, i) => (
                  <div key={i} onClick={e => { e.stopPropagation(); setLightbox(prev => prev ? { ...prev, index: i } : prev); }}
                    style={{ width: i === lightbox.index ? 20 : 6, height: 6, borderRadius: 3, background: i === lightbox.index ? 'var(--accent)' : 'rgba(255,255,255,0.3)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                  />
                ))}
              </div>
            )}
          </div>
          {lightbox.index < lightbox.orders.length - 1 && (
            <button onClick={e => { e.stopPropagation(); setLightbox(prev => prev ? { ...prev, index: prev.index + 1 } : prev); }}
              style={{ position: 'fixed', right: 20, top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%', color: '#fff', fontSize: 22, cursor: 'pointer', backdropFilter: 'blur(8px)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; }}
            >→</button>
          )}
          <button onClick={() => setLightbox(null)}
            style={{ position: 'fixed', top: 24, right: 28, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%', color: '#fff', fontSize: 22, cursor: 'pointer', backdropFilter: 'blur(8px)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.22)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)'; }}
          >✕</button>
        </div>
      )}

      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(18px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
        @keyframes fadeInPhoto { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .batch-card:hover { box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
        @media (max-width: 768px) { div[style*="minmax(180px"] { grid-template-columns: repeat(2, 1fr) !important; } }
      `}</style>
    </main>
  );
}