---
name: instalar-hub
description: Instalar, configurar, desinstalar ou tirar dúvidas de uso do Hub de Tasks (hub init, Telegram, espaços do GitHub, ferramentas de gestão, Orca, celular, heartbeat). Use quando a pessoa pedir ajuda com a instalação ou com o uso do hub.
---

# Instalar e usar o Hub de Tasks

Responda só com o que está em `instalacao/` e na saída de `./hub diagnostico --json`. Não abra `docs/`, `src/`,
`tests/`, `deploy/` nem `scripts/`: são para quem desenvolve o hub.

| A pessoa quer | Leia |
|---|---|
| Começar do zero | `instalacao/README.md`, depois `instalacao/pre-requisitos.md` e `instalacao/modo-local.md` |
| Instalar num servidor | `instalacao/modo-servidor.md` |
| Saber o que falta ou o que deu errado | Rode `./hub diagnostico --json` e siga o `proximo` de cada item; depois `instalacao/dicas.md` |
| Trazer repositórios | `instalacao/prompts/clonar-repositorios.md` |
| Outra conta do GitHub | `./hub adicionar github-workspace` (`instalacao/modo-local.md`) |
| Aviso se o hub cair | `instalacao/heartbeat.md` |
| Remover o hub | `instalacao/desinstalar.md` |

Regras:
- Os comandos rodam de dentro da pasta do hub (`./hub …`).
- Segredos a pessoa digita no `./hub init`, nunca no chat. Não leia nem mostre `~/.hub/dados/.env`.
- Não mude à mão `~/.gitconfig`, `~/.claude` nem o Keychain: o `./hub init` configura e o `./hub desinstalar` desfaz.
