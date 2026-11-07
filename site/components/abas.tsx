'use client';
// Abas da seção "Do PM ao pull request": cada aba mostra um quadro do que o Muxor faz.
import { useState, type ReactNode } from 'react';

export function Abas({ abas }: { abas: { nome: string; titulo: string; texto: string; quadro: ReactNode }[] }) {
  const [ativa, setAtiva] = useState(0);
  const a = abas[ativa];
  return (
    <div>
      <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
        {abas.map((x, i) => (
          <button
            key={x.nome}
            type="button"
            onClick={() => setAtiva(i)}
            className={`h-9 shrink-0 rounded-md px-3.5 text-[13.5px] font-medium transition-colors ${
              i === ativa ? 'bg-superficie-2 text-texto ring-1 ring-borda' : 'text-suave hover:text-texto'
            }`}
          >
            {x.nome}
          </button>
        ))}
      </div>
      <div className="mt-6 grid items-center gap-6 md:mt-8 md:grid-cols-[1fr_1.3fr] md:gap-8">
        <div key={a.nome} className="revelar visivel">
          <h3 className="text-2xl font-medium tracking-[-0.02em]">{a.titulo}</h3>
          <p className="mt-3 leading-relaxed text-suave">{a.texto}</p>
        </div>
        <div key={`q-${a.nome}`} className="revelar visivel">
          {a.quadro}
        </div>
      </div>
    </div>
  );
}
