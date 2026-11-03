// Fase 5 — despacho para a sessão do Claude Code no Orca, uma task por vez por app.
//
// Ciclo (a cada 30 s e logo após cada "Despachar"):
//   1. despachos em execução: se a tela mostra "### RESULTADO HUB" com o Claude ocioso, libera o app
//      (o fechamento completo — status na ferramenta, Orca "em revisão", resumo — é a Fase 6);
//   2. para cada app com fila e sem despacho ativo: acha a sessão do Claude pela pasta, e
//      se estiver ociosa manda UMA linha apontando para runs/<id>.md; senão avisa e espera.
import { InlineKeyboard, type Api } from 'grammy';
import { existsSync, readdirSync } from 'node:fs';
import { dirSessoesClaude } from './caminhos.js';
import { gitEm } from './git.js';
import { join } from 'node:path';
import { loadCatalogo, type App, type Env, type Gamificacao } from './config.js';
import { getMeta, setMeta, type DB } from './db.js';
import { errInfo, log } from './logger.js';
import { ErroExecutor, type Cofre, type Executor, type TerminalExecutor } from './aplicacao/portas.js';
import type { PmAdapter, TaskDetalhe } from './pm/types.js';
import { vincular, comVinculo } from './mensagens.js';
import { baixarImagens, dirAnexos, escreverPrompt, escreverSeguimento, linhaDespacho, type TaskDoPrompt } from './prompt.js';
import { classificarTela, extrairResultado, ultimasLinhas, type EstadoSessao } from './dominio/tela.js';
import { ESTADOS_ATIVOS, ativo, podeTransicionar, sqlLista, tagRodada, type EstadoDespacho } from './dominio/despacho.js';
import { ICONE, campo, cartao, curto, esc } from './msg.js';
import { escapeHtml } from './resumo.js';
import { apagarCredenciaisDaTask, escreverCredenciaisDaTask } from './segredos.js';

const HTML = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };
const REPETIR_AVISO_MS = 30 * 60_000; // avisos de fila (antes do despacho)
const ESPERA_SESSAO_NOVA_MS = 120_000;

// runs/12.md em vez do caminho absoluto, para caber na mensagem.
function relativo(arquivo: string) {
  const i = arquivo.lastIndexOf('/runs/');
  return i >= 0 ? arquivo.slice(i + 1) : arquivo;
}

