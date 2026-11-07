# Fundamentos: sistema operacional, rede e scripts (módulo 0)

Pedido do João (06/11/2026): "não tenho nenhum conhecimento em sistemas operacionais, protocolos de rede… esses
executáveis, esses scripts `.sh`, o que de fato eles montam, tudo isso é muito novo". Este módulo vem **antes** do
[roteiro da infra](infra-nuvem.md): explica as peças do zero e depois mostra o que cada script do hub monta.
Para revisar juntos, na ordem.

## Parte 1: as peças, do zero

### 1.1 Sistema operacional, processo e usuário

- **Sistema operacional** (macOS no Mac, Ubuntu Linux no servidor): o programa que manda na máquina. Decide quem
  pode ler cada arquivo, quanto de memória cada programa usa, quem fala com a rede.
- **Processo:** um programa rodando. O hub rodando é um processo (`node`); cada sessão do Claude é outro.
- **Usuário:** toda pessoa **e todo processo** pertence a um usuário. O processo só pode o que o usuário dele pode.
  No Mac, tudo é do `joaopedro`. No servidor existem `ubuntu` (você, administrador), `hub` (o hub) e `agente` (as
  sessões do Claude).
- **root e `sudo`:** `root` é o superusuário, pode tudo. `sudo <comando>` = "rode este comando como root" (ou como
  outro usuário, com `sudo -u hub`). Quem pode usar o `sudo`, e para quê, está no arquivo `sudoers`.
- **Permissões:** cada arquivo tem dono e diz quem lê, escreve e executa. `700` = só o dono; `750` = o dono tudo, o
  grupo lê. É assim que o `agente` não lê o cofre do `hub`.

### 1.2 Serviço, systemd e logs

- **Serviço:** um processo que roda sozinho, sem ninguém logado, e volta se cair. O hub e o Orca são serviços no
  servidor.
- **systemd:** o gerente de serviços do Linux. Cada serviço é descrito num arquivo de texto, a **unidade**
  (`/etc/systemd/system/hub.service`): que programa rodar, como qual usuário, com quais variáveis, o que fazer se cair.
- **Timer:** uma unidade que dispara outra de tempos em tempos (como um despertador). O deploy automático é um timer
  de 5 min.
- **journald / `journalctl`:** o caderno onde o systemd guarda tudo o que cada serviço escreve. É de onde vêm os logs.

| Comando | O que faz |
|---|---|
| `systemctl status hub.service` | Está rodando? |
| `systemctl restart hub.service` | Para e sobe de novo (relê o `.env`) |
| `systemctl cat hub.service` | Mostra o arquivo da unidade |
| `journalctl -u hub.service -n 50` | Últimas 50 linhas do log |
| `journalctl -u hub.service -f` | Log ao vivo (sai com Ctrl+C) |

### 1.3 Rede: IP, porta, protocolo

- **Endereço IP:** o "endereço da casa" de uma máquina na rede. A VM tem um IP público (internet) e um IP do
  Tailscale (`100.109.123.99`), que só existe na sua rede privada.
- **Porta:** a "porta da casa" por onde um programa atende. SSH atende na 22, o Orca na 6768, o broker na 7790.
- **Protocolo:** a "língua" da conversa numa porta. SSH, HTTP (sites), WebSocket (Orca).
- **Firewall:** o porteiro que decide que portas aceitam visitas e de onde. No servidor: **nada entra pela internet;
  pela rede do Tailscale, entra**.
- **`127.0.0.1` (localhost):** "a própria máquina". O broker escuta só ali: só programas da VM falam com ele.

### 1.4 SSH e chaves

- **SSH:** protocolo para entrar numa máquina e rodar comandos nela, com a conversa cifrada.
- **Par de chaves:** uma chave **privada** (`~/.ssh/oracle_hub`, fica só no Mac, como a chave de casa) e uma
  **pública** (`.pub`, fica no servidor, como a fechadura). Quem tem a privada entra.
