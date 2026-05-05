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
          <p style={{ fontSize: 14, fontWeight: 500, marginBottom: '0.5rem' }}>Filip Zemek</p>
          <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: '0.25rem' }}>FASTHDR</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            IČO: 23584203<br />
            Drnovec 1, 471 54 Cvikov<br />
            <a href="mailto:fotograf@filipzemek.cz" style={{ color: 'var(--text-muted)' }}>
              fotograf@filipzemek.cz
            </a>
          </p>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <a href="/podminky" style={{ fontSize: 13, color: 'var(--text-muted)' }}>Obchodní podmínky</a>
          <a href="/ochrana-soukromi" style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ochrana soukromí</a>
          <a href="/cookies" style={{ fontSize: 13, color: 'var(--text-muted)' }}>Cookies</a>
          <a href="https://filipzemek.cz" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            filipzemek.cz
          </a>
        </nav>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'flex-end' }}>
          © {new Date().getFullYear()} Filip Zemek. Všechna práva vyhrazena.
        </p>
      </div>
    </footer>
  );
}