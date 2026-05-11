'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Example {
  title: string; tag: string; settings: string[]; before: string; after: string;
}

const EXAMPLES: Example[] = [
  {
    title: 'Černá obrazovka TV — odstranění nežádoucích prvků', tag: 'Interiér',
    settings: ['Odstranění objektů', 'Neutrální tón'],
    before: '/examples/cerna-obrazovka-tv-before.webp', after: '/examples/cerna-obrazovka-tv-after.webp',
  },
  {
    title: 'Čistý výhled z oken — vytažení oken', tag: 'Interiér',
    settings: ['Vytažení oken', 'Neutrální tón'],
    before: '/examples/cisty-vyhled-z-oken-before.webp', after: '/examples/cisty-vyhled-z-oken-after.webp',
  },
  {
    title: 'Odstranění zkreslení — korekce objektivu', tag: 'Interiér',
    settings: ['Korekce objektivu', 'Korekce vertikály'],
    before: '/examples/odstraneni-zkresleni-before.webp', after: '/examples/odstraneni-zkresleni-after.webp',
  },
  {
    title: 'Srovnání linií — korekce perspektivy', tag: 'Exteriér',
    settings: ['Korekce vertikály', 'Korekce objektivu'],
    before: '/examples/srovnani-linii-before.webp', after: '/examples/srovnani-linii-after.webp',
  },
  {
    title: 'Výměna oblohy — dramatická obloha', tag: 'Exteriér',
    settings: ['Výměna oblohy', 'Moderní tón'],
    before: '/examples/vymena-oblohy-before.webp', after: '/examples/vymena-oblohy-after.webp',
  },
  {
    title: 'Zelenější trávník — úprava barev', tag: 'Exteriér',
    settings: ['Teplý tón', 'Neutrální tón'],
    before: '/examples/zelenejsi-travnik-before.webp', after: '/examples/zelenejsi-travnik-after.webp',
  },
];

