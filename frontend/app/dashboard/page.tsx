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
}

const PAGE_SIZE = 12;

const SEARCH_PLACEHOLDERS = [
  'Hledat podle názvu…',
  'Např. DSC01220.ARW…',
  'Název souboru…',
];

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'az' | 'za'>('newest');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [page, setPage] = useState(1);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Animated placeholder
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
        if (charIdx === currentPhrase.length) {
          deleting = true;
          placeholderRef.current = setTimeout(tick, 1800);
        } else {
          placeholderRef.current = setTimeout(tick, 60);
        }
      } else {
        charIdx--;
        setPlaceholderText(currentPhrase.slice(0, charIdx));
        if (charIdx === 0) {
          deleting = false;
          const next = (placeholderIdx + 1) % SEARCH_PLACEHOLDERS.length;
          setPlaceholderIdx(next);
          currentPhrase = SEARCH_PLACEHOLDERS[next];
          placeholderRef.current = setTimeout(tick, 400);
        } else {
          placeholderRef.current = setTimeout(tick, 30);
        }
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

      await supabase.from('orders').delete()
        .eq('user_id', user.id)
        .lt('expires_at', new Date().toISOString());

      const { data } = await supabase
        .from('orders').select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      setOrders(data ?? []);
      setLoading(false);
    };
    init();
  }, []);

  const filteredOrders = orders
    .filter(order => {
      if (filter === 'paid') return order.payment_status === 'paid';
      if (filter === 'pending') return order.payment_status !== 'paid';
      return true;
    })
    .filter(order => {
      if (!search) return true;
      return order.filename?.toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => {
      if (sort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sort === 'az') return (a.filename ?? '').localeCompare(b.filename ?? '');
      if (sort === 'za') return (b.filename ?? '').localeCompare(a.filename ?? '');
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE);
  const paginatedOrders = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [filter, sort, search]);

  const getCountdown = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return null;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Načítám...</p>
      </main>
    );
  }

  const handleBuy = async (order: Order) => {
    if (!user) return;
    const { data: consent } = await supabase.from('user_consents')
      .select('agreed_to_terms_at').eq('user_id', user.id).single();
    if (!consent?.agreed_to_terms_at) { window.location.href = '/?consent=required'; return; }
    const res = await fetch(`${API_URL}/api/payments/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_id: order.image_id, filename: order.filename, user_id: user.id, email: user.email ?? null }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  };

  const handleDelete = async (orderId: string) => {
    await supabase.from('orders').delete().eq('id', orderId).eq('user_id', user!.id);
    setOrders(prev => prev.filter(o => o.id !== orderId));
  };

  const handleDeleteExpired = async () => {
    const expiredIds = orders.filter(o => new Date(o.expires_at) < new Date()).map(o => o.id);
    await supabase.from('orders').delete().in('id', expiredIds).eq('user_id', user!.id);
    setOrders(prev => prev.filter(o => new Date(o.expires_at) >= new Date()));
  };

  const filterBtnStyle = (active: boolean) => ({
    padding: '8px 18px',
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'rgba(var(--accent-rgb, 100,200,255), 0.12)' : 'var(--bg-secondary)',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
    boxShadow: active ? '0 0 12px rgba(var(--accent-rgb, 100,200,255), 0.25)' : 'none',
  } as React.CSSProperties);

  const sortOptions = [
    { value: 'newest', label: 'Nejnovější' },
    { value: 'oldest', label: 'Nejstarší' },
    { value: 'az', label: 'A → Z' },
    { value: 'za', label: 'Z → A' },
  ];

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
            {filteredOrders.length} {filteredOrders.length === 1 ? 'fotografie' : 'fotografií'}
          </p>
        </div>

        {/* ── Controls ── */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2.5rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>

          {/* Left: upload + delete expired */}
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
            {orders.some(o => new Date(o.expires_at) < new Date()) && (
              <button onClick={handleDeleteExpired} style={{
                padding: '10px 20px', background: 'transparent', color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, cursor: 'pointer',
                fontSize: 13, fontWeight: 600, transition: 'all 0.2s ease', fontFamily: 'inherit',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                🗑 Smazat vypršené ({orders.filter(o => new Date(o.expires_at) < new Date()).length})
              </button>
            )}
          </div>

          {orders.length > 0 && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' as const }}>

              {/* Animated search */}
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 14, color: 'var(--text-muted)', pointerEvents: 'none',
                  transition: 'opacity 0.2s',
                  opacity: search ? 0 : 1,
                }}>
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
                    padding: '9px 14px 9px 34px',
                    background: 'var(--bg-secondary)',
                    border: `1px solid ${searchFocused || search ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 8,
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    width: 200,
                    transition: 'all 0.25s ease',
                    outline: 'none',
                    boxShadow: searchFocused || search ? '0 0 0 3px rgba(var(--accent-rgb, 100,200,255), 0.12)' : 'none',
                  }}
                />
              </div>

              {/* Filter pills */}
              <div style={{ display: 'flex', gap: '0.4rem', background: 'var(--bg-secondary)', padding: '4px', borderRadius: 10, border: '1px solid var(--border)' }}>
                {(['all', 'paid', 'pending'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={filterBtnStyle(filter === f)}>
                    {f === 'all' ? 'Vše' : f === 'paid' ? '✓ Zaplacené' : '⏳ Čekající'}
                  </button>
                ))}
              </div>

              {/* Sort dropdown styled */}
              <div style={{ position: 'relative' }}>
                <select
                  value={sort}
                  onChange={e => setSort(e.target.value as typeof sort)}
                  style={{
                    padding: '9px 32px 9px 12px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    outline: 'none',
                    appearance: 'none',
                    transition: 'all 0.2s ease',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(var(--accent-rgb, 100,200,255), 0.12)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  {sortOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, pointerEvents: 'none', color: 'var(--text-muted)' }}>▼</span>
              </div>

            </div>
          )}
        </div>

        {/* Empty State */}
        {orders.length === 0 ? (
          <div style={{ textAlign: 'center' as const, padding: '4rem 2rem' }}>
            <div style={{ fontSize: 64, marginBottom: '1.5rem', opacity: 0.5 }}>📷</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Zatím žádné fotografie</h2>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '2rem' }}>Začněte nahráváním první fotografie</p>
            <a href="/#editor" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '12px 32px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 15, fontWeight: 700, textDecoration: 'none', fontFamily: 'inherit', transition: 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-6px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)'; }}
            >
              Nahrát fotografie
            </a>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ textAlign: 'center' as const, padding: '3rem 2rem' }}>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Žádné fotografie neodpovídají hledaným kritériím</p>
            <button onClick={() => { setFilter('all'); setSearch(''); setSort('newest'); }} style={{ padding: '10px 28px', fontSize: 14, fontWeight: 600, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', transition: 'all 0.3s ease', fontFamily: 'inherit' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
            >
              Zrušit filtry
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
              {paginatedOrders.map((order, idx) => {
                const expired = new Date(order.expires_at) < new Date();
                const countdown = getCountdown(order.expires_at);
                const isPaid = order.payment_status === 'paid';
                const isFirst = idx === 0 && page === 1;

                return (
                  <div key={order.id} style={{
                    borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden',
                    background: 'var(--bg-card)', transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease, border-color 0.3s ease',
                    transform: 'translateZ(0)', cursor: 'default',
                    animation: `slideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${idx * 0.05}s both`,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                  }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.transform = 'translateY(-8px)';
                      el.style.boxShadow = '0 20px 60px rgba(139,92,246,0.18), 0 8px 24px rgba(0,0,0,0.18)';
                      el.style.borderColor = 'rgba(139,92,246,0.55)';
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.transform = 'translateY(0)';
                      el.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
                      el.style.borderColor = 'var(--border)';
                    }}
                  >
                    {/* Image */}
                    <div
                      onClick={() => setLightbox(`${API_URL}/api/enhance/enhanced/${order.image_id}?preview=true&quality=80`)}
                      style={{ position: 'relative', width: '100%', paddingBottom: '100%', background: 'var(--bg-secondary)', cursor: 'zoom-in', overflow: 'hidden' }}
                    >
                      <img
                        src={`${API_URL}/api/enhance/enhanced/${order.image_id}?preview=true&quality=60`}
                        alt={order.filename}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s ease-out' }}
                        onMouseEnter={e => { (e.target as HTMLImageElement).style.transform = 'scale(1.08)'; }}
                        onMouseLeave={e => { (e.target as HTMLImageElement).style.transform = 'scale(1)'; }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      {/* Zoom hint — pouze první item */}
                      {isFirst && (
                        <div style={{
                          position: 'absolute', top: 10, right: 10,
                          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 7, padding: '5px 9px',
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontSize: 11, color: '#fff', fontWeight: 500,
                          pointerEvents: 'none',
                          animation: 'fadeIn 0.5s ease 0.8s both',
                        }}>
                          🔍 Přiblížit
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div style={{ padding: '1rem' }}>
                      <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {order.filename && !order.filename.match(/^[0-9a-f-]{36}/) ? order.filename : 'Bez názvu'}
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <span>{new Date(order.created_at).toLocaleDateString('cs-CZ')}</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{order.amount_czk} Kč</span>
                      </div>
                      <div className="status-row" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                        <span style={{
                          display: 'inline-block', padding: '4px 10px', borderRadius: 6,
                          fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em',
                          background: isPaid ? 'rgba(74,222,128,0.15)' : order.payment_status === 'pending' ? 'rgba(251,146,60,0.15)' : 'rgba(100,100,100,0.1)',
                          color: isPaid ? '#4ade80' : order.payment_status === 'pending' ? '#fb923c' : 'var(--text-muted)',
                          border: '1px solid',
                          borderColor: isPaid ? 'rgba(74,222,128,0.3)' : order.payment_status === 'pending' ? 'rgba(251,146,60,0.3)' : 'rgba(100,100,100,0.2)',
                        }}>
                          {isPaid ? '✓ Zaplaceno' : order.payment_status === 'pending' ? '⏳ Ke koupi' : '○ Čeká'}
                        </span>
                        {countdown && (
                          <div style={{ fontSize: '0.75rem', fontWeight: 500, color: expired ? '#ef4444' : countdown.startsWith('0h') ? '#f97316' : 'var(--text-muted)' }}>
                            {expired ? 'Vypršelo' : `Vyprší za ${countdown}`}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {isPaid && !expired ? (
                          <a href={`${API_URL}/api/enhance/enhanced/${order.image_id}?preview=false`}
                            download={order.filename && !order.filename.match(/^[0-9a-f-]{36}/) ? `enhanced_${order.filename}` : `foto_${new Date(order.created_at).toISOString().slice(0, 10)}_${order.image_id.slice(0, 8)}.jpg`}
                            style={{ flex: 1, textAlign: 'center', padding: '9px 12px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 700, textDecoration: 'none', transition: 'all 0.3s ease', display: 'block', fontFamily: 'inherit' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 8px 16px rgba(var(--accent-rgb, 100, 200, 255), 0.3)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLAnchorElement).style.boxShadow = 'none'; }}
                          >
                            Stáhnout
                          </a>
                        ) : order.payment_status === 'pending' && !expired ? (
                          <button onClick={() => handleBuy(order)} style={{ flex: 1, padding: '9px 12px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 700, transition: 'all 0.3s ease', fontFamily: 'inherit' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 16px rgba(var(--accent-rgb, 100, 200, 255), 0.3)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}
                          >
                            Koupit
                          </button>
                        ) : null}
                        {(expired || order.payment_status === 'pending') && (
                          <button onClick={() => handleDelete(order.id)} style={{ flex: 1, padding: '9px 12px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 700, transition: 'all 0.3s ease', fontFamily: 'inherit' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.2)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
                          >
                            🗑 Smazat
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '2rem 0', flexWrap: 'wrap' }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: '9px 16px', fontSize: 14, fontWeight: 600, background: page === 1 ? 'var(--bg-secondary)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: page === 1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page === 1 ? 'not-allowed' : 'pointer', transition: 'all 0.3s ease', opacity: page === 1 ? 0.5 : 1, fontFamily: 'inherit' }}
                  onMouseEnter={e => { if (page !== 1) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-secondary)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'; }}
                >← Předchozí</button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => Math.abs(p - page) <= 2 || p === 1 || p === totalPages)
                  .map((p, idx, arr) => (
                    <div key={p}>
                      {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ color: 'var(--text-muted)' }}>…</span>}
                      <button onClick={() => setPage(p)} style={{ padding: '9px 14px', fontSize: 14, fontWeight: p === page ? 700 : 600, background: p === page ? 'var(--accent)' : 'var(--bg)', color: p === page ? '#000' : 'var(--text-secondary)', border: '1px solid', borderColor: p === page ? 'var(--accent)' : 'var(--border)', borderRadius: 6, cursor: 'pointer', transition: 'all 0.3s ease', fontFamily: 'inherit' }}
                        onMouseEnter={e => { if (p !== page) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-secondary)'; }}
                        onMouseLeave={e => { if (p !== page) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'; }}
                      >{p}</button>
                    </div>
                  ))}

                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ padding: '9px 16px', fontSize: 14, fontWeight: 600, background: page === totalPages ? 'var(--bg-secondary)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: page === totalPages ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page === totalPages ? 'not-allowed' : 'pointer', transition: 'all 0.3s ease', opacity: page === totalPages ? 0.5 : 1, fontFamily: 'inherit' }}
                  onMouseEnter={e => { if (page !== totalPages) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-secondary)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'; }}
                >Další →</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', animation: 'fadeIn 0.3s ease-out', backdropFilter: 'blur(8px)' }}>
          <img src={lightbox} alt="Náhled" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 25px 60px rgba(0,0,0,0.4)', animation: 'zoomIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
          <button onClick={() => setLightbox(null)} style={{ position: 'fixed', top: 28, right: 32, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.25)', borderRadius: '50%', color: '#fff', fontSize: 24, cursor: 'pointer', transition: 'all 0.3s ease', backdropFilter: 'blur(8px)', fontFamily: 'inherit' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.25)'; (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
          >✕</button>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes zoomIn {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (max-width: 768px) {
          div[style*="grid-template-columns"] {
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)) !important;
          }
          .status-row {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
        }
      `}</style>
    </main>
  );
}