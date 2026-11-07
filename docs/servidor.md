# Servidor: a VM `hub-cloud` na Oracle

O hub e as sessões do Claude rodam 24 h numa VM. O Mac e o celular são **janelas** para as mesmas sessões, pelo
Orca pareado: nenhum dos dois guarda estado. Siglas na [legenda](README.md#legenda).

```
              ┌──────────── tailnet (rede privada do Tailscale) ─────────────┐
  MacBook ────┤  hub-cloud 100.109.123.99                                     │
  iPhone  ────┤    ├─ SSH (só pelo Tailscale)                                 │
              │    ├─ Orca sem tela :6768 (Mac e celular pareados)            │
              │    └─ hub (bot por long polling, broker em 127.0.0.1)         │
              └───────────────────────────────────────────────────────────────┘
  Internet → servidor: nada entra.   Servidor → internet: Telegram, Claude, GitHub, PM, Bnexo.
```

## O que existe

| Peça | Valor |
|---|---|
| Conta | Oracle Cloud, São Paulo, cota `teto-always-free` (impede gastar além do grátis) |
| VM | `VM.Standard.A1.Flex` (ARM), 2 OCPU, 12 GB, Ubuntu 24.04 |
| Acesso | `ssh -i ~/.ssh/oracle_hub ubuntu@100.109.123.99` (porta 22 pública fechada) |
| Orca | `orca.service`, usuário `agente`, `ws://100.109.123.99:6768` |
| Hub | `hub.service`, usuário `hub`, bot `@HubTasksCloudBot` (o hub em uso desde 06/11) |
| Tailnet | `hub-cloud` 100.109.123.99 · `macbook` 100.88.138.47 · `iphone` 100.65.221.83 |

### Usuários e pastas

Dois usuários Linux para o agente nunca ler o que é do hub (cofre, `.env`, tokens):

| Pasta | Dono | Quem acessa |
|---|---|---|
| `/home/hub/app` | hub | código do hub, trocado a cada deploy (não é um clone git) |
| `/home/hub/dados` (700) | hub | `.env`, `apps.yaml` do servidor, banco, `cofre.enc`, OAuth do PM, logs |
| `/etc/hub/cofre-chave.cred` (600) | root | chave-mestra do cofre, entregue só ao `hub.service` |
| `/srv/hub/repos` (grupo `hub-agente`) | agente | repositórios; o hub cria pastas novas |
| `/srv/hub/runs` (grupo `hub-agente`) | hub | prompts e anexos; o agente só lê |
| `/home/agente/.claude` | agente | login e históricos do Claude; o hub só lê os históricos |

- O hub fala com o Orca pelo pareamento `agente` (`ORCA_ENVIRONMENT`), apontado para `ws://127.0.0.1:6768`.
- Todo git do hub roda como `agente` (`HUB_GIT_COMO="sudo -n -u agente"`, sudoers só para `/usr/bin/git`).
- O usuário `hub` só pode reiniciar `hub.service` e `orca.service`.

## Operação

```bash
ssh -i ~/.ssh/oracle_hub ubuntu@100.109.123.99
sudo systemctl status hub.service orca.service       # estado
sudo journalctl -u hub.service -f                    # log ao vivo
sudo -u hub bash -c 'cd /home/hub/app && <comando>'  # rodar algo como o hub
```

### Deploy

**Automático (B31):** o servidor busca no GitHub; nada entra nele. A cada 5 min o `hub-atualizar.timer` roda o
`deploy/atualizar.sh` como `hub`:
1. Vê o último commit da `v2` (`git ls-remote`) e compara com o `app/.versao`.
2. Só segue se o workflow **CI** do GitHub Actions passou nesse commit (API pública: o repositório é público).
3. Baixa o commit exato para `app-novo`, roda `npm ci`, tipos e testes; troca as pastas e reinicia o hub.
4. Se o hub não subir em 20 s, volta para `app-anterior`. Commit que falhou não é tentado de novo.

O "Hub online" no Telegram mostra a versão. Log: `sudo journalctl -u hub-atualizar.service`. Forçar agora:
`sudo -u hub /home/hub/app/deploy/atualizar.sh --forcar`. O reinício não derruba tasks: as sessões vivem no Orca e
o hub retoma o acompanhamento pelo banco.

**Atualizar o Orca:** `apt install` do `.deb` novo, **só sem task rodando** (atualizar o servidor sem tela pode
matar as sessões, issue #15956). Manter o Orca do Mac na mesma versão.

### Recriar do zero (a ordem que funcionou)

1. Cota `teto-always-free` no console da Oracle; nas linhas `*-regional-count`, `unset` (com `set` a VM não é criada).
2. `deploy/oracle-criar-vm.sh` no Cloud Shell: cria rede e VM, tentando de novo enquanto falta capacidade ARM.
3. `deploy/preparar-vm.sh` na VM: usuários, Node, Orca, Tailscale, systemd, cofre. Depois `tailscale up` e aprovar
   no painel (desligar a expiração da chave do servidor).
4. Deploy do código (acima) e `scripts/servidor-teste.ts` como o `hub.service`.
5. Com o Tailscale do Mac ligado e o SSH pela tailnet funcionando: `preparar-vm.sh --fechar-ssh`.
6. `.env` do servidor, `hub.service` ligado, `/pm_login` pelo bot.
7. Login do Claude do `agente`; cópia de recuperação da chave-mestra no app Senhas.
8. Pareamento: Mac por `orca environment add`; celular pelo link do cliente web (`http://<ip>:6768/web-index.html#pairing=…`).
9. Projetos e históricos do Mac: `deploy/migrar-do-mac.sh`; catálogo do servidor em `dados/apps.yaml`.

### Cuidados que os testes ensinaram

- **Pasta confiável:** sem marcar a pasta no `~/.claude.json` do agente, a sessão para em "Do you trust this
  folder?" e um Enter fecha o Claude. O hub marca antes de abrir (`HUB_CONFIAR_PASTA_CMD`).
- **O Orca abre agentes em acesso total por padrão:** `permissions.defaultMode: "auto"` no `~/.claude/settings.json`
  e `--permission-mode auto` nos argumentos do Claude no Orca (Mac e servidor).
- **O Orca escuta em `0.0.0.0`:** o firewall libera a 6768 só na interface do Tailscale.
- **A imagem da Oracle tem iptables próprio** que liberava a 22 antes do ufw: o script remove essas regras.
- **Uma instância por bot:** dois hubs com o mesmo token dão `409 Conflict`. Na virada, parar o do Mac primeiro.
- **O Orca só adiciona repositórios git:** "Só criar a pasta" cria um git local sem remoto.

## Testes (T)

| # | Teste | Status |
|---|---|---|
| T0, T4, T4b | Orca para Linux ARM, sem tela, como serviço | ✔️ |
| T1, T2 | Mac pareado; Mac, celular e hub na mesma sessão | ✔️ |
| T3a, T3b, T3c, T3 | Hub operando o Orca do servidor; task do sandbox de ponta a ponta | ✔️ (T3b capturado em 06/11: `tests/dominio/agentes.ts`) |
| T5 | Memória e CPU com várias sessões | ⬜ medir no uso |
| T6 | Front de um servidor de dev pelo Tailscale (Mac e celular) | ✔️ Mac e celular (06/11); pelo IP público não abre |
| T6b | Link público temporário (opcional) | ⬜ |
| T7 | Reinício da VM: tudo volta sozinho | ✔️ |
| T8, T9, T10 | Login do Claude, git e PM sem navegador | ✔️ (falta `gh auth login` do agente) |
| T11 | Reinício só do Orca com sessão aberta | ✔️ na Oracle (06/11): terminais sobrevivem, Orca volta em ~6 s |
| T12 | Mac dormindo com tasks rodando | ✔️ (06/11): task concluída com o Mac fechado |
| T13 | Versões do Orca diferentes entre Mac e servidor | regra: manter iguais |
| T14 | Celular continua a sessão com o Mac desligado | ✔️ na Oracle (06/11) |

O **ensaio** foi feito numa VM Ubuntu ARM no próprio Mac, com o [Lima](https://lima-vm.io/) (`limactl shell
hub-ensaio`), antes da Oracle liberar. Serve para testar mudanças de infra sem mexer na `hub-cloud`.

## Atritos (A1–A17)

O que travou na primeira subida. Cada um é um requisito do [onboarding](app-universal.md#3-onboarding-hub-init).

| # | Atrito | Como deveria ser |
|---|---|---|
| A1 | Cota com `set` nas contagens regionais bloqueou a VM | Script cria a cota certa |
| A2 | "Out of capacity" da Oracle | Nova tentativa automática, com aviso quando criar |
| A3 | Console da Oracle confuso (shape errado escolhido) | Nada pelo console além do login |
| A4 | iptables da imagem furava o ufw; a 22 não fechava | Verificar de fora que a 22 fechou |
| A5 | SSH pelo Tailscale falhou (Tailscale do Mac desligado, chave de host nova) | Conferir a tailnet antes de fechar a 22 |
| A6 | Muitos passos manuais em ordem | Assistente que guia e mostra o que falta |
| A7 | Token do bot e link de pareamento passaram pelo chat | Segredos direto no servidor |
| A8 | Login do PM no navegador do Telegram não completa | Abrir no Safari, ou código curto |
| A9 | Endereço do OAuth sem `http://` não era reconhecido | (corrigido) |
| A10 | Bot novo não aparece até o primeiro "Iniciar" | Assistente manda o link `t.me/…` |
| A11 | `orca://pair` não abre no iPhone | QR code do link certo |
| A12 | `apps.yaml` com caminhos do Mac | Catálogo criado pelo assistente |
| A13 | Orca novo não conhecia a pasta (`selector_not_found`) | (corrigido: o despacho adiciona) |
| A14 | Projetos de teste ficaram no Orca | Verificação sem sobras |
| A15 | `tar` do Mac levou arquivos `._*` | `COPYFILE_DISABLE=1` ou clonar |
| A16 | "A identidade do autor do Git não está configurada" | `hub init` configura nome e e-mail |
| A17 | Depois de reiniciar o Mac, o SSH para o servidor falha ("Permission denied"): a chave tem senha e saiu do agente | `ssh-add --apple-use-keychain` e `UseKeychain yes` no `~/.ssh/config` |

## Riscos e custos

- **A Oracle pode recuperar VM ociosa** (CPU, rede e memória abaixo de 20% por 7 dias) ou mudar as regras.
  Plano B: Hetzner (~€ 6–10/mês), com os mesmos scripts e backup de `dados/`.
- **Memória:** sessões longas do Claude vazam memória. O Orca aceita um limite por terminal
  (`ORCA_TERMINAL_MEMORY_MAX`), ainda não configurado no `orca.service`.
- **Custos:** Oracle R$ 0; Tailscale grátis no piloto e US$ 8/mês a partir da virada (D-S2); Claude é a assinatura atual.