function BeforeAfterSlider({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50);
  const [hasInteracted, setHasInteracted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const targetPos = useRef(50);
  const animFrame = useRef<number | null>(null);

  // Smooth lerp animation
  useEffect(() => {
    const lerp = () => {
      setPos(p => {
        const next = p + (targetPos.current - p) * 0.18;
        return Math.abs(next - targetPos.current) < 0.05 ? targetPos.current : next;
      });
      animFrame.current = requestAnimationFrame(lerp);
    };
    animFrame.current = requestAnimationFrame(lerp);
    return () => {
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
    };
  }, []);

  const updatePos = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    targetPos.current = pct;
    if (!hasInteracted) setHasInteracted(true);
  }, [hasInteracted]);

  return (
    <div
      ref={containerRef}
      className="ba-container"
      style={{
        aspectRatio: '4/3',
        background: 'var(--bg-secondary)',
        userSelect: 'none' as const,
        position: 'relative' as const,
        overflow: 'hidden',
        cursor: 'ew-resize',
        touchAction: 'none',
      }}
      onMouseDown={(e) => {
        dragging.current = true;
        updatePos(e.clientX);
      }}
      onMouseMove={(e) => {
        if (dragging.current) updatePos(e.clientX);
      }}
      onMouseUp={() => { dragging.current = false; }}
      onMouseLeave={() => { dragging.current = false; }}
      onTouchStart={(e) => {
        dragging.current = true;
        updatePos(e.touches[0].clientX);
      }}
      onTouchMove={(e) => {
        if (dragging.current) updatePos(e.touches[0].clientX);
      }}
      onTouchEnd={() => { dragging.current = false; }}
    >
      <img
        src={before}
        alt="Před"
        draggable={false}
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          display: 'block', pointerEvents: 'none' as const,
        }}
      />
      <span style={{
        position: 'absolute' as const,
        top: 12, left: 12,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        color: '#fff',
        fontSize: 11, fontWeight: 700,
        letterSpacing: '0.1em',
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.1)',
        textTransform: 'uppercase' as const,
      }}>
        PŘED
      </span>

      {/* After image with clip */}
      <div style={{
        position: 'absolute' as const,
        inset: 0,
        clipPath: `inset(0 ${100 - pos}% 0 0)`,
        willChange: 'clip-path',
      }}>
        <img
          src={after}
          alt="Po"
          draggable={false}
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            display: 'block', pointerEvents: 'none' as const,
          }}
        />
        <span style={{
          position: 'absolute' as const,
          top: 12, right: 12,
          background: 'linear-gradient(135deg, #6B47DC, #A78BFA)',
          color: '#fff',
          fontSize: 11, fontWeight: 700,
          letterSpacing: '0.1em',
          padding: '4px 10px',
          borderRadius: 6,
          textTransform: 'uppercase' as const,
          boxShadow: '0 4px 12px rgba(107,71,220,0.4)',
        }}>
          PO
        </span>
      </div>

      {/* Divider line */}
      <div style={{
        position: 'absolute' as const,
        top: 0, bottom: 0,
        left: `${pos}%`,
        width: 2,
        background: '#fff',
        boxShadow: '0 0 16px rgba(255,255,255,0.5), 0 0 32px rgba(139,92,246,0.3)',
        transform: 'translateX(-50%)',
        willChange: 'left',
        pointerEvents: 'none' as const,
      }} />

      {/* Handle */}
      <div style={{
        position: 'absolute' as const,
        top: '50%',
        left: `${pos}%`,
        transform: 'translate(-50%, -50%)',
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #fff, #f0f0f0)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.4), 0 0 0 2px rgba(139,92,246,0.4), 0 0 24px rgba(139,92,246,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        willChange: 'left',
        animation: hasInteracted ? 'none' : 'handlePulse 2.5s ease-in-out infinite',
        cursor: 'ew-resize',
      }}>
        {/* Arrow icons */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M9 6L4 12L9 18" stroke="#6B47DC" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 6L20 12L15 18" stroke="#6B47DC" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Initial hint - shown until interaction */}
      {!hasInteracted && (
        <div style={{
          position: 'absolute' as const,
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 500,
          padding: '6px 14px',
          borderRadius: 100,
          border: '1px solid rgba(255,255,255,0.1)',
          pointerEvents: 'none' as const,
          animation: 'hintFade 3s ease-in-out infinite',
          whiteSpace: 'nowrap' as const,
        }}>
          ← Přetáhněte pro porovnání →
        </div>
      )}

      <style>{`
        @keyframes handlePulse {
          0%, 100% {
            box-shadow: 0 6px 24px rgba(0,0,0,0.4), 0 0 0 2px rgba(139,92,246,0.4), 0 0 24px rgba(139,92,246,0.5);
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            box-shadow: 0 6px 24px rgba(0,0,0,0.4), 0 0 0 4px rgba(139,92,246,0.6), 0 0 40px rgba(139,92,246,0.8);
            transform: translate(-50%, -50%) scale(1.08);
          }
        }
        @keyframes hintFade {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function ExampleCard({ ex, index }: { ex: Example; index: number }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${hovered ? 'var(--accent-glow)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        transition: 'border-color 0.3s, box-shadow 0.3s, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        boxShadow: hovered
          ? '0 24px 60px rgba(139,92,246,0.18), 0 8px 24px rgba(0,0,0,0.3)'
          : '0 2px 8px rgba(0,0,0,0.1)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        willChange: 'transform',
      }}
    >
      <BeforeAfterSlider before={ex.before} after={ex.after} />
      <div style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.5rem' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
            color: 'var(--accent)', background: 'var(--accent-muted)',
            padding: '2px 8px', borderRadius: 999,
            border: '1px solid var(--accent-glow)', display: 'inline-block',
            transition: 'transform 0.2s',
            transform: hovered ? 'scale(1.05)' : 'scale(1)',
          }}>
            {ex.tag}
          </span>
        </div>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
          {ex.title}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
          {ex.settings.map(s => (
            <span key={s} style={{
              fontSize: 11, color: 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: 999, padding: '2px 8px',
            }}>
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Examples() {
  return (
    <section id="priklady" style={{
      borderTop: '1px solid var(--border)', padding: '7rem 2rem',
      position: 'relative' as const, overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute' as const, top: '40%', left: '-5%',
        width: 500, height: 500,
        background: 'radial-gradient(ellipse, rgba(139,92,246,0.05) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative' as const }}>
        <div className="tag">Příklady</div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-end', marginBottom: '3rem',
          flexWrap: 'wrap' as const, gap: '1rem',
        }}>
          <div>
            <h2 style={{
              fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
              fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)',
              marginBottom: '0.5rem',
            }}>
              Výsledky AI retušování
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Přetáhněte slider pro porovnání před a po úpravě.
            </p>
          </div>
          <a href="#editor" className="btn btn-primary">Vyzkoušet zdarma →</a>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))',
          gap: '1.5rem',
        }}>
          {EXAMPLES.map((ex, i) => (
            <ExampleCard key={i} ex={ex} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
