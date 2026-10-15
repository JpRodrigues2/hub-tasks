# Roadmap do Hub de Tasks — instruções para o Claude Code

Você vai construir, junto com o João, um **hub de automação de tasks**. Leia este arquivo inteiro antes de começar.

## Como trabalhar neste roadmap
- Execute **uma fase por vez**. Ao terminar cada fase, mostre um resumo do que foi feito, o que ficou pendente e o que precisa do João, e **PARE**. Só avance quando o João disser "próxima fase".
- Marque o progresso neste arquivo, trocando `[ ]` por `[x]`, para que uma sessão nova saiba onde parou.
- Antes de instalar qualquer coisa global no computador, peça permissão.
- **Segredos** (tokens, senhas, API keys) ficam só em `~/Documents/HUB/.env`, que precisa estar no `.gitignore`. Nunca coloque segredos em código, logs, prompts, mensagens do Telegram ou commits.
- **Durante a construção**, nunca altere tasks reais nas ferramentas de gestão nem dados no backend da Funifier. Testes de escrita só em tasks de teste criadas pelo João e aprovadas por ele.
- **Não altere os repositórios das empresas.** Se precisar de algum arquivo local num desses repositórios, ele tem que ser ignorado via `.git/info/exclude`, nunca via commit.

## O que o hub faz (visão geral)
1. Todo dia, no horário configurado, busca as tasks do João nas duas ferramentas de gestão:
   - **Funifier PM** — via MCP do Funifier PM;
   - **Bnexo**, da DAC — via MCP do Bnexo, bundle "Essencial".
2. Manda um resumo no Telegram, separado por empresa (backlog, pendentes, em progresso, atrasadas), com botões para o João marcar quais tasks quer automatizar.
3. Para cada task marcada:
   - pergunta se há informação extra (o que foi falado em reunião, no Teams etc.);
   - sugere em qual app/pasta rodar, e o João confirma;
   - **na Funifier**, lista servidor, conta e gamificações que serão alteradas, e o João autoriza cada uma.
4. Despacha a task para a sessão do Claude Code que já está aberta no Orca IDE naquele projeto, usando a CLI do Orca. Se não houver sessão aberta, abre uma com `claude -c`.
5. Acompanha a execução:
   - avisa no Telegram quando a sessão precisa do João (pergunta ou permissão), além do aviso que o próprio Orca já dá no celular;
   - ao final, marca a worktree como "em revisão" no Orca;
   - atualiza o status da task na ferramenta de gestão;
   - manda um resumo no Telegram.

**Única dependência de execução:** o computador ligado, sem dormir, com o Orca IDE aberto e com internet.

## Estrutura de pastas do João
```
~/Documents/
  Contexto/   → contextos (apps/<EMPRESA>/<app>/CONTEXT.md; não é repositório git)
  FUNIFIER/   → projetos da Funifier (um diretório por app)
  DAC/        → projetos da DAC (monorepos)
  HUB/        → este projeto
```

## Decisões técnicas (seguir, salvo motivo forte — nesse caso, pergunte)
- **Linguagem:** Node.js + TypeScript.
- **Telegram:** biblioteca `grammY`, em modo **long polling**. Não precisa de servidor público, porta aberta nem domínio.
- **Segurança do bot:** o bot só aceita mensagens e cliques vindos do `TELEGRAM_CHAT_ID` do João. Qualquer outro chat é ignorado e registrado em log. Isso é obrigatório, porque o bot controla terminais no computador do João.
- **Estado:** SQLite local (`~/Documents/HUB/data/hub.db`), guardando:
  - tasks já vistas;
  - seleções do João;
  - fila por app;
  - despachos em andamento;
  - histórico.
