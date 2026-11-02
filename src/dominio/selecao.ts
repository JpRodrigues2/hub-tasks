// Máquina de estados da seleção (domínio): em cada etapa da conversa, quais botões ainda valem.
// Botão de uma pergunta já respondida (mensagem antiga no chat) cai fora daqui e é recusado.

export const ACOES_POR_ETAPA = {
  instrucoes: ['cancel'],
  empresa: ['emp', 'cancel'],
  info: ['pular', 'cancel'],
  destino: ['ok', 'outro', 'cancel'],
  escolher_app: ['app', 'cancel'],
  alvo: ['g', 'gok', 'gnova', 'gsem', 'cancel'],
  ambiente: ['amb', 'cancel'],
  amb_empresa: ['aemp', 'cancel'],
  amb_nome: ['cancel'],
  amb_git: ['agit', 'cancel'],
  amb_url: ['cancel'],
  confirmar: ['desp', 'reset', 'cancel'],
} as const satisfies Record<string, readonly string[]>;

export type EtapaSelecao = keyof typeof ACOES_POR_ETAPA;

export function acaoValida(etapa: string | null | undefined, acao: string): boolean {
  const acoes: readonly string[] | undefined = ACOES_POR_ETAPA[(etapa ?? '') as EtapaSelecao];
  return acoes?.includes(acao) ?? false;
}
