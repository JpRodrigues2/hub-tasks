#!/usr/bin/env node
// Comando `hub`: roda o TypeScript do hub direto (tsx), sem etapa de build.
import { accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { register } from 'tsx/esm/api';

// Chamado com `sudo -u hub` de uma pasta que o hub não lê (ex.: a do ubuntu): os processos filhos (esbuild do
// tsx, git, Orca) falhariam com EACCES. O hub não depende da pasta atual.
try {
  accessSync('.', constants.R_OK | constants.X_OK);
} catch {
  process.chdir(homedir());
}
register();
await import('../src/cli/index.ts');
