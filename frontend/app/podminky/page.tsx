'use client';

export default function PodminkyPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '0 2rem', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        maxWidth: 1200, margin: '0 auto', width: '100%',
      }}>
        <a href="/" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          Filip Zemek
          <span style={{ fontWeight: 300, color: 'var(--text-muted)', marginLeft: 6 }}>QUICKHDR</span>
        </a>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 2rem' }}>
        <h1 style={{
          fontSize: '2rem', fontWeight: 700,
          letterSpacing: '-0.02em', color: 'var(--text-primary)',
          marginBottom: '0.5rem',
        }}>
          Obchodní podmínky
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '3rem' }}>
          Platné od 1. 5. 2025
        </p>

        {[
          {
            title: '1. Provozovatel služby',
            content: `Provozovatelem služby QUICKHDR dostupné na adrese filipzemek.cz je Filip Zemek, IČO: 23584203, se sídlem Drnovec 1, 471 54 Cvikov, email: fotograf@filipzemek.cz.`,
          },
          {
            title: '2. Předmět služby',
            content: `Služba umožňuje uživatelům nahrát fotografie, které jsou automaticky upraveny pomocí umělé inteligence (AI). Výsledné upravené fotografie jsou dostupné ke stažení po provedení platby.`,
          },
          {
            title: '3. Registrace a uživatelský účet',
            content: `Uživatel může využívat službu bez registrace nebo s registrací. Registrovaní uživatelé mají přístup k historii svých objednávek. Uživatel je povinen chránit své přihlašovací údaje.`,
          },
          {
            title: '4. Ceny a platby',
            content: `Cena za zpracování jedné fotografie činí 59 Kč včetně DPH. Platby jsou zpracovávány prostřednictvím platební brány Stripe. Po úspěšné platbě je fotografie dostupná ke stažení po dobu 7 dní.`,
          },
          {
            title: '5. Dostupnost fotografií',
            content: `Zpracované fotografie jsou dostupné ke stažení po dobu 7 dní od provedení platby. Po uplynutí této doby nejsou fotografie nadále dostupné a provozovatel negarantuje jejich archivaci.`,
          },
          {
            title: '6. Autorská práva',
            content: `Uživatel prohlašuje, že je oprávněn nahrávat fotografie ke zpracování a že nahrané fotografie neporušují práva třetích osob. Provozovatel nenese odpovědnost za obsah nahraných fotografií.`,
          },
          {
            title: '7. Ochrana osobních údajů',
            content: `Zpracování osobních údajů se řídí samostatným dokumentem Ochrana osobních údajů, který je dostupný na adrese filipzemek.cz/ochrana-soukromi.`,
          },
          {
            title: '8. Reklamace a vrácení platby',
            content: `V případě technických problémů se zpracováním fotografie má uživatel právo na vrácení platby. Reklamace je nutno uplatnit do 14 dní od provedení platby na email fotograf@filipzemek.cz.`,
          },
          {
            title: '9. Omezení odpovědnosti',
            content: `Provozovatel neodpovídá za přerušení dostupnosti služby z důvodu technické údržby nebo výpadků třetích stran. Služba je poskytována ve stavu "jak stojí a leží".`,
          },
          {
            title: '10. Změny podmínek',
            content: `Provozovatel si vyhrazuje právo tyto podmínky kdykoli změnit. O změnách bude uživatel informován emailem nebo oznámením na webu. Pokračováním v používání služby uživatel vyjadřuje souhlas s novými podmínkami.`,
          },
          {
            title: '11. Rozhodné právo',
            content: `Tyto podmínky se řídí právním řádem České republiky. Případné spory budou řešeny příslušnými soudy České republiky.`,
          },
          {
            title: '12. Kontakt',
            content: `Filip Zemek\nDrnovec 1, 471 54 Cvikov\nIČO: 23584203\nEmail: fotograf@filipzemek.cz`,
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
          <a href="/ochrana-soukromi" style={{ color: 'var(--text-muted)' }}>Ochrana osobních údajů</a>
          <a href="/cookies" style={{ color: 'var(--text-muted)' }}>Cookies</a>
          <a href="/" style={{ color: 'var(--text-muted)' }}>Zpět na hlavní stránku</a>
        </div>
      </div>
    </main>
  );
}