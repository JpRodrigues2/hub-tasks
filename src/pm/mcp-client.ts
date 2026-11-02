// Conexão com os MCPs das ferramentas de gestão (sem IA).
// - Funifier PM: HTTP + OAuth (registro dinâmico; tokens persistidos em data/oauth, renovados via refresh_token).
// - Bnexo: HTTP + Bearer token do .env.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OAUTH_DIR = join(ROOT, 'data', 'oauth');
const CALLBACK_PORT = 53682;
const REDIRECT_URL = `http://localhost:${CALLBACK_PORT}/callback`;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável ${name} ausente no .env`);
  return v;
}

class FileOAuthProvider implements OAuthClientProvider {
  private file: string;
  private store: Record<string, unknown>;

  constructor(
    name: string,
    private interactive: boolean,
  ) {
    mkdirSync(OAUTH_DIR, { recursive: true, mode: 0o700 });
    this.file = join(OAUTH_DIR, `${name}.json`);
    this.store = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : {};
  }

  private save() {
    writeFileSync(this.file, JSON.stringify(this.store, null, 2), { mode: 0o600 });
  }

  get redirectUrl() {
    return REDIRECT_URL;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Hub de Tasks',
      redirect_uris: [REDIRECT_URL],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  clientInformation() {
    return this.store.client as OAuthClientInformationMixed | undefined;
  }
  saveClientInformation(info: OAuthClientInformationMixed) {
    this.store.client = info;
    this.save();
  }
  tokens() {
    return this.store.tokens as OAuthTokens | undefined;
  }
  saveTokens(tokens: OAuthTokens) {
    this.store.tokens = tokens;
    this.save();
  }
  saveCodeVerifier(v: string) {
    this.store.verifier = v;
    this.save();
  }
  codeVerifier() {
    return this.store.verifier as string;
  }
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    if (scope === 'all' || scope === 'client') delete this.store.client;
    if (scope === 'all' || scope === 'tokens') delete this.store.tokens;
    if (scope === 'all' || scope === 'verifier') delete this.store.verifier;
    this.save();
  }
  redirectToAuthorization(url: URL) {
    if (!this.interactive) return;
    console.log(`\nAbra no navegador para autorizar o hub:\n${url.toString()}\n`);
    execFile('open', [url.toString()], () => {});
  }
}

// Espera o redirect do OAuth no localhost e devolve o "code".
function waitForAuthCode(timeoutMs = 5 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', REDIRECT_URL);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(code ? 'Hub autorizado. Pode fechar esta aba.' : `Falha na autorização: ${err ?? 'sem code'}`);
      clearTimeout(timer);
      server.close();
      code ? resolve(code) : reject(new Error(`OAuth: ${err ?? 'sem code'}`));
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('OAuth: tempo esgotado esperando autorização'));
    }, timeoutMs);
    server.listen(CALLBACK_PORT, '127.0.0.1');
  });
}

export type PmName = 'funifier-pm' | 'bnexo';

export class PmLoginRequiredError extends Error {
  constructor(name: PmName) {
    super(`${name}: login OAuth necessário — rode \`npm run pm:login\` no HUB`);
  }
}

// interactive=false (bot rodando): nunca abre navegador; falha com PmLoginRequiredError.
export async function connect(name: PmName, { interactive = true } = {}): Promise<Client> {
  const client = new Client({ name: 'hub', version: '0.1.0' });

  if (name === 'bnexo') {
    const transport = new StreamableHTTPClientTransport(new URL(requireEnv('BNEXO_MCP_URL')), {
      requestInit: { headers: { Authorization: `Bearer ${requireEnv('BNEXO_MCP_TOKEN')}` } },
    });
    await client.connect(transport);
    return client;
  }

  const url = new URL(requireEnv('FUNIFIER_PM_MCP_URL'));
  const authProvider = new FileOAuthProvider('funifier-pm', interactive);
  const transport = new StreamableHTTPClientTransport(url, { authProvider });
  try {
    await client.connect(transport);
    return client;
  } catch (e) {
    if (!(e instanceof UnauthorizedError)) throw e;
    if (!interactive) throw new PmLoginRequiredError(name);
    const code = await waitForAuthCode();
    await transport.finishAuth(code);
    const retry = new Client({ name: 'hub', version: '0.1.0' });
    await retry.connect(new StreamableHTTPClientTransport(url, { authProvider }));
    return retry;
  }
}
