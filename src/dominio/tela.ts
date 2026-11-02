// Leitura da tela do Claude Code: funções puras, sem Orca nem banco (domínio).
// Dependem do texto da interface do Claude Code (impeditivo I2): os testes em tests/dominio/tela.test.ts
// são a referência; uma versão nova do Claude Code que mude o rodapé quebra os testes antes de quebrar o hub.

export type EstadoSessao = 'ocioso' | 'ocupado' | 'aguardando' | 'limite';

// Classificação pela tela do Claude Code (+ estado do agente no Orca, quando houver).
// `paraEnviar`: na hora de mandar uma task, shell em segundo plano (ex.: servidor de dev) e o agente "working" que o
// Orca mostra por causa dele não contam como ocupado — a caixa de entrada aceita mensagem. No acompanhamento contam,
// porque o Claude volta a trabalhar quando o shell termina.
export function classificarTela(telaInteira: string, estadoAgente?: string, paraEnviar = false): EstadoSessao {
  // Os sinais (spinner, diálogos, limite, rodapé) ficam no fim da tela; o meio é conversa e pode citar qualquer texto.
  const tela = telaInteira
    .split('\n')
    .filter((l) => l.trim())
    .slice(-14)
    .join('\n');
  // Mensagem do Claude Code no começo da linha (ex.: "Claude usage limit reached…", "5-hour limit reached ∙ resets 3pm").
  if (/^[\s⎿●⏺]*(Claude )?(AI )?(usage limit reached|(5-hour|weekly|Opus) limit reached|You'?ve hit your (usage )?limit)/im.test(tela))
    return 'limite';
  // Diálogo explícito (pergunta/permissão/confiança na pasta) tem prioridade sobre "working".
  if (/Do you want to|Would you like to|Esc to cancel|Enter to (select|confirm)|trust the files|Yes, proceed|\(y\/n\)/i.test(tela))
    return 'aguardando';
  // Trabalhando: spinner, agente "working" no Orca, ou comando em segundo plano que vai acordar o Claude.
  if (/esc to interrupt/i.test(tela)) return 'ocupado';
  if (!paraEnviar && (estadoAgente === 'working' || /\d+ shells? still running|· \d+ shells?\b/i.test(tela))) return 'ocupado';
  // Ocioso = caixa de entrada do Claude Code (❯ entre linhas ────). Só "❯" pode ser o prompt do zsh.
  if (/^\s*❯/m.test(tela) && /─{10,}/.test(tela)) return 'ocioso';
  return 'ocupado'; // desconhecido: conservador, não envia
}

export function extrairResultado(tela: string, tag: string): Record<string, string> | null {
  // O Claude renderiza o markdown: "### RESULTADO HUB" aparece só como "RESULTADO HUB".
  const linhas = tela.split('\n');
  let inicio = -1;
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (/^[\s│⎿●⏺#]*RESULTADO HUB\s*$/.test(linhas[i])) {
      inicio = i;
      break;
    }
  }
  if (inicio < 0) return null;
  const campos: Record<string, string> = {};
  let atual: string | null = null;
  for (const bruta of linhas.slice(inicio + 1)) {
    const linha = bruta.replace(/^[\s│⎿●⏺]+/, '').trimEnd();
    if (!linha || /^[─✻❯]/.test(linha)) break; // fim do bloco: linha vazia, caixa de entrada ou rodapé
    const m = linha.match(/^(task|status|resumo|arquivos|branch|pendencias|pendências):\s*(.*)$/i);
    if (m) {
      atual = m[1].toLowerCase().replace('pendências', 'pendencias');
      campos[atual] = m[2].trim();
    } else if (atual) campos[atual] += ' ' + linha.trim(); // continuação de linha quebrada pelo terminal
  }
  // Ignora o próprio enunciado do formato ("concluido | bloqueado | …").
  if (!/^(concluido|bloqueado|precisa_revisao)$/.test(campos.status ?? '')) return null;
  // Só vale o bloco desta task/rodada (a tela pode ainda mostrar o resultado de uma task ou rodada anterior).
  if (campos.task?.replace(/\s/g, '') !== `#${tag}`) return null;
  return campos;
}

// Últimas linhas úteis da tela (sem a caixa de entrada e o rodapé do Claude Code).
export function ultimasLinhas(tela: string, n = 14) {
  return tela
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() && !/^[─━]{5,}/.test(l.trim()) && !/^\s*⏵⏵|for shortcuts|shift\+tab/.test(l))
    .slice(-n)
    .map((l) => (l.length > 110 ? l.slice(0, 109) + '…' : l))
    .join('\n');
}
