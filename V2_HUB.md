# Hub de Tasks — v2

Documento de planejamento da v2. A v1 é o hub de hoje, com o roadmap em `ROADMAP_HUB.md` e os ajustes em `BACKLOG_HUB.md`: roda no MacBook do João, atende Funifier e DAC e conversa pelo @JoaoTaskBot.

A v2 tem duas frentes:
- **A. Servidor:** o hub e as sessões do Claude rodam 24 h num servidor; o Orca do MacBook vê e usa essas mesmas sessões.
- **B. App universal:** o hub vira um pacote instalável e configurável, só com as funcionalidades da Funifier, para todos os colaboradores.

Legenda das decisões: 🟡 em aberto · ✅ decidida · ❌ descartada. Cada decisão tem um id (D-S para o servidor, D-A para o app) para citarmos nas conversas e nos commits.

---

## Ordem de trabalho

| # | Etapa | Status |
|---|---|---|
| 1 | Criar os documentos da v2: este arquivo, com o app universal detalhado | 🟡 em andamento |
| 2 | Servidor: decidir escopo, testar e validar as decisões, contratar o serviço de cloud, implementar | ⬜ |
| 3 | Documentar a v1 inteira, versionar no git do João (repositório remoto) e criar a branch `v2` | ⬜ |
| 4 | Decidir tudo da v2 (app universal): fechar as decisões D-A | ⬜ |
| 5 | Implementar a v2 | ⬜ |

**Por que o servidor vem antes do app:** o servidor quase não muda o código (seção A.3). Resolve já o problema do PC ligado 24 h e ensina como o hub se comporta fora do MacBook, que é exatamente o que o app universal vai precisar.

**Pré-requisito comum:** a Fase 7 da v1 (LaunchAgent, reinício, espera do Orca, aviso "Hub online"). Num servidor sem ninguém olhando, o hub precisa subir e se recuperar sozinho. A Fase 7 entra na etapa 2.

---

# Parte A — Servidor

## A.1 Problema

Hoje tudo roda no MacBook: o bot, o banco, a fila e as sessões do Claude Code no Orca. Com o MacBook fechado, o bot para de responder, o resumo das 09:00 não sai e nada é despachado.

**Requisito do João:** o Orca local (MacBook) deve trabalhar na **mesma janela de contexto** que o servidor. Não basta o servidor rodar sessões: quando o João abrir o Orca, precisa ver e continuar as mesmas sessões, ao vivo.

## A.2 O que o Orca já oferece

Levantado na CLI do Orca instalada (`orca --help`), em 2026-10-29:

| Comando | O que faz |
|---|---|
| `orca serve` | Roda o Orca sem janela, como servidor. Imprime o endereço e um código de pareamento. Aceita `--pairing-address` (endereço via LAN, Tailscale, túnel SSH ou proxy), `--port` e `--no-pairing`. |
| `orca environment add --name <n> --pairing-code <código>` | Salva um Orca remoto no Orca local (pareamento). |
| `orca environment list / show / rm` | Gerencia os Orcas remotos pareados. |
| `orca host list` | Lista as máquinas que este Orca alcança: ele mesmo, alvos SSH e servidores pareados. |
| `--environment` (nos comandos) | Manda o comando para um Orca remoto. |
| `orca account add / list` | Contas do Claude e do Codex gerenciadas pelo Orca naquela máquina. Também ajuda na Fase 9 (conta por empresa). |
| `orca project setup-clone / setup-existing-folder` | Prepara um projeto numa máquina, clonando o repositório ou importando uma pasta. |
| `orca automations …` | Automações agendadas do próprio Orca. Pode substituir parte do cron do hub; avaliar. |

**Consequência:** a sessão do Claude roda num lugar só, o servidor. O Orca do MacBook é uma janela para ela, e não uma cópia. Isso atende o "mesma janela de contexto".

## A.3 Arquitetura proposta

