// SQLite local (data/hub.db) com migrações versionadas por PRAGMA user_version.
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.js';
import { log } from './logger.js';

const MIGRATIONS: string[] = [
  // 1 — esquema inicial
  `
  CREATE TABLE tasks_vistas (
    ferramenta    TEXT NOT NULL,             -- funifier-pm | bnexo
    task_id       TEXT NOT NULL,
    empresa       TEXT NOT NULL,             -- funifier | dac
    titulo        TEXT NOT NULL,
    projeto_id    TEXT,
    projeto_nome  TEXT,
    status        TEXT NOT NULL,             -- status bruto da ferramenta
    prazo         TEXT,
    link          TEXT,
    primeira_vez  TEXT NOT NULL,
    ultima_vez    TEXT NOT NULL,
    PRIMARY KEY (ferramenta, task_id)
  );

  -- Uma linha por task marcada pelo João num resumo; percorre os estados até virar despacho.
  CREATE TABLE selecoes (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ferramenta       TEXT NOT NULL,
    task_id          TEXT NOT NULL,
    data_resumo      TEXT NOT NULL,          -- AAAA-MM-DD do resumo de origem
    info_extra       TEXT,
    app              TEXT,
    gamificacoes     TEXT,                   -- JSON com as gamificações autorizadas
    estado           TEXT NOT NULL,          -- selecionada | coletando | aguardando_despacho | despachada | cancelada
    criado_em        TEXT NOT NULL,
    atualizado_em    TEXT NOT NULL
  );
  CREATE INDEX selecoes_estado ON selecoes(estado);

  CREATE TABLE fila (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    app         TEXT NOT NULL,
    selecao_id  INTEGER NOT NULL REFERENCES selecoes(id),
    criado_em   TEXT NOT NULL
  );
  CREATE INDEX fila_app ON fila(app, id);

  CREATE TABLE despachos (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    selecao_id       INTEGER NOT NULL REFERENCES selecoes(id),
    app              TEXT NOT NULL,
    pasta            TEXT NOT NULL,
    terminal_handle  TEXT,                   -- muda se o Orca reiniciar; redescobrir pela pasta
    run_file         TEXT NOT NULL,
    estado           TEXT NOT NULL,          -- em_execucao | aguardando_joao | pausado_limite | concluido | interrompido
    ultimo_aviso_em  TEXT,
    resultado        TEXT,                   -- JSON do bloco "### RESULTADO HUB"
    iniciado_em      TEXT NOT NULL,
    atualizado_em    TEXT NOT NULL
  );
  CREATE INDEX despachos_estado ON despachos(estado);

  CREATE TABLE historico (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ferramenta   TEXT NOT NULL,
    task_id      TEXT NOT NULL,
    titulo       TEXT,
    app          TEXT,
    status_final TEXT NOT NULL,               -- concluido | bloqueado | precisa_revisao | interrompido
    resumo       TEXT,
    branch       TEXT,
    criado_em    TEXT NOT NULL
  );

  CREATE TABLE meta (
    chave  TEXT PRIMARY KEY,
    valor  TEXT
  );
  `,
  // 2 — resumo com seleção (Fase 4)
  `
  CREATE TABLE resumos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    data       TEXT NOT NULL,                -- AAAA-MM-DD
    origem     TEXT NOT NULL,                -- agendado | catch_up | manual
    estado     TEXT NOT NULL,                -- aberto | iniciado | nenhuma | substituido
    criado_em  TEXT NOT NULL
  );

  -- Tasks de um resumo; idx é o número mostrado ao João e vai no callback_data dos botões.
  CREATE TABLE resumo_itens (
    resumo_id    INTEGER NOT NULL REFERENCES resumos(id),
    idx          INTEGER NOT NULL,
    ferramenta   TEXT NOT NULL,
    task_id      TEXT NOT NULL,
    empresa      TEXT NOT NULL,
    app_sugerido TEXT,                       -- null = projeto não mapeado (sem botão)
    msg_id       INTEGER,                    -- mensagem do Telegram que tem o botão
    selecionada  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (resumo_id, idx)
  );

  ALTER TABLE selecoes ADD COLUMN resumo_id INTEGER;
  ALTER TABLE selecoes ADD COLUMN etapa TEXT;          -- info | destino | escolher_app | alvo | confirmar
  ALTER TABLE selecoes ADD COLUMN msg_pergunta INTEGER; -- mensagem da pergunta atual (para tirar os botões)
  `,
];

export type DB = Database.Database;

export function openDb(file = join(ROOT, 'data', 'hub.db')): DB {
  mkdirSync(join(ROOT, 'data'), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db: DB) {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
    log.info('db: migração aplicada', { versao: v + 1 });
  }
}

export function getMeta(db: DB, chave: string): string | undefined {
  return (db.prepare('SELECT valor FROM meta WHERE chave = ?').get(chave) as { valor: string } | undefined)?.valor;
}

export function setMeta(db: DB, chave: string, valor: string) {
  db.prepare('INSERT INTO meta (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor').run(
    chave,
    valor,
  );
}

export function contagens(db: DB) {
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    fila: n('SELECT COUNT(*) n FROM fila'),
    aguardandoDespacho: n("SELECT COUNT(*) n FROM selecoes WHERE estado = 'aguardando_despacho'"),
    emAndamento: db
      .prepare(
        "SELECT d.id, d.app, d.estado, s.task_id FROM despachos d JOIN selecoes s ON s.id = d.selecao_id WHERE d.estado IN ('em_execucao','aguardando_joao','pausado_limite') ORDER BY d.id",
      )
      .all() as { id: number; app: string; estado: string; task_id: string }[],
  };
}
