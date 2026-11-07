// O diagrama de "Como funciona": as ferramentas de gestão entram no Muxor, você decide pelo celular, e o Muxor
// espalha as tasks em várias sessões do Claude ao mesmo tempo, que viram PRs. Pontos de luz correm pelos fios
// (SVG animado, sem JavaScript). Dois desenhos: largo (computador) e em pé (celular).
import type { ReactNode } from 'react';

type Ponto = [number, number];
interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
  titulo: string;
  sub?: string;
  tipo?: 'ferramenta' | 'muxor' | 'voce' | 'sessao' | 'github';
}
interface Fio {
  id: string;
  d: string;
  pontos?: number; // quantos pontos de luz ao mesmo tempo
  dur?: number;
  atraso?: number;
  cor?: string;
}

const cor = (v: string) => `var(--cor-${v})`;

function CaixaSvg({ c }: { c: Caixa }) {
  const destaque = c.tipo === 'muxor';
  const borda = destaque ? cor('dourado') : c.tipo === 'voce' ? cor('nebulosa') : cor('borda');
  return (
    <g>
      <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={12} style={{ fill: destaque ? cor('superficie-2') : cor('superficie'), stroke: borda, strokeWidth: destaque ? 1.5 : 1 }} />
      {c.tipo === 'sessao' && (
        <g>
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={c.x + 14 + i * 9} cy={c.y + 14} r={2.6} style={{ fill: cor('borda') }} />
          ))}
          <circle cx={c.x + c.w - 16} cy={c.y + 14} r={3.5} className="fluxo-pisca" style={{ fill: cor('ok') }} />
        </g>
      )}
      {c.tipo === 'voce' && (
        <g style={{ fill: 'none', stroke: cor('nebulosa'), strokeWidth: 1.6 }}>
          <rect x={c.x + 18} y={c.y + c.h / 2 - 15} width={17} height={30} rx={4} />
          <line x1={c.x + 24} y1={c.y + c.h / 2 + 10} x2={c.x + 29} y2={c.y + c.h / 2 + 10} />
        </g>
      )}
      {destaque && <image href="/muxor-cabecalho.png" x={c.x + 16} y={c.y + (c.h - 64) / 2} width={38} height={64} />}
      <text
        x={destaque ? c.x + 66 : c.x + c.w / 2 + (c.tipo === 'voce' ? 12 : 0)}
        y={c.y + c.h / 2 + (c.sub ? (c.tipo === 'sessao' ? 0 : -3) : 5) + (c.tipo === 'sessao' ? 6 : 0)}
        textAnchor={destaque ? 'start' : 'middle'}
        style={{ fill: cor('texto'), fontSize: destaque ? 20 : 14.5, fontWeight: destaque ? 600 : 500, letterSpacing: '-0.01em' }}
      >
        {c.titulo}
      </text>
      {c.sub && (
        <text
          x={destaque ? c.x + 66 : c.x + c.w / 2 + (c.tipo === 'voce' ? 12 : 0)}
          y={c.y + c.h / 2 + (c.tipo === 'sessao' ? 24 : 16)}
          textAnchor={destaque ? 'start' : 'middle'}
          style={{ fill: cor('texto-suave'), fontSize: 12, fontFamily: 'var(--fonte-mono)' }}
        >
          {c.sub}
        </text>
      )}
    </g>
  );
}

function FioSvg({ f }: { f: Fio }) {
  const n = f.pontos ?? 2;
  const dur = f.dur ?? 2.6;
  return (
    <g>
      <path id={f.id} d={f.d} style={{ fill: 'none', stroke: cor('borda'), strokeWidth: 1.5 }} />
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} r={3.5} className="fluxo-ponto" style={{ fill: f.cor ?? cor('dourado') }}>
          <animateMotion dur={`${dur}s`} begin={`-${(f.atraso ?? 0) + (i * dur) / n}s`} repeatCount="indefinite">
            <mpath href={`#${f.id}`} />
          </animateMotion>
        </circle>
      ))}
    </g>
  );
}

function Rotulo({ x, y, children, ancora = 'middle' }: { x: number; y: number; children: ReactNode; ancora?: 'start' | 'middle' | 'end' }) {
  return (
    <text x={x} y={y} textAnchor={ancora} style={{ fill: cor('texto-suave'), fontSize: 12, fontFamily: 'var(--fonte-mono)' }}>
      {children}
    </text>
  );
}

// Curva horizontal suave entre dois pontos.
const curvaH = ([x1, y1]: Ponto, [x2, y2]: Ponto) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
const curvaV = ([x1, y1]: Ponto, [x2, y2]: Ponto) => `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`;

const FERRAMENTAS = ['Jira', 'Funifier PM', 'Bnexo'];
const SESSOES: [string, string][] = [
  ['Claude Code', 'app-pedidos'],
  ['Claude Code', 'painel'],
  ['Claude Code', 'api'],
];

