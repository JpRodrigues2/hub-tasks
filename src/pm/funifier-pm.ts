// Adaptador do Funifier PM (MCP pm-mcp.funifier.com).
import type { Env } from '../config.js';
import {
  atrasada,
  prazoIso,
  EscritaBloqueadaError,
  McpConexao,
  type Categoria,
  type PmAdapter,
  type StatusHub,
  type Task,
  type TaskDetalhe,
} from './types.js';

interface PmTask {
  id: string;
  title: string;
  status: string;
  project?: { id: string; name: string };
  due?: string | null;
  url?: string;
  notes?: string;
  comments?: { author?: { name?: string }; createdAt?: string; created?: string; content?: string; text?: string }[];
}

const CATEGORIA: Record<string, Categoria> = {
  backlog: 'backlog',
  todo: 'pendente',
  in_progress: 'em_progresso',
  review: 'revisao',
  done: 'concluida',
};

const STATUS: Record<StatusHub, string> = { em_progresso: 'in_progress', em_revisao: 'review' };

export class FunifierPmAdapter implements PmAdapter {
  readonly nome = 'funifier-pm' as const;
  private mcp = new McpConexao('funifier-pm');

  constructor(private env: Env) {}

  private toTask(t: PmTask): Task {
    const base = CATEGORIA[t.status] ?? 'pendente';
    const projetoId = t.project?.id ?? null;
    return {
      ferramenta: this.nome,
      empresa: 'funifier',
      id: t.id,
      titulo: t.title,
      projetoId,
      projetoNome: t.project?.name ?? null,
      status: t.status,
      categoria: base !== 'concluida' && atrasada(prazoIso(t.due), this.env.TZ_HUB) ? 'atrasada' : base,
      prazo: prazoIso(t.due),
      link: t.url ?? (projetoId ? `https://pm.funifier.app/project/${projetoId}/task/${t.id}` : null),
    };
  }

  async listMyTasks(): Promise<Task[]> {
    const out: Task[] = [];
    let cursor: string | undefined;
    do {
      const r = (await this.mcp.call('list_my_tasks', { limit: 50, ...(cursor ? { cursor } : {}) })) as {
        tasks?: PmTask[];
        nextCursor?: string;
      };
      out.push(...(r.tasks ?? []).map((t) => this.toTask(t)));
      cursor = r.nextCursor;
    } while (cursor);
    return out;
  }

  async getTask(id: string): Promise<TaskDetalhe> {
    const t = (await this.mcp.call('get_task', { taskId: id })) as PmTask;
    return {
      ...this.toTask(t),
      descricao: t.notes ?? '',
      comentarios: (t.comments ?? []).map((c) => ({
        autor: c.author?.name ?? '?',
        data: c.createdAt ?? c.created ?? '',
        texto: c.content ?? c.text ?? '',
      })),
    };
  }

  async setStatus(id: string, status: StatusHub) {
    if (!this.env.HUB_ESCRITA_PM) throw new EscritaBloqueadaError(`move_task ${id} → ${STATUS[status]}`);
    await this.mcp.call('move_task', { taskId: id, status: STATUS[status] });
  }

  async comment(id: string, texto: string) {
    if (!this.env.HUB_ESCRITA_PM) throw new EscritaBloqueadaError(`add_comment ${id}`);
    // O PM exige o "confirmation" devolvido pelo preview com exatamente os mesmos campos.
    const p = (await this.mcp.call('preview_add_comment', { taskId: id, content: texto })) as { confirmation?: string };
    if (!p.confirmation) throw new Error('preview_add_comment não devolveu confirmation');
    await this.mcp.call('add_comment', { taskId: id, content: texto, confirmation: p.confirmation });
  }

  async ping() {
    const r = (await this.mcp.call('whoami')) as { id: string; role: string };
    return `${r.id} (${r.role})`;
  }

  async listProjects() {
    const r = (await this.mcp.call('list_projects')) as { projects: { id: string; name: string }[] };
    return r.projects;
  }
}
