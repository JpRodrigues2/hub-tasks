# Backlog (B01–B41)

B01–B20: ajustes pedidos pelo João depois do primeiro fluxo completo (15/10/2026); cada item feito virou uma regra
que vale hoje. B21–B41: o que falta das etapas 1 e 2 da v2 (detalhes e contexto no [plano](plano.md)).
Status: ⬜ a fazer · ✔️ feito · ❌ fora.

## Feitos: o que vale hoje

| # | Regra |
|---|---|
| B01 ✔️ | Ao despachar, a task vai para "em progresso" na ferramenta de gestão |
| B02 ✔️ | O hub **nunca comenta** na task e nem pergunta se deve, sem comando explícito |
| B03 ✔️ | O hub **nunca move para "em revisão"** |
| B04 ✔️ | ✅ Encerrar pergunta se marca como concluída; só com Sim o status muda |
| B05 ✔️ | O prompt não define nome de branch; a sessão escolhe e devolve no `RESULTADO HUB` |
| B06 ✔️ | Commits e PRs sem coautor nem menção a IA |
| B07 ✔️ | O prompt não aponta para o repositório de contexto nem para `CONTEXT.md` |
| B08 ✔️ | Regras de trabalho por empresa em `regras/<empresa>.md`, vistas e trocadas inteiras pelo `/regras` |
| B09 ✔️ | Depois da conclusão: 💬 instrução, 🔀 PR (base escolhida na hora), ✅ encerrar; `/continuar` traz de volta |
| B10 ✔️ | `/limpar` apaga a conversa (o Telegram só deixa apagar mensagens com menos de 48 h) |
| B11 ✔️ | `runs/` de tasks encerradas há mais de 30 dias é apagado (04:00); `/limpar_runs` apaga na hora; credenciais e tasks em andamento ficam |
| B12 ✔️ | `/projetos` liga e desliga projetos da listagem; projeto novo entra ligado; rodapé diz quantas ficaram ocultas |
| B13 ✔️ | `/nova <instruções>`: atividade avulsa, sem ferramenta de gestão, com a mesma conversa e os mesmos botões |
| B14 ✔️ | Padrão visual (`src/msg.ts`): ícone + título em negrito, contexto em itálico, corpo, rodapé; o `/start` mostra a legenda dos ícones |
| B15 ✔️ | Task de projeto sem app: ligar a um app existente ou criar o ambiente (pasta ou clone, Orca, `apps.yaml`) pelo Telegram |
| B16 ✔️ | App da Funifier sem gamificação: aviso com ➕ Cadastrar ou ⚠️ Seguir sem, em vez de bloquear |
| B17 ✔️ | `/gamificacoes`: cadastro de credenciais pelo Telegram, mensagem apagada ao ler; vão para o cofre ([segurança](seguranca.md)) |
| B18 ✔️ | Correções: continuações presas na fila; falso "ocupado" por shell em segundo plano; task presa com o resultado já na tela |
| B19 ✔️ | 📦 Em lote: tasks da mesma empresa num só prompt e numa só sessão, configuradas uma vez; Encerrar pergunta pelas N tasks |

## A fazer

<a id="b20"></a>
### B20 — Listagem igual ao PM: por projeto, pai e filhas, seleção pelo número · ⬜

