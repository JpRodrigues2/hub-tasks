// muxor.com.br/celular: o QR code do muxor init abre esta página no celular, com os três apps que o Muxor usa.
// Cada um com o link da App Store e do Google Play (o Orca para Android vem do site dele).
import type { Metadata } from 'next';
import Image from 'next/image';

export const metadata: Metadata = { title: 'Muxor no celular', description: 'Os apps que o Muxor usa no celular: Telegram, Orca e Tailscale.' };

const APPS = [
  {
    nome: 'Telegram',
    paraQue: 'Onde o Muxor manda as suas tasks e os avisos. Você escolhe, responde e aprova por ele.',
    ios: 'https://apps.apple.com/app/telegram-messenger/id686449807',
    android: 'https://play.google.com/store/apps/details?id=org.telegram.messenger',
  },
  {
    nome: 'Orca',
    paraQue: 'Para assistir à sessão do Claude ao vivo e responder a ele. Pareie com o Mac escolhendo Relay.',
    ios: 'https://apps.apple.com/app/orca-ide/id6766130217',
    android: 'https://www.onorca.dev/download',
  },
  {
    nome: 'Tailscale',
    paraQue: 'Para abrir no celular o front-end que roda no seu Mac. Entre com a mesma conta que usou no Mac.',
    ios: 'https://apps.apple.com/app/tailscale/id1470499037',
    android: 'https://play.google.com/store/apps/details?id=com.tailscale.ipn',
  },
];

export default function Celular() {
  return (
    <main className="site-container max-w-xl py-12">
      <a href="/" className="flex items-center gap-2.5 text-texto">
        <Image src="/muxor-cabecalho.png" alt="" width={19} height={32} className="h-8 w-auto" />
        <span className="text-[15px] font-semibold tracking-[-0.02em]">Muxor</span>
      </a>
      <h1 className="text-heading mt-10 text-balance">Três apps no celular.</h1>
      <p className="text-lede mt-4 text-suave">Instale enquanto o Mac termina a configuração. O terminal diz quando usar cada um.</p>
      <ol className="mt-10 space-y-4">
        {APPS.map((a, i) => (
          <li key={a.nome} className="rounded-xl border border-borda bg-superficie p-5">
            <div className="flex items-center gap-3 font-mono text-[12px] text-dourado">
              <span>0{i + 1}</span>
              <span className="h-px flex-1 bg-borda" />
            </div>
            <h2 className="mt-3 text-lg font-medium">{a.nome}</h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-suave">{a.paraQue}</p>
            <div className="mt-4 flex gap-2">
              <a href={a.ios} className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-botao text-sm font-semibold text-botao-texto">
                iPhone
              </a>
              <a href={a.android} className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-sm font-semibold text-texto/85">
                Android
              </a>
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