- **Senha da chave e `ssh-agent`:** a chave privada tem senha. O `ssh-agent` guarda a chave destravada na memória;
  quando o Mac reinicia, ele esvazia (atrito A17). `ssh-add --apple-use-keychain` guarda a senha no Keychain.
- **`ssh servidor "comando"`:** entra, roda o comando e sai. `ssh -t` pede um terminal de verdade (para o `nano`);
  por isso ele não funciona com o `!` do Claude Code, só no app Terminal.

### 1.5 Tailscale

Uma rede privada (VPN) entre os seus aparelhos: Mac, iPhone e servidor se enxergam por IPs `100.x`, como se
estivessem na mesma casa, de qualquer lugar. **SSH é a chave da porta; o Tailscale é a rua privada até ela.**
Com a porta 22 fechada para a internet, só quem está na rua privada chega à porta. Prova de 06/11: com o Tailscale do
Mac desligado, o SSH deu "Operation timed out".

### 1.6 Script `.sh`

- **Script:** um arquivo de texto com comandos, um embaixo do outro, que o `bash` executa em ordem. É o que você
  digitaria à mão, escrito uma vez para não errar.
- `set -euo pipefail` no topo: para no primeiro erro, em vez de seguir quebrado.
- **Variável:** `APP=/home/hub/app` e depois `$APP`.
- **Heredoc (`<<EOF … EOF`):** um bloco de texto dentro do script. É como os scripts do hub **escrevem arquivos**
  (as unidades do systemd, por exemplo). Por isso o `hub.service` não está no repositório: o
  `deploy/preparar-vm.sh` o escreve na VM.
- **Idempotente:** pode rodar de novo sem estragar; só faz o que falta.

### 1.7 Como funciona um comando como `hub init` (ou `npm create vite`)

Pergunta do João (06/11): o que acontece por baixo dos panos quando se digita um comando desses?

1. **O terminal procura o programa.** Ao digitar `hub`, o shell (zsh no Mac) procura um arquivo executável chamado
   `hub` nas pastas listadas no `PATH` (ex.: `/opt/homebrew/bin`). Achou, executa. Não achou: "command not found".
2. **Como o `hub` chega ao `PATH`.** No `package.json` do projeto, o campo `"bin": { "hub": "dist/cli.js" }` diz
   "este pacote tem um comando chamado hub". Ao instalar (`npm install -g hub-tasks` ou `brew install`), o
   instalador cria um atalho `hub` numa pasta do `PATH` apontando para esse arquivo.
3. **O arquivo começa com um *shebang*:** `#!/usr/bin/env node`, a primeira linha que diz "rode isto com o Node".
4. **O resto da linha são argumentos.** Em `hub init --modo servidor`, o programa recebe `["init", "--modo",
   "servidor"]` e decide o que fazer: `init` chama o assistente; `diagnostico` chama o diagnóstico.
5. **`npx` e `npm create`** fazem os passos 2 e 3 sem instalar de vez: baixam o pacote, rodam o `bin` dele e
   descartam. `npm create vite` = `npx create-vite`.
6. **A conversa no terminal.** O programa escreve perguntas na tela (saída) e lê o que a pessoa digita (entrada).
   Bibliotecas como `@clack/prompts` desenham menus, caixas de seleção e campos de senha que não mostram o que se digita.
7. **Links e QR codes no terminal.** Um link é só texto; o programa pode também abrir o navegador (`open <link>` no
   Mac). Um QR code é desenhado com caracteres de bloco (█ ▀ ▄), que o celular lê direto da tela.
8. **Lembrar onde parou.** O assistente grava o progresso num arquivo (ex.: `configuracao.json`). Rodar de novo lê
   esse arquivo e continua do primeiro passo que falta.
9. **Fazer o trabalho.** Cada passo é código comum: chamar o Orca, o git, o `tailscale`, gravar o `.env`, o cofre e
   o `apps.yaml`, criar o serviço. É o que hoje fazemos à mão, ou pelos scripts `.sh`, juntado num programa só.
