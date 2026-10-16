# Backlog do Hub — ajustes e melhorias

Lista viva de ajustes e melhorias pedidos pelo João depois do primeiro fluxo completo (2026-10-15).
O João vai ditando os itens; o Claude organiza, lapida com ele e só implementa o que estiver **aprovado**.

**Status:** 🆕 anotado · 💬 em discussão · ✅ aprovado · 🔨 fazendo · ✔️ feito

Quando um item mudar uma regra do `ROADMAP_HUB.md`, o roadmap é atualizado junto com a implementação.

---

## 1. Ferramenta de gestão (status e comentários)

### B01 — Despachou → "em progresso" · ✔️
Assim que a task for enviada para a sessão do Claude, mudar o status na ferramenta de gestão para **em progresso**
(`in_progress` no Funifier PM e no Bnexo).

### B02 — Nunca comentar sem comando explícito · ✔️
- Por padrão o hub **nunca** comenta na task e **nem pergunta** se deve comentar.
- Comentário só quando o João mandar explicitamente.
- Muda a regra atual do fechamento (hoje o hub comenta o resultado).

### B03 — Nunca mover para "em revisão" · ✔️
O hub deixa de mover a task para "em revisão" ao concluir. A task fica **em progresso** até o João decidir no botão **Encerrar** (B04).

### B04 — Encerrar pergunta se fecha a task como concluída · ✔️
Ao tocar em **✅ Encerrar**, o bot pergunta:
- **Marcar como concluída** na ferramenta de gestão;
- **Não**, só encerra o ciclo no hub (a task continua em progresso).

Muda a regra atual "nunca mover para concluída": passa a ser permitido **só** com a confirmação explícita do João nesse botão.

> **Decidido:** a trava `HUB_ESCRITA_PM` fica ligada de vez, mas só para **mudar status** (em progresso e concluída). Comentar continua bloqueado por padrão (B02).

---

## 2. Prompt da task (`runs/<id>.md`)

### B05 — Não definir nome de branch · ✔️
- O prompt **não** traz nome de branch (nada de `hub/...` nem outro nome arbitrário).
- A própria sessão escolhe o nome, **ou** o João informa o nome na hora dos botões de próximos passos.

> **Decidido:** o hub descobre a branch pelo campo `branch` do `RESULTADO HUB` que a sessão devolve.

### B06 — Commits sem o Claude como coautor · ✔️
Instruir a sessão a **não** adicionar `Co-Authored-By` (nem outra atribuição ao Claude) nos commits e PRs, para que no GitHub apareça só o João como autor.

### B07 — Não apontar para o repositório de contexto · ✔️
- Remover do prompt qualquer referência ao `~/Documents/Contexto` e ao `CONTEXT.md`, incluindo "leia o contexto em…" e "atualize o CONTEXT.md".
- O contexto fica por conta de cada sessão já existente.
- Revisar também o campo `contexto` do `apps.yaml`.

### B08 — Regras de trabalho por empresa, editáveis pelo Telegram · ✔️
- Dois documentos universais de regras de trabalho: um para a **Funifier** e um para a **DAC**.
- Eles substituem a seção "Regras de trabalho" fixa no código.
- Exemplo do problema atual: na C4 (DAC) o prompt manda conferir gamificação, o que não faz sentido.
- O João pode **ver e editar** cada documento pelo Telegram.
- As regras desta lista (B05, B06, B07) entram nesses documentos.

> **Decidido:** os arquivos ficam em `regras/funifier.md` e `regras/dac.md`, no HUB. A edição pelo Telegram troca o **texto inteiro**: o bot mostra o texto atual, o João copia, altera só o que quiser e manda de volta.

---

## 3. Próximos passos (botões depois da conclusão)

### B09 — Refinar os três botões · ✔️
Os botões 💬 Dar instrução · 🔀 Abrir PR · ✅ Encerrar continuam, com os ajustes:
- nome da branch informado pelo João na hora, quando ele quiser (B05);
- Encerrar com a pergunta de concluir a task (B04);
- sem comentário automático na ferramenta de gestão em nenhuma rodada (B02).

---

## 4. Telegram

### B10 — Comando para limpar a conversa · ✔️
- Um comando (ex.: `/limpar`) que apaga as mensagens recentes do chat, como um `clear` de terminal.
- Limitação do Telegram: o bot só consegue apagar mensagens com **menos de 48 h**. O hub precisa guardar os IDs das mensagens para saber o que apagar.

> **Revisto em 2026-10-16:**
> - `/limpar` limpa **a conversa inteira**, depois de um "tem certeza?". Apaga tudo o que o Telegram deixa: as mensagens das últimas 48 h, sem exceção.
> - Mensagens mais antigas o bot não consegue apagar. Para limpar só do lado do João: no app, menu do chat → **Limpar histórico**.
> - `/limpar_runs` limpa os arquivos de `runs/` (ver B11).

