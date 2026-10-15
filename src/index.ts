// Ponto de entrada do hub.
import { loadCatalogo, loadEnv } from './config.js';
import { openDb } from './db.js';
import { errInfo, log } from './logger.js';
import { Orca } from './orca.js';
import { BnexoAdapter } from './pm/bnexo.js';
import { FunifierPmAdapter } from './pm/funifier-pm.js';
import { createBot } from './telegram.js';

const env = loadEnv();
loadCatalogo(); // falha cedo se o apps.yaml estiver inválido
const db = openDb();
const orca = new Orca(env.ORCA_BIN);
const adapters = [new FunifierPmAdapter(env), new BnexoAdapter(env, () => loadCatalogo().nomes_projetos.bnexo)];

const bot = createBot({ env, db, orca, adapters });

await bot.api.setMyCommands([
  { command: 'status', description: 'Orca, MCPs, fila e despachos' },
  { command: 'tarefas', description: 'Resumo das tasks agora' },
]);

async function parar(sinal: string) {
  log.info('hub: encerrando', { sinal });
  await bot.stop();
  db.close();
  process.exit(0);
}
process.once('SIGINT', () => void parar('SIGINT'));
process.once('SIGTERM', () => void parar('SIGTERM'));
process.on('unhandledRejection', (e) => log.error('hub: promise rejeitada', errInfo(e)));

log.info('hub: iniciando bot (long polling)', { escritaPm: env.HUB_ESCRITA_PM });
await bot.start({ onStart: (me) => log.info('hub: bot online', { bot: me.username }) });
