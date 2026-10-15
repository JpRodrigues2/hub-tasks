// Fase 5 — despacho para a sessão do Claude Code no Orca, uma task por vez por app.
//
// Ciclo (a cada 30 s e logo após cada "Despachar"):
//   1. despachos em execução: se a tela mostra "### RESULTADO HUB" com o Claude ocioso, libera o app
//      (o fechamento completo — status na ferramenta, Orca "em revisão", resumo — é a Fase 6);
//   2. para cada app com fila e sem despacho ativo: acha a sessão do Claude pela pasta, e
//      se estiver ociosa manda UMA linha apontando para runs/<id>.md; senão avisa e espera.
import type { Api } from 'grammy';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadCatalogo, type App, type Env, type Gamificacao } from './config.js';
import type { DB } from './db.js';
import { errInfo, log } from './logger.js';
import { OrcaError, type Orca, type OrcaTerminal } from './orca.js';
import type { PmAdapter, TaskDetalhe } from './pm/types.js';
import { baixarImagens, escreverPrompt, linhaDespacho } from './prompt.js';
import { escapeHtml } from './resumo.js';

const HTML = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };
const REPETIR_AVISO_MS = 30 * 60_000;
const ESPERA_SESSAO_NOVA_MS = 120_000;

export type EstadoSessao = 'ocioso' | 'ocupado' | 'aguardando' | 'limite';

// Classificação pela tela do Claude Code (+ estado do agente no Orca, quando houver).
export function classificarTela(tela: string, estadoAgente?: string): EstadoSessao {
  if (/usage limit reached|hit your (usage )?limit|limit (will )?reset|5-hour limit/i.test(tela)) return 'limite';
  if (/esc to interrupt/i.test(tela) || estadoAgente === 'working') return 'ocupado';
  if (/Do you want to|Would you like to|Esc to cancel|Enter to (select|confirm)|trust the files|Yes, proceed|\(y\/n\)/i.test(tela))
    return 'aguardando';
  // Ocioso = caixa de entrada do Claude Code (❯ entre linhas ────). Só "❯" pode ser o prompt do zsh.
  if (/^\s*❯/m.test(tela) && /─{10,}/.test(tela)) return 'ocioso';
  return 'ocupado'; // desconhecido: conservador, não envia
}

export function extrairResultado(tela: string, selecaoId: number): Record<string, string> | null {
  // O Claude renderiza o markdown: "### RESULTADO HUB" aparece só como "RESULTADO HUB".
  const linhas = tela.split('\n');
  let inicio = -1;
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (/^[\s│⎿●⏺#]*RESULTADO HUB\s*$/.test(linhas[i])) {
      inicio = i;
      break;
    }
  }
  if (inicio < 0) return null;
  const campos: Record<string, string> = {};
  let atual: string | null = null;
  for (const bruta of linhas.slice(inicio + 1)) {
    const linha = bruta.replace(/^[\s│⎿●⏺]+/, '').trimEnd();
    if (!linha || /^[─✻❯]/.test(linha)) break; // fim do bloco: linha vazia, caixa de entrada ou rodapé
    const m = linha.match(/^(task|status|resumo|arquivos|branch|pendencias|pendências):\s*(.*)$/i);
    if (m) {
      atual = m[1].toLowerCase().replace('pendências', 'pendencias');
      campos[atual] = m[2].trim();
    } else if (atual) campos[atual] += ' ' + linha.trim(); // continuação de linha quebrada pelo terminal
  }
  // Ignora o próprio enunciado do formato ("concluido | bloqueado | …").
  if (!/^(concluido|bloqueado|precisa_revisao)$/.test(campos.status ?? '')) return null;
  // Só vale o bloco desta task (a tela pode ainda mostrar o resultado de uma task anterior).
  if (campos.task?.replace(/\s/g, '') !== `#${selecaoId}`) return null;
  return campos;
}

// Há sessão anterior do Claude nessa pasta? (para decidir entre `claude -c` e `claude`)
function temSessaoAnterior(pasta: string) {
  const dir = join(homedir(), '.claude', 'projects', pasta.replace(/[^a-zA-Z0-9]/g, '-'));
  return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.jsonl'));
}

interface Selecao {
  id: number;
  ferramenta: string;
  task_id: string;
  info_extra: string | null;
  app: string;
  gamificacoes: string | null;
  anexos: string | null;
  aviso_em: string | null;
  aviso_motivo: string | null;
}

interface Despacho {
  id: number;
  selecao_id: number;
  app: string;
  pasta: string;
  terminal_handle: string | null;
}

export class Despachante {
  private chatId: number;
  private rodando = false;

  constructor(
    private env: Env,
    private db: DB,
    private api: Api,
    private orca: Orca,
    private adapters: PmAdapter[],
  ) {
    this.chatId = Number(env.TELEGRAM_CHAT_ID);
  }

