// Bot do Telegram (grammY, long polling). Só aceita o chat do usuário (TELEGRAM_CHAT_ID):
// o bot controla terminais no computador, então qualquer outro chat é ignorado e registrado.
import { Bot, InlineKeyboard } from 'grammy';
import { existsSync } from 'node:fs';
import { loadCatalogo, type Env } from './config.js';
import { contagens, type DB } from './db.js';
import { errInfo, log } from './logger.js';
import type { Orca } from './orca.js';
import type { PmAdapter } from './pm/types.js';
import { Despachante } from './despacho.js';
import { Fluxo } from './fluxo.js';
import { Gamificacoes } from './gamificacoes.js';
import { limparRunsManual } from './limpeza.js';
import { instalarRegistro, limparMensagens } from './mensagens.js';
import { Projetos } from './projetos.js';
import { Regras } from './regras.js';
import { ICONE, cartao } from './msg.js';
import { escapeHtml } from './resumo.js';

export const COMANDOS = [
  { command: 'tarefas', description: 'Suas tasks agora, para selecionar' },
  { command: 'nova', description: 'Atividade avulsa: /nova <instruções>' },
  { command: 'continuar', description: 'Próximos passos das tasks concluídas' },
  { command: 'status', description: 'Orca, ferramentas, fila e despachos' },
  { command: 'projetos', description: 'Projetos que entram na listagem' },
  { command: 'regras', description: 'Regras de trabalho por empresa' },
  { command: 'gamificacoes', description: 'Gamificações e credenciais por app' },
  { command: 'limpar', description: 'Limpa a conversa' },
  { command: 'limpar_runs', description: 'Apaga os arquivos de instruções (runs/)' },
];

export interface Deps {
  env: Env;
  db: DB;
  orca: Orca;
  adapters: PmAdapter[];
}

