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

## Testes da etapa 1 (02/11/2026, VMs novas e descartáveis)

| # | Teste | Resultado | Como foi verificado |
|---|---|---|---|
| 1 | **Dois usuários** (`hub` e `agente`) | ✅ | Sem pareamento, o hub nem enxerga o Orca do agente. Com um pareamento próprio (`orca-ide environment add --name agente`), o hub cria terminais, envia texto e lê telas; o terminal roda como `agente`, que recebe "Permission denied" ao tentar ler `/home/hub` |
| 2 | **Serviços (systemd)** | ✅ | `orca.service` (`User=agente`). Reboot da VM: o Orca volta sozinho e o pareamento do hub continua válido. `kill -9` no Orca: volta em 10 s e **o terminal aberto sobrevive** |
| 3 | **Cofre** (`systemd-creds` + AES-256-GCM) | ✅ | Só um serviço com `User=hub` e `LoadCredentialEncrypted` abre o cofre. Ataques que falharam como deviam: o agente ler o cofre, ler a chave cifrada ou ler `/run/credentials/` de um serviço do hub rodando; o hub decifrar a chave fora do serviço; cofre com 1 byte alterado; chave de outra máquina |
| 3b | **Cópia de recuperação da chave** | ✅ | Exportada (44 caracteres em base64), chave e segredo da máquina apagados ("máquina nova"); o script com `COFRE_CHAVE_B64` reabriu o cofre antigo. Sem a cópia, o cofre antigo não abre |
| 4 | **Script do zero** ([`deploy/preparar-vm.sh`](../../deploy/preparar-vm.sh)) | ✅ | VM nova: 1ª execução em 2min38s, 2ª em 7s, sem chave nova, sem reiniciar o Orca e sem parear de novo. Depois de um reboot, tudo volta |

Erros que os testes pegaram (já corrigidos no script):
- a 2ª execução reiniciava o Orca e testava a conexão antes de ele estar pronto;
- o comando de exportar a chave precisava de `--name=cofre-chave`;
- no `ExecStart` do systemd, `$` precisa ser escrito `$$`.

### Desenho que saiu dos testes

| Pasta | Dono | Quem acessa |
|---|---|---|
| `/home/hub/app` | hub | código do hub, trocado a cada deploy |
| `/home/hub/dados` (700) | hub | banco, cofre cifrado, logs |
| `/etc/hub/cofre-chave.cred` (600) | root | chave-mestra, entregue só ao `hub.service` |
| `/srv/hub/repos` (2775, grupo `hub-agente`) | agente | o agente escreve; o hub cria pastas novas |
| `/srv/hub/runs` (2750, grupo `hub-agente`) | hub | o hub escreve anexos e prompts; o agente só lê |
| `/home/agente/.claude/projects` | agente | o hub só lê (ACL), para retomar sessões |

- O hub fala com o Orca pelo pareamento `agente`, apontado para `ws://127.0.0.1:6768`: não depende do Tailscale estar de pé.
- O deploy (usuário `hub`) só pode reiniciar `hub.service` e `orca.service` (`/etc/sudoers.d/hub-deploy`).
- O link de pareamento fica no journal do `orca.service`, que só o root e o grupo `adm` leem.
- A VM do ensaio não tem TPM; o segredo da máquina (`/var/lib/systemd/credential.secret`, só root) fica no disco. Na Oracle, conferir com `systemd-creds has-tpm2`.

### O que o hub precisa mudar para rodar assim (refatoração)

- `ORCA_ENVIRONMENT`: passar `--environment agente` em todo comando do Orca.
- `HUB_DADOS_DIR`, `HUB_REPOS_DIR`, `HUB_RUNS_DIR` no lugar de `ROOT/data`, `~/Documents/...` e `ROOT/runs`.
- Ler o histórico do Claude do agente (`/home/agente/.claude/projects`), não do próprio usuário.
- Marcar cada repositório como confiável no Claude do agente.
- Cofre lendo a chave de `$CREDENTIALS_DIRECTORY/cofre-chave`.
- `deploy/atualizar.sh` já usa `sudo -n systemctl restart hub.service`.

## Integração do hub da v2 (02/11/2026)

VM nova, `deploy/preparar-vm.sh`, código da `v2` em `/home/hub/app`, e `scripts/servidor-teste.ts` rodando como o `hub.service` (usuário `hub`, mesmas variáveis, chave do cofre pelo systemd):

| Verificação | Resultado |
|---|---|
| `npm ci`, tipos e 59 testes no Linux ARM | ✅ |
| Cofre cifrado com a chave do `systemd-creds` | ✅ |
| Orca do agente pelo pareamento (`status`) | ✅ |
| Hub cria repositório e adiciona ao Orca | ✅ |
| Sessão roda como `agente`, com a pasta marcada como confiável antes | ✅ |
| Hub lê a pasta de históricos do Claude do agente | ✅ |
| Agente lê `runs/`, mas não escreve | ✅ |

Achados corrigidos:
- `better-sqlite3` compila no ARM: o script instala `build-essential`.
- Pelo pareamento, o `orca status` diz que o "app" não está rodando (o hub não tem desktop): o adaptador olha só o runtime remoto.
- O git 2.43 do Ubuntu não aceita `safe.directory` com curinga no fim do caminho: o agente usa `*`.

Pendências descobertas:
- **O Orca só adiciona pastas que são repositório git** (`repo add`: "Not a valid git repository"). A opção "📁 Só criar a pasta" do hub cria uma pasta sem git; conferir no Mac se a v1 também falha e decidir entre fazer `git init` ou tirar a opção.
- **Clonar no servidor:** o hub clona como usuário `hub`, que não tem acesso ao git das empresas. O clone precisa rodar como `agente` (que terá o login do git) por um terminal do Orca.

## Falta testar

- Tudo acima na **Oracle**, mais o celular reconectando sozinho depois de um reboot (no ensaio, o Tailscale não estava nas VMs de teste).
- Hub da `v2` rodando contra o Orca da VM, com bot de teste (T3a–T3c, T2), depois da refatoração.
