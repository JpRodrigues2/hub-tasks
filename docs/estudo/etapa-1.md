# Estudo da etapa 1

Antes de implementar a etapa 1 do [plano v2](../v2/plano-v2.md), estudamos cada peça. A ordem de leitura sugerida é a mesma das seções.

| # | Tópico | Pergunta que responde |
|---|---|---|
| 1 | Arquitetura hexagonal, portas e `main.ts` | Como o código se organiza para trocar Orca, Telegram e cofre sem reescrever o hub? |
| 2 | Cofre cifrado e broker | Onde as credenciais ficam, e como o agente usa a Funifier sem nunca ver a chave? |
| 3 | Tailscale | Por que ele existe, e o que ele tem a ver (ou não) com o cofre? |
| 4 | Caminhos configuráveis | Por que o hub de hoje não roda fora do Mac do João? |
| 5 | Subir e se recuperar sozinho | Quem liga o hub no servidor, e quem avisa quando ele cai? |
| 6 | `/pm_login` pelo Telegram | Como fazer login no Funifier PM pelo celular, se o hub está num servidor? |
| 7 | Script de preparação da VM e Docker | O que o script faz, se ele é um Dockerfile, e se vale usar Docker |
| 8 | Orca em modo servidor no Mac | O que muda em rodar o Orca "de outro jeito" no Mac |

No fim de cada seção há **perguntas para fixar** e, quando houver, **decisões em aberto**.

---

## 1. Arquitetura hexagonal, portas e `main.ts`

### O problema que ela resolve

Hoje o `despacho.ts` (1025 linhas) faz tudo junto: decide o que fazer com uma task (regra de negócio), chama o Orca, escreve no SQLite, manda mensagem no Telegram e escreve o `credenciais.json`. As regras ficam **misturadas com as ferramentas**. Isso tem três consequências:

- **Trocar uma ferramenta exige reescrever a regra.** Para trocar o Telegram pelo Teams (D-A10), é preciso mexer em arquivos que também decidem estados de despacho.
- **Testar exige as ferramentas de verdade.** Não dá para testar "a task concluiu → aviso ao usuário" sem um Orca e um bot rodando.
- **O servidor é outra ferramenta.** No servidor, o cofre muda (Keychain → arquivo cifrado) e talvez o Executor também (Orca → tmux, se o Orca falhar). Sem uma fronteira clara, cada troca espalha `if (servidor)` pelo código.

### A ideia em uma frase

**O centro (domínio) define o que precisa por meio de interfaces (portas). As ferramentas implementam essas interfaces (adaptadores). Um único arquivo (`main.ts`) liga uma coisa na outra.**

```
                ┌──────────── adaptadores (o mundo de fora) ────────────┐
                │                                                        │
   Telegram ──▶ │  Notificador  ┐                         ┌  Executor   │ ──▶ Orca (ou tmux)
                │               │   ┌────────────────┐    │             │
   Teams    ──▶ │  (futuro)     ├──▶│    DOMÍNIO     │◀───┤  Cofre      │ ──▶ Keychain / arquivo cifrado
                │               │   │ regras, estados│    │             │
 Funifier PM ─▶ │  GestorTasks  ┘   │ transições     │    └  Repositório│ ──▶ SQLite (Prisma no futuro)
   Bnexo   ──▶  │                   └────────────────┘                  │
                └────────────────────────────────────────────────────────┘
```

"Hexagonal" é só o desenho: um hexágono no meio com várias "tomadas" ao redor. O número de lados não importa. O nome mais descritivo é **Portas e Adaptadores** (*Ports and Adapters*).

### Vocabulário

