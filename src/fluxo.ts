// Fase 4 — resumo com seleção e conversa por task até "aguardando_despacho".
//
// callback_data (máx. 64 bytes):
//   t:<resumo>:<idx>         alterna ⬜/✅ de uma task do resumo
//   r:<resumo>:go|lote|none  "Iniciar selecionadas" / "Iniciar em lote" / "Nenhuma hoje"
//   s:<selecao>:<acao>[:arg] respostas da conversa (pular, ok, outro, emp:<empresa>, app:<nome>, g:<i>, gok, desp, reset, cancel)
//
// Atividade avulsa (/nova, B13): ferramenta 'avulsa', sem task em ferramenta de gestão.
//   etapas: instrucoes → info → empresa → escolher_app → (alvo) → confirmar
//
// Lote: as tasks marcadas vão juntas, num só prompt e numa só sessão. A 1ª (líder) passa pela conversa uma vez
//   pelo lote todo (info, app, gamificação); as outras têm lote_de = líder e acompanham o estado dela.
//
// Task de projeto sem app (B15): destino → ambiente → existente (escolher_app, liga o projeto ao app)
//   ou novo: amb_empresa → amb_nome → amb_git → (amb_url) → cria a pasta/clona, adiciona ao Orca e ao apps.yaml.
import { acaoValida } from './dominio/selecao.js';
import { InlineKeyboard, type Api } from 'grammy';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { CAMINHOS } from './caminhos.js';
import { clonar, prepararPasta } from './git.js';
import { dirname, extname, join } from 'node:path';
import { adicionarApp, ligarProjeto, loadCatalogo, type App, type Catalogo, type Env, type Gamificacao } from './config.js';
import type { Gamificacoes } from './gamificacoes.js';
import { getMeta, setMeta, type DB } from './db.js';
import { errInfo, log } from './logger.js';
import type { Executor } from './aplicacao/portas.js';
import { dataLocal, type PmAdapter } from './pm/types.js';
import { comVinculo, vincular } from './mensagens.js';
import { dirAnexos } from './prompt.js';
import { filtrarPorProjeto } from './projetos.js';
import { ICONE, campo, cartao, curto, esc } from './msg.js';
import { buscarTasks, dividirMensagem, escapeHtml, montarResumo } from './resumo.js';

const HTML = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };

// Título de uma atividade avulsa: a primeira linha das instruções.
function tituloDe(instrucoes: string) {
  const l = instrucoes.split('\n')[0].trim();
  return l.length > 80 ? l.slice(0, 79) + '…' : l;
}

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
  ambiente: string | null; // JSON { empresa, nome } enquanto monta um ambiente novo
  lote_de: number | null;
}

interface TaskVista {
  titulo: string;
  descricao?: string | null;
  projeto_nome: string | null;
  projeto_id: string | null;
  link: string | null;
  empresa: 'funifier' | 'dac';
  prazo: string | null;
}

export class Fluxo {
  private chatId: number;
  private enviandoResumo = false;
  // Chamado quando o usuário toca em "Despachar" (ligado ao Despachante no telegram.ts).
  onDespachar: (selecaoId: number) => void = () => {};
  gamificacoes?: Gamificacoes; // cadastro de gamificação a partir da etapa "alvo" (ligado no telegram.ts)

  constructor(
    private env: Env,
    private db: DB,
    private api: Api,
    private adapters: PmAdapter[],
    private orca: Executor,
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
    return comVinculo({}, () => this.enviarResumoInterno(origem));
  }

