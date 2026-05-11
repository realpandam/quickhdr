'use client';

import { useEffect, useRef, useState } from 'react';

const features = [
  { icon: '🤖', text: 'Zpracování AI modelem v5' },
  { icon: '☁', text: 'Výměna oblohy' },
  { icon: '🪟', text: 'Vytažení oken' },
  { icon: '📐', text: 'Korekce vertikály a objektivu' },
  { icon: '📷', text: 'Podpora RAW formátů (ARW, CR3, NEF...)' },
  { icon: '✨', text: 'HDR bracketing' },
  { icon: '🔒', text: 'Anonymizace obličejů a SPZ' },
  { icon: '🔍', text: 'Zvýšení rozlišení' },
  { icon: '⬇', text: 'Stažení v plném rozlišení' },
  { icon: '📅', text: 'Dostupnost 7 dní po zaplacení' },
];

const benefits = [
  { title: 'Náhled zdarma', desc: 'Před platbou si prohlédněte výsledek' },
  { title: 'Rychlé zpracování', desc: 'Hotovo do 30 minut' },
  { title: 'Bezpečná platba', desc: 'Přes GoPay platební bránu' },
  { title: 'Plné rozlišení', desc: 'Bez komprese, originální kvalita' },
];

function PriceCounter({ value, duration = 1500 }: { value: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const animated = useRef(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !animated.current) {
            animated.current = true;
            const startTime = performance.now();
            const animate = (now: number) => {
              const elapsed = now - startTime;
              const progress = Math.min(1, elapsed / duration);
              const eased = 1 - Math.pow(1 - progress, 4);
              setCount(Math.floor(value * eased));
              if (progress < 1) requestAnimationFrame(animate);
              else setCount(value);
            };
            requestAnimationFrame(animate);
          }
        });
      },
      { threshold: 0.4 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, duration]);

  return <span ref={ref}>{count}</span>;
}