| Termo | O que é | Analogia | No hub |
|---|---|---|---|
| **Domínio** | As regras do negócio, sem saber de ferramentas | O motor do carro | `src/dominio/`: `classificarTela`, `podeTransicionar`, `acaoValida` |
| **Porta** | Uma `interface` TypeScript que diz *o que* o domínio precisa | A tomada da parede | `PmAdapter` (já existe), `Executor`, `Cofre`, `Notificador` |
| **Adaptador** | Uma `class` que implementa a porta usando uma ferramenta real | O plugue de cada aparelho | `FunifierPmAdapter`, `BnexoAdapter`, `OrcaExecutor`, `TelegramNotificador` |
| **Raiz de composição** (`main.ts`) | O único lugar que cria os adaptadores concretos e entrega para quem usa | O quadro de luz da casa | Hoje é o `index.ts`, ainda incompleto |
| **Injeção de dependência** | Passar o adaptador pelo construtor em vez de criar dentro | Ligar o aparelho na tomada em vez de soldar no fio | `new Despachante({ executor, cofre, notificador })` |

### Você já usa isso: o `PmAdapter`

O exemplo mais claro já está no código, em `src/pm/types.ts`:

```ts
export interface PmAdapter {            // ← PORTA: o que o hub precisa de uma ferramenta de gestão
  listMyTasks(): Promise<Task[]>;
  getTask(id: string): Promise<TaskDetalhe>;
  setStatus(id: string, status: StatusHub): Promise<void>;
  comment(id: string, texto: string): Promise<void>;
}
```

`FunifierPmAdapter` e `BnexoAdapter` são dois **adaptadores** da mesma porta. O resto do hub chama `adapter.listMyTasks()` sem saber se é o PM ou o Bnexo. É por isso que, para adicionar o Jira (D-A16), basta um `JiraAdapter`. Nada mais muda.

A etapa 1 faz **a mesma coisa** com as outras três fronteiras.

### As portas novas

**`Executor`: onde as sessões do Claude rodam.**

```ts
interface Executor {
  pronto(): Promise<boolean>;                                  // o Orca subiu?
  abrirSessao(pasta: string, prompt: string): Promise<Sessao>; // cria worktree + terminal + claude
  lerTela(s: Sessao, linhas: number): Promise<string>;         // o que classificarTela vai analisar
  enviar(s: Sessao, texto: string): Promise<void>;             // responder a uma pergunta do agente
  encerrar(s: Sessao): Promise<void>;
}
```

- Adaptador de hoje: `OrcaExecutor`, que embrulha o `orca.ts` atual (execFile, `--json`).
- Adaptador reserva: `TmuxExecutor`, se o Orca headless falhar no servidor (D-A3 ficou com o Orca, mas a porta deixa a saída aberta).
- Adaptador de teste: `ExecutorFalso`, que devolve telas de `tests/dominio/telas.ts`. Com ele, dá para testar o despacho inteiro sem Orca.

**`Cofre`: onde ficam os segredos** (detalhes na seção 2).

```ts
interface Cofre {
  obter(id: string): Promise<Credencial | null>;
  salvar(id: string, c: Credencial): Promise<void>;
  remover(id: string): Promise<void>;
  listar(): Promise<{ id: string; criadoEm: string }[]>; // nunca devolve valores
}
```

Adaptadores: `CofreKeychain` (Mac), `CofreArquivoCifrado` (servidor) e `CofreMemoria` (testes).

**`Notificador`: como o hub fala com o usuário.**

```ts
interface Notificador {
  avisar(texto: string, botoes?: Botao[]): Promise<void>;
  perguntar(texto: string, opcoes: Botao[]): Promise<string>;
}
```

Adaptadores: `TelegramNotificador` hoje e `TeamsNotificador` depois (D-A10).

> **Cuidado com exagero.** O Telegram é também a *entrada* dos comandos (o grammY recebe `/tasks`, botões etc.), não só a saída. Na etapa 1 só a **saída** (avisos do despacho) vira porta. A entrada continua no `telegram.ts`/`fluxo.ts` e vira porta na etapa 2, com o Teams. Isso segue a D-A9: refatorar o mínimo para hospedar.

### O que é o `main.ts`

Hoje o `index.ts` já faz parte disso: cria o `Orca`, os `PmAdapter` e o banco, e entrega para o `createBot`. Mas ainda há escolhas concretas escondidas dentro dos módulos. Por exemplo, o `despacho.ts` importa `escreverCredenciaisDaTask` direto de `segredos.ts`, e por isso não há como trocar o cofre.

