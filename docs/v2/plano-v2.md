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
| 🔄 | Arquitetura hexagonal (D-A12) | Começou pelo domínio: `src/dominio/tela.ts`, `despacho.ts` (máquina de estados com tabela de transições), `selecao.ts` |
| ✔️ | Portas das fronteiras críticas | `src/aplicacao/portas.ts`: `Executor` (adaptador Orca em `src/adaptadores/executor/`) e `Cofre` (`src/adaptadores/cofre/`); `GestorTasks` já existia como `PmAdapter`; raiz de composição em `src/main.ts`. **`Notificador` fica para a etapa 2**: os avisos do despacho usam teclados do Telegram, e a porta só faz sentido junto com o Presenter, quando entrar o Teams (D-A10) |
| ⬜ | Deploy automático | `.github/workflows/deploy.yml` pronto e desligado (`DEPLOY_ENABLED`); liga quando a VM existir |

### 1.2 Cofre e broker (D-A14)

| | Item | Detalhe |
|---|---|---|
| ✔️ | Porta `Cofre` | `obter(id)`, `salvar(id, valor)`, `remover(id)`, `ids()` (nunca valores) |
| ✔️ | Adaptador do servidor | `CofreArquivoCifrado`: AES-256-GCM, chave do `systemd-creds` (`$CREDENTIALS_DIRECTORY`), gravação atômica. Testes de chave errada e arquivo alterado; verificado na VM pelo `scripts/servidor-teste.ts` |
| 🔄 | Cópia de recuperação da chave-mestra | Recuperação testada no [ensaio](../hospedagem/ensaio-local.md). Falta: guardar a da Oracle no app Senhas da Apple, uma vez |
| ✔️ | Dois usuários Linux | `hub` (hub, broker, cofre) e `agente` (Orca e sessões); o agente não lê nada do `hub`. Testado no [ensaio](../hospedagem/ensaio-local.md); feito pelo `deploy/preparar-vm.sh` |
| ✔️ | Adaptador do Mac | `CofreKeychain` (comando `security`, serviço `hub-tasks`); testado no Mac com um serviço descartável |
| ✔️ | Migração | `migrarCofreAntigo` no `main.ts`: `<dados>/segredos/gamificacoes.json` → Cofre, confere e apaga o arquivo |
| ⬜ | Investigar a API da Funifier | Autenticação (API key + secret → token de curta duração?) e se o MCP de gamificação atual pode ser embrulhado |
| ⬜ | Broker (gateway MCP do hub) | Servidor MCP local, registrado só na sessão da task; só as gamificações autorizadas; leitura/escrita/destrutiva; produção com confirmação no Telegram; log de auditoria |
| ⬜ | Fim do `credenciais.json` | A sessão deixa de receber o arquivo |
| ⬜ | Prova | Uma task do sandbox usando o broker, e varredura dos históricos do Claude (`~/.claude/projects`) sem nenhum valor do cofre |

### 1.3 Celular, Mac e nuvem

Testes do [plano de execução do servidor](../hospedagem/plano-execucao.md) (fases 0–4 e 6). Enquanto a Oracle não libera, rodam no [ensaio local](../hospedagem/ensaio-local.md) (VM Ubuntu ARM no Mac):

| | Item |
|---|---|
| ⬜ | Conta Oracle, VM ARM, Tailscale no Mac, iPhone e servidor (fases 0–1) |
| 🔄 | Orca no servidor sem tela (T4, T4b), Mac pareado (T1), **celular pareado com o Mac desligado (T14)**: T4, T1 e T14 ✔️ no ensaio; falta confirmar na Oracle |
| 🔄 | Claude Code e git no servidor (T8, T9): T8 ✔️ no ensaio |
| ⬜ | Hub operando o Orca do servidor (T3a, T3b, T3c, T2) |
| ⬜ | Front pelo Tailscale (T6); link público opcional (T6b) |
| ⬜ | Recuperação: reinício da VM, do `orca serve`, Mac dormindo (T7, T11, T12) |

