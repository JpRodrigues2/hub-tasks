// Limpeza de runs/ (prompts, anexos e credenciais por task). Nunca toca em task em andamento.
//   automática (B11): tasks encerradas há mais de 30 dias, todo dia às 04:00;
//   manual (/limpar_runs): só as concluídas, ou todas menos as em andamento.
// O histórico no banco continua.
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './db.js';
import { log } from './logger.js';
import { RUNS_DIR } from './prompt.js';

const DIAS = 30;

export function limparRuns(db: DB) {
  if (!existsSync(RUNS_DIR)) return 0;
  const corte = new Date(Date.now() - DIAS * 86400_000).toISOString();
  const ids = new Set(
    (
      db
        .prepare("SELECT id FROM selecoes WHERE estado IN ('encerrada', 'cancelada', 'interrompida') AND atualizado_em < ?")
        .all(corte) as { id: number }[]
    ).map((r) => String(r.id)),
  );
  let apagados = 0;
  for (const nome of readdirSync(RUNS_DIR)) {
    // runs/<id>.md, runs/<id>-<rodada>.md e a pasta de anexos runs/<id>/
    const id = nome.match(/^(\d+)(?:-\d+)?(?:\.md)?$/)?.[1];
    if (!id || !ids.has(id)) continue;
    rmSync(join(RUNS_DIR, nome), { recursive: true, force: true });
    apagados++;
  }
  if (apagados) log.info('limpeza: runs apagados', { apagados, dias: DIAS });
  return apagados;
}

// Em andamento: configurando, na fila, rodando, esperando o João ou com continuação na fila.
function emAndamento(db: DB): Set<string> {
  return new Set(
    (
      db
        .prepare(
          `SELECT id FROM selecoes WHERE estado IN ('coletando', 'aguardando_despacho', 'despachada')
           UNION SELECT selecao_id FROM despachos WHERE estado IN ('em_execucao', 'aguardando_joao', 'pausado_limite', 'seguimento_fila')`,
        )
        .all() as { id: number }[]
    ).map((r) => String(r.id)),
  );
}

export function limparRunsManual(db: DB, modo: 'concluidas' | 'todas') {
  if (!existsSync(RUNS_DIR)) return 0;
  const ativos = emAndamento(db);
  const concluidas = new Set(
    (
      db
        .prepare("SELECT id FROM selecoes WHERE estado IN ('finalizada', 'encerrada', 'cancelada', 'interrompida')")
        .all() as { id: number }[]
    ).map((r) => String(r.id)),
  );
  let apagados = 0;
  for (const nome of readdirSync(RUNS_DIR)) {
    const id = nome.match(/^(\d+)(?:-\d+)?(?:\.md)?$/)?.[1];
    if (!id || ativos.has(id)) continue;
    if (modo === 'concluidas' && !concluidas.has(id)) continue;
    rmSync(join(RUNS_DIR, nome), { recursive: true, force: true });
    apagados++;
  }
  log.info('limpeza: runs (manual)', { modo, apagados, emAndamento: ativos.size });
  return apagados;
}
