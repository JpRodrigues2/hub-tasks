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
| D-S3 🟡 | O servidor é só do João ou da equipe? | Só João · compartilhado | Só do João na etapa 2; compartilhar depende da [Parte B](../v2/app-universal.md). |
| D-S4 🟡 | Contas do Claude no servidor | `orca account` · `claude login` | Testar no T8. |
| D-S5 🟡 | Agendamento | cron do hub · `orca automations` | Manter o cron do hub (já funciona); reavaliar depois. |
| D-S6 🟡 | Código da DAC e da Funifier fora do MacBook | Perguntar às empresas · só repositórios liberados | Perguntar antes de contratar. |
| D-S7 🟡 | Backup | Snapshot do provedor · cópia do `data/` | Os dois. |