### 1.4 Hub no servidor

| | Item |
|---|---|
| ✔️ | Configuração em vez de caminhos do Mac: `src/caminhos.ts` (`HUB_DADOS_DIR`, `HUB_RUNS_DIR`, `HUB_REPOS_DIR`, `HUB_CLAUDE_DIR`…), pasta relativa no `apps.yaml`, `ORCA_ENVIRONMENT`, pasta confiável (`HUB_CONFIAR_PASTA_CMD`) |
| ⬜ | Fase 7 da v1: serviço systemd, espera o `orca serve`, aviso "Hub online", heartbeat no Healthchecks.io |
| ⬜ | Batimento para um monitor externo |
| 🔄 | `/pm_login` pelo Telegram (colar o endereço de retorno do OAuth): feito e com testes; falta o teste real com o Funifier PM |
| ⬜ | Estado dos agentes pelo `worktree ps` (menos dependência da tela, I2) |
| ⬜ | Pasta vazia em `runs/` (I13) |
| ⬜ | Ensaio com bot de teste e virada (fases 6–7 do plano do servidor) |

**Etapa 1 pronta quando:** uma task real vai do Telegram ao Encerrar com o hub na Oracle; o João acompanha pelo celular com o Mac desligado e continua a mesma sessão pelo Mac; a credencial da gamificação não aparece em nenhum histórico; um push na `v2` com CI verde atualiza o servidor sozinho.

## Etapa 2: o resto

Depois da etapa 1, por ordem de valor:

- Resto da arquitetura hexagonal: quebrar `fluxo.ts` e `despacho.ts` em casos de uso; repositórios; Presenter; codec tipado dos botões; eventos de domínio.
- Prisma + SQLite (D-A13) e teste P1.
- Empresas e ferramentas fora do código (I3, I4); dados fora do repositório (I5).
- Onboarding e telas de autoconfiguração (D-A15: entrada das credenciais fora do chat).
- Jira (D-A16).
- `/diagnostico`, logs estruturados (pino).
- Distribuição, site de suporte, sistemas operacionais (D-A19–D-A21).
- Teams (D-A10).

## Decisões de 02/11/2026: pastas, clone e várias contas

1. **Criar pasta sem git continua obrigatório.** O usuário cria diretórios novos pelo celular dentro das pastas-mãe (DAC, FUNIFIER…). O Orca tem "native folder workspaces" (citado no guia `orca-cli`), mas o `repo add` recusou pasta sem git no servidor. Próximo passo: descobrir o comando do Orca para workspace de pasta; se não houver, `git init` local (sem remoto) só para o Orca enxergar.
2. **Clone e git remoto como `agente`.** O hub roda `sudo -n -u agente git …` (regra no sudoers só para `/usr/bin/git`), então usa as chaves e logins do agente; no Mac, sem prefixo. Configurável por `HUB_GIT_COMO`.
3. **Várias contas por pasta-mãe (app universal).** Cada pasta-mãe vira um **espaço**: nome, pasta raiz, ferramenta de gestão, regras e **conta git** (provedor, usuário, e-mail, chave SSH própria). No agente:
   - `~/.ssh/<espaco>` (uma chave por conta) e `includeIf "gitdir:<raiz do espaço>/"` no `~/.gitconfig` apontando para um arquivo do espaço com `user.name`, `user.email` e `core.sshCommand = ssh -i ~/.ssh/<espaco> -o IdentitiesOnly=yes`;
   - no clone (a pasta ainda não existe, o `includeIf` não vale), o hub passa `-c core.sshCommand=…` da conta do espaço.
   - Isso substitui o `empresa: funifier | dac` fixo no código (I3/I4) e entra na autoconfiguração (etapa 2), junto com a entrada do token do Telegram e das ferramentas por uma interface mais alto nível.
