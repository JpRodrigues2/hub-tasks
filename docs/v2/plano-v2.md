# v2 · Plano de execução em duas etapas

Parte da [v2](README.md). Decidido em 02/11/2026: antes de qualquer onboarding ou autoconfiguração, provar que **as partes críticas funcionam**. Trabalho na branch `v2`.

Legenda: ⬜ a fazer · 🔄 em andamento · ✔️ feito.

---

## Etapa 1: o crítico funciona

**Objetivo:** o hub roda na nuvem, com credenciais protegidas, e o João trabalha pelo celular e pelo Mac na mesma sessão. Sem onboarding: configuração escrita à mão, como na v1.

### 1.1 Base de engenharia

| | Item | Detalhe |
|---|---|---|
| ✔️ | Branch `v2` | Pasta de trabalho separada (`~/Documents/HUB-v2`, git worktree), para não mexer no hub que está rodando |
| ✔️ | Testes (Vitest) | `npm test`; telas de exemplo em `tests/dominio/telas.ts` |
| ✔️ | CI no GitHub Actions | `.github/workflows/ci.yml`: tipos + testes em todo push e PR |
| ✔️ | Sem o nome do usuário no código (I9) | Estado `aguardando_joao` → `aguardando_usuario`, com migração do banco; textos do prompt e das regras |
| 🔄 | Arquitetura hexagonal (D-A12) | Domínio em `src/dominio/`. **Casos de uso (05/11):** `src/aplicacao/despacho/` (Despachar, Monitor, ProximosPassos, Sessoes) e `src/aplicacao/selecao/` (ResumoDiario, ConfigurarSelecao, Ambientes), sem SQL e sem grammy; repositórios SQLite em `src/adaptadores/persistencia/`; testes de ponta a ponta dos dois ciclos; validado na VM com task real no sandbox. Falta: `gamificacoes`, `regras`, `projetos`, `login-pm` e `confirmacao` ainda usam o Telegram direto; Presenter; codec tipado dos botões; eventos de domínio |
| ✔️ | Portas das fronteiras críticas | `src/aplicacao/portas.ts`: `Executor` (adaptador Orca em `src/adaptadores/executor/`) e `Cofre` (`src/adaptadores/cofre/`); `GestorTasks` já existia como `PmAdapter`; raiz de composição em `src/main.ts`. `Notificador` (05/11): HTML + teclado abstrato (`Teclado`), adaptador `NotificadorTelegram`; também `GitProjetos`, `CatalogoApps`, `Memoria` e os repositórios |
| ⬜ | Deploy automático | `.github/workflows/deploy.yml` pronto e desligado (`DEPLOY_ENABLED`); liga quando a VM existir |

### 1.2 Cofre e broker (D-A14)

| | Item | Detalhe |
|---|---|---|
| ✔️ | Porta `Cofre` | `obter(id)`, `salvar(id, valor)`, `remover(id)`, `ids()` (nunca valores) |
| ✔️ | Adaptador do servidor | `CofreArquivoCifrado`: AES-256-GCM, chave do `systemd-creds` (`$CREDENTIALS_DIRECTORY`), gravação atômica. Testes de chave errada e arquivo alterado; verificado na VM pelo `scripts/servidor-teste.ts` |
| ✔️ | Cópia de recuperação da chave-mestra | Recuperação testada no [ensaio](../hospedagem/ensaio-local.md); a da Oracle está no app Senhas da Apple |
| ✔️ | Dois usuários Linux | `hub` (hub, broker, cofre) e `agente` (Orca e sessões); o agente não lê nada do `hub`. Testado no [ensaio](../hospedagem/ensaio-local.md); feito pelo `deploy/preparar-vm.sh` |
| ✔️ | Adaptador do Mac | `CofreKeychain` (comando `security`, serviço `hub-tasks`); testado no Mac com um serviço descartável |
| ✔️ | Migração | `migrarCofreAntigo` no `main.ts`: `<dados>/segredos/gamificacoes.json` → Cofre, confere e apaga o arquivo |
| ✔️ | Investigar a API da Funifier | `funifier-mcp` se configura por ambiente e marca as ferramentas (leitura/destrutiva); Basic com a chave em toda requisição; `/v3/auth/token` existe e não foi testado. Ver [estudo do broker](../estudo/broker.md) |
| ✔️ | Broker (gateway MCP do hub) | `src/broker/`: MCP HTTP em 127.0.0.1 com token, rodando como `hub`; só gamificações de tasks em andamento; leitura passa, escrita em produção e destrutiva confirmam no Telegram; auditoria em `logs/broker.jsonl`. Testado na VM com o `funifier-mcp` real (só leitura) |
| 🔄 | Fim do `credenciais.json` | Com `HUB_BROKER=ligado` (servidor) a sessão não recebe o arquivo. No Mac continua, até o broker valer no modo local |
| ⬜ | Prova | Uma task real usando o broker, e varredura dos históricos novos sem nenhum valor do cofre. Os históricos migrados do Mac têm valores antigos (exceção aceita em 04/11/2026) |

### 1.3 Celular, Mac e nuvem

Testes do [plano de execução do servidor](../hospedagem/plano-execucao.md) (fases 0–4 e 6). Enquanto a Oracle não libera, rodam no [ensaio local](../hospedagem/ensaio-local.md) (VM Ubuntu ARM no Mac):

