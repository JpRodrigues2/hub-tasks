# Muxor

## Se você está ajudando alguém a instalar, configurar ou usar o Muxor

Consulte **só** a pasta `instalacao/` e a saída de `./muxor diagnostico --json`. Comece por `instalacao/README.md`.
Ela responde sozinha as dúvidas de instalação e uso.

- **Não leia** `docs/`, `src/`, `tests/`, `deploy/` nem `scripts/` para responder dúvidas de uso: são para quem
  desenvolve o Muxor, mudam com frequência e vão confundir a resposta.
- **Segredos** (tokens, senhas, API keys) a pessoa digita no `./muxor init`, em campos que não aparecem na tela. Nunca
  peça que ela cole um segredo no chat, nunca leia nem mostre `~/.muxor/dados/.env`.
- **Não altere** a configuração global da pessoa (`~/.gitconfig`, `~/.claude`, Keychain) à mão: quem configura é o
  `./muxor init`, e o `./muxor desinstalar` desfaz o que ele fez.
- Algo não funcionou: rode `./muxor diagnostico --json`, leia o campo `proximo` de cada item e siga `instalacao/dicas.md`.

## Se o mantenedor pediu para desenvolver o Muxor

Comece por `docs/README.md` (o que é, onde estamos, a legenda das siglas) e siga as regras de lá.
