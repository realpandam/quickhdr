'use client';

import { useState } from 'react';

const steps = [
  {
    number: '01', icon: '↑',
    title: 'Nahrajte fotografii',
    description: 'Přetáhněte fotografii nebo ji vyberte ze svého zařízení. Podporujeme JPG, PNG, RAW a desítky dalších formátů.',
    color: 'rgba(139,92,246,0.15)',
  },
  {
    number: '02', icon: '⚙',
    title: 'Nastavte parametry',
    description: 'Zvolte typ vylepšení, výměnu oblohy, korekci vertikály a další nastavení přesně podle vašich potřeb.',
    color: 'rgba(139,92,246,0.1)',
  },
  {
    number: '03', icon: '✦',
    title: 'AI zpracuje snímek',
    description: 'Naše AI automaticky vylepší jas, kontrast, ostrost a barvy fotografie během několika sekund.',
    color: 'rgba(139,92,246,0.12)',
  },
  {
    number: '04', icon: '↓',
    title: 'Stáhněte výsledek',
    description: 'Po jednorázové platbě si stáhněte profesionálně vyretušovanou fotografii v plném rozlišení.',
    color: 'rgba(139,92,246,0.08)',
  },
];

function StepCard({ step, index }: { step: typeof steps[0]; index: number }) {
  const [hovered, setHovered] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
    const y = (e.clientY - rect.top - rect.height / 2) / rect.height;
    setTilt({ x: y * 8, y: x * -8 });
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setTilt({ x: 0, y: 0 }); }}
      onMouseMove={handleMouseMove}
      style={{
        background: hovered ? `linear-gradient(135deg, var(--bg-card), ${step.color})` : 'var(--bg-card)',
        border: `1px solid ${hovered ? 'var(--accent-glow)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        padding: '2rem',
        cursor: 'default',
        transition: 'background 0.3s, border-color 0.3s, box-shadow 0.3s',
        boxShadow: hovered ? '0 20px 60px rgba(139,92,246,0.15), 0 4px 20px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)',
        transform: `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateZ(${hovered ? 8 : 0}px)`,
        transformStyle: 'preserve-3d' as const,
        willChange: 'transform',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
          {step.number}
        </span>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: step.color, border: '1px solid var(--accent-glow)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, transition: 'transform 0.3s',
          transform: hovered ? 'scale(1.1) rotate(5deg)' : 'scale(1)',
        }}>
          {step.icon}
        </div>
      </div>

      <div style={{ height: 2, background: 'var(--border)', borderRadius: 999, marginBottom: '1.5rem', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: hovered ? '100%' : '30%',
          background: 'linear-gradient(90deg, #6B47DC, #A78BFA)',
          borderRadius: 999,
          transition: 'width 0.8s ease',
        }} />
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
        {step.title}
      </h3>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        {step.description}
      </p>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <section id="jak-to-funguje" style={{
      borderTop: '1px solid var(--border)',
      padding: '7rem 2rem',
      position: 'relative' as const,
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute' as const, top: '50%', right: '-10%',
        transform: 'translateY(-50%)', width: 600, height: 600,
        background: 'radial-gradient(ellipse, rgba(139,92,246,0.05) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative' as const }}>
        <div className="tag">Postup</div>
        <h2 style={{
          fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
          fontWeight: 700, letterSpacing: '-0.02em',
          marginBottom: '3.5rem', color: 'var(--text-primary)',
        }}>
          Jak to funguje
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.25rem',
        }}>
          {steps.map((step, i) => (
            <StepCard key={step.number} step={step} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}