- **Leitura e escrita nas ferramentas de gestão:** via cliente MCP oficial (`@modelcontextprotocol/sdk`), chamando as ferramentas dos MCPs **diretamente pelo código, sem usar IA**. Isso deixa o processo previsível e sem custo de tokens.
- **Controle do Orca:**
  - sempre via comando `orca ... --json`, executado com `execFile` e argumentos em array, **nunca** montando string de shell (o texto da task pode conter caracteres perigosos);
  - identificadores de terminal mudam quando o Orca reinicia, então sempre redescobrir o terminal pela pasta do app.
- **Envio do prompt para a sessão:**
  - escrever o prompt completo num arquivo `~/Documents/HUB/runs/<id>.md`;
  - mandar ao terminal **uma única linha**: `Leia e execute a task descrita em <caminho do arquivo>.`;
  - isso evita problemas com quebras de linha no terminal.
- **Configuração de projetos:** `~/Documents/HUB/apps.yaml` é o catálogo que liga projeto da ferramenta → pasta → contexto → gamificações.

## Adicionando novos projetos ao hub
O hub só automatiza tasks de projetos que estejam **abertos no Orca** e **cadastrados no `apps.yaml`**. Para incluir um projeto novo:
1. **Pasta:** clone o repositório em `~/Documents/FUNIFIER/<app>` ou `~/Documents/DAC/<app>`.
2. **Orca:** adicione o projeto pela interface do Orca ou com `orca repo add --path ~/Documents/<EMPRESA>/<app>`. Confira com `orca repo list --json`.
3. **Contexto (opcional, recomendado):** crie `~/Documents/Contexto/apps/<EMPRESA>/<app>/CONTEXT.md`. Na Funifier, inclua a seção "Mapa de servidores, contas e gamificações".
4. **Catálogo:** adicione uma entrada no `~/Documents/HUB/apps.yaml` (formato na Fase 2), com `projetos_na_ferramenta` exatamente igual ao nome/ID do projeto no Funifier PM ou no Bnexo. Na Funifier, liste as gamificações (só nomes, servidor e conta — **nunca** credenciais) e marque uma como `padrao: true`.
5. **Recarregar:** o hub relê o `apps.yaml` antes de cada resumo; use `/status` no Telegram para conferir se o app aparece e se a pasta foi encontrada no Orca.

Enquanto o passo 4 não for feito, as tasks desse projeto aparecem no resumo como "não mapeadas", sem botão de automação.

---

## Fase 0 — Reconhecimento (somente leitura)
- [x] Identificar o sistema operacional, as versões do Node e do git, e se o comando `orca` está disponível (`command -v orca`, `orca status --json`). Se o `orca` não responder, instruir o João a ativar a CLI nas configurações do Orca (Settings → General ou Settings → Experimental → CLI, dependendo da versão) e parar.
- [x] Rodar `orca repo list --json`, `orca worktree ps --json` e `orca terminal list --json`, e resumir quais projetos e terminais o Orca enxerga.
- [x] Listar as pastas de `~/Documents/FUNIFIER` e `~/Documents/DAC` (só o primeiro nível) e, para cada uma: se é repositório git, o remote e se está aberta no Orca.
- [x] Listar o que existe em `~/Documents/Contexto` e quais apps já têm CONTEXT.md.
- [x] Verificar a configuração de MCPs usada nos testes do João na raiz de `~/Documents` (sem imprimir segredos).
- [x] Entregar um relatório e PARAR.

## Fase 1 — Descobrir os MCPs das ferramentas de gestão (somente leitura)
- [x] Criar `~/Documents/HUB` com `git init`, `.gitignore` (`.env`, `data/`, `runs/`, `node_modules/`, `logs/`) e `.env.example`.
- [x] Pedir ao João os dados de acesso e gravá-los no `.env`:
  - token e URL do bundle "Essencial" do Bnexo;
  - forma de conexão do MCP do Funifier PM (repositório `funifierinc/funifier-pm-mcp`; ler o README para saber se é stdio ou HTTP e quais variáveis exige).
