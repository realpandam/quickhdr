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
          Všeobecné obchodní podmínky
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '3rem' }}>
          Účinné od 7. 5. 2026
        </p>

        {[
          {
            title: '1. Úvodní ustanovení',
            content: `Tyto všeobecné obchodní podmínky (dále jen „VOP") upravují práva a povinnosti mezi poskytovatelem služby, kterým je Filip Zemek, IČO: 23584203, se sídlem Drnovec 1, 471 54 Cvikov, podnikatel zapsaný v živnostenském rejstříku vedeném u Městského úřadu Nový Bor (dále jen „Poskytovatel"), a uživatelem (dále jen „Uživatel").\n\nSlužba je dostupná na doméně www.fasthdr.cz a poskytuje automatizovanou úpravu digitálních fotografií pomocí umělé inteligence, pod názvem FastHDR (dále jen „Služba").\n\nSlužba je primárně určena pro podnikající fyzické a právnické osoby (B2B – fotografové, realitní makléři, firmy). Pokud Uživatel jedná jako spotřebitel (fyzická osoba mimo rámec podnikání), použijí se příslušná ustanovení zákona č. 89/2012 Sb., občanského zákoníku, a zákona č. 634/1992 Sb., o ochraně spotřebitele.`,
          },
          {
            title: '2. Uživatelský účet a registrace',
            content: `Využívání Služby je podmíněno registrací. Uživatel odpovídá za to, že uvedené fakturační a kontaktní údaje jsou přesné a pravdivé.\n\nUživatel je povinen chránit své přihlašovací údaje a zamezit přístupu třetích osob ke svému účtu. Poskytovatel neodpovídá za škody způsobené neoprávněným použitím účtu třetí osobou.`,
          },
          {
            title: '3. Platební podmínky',
            content: `Služba je zpoplatněna na základě jednorázové platby za úpravu konkrétního počtu vybraných fotografií. Aktuální ceník je dostupný na webových stránkách Poskytovatele.\n\nPlatba probíhá jednorázově prostřednictvím platební brány GoPay. Služba nefunguje na bázi automaticky obnovovaného předplatného ani předplacených kreditů.\n\nSmlouva mezi Poskytovatelem a Uživatelem vzniká okamžikem úspěšného dokončení platby. Poskytovatel je povinen zahájit zpracování bez zbytečného odkladu po přijetí platby.\n\nGledem k povaze AI zpracování obrazu Poskytovatel negarantuje, že výsledek úpravy bude vždy subjektivně vyhovovat představám Uživatele. Platba za provedenou úpravu je konečná a nevratná. Částka může být refundována pouze v případě prokazatelného technického selhání na straně Poskytovatele, kdy fotografie nebyla zpracována nebo ji nebylo možné stáhnout.`,
          },
          {
            title: '4. Odstoupení od smlouvy',
            content: `Vzhledem k tomu, že Služba spočívá v dodání digitálního obsahu, který je na žádost Uživatele zpracován neprodleně po zaplacení, nevzniká spotřebiteli právo na odstoupení od smlouvy ve 14denní lhůtě dle § 1837 písm. l) občanského zákoníku, pokud bylo plnění zahájeno s jeho výslovným souhlasem před uplynutím lhůty pro odstoupení. Uživatel uděluje tento souhlas zaškrtnutím příslušného políčka před dokončením objednávky.\n\nRefundace je možná výhradně v případě prokazatelného technického selhání Poskytovatele (viz čl. 3). Žádost o refundaci zasílejte na info@fasthdr.cz.`,
          },
          {
            title: '5. Autorská práva a nahraná data',
            content: `Uživatel nese plnou odpovědnost za to, že je oprávněn nahrávat fotografie do Služby a že jejich zpracováním nedojde k porušení autorských ani jiných práv třetích osob.\n\nNahráním fotografií neposkytuje Uživatel Poskytovateli žádná trvalá autorská práva. Data jsou použita výhradně k jednorázovému provedení požadované úpravy.\n\nDoba uložení: Nahrávané originály i výsledné upravené fotografie jsou na serverech dočasně uloženy po dobu maximálně 7 dnů od jejich nahrání. Po uplynutí této lhůty jsou fotografie trvale a nevratně smazány. Uživatel je odpovědný za stažení výsledků v této lhůtě.`,
          },
          {
            title: '6. Reklamace a odpovědnost za vady',
            content: `Pokud Služba vykazuje vady (fotografie nebyla zpracována, výsledek nelze stáhnout), je Uživatel oprávněn uplatnit reklamaci na info@fasthdr.cz do 30 dnů od provedení platby. Poskytovatel se zavazuje reklamaci vyřešit do 30 dnů od jejího doručení.\n\nSubjektivní nespokojenost s výsledkem AI úpravy (estetika, styl) není důvodem pro uznání reklamace, neboť výsledek je závislý na povaze vstupního materiálu a parametrech zpracování zvolených Uživatelem.`,
          },
          {
            title: '7. Dostupnost služby',
            content: `Poskytovatel se snaží zajistit nepřetržitou dostupnost Služby, avšak negarantuje 100% dostupnost. Plánované výpadky budou oznámeny na webu. Za výpadky způsobené třetími stranami (hostingové služby, platební brány) Poskytovatel neodpovídá.`,
          },
          {
            title: '8. Ochrana osobních údajů',
            content: `Zpracování osobních údajů se řídí samostatným dokumentem Zásady ochrany osobních údajů, který je dostupný na adrese fasthdr.cz/ochrana-soukromi.`,
          },
          {
            title: '9. Závěrečná ustanovení',
            content: `Poskytovatel nenese odpovědnost za přímé ani nepřímé škody vzniklé dočasnou nedostupností Služby, ztrátou neuložených dat (po uplynutí 7denní lhůty) nebo nesprávným použitím upravených fotografií Uživatelem.\n\nPoskytovatel je oprávněn tyto VOP jednostranně měnit. O změně bude Uživatel informován e-mailem nebo oznámením na webu. Pokračování v užívání Služby po nabytí účinnosti změn znamená souhlas s novými VOP.\n\nVeškeré právní vztahy se řídí právem České republiky. Případné spory bude řešit věcně a místně příslušný soud v ČR.\n\nTyto VOP nabývají účinnosti dnem 7. 5. 2026.`,
          },
          {
            title: '10. Kontakt',
            content: `Filip Zemek\nDrnovec 1, 471 54 Cvikov\nIČO: 23584203\nE-mail: info@fasthdr.cz\nTel.: +420 777 080 877`,
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