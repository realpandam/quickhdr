'use client';

export default function OchranaPage() {
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
          Ochrana osobních údajů
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '3rem' }}>
          Platné od 1. 5. 2025 · v souladu s GDPR (nařízení EU 2016/679)
        </p>

        {[
          {
            title: '1. Správce osobních údajů',
            content: `Filip Zemek, IČO: 23584203, Drnovec 1, 471 54 Cvikov\nEmail: fotograf@filipzemek.cz`,
          },
          {
            title: '2. Jaké údaje zpracováváme',
            content: `• Email a jméno (při registraci nebo platbě)\n• IP adresa a technické údaje o zařízení\n• Nahrané fotografie (dočasně po dobu zpracování a 7 dní po platbě)\n• Platební informace (zpracovává Stripe, my k nim nemáme přístup)`,
          },
          {
            title: '3. Účel zpracování',
            content: `• Poskytování služby FASTHDR\n• Zpracování plateb\n• Zasílání emailových notifikací o stavu zpracování\n• Vedení historie objednávek pro registrované uživatele`,
          },
          {
            title: '4. Právní základ zpracování',
            content: `Údaje zpracováváme na základě:\n• Plnění smlouvy (poskytování služby)\n• Oprávněného zájmu (bezpečnost, prevence podvodů)\n• Souhlasu (marketingové emaily, pokud je udělen)`,
          },
          {
            title: '5. Doba uchovávání',
            content: `• Fotografie: 7 dní od platby, poté jsou automaticky smazány\n• Údaje o objednávkách: 3 roky (zákonná povinnost)\n• Uživatelský účet: do zrušení účtu`,
          },
          {
            title: '6. Příjemci údajů',
            content: `Vaše údaje sdílíme s:\n• Autoenhance.ai — zpracování fotografií AI\n• Stripe — platební brána\n• Supabase — databáze a autentizace\n• Resend — emailové notifikace`,
          },
          {
            title: '7. Vaše práva',
            content: `Máte právo na:\n• Přístup k vašim údajům\n• Opravu nepřesných údajů\n• Výmaz údajů ("právo být zapomenut")\n• Přenositelnost dat\n• Odvolání souhlasu\n\nŽádost uplatněte na: fotograf@filipzemek.cz`,
          },
          {
            title: '8. Cookies',
            content: `Informace o cookies naleznete v našich Zásadách používání cookies na adrese filipzemek.cz/cookies.`,
          },
          {
            title: '9. Kontakt na dozorový orgán',
            content: `Úřad pro ochranu osobních údajů\nPplk. Sochora 27, 170 00 Praha 7\nwww.uoou.cz`,
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
          <a href="/cookies" style={{ color: 'var(--text-muted)' }}>Cookies</a>
          <a href="/" style={{ color: 'var(--text-muted)' }}>Zpět na hlavní stránku</a>
        </div>
      </div>
    </main>
  );
}