'use client';

import { useEffect, useState } from 'react';
import AuthButton from './AuthButton';
import ThemeToggle from './ThemeToggle';

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) setMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Sleduj změny theme
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute('data-theme') ?? 'dark');
    });
    observer.observe(document.documentElement, { attributes: true });
    setTheme(document.documentElement.getAttribute('data-theme') ?? 'dark');
    return () => observer.disconnect();
  }, []);

  const isDark = theme !== 'light';

  return (
    <>
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: scrolled || menuOpen ? 'var(--bg-blur)' : 'var(--bg)',
        backdropFilter: scrolled || menuOpen ? 'blur(12px)' : 'none',
        WebkitBackdropFilter: scrolled || menuOpen ? 'blur(12px)' : 'none',
        borderBottom: '1px solid var(--border)',
        transition: 'background 0.3s',
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          padding: '0 1.5rem', height: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '1rem',
        }}>
          {/* Levá strana — logo + nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
            <a href="/" style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              <img
                src={isDark ? '/logo-dark.png' : '/logo-light.png'}
                alt="QuickHDR"
                style={{ height: 28, width: 'auto', display: 'block' }}
              />
            </a>

            {/* Desktop nav */}
            <nav className="header-nav-links" style={{
              display: 'flex', alignItems: 'center', gap: '1.75rem',
            }}>
              {[
                { href: '/#jak-to-funguje', label: 'Jak to funguje' },
                { href: '/#priklady', label: 'Příklady' },
                { href: '/#ceník', label: 'Ceník' },
              ].map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  className="header-nav-link"
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>

          {/* Pravá strana — desktop */}
          <div className="header-nav-right" style={{
            display: 'flex', alignItems: 'center', gap: '1rem',
          }}>
            <ThemeToggle />
            <AuthButton />
          </div>

          {/* Mobile controls */}
          <div className="header-mobile-controls" style={{
            display: 'none', alignItems: 'center', gap: '0.5rem',
          }}>
            <ThemeToggle />
            <button
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Menu"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '6px', color: 'var(--text-primary)',
                display: 'flex', flexDirection: 'column' as const,
                gap: 5, alignItems: 'center', justifyContent: 'center',
              }}
            >
              <span style={{
                display: 'block', width: 22, height: 2,
                background: 'var(--text-primary)', borderRadius: 2,
                transition: 'transform 0.2s',
                transform: menuOpen ? 'rotate(45deg) translate(5px, 5px)' : 'none',
              }} />
              <span style={{
                display: 'block', width: 22, height: 2,
                background: 'var(--text-primary)', borderRadius: 2,
                opacity: menuOpen ? 0 : 1, transition: 'opacity 0.2s',
              }} />
              <span style={{
                display: 'block', width: 22, height: 2,
                background: 'var(--text-primary)', borderRadius: 2,
                transition: 'transform 0.2s',
                transform: menuOpen ? 'rotate(-45deg) translate(5px, -5px)' : 'none',
              }} />
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '1rem 1.5rem 1.5rem',
            display: 'flex', flexDirection: 'column' as const, gap: '1rem',
            background: 'var(--bg-blur)', backdropFilter: 'blur(12px)',
          }}>
            <a href="/#jak-to-funguje" onClick={() => setMenuOpen(false)}
              style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 500 }}>
              Jak to funguje
            </a>
            <a href="/#priklady" onClick={() => setMenuOpen(false)}
              style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 500 }}>
              Příklady
            </a>
            <a href="/#ceník" onClick={() => setMenuOpen(false)}
              style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 500 }}>
              Ceník
            </a>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <AuthButton />
            </div>
          </div>
        )}
      </header >

      <style>{`
        .header-nav-link {
          font-size: 13px;
          color: var(--text-secondary);
          white-space: nowrap;
          text-decoration: none;
          position: relative;
          padding-bottom: 2px;
          transition: color 0.2s;
        }
        .header-nav-link::after {
          content: '';
          position: absolute;
          bottom: -2px;
          left: 0;
          width: 0;
          height: 1.5px;
          background: linear-gradient(90deg, #6B47DC, #A78BFA);
          border-radius: 999px;
          transition: width 0.25s ease;
        }
        .header-nav-link:hover {
          color: var(--text-primary);
        }
        .header-nav-link:hover::after {
          width: 100%;
        }

        /* Moje fotografie link */
        .header-auth-link {
          font-size: 13px;
          color: var(--text-secondary);
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: color 0.2s, transform 0.15s;
          padding: 4px 0;
        }
        .header-auth-link:hover {
          color: var(--text-primary);
          transform: translateY(-1px);
        }

        /* Odhlásit button */
        .header-signout-btn {
          font-size: 12px;
          padding: 5px 14px;
          border-radius: var(--radius);
          border: 1px solid var(--border);
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          transition: border-color 0.2s, color 0.2s, background 0.2s, transform 0.15s, box-shadow 0.2s;
          font-family: inherit;
        }
        .header-signout-btn:hover {
          border-color: rgba(139,92,246,0.4);
          color: var(--text-primary);
          background: rgba(139,92,246,0.06);
          transform: translateY(-1px);
          box-shadow: 0 3px 12px rgba(139,92,246,0.12);
        }
        .header-signout-btn:active {
          transform: translateY(0);
        }

        /* Přihlásit se button */
        .header-login-btn {
          font-size: 13px;
          padding: 6px 18px;
          border-radius: var(--radius);
          background: linear-gradient(135deg, #6B47DC, #8B5CF6);
          color: #fff;
          border: none;
          cursor: pointer;
          font-weight: 600;
          font-family: inherit;
          box-shadow: 0 2px 12px rgba(107,71,220,0.3);
          transition: transform 0.15s, box-shadow 0.2s, filter 0.2s;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          position: relative;
          overflow: hidden;
        }
        .header-login-btn::after {
          content: '';
          position: absolute;
          top: 0; left: -100%;
          width: 60%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
          transform: skewX(-20deg);
          transition: left 0.5s ease;
        }
        .header-login-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(107,71,220,0.45);
          filter: brightness(1.1);
        }
        .header-login-btn:hover::after {
          left: 150%;
        }
        .header-login-btn:active {
          transform: translateY(0);
          filter: brightness(0.95);
        }

        @media (max-width: 768px) {
          .header-nav-links { display: none !important; }
          .header-nav-right { display: none !important; }
          .header-mobile-controls { display: flex !important; }
        }
      `}</style>
    </>
  );
}