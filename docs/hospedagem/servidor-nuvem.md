# v2 · Parte A — Servidor (hospedagem em nuvem)

Parte da [v2](../v2/README.md). Legenda: 🟡 em aberto · ✅ decidida · ❌ descartada.

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

> **Pesquisa de 30/10/2026:** várias lacunas já têm resposta na documentação oficial, e há um plano de execução por fases em [plano de execução](plano-execucao.md).

Cada teste confirma ou derruba uma decisão. A ideia é fazer no próprio MacBook, numa VM ou numa VPS cobrada por hora, antes de contratar qualquer coisa. **Ordem: primeiro o que pode inviabilizar tudo.**

### Bloco 1: o Orca roda no servidor? (decide D-S1 e se o executor tmux entra na v2.1)

| # | Teste | Como | Passa se |
|---|---|---|---|
| T0 | Existe Orca para Linux? | Procurar build Linux (AppImage, .deb) e se ela inclui o CLI e o `orca serve` | Há build com `orca serve` |
| T4 | `orca serve` num Linux **sem tela** | VPS Ubuntu por hora; rodar `orca serve` por SSH. Se falhar, repetir com Xvfb (tela virtual) | Sobe e imprime o código de pareamento sem precisar de display |
| T4b | `orca serve` como serviço | Unidade systemd; sair do SSH; reiniciar o serviço | Continua de pé depois do logout e volta sozinho |
| T1 | Pareamento | Tailscale nos dois lados; `orca environment add --pairing-code` no Mac | O Orca do Mac lista os terminais do servidor (`orca host list`) |

### Bloco 2: o hub consegue operar o Orca do servidor?

| # | Teste | Como | Passa se |
|---|---|---|---|
| T3a | Os 9 métodos do `orca.ts` contra o `orca serve` | No servidor: `status`, `repo list/add`, `terminal list/read/send/wait/create`, `worktree ps/set`, todos com `--json` | Mesmo formato de JSON do Mac |
| T3b | Estado dos agentes sem tela | `orca worktree ps` com um Claude trabalhando e parado | `agents[].state` muda entre `working` e `done` |
| T3c | Leitura da tela | `terminal read --screen` de uma sessão do Claude; passar pelo `classificarTela` | Classifica ocioso, ocupado, aguardando e limite como no Mac |
| T2 | Mesma janela de contexto | Abrir uma sessão no servidor, digitar nela pelo Orca do Mac, e o hub ler a tela | O João e o hub veem e usam a mesma sessão ao vivo |
| T3 | Ponta a ponta | Hub no servidor despachando uma task do sandbox até o Encerrar | Fluxo completo sem mudar código, só configuração |

### Bloco 3: contas, repositórios e recursos

| # | Teste | Como | Passa se |
|---|---|---|---|
| T8 | Login do Claude sem navegador | `claude login` (ou `orca account add`) por SSH; sessão de algumas horas | Não pede login de novo; `--permission-mode auto` funciona |
| T9 | Git e PRs no servidor | Chave SSH ou deploy keys para os repositórios da Funifier e da DAC; `gh auth login` | Clona, faz push de branch e abre PR |
| T10 | Login do Funifier PM sem navegador | `npm run pm:login` no servidor, ou login no Mac e cópia de `data/oauth/` | O hub lista as tasks a partir do servidor |
| T5 | Memória e CPU | 2–3 sessões do Claude e um servidor de dev rodando | Define o tamanho da máquina |
| T6 | Servidor de dev pelo Tailscale | Abrir no navegador do Mac o front que roda no servidor | Testar o front continua possível |

### Bloco 4: recuperação

| # | Teste | Como | Passa se |
|---|---|---|---|
| T7 | Reinício da máquina | Reiniciar o servidor com um despacho em andamento | Hub e `orca serve` sobem sozinhos; o hub retoma ou marca `interrompido` com aviso |
| T11 | Reinício só do `orca serve` | Reiniciar o serviço com uma sessão aberta | Saber se as sessões sobrevivem ou se o hub cai no `redescobrir` |
| T12 | Mac dormindo e acordando | Fechar a tampa do Mac com tasks rodando no servidor | O servidor não é afetado; o Orca do Mac reconecta sozinho |
| T13 | Versões | Orca do Mac e `orca serve` em versões diferentes | Saber se precisam estar iguais |

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