function dormir(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Há sessão anterior do Claude nessa pasta? (para decidir entre `claude -c` e `claude`)
function temSessaoAnterior(pasta: string) {
  const dir = dirSessoesClaude(pasta);
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
  lote_de: number | null;
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

// Próximo passo pedido pelo usuário depois da conclusão.
interface Seguimento {
  tipo: 'instrucao' | 'pr';
  instrucao?: string;
  base?: string;
  remoto?: string | null;
  branch: string | null;
  novaBranch?: string;
}

// Ferramentas de gestão reais (avulsa e teste não têm task para atualizar).
const FERRAMENTA_REAL = new Set(['funifier-pm', 'bnexo']);
const NOME_FERRAMENTA: Record<string, string> = { 'funifier-pm': 'Funifier PM', bnexo: 'Bnexo' };

// Conversa curta depois da conclusão (guardada em meta.pos_conversa): esperando texto da instrução,
// a branch base do PR ou a confirmação do PR.
interface PosConversa {
  despachoId: number;
  tipo: 'instrucao' | 'pr_base' | 'pr_confirmar' | 'pr_branch' | 'encerrar';
  msgId?: number;
  bases?: string[];
  base?: string;
  remoto?: string | null;
  branch?: string | null;
  novaBranch?: string;
}

const BASES_PREFERIDAS = ['main', 'master', 'develop', 'development', 'dev', 'homolog', 'homologacao', 'staging', 'release'];

const git = gitEm;

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
    private orca: Executor,
    private cofre: Cofre,
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
      // Apps com task na fila ou com continuação (instrução/PR) esperando a sessão.
      const apps = this.db
        .prepare("SELECT app FROM fila UNION SELECT app FROM despachos WHERE estado = 'seguimento_fila'")
        .all() as { app: string }[];
      for (const { app } of apps) {
        try {
          await comVinculo({}, () => this.processarApp(app));
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
    const out: { term: TerminalExecutor; estado: EstadoSessao }[] = [];
    for (const term of terms) {
      const tela = (await this.orca.readScreen(term.handle, 40)).join('\n');
      out.push({ term, estado: classificarTela(tela, estados.get(`${term.tabId}:${term.leafId}`), true) });
    }
    return out;
  }

  // Estado de um terminal específico: tela + estado do agente no Orca (via pasta → tabId:leafId).
  private async estadoDoHandle(handle: string, pasta?: string, paraEnviar = false): Promise<{ estado: EstadoSessao; tela: string }> {
    const tela = (await this.orca.readScreen(handle, 60)).join('\n');
    let estadoAgente: string | undefined;
    if (pasta) {
      const t = (await this.orca.listTerminals(pasta).catch(() => [])).find((x) => x.handle === handle);
      if (t) estadoAgente = (await this.orca.agentStates().catch(() => new Map<string, string>())).get(`${t.tabId}:${t.leafId}`);
    }
    return { estado: classificarTela(tela, estadoAgente, paraEnviar), tela };
  }

  // ─────────────────────────── despacho ───────────────────────────

  private async processarApp(nomeApp: string) {
    const ativo = this.db
      .prepare(`SELECT 1 FROM despachos WHERE app = ? AND estado IN (${sqlLista(ESTADOS_ATIVOS)})`)
      .get(nomeApp);
    if (ativo) return;

    // Continuação pedida pelo usuário (instrução/PR) passa na frente da fila: a sessão ainda tem o contexto.
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
    vincular({ selecaoId: sel.id });

    if (!app) {
      return this.avisar(
        sel,
        'app_inexistente',
        cartao({ icone: ICONE.falha, titulo: this.tituloHtml(sel), contexto: [esc(nomeApp), 'app não existe mais no apps.yaml'] }),
      );
    }
    // Sem gamificação vinculada é permitido (o usuário já foi avisado na seleção): a sessão decide o alvo.
    const gamifs = JSON.parse(sel.gamificacoes ?? '[]') as Gamificacao[];

    // 1–2. Sessão do Claude ociosa nessa pasta (ou abre uma).
    const alvo = await this.sessaoOciosa(app, sel, titulo);
    if (!alvo) return;

    // 3. Monta o prompt (uma task ou o lote inteiro) e envia uma única linha.
    const lote = this.doLote(sel);
    const tasks: TaskDoPrompt[] = [];
    for (const [i, s] of lote.entries()) {
      const task = await this.detalheDaTask(s);
      tasks.push({ task, imagens: await baixarImagens(sel.id, task.imagens, lote.length > 1 ? `t${i + 1}-` : '') });
    }
    const credenciais = await escreverCredenciaisDaTask(this.cofre, sel.id, gamifs);
    const arquivo = escreverPrompt({
      credenciais,
      selecaoId: sel.id,
      tasks,
      avulsa: !FERRAMENTA_REAL.has(sel.ferramenta),
      infoExtra: sel.info_extra,
      app,
      gamificacoes: gamifs,
      anexosUsuario: JSON.parse(sel.anexos ?? '[]'),
    });

    // Confere de novo logo antes de enviar (o usuário pode ter começado a usar a sessão).
    if ((await this.estadoDoHandle(alvo.handle, app.pasta, true)).estado !== 'ocioso') {
      return this.avisar(sel, 'fila_ocupado', cartao({ icone: ICONE.fila, titulo: this.tituloHtml(sel), contexto: [esc(app.app), 'na fila: a sessão ficou ocupada'] }));
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
      this.db.prepare("UPDATE selecoes SET estado = 'despachada', atualizado_em = ? WHERE id = ? OR lote_de = ?").run(agora, sel.id, sel.id);
      return id;
    })();
    log.info('despacho: enviado', { despachoId, selecaoId: sel.id, app: app.app, terminal: alvo.handle, tasks: lote.length });
    // 4. Ferramenta de gestão: task "em progresso" (B01). Só status, nunca comentário.
    const status = await this.moverStatus(sel, 'em_progresso');
    const anexos = tasks.reduce((n, t) => n + t.task.imagens.length, 0) + (JSON.parse(sel.anexos ?? '[]') as string[]).length;
    await this.enviar(
      cartao({
        icone: ICONE.rodando,
        titulo: this.tituloHtml(sel),
        contexto: [esc(app.app), 'rodando', status],
        corpo: [campo('Prompt', `<code>${esc(relativo(arquivo))}</code>`), anexos ? campo('Anexos', String(anexos)) : null],
      }),
    );

    // 5. Acompanhamento até o RESULTADO HUB.
    this.monitorar(despachoId);
  }

  // Muda o status na ferramenta de gestão (de cada task do lote). Devolve um trecho para o contexto da mensagem
  // (null = sem ferramenta).
  private async moverStatus(sel: Selecao, status: 'em_progresso' | 'concluida'): Promise<string | null> {
    const reais = this.doLote(sel).filter((s) => FERRAMENTA_REAL.has(s.ferramenta));
    if (!reais.length) return null;
    const rotulo = status === 'concluida' ? 'concluída' : 'em progresso';
    const ok: string[] = [];
    const falhas: string[] = [];
    for (const s of reais) {
      const ferramenta = NOME_FERRAMENTA[s.ferramenta];
      try {
        const adapter = this.adapters.find((a) => a.nome === s.ferramenta);
        if (!adapter) throw new Error(`sem adaptador para ${s.ferramenta}`);
        await adapter.setStatus(s.task_id, status);
        log.info('ferramenta de gestão: status', { selecaoId: s.id, status });
        ok.push(ferramenta);
      } catch (e) {
        log.warn('ferramenta de gestão: falha ao mudar status', { selecaoId: s.id, status, ...errInfo(e) });
        const bloqueada = (e as Error).name === 'EscritaBloqueadaError';
        const quem = reais.length > 1 ? `${esc(curto(this.tituloDe(s), 30))} ` : '';
        falhas.push(`${ICONE.aviso} ${quem}${ferramenta} não mudou para ${rotulo} (${bloqueada ? 'escrita desligada' : esc(curto((e as Error).message, 80))})`);
      }
    }
    const ferramentas = [...new Set(ok)].join('/');
    const feito = ok.length ? `${ferramentas}: ${reais.length > 1 ? `${ok.length} ${status === 'concluida' ? 'concluídas' : 'em progresso'}` : rotulo}` : null;
    return [feito, ...falhas].filter(Boolean).join(' · ');
  }

  // Sessão do Claude ociosa na pasta (preferindo `preferida`); se não houver nenhuma, abre uma. null = avisou e espera.
  private async sessaoOciosa(app: App, sel: Selecao, titulo: string, preferida?: string | null): Promise<TerminalExecutor | null> {
    const sessoes = await this.sessoesClaude(app.pasta);
    const ociosas = sessoes.filter((s) => s.estado === 'ocioso');
    const alvo = (ociosas.find((s) => s.term.handle === preferida) ?? ociosas[0])?.term;
    if (alvo) return alvo;
    if (sessoes.length) {
      const e = sessoes[0].estado;
      const motivo = e === 'limite' ? 'conta no limite de uso' : e === 'aguardando' ? 'a sessão está esperando você' : 'a sessão está ocupada';
      await this.avisar(sel, `fila_${e}`, cartao({ icone: ICONE.fila, titulo: this.tituloHtml(sel), contexto: [esc(app.app), `na fila: ${motivo}`] }));
      return null;
    }
    return this.abrirSessao(app, sel, titulo);
  }

  private async abrirSessao(app: App, sel: Selecao, titulo: string): Promise<TerminalExecutor | null> {
    const base = app.sessao_resume_id
      ? `claude --resume ${app.sessao_resume_id}`
      : temSessaoAnterior(app.pasta)
        ? 'claude -c'
        : 'claude';
    const comando = `${base} --permission-mode ${this.env.HUB_CLAUDE_PERMISSAO}`;
    if (!/^claude( -c| --resume [A-Za-z0-9-]+)? --permission-mode [A-Za-z]+$/.test(comando)) throw new Error(`comando inesperado: ${comando}`);
    await this.enviar(cartao({ icone: ICONE.sessao, titulo: `Abrindo sessão em ${esc(app.app)}`, contexto: [`<code>${esc(comando)}</code>`] }));
    // No servidor, antes do Claude, marca a pasta como confiável no Claude do agente (senão ele para perguntando).
    const linha = this.env.HUB_CONFIAR_PASTA_CMD ? `${this.env.HUB_CONFIAR_PASTA_CMD} && ${comando}` : comando;
    const handle = await this.orca.createTerminal(app.pasta, linha, `hub #${sel.id}`);
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
      return t ?? ({ handle, title: `hub #${sel.id}` } as TerminalExecutor);
    }
    await this.avisar(
      sel,
      `nova_sessao_${estado}`,
      estado === 'aguardando'
        ? cartao({
            icone: ICONE.voce,
            titulo: `Sessão nova em ${esc(app.app)} pede algo`,
            contexto: [esc(curto(titulo, 60)), 'na fila'],
            rodape: 'Responda no Orca (ex.: confiar na pasta); depois a task segue.',
          })
        : cartao({
            icone: ICONE.aviso,
            titulo: `Sessão nova em ${esc(app.app)} não ficou pronta`,
            contexto: [esc(curto(titulo, 60)), 'na fila'],
            rodape: 'Tento de novo em instantes.',
          }),
    );
    return null;
  }

  private async detalheDaTask(sel: Selecao): Promise<TaskDetalhe> {
    if (!FERRAMENTA_REAL.has(sel.ferramenta)) {
      // Atividade avulsa (/nova) ou task fictícia: o texto do usuário é a descrição.
      const v = this.db
        .prepare('SELECT titulo, descricao, empresa FROM tasks_vistas WHERE ferramenta = ? AND task_id = ?')
        .get(sel.ferramenta, sel.task_id) as { titulo: string; descricao: string | null; empresa: 'funifier' | 'dac' };
      return {
        ferramenta: 'bnexo',
        empresa: v.empresa,
        id: sel.task_id,
        titulo: v.titulo,
        projetoId: null,
        projetoNome: null,
        status: sel.ferramenta,
        categoria: 'em_progresso',
        prazo: null,
        link: null,
        descricao: v.descricao ?? v.titulo,
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
  //   ocioso sem bloco / pergunta  → aguardando_usuario (aviso com as últimas linhas, no máx. 1 a cada 15 min)
  //   limite de uso                → pausado_limite (aviso para trocar de conta)
  //   terminal sumiu               → redescobre pela pasta; se não achar, interrompido

  private monitorados = new Set<number>();
  private falhasTerminal = new Map<number, number>();

  private retomarMonitores() {
    const ativos = this.db
      .prepare(`SELECT id FROM despachos WHERE estado IN (${sqlLista(ESTADOS_ATIVOS)})`)
      .all() as { id: number }[];
    for (const { id } of ativos) this.monitorar(id);
  }

  private monitorar(despachoId: number) {
    if (this.monitorados.has(despachoId)) return;
    this.monitorados.add(despachoId);
    log.info('monitor: iniciado', { despachoId });
    const selecaoId = this.getDespacho(despachoId)?.selecao_id;
    void comVinculo({ selecaoId }, () => this.laco(despachoId))
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
      if (!d || !ativo(d.estado)) return;

      let leitura: { estado: EstadoSessao; tela: string };
      try {
        if (!d.terminal_handle) throw new ErroExecutor('despacho sem terminal');
        // Lê antes de esperar: um terminal fechado falha na hora, sem gastar o timeout do wait.
        leitura = await this.estadoDoHandle(d.terminal_handle, d.pasta);
        let ficouOcioso = false;
        if (leitura.estado === 'ocupado') {
          ficouOcioso = await this.orca.waitIdle(d.terminal_handle, 60_000);
          leitura = await this.estadoDoHandle(d.terminal_handle, d.pasta);
        }
        this.falhasTerminal.delete(id);
        // Turno encerrado com o bloco de resultado na tela, mas com shell em segundo plano (ex.: servidor de dev):
        // a task acabou — o shell não é dela.
        if (
          leitura.estado === 'ocupado' &&
          classificarTela(leitura.tela, undefined, true) === 'ocioso' &&
          extrairResultado(leitura.tela, tagRodada(d.selecao_id, d.rodada))
        )
          leitura = { ...leitura, estado: 'ocioso' };
        if (leitura.estado === 'ocupado') {
          this.mudarEstado(d, 'em_execucao');
          if (ficouOcioso) await dormir(5_000); // TUI parado mas ainda trabalhando: evita laço apertado
          continue;
        }
      } catch (e) {
        if (!(e instanceof ErroExecutor)) throw e;
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

      const nome = this.tituloHtml(this.getSelecaoDe(d));
      if (leitura.estado === 'limite') {
        this.mudarEstado(d, 'pausado_limite');
        await this.avisarDespacho(
          d,
          'limite',
          cartao({
            icone: ICONE.pausa,
            titulo: nome,
            contexto: [esc(d.app), 'pausada: conta no limite de uso'],
            rodape: 'Troque de conta no Orca; eu retomo sozinho quando a sessão voltar a trabalhar.',
          }),
        );
        await dormir(60_000);
      } else {
        this.mudarEstado(d, 'aguardando_usuario');
        await this.avisarDespacho(
          d,
          'usuario',
          cartao({
            icone: ICONE.voce,
            titulo: nome,
            contexto: [esc(d.app), 'precisa de você no Orca'],
            corpo: [`<pre>${esc(ultimasLinhas(leitura.tela))}</pre>`],
          }),
        );
        await dormir(30_000);
      }
    }
  }

  private mudarEstado(d: Despacho & { estado: string }, estado: EstadoDespacho) {
    if (d.estado === estado) return;
    if (!podeTransicionar(d.estado, estado)) {
      log.error('monitor: transição inválida', { despachoId: d.id, de: d.estado, para: estado });
      return;
    }
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
    const agora = new Date().toISOString();
    this.db.transaction(() => {
      this.db.prepare("UPDATE despachos SET estado = 'interrompido', atualizado_em = ? WHERE id = ?").run(agora, d.id);
      this.db.prepare("UPDATE selecoes SET estado = 'interrompida', atualizado_em = ? WHERE id = ? OR lote_de = ?").run(agora, sel.id, sel.id);
      for (const s of this.doLote(sel))
        this.db
          .prepare("INSERT INTO historico (ferramenta, task_id, titulo, app, status_final, criado_em) VALUES (?, ?, ?, ?, 'interrompido', ?)")
          .run(s.ferramenta, s.task_id, this.tituloTask(s), d.app, agora);
    })();
    this.falhasTerminal.delete(d.id);
    apagarCredenciaisDaTask(sel.id);
    log.warn('monitor: despacho interrompido', { despachoId: d.id });
    await this.enviar(
      cartao({
        icone: ICONE.falha,
        titulo: this.tituloHtml(sel),
        contexto: [esc(d.app), 'interrompida: o terminal sumiu'],
        rodape: 'O Orca reiniciou ou a aba foi fechada. Veja o que ficou na branch e selecione a task de novo se precisar.',
      }),
    );
    void this.processar();
    return 'interrompido';
  }

  private getSelecaoDe(d: Despacho) {
    return this.db.prepare('SELECT * FROM selecoes WHERE id = ?').get(d.selecao_id) as Selecao;
  }

  private async concluir(d: Despacho, r: Record<string, string>) {
    const sel = this.getSelecaoDe(d);
    const notas: string[] = [];

    // 1. Orca: worktree "em revisão" com o resumo.
    try {
      await this.orca.setWorktreeStatus(d.pasta, 'in-review', `hub #${sel.id} (${r.status}): ${r.resumo ?? ''}`.slice(0, 500));
      // sucesso não precisa de linha própria
    } catch (e) {
      notas.push(`${ICONE.aviso} Orca: não marquei em revisão (${esc(curto((e as Error).message, 80))})`);
      log.warn('fechamento: falha no Orca', { despachoId: d.id, ...errInfo(e) });
    }

    // 2. Ferramenta de gestão: nada. A task continua "em progresso" até o usuário encerrar (B03/B04);
    //    comentário só com comando explícito dele (B02).

    // 3. Banco + histórico.
    const agora = new Date().toISOString();
    this.db.transaction(() => {
      this.db.prepare("UPDATE despachos SET estado = 'concluido', resultado = ?, atualizado_em = ? WHERE id = ?").run(JSON.stringify(r), agora, d.id);
      this.db.prepare("UPDATE selecoes SET estado = 'finalizada', atualizado_em = ? WHERE id = ? OR lote_de = ?").run(agora, sel.id, sel.id);
      for (const s of this.doLote(sel))
        this.db
          .prepare('INSERT INTO historico (ferramenta, task_id, titulo, app, status_final, resumo, branch, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(s.ferramenta, s.task_id, this.tituloTask(s), d.app, r.status, r.resumo ?? null, r.branch ?? null, agora);
    })();
    log.info('fechamento: concluído', { despachoId: d.id, status: r.status });

    // 4. Telegram.
    const icone = r.status === 'concluido' ? ICONE.ok : r.status === 'bloqueado' ? ICONE.bloqueado : ICONE.revisao;
    const estado = { concluido: 'concluída', bloqueado: 'bloqueada', precisa_revisao: 'precisa de revisão' }[r.status] ?? r.status;
    const pendencias = r.pendencias && !/^nenhuma/i.test(r.pendencias) ? r.pendencias : null;
    const m = await this.api
      .sendMessage(
        this.chatId,
        cartao({
          icone,
          titulo: this.tituloHtml(sel),
          contexto: [esc(d.app), estado, d.rodada > 1 ? `rodada ${d.rodada}` : null],
          corpo: [
            esc(r.resumo ?? ''),
            '',
            r.arquivos ? campo('Arquivos', esc(r.arquivos)) : null,
            r.branch ? campo('Branch', `<code>${esc(r.branch)}</code>`) : null,
            pendencias ? campo('Pendências', esc(pendencias)) : null,
            ...notas,
          ],
          rodape: 'Revise no Orca e escolha o próximo passo.',
        }),
        { ...HTML, reply_markup: this.tecladoFechamento(d.id) },
      )
      .catch((e) => log.error('despacho: falha no Telegram', errInfo(e)));
    if (m) this.db.prepare('UPDATE despachos SET msg_fechamento = ? WHERE id = ?').run(m.message_id, d.id);
  }

  // ─────────────────────────── próximos passos (depois da conclusão) ───────────────────────────
  //
  // callback_data  f:<despacho>:i | pr | x | b:<idx> | bn | ok | xs | xn | no
  //   💬 i  → espera um texto do usuário e manda como continuação para a mesma sessão (rodada N+1)
  //   🔀 pr → pergunta a branch base (b), opcionalmente o nome da branch (bn), confirma (ok) e pede o PR ao Claude
  //   ✅ x  → encerra o ciclo; com ferramenta de gestão, pergunta se marca a task como concluída (xs) ou não (xn)

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

  // Branch de trabalho da task: a última citada nos resultados que não seja URL de PR. null = a sessão não informou.
  private branchDaTask(d: Despacho, sel: Selecao): string | null {
    const anteriores = (
      this.db
        .prepare('SELECT branch FROM historico WHERE ferramenta = ? AND task_id = ? AND branch IS NOT NULL ORDER BY id DESC')
        .all(sel.ferramenta, sel.task_id) as { branch: string }[]
    ).map((h) => h.branch);
    const atual = d.resultado ? (JSON.parse(d.resultado) as Record<string, string>).branch : undefined;
    for (const b of [atual, ...anteriores]) {
      const nome = (b ?? '').split(/[\s,()]+/).find((t) => t && !t.includes('://') && /^[\w./-]+$/.test(t) && !t.startsWith('-'));
      if (nome) return nome;
    }
    return null;
  }

  // /continuar: reenvia os botões de próximos passos das últimas tasks concluídas.
  async listarConcluidos() {
    const ds = this.db
      .prepare("SELECT * FROM despachos WHERE estado = 'concluido' ORDER BY atualizado_em DESC LIMIT 5")
      .all() as (Despacho & { estado: string })[];
    if (!ds.length) return this.enviar(cartao({ icone: ICONE.ok, titulo: 'Nada esperando próximos passos' }));
    for (const d of ds) {
      const sel = this.getSelecaoDe(d);
      vincular({ selecaoId: sel.id });
      const r = JSON.parse(d.resultado ?? '{}') as Record<string, string>;
      if (d.msg_fechamento) await this.api.editMessageReplyMarkup(this.chatId, d.msg_fechamento).catch(() => {});
      const branch = this.branchDaTask(d, sel);
      const icone = r.status === 'concluido' ? ICONE.ok : r.status === 'bloqueado' ? ICONE.bloqueado : ICONE.revisao;
      const m = await this.api.sendMessage(
        this.chatId,
        cartao({ icone, titulo: this.tituloHtml(sel), contexto: [esc(d.app), branch ? `<code>${esc(branch)}</code>` : null] }),
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
    vincular({ selecaoId: sel.id });
    const titulo = this.tituloDe(sel);
    const conv = this.conversa();
    const kbCancelar = new InlineKeyboard().text('✖ Cancelar', `f:${d.id}:no`);

    if (acao === 'i' || acao === 'pr' || acao === 'x') {
      if (d.estado !== 'concluido' || d.msg_fechamento !== msgId) return 'Esses botões já foram usados.';
      await this.api.editMessageReplyMarkup(this.chatId, msgId).catch(() => {});
      if (acao === 'x') {
        const reais = this.doLote(sel).filter((s) => FERRAMENTA_REAL.has(s.ferramenta));
        if (!reais.length) {
          await this.encerrar(d, sel, false);
          return 'Encerrado';
        }
        const onde = [...new Set(reais.map((s) => NOME_FERRAMENTA[s.ferramenta]))].join('/');
        const m = await this.api.sendMessage(
          this.chatId,
          cartao({
            icone: ICONE.pergunta,
            titulo: reais.length > 1 ? `Marcar as ${reais.length} tasks como concluídas no ${onde}?` : `Marcar como concluída no ${onde}?`,
            contexto: [this.tituloHtml(sel), 'encerrar'],
          }),
          {
            ...HTML,
            reply_markup: new InlineKeyboard()
              .text('✔ Sim, concluir a task', `f:${d.id}:xs`)
              .row()
              .text('Não, só encerrar', `f:${d.id}:xn`)
              .text('✖ Cancelar', `f:${d.id}:no`),
          },
        );
        await this.setConversa({ despachoId: d.id, tipo: 'encerrar', msgId: m.message_id });
        return 'Concluir a task?';
      }
      if (acao === 'i') {
        const m = await this.api.sendMessage(
          this.chatId,
          cartao({
            icone: ICONE.pergunta,
            titulo: 'Qual a instrução?',
            contexto: [this.tituloHtml(sel), esc(d.app)],
            rodape: 'Mande em texto. Vai para a mesma sessão e eu acompanho até o novo resultado.',
          }),
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
        cartao({
          icone: ICONE.pergunta,
          titulo: 'PR para qual branch?',
          contexto: [this.tituloHtml(sel), esc(d.app)],
          rodape: bases.length ? 'Toque numa opção ou escreva o nome.' : 'Escreva o nome (não achei as branches usuais no origin).',
        }),
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
      await this.enviar(cartao({ icone: ICONE.cancelado, titulo: 'Cancelado', rodape: 'Os botões voltaram na mensagem do resultado.' }));
      return 'Cancelado';
    }
    if ((acao === 'xs' || acao === 'xn') && conv.tipo === 'encerrar') {
      await this.setConversa(null);
      await this.encerrar(d, sel, acao === 'xs');
      return 'Encerrado';
    }
    if (acao === 'b' && conv.tipo === 'pr_base') {
      const base = conv.bases?.[Number(arg)];
      if (!base) return 'Opção inválida.';
      await this.confirmarPr(d, sel, base);
      return base;
    }
    if (acao === 'bn' && conv.tipo === 'pr_confirmar') {
      const m = await this.api.sendMessage(
        this.chatId,
        cartao({
          icone: ICONE.pergunta,
          titulo: 'Qual o nome da branch?',
          contexto: [this.tituloHtml(sel), conv.branch ? `hoje: <code>${esc(conv.branch)}</code>` : null],
          rodape: 'O Claude renomeia antes do push.',
        }),
        { ...HTML, reply_markup: kbCancelar },
      );
      await this.setConversa({ ...conv, tipo: 'pr_branch', msgId: m.message_id });
      return 'Escreva o nome';
    }
    if (acao === 'ok' && conv.tipo === 'pr_confirmar') {
      await this.enfileirarSeguimento(d, { tipo: 'pr', base: conv.base, remoto: conv.remoto, branch: conv.branch ?? null, novaBranch: conv.novaBranch });
      return 'PR pedido';
    }
    return 'Essa pergunta já foi respondida.';
  }

  // Texto livre do usuário: só vale quando há uma conversa de próximos passos aberta.
  async onTexto(texto: string): Promise<boolean> {
    const conv = this.conversa();
    if (!conv) return false;
    const d = this.getDespacho(conv.despachoId);
    if (!d || d.estado !== 'concluido') {
      await this.setConversa(null);
      return false;
    }
    const sel = this.getSelecaoDe(d);
    vincular({ selecaoId: sel.id });
    const t = texto.trim();
    const nomeValido = (n: string) => /^[\w./-]{1,100}$/.test(n) && !n.startsWith('-') && !n.includes('..');

    if (conv.tipo === 'instrucao') {
      await this.enfileirarSeguimento(d, { tipo: 'instrucao', instrucao: t, branch: this.branchDaTask(d, sel) });
      return true;
    }
    if (conv.tipo === 'pr_base') {
      if (!nomeValido(t)) {
        await this.enviar(cartao({ icone: ICONE.aviso, titulo: 'Nome de branch inválido', rodape: 'Escreva só o nome, ex.: develop.' }));
        return true;
      }
      const remotas = await branchesRemotas(d.pasta);
      if (remotas.length && !remotas.includes(t)) {
        await this.enviar(
          cartao({ icone: ICONE.aviso, titulo: `Não achei ${esc(t)} no origin`, contexto: [esc(d.app)], rodape: 'Confira o nome e mande de novo.' }),
        );
        return true;
      }
      await this.confirmarPr(d, sel, t);
      return true;
    }
    if (conv.tipo === 'pr_branch') {
      if (!nomeValido(t)) {
        await this.enviar(cartao({ icone: ICONE.aviso, titulo: 'Nome de branch inválido', rodape: 'Use letras, números, - _ . e /.' }));
        return true;
      }
      await this.confirmarPr(d, sel, conv.base!, t);
      return true;
    }
    await this.enviar(cartao({ icone: ICONE.aviso, titulo: 'Use os botões da última mensagem', rodape: 'Ou toque em Cancelar.' }));
    return true;
  }

  private async confirmarPr(d: Despacho, sel: Selecao, base: string, novaBranch?: string) {
    const branch = this.branchDaTask(d, sel);
    const remoto = await remotoOrigin(d.pasta);
    const de = novaBranch
      ? `<code>${escapeHtml(novaBranch)}</code>${branch && branch !== novaBranch ? ` (renomeando <code>${escapeHtml(branch)}</code>)` : ''}`
      : branch
        ? `<code>${escapeHtml(branch)}</code>`
        : 'branch de trabalho da task (nome não informado)';
    const m = await this.api.sendMessage(
      this.chatId,
      cartao({
        icone: ICONE.pr,
        titulo: 'Confirma o PR?',
        contexto: [this.tituloHtml(sel), esc(d.app)],
        corpo: [campo('Repositório', `<code>${esc(remoto ?? 'origin')}</code>`), campo('De', de), campo('Para', `<code>${esc(base)}</code>`)],
        rodape: 'Push da branch e PR aberto, sem merge. O push pode pedir sua aprovação no Orca.',
      }),
      {
        ...HTML,
        reply_markup: new InlineKeyboard()
          .text('✔ Confirmar', `f:${d.id}:ok`)
          .text('✏️ Nome da branch', `f:${d.id}:bn`)
          .row()
          .text('✖ Cancelar', `f:${d.id}:no`),
      },
    );
    await this.setConversa({ despachoId: d.id, tipo: 'pr_confirmar', msgId: m.message_id, base, remoto, branch, novaBranch });
  }

  // Encerrar (B04): só marca a task como concluída na ferramenta de gestão se o usuário confirmou.
  private async encerrar(d: Despacho, sel: Selecao, concluirTask: boolean) {
    const status = concluirTask ? await this.moverStatus(sel, 'concluida') : null;
    const agora = new Date().toISOString();
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE despachos SET estado = 'encerrado', encerrado_em = ?, msg_fechamento = NULL, atualizado_em = ? WHERE id = ?")
        .run(agora, agora, d.id);
      this.db.prepare("UPDATE selecoes SET estado = 'encerrada', atualizado_em = ? WHERE id = ? OR lote_de = ?").run(agora, sel.id, sel.id);
    })();
    apagarCredenciaisDaTask(sel.id);
    log.info('despacho: encerrado', { despachoId: d.id, concluirTask });
    const reais = this.doLote(sel).filter((s) => FERRAMENTA_REAL.has(s.ferramenta));
    const continua =
      reais.length && !concluirTask
        ? `${[...new Set(reais.map((s) => NOME_FERRAMENTA[s.ferramenta]))].join('/')}: ${reais.length > 1 ? 'continuam' : 'continua'} em progresso`
        : null;
    await this.enviar(cartao({ icone: ICONE.ok, titulo: this.tituloHtml(sel), contexto: [esc(d.app), 'encerrada', status ?? continua] }));
  }

  private async enfileirarSeguimento(d: Despacho, seg: Seguimento) {
    await this.setConversa(null);
    this.db
      .prepare("UPDATE despachos SET estado = 'seguimento_fila', seguimento = ?, atualizado_em = ? WHERE id = ? AND estado = 'concluido'")
      .run(JSON.stringify(seg), new Date().toISOString(), d.id);
    log.info('seguimento: enfileirado', { despachoId: d.id, tipo: seg.tipo });
    // Sem mensagem própria: o "rodando" chega em seguida, ou o aviso de fila se a sessão estiver ocupada.
    void this.processar();
  }

  private async enviarSeguimento(d: Despacho & { estado: string }) {
    const sel = this.getSelecaoDe(d);
    vincular({ selecaoId: sel.id });
    const titulo = this.tituloDe(sel);
    const app = loadCatalogo().apps.find((a) => a.app === d.app);
    const seg = JSON.parse(d.seguimento ?? 'null') as Seguimento | null;
    if (!app || !seg) {
      this.db.prepare("UPDATE despachos SET estado = 'concluido', seguimento = NULL WHERE id = ?").run(d.id);
      return this.enviar(
        cartao({ icone: ICONE.falha, titulo: this.tituloHtml(sel), contexto: [esc(d.app), !app ? 'o app sumiu do apps.yaml' : 'pedido inválido'] }),
      );
    }
    const alvo = await this.sessaoOciosa(app, sel, titulo, d.terminal_handle);
    if (!alvo) return;

    const rodada = d.rodada + 1;
    const link =
      (
        this.db.prepare('SELECT link FROM tasks_vistas WHERE ferramenta = ? AND task_id = ?').get(sel.ferramenta, sel.task_id) as
          | { link: string | null }
          | undefined
      )?.link ?? null;
    const arquivo = escreverSeguimento({
      selecaoId: sel.id,
      rodada,
      titulo: titulo.replace(/^📦 /, ''),
      link,
      app,
      anterior: JSON.parse(d.resultado ?? '{}'),
      credenciais: existsSync(join(dirAnexos(sel.id), 'credenciais.json')) ? join(dirAnexos(sel.id), 'credenciais.json') : null,
      ...seg,
    });

    if ((await this.estadoDoHandle(alvo.handle, app.pasta, true)).estado !== 'ocioso') {
      return this.avisar(sel, 'fila_ocupado', cartao({ icone: ICONE.fila, titulo: this.tituloHtml(sel), contexto: [esc(app.app), 'na fila: a sessão ficou ocupada'] }));
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
      this.db.prepare("UPDATE selecoes SET estado = 'despachada', atualizado_em = ? WHERE id = ? OR lote_de = ?").run(agora, sel.id, sel.id);
    })();
    log.info('seguimento: enviado', { despachoId: d.id, rodada, tipo: seg.tipo, terminal: alvo.handle });
    await this.enviar(
      cartao({
        icone: seg.tipo === 'pr' ? ICONE.pr : ICONE.rodando,
        titulo: this.tituloHtml(sel),
        contexto: [esc(app.app), seg.tipo === 'pr' ? 'abrindo PR' : 'rodando instrução', `rodada ${rodada}`],
        corpo: [campo('Prompt', `<code>${esc(relativo(arquivo))}</code>`)],
      }),
    );
    this.monitorar(d.id);
  }

  // ─────────────────────────── util ───────────────────────────

  // A task e, se ela lidera um lote, as outras tasks do lote (na ordem em que foram marcadas).
  private doLote(sel: Selecao): Selecao[] {
    return [sel, ...(this.db.prepare('SELECT * FROM selecoes WHERE lote_de = ? ORDER BY id').all(sel.id) as Selecao[])];
  }

  // Título para o título das mensagens: curto e com link quando houver; lote vira "📦 Lote de N: …".
  private tituloHtml(sel: Selecao) {
    if (this.doLote(sel).length > 1) return esc(curto(this.tituloDe(sel)));
    const t = esc(curto(this.tituloDe(sel)));
    const link = (
      this.db.prepare('SELECT link FROM tasks_vistas WHERE ferramenta = ? AND task_id = ?').get(sel.ferramenta, sel.task_id) as
        | { link: string | null }
        | undefined
    )?.link;
    return link ? `<a href="${esc(link)}">${t}</a>` : t;
  }

  private tituloDe(sel: Selecao) {
    const lote = this.doLote(sel);
    return lote.length > 1 ? `📦 Lote de ${lote.length}: ${lote.map((s) => this.tituloTask(s)).join(' + ')}` : this.tituloTask(sel);
  }

  private tituloTask(sel: Selecao) {
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
