'use client';

interface Props {
    agreedToTerms: boolean;
    agreedToPrivacy: boolean;
    onTermsChange: (v: boolean) => void;
    onPrivacyChange: (v: boolean) => void;
}

export default function ConsentCheckboxes({
    agreedToTerms,
    agreedToPrivacy,
    onTermsChange,
    onPrivacyChange,
}: Props) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', margin: '1rem 0' }}>
            {/* Checkbox 1 — VOP */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
                <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={e => onTermsChange(e.target.checked)}
                    style={{ marginTop: 3, accentColor: 'var(--accent)', flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Souhlasím s{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer"
                        style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                        Všeobecnými obchodními podmínkami
                    </a>
                    {' '}služby FastHDR. Beru na vědomí, že platba za provedenou úpravu je
                    konečná a nevratná, s výjimkou prokazatelného technického selhání.
                    {' '}<span style={{ color: '#ef4444' }}>*</span>
                </span>
            </label>

            {/* Checkbox 2 — GDPR */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
                <input
                    type="checkbox"
                    checked={agreedToPrivacy}
                    onChange={e => onPrivacyChange(e.target.checked)}
                    style={{ marginTop: 3, accentColor: 'var(--accent)', flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Souhlasím se{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer"
                        style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                        Zásadami ochrany osobních údajů
                    </a>
                    {' '}a beru na vědomí, že nahrané fotografie budou uloženy po dobu
                    maximálně 7 dnů a poté trvale smazány.
                    {' '}<span style={{ color: '#ef4444' }}>*</span>
                </span>
            </label>

            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                <span style={{ color: '#ef4444' }}>*</span> Povinné pole — bez souhlasu nelze dokončit objednávku.
            </p>
        </div>
    );
}