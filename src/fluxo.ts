// Fase 4 — resumo com seleção e conversa por task até "aguardando_despacho".
//
// callback_data (máx. 64 bytes):
//   t:<resumo>:<idx>         alterna ⬜/✅ de uma task do resumo
//   r:<resumo>:go|none       "Iniciar selecionadas" / "Nenhuma hoje"
//   s:<selecao>:<acao>[:arg] respostas da conversa (pular, ok, outro, app:<nome>, g:<i>, gok, desp, reset, cancel)
import { InlineKeyboard, type Api } from 'grammy';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { loadCatalogo, type App, type Catalogo, type Env, type Gamificacao } from './config.js';
import { getMeta, setMeta, type DB } from './db.js';
import { errInfo, log } from './logger.js';
import type { Orca } from './orca.js';
import { dataLocal, type PmAdapter } from './pm/types.js';
import { dirAnexos } from './prompt.js';
import { buscarTasks, dividirMensagem, escapeHtml, montarResumo } from './resumo.js';

const HTML = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };

interface Selecao {
  id: number;
  ferramenta: string;
  task_id: string;
  resumo_id: number | null;
  info_extra: string | null;
  app: string | null;
  gamificacoes: string | null;
  estado: string;
  etapa: string | null;
  msg_pergunta: number | null;
  anexos: string | null;
}

interface TaskVista {
  titulo: string;
  projeto_nome: string | null;
  projeto_id: string | null;
  link: string | null;
  empresa: 'funifier' | 'dac';
  prazo: string | null;
}

export class Fluxo {
  private chatId: number;
  private enviandoResumo = false;
  // Chamado quando o João toca em "Despachar" (ligado ao Despachante no telegram.ts).
  onDespachar: (selecaoId: number) => void = () => {};

  constructor(
    private env: Env,
    private db: DB,
    private api: Api,
    private adapters: PmAdapter[],
    private orca: Orca,
  ) {
    this.chatId = Number(env.TELEGRAM_CHAT_ID);
  }

  // ───────────────────────────── resumo ─────────────────────────────

  // Resumo diário: idempotente por dia (agendado no horário + verificação periódica de catch-up).
  async talvezResumoDiario(origem: 'agendado' | 'catch_up') {
    const agora = new Date();
    const hoje = dataLocal(agora, this.env.TZ_HUB);
    const hora = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.env.TZ_HUB,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(agora);
    if (hora < this.env.RESUMO_HORARIO || getMeta(this.db, 'resumo_diario_data') === hoje) return;
    if (await this.enviarResumo(origem)) setMeta(this.db, 'resumo_diario_data', hoje);
  }