### B12 — Escolher pelo Telegram quais projetos entram na listagem · ✔️
- Exemplo: "Evolução - Registro de Contrato" aparece em toda listagem, mas o João não mexe nele há 3 meses e não pode apagar as tasks de lá.
- Um comando (ex.: `/projetos`) mostra todos os projetos conhecidos, das duas ferramentas, como uma lista de **checkboxes**: um botão ✅/⬜ por projeto, que liga ou desliga na hora. O Telegram não tem dropdown, e esse é o equivalente.
- Projetos desmarcados somem do resumo diário e do `/tarefas`, mas nada muda nas ferramentas de gestão.
- A escolha fica salva no banco do hub e vale até o João mudar.
- Projeto novo, que aparecer pela primeira vez, entra **marcado** por padrão, para nenhuma task nova passar despercebida.
- No rodapé do resumo, uma linha discreta: "N tasks ocultas em X projetos desativados (/projetos)".

### B13 — Disparar uma atividade avulsa pelo Telegram · ✔️
Uma task que não está cadastrada em nenhuma ferramenta de gestão. O João escreve as instruções e o hub despacha.
- **Comando:** algo como `/nova`, ou `/nova <instruções>` direto.
- **Conversa:** reaproveita as etapas da seleção de hoje:
  1. **Instruções:** texto, fotos e arquivos (e voz, quando a Fase 8 existir).
  2. **Destino:** escolher a empresa e o app. Aparecem **todos** os apps do `apps.yaml`, inclusive os que não têm projeto ligado (ex.: rdc-app, bots, funifier-service).
  3. **Gamificação:** só para apps da Funifier, com as gamificações cadastradas no app. Sem gamificação cadastrada, fica bloqueada, como hoje.
  4. **Confirmar** e despachar.
- Usa a fila, o acompanhamento e as regras de trabalho da empresa (B08), como uma task normal.
- **Sem ferramenta de gestão:** nada para mudar status ou comentar (B01–B04 não se aplicam). O ✅ Encerrar só encerra o ciclo.
- Os botões de próximos passos (💬 instrução, 🔀 PR, ✅ encerrar) funcionam igual.
- **Título da atividade:** a primeira linha das instruções, ou um título que o João informa.
- O atual `/teste` (só sandbox) passa a ser um caso particular disso, ou é removido.

---

## 5. Manutenção

### B11 — Limpeza periódica de `runs/` · ✔️
- Apagar automaticamente os `runs/<id>.md`, `runs/<id>-<n>.md` e as mídias/anexos de `runs/<id>/` de tasks **encerradas** há mais de **30 dias**.
- **Credenciais nunca são apagadas** (decisão de 2026-10-16): `runs/<id>/credenciais.json` fica, e o cofre `data/segredos/` nunca é tocado. Prompts, mídias e anexos podem ser apagados.
- Nunca apagar os de tasks em andamento.
- O histórico no banco continua.
- **Manual (2026-10-16):** `/limpar_runs` pergunta **Só das concluídas** ou **Todos**. "Todos" inclui os arquivos soltos, sem task. Tasks em andamento ficam de fora nos dois casos: configurando, na fila, rodando, esperando você ou com continuação na fila.

---

## 6. Mensagens do Telegram

### B14 — Mensagens mais curtas, espaçadas e com hierarquia visual · ✔️
Pedido: menos carga cognitiva, ou seja, mensagens menores sem perder informação, espaço entre os itens e um padrão visual fixo.

**Padrão** (`src/msg.ts`), igual em todas as mensagens:

| Parte | Formato | Exemplo |
|---|---|---|
| Título | ícone + **negrito** | ✅ **Nome da task** · ❓ **Rodar em pecas-c4?** |
| Contexto | *itálico*, separado por · | *pecas-c4 · concluída · rodada 2* |
| Corpo | texto normal; campos com **Rótulo:** | **Branch:** `feat/x` |
| Rodapé | *itálico* | *Revise no Orca e escolha o próximo passo.* |

Uma linha em branco separa as partes. O título é o assunto: a task, ou a pergunta que espera resposta.

**Ícones** (um por mensagem, sempre com o mesmo significado):
▶️ rodando · ⏳ na fila · 🙋 precisa de você · ⏸️ pausada (limite) · ✅ concluída · 🔍 precisa de revisão ·
⛔ bloqueada · ❌ interrompida/falhou · ⚠️ aviso · ❓ espera resposta · 🔀 PR · 📋 lista.
Na lista de tasks, as bolinhas coloridas marcam o grupo (🔴 atrasadas, 🔵 em progresso, 🟡 pendentes, ⚪ backlog, 🟣 em revisão).