O `main.ts` é o **único arquivo que conhece as classes concretas**:

```ts
// main.ts: a raiz de composição. Só aqui aparece "Keychain", "Orca", "Telegram".
const env = loadEnv();
const cofre = env.HUB_MODO === 'servidor' ? new CofreArquivoCifrado(caminhos.segredos) : new CofreKeychain();
const executor = new OrcaExecutor(env.ORCA_BIN);
const notificador = new TelegramNotificador(bot, env.TELEGRAM_CHAT_ID);
const despachante = new Despachante({ db, executor, cofre, notificador, adapters });
```

E no teste:

```ts
const despachante = new Despachante({ db: bancoEmMemoria(), executor: new ExecutorFalso(telas), cofre: new CofreMemoria(), notificador: new NotificadorFalso() });
```

**A regra para reconhecer:** se um arquivo fora do `main.ts` faz `new Orca(...)` ou importa `segredos.ts` diretamente, a fronteira ainda não está fechada.

### Perguntas para fixar
1. Por que o `ExecutorFalso` só é possível depois que o `Executor` vira porta?
2. Se amanhã trocarmos SQLite por Prisma (D-A13), qual porta isola essa troca?
3. Onde fica a decisão "no servidor uso arquivo cifrado, no Mac uso Keychain"? Por que só lá?

---

## 2. Cofre cifrado e broker

São **duas peças diferentes** que resolvem **dois problemas diferentes**. A confusão costuma vir de pensar que são uma coisa só.

### O problema: onde estão as credenciais hoje

As credenciais das gamificações (API key + secret) dão **poder total no backend daquela gamificação, inclusive em produção**. Hoje elas fazem este caminho:

```
Telegram ──▶ data/segredos/gamificacoes.json ──▶ runs/<id>/credenciais.json ──▶ sessão do Claude lê o arquivo
             (texto puro, 600)                    (cópia por task, 600)          ──▶ a chave entra no CONTEXTO do agente
                                                                                 ──▶ fica gravada em ~/.claude/projects/*.jsonl
```

Na verificação de [segurança e dados](../v2/seguranca-e-dados.md), **os valores do cofre já foram encontrados nos históricos das sessões do Claude**. São dois furos:

| Furo | Onde | Quem resolve |
|---|---|---|
| A. O arquivo está **legível** no disco | `gamificacoes.json` em texto puro | **Cofre cifrado** |
| B. O **agente vê** a chave e ela se espalha (históricos, backups, Time Machine, logs) | `credenciais.json` lido pela sessão | **Broker** |

Cifrar o arquivo resolve A, mas **não resolve B**. Assim que o hub decifra a chave e entrega para o agente, ela vaza do mesmo jeito. Por isso precisamos das duas peças.

### Peça 1: o cofre cifrado (guardar)

**Analogia:** um cofre de banco. O conteúdo fica trancado, e a chave do cofre **não fica colada na porta**.

Como funciona no servidor (`CofreArquivoCifrado`):

```
              chave-mestra (32 bytes aleatórios)
              guardada FORA do arquivo do cofre
                         │
gamificacoes.json  ──AES-256-GCM──▶  data/segredos/cofre.enc  (ilegível sem a chave)
 (texto puro)                         + "nonce" e "tag" de integridade
```

- **AES-256-GCM** é o algoritmo de cifragem padrão de mercado. Ele já vem no Node (`node:crypto`), sem biblioteca extra. O "GCM" também detecta adulteração: se alguém mexer em um byte do arquivo, a decifragem falha em vez de devolver lixo.
- **Onde fica a chave-mestra:** se ela ficasse num arquivo ao lado do cofre, seria como guardar a senha do cofre dentro dele. No servidor usamos o **`systemd-creds`**: o systemd cifra a chave com uma chave da própria máquina e só a entrega ao processo do hub quando ele sobe. Ela aparece num diretório temporário em memória, visível apenas para aquele serviço.
- **No Mac:** o Keychain já é um cofre pronto, protegido pela sua senha de login e pelo chip de segurança. O `CofreKeychain` só guarda e lê itens nele (com o comando `security` do macOS).

