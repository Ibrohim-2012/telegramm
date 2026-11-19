import type { Metadata, Viewport } from 'next';
import { Roboto } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';

const roboto = Roboto({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['400', '500', '700'], display: 'swap', variable: '--font-roboto' });

export const metadata: Metadata = {
  title: 'Mening Telegramim',
  description: 'Shaxsiy Telegram klienti',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#3390ec' };

// Applies saved theme before first paint to avoid a flash.
const themeScript = `(function(){try{var s=(JSON.parse(localStorage.getItem('mt-ui')||'{}').state)||{};var t=s.theme||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.fontSize=(s.fontSize||16)+'px';document.documentElement.dataset.wp=s.wallpaper||'classic';}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" className={roboto.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main" className="sr-only z-[100] rounded-full bg-accent px-4 py-2 font-semibold text-accent-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
          Asosiy qismga o‘tish / Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
