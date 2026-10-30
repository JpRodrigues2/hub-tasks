# v2 · Arquitetura, padrões e ferramentas

Parte da [v2](README.md). Registra o diagnóstico da v1 e a proposta de estrutura para a v2: o que impede o app universal, a arquitetura, os padrões e as ferramentas. A v1 está descrita em [arquitetura e código](../arquitetura/arquitetura-e-codigo.md). Segurança de credenciais e banco de dados ficam em [segurança e dados](seguranca-e-dados.md).

Legenda: 🟡 em aberto · ✅ decidida · ❌ descartada.

---

## 1. O que impede a versão universal

O inventário do que é pessoal está em [app universal, B.4](app-universal.md#b4-inventário-o-que-é-pessoal-na-v1). Aqui fica só o que **impede** a entrega, por gravidade.

### 🔴 Bloqueadores: sem resolver, não dá para entregar a ninguém

| # | Bloqueador | Por quê | Onde |
|---|---|---|---|
| I1 | Não há testes automatizados | Toda mudança é validada à mão no Telegram do João. Com N colaboradores, um erro (ex.: no `classificarTela`) trava as tasks de todos ao mesmo tempo. | — |
| I2 | O hub depende do texto da interface do Claude Code | `classificarTela` e `extrairResultado` leem a tela com regex. Versões diferentes do Claude Code entre colaboradores, ou uma mudança de rodapé, param o hub de todos. | `despacho.ts:34`, `:58` |
| I3 | Bnexo obrigatório | `BNEXO_MCP_URL` e `BNEXO_MCP_TOKEN` são obrigatórios no schema: sem eles o hub não inicia. | `config.ts:14` |
| I4 | Empresas fixas no código | `z.enum(['funifier', 'dac'])`, pastas `~/Documents/FUNIFIER` e `DAC`, ramos `empresa === 'funifier'` no fluxo. | `config.ts:45`, `fluxo.ts:816` |
| I5 | Código e dados na mesma pasta | `data/`, `runs/`, `logs/`, `apps.yaml` e `regras/` ficam dentro do repositório (`ROOT`). Atualizar o pacote não pode mexer nos dados do colaborador. | `config.ts:9` |
| I6 | Sem instalação nem serviço | `.env` e `apps.yaml` escritos à mão; processo sobe com `nohup` e não volta depois de reiniciar o Mac (não há LaunchAgent). | — |
| I7 | Sem versionamento nem distribuição | Repositório sem remoto e sem versões: não há como entregar uma correção. | — |
| I8 | Credenciais em arquivo e no contexto do agente | Ver [segurança e dados](seguranca-e-dados.md). Já há valores do cofre nos históricos das sessões do Claude. | `segredos.ts` |

### 🟠 Antes do piloto

| # | Ponto | Por quê |
|---|---|---|
| I9 | "João" no código | Aparece em 17 arquivos, inclusive prompts e regras: o Claude de outro colaborador leria "o João pediu…". |
| I10 | Respostas do MCP do PM são texto para IA | `parseJsonPrefix` (`pm/types.ts`) adivinha o JSON. Confirmar com o time do PM se o formato é estável ou se há API REST. |
| I11 | Diagnóstico e suporte | Logs só na máquina do colaborador. Falta um `/diagnostico` (Orca, ferramentas, versão, últimos erros) para ele mandar ao suporte. |
| I12 | Orca obrigatório | Quem não usa o Orca não usa o hub (D-A3). |
| I13 | Pastas vazias em `runs/` | `apagarCredenciaisDaTask` apaga o arquivo e deixa a pasta. Corrigir: remover a pasta quando ficar vazia. |

### 🟡 Organizacional

Aprovação da liderança (D-A8), quem dá suporte, custo das contas do Claude, papel `member` no PM consegue mudar status (D-A4).

---

## 2. Diagnóstico da arquitetura da v1

A v1 não tem uma arquitetura declarada. Tem uma arquitetura **implícita**, que surgiu feature a feature (fases 0–9 e backlog B01–B19).

| Já existe (bom) | Falta (o problema) |
|---|---|
| Interface `PmAdapter`: portas e adaptadores, só para o PM | Orca, Telegram e banco sem interface; as classes dependem deles diretamente. |
| Wrappers de fronteira (`orca.ts`, `db.ts`, `config.ts`) | SQL espalhado: `fluxo.ts` e `despacho.ts` fazem `this.db.prepare(...)` dezenas de vezes. |
| Máquina de estados das seleções (tabela `valida`) | A dos despachos não tem tabela: `UPDATE`s soltos em 6 lugares; `estado` é `string`, não um tipo. |
| Funções puras (`classificarTela`, `extrairResultado`, `tagRodada`) | Classes de caso de uso misturam regra de negócio, estado, SQL e montagem das mensagens do Telegram (`despacho.ts` com 1.086 linhas, `fluxo.ts` com 817). |
| Injeção manual no `telegram.ts` | Ligações por callbacks avulsos (`onDespachar`, `onConcluido`), sem padrão. |
| — | Roteamento de botões por `callback_data.split(':')` com letras soltas (t, r, s, f, g, m, p, l, u). |

---

## 3. Arquitetura proposta: hexagonal (portas e adaptadores), por módulos (D-A12 🟡)

**Por que hexagonal aqui:** tudo o que a v2 quer é trocar peças de fora sem mexer no meio:

- Orca local → Orca remoto (servidor);
- Funifier PM → + Bnexo + uma terceira ferramenta (D-A16);
- arquivo → cofre seguro (D-A14);
- Telegram → talvez Slack (D-A10);
- Orca → terminal/tmux (D-A3).

O domínio fica no centro, sem saber o que existe fora, e cada coisa de fora fica atrás de uma interface.

```
src/
├── dominio/                    regras puras: zero import de fora, 100% testável
│   ├── selecao/                  entidade + máquina de estados (tabela de transições)
│   ├── despacho/                 entidade + máquina de estados
│   ├── tela/                     classificarTela, extrairResultado
│   └── prompt/                   montagem do Markdown (texto puro, sem fs)
│
├── aplicacao/                  casos de uso: orquestram o domínio pelas portas
│   ├── portas.ts                 GestorTasks, Executor, Notificador, SelecaoRepo,
│   │                             DespachoRepo, Cofre, Relogio
│   ├── listar-tasks.ts
│   ├── configurar-selecao.ts
│   ├── despachar.ts
│   ├── monitorar-despacho.ts
│   └── encerrar.ts
│
├── adaptadores/                o mundo de fora, cada um implementando uma porta
│   ├── gestao/funifier-pm/       implements GestorTasks
│   ├── gestao/bnexo/             plugin
│   ├── gestao/<terceira>/        D-A16
│   ├── executor/orca/            implements Executor
│   ├── chat/telegram/            implements Notificador + roteador de comandos e botões
│   ├── persistencia/sqlite/      implements os repositórios (todo o SQL mora aqui)
│   └── cofre/                    implements Cofre (D-A14)
│
└── main.ts                     raiz de composição: o único lugar que dá `new` e liga tudo
```

**Regra de dependência:** `dominio` ← `aplicacao` ← `adaptadores` ← `main`. As setas só apontam para dentro.

**Risco:** engenharia demais. Hexagonal custa mais arquivos e mais passos para ler um fluxo. Só se paga porque a v2 vai trocar pelo menos três adaptadores.

## 4. Padrões

| Padrão | Resolve | v1 → v2 |
|---|---|---|
| Repository | SQL espalhado | `this.db.prepare('UPDATE despachos…')` → `despachoRepo.salvar(d)` |
| Máquina de estados explícita | Transições soltas | Tabela `TRANSICOES` tipada + uma única `transicionar()` (valida, grava, registra `de → para`) para seleção e despacho |
| Adapter / Strategy | Trocar Orca, PM, cofre, chat | `PmAdapter` já existe → o mesmo para `Executor`, `Cofre`, `Notificador` |
| Eventos de domínio | Callbacks avulsos | `onDespachar`/`onConcluido` → `eventos.emitir('despacho.concluido', …)`; Telegram, PM e limpeza assinam |
| Presenter | Lógica misturada com HTML | O caso de uso devolve dados; o adaptador do chat desenha o cartão |
| Roteador de comandos tipado | `split(':')` com letras soltas | Codec tipado: `botao.encode({ tipo: 'selecao', id: 42, acao: 'desp' })`, respeitando os 64 bytes do Telegram |
| Núcleo funcional, casca imperativa | Testabilidade | Lógica de tela, prompt e transições em funções puras, testadas com Vitest |
| Raiz de composição | `new` espalhado | Um só `main.ts` |
| ADRs | Rediscutir decisões | Uma página curta por decisão em `docs/decisoes/` |

## 5. Framework e ferramentas (D-A11 🟡)

O hub não inicia nenhum servidor, e `fs`/`execFile` são a biblioteca padrão do Node, que todo framework usa por baixo. O que falta na v1 não é framework: é **estrutura** (seções 3 e 4) e **ferramentas de qualidade**.

| | A. NestJS | B. TypeScript + bibliotecas focadas (recomendado) |
|---|---|---|
| O que é | Framework completo orientado a classes: módulos, DI por decorators, cron, eventos, testes | A arquitetura da seção 3, com uma biblioteca para cada problema |
| OO e classes | ✅ O forte dele | ✅ Classes continuam a base |
| Sem HTTP | ✅ (standalone application) | ✅ |
| Peso para distribuir | Pesado | Leve |
| Curva | Alta; decorators e container escondem o baixo nível | Baixa; o que acontece está no código |
| Brilha em | APIs HTTP, muitos serviços, times grandes | Processos longos com domínio rico (o caso do hub) |

**Recomendação:** B. O hub é complexo no domínio (estados, leitura de tela, conversas), não na infraestrutura.

| Problema | Ferramenta | Substitui |
|---|---|---|
| Testes | Vitest | Validação manual pelo Telegram |
| SQL tipado e migrações | Kysely (dialetos SQLite e Postgres, ver D-A13) ou Drizzle | Strings SQL + `PRAGMA user_version` à mão |
| Logs estruturados | pino | `logger.ts` |
| Processos filhos | execa (sem shell, API de Promise) | `new Promise` em volta do `execFile` |
| Máquina de estados | Tabela tipada própria; XState só se as máquinas crescerem muito | `UPDATE`s soltos |
| Serviço | LaunchAgent (Mac) / systemd (servidor) | `nohup` |
| Injeção de dependência | Raiz de composição manual; container (awilix, tsyringe) só se o `main.ts` passar de ~100 linhas | `new` no `telegram.ts` |

**Condição de revisão:** se outras pessoas forem **manter** o código (não só usar), reavaliar o NestJS, que impõe padrão sem depender da disciplina de cada um.

## 6. Primeiro passo da refatoração

Antes de mexer na estrutura, escrever testes **sobre o código da v1**: `classificarTela`, `extrairResultado`, `tagRodada`, as transições das seleções e dos despachos e a montagem do prompt. Eles são a rede de segurança: a v2 só está certa quando os mesmos testes passam nela.