**O que o cofre protege, e o que não protege** (honestidade importa aqui):

| Cenário | Protegido? |
|---|---|
| Alguém copia o disco, um snapshot ou um backup do `data/` | ✅ Vê só o arquivo cifrado |
| O arquivo vai parar num commit, num `scp` errado ou num anexo | ✅ Ilegível |
| Alguém tem acesso **root** à VM **ligada** | ❌ Consegue extrair a chave do processo. A proteção aqui é não deixar ninguém chegar à VM (seção 3) |
| O agente lê a credencial | ❌ Não é problema do cofre. É o broker que resolve |

### Peça 2: o broker (usar)

**Analogia:** o caixa do banco. Você pede "saque R$100 da conta X". O caixa confere se você pode, abre o cofre, faz a operação e te entrega o resultado. **Você nunca segura a chave do cofre.**

```
v1:  hub ──credenciais.json──▶ agente ──API key + secret──▶ Funifier
                               (o agente TEM a chave)

v2:  hub ─"pode usar eTIP-dev"─▶ agente ──tool call: funifier.consultar("eTIP-dev", "/players")──▶ BROKER ──chave──▶ Funifier
                                 (o agente só PEDE)                                                (tem a chave, decide)
```

Como ele se encaixa tecnicamente:

- O broker é um **servidor MCP** (o mesmo protocolo das tools do PM e do Bnexo que o hub já usa como *cliente*). Agora o hub também é *servidor*.
- No despacho, o hub registra o broker **só na sessão daquela task**. O agente enxerga tools como `funifier_consultar`, `funifier_alterar` e `funifier_apagar`, mas não enxerga nenhuma chave.
- A cada chamada, o broker:
  1. confere se a gamificação está **autorizada nessa task** (é a mesma seleção que hoje decide o que vai no `credenciais.json`);
  2. classifica a operação em **leitura / escrita / destrutiva**. As destrutivas ficam bloqueadas por padrão;
  3. se for **produção**, pede confirmação no Telegram;
  4. pega a chave no cofre, **só em memória**, e faz a chamada;
  5. grava um **log de auditoria** (task, gamificação, operação, resultado), sem segredos.
- No **Encerrar**, a autorização da task expira junto.

**Ainda falta investigar** (está no plano como item 1.2):
- Como a API da Funifier autentica. Se ela trocar API key + secret por um **token de curta duração**, o broker guarda só esse token.
- Se o MCP de gamificação que as sessões usam hoje pode ser **embrulhado** pelo broker, ou se o broker fala direto com a API REST.

### Perguntas para fixar
1. Se cifrarmos o cofre mas mantivermos o `credenciais.json`, a chave continua indo para os históricos do Claude? Por quê?
2. Por que a chave-mestra não pode ficar em `data/segredos/chave`?
3. Em qual etapa do broker entra a regra "produção pede confirmação no Telegram"?

### Decisão em aberto
- **Rotação das 3 credenciais atuais:** já estão nos históricos. O plano é trocar antes da virada para o servidor.

---

## 3. Tailscale: por que existe

### O problema

O servidor da Oracle fica na internet. Para usar o hub, **três coisas precisam chegar até ele**:

1. o **Orca do Mac e do celular**, para ver e usar as sessões;
2. **você, por SSH**, para administrar a máquina;
3. o **GitHub Actions**, para o deploy automático.

O jeito "clássico" é abrir portas no firewall (22 para SSH, 6768 para o Orca) para a internet inteira. Assim, **qualquer pessoa do mundo pode bater na porta**. Robôs fazem varredura de IPs da Oracle e da AWS o tempo todo, tentando senhas e explorando falhas. Um servidor novo com a porta 22 aberta recebe tentativas de login **em minutos**.

### O que o Tailscale faz

