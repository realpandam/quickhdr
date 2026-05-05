export default function MaintenancePage() {
  return (
    <div style={{ margin: 0, padding: 0, background: '#0a0a0a', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}>
        <div style={{ maxWidth: '480px', textAlign: 'center' }}>

          <p style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', marginBottom: '48px' }}>
            FASTHDR
            <span style={{ fontWeight: 300, color: '#666', marginLeft: '8px' }}>AI Retušování</span>
          </p>

          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 32px', fontSize: '28px',
          }}>
            🔧
          </div>

          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#ffffff', margin: '0 0 16px', letterSpacing: '-0.02em' }}>
            Probíhá údržba
          </h1>

          <p style={{ fontSize: '15px', color: '#888', lineHeight: 1.6, margin: '0 0 40px' }}>
            Pracujeme na vylepšení aplikace.<br />
            Brzy se vrátíme zpět.
          </p>

          <p style={{ fontSize: '13px', color: '#555', margin: 0 }}>
            Dotazy:{' '}
            <a href="mailto:info@fasthdr.cz" style={{ color: '#f59e0b', textDecoration: 'none' }}>
              info@fasthdr.cz
            </a>
          </p>

        </div>
      </div>
    </div>
  );
}