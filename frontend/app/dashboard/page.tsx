'use client';

import type { User } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
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
  upload_batch_id: string | null;
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

const PAGE_SIZE = 10;

const SEARCH_PLACEHOLDERS = [
  'Hledat podle názvu…',
  'Např. DSC01220.ARW…',
  'Název souboru…',
];

function groupOrders(orders: Order[]): BatchGroup[] {
  const map = new Map<string, Order[]>();
  for (const order of orders) {
    const key = order.upload_batch_id ?? `single_${order.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(order);
  }
  return Array.from(map.entries()).map(([batch_id, orders]) => {
    const sorted = [...orders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const firstName = sorted[0]?.filename ?? '';
    const baseName = firstName.replace(/\.[^.]+$/, '');
    const name = orders.length > 1
      ? `${baseName} + ${orders.length - 1} dalších`
      : firstName || 'Bez názvu';
    const isExpired = sorted.every(o => new Date(o.expires_at) < new Date());
    const paidCount = orders.filter(o => o.payment_status === 'paid').length;
    return {
      batch_id,
      orders: sorted,
      name,
      created_at: sorted[0]?.created_at ?? '',
      isExpired,
      paidCount,
      totalCount: orders.length,
    };
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [page, setPage] = useState(1);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [openBatches, setOpenBatches] = useState<Set<string>>(new Set());

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
      // Otevři první skupinu automaticky
      const groups = groupOrders(loaded);
      if (groups.length > 0) setOpenBatches(new Set([groups[0].batch_id]));
      setLoading(false);
    };
    init();
  }, []);

  const toggleBatch = (batchId: string) => {
    setOpenBatches(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
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
  };

  const handleDeleteBatch = async (batchOrders: Order[]) => {
    const ids = batchOrders.map(o => o.id);
    await supabase.from('orders').delete().in('id', ids).eq('user_id', user!.id);
    setOrders(prev => prev.filter(o => !ids.includes(o.id)));
  };

  const handleDeleteExpired = async () => {
    const expiredIds = orders.filter(o => new Date(o.expires_at) < new Date()).map(o => o.id);
    await supabase.from('orders').delete().in('id', expiredIds).eq('user_id', user!.id);
    setOrders(prev => prev.filter(o => new Date(o.expires_at) >= new Date()));
  };

  const allGroups = groupOrders(orders);

  const filteredGroups = allGroups
    .filter(g => {
      if (filter === 'paid') return g.paidCount === g.totalCount;
      if (filter === 'pending') return g.paidCount < g.totalCount;
      return true;
    })
    .filter(g => {
      if (!search) return true;
      return g.orders.some(o => o.filename?.toLowerCase().includes(search.toLowerCase()));
    })
    .sort((a, b) => {
      if (sort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const totalPages = Math.ceil(filteredGroups.length / PAGE_SIZE);
  const paginatedGroups = filteredGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [filter, sort, search]);

  const totalPhotos = orders.length;
  const expiredCount = orders.filter(o => new Date(o.expires_at) < new Date()).length;

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

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Header />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 'clamp(2.5rem, 5vw, 3.5rem) clamp(1.5rem, 4vw, 2.5rem)' }}>

        {/* Header */}
        <div style={{ marginBottom: '3rem' }}>
          <h1 style={{ fontSize: 'clamp(2.2rem, 6vw, 3rem)', fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
            Vaše fotografie
          </h1>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {allGroups.length} {allGroups.length === 1 ? 'skupina' : allGroups.length < 5 ? 'skupiny' : 'skupin'} · {totalPhotos} fotek
          </p>
        </div>

        {/* Controls */}
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
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-muted)', pointerEvents: 'none', opacity: search ? 0 : 1 }}>
                  🔍
                </span>
                <input
                  type="text"
                  placeholder={search ? '' : placeholderText}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  style={{
                    padding: '9px 14px 9px 34px', background: 'var(--bg-secondary)',
                    border: `1px solid ${searchFocused || search ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 8, color: 'var(--text-primary)', fontSize: 13,
                    fontFamily: 'inherit', width: 200, transition: 'all 0.25s ease', outline: 'none',
                    boxShadow: searchFocused || search ? '0 0 0 3px rgba(var(--accent-rgb, 100,200,255), 0.12)' : 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.4rem', background: 'var(--bg-secondary)', padding: '4px', borderRadius: 10, border: '1px solid var(--border)' }}>
                {(['all', 'paid', 'pending'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={filterBtnStyle(filter === f)}>
                    {f === 'all' ? 'Vše' : f === 'paid' ? '✓ Zaplacené' : '⏳ Čekající'}
                  </button>
                ))}
              </div>

              <div style={{ position: 'relative' }}>
                <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} style={{
                  padding: '9px 32px 9px 12px', background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)',
                  fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', appearance: 'none',
                }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  <option value="newest">Nejnovější</option>
                  <option value="oldest">Nejstarší</option>
                </select>
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, pointerEvents: 'none', color: 'var(--text-muted)' }}>▼</span>
              </div>
            </div>
          )}
        </div>

        {/* Empty state */}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '2rem' }}>
              {paginatedGroups.map((group, gIdx) => {
                const isOpen = openBatches.has(group.batch_id);
                const batchExpired = group.isExpired;
                const minExpiry = group.orders.reduce((min, o) => o.expires_at < min ? o.expires_at : min, group.orders[0]?.expires_at ?? '');
                const countdown = getCountdown(minExpiry);
                const allPaid = group.paidCount === group.totalCount;
                const isSingle = group.totalCount === 1;

                return (
                  <div key={group.batch_id} style={{
                    borderRadius: 12,
                    border: batchExpired ? '1px solid rgba(239,68,68,0.25)' : '1px solid var(--border)',
                    background: 'var(--bg-card)',
                    overflow: 'hidden',
                    animation: `slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1) ${gIdx * 0.04}s both`,
                  }}>

                    {/* Batch header */}
                    <div
                      onClick={() => toggleBatch(group.batch_id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '14px 18px', cursor: 'pointer',
                        borderBottom: isOpen ? '1px solid var(--border)' : 'none',
                        background: batchExpired ? 'rgba(239,68,68,0.03)' : 'var(--bg-card)',
                        transition: 'background 0.2s',
                        opacity: batchExpired ? 0.75 : 1,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = batchExpired ? 'rgba(239,68,68,0.06)' : 'var(--bg-secondary)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = batchExpired ? 'rgba(239,68,68,0.03)' : 'var(--bg-card)'; }}
                    >
                      {/* Icon */}
                      <div style={{
                        width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                        background: batchExpired ? 'rgba(239,68,68,0.12)' : 'rgba(123,92,240,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18,
                      }}>
                        {batchExpired ? '⏰' : isSingle ? '🖼️' : '📁'}
                      </div>

                      {/* Meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {group.name}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                          {new Date(group.created_at).toLocaleDateString('cs-CZ')}
                          {countdown && !batchExpired && ` · Vyprší za ${countdown}`}
                          {batchExpired && <span style={{ color: '#ef4444' }}> · Vypršelo</span>}
                        </p>
                      </div>

                      {/* Badges */}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        {batchExpired ? (
                          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                            Vypršelo
                          </span>
                        ) : allPaid ? (
                          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>
                            ✓ Zaplaceno
                          </span>
                        ) : (
                          <>
                            {group.paidCount > 0 && (
                              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>
                                ✓ {group.paidCount}
                              </span>
                            )}
                            <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(251,146,60,0.12)', color: '#fb923c' }}>
                              ⏳ {group.totalCount - group.paidCount} ke koupi
                            </span>
                          </>
                        )}
                        {!isSingle && (
                          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                            {group.totalCount} fotek
                          </span>
                        )}
                        <span style={{ fontSize: 16, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block', marginLeft: 4 }}>
                          ▾
                        </span>
                      </div>
                    </div>

                    {/* Expanded photo grid */}
                    {isOpen && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1px', background: 'var(--border)' }}>
                          {group.orders.map((order) => {
                            const expired = new Date(order.expires_at) < new Date();
                            const isPaid = order.payment_status === 'paid';
                            const countdown = getCountdown(order.expires_at);

                            return (
                              <div key={order.id} style={{ background: 'var(--bg-card)', padding: '12px' }}>
                                {/* Thumbnail */}
                                <div
                                  onClick={() => setLightbox(`${API_URL}/api/enhance/enhanced/${order.image_id}?preview=true&quality=80`)}
                                  style={{ position: 'relative', width: '100%', paddingBottom: '75%', background: 'var(--bg-secondary)', cursor: 'zoom-in', overflow: 'hidden', borderRadius: 8, marginBottom: 10 }}
                                >
                                  <img
                                    src={`${API_URL}/api/enhance/enhanced/${order.image_id}?preview=true&quality=60`}
                                    alt={order.filename}
                                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s ease' }}
                                    onMouseEnter={e => { (e.target as HTMLImageElement).style.transform = 'scale(1.06)'; }}
                                    onMouseLeave={e => { (e.target as HTMLImageElement).style.transform = 'scale(1)'; }}
                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                  {isPaid && !expired && (
                                    <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(74,222,128,0.9)', borderRadius: 5, padding: '2px 7px', fontSize: 10, fontWeight: 700, color: '#052e16' }}>
                                      ✓ Zaplaceno
                                    </div>
                                  )}
                                </div>

                                {/* Filename */}
                                <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {order.filename && !order.filename.match(/^[0-9a-f-]{36}/) ? order.filename : 'Bez názvu'}
                                </p>

                                {/* Countdown */}
                                {countdown && (
                                  <p style={{ fontSize: 11, color: expired ? '#ef4444' : countdown.startsWith('0h') ? '#f97316' : 'var(--text-muted)', margin: '0 0 8px' }}>
                                    {expired ? 'Vypršelo' : `Vyprší za ${countdown}`}
                                  </p>
                                )}

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: 6 }}>
                                  {isPaid && !expired ? (
                                    <a
                                      href={`${API_URL}/api/enhance/enhanced/${order.image_id}?preview=false`}
                                      download={order.filename && !order.filename.match(/^[0-9a-f-]{36}/) ? `enhanced_${order.filename}` : `foto_${order.image_id.slice(0, 8)}.jpg`}
                                      style={{ flex: 1, textAlign: 'center', padding: '7px 10px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, textDecoration: 'none', display: 'block', fontFamily: 'inherit' }}
                                    >
                                      Stáhnout
                                    </a>
                                  ) : !expired ? (
                                    <button onClick={() => handleBuy(order)} style={{ flex: 1, padding: '7px 10px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
                                      Koupit
                                    </button>
                                  ) : null}
                                  {(expired || order.payment_status === 'pending') && (
                                    <button onClick={() => handleDelete(order.id)} style={{ padding: '7px 10px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                                      🗑
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Batch footer */}
                        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {group.paidCount} z {group.totalCount} zaplaceno · {group.orders.reduce((s, o) => s + (o.amount_czk || 0), 0)} Kč celkem
                          </span>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {group.paidCount > 0 && !batchExpired && (
                              <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                                💡 Kliknutím na fotku stáhneš
                              </span>
                            )}
                            {batchExpired && (
                              <button
                                onClick={() => handleDeleteBatch(group.orders)}
                                style={{ padding: '7px 16px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
                              >
                                🗑 Smazat skupinu
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
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
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', backdropFilter: 'blur(8px)' }}>
          <img src={lightbox} alt="Náhled" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }} />
          <button onClick={() => setLightbox(null)} style={{ position: 'fixed', top: 28, right: 32, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.25)', borderRadius: '50%', color: '#fff', fontSize: 24, cursor: 'pointer', backdropFilter: 'blur(8px)', fontFamily: 'inherit' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.25)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.15)'; }}
          >✕</button>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
          div[style*="minmax(200px"] {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </main>
  );
}