Ele cria uma **rede privada só sua** (a *tailnet*) entre os seus aparelhos, onde quer que eles estejam:

```
                         INTERNET (portas FECHADAS para o mundo)
   ┌───────────────────────────────────────────────────────────────────┐
   │                                                                   │
   │   Mac 100.88.138.47 ◀═══╗                  ╔═══▶ hub-cloud 100.x  │
   │                         ╠═══ tailnet ══════╣    (VM da Oracle)    │
   │   iPhone 100.65.221.83 ◀╝   (cifrada,      ╚═══▶ GitHub Actions   │
   │                              WireGuard)          (só no deploy)   │
   └───────────────────────────────────────────────────────────────────┘
```

- Cada aparelho ganha um **IP fixo `100.x.y.z`** e um nome (`hub-cloud.tailc93381.ts.net`). Esse IP funciona igual no Wi-Fi de casa, no 4G ou num café.
- O tráfego é **cifrado de ponta a ponta** (protocolo WireGuard).
- Só entram aparelhos **logados na sua conta**. Um estranho nem consegue ver que o servidor existe.
- Funciona atrás de NAT e sem IP fixo: o celular no 4G alcança a VM sem configurar roteador.

**Analogia:** em vez de deixar a porta da casa aberta para a rua e contar com a fechadura, você constrói um **corredor privado** que liga só as suas casas. A porta para a rua fica emparedada.

Na prática, por causa do Tailscale:
- **Fechamos a porta 22** para a internet depois da configuração inicial. O SSH passa a ser só `ssh hub@hub-cloud`, pela tailnet.
- O **Orca** escuta só no IP do Tailscale (`--pairing-address 100.x`). O pareamento do celular só funciona de dentro da tailnet.
- O **deploy** do GitHub entra na tailnet por alguns segundos, com uma tag `tag:ci` que só pode falar com o servidor, e sai em seguida.

### E a relação com o cofre?

**Nenhuma relação direta.** São camadas diferentes de segurança, cada uma fechando uma porta diferente:

| Camada | Pergunta que responde | Peça |
|---|---|---|
| Rede | **Quem consegue chegar** ao servidor? | Tailscale |
| Disco | Se alguém pegar os arquivos, **consegue ler** os segredos? | Cofre cifrado |
| Agente | O **agente** consegue ver ou espalhar os segredos? | Broker |

A relação é indireta: a tabela da seção 2 mostrou que o cofre **não protege** contra alguém com root na VM ligada. Quem diminui essa chance é o Tailscale, porque ninguém de fora chega até a VM. Uma camada cobre o ponto fraco da outra. Isso se chama **defesa em profundidade**.

### Perguntas para fixar
1. Depois de fechar a porta 22, como você entra na VM se o Tailscale cair? (Resposta no [plano de execução](../hospedagem/plano-execucao.md): o console serial ou o Run Command da Oracle.)
2. Por que o deploy usa uma tag `tag:ci` em vez da sua conta?

---

## 4. Caminhos configuráveis

### O problema

O hub supõe que está no **seu Mac**. Estes caminhos estão fixos no código e na configuração:

| Onde | Caminho fixo | No servidor seria |
|---|---|---|
| `apps.yaml` | `pasta: /Users/joaopedro/Documents/DAC/vista` | `/home/hub/repos/DAC/vista` |
| `fluxo.ts:803` | `homedir()/Documents/DAC` ou `FUNIFIER` | `/home/hub/repos/...` |
| `config.ts` | `ORCA_BIN` = `/Applications/Orca.app/...` | `/usr/bin/orca` (ou onde o pacote instalar) |
| `config.ts` | `ROOT` = pasta do código; `data/`, `runs/` e `logs/` ficam dentro dela | Separar código de dados: `/home/hub/app` (código, trocado a cada deploy) e `/home/hub/dados` (banco, cofre, runs; preservados) |
| `despacho.ts:42` | `~/.claude/projects` | Igual, mas na home do usuário `hub` |

