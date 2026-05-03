'use client';

import type { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import { API_URL } from '../lib/config';
import { supabase } from '../lib/supabase';

interface Order {
  id: string;
  image_id: string;
  filename: string;
  amount_czk: number;
  stripe_payment_status: string;
  created_at: string;
  expires_at: string;
}

const PAGE_SIZE = 10;

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'price'>('newest');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/login';
        return;
      }
      setUser(user);

      // Automaticky smaž záznamy starší než 30 dní
      await supabase
        .from('orders')
        .delete()
        .eq('user_id', user.id)
        .lt('expires_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      const { data } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      setOrders(data ?? []);
      setLoading(false);
    };

    init();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const filteredOrders = orders
    .filter(order => {
      if (filter === 'paid') return order.stripe_payment_status === 'paid';
      if (filter === 'pending') return order.stripe_payment_status !== 'paid';
      return true;
    })
    .filter(order => {
      if (!search) return true;
      return order.filename?.toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => {
      if (sort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sort === 'price') return b.amount_czk - a.amount_czk;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE);
  const paginatedOrders = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset na první stránku při změně filtru
  useEffect(() => {
    setPage(1);
  }, [filter, sort, search]);

  // Countdown helper
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
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Načítám...</p>
      </main>
    );
  }

  const handleBuy = async (order: Order) => {
    const res = await fetch(`${API_URL}/api/payments/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_id: order.image_id,
        filename: order.filename,
        user_id: user?.id,
      }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  };

  const handleDelete = async (orderId: string) => {
    await supabase.from('orders').delete().eq('id', orderId);
    setOrders(prev => prev.filter(o => o.id !== orderId));
  };

  const handleDeleteExpired = async () => {
    const expiredIds = orders
      .filter(o => new Date(o.expires_at) < new Date())
      .map(o => o.id);
    await supabase.from('orders').delete().in('id', expiredIds);
    setOrders(prev => prev.filter(o => new Date(o.expires_at) >= new Date()));
  };

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <Header />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(1.5rem, 4vw, 3rem) clamp(1rem, 4vw, 2rem)' }}>
        {/* Nadpis */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div className="tag">Moje fotografie</div>
          <h1 style={{
            fontSize: 'clamp(1.5rem, 3vw, 2rem)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
            marginBottom: '0.5rem',
          }}>
            Historie retušování
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Přehled všech upravených a zakoupených fotografií.
          </p>
        </div>

        {/* CTA */}
        <div style={{
          display: 'flex',
          gap: '0.75rem',
          marginBottom: '2rem',
          flexWrap: 'wrap' as const,
          alignItems: 'center',
        }}>
          <a href="/#editor" className="btn btn-primary" style={{ fontSize: 13, padding: '8px 20px' }}>
            + Nahrát nové fotografie
          </a>
          {orders.some(o => new Date(o.expires_at) < new Date()) && (
            <button
              onClick={handleDeleteExpired}
              className="btn"
              title="Záznamy starší než 30 dní se smažou automaticky při každém načtení stránky."
              style={{ fontSize: 13, padding: '8px 20px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
            >
              Smazat vypršené ({orders.filter(o => new Date(o.expires_at) < new Date()).length})
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 16, height: 16,
                borderRadius: '50%',
                border: '1px solid rgba(239,68,68,0.5)',
                fontSize: 10,
                marginLeft: 6,
                color: '#ef4444',
                flexShrink: 0,
              }}>
                i
              </span>
            </button>
          )}
        </div>

        {orders.length === 0 ? (
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '4rem 2rem',
            textAlign: 'center' as const,
            background: 'var(--bg-card)',
          }}>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              Zatím žádné fotografie
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Nahrajte první fotografii a vyzkoušejte AI retušování.
            </p>
          </div>
        ) : (
          <>
            {/* Filter a řazení */}
            <div className="dashboard-filters" style={{
              display: 'flex',
              gap: '0.75rem',
              marginBottom: '1.5rem',
              flexWrap: 'wrap' as const,
              alignItems: 'center',
            }}>
              <input
                type="text"
                placeholder="Hledat podle názvu..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              <select
                value={filter}
                onChange={e => setFilter(e.target.value as typeof filter)}
                className="select"
              >
                <option value="all">Všechny</option>
                <option value="paid">Zaplacené</option>
                <option value="pending">Čekající</option>
              </select>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as typeof sort)}
                className="select"
              >
                <option value="newest">Nejnovější</option>
                <option value="oldest">Nejstarší</option>
                <option value="price">Cena</option>
              </select>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' as const }}>
                {filteredOrders.length} {filteredOrders.length === 1 ? 'fotografie' : 'fotografií'}
              </span>
            </div>

            {filteredOrders.length === 0 ? (
              <div style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '3rem 2rem',
                textAlign: 'center' as const,
                background: 'var(--bg-card)',
              }}>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  Žádné výsledky pro zadané filtry.
                </p>
                <button
                  onClick={() => { setFilter('all'); setSearch(''); setSort('newest'); }}
                  className="btn"
                  style={{ marginTop: '1rem', fontSize: 13 }}
                >
                  Zrušit filtry
                </button>
              </div>
            ) : (
              <>
                <div className="dashboard-table" style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-secondary)' }}>
                        {['Soubor', 'Datum', 'Cena', 'Stav', 'Vyprší za', 'Akce'].map(h => (
                          <th key={h} style={{
                            textAlign: 'left' as const,
                            padding: '0.65rem 1rem',
                            fontWeight: 600,
                            fontSize: 11,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase' as const,
                            color: 'var(--text-muted)',
                            borderBottom: '1px solid var(--border)',
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedOrders.map((order, i) => {
                        const expired = new Date(order.expires_at) < new Date();
                        const countdown = getCountdown(order.expires_at);
                        return (
                          <tr key={order.id} style={{
                            borderBottom: i < paginatedOrders.length - 1 ? '1px solid var(--border)' : 'none',
                            background: 'var(--bg)',
                          }}>
                            {/* Soubor + thumbnail */}
                            <td style={{ padding: '0.75rem 1rem', maxWidth: 240 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div onClick={() => setLightbox(`${API_URL}/api/enhance/enhanced/${order.image_id}?preview=true&quality=80`)}
                                  style={{
                                    width: 52, height: 40,
                                    borderRadius: 4, overflow: 'hidden',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border)',
                                    flexShrink: 0, cursor: 'zoom-in',
                                  }}>
                                  <img
                                    src={`${API_URL}/api/enhance/enhanced/${order.image_id}?preview=true&quality=60`}
                                    alt={order.filename}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={e => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                </div>
                                <p style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap' as const,
                                  color: 'var(--text-primary)',
                                }}>
                                  {order.filename && !order.filename.match(/^[0-9a-f-]{36}/)
                                    ? order.filename
                                    : <span style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: 'var(--accent)',
                                      background: 'var(--accent-muted)',
                                      border: '1px solid var(--accent-glow)',
                                      borderRadius: 999,
                                      padding: '2px 8px',
                                    }}>
                                      Bez názvu
                                    </span>
                                  }
                                </p>
                              </div>
                            </td>

                            {/* Datum */}
                            <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' as const }}>
                              {new Date(order.created_at).toLocaleDateString('cs-CZ')}
                            </td>

                            {/* Cena */}
                            <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                              {order.amount_czk} Kč
                            </td>

                            {/* Stav */}
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <span style={{
                                fontSize: 11, fontWeight: 700,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase' as const,
                                color: order.stripe_payment_status === 'paid' ? 'var(--progress-done)' : 'var(--text-muted)',
                                background: order.stripe_payment_status === 'paid' ? 'rgba(74,222,128,0.08)' : 'var(--accent-muted)',
                                padding: '2px 8px',
                                borderRadius: 999,
                              }}>
                                {order.stripe_payment_status === 'paid' ? 'Zaplaceno' :
                                  order.stripe_payment_status === 'pending' ? 'Ke koupi' : 'Čeká'}
                              </span>
                            </td>

                            {/* Countdown */}
                            <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' as const }}>
                              {order.stripe_payment_status === 'paid' ? (
                                expired ? (
                                  <span style={{ fontSize: 12, color: '#ef4444' }}>Vypršelo</span>
                                ) : (
                                  <span style={{ fontSize: 12, color: countdown && countdown.startsWith('0h') ? '#f97316' : 'var(--text-muted)' }}>
                                    {countdown}
                                  </span>
                                )
                              ) : expired ? (
                                <span style={{ fontSize: 12, color: '#ef4444' }}>Vypršelo</span>
                              ) : (
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                              )}
                            </td>

                            {/* Akce */}
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                {order.stripe_payment_status === 'paid' && !expired ? (
                                  <a
                                    href={`${API_URL}/api/enhance/enhanced/${order.image_id}?preview=false`}
                                    download={
                                      order.filename && !order.filename.match(/^[0-9a-f-]{36}/)
                                        ? `enhanced_${order.filename}`
                                        : `foto_${new Date(order.created_at).toISOString().slice(0, 10)}_${order.image_id.slice(0, 8)}.jpg`
                                    }
                                    className="btn btn-primary"
                                    style={{ padding: '4px 12px', fontSize: 12 }}
                                  >
                                    Stáhnout
                                  </a>
                                ) : order.stripe_payment_status === 'pending' && !expired ? (
                                  <button
                                    onClick={() => handleBuy(order)}
                                    className="btn btn-primary"
                                    style={{ padding: '4px 12px', fontSize: 12 }}
                                  >
                                    Koupit — 59 Kč
                                  </button>
                                ) : (
                                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    {expired ? 'Vypršelo' : '—'}
                                  </span>
                                )}
                                {/* Smazat tlačítko — vždy viditelné pro vypršené, pending */}
                                {(expired || order.stripe_payment_status === 'pending') && (
                                  <button
                                    onClick={() => handleDelete(order.id)}
                                    style={{
                                      background: 'none', border: 'none',
                                      color: 'var(--text-muted)', cursor: 'pointer',
                                      fontSize: 16, padding: '2px 6px',
                                      borderRadius: 4,
                                      transition: 'color 0.2s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                                    title="Smazat záznam"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobilní karty */}
                <div className="dashboard-cards">
                  {paginatedOrders.map((order) => {
                    const expired = new Date(order.expires_at) < new Date();
                    const countdown = getCountdown(order.expires_at);
                    return (
                      <div key={order.id} style={{
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        background: 'var(--bg-card)',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column' as const,
                        gap: '0.75rem',
                      }}>
                        {/* Horní řádek — thumbnail + název + stav */}
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <div
                            onClick={() => setLightbox(`${API_URL}/api/enhance/enhanced/${order.image_id}?preview=true&quality=80`)}
                            style={{
                              width: 56, height: 44, borderRadius: 6,
                              overflow: 'hidden', flexShrink: 0,
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border)', cursor: 'zoom-in',
                            }}
                          >
                            <img
                              src={`${API_URL}/api/enhance/enhanced/${order.image_id}?preview=true&quality=60`}
                              alt={order.filename}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{
                              fontSize: 13, fontWeight: 500,
                              color: 'var(--text-primary)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                              marginBottom: 4,
                            }}>
                              {order.filename && !order.filename.match(/^[0-9a-f-]{36}/)
                                ? order.filename
                                : <span style={{
                                  fontSize: 11, fontWeight: 600, color: 'var(--accent)',
                                  background: 'var(--accent-muted)', border: '1px solid var(--accent-glow)',
                                  borderRadius: 999, padding: '2px 8px',
                                }}>Bez názvu</span>
                              }
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
                              <span style={{
                                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                                textTransform: 'uppercase' as const,
                                color: order.stripe_payment_status === 'paid' ? 'var(--progress-done)' : 'var(--text-muted)',
                                background: order.stripe_payment_status === 'paid' ? 'rgba(74,222,128,0.08)' : 'var(--accent-muted)',
                                padding: '2px 8px', borderRadius: 999,
                              }}>
                                {order.stripe_payment_status === 'paid' ? 'Zaplaceno' : order.stripe_payment_status === 'pending' ? 'Ke koupi' : 'Čeká'}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {new Date(order.created_at).toLocaleDateString('cs-CZ')}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {order.amount_czk} Kč
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Spodní řádek — countdown + akce */}
                        <div style={{
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'space-between',
                          borderTop: '1px solid var(--border)', paddingTop: '0.75rem',
                          gap: 8, flexWrap: 'wrap' as const,
                        }}>
                          <span style={{ fontSize: 12, color: expired ? '#ef4444' : 'var(--text-muted)', flexShrink: 0 }}>
                            {order.stripe_payment_status === 'paid'
                              ? expired ? 'Vypršelo' : `Vyprší za ${countdown}`
                              : expired ? 'Vypršelo' : '—'
                            }
                          </span>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
                            {order.stripe_payment_status === 'paid' && !expired ? (
                              <a
                                href={`${API_URL}/api/enhance/enhanced/${order.image_id}?preview=false`}
                                download={
                                  order.filename && !order.filename.match(/^[0-9a-f-]{36}/)
                                    ? `enhanced_${order.filename}`
                                    : `foto_${new Date(order.created_at).toISOString().slice(0, 10)}_${order.image_id.slice(0, 8)}.jpg`
                                }
                                className="btn btn-primary"
                                style={{ padding: '6px 14px', fontSize: 12 }}
                              >
                                Stáhnout
                              </a>
                            ) : order.stripe_payment_status === 'pending' && !expired ? (
                              <button
                                onClick={() => handleBuy(order)}
                                className="btn btn-primary"
                                style={{ padding: '6px 14px', fontSize: 12, whiteSpace: 'nowrap' as const }}
                              >
                                Koupit 59 Kč
                              </button>
                            ) : null}
                            {(expired || order.stripe_payment_status === 'pending') && (
                              <button
                                onClick={() => handleDelete(order.id)}
                                style={{
                                  background: 'rgba(239,68,68,0.08)',
                                  border: '1px solid rgba(239,68,68,0.2)',
                                  color: '#ef4444', cursor: 'pointer',
                                  fontSize: 12, padding: '6px 10px',
                                  borderRadius: 6, flexShrink: 0,
                                }}
                                title="Smazat záznam"
                              >
                                Smazat
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Stránkování */}
                {totalPages > 1 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    marginTop: '1.5rem',
                  }}>
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="btn"
                      style={{ fontSize: 12, padding: '4px 12px', opacity: page === 1 ? 0.4 : 1 }}
                    >
                      ← Předchozí
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className="btn"
                        style={{
                          fontSize: 12,
                          padding: '4px 10px',
                          background: p === page ? 'var(--accent)' : 'transparent',
                          color: p === page ? '#000' : 'var(--text-secondary)',
                          borderColor: p === page ? 'var(--accent)' : 'var(--border)',
                        }}
                      >
                        {p}
                      </button>
                    ))}

                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="btn"
                      style={{ fontSize: 12, padding: '4px 12px', opacity: page === totalPages ? 0.4 : 1 }}
                    >
                      Další →
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      {
        lightbox && (
          <div onClick={() => setLightbox(null)} style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}>
            <img src={lightbox} alt="Náhled" style={{
              maxWidth: '90vw', maxHeight: '90vh',
              objectFit: 'contain', borderRadius: 4,
            }} />
            <button onClick={() => setLightbox(null)} style={{
              position: 'fixed', top: 20, right: 24,
              background: 'none', border: 'none',
              color: '#fff', fontSize: 24, cursor: 'pointer',
            }}>✕</button>
          </div>
        )
      }

      {/* Mobile dashboard cards */}
      <style>{`
        .dashboard-table { display: table; width: 100%; }
        .dashboard-cards { display: none; }
        @media (max-width: 768px) {
          .dashboard-table { display: none !important; }
          .dashboard-cards { display: flex !important; flex-direction: column; gap: 0.75rem; }
        }
      `}</style>
    </main >
  );
}