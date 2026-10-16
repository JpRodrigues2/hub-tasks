// Busca as tasks nas duas ferramentas e monta o resumo em texto (HTML do Telegram).
// Na Fase 4 este resumo ganha os botões de seleção.
import { appsDoProjeto, type Catalogo } from './config.js';
import type { DB } from './db.js';
import { errInfo, log } from './logger.js';
import type { Categoria, PmAdapter, Task } from './pm/types.js';
import { registrarProjetos } from './projetos.js';

export interface ResultadoBusca {
  tasks: Task[];
  erros: { ferramenta: string; erro: string }[];
}

export async function buscarTasks(adapters: PmAdapter[], db: DB): Promise<ResultadoBusca> {
  const tasks: Task[] = [];
  const erros: ResultadoBusca['erros'] = [];
  await Promise.all(
    adapters.map(async (a) => {
      try {
        tasks.push(...(await a.listMyTasks()));
      } catch (e) {
        log.error('resumo: falha ao listar tasks', { ferramenta: a.nome, ...errInfo(e) });
        erros.push({ ferramenta: a.nome, erro: (e as Error).message });
      }
    }),
  );
  registrarVistas(db, tasks);
  registrarProjetos(db, tasks);
  return { tasks, erros };
}

function registrarVistas(db: DB, tasks: Task[]) {
  const agora = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO tasks_vistas (ferramenta, task_id, empresa, titulo, projeto_id, projeto_nome, status, prazo, link, primeira_vez, ultima_vez)
    VALUES (@ferramenta, @id, @empresa, @titulo, @projetoId, @projetoNome, @status, @prazo, @link, @agora, @agora)
    ON CONFLICT(ferramenta, task_id) DO UPDATE SET
      titulo = excluded.titulo, projeto_id = excluded.projeto_id, projeto_nome = excluded.projeto_nome,
      status = excluded.status, prazo = excluded.prazo, link = excluded.link, ultima_vez = excluded.ultima_vez`);
  db.transaction(() => tasks.forEach((t) => stmt.run({ ...t, agora })))();
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const GRUPOS: { categoria: Categoria; titulo: string }[] = [
  { categoria: 'atrasada', titulo: '🔴 Atrasadas' },
  { categoria: 'em_progresso', titulo: '🔵 Em progresso' },
  { categoria: 'pendente', titulo: '🟡 Pendentes' },
  { categoria: 'backlog', titulo: '⚪ Backlog' },
  { categoria: 'revisao', titulo: '🟣 Em revisão' },
];

const EMPRESAS = [
  { empresa: 'funifier', nome: 'FUNIFIER', ferramenta: 'Funifier PM' },
  { empresa: 'dac', nome: 'DAC', ferramenta: 'Bnexo' },
] as const;

function formatarPrazo(prazo: string | null, tz: string) {
  if (!prazo) return null;
  return `⏰ ${new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit' }).format(new Date(prazo))}`;
}

export interface ItemResumo {
  idx: number; // número mostrado ao João (global no resumo)
  task: Task;
  app: string | null; // app sugerido; null = projeto não mapeado
}

export interface BlocoEmpresa {
  empresa: 'funifier' | 'dac';
  texto: string;
  itens: ItemResumo[];
}

export function appSugerido(t: Task, cat: Catalogo): string | null {
  return t.projetoId ? (appsDoProjeto(cat, t.ferramenta, t.projetoId)[0]?.app ?? null) : null;
}

// Uma task = duas linhas (número + título com link; projeto e prazo em itálico) e uma linha em branco depois.
function linhaTask(i: ItemResumo, tz: string) {
  const t = i.task;
  const titulo = escapeHtml(t.titulo.length > 90 ? t.titulo.slice(0, 87) + '…' : t.titulo);
  const link = t.link ? `<a href="${escapeHtml(t.link)}">${titulo}</a>` : titulo;
  const meta = [escapeHtml(t.projetoNome ?? t.projetoId ?? 'sem projeto'), formatarPrazo(t.prazo, tz), i.app ? null : 'sem ambiente: configuro ao iniciar']
    .filter(Boolean)
    .join(' · ');
  return `${i.idx}. ${link}\n<i>${meta}</i>`;
}

// Um bloco (mensagem) por empresa, com as tasks numeradas na ordem de exibição.
export function montarResumo(r: ResultadoBusca, cat: Catalogo, tz: string, rotulo = 'Suas tasks'): BlocoEmpresa[] {
  let idx = 0;
  return EMPRESAS.map(({ empresa, nome, ferramenta }) => {
    const doGrupo = r.tasks.filter((t) => t.empresa === empresa);
    const itens: ItemResumo[] = [];
    const corpo: string[] = [];
    const erro = r.erros.find((e) => (empresa === 'funifier' ? e.ferramenta === 'funifier-pm' : e.ferramenta === 'bnexo'));
    if (erro) corpo.push(`⚠️ Não consegui buscar: ${escapeHtml(erro.erro)}`);
    for (const g of GRUPOS) {
      const ts = doGrupo
        .filter((t) => t.categoria === g.categoria)
        .sort((a, b) => (a.prazo ?? '9999').localeCompare(b.prazo ?? '9999'));
      if (!ts.length) continue;
      const doG = ts.map((task) => ({ idx: ++idx, task, app: appSugerido(task, cat) }));
      itens.push(...doG);
      corpo.push(`<b>${g.titulo} (${ts.length})</b>\n\n${doG.map((i) => linhaTask(i, tz)).join('\n\n')}`);
    }
    if (!erro && doGrupo.length === 0) corpo.push('Nenhuma task aberta.');
    const n = doGrupo.length;
    const texto = [`📋 <b>${nome}</b>\n<i>${rotulo} · ${ferramenta} · ${n} task${n === 1 ? '' : 's'}</i>`, ...corpo].join('\n\n');
    return { empresa, texto, itens };
  });
}

// Telegram limita mensagens a 4096 caracteres; quebra por linhas.
export function dividirMensagem(texto: string, max = 4000): string[] {
  if (texto.length <= max) return [texto];
  const out: string[] = [];
  let atual = '';
  for (const linha of texto.split('\n')) {
    if (atual.length + linha.length + 1 > max) {
      out.push(atual);
      atual = '';
    }
    atual += (atual ? '\n' : '') + linha;
  }
  if (atual) out.push(atual);
  return out;
}