O ponto mais importante é a **separação entre código e dados**. O deploy automático faz `git checkout` de uma versão nova. Se o banco e o cofre estiverem dentro da pasta do código, um deploy mal feito apaga ou sobrescreve dados.

### A solução
- Variáveis no `.env`: `HUB_DADOS_DIR` (banco, cofre, runs, logs) e `HUB_REPOS_DIR` (onde ficam os clones).
- No `apps.yaml`, `pasta` passa a aceitar caminho **relativo**: `DAC/vista` é resolvido contra `HUB_REPOS_DIR`. O caminho absoluto continua funcionando, então a v1 não quebra.
- Um módulo `caminhos.ts` centraliza tudo. Nenhum outro arquivo monta caminho com `homedir()` ou `ROOT`.

### Pergunta para fixar
1. Por que manter suporte a caminho absoluto no `apps.yaml` em vez de só trocar para relativo?

---

## 5. Subir e se recuperar sozinho (a Fase 7)

### O problema

No Mac, você abre o Orca e roda `npm start`. Se o hub cair, você percebe e liga de novo. No servidor **não tem ninguém olhando**. É preciso:

1. **Ligar no boot** da VM.
2. **Religar se travar ou cair.**
3. **Esperar o Orca** estar pronto antes de despachar (hoje o hub supõe que o Orca já está aberto).
4. **Avisar** "Hub online" quando sobe, para você saber que houve reinício.
5. Alguém **de fora** perceber se a VM inteira morrer. Se a máquina cair, ela não consegue avisar que caiu.

### As peças

**systemd** é o "gerente de serviços" do Linux, o equivalente ao LaunchAgent do Mac. Um arquivo de serviço diz como rodar o hub:

```ini
# ~/.config/systemd/user/hub.service
[Unit]
Description=Hub de Tasks
After=network-online.target orca.service   # sobe depois da rede e do Orca
Requires=orca.service

[Service]
WorkingDirectory=/home/hub/app
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure          # caiu? religa
RestartSec=10
LoadCredentialEncrypted=cofre-chave:/home/hub/dados/cofre-chave.cred   # chave-mestra do cofre (seção 2)

[Install]
WantedBy=default.target
```

O Orca headless vira **outro serviço** (`orca.service`), e o hub depende dele.

**Espera do Orca:** na subida, o hub chama `executor.pronto()` (hoje é `orca status`) em laço, com limite de tempo, antes de abrir a fila de despacho.

**"Hub online":** ao subir, a mensagem no Telegram inclui a versão (o SHA do deploy) e o motivo provável (boot, deploy ou queda). Assim você vê no celular quando um deploy entrou.

**Heartbeat (batimento):** para o caso 5, o hub faz um ping a cada poucos minutos para um serviço **externo** (por exemplo, o Healthchecks.io, que tem plano gratuito). Se os pings param, **o serviço externo te avisa** por e-mail ou Telegram. Quem vigia precisa estar fora da máquina vigiada.

### Decisão em aberto
- **Heartbeat:** Healthchecks.io (grátis, externo) ou algo próprio? Recomendação: Healthchecks.io.

### Pergunta para fixar
1. Por que o `Restart=on-failure` do systemd não resolve o caso "a VM inteira caiu"?

---

## 6. `/pm_login` pelo Telegram

### O problema

O Funifier PM usa **OAuth**. Hoje o login funciona assim:

1. O hub abre o navegador do Mac na página de login do PM.
2. Você faz login, e o PM redireciona para `http://localhost:53682/callback?code=XYZ`.
3. O hub, rodando no **mesmo Mac**, está escutando a porta 53682, recebe o `code` e troca por um token.

No servidor, o passo 3 quebra. Você faz login no **celular**, e o `localhost` do celular **não é** o servidor. O navegador mostra "página não encontrada".

### A solução

A página dá erro, mas **o `code` está na barra de endereço**. Então:

1. Você manda `/pm_login` no Telegram. O hub responde com o link de login.
2. Você faz login no celular e cai na página de erro `localhost:53682/callback?code=...`.
3. Você **copia a URL inteira** e cola no Telegram.
4. O hub extrai o `code` e troca por um token.

