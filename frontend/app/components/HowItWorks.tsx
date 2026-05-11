'use client';

import { useEffect, useRef, useState } from 'react';

const steps = [
  {
    number: '01',
    title: 'Nastavte parametry',
    description: 'Zvolte typ vylepšení, výměnu oblohy, korekci vertikály a další nastavení přesně podle vašich potřeb.',
  },
  {
    number: '02',
    title: 'Nahrajte fotografii',
    description: 'Přetáhněte fotografii nebo ji vyberte ze svého zařízení. Podporujeme JPG, PNG, RAW a desítky dalších formátů.',
  },
  {
    number: '03',
    title: 'AI zpracuje snímek',
    description: 'Naše AI automaticky vylepší jas, kontrast, ostrost a barvy fotografie během několika sekund.',
  },
  {
    number: '04',
    title: 'Stáhněte výsledek',
    description: 'Po jednorázové platbě si stáhněte profesionálně vyretušovanou fotografii v plném rozlišení.',
  },
];

function StepIllustration({ step, active }: { step: number; active: boolean }) {
  const o = active ? 1 : 0.3;
  const transition = 'opacity 0.5s ease, transform 0.5s ease';

  if (step === 0) {
    // Settings
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem',
        opacity: o, transition,
      }}>
        <div style={{
          width: '90%', height: '85%',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '1.25rem',
          display: 'flex', flexDirection: 'column' as const, gap: 14,
        }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: '0.15em', fontWeight: 700, textTransform: 'uppercase' as const }}>NASTAVENÍ</div>

          {/* Pills row 1 */}
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 6 }}>Typ vylepšení</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['Neutrální', 'Teplý', 'Moderní'].map((p, i) => (
                <div key={p} style={{
                  fontSize: 10, padding: '4px 10px', borderRadius: 6,
                  background: i === 0 ? 'rgba(139,92,246,0.2)' : 'transparent',
                  border: `1px solid ${i === 0 ? 'rgba(139,92,246,0.5)' : 'var(--border)'}`,
                  color: i === 0 ? '#A78BFA' : 'var(--text-muted)',
                  animation: active ? `pillPulse ${2 + i * 0.3}s ease-in-out infinite` : 'none',
                }}>{p}</div>
              ))}
            </div>
          </div>

          {/* Toggles */}
          {['Výměna oblohy', 'Korekce vertikály', 'Anonymizace'].map((label, i) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 0',
              borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{label}</span>
              <div style={{
                width: 28, height: 16, borderRadius: 10,
                background: i === 0 ? 'rgba(139,92,246,0.7)' : 'var(--border)',
                position: 'relative' as const,
                transition: 'background 0.3s',
              }}>
                <div style={{
                  position: 'absolute' as const, top: 2,
                  left: i === 0 ? 14 : 2, width: 12, height: 12,
                  borderRadius: '50%', background: '#fff',
                  transition: 'left 0.3s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (step === 1) {
    // Upload
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem',
      }}>
        <div style={{
          width: '85%', height: '70%',
          border: '2px dashed rgba(139,92,246,0.5)',
          borderRadius: 16,
          display: 'flex', flexDirection: 'column' as const,
          alignItems: 'center', justifyContent: 'center',
          gap: 12,
          background: 'rgba(139,92,246,0.04)',
          position: 'relative' as const,
          overflow: 'hidden',
          opacity: o,
          transition,
        }}>
          {/* Scan line */}
          {active && <div style={{
            position: 'absolute' as const,
            left: 0, right: 0, height: 2,
            background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.9), transparent)',
            animation: 'scanLine 2.5s linear infinite',
            top: 0,
          }} />}
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(107,71,220,0.3), rgba(167,139,250,0.2))',
            border: '1px solid rgba(139,92,246,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#A78BFA', fontSize: 24,
            animation: active ? 'bounceUp 2s ease-in-out infinite' : 'none',
            boxShadow: '0 8px 24px rgba(139,92,246,0.3)',
          }}>↑</div>
          <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>Přetáhněte fotografii</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>JPG · PNG · RAW · max 200MB</div>
        </div>
      </div>
    );
  }
  if (step === 2) {
    // Processing
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column' as const,
        alignItems: 'center', justifyContent: 'center',
        gap: 18, padding: '2rem',
        opacity: o, transition,
      }}>
        <div style={{
          width: 72, height: 72,
          borderRadius: '50%',
          border: '3px solid rgba(139,92,246,0.15)',
          borderTopColor: '#A78BFA',
          animation: active ? 'spin 1.2s linear infinite' : 'none',
          boxShadow: '0 0 32px rgba(139,92,246,0.4)',
        }} />
        <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>Zpracovává se...</div>
        <div style={{ width: '70%', maxWidth: 240, height: 4, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            background: 'linear-gradient(90deg, #6B47DC, #A78BFA)',
            animation: active ? 'progressBar 2.5s ease-in-out infinite' : 'none',
            width: '40%',
          }} />
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'center' as const, maxWidth: 220 }}>
          AI vylepšuje jas, kontrast, ostrost a barvy
        </div>
      </div>
    );
  }
  // Download
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column' as const,
      alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: '2rem',
      opacity: o, transition,
    }}>
      <div style={{
        width: '75%', maxWidth: 280, aspectRatio: '4/3',
        borderRadius: 10,
        background: 'linear-gradient(135deg, #2D3559, #5C7CC2)',
        border: '1px solid rgba(139,92,246,0.4)',
        position: 'relative' as const,
        boxShadow: '0 12px 32px rgba(139,92,246,0.3)',
      }}>
        <div style={{
          position: 'absolute' as const,
          top: 10, right: 10,
          background: 'rgba(34,197,94,0.25)',
          border: '1px solid rgba(34,197,94,0.6)',
          color: '#86EFAC', fontSize: 9, fontWeight: 700,
          padding: '3px 9px', borderRadius: 100,
          letterSpacing: '0.1em',
        }}>HOTOVO</div>
      </div>
      <button style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'linear-gradient(135deg, #6B47DC, #8B5CF6)',
        padding: '10px 20px', borderRadius: 10,
        color: '#fff', fontSize: 13, fontWeight: 600,
        boxShadow: '0 4px 16px rgba(107,71,220,0.4)',
        animation: active ? 'btnGlow 2s ease-in-out infinite' : 'none',
        border: 'none',
      }}>
        <span style={{ fontSize: 14 }}>↓</span> Stáhnout fotografii
      </button>
    </div>
  );
}

