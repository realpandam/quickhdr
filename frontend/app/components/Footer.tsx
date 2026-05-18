'use client';

const PAYMENT_LOGOS = [
  { src: '/images/gopay-banner.svg', alt: 'GoPay',      href: 'https://www.gopay.com' },
  { src: '/images/visa.svg',         alt: 'Visa' },
  { src: '/images/mastercard.svg',   alt: 'Mastercard' },
  { src: '/images/googlepay.svg',    alt: 'Google Pay' },
  { src: '/images/applepay.svg',     alt: 'Apple Pay' },
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

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <a href="/podminky" style={{ fontSize: 13, color: 'var(--text-muted)' }}>Obchodní podmínky</a>
          <a href="/ochrana-soukromi" style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ochrana soukromí</a>
          <a href="/cookies" style={{ fontSize: 13, color: 'var(--text-muted)' }}>Cookies</a>
          <a href="https://filipzemek.cz" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--text-muted)' }}>filipzemek.cz</a>
        </nav>

        <div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                  <img
                    src={src}
                    alt={alt}
                    style={{
                      display: 'block',
                      height: 20,
                      width: 'auto',
                    }}
                  />
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

        <p style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'flex-end', width: '100%', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          © {new Date().getFullYear()} FASTHDR. Všechna práva vyhrazena.
        </p>
      </div>
    </footer>
  );
}