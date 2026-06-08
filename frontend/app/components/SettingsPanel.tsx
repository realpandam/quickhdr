'use client';

import { useState } from 'react';

interface Restage {
  tvs: 'BLACK_OUT' | null;
  fire_in_fireplaces: 'ALIGHT' | null;
  photographer: 'REMOVE' | null;
  grass: 'GREEN' | null;
}

interface Settings {
  enhance_type: 'warm' | 'neutral';
  sky_replacement: boolean;
  cloud_type: 'CLEAR' | 'LOW_CLOUD' | 'LOW_CLOUD_LOW_SAT' | 'HIGH_CLOUD';
  vertical_correction: boolean;
  lens_correction: boolean;
  window_pull_style: 'NONE' | 'ONLY_WINDOWS' | 'WINDOWS_WITH_SKIES';
  upscale: boolean;
  privacy: boolean;
  hdr_mode: boolean;
  hdr_brackets: 'auto' | 3 | 5 | 7;
  restage: Restage;
}

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  disabled?: boolean;
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <div
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="toggle-wrap"
      style={{
        fontSize: 13, color: 'var(--text-secondary)',
        userSelect: 'none' as const, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
      }}
    >
      <div className={`toggle-track ${on ? 'on' : ''}`} style={{ flexShrink: 0 }}>
        <div className="toggle-thumb" />
      </div>
      <span style={{ lineHeight: 1.4 }}>{label}</span>
    </div>
  );
}

export type { Settings, Restage };