```
Servidor (sempre ligado)                          MacBook do João
├─ orca serve  ◄────── pareado via Tailscale ──────  Orca (app): vê e usa os mesmos terminais
├─ hub v1 (bot, banco SQLite, fila, cron)
├─ repositórios clonados (FUNIFIER/, DAC/)
├─ sessões do Claude Code (contas via orca account)
└─ cofre de credenciais (data/segredos/)

Telegram ◄──── long polling (só conexões de saída) ──── hub
```

- **O hub roda na mesma máquina que o `orca serve`:** os comandos do Orca continuam locais. O código do hub praticamente não muda (A.6).
- **Nenhuma porta aberta na internet:** o Telegram usa long polling (conexão de saída), e o pareamento com o Mac passa pelo Tailscale (rede privada).
- **Sem o MacBook,** o hub continua funcionando: resumo, seleção, despacho e acompanhamento. O MacBook só serve para olhar e intervir.

## A.4 Onde hospedar (D-S1 🟡)

| Opção | Prós | Contras |
|---|---|---|
| **Mac mini** (casa ou escritório) | Mesmo sistema da v1: o Orca, os caminhos e o LaunchAgent funcionam igual. Aguenta os servidores de dev (ex.: pecas-c4 sobe API, web e simulador). | Compra única. Depende da internet e da energia do local. |
| **VPS Linux** (ex.: Hetzner, DigitalOcean, AWS Lightsail) | Custo mensal baixo, sempre ligado, sem hardware. | **Falta confirmar que o `orca serve` roda em Linux.** Caminhos e serviço mudam (systemd em vez de LaunchAgent). O código das empresas fica num servidor de terceiros. |
| **Mac na nuvem** (ex.: MacStadium, AWS EC2 Mac, Scaleway) | macOS sem hardware próprio. | Caro, e alguns cobram por dia no mínimo. |

Critérios para decidir:
- O Orca roda nesse sistema?
- Tem memória para várias sessões do Claude e os servidores de dev? Estimativa: 16 GB, a validar no teste T5.
- Custo mensal.
- A DAC e a Funifier aceitam o código delas nessa máquina (D-S6)?

## A.5 Testes de validação (antes de contratar)

Cada teste confirma ou derruba uma decisão. A ideia é fazer no próprio MacBook, ou numa máquina emprestada, antes de pagar qualquer coisa.

| # | Teste | Confirma |
|---|---|---|
| T1 | `orca serve` num segundo usuário do Mac (ou outra máquina) + `orca environment add` no Orca do MacBook | O pareamento funciona e o Orca local mostra os terminais remotos. |
| T2 | Abrir uma sessão do Claude no servidor, digitar nela pelo Orca do MacBook e ver o hub ler a tela | "Mesma janela de contexto" de verdade, com o João e o hub na mesma sessão. |
| T3 | Hub rodando no servidor: despachar uma task do sandbox ponta a ponta | O hub funciona sem mudanças fora do MacBook. |
| T4 | `orca serve` num Linux (VM local ou VPS de teste por hora) | Se o Linux é uma opção (D-S1). |
| T5 | Medir memória e CPU com 2–3 sessões e um servidor de dev rodando | O tamanho da máquina. |
| T6 | Acessar do MacBook um servidor de dev que roda no servidor (via Tailscale) | Testar o front no navegador continua possível. |
| T7 | Reiniciar o servidor e ver o hub e o `orca serve` subirem sozinhos, retomando os despachos | A Fase 7 no servidor. |
| T8 | Login do Claude no servidor (`orca account add` ou `claude login`) e uma sessão longa | A conta funciona fora do MacBook, sem pedir login de novo. |

## A.6 O que muda no hub para rodar no servidor

