// Gera runs/<id>.md — o prompt completo da task. Ao terminal vai só uma linha apontando para ele.
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { App, Gamificacao } from './config.js';
import { ROOT } from './config.js';
import { errInfo, log } from './logger.js';
import type { TaskDetalhe } from './pm/types.js';

export const RUNS_DIR = join(ROOT, 'runs');

export function dirAnexos(selecaoId: number) {
  return join(RUNS_DIR, String(selecaoId));
}

export function slug(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'task'
  );
}

export function branchDe(selecaoId: number, titulo: string) {
  return `hub/${selecaoId}-${slug(titulo)}`;
}

// Baixa as imagens da descrição para runs/<id>/; as que falharem ficam só como URL no prompt.
export async function baixarImagens(selecaoId: number, urls: string[]): Promise<{ locais: string[]; falhas: string[] }> {
  const locais: string[] = [];
  const falhas: string[] = [];
  const dir = dirAnexos(selecaoId);
  for (const [i, url] of urls.entries()) {
    try {
      if (!/^https?:\/\//.test(url)) throw new Error('URL não http(s)');
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ext = (res.headers.get('content-type') ?? '').match(/image\/(png|jpe?g|gif|webp)/)?.[1] ?? 'bin';
      mkdirSync(dir, { recursive: true });
      const arq = join(dir, `descricao-${i + 1}.${ext.replace('jpeg', 'jpg')}`);
      writeFileSync(arq, Buffer.from(await res.arrayBuffer()));
      locais.push(arq);
    } catch (e) {
      log.warn('prompt: imagem não baixada', { selecaoId, ...errInfo(e) });
      falhas.push(url);
    }
  }
  return { locais, falhas };
}

export interface DadosPrompt {
  selecaoId: number;
  task: TaskDetalhe;
  infoExtra: string | null;
  app: App;
  gamificacoes: Gamificacao[];
  anexosJoao: string[];
  imagensDescricao: { locais: string[]; falhas: string[] };
}

export function escreverPrompt(d: DadosPrompt): string {
  const { task, app } = d;
  const branch = branchDe(d.selecaoId, task.titulo);
  const L: string[] = [];

  L.push(`# Task do hub #${d.selecaoId}: ${task.titulo}`, '');
  L.push(`- **Ferramenta:** ${task.ferramenta}${task.projetoNome ? ` — projeto "${task.projetoNome}"` : ''}`);
  if (task.link) L.push(`- **Link:** ${task.link}`);
  if (task.prazo) L.push(`- **Prazo:** ${task.prazo.slice(0, 10)}`);
  L.push(`- **App:** ${app.app}`, `- **Pasta:** \`${app.pasta}\``, '');

  L.push('## Descrição', '', task.descricao.trim() || '_(sem descrição)_', '');

  if (task.comentarios.length) {
    L.push('## Comentários', '');
    for (const c of task.comentarios) L.push(`**${c.autor}** (${c.data.slice(0, 10)}):`, '', c.texto.trim(), '');
  }

  if (d.infoExtra) L.push('## Informação extra do João', '', d.infoExtra.trim(), '');

  const imgs = [...d.imagensDescricao.locais, ...d.anexosJoao];
  if (imgs.length || d.imagensDescricao.falhas.length) {
    L.push('## Imagens e anexos', '', 'Abra e analise cada arquivo abaixo antes de começar — fazem parte da especificação:', '');
    for (const a of d.imagensDescricao.locais) L.push(`- \`${a}\` (imagem da descrição da task)`);
    for (const a of d.anexosJoao) L.push(`- \`${a}\` (enviado pelo João: ${basename(a)})`);
    for (const u of d.imagensDescricao.falhas) L.push(`- ${u} (não consegui baixar; tente abrir a URL)`);
    L.push('');
  }

  if (task.empresa === 'funifier') {
    L.push('## Gamificações autorizadas', '');
    for (const g of d.gamificacoes) L.push(`- **${g.nome}** — servidor \`${g.servidor}\`, conta ${g.conta}`);
    L.push(
      '',
      '**Só altere as gamificações listadas aqui. Se a gamificação conectada no seu MCP não for uma delas, pare e avise.**',
      '',
    );
  }

  L.push('## Regras de trabalho', '');
  L.push(
    `- Siga o \`CLAUDE.md\` do projeto${app.contexto ? ` e o contexto em \`${app.contexto}\`` : ' e o CONTEXT.md do projeto, se existir'}.`,
    `- Trabalhe numa branch nova: \`${branch}\` (crie a partir da branch principal atualizada).`,
    '- Não faça push na branch principal.',
    '- Antes de qualquer escrita no backend, confirme o alvo (servidor, conta, gamificação).',
    '- Ao terminar, atualize o CONTEXT.md conforme a regra do projeto.',
    '- Se precisar de uma decisão minha, pergunte e espere — o hub me avisa no Telegram.',
    '',
  );

  L.push('## Formato obrigatório de encerramento', '');
  L.push('Termine a sua última mensagem com este bloco, exatamente neste formato (o hub lê a tela para encontrá-lo):', '');
  L.push(
    '```',
    '### RESULTADO HUB',
    `task: #${d.selecaoId}`,
    'status: concluido | bloqueado | precisa_revisao',
    'resumo: <1 a 3 frases>',
    'arquivos: <lista curta dos arquivos alterados>',
    `branch: ${branch} (ou URL do PR)`,
    'pendencias: <o que falta, ou "nenhuma">',
    '```',
    '',
  );

  mkdirSync(RUNS_DIR, { recursive: true });
  const arquivo = join(RUNS_DIR, `${d.selecaoId}.md`);
  writeFileSync(arquivo, L.join('\n'));
  return arquivo;
}

export function linhaDespacho(arquivo: string) {
  return `Leia e execute a task descrita em ${arquivo}.`;
}
