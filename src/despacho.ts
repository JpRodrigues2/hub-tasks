// Fase 5 — despacho para a sessão do Claude Code no Orca, uma task por vez por app.
//
// Ciclo (a cada 30 s e logo após cada "Despachar"):
//   1. despachos em execução: se a tela mostra "### RESULTADO HUB" com o Claude ocioso, libera o app
//      (o fechamento completo — status na ferramenta, Orca "em revisão", resumo — é a Fase 6);
//   2. para cada app com fila e sem despacho ativo: acha a sessão do Claude pela pasta, e
//      se estiver ociosa manda UMA linha apontando para runs/<id>.md; senão avisa e espera.
import { InlineKeyboard, type Api } from 'grammy';
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadCatalogo, type App, type Env, type Gamificacao } from './config.js';
import { getMeta, setMeta, type DB } from './db.js';
import { errInfo, log } from './logger.js';
import { OrcaError, type Orca, type OrcaTerminal } from './orca.js';
import type { PmAdapter, TaskDetalhe } from './pm/types.js';
import { baixarImagens, branchDe, escreverPrompt, escreverSeguimento, linhaDespacho, tagRodada } from './prompt.js';
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

export function extrairResultado(tela: string, tag: string): Record<string, string> | null {
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
  // Só vale o bloco desta task/rodada (a tela pode ainda mostrar o resultado de uma task ou rodada anterior).
  if (campos.task?.replace(/\s/g, '') !== `#${tag}`) return null;
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

export function textoComentario(r: Record<string, string>, rodada = 1) {
  return [
    `🤖 Hub de automação (Claude Code)${rodada > 1 ? ` — rodada ${rodada}` : ''}`,
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
  rodada: number;
  resultado: string | null;
  msg_fechamento: number | null;
  seguimento: string | null;
}

// Próximo passo pedido pelo João depois da conclusão.
interface Seguimento {
  tipo: 'instrucao' | 'pr';
  instrucao?: string;
  base?: string;
  remoto?: string | null;
  branch: string;
}

// Conversa curta depois da conclusão (guardada em meta.pos_conversa): esperando texto da instrução,
// a branch base do PR ou a confirmação do PR.
interface PosConversa {
  despachoId: number;
  tipo: 'instrucao' | 'pr_base' | 'pr_confirmar';
  msgId?: number;
  bases?: string[];
  base?: string;
  remoto?: string | null;
  branch?: string;
}

const BASES_PREFERIDAS = ['main', 'master', 'develop', 'development', 'dev', 'homolog', 'homologacao', 'staging', 'release'];

function git(pasta: string, args: string[]): Promise<string> {
  return new Promise((ok, falha) =>
    execFile('git', ['-C', pasta, ...args], { timeout: 15_000 }, (err, stdout) => (err ? falha(err) : ok(stdout.trim()))),
  );
}

async function branchesRemotas(pasta: string): Promise<string[]> {
  const out = await git(pasta, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin']).catch(() => '');
  return out
    .split('\n')
    .map((b) => b.replace(/^origin\//, ''))
    .filter((b) => b && b !== 'origin' && b !== 'HEAD');
}

// URL do origin sem credenciais embutidas (https://user:token@host/...).
async function remotoOrigin(pasta: string): Promise<string | null> {
  const url = await git(pasta, ['remote', 'get-url', 'origin']).catch(() => '');
  return url ? url.replace(/\/\/[^@/]+@/, '//') : null;
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

    // Continuação pedida pelo João (instrução/PR) passa na frente da fila: a sessão ainda tem o contexto.
    const seg = this.db
      .prepare("SELECT * FROM despachos WHERE app = ? AND estado = 'seguimento_fila' ORDER BY atualizado_em LIMIT 1")
      .get(nomeApp) as (Despacho & { estado: string }) | undefined;
    if (seg) return this.enviarSeguimento(seg);

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

    // 1–2. Sessão do Claude ociosa nessa pasta (ou abre uma).
    const alvo = await this.sessaoOciosa(app, sel, titulo);
    if (!alvo) return;

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

  // Sessão do Claude ociosa na pasta (preferindo `preferida`); se não houver nenhuma, abre uma. null = avisou e espera.
  private async sessaoOciosa(app: App, sel: Selecao, titulo: string, preferida?: string | null): Promise<OrcaTerminal | null> {
    const sessoes = await this.sessoesClaude(app.pasta);
    const ociosas = sessoes.filter((s) => s.estado === 'ocioso');
    const alvo = (ociosas.find((s) => s.term.handle === preferida) ?? ociosas[0])?.term;
    if (alvo) return alvo;
    if (sessoes.length) {
      const e = sessoes[0].estado;
      const motivo =
        e === 'limite' ? 'a conta do Claude atingiu o limite de uso' : e === 'aguardando' ? 'a sessão está esperando você' : 'a sessão está ocupada';
      await this.avisar(sel, `fila_${e}`, `⏳ <b>${escapeHtml(titulo)}</b> está na fila de <b>${escapeHtml(app.app)}</b>: ${motivo} no Orca.`);
      return null;
    }
    return this.abrirSessao(app, sel, titulo);
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

      const resultado = leitura.estado === 'ocioso' ? extrairResultado(leitura.tela, tagRodada(d.selecao_id, d.rodada)) : null;
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
        const tag = tagRodada(d.selecao_id, d.rodada);
        if (new RegExp(`runs/${d.selecao_id}(-\\d+)?\\.md|task: #${tag.replace('.', '\\.')}\\b`).test(tela)) achado = s.term;
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
        await adapter.comment(sel.task_id, textoComentario(r, d.rodada));
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
    const rodada = d.rodada > 1 ? ` (rodada ${d.rodada})` : '';
    const linhas = [`${icone} <b>${nome}</b>${rodada} — ${escapeHtml(d.app)}: <b>${escapeHtml(r.status)}</b>`, '', escapeHtml(r.resumo ?? '')];
    if (r.arquivos) linhas.push(`📄 ${escapeHtml(r.arquivos)}`);
    if (r.branch) linhas.push(`🌿 ${escapeHtml(r.branch)}`);
    if (r.pendencias && !/^nenhuma/i.test(r.pendencias)) linhas.push(`📌 ${escapeHtml(r.pendencias)}`);
    linhas.push('', ...notas);
    linhas.push(
      '',
      '<b>Próximos passos:</b> revise a branch no Orca e escolha abaixo — mandar outra instrução para a mesma sessão, abrir o PR (eu pergunto a branch de destino) ou encerrar.',
    );
    const kb = new InlineKeyboard()
      .text('💬 Dar instrução', `f:${d.id}:i`)
      .text('🔀 Abrir PR', `f:${d.id}:pr`)
      .row()
      .text('✅ Encerrar', `f:${d.id}:x`);
    const m = await this.api
      .sendMessage(this.chatId, linhas.join('\n'), { ...HTML, reply_markup: kb })
      .catch((e) => log.error('despacho: falha no Telegram', errInfo(e)));
    if (m) this.db.prepare('UPDATE despachos SET msg_fechamento = ? WHERE id = ?').run(m.message_id, d.id);
  }

  // ─────────────────────────── próximos passos (depois da conclusão) ───────────────────────────
  //
  // callback_data  f:<despacho>:i | pr | x | b:<idx> | ok | no
  //   💬 i  → espera um texto do João e manda como continuação para a mesma sessão (rodada N+1)
  //   🔀 pr → pergunta a branch base, mostra repositório/branch/base para confirmar, e pede o PR ao Claude
  //   ✅ x  → encerra o ciclo

  private conversa(): PosConversa | null {
    const v = getMeta(this.db, 'pos_conversa');
    return v ? (JSON.parse(v) as PosConversa) : null;
  }

  private async setConversa(c: PosConversa | null) {
    const atual = this.conversa();
    if (atual?.msgId && atual.msgId !== c?.msgId) await this.api.editMessageReplyMarkup(this.chatId, atual.msgId).catch(() => {});
    setMeta(this.db, 'pos_conversa', c ? JSON.stringify(c) : '');
  }

  private tecladoFechamento(id: number) {
    return new InlineKeyboard().text('💬 Dar instrução', `f:${id}:i`).text('🔀 Abrir PR', `f:${id}:pr`).row().text('✅ Encerrar', `f:${id}:x`);
  }

  // Branch de trabalho da task: a última citada nos resultados (que não seja URL de PR) ou a padrão do hub.
  private branchDaTask(d: Despacho, sel: Selecao): string {
    const resultados = [d.resultado, ...(
      this.db
        .prepare('SELECT branch FROM historico WHERE ferramenta = ? AND task_id = ? AND branch IS NOT NULL ORDER BY id DESC')
        .all(sel.ferramenta, sel.task_id) as { branch: string }[]
    ).map((h) => JSON.stringify({ branch: h.branch }))];
    for (const r of resultados) {
      const b = r ? ((JSON.parse(r) as Record<string, string>).branch ?? '') : '';
      const nome = b.split(/[\s,]+/).find((t) => t && !t.includes('://') && /^[\w./-]+$/.test(t));
      if (nome) return nome;
    }
    return branchDe(sel.id, this.tituloDe(sel));
  }

  // /continuar: reenvia os botões de próximos passos das últimas tasks concluídas.
  async listarConcluidos() {
    const ds = this.db
      .prepare("SELECT * FROM despachos WHERE estado = 'concluido' ORDER BY atualizado_em DESC LIMIT 5")
      .all() as (Despacho & { estado: string })[];
    if (!ds.length) return this.enviar('Nenhuma task concluída para continuar.');
    for (const d of ds) {
      const sel = this.getSelecaoDe(d);
      const r = JSON.parse(d.resultado ?? '{}') as Record<string, string>;
      if (d.msg_fechamento) await this.api.editMessageReplyMarkup(this.chatId, d.msg_fechamento).catch(() => {});
      const m = await this.api.sendMessage(
        this.chatId,
        `<b>${escapeHtml(this.tituloDe(sel))}</b> — ${escapeHtml(d.app)}: <b>${escapeHtml(r.status ?? '?')}</b>\n🌿 ${escapeHtml(this.branchDaTask(d, sel))}`,
        { ...HTML, reply_markup: this.tecladoFechamento(d.id) },
      );
      this.db.prepare('UPDATE despachos SET msg_fechamento = ? WHERE id = ?').run(m.message_id, d.id);
    }
  }

  // Retorna o texto para o answerCallbackQuery.
  async onBotao(despachoId: number, acao: string, arg: string | undefined, msgId: number): Promise<string> {
    const d = this.getDespacho(despachoId);
    if (!d) return 'Despacho não encontrado.';
    const sel = this.getSelecaoDe(d);
    const titulo = this.tituloDe(sel);
    const conv = this.conversa();

    if (acao === 'i' || acao === 'pr' || acao === 'x') {
      if (d.estado !== 'concluido' || d.msg_fechamento !== msgId) return 'Esses botões já foram usados.';
      await this.api.editMessageReplyMarkup(this.chatId, msgId).catch(() => {});
      if (acao === 'x') {
        await this.setConversa(conv?.despachoId === d.id ? null : conv);
        this.db.prepare('UPDATE despachos SET msg_fechamento = NULL WHERE id = ?').run(d.id);
        await this.enviar(`✅ <b>${escapeHtml(titulo)}</b>: ciclo encerrado.`);
        return 'Encerrado';
      }
      const kbCancelar = new InlineKeyboard().text('✖ Cancelar', `f:${d.id}:no`);
      if (acao === 'i') {
        const m = await this.api.sendMessage(
          this.chatId,
          `💬 Mande a instrução para <b>${escapeHtml(titulo)}</b> numa mensagem de texto.
Ela vai para a sessão do Claude em <b>${escapeHtml(d.app)}</b>, e eu acompanho até o novo resultado.`,
          { ...HTML, reply_markup: kbCancelar },
        );
        await this.setConversa({ despachoId: d.id, tipo: 'instrucao', msgId: m.message_id });
        return 'Mande a instrução';
      }
      const remotas = await branchesRemotas(d.pasta);
      const bases = BASES_PREFERIDAS.filter((b) => remotas.includes(b));
      const kb = new InlineKeyboard();
      bases.forEach((b, i) => {
        kb.text(b, `f:${d.id}:b:${i}`);
        if (i % 3 === 2) kb.row();
      });
      kb.row().text('✖ Cancelar', `f:${d.id}:no`);
      const m = await this.api.sendMessage(
        this.chatId,
        `🔀 Para qual branch o PR de <b>${escapeHtml(titulo)}</b> deve ir?
` +
          (bases.length ? 'Toque numa das opções ou escreva o nome da branch.' : 'Escreva o nome da branch base (não achei as usuais no origin).'),
        { ...HTML, reply_markup: kb },
      );
      await this.setConversa({ despachoId: d.id, tipo: 'pr_base', msgId: m.message_id, bases });
      return 'Escolha a branch base';
    }

    if (!conv || conv.despachoId !== d.id || conv.msgId !== msgId) return 'Essa pergunta já foi respondida.';
    if (acao === 'no') {
      await this.setConversa(null);
      if (d.estado === 'concluido' && d.msg_fechamento)
        await this.api.editMessageReplyMarkup(this.chatId, d.msg_fechamento, { reply_markup: this.tecladoFechamento(d.id) }).catch(() => {});
      await this.enviar('✖ Cancelado. Os botões de próximos passos voltaram na mensagem do resultado.');
      return 'Cancelado';
    }
    if (acao === 'b' && conv.tipo === 'pr_base') {
      const base = conv.bases?.[Number(arg)];
      if (!base) return 'Opção inválida.';
      await this.confirmarPr(d, sel, base);
      return base;
    }
    if (acao === 'ok' && conv.tipo === 'pr_confirmar') {
      await this.enfileirarSeguimento(d, { tipo: 'pr', base: conv.base, remoto: conv.remoto, branch: conv.branch! });
      return 'PR pedido';
    }
    return 'Essa pergunta já foi respondida.';
  }

  // Texto livre do João: só vale quando há uma conversa de próximos passos aberta.
  async onTexto(texto: string): Promise<boolean> {
    const conv = this.conversa();
    if (!conv) return false;
    const d = this.getDespacho(conv.despachoId);
    if (!d || d.estado !== 'concluido') {
      await this.setConversa(null);
      return false;
    }
    const t = texto.trim();
    if (conv.tipo === 'instrucao') {
      await this.enfileirarSeguimento(d, { tipo: 'instrucao', instrucao: t, branch: this.branchDaTask(d, this.getSelecaoDe(d)) });
      return true;
    }
    if (conv.tipo === 'pr_base') {
      if (!/^[\w./-]{1,100}$/.test(t) || t.startsWith('-')) {
        await this.enviar('Nome de branch inválido. Escreva só o nome (ex.: <code>develop</code>).');
        return true;
      }
      const remotas = await branchesRemotas(d.pasta);
      if (remotas.length && !remotas.includes(t)) {
        await this.enviar(`Não achei <code>${escapeHtml(t)}</code> no origin de ${escapeHtml(d.app)}. Confira o nome e mande de novo.`);
        return true;
      }
      await this.confirmarPr(d, this.getSelecaoDe(d), t);
      return true;
    }
    await this.enviar('Toque em <b>Confirmar</b> ou <b>Cancelar</b> na mensagem do PR.');
    return true;
  }

  private async confirmarPr(d: Despacho, sel: Selecao, base: string) {
    const branch = this.branchDaTask(d, sel);
    const remoto = await remotoOrigin(d.pasta);
    const m = await this.api.sendMessage(
      this.chatId,
      [
        `🔀 <b>Confirme o PR</b> de <b>${escapeHtml(this.tituloDe(sel))}</b>:`,
        `📦 Repositório: <code>${escapeHtml(remoto ?? 'origin (URL não encontrada)')}</code>`,
        `🌿 De: <code>${escapeHtml(branch)}</code>`,
        `🎯 Para: <code>${escapeHtml(base)}</code>`,
        '',
        'O Claude vai fazer push da branch e abrir o PR (sem merge). O push pode pedir sua aprovação no Orca.',
      ].join('\n'),
      { ...HTML, reply_markup: new InlineKeyboard().text('✔ Confirmar', `f:${d.id}:ok`).text('✖ Cancelar', `f:${d.id}:no`) },
    );
    await this.setConversa({ despachoId: d.id, tipo: 'pr_confirmar', msgId: m.message_id, base, remoto, branch });
  }

  private async enfileirarSeguimento(d: Despacho, seg: Seguimento) {
    await this.setConversa(null);
    this.db
      .prepare("UPDATE despachos SET estado = 'seguimento_fila', seguimento = ?, atualizado_em = ? WHERE id = ? AND estado = 'concluido'")
      .run(JSON.stringify(seg), new Date().toISOString(), d.id);
    log.info('seguimento: enfileirado', { despachoId: d.id, tipo: seg.tipo });
    await this.enviar(
      `📥 ${seg.tipo === 'pr' ? 'Pedido de PR' : 'Instrução'} na fila de <b>${escapeHtml(d.app)}</b>; mando para a sessão assim que ela estiver livre.`,
    );
    void this.processar();
  }

  private async enviarSeguimento(d: Despacho & { estado: string }) {
    const sel = this.getSelecaoDe(d);
    const titulo = this.tituloDe(sel);
    const app = loadCatalogo().apps.find((a) => a.app === d.app);
    const seg = JSON.parse(d.seguimento ?? 'null') as Seguimento | null;
    if (!app || !seg) {
      this.db.prepare("UPDATE despachos SET estado = 'concluido', seguimento = NULL WHERE id = ?").run(d.id);
      return this.enviar(`⚠️ Não consegui continuar <b>${escapeHtml(titulo)}</b>: ${!app ? 'o app sumiu do apps.yaml' : 'pedido inválido'}.`);
    }
    const alvo = await this.sessaoOciosa(app, sel, titulo, d.terminal_handle);
    if (!alvo) return;

    const rodada = d.rodada + 1;
    const link = (
      this.db.prepare('SELECT link FROM tasks_vistas WHERE ferramenta = ? AND task_id = ?').get(sel.ferramenta, sel.task_id) as
        | { link: string | null }
        | undefined
    )?.link ?? null;
    const arquivo = escreverSeguimento({
      selecaoId: sel.id,
      rodada,
      titulo,
      link,
      app,
      anterior: JSON.parse(d.resultado ?? '{}'),
      ...seg,
    });

    if ((await this.estadoDoHandle(alvo.handle, app.pasta)).estado !== 'ocioso') {
      return this.avisar(sel, 'fila_ocupado', `⏳ A continuação de <b>${escapeHtml(titulo)}</b> espera: a sessão de ${escapeHtml(app.app)} ficou ocupada.`);
    }
    await this.orca.send(alvo.handle, linhaDespacho(arquivo));

    const agora = new Date().toISOString();
    this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE despachos SET estado = 'em_execucao', rodada = ?, run_file = ?, terminal_handle = ?, titulo_terminal = ?, seguimento = NULL,
             msg_fechamento = NULL, aviso_motivo = NULL, ultimo_aviso_em = NULL, atualizado_em = ? WHERE id = ?`,
        )
        .run(rodada, arquivo, alvo.handle, alvo.title, agora, d.id);
      this.db.prepare("UPDATE selecoes SET estado = 'despachada', atualizado_em = ? WHERE id = ?").run(agora, sel.id);
    })();
    log.info('seguimento: enviado', { despachoId: d.id, rodada, tipo: seg.tipo, terminal: alvo.handle });
    await this.enviar(
      `🚀 ${seg.tipo === 'pr' ? 'Pedido de PR' : 'Instrução'} enviado para <b>${escapeHtml(titulo)}</b> em <b>${escapeHtml(app.app)}</b> (rodada ${rodada}).
Prompt: <code>${escapeHtml(arquivo)}</code>`,
    );
    this.monitorar(d.id);
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