**Menos mensagens:**
- O resumo virou uma mensagem por empresa, com os botões Iniciar e Nenhuma na própria lista.
- O status da ferramenta de gestão vai na mensagem de "rodando".
- Saíram "na fila de despacho", "tudo configurado" e "instrução na fila".
- Na lista, cada task ocupa duas linhas (título com link; projeto e prazo em itálico), com uma linha em branco entre as tasks.
- O `/start` mostra a legenda dos ícones.

---

## 7. Ambiente

### B15 — Configurar o ambiente pelo Telegram para tasks sem app · ✔️
Hoje as tasks de projeto sem app (ex.: BB :: Joga Junto :: Evolução) aparecem na lista sem botão. A partir de agora todas ficam selecionáveis, e o ambiente que faltar é montado pelo Telegram, na hora de iniciar.

**Fluxo proposto**, depois de marcar a task e tocar em Iniciar:
1. ❓ **Ligar a um app existente ou criar um ambiente novo?**
   - *Existente:* escolher empresa e app; o projeto passa a apontar para esse app.
   - *Novo:* os passos 2 a 5.
2. ❓ **Empresa:** Funifier ou DAC. Define a pasta-mãe (`~/Documents/FUNIFIER` ou `~/Documents/DAC`).
3. ❓ **Nome do diretório:** também vira o nome do app no hub.
4. ❓ **Tem URL do Git?**
   - *Sim:* o hub clona (`git clone <url> <pasta>`), usando o acesso ao Git que já existe no computador.
   - *Não:* o hub só cria a pasta. Nenhum repositório é criado no GitHub.
5. O hub adiciona a pasta ao Orca (`orca repo add`).
6. *Só na Funifier:* ❓ **Gamificações**, uma por vez: nome, servidor e conta, e qual vem marcada por padrão. Os servidores já conhecidos aparecem como botões.
7. O hub grava o app no `apps.yaml` (pasta, projeto, gamificações) e segue o fluxo normal: info extra → confirmar → despachar.

Da próxima vez, o projeto já tem app e vai direto.

---

### B16 — Gamificação sem vínculo vira aviso, não bloqueio · ✔️
- App da Funifier sem gamificação no `apps.yaml` deixa de bloquear o despacho.
- Na etapa de gamificação, o bot avisa e oferece **➕ Cadastrar gamificação** ou **⚠️ Seguir sem gamificação**.
- Sem gamificação, o prompt diz para a sessão usar a gamificação que já conhece e confirmar o alvo antes de qualquer escrita.

### B17 — Credenciais de gamificação pelo Telegram · ✔️
- **Exemplo:** o PlayDPS tem mais de 6 contas e 20 gamificações, e a sessão precisa do par API key + secret de cada uma para migrar entre elas (ex.: consultar a eTIP para replicar na Finges).
- **Cadastro:** `/gamificacoes` → app → **➕ Adicionar**. O bot pergunta nome, servidor (botões com os já conhecidos), conta, API key e secret. Também dá para cadastrar na etapa de gamificação ao despachar.
- **Mensagens:** o bot apaga a mensagem com a API key e o secret assim que lê.
- **Cofre:** as credenciais vão para `data/segredos/gamificacoes.json` (permissão 600, fora do git). No `apps.yaml` fica só o id.
- **No despacho:** só as gamificações autorizadas na task vão para `runs/<id>/credenciais.json` (600). O prompt aponta para esse arquivo e proíbe copiar as credenciais para código, commits, PRs, logs ou mensagens. O arquivo é apagado quando a task é encerrada ou interrompida.
- **Remover:** `/gamificacoes` → app → 🗑️. A credencial sai do cofre junto.

### B18 — Correções de 2026-10-16 · ✔️
- Continuações (💬 instrução, 🔀 PR) ficavam presas na fila: o despachante só olhava apps com task nova.
- Falso "a sessão está ocupada": um shell em segundo plano (ex.: servidor de dev) ou o agente "working" no Orca contava como ocupado também na hora de **enviar**. Agora só conta no acompanhamento.
- O `/start` quebrava por causa do texto `<instruções>`, que era lido como HTML.
- Task presa em "em execução" com o resultado já na tela: o monitor contava o shell em segundo plano como trabalho. Agora, com o bloco `RESULTADO HUB` da rodada na tela e sem o Claude gerando, a task fecha mesmo com shell rodando.

---

## Pontos para alinharmos

Respondidos em 2026-10-16:
- **Credenciais:** viraram o B17, com o cofre local e o arquivo por task.
- **Pasta sem Git:** só cria a pasta; o João acha que o Orca aceita pasta sem git. Se o Orca recusar, o bot mostra o erro e volta à pergunta.
- **"Ligar a app existente":** mantida.
