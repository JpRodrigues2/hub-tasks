// Ponto de entrada do hub.
import { loadCatalogo, loadEnv } from './config.js';
import { openDb } from './db.js';
import { errInfo, log } from './logger.js';
import { Orca } from './orca.js';
import { BnexoAdapter } from './pm/bnexo.js';
import { FunifierPmAdapter } from './pm/funifier-pm.js';
import cron from 'node-cron';
import { limparRuns } from './limpeza.js';
import { COMANDOS, createBot } from './telegram.js';

const env = loadEnv();
loadCatalogo(); // falha cedo se o apps.yaml estiver inválido
const db = openDb();
const orca = new Orca(env.ORCA_BIN);
const adapters = [new FunifierPmAdapter(env), new BnexoAdapter(env, () => loadCatalogo().nomes_projetos.bnexo)];

const { bot, fluxo, despachante } = createBot({ env, db, orca, adapters });

// Despacho: fila por app, a cada 30 s (e imediatamente após cada "Despachar").
setInterval(() => void despachante.processar(), 30_000);

// Resumo diário no horário configurado + verificação a cada 5 min para catch-up
// (computador desligado/dormindo no horário). Ambos são idempotentes por dia.
const [hh, mm] = env.RESUMO_HORARIO.split(':').map(Number);
cron.schedule(`${mm} ${hh} * * *`, () => fluxo.talvezResumoDiario('agendado'), { timezone: env.TZ_HUB, noOverlap: true });
cron.schedule('*/5 * * * *', () => fluxo.talvezResumoDiario('catch_up'), { timezone: env.TZ_HUB, noOverlap: true });

// Limpeza de runs/ de tasks encerradas há mais de 30 dias: todo dia às 04:00 e na inicialização.
cron.schedule('0 4 * * *', () => limparRuns(db), { timezone: env.TZ_HUB, noOverlap: true });
limparRuns(db);

await bot.api.setMyCommands(COMANDOS);

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
await bot.start({
  onStart: (me) => {
    log.info('hub: bot online', { bot: me.username, resumoHorario: env.RESUMO_HORARIO });
    void fluxo.talvezResumoDiario('catch_up');
    void despachante.processar();
  },
});