  async enviarResumo(origem: 'agendado' | 'catch_up' | 'manual'): Promise<boolean> {
    if (this.enviandoResumo) return false;
    this.enviandoResumo = true;
    try {
      const cat = loadCatalogo();
      const r = await buscarTasks(this.adapters, this.db);
      if (r.erros.length === this.adapters.length) {
        await this.api.sendMessage(this.chatId, `⚠️ Não consegui buscar as tasks:\n${r.erros.map((e) => `• ${e.ferramenta}: ${e.erro}`).join('\n')}`);
        return false;
      }
      const agora = new Date().toISOString();
      this.db.prepare("UPDATE resumos SET estado = 'substituido' WHERE estado = 'aberto'").run();
      const resumoId = Number(
        this.db
          .prepare("INSERT INTO resumos (data, origem, estado, criado_em) VALUES (?, ?, 'aberto', ?)")
          .run(dataLocal(new Date(), this.env.TZ_HUB), origem, agora).lastInsertRowid,
      );
      const insItem = this.db.prepare(
        'INSERT INTO resumo_itens (resumo_id, idx, ferramenta, task_id, empresa, app_sugerido, msg_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );

      const titulo = origem === 'manual' ? '📋 <b>Suas tasks agora</b>' : '☀️ <b>Resumo do dia</b>';
      await this.api.sendMessage(this.chatId, titulo, HTML);

      let selecionaveis = 0;
      for (const bloco of montarResumo(r, cat, this.env.TZ_HUB)) {
        const partes = dividirMensagem(bloco.texto);
        const kb = this.tecladoItens(
          resumoId,
          bloco.itens.filter((i) => i.app).map((i) => ({ idx: i.idx, titulo: i.task.titulo, selecionada: false })),
        );
        let msgId: number | null = null;
        for (let p = 0; p < partes.length; p++) {
          const ultima = p === partes.length - 1;
          const m = await this.api.sendMessage(this.chatId, partes[p], { ...HTML, ...(ultima && kb ? { reply_markup: kb } : {}) });
          if (ultima) msgId = m.message_id;
        }
        for (const i of bloco.itens) insItem.run(resumoId, i.idx, i.task.ferramenta, i.task.id, i.task.empresa, i.app, msgId);
        selecionaveis += bloco.itens.filter((i) => i.app).length;
      }

      if (selecionaveis > 0) {
        await this.api.sendMessage(this.chatId, 'Quando terminar de marcar:', {
          reply_markup: new InlineKeyboard().text('▶️ Iniciar selecionadas', `r:${resumoId}:go`).text('💤 Nenhuma hoje', `r:${resumoId}:none`),
        });
      } else {
        this.db.prepare("UPDATE resumos SET estado = 'nenhuma' WHERE id = ?").run(resumoId);
        await this.api.sendMessage(this.chatId, 'Nenhuma task de projeto mapeado para automatizar.');
      }
      log.info('resumo enviado', { resumoId, origem, tasks: r.tasks.length, selecionaveis, erros: r.erros.length });
      return true;
    } catch (e) {
      log.error('resumo: falha ao enviar', errInfo(e));
      return false;
    } finally {
      this.enviandoResumo = false;
    }
  }

  private tecladoItens(resumoId: number, itens: { idx: number; titulo: string; selecionada: boolean }[]) {
    if (!itens.length) return undefined;
    const kb = new InlineKeyboard();
    for (const i of itens) {
      const t = i.titulo.length > 42 ? i.titulo.slice(0, 41) + '…' : i.titulo;
      kb.text(`${i.selecionada ? '✅' : '⬜'} ${i.idx}. ${t}`, `t:${resumoId}:${i.idx}`).row();
    }
    return kb;
  }

  private resumoAberto(resumoId: number) {
    const r = this.db.prepare('SELECT estado FROM resumos WHERE id = ?').get(resumoId) as { estado: string } | undefined;
    return r?.estado === 'aberto';
  }

  // Retorna o texto para o answerCallbackQuery.
  async alternarItem(resumoId: number, idx: number): Promise<string> {
    if (!this.resumoAberto(resumoId)) return 'Esse resumo já foi fechado. Use /tarefas para um novo.';
    const item = this.db
      .prepare('SELECT msg_id, selecionada FROM resumo_itens WHERE resumo_id = ? AND idx = ? AND app_sugerido IS NOT NULL')
      .get(resumoId, idx) as { msg_id: number; selecionada: number } | undefined;
    if (!item) return 'Task não encontrada.';
    this.db.prepare('UPDATE resumo_itens SET selecionada = 1 - selecionada WHERE resumo_id = ? AND idx = ?').run(resumoId, idx);
    const itens = this.db
      .prepare(
        `SELECT ri.idx, ri.selecionada, COALESCE(tv.titulo, ri.task_id) titulo FROM resumo_itens ri
         LEFT JOIN tasks_vistas tv ON tv.ferramenta = ri.ferramenta AND tv.task_id = ri.task_id
         WHERE ri.resumo_id = ? AND ri.msg_id = ? AND ri.app_sugerido IS NOT NULL ORDER BY ri.idx`,
      )
      .all(resumoId, item.msg_id) as { idx: number; selecionada: number; titulo: string }[];
    await this.api.editMessageReplyMarkup(this.chatId, item.msg_id, {
      reply_markup: this.tecladoItens(
        resumoId,
        itens.map((i) => ({ ...i, selecionada: !!i.selecionada })),
      ),
    });
    return item.selecionada ? `Task ${idx} desmarcada` : `Task ${idx} marcada`;
  }

  async finalizarResumo(resumoId: number, acao: 'go' | 'none', msgId: number): Promise<string> {
    if (!this.resumoAberto(resumoId)) return 'Esse resumo já foi fechado.';
    const marcadas = this.db
      .prepare('SELECT idx, ferramenta, task_id, app_sugerido FROM resumo_itens WHERE resumo_id = ? AND selecionada = 1 ORDER BY idx')
      .all(resumoId) as { idx: number; ferramenta: string; task_id: string; app_sugerido: string }[];
    if (acao === 'go' && !marcadas.length) return 'Marque pelo menos uma task (ou toque em "Nenhuma hoje").';

    this.db.prepare('UPDATE resumos SET estado = ? WHERE id = ?').run(acao === 'go' ? 'iniciado' : 'nenhuma', resumoId);
    const msgs = this.db
      .prepare('SELECT DISTINCT msg_id FROM resumo_itens WHERE resumo_id = ? AND msg_id IS NOT NULL')
      .all(resumoId) as { msg_id: number }[];
    for (const m of msgs) await this.api.editMessageReplyMarkup(this.chatId, m.msg_id).catch(() => {});

    if (acao === 'none') {
      await this.api.editMessageText(this.chatId, msgId, '💤 Nenhuma task hoje.');
      return 'Ok!';
    }

    const agora = new Date().toISOString();
    const jaEmAndamento = this.db.prepare(
      "SELECT 1 FROM selecoes WHERE ferramenta = ? AND task_id = ? AND estado IN ('coletando','aguardando_despacho','despachada')",
    );
    const ins = this.db.prepare(
      `INSERT INTO selecoes (ferramenta, task_id, data_resumo, app, estado, etapa, resumo_id, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, 'coletando', 'info', ?, ?, ?)`,
    );
    const novas: number[] = [];
    const repetidas: number[] = [];
    for (const m of marcadas) {
      if (jaEmAndamento.get(m.ferramenta, m.task_id)) repetidas.push(m.idx);
      else {
        ins.run(m.ferramenta, m.task_id, dataLocal(new Date(), this.env.TZ_HUB), m.app_sugerido, resumoId, agora, agora);
        novas.push(m.idx);
      }
    }
    let txt = novas.length ? `▶️ Vamos configurar ${novas.length} task(s): ${novas.join(', ')}` : 'Nenhuma task nova.';
    if (repetidas.length) txt += `\n(já em andamento, ignoradas: ${repetidas.join(', ')})`;
    await this.api.editMessageText(this.chatId, msgId, txt);
    await this.proximaPergunta();
    return 'Iniciando';
  }

  // ───────────────────────────── conversa ─────────────────────────────

  // /teste <texto>: task fictícia para o app sandbox, passando pela conversa inteira.
  async criarTeste(texto: string) {
    const agora = new Date().toISOString();
    const taskId = `teste-${Date.now()}`;
    this.db
      .prepare(
        `INSERT INTO tasks_vistas (ferramenta, task_id, empresa, titulo, projeto_id, projeto_nome, status, prazo, link, primeira_vez, ultima_vez)
         VALUES ('teste', ?, 'dac', ?, NULL, 'sandbox (task fictícia)', 'teste', NULL, NULL, ?, ?)`,
      )
      .run(taskId, texto, agora, agora);
    this.db
      .prepare(
        `INSERT INTO selecoes (ferramenta, task_id, data_resumo, app, estado, etapa, criado_em, atualizado_em)
         VALUES ('teste', ?, ?, 'sandbox', 'coletando', 'info', ?, ?)`,
      )
      .run(taskId, dataLocal(new Date(), this.env.TZ_HUB), agora, agora);
    await this.proximaPergunta();
  }

  private selecaoAtiva(): Selecao | undefined {
    return this.db.prepare("SELECT * FROM selecoes WHERE estado = 'coletando' ORDER BY id LIMIT 1").get() as Selecao | undefined;
  }

  private getSelecao(id: number) {
    return this.db.prepare('SELECT * FROM selecoes WHERE id = ?').get(id) as Selecao | undefined;
  }

  private taskDe(s: Selecao): TaskVista {
    return (
      (this.db
        .prepare('SELECT titulo, projeto_nome, projeto_id, link, empresa, prazo FROM tasks_vistas WHERE ferramenta = ? AND task_id = ?')
        .get(s.ferramenta, s.task_id) as TaskVista | undefined) ?? {
        titulo: s.task_id,
        projeto_nome: null,
        projeto_id: null,
        link: null,
        empresa: s.ferramenta === 'bnexo' ? 'dac' : 'funifier',
        prazo: null,
      }
    );
  }

  private atualizar(id: number, campos: Partial<Selecao>) {
    const chaves = Object.keys(campos);
    this.db
      .prepare(`UPDATE selecoes SET ${chaves.map((k) => `${k} = @${k}`).join(', ')}, atualizado_em = @agora WHERE id = @id`)
      .run({ ...campos, id, agora: new Date().toISOString() });
  }

  private cabecalho(s: Selecao) {
    const t = this.taskDe(s);
    const pendentes = (this.db.prepare("SELECT COUNT(*) n FROM selecoes WHERE estado = 'coletando'").get() as { n: number }).n;
    const titulo = t.link ? `<a href="${escapeHtml(t.link)}">${escapeHtml(t.titulo)}</a>` : escapeHtml(t.titulo);
    return `🧩 <b>${titulo}</b>\n<i>${escapeHtml(t.projeto_nome ?? t.projeto_id ?? '')}</i>${pendentes > 1 ? ` · faltam ${pendentes}` : ''}`;
  }

  private async perguntar(s: Selecao, texto: string, kb?: InlineKeyboard) {
    if (s.msg_pergunta) await this.api.editMessageReplyMarkup(this.chatId, s.msg_pergunta).catch(() => {});
    const m = await this.api.sendMessage(this.chatId, `${this.cabecalho(s)}\n\n${texto}`, { ...HTML, ...(kb ? { reply_markup: kb } : {}) });
    this.atualizar(s.id, { msg_pergunta: m.message_id });
  }

  private appDe(cat: Catalogo, nome: string | null): App | undefined {
    return cat.apps.find((a) => a.app === nome);
  }

  async proximaPergunta(): Promise<void> {
    const s = this.selecaoAtiva();
    if (!s) {
      const n = (this.db.prepare("SELECT COUNT(*) n FROM selecoes WHERE estado = 'aguardando_despacho'").get() as { n: number }).n;
      if (n) await this.api.sendMessage(this.chatId, `✅ Tudo configurado. ${n} task(s) aguardando despacho.`);
      return;
    }
    const cat = loadCatalogo();
    const app = this.appDe(cat, s.app);
    const kbCancel = (kb: InlineKeyboard) => kb.row().text('✖ Cancelar esta task', `s:${s.id}:cancel`);

    switch (s.etapa) {
      case 'info':
        return this.perguntar(
          s,
          '💬 Quer adicionar alguma informação? (o que foi falado em reunião, no Teams…)\n' +
            'Mande <b>fotos/prints/arquivos</b> (a legenda vira texto) e/ou uma mensagem de texto, que encerra esta etapa.\n' +
            'Sem nada a acrescentar? Toque em <b>Pular</b>.',
          kbCancel(new InlineKeyboard().text('⏭ Pular / Continuar', `s:${s.id}:pular`)),
        );

      case 'destino': {
        if (!app) {
          this.atualizar(s.id, { etapa: 'escolher_app' });
          return this.proximaPergunta();
        }
        const avisos = await this.avisosApp(app);
        return this.perguntar(
          s,
          `📁 Rodar em <b>${escapeHtml(app.app)}</b>?\n<code>${escapeHtml(app.pasta)}</code>${avisos}`,
          kbCancel(new InlineKeyboard().text('✔ Confirmar', `s:${s.id}:ok`).text('🔀 Escolher outro', `s:${s.id}:outro`)),
        );
      }

      case 'escolher_app': {
        const empresa = this.taskDe(s).empresa;
        const kb = new InlineKeyboard();
        cat.apps
          .filter((a) => (s.ferramenta === 'teste' ? a.ferramenta === 'teste' : a.empresa === empresa && a.ferramenta !== 'teste'))
          .forEach((a, i) => {
            kb.text(a.app === s.app ? `• ${a.app}` : a.app, `s:${s.id}:app:${a.app}`);
            if (i % 2 === 1) kb.row();
          });
        return this.perguntar(s, `📁 Em qual app da ${empresa.toUpperCase()} rodar?`, kbCancel(kb));
      }

      case 'alvo': {
        const gamifs = app?.gamificacoes ?? [];
        if (!gamifs.length) {
          await this.api.sendMessage(
            this.chatId,
            `⚠️ <b>${escapeHtml(app?.app ?? '?')}</b> não tem gamificação cadastrada no apps.yaml.\nA task fica registrada, mas o despacho fica <b>bloqueado</b> até cadastrar.`,
            HTML,
          );
          this.atualizar(s.id, { etapa: 'confirmar', gamificacoes: '[]' });
          return this.proximaPergunta();
        }
        const marcadas = this.gamifsMarcadas(s, gamifs);
        const kb = new InlineKeyboard();
        gamifs.forEach((g, i) => {
          kb.text(`${marcadas.has(g.nome) ? '✅' : '⬜'} ${g.nome} — ${g.conta}`, `s:${s.id}:g:${i}`).row();
        });
        kb.text('➡️ Continuar', `s:${s.id}:gok`);
        const lista = gamifs
          .map((g) => `• <b>${escapeHtml(g.nome)}</b> — conta ${escapeHtml(g.conta)} · <code>${escapeHtml(g.servidor)}</code>`)
          .join('\n');
        return this.perguntar(s, `🎯 Quais gamificações podem ser alteradas?\n${lista}\n\nMarque pelo menos uma.`, kbCancel(kb));
      }

      case 'confirmar':
        return this.perguntar(
          s,
          this.textoConfirmacao(s, cat),
          new InlineKeyboard()
            .text('🚀 Despachar', `s:${s.id}:desp`)
            .row()
            .text('↩️ Recomeçar', `s:${s.id}:reset`)
            .text('✖ Cancelar', `s:${s.id}:cancel`),
        );
    }
  }

  private async avisosApp(app: App) {
    const avisos: string[] = [];
    if (!existsSync(app.pasta)) avisos.push('⚠️ pasta não existe');
    try {
      const repos = await this.orca.listRepos();
      if (!repos.some((r) => r.path === app.pasta)) avisos.push('⚠️ não está aberto no Orca');
    } catch {
      avisos.push('⚠️ Orca inacessível agora');
    }
    return avisos.length ? `\n${avisos.join('\n')}` : '';
  }

  // Durante a etapa "alvo", selecoes.gamificacoes guarda os NOMES marcados; na confirmação, os objetos completos.
  private gamifsMarcadas(s: Selecao, gamifs: Gamificacao[]): Set<string> {
    if (s.gamificacoes === null) return new Set(gamifs.filter((g) => g.padrao).map((g) => g.nome));
    const v = JSON.parse(s.gamificacoes) as (string | Gamificacao)[];
    return new Set(v.map((x) => (typeof x === 'string' ? x : x.nome)));
  }

  private textoConfirmacao(s: Selecao, cat: Catalogo) {
    const t = this.taskDe(s);
    const app = this.appDe(cat, s.app);
    const linhas = ['📝 <b>Confirme:</b>'];
    if (t.link) linhas.push(`🔗 ${escapeHtml(t.link)}`);
    linhas.push(`💬 Info extra: ${s.info_extra ? `\n<blockquote>${escapeHtml(s.info_extra)}</blockquote>` : '<i>nenhuma</i>'}`);
    const anexos = JSON.parse(s.anexos ?? '[]') as string[];
    if (anexos.length) linhas.push(`📎 ${anexos.length} anexo(s) enviados por você`);
    linhas.push(`📁 ${escapeHtml(app?.app ?? '?')} — <code>${escapeHtml(app?.pasta ?? '?')}</code>`);
    if (t.empresa === 'funifier') {
      const gs = JSON.parse(s.gamificacoes ?? '[]') as Gamificacao[];
      linhas.push(
        gs.length
          ? `🎯 Gamificações autorizadas:\n${gs.map((g) => `• ${escapeHtml(g.nome)} — conta ${escapeHtml(g.conta)} · <code>${escapeHtml(g.servidor)}</code>`).join('\n')}`
          : '🎯 <b>Nenhuma gamificação cadastrada — despacho bloqueado</b>',
      );
    }
    return linhas.join('\n');
  }

  // Foto/arquivo do João na etapa "informação extra": salva em runs/<selecao>/ e referencia no prompt.
  async onAnexo(fileId: string, nomeSugerido: string, legenda: string | undefined): Promise<boolean> {
    const s = this.selecaoAtiva();
    if (!s || s.etapa !== 'info') return false;
    const f = await this.api.getFile(fileId);
    if (!f.file_path) throw new Error('Telegram não devolveu file_path');
    const res = await fetch(`https://api.telegram.org/file/bot${this.env.TELEGRAM_BOT_TOKEN}/${f.file_path}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`download do anexo falhou: HTTP ${res.status}`);
    const anexos = JSON.parse(s.anexos ?? '[]') as string[];
    const dir = dirAnexos(s.id);
    mkdirSync(dir, { recursive: true });
    const ext = extname(nomeSugerido) || extname(f.file_path) || '.bin';
    const base = nomeSugerido.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 40) || 'anexo';
    const arq = join(dir, `joao-${anexos.length + 1}-${base}${ext}`);
    writeFileSync(arq, Buffer.from(await res.arrayBuffer()));
    anexos.push(arq);
    const info = legenda?.trim() ? [s.info_extra, legenda.trim()].filter(Boolean).join('\n\n') : s.info_extra;
    this.atualizar(s.id, { anexos: JSON.stringify(anexos), info_extra: info });
    log.info('anexo salvo', { selecao: s.id, arquivo: arq });
    await this.api.sendMessage(
      this.chatId,
      `📎 Anexo ${anexos.length} salvo. Mande mais, escreva um texto (encerra a etapa) ou toque em <b>Pular / Continuar</b>.`,
      HTML,
    );
    return true;
  }

  // Texto livre do João: só vale como "informação extra" quando a pergunta atual é essa.
  async onTexto(texto: string): Promise<boolean> {
    const s = this.selecaoAtiva();
    if (!s || s.etapa !== 'info') return false;
    this.atualizar(s.id, { info_extra: [s.info_extra, texto.trim()].filter(Boolean).join('\n\n'), etapa: 'destino' });
    await this.proximaPergunta();
    return true;
  }

  async onAcao(selId: number, acao: string, arg: string | undefined): Promise<string> {
    const s = this.getSelecao(selId);
    const ativa = this.selecaoAtivaId();
    if (!s || s.estado !== 'coletando' || ativa !== s.id) return 'Essa pergunta já foi respondida.';
    const cat = loadCatalogo();
    const empresa = this.taskDe(s).empresa;
    const depoisDoDestino = empresa === 'funifier' ? 'alvo' : 'confirmar';

    const valida: Record<string, string[]> = {
      info: ['pular', 'cancel'],
      destino: ['ok', 'outro', 'cancel'],
      escolher_app: ['app', 'cancel'],
      alvo: ['g', 'gok', 'cancel'],
      confirmar: ['desp', 'reset', 'cancel'],
    };
    if (!valida[s.etapa ?? '']?.includes(acao)) return 'Essa pergunta já foi respondida.';

    switch (acao) {
      case 'cancel':
        this.atualizar(s.id, { estado: 'cancelada', etapa: null });
        await this.api.editMessageReplyMarkup(this.chatId, s.msg_pergunta!).catch(() => {});
        await this.api.sendMessage(this.chatId, '✖ Task cancelada.');
        break;
      case 'pular':
        this.atualizar(s.id, { etapa: 'destino' });
        break;
      case 'ok':
        this.atualizar(s.id, { etapa: depoisDoDestino, gamificacoes: null });
        break;
      case 'outro':
        this.atualizar(s.id, { etapa: 'escolher_app' });
        break;
      case 'app': {
        const app = this.appDe(cat, arg ?? null);
        if (!app || app.empresa !== empresa) return 'App inválido.';
        if ((s.ferramenta === 'teste') !== (app.ferramenta === 'teste')) return 'Task de teste só roda no sandbox (e vice-versa).';
        this.atualizar(s.id, { app: app.app, etapa: depoisDoDestino, gamificacoes: null });
        break;
      }
      case 'g': {
        const gamifs = this.appDe(cat, s.app)?.gamificacoes ?? [];
        const g = gamifs[Number(arg)];
        if (!g) return 'Gamificação inválida.';
        const marcadas = this.gamifsMarcadas(s, gamifs);
        marcadas.has(g.nome) ? marcadas.delete(g.nome) : marcadas.add(g.nome);
        this.atualizar(s.id, { gamificacoes: JSON.stringify([...marcadas]) });
        await this.redesenharAlvo({ ...s, gamificacoes: JSON.stringify([...marcadas]) }, gamifs);
        return `${marcadas.has(g.nome) ? '✅' : '⬜'} ${g.nome}`;
      }
      case 'gok': {
        const gamifs = this.appDe(cat, s.app)?.gamificacoes ?? [];
        const marcadas = this.gamifsMarcadas(s, gamifs);
        const escolhidas = gamifs.filter((g) => marcadas.has(g.nome));
        if (!escolhidas.length) return 'Marque pelo menos uma gamificação.';
        this.atualizar(s.id, { gamificacoes: JSON.stringify(escolhidas), etapa: 'confirmar' });
        break;
      }
      case 'reset':
        this.atualizar(s.id, { etapa: 'info', info_extra: null, gamificacoes: null, anexos: null });
        break;
      case 'desp':
        this.atualizar(s.id, { estado: 'aguardando_despacho', etapa: null });
        await this.api.editMessageReplyMarkup(this.chatId, s.msg_pergunta!).catch(() => {});
        await this.api.sendMessage(this.chatId, `📥 Na fila de despacho de <b>${escapeHtml(s.app ?? '?')}</b>.`, HTML);
        log.info('selecao aguardando despacho', { selecao: s.id, app: s.app, ferramenta: s.ferramenta });
        this.onDespachar(s.id);
        break;
    }
    await this.proximaPergunta();
    return 'Ok';
  }

  private selecaoAtivaId() {
    return this.selecaoAtiva()?.id;
  }

  private async redesenharAlvo(s: Selecao, gamifs: Gamificacao[]) {
    const marcadas = this.gamifsMarcadas(s, gamifs);
    const kb = new InlineKeyboard();
    gamifs.forEach((g, i) => kb.text(`${marcadas.has(g.nome) ? '✅' : '⬜'} ${g.nome} — ${g.conta}`, `s:${s.id}:g:${i}`).row());
    kb.text('➡️ Continuar', `s:${s.id}:gok`).row().text('✖ Cancelar esta task', `s:${s.id}:cancel`);
    if (s.msg_pergunta) await this.api.editMessageReplyMarkup(this.chatId, s.msg_pergunta, { reply_markup: kb });
  }
}
