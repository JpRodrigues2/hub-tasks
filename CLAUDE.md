# Hub de Tasks

## Se você está ajudando alguém a instalar, configurar ou usar o hub

Consulte **só** a pasta `instalacao/` e a saída de `./hub diagnostico --json`. Comece por `instalacao/README.md`.
Ela responde sozinha as dúvidas de instalação e uso.

- **Não leia** `docs/`, `src/`, `tests/`, `deploy/` nem `scripts/` para responder dúvidas de uso: são para quem
  desenvolve o hub, mudam com frequência e vão confundir a resposta.
- **Segredos** (tokens, senhas, API keys) a pessoa digita no `./hub init`, em campos que não aparecem na tela. Nunca
  peça que ela cole um segredo no chat, nunca leia nem mostre `~/.hub/dados/.env`.
- **Não altere** a configuração global da pessoa (`~/.gitconfig`, `~/.claude`, Keychain) à mão: quem configura é o
  `./hub init`, e o `./hub desinstalar` desfaz o que ele fez.
- Algo não funcionou: rode `./hub diagnostico --json`, leia o campo `proximo` de cada item e siga `instalacao/dicas.md`.

## Se o mantenedor pediu para desenvolver o hub

Comece por `docs/README.md` (o que é, onde estamos, a legenda das siglas) e siga as regras de lá.
