// Bot do Telegram (grammY, long polling). Só aceita o chat do João (TELEGRAM_CHAT_ID):
// o bot controla terminais no computador, então qualquer outro chat é ignorado e registrado.
import { Bot, type Context } from 'grammy';
import { existsSync } from 'node:fs';
import { loadCatalogo, type Env } from './config.js';
import { contagens, type DB } from './db.js';
import { errInfo, log } from './logger.js';
import type { Orca } from './orca.js';
import type { PmAdapter } from './pm/types.js';
import { buscarTasks, dividirMensagem, escapeHtml, montarResumo } from './resumo.js';

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

  bot.command('start', (ctx) =>
    ctx.reply('Hub de tasks ativo.\n\n/status — Orca, MCPs, fila e despachos\n/tarefas — resumo das tasks agora'),
  );

  bot.command('status', async (ctx) => {
    await ctx.replyWithChatAction('typing');
    await ctx.reply(await montarStatus(deps), { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  });

  bot.command('tarefas', async (ctx) => {
    await ctx.reply('🔎 Buscando suas tasks no Funifier PM e no Bnexo…');
    await enviarResumo(ctx, deps);
  });

  bot.on('message', (ctx) => ctx.reply('Não entendi. Use /status ou /tarefas.'));

  bot.catch((err) => log.error('telegram: erro no handler', { ...errInfo(err.error), updateId: err.ctx.update.update_id }));

  return bot;

  async function enviarResumo(ctx: Context, d: Deps) {
    const cat = loadCatalogo();
    const r = await buscarTasks(adapters, db);
    for (const msg of montarResumo(r, cat, d.env.TZ_HUB)) {
      for (const parte of dividirMensagem(msg)) {
        await ctx.reply(parte, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      }
    }
    log.info('resumo enviado', { tasks: r.tasks.length, erros: r.erros.length });
  }
}

async function montarStatus({ env, db, orca, adapters }: Deps): Promise<string> {
  const linhas: string[] = ['<b>Status do hub</b>', ''];

  let reposOrca: Set<string> | null = null;
  try {
    const s = await orca.status();
    linhas.push(`${s.ok ? '🟢' : '🔴'} Orca ${escapeHtml(s.versao ?? '')} — ${escapeHtml(s.runtime.state)}`);
    reposOrca = new Set((await orca.listRepos()).map((r) => r.path));
  } catch (e) {
    linhas.push(`🔴 Orca inacessível: ${escapeHtml((e as Error).message)}`);
  }

  for (const a of adapters) {
    try {
      linhas.push(`🟢 ${a.nome}: ${escapeHtml(await a.ping())}`);
    } catch (e) {
      linhas.push(`🔴 ${a.nome}: ${escapeHtml((e as Error).message)}`);
    }
  }

  try {
    const cat = loadCatalogo();
    const comProjeto = cat.apps.filter((a) => a.projetos_na_ferramenta.length > 0);
    linhas.push('', `📚 apps.yaml: ${cat.apps.length} apps, ${comProjeto.length} ligados a projetos`);
    const semPasta = cat.apps.filter((a) => !existsSync(a.pasta)).map((a) => a.app);
    if (semPasta.length) linhas.push(`⚠️ Pasta inexistente: ${escapeHtml(semPasta.join(', '))}`);
    if (reposOrca) {
      const foraOrca = comProjeto.filter((a) => !reposOrca!.has(a.pasta)).map((a) => a.app);
      if (foraOrca.length) linhas.push(`⚠️ Com projeto, mas fora do Orca: ${escapeHtml(foraOrca.join(', '))}`);
    }
    const semGamif = comProjeto.filter((a) => a.empresa === 'funifier' && !a.gamificacoes?.length).length;
    if (semGamif) linhas.push(`ℹ️ ${semGamif} apps da Funifier sem gamificação cadastrada (não despacham)`);
  } catch (e) {
    linhas.push(`🔴 ${escapeHtml((e as Error).message)}`);
  }

  const c = contagens(db);
  linhas.push('', `📥 Aguardando despacho: ${c.aguardandoDespacho} · Fila: ${c.fila}`);
  linhas.push(
    c.emAndamento.length
      ? `⚙️ Em andamento:\n${c.emAndamento.map((d) => `• #${d.id} ${escapeHtml(d.app)} — ${d.estado}`).join('\n')}`
      : '⚙️ Nenhum despacho em andamento',
  );
  linhas.push('', `✍️ Escrita nas ferramentas: ${env.HUB_ESCRITA_PM ? 'LIGADA' : 'desligada (modo construção)'}`);
  return linhas.join('\n');
}
