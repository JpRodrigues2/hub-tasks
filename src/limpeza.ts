// Limpeza periódica de runs/ (B11): prompts e anexos de tasks encerradas há mais de 30 dias.
// Nunca toca em tasks em andamento; o histórico no banco continua.
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
