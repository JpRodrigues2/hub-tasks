# Plano e andamento

Onde estamos e o que falta. Atualizado em 05/11/2026. Cada pendência também está no [backlog](backlog.md) (B21–B41). Ícones e siglas na [legenda](README.md#legenda).

## Visão geral

| # | Etapa | Status |
|---|---|---|
| 1 | v1: o hub no Mac do João (roadmap fases 0–6 e backlog B01–B19) | ✔️ em uso, branch `main` |
| 2 | v2 etapa 1: **o crítico funciona** (nuvem, cofre e broker, celular + Mac, hexagonal) | 🔄 quase pronta |
| 3 | v2 etapa 2: **o resto** (onboarding, Prisma, Jira, distribuição) | ⬜ |
| 4 | Estudo do João (arquitetura, broker, infra em nuvem) | ⬜ depois do backend |

A etapa 1 está pronta quando: uma task real vai do Telegram ao Encerrar com o hub na Oracle; o João acompanha pelo
celular com o Mac desligado e continua a mesma sessão pelo Mac; nenhuma credencial aparece nos históricos novos.

## Etapa 1: o que já está feito

- **Engenharia:** branch `v2` (pasta `~/Documents/HUB-v2`), 96 testes (Vitest), CI no GitHub Actions, sem "João" no código (I9).
- **Hexagonal:** domínio, portas, casos de uso da seleção e do despacho, repositórios SQLite, Notificador
  ([arquitetura](arquitetura.md)).
- **Cofre e broker:** cofre cifrado no servidor e Keychain no Mac; usuários Linux `hub` e `agente`; broker MCP com
  política e confirmação no Telegram ([segurança](seguranca.md)).
- **Servidor:** VM `hub-cloud` na Oracle com Tailscale, Orca sem tela, Claude Code e git do `agente`; hub como
  serviço, "Hub online", `/pm_login` pelo celular, catálogo e históricos migrados; task do sandbox de ponta a ponta
  ([servidor](servidor.md)).

## Etapa 1: o que falta

| | Item | Quem | Detalhe |
|---|---|---|---|
| ⬜ | Heartbeat no Healthchecks.io | João → Claude | Precisa do endereço do check |
| ⬜ | GitHub do `agente` | João + Claude | Uma conta por espaço (corporativa e pessoal), não global: decidir no onboarding |
| ⬜ | Identidade do Git no servidor (A16) | João → Claude | Nome e e-mail para o `agente` e o `hub` |
| ⬜ | Limpeza no Orca | João | Remover os projetos `teste-mw13visx*`; opcional: revogar token do bot de teste e o pareamento |
| ⬜ | Virada | João + Claude | Trocar o bot de teste (`@HubTasksCloudBot`) pelo principal (`@JoaoTaskBot`) e parar o hub do Mac |

## Etapa 2: o resto, por ordem de valor

1. **Hexagonal, o resto:** `gamificacoes`, `regras`, `projetos`, `login-pm` e `confirmacao` no Notificador; botões
   com formato tipado; Presenter e eventos de domínio quando houver um segundo chat.
2. **Prisma + SQLite** (D-A13), com o teste P1.
3. **Empresas e ferramentas fora do código** (I3, I4); dados fora do repositório também no Mac (I5).
4. **Pacote do onboarding** ([app universal](app-universal.md#3-onboarding-hub-init)): `hub init`, escolha das
   ferramentas de gestão, identidade do Git, documento de requisitos da VPS e a listagem igual ao PM (B20).
5. **Jira** (D-A16).
6. **Suporte:** `/diagnostico`, logs estruturados (pino) (I11).
7. **Distribuição**, site de suporte, sistemas operacionais (D-A19 a D-A21).
8. **Teams** (D-A10).

**Ideias sem data** (sobras do roadmap da v1): mensagens de voz com transcrição local; comandos pré-aprovados por
projeto no Claude Code; conta do Claude por empresa; `/historico`.

## Impeditivos do app universal (I1–I13)

O que impede entregar o hub a outras pessoas, levantado em 30/10/2026.

| # | Impeditivo | Status |
|---|---|---|
| I1 | Sem testes automatizados | ✔️ 96 testes |
| I2 | Depende do texto da tela do Claude Code | ✔️ estado e resultado pelo Orca; a tela só para o limite de uso (06/11) |
| I3 | Bnexo obrigatório para o hub iniciar | ⬜ (etapa 2) |
| I4 | Empresas `funifier`/`dac` fixas no código | ⬜ (etapa 2) |
| I5 | Código e dados na mesma pasta | 🔄 separados no servidor; no Mac ainda juntos |
| I6 | Sem instalação nem serviço | 🔄 systemd no servidor; falta o `hub init` |
| I7 | Sem versões nem distribuição | 🔄 repositório no GitHub; falta distribuição |
| I8 | Credenciais no contexto do agente | ✔️ no servidor (broker); no Mac fica como está (06/11) |
| I9 | "João" no código | ✔️ |
| I10 | Respostas do MCP do PM são texto para IA | ⬜ perguntar ao time do PM se o formato é estável |
| I11 | Sem diagnóstico para suporte | ⬜ (etapa 2) |
| I12 | Orca obrigatório | ✔️ aceito (D-A3) |
| I13 | Pastas vazias em `runs/` | ✔️ |