  enfileirar(selecaoId: number) {
    const s = this.db.prepare('SELECT app FROM selecoes WHERE id = ?').get(selecaoId) as { app: string } | undefined;
    if (!s) return;
    this.db
      .prepare('INSERT OR IGNORE INTO fila (app, selecao_id, criado_em) VALUES (?, ?, ?)')
      .run(s.app, selecaoId, new Date().toISOString());
    log.info('despacho: enfileirada', { selecaoId, app: s.app });
    void this.processar();
  }

  async processar() {
    if (this.rodando) return;
    this.rodando = true;
    try {
      await this.verificarEmExecucao();
      const apps = this.db.prepare('SELECT DISTINCT app FROM fila ORDER BY id').all() as { app: string }[];
      for (const { app } of apps) {
        try {
          await this.processarApp(app);
        } catch (e) {
          log.error('despacho: falha ao processar app', { app, ...errInfo(e) });
        }
      }
    } finally {
      this.rodando = false;
    }
  }

  // ─────────────────────────── sessões ───────────────────────────

  private async sessoesClaude(pasta: string) {
    const terms = (await this.orca.listTerminals(pasta)).filter((t) => t.agentIdentity === 'claude' && t.writable);
    if (!terms.length) return [];
    const estados = await this.orca.agentStates().catch(() => new Map<string, string>());
    const out: { term: OrcaTerminal; estado: EstadoSessao }[] = [];
    for (const term of terms) {
      const tela = (await this.orca.readScreen(term.handle, 40)).join('\n');
      out.push({ term, estado: classificarTela(tela, estados.get(`${term.tabId}:${term.leafId}`)) });
    }
    return out;
  }

  private async estadoDoHandle(handle: string): Promise<{ estado: EstadoSessao; tela: string }> {
    const tela = (await this.orca.readScreen(handle, 60)).join('\n');
    return { estado: classificarTela(tela), tela };
  }

  // ─────────────────────────── despacho ───────────────────────────

  private async processarApp(nomeApp: string) {
    const ativo = this.db
      .prepare("SELECT 1 FROM despachos WHERE app = ? AND estado IN ('em_execucao','aguardando_joao','pausado_limite')")
      .get(nomeApp);
    if (ativo) return;

    const fila = this.db.prepare('SELECT id, selecao_id FROM fila WHERE app = ? ORDER BY id LIMIT 1').get(nomeApp) as
      | { id: number; selecao_id: number }
      | undefined;
    if (!fila) return;
    const sel = this.db.prepare('SELECT * FROM selecoes WHERE id = ?').get(fila.selecao_id) as Selecao;
    const app = loadCatalogo().apps.find((a) => a.app === nomeApp);
    const titulo = this.tituloDe(sel);

    if (!app) {
      return this.avisar(sel, 'app_inexistente', `⚠️ <b>${escapeHtml(titulo)}</b>: o app "${escapeHtml(nomeApp)}" não existe mais no apps.yaml.`);
    }
    const gamifs = JSON.parse(sel.gamificacoes ?? '[]') as Gamificacao[];
    if (app.empresa === 'funifier' && !gamifs.length) {
      return this.avisar(
        sel,
        'sem_gamificacao',
        `⛔ <b>${escapeHtml(titulo)}</b> não foi despachada: o app <b>${escapeHtml(app.app)}</b> não tem gamificação autorizada.\nCadastre no apps.yaml e refaça a seleção.`,
      );
    }

    // 1. Sessão do Claude já aberta nessa pasta?
    const sessoes = await this.sessoesClaude(app.pasta);
    let alvo = sessoes.find((s) => s.estado === 'ocioso')?.term ?? null;
    if (!alvo && sessoes.length) {
      const e = sessoes[0].estado;
      const motivo =
        e === 'limite' ? 'a conta do Claude atingiu o limite de uso' : e === 'aguardando' ? 'a sessão está esperando você' : 'a sessão está ocupada';
      return this.avisar(sel, `fila_${e}`, `⏳ <b>${escapeHtml(titulo)}</b> está na fila de <b>${escapeHtml(app.app)}</b>: ${motivo} no Orca.`);
    }

    // 2. Nenhuma sessão: abre uma.
    if (!alvo) {
      alvo = await this.abrirSessao(app, sel, titulo);
      if (!alvo) return;
    }

    // 3. Monta o prompt e envia uma única linha.
    const task = await this.detalheDaTask(sel);
    const imagens = await baixarImagens(sel.id, task.imagens);
    const arquivo = escreverPrompt({
      selecaoId: sel.id,
      task,
      infoExtra: sel.info_extra,
      app,
      gamificacoes: gamifs,
      anexosJoao: JSON.parse(sel.anexos ?? '[]'),
      imagensDescricao: imagens,
    });

    // Confere de novo logo antes de enviar (o João pode ter começado a usar a sessão).
    if ((await this.estadoDoHandle(alvo.handle)).estado !== 'ocioso') {
      return this.avisar(sel, 'fila_ocupado', `⏳ <b>${escapeHtml(titulo)}</b> está na fila de <b>${escapeHtml(app.app)}</b>: a sessão ficou ocupada.`);
    }
    await this.orca.send(alvo.handle, linhaDespacho(arquivo));

    const agora = new Date().toISOString();
    const despachoId = this.db.transaction(() => {
      const id = Number(
        this.db
          .prepare(
            `INSERT INTO despachos (selecao_id, app, pasta, terminal_handle, titulo_terminal, run_file, estado, iniciado_em, atualizado_em)
             VALUES (?, ?, ?, ?, ?, ?, 'em_execucao', ?, ?)`,
          )
          .run(sel.id, app.app, app.pasta, alvo!.handle, alvo!.title, arquivo, agora, agora).lastInsertRowid,
      );
      this.db.prepare('DELETE FROM fila WHERE id = ?').run(fila.id);
      this.db.prepare("UPDATE selecoes SET estado = 'despachada', atualizado_em = ? WHERE id = ?").run(agora, sel.id);
      return id;
    })();
    log.info('despacho: enviado', { despachoId, selecaoId: sel.id, app: app.app, terminal: alvo.handle });
    await this.enviar(
      `🚀 <b>${escapeHtml(titulo)}</b> despachada para <b>${escapeHtml(app.app)}</b>${task.imagens.length || sel.anexos ? ' (com imagens/anexos)' : ''}.\nPrompt: <code>${escapeHtml(arquivo)}</code>`,
    );

    // 4. Confirma que o Claude começou.
    await new Promise((r) => setTimeout(r, 15_000));
    const depois = await this.estadoDoHandle(alvo.handle).catch(() => null);
    if (depois?.estado === 'aguardando')
      await this.enviar(`🙋 <b>${escapeHtml(titulo)}</b>: a sessão em ${escapeHtml(app.app)} está pedindo algo (provavelmente permissão para ler o arquivo da task).`);
    else if (depois?.estado === 'ocioso' && !/RESULTADO HUB/.test(depois.tela))
      await this.enviar(`⚠️ <b>${escapeHtml(titulo)}</b>: não vi o Claude começar em ${escapeHtml(app.app)}. Confira no Orca.`);
  }

