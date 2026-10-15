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
const REPETIR_AVISO_MS = 30 * 60_000; // avisos de fila (antes do despacho)
const ESPERA_SESSAO_NOVA_MS = 120_000;

export type EstadoSessao = 'ocioso' | 'ocupado' | 'aguardando' | 'limite';

// Classificação pela tela do Claude Code (+ estado do agente no Orca, quando houver).
export function classificarTela(telaInteira: string, estadoAgente?: string): EstadoSessao {
  // Os sinais (spinner, diálogos, limite, rodapé) ficam no fim da tela; o meio é conversa e pode citar qualquer texto.
  const tela = telaInteira
    .split('\n')
    .filter((l) => l.trim())
    .slice(-14)
    .join('\n');
  // Mensagem do Claude Code no começo da linha (ex.: "Claude usage limit reached…", "5-hour limit reached ∙ resets 3pm").
  if (/^[\s⎿●⏺]*(Claude )?(AI )?(usage limit reached|(5-hour|weekly|Opus) limit reached|You'?ve hit your (usage )?limit)/im.test(tela))
    return 'limite';
  // Diálogo explícito (pergunta/permissão/confiança na pasta) tem prioridade sobre "working".
  if (/Do you want to|Would you like to|Esc to cancel|Enter to (select|confirm)|trust the files|Yes, proceed|\(y\/n\)/i.test(tela))
    return 'aguardando';
  // Trabalhando: spinner, agente "working" no Orca, ou comando em segundo plano que vai acordar o Claude.
  if (/esc to interrupt/i.test(tela) || estadoAgente === 'working' || /\d+ shells? still running|· \d+ shells? ·/i.test(tela))
    return 'ocupado';
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

function dormir(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Últimas linhas úteis da tela (sem a caixa de entrada e o rodapé do Claude Code).
export function ultimasLinhas(tela: string, n = 14) {
  return tela
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() && !/^[─━]{5,}/.test(l.trim()) && !/^\s*⏵⏵|for shortcuts|shift\+tab/.test(l))
    .slice(-n)
    .map((l) => (l.length > 110 ? l.slice(0, 109) + '…' : l))
    .join('\n');
}

export function textoComentario(r: Record<string, string>) {
  return [
    '🤖 Hub de automação (Claude Code)',
    `Resultado: ${r.status}`,
    `Resumo: ${r.resumo ?? '-'}`,
    `Branch/PR: ${r.branch ?? '-'}`,
    `Arquivos: ${r.arquivos ?? '-'}`,
    `Pendências: ${r.pendencias ?? 'nenhuma'}`,
  ].join('\n');
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
      this.retomarMonitores();
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

  // Estado de um terminal específico: tela + estado do agente no Orca (via pasta → tabId:leafId).
  private async estadoDoHandle(handle: string, pasta?: string): Promise<{ estado: EstadoSessao; tela: string }> {
    const tela = (await this.orca.readScreen(handle, 60)).join('\n');
    let estadoAgente: string | undefined;
    if (pasta) {
      const t = (await this.orca.listTerminals(pasta).catch(() => [])).find((x) => x.handle === handle);
      if (t) estadoAgente = (await this.orca.agentStates().catch(() => new Map<string, string>())).get(`${t.tabId}:${t.leafId}`);
    }
    return { estado: classificarTela(tela, estadoAgente), tela };
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
    if ((await this.estadoDoHandle(alvo.handle, app.pasta)).estado !== 'ocioso') {
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

    // 4. Acompanhamento até o RESULTADO HUB.
    this.monitorar(despachoId);
  }

  private async abrirSessao(app: App, sel: Selecao, titulo: string): Promise<OrcaTerminal | null> {
    const base = app.sessao_resume_id
      ? `claude --resume ${app.sessao_resume_id}`
      : temSessaoAnterior(app.pasta)
        ? 'claude -c'
        : 'claude';
    const comando = `${base} --permission-mode ${this.env.HUB_CLAUDE_PERMISSAO}`;
    if (!/^claude( -c| --resume [A-Za-z0-9-]+)? --permission-mode [A-Za-z]+$/.test(comando)) throw new Error(`comando inesperado: ${comando}`);
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

  // ─────────────────────────── acompanhamento (Fase 6) ───────────────────────────
  //
  // Um laço por despacho ativo: `orca terminal wait --for tui-idle` (timeout 60 s) + leitura da tela.
  //   ocupado                      → em_execucao
  //   ocioso com RESULTADO HUB     → fechamento (Orca em revisão, ferramenta de gestão, Telegram, fila)
  //   ocioso sem bloco / pergunta  → aguardando_joao (aviso com as últimas linhas, no máx. 1 a cada 15 min)
  //   limite de uso                → pausado_limite (aviso para trocar de conta)
  //   terminal sumiu               → redescobre pela pasta; se não achar, interrompido

  private monitorados = new Set<number>();
  private falhasTerminal = new Map<number, number>();

  private retomarMonitores() {
    const ativos = this.db
      .prepare("SELECT id FROM despachos WHERE estado IN ('em_execucao','aguardando_joao','pausado_limite')")
      .all() as { id: number }[];
    for (const { id } of ativos) this.monitorar(id);
  }

  private monitorar(despachoId: number) {
    if (this.monitorados.has(despachoId)) return;
    this.monitorados.add(despachoId);
    log.info('monitor: iniciado', { despachoId });
    void this.laco(despachoId)
      .catch((e) => log.error('monitor: laço abortado', { despachoId, ...errInfo(e) }))
      .finally(() => this.monitorados.delete(despachoId));
  }

  private getDespacho(id: number) {
    return this.db.prepare('SELECT * FROM despachos WHERE id = ?').get(id) as (Despacho & { estado: string }) | undefined;
  }

  private async laco(id: number) {
    await dormir(20_000); // dá tempo do Claude começar
    for (;;) {
      const d = this.getDespacho(id);
      if (!d || !['em_execucao', 'aguardando_joao', 'pausado_limite'].includes(d.estado)) return;

      let leitura: { estado: EstadoSessao; tela: string };
      try {
        if (!d.terminal_handle) throw new OrcaError('despacho sem terminal');
        // Lê antes de esperar: um terminal fechado falha na hora, sem gastar o timeout do wait.
        leitura = await this.estadoDoHandle(d.terminal_handle, d.pasta);
        let ficouOcioso = false;
        if (leitura.estado === 'ocupado') {
          ficouOcioso = await this.orca.waitIdle(d.terminal_handle, 60_000);
          leitura = await this.estadoDoHandle(d.terminal_handle, d.pasta);
        }
        this.falhasTerminal.delete(id);
        if (leitura.estado === 'ocupado') {
          this.mudarEstado(d, 'em_execucao');
          if (ficouOcioso) await dormir(5_000); // TUI parado mas ainda trabalhando: evita laço apertado
          continue;
        }
      } catch (e) {
        if (!(e instanceof OrcaError)) throw e;
        const r = await this.redescobrir(d);
        if (r === 'interrompido') return;
        await dormir(r === 'ok' ? 1_000 : 30_000);
        continue;
      }

      const resultado = leitura.estado === 'ocioso' ? extrairResultado(leitura.tela, d.selecao_id) : null;
      if (resultado) {
        await this.concluir(d, resultado);
        void this.processar(); // libera a fila do app
        return;
      }

      const titulo = this.tituloDe(this.getSelecaoDe(d));
      if (leitura.estado === 'limite') {
        this.mudarEstado(d, 'pausado_limite');
        await this.avisarDespacho(
          d,
          'limite',
          `⏸️ <b>${escapeHtml(titulo)}</b> está pausada em <b>${escapeHtml(d.app)}</b>: a conta do Claude atingiu o limite de uso.\nTroque de conta no Orca; o hub continua sozinho quando a sessão voltar a trabalhar.`,
        );
        await dormir(60_000);
      } else {
        this.mudarEstado(d, 'aguardando_joao');
        await this.avisarDespacho(
          d,
          'joao',
          `🙋 <b>${escapeHtml(titulo)}</b> precisa de você no Orca (<b>${escapeHtml(d.app)}</b>):\n<pre>${escapeHtml(ultimasLinhas(leitura.tela))}</pre>`,
        );
        await dormir(30_000);
      }
    }
  }

  private mudarEstado(d: Despacho & { estado: string }, estado: string) {
    if (d.estado === estado) return;
    // Voltou a trabalhar: o próximo pedido de atenção é um aviso novo.
    const limpaAviso = estado === 'em_execucao';
    this.db
      .prepare(
        `UPDATE despachos SET estado = ?, atualizado_em = ?${limpaAviso ? ', aviso_motivo = NULL, ultimo_aviso_em = NULL' : ''} WHERE id = ?`,
      )
      .run(estado, new Date().toISOString(), d.id);
    log.info('monitor: estado', { despachoId: d.id, de: d.estado, para: estado });
    d.estado = estado;
  }

  private async avisarDespacho(d: Despacho, motivo: string, html: string) {
    const atual = this.db.prepare('SELECT aviso_motivo, ultimo_aviso_em FROM despachos WHERE id = ?').get(d.id) as {
      aviso_motivo: string | null;
      ultimo_aviso_em: string | null;
    };
    const recente = atual.ultimo_aviso_em && Date.now() - Date.parse(atual.ultimo_aviso_em) < 15 * 60_000;
    if (atual.aviso_motivo === motivo && recente) return;
    this.db.prepare('UPDATE despachos SET aviso_motivo = ?, ultimo_aviso_em = ? WHERE id = ?').run(motivo, new Date().toISOString(), d.id);
    await this.enviar(html);
  }

  // O handle mudou (Orca reiniciou) ou o terminal fechou.
  private async redescobrir(d: Despacho & { estado: string }): Promise<'ok' | 'esperar' | 'interrompido'> {
    const orcaOk = await this.orca
      .status()
      .then((s) => s.ok)
      .catch(() => false);
    if (!orcaOk) return 'esperar'; // Orca fechado/reiniciando: não conclui nada ainda

    const sessoes = await this.sessoesClaude(d.pasta).catch(() => []);
    let achado = sessoes.length === 1 ? sessoes[0].term : null;
    if (sessoes.length > 1) {
      for (const s of sessoes) {
        const tela = (await this.orca.readScreen(s.term.handle, 60).catch(() => [])).join('\n');
        if (tela.includes(`runs/${d.selecao_id}.md`) || tela.includes(`task: #${d.selecao_id}`)) achado = s.term;
      }
    }
    if (achado) {
      this.db.prepare('UPDATE despachos SET terminal_handle = ?, atualizado_em = ? WHERE id = ?').run(achado.handle, new Date().toISOString(), d.id);
      log.info('monitor: terminal redescoberto', { despachoId: d.id, handle: achado.handle });
      return 'ok';
    }

    // Dá uma segunda chance (o Orca pode estar restaurando os terminais).
    const falhas = (this.falhasTerminal.get(d.id) ?? 0) + 1;
    this.falhasTerminal.set(d.id, falhas);
    if (falhas < 3) return 'esperar';

    const sel = this.getSelecaoDe(d);
    const titulo = this.tituloDe(sel);
    const agora = new Date().toISOString();
    this.db.transaction(() => {
      this.db.prepare("UPDATE despachos SET estado = 'interrompido', atualizado_em = ? WHERE id = ?").run(agora, d.id);
      this.db.prepare("UPDATE selecoes SET estado = 'interrompida', atualizado_em = ? WHERE id = ?").run(agora, sel.id);
      this.db
        .prepare("INSERT INTO historico (ferramenta, task_id, titulo, app, status_final, criado_em) VALUES (?, ?, ?, ?, 'interrompido', ?)")
        .run(sel.ferramenta, sel.task_id, titulo, d.app, agora);
    })();
    this.falhasTerminal.delete(d.id);
    log.warn('monitor: despacho interrompido', { despachoId: d.id });
    await this.enviar(
      `💥 <b>${escapeHtml(titulo)}</b> foi <b>interrompida</b>: o terminal do Claude em ${escapeHtml(d.app)} sumiu (o Orca reiniciou ou a aba foi fechada).\nVeja o que ficou feito na branch e selecione a task de novo se precisar.`,
    );
    void this.processar();
    return 'interrompido';
  }

  private getSelecaoDe(d: Despacho) {
    return this.db.prepare('SELECT * FROM selecoes WHERE id = ?').get(d.selecao_id) as Selecao;
  }

  private async concluir(d: Despacho, r: Record<string, string>) {
    const sel = this.getSelecaoDe(d);
    const titulo = this.tituloDe(sel);
    const link = (
      this.db.prepare('SELECT link FROM tasks_vistas WHERE ferramenta = ? AND task_id = ?').get(sel.ferramenta, sel.task_id) as
        | { link: string | null }
        | undefined
    )?.link;
    const notas: string[] = [];

    // 1. Orca: worktree "em revisão" com o resumo.
    try {
      await this.orca.setWorktreeStatus(d.pasta, 'in-review', `hub #${sel.id} (${r.status}): ${r.resumo ?? ''}`.slice(0, 500));
      notas.push('🟣 Orca: worktree em revisão');
    } catch (e) {
      notas.push(`⚠️ Orca: não marquei em revisão (${escapeHtml((e as Error).message)})`);
      log.warn('fechamento: falha no Orca', { despachoId: d.id, ...errInfo(e) });
    }

    // 2. Ferramenta de gestão: status "em revisão" (NUNCA "concluída") + comentário com o resultado.
    if (sel.ferramenta !== 'teste') {
      const adapter = this.adapters.find((a) => a.nome === sel.ferramenta);
      try {
        if (!adapter) throw new Error(`sem adaptador para ${sel.ferramenta}`);
        await adapter.comment(sel.task_id, textoComentario(r));
        if (r.status !== 'bloqueado') {
          await adapter.setStatus(sel.task_id, 'em_revisao');
          notas.push('📋 Task movida para "em revisão" e comentada');
        } else notas.push('📋 Task comentada (status mantido: bloqueada)');
      } catch (e) {
        const bloqueada = (e as Error).name === 'EscritaBloqueadaError';
        notas.push(bloqueada ? '🔒 Ferramenta de gestão não atualizada (escrita desligada)' : `⚠️ Ferramenta de gestão: ${escapeHtml((e as Error).message)}`);
        log.warn('fechamento: ferramenta de gestão', { despachoId: d.id, ...errInfo(e) });
      }
    }

    // 3. Banco + histórico.
    const agora = new Date().toISOString();
    this.db.transaction(() => {
      this.db.prepare("UPDATE despachos SET estado = 'concluido', resultado = ?, atualizado_em = ? WHERE id = ?").run(JSON.stringify(r), agora, d.id);
      this.db.prepare("UPDATE selecoes SET estado = 'finalizada', atualizado_em = ? WHERE id = ?").run(agora, sel.id);
      this.db
        .prepare('INSERT INTO historico (ferramenta, task_id, titulo, app, status_final, resumo, branch, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(sel.ferramenta, sel.task_id, titulo, d.app, r.status, r.resumo ?? null, r.branch ?? null, agora);
    })();
    log.info('fechamento: concluído', { despachoId: d.id, status: r.status });

    // 4. Telegram.
    const icone = r.status === 'concluido' ? '✅' : r.status === 'bloqueado' ? '⛔' : '🔍';
    const nome = link ? `<a href="${escapeHtml(link)}">${escapeHtml(titulo)}</a>` : escapeHtml(titulo);
    const linhas = [`${icone} <b>${nome}</b> — ${escapeHtml(d.app)}: <b>${escapeHtml(r.status)}</b>`, '', escapeHtml(r.resumo ?? '')];
    if (r.arquivos) linhas.push(`📄 ${escapeHtml(r.arquivos)}`);
    if (r.branch) linhas.push(`🌿 ${escapeHtml(r.branch)}`);
    if (r.pendencias && !/^nenhuma/i.test(r.pendencias)) linhas.push(`📌 ${escapeHtml(r.pendencias)}`);
    linhas.push('', ...notas);
    await this.enviar(linhas.join('\n'));
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
