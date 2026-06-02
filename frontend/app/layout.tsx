import type { Metadata } from 'next';
import Script from 'next/script';
import SessionTimeout from './components/SessionTImeout';
import SmoothScroll from './components/SmoothScroll';
import './globals.css';

const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? '';

export const metadata: Metadata = {
  title: 'FASTHDR — Profesionální úprava fotografií',
  description: 'Profesionální vylepšení fotografií pomocí umělé inteligence. HDR zpracování a AI úpravy pro realitní fotografy.',
  keywords: 'HDR fotografie, úprava fotografií, realitní fotografie, AI úpravy, HDR zpracování',
  authors: [{ name: 'FASTHDR' }],
  openGraph: {
    title: 'FASTHDR — Profesionální úprava fotografií',
    description: 'Profesionální vylepšení fotografií pomocí umělé inteligence.',
    url: 'https://fasthdr.cz',
    siteName: 'FASTHDR',
    locale: 'cs_CZ',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Barlow:wght@700;800;900&display=swap" rel="stylesheet" />

        {/* bfcache fix */}
        <script dangerouslySetInnerHTML={{
          __html: `
            window.addEventListener('pageshow', function(e) {
              if (e.persisted) { window.location.reload(); }
            });
          `
        }} />

        {/* Theme init */}
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              const saved = localStorage.getItem('theme');
              document.documentElement.setAttribute('data-theme', saved || 'dark');
            })();
          `
        }} />

        {/* GA4 — Google Analytics */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}', {
              page_path: window.location.pathname,
            });

            // ── Helper pro tracking konverzí ──────────────────────────────
            window.trackEvent = function(eventName, params) {
              if (typeof gtag !== 'undefined') {
                gtag('event', eventName, params || {});
              }
            };
          `}
        </Script>
      </head>
      <body>
        <SmoothScroll />
        {children}
        <SessionTimeout />
      </body>
    </html>
  );
}