- [x] Escrever um script `scripts/mcp-explore.ts` que conecta em cada MCP e lista **todas** as ferramentas com seus parâmetros.
- [x] Identificar, para cada ferramenta de gestão, quais ferramentas MCP servem para:
  - (a) listar as tasks atribuídas ao João, com filtro por status e prazo;
  - (b) ler os detalhes e comentários de uma task;
  - (c) mudar o status;
  - (d) comentar;
  - (e) listar projetos;
  - (f) identificar o usuário logado (para filtrar "minhas tasks").
- [x] Testar só as leituras: listar as tasks do João em cada ferramenta e mostrar a contagem por status.
- [x] Documentar tudo em `docs/mcp-mapping.md`, incluindo os nomes de status de cada ferramenta (qual status significa backlog, em progresso, em revisão, concluída) e como detectar atraso.
- [x] PARAR.

## Fase 2 — Catálogo de apps (`apps.yaml`)
- [x] Gerar um rascunho de `apps.yaml` com uma entrada por pasta de `FUNIFIER/` e `DAC/`:
```yaml
- app: brb-reconheca                     # identificador curto
  empresa: funifier                      # funifier | dac
  ferramenta: funifier-pm                # funifier-pm | bnexo
  projetos_na_ferramenta: ["BRB Reconheça"]   # nomes/IDs exatos na ferramenta de gestão
  pasta: /Users/<usuario>/Documents/FUNIFIER/brb-reconheca
  contexto: /Users/<usuario>/Documents/Contexto/apps/FUNIFIER/brb/CONTEXT.md   # ou null
  sessao_resume_id: null                 # opcional: ID de sessão do Claude a retomar em vez de -c
  gamificacoes:                          # só Funifier; nomes, NUNCA credenciais
    - nome: "BRB Reconheça Homolog"
      servidor: "..."
      conta: "BRB"
      padrao: true
```
- [x] Usar a listagem de projetos da Fase 1 para sugerir o casamento entre projeto da ferramenta e pasta, e, para a Funifier, o mapa de gamificações a partir dos CONTEXT.md existentes (seção "Mapa de servidores, contas e gamificações").
- [x] Marcar com `# TODO confirmar` tudo o que for suposição e apresentar ao João em forma de tabela para ele confirmar ou corrigir.
- [x] Projetos de ferramenta sem pasta correspondente ficam listados como "não mapeados". O hub vai mostrar essas tasks no resumo, mas não vai oferecer automação para elas.
- [x] Gamificações da Funifier: o João vai preencher conta por conta **depois da última fase**. Até lá, apps da Funifier com `gamificacoes: []` aparecem no resumo, mas o hub **não despacha** a task (avisa no Telegram que falta cadastrar a gamificação).
- [x] PARAR.

## Fase 3 — Esqueleto do bot
- [x] Antes de começar, confirmar que o João já criou o bot no @BotFather e pedir `TELEGRAM_BOT_TOKEN`. Descobrir o `TELEGRAM_CHAT_ID` pedindo que o João mande "oi" ao bot, e gravar os dois no `.env`.
- [x] Criar o projeto Node/TypeScript com estes módulos:
  - `config` — leitura e validação do `.env` e do `apps.yaml`;
  - `db` — SQLite com migrações;
  - `telegram` — grammY com filtro de chat obrigatório;
  - `pm/` — um adaptador por ferramenta (`funifier-pm.ts`, `bnexo.ts`), ambos implementando a mesma interface `listMyTasks()`, `getTask()`, `setStatus()`, `comment()`, usando o mapeamento da Fase 1;
  - `orca` — wrapper da CLI: `listTerminals(pasta)`, `readScreen(handle)`, `send(handle, linha)`, `waitIdle(handle, timeout)`, `createTerminal(pasta, comando)`, `setWorktreeStatus(pasta, status, comentario)`;
  - `logger` — logs em `logs/`, sem segredos.