**Por que isso é seguro: o PKCE.** Quando o hub gera o link de login, ele cria um segredo aleatório (o *verifier*) que **nunca sai do hub**. O link leva só uma impressão digital dele. Na troca do `code` por token, o PM exige o verifier original. Então, mesmo que alguém veja o `code` (no histórico do Telegram, por exemplo), não consegue usá-lo sem o verifier. Além disso, o `code` expira em poucos minutos e só pode ser usado uma vez.

> Esse fluxo **não** é o "credenciais pelo Telegram" que a C2 de segurança quer evitar. O que passa pelo chat é um código de uso único, inútil sem o verifier. A chave de verdade nunca passa.

### Pergunta para fixar
1. Se alguém interceptar a URL que você colou, por que ainda assim não consegue logar como você?

---

## 7. Script de preparação da VM, e Docker

### O que o script faz

Uma VM nova é um Ubuntu "pelado". O script `deploy/preparar-vm.sh` transforma essa máquina num servidor do hub, numa única execução:

| Passo | O quê | Por quê |
|---|---|---|
| 1 | Atualizar o sistema e ativar **atualizações automáticas de segurança** (`unattended-upgrades`) | Ninguém vai lembrar de atualizar |
| 2 | Criar **swap** (memória extra em disco) | Várias sessões do Claude juntas podem estourar a RAM. Com swap, a máquina fica lenta em vez de matar processos |
| 3 | Criar o usuário **`hub`** sem senha e sem sudo | O hub não roda como `ubuntu` nem como root. Se ele for comprometido, o estrago fica limitado |
| 4 | Instalar **Tailscale** e entrar na tailnet como `hub-cloud` | Seção 3 |
| 5 | Configurar o **firewall** (`ufw`): bloquear tudo de fora, liberar a tailnet | Seção 3 |
| 6 | Instalar **Node 22, git, Claude Code, Orca e Xvfb** (tela virtual para o Orca) | O que o hub e as sessões precisam |
| 7 | Clonar o hub em `/home/hub/app` e criar `/home/hub/dados` | Seção 4 |
| 8 | Instalar os serviços **systemd** (`orca.service`, `hub.service`) | Seção 5 |
| 9 | Restringir a chave SSH do deploy ao comando `atualizar.sh` | O GitHub só consegue fazer o deploy, não abrir um shell |

O script é **idempotente**: rodar duas vezes dá o mesmo resultado que rodar uma, e cada passo confere se já foi feito. Assim ele também serve para consertar uma máquina que ficou pela metade.

Alguns passos **o script não faz**, porque exigem você: `tailscale up` (login), `claude login` e o pareamento do Orca.

### "É como um Dockerfile?"

Parecido na intenção (descrever o ambiente em código, em vez de configurar à mão), mas resolve **outra camada**:

| | Script de preparação | Dockerfile |
|---|---|---|
| Configura | **A máquina inteira**: usuários, firewall, swap, Tailscale, serviços do sistema | **Uma caixa isolada** (container) dentro da máquina, com só o que a aplicação precisa |
| Roda | Uma vez por máquina | Gera uma imagem que roda em qualquer lugar com Docker |
| Exemplo | "Feche a porta 22" | "Instale o Node e copie o código" |

Mesmo usando Docker, **ainda precisaríamos do script**: um container não configura firewall, swap, Tailscale ou atualizações do sistema por fora dele.

### Vale colocar o hub no Docker?

**Recomendação: agora não.** Talvez na etapa 2, só para o hub.

Por que não agora: o hub não é uma aplicação comum. Ele **comanda outras ferramentas que vivem na máquina**.
- O **Orca** é um aplicativo de desktop (Electron) que precisa de tela virtual, abre terminais e cria worktrees nos repositórios. Rodá-lo num container é possível, mas é a parte mais frágil do projeto, e ainda nem validamos o Orca headless *sem* container (teste T4).
- As **sessões do Claude** rodam `git`, `npm`, testes e builds dos projetos da DAC e da Funifier. Num container, cada projeto precisaria das suas ferramentas dentro da imagem, e os repositórios, o `~/.claude` e o cofre virariam volumes montados.
- Os **ganhos** do Docker (rodar igual em qualquer máquina, isolar dependências) importam pouco para **uma VM dedicada a uma única coisa**. A própria VM já é o isolamento.

