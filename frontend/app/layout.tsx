import type { Metadata } from 'next';
import SessionTimeout from './components/SessionTImeout';
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

        {/* Dropbox Chooser SDK — musí být načten staticky */}
        <script
          src="https://www.dropbox.com/static/api/2/dropins.js"
          id="dropboxjs"
          data-app-key={process.env.NEXT_PUBLIC_DROPBOX_APP_KEY}
        />

        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              const saved = localStorage.getItem('theme');
              const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
              document.documentElement.setAttribute('data-theme', saved || preferred);
            })();
          `
        }} />
      </head>
      <body>{children}
        <SessionTimeout />
      </body>
    </html>
  );
}