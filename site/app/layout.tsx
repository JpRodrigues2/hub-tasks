import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { traducoes } from '@/lib/traducoes';
import './globals.css';

// Mesma tipografia do onorca.dev: Inter no texto, JetBrains Mono nos comandos e detalhes.
const sans = Inter({ subsets: ['latin'], variable: '--fonte-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--fonte-mono', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL('https://muxor.com.br'),
  title: 'Muxor · o estagiário que despacha suas tasks para o Claude Code',
  description:
    'O Muxor lê suas tasks no Funifier PM, Bnexo e Jira, manda a lista no Telegram e coloca o Claude Code para trabalhar no Orca. Você acompanha e responde pelo celular.',
  icons: { icon: '/favicon.ico', apple: '/icone-180.png' },
  openGraph: { title: 'Muxor', description: 'Suas tasks, despachadas para o Claude Code.', images: ['/icone-512.png'] },
};

// Celular: largura do aparelho e zoom bloqueado (a navegação fica fixa, sem pinça nem toque duplo).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0e0f11',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`dark ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <RootProvider
          theme={{ forcedTheme: 'dark', defaultTheme: 'dark' }}
          search={{ options: { type: 'static' } }}
          i18n={{ locale: 'pt-BR', translations: traducoes }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
