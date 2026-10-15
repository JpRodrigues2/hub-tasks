// Leitura e validação do .env e do apps.yaml.
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const EnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(20),
  TELEGRAM_CHAT_ID: z.string().regex(/^-?\d+$/, 'TELEGRAM_CHAT_ID precisa ser numérico'),
  BNEXO_MCP_URL: z.url(),
  BNEXO_MCP_TOKEN: z.string().min(10),
  FUNIFIER_PM_MCP_URL: z.url(),
  RESUMO_HORARIO: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  TZ_HUB: z.string().default('America/Sao_Paulo'),
  ORCA_BIN: z.string().default('/Applications/Orca.app/Contents/Resources/bin/orca'),
  // Trava de segurança: enquanto for false, o hub não muda status nem comenta nas ferramentas de gestão.
  HUB_ESCRITA_PM: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  // Se definido (IDs separados por vírgula), a escrita vale SÓ para essas tasks — para testar com tasks aprovadas.
  HUB_ESCRITA_PM_SOMENTE: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : null)),
});
export type Env = z.infer<typeof EnvSchema>;

const GamificacaoSchema = z.object({
  nome: z.string(),
  servidor: z.string(),
  conta: z.string(),
  padrao: z.boolean().default(false),
});

const AppSchema = z.object({
  app: z.string().regex(/^[a-z0-9._-]+$/),
  empresa: z.enum(['funifier', 'dac']),
  ferramenta: z.enum(['funifier-pm', 'bnexo', 'teste']), // teste = tasks fictícias (sandbox)
  projetos_na_ferramenta: z.array(z.string()).default([]),
  pasta: z.string().startsWith('/'),
  contexto: z.string().nullable().default(null),
  sessao_resume_id: z.string().nullable().default(null),
  gamificacoes: z.array(GamificacaoSchema).optional(),
});
export type App = z.infer<typeof AppSchema>;
export type Gamificacao = z.infer<typeof GamificacaoSchema>;

const CatalogoSchema = z.object({
  apps: z.array(AppSchema),
  nao_mapeados: z
    .object({ 'funifier-pm': z.array(z.string()).default([]), bnexo: z.array(z.string()).default([]) })
    .default({ 'funifier-pm': [], bnexo: [] }),
  nomes_projetos: z.object({ bnexo: z.record(z.string(), z.string()).default({}) }).default({ bnexo: {} }),
});
export type Catalogo = z.infer<typeof CatalogoSchema>;

function formatIssues(e: z.ZodError) {
  return e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export function loadEnv(): Env {
  const r = EnvSchema.safeParse(process.env);
  if (!r.success) throw new Error(`.env inválido — ${formatIssues(r.error)}`);
  return r.data;
}

export const APPS_FILE = process.env.HUB_APPS_FILE ?? join(ROOT, 'apps.yaml');

// Relido a cada uso (antes de cada resumo / /status), para pegar edições sem reiniciar o bot.
export function loadCatalogo(): Catalogo {
  const r = CatalogoSchema.safeParse(parse(readFileSync(APPS_FILE, 'utf8')));
  if (!r.success) throw new Error(`apps.yaml inválido — ${formatIssues(r.error)}`);
  const nomes = new Set<string>();
  for (const a of r.data.apps) {
    if (nomes.has(a.app)) throw new Error(`apps.yaml: app duplicado "${a.app}"`);
    nomes.add(a.app);
  }
  return r.data;
}

export function appsDoProjeto(cat: Catalogo, ferramenta: App['ferramenta'], projetoId: string): App[] {
  return cat.apps.filter((a) => a.ferramenta === ferramenta && a.projetos_na_ferramenta.includes(projetoId));
}

export function pastaExiste(a: App) {
  return existsSync(a.pasta);
}