Pouco:
- **`ORCA_BIN`:** caminho do binário do Orca no servidor.
- **Fase 7:** serviço que sobe sozinho (LaunchAgent no Mac, systemd no Linux), espera o `orca serve` ficar pronto e manda "Hub online" no Telegram.
- **`pastaAmbiente`** (B15): os caminhos `~/Documents/FUNIFIER` e `~/Documents/DAC` viram configuração.
- **Migração:** levar `data/hub.db`, `data/segredos/`, `apps.yaml`, `regras/` e `.env`, e clonar os repositórios no servidor.
- **Acesso aos repositórios:** chave SSH do servidor (deploy key ou chave pessoal) e `gh auth login` para os PRs.

## A.7 Segurança

- **Rede:** Tailscale; nada exposto na internet; SSH só pela rede do Tailscale.
- **Segredos:** `.env` e cofre com permissão 600, no disco criptografado (FileVault no Mac, LUKS ou o equivalente do provedor no Linux).
- **Permissões das sessões:** continua `--permission-mode auto`. bypass continua proibido.
- **Acesso ao servidor:** só o João. Backup do `data/` com o cofre criptografado.

## A.8 Decisões do servidor

| Id | Decisão | Opções | Recomendação |
|---|---|---|---|
| D-S1 🟡 | Onde hospedar | Mac mini · VPS Linux · Mac na nuvem | Depende do T4: com Orca em Linux, VPS; sem, Mac mini. |
| D-S2 🟡 | Rede entre o Mac e o servidor | Tailscale · túnel SSH · proxy com TLS | Tailscale. |
| D-S3 🟡 | O servidor é só do João ou da equipe? | Só João · compartilhado | Só do João na etapa 2; compartilhar depende da Parte B. |
| D-S4 🟡 | Contas do Claude no servidor | `orca account` · `claude login` | Testar no T8. |
| D-S5 🟡 | Agendamento | cron do hub · `orca automations` | Manter o cron do hub (já funciona); reavaliar depois. |
| D-S6 🟡 | Código da DAC e da Funifier fora do MacBook | Perguntar às empresas · só repositórios liberados | Perguntar antes de contratar. |
| D-S7 🟡 | Backup | Snapshot do provedor · cópia do `data/` | Os dois. |

---

# Parte B — App universal

## B.1 Objetivo

Qualquer colaborador da Funifier instala o hub e, em poucos minutos, recebe as próprias tasks do Funifier PM no Telegram e as despacha para sessões do Claude Code, com as mesmas proteções da v1.

**Fica de fora:**
- tudo da DAC (Bnexo, regras da DAC, pasta `DAC/`);
- configurações pessoais do João.

## B.2 Público e premissas

- **Público:** desenvolvedores da Funifier, com Mac.
- **Cada colaborador tem:**
  - a própria conta do Claude Code;
  - o Orca instalado (D-A3);
  - acesso aos repositórios;
  - acesso ao Funifier PM.
- **Execução local:** a execução é de cada pessoa (conta, repositórios, máquina). Por isso cada colaborador roda o próprio hub (D-A1).
- **Suporte:** o colaborador médio não vai editar YAML nem `.env` à mão. A configuração precisa ser guiada.

## B.3 Arquitetura

```
@funifier/hub
├─ núcleo         fluxo (resumo → seleção → conversa → fila), despacho, acompanhamento, próximos passos,
│                 lote, limpeza, banco (migrações), padrão visual das mensagens
├─ adaptadores    ferramenta de gestão: Funifier PM (incluído) · outros como plugin (ex.: Bnexo do João)
├─ executor       Orca (v2) · terminal/tmux (futuro, D-A3)
├─ interface      Telegram (v2)
└─ configuração   hub.config.yaml + apps.yaml + regras/ + cofre (Keychain)
```

A v1 já tem a interface `PmAdapter` (`src/pm/types.ts`) para as ferramentas de gestão. A v2 faz o mesmo para o executor (`Executor`, hoje a classe `Orca`) e tira do núcleo tudo o que é da DAC ou do João.