export default function Pricing() {
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  };

  const handleMouseLeave = () => setMousePos({ x: 0.5, y: 0.5 });

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
        width: 800, height: 500,
        background: 'radial-gradient(ellipse, rgba(139,92,246,0.1) 0%, transparent 70%)',
        pointerEvents: 'none',
        animation: 'glowPulse 6s ease-in-out infinite',
      }} />

      <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative' as const }}>
        <div style={{ textAlign: 'center' as const, marginBottom: '3.5rem' }}>
          <div className="tag" style={{ marginBottom: '0.75rem' }}>Ceník</div>
          <h2 style={{
            fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
            fontWeight: 700, letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
            marginBottom: '0.5rem',
          }}>
            Jednoduchý ceník
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Žádné předplatné. Platíte pouze za to, co stáhnete.
          </p>
        </div>

        {/* Hero Glassmorphism Card */}
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            maxWidth: 880,
            margin: '0 auto',
            position: 'relative' as const,
            borderRadius: 24,
            background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(167,139,250,0.03))',
            border: '1px solid var(--border)',
            padding: 'clamp(2rem, 5vw, 4rem)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            overflow: 'hidden',
            boxShadow: '0 30px 80px rgba(0,0,0,0.3), 0 0 0 1px rgba(139,92,246,0.1) inset',
          }}
        >
          {/* Mouse-following spotlight */}
          <div style={{
            position: 'absolute' as const,
            inset: 0,
            background: `radial-gradient(600px circle at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(139,92,246,0.1), transparent 50%)`,
            pointerEvents: 'none' as const,
            transition: 'background 0.3s ease',
          }} />

          {/* Corner accents */}
          <div style={{
            position: 'absolute' as const,
            top: -100, right: -100,
            width: 300, height: 300,
            background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)',
            pointerEvents: 'none' as const,
          }} />
          <div style={{
            position: 'absolute' as const,
            bottom: -80, left: -80,
            width: 250, height: 250,
            background: 'radial-gradient(circle, rgba(167,139,250,0.08) 0%, transparent 70%)',
            pointerEvents: 'none' as const,
          }} />

          {/* Animated top border */}
          <div style={{
            position: 'absolute' as const,
            top: 0, left: 0, right: 0,
            height: 2,
            background: 'linear-gradient(90deg, transparent, #6B47DC, #A78BFA, #6B47DC, transparent)',
            backgroundSize: '200% 100%',
            animation: 'borderShimmer 4s linear infinite',
          }} />

          <div style={{ position: 'relative' as const, zIndex: 1 }}>
            {/* Badge + price section */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: '2rem',
              marginBottom: '2.5rem',
              textAlign: 'center' as const,
            }}>
              {/* Badge */}
              <div>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'linear-gradient(135deg, #6B47DC, #A78BFA)',
                  color: '#fff',
                  fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase' as const,
                  padding: '6px 16px',
                  borderRadius: 999,
                  boxShadow: '0 8px 24px rgba(107,71,220,0.4)',
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#fff', display: 'inline-block',
                    animation: 'pulse 2s infinite',
                  }} />
                  Jednorázová platba
                </div>
              </div>

              {/* Price */}
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'center',
                  gap: 12,
                }}>
                  <span style={{
                    fontSize: 'clamp(4rem, 10vw, 7rem)',
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #FFFFFF 0%, #A78BFA 60%, #6B47DC 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    letterSpacing: '-0.04em',
                    lineHeight: 1,
                    textShadow: '0 0 80px rgba(139,92,246,0.4)',
                  }}>
                    <PriceCounter value={25} />
                  </span>
                  <span style={{
                    fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                  }}>
                    Kč
                  </span>
                </div>
                <p style={{
                  fontSize: 14,
                  color: 'var(--text-muted)',
                  marginTop: 8,
                  letterSpacing: '0.05em',
                }}>
                  za jednu fotografii
                </p>
              </div>

              {/* CTA */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
                <a
                  href="#editor"
                  className="btn btn-primary"
                  style={{
                    fontSize: 15,
                    padding: '1rem 2.5rem',
                    fontWeight: 600,
                    minWidth: 220,
                    justifyContent: 'center',
                  }}
                >
                  Vyzkoušet zdarma →
                </a>
              </div>
              <p style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                textAlign: 'center' as const,
                marginTop: '-1rem',
              }}>
                Náhled zdarma · Platba až po zpracování
              </p>
            </div>

            {/* Divider */}
            <div style={{
              height: 1,
              background: 'linear-gradient(90deg, transparent, var(--border), transparent)',
              margin: '2rem 0',
            }} />

            {/* Features grid - 2 columns */}
            <div>
              <p style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.2em',
                color: 'var(--text-muted)',
                textTransform: 'uppercase' as const,
                marginBottom: '1.5rem',
                textAlign: 'center' as const,
              }}>
                V ceně zahrnuto
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
                gap: '0.75rem 2rem',
                maxWidth: 720,
                margin: '0 auto',
              }}>
                {features.map((f, i) => (
                  <div
                    key={f.text}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '0.5rem 0',
                      animation: `slideInLeft 0.5s ${i * 0.05}s ease both`,
                    }}
                  >
                    <div style={{
                      width: 28, height: 28,
                      borderRadius: 8,
                      background: 'linear-gradient(135deg, rgba(107,71,220,0.15), rgba(167,139,250,0.15))',
                      border: '1px solid var(--accent-glow)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, fontSize: 14,
                    }}>
                      {f.icon}
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {f.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div style={{
              height: 1,
              background: 'linear-gradient(90deg, transparent, var(--border), transparent)',
              margin: '2rem 0',
            }} />

            {/* Benefits - compact horizontal */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '1rem',
              textAlign: 'center' as const,
            }}>
              {benefits.map(b => (
                <div key={b.title} style={{
                  padding: '0.5rem',
                }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: 4,
                  }}>
                    {b.title}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    lineHeight: 1.5,
                  }}>
                    {b.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes borderShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.05); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </section>
  );
}
