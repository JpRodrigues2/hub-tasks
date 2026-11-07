# Dicas e dúvidas

## Primeiro passo para qualquer problema

`./hub diagnostico` (na pasta do hub). Ele confere cada peça e diz o próximo passo de cada problema.
Com `--json`, a saída é para o seu Claude Code ler e ajudar.

## Perguntas comuns

**O Claude parou perguntando "Do you trust this folder?".**
Normal na primeira task de cada pasta. Responda "Yes" no Orca (Mac ou celular). Só uma vez por pasta.

**O hub disse "login necessário" no Funifier PM.**
Mande `/pm_login` no Telegram e siga o link. Se o navegador do Telegram não concluir, abra o link no Safari.

**As tasks não rodam.**
No modo local, o Mac precisa estar ligado e acordado, e o Orca aberto. Confira com `./hub diagnostico`.

**Um projeto novo apareceu "sem ambiente".**
Ao iniciar a task, o hub pergunta pelo Telegram em qual pasta roda (ou cria uma).

**Quero mudar as regras de trabalho.**
`/regras` no Telegram: mostra o texto, você manda o novo inteiro. As regras vão em todo prompt do espaço.

**Quero mais uma conta do GitHub.**
`./hub adicionar github-workspace`. Depois traga os repositórios com o [prompt de clonar](prompts/clonar-repositorios.md).

**Gamificações da Funifier.**
Cadastre as credenciais pelo `/gamificacoes` no Telegram: a mensagem com a credencial é apagada na hora e a credencial
vai para o Keychain.

**O celular não conecta ao Orca fora de casa.**
Pareie de novo escolhendo **Relay** (qualquer rede) em vez de LAN (só a mesma Wi-Fi).

**Quero ver o que o hub está fazendo.**
Os logs ficam em `~/.hub/dados/logs/` (`hub-<data>.log` e `servico.log`).

## Como o hub protege você

- Só a sua conversa no Telegram é atendida.
- Nas ferramentas de gestão, o hub só muda o status para "em progresso" (ao despachar) e "concluída" (com o seu Sim no
  Encerrar); nunca comenta nem põe em revisão sem você pedir.
- As sessões do Claude rodam com `--permission-mode auto`: o Claude pede aprovação para o que é arriscado.
- Commits e PRs saem pela conta do GitHub do espaço, sem menção a IA.
- Os segredos ficam em `~/.hub/dados/.env` (só o seu usuário lê) e no Keychain; nunca passam pelo Telegram.