- [x] Comandos do bot:
  - `/status` — mostra se o Orca e os MCPs estão acessíveis, além da fila e dos despachos em andamento;
  - `/tarefas` — dispara o resumo manualmente.
- [x] Testar: `/status` no Telegram responde corretamente; uma mensagem vinda de outro chat é ignorada.
- [x] PARAR.

## Fase 4 — Resumo diário e seleção
- [x] Agendar o resumo diário com `node-cron`, no horário definido em `.env` (`RESUMO_HORARIO=09:00`, fuso `America/Sao_Paulo`). Se o computador estava desligado no horário, enviar assim que o bot iniciar (catch-up), uma vez por dia.
- [x] Montar o resumo:
  - uma mensagem por empresa, agrupada em atrasadas, em progresso, pendentes e backlog;
  - cada task com título curto, projeto, prazo e link;
  - tasks de projetos mapeados têm um botão que alterna ⬜/✅ (editando a própria mensagem);
  - no final, os botões "Iniciar selecionadas" e "Nenhuma hoje".
- [x] Para cada task selecionada, conduzir uma conversa em sequência:
  1. **Informação extra:** "Quer adicionar alguma informação?" O João responde em texto ou toca no botão "Pular".
  2. **Destino:** "Rodar em `<app>` (`<pasta>`)?", com os botões "Confirmar" e "Escolher outro" (que lista os apps da mesma empresa).
  3. **Somente Funifier — alvo:** listar as gamificações do app, com a padrão já marcada, com toggles para o João marcar todas as que podem ser alteradas. Exigir pelo menos uma marcada e mostrar servidor e conta de cada gamificação.
  4. **Confirmação final:** resumo de tudo com o botão "Despachar".
- [x] Gravar tudo no SQLite com o estado `aguardando_despacho`.
- [ ] Testar o fluxo inteiro com tasks reais, **sem despachar** (o despacho chega na Fase 5).
- [ ] PARAR.

## Fase 5 — Despacho para o Orca
- [x] Antes de usar projetos reais, criar um projeto de teste: `~/Documents/HUB/sandbox` (repositório git simples), abrir no Orca e adicionar ao `apps.yaml` como `app: sandbox`.
- [x] Gerar o arquivo da task em `runs/<id>.md` com:
  - título, descrição, comentários e link da task original;
  - a informação extra do João;
  - app e pasta;
  - na Funifier: as gamificações autorizadas (nome, servidor, conta) e a regra **"só altere as gamificações listadas aqui; se a gamificação conectada no seu MCP não for uma delas, pare e avise"**;
  - as regras de trabalho:
    - seguir o CLAUDE.md e o CONTEXT.md do projeto;
    - trabalhar numa branch nova (`hub/<id>-<slug>`);
    - não fazer push na branch principal;
    - antes de qualquer escrita no backend, confirmar o alvo;
    - ao terminar, atualizar o CONTEXT.md conforme a regra do projeto;
  - **formato obrigatório de encerramento:** terminar com um bloco iniciado pela linha `### RESULTADO HUB`, contendo `status: concluido | bloqueado | precisa_revisao`, resumo, arquivos alterados, branch/PR e pendências.
- [x] Implementar a lógica de despacho, por app:
  1. Listar os terminais da pasta do app.
  2. Se houver um terminal com o Claude Code rodando, ler a tela:
     - se estiver ocioso, enviar a linha do prompt;
     - se estiver ocupado ou esperando resposta do João, colocar a task na fila do app e avisar no Telegram.
  3. Se não houver terminal com o Claude, criar um na pasta com `claude -c` (ou `claude --resume <sessao_resume_id>`, se configurado), esperar ficar ocioso e então enviar.
  4. Marcar o despacho como `em_execucao` e registrar o handle do terminal (sabendo que ele pode mudar se o Orca reiniciar).
