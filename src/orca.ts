// Wrapper da CLI do Orca. Sempre execFile com argumentos em array (nunca string de shell)
// e sempre --json. Handles de terminal mudam quando o Orca reinicia: redescobrir pela pasta.
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

export class OrcaError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'OrcaError';
  }
}

export interface OrcaTerminal {
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

interface OrcaResponse<T> {
  ok: boolean;
  result?: T;
  error?: { code?: string; message?: string };
}

export class Orca {
  constructor(private bin: string) {}

  private run<T>(args: string[], timeoutMs = 30_000): Promise<T> {
    return new Promise((resolvePromise, reject) => {
      execFile(this.bin, [...args, '--json'], { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
        let parsed: OrcaResponse<T> | undefined;
        try {
          parsed = JSON.parse(stdout);
        } catch {
          // sem JSON: falha do processo (binário ausente, timeout, Orca fechado)
        }
        if (parsed?.ok) return resolvePromise(parsed.result as T);
        if (parsed?.error) return reject(new OrcaError(parsed.error.message ?? 'erro do Orca', parsed.error.code));
        reject(new OrcaError(err ? err.message : `resposta inesperada do Orca: ${stdout.slice(0, 200)}`));
      });
    });
  }

  async status() {
    const r = await this.run<{ app: { running: boolean }; runtime: { state: string; reachable: boolean; appVersion?: string } }>(
      ['status'],
      15_000,
    );
    return { ok: r.app.running && r.runtime.reachable && r.runtime.state === 'ready', versao: r.runtime.appVersion, ...r };
  }

  async listRepos() {
    const r = await this.run<{ repos: { id: string; path: string; displayName: string }[] }>(['repo', 'list']);
    return r.repos;
  }

  // Terminais vivos cuja pasta é exatamente `pasta`.
  async listTerminals(pasta: string): Promise<OrcaTerminal[]> {
    const alvo = resolve(pasta);
    const r = await this.run<{ terminals: OrcaTerminal[] }>(['terminal', 'list', '--worktree', `path:${alvo}`]);
    return r.terminals.filter((t) => t.worktreePath && resolve(t.worktreePath) === alvo);
  }

  // Estado dos agentes por pane ("tabId:leafId" → working | done | …), via worktree ps.
  async agentStates(): Promise<Map<string, string>> {
    const r = await this.run<{ worktrees: { agents?: { paneKey: string; state: string }[] }[] }>(['worktree', 'ps']);
    return new Map(r.worktrees.flatMap((w) => (w.agents ?? []).map((a) => [a.paneKey, a.state] as [string, string])));
  }

  // Tela atual do terminal (últimas `linhas` linhas).
  async readScreen(handle: string, linhas = 60): Promise<string[]> {
    const r = await this.run<{ terminal: { tail: string[]; status?: string } }>([
      'terminal',
      'read',
      '--terminal',
      handle,
      '--screen',
      '--limit',
      String(linhas),
    ]);
    // Terminal fechado continua legível por um tempo, com status "exited" e tela vazia.
    if (r.terminal.status && r.terminal.status !== 'running')
      throw new OrcaError(`terminal ${handle} não está rodando (${r.terminal.status})`, 'terminal_not_running');
    return r.terminal.tail;
  }

  // Envia UMA linha seguida de Enter. Quebras de linha são recusadas (o prompt vai num arquivo em runs/).
  async send(handle: string, linha: string) {
    if (/[\r\n]/.test(linha)) throw new OrcaError('send: a linha não pode conter quebras de linha');
    return this.run(['terminal', 'send', '--terminal', handle, '--text', linha, '--enter']);
  }

  // true se o TUI ficou ocioso dentro do prazo; false se estourou o timeout.
  async waitIdle(handle: string, timeoutMs: number): Promise<boolean> {
    try {
      await this.run(
        ['terminal', 'wait', '--terminal', handle, '--for', 'tui-idle', '--timeout-ms', String(timeoutMs)],
        timeoutMs + 15_000,
      );
      return true;
    } catch (e) {
      if (e instanceof OrcaError && /timeout|timed out/i.test(`${e.code} ${e.message}`)) return false;
      throw e;
    }
  }

  async createTerminal(pasta: string, comando: string, titulo?: string): Promise<string> {
    const args = ['terminal', 'create', '--worktree', `path:${resolve(pasta)}`, '--command', comando];
    if (titulo) args.push('--title', titulo);
    const r = await this.run<{ terminal?: { handle?: string }; handle?: string }>(args);
    const handle = r.terminal?.handle ?? r.handle;
    if (!handle) throw new OrcaError('terminal create não devolveu handle');
    return handle;
  }

  async setWorktreeStatus(pasta: string, status: 'todo' | 'in-progress' | 'in-review' | 'completed', comentario?: string) {
    const args = ['worktree', 'set', '--worktree', `path:${resolve(pasta)}`, '--workspace-status', status];
    if (comentario) args.push('--comment', comentario);
    return this.run(args);
  }
}
