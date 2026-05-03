'use client';

import { useEffect, useRef, useState } from 'react';

const PARTICLES = Array.from({ length: 60 }, (_, i) => ({
  id: i,
  x: (i * 37.3) % 100,
  y: (i * 61.7) % 100,
  size: (i % 5) * 0.4 + 0.6,
  opacity: (i % 5) * 0.08 + 0.08,
  speed: (i % 6) * 3 + 14,
  delay: -(i * 0.8),
}));

export default function Hero() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      if (!sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      setMousePos({
        x: (e.clientX - rect.left - rect.width / 2) / rect.width,
        y: (e.clientY - rect.top - rect.height / 2) / rect.height,
      });
    };
    window.addEventListener('mousemove', handleMouse);
    return () => window.removeEventListener('mousemove', handleMouse);
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
      {/* Particles */}
      <div style={{ position: 'absolute' as const, inset: 0, pointerEvents: 'none' }}>
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

      {/* Ambient glow */}
      <div style={{
        position: 'absolute' as const,
        top: '30%', left: '50%',
        transform: `translate(calc(-50% + ${mousePos.x * 30}px), calc(-50% + ${mousePos.y * 20}px))`,
        width: 800, height: 400,
        background: 'radial-gradient(ellipse, rgba(139,92,246,0.15) 0%, transparent 70%)',
        pointerEvents: 'none' as const,
        transition: 'transform 0.3s ease',
        zIndex: 0,
      }} />
      <div style={{
        position: 'absolute' as const,
        top: '60%', left: '30%',
        transform: `translate(calc(-50% + ${mousePos.x * -20}px), calc(-50% + ${mousePos.y * -15}px))`,
        width: 500, height: 300,
        background: 'radial-gradient(ellipse, rgba(139,92,246,0.08) 0%, transparent 70%)',
        pointerEvents: 'none' as const,
        transition: 'transform 0.4s ease',
        zIndex: 0,
      }} />

      <div style={{ position: 'relative' as const, zIndex: 1, maxWidth: 1200, margin: '0 auto', width: '100%' }}>

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
          maxWidth: 800,
          margin: '0 auto 1.5rem',
        }}>
          Profesionální výsledky{' '}
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
          maxWidth: 520,
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
          marginBottom: '6rem',
        }}>
          <a href="#editor" className="btn btn-primary" style={{ fontSize: 14, padding: '0.9rem 2.25rem' }}>
            Vyzkoušet zdarma →
          </a>
          <a href="#priklady" className="btn" style={{ fontSize: 14, padding: '0.9rem 2.25rem' }}>
            Zobrazit příklady
          </a>
        </div>

        {/* Orbit element */}
        <div style={{ width: 120, height: 120, margin: '0 auto 4rem', position: 'relative' as const }}>
          <div style={{
            position: 'absolute' as const,
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 40, height: 40,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139,92,246,0.9) 0%, rgba(139,92,246,0.2) 60%, transparent 100%)',
            boxShadow: '0 0 30px rgba(139,92,246,0.6), 0 0 60px rgba(139,92,246,0.3)',
            animation: 'glowPulse 3s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute' as const,
            top: '50%', left: '50%',
            width: 80, height: 80,
            marginTop: -40, marginLeft: -40,
            borderRadius: '50%',
            border: '1px solid rgba(139,92,246,0.25)',
            animation: 'orbit1 6s linear infinite',
          }}>
            <div style={{
              position: 'absolute' as const,
              top: -3, left: '50%',
              transform: 'translateX(-50%)',
              width: 6, height: 6,
              borderRadius: '50%',
              background: 'var(--accent)',
              boxShadow: '0 0 8px rgba(139,92,246,0.8)',
            }} />
          </div>
          <div style={{
            position: 'absolute' as const,
            top: '50%', left: '50%',
            width: 110, height: 110,
            marginTop: -55, marginLeft: -55,
            borderRadius: '50%',
            border: '1px solid rgba(139,92,246,0.12)',
            animation: 'orbit2 10s linear infinite',
          }}>
            <div style={{
              position: 'absolute' as const,
              top: -2.5, left: '50%',
              transform: 'translateX(-50%)',
              width: 5, height: 5,
              borderRadius: '50%',
              background: 'rgba(139,92,246,0.6)',
            }} />
            <div style={{
              position: 'absolute' as const,
              bottom: -2.5, left: '50%',
              transform: 'translateX(-50%)',
              width: 3, height: 3,
              borderRadius: '50%',
              background: 'rgba(139,92,246,0.4)',
            }} />
          </div>
        </div>

        {/* Stats */}
        <div style={{
          display: 'flex', justifyContent: 'center',
          gap: '4rem',
          flexWrap: 'wrap' as const,
          borderTop: '1px solid var(--border)', paddingTop: '3rem',
        }}>
          {[
            { value: '< 30s', label: 'Doba zpracování' },
            { value: 'RAW', label: 'Podpora formátů' },
            { value: 'AI v5', label: 'Model Autoenhance' },
            { value: '100%', label: 'Automatické' },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center', cursor: 'default' }}>
              <p style={{
                fontSize: '2rem', fontWeight: 700,
                background: 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}>
                {stat.value}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, letterSpacing: '0.05em' }}>
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
        @keyframes orbit1 {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes orbit2 {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        @keyframes glowPulse {
          0%, 100% { 
            opacity: 1; 
            transform: translate(-50%, -50%) scale(1); 
            box-shadow: 0 0 30px rgba(139,92,246,0.7), 0 0 60px rgba(139,92,246,0.3); 
          }
          50% { 
            opacity: 0.6; 
            transform: translate(-50%, -50%) scale(0.8); 
            box-shadow: 0 0 15px rgba(139,92,246,0.4), 0 0 30px rgba(139,92,246,0.15); 
          }
        }
      `}</style>
    </section>
  );
}