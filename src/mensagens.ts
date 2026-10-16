// Registro das mensagens do chat (do bot e do João) para o /limpar (B10).
//
// Cada update do Telegram e cada laço em segundo plano roda dentro de um "vínculo" (AsyncLocalStorage);
// quem souber a que task/resumo a conversa pertence chama vincular(), e toda mensagem enviada ou
// recebida depois disso fica registrada com esse vínculo.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Api, Bot } from 'grammy';
import type { DB } from './db.js';
import { log } from './logger.js';

export interface Vinculo {
  selecaoId?: number;
  resumoId?: number;
}

const als = new AsyncLocalStorage<Vinculo>();
const LIMITE_TELEGRAM_MS = 48 * 3600_000; // o Telegram só deixa apagar mensagens com menos de 48 h

export function comVinculo<T>(v: Vinculo, fn: () => T): T {
  return als.run({ ...v }, fn);
}

export function vincular(v: Vinculo) {
  const s = als.getStore();
  if (s) Object.assign(s, v);
}

function registrar(db: DB, msgId: number, v: Vinculo) {
  db.prepare('INSERT OR REPLACE INTO mensagens (msg_id, selecao_id, resumo_id, criado_em) VALUES (?, ?, ?, ?)').run(
    msgId,
    v.selecaoId ?? null,
    v.resumoId ?? null,
    new Date().toISOString(),
  );
}

// Registra as mensagens enviadas pelo bot e as recebidas do João (chamar depois do filtro de chat).
export function instalarRegistro(bot: Bot, db: DB) {
  bot.api.config.use(async (prev, method, payload, signal) => {
    const res = await prev(method, payload, signal);
    if (res.ok && /^send(Message|Photo|Document)$/.test(method)) {
      const id = (res.result as { message_id?: number }).message_id;
      if (id) registrar(db, id, { ...(als.getStore() ?? {}) });
    }
    return res;
  });
  bot.use((ctx, next) =>
    comVinculo({}, async () => {
      try {
        await next();
      } finally {
        if (ctx.message) registrar(db, ctx.message.message_id, { ...(als.getStore() ?? {}) });
      }
    }),
  );
}

// Encerrada = task encerrada/cancelada/interrompida, resumo fechado ou mensagem solta (comandos, /status…).
// Fica: o que é de task em andamento (inclusive concluída esperando os próximos passos) e o resumo aberto.
const SQL_ENCERRADAS = `
  SELECT m.msg_id FROM mensagens m
  LEFT JOIN selecoes s ON s.id = m.selecao_id
  LEFT JOIN resumos r ON r.id = m.resumo_id
  WHERE m.criado_em > ? AND (
    (m.selecao_id IS NOT NULL AND (s.id IS NULL OR s.estado IN ('encerrada', 'cancelada', 'interrompida')))
    OR (m.selecao_id IS NULL AND m.resumo_id IS NOT NULL AND (r.id IS NULL OR r.estado <> 'aberto'))
    OR (m.selecao_id IS NULL AND m.resumo_id IS NULL)
  )`;

export async function limparMensagens(db: DB, api: Api, chatId: number, modo: 'encerradas' | 'tudo', alemDe: number[] = []) {
  const corte = new Date(Date.now() - LIMITE_TELEGRAM_MS + 60_000).toISOString();
  db.prepare('DELETE FROM mensagens WHERE criado_em <= ?').run(corte);
  const ids = (
    modo === 'tudo'
      ? (db.prepare('SELECT msg_id FROM mensagens WHERE criado_em > ?').all(corte) as { msg_id: number }[])
      : (db.prepare(SQL_ENCERRADAS).all(corte) as { msg_id: number }[])
  ).map((r) => r.msg_id);
  const todos = [...new Set([...ids, ...alemDe])].sort((a, b) => a - b);

  let apagadas = 0;
  for (let i = 0; i < todos.length; i += 100) {
    const lote = todos.slice(i, i + 100);
    try {
      await api.deleteMessages(chatId, lote);
      apagadas += lote.length;
    } catch {
      // Algum id do lote não pôde ser apagado: tenta um a um.
      for (const id of lote) {
        if (await api.deleteMessage(chatId, id).then(() => true, () => false)) apagadas++;
      }
    }
  }
  db.prepare(`DELETE FROM mensagens WHERE msg_id IN (${todos.map(() => '?').join(',') || 'NULL'})`).run(...todos);
  log.info('limpar: mensagens apagadas', { modo, apagadas, tentadas: todos.length });
  return apagadas;
}
