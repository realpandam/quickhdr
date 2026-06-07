'use client';

const PAYMENT_LOGOS = [
  { src: '/images/gopay-banner.svg', alt: 'GoPay', href: 'https://www.gopay.com' },
  { src: '/images/visa.svg', alt: 'Visa' },
  { src: '/images/mastercard.svg', alt: 'Mastercard' },
  { src: '/images/googlepay.svg', alt: 'Google Pay' },
  { src: '/images/applepay.svg', alt: 'Apple Pay' },
];

const SOCIAL_LINKS = [
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/@fasthdr',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#FF0000" />
        <path d="M19.5 8.2a1.89 1.89 0 0 0-1.33-1.34C17.03 6.5 12 6.5 12 6.5s-5.03 0-6.17.36A1.89 1.89 0 0 0 4.5 8.2C4.14 9.35 4.14 12 4.14 12s0 2.65.36 3.8a1.89 1.89 0 0 0 1.33 1.34c1.14.36 6.17.36 6.17.36s5.03 0 6.17-.36a1.89 1.89 0 0 0 1.33-1.34c.36-1.15.36-3.8.36-3.8s0-2.65-.36-3.8z" fill="white" />
        <path d="M10.18 14.5V9.5L14.64 12l-4.46 2.5z" fill="#FF0000" />
      </svg>
    ),
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/fast.hdr',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none">
        <defs>
          <linearGradient id="ig-grad-footer" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFDC80" />
            <stop offset="25%" stopColor="#FCAF45" />
            <stop offset="50%" stopColor="#F77737" />
            <stop offset="75%" stopColor="#C13584" />
            <stop offset="100%" stopColor="#833AB4" />
          </linearGradient>
        </defs>
        <rect width="24" height="24" rx="6" fill="url(#ig-grad-footer)" />
        <rect x="6.5" y="6.5" width="11" height="11" rx="3" stroke="white" strokeWidth="1.5" fill="none" />
        <circle cx="12" cy="12" r="2.8" stroke="white" strokeWidth="1.5" fill="none" />
        <circle cx="16" cy="8" r="0.8" fill="white" />
      </svg>
    ),
  },
];

export default function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid var(--border)',
      padding: '3rem 2rem',
      marginTop: '6rem',
    }}>
      <div style={{
        maxWidth: 1100,
        margin: '0 auto',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '2rem',
      }}>

        {/* Firemní info */}
        <div>
          <p style={{ fontSize: 14, fontWeight: 500, marginBottom: '0.5rem' }}>FASTHDR</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            Provozovatel: Filip Zemek<br />
            IČO: 23584203<br />
            Drnovec 1, 471 54 Cvikov<br />
            <a href="mailto:info@fasthdr.cz" style={{ color: 'var(--text-muted)' }}>info@fasthdr.cz</a><br />
            +420 777 080 877
          </p>
        </div>

        {/* Navigace */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <a href="/podminky" style={{ fontSize: 13, color: 'var(--text-muted)' }}>Obchodní podmínky</a>
          <a href="/ochrana-soukromi" style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ochrana soukromí</a>
          <a href="/cookies" style={{ fontSize: 13, color: 'var(--text-muted)' }}>Cookies</a>
          <a href="https://filipzemek.cz" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--text-muted)' }}>filipzemek.cz</a>
        </nav>

        {/* Sociální sítě */}
        <div>
          <p style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            marginBottom: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            Sledujte nás
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {SOCIAL_LINKS.map(({ label, href, icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                title={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  textDecoration: 'none',
                  opacity: 0.9,
                  transition: 'opacity 0.2s, transform 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.transform = 'scale(1.08)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.opacity = '0.9';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                {icon}
              </a>
            ))}
          </div>
        </div>

        {/* Platební metody */}
        <div>
          <p style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            marginBottom: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            Platební metody
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {PAYMENT_LOGOS.map(({ src, alt, href }) => {
              const pill = (
                <div style={{
                  background: '#ffffff',
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: 6,
                  padding: '5px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 36,
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                }}>
                  <img src={src} alt={alt} style={{ display: 'block', height: 20, width: 'auto' }} />
                </div>
              );
              return href ? (
                <a key={alt} href={href} target="_blank" rel="noopener noreferrer" title={'Platba přes ' + alt}
                  style={{ opacity: 0.9, transition: 'opacity 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '0.9')}
                >{pill}</a>
              ) : (
                <div key={alt} style={{ opacity: 0.85 }}>{pill}</div>
              );
            })}
          </div>
        </div>

        {/* Copyright */}
        <p style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          alignSelf: 'flex-end',
          width: '100%',
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid var(--border)',
        }}>
          © {new Date().getFullYear()} FASTHDR. Všechna práva vyhrazena.
        </p>

      </div>
    </footer>
  );
}