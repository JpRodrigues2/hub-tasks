// Portas: o que o hub precisa do mundo de fora, sem saber quem atende.
// Adaptadores em src/adaptadores/; quem escolhe qual usar é só o main.ts.
// A porta das ferramentas de gestão já existia: PmAdapter (src/pm/types.ts).

// ─────────────── Executor: onde as sessões do Claude rodam (Orca hoje) ───────────────

export class ErroExecutor extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ErroExecutor';
  }
}

export interface TerminalExecutor {
  handle: string;
  title: string;
  agentIdentity: string | null; // "claude" quando há um Claude Code rodando
  worktreePath: string;
  connected: boolean;
  writable: boolean;
  lastOutputAt?: number;
  tabId?: string;
  leafId?: string;
}

export interface StatusExecutor {
  ok: boolean;
  versao?: string;
  estado?: string;
}

export type StatusWorktree = 'todo' | 'in-progress' | 'in-review' | 'completed';

export interface Executor {
  status(): Promise<StatusExecutor>;
  listRepos(): Promise<{ id: string; path: string; displayName: string }[]>;
  addRepo(pasta: string): Promise<unknown>;
  listTerminals(pasta: string): Promise<TerminalExecutor[]>;
  // Estado dos agentes por pane ("tabId:leafId" → working | done | …).
  agentStates(): Promise<Map<string, string>>;
  createTerminal(pasta: string, comando: string, titulo?: string): Promise<string>;
  readScreen(handle: string, linhas?: number): Promise<string[]>;
  send(handle: string, linha: string): Promise<unknown>;
  // true se o TUI ficou ocioso dentro do prazo; false se estourou o timeout.
  waitIdle(handle: string, timeoutMs: number): Promise<boolean>;
  setWorktreeStatus(pasta: string, status: StatusWorktree, comentario?: string): Promise<unknown>;
}

// ─────────────── Cofre: credenciais das gamificações (D-A14) ───────────────

export interface Credencial {
  api_key: string;
  secret: string;
}

export interface Cofre {
  obter(id: string): Promise<Credencial | null>;
  salvar(id: string, c: Credencial): Promise<void>;
  remover(id: string): Promise<void>;
  ids(): Promise<string[]>; // nunca devolve valores
}
