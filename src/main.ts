// Raiz de composição: o único lugar que escolhe os adaptadores concretos (Orca, cofre, ferramentas) e liga tudo.
// O resto do código só conhece as portas (src/aplicacao/portas.ts e PmAdapter).
import { Bot } from 'grammy';
import cron from 'node-cron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Cofre } from './aplicacao/portas.js';
import { CofreArquivoCifrado } from './adaptadores/cofre/arquivo-cifrado.js';
import { CofreKeychain } from './adaptadores/cofre/keychain.js';
import { NotificadorTelegram } from './adaptadores/chat/telegram.js';
import { ConexoesFunifier } from './adaptadores/funifier/conexoes.js';
import { Orca } from './adaptadores/executor/orca.js';
import { MemoriaSqlite, RepositorioDespachosSqlite, RepositorioSelecoesSqlite } from './adaptadores/persistencia/sqlite.js';
import { criarDespacho } from './aplicacao/despacho/index.js';
import { Broker, autorizadasDoBanco } from './broker/broker.js';
import { CAMINHOS } from './caminhos.js';
import { loadCatalogo, loadEnv, type Env } from './config.js';
import { openDb } from './db.js';
import { gitProjetos } from './git.js';
import { limparRuns } from './limpeza.js';
import { errInfo, log } from './logger.js';
import { BnexoAdapter } from './pm/bnexo.js';
import { FunifierPmAdapter } from './pm/funifier-pm.js';
import { migrarCofreAntigo } from './segredos.js';
import { COMANDOS, instalarBot } from './telegram.js';

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

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
const despacho = criarDespacho({
  env,
  despachos: new RepositorioDespachosSqlite(db),
  selecoes: new RepositorioSelecoesSqlite(db),
  memoria: new MemoriaSqlite(db),
  executor: orca,
  notificador: new NotificadorTelegram(bot.api, Number(env.TELEGRAM_CHAT_ID)),
  cofre,
  gestao: adapters,
  git: gitProjetos,
  apps: () => loadCatalogo().apps,
});
const { fluxo, confirmador } = instalarBot(bot, { env, db, orca, cofre, adapters, despacho });

// Broker: a sessão usa as gamificações pelo MCP do hub, sem ver a chave (docs/estudo/broker.md).
let broker: Broker | null = null;
if (env.HUB_BROKER === 'ligado') {
  if (!env.HUB_BROKER_TOKEN_ARQ) throw new Error('HUB_BROKER=ligado precisa de HUB_BROKER_TOKEN_ARQ');
  broker = new Broker({
    porta: env.HUB_BROKER_PORTA,
    token: readFileSync(env.HUB_BROKER_TOKEN_ARQ, 'utf8').trim(),
    autorizadas: autorizadasDoBanco(db),
    conexoes: new ConexoesFunifier(cofre, env.HUB_FUNIFIER_MCP),
    confirmador,
  });
  await broker.iniciar();
}

// Despacho: fila por app, a cada 30 s (e imediatamente após cada "Despachar").
setInterval(() => void despacho.despachar.processar(), 30_000);

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
  await broker?.parar();
  db.close();
  process.exit(0);
}
process.once('SIGINT', () => void parar('SIGINT'));
process.once('SIGTERM', () => void parar('SIGTERM'));
process.on('unhandledRejection', (e) => log.error('hub: promise rejeitada', errInfo(e)));

log.info('hub: iniciando bot (long polling)', { escritaPm: env.HUB_ESCRITA_PM, cofre: env.HUB_COFRE, broker: env.HUB_BROKER, dados: CAMINHOS.dados });
await bot.start({
  onStart: (me) => {
    log.info('hub: bot online', { bot: me.username, resumoHorario: env.RESUMO_HORARIO });
    void fluxo.talvezResumoDiario('catch_up');
    void despacho.despachar.processar();
  },
});
