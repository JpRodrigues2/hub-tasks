// Onde o hub mora no Mac (modo local, I5): tudo em ~/.hub, fora da pasta do código. HUB_HOME troca a raiz (testes).
import { homedir } from 'node:os';
import { join } from 'node:path';

export function casaDoHub(raiz = process.env.HUB_HOME ?? join(homedir(), '.hub')) {
  const dados = join(raiz, 'dados');
  return {
    raiz,
    dados, // HUB_DADOS_DIR: .env, apps.yaml, banco, OAuth, regras, logs, runs
    env: join(dados, '.env'),
    apps: join(dados, 'apps.yaml'),
    logs: join(dados, 'logs'),
    git: join(raiz, 'git'), // um .gitconfig por espaço (nome, e-mail, credencial do gh)
    gh: join(raiz, 'gh'), // um login do gh por espaço (GH_CONFIG_DIR)
    sandbox: join(raiz, 'sandbox'), // app de teste do passo final
    estado: join(raiz, 'instalacao.json'),
  };
}
export type Casa = ReturnType<typeof casaDoHub>;

export const ghDoEspaco = (c: Casa, id: string) => join(c.gh, id);
export const gitconfigDoEspaco = (c: Casa, id: string) => join(c.git, `${id}.gitconfig`);