## B.4 Inventário: o que é pessoal na v1

| Onde | Hoje | Na v2 |
|---|---|---|
| `src/config.ts` | `BNEXO_MCP_URL` e `BNEXO_MCP_TOKEN` obrigatórios | Opcionais; o adaptador do Bnexo vira plugin. |
| `src/pm/bnexo.ts` | No núcleo | Plugin fora do pacote da Funifier. |
| `regras/dac.md` | No repositório | Sai; `regras/funifier.md` vira modelo padrão editável. |
| Empresas `funifier` e `dac` | Fixas no código (`fluxo.ts`, `config.ts`, `prompt.ts`) | Lista configurável; na edição Funifier, só uma. |
| `pastaAmbiente` (`fluxo.ts`) | `~/Documents/FUNIFIER` ou `~/Documents/DAC` | Pasta-mãe configurável. |
| `SERVIDORES_BASE` (`gamificacoes.ts`) | Servidores que o João usa | Lista configurável, com padrão da Funifier. |
| Textos com "João" | ~30 ocorrências em 13 arquivos (prompts, regras, mensagens) | Nome do usuário configurado. |
| `ORCA_BIN` | Caminho fixo do Mac | Detectado na instalação. |
| `apps.yaml` | Escrito à mão pelo João | Gerado pelo assistente de instalação (B.5). |
| Cofre (`data/segredos/gamificacoes.json`) | Arquivo JSON 600 | Keychain do macOS (D-A5). |
| `TELEGRAM_CHAT_ID` | Do João | Descoberto na instalação (o colaborador manda `/start`). |
| Commits sem coautor | Regra nos `regras/*.md` | Padrão de fábrica nas regras. |

## B.5 Instalação e configuração

Assistente de instalação (`npx @funifier/hub init`, ou o equivalente pela distribuição escolhida em D-A6), num passo a passo:

1. **Pré-requisitos:** confere Node, Orca e Claude Code. Se faltar algo, explica como instalar. Nada global é instalado sem perguntar.
2. **Nome:** como o hub chama o colaborador nos prompts e nas mensagens.
3. **Telegram:** guia a criação do bot no BotFather, recebe o token e pede para mandar `/start` no bot; o assistente descobre o chat id sozinho.
4. **Funifier PM:** recebe o token do colaborador e testa (`whoami`).
5. **Repositórios:** procura repositórios git na pasta-mãe (padrão `~/Documents/FUNIFIER`) e mostra a lista.
6. **Projetos:** lista os projetos do Funifier PM do colaborador e liga cada um a um repositório. Gera o `apps.yaml`.
7. **Regras:** copia o modelo `regras/funifier.md`, que dá para editar depois pelo `/regras`.
8. **Serviço:** instala o LaunchAgent (o hub sobe com o Mac e se recupera).
9. **Teste:** manda "Hub online" no Telegram e uma task de exemplo no sandbox.

Depois da instalação, tudo o que já é configurável pelo Telegram na v1 continua lá: `/projetos`, `/regras`, `/gamificacoes`, ambiente novo (B15).

### Arquivos de configuração (proposta)

| Arquivo | Conteúdo | No git? |
|---|---|---|
| `~/.funifier-hub/hub.config.yaml` | Nome, pasta-mãe, horário do resumo, fuso, permissão das sessões, travas (escrita, comentários) | Não, é da máquina. |
| `~/.funifier-hub/apps.yaml` | Apps, pastas, projetos, gamificações (só ids de credencial) | Não. |
| `~/.funifier-hub/regras/` | Regras de trabalho | Não. |
| Keychain do macOS | Token do Telegram, token do PM, credenciais de gamificação | Nunca. |
| `~/.funifier-hub/data/` | Banco, runs, logs | Não. |

O código do pacote fica separado dos dados do colaborador: atualizar o pacote nunca mexe na configuração.

## B.6 Proteções padrão de fábrica