export function createBot(deps: Deps) {
  const { env, db, orca, adapters } = deps;
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  // Filtro obrigatório de chat — o primeiro middleware, antes de qualquer handler.
  bot.use(async (ctx, next) => {
    if (String(ctx.chat?.id) === env.TELEGRAM_CHAT_ID) return next();
    log.warn('telegram: update de chat não autorizado ignorado', {
      chatId: ctx.chat?.id ?? null,
      chatType: ctx.chat?.type ?? null,
      fromId: ctx.from?.id ?? null,
      fromUsername: ctx.from?.username ?? null,
      updateType: Object.keys(ctx.update).filter((k) => k !== 'update_id'),
    });
  });

  // Registro das mensagens para o /limpar (depois do filtro de chat).
  instalarRegistro(bot, db);
  const chatId = Number(env.TELEGRAM_CHAT_ID);

  bot.command('start', (ctx) =>
    ctx.reply(
      cartao({
        icone: ICONE.lista,
        titulo: 'Hub de tasks',
        corpo: [
          COMANDOS.map((c) => `/${c.command} — ${escapeHtml(c.description)}`).join('\n'),
          '',
          '<b>Ícones</b>',
          `${ICONE.rodando} rodando · ${ICONE.fila} na fila · ${ICONE.voce} precisa de você`,
          `${ICONE.ok} concluída · ${ICONE.revisao} revisar · ${ICONE.bloqueado} bloqueada`,
          `${ICONE.falha} interrompida · ${ICONE.aviso} aviso · ${ICONE.pergunta} espera resposta`,
        ],
      }),
      { parse_mode: 'HTML' },
    ),
  );

  bot.command('status', async (ctx) => {
    await ctx.replyWithChatAction('typing');
    await ctx.reply(await montarStatus(deps), { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  });

  const fluxo = new Fluxo(env, db, bot.api, adapters, orca);
  const regras = new Regras(db, bot.api, chatId);
  const projetos = new Projetos(db, bot.api, chatId);
  const gamificacoes = new Gamificacoes(db, bot.api, chatId);
  fluxo.gamificacoes = gamificacoes;
  gamificacoes.onConcluido = () => fluxo.proximaPergunta();
  const despachante = new Despachante(env, db, bot.api, orca, adapters);
  fluxo.onDespachar = (id) => despachante.enfileirar(id);

  bot.command('tarefas', async (ctx) => {
    await ctx.reply('🔎 Buscando suas tasks no Funifier PM e no Bnexo…');
    await fluxo.enviarResumo('manual');
  });

  bot.command('nova', (ctx) => fluxo.criarAvulsa(ctx.match));
  bot.command('continuar', () => despachante.listarConcluidos());
  bot.command('projetos', () => projetos.comando());
  bot.command('regras', () => regras.comando());
  bot.command('gamificacoes', () => gamificacoes.comando());

  bot.command('limpar', (ctx) =>
    ctx.reply(cartao({ icone: ICONE.pergunta, titulo: 'Limpar a conversa?' }), {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('🧹 Limpar', 'l:ok').text('✖️ Cancelar', 'l:no'),
    }),
  );
  bot.command('limpar_runs', (ctx) =>
    ctx.reply(
      cartao({
        icone: ICONE.pergunta,
        titulo: 'Apagar quais arquivos de instruções?',
        contexto: ['prompts .md, mídias e anexos de runs/; credenciais ficam'],
        rodape: 'Os de tasks em andamento nunca são apagados.',
      }),
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('Só das concluídas', 'u:concluidas')
          .text('Todos', 'u:todas')
          .row()
          .text('✖️ Cancelar', 'u:no'),
      },
    ),
  );

  bot.on('callback_query:data', async (ctx) => {
    const [tipo, a, b, c] = ctx.callbackQuery.data.split(':');
    let resposta = '';
    if (tipo === 't') resposta = await fluxo.alternarItem(Number(a), Number(b));
    else if (tipo === 'r' && (b === 'go' || b === 'lote' || b === 'none'))
      resposta = await fluxo.finalizarResumo(Number(a), b);
    else if (tipo === 's') resposta = await fluxo.onAcao(Number(a), b, c);
    else if (tipo === 'f') resposta = await despachante.onBotao(Number(a), b, c, ctx.callbackQuery.message!.message_id);
    else if (tipo === 'g') resposta = await regras.onBotao(a, b, ctx.callbackQuery.message!.message_id);
    else if (tipo === 'm') resposta = await gamificacoes.onBotao(a, b, c, ctx.callbackQuery.message!.message_id);
    else if (tipo === 'p') resposta = await projetos.alternar(Number(a), ctx.callbackQuery.message!.message_id);
    else if (tipo === 'l') {
      const msgId = ctx.callbackQuery.message!.message_id;
      if (a === 'ok') {
        await ctx.answerCallbackQuery({ text: 'Limpando…' }).catch(() => {});
        await limparMensagens(db, bot.api, chatId, msgId);
        return;
      }
      await bot.api.deleteMessage(chatId, msgId).catch(() => {});
      resposta = 'Cancelado';
    } else if (tipo === 'u') {
      const msgId = ctx.callbackQuery.message!.message_id;
      await bot.api.editMessageReplyMarkup(chatId, msgId).catch(() => {});
      if (a === 'concluidas' || a === 'todas') {
        const n = limparRunsManual(db, a);
        await ctx.reply(
          cartao({ icone: ICONE.ok, titulo: `${n} item(ns) apagado(s) de runs/`, contexto: [a === 'todas' ? 'todos, menos em andamento' : 'só das concluídas'] }),
          { parse_mode: 'HTML' },
        );
        resposta = 'Feito';
      } else resposta = 'Cancelado';
    }
    await ctx.answerCallbackQuery({ text: resposta.slice(0, 190) }).catch(() => {});
  });

  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return ctx.reply('Comando desconhecido. Use /start para ver os comandos.');
    // Conversas abertas por botão vêm antes da coleta de info das tasks.
    if (await gamificacoes.onTexto(ctx.message.text, ctx.message.message_id)) return;
    if (await regras.onTexto(ctx.message.text)) return;
    if (await despachante.onTexto(ctx.message.text)) return;
    if (!(await fluxo.onTexto(ctx.message.text))) await ctx.reply('Não entendi. Use /status ou /tarefas.');
  });

  bot.on(['message:photo', 'message:document'], async (ctx) => {
    const m = ctx.message;
    const foto = m.photo?.at(-1); // maior resolução
    const fileId = foto?.file_id ?? m.document!.file_id;
    const nome = m.document?.file_name ?? `foto-${m.message_id}.jpg`;
    if (!(await fluxo.onAnexo(fileId, nome, m.caption)))
      await ctx.reply('Só aceito anexos enquanto configuro uma task (etapa de instruções ou informação extra).');
  });

  bot.on('message', (ctx) => ctx.reply('Não entendi. Use /status ou /tarefas.'));

  bot.catch((err) => log.error('telegram: erro no handler', { ...errInfo(err.error), updateId: err.ctx.update.update_id }));

  return { bot, fluxo, despachante };
}