Pedido em 05/11/2026; entra no pacote do [onboarding](app-universal.md#3-onboarding-hub-init).

**Problema:** o resumo e o `/tarefas` separam as tasks só por status, numa ordem diferente da do Funifier PM. Os
botões ✅/⬜ ficam embaixo com o título cortado, e fica difícil achar a task certa.

**Como deve ficar:**
- **Um projeto por vez:** tudo de um projeto, depois tudo do outro.
- **Mesma ordem e hierarquia do PM:** a sprint (ex.: "Novembro 2026") e cada task pai seguida das subtasks na ordem
  do PM (1., 2., 3.…), recuadas com `↳`. Subtask cuja pai não está na lista mostra o nome da pai.
- **Status como etiqueta** na linha, sem agrupar por ele. Link, projeto e prazo continuam.
- **Selecionar pelo número na própria linha.** O Telegram não deixa um trecho de texto virar botão; o caminho é um
  comando clicável por task (ex.: `/t3`): o bot marca ✅ na linha (edita a mensagem) e apaga o comando enviado.
  ▶️ Iniciar, 📦 Em lote e 💤 Nenhuma continuam no fim.
- **Bnexo e Jira** seguem a mesma regra, com a hierarquia que tiverem.

**O que falta no código:**
- A `Task` (`src/pm/types.ts`) não guarda pai, sprint nem ordem.
- Funifier PM: `list_my_tasks` traz `isSubtask` e a sprint, mas não a pai nem a ordem; `get_task` traz pai e
  subtarefas. Descobrir de onde vem a ordem das tasks pai na sprint.
- Bnexo: subtarefas pelo `list_checklist`. Jira: campo `parent`.

## Etapa 1 da v2: o que falta

| # | Item | Quem |
|---|---|---|
| B21 ❌ | **Broker no Mac (modo local):** fora do lançamento (06/11). O broker fica só no servidor; no Mac a sessão continua recebendo o `credenciais.json` | — |
| B22 ✔️ | **Prova do broker** (06/11): task fictícia no sandbox com `teensmart-app/dev`, só leitura (`funifier_list` pelo broker); nenhum dos arquivos novos (históricos, `runs/`, logs) tem valor do cofre. Os 8 que têm são os históricos migrados do Mac (até 04/11). Task fictícia porque uma real mudaria o status no PM | Claude |
| B23 ✔️ | **I2:** estado do agente e `RESULTADO HUB` pelo `worktree ps` do Orca (capturas reais do T3b); a tela fica só como reserva | Claude |
| B24 🔄 | **Heartbeat** no Healthchecks.io: código pronto (ping a cada 5 min, `/fail` se o Orca cair, `HUB_HEARTBEAT_URL`); falta o João criar o check e pôr o endereço no `.env` do servidor | João |
| B25 ✔️ | **Testes T6, T11, T12** (06/11): T11, Orca reiniciado: terminais sobrevivem, volta em ~6 s, hub segue despachando; T6, front de dev abre no Mac e no celular pela tailnet, não pela internet; T12, task concluída com o Mac fechado | Claude + João |
| B26 ✔️ | **T14 na Oracle** (06/11): com o Mac fechado, o celular acompanhou a sessão e mandou mensagem nela; o Mac reconectou na mesma sessão | João |
| B27 ⬜ | **GitHub do `agente`:** login para as sessões darem push e abrirem PR (🔀). O MCP do PM não precisa: o hub já põe a task no prompt. **Não pode ser um login global:** o usuário tem conta corporativa e pessoal (caso do João), então git, chave SSH e `gh` precisam ser por espaço (pasta-mãe), no Mac e no servidor. Decidir no onboarding (B35) | João + Claude |
| B28 ⬜ | **Identidade do Git no servidor** (A16) para o `agente` e o `hub` | João passa nome e e-mail |
| B29 ⬜ | **Limpeza no Orca:** remover os projetos `teste-mw13visx*`; opcional: revogar o token do bot de teste e o pareamento | João |
| B30 ⬜ | **Virada:** bot principal (`@JoaoTaskBot`) no servidor e hub do Mac parado | João + Claude |
| B31 ✔️ | **Deploy automático** (06/11): o servidor busca no GitHub, a cada 5 min, o commit da `v2` com CI verde; confere, troca e volta sozinho se o hub não subir ([servidor](servidor.md#deploy)) | Claude |

## Etapa 2 da v2: por ordem de valor

| # | Item |
|---|---|
| B32 ⬜ | **Hexagonal, o resto:** `gamificacoes`, `regras`, `projetos`, `login-pm`, `confirmacao` no Notificador; botões tipados; Presenter e eventos de domínio com um segundo chat |
| B33 ⬜ | **Prisma + SQLite** (D-A13), com o teste P1 |
| B34 ⬜ | **Empresas e ferramentas fora do código** (I3, I4) e dados fora do repositório também no Mac (I5) |
| B35 ⬜ | **Onboarding (`hub init`)** ([app universal](app-universal.md#3-onboarding-hub-init)): escolha das ferramentas, identidade do Git, documento de requisitos da VPS; junto com o B20 |
| B36 ⬜ | **Jira** (D-A16) |
| B37 ⬜ | **Suporte:** `/diagnostico` e logs estruturados com pino (I11) |
| B38 ⬜ | **Distribuição**, site de suporte e sistemas operacionais (D-A19 a D-A21) |
| B39 ⬜ | **Teams** (D-A10) |
| B40 ⬜ | **I10:** perguntar ao time do PM se o formato das respostas do MCP é estável |
| B41 ⬜ | **Estudo do João:** primeiro os [fundamentos](estudo/fundamentos.md) (sistema operacional, rede, scripts e as perguntas de 06/11), depois arquitetura, broker e infra em nuvem ([estudo/](estudo/)) |

**Ideias sem data** (sobras do roadmap da v1): mensagens de voz com transcrição local; comandos pré-aprovados por
projeto no Claude Code; conta do Claude por empresa; `/historico`.
