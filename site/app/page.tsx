// Página principal do Muxor: mesma estrutura do onorca.dev (cabeçalho fixo, hero com dois botões e o comando,
// faixa "funciona com", abas de recursos, seções, perguntas e chamada final), com o conteúdo e as cores do Muxor.
import { ArrowRight, BellRing, Boxes, Eye, FolderGit2, Layers, Laptop, MapPin, Lock, Server, ShieldCheck, Smartphone, Stethoscope, Terminal } from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { Abas } from '@/components/abas';
import { ComandoInstalar } from '@/components/copiar';
import { IconeGitHub, IconeTelegram } from '@/components/icones';
import { Revelar } from '@/components/revelar';

const GITHUB = 'https://github.com/JpRodrigues2/muxor';
const DOCS = '/docs';
const DOCS_GITHUB = `${GITHUB}/tree/main/instalacao`;
const INSTALAR = 'curl -fsSL https://muxor.com.br/install | bash';

// ───────────────────────── peças ─────────────────────────

function Cabecalho() {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="absolute inset-0 -z-10 border-b border-white/[0.06] bg-fundo/80 backdrop-blur-xl" />
      <div className="site-container flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <a href="#" className="flex items-center gap-2.5 text-texto transition-opacity hover:opacity-80">
            <Image src="/muxor-cabecalho.png" alt="" width={19} height={32} className="h-8 w-auto" priority />
            <span className="text-[15px] font-semibold tracking-[-0.02em]">Muxor</span>
          </a>
          <nav className="hidden items-center gap-1 sm:flex">
            {[
              ['Docs', DOCS],
              ['Como funciona', '#como-funciona'],
              ['Perguntas', '#perguntas'],
            ].map(([nome, href]) => (
              <a key={nome} href={href} className="inline-flex h-8 items-center px-2.5 text-[13.5px] font-medium tracking-[-0.005em] text-texto/65 transition-colors hover:text-texto">
                {nome}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <a href={DOCS} className="inline-flex h-8 items-center px-2 text-[13.5px] font-medium text-texto/65 transition-colors hover:text-texto sm:hidden">
            Docs
          </a>
          <a href={GITHUB} className="hidden h-8 items-center gap-1.5 px-2.5 text-[13.5px] font-medium text-texto/65 transition-colors hover:text-texto sm:inline-flex">
            <IconeGitHub className="h-4 w-4" /> GitHub
          </a>
          <a href="#instalar" className="inline-flex h-8 items-center rounded-md bg-botao px-3 text-[13.5px] font-semibold text-botao-texto transition hover:opacity-90">
            Instalar
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-x-clip pt-24 md:pt-32">
      {/* Brilho de nebulosa ao fundo (o céu em three.js entra depois). */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-10 -z-10 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-poeira/10 blur-[120px]" />
      <div className="site-container grid items-center gap-12 md:grid-cols-[1.25fr_1fr]">
        <Revelar>
          <h1 className="text-display text-balance">Levante da cadeira. Suas tasks continuam andando.</h1>
          <p className="text-lede mt-6 max-w-[40rem] text-balance text-suave">
            Escolha as tasks do dia pelo celular e o Claude Code começa a trabalhar nelas. Você vê o código sendo escrito ao
            vivo, responde quando ele precisar e abre o PR de onde estiver. Mais entregas, sem ficar preso ao computador.
          </p>
          <div id="instalar" className="mt-8 flex max-w-lg flex-col gap-2.5">
            <a
              href={DOCS}
              className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-md bg-botao px-5 text-[15px] font-semibold text-botao-texto transition hover:opacity-90"
            >
              <Laptop className="h-5 w-5" /> Instalar no Mac
            </a>
            <a
              href={GITHUB}
              className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-texto/85 transition-colors hover:bg-white/[0.07]"
            >
              <IconeGitHub className="h-5 w-5" /> Ver no GitHub
            </a>
            <div className="mt-2">
              <ComandoInstalar comando={INSTALAR} />
            </div>
            <p className="flex items-center justify-center gap-1.5 text-xs text-suave">
              <Server className="h-3.5 w-3.5" /> Também em servidores Linux, para rodar 24 h.
            </p>
          </div>
        </Revelar>
        <Revelar atraso={150} className="hidden justify-center md:flex">
          <Image src="/muxor.png" alt="O estagiário do Muxor, com um cabo em Y no braço" width={653} height={1100} priority className="h-auto w-[300px] drop-shadow-[0_0_40px_rgba(232,215,176,0.12)] lg:w-[340px]" />
        </Revelar>
      </div>
    </section>
  );
}

const NOMES = ['Claude Code', 'Orca', 'Telegram', 'GitHub', 'Jira', 'Funifier PM', 'Bnexo', 'macOS', 'Linux'];

function FuncionaCom() {
  return (
    <section className="mt-16 border-y border-borda/60 py-6 md:mt-24">
      <p className="text-center font-mono text-[12px] uppercase tracking-[0.18em] text-suave">Funciona com</p>
      <div className="relative mt-4 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        <div className="faixa-rolando flex w-max gap-12 whitespace-nowrap text-lg font-medium text-texto/50">
          {[...NOMES, ...NOMES].map((n, i) => (
            <span key={i}>{n}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

// Quadros das abas: imitam o chat do Telegram e o terminal, em HTML (nítidos em qualquer tela).
function Chat({ linhas }: { linhas: ReactNode[] }) {
  return (
    <div className="rounded-xl border border-borda bg-superficie p-4 shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 border-b border-borda pb-3 text-[13px] text-suave">
        <IconeTelegram className="h-4 w-4 text-dourado" /> Muxor · bot
      </div>
      <div className="mt-3 space-y-2.5 font-mono text-[11.5px] leading-relaxed sm:text-[12.5px]">{linhas}</div>
    </div>
  );
}
const Msg = ({ children }: { children: ReactNode }) => <div className="w-fit max-w-full rounded-lg bg-superficie-2 px-3 py-2 text-texto/90">{children}</div>;

function Tela({ linhas }: { linhas: ReactNode[] }) {
  return (
    <div className="rounded-xl border border-borda bg-[#0b0c0e] shadow-2xl shadow-black/40">
      <div className="flex gap-1.5 border-b border-borda px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-borda" />
        <span className="h-2.5 w-2.5 rounded-full bg-borda" />
        <span className="h-2.5 w-2.5 rounded-full bg-borda" />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[11.5px] leading-relaxed text-texto/85 sm:text-[12.5px]">{linhas}</pre>
    </div>
  );
}

const ABAS = [
  {
    nome: 'Listagem',
    titulo: 'Planeje o dia em 30 segundos',
    texto: 'Suas tasks chegam no Telegram na mesma ordem da sprint, com as subtarefas. Toque nas que quer entregar hoje. Nada de abrir o board, copiar a descrição e colar no terminal.',
    quadro: (
      <Chat
        linhas={[
          <Msg key="1">
            <b>📋 App de Pedidos</b>
            <br />
            <span className="text-suave">Sprint 14 · 3 tasks</span>
            <br />
            <br />
            🗓 <b>Novembro</b>
            <br />✅ /t1 Checkout com Pix
            <br />
            {'   '}↳ ⬜ /t2 Validar CPF no cadastro
            <br />
            {'   '}↳ ⬜ /t3 Testes do checkout
          </Msg>,
          <div key="2" className="flex gap-2 text-[12px]">
            <span className="rounded-md bg-botao px-2.5 py-1.5 font-semibold text-botao-texto">▶️ Iniciar</span>
            <span className="rounded-md border border-borda px-2.5 py-1.5">📦 Em lote</span>
          </div>,
        ]}
      />
    ),
  },
  {
    nome: 'Despacho',
    titulo: 'Um toque e o trabalho começa',
    texto: 'O Muxor monta o contexto da task, abre o Claude Code no projeto certo e já atualiza o status no board. Enquanto uma task roda, você despacha a próxima: várias frentes andando ao mesmo tempo.',
    quadro: (
      <Tela
        linhas={[
          <span key="1" className="text-suave">
            {'# Orca · app-pedidos\n'}
          </span>,
          '> Leia e execute a task descrita em runs/42.md\n\n',
          <span key="2" className="text-dourado">
            {'⏺ Vou criar o fluxo de pagamento com Pix…\n'}
          </span>,
          '  ✔ src/checkout/pix.ts\n  ✔ testes passando\n',
        ]}
      />
    ),
  },
  {
    nome: 'Avisos',
    titulo: 'Você só é chamado quando importa',
    texto: 'Chega de olhar o terminal esperando terminar. Quando o Claude tem uma dúvida ou conclui, você recebe no Telegram com o contexto e resolve ali: responde, pede ajuste ou abre o PR.',
    quadro: (
      <Chat
        linhas={[
          <Msg key="1">
            🙋 <b>Checkout com Pix</b> precisa de você
            <br />
            <span className="text-suave">“Guardo o QR Code ou gero a cada pedido?”</span>
          </Msg>,
          <Msg key="2">
            ✅ <b>Checkout com Pix</b> concluída
            <br />
            <span className="text-suave">branch feat/checkout-pix · 4 arquivos</span>
          </Msg>,
          <div key="3" className="flex flex-wrap gap-2 text-[12px]">
            <span className="rounded-md border border-borda px-2.5 py-1.5">💬 Instrução</span>
            <span className="rounded-md border border-borda px-2.5 py-1.5">🔀 Abrir PR</span>
            <span className="rounded-md border border-borda px-2.5 py-1.5">✅ Encerrar</span>
          </div>,
        ]}
      />
    ),
  },
  {
    nome: 'Espaços',
    titulo: 'Trabalho e pessoal, sem acidente',
    texto: 'Cada espaço tem a sua conta do GitHub. Commit, push e PR saem sempre pela conta certa, sem chave SSH e sem nunca mais subir código pessoal no repositório da empresa.',
    quadro: (
      <Tela
        linhas={[
          <span key="1" className="text-suave">{'~/Documents\n'}</span>,
          '├── EMPRESA/   ', <span key="2" className="text-dourado">{'→ conta do trabalho\n'}</span>,
          '│   ├── app-pedidos\n│   └── painel\n',
          '└── PESSOAL/   ', <span key="3" className="text-dourado">{'→ conta pessoal\n'}</span>,
          '    └── laboratorio\n',
        ]}
      />
    ),
  },
  {
    nome: 'Celular',
    titulo: 'O terminal no seu bolso',
    texto: 'Não é só um aviso de pronto. Pelo app do Orca você assiste à sessão ao vivo, arquivo por arquivo, de qualquer rede. No modo servidor, o trabalho continua até com o Mac desligado.',
    quadro: (
      <Chat
        linhas={[
          <Msg key="1">🟢 Muxor online · retomando 1 task</Msg>,
          <Msg key="2">
            🔵 <b>Tela de login</b> rodando
            <br />
            <span className="text-suave">abra no Orca para acompanhar</span>
          </Msg>,
        ]}
      />
    ),
  },
  {
    nome: 'Diagnóstico',
    titulo: 'Pronto em minutos, sem adivinhação',
    texto: 'O muxor init configura tudo no terminal, passo a passo, e retoma de onde parou. O muxor diagnostico confere cada peça e diz o próximo passo.',
    quadro: (
      <Tela
        linhas={[
          <span key="1" className="text-suave">{'$ muxor diagnostico\n\n'}</span>,
          <span key="2" className="text-ok">{'  ✅ '}</span>, 'Bot: @meu_muxor_bot\n',
          <span key="3" className="text-ok">{'  ✅ '}</span>, 'Jira: conectado\n',
          <span key="4" className="text-ok">{'  ✅ '}</span>, 'Orca: versão 1.4\n',
          <span key="5" className="text-dourado">{'  ⚠️  '}</span>, 'Espaço Pessoal: sem conta do GitHub\n',
          '       → muxor adicionar github-workspace\n',
        ]}
      />
    ),
  },
];

function Recursos() {
  return (
    <section id="como-funciona" className="site-container mt-20 scroll-mt-24 md:mt-28">
      <Revelar>
        <h2 className="text-heading text-balance text-center">Do board ao pull request.</h2>
        <p className="text-lede mx-auto mt-5 max-w-2xl text-center text-suave">Você decide o que fazer. O Muxor cuida do resto e só chama você quando faz diferença.</p>
      </Revelar>
      <Revelar className="mt-12" atraso={100}>
        <Abas abas={ABAS} />
      </Revelar>
    </section>
  );
}

// Por que instalar: o ganho, antes de como funciona.
function Ganhos() {
  const itens = [
    { icone: Layers, titulo: 'Mais entregas por dia', texto: 'Várias tasks rodando em paralelo enquanto você revisa outra. Você para de esperar o Claude e passa a coordenar.' },
    { icone: MapPin, titulo: 'Trabalhe de onde estiver', texto: 'Do café, da fila, do sofá. Escolher, responder e aprovar cabe no celular; o computador faz o trabalho pesado.' },
    { icone: Eye, titulo: 'Sem perder o controle', texto: 'Você vê cada mudança no código enquanto ela acontece. Nada vira concluído ou PR sem o seu sim.' },
  ];
  return (
    <section className="site-container mt-20 md:mt-28">
      <Revelar>
        <h2 className="text-heading text-balance">O seu tempo vale mais do que vigiar um terminal.</h2>
        <p className="text-lede mt-5 max-w-2xl text-suave">
          O Claude Code já escreve o código. O que trava o seu dia é ficar na frente da tela abrindo task, colando contexto e
          esperando ele terminar. O Muxor tira você dessa fila.
        </p>
      </Revelar>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {itens.map((x, i) => (
          <Revelar key={x.titulo} atraso={i * 120}>
            <div className="h-full rounded-xl border border-borda bg-superficie p-6">
              <x.icone className="h-6 w-6 text-dourado" />
              <h3 className="mt-4 text-lg font-medium tracking-[-0.01em]">{x.titulo}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-suave">{x.texto}</p>
            </div>
          </Revelar>
        ))}
      </div>
    </section>
  );
}

function Passos() {
  const passos = [
    { icone: IconeTelegram, titulo: 'Escolha pelo celular', texto: 'A lista das suas tasks chega num bot só seu. Escolha as do dia e mande o contexto que faltar: texto, foto ou arquivo.' },
    { icone: Terminal, titulo: 'O Claude trabalha', texto: 'Cada task vira uma sessão do Claude Code no projeto certo, seguindo as suas regras de trabalho.' },
    { icone: FolderGit2, titulo: 'Você revisa e entrega', texto: 'Ele avisa quando termina. Você confere, pede ajuste ou abre o PR, de onde estiver.' },
  ];
  return (
    <section className="site-container mt-20 md:mt-32">
      <Revelar>
        <h2 className="text-heading text-balance">Três passos. Um estagiário.</h2>
      </Revelar>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {passos.map((p, i) => (
          <Revelar key={p.titulo} atraso={i * 120}>
            <div className="h-full rounded-xl border border-borda bg-superficie p-6">
              <div className="flex items-center gap-3 font-mono text-[12px] text-dourado">
                <span>0{i + 1}</span>
                <span className="h-px flex-1 bg-borda" />
              </div>
              <p.icone className="mt-5 h-6 w-6 text-texto" />
              <h3 className="mt-4 text-lg font-medium tracking-[-0.01em]">{p.titulo}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-suave">{p.texto}</p>
            </div>
          </Revelar>
        ))}
      </div>
    </section>
  );
}

function Modos() {
  return (
    <section className="site-container mt-20 md:mt-32">
      <Revelar>
        <h2 className="text-heading text-balance">No seu Mac ou no seu servidor.</h2>
        <p className="text-lede mt-5 max-w-2xl text-suave">Comece no Mac. Quando quiser rodar 24 h, leve para uma VPS sua: o mesmo Muxor, o mesmo bot.</p>
      </Revelar>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {[
          { icone: Laptop, titulo: 'Local', itens: ['Instala em minutos com o muxor init', 'Roda enquanto o Mac está ligado', 'Celular pelo Relay do Orca, de qualquer rede'] },
          { icone: Server, titulo: 'Servidor (Linux)', itens: ['24 h, com o Mac desligado', 'Credenciais num cofre cifrado; a sessão nunca vê a chave', 'Atualiza sozinho a cada versão'] },
        ].map((m, i) => (
          <Revelar key={m.titulo} atraso={i * 120}>
            <div className="h-full rounded-xl border border-borda bg-superficie p-7">
              <m.icone className="h-6 w-6 text-dourado" />
              <h3 className="mt-4 text-xl font-medium tracking-[-0.01em]">{m.titulo}</h3>
              <ul className="mt-4 space-y-2.5 text-[15px] text-suave">
                {m.itens.map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-nebulosa" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </Revelar>
        ))}
      </div>
    </section>
  );
}

function Seguranca() {
  const itens = [
    { icone: Lock, titulo: 'Segredos no seu computador', texto: 'Tokens no .env só seu e no Keychain. Nunca passam pelo Telegram.' },
    { icone: ShieldCheck, titulo: 'Status só com o seu Sim', texto: 'Ele muda a task para "em progresso" ao despachar e só conclui quando você confirma. Nunca comenta sem você pedir.' },
    { icone: BellRing, titulo: 'Só a sua conversa', texto: 'O bot atende um único chat: o seu. Qualquer outro é ignorado e registrado.' },
    { icone: Boxes, titulo: 'Claude com permissão auto', texto: 'As sessões pedem aprovação para o que é arriscado. Acesso total nunca é usado.' },
    { icone: FolderGit2, titulo: 'Só os projetos que você trouxer', texto: 'O que fica de fora do Muxor ele nunca toca, nem as sessões que você abriu.' },
    { icone: Stethoscope, titulo: 'Desinstala sem deixar rastro', texto: 'O muxor desinstalar desfaz exatamente o que a instalação fez.' },
  ];
  return (
    <section className="site-container mt-20 md:mt-32">
      <Revelar>
        <h2 className="text-heading text-balance">Seguro por padrão.</h2>
      </Revelar>
      <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {itens.map((x, i) => (
          <Revelar key={x.titulo} atraso={(i % 3) * 100}>
            <x.icone className="h-5 w-5 text-dourado" />
            <h3 className="mt-3 font-medium">{x.titulo}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-suave">{x.texto}</p>
          </Revelar>
        ))}
      </div>
    </section>
  );
}

const PERGUNTAS = [
  ['O que é o Muxor?', 'Um estagiário para o seu Claude Code: pega as tasks do seu board, coloca o Claude para trabalhar nelas e mantém você no controle pelo celular. Você decide e revisa; ele cuida do resto.'],
  ['Preciso do Orca?', 'Sim. O Orca é quem roda as sessões do Claude Code e deixa você acompanhar pelo celular. Ele é gratuito.'],
  ['Quais ferramentas de gestão funcionam?', 'Jira (Cloud), Funifier PM e Bnexo. Você escolhe na instalação e pode mudar depois. Sem nenhuma, dá para usar só as atividades avulsas (/nova).'],
  ['Funciona com mais de uma conta do GitHub?', 'Sim. Cada espaço é uma pasta ligada a uma conta: o trabalho sai pela conta do trabalho, o pessoal pela pessoal.'],
  ['Preciso deixar o Mac ligado?', 'No modo local, sim. No modo servidor, o Muxor roda 24 h numa VPS sua e o Mac vira só uma janela.'],
  ['Ele mexe nas minhas tasks?', 'Só no status: "em progresso" ao despachar e "concluída" com o seu Sim. Nunca comenta nem põe em revisão sem você pedir.'],
  ['Quanto custa?', 'O Muxor é gratuito e de código aberto (MIT). Você usa a sua própria assinatura do Claude Code.'],
  ['Como desinstalo?', 'muxor desinstalar. Ele mostra o que vai desfazer, pede confirmação e deixa o computador como estava.'],
];

function Perguntas() {
  return (
    <section id="perguntas" className="site-container mt-20 scroll-mt-24 md:mt-32">
      <Revelar>
        <h2 className="text-heading text-balance text-center">Perguntas frequentes</h2>
      </Revelar>
      <div className="mx-auto mt-10 max-w-3xl divide-y divide-borda border-y border-borda">
        {PERGUNTAS.map(([p, r]) => (
          <details key={p} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-medium">
              {p}
              <span className="text-suave transition-transform duration-300 group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 leading-relaxed text-suave">{r}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function ChamadaFinal() {
  return (
    <section className="site-container mt-20 md:mt-32">
      <Revelar>
        <div className="relative overflow-hidden rounded-2xl border border-borda bg-superficie px-5 py-12 text-center md:px-16 md:py-14">
          <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[640px] -translate-x-1/2 rounded-full bg-nebulosa/10 blur-[100px]" />
          <Image src="/muxor.png" alt="O estagiário do Muxor" width={653} height={1100} className="mx-auto h-auto w-[120px] md:w-[140px]" />
          <h2 className="text-heading mt-6 text-balance">Contrate o seu estagiário.</h2>
          <p className="text-lede mx-auto mt-4 max-w-xl text-suave">Instale em minutos e deixe a próxima task começar sem você na cadeira.</p>
          <div className="mx-auto mt-8 max-w-md">
            <ComandoInstalar comando={INSTALAR} />
          </div>
          <div className="mt-6 flex justify-center gap-3">
            <a href={DOCS} className="inline-flex h-11 items-center gap-2 rounded-md bg-botao px-5 text-sm font-semibold text-botao-texto transition hover:opacity-90">
              Ler a documentação
            </a>
            <a href={GITHUB} className="inline-flex h-11 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-texto/85 transition-colors hover:bg-white/[0.07]">
              <IconeGitHub className="h-4 w-4" /> GitHub
            </a>
          </div>
        </div>
      </Revelar>
    </section>
  );
}

function Rodape() {
  const colunas: [string, [string, string][]][] = [
    ['Produto', [['Instalar', '#instalar'], ['Documentação', DOCS], ['Docs no GitHub', DOCS_GITHUB], ['Como funciona', '#como-funciona']]],
    ['Comunidade', [['GitHub', GITHUB], ['Relatar um problema', `${GITHUB}/issues`]]],
    ['Projeto', [['Licença MIT', `${GITHUB}/blob/main/LICENSE`], ['Perguntas', '#perguntas']]],
  ];
  return (
    <footer className="mt-20 border-t border-borda md:mt-32">
      <div className="site-container grid grid-cols-2 gap-10 py-12 md:grid-cols-[1.5fr_repeat(3,1fr)] md:py-14">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2.5">
            <Image src="/muxor-cabecalho.png" alt="" width={19} height={32} className="h-8 w-auto" />
            <span className="font-semibold tracking-[-0.02em]">Muxor</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-suave">O estagiário que despacha suas tasks para o Claude Code.</p>
        </div>
        {colunas.map(([t, links]) => (
          <div key={t}>
            <p className="text-sm font-medium">{t}</p>
            <ul className="mt-3 space-y-2 text-sm text-suave">
              {links.map(([n, h]) => (
                <li key={n}>
                  <a href={h} className="transition-colors hover:text-texto">
                    {n}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="site-container border-t border-borda py-6 font-mono text-[12px] text-suave">
        <Smartphone className="mr-1.5 inline h-3.5 w-3.5" />
        feito no Brasil · código aberto
      </div>
    </footer>
  );
}

export default function Pagina() {
  return (
    <>
      <Cabecalho />
      <main>
        <Hero />
        <FuncionaCom />
        <Ganhos />
        <Recursos />
        <Passos />
        <Modos />
        <Seguranca />
        <Perguntas />
        <ChamadaFinal />
      </main>
      <Rodape />
    </>
  );
}