- [x] Uma task por vez por app; a fila anda sozinha quando a anterior termina.
- [x] Testar ponta a ponta no `sandbox` com uma task fictícia ("crie um arquivo OLA.md com a data de hoje").
- [x] Extra: anexos do João pelo Telegram (fotos/arquivos na etapa de informação extra → `runs/<id>/`) e imagens `<img>` da descrição do Bnexo baixadas para o prompt. O MCP do Funifier PM não expõe anexos nem imagens da descrição (pedir ao time do PM).
- [x] Extra: `/teste <texto>` cria uma task fictícia no sandbox passando pela conversa inteira.
- [ ] PARAR.

## Fase 6 — Acompanhamento e fechamento
- [ ] Monitorar cada despacho em andamento com ciclos de `orca terminal wait --for tui-idle` (com timeout), seguidos de leitura da tela:
  - **apareceu `### RESULTADO HUB`:** extrair o resultado;
  - **ficou ocioso sem o bloco:** a sessão está esperando o João (pergunta ou permissão). Avisar no Telegram com as últimas linhas da tela: "A task X precisa de você no Orca", sem repetir o mesmo aviso mais de uma vez a cada 15 min;
  - **a tela mostra limite de uso da conta do Claude:** avisar no Telegram que a task está pausada até o João trocar de conta no Orca;
  - **o terminal sumiu (Orca reiniciou):** redescobrir pela pasta e, se não achar, marcar como `interrompido` e avisar.
- [ ] Ao concluir, com base no status do bloco de resultado:
  - `orca worktree set --worktree path:<pasta> --workspace-status in-review --comment "<resumo>" --unread --json`;
  - na ferramenta de gestão: mudar a task para o status equivalente a "em revisão" (**nunca** "concluída" automaticamente) e comentar o resumo e a branch/PR;
  - no Telegram: mandar o resumo com o resultado e o link da task;
  - liberar a fila do app.
- [ ] Testar no `sandbox` e depois com **uma** task real de baixo risco escolhida pelo João.
- [ ] PARAR.

## Fase 7 — Rodar sempre, sozinho
- [ ] Compilar o projeto e configurar o início automático no login, conforme o sistema operacional:
  - macOS: LaunchAgent (`~/Library/LaunchAgents`);
  - Windows: Agendador de Tarefas;
  - Linux: serviço `systemd --user`.
- [ ] Configurar reinício automático em caso de falha.
- [ ] Na inicialização, o bot espera o Orca responder (`orca status`) antes de despachar, tentando de novo a cada 30 s e avisando no Telegram se passar de 10 min.
- [ ] Explicar ao João como impedir que o computador durma quando estiver na tomada, e verificar se isso está configurado.
- [ ] Mandar no Telegram uma mensagem "Hub online" a cada inicialização.
- [ ] Testar: reiniciar o computador, abrir o Orca e confirmar que o bot volta sozinho.
- [ ] PARAR.

## Fase 8 — Mensagens de voz (opcional)
- [ ] Aceitar áudio do Telegram na etapa de informação extra e transcrever localmente com `whisper.cpp` (modelo `small` ou `medium`, em português), sem serviço pago.
- [ ] Mostrar a transcrição ao João para ele confirmar ou corrigir antes de usar.
- [ ] PARAR.

## Fase 9 — Ajustes finos
- [ ] Para cada app, propor uma lista de comandos pré-aprovados para o Claude Code (testes, lint, build, git em branch própria), em arquivo de configuração **local e não versionado** do Claude Code daquele projeto, para reduzir os pedidos de permissão. Push, alterações no backend e comandos destrutivos continuam exigindo aprovação.
- [ ] Opção no `apps.yaml` para indicar a conta de IA preferida por empresa, e um lembrete no Telegram quando uma task da empresa X for rodar com a conta errada.
- [ ] Comando `/historico` com as últimas tasks automatizadas e o resultado de cada uma.
- [ ] PARAR e apresentar sugestões de melhoria com base no uso real.
