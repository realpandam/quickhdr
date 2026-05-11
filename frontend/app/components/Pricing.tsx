'use client';

import { useState } from 'react';

const features = [
  'Zpracování AI modelem v5',
  'Výměna oblohy',
  'Vytažení oken',
  'Korekce vertikály a objektivu',
  'Podpora RAW formátů (ARW, CR3, NEF...)',
  'HDR bracketing',
  'Anonymizace obličejů a SPZ',
  'Zvýšení rozlišení',
  'Stažení v plném rozlišení',
  'Dostupnost 7 dní po zaplacení',
];

const PRICE_CZK = parseInt(process.env.PRICE_CZK || '25');

export default function Pricing() {
  const [hovered, setHovered] = useState(false);
  const [hoveredInfo, setHoveredInfo] = useState(false);

  return (
    <section id="cenik" style={{
      borderTop: '1px solid var(--border)',
      padding: '7rem 2rem',
      position: 'relative' as const,
      overflow: 'hidden',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute' as const,
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 600, height: 400,
        background: 'radial-gradient(ellipse, rgba(139,92,246,0.07) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative' as const }}>
        <div className="tag">Ceník</div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '3.5rem',
          flexWrap: 'wrap' as const,
          gap: '1rem',
        }}>
          <h2 style={{
            fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
            fontWeight: 700, letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
          }}>
            Jednoduchý ceník
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Žádné předplatné. Platíte pouze za to, co stáhnete.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
          gap: '1.5rem',
          maxWidth: 900,
          margin: '0 auto',
        }}>
          {/* Karta — jedna fotografie */}
          <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              background: 'var(--bg-card)',
              border: `1px solid ${hovered ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              padding: '2.5rem',
              position: 'relative' as const,
              transition: 'border-color 0.3s, box-shadow 0.3s',
              boxShadow: hovered
                ? '0 20px 60px rgba(139,92,246,0.15), 0 4px 20px rgba(0,0,0,0.2)'
                : '0 2px 8px rgba(0,0,0,0.1)',
            }}
          >
            {/* Badge */}
            <div style={{
              position: 'absolute' as const,
              top: -12, left: '50%',
              transform: 'translateX(-50%)',
              background: 'linear-gradient(135deg, #6B47DC, #A78BFA)',
              color: '#fff',
              fontSize: 10, fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase' as const,
              padding: '4px 14px',
              borderRadius: 999,
              whiteSpace: 'nowrap' as const,
            }}>
              Jednorázová platba
            </div>

            <div style={{ marginBottom: '1.5rem', paddingTop: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{
                  fontSize: '3.5rem', fontWeight: 700,
                  background: 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                }}>
                  {PRICE_CZK}
                </span>
                <span style={{ fontSize: 18, color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Kč
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                za jednu fotografii
              </p>
            </div>

            <div style={{
              height: 1,
              background: 'var(--border)',
              marginBottom: '1.5rem',
            }} />

            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.75rem', marginBottom: '2rem' }}>
              {features.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 18, height: 18,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(107,71,220,0.15), rgba(167,139,250,0.15))',
                    border: '1px solid var(--accent-glow)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: 10,
                    color: 'var(--accent)',
                  }}>
                    ✓
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {f}
                  </span>
                </div>
              ))}
            </div>

            <a href="#editor" className="btn btn-primary" style={{
              width: '100%',
              justifyContent: 'center',
              fontSize: 14,
              padding: '0.875rem',
            }}>
              Vyzkoušet zdarma →
            </a>

            <p style={{
              fontSize: 11, color: 'var(--text-muted)',
              textAlign: 'center' as const,
              marginTop: '1rem',
            }}>
              Náhled zdarma · Platba až po zpracování
            </p>
          </div>

          {/* Info karta */}
          <div
            onMouseEnter={() => setHoveredInfo(true)}
            onMouseLeave={() => setHoveredInfo(false)}
            style={{
              background: 'var(--bg-card)',
              border: `1px solid ${hoveredInfo ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              padding: '2.5rem',
              display: 'flex',
              flexDirection: 'column' as const,
              gap: '1.5rem',
              transition: 'border-color 0.3s, box-shadow 0.3s',
              boxShadow: hoveredInfo
                ? '0 20px 60px rgba(139,92,246,0.15), 0 4px 20px rgba(0,0,0,0.2)'
                : '0 2px 8px rgba(0,0,0,0.1)',
            }}>
            {[
              {
                icon: '👁',
                title: 'Náhled zdarma',
                desc: 'Před platbou si prohlédněte výsledek s vodoznakem. Platíte pouze pokud jste spokojeni.',
              },
              {
                icon: '⚡',
                title: 'Rychlé zpracování',
                desc: 'Fotografie je zpracována do 30 sekund pomocí AI modelu páté generace.',
              },
              {
                icon: '🔒',
                title: 'Bezpečná platba',
                desc: 'Platby jsou zpracovávány přes GoPay. Vaše platební údaje nikdy nevidíme.',
              },
              {
                icon: '📁',
                title: 'Plné rozlišení',
                desc: 'Po zaplacení stáhnete fotografii v původním rozlišení bez komprese.',
              },
            ].map(item => (
              <div key={item.title} style={{ display: 'flex', gap: 14 }}>
                <div style={{
                  width: 36, height: 36,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, rgba(107,71,220,0.15), rgba(167,139,250,0.15))',
                  border: '1px solid var(--accent-glow)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                }}>
                  {item.icon}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {item.title}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}