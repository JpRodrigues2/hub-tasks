# Modo local: o hub neste Mac

## 1. Baixe o hub

No app **Terminal**:

```sh
cd ~/Documents
git clone -b v2 https://github.com/JpRodrigues2/hub-tasks.git hub
cd hub
npm install
```

O código fica em `~/Documents/hub`. A configuração e os dados ficam à parte, em `~/.hub`.

## 2. Rode o `hub init`

Ainda dentro da pasta `hub`:

```sh
./hub init
```

Ele guia 10 passos e confere cada um de verdade. Se você parar no meio (Ctrl+C) ou algo falhar, rode `./hub init` de
novo: ele continua do passo que falta.

| # | Passo | O que você faz | Tenha em mãos |
|---|---|---|---|
| 1 | Pré-requisitos | Nada, se estiver tudo instalado; o Orca é aberto sozinho | — |
| 2 | Onde roda | Escolhe "Neste Mac" | — |
| 3 | Ferramentas de gestão | Marca as que usa e faz o login de cada uma | Funifier PM: login no navegador. Bnexo: endereço e token do MCP. Jira: endereço do site, e-mail e API token (a página de criar abre sozinha) |
| 4 | Espaços | Para cada conta do GitHub: nome, pasta, login no navegador (com um código de 8 letras), nome e e-mail dos commits, regras de trabalho. Se o GitHub perguntar "Authenticate Git with your GitHub credentials?", responda **N**: o hub já faz isso só para a pasta do espaço | As senhas do GitHub |
| 5 | Repositórios | Cola no seu Claude Code o pedido que o hub copiou e diz quais repositórios quer | — |
| 6 | Projetos → pastas | Para cada projeto das ferramentas, escolhe a pasta (ou cria uma sem repositório, ou deixa para depois) | — |
| 7 | Telegram | Cria um bot no BotFather, cola o token e manda /start para ele | O celular com o Telegram |
| 8 | Orca e celular | Opcional: pareia o celular pelo Relay (qualquer rede) | O celular com o app do Orca |
| 9 | Serviço | Nada: o hub vira um serviço que sobe sozinho com o Mac | — |
| 10 | Teste | Acompanha uma task de teste no Orca e no Telegram | — |

**Os segredos** (tokens) são digitados em campos que não aparecem na tela e vão direto para `~/.hub/dados/.env`
(só o seu usuário lê). Nunca mande token pelo Telegram nem por chat.

## 3. Use

No Telegram, no bot que você criou:
- `/tarefas`: as suas tasks, um projeto por mensagem. Toque no número (`/t1`, `/t2`…) para marcar e depois em ▶️ Iniciar.
- `/nova <instruções>`: uma atividade avulsa, sem ferramenta de gestão.
- `/menu`: os outros comandos (status, projetos, regras, limpar…).

Na primeira task de cada projeto, o Claude pergunta se confia na pasta: o hub avisa no Telegram, e você responde
"Yes" no Orca (no Mac ou no celular). Só uma vez por pasta.

## Importante no modo local

- **O Mac precisa ficar ligado e acordado** para as tasks rodarem. Em Ajustes → Bateria (ou Energia), evite que ele
  durma com a tampa aberta e carregador ligado.
- **O Orca precisa estar aberto.**
- Para conferir tudo a qualquer momento: `./hub diagnostico`.

## Comandos do terminal

Sempre de dentro da pasta `hub`:

| Comando | O que faz |
|---|---|
| `./hub init` | Configura (ou continua a configuração) |
| `./hub init --refazer <passo>` | Refaz a partir de um passo: `ferramentas`, `espacos`, `repositorios`, `depara`, `telegram`, `orca`, `servico`, `teste` |
| `./hub diagnostico` | Confere cada peça e diz o próximo passo de cada problema |
| `./hub adicionar github-workspace` | Mais um espaço (outra conta do GitHub) |
| `./hub adicionar heartbeat` | Aviso se o hub cair ([heartbeat](heartbeat.md)) |
| `./hub desinstalar` | Tira o hub do Mac ([desinstalar](desinstalar.md)) |
