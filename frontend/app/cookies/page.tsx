'use client';

export default function CookiesPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '0 2rem', height: 56,
        display: 'flex', alignItems: 'center',
        maxWidth: 1200, margin: '0 auto', width: '100%',
      }}>
        <a href="/" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          Filip Zemek
          <span style={{ fontWeight: 300, color: 'var(--text-muted)', marginLeft: 6 }}>AI Retušování</span>
        </a>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 2rem' }}>
        <h1 style={{
          fontSize: '2rem', fontWeight: 700,
          letterSpacing: '-0.02em', color: 'var(--text-primary)',
          marginBottom: '0.5rem',
        }}>
          Zásady používání cookies
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '3rem' }}>
          Platné od 1. 5. 2025
        </p>

        {[
          {
            title: '1. Co jsou cookies',
            content: `Cookies jsou malé textové soubory ukládané do vašeho zařízení při návštěvě webové stránky. Slouží k zajištění základní funkčnosti webu a ke zlepšení uživatelského zážitku.`,
          },
          {
            title: '2. Jaké cookies používáme',
            content: `Nezbytné cookies (nelze odmítnout):\n• Autentizační tokeny (přihlášení uživatele) — Supabase\n• Session cookies — zajišťují funkčnost webu\n\nAnalytické cookies (volitelné):\n• Aktuálně nepoužíváme žádné analytické nástroje`,
          },
          {
            title: '3. Cookies třetích stran',
            content: `• GoPay — platební brána (nezbytné pro zpracování plateb)\n• Supabase — autentizace a databáze`,
          },
          {
            title: '4. Jak cookies spravovat',
            content: `Cookies můžete spravovat v nastavení vašeho prohlížeče. Zakázání nezbytných cookies může způsobit nefunkčnost přihlašování a dalších funkcí webu.\n\nNavod pro hlavní prohlížeče:\n• Chrome: Nastavení → Soukromí → Cookies\n• Firefox: Nastavení → Soukromí → Cookies\n• Safari: Předvolby → Soukromí`,
          },
          {
            title: '5. Kontakt',
            content: `Filip Zemek\nfotograf@filipzemek.cz`,
          },
        ].map(section => (
          <div key={section.title} style={{ marginBottom: '2rem' }}>
            <h2 style={{
              fontSize: '1rem', fontWeight: 600,
              color: 'var(--text-primary)', marginBottom: '0.5rem',
            }}>
              {section.title}
            </h2>
            <p style={{
              fontSize: 14, color: 'var(--text-secondary)',
              lineHeight: 1.8, whiteSpace: 'pre-line' as const,
            }}>
              {section.content}
            </p>
          </div>
        ))}

        <div style={{
          marginTop: '3rem', paddingTop: '2rem',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: '2rem',
          fontSize: 13, color: 'var(--text-muted)',
        }}>
          <a href="/podminky" style={{ color: 'var(--text-muted)' }}>Obchodní podmínky</a>
          <a href="/ochrana-soukromi" style={{ color: 'var(--text-muted)' }}>Ochrana osobních údajů</a>
          <a href="/" style={{ color: 'var(--text-muted)' }}>Zpět na hlavní stránku</a>
        </div>
      </div>
    </main>
  );
}