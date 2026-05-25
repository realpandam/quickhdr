import type { Metadata } from 'next';
import Script from 'next/script';
import SessionTimeout from './components/SessionTImeout';
import SmoothScroll from './components/SmoothScroll';
import './globals.css';

export const metadata: Metadata = {
  title: 'FASTHDR — Profesionální úprava fotografií',
  description: 'Profesionální vylepšení fotografií pomocí umělé inteligence.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Barlow:wght@700;800;900&display=swap" rel="stylesheet" />

        {/* bfcache fix — beforeInteractive zajistí spuštění i po bfcache restore */}
        <script dangerouslySetInnerHTML={{
          __html: `
            window.addEventListener('pageshow', function(e) {
              if (e.persisted) { window.location.reload(); }
            });
          `
        }} />

        {/* Theme init — musí být v head před renderem */}
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              const saved = localStorage.getItem('theme');
              document.documentElement.setAttribute('data-theme', saved || 'dark');
            })();
          `
        }} />
      </head>
      <body>
        <SmoothScroll />
        {children}
        <SessionTimeout />
      </body>
    </html>
  );
}