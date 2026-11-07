# Desenho do onboarding (`hub init`)

Proposta para o João revisar antes do código (06/11/2026). Parte das decisões O1–O15 do
[app universal](app-universal.md#3-onboarding-hub-init) e dos atritos [A1–A17](servidor.md#atritos-a1a17).
**Em aberto** está marcado com 🟡.

## 1. As duas peças

| Peça | Para quem | O que faz |
|---|---|---|
| Pasta **`instalacao/`** (raiz do repositório) | O usuário e o Claude Code dele | Pré-requisitos que se instalam à mão e o guia de cada modo. Termina em "rode `hub init`" |
| Comando **`hub`** (terminal) | O usuário | Configura tudo o que não é pré-requisito, amarrando as pontas sozinho |

**`instalacao/`, os arquivos:**

| Arquivo | Conteúdo |
|---|---|
| `README.md` | Comece aqui: o que é o hub, qual modo escolher, a ordem de leitura |
| `pre-requisitos.md` | Node 22, git, Orca, Claude Code (e Tailscale só no modo servidor): link, comando, como conferir. Escrito para servir de instrução ao Claude Code do usuário |
| `modo-local.md` | Do zero ao "Hub online" no Mac |
| `modo-servidor.md` | Requisitos da VPS (o hub não cria a VPS), Tailscale e o `hub init` no servidor |
| `migrar-para-servidor.md` | `hub migrar servidor`: do local para a VPS |
| `heartbeat.md` | Healthchecks.io (o guia do B24) e `hub adicionar heartbeat` |
| `prompts/` | Prompts prontos para o Claude Code do usuário (ex.: clonar os repositórios de um espaço) |
| `dicas.md` | Dúvidas comuns e o que aprendemos na construção (atritos A1–A17) |

## 2. Os comandos

| Comando | O que faz |
|---|---|
| `hub init` | A primeira configuração, no modo escolhido. Retoma do passo que falta |
| `hub adicionar github-workspace` | Um espaço novo (outra conta do GitHub) |
| `hub adicionar heartbeat` | Liga o Healthchecks.io |
| `hub migrar servidor` | Leva a instalação local para uma VPS |
| `hub diagnostico` | Confere cada peça e diz o próximo passo; é o que o Claude Code do usuário lê para ajudar |

Todos guardam o progresso em `configuracao.json` (✅/⬜ por passo) e podem rodar de novo sem estragar.

## 3. O modelo: espaços e projetos

Hoje o `apps.yaml` tem `empresa` (`funifier`/`dac`) fixa no código (I4). Passa a ser:

```yaml
modo: local                      # ou servidor
ferramentas: [funifier-pm, jira] # as escolhidas; login de cada uma no cofre
espacos:                         # um por conta do GitHub (O4)
  - id: funifier
    pasta: ~/Documents/FUNIFIER
    github: jp-funifier          # login do gh deste espaço, guardado à parte
    regras: funifier.md          # O14: arquivo, ou nenhuma
  - id: pessoal
    pasta: ~/Documents/PESSOAL
    github: jp-pessoal
    regras: nenhuma
projetos:                        # o de-para (o apps.yaml de hoje)
  - app: teensmart-app
    espaco: funifier
    pasta: teensmart-app         # dentro da pasta do espaço
    ferramentas: { funifier-pm: [<id do projeto>] }
    gamificacoes: [...]          # só se usa a Funifier
  - app: laboratorio
    espaco: pessoal
    pasta: laboratorio
    ferramentas: { jira: [<id>] }
    regras: laboratorio.md       # O14: regra própria, no lugar da do espaço
```

- **Conta certa em cada pasta (O5, O8).** Para cada espaço o `hub init` grava um arquivo de configuração do git que
  só vale dentro da pasta dele (`includeIf`): nome, e-mail e o login do `gh` daquele espaço como credencial do HTTPS.
  O hub abre cada sessão do Claude com o login do espaço (`GH_CONFIG_DIR`), então commit, push e PR saem com a conta
  certa. Sem chave SSH.
- **Gamificação obrigatória:** hoje vale para a "empresa funifier"; passa a valer para projeto ligado à Funifier.
- **Dados fora do código (I5):** no Mac, em `~/.hub/` (configuração, banco, logs, prompts); no servidor, como hoje.

## 4. O `hub init`, passo a passo

Cada passo confere de verdade antes de marcar ✅ e, se falhar, diz o próximo passo. Links aparecem no terminal com
QR code e, no Mac, abrem no navegador.

| # | Passo | O que acontece | Atrito que evita |
|---|---|---|---|
| 1 | Pré-requisitos | Confere Node, git, Orca e Claude Code (com login). Falta algo: aponta o trecho do `pre-requisitos.md` | — |
| 2 | Modo | Local ou servidor (O1) | — |
| 3 | Ferramentas de gestão | Marca quais usa (Funifier PM, Bnexo, Jira) e faz o login de cada uma: OAuth no navegador de verdade, ou token num campo escondido | A8 |
| 4 | Espaços | Para cada conta do GitHub: nome, pasta-mãe, login do `gh` (código + link + QR), nome e e-mail sugeridos pela conta, regras (modelo, nenhuma ou própria) | A16 |
| 5 | Repositórios | Mostra o prompt de `instalacao/prompts/` para o Claude Code do usuário clonar o que quiser no espaço certo (O7). Pasta sem repositório também vale. Depois, o hub acha as pastas novas sozinho | A12 |
| 6 | De-para | Lista os projetos de cada ferramenta e liga cada um a uma pasta, ou "depois, pelo Telegram" (B15) | A12, A13 |
| 7 | Telegram | Guia o BotFather (link + QR), recebe o token escondido, confere o bot e mostra `t.me/<bot>` + QR; o `/start` dá o chat id sozinho | A7, A10 |
| 8 | Orca | Confere o Orca aberto, o `--permission-mode auto` nos argumentos do Claude e a pasta confiável; pareamento do celular: relay (qualquer rede, recomendado) ou mesma Wi-Fi (O3), com QR | A11 |
| 9 | Serviço e cofre | Mac: LaunchAgent e Keychain. Servidor: systemd, cofre cifrado e cópia de recuperação da chave-mestra | A6 |
| 10 | Teste | "Hub online" no Telegram e uma task de exemplo no sandbox, de ponta a ponta | A14 |
| 11 | Fim | Checklist; se a Funifier foi escolhida, "cadastre as gamificações no `/gamificacoes`" (O9); heartbeat opcional | — |

**Depois, pelo Telegram (O6, O11):** ligar e desligar ferramentas e projetos, de-para, gamificações, regras.

## 5. Em aberto 🟡

| # | Pergunta | Recomendação |
|---|---|---|
| Q1 | No modo servidor, onde roda o `hub init`? | No próprio servidor, por SSH, depois do `preparar-vm.sh`: mesmo programa, mesmos passos. Orquestrar a VPS a partir do Mac fica para depois |
| Q2 | Como o colega instala o comando `hub` no piloto? | `npm install -g` direto do GitHub; Homebrew depois (D-A19) |
| Q3 | Dá para o `hub init` gravar os argumentos do Claude no Orca e parear por QR sozinho? | Verificar na CLI do Orca; se não der, o passo mostra onde clicar e confere depois |
| Q4 | O relay do Orca é cifrado de ponta a ponta? | Verificar antes de recomendá-lo como padrão (O3) |

## 6. Como testar do zero (O15)

- **Modo local:** uma **conta de usuário nova no macOS** (Ajustes → Usuários e Grupos). A pasta pessoal começa vazia:
  sem `~/.claude`, `~/.gitconfig`, `~/.hub`, Keychain nem configuração do Orca. Orca e Node continuam instalados para
  todas as contas, como o João pediu. Login com um bot de Telegram novo e contas de GitHub de teste. Nada da conta
  dele é tocado.
- **Modo servidor:** uma VM nova (Lima no Mac, ou outra na nuvem), seguindo `instalacao/modo-servidor.md`.
- **Migração:** depois do local, `hub migrar servidor` para essa VM.
- O que travar vira atrito novo (A18…) e ajuste no guia.

## 7. Ordem de construção

1. **B34:** espaços e projetos no lugar das empresas fixas; dados fora do código no Mac (I3, I4, I5).
2. **Comando `hub`** com `hub diagnostico` primeiro (é a base para conferir cada passo).
3. **`hub init`** (modo local), passos 1–11.
4. **B20:** a listagem igual à do PM.
5. **Pasta `instalacao/`** escrita junto com cada passo.
6. **Modo servidor e `hub migrar servidor`**.
7. **Teste do zero** (seção 6) e o piloto com um colega.