10. **Sair com um código.** `0` = deu certo; outro número = erro. É assim que scripts e o CI sabem se algo falhou.

## Parte 2: o que cada script do hub monta

| Script | Onde roda | O que monta |
|---|---|---|
| `deploy/oracle-criar-vm.sh` | Cloud Shell da Oracle | A rede e a VM ARM grátis, tentando de novo até haver vaga (A2) |
| `deploy/preparar-vm.sh` | Na VM, com `sudo`, uma vez | Tudo o que está dentro da VM (abaixo) |
| `deploy/migrar-do-mac.sh` | No Mac | Copia os projetos e os históricos do Claude do Mac para o servidor |
| `deploy/atualizar.sh` | Na VM, pelo timer, a cada 5 min | O deploy automático: baixa o commit com CI verde, confere e troca |

**`preparar-vm.sh`, passo a passo** (cada `passo "…"` no script):

| # | Passo | O que muda na VM |
|---|---|---|
| 1 | Pacotes e atualizações de segurança | Instala git, firewall, ferramentas; o Ubuntu se atualiza sozinho |
| 2 | Swap de 4 GB | Memória de reserva no disco, para várias sessões não estourarem a RAM |
| 3 | Node 22 | O motor que roda o hub (TypeScript) |
| 4 | Usuários `hub` e `agente` | Os dois usuários, as pastas e quem lê o quê (pergunta 1 da parte 3) |
| 5 | Tailscale | Instala a rede privada |
| 6 | Firewall | Fecha tudo que vem da internet; libera o Tailscale |
| 7 | Orca | Instala o Orca, conferindo que o arquivo é o oficial (sha512) |
| 8 | Ajudante "pasta confiável" | Evita o Claude parar em "Do you trust this folder?" |
| 9 | Claude Code do `agente` | Instala o Claude e liga o modo `auto` |
| 10 | `orca.service` | O Orca como serviço, rodando como `agente` |
| 11 | Pareamento hub → Orca | O hub vira "cliente" do Orca do agente, como o seu celular |
| 12 | Cofre | Cria a chave-mestra, cifrada pelo `systemd-creds` |
| 13 | Broker | Registra o MCP "hub" no Claude do `agente`, com o token |
| 14 | `hub.service` | O hub como serviço, como `hub`, com as variáveis e a chave do cofre |
| 15 | `hub-atualizar.timer` | O deploy automático a cada 5 min |
| 16 | "Falta o que exige você" | Lista o que só uma pessoa faz: `tailscale up`, login do Claude, `.env`, pareamento |

## Parte 3: perguntas do João, para revisar

Respostas dadas no chat em 06/11; revisar com calma, com a VM de ensaio (Lima) aberta.

1. O que é a "persona" `agente`, o que foi dividido no servidor e por quê? Como `hub` e `agente` se comunicam se
   estão isolados? (os 5 "guichês": Orca pareado, pasta de prompts, broker, leitura dos históricos, git via `sudo`)
2. Como o mesmo código roda no Mac e no servidor? (as variáveis `HUB_*` e o `main.ts` escolhendo as peças)
3. Onde ficam as credenciais? Por que não no banco? Por que criptografia e não hash? (AES-256-GCM, chave-mestra,
   `systemd-creds`)
4. Quem de fato chama a Funifier e como a sessão usa sem ver a chave? (o broker abre o `funifier-mcp` como `hub`)
5. Qual o papel do systemd? O que significa "rodar como agente"?
6. Se a conexão é por SSH, por que o Tailscale?
7. O que é o `hub.service` e por que ele não está no repositório?
8. O que faz `journalctl -u hub.service -f`?
9. Como funciona por baixo dos panos um comando como `hub init`? (seção 1.7)

## Depois deste módulo

O [roteiro da infra](infra-nuvem.md) (15 tópicos, com exercícios) e o estudo da [etapa 1](etapa-1.md).
