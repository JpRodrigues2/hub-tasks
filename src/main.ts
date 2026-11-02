// Raiz de composição: o único lugar que escolhe os adaptadores concretos (Orca, cofre, ferramentas) e liga tudo.
// O resto do código só conhece as portas (src/aplicacao/portas.ts e PmAdapter).
import cron from 'node-cron';
import { join } from 'node:path';
import type { Cofre } from './aplicacao/portas.js';
import { CofreArquivoCifrado } from './adaptadores/cofre/arquivo-cifrado.js';
import { CofreKeychain } from './adaptadores/cofre/keychain.js';
import { Orca } from './adaptadores/executor/orca.js';
import { CAMINHOS } from './caminhos.js';
import { loadCatalogo, loadEnv, type Env } from './config.js';
import { openDb } from './db.js';
import { limparRuns } from './limpeza.js';
import { errInfo, log } from './logger.js';
import { BnexoAdapter } from './pm/bnexo.js';
import { FunifierPmAdapter } from './pm/funifier-pm.js';
import { migrarCofreAntigo } from './segredos.js';
import { COMANDOS, createBot } from './telegram.js';

function criarCofre(env: Env): Cofre {
  return env.HUB_COFRE === 'keychain'
    ? new CofreKeychain(process.env.HUB_KEYCHAIN_SERVICO)
    : CofreArquivoCifrado.doSystemd(join(CAMINHOS.dados, 'cofre.enc'));
}

const env = loadEnv();
loadCatalogo(); // falha cedo se o apps.yaml estiver inválido
const db = openDb();
const orca = new Orca(env.ORCA_BIN, env.ORCA_ENVIRONMENT);
const cofre = criarCofre(env);
await migrarCofreAntigo(cofre);
const adapters = [new FunifierPmAdapter(env), new BnexoAdapter(env, () => loadCatalogo().nomes_projetos.bnexo)];

const { bot, fluxo, despachante } = createBot({ env, db, orca, cofre, adapters });

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

log.info('hub: iniciando bot (long polling)', { escritaPm: env.HUB_ESCRITA_PM, cofre: env.HUB_COFRE, dados: CAMINHOS.dados });
await bot.start({
  onStart: (me) => {
    log.info('hub: bot online', { bot: me.username, resumoHorario: env.RESUMO_HORARIO });
    void fluxo.talvezResumoDiario('catch_up');
    void despachante.processar();
  },
});