  private async enviarResumoInterno(origem: 'agendado' | 'catch_up' | 'manual'): Promise<boolean> {
    if (this.enviandoResumo) return false;
    this.enviandoResumo = true;
    try {
      const cat = loadCatalogo();
      const busca = await buscarTasks(this.adapters, this.db);
      const filtro = filtrarPorProjeto(this.db, busca.tasks);
      const r = { ...busca, tasks: filtro.visiveis };
      if (r.erros.length === this.adapters.length) {
        await this.api.sendMessage(
          this.chatId,
          cartao({ icone: ICONE.falha, titulo: 'Não consegui buscar as tasks', corpo: r.erros.map((e) => `${esc(e.ferramenta)}: ${esc(e.erro)}`) }),
          HTML,
        );
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
      vincular({ resumoId });

      // Uma mensagem por empresa; a última com tasks selecionáveis leva também os botões Iniciar/Nenhuma.
      const blocos = montarResumo(r, cat, this.env.TZ_HUB, origem === 'manual' ? 'Suas tasks agora' : 'Resumo do dia');
      const selecionaveis = blocos.reduce((n, b) => n + b.itens.length, 0);
      const ultimoComBotoes = blocos.map((b) => b.itens.length > 0).lastIndexOf(true);
      const rodapes: string[] = [];
      if (filtro.ocultas.length)
        rodapes.push(`${filtro.ocultas.length} task(s) oculta(s) em ${filtro.projetosOcultos} projeto(s) desligado(s) — /projetos`);

      for (const [bi, bloco] of blocos.entries()) {
        const final = bi === ultimoComBotoes;
        const ultimoBloco = bi === blocos.length - 1;
        const extras = [
          final ? 'Marque as tasks e toque em ▶️ Iniciar. Se elas se complementam, 📦 Em lote manda todas juntas para uma sessão.' : null,
          ...(ultimoBloco ? rodapes : []),
        ].filter(Boolean);
        const texto = extras.length ? `${bloco.texto}\n\n<i>${extras.join('\n')}</i>` : bloco.texto;
        const partes = dividirMensagem(texto);
        const kb = this.tecladoItens(
          resumoId,
          bloco.itens.map((i) => ({ idx: i.idx, titulo: i.task.titulo, selecionada: false })),
          final,
        );
        let msgId: number | null = null;
        for (let p = 0; p < partes.length; p++) {
          const ultima = p === partes.length - 1;
          const m = await this.api.sendMessage(this.chatId, partes[p], { ...HTML, ...(ultima && kb ? { reply_markup: kb } : {}) });
          if (ultima) msgId = m.message_id;
        }
        for (const i of bloco.itens) insItem.run(resumoId, i.idx, i.task.ferramenta, i.task.id, i.task.empresa, i.app, msgId);
        if (final) this.db.prepare('UPDATE resumos SET msg_botoes = ? WHERE id = ?').run(msgId, resumoId);
      }
      if (!selecionaveis) this.db.prepare("UPDATE resumos SET estado = 'nenhuma' WHERE id = ?").run(resumoId);
      log.info('resumo enviado', { resumoId, origem, tasks: r.tasks.length, selecionaveis, erros: r.erros.length });
      return true;
    } catch (e) {
      log.error('resumo: falha ao enviar', errInfo(e));
      return false;
    } finally {
      this.enviandoResumo = false;
    }
  }

  private tecladoItens(resumoId: number, itens: { idx: number; titulo: string; selecionada: boolean }[], final: boolean) {
    if (!itens.length) return undefined;
    const kb = new InlineKeyboard();
    for (const i of itens) {
      const t = i.titulo.length > 42 ? i.titulo.slice(0, 41) + '…' : i.titulo;
      kb.text(`${i.selecionada ? '✅' : '⬜'} ${i.idx}. ${t}`, `t:${resumoId}:${i.idx}`).row();
    }
    if (final)
      kb.text('▶️ Iniciar selecionadas', `r:${resumoId}:go`)
        .text('📦 Em lote', `r:${resumoId}:lote`)
        .row()
        .text('💤 Nenhuma hoje', `r:${resumoId}:none`);
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
      .prepare('SELECT msg_id, selecionada FROM resumo_itens WHERE resumo_id = ? AND idx = ?')
      .get(resumoId, idx) as { msg_id: number; selecionada: number } | undefined;
    if (!item) return 'Task não encontrada.';
    this.db.prepare('UPDATE resumo_itens SET selecionada = 1 - selecionada WHERE resumo_id = ? AND idx = ?').run(resumoId, idx);
    const itens = this.db
      .prepare(
        `SELECT ri.idx, ri.selecionada, COALESCE(tv.titulo, ri.task_id) titulo FROM resumo_itens ri
         LEFT JOIN tasks_vistas tv ON tv.ferramenta = ri.ferramenta AND tv.task_id = ri.task_id
         WHERE ri.resumo_id = ? AND ri.msg_id = ? ORDER BY ri.idx`,
      )
      .all(resumoId, item.msg_id) as { idx: number; selecionada: number; titulo: string }[];
    const final = (this.db.prepare('SELECT msg_botoes FROM resumos WHERE id = ?').get(resumoId) as { msg_botoes: number | null }).msg_botoes;
    await this.api.editMessageReplyMarkup(this.chatId, item.msg_id, {
      reply_markup: this.tecladoItens(
        resumoId,
        itens.map((i) => ({ ...i, selecionada: !!i.selecionada })),
        final === item.msg_id,
      ),
    });
    return item.selecionada ? `Task ${idx} desmarcada` : `Task ${idx} marcada`;
  }

  async finalizarResumo(resumoId: number, acao: 'go' | 'lote' | 'none'): Promise<string> {
    if (!this.resumoAberto(resumoId)) return 'Esse resumo já foi fechado.';
    const marcadas = this.db
      .prepare('SELECT idx, ferramenta, task_id, empresa, app_sugerido FROM resumo_itens WHERE resumo_id = ? AND selecionada = 1 ORDER BY idx')
      .all(resumoId) as { idx: number; ferramenta: string; task_id: string; empresa: string; app_sugerido: string | null }[];
    if (acao !== 'none' && !marcadas.length) return 'Marque pelo menos uma task (ou toque em "Nenhuma hoje").';
    if (acao === 'lote' && marcadas.length < 2) return 'Lote precisa de pelo menos duas tasks.';
    if (acao === 'lote' && new Set(marcadas.map((m) => m.empresa)).size > 1) return 'Lote só com tasks da mesma empresa (roda num app só).';

    this.db.prepare('UPDATE resumos SET estado = ? WHERE id = ?').run(acao === 'go' ? 'iniciado' : 'nenhuma', resumoId);
    const msgs = this.db
      .prepare('SELECT DISTINCT msg_id FROM resumo_itens WHERE resumo_id = ? AND msg_id IS NOT NULL')
      .all(resumoId) as { msg_id: number }[];
    for (const m of msgs) await this.api.editMessageReplyMarkup(this.chatId, m.msg_id).catch(() => {});

    if (acao === 'none') return '💤 Nenhuma task hoje';

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
    // No lote, o app da líder é o primeiro app sugerido entre as tasks (dá para trocar na etapa "destino").
    const appLote = marcadas.find((m) => m.app_sugerido)?.app_sugerido ?? null;
    let lider: number | null = null;
    for (const m of marcadas) {
      if (jaEmAndamento.get(m.ferramenta, m.task_id)) {
        repetidas.push(m.idx);
        continue;
      }
      const id = Number(
        ins.run(m.ferramenta, m.task_id, dataLocal(new Date(), this.env.TZ_HUB), acao === 'lote' ? appLote : m.app_sugerido, resumoId, agora, agora)
          .lastInsertRowid,
      );
      if (acao === 'lote') {
        if (lider === null) lider = id;
        else this.atualizar(id, { lote_de: lider, etapa: null });
      }
      novas.push(m.idx);
    }
    if (repetidas.length)
      await this.api.sendMessage(
        this.chatId,
        cartao({ icone: ICONE.aviso, titulo: `Já em andamento: ${repetidas.join(', ')}`, rodape: 'Essas tasks foram ignoradas.' }),
        HTML,
      );
    await this.proximaPergunta();
    if (acao === 'lote' && novas.length > 1) return `Configurando o lote de ${novas.length}`;
    return novas.length ? `Configurando ${novas.length} task(s)` : 'Nenhuma task nova';
  }

  // ───────────────────────────── conversa ─────────────────────────────

  // /nova [instruções]: atividade avulsa (B13), sem task em ferramenta de gestão.
  async criarAvulsa(texto: string) {
    const agora = new Date().toISOString();
    const taskId = `avulsa-${Date.now()}`;
    const instr = texto.trim();
    this.db
      .prepare(
        `INSERT INTO tasks_vistas (ferramenta, task_id, empresa, titulo, descricao, projeto_id, projeto_nome, status, prazo, link, primeira_vez, ultima_vez)
         VALUES ('avulsa', ?, 'dac', ?, ?, NULL, 'atividade avulsa', 'avulsa', NULL, NULL, ?, ?)`,
      )
      .run(taskId, instr ? tituloDe(instr) : 'Atividade avulsa', instr || null, agora, agora);
    this.db
      .prepare(
        `INSERT INTO selecoes (ferramenta, task_id, data_resumo, app, estado, etapa, criado_em, atualizado_em)
         VALUES ('avulsa', ?, ?, NULL, 'coletando', ?, ?, ?)`,
      )
      .run(taskId, dataLocal(new Date(), this.env.TZ_HUB), instr ? 'info' : 'instrucoes', agora, agora);
    await this.proximaPergunta();
  }

  private selecaoAtiva(): Selecao | undefined {
    return this.db.prepare("SELECT * FROM selecoes WHERE estado = 'coletando' AND lote_de IS NULL ORDER BY id LIMIT 1").get() as Selecao | undefined;
  }

  private getSelecao(id: number) {
    return this.db.prepare('SELECT * FROM selecoes WHERE id = ?').get(id) as Selecao | undefined;
  }

  private taskDe(s: Selecao): TaskVista {
    return (
      (this.db
        .prepare('SELECT titulo, descricao, projeto_nome, projeto_id, link, empresa, prazo FROM tasks_vistas WHERE ferramenta = ? AND task_id = ?')
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

  // Mudança de estado da líder vale para o lote todo.
  private atualizar(id: number, campos: Partial<Selecao>) {
    const chaves = Object.keys(campos);
    const agora = new Date().toISOString();
    this.db
      .prepare(`UPDATE selecoes SET ${chaves.map((k) => `${k} = @${k}`).join(', ')}, atualizado_em = @agora WHERE id = @id`)
      .run({ ...campos, id, agora });
    if (campos.estado) this.db.prepare('UPDATE selecoes SET estado = ?, atualizado_em = ? WHERE lote_de = ?').run(campos.estado, agora, id);
  }

  // Outras tasks do lote liderado por `s` (vazio = task sozinha).
  private membros(s: Selecao): Selecao[] {
    return this.db.prepare('SELECT * FROM selecoes WHERE lote_de = ? ORDER BY id').all(s.id) as Selecao[];
  }

  // Contexto das perguntas: a task (com link), o projeto e quantas faltam configurar.
  private contexto(s: Selecao) {
    const t = this.taskDe(s);
    const pendentes = (this.db.prepare("SELECT COUNT(*) n FROM selecoes WHERE estado = 'coletando' AND lote_de IS NULL").get() as { n: number }).n;
    const titulo = esc(curto(t.titulo, 60));
    const membros = this.membros(s);
    return [
      membros.length ? `📦 lote: ${esc(curto(t.titulo, 40))} e mais ${membros.length}` : t.link ? `<a href="${esc(t.link)}">${titulo}</a>` : titulo,
      s.ferramenta === 'avulsa' ? 'avulsa' : t.projeto_nome ? esc(t.projeto_nome) : null,
      pendentes > 1 ? `faltam ${pendentes}` : null,
    ];
  }

  // Toda pergunta: ❓ + a pergunta em negrito, a task em itálico, detalhes e uma dica no rodapé.
  private async perguntar(s: Selecao, pergunta: string, o: { corpo?: (string | null)[]; rodape?: string; kb?: InlineKeyboard } = {}) {
    if (s.msg_pergunta) await this.api.editMessageReplyMarkup(this.chatId, s.msg_pergunta).catch(() => {});
    const texto = cartao({ icone: ICONE.pergunta, titulo: pergunta, contexto: this.contexto(s), corpo: o.corpo, rodape: o.rodape });
    const m = await this.api.sendMessage(this.chatId, texto, { ...HTML, ...(o.kb ? { reply_markup: o.kb } : {}) });
    this.atualizar(s.id, { msg_pergunta: m.message_id });
  }

  private appDe(cat: Catalogo, nome: string | null): App | undefined {
    return cat.apps.find((a) => a.app === nome);
  }

  async proximaPergunta(): Promise<void> {
    const s = this.selecaoAtiva();
    if (!s) return;
    vincular({ selecaoId: s.id });
    const cat = loadCatalogo();
    const app = this.appDe(cat, s.app);
    const kbCancel = (kb: InlineKeyboard) => kb.row().text('✖️ Cancelar task', `s:${s.id}:cancel`);

    switch (s.etapa) {
      case 'instrucoes':
        return this.perguntar(s, 'O que o Claude deve fazer?', {
          rodape: 'Mande as instruções em texto. A primeira linha vira o título.',
          kb: kbCancel(new InlineKeyboard()),
        });

      case 'empresa':
        return this.perguntar(s, 'Em qual empresa?', {
          kb: kbCancel(new InlineKeyboard().text('Funifier', `s:${s.id}:emp:funifier`).text('DAC', `s:${s.id}:emp:dac`)),
        });

      case 'info':
        return this.perguntar(s, 'Algo a acrescentar?', {
          corpo: ['O que foi falado em reunião, no Teams, prints ou arquivos.'],
          rodape: 'Fotos e arquivos: pode mandar vários. Texto: encerra a etapa.',
          kb: kbCancel(new InlineKeyboard().text('⏭️ Pular', `s:${s.id}:pular`)),
        });

      case 'destino': {
        if (!app) {
          this.atualizar(s.id, { etapa: s.ferramenta === 'avulsa' || s.ferramenta === 'teste' ? 'escolher_app' : 'ambiente' });
          return this.proximaPergunta();
        }
        const outrosApps = [
          ...new Set(
            this.membros(s)
              .map((m) => (this.db.prepare('SELECT app_sugerido FROM resumo_itens WHERE resumo_id = ? AND task_id = ?').get(m.resumo_id, m.task_id) as { app_sugerido: string | null } | undefined)?.app_sugerido)
              .filter((a): a is string => !!a && a !== app.app),
          ),
        ];
        return this.perguntar(s, `Rodar em ${esc(app.app)}?`, {
          corpo: [
            `<code>${esc(app.pasta)}</code>`,
            ...(await this.avisosApp(app)),
            outrosApps.length ? `${ICONE.aviso} o lote tem tasks de ${outrosApps.map(esc).join(', ')}; ele roda num app só` : null,
          ],
          kb: kbCancel(new InlineKeyboard().text('✔️ Sim', `s:${s.id}:ok`).text('Escolher outro', `s:${s.id}:outro`)),
        });
      }

      case 'ambiente':
        return this.perguntar(s, 'Este projeto ainda não tem ambiente', {
          corpo: ['Ligo a um app que já existe ou monto um novo (pasta, Orca e hub)?'],
          kb: kbCancel(new InlineKeyboard().text('📁 Usar app existente', `s:${s.id}:amb:existente`).row().text('🆕 Criar ambiente novo', `s:${s.id}:amb:novo`)),
        });

      case 'amb_empresa':
        return this.perguntar(s, 'Em qual empresa criar a pasta?', {
          corpo: [`<code>${esc(join(CAMINHOS.repos, 'FUNIFIER'))}</code> ou <code>${esc(join(CAMINHOS.repos, 'DAC'))}</code>`],
          kb: kbCancel(new InlineKeyboard().text('Funifier', `s:${s.id}:aemp:funifier`).text('DAC', `s:${s.id}:aemp:dac`)),
        });

      case 'amb_nome':
        return this.perguntar(s, 'Nome do diretório?', {
          rodape: 'Também vira o nome do app no hub. Use minúsculas, números e - (ex.: bb-joga-junto).',
          kb: kbCancel(new InlineKeyboard()),
        });

      case 'amb_git': {
        const amb = JSON.parse(s.ambiente ?? '{}') as { empresa: string; nome: string };
        return this.perguntar(s, 'Tem URL do Git para clonar?', {
          corpo: [campo('Pasta', `<code>${esc(pastaAmbiente(amb))}</code>`)],
          rodape: 'Sem URL eu crio a pasta com um git só local (sem remoto), que o Orca exige.',
          kb: kbCancel(new InlineKeyboard().text('🔗 Tenho a URL', `s:${s.id}:agit:url`).text('📁 Só criar a pasta', `s:${s.id}:agit:pasta`)),
        });
      }

      case 'amb_url':
        return this.perguntar(s, 'Qual a URL do Git?', {
          rodape: 'HTTPS ou SSH. Uso o acesso ao Git que já existe no computador.',
          kb: kbCancel(new InlineKeyboard()),
        });

      case 'escolher_app': {
        const empresa = this.taskDe(s).empresa;
        const kb = new InlineKeyboard();
        cat.apps
          .filter((a) =>
            s.ferramenta === 'avulsa'
              ? a.empresa === empresa
              : s.ferramenta === 'teste'
                ? a.ferramenta === 'teste'
                : a.empresa === empresa && a.ferramenta !== 'teste',
          )
          .forEach((a, i) => {
            kb.text(a.app === s.app ? `• ${a.app}` : a.app, `s:${s.id}:app:${a.app}`);
            if (i % 2 === 1) kb.row();
          });
        return this.perguntar(s, `Em qual app da ${empresa === 'dac' ? 'DAC' : 'Funifier'}?`, { kb: kbCancel(kb) });
      }

      case 'alvo': {
        const gamifs = app?.gamificacoes ?? [];
        if (!gamifs.length) {
          return this.perguntar(s, `${esc(app?.app ?? '?')} não tem gamificação vinculada`, {
            corpo: ['A sessão vai usar a gamificação que já conhece. Cadastrar uma agora ou seguir assim?'],
            kb: kbCancel(
              new InlineKeyboard().text('➕ Cadastrar gamificação', `s:${s.id}:gnova`).row().text('⚠️ Seguir sem gamificação', `s:${s.id}:gsem`),
            ),
          });
        }
        return this.perguntar(s, 'Quais gamificações podem ser alteradas?', {
          corpo: gamifs.map((g) => `${esc(g.nome)} · conta ${esc(g.conta)} · <code>${esc(g.servidor)}</code>${g.credencial ? ' · 🔑' : ''}`),
          rodape: 'Marque pelo menos uma.',
          kb: this.tecladoAlvo(s, gamifs),
        });
      }

      case 'confirmar':
        return this.perguntar(s, 'Confirma o despacho?', {
          corpo: this.resumoConfirmacao(s, cat),
          kb: new InlineKeyboard()
            .text('▶️ Despachar', `s:${s.id}:desp`)
            .row()
            .text('↩️ Recomeçar', `s:${s.id}:reset`)
            .text('✖️ Cancelar', `s:${s.id}:cancel`),
        });
    }
  }

  private async avisosApp(app: App): Promise<string[]> {
    const avisos: string[] = [];
    if (!existsSync(app.pasta)) avisos.push(`${ICONE.aviso} pasta não existe`);
    try {
      const repos = await this.orca.listRepos();
      if (!repos.some((r) => r.path === app.pasta)) avisos.push(`${ICONE.aviso} não está aberto no Orca`);
    } catch {
      avisos.push(`${ICONE.aviso} Orca inacessível agora`);
    }
    return avisos;
  }

  // Durante a etapa "alvo", selecoes.gamificacoes guarda os NOMES marcados; na confirmação, os objetos completos.
  private gamifsMarcadas(s: Selecao, gamifs: Gamificacao[]): Set<string> {
    if (s.gamificacoes === null) return new Set(gamifs.filter((g) => g.padrao).map((g) => g.nome));
    const v = JSON.parse(s.gamificacoes) as (string | Gamificacao)[];
    return new Set(v.map((x) => (typeof x === 'string' ? x : x.nome)));
  }

  private resumoConfirmacao(s: Selecao, cat: Catalogo): string[] {
    const t = this.taskDe(s);
    const app = this.appDe(cat, s.app);
    const anexos = JSON.parse(s.anexos ?? '[]') as string[];
    const linhas = [campo('App', `${esc(app?.app ?? '?')} · <code>${esc(app?.pasta ?? '?')}</code>`)];
    const membros = this.membros(s);
    if (membros.length)
      linhas.push(campo(`Lote de ${membros.length + 1}`, '\n' + [s, ...membros].map((m, i) => `${i + 1}. ${esc(curto(this.taskDe(m).titulo, 70))}`).join('\n')));
    if (s.ferramenta === 'avulsa' && t.descricao) linhas.push(campo('Instruções', `\n<blockquote>${esc(t.descricao)}</blockquote>`));
    linhas.push(campo('Info extra', s.info_extra ? `\n<blockquote>${esc(s.info_extra)}</blockquote>` : 'nenhuma'));
    if (anexos.length) linhas.push(campo('Anexos', String(anexos.length)));
    if (t.empresa === 'funifier') {
      const gs = JSON.parse(s.gamificacoes ?? '[]') as Gamificacao[];
      linhas.push(
        gs.length
          ? campo('Gamificações', gs.map((g) => `${esc(g.nome)} (${esc(g.conta)})`).join(', '))
          : `${ICONE.aviso} <b>Sem gamificação vinculada</b> — a sessão decide o alvo`,
      );
    }
    return linhas;
  }

  // Foto/arquivo do usuário na etapa "informação extra": salva em runs/<selecao>/ e referencia no prompt.
  async onAnexo(fileId: string, nomeSugerido: string, legenda: string | undefined): Promise<boolean> {
    const s = this.selecaoAtiva();
    if (!s || (s.etapa !== 'info' && s.etapa !== 'instrucoes')) return false;
    vincular({ selecaoId: s.id });
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
    const arq = join(dir, `usuario-${anexos.length + 1}-${base}${ext}`);
    writeFileSync(arq, Buffer.from(await res.arrayBuffer()));
    anexos.push(arq);
    const info = legenda?.trim() ? [s.info_extra, legenda.trim()].filter(Boolean).join('\n\n') : s.info_extra;
    this.atualizar(s.id, { anexos: JSON.stringify(anexos), info_extra: info });
    log.info('anexo salvo', { selecao: s.id, arquivo: arq });
    await this.api.sendMessage(this.chatId, `${ICONE.anexo} Anexo ${anexos.length} salvo.`, HTML);
    return true;
  }

  // Texto livre do usuário: só vale como "informação extra" quando a pergunta atual é essa.
  async onTexto(texto: string): Promise<boolean> {
    const s = this.selecaoAtiva();
    if (s?.etapa === 'amb_nome' || s?.etapa === 'amb_url') {
      vincular({ selecaoId: s.id });
      return this.textoAmbiente(s, texto.trim());
    }
    if (!s || (s.etapa !== 'info' && s.etapa !== 'instrucoes')) return false;
    vincular({ selecaoId: s.id });
    if (s.etapa === 'instrucoes') {
      this.db
        .prepare('UPDATE tasks_vistas SET titulo = ?, descricao = ? WHERE ferramenta = ? AND task_id = ?')
        .run(tituloDe(texto.trim()), texto.trim(), s.ferramenta, s.task_id);
      this.atualizar(s.id, { etapa: 'info' });
      await this.proximaPergunta();
      return true;
    }
    this.atualizar(s.id, { info_extra: [s.info_extra, texto.trim()].filter(Boolean).join('\n\n'), etapa: depoisDaInfo(s) });
    await this.proximaPergunta();
    return true;
  }

  async onAcao(selId: number, acao: string, arg: string | undefined): Promise<string> {
    const s = this.getSelecao(selId);
    if (s) vincular({ selecaoId: s.id });
    const ativa = this.selecaoAtivaId();
    if (!s || s.estado !== 'coletando' || ativa !== s.id) return 'Essa pergunta já foi respondida.';
    const cat = loadCatalogo();
    const empresa = this.taskDe(s).empresa;
    const depoisDoDestino = empresa === 'funifier' ? 'alvo' : 'confirmar';

    if (!acaoValida(s.etapa, acao)) return 'Essa pergunta já foi respondida.';

    switch (acao) {
      case 'cancel':
        this.atualizar(s.id, { estado: 'cancelada', etapa: null });
        await this.api.editMessageReplyMarkup(this.chatId, s.msg_pergunta!).catch(() => {});
        await this.api.sendMessage(
          this.chatId,
          cartao({ icone: ICONE.cancelado, titulo: 'Task cancelada', contexto: this.contexto(s) }),
          HTML,
        );
        break;
      case 'pular':
        this.atualizar(s.id, { etapa: depoisDaInfo(s) });
        break;
      case 'emp': {
        if (arg !== 'funifier' && arg !== 'dac') return 'Empresa inválida.';
        this.db.prepare('UPDATE tasks_vistas SET empresa = ? WHERE ferramenta = ? AND task_id = ?').run(arg, s.ferramenta, s.task_id);
        this.atualizar(s.id, { etapa: 'escolher_app', app: null });
        break;
      }
      case 'ok':
        this.atualizar(s.id, { etapa: depoisDoDestino, gamificacoes: null });
        break;
      case 'outro':
        this.atualizar(s.id, { etapa: 'escolher_app' });
        break;
      case 'app': {
        const app = this.appDe(cat, arg ?? null);
        if (!app || app.empresa !== empresa) return 'App inválido.';
        if (s.ferramenta !== 'avulsa' && (s.ferramenta === 'teste') !== (app.ferramenta === 'teste'))
          return 'Task de teste só roda no sandbox (e vice-versa).';
        this.atualizar(s.id, { app: app.app, etapa: depoisDoDestino, gamificacoes: null });
        await this.ligarSeSemApp(s, app);
        break;
      }
      case 'amb':
        this.atualizar(s.id, { etapa: arg === 'novo' ? 'amb_empresa' : 'escolher_app' });
        break;
      case 'aemp':
        if (arg !== 'funifier' && arg !== 'dac') return 'Empresa inválida.';
        this.atualizar(s.id, { etapa: 'amb_nome', ambiente: JSON.stringify({ empresa: arg }) });
        break;
      case 'agit':
        if (arg === 'url') this.atualizar(s.id, { etapa: 'amb_url' });
        else {
          await this.api.editMessageReplyMarkup(this.chatId, s.msg_pergunta!).catch(() => {});
          return (await this.criarAmbiente(s, null)) ? 'Ambiente pronto' : 'Não deu certo';
        }
        break;
      case 'gnova':
        if (!this.gamificacoes || !s.app) return 'Cadastro indisponível.';
        await this.api.editMessageReplyMarkup(this.chatId, s.msg_pergunta!).catch(() => {});
        await this.gamificacoes.iniciar(s.app, s.id);
        return 'Nova gamificação';
      case 'gsem':
        this.atualizar(s.id, { gamificacoes: '[]', etapa: 'confirmar' });
        break;
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
        this.atualizar(s.id, { etapa: 'info', info_extra: null, gamificacoes: null, anexos: null, ...(s.ferramenta === 'avulsa' ? { app: null } : {}) });
        break;
      case 'desp':
        this.atualizar(s.id, { estado: 'aguardando_despacho', etapa: null });
        await this.api.editMessageReplyMarkup(this.chatId, s.msg_pergunta!).catch(() => {});
        log.info('selecao aguardando despacho', { selecao: s.id, app: s.app, ferramenta: s.ferramenta });
        this.onDespachar(s.id);
        break;
    }
    await this.proximaPergunta();
    return 'Ok';
  }

  // ───────────────────────────── ambiente (B15) ─────────────────────────────

  private async textoAmbiente(s: Selecao, t: string): Promise<boolean> {
    const aviso = (titulo: string, rodape: string) =>
      this.api.sendMessage(this.chatId, cartao({ icone: ICONE.aviso, titulo, rodape }), HTML).then(() => true);
    if (s.etapa === 'amb_nome') {
      const nome = t.toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{1,59}$/.test(nome)) return aviso('Nome inválido', 'Use minúsculas, números, - _ e . (ex.: bb-joga-junto).');
      if (loadCatalogo().apps.some((a) => a.app === nome)) return aviso(`Já existe o app ${esc(nome)}`, 'Escolha outro nome, ou cancele e use "app existente".');
      const amb = { ...(JSON.parse(s.ambiente ?? '{}') as object), nome };
      this.atualizar(s.id, { ambiente: JSON.stringify(amb), etapa: 'amb_git' });
      await this.proximaPergunta();
      return true;
    }
    // amb_url
    if (t.startsWith('-') || !/^(https?:\/\/\S+|ssh:\/\/\S+|[\w.-]+@[\w.-]+:\S+)$/.test(t)) return aviso('URL inválida', 'Ex.: https://github.com/org/repo.git ou git@github.com:org/repo.git');
    await this.api.editMessageReplyMarkup(this.chatId, s.msg_pergunta!).catch(() => {});
    await this.criarAmbiente(s, t);
    return true;
  }

  // Cria a pasta (ou clona), adiciona ao Orca e grava o app no apps.yaml ligado ao projeto da task.
  private async criarAmbiente(s: Selecao, url: string | null): Promise<boolean> {
    const amb = JSON.parse(s.ambiente ?? '{}') as { empresa: 'funifier' | 'dac'; nome: string };
    const pasta = pastaAmbiente(amb);
    const t = this.taskDe(s);
    await this.api.sendMessage(
      this.chatId,
      cartao({ icone: ICONE.fila, titulo: url ? `Clonando ${esc(amb.nome)}` : `Criando ${esc(amb.nome)}`, contexto: [`<code>${esc(pasta)}</code>`] }),
      HTML,
    );
    try {
      if (existsSync(pasta)) {
        if (url) throw new Error('a pasta já existe; escolha "Só criar a pasta" para usar a que está lá, ou outro nome');
      }
      if (url) {
        mkdirSync(dirname(pasta), { recursive: true });
        await clonar(url, pasta);
      } else await prepararPasta(pasta);
      await this.orca.addRepo(pasta);
      adicionarApp({
        app: amb.nome,
        empresa: amb.empresa,
        ferramenta: s.ferramenta as App['ferramenta'],
        pasta,
        projeto: t.projeto_id,
      });
    } catch (e) {
      log.warn('ambiente: falha', { selecao: s.id, pasta, ...errInfo(e) });
      await this.api.sendMessage(
        this.chatId,
        cartao({ icone: ICONE.falha, titulo: `Não consegui montar ${esc(amb.nome)}`, contexto: this.contexto(s), corpo: [esc((e as Error).message)] }),
        HTML,
      );
      this.atualizar(s.id, { etapa: 'amb_git' });
      await this.proximaPergunta();
      return false;
    }
    log.info('ambiente: criado', { selecao: s.id, app: amb.nome, pasta, clonado: !!url });
    this.atualizar(s.id, { app: amb.nome, ambiente: null, etapa: amb.empresa === 'funifier' ? 'alvo' : 'confirmar', gamificacoes: null });
    await this.api.sendMessage(
      this.chatId,
      cartao({
        icone: ICONE.ok,
        titulo: `Ambiente ${esc(amb.nome)} pronto`,
        contexto: [url ? 'clonado' : 'pasta criada', 'no Orca', 'no apps.yaml'],
        rodape: t.projeto_nome ? `As próximas tasks de ${esc(t.projeto_nome)} já vêm com este app.` : undefined,
      }),
      HTML,
    );
    await this.proximaPergunta();
    return true;
  }

  // App escolhido para uma task cujo projeto ainda não tem app: liga o projeto a ele no apps.yaml.
  private async ligarSeSemApp(s: Selecao, app: App) {
    const t = this.taskDe(s);
    if (!t.projeto_id || (s.ferramenta !== 'funifier-pm' && s.ferramenta !== 'bnexo') || app.ferramenta !== s.ferramenta) return;
    if (loadCatalogo().apps.some((a) => a.ferramenta === s.ferramenta && a.projetos_na_ferramenta.includes(t.projeto_id!))) return;
    try {
      ligarProjeto(app.app, t.projeto_id);
      log.info('ambiente: projeto ligado', { app: app.app, projeto: t.projeto_id });
      await this.api.sendMessage(
        this.chatId,
        cartao({ icone: ICONE.ok, titulo: `${esc(t.projeto_nome ?? t.projeto_id)} ligado a ${esc(app.app)}`, rodape: 'As próximas tasks desse projeto já vêm com este app.' }),
        HTML,
      );
    } catch (e) {
      log.warn('ambiente: falha ao ligar projeto', { app: app.app, ...errInfo(e) });
    }
  }

  private selecaoAtivaId() {
    return this.selecaoAtiva()?.id;
  }

  private tecladoAlvo(s: Selecao, gamifs: Gamificacao[]) {
    const marcadas = this.gamifsMarcadas(s, gamifs);
    const kb = new InlineKeyboard();
    gamifs.forEach((g, i) => kb.text(`${marcadas.has(g.nome) ? '✅' : '⬜'} ${g.nome} — ${g.conta}`, `s:${s.id}:g:${i}`).row());
    return kb
      .text('➡️ Continuar', `s:${s.id}:gok`)
      .text('➕ Nova', `s:${s.id}:gnova`)
      .row()
      .text('✖️ Cancelar task', `s:${s.id}:cancel`);
  }

  private async redesenharAlvo(s: Selecao, gamifs: Gamificacao[]) {
    if (s.msg_pergunta) await this.api.editMessageReplyMarkup(this.chatId, s.msg_pergunta, { reply_markup: this.tecladoAlvo(s, gamifs) });
  }

}

// Avulsa escolhe empresa e app; task de ferramenta já tem app sugerido.
function depoisDaInfo(s: { ferramenta: string }) {
  return s.ferramenta === 'avulsa' ? 'empresa' : 'destino';
}

function pastaAmbiente(a: { empresa?: string; nome?: string }) {
  return join(CAMINHOS.repos, a.empresa === 'dac' ? 'DAC' : 'FUNIFIER', a.nome ?? '');
}
