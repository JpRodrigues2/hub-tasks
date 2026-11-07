# Hub de Tasks: comece aqui

O hub lê as suas tasks nas ferramentas de gestão (Funifier PM, Bnexo), manda a lista no Telegram e, para as que você
escolher, escreve as instruções e as despacha para uma sessão do Claude Code aberta no Orca. Depois acompanha a sessão
e avisa quando terminou ou quando precisa de você. **O hub em si não usa IA:** a IA está só nas sessões do Claude.

**Onde estamos (06/11/2026):** a v2 (branch `v2`) é o hub em uso, numa VM da Oracle, com o bot `@HubTasksCloudBot`
e deploy automático. A etapa 1 está validada; a v1 (branch `main`, Mac) ficou obsoleta. Agora: o onboarding e o app
para outros colaboradores.
Detalhes e pendências em [plano](plano.md).

## Ordem de leitura

| # | Documento | Responde |
|---|---|---|
| 1 | Este README | O que é, onde estamos, o que significa cada sigla |
| 2 | [plano](plano.md) | O que está feito, o que falta e quem faz |
| 3 | [arquitetura](arquitetura.md) | Como o código está organizado e o que cada arquivo faz |
| 4 | [backlog](backlog.md) | As regras pedidas pelo João (B01–B20) e tudo o que falta (B20–B41) |
| 5 | [decisões](decisoes.md) | Tudo o que foi decidido (D-S, D-A) e o que está em aberto |
| 6 | [segurança](seguranca.md) | Credenciais: o risco, o cofre e o broker |
| 7 | [servidor](servidor.md) | A VM da Oracle: o que existe, como operar, testes e atritos |
| 8 | [app universal](app-universal.md) | O produto para outros colaboradores e o onboarding (`hub init`) |
| — | [referência dos MCPs](referencia/mcp-ferramentas-de-gestao.md) | Tools e status do Funifier PM e do Bnexo (para mexer em `src/pm/`) |
| — | [estudo/](estudo/) | Material de estudo do João: [fundamentos](estudo/fundamentos.md) (comece por aqui), [etapa 1](estudo/etapa-1.md), [arquitetura](estudo/arquitetura.md), [broker](estudo/broker.md), [infra em nuvem](estudo/infra-nuvem.md) |

Fora de `docs/` ficam só arquivos que o hub **lê em execução**: `apps.yaml` e `regras/*.md`.

## Legenda

### Ícones de status

| Ícone | Nos documentos | | Ícone | Nas decisões |
|---|---|---|---|---|
| ✔️ | feito | | ✅ | decidida |
| 🔄 | em andamento | | 🟡 | em aberto |
| ⬜ | a fazer | | ❌ | descartada |

### Siglas e códigos

| Código | O que é | Onde está |
|---|---|---|
| **v1, v2** | v1: o hub de hoje, no Mac. v2: a versão para o servidor e para outros colaboradores | [plano](plano.md) |
| **Etapa 1, 2** | As duas etapas da v2: o crítico (nuvem, credenciais seguras) e o resto (onboarding, Prisma, Jira) | [plano](plano.md) |
| **Fases 0–9** | As fases do roadmap original da v1; as que sobraram estão no plano | [plano](plano.md) |
| **B01–B42** | Itens do backlog: B01–B20 e B42 são pedidos do João; B21–B41, o que falta das etapas 1 e 2 | [backlog](backlog.md) |
| **I1–I13** | Impeditivos: o que impede entregar o hub a outras pessoas | [plano](plano.md#impeditivos-do-app-universal-i1i13) |
| **D-S1–D-S7** | Decisões do servidor do João | [decisões](decisoes.md) |
| **D-A1–D-A22** | Decisões do app universal | [decisões](decisoes.md) |
| **C1–C5** | Camadas de proteção das credenciais (guardar, entrar, usar, limitar, auditar) | [segurança](seguranca.md) |
| **T0–T14** | Testes do servidor (Orca sem tela, pareamento, celular sem o Mac…) | [servidor](servidor.md#testes-t) |
| **A1–A17** | Atritos da primeira subida na Oracle; viram requisitos do onboarding | [servidor](servidor.md#atritos-a1a17) |
| **O1–O13** | Decisões do onboarding (debate de 06/11) | [app universal](app-universal.md#3-onboarding-hub-init) |
| **P1** | Teste do Prisma com SQLite, antes de trocar o acesso ao banco | [decisões](decisoes.md) (D-A13) |

### Termos

| Termo | Significado |
|---|---|
| **Orca** | IDE que roda os terminais das sessões do Claude; tem CLI (`orca`) e app no celular |
| **Sessão** | Um Claude Code rodando num terminal do Orca, na pasta de um projeto |
| **App** | Um projeto no catálogo (`apps.yaml`): pasta, projetos da ferramenta, gamificações |
| **Seleção** | Uma task escolhida no Telegram, enquanto é configurada e acompanhada |
| **Despacho** | O envio de uma task a uma sessão, e o acompanhamento até o resultado |
| **Rodada** | Cada envio para a mesma task: a original e cada 💬 instrução ou 🔀 PR depois |
| **Lote** | Várias tasks num só prompt e numa só sessão (B19) |
| **`runs/<id>.md`** | O prompt da task; ao terminal vai só uma linha apontando para ele |
| **`RESULTADO HUB`** | Bloco que a sessão escreve no fim; é por ele que o hub sabe que terminou |
| **Cofre** | Onde ficam as credenciais: Keychain no Mac, arquivo cifrado no servidor |
| **Broker** | Servidor MCP do hub: a sessão usa a Funifier por ele, sem ver a chave |
| **MCP** | Protocolo pelo qual o hub fala com as ferramentas de gestão e a sessão fala com o broker |
| **`hub` / `agente`** | Os dois usuários Linux do servidor: o do hub (dono dos segredos) e o das sessões |
| **Tailscale / tailnet** | Rede privada entre Mac, celular e servidor; nada fica aberto na internet |
| **Hexagonal** | Organização do código em domínio, portas, casos de uso e adaptadores ([arquitetura](arquitetura.md#2-hexagonal-em-4-frases)) |

## Regras do projeto

Valem para qualquer pessoa ou sessão do Claude que mexa no hub:

- **Segredos** (tokens, senhas, chaves) só no `.env` ou no cofre. Nunca em código, logs, prompts, mensagens ou commits.
- **Tasks reais:** durante a construção, nunca alterar tasks reais nem dados no backend da Funifier. Em produção, o hub
  só muda status (B01–B04) e **nunca comenta** sem comando explícito.
- **Repositórios das empresas:** não alterar. Arquivo local só via `.git/info/exclude`, nunca por commit.
- **Instalar algo global** no computador só com permissão.
- **Bot:** atende só o `TELEGRAM_CHAT_ID` do dono.
- **Orca:** sempre `execFile` com argumentos em array e `--json`. Sessões com `--permission-mode auto`;
  `bypassPermissions` é proibido.
- **Commits:** os do repositório do hub levam `Co-Authored-By` do Claude; os das sessões nos projetos das empresas, não.
- **Branches:** `v1` congelada, `main` é o hub em uso, `v2` é o trabalho novo.

Os documentos antigos (roadmap da v1, arquitetura da v1, pesquisas do servidor) foram resumidos aqui em 05/11/2026.
O texto completo continua no histórico do git.
