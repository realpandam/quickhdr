'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const t = document.documentElement.getAttribute('data-theme') as 'light' | 'dark';
    setTheme(t || 'dark');
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  };

  return (
    <button onClick={toggle} aria-label="Přepnout téma" style={{
      background: 'none', border: '1px solid var(--border)',
      borderRadius: '50%', width: 32, height: 32,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, color: 'var(--text-secondary)',
      transition: 'border-color 0.15s',
    }}>
      {theme === 'dark' ? '☀' : '◐'}
    </button>
  );
}