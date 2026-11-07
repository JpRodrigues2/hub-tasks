'use client';
// O comando de instalação com botão de copiar.
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

export function ComandoInstalar({ comando }: { comando: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(comando);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1800);
      }}
      className="group flex w-full items-center gap-3 rounded-md border border-borda bg-superficie px-4 py-3 text-left font-mono text-[13.5px] text-texto transition-colors hover:border-dourado/40"
      aria-label="Copiar o comando de instalação"
    >
      <span className="text-nebulosa select-none">$</span>
      <span className="min-w-0 flex-1 truncate">{comando}</span>
      {copiado ? <Check className="h-4 w-4 shrink-0 text-ok" /> : <Copy className="h-4 w-4 shrink-0 text-suave transition-colors group-hover:text-texto" />}
    </button>
  );
}
