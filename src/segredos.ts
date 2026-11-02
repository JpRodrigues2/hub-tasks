// Cofre local das credenciais de gamificação (API key + secret), mandadas pelo usuário no Telegram (B15).
// data/segredos/gamificacoes.json, permissão 600, fora do git. Nunca vão para o apps.yaml, prompts, logs ou commits.
// No despacho, só as credenciais das gamificações autorizadas vão para runs/<id>/credenciais.json (600),
// apagado quando a task é encerrada.
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, type Gamificacao } from './config.js';
import { dirAnexos } from './prompt.js';

export interface Credencial {
  api_key: string;
  secret: string;
}

const DIR = join(ROOT, 'data', 'segredos');
const ARQ = join(DIR, 'gamificacoes.json');

function ler(): Record<string, Credencial> {
  return existsSync(ARQ) ? (JSON.parse(readFileSync(ARQ, 'utf8')) as Record<string, Credencial>) : {};
}

function gravar(dados: Record<string, Credencial>) {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  writeFileSync(ARQ, JSON.stringify(dados, null, 2), { mode: 0o600 });
  chmodSync(ARQ, 0o600);
}

export function salvarCredencial(id: string, c: Credencial) {
  gravar({ ...ler(), [id]: c });
}

export function removerCredencial(id: string) {
  const d = ler();
  delete d[id];
  gravar(d);
}

export function temCredencial(id: string | undefined) {
  return !!id && id in ler();
}

// Arquivo da task com as credenciais só das gamificações autorizadas. null = nenhuma tem credencial.
export function escreverCredenciaisDaTask(selecaoId: number, gamifs: Gamificacao[]): string | null {
  const cofre = ler();
  const itens = gamifs.filter((g) => g.credencial && cofre[g.credencial]);
  if (!itens.length) return null;
  const dir = dirAnexos(selecaoId);
  mkdirSync(dir, { recursive: true });
  const arq = join(dir, 'credenciais.json');
  const conteudo = Object.fromEntries(
    itens.map((g) => [g.nome, { servidor: g.servidor, conta: g.conta, ...cofre[g.credencial!] }]),
  );
  writeFileSync(arq, JSON.stringify(conteudo, null, 2), { mode: 0o600 });
  chmodSync(arq, 0o600);
  return arq;
}

export function apagarCredenciaisDaTask(selecaoId: number) {
  rmSync(join(dirAnexos(selecaoId), 'credenciais.json'), { force: true });
}