## A.7b Gargalos para colocar a v1 no servidor hoje

Levantados em 30/10/2026. Os testes de A.5 que resolvem cada um estão entre parênteses.

1. **Orca sem tela no Linux:** documentado oficialmente (`orca-ide serve`, builds x64 e arm64); falta rodar (T4). Sem ele, o servidor tem de ser um Mac (Mac mini ou Mac na nuvem), ou o executor tmux entra antes da hora.
2. **Fase 7 não existe.** Não há serviço (LaunchAgent/systemd) nem espera do Orca ficar pronto, nem o aviso "Hub online". Hoje o hub sobe com `nohup`.
3. **Caminhos do Mac no código e na configuração:**
   - `ORCA_BIN` padrão é o caminho do app no macOS;
   - `pastaAmbiente` fixa `~/Documents/FUNIFIER` e `~/Documents/DAC` (`fluxo.ts:816`);
   - todas as `pasta` do `apps.yaml` são caminhos absolutos do Mac (`/Users/joaopedro/...`): precisam ser reescritas.
4. **Repositórios:** clonar todos no servidor, com acesso git às duas empresas e `gh` para os PRs (T9). Depende da autorização das empresas (D-S6).
5. **Logins sem navegador:** Claude Code (T8) e OAuth do Funifier PM (T10).
6. **Credenciais num servidor de terceiros:** o cofre é JSON em texto puro (600). Exige disco criptografado e acesso só pelo Tailscale. Os históricos do Claude com credenciais (ver [segurança e dados](../v2/seguranca-e-dados.md)) passam a existir também no servidor.
7. **Uma instância de cada vez:** só um processo pode fazer long polling no bot. Na virada, o hub do Mac precisa ser parado antes de o do servidor subir (senão, `409 Conflict`).
8. **Migração dos dados:** `data/hub.db`, `data/segredos/`, `data/oauth/`, `runs/` (despachos `concluido` ainda dependem deles), `apps.yaml`, `regras/` e `.env`.
9. **Servidores de dev das sessões:** consomem memória (T5) e precisam ser acessíveis do Mac (T6).
10. **Leitura da tela no `orca serve`:** o `classificarTela` foi calibrado com o Orca do Mac. Confirmar que a tela vem igual (T3c) e que o estado dos agentes existe sem janela (T3b).
11. **Quem vigia o vigia:** se o hub cair no servidor, o Telegram só fica em silêncio. Falta um aviso externo (healthcheck) ou, no mínimo, o "Hub online" da Fase 7.
12. ~~Compilação no Linux~~: resolvido, o `better-sqlite3` já traz binários `linux-x64` e `linux-arm64`.
13. **Backup:** snapshot do provedor e cópia de `data/` com o cofre cifrado (D-S7).

## A.8 Decisões do servidor

| Id | Decisão | Opções | Recomendação |
|---|---|---|---|
| D-S1 🟡 | Onde hospedar | Mac mini · VPS Linux · Mac na nuvem | Depende do T4: com Orca em Linux, VPS; sem, Mac mini. |
| D-S2 🟡 | Rede entre o Mac e o servidor | Tailscale · túnel SSH · proxy com TLS | Tailscale. |
| D-S3 🟡 | O servidor é só do João ou da equipe? | Só João · compartilhado | Só do João na etapa 2; compartilhar depende da [Parte B](../v2/app-universal.md). |
| D-S4 🟡 | Contas do Claude no servidor | `orca account` · `claude login` | Testar no T8. |
| D-S5 🟡 | Agendamento | cron do hub · `orca automations` | Manter o cron do hub (já funciona); reavaliar depois. |
| D-S6 🟡 | Código da DAC e da Funifier fora do MacBook | Perguntar às empresas · só repositórios liberados | Perguntar antes de contratar. |
| D-S7 🟡 | Backup | Snapshot do provedor · cópia do `data/` | Os dois. |