Herdadas da v1 e ligadas por padrão, sem o colaborador precisar saber delas:
- **Ferramenta de gestão:** o hub muda o status (em progresso no despacho; concluída só com confirmação no Encerrar). **Comentários desligados.** Nunca coloca a task em revisão.
- **Sessões:** `--permission-mode auto`. bypass recusado mesmo se configurado.
- **Commits e PRs:** sem `Co-Authored-By` nem menção a IA. Sem push na branch principal sem perguntar. PR sem merge.
- **Gamificações:** só altera as autorizadas na task; credenciais só no cofre e na cópia da task.
- **Telegram:** só responde ao chat do colaborador; mensagens com credenciais são apagadas.
- **Repositórios:** arquivos locais só via `.git/info/exclude`.

## B.7 Distribuição e atualização (D-A6 🟡)

| Opção | Prós | Contras |
|---|---|---|
| Repositório privado na org da Funifier + `git clone` + `npm run setup` | Simples; nada para publicar. | Atualizar é `git pull`, mais manual. |
| Pacote npm privado (GitHub Packages) + `npx @funifier/hub init` | Instalação e atualização com um comando. | Precisa de token do GitHub Packages em cada máquina. |
| Homebrew tap | Familiar para dev de Mac; `brew upgrade`. | Mais uma coisa para manter. |
| App com janela (Electron ou Tauri) | Mais amigável. | Muito mais manutenção; o Telegram já é a interface. Fica para depois. |

**Atualização:** o hub avisa no Telegram quando houver versão nova. As migrações do banco já existem (`PRAGMA user_version`) e continuam valendo.

## B.8 Piloto

1. O João usa a v2 no próprio servidor (Parte A) com a configuração nova.
2. Instalação com 1 ou 2 colegas, acompanhando o assistente ao vivo.
3. Ajustes, documentação de uso (README para o colaborador), depois abertura para a equipe.

## B.9 Riscos

- **Token do Funifier PM por colaborador:** confirmar que cada um consegue o próprio e que as permissões dele bastam (D-A4).
- **Orca:** se parte da equipe não usa o Orca, o executor por terminal vira obrigatório (D-A3).
- **Contas do Claude:** cada colaborador paga ou recebe a própria; limites de uso variam.
- **Aprovação da Funifier:** é uma ferramenta que mexe nas tasks e no código da empresa. Validar com a liderança antes do piloto (D-A8).
- **Suporte:** quem atende o colaborador quando algo quebra?

## B.10 Decisões do app universal

| Id | Decisão | Opções | Recomendação |
|---|---|---|---|
| D-A1 🟡 | Um hub por colaborador ou um hub central | Por colaborador · central multiusuário | Por colaborador (a execução já é local). |
| D-A2 🟡 | Bot do Telegram | Um bot por colaborador · bot único da Funifier | Um por colaborador; o bot único exige o hub central. |
| D-A3 🟡 | Executor | Só Orca · Orca + terminal/tmux | Só Orca na v2, com a interface `Executor` pronta para o terminal. |
| D-A4 🟡 | Acesso ao Funifier PM | Token pessoal · token de serviço | Token pessoal (cada um vê as próprias tasks). |
| D-A5 🟡 | Cofre | Keychain · arquivo 600 | Keychain. |
| D-A6 🟡 | Distribuição | Repositório · npm privado · Homebrew · app | npm privado na org da Funifier. |
| D-A7 🟡 | Nome do produto | — | — |
| D-A8 🟡 | Quem aprova na Funifier e quem dá suporte | — | — |
| D-A9 🟡 | O João passa a usar a v2 com o Bnexo como plugin, ou mantém a v1 | v2 + plugin · v1 em paralelo | v2 + plugin, para ter um código só. |
| D-A10 🟡 | Interface além do Telegram (Slack, Teams) | Só Telegram · outra | Só Telegram na v2. |