function Largo() {
  const ferr: Caixa[] = FERRAMENTAS.map((t, i) => ({ x: 30, y: 168 + i * 86, w: 190, h: 56, titulo: t, tipo: 'ferramenta' }));
  const mux: Caixa = { x: 430, y: 236, w: 220, h: 104, titulo: 'Muxor', sub: 'o estagiário', tipo: 'muxor' };
  const voce: Caixa = { x: 450, y: 34, w: 180, h: 64, titulo: 'Você', sub: 'de qualquer lugar', tipo: 'voce' };
  const ses: Caixa[] = SESSOES.map(([t, s], i) => ({ x: 860, y: 150 + i * 96, w: 210, h: 68, titulo: t, sub: s, tipo: 'sessao' }));
  const gh: Caixa = { x: 860, y: 462, w: 210, h: 56, titulo: 'PRs no GitHub', tipo: 'github' };
  const fios: Fio[] = [
    ...ferr.map((c, i) => ({ id: `l-f${i}`, d: curvaH([c.x + c.w, c.y + c.h / 2], [mux.x, mux.y + 30 + i * 22]), atraso: i * 0.5 })),
    { id: 'l-desce', d: `M${voce.x + 60},${voce.y + voce.h} L${voce.x + 60},${mux.y}`, cor: cor('nebulosa'), dur: 1.8 },
    { id: 'l-sobe', d: `M${voce.x + 120},${mux.y} L${voce.x + 120},${voce.y + voce.h}`, cor: cor('ok'), dur: 1.8, atraso: 0.9 },
    ...ses.map((c, i) => ({ id: `l-s${i}`, d: curvaH([mux.x + mux.w, mux.y + 30 + i * 22], [c.x, c.y + c.h / 2]), atraso: 0.3 + i * 0.4 })),
    ...ses.map((c, i) => ({ id: `l-g${i}`, d: `M${c.x + c.w},${c.y + c.h / 2} C${c.x + c.w + 34 + i * 6},${c.y + c.h / 2} ${gh.x + gh.w + 34 + i * 6},${gh.y + 14 + i * 14} ${gh.x + gh.w},${gh.y + 14 + i * 14}`, pontos: 1, dur: 3.4, atraso: 1 + i * 0.8, cor: cor('ok') })),
  ];
  return (
    <svg viewBox="0 0 1120 560" role="img" aria-label="Fluxo do Muxor" className="h-auto w-full">
      <Rotulo x={125} y={150}>as suas tasks</Rotulo>
      <Rotulo x={965} y={132}>uma sessão por task, em paralelo</Rotulo>
      <Rotulo x={500} y={170} ancora="end">escolhe · responde</Rotulo>
      <Rotulo x={580} y={170} ancora="start">avisos · perguntas</Rotulo>
      <Rotulo x={965} y={546}>você revisa e aprova</Rotulo>
      {fios.map((f) => (
        <FioSvg key={f.id} f={f} />
      ))}
      {[...ferr, voce, mux, ...ses, gh].map((c, i) => (
        <CaixaSvg key={i} c={c} />
      ))}
    </svg>
  );
}

function EmPe() {
  const ferr: Caixa[] = FERRAMENTAS.map((t, i) => ({ x: 8 + i * 118, y: 30, w: 108, h: 48, titulo: t, tipo: 'ferramenta' }));
  const mux: Caixa = { x: 8, y: 170, w: 190, h: 96, titulo: 'Muxor', sub: 'o estagiário', tipo: 'muxor' };
  const voce: Caixa = { x: 232, y: 178, w: 118, h: 80, titulo: 'Você', sub: 'de longe', tipo: 'voce' };
  const ses: Caixa[] = SESSOES.map(([t, s], i) => ({ x: 74, y: 370 + i * 86, w: 222, h: 64, titulo: t, sub: s, tipo: 'sessao' }));
  const gh: Caixa = { x: 90, y: 680, w: 180, h: 52, titulo: 'PRs no GitHub', tipo: 'github' };
  const fios: Fio[] = [
    ...ferr.map((c, i) => ({ id: `p-f${i}`, d: curvaV([c.x + c.w / 2, c.y + c.h], [mux.x + 50 + i * 45, mux.y]), atraso: i * 0.5 })),
    { id: 'p-vai', d: `M${voce.x},${voce.y + 28} L${mux.x + mux.w},${voce.y + 28}`, cor: cor('nebulosa'), dur: 1.6 },
    { id: 'p-volta', d: `M${mux.x + mux.w},${voce.y + 54} L${voce.x},${voce.y + 54}`, cor: cor('ok'), dur: 1.6, atraso: 0.8 },
    // Descem em paralelo pela esquerda e entram em cada sessão, sem passar por baixo das caixas.
    ...ses.map((c, i) => {
      const bx = 22 + i * 13;
      const cy = c.y + c.h / 2;
      return { id: `p-s${i}`, d: `M${bx},${mux.y + mux.h} L${bx},${cy - 10} Q${bx},${cy} ${bx + 10},${cy} L${c.x},${cy}`, atraso: 0.3 + i * 0.4 };
    }),
    ...ses.map((c, i) => ({ id: `p-g${i}`, d: `M${c.x + c.w},${c.y + c.h / 2} C${c.x + c.w + 40},${c.y + c.h / 2} ${gh.x + gh.w + 50},${gh.y + gh.h / 2} ${gh.x + gh.w},${gh.y + gh.h / 2}`, pontos: 1, dur: 3.2, atraso: 1 + i * 0.8, cor: cor('ok') })),
  ];
  return (
    <svg viewBox="0 0 360 760" role="img" aria-label="Fluxo do Muxor" className="mx-auto h-auto w-full max-w-[420px]">
      <Rotulo x={180} y={18}>as suas tasks</Rotulo>
      <Rotulo x={185} y={356}>uma sessão por task, em paralelo</Rotulo>
      <Rotulo x={180} y={754}>você revisa e aprova</Rotulo>
      {fios.map((f) => (
        <FioSvg key={f.id} f={f} />
      ))}
      {[...ferr, mux, voce, ...ses, gh].map((c, i) => (
        <CaixaSvg key={i} c={c} />
      ))}
    </svg>
  );
}

export function Fluxo() {
  return (
    <div className="rounded-2xl border border-borda bg-fundo/60 p-4 md:p-8">
      <div className="hidden md:block">
        <Largo />
      </div>
      <div className="md:hidden">
        <EmPe />
      </div>
    </div>
  );
}
