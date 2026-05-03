'use client';

import { useCallback, useRef, useState } from 'react';

interface Example {
  title: string; tag: string; settings: string[]; before: string; after: string;
}

const EXAMPLES: Example[] = [
  {
    title: 'Koupelna — výměna oblohy + vytažení oken', tag: 'Interiér',
    settings: ['Výměna oblohy', 'Vytažení oken', 'Neutrální tón'],
    before: '/examples/before-1.jpg', after: '/examples/after-1.jpg',
  },
  {
    title: 'Obývací pokoj — teplý tón + korekce vertikály', tag: 'Interiér',
    settings: ['Teplý tón', 'Korekce vertikály', 'Korekce objektivu'],
    before: '/examples/before-2.jpg', after: '/examples/after-2.jpg',
  },
  {
    title: 'Exteriér — výměna oblohy + moderní tón', tag: 'Exteriér',
    settings: ['Výměna oblohy', 'Moderní tón', 'Korekce objektivu'],
    before: '/examples/before-3.jpg', after: '/examples/after-3.jpg',
  },
];

function BeforeAfterSlider({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updatePos = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    setPos(pct);
  }, []);

  return (
    <div
      ref={containerRef} className="ba-container"
      style={{ aspectRatio: '4/3', background: 'var(--bg-secondary)', userSelect: 'none' as const }}
      onMouseDown={() => { dragging.current = true; }}
      onMouseMove={e => { if (dragging.current) updatePos(e.clientX); }}
      onMouseUp={() => { dragging.current = false; }}
      onMouseLeave={() => { dragging.current = false; }}
      onTouchMove={e => updatePos(e.touches[0].clientX)}
    >
      <img src={before} alt="Před" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      <span className="ba-label" style={{ left: 12 }}>Před</span>
      <div className="ba-after" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={after} alt="Po" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <span className="ba-label" style={{ right: 12 }}>Po</span>
      </div>
      <div className="ba-divider" style={{ left: `${pos}%` }}>
        <div className="ba-handle">⇔</div>
      </div>
    </div>
  );
}

function ExampleCard({ ex, index }: { ex: Example; index: number }) {
  const [hovered, setHovered] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
    const y = (e.clientY - rect.top - rect.height / 2) / rect.height;
    setTilt({ x: y * 5, y: x * -5 });
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setTilt({ x: 0, y: 0 }); }}
      onMouseMove={handleMouseMove}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${hovered ? 'var(--accent-glow)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)', overflow: 'hidden',
        transition: 'border-color 0.3s, box-shadow 0.3s',
        boxShadow: hovered ? '0 24px 60px rgba(139,92,246,0.15), 0 8px 24px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)', transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateZ(${hovered ? 6 : 0}px)`,
        transformStyle: 'preserve-3d' as const,
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
        background: 'radial-gradient(ellipse, rgba(245,158,11,0.05) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative' as const }}>
        <div className="tag">Příklady</div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-end', marginBottom: '3rem',
          flexWrap: 'wrap' as const, gap: '1rem',
        }}>
          <h2 style={{
            fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
            fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)',
          }}>
            Výsledky AI retušování
          </h2>
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