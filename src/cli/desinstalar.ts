// hub desinstalar: desfaz o que o hub init fez neste Mac, a partir do registro em ~/.hub/instalacao.json, e deixa o
// computador como estava. Não toca no que já existia (Claude Code, Orca, git, gh e as contas da pessoa).
// O que só a pessoa pode desfazer (apagar o bot, tirar projetos do Orca) é listado no fim.
import { existsSync, readdirSync, rmSync } from 'node:fs';
import type { Casa } from './casa.js';
import { rodar } from './diagnostico.js';
import { lerEstado, salvarEstado } from './estado.js';
import { removerContaGit } from './init/git-espaco.js';
import { pararServico } from './init/servico-mac.js';
import { Parou, tela } from './tela.js';

// Apaga todos os itens do Keychain do serviço do hub (credenciais das gamificações).
async function limparKeychain(servico: string) {
  for (let i = 0; i < 200; i++) {
    const r = await rodar('/usr/bin/security', ['delete-generic-password', '-s', servico]);
    if (!r.ok) break;
  }
}

export async function desinstalar(casa: Casa) {
  if (!existsSync(casa.raiz)) {
    tela.info(`Não há instalação do hub neste usuário (${casa.raiz} não existe).`);
    return 0;
  }
  const estado = lerEstado(casa.estado);
  const alt = estado.alteracoes;
  tela.abertura('Hub de Tasks · desinstalar');
  const pastas = alt.filter((a) => a.tipo === 'pasta');
  tela.nota(
    [
      'Vou desfazer:',
      ...alt.filter((a) => a.tipo === 'launchagent').map(() => '  • o serviço do hub (LaunchAgent)'),
      ...alt.filter((a) => a.tipo === 'gitconfig').map((a) => `  • a linha do hub no ~/.gitconfig (${a.tipo === 'gitconfig' ? a.chave.replace('includeIf.gitdir:', '').replace(/\.path$/, '') : ''})`),
      ...alt.filter((a) => a.tipo === 'keychain').map(() => '  • as credenciais do hub no Keychain (gamificações)'),
      `  • a pasta ${casa.raiz} (configuração, banco, logins do hub e do GitHub dos espaços)`,
      ...(pastas.length ? ['', 'Pastas que o hub criou (pergunto uma por uma antes de apagar):', ...pastas.map((a) => `  • ${a.tipo === 'pasta' ? a.caminho : ''}`)] : []),
      '',
      'Não mexo em: Claude Code, Orca, git, gh e nas contas que você já usava.',
    ].join('\n'),
    'Desinstalar',
  );
  try {
    if (!(await tela.sim('Desinstalar o hub deste usuário?', false))) {
      tela.fim('Nada foi alterado.');
      return 0;
    }
    for (const a of alt) {
      if (a.tipo === 'launchagent') {
        await pararServico();
        rmSync(a.plist, { force: true });
        tela.ok('Serviço do hub removido.');
      } else if (a.tipo === 'gitconfig') {
        await removerContaGit(a.chave, a.valor);
        tela.ok(`~/.gitconfig: tirei ${a.chave}.`);
      } else if (a.tipo === 'keychain') {
        await limparKeychain(a.servico);
        tela.ok('Keychain: credenciais do hub apagadas.');
      }
    }
    for (const a of pastas) {
      if (a.tipo !== 'pasta' || !existsSync(a.caminho)) continue;
      const itens = readdirSync(a.caminho).filter((n) => n !== '.git' && n !== '.DS_Store');
      const aviso = itens.length ? ` (tem ${itens.length} item(ns) dentro, inclusive repositórios clonados)` : ' (vazia)';
      if (await tela.sim(`Apagar ${a.caminho}${aviso}?`, false)) {
        rmSync(a.caminho, { recursive: true, force: true });
        tela.ok(`Apaguei ${a.caminho}.`);
      }
    }
    rmSync(casa.raiz, { recursive: true, force: true });
    tela.ok(`Apaguei ${casa.raiz}.`);
  } catch (e) {
    if (e instanceof Parou) {
      salvarEstado(casa.estado, estado);
      tela.fim('Parei no meio. Rode `./hub desinstalar` de novo para terminar.');
      return 1;
    }
    throw e;
  }
  const bots = alt.flatMap((a) => (a.tipo === 'telegram-bot' ? [a.usuario] : []));
  tela.nota(
    [
      ...(bots.length ? [`• Telegram: apague o bot no BotFather (/deletebot → @${bots.join(', @')}).`] : []),
      '• Orca: os projetos que o hub abriu continuam na barra lateral; tire os que quiser (botão direito → Remove).',
      '• Orca no celular: se pareou, remova o aparelho nas configurações do Orca.',
      '• GitHub: os logins dos espaços eram só do hub e já foram apagados; se quiser, revogue o "GitHub CLI" em github.com/settings/applications.',
    ].join('\n'),
    'Falta você',
  );
  tela.fim('Hub desinstalado deste usuário.');
  return 0;
}