export default function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const total = sectionRef.current.offsetHeight - window.innerHeight;
      const p = Math.max(0, Math.min(1, -rect.top / total));
      // 4 steps split across 100%
      const idx = Math.min(3, Math.floor(p * 4.5));
      setActiveStep(idx);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section
      ref={sectionRef}
      id="jak-to-funguje"
      style={{
        borderTop: '1px solid var(--border)',
        position: 'relative' as const,
        height: '400vh',
      }}
    >
      {/* Sticky container */}
      <div style={{
        position: 'sticky' as const,
        top: 0,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: 'clamp(1rem, 4vw, 3rem) 2rem',
      }}>
        {/* Ambient glow */}
        <div style={{
          position: 'absolute' as const,
          top: '50%', right: '-10%',
          transform: 'translateY(-50%)',
          width: 600, height: 600,
          background: 'radial-gradient(ellipse, rgba(139,92,246,0.05) 0%, transparent 70%)',
          pointerEvents: 'none' as const,
        }} />

        <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto' }}>
          <div style={{ textAlign: 'center' as const, marginBottom: '2.5rem' }}>
            <div className="tag" style={{ marginBottom: '0.75rem' }}>Postup</div>
            <h2 style={{
              fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
              fontWeight: 700, letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}>
              Jak to funguje
            </h2>
          </div>

          {/* Timeline + illustration grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)',
            gap: 'clamp(2rem, 5vw, 4rem)',
            alignItems: 'center',
          }} className="hiw-grid">

            {/* LEFT — Timeline */}
            <div style={{ position: 'relative' as const, paddingLeft: 24 }}>
              {/* Vertical line */}
              <div style={{
                position: 'absolute' as const,
                left: 11,
                top: 12,
                bottom: 12,
                width: 2,
                background: 'var(--border)',
                borderRadius: 2,
              }} />
              {/* Active progress line */}
              <div style={{
                position: 'absolute' as const,
                left: 11,
                top: 12,
                width: 2,
                background: 'linear-gradient(180deg, #6B47DC, #A78BFA)',
                borderRadius: 2,
                height: `${((activeStep + 1) / steps.length) * 100}%`,
                maxHeight: 'calc(100% - 24px)',
                transition: 'height 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 0 12px rgba(139,92,246,0.6)',
              }} />

              {steps.map((step, i) => {
                const isActive = i === activeStep;
                const isCompleted = i < activeStep;
                const isFuture = i > activeStep;
                return (
                  <div key={step.number} style={{
                    position: 'relative' as const,
                    paddingBottom: i < steps.length - 1 ? '1.75rem' : 0,
                    opacity: isFuture ? 0.4 : 1,
                    transition: 'opacity 0.5s ease',
                  }}>
                    {/* Dot */}
                    <div style={{
                      position: 'absolute' as const,
                      left: -24,
                      top: 0,
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: isActive || isCompleted ? 'linear-gradient(135deg, #6B47DC, #A78BFA)' : 'var(--bg-card)',
                      border: `2px solid ${isActive || isCompleted ? '#A78BFA' : 'var(--border)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: '#fff',
                      transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: isActive ? '0 0 0 6px rgba(139,92,246,0.2), 0 0 24px rgba(139,92,246,0.5)' : 'none',
                      transform: isActive ? 'scale(1.15)' : 'scale(1)',
                      zIndex: 2,
                    }}>
                      {isCompleted ? '✓' : step.number}
                    </div>
                    {/* Content */}
                    <div style={{ paddingLeft: 8 }}>
                      <h3 style={{
                        fontSize: isActive ? 18 : 16,
                        fontWeight: isActive ? 700 : 600,
                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        marginBottom: 6,
                        transition: 'all 0.4s ease',
                        letterSpacing: '-0.01em',
                      }}>
                        {step.title}
                      </h3>
                      <p style={{
                        fontSize: 13,
                        color: isActive ? 'var(--text-secondary)' : 'var(--text-muted)',
                        lineHeight: 1.65,
                        transition: 'color 0.4s ease',
                        maxWidth: 420,
                      }}>
                        {step.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* RIGHT — Illustration */}
            <div style={{
              position: 'relative' as const,
              aspectRatio: '4/3',
              background: 'linear-gradient(135deg, var(--bg-card), var(--bg-secondary))',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              boxShadow: '0 24px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(139,92,246,0.1) inset',
            }} className="hiw-illustration">
              {/* Subtle grid pattern */}
              <div style={{
                position: 'absolute' as const,
                inset: 0,
                backgroundImage: 'linear-gradient(rgba(139,92,246,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.04) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
                pointerEvents: 'none' as const,
              }} />

              {/* Step illustration */}
              <div style={{
                position: 'absolute' as const,
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {steps.map((_, i) => (
                  <div key={i} style={{
                    position: 'absolute' as const,
                    inset: 0,
                    opacity: activeStep === i ? 1 : 0,
                    transform: activeStep === i ? 'scale(1)' : 'scale(0.95)',
                    transition: 'opacity 0.5s ease, transform 0.5s ease',
                    pointerEvents: activeStep === i ? 'auto' : 'none' as const,
                  }}>
                    <StepIllustration step={i} active={activeStep === i} />
                  </div>
                ))}
              </div>

              {/* Step badge */}
              <div style={{
                position: 'absolute' as const,
                top: 16, left: 16,
                background: 'linear-gradient(135deg, #6B47DC, #A78BFA)',
                color: '#fff',
                fontSize: 10, fontWeight: 700,
                letterSpacing: '0.15em',
                padding: '4px 10px',
                borderRadius: 6,
                textTransform: 'uppercase' as const,
                boxShadow: '0 4px 12px rgba(107,71,220,0.4)',
              }}>
                Krok {steps[activeStep]?.number}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scanLine {
          from { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          to { top: 100%; opacity: 0; }
        }
        @keyframes bounceUp {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes pillPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes progressBar {
          0% { width: 0%; }
          70% { width: 80%; }
          100% { width: 100%; }
        }
        @keyframes btnGlow {
          0%, 100% { box-shadow: 0 4px 16px rgba(107,71,220,0.4); }
          50% { box-shadow: 0 4px 28px rgba(107,71,220,0.75); }
        }

        @media (max-width: 768px) {
          .hiw-grid {
            grid-template-columns: 1fr !important;
            gap: 1.5rem !important;
          }
          .hiw-illustration {
            order: -1;
            max-width: 480px;
            margin: 0 auto;
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}
