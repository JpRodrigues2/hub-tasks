# Backlog: pedidos do João (B01–B20)

Ajustes pedidos depois do primeiro fluxo completo (15/10/2026). Cada item feito virou uma regra que vale hoje.
Status: ⬜ a fazer · ✔️ feito.

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