| | Item |
|---|---|
| ✔️ | Conta Oracle, VM ARM, Tailscale no Mac, iPhone e servidor (fases 0–1): VM `hub-cloud`, ver [oracle-hub-cloud](../hospedagem/oracle-hub-cloud.md) |
| 🔄 | Orca no servidor sem tela (T4, T4b), Mac pareado (T1), **celular pareado com o Mac desligado (T14)**: T4 e T1 ✔️ na Oracle; T14 ✔️ no ensaio, falta na Oracle |
| ✔️ | Claude Code e git no servidor (T8, T9): sessão como `agente` e clone ✔️ na Oracle |
| ✔️ | Hub operando o Orca do servidor (T3a, T3b, T3c, T2): task fictícia do sandbox de ponta a ponta na Oracle |
| ⬜ | Front pelo Tailscale (T6); link público opcional (T6b) |
| 🔄 | Recuperação: reinício da VM ✔️ na Oracle (Tailscale, Orca e hub voltam sozinhos); falta `orca serve` e Mac dormindo (T11, T12) |

### 1.4 Hub no servidor

| | Item |
|---|---|
| ✔️ | Configuração em vez de caminhos do Mac: `src/caminhos.ts` (`HUB_DADOS_DIR`, `HUB_RUNS_DIR`, `HUB_REPOS_DIR`, `HUB_CLAUDE_DIR`…), pasta relativa no `apps.yaml`, `ORCA_ENVIRONMENT`, pasta confiável (`HUB_CONFIAR_PASTA_CMD`) |
| 🔄 | Fase 7 da v1: serviço systemd ✔️, espera o `orca serve` ✔️, aviso "Hub online" ✔️ (05/11), heartbeat no Healthchecks.io ⬜ (precisa do endereço do check) |
| ⬜ | Batimento para um monitor externo |
| ✔️ | `/pm_login` pelo Telegram (colar o endereço de retorno do OAuth): testado com o Funifier PM real |
| ⬜ | Estado dos agentes pelo `worktree ps` (menos dependência da tela, I2): o `classificarTela` já usa o estado do agente para "working"; confiar nele para ocioso exige capturar antes os estados reais no servidor (T3b) |
| ✔️ | Pasta vazia em `runs/` (I13): sai junto com as credenciais |
| 🔄 | Ensaio com bot de teste (`@HubTasksCloudBot`) ✔️; catálogo completo, projetos e históricos migrados (`deploy/migrar-do-mac.sh`) ✔️; falta a virada (fase 7) |

**Etapa 1 pronta quando:** uma task real vai do Telegram ao Encerrar com o hub na Oracle; o João acompanha pelo celular com o Mac desligado e continua a mesma sessão pelo Mac; a credencial da gamificação não aparece em nenhum histórico; um push na `v2` com CI verde atualiza o servidor sozinho.

## Etapa 2: o resto

Depois da etapa 1, por ordem de valor:

- Resto da arquitetura hexagonal: módulos menores no Notificador; Presenter; codec tipado dos botões; eventos de domínio.
- Prisma + SQLite (D-A13) e teste P1.
- Empresas e ferramentas fora do código (I3, I4); dados fora do repositório (I5).
- **Configuração inicial fluida** ([requisito](configuracao-inicial.md)), depois da hexagonal, do cofre e do broker; a VPS é escolhida e criada pelo usuário: assistente que guia do zero ao hub no ar, junto com o onboarding e as telas de autoconfiguração (D-A15: entrada das credenciais fora do chat).
- Módulo de estudo da infra em nuvem para o João ([roteiro](../estudo/infra-nuvem.md)).
- Listagem de tasks por projeto, com task pai e filhas ([B20](../backlog/backlog-v1.md)).
- Jira (D-A16).
- `/diagnostico`, logs estruturados (pino).
- Distribuição, site de suporte, sistemas operacionais (D-A19–D-A21).
- Teams (D-A10).

## Decisões de 02/11/2026: pastas, clone e várias contas

1. ✔️ **Criar pasta sem git continua obrigatório.** O usuário cria diretórios novos pelo celular dentro das pastas-mãe (DAC, FUNIFIER…). O Orca tem workspaces de pasta internamente (`folderWorkspace.create`), mas não pela CLI; o `repo add` só aceita git. Feito: "Só criar a pasta" cria a pasta com um **git só local, sem remoto** (`prepararPasta` em `src/git.ts`).
2. ✔️ **Clone e git remoto como `agente`.** Todo git do hub passa por `src/git.ts`; no servidor, `HUB_GIT_COMO="sudo -n -u agente"` (regra no sudoers só para `/usr/bin/git`), então usa as chaves e logins do agente; no Mac, sem prefixo. Verificado numa VM nova: clone de repositório público com dono `agente`, aberto no Orca.
3. **Várias contas por pasta-mãe (app universal).** Cada pasta-mãe vira um **espaço**: nome, pasta raiz, ferramenta de gestão, regras e **conta git** (provedor, usuário, e-mail, chave SSH própria). No agente:
   - `~/.ssh/<espaco>` (uma chave por conta) e `includeIf "gitdir:<raiz do espaço>/"` no `~/.gitconfig` apontando para um arquivo do espaço com `user.name`, `user.email` e `core.sshCommand = ssh -i ~/.ssh/<espaco> -o IdentitiesOnly=yes`;
   - no clone (a pasta ainda não existe, o `includeIf` não vale), o hub passa `-c core.sshCommand=…` da conta do espaço.
   - Isso substitui o `empresa: funifier | dac` fixo no código (I3/I4) e entra na autoconfiguração (etapa 2), junto com a entrada do token do Telegram e das ferramentas por uma interface mais alto nível.
