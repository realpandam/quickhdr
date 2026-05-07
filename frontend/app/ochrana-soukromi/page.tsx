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
          Zásady ochrany osobních údajů
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '3rem' }}>
          Účinné od 7. 5. 2026 · v souladu s GDPR (nařízení EU 2016/679)
        </p>

        {[
          {
            title: '1. Správce osobních údajů',
            content: `Filip Zemek, IČO: 23584203, Drnovec 1, 471 54 Cvikov\nE-mail: info@fasthdr.cz\n\nPoskytovatel nejmenoval pověřence pro ochranu osobních údajů (DPO), neboť zpracování osobních údajů neprobíhá ve velkém rozsahu ani se netýká zvláštních kategorií údajů.`,
          },
          {
            title: '2. Jaká data sbíráme a proč',
            content: `Registrační a fakturační údaje\nSbíráme vaši e-mailovou adresu, jméno, IČO, DIČ a fakturační adresu. Tyto údaje potřebujeme k vytvoření uživatelského účtu, poskytnutí služby a vystavení účetních dokladů. Právním základem je plnění smlouvy a zákonná povinnost (účetní legislativa).\n\nFotografie\nNahráváte-li fotografie obsahující osobní údaje (např. rozpoznatelné osoby, SPZ vozidel, adresy nemovitostí), zpracováváme je výhradně za účelem poskytnutí Služby — úpravy obrazu. Fotografie nejsou analyzovány za jiným účelem a nejsou sdíleny s třetími stranami s výjimkou infrastrukturních zpracovatelů uvedených v čl. 4.\n\nTechnické a provozní údaje\nPři používání Služby automaticky zaznamenáváme IP adresu, typ prohlížeče a časy přístupu výhradně za účelem zajištění bezpečnosti a správného fungování Služby (oprávněný zájem dle čl. 6 odst. 1 písm. f) GDPR).`,
          },
          {
            title: '3. Jak dlouho data uchováváme',
            content: `• Fakturační a účetní doklady: 10 let (zákon o účetnictví)\n• Uživatelský účet (e-mail, jméno): po dobu trvání účtu\n• Nahrané a upravené fotografie: max. 7 dní od nahrání, poté automaticky smazány\n• Technické logy (IP, přístupy): 30 dní`,
          },
          {
            title: '4. Kdo má k datům přístup (zpracovatelé)',
            content: `Vaše data neprodáváme ani nepředáváme třetím stranám pro marketingové účely. K zajištění chodu Služby využíváme pouze prověřené zpracovatele:\n\n• Vercel Inc. — hosting frontendové aplikace (USA; standardní smluvní doložky EU)\n• Railway Corp. — hosting backendové aplikace (USA; standardní smluvní doložky EU)\n• WEDOS Internet, a.s. — doplňková serverová infrastruktura (ČR)\n• Supabase Inc. — databáze uživatelských účtů (USA; standardní smluvní doložky EU)\n• GOPAY s.r.o. — provozovatel platební brány (ČR)\n• Resend Inc. — odesílání transakčních e-mailů (USA; standardní smluvní doložky EU)\n• Poskytovatel AI výpočetní infrastruktury — zpracování obrazu probíhá šifrovaně prostřednictvím API\n\nPředávání dat mimo EU probíhá výhradně na základě standardních smluvních doložek schválených Evropskou komisí (čl. 46 odst. 2 písm. c) GDPR).`,
          },
          {
            title: '5. Vaše práva',
            content: `Podle nařízení GDPR máte právo:\n\n• Na přístup — zjistit, jaké údaje o vás zpracováváme\n• Na opravu — nechat opravit nepřesné údaje\n• Na výmaz — požádat o smazání vašich údajů (právo být zapomenut)\n• Na omezení zpracování — omezit způsob zpracování vašich dat\n• Na přenositelnost — obdržet svá data ve strojově čitelném formátu\n• Vznést námitku — proti zpracování na základě oprávněného zájmu\n• Odvolat souhlas — pokud je zpracování založeno na souhlasu\n\nPro uplatnění těchto práv nás kontaktujte na info@fasthdr.cz. Na vaši žádost odpovíme do 30 dnů.`,
          },
          {
            title: '6. Cookies',
            content: `Naše webová aplikace FastHDR používá výhradně nezbytné technické cookies, které jsou nutné pro správné fungování uživatelských účtů (udržení přihlášení) a zajištění bezpečnosti. Nepoužíváme žádné analytické ani marketingové cookies a uživatele nesledujeme napříč internetem.\n\nProtože používáme pouze technicky nezbytné cookies, nevyžaduje jejich použití váš souhlas dle čl. 5 odst. 3 směrnice ePrivacy.`,
          },
          {
            title: '7. Zabezpečení dat',
            content: `Veškerá komunikace se Službou probíhá šifrovaně prostřednictvím protokolu HTTPS/TLS. Přístupy k datům jsou omezeny na minimální nezbytný počet osob. Fotografie jsou automaticky mazány po 7 dnech.`,
          },
          {
            title: '8. Změny těchto zásad',
            content: `O podstatných změnách těchto zásad budete informováni e-mailem nebo oznámením na webu. Aktuální verze je vždy dostupná na adrese fasthdr.cz/ochrana-soukromi.`,
          },
          {
            title: '9. Dozorový orgán',
            content: `Máte právo podat stížnost u dozorového úřadu:\n\nÚřad pro ochranu osobních údajů (ÚOOÚ)\nPplk. Sochora 27, 170 00 Praha 7\nwww.uoou.cz`,
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