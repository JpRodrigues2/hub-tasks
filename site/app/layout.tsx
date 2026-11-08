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
    'Suas tasks de várias ferramentas de gestão e várias sessões do Claude Code numa central só. Escolha, despache e acompanhe tudo de uma conversa, no computador ou no celular.',
  icons: { icon: '/favicon.ico', apple: '/icone-180.png' },
  openGraph: { title: 'Muxor', description: 'Todas as suas tasks e sessões do Claude Code num lugar só.', images: ['/icone-512.png'] },
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