Quando faria sentido: no **app universal** (Parte B), para distribuir o hub para outros colaboradores, ou se um dia o hub e o Orca rodarem em máquinas separadas. Fica registrado como possibilidade da etapa 2.

### Pergunta para fixar
1. Cite duas coisas do script que um Dockerfile não conseguiria fazer.

### Decisão em aberto
- **Docker:** recomendação é não usar na etapa 1. Precisa da sua confirmação.

---

## 8. Orca em modo servidor no Mac

### Os dois "jeitos" do Orca

O Orca tem duas partes:

```
┌──────────── Orca ────────────┐
│  INTERFACE  (janela, abas,   │  ← o que você vê e clica
│              terminais)      │
│  RUNTIME    (worktrees,      │  ← o que de fato roda as sessões e responde à CLI `orca ... --json`
│              terminais, PTY) │
└──────────────────────────────┘
```

| Modo | Como liga | Runtime | Interface | Quem se conecta |
|---|---|---|---|---|
| **Desktop** (o de hoje) | Abrir o app | No Mac | No Mac | Só você, na janela; o hub, pela CLI |
| **Servidor** (`orca serve`) | Comando no terminal | Na máquina onde rodou | **Nenhuma**, sem janela (*headless*) | Clientes **remotos pareados**: o Orca desktop de outro computador e o app do celular |

No servidor da Oracle, o Orca vai rodar em modo **servidor**. O seu Mac e o seu celular deixam de *rodar* as sessões e passam a **assistir e interagir remotamente** com as sessões que rodam na VM. É isso que permite o celular funcionar com o Mac desligado (T14).

### Então por que rodar o modo servidor no Mac?

Para **ensaiar o servidor antes de ter o servidor**. O Mac faz o papel da VM:

```
Ensaio de hoje:    Mac rodando `orca serve` (finge ser a VM) ◀── tailnet ──  iPhone (app do Orca, pareado)
Depois:            VM rodando `orca serve`                   ◀── tailnet ──  iPhone + Orca desktop do Mac
```

O que o ensaio valida, sem depender do upgrade da Oracle:
- se o **pareamento por QR code** (`--mobile-pairing`) funciona pelo Tailscale;
- se o celular **vê e responde** uma sessão do Claude criada pelo servidor;
- se a CLI `orca ... --json`, que o hub usa, funciona igual no modo servidor;
- o que acontece quando a conexão cai e volta (4G ↔ Wi-Fi).

**O que o ensaio não valida:** rodar sem tela no Linux ARM (Xvfb), que é o teste T4 e só dá para fazer na VM.

**Cuidados:**
- Não sabemos ainda se o Orca desktop e o `orca serve` convivem na mesma máquina (mesma porta e mesmo perfil). O ensaio deve começar **com o app do Orca fechado** e com o **hub da v1 parado**, para não atrapalhar o hub que você usa no dia a dia. Descobrir isso faz parte do teste.
- O ensaio é feito numa pasta de teste (o `sandbox`), nunca nos repositórios das empresas.

### Pergunta para fixar
1. Qual teste do plano o ensaio no Mac **não** substitui, e por quê?

---

## Resumo: decisões que dependem de você

| Tema | Recomendação |
|---|---|
| Docker na etapa 1 | Não usar; reavaliar na etapa 2 para o app universal |
| Heartbeat externo | Healthchecks.io (grátis) |
| Rotação das 3 credenciais | Antes da virada para o servidor |
| Ordem de implementação | 4 (caminhos) → 1 (portas + `main.ts`) → 5 (systemd) → 7 (script) → 2 (cofre, depois broker) → 6 (`/pm_login`); o ensaio da seção 8 em paralelo |
