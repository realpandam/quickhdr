'use client';

import { useEffect, useRef, useState } from 'react';

const PARTICLES = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  x: (i * 37.3) % 100,
  y: (i * 61.7) % 100,
  size: (i % 5) * 0.4 + 0.6,
  opacity: (i % 5) * 0.06 + 0.08,
  speed: (i % 6) * 3 + 14,
  delay: -(i * 0.8),
}));

const STATS = [
  { value: 10000, suffix: '+', label: 'Zpracovaných fotografií' },
  { value: 30, suffix: ' min', label: 'Doba zpracování' },
  { value: 5, prefix: 'v', label: 'AI model generace' },
  { value: 100, suffix: '%', label: 'Automatické' },
];

function AnimatedCounter({ value, prefix = '', suffix = '', duration = 2000 }: { value: number; prefix?: string; suffix?: string; duration?: number }) {
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
              const eased = 1 - Math.pow(1 - progress, 3);
              setCount(Math.floor(value * eased));
              if (progress < 1) requestAnimationFrame(animate);
              else setCount(value);
            };
            requestAnimationFrame(animate);
          }
        });
      },
      { threshold: 0.3 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref}>{prefix}{count.toLocaleString('cs-CZ')}{suffix}</span>
  );
}

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null);

  // Global mouse tracking - nastavuje --mx --my pro mouse-glow přes celou stránku
  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      document.documentElement.style.setProperty('--mx', `${e.clientX}px`);
      document.documentElement.style.setProperty('--my', `${e.clientY}px`);
    };
    window.addEventListener('mousemove', handleMouse);
    return () => window.removeEventListener('mousemove', handleMouse);
  }, []);

  // Inject mouse glow element jen jednou
  useEffect(() => {
    if (!document.querySelector('.mouse-glow')) {
      const glow = document.createElement('div');
      glow.className = 'mouse-glow';
      document.body.appendChild(glow);
    }
  }, []);

  return (
    <section ref={sectionRef} style={{
      maxWidth: '100%',
      margin: '0 auto',
      padding: 'clamp(4rem, 10vw, 8rem) 1.25rem clamp(3rem, 8vw, 6rem)',
      textAlign: 'center',
      position: 'relative' as const,
      overflow: 'hidden',
      minHeight: '90vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Particles - lokální v Hero */}
      <div style={{ position: 'absolute' as const, inset: 0, pointerEvents: 'none', zIndex: 1 }}>
        {PARTICLES.map(p => (
          <div key={p.id} style={{
            position: 'absolute' as const,
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: 'var(--accent)',
            opacity: p.opacity,
            animation: `floatParticle ${p.speed}s ease-in-out infinite`,
            animationDelay: `${p.delay}s`,
          }} />
        ))}
      </div>

      <div style={{ position: 'relative' as const, zIndex: 2, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        {/* Badge */}
        <div className="fade-up fade-up-1" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.15em',
          textTransform: 'uppercase' as const,
          color: 'var(--accent)',
          border: '1px solid var(--accent-glow)',
          borderRadius: 999,
          padding: '5px 16px',
          marginBottom: '2rem',
          background: 'linear-gradient(135deg, rgba(107,71,220,0.15), rgba(167,139,250,0.15))',
          backdropFilter: 'blur(8px)',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--accent)', display: 'inline-block',
            animation: 'pulse 2s infinite',
          }} />
          Profesionální HDR úprava fotografií
        </div>

        {/* Nadpis */}
        <h1 className="fade-up fade-up-2" style={{
          fontSize: 'clamp(2.4rem, 6vw, 5rem)',
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: '-0.03em',
          color: 'var(--text-primary)',
          maxWidth: 900,
          margin: '0 auto 1.5rem',
        }}>
          Profesionální snímky nemovitostí{' '}
          <span style={{
            color: 'var(--accent)',
            position: 'relative' as const,
            display: 'inline-block',
          }}>
            za sekundy
            <span style={{
              position: 'absolute' as const,
              bottom: -4, left: 0, right: 0,
              height: 2,
              background: 'linear-gradient(90deg, #6B47DC, #A78BFA)',
              borderRadius: 999,
            }} />
          </span>
        </h1>

        {/* Popis */}
        <p className="fade-up fade-up-3" style={{
          fontSize: 'clamp(1rem, 2vw, 1.2rem)',
          color: 'var(--text-secondary)',
          maxWidth: 560,
          margin: '0 auto 2.5rem',
          fontWeight: 300,
          lineHeight: 1.7,
        }}>
          Nahrajte fotografii a AI automaticky vylepší jas, kontrast, ostrost, vytáhne okna a vymění oblohu.
        </p>

        {/* CTA */}
        <div className="fade-up fade-up-3" style={{
          display: 'flex', gap: '1rem',
          justifyContent: 'center', flexWrap: 'wrap' as const,
          marginBottom: '5rem',
        }}>
          <a href="#editor" className="btn btn-primary" style={{ fontSize: 14, padding: '0.9rem 2.25rem' }}>
            Vyzkoušet zdarma →
          </a>
          <a href="#priklady" className="btn" style={{ fontSize: 14, padding: '0.9rem 2.25rem' }}>
            Zobrazit příklady
          </a>
        </div>

        {/* Animated stats */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'stretch',
          gap: 0,
          flexWrap: 'wrap' as const,
          marginTop: '2rem',
          background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(167,139,250,0.03))',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 'clamp(1.5rem, 4vw, 2.5rem)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          maxWidth: 900,
          margin: '0 auto',
          boxShadow: '0 24px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(139,92,246,0.08) inset',
        }}>
          {STATS.map((stat, i) => (
            <div key={stat.label} style={{
              flex: '1 1 200px',
              textAlign: 'center',
              padding: '0.5rem 1rem',
              borderRight: i < STATS.length - 1 ? '1px solid var(--border)' : 'none',
              minWidth: 120,
            }}>
              <p style={{
                fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                letterSpacing: '-0.02em',
                lineHeight: 1,
                marginBottom: 8,
              }}>
                <AnimatedCounter
                  value={stat.value}
                  prefix={stat.prefix ?? ''}
                  suffix={stat.suffix ?? ''}
                  duration={1500 + i * 200}
                />
              </p>
              <p style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase' as const,
                fontWeight: 600,
              }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes floatParticle {
          0%, 100% { transform: translateY(0px) translateX(0px); }
          25% { transform: translateY(-15px) translateX(5px); }
          50% { transform: translateY(-8px) translateX(-8px); }
          75% { transform: translateY(-20px) translateX(3px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </section>
  );
}