async function montarStatus({ env, db, orca, adapters }: Deps): Promise<string> {
  const conexoes: string[] = [];
  let reposOrca: Set<string> | null = null;
  try {
    const st = await orca.status();
    conexoes.push(`${st.ok ? '🟢' : '🔴'} Orca ${escapeHtml(st.versao ?? '')} · ${escapeHtml(st.runtime.state)}`);
    reposOrca = new Set((await orca.listRepos()).map((r) => r.path));
  } catch (e) {
    conexoes.push(`🔴 Orca inacessível: ${escapeHtml((e as Error).message)}`);
  }
  for (const a of adapters) {
    try {
      conexoes.push(`🟢 ${a.nome} · ${escapeHtml(await a.ping())}`);
    } catch (e) {
      conexoes.push(`🔴 ${a.nome}: ${escapeHtml((e as Error).message)}`);
    }
  }

  const catalogo: string[] = [];
  try {
    const cat = loadCatalogo();
    const comProjeto = cat.apps.filter((a) => a.projetos_na_ferramenta.length > 0);
    catalogo.push(`${cat.apps.length} apps · ${comProjeto.length} ligados a projetos`);
    const semPasta = cat.apps.filter((a) => !existsSync(a.pasta)).map((a) => a.app);
    if (semPasta.length) catalogo.push(`${ICONE.aviso} pasta inexistente: ${escapeHtml(semPasta.join(', '))}`);
    if (reposOrca) {
      const foraOrca = comProjeto.filter((a) => !reposOrca!.has(a.pasta)).map((a) => a.app);
      if (foraOrca.length) catalogo.push(`${ICONE.aviso} fora do Orca: ${escapeHtml(foraOrca.join(', '))}`);
    }
    const semGamif = comProjeto.filter((a) => a.empresa === 'funifier' && !a.gamificacoes?.length).length;
    if (semGamif) catalogo.push(`${semGamif} apps da Funifier sem gamificação vinculada (despacham com aviso)`);
  } catch (e) {
    catalogo.push(`🔴 ${escapeHtml((e as Error).message)}`);
  }

  const c = contagens(db);
  const trabalho = [
    `<b>Fila:</b> ${c.fila} · <b>aguardando despacho:</b> ${c.aguardandoDespacho}`,
    ...(c.emAndamento.length
      ? c.emAndamento.map((d) => `${d.estado === 'aguardando_usuario' ? ICONE.voce : d.estado === 'pausado_limite' ? ICONE.pausa : ICONE.rodando} ${escapeHtml(d.app)} · ${d.estado.replace('_', ' ')}`)
      : ['Nada rodando agora.']),
  ];

  return cartao({
    icone: ICONE.status,
    titulo: 'Status do hub',
    corpo: [
      '<b>Conexões</b>',
      ...conexoes,
      '',
      '<b>Trabalho</b>',
      ...trabalho,
      '',
      '<b>Catálogo</b>',
      ...catalogo,
    ],
    rodape: `Status nas ferramentas: ${env.HUB_ESCRITA_PM ? 'ligado' : 'desligado'} · comentários: ${env.HUB_COMENTARIOS_PM ? 'ligados' : 'só com comando'}`,
  });
}