  private async abrirSessao(app: App, sel: Selecao, titulo: string): Promise<OrcaTerminal | null> {
    const comando = app.sessao_resume_id
      ? `claude --resume ${app.sessao_resume_id}`
      : temSessaoAnterior(app.pasta)
        ? 'claude -c'
        : 'claude';
    if (!/^claude( -c| --resume [A-Za-z0-9-]+)?$/.test(comando)) throw new Error(`comando inesperado: ${comando}`);
    await this.enviar(`🖥️ Abrindo sessão do Claude em <b>${escapeHtml(app.app)}</b> (<code>${escapeHtml(comando)}</code>)…`);
    const handle = await this.orca.createTerminal(app.pasta, comando, `hub #${sel.id}`);
    log.info('despacho: sessão aberta', { app: app.app, handle, comando });

    const limite = Date.now() + ESPERA_SESSAO_NOVA_MS;
    let estado: EstadoSessao = 'ocupado';
    while (Date.now() < limite) {
      await this.orca.waitIdle(handle, 15_000).catch(() => false);
      estado = (await this.estadoDoHandle(handle)).estado;
      if (estado !== 'ocupado') break;
    }
    if (estado === 'ocioso') {
      const t = (await this.orca.listTerminals(app.pasta)).find((x) => x.handle === handle);
      return t ?? ({ handle, title: `hub #${sel.id}` } as OrcaTerminal);
    }
    await this.avisar(
      sel,
      `nova_sessao_${estado}`,
      estado === 'aguardando'
        ? `🙋 Abri o Claude em <b>${escapeHtml(app.app)}</b>, mas ele está pedindo algo (ex.: confiar na pasta). Responda no Orca; a task <b>${escapeHtml(titulo)}</b> segue na fila.`
        : `⚠️ Abri o Claude em <b>${escapeHtml(app.app)}</b>, mas ele não ficou pronto (${estado}). A task <b>${escapeHtml(titulo)}</b> segue na fila.`,
    );
    return null;
  }

