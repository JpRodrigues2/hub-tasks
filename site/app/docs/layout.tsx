import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { source } from '@/lib/source';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      nav={{
        url: '/',
        title: (
          <span className="flex items-center gap-2">
            <Image src="/muxor-cabecalho.png" alt="" width={19} height={32} className="h-7 w-auto" />
            <span className="font-semibold tracking-[-0.02em]">Muxor</span>
          </span>
        ),
      }}
      links={[{ text: 'GitHub', url: 'https://github.com/JpRodrigues2/muxor', external: true }]}
      themeSwitch={{ enabled: false }}
    >
      {children}
    </DocsLayout>
  );
}
