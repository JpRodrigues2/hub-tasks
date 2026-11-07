// Comando `hub` (terminal): a instalação e a manutenção do hub, fora do Telegram (O6).
//   hub diagnostico [--json]   confere cada peça e diz o próximo passo
// Os próximos (O2): init, adicionar github-workspace, adicionar heartbeat, migrar servidor.
// No servidor, lê as variáveis do hub.service (pastas, cofre, Orca do agente) antes de carregar o hub, para conferir
// exatamente o que o serviço usa.
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { rodar, variaveisDoServico, type Modo } from './diagnostico.js';

const AJUDA = `Uso: hub <comando>

Comandos:
  diagnostico [--json]   Confere a instalação e diz o próximo passo de cada problema

Em breve: init, adicionar github-workspace, adicionar heartbeat, migrar servidor.
Guia: pasta instalacao/ do repositório.`;

async function prepararServidor() {
  const r = await rodar('systemctl', ['show', 'hub.service', '-p', 'Environment', '--value']);
  if (!r.ok || !r.saida) return false;
  for (const [k, v] of Object.entries(variaveisDoServico(r.saida))) process.env[k] ??= v;
  return true;
}

async function diagnostico(json: boolean) {
  const modo: Modo = process.platform === 'darwin' ? 'local' : 'servidor';
  if (modo === 'servidor') {
    await prepararServidor();
    if (userInfo().username !== 'hub') {
      console.error('No servidor, rode como o usuário hub (é ele quem lê a configuração):\n  sudo -u hub -i /home/hub/app/bin/hub.mjs diagnostico');
      process.exitCode = 2;
      return;
    }
  }
  process.env.HUB_LOG_SILENCIOSO = '1';
  // Só agora: os módulos do hub leem as pastas das variáveis ao carregar.
  const { CAMINHOS, ROOT, regrasPadrao } = await import('../caminhos.js');
  // No Mac o .env fica na pasta do código; vale mesmo rodando o comando de outra pasta.
  process.env.DOTENV_CONFIG_PATH ??= join(ROOT, '.env');
  const config = await import('../config.js');
  const { fontesDeRegras } = await import('../regras.js');
  const { Orca } = await import('../adaptadores/executor/orca.js');
  const { BnexoAdapter } = await import('../pm/bnexo.js');
  const { diagnosticar, formatarTexto, achaArquivoRegras } = await import('./diagnostico.js');

  const itens = await diagnosticar({
    modo,
    rodar,
    env: process.env,
    carregarEnv: async () => config.loadEnv(),
    carregarCatalogo: async () => config.loadCatalogo(),
    fontesDeRegras,
    arquivoRegras: achaArquivoRegras(CAMINHOS.regras, regrasPadrao),
    caminhos: CAMINHOS,
    arquivoEnv: process.env.DOTENV_CONFIG_PATH,
    statusOrca: (env) => new Orca(env.ORCA_BIN, env.ORCA_ENVIRONMENT).status(),
    reposNoOrca: async (env) => (await new Orca(env.ORCA_BIN, env.ORCA_ENVIRONMENT).listRepos()).map((r) => r.path),
    telegram: async (token) => {
      try {
        const r = (await (await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(10_000) })).json()) as {
          ok: boolean;
          result?: { username: string };
          description?: string;
        };
        return r.ok ? { ok: true, usuario: r.result?.username } : { ok: false, erro: r.description };
      } catch (e) {
        return { ok: false, erro: `sem resposta do Telegram (${(e as Error).message})` };
      }
    },
    bnexo: () => new BnexoAdapter(config.loadEnv(), () => ({})).ping(),
    jira: async () => new (await import('../pm/jira.js')).JiraAdapter(config.loadEnv()).ping(),
  });
  console.log(json ? JSON.stringify({ modo, itens }, null, 2) : formatarTexto(itens));
  process.exitCode = itens.some((i) => i.estado === 'falha') ? 1 : 0;
}

const [comando, ...resto] = process.argv.slice(2);
if (comando === 'diagnostico') await diagnostico(resto.includes('--json'));
else {
  console.log(AJUDA);
  if (comando && comando !== 'ajuda' && comando !== '--help') process.exitCode = 2;
}
// Conexões abertas (MCP, Orca) não seguram o terminal.
setTimeout(() => process.exit(), 50).unref();