  private async detalheDaTask(sel: Selecao): Promise<TaskDetalhe> {
    if (sel.ferramenta === 'teste') {
      const v = this.db.prepare("SELECT titulo FROM tasks_vistas WHERE ferramenta = 'teste' AND task_id = ?").get(sel.task_id) as {
        titulo: string;
      };
      return {
        ferramenta: 'bnexo',
        empresa: 'dac',
        id: sel.task_id,
        titulo: v.titulo,
        projetoId: null,
        projetoNome: 'sandbox (task fictícia)',
        status: 'teste',
        categoria: 'em_progresso',
        prazo: null,
        link: null,
        descricao: v.titulo,
        comentarios: [],
        imagens: [],
      };
    }
    const adapter = this.adapters.find((a) => a.nome === sel.ferramenta);
    if (!adapter) throw new Error(`sem adaptador para ${sel.ferramenta}`);
    return adapter.getTask(sel.task_id);
  }

  // ─────────────── em execução (mínimo para a fila andar; Fase 6 completa) ───────────────

  private async verificarEmExecucao() {
    const ativos = this.db.prepare("SELECT * FROM despachos WHERE estado = 'em_execucao'").all() as Despacho[];
    for (const d of ativos) {
      try {
        let handle = d.terminal_handle;
        let leitura = handle ? await this.estadoDoHandle(handle).catch((e) => (e instanceof OrcaError ? null : Promise.reject(e))) : null;
        if (!leitura) {
          // Orca reiniciou: redescobre pela pasta (só se houver exatamente uma sessão do Claude).
          const sessoes = await this.sessoesClaude(d.pasta);
          if (sessoes.length !== 1) continue; // Fase 6 trata "interrompido"
          handle = sessoes[0].term.handle;
          this.db.prepare('UPDATE despachos SET terminal_handle = ? WHERE id = ?').run(handle, d.id);
          leitura = await this.estadoDoHandle(handle);
        }
        if (leitura.estado !== 'ocioso') continue;
        const r = extrairResultado(leitura.tela, d.selecao_id);
        if (!r) continue;
        await this.concluir(d, r);
      } catch (e) {
        log.warn('despacho: falha ao verificar execução', { despachoId: d.id, ...errInfo(e) });
      }
    }
  }

  private async concluir(d: Despacho, r: Record<string, string>) {
    const sel = this.db.prepare('SELECT * FROM selecoes WHERE id = ?').get(d.selecao_id) as Selecao;
    const titulo = this.tituloDe(sel);
    const agora = new Date().toISOString();
    this.db.transaction(() => {
      this.db.prepare("UPDATE despachos SET estado = 'concluido', resultado = ?, atualizado_em = ? WHERE id = ?").run(JSON.stringify(r), agora, d.id);
      this.db.prepare("UPDATE selecoes SET estado = 'finalizada', atualizado_em = ? WHERE id = ?").run(agora, sel.id);
      this.db
        .prepare('INSERT INTO historico (ferramenta, task_id, titulo, app, status_final, resumo, branch, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(sel.ferramenta, sel.task_id, titulo, d.app, r.status, r.resumo ?? null, r.branch ?? null, agora);
    })();
    log.info('despacho: concluído', { despachoId: d.id, status: r.status });
    const icone = r.status === 'concluido' ? '✅' : r.status === 'bloqueado' ? '⛔' : '🔍';
    await this.enviar(
      `${icone} <b>${escapeHtml(titulo)}</b> terminou em ${escapeHtml(d.app)}: <b>${escapeHtml(r.status)}</b>\n${escapeHtml(r.resumo ?? '')}${
        r.branch ? `\n🌿 ${escapeHtml(r.branch)}` : ''
      }${r.pendencias && !/^nenhuma/i.test(r.pendencias) ? `\n📌 ${escapeHtml(r.pendencias)}` : ''}`,
    );
  }

  // ─────────────────────────── util ───────────────────────────

  private tituloDe(sel: Selecao) {
    const v = this.db.prepare('SELECT titulo FROM tasks_vistas WHERE ferramenta = ? AND task_id = ?').get(sel.ferramenta, sel.task_id) as
      | { titulo: string }
      | undefined;
    return v?.titulo ?? sel.task_id;
  }

  private async avisar(sel: Selecao, motivo: string, html: string) {
    const recente = sel.aviso_em && Date.now() - Date.parse(sel.aviso_em) < REPETIR_AVISO_MS;
    if (sel.aviso_motivo === motivo && recente) return;
    this.db.prepare('UPDATE selecoes SET aviso_em = ?, aviso_motivo = ? WHERE id = ?').run(new Date().toISOString(), motivo, sel.id);
    log.info('despacho: aviso', { selecaoId: sel.id, motivo });
    await this.enviar(html);
  }

  private async enviar(html: string) {
    await this.api.sendMessage(this.chatId, html, HTML).catch((e) => log.error('despacho: falha no Telegram', errInfo(e)));
  }
}