export default function SettingsPanel({ settings, onChange, disabled }: Props) {
  const [hovered, setHovered] = useState(false);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onChange({ ...settings, [key]: value });
  };
  const setRestage = <K extends keyof Restage>(key: K, value: Restage[K]) => {
    onChange({ ...settings, restage: { ...settings.restage, [key]: value } });
  };

  return (
    <div style={{ position: 'relative' as const, marginBottom: '1.5rem' }}>
      <div
        onMouseEnter={() => { if (!disabled) setHovered(true); }}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: 'var(--bg-card)',
          border: `1px solid ${hovered ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)',
          padding: '1.5rem',
          opacity: disabled ? 0.5 : 1,
          transition: 'opacity 0.2s, border-color 0.3s, box-shadow 0.3s',
          pointerEvents: disabled ? 'none' : 'auto',
          boxShadow: hovered
            ? '0 20px 60px rgba(139,92,246,0.15), 0 4px 20px rgba(0,0,0,0.2)'
            : '0 2px 8px rgba(0,0,0,0.1)',
        }}>
        <p style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          color: 'var(--text-muted)', marginBottom: '1.25rem',
        }}>
          Nastavení vylepšení
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>

          {/* Typ vylepšení */}
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Typ vylepšení</p>
            <select
              className="select"
              value={settings.enhance_type}
              onChange={e => set('enhance_type', e.target.value as Settings['enhance_type'])}
              style={{ width: '100%' }}
            >
              <option value="neutral">Neutrální</option>
              <option value="warm">Teplý</option>
            </select>
          </div>

          {/* Window pull */}
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Vytažení oken</p>
            <select
              className="select"
              value={settings.window_pull_style}
              onChange={e => set('window_pull_style', e.target.value as Settings['window_pull_style'])}
              style={{ width: '100%' }}
            >
              <option value="NONE">Vypnuto</option>
              <option value="ONLY_WINDOWS">Pouze okna</option>
              <option value="WINDOWS_WITH_SKIES">Okna s oblohou</option>
            </select>
          </div>

          {/* Cloud type */}
          <div style={{ visibility: settings.sky_replacement ? 'visible' : 'hidden' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Typ oblohy</p>
            <select
              className="select"
              value={settings.cloud_type}
              onChange={e => set('cloud_type', e.target.value as Settings['cloud_type'])}
              style={{ width: '100%' }}
            >
              <option value="CLEAR">Jasno</option>
              <option value="LOW_CLOUD">Nízké mraky</option>
              <option value="LOW_CLOUD_LOW_SAT">Neutrální (nízká saturace)</option>
              <option value="HIGH_CLOUD">Vysoké mraky</option>
            </select>
          </div>

          {/* Toggles */}
          <div style={{
            gridColumn: '1 / -1',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, max-content))',
            gap: '0.85rem 2.5rem',
            marginTop: '0.75rem',
          }} className="settings-toggles">

            <Toggle on={settings.sky_replacement} onToggle={() => set('sky_replacement', !settings.sky_replacement)} label="Výměna oblohy" />
            <Toggle on={settings.upscale} onToggle={() => set('upscale', !settings.upscale)} label="Zvýšení rozlišení" />
            <Toggle on={settings.restage.tvs === 'BLACK_OUT'} onToggle={() => setRestage('tvs', settings.restage.tvs === 'BLACK_OUT' ? null : 'BLACK_OUT')} label="Zčernání TV obrazovek" />
            <Toggle on={settings.restage.fire_in_fireplaces === 'ALIGHT'} onToggle={() => setRestage('fire_in_fireplaces', settings.restage.fire_in_fireplaces === 'ALIGHT' ? null : 'ALIGHT')} label="Oheň v krbu" />

            <Toggle on={settings.vertical_correction} onToggle={() => set('vertical_correction', !settings.vertical_correction)} label="Srovnání linií" />
            <Toggle on={settings.privacy} onToggle={() => set('privacy', !settings.privacy)} label="Anonymizace obličejů a SPZ" />
            <Toggle on={settings.restage.photographer === 'REMOVE'} onToggle={() => setRestage('photographer', settings.restage.photographer === 'REMOVE' ? null : 'REMOVE')} label="Odstranění fotografa z odrazů" />
            <Toggle on={settings.restage.grass === 'GREEN'} onToggle={() => setRestage('grass', settings.restage.grass === 'GREEN' ? null : 'GREEN')} label="Zelenější trávník" />

            <Toggle on={settings.lens_correction} onToggle={() => set('lens_correction', !settings.lens_correction)} label="Korekce objektivu" />
            <div />
            <div />
            <div />

          </div>

          {/* HDR sekce */}
          <div style={{
            gridColumn: '1 / -1',
            borderTop: '1px solid var(--border)',
            paddingTop: '1.25rem',
            display: 'flex',
            flexWrap: 'wrap' as const,
            alignItems: 'center',
            gap: '1.5rem',
          }}>
            <Toggle on={settings.hdr_mode} onToggle={() => set('hdr_mode', !settings.hdr_mode)} label="HDR režim — nahrát více expozic stejné scény" />

            {settings.hdr_mode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' as const }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' as const }}>
                  Počet bracketů na scénu
                </p>
                <select
                  className="select"
                  value={settings.hdr_brackets}
                  onChange={e => {
                    const v = e.target.value;
                    set('hdr_brackets', v === 'auto' ? 'auto' : Number(v) as 3 | 5 | 7);
                  }}
                >
                  <option value="auto">Automaticky (AI rozhodne)</option>
                  <option value="3">3 brackety</option>
                  <option value="5">5 bracketů</option>
                  <option value="7">7 bracketů</option>
                </select>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 260, lineHeight: 1.5 }}>
                  {settings.hdr_brackets === 'auto'
                    ? 'AI analyzuje vizuální podobnost a seskupí brackety sama.'
                    : `Každých ${settings.hdr_brackets} souborů bude sloučeno do jednoho HDR snímku.`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Overlay při zpracování */}
      {disabled && (
        <div style={{
          position: 'absolute' as const,
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius)',
          background: 'rgba(0,0,0,0.25)',
          backdropFilter: 'blur(2px)',
          zIndex: 10,
        }}>
          <p style={{
            fontSize: 13,
            color: 'var(--text-primary)',
            fontWeight: 500,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            padding: '0.5rem 1rem',
            borderRadius: 999,
          }}>
            🔒 Nastavení zamčeno — probíhá zpracování
          </p>
        </div>
      )}
    </div>
  );
}