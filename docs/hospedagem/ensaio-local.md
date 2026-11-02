# Ensaio local do servidor (VM Lima)

Enquanto o upgrade da Oracle não sai, os testes do servidor rodam numa VM no próprio Mac, com o **mesmo sistema e a mesma arquitetura** da VM da Oracle. Tudo que passar aqui só precisa ser confirmado lá.

| | Ensaio | Oracle (alvo) |
|---|---|---|
| Ferramenta | [Lima](https://lima-vm.io/) 2.2.1 (`brew install lima`) | VM.Standard.A1.Flex |
| Sistema | Ubuntu 24.04.5 LTS, aarch64, systemd 255 | Ubuntu 24.04, aarch64 |
| Recursos | 2 CPUs, 6 GB, 30 GB de disco | 2 OCPU, 12 GB |
| Pastas do Mac | nenhuma montada | — |
| Nome na tailnet | `hub-ensaio` | `hub-cloud` |

Comandos úteis:

```bash
limactl shell hub-ensaio          # entrar na VM
limactl stop hub-ensaio           # desligar
limactl delete hub-ensaio         # apagar tudo (e remover hub-ensaio do Tailscale)
```

## Resultados (02/11/2026)

| Teste | Resultado | Observação |
|---|---|---|
| **T4** Orca sem tela no Linux ARM | ✅ | Orca 1.4.246 (`orca-ide_1.4.246_arm64.deb`, sha512 conferido). Roda no servidor próprio (orcad), **sem Xvfb**; ~1 GB de RAM em repouso |
| CLI do hub no Orca sem tela | ✅ | `repo add/list`, `terminal create/list/send/read`, `worktree ps/set` e `terminal wait --for tui-idle` com o Claude |
| **T8** Claude Code no servidor | ✅ | Instalador nativo (`claude.ai/install.sh`), login com a conta claude.ai |
| **T14** celular com o Mac fora do caminho | ✅ | Pareado por QR (`--mobile-pairing`), pelo 5G com Tailscale: vê as abas, digita e recebe as respostas |
| **T1** Orca do Mac como cliente | ✅ | Settings → Remote Orca Servers → Add Server, com o link de `orca-ide serve` sem `--mobile-pairing`. A mesma sessão aparece no Mac e no celular |
| Sessões sobrevivem ao reinício do `orca serve` | ✅ | "terminals survive an orcad restart: yes"; a conversa do celular continuou |

## Aprendizados (viram itens do script e do hub)

1. **Rodar o `orca-ide serve` desligado do terminal.** Num terminal interativo, ele abre um `bash -ilc` para descobrir o PATH, que toma o terminal e congela o processo ("Stopped"). Com `setsid ... < /dev/null`, ou pelo systemd, funciona.
2. **O Orca escuta em `0.0.0.0`.** O firewall libera a porta 6768 **só na interface do Tailscale**.
3. **Sem atualização automática no modo sem tela** (`unsupported-headless-serve`). Atualizar o Orca (`apt install` do `.deb` novo) entra no deploy.
4. **Pasta confiável no Claude.** Sem isso, toda sessão para em "Do you trust this folder?", com "No, exit" como padrão; um Enter vindo do celular fecha o Claude. O script/hub marca `hasTrustDialogAccepted` no `~/.claude.json` para cada repositório.
5. **O Orca abre agentes em acesso total.** Por padrão (`agentPermissionDefault: full-access`) o Claude abre com `--dangerously-skip-permissions`, que é proibido. Correção em duas camadas:
   - `~/.claude/settings.json` → `permissions.defaultMode: "auto"` (feito no Mac e na VM);
   - Orca → Settings → Agents → Claude → launch arguments → `--permission-mode auto` (no Mac e no servidor).
   As sessões abertas pelo hub já passam `--permission-mode auto` explicitamente.
6. **Terminais criados pela CLI** num servidor sem tela voltam com o aviso "could not make it discoverable", mas aparecem no celular e no Mac pareados.
7. **Credenciais do próprio Orca** (login do Claude etc.) ficam seladas com uma chave guardada ao lado delas, na conta do usuário. Reforça a separação `hub` × `agente` ([estudo, seção 2](../estudo/etapa-1.md)).
8. Existe `orca serve service install` (serviço gerenciado) e `--supervise` (reinício próprio, para systemd). Avaliar no script.
9. Link de pareamento é uma senha: gerar, usar e apagar o log (`umask 077`).

## Falta testar no ensaio

- Script de preparação do zero numa VM nova, e de novo (idempotência).
- `orca-ide serve` como serviço systemd e reinício da VM (T7, T11).
- Dois usuários: `hub` falando com o Orca do usuário `agente`.
- Cofre com `systemd-creds` (serviço do sistema com `User=hub`).
- Hub da `v2` rodando contra o Orca da VM, com bot de teste (T3a–T3c, T2).
