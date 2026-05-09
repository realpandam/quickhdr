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
          FastHDR
          <span style={{ fontWeight: 300, color: 'var(--text-muted)', marginLeft: 6 }}>AI zpracování fotek</span>
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
          Účinné od 7. 5. 2026
        </p>

        {[
          {
            title: '1. Co jsou cookies',
            content: `Cookies jsou malé textové soubory ukládané do vašeho zařízení při návštěvě webové stránky. Slouží k zajištění základní funkčnosti webu a zabezpečení uživatelských účtů.`,
          },
          {
            title: '2. Jaké cookies používáme',
            content: `Používáme výhradně nezbytné technické cookies:\n\n• Autentizační tokeny — udržují přihlášení uživatele (Supabase)\n• Session cookies — zajišťují bezpečnost a funkčnost webu\n\nNepoužíváme žádné analytické, marketingové ani sledovací cookies. Uživatele nesledujeme napříč internetem ani nepředáváme data reklamním sítím.`,
          },
          {
            title: '3. Cookies třetích stran',
            content: `• Supabase Inc. — autentizace a správa uživatelských účtů\n• GOPAY s.r.o. — nezbytné cookies platební brány při zpracování platby\n\nTyto cookies jsou nezbytné pro provoz Služby a nelze je odmítnout bez ztráty funkčnosti.`,
          },
          {
            title: '4. Souhlas s cookies',
            content: `Protože používáme výhradně technicky nezbytné cookies, nevyžaduje jejich použití váš souhlas dle čl. 5 odst. 3 směrnice ePrivacy (2002/58/ES). Nezbytné cookies jsou osvobozeny od povinnosti získat souhlas, pokud slouží výhradně k přenosu sdělení nebo jsou nezbytně nutné pro poskytnutí služby.`,
          },
          {
            title: '5. Jak cookies spravovat',
            content: `Cookies můžete spravovat nebo smazat v nastavení vašeho prohlížeče. Upozorňujeme, že zakázání nezbytných cookies způsobí nefunkčnost přihlašování a dalších funkcí Služby.\n\nNávod pro hlavní prohlížeče:\n• Chrome: Nastavení → Soukromí a zabezpečení → Cookies\n• Firefox: Nastavení → Soukromí a zabezpečení → Cookies\n• Safari: Předvolby → Soukromí → Spravovat data webů\n• Edge: Nastavení → Soukromí → Cookies`,
          },
          {
            title: '6. Kontakt',
            content: `Filip Zemek\nIČO: 23584203\ninfo@fasthdr.cz`,
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