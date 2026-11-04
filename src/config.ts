// Leitura e validação do .env e do apps.yaml.
import 'dotenv/config';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, parseDocument, type Document } from 'yaml';
import { z } from 'zod';
import { CAMINHOS, resolverPasta } from './caminhos.js';

const EnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(20),
  TELEGRAM_CHAT_ID: z.string().regex(/^-?\d+$/, 'TELEGRAM_CHAT_ID precisa ser numérico'),
  BNEXO_MCP_URL: z.url(),
  BNEXO_MCP_TOKEN: z.string().min(10),
  FUNIFIER_PM_MCP_URL: z.url(),
  RESUMO_HORARIO: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  TZ_HUB: z.string().default('America/Sao_Paulo'),
  ORCA_BIN: z.string().default('/Applications/Orca.app/Contents/Resources/bin/orca'),
  // Pareamento salvo no CLI do Orca (`orca environment add`) quando o Orca roda com outro usuário (servidor).
  ORCA_ENVIRONMENT: z.string().optional(),
  // Comando que marca a pasta como confiável no Claude de quem roda as sessões, antes de abrir o Claude (servidor).
  HUB_CONFIAR_PASTA_CMD: z.string().optional(),
  // Cofre das credenciais: Keychain no Mac, arquivo cifrado no servidor (chave-mestra do systemd-creds).
  HUB_COFRE: z.enum(['keychain', 'arquivo-cifrado']).default(process.platform === 'darwin' ? 'keychain' : 'arquivo-cifrado'),
  // Broker: a sessão usa a Funifier pelo MCP do hub e não recebe mais o credenciais.json (docs/estudo/broker.md).
  HUB_BROKER: z.enum(['ligado', 'desligado']).default('desligado'),
  HUB_BROKER_PORTA: z.coerce.number().int().default(7790),
  // Arquivo com o token que a sessão manda ao broker (o mesmo registrado no MCP "hub" do Claude do agente).
  HUB_BROKER_TOKEN_ARQ: z.string().optional(),
  HUB_FUNIFIER_MCP: z.string().default('npx -y funifier-mcp@0.8.1'),
  // Modo de permissão das sessões do Claude que o hub abre (auto = classificador aprova o seguro e pede aprovação para o arriscado; bypassPermissions é proibido).
  HUB_CLAUDE_PERMISSAO: z.enum(['auto', 'acceptEdits', 'manual', 'plan']).default('auto'),
  // Trava de segurança: enquanto for false, o hub não muda status nas ferramentas de gestão.
  HUB_ESCRITA_PM: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  // Comentários nas tasks: bloqueados por padrão; o hub só comenta com comando explícito do usuário (B02).
  HUB_COMENTARIOS_PM: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
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
  // Id das credenciais (API key + secret) no Cofre — nunca a credencial em si.
  credencial: z.string().optional(),
  // Sem o campo, o broker trata como produção o nome que começa com "prod".
  ambiente: z.enum(['dev', 'producao']).optional(),
});

const AppSchema = z.object({
  app: z.string().regex(/^[a-z0-9._-]+$/),
  empresa: z.enum(['funifier', 'dac']),
  ferramenta: z.enum(['funifier-pm', 'bnexo', 'teste']), // teste = tasks fictícias (sandbox)
  projetos_na_ferramenta: z.array(z.string()).default([]),
  pasta: z.string().min(1).transform((p) => resolverPasta(p)), // relativa: dentro de HUB_REPOS_DIR
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

export const APPS_FILE = CAMINHOS.apps;
const CATALOGO_VAZIO = 'apps: []\n';

function lerArquivoCatalogo() {
  return existsSync(APPS_FILE) ? readFileSync(APPS_FILE, 'utf8') : CATALOGO_VAZIO;
}

// Relido a cada uso (antes de cada resumo / /status), para pegar edições sem reiniciar o bot.
// Sem apps.yaml (servidor novo), o catálogo começa vazio e o arquivo nasce na primeira edição.
export function loadCatalogo(): Catalogo {
  const r = CatalogoSchema.safeParse(parse(lerArquivoCatalogo()));
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

// ─────────────── edição do apps.yaml pelo Telegram (B15) ───────────────
// Edita preservando os comentários; valida o resultado antes de gravar e guarda a versão anterior em data/.

function editarCatalogo(fn: (doc: Document.Parsed) => void) {
  const original = lerArquivoCatalogo();
  const doc = parseDocument(original);
  fn(doc);
  const novo = doc.toString();
  const r = CatalogoSchema.safeParse(parse(novo));
  if (!r.success) throw new Error(`apps.yaml ficaria inválido — ${formatIssues(r.error)}`);
  if (existsSync(APPS_FILE)) {
    const hist = join(CAMINHOS.dados, 'apps-historico');
    mkdirSync(hist, { recursive: true });
    copyFileSync(APPS_FILE, join(hist, `apps-${new Date().toISOString().replace(/[:.]/g, '-')}.yaml`));
  }
  writeFileSync(APPS_FILE, novo);
}

function indiceApp(doc: Document.Parsed, nome: string) {
  const apps = doc.toJS().apps as { app: string }[];
  const i = apps.findIndex((a) => a.app === nome);
  if (i < 0) throw new Error(`app "${nome}" não existe no apps.yaml`);
  return i;
}

export function adicionarApp(a: { app: string; empresa: App['empresa']; ferramenta: App['ferramenta']; pasta: string; projeto: string | null }) {
  editarCatalogo((doc) => {
    if ((doc.toJS().apps as { app: string }[]).some((x) => x.app === a.app)) throw new Error(`já existe um app "${a.app}"`);
    doc.addIn(['apps'], {
      app: a.app,
      empresa: a.empresa,
      ferramenta: a.ferramenta,
      projetos_na_ferramenta: a.projeto ? [a.projeto] : [],
      pasta: a.pasta,
      sessao_resume_id: null,
      gamificacoes: [],
    });
  });
}

export function ligarProjeto(app: string, projeto: string) {
  editarCatalogo((doc) => {
    const i = indiceApp(doc, app);
    const atuais = (doc.getIn(['apps', i, 'projetos_na_ferramenta']) as { toJSON(): string[] } | undefined)?.toJSON() ?? [];
    if (!atuais.includes(projeto)) doc.addIn(['apps', i, 'projetos_na_ferramenta'], projeto);
  });
}

export function adicionarGamificacao(app: string, g: Gamificacao) {
  editarCatalogo((doc) => {
    const i = indiceApp(doc, app);
    // `gamificacoes: []` é uma lista entre colchetes; a primeira gamificação troca por lista em bloco (uma por linha).
    const atual = doc.getIn(['apps', i, 'gamificacoes']) as { items?: unknown[] } | undefined;
    if (!atual?.items?.length) doc.setIn(['apps', i, 'gamificacoes'], doc.createNode([], { flow: false }));
    doc.addIn(['apps', i, 'gamificacoes'], Object.fromEntries(Object.entries(g).filter(([, v]) => v !== undefined)));
  });
}

export function removerGamificacao(app: string, indice: number) {
  editarCatalogo((doc) => {
    doc.deleteIn(['apps', indiceApp(doc, app), 'gamificacoes', indice]);
  });
}
