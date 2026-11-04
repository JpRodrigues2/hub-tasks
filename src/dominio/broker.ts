// Política do broker (gateway MCP entre a sessão do Claude e a Funifier): o que a sessão pode fazer, sem I/O.
// Desenho em docs/estudo/broker.md e docs/v2/seguranca-e-dados.md (C3).

export type Classe = 'leitura' | 'escrita' | 'destrutiva';
export type Decisao = 'permitir' | 'confirmar' | 'negar';

// Anotações do MCP. Pela especificação, sem readOnlyHint a ferramenta pode escrever, e sem destructiveHint
// ela pode destruir: na dúvida, a classe mais restrita.
export function classificar(anotacoes?: { readOnlyHint?: boolean; destructiveHint?: boolean }): Classe {
  if (anotacoes?.readOnlyHint === true) return 'leitura';
  if (anotacoes?.destructiveHint === false) return 'escrita';
  return 'destrutiva';
}

// Destrutiva (apagar, mexer no banco) nunca passa; escrita em produção pede confirmação no Telegram.
export function decidir(classe: Classe, producao: boolean): Decisao {
  if (classe === 'destrutiva') return 'negar';
  if (classe === 'escrita' && producao) return 'confirmar';
  return 'permitir';
}

export function ehProducao(g: { nome: string; ambiente?: 'dev' | 'producao' }): boolean {
  return g.ambiente ? g.ambiente === 'producao' : /^prod/i.test(g.nome);
}

// Como a sessão chama uma gamificação: "<app>/<nome>", ex.: "teensmart-app/dev".
export const idGamificacao = (app: string, nome: string) => `${app}/${nome}`;

// A sessão nunca recebe a ferramenta que pede a chave como argumento (a chave entraria no histórico).
export const FERRAMENTAS_BLOQUEADAS = new Set(['funifier_connect']);
