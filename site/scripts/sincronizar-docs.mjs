// Gera content/docs (a documentação do site) a partir de ../instalacao, que é a fonte única: o mesmo texto serve ao
// site, ao GitHub e à IA de quem instala. Roda antes do dev e do build. Não edite content/docs à mão.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const origem = join(site, '..', 'instalacao');
const destino = join(site, 'content', 'docs');

// Página do site ← arquivo da instalacao/ (a ordem e os grupos da barra lateral, como no onorca.dev).
const PAGINAS = {
  index: 'README.md',
  'pre-requisitos': 'pre-requisitos.md',
  'modo-local': 'modo-local.md',
  'modo-servidor': 'modo-servidor.md',
  'clonar-repositorios': 'prompts/clonar-repositorios.md',
  heartbeat: 'heartbeat.md',
  'migrar-para-servidor': 'migrar-para-servidor.md',
  desinstalar: 'desinstalar.md',
  dicas: 'dicas.md',
};
const TITULOS = { index: 'O que é o Muxor?', 'clonar-repositorios': 'Clonar repositórios' };
const META = {
  title: 'Documentação',
  pages: [
    '---Comece aqui---', 'index', 'pre-requisitos', 'modo-local', 'modo-servidor',
    '---Usando o Muxor---', 'clonar-repositorios', 'heartbeat',
    '---Manutenção---', 'migrar-para-servidor', 'desinstalar',
    '---Ajuda---', 'dicas',
  ],
};
// O vídeo de apresentação entra aqui quando estiver pronto (backlog B43).
const VIDEO = '> 🎬 **Vídeo de apresentação em breve.** Enquanto isso, o passo a passo está logo abaixo.\n\n';

const paraSite = Object.fromEntries(Object.entries(PAGINAS).map(([slug, arq]) => [arq, slug === 'index' ? '/docs' : `/docs/${slug}`]));

function converter(slug, md) {
  let titulo = TITULOS[slug];
  let corpo = md.replace(/^# (.+)\n+/, (_, t) => ((titulo ??= t.replace(/^Muxor: /, '')), ''));
  if (slug === 'clonar-repositorios') corpo = corpo.replace('<!-- prompt -->\n', '```text\n') + '```\n';
  corpo = corpo.replace(/\]\(([^)#\s]+\.md|prompts\/)(#[^)]*)?\)/g, (m, alvo, ancora = '') => {
    const nome = alvo === 'prompts/' ? 'prompts/clonar-repositorios.md' : alvo;
    return paraSite[nome] ? `](${paraSite[nome]}${ancora})` : m;
  });
  const descricao = corpo.split('\n\n').find((p) => p.trim() && !p.startsWith('#') && !p.startsWith('|') && !p.startsWith('```'));
  const desc = (descricao ?? '').replace(/\*\*|`|\[|\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (slug === 'index') corpo = VIDEO + corpo;
  return `---\ntitle: ${JSON.stringify(titulo ?? slug)}\ndescription: ${JSON.stringify(desc)}\n---\n\n${corpo}`;
}

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
for (const [slug, arq] of Object.entries(PAGINAS)) writeFileSync(join(destino, `${slug}.md`), converter(slug, readFileSync(join(origem, arq), 'utf8')));
writeFileSync(join(destino, 'meta.json'), JSON.stringify(META, null, 2) + '\n');
console.log(`docs: ${Object.keys(PAGINAS).length} páginas geradas de instalacao/`);

// Os scripts de instalação, servidos em muxor.com.br/install e /uninstall (curl … | bash). A fonte é instalacao/scripts.
for (const [nome, arq] of [['install', 'install.sh'], ['uninstall', 'uninstall.sh']]) copyFileSync(join(origem, 'scripts', arq), join(site, 'public', nome));
console.log('scripts: public/install e public/uninstall');
