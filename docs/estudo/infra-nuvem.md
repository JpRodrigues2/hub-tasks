# Estudo da infra em nuvem (a fazer)

Pedido do João (02 e 03/11/2026): aprender a fazer sozinho **tudo** o que envolve o ambiente em nuvem do hub.
Este é o roteiro do módulo; cada tópico vira uma aula com o porquê, os comandos e um exercício numa VM descartável.
O registro do que foi feito está em [servidor](../servidor.md).

## Roteiro

| # | Tópico | O que aprender | Onde aparece no hub |
|---|---|---|---|
| 1 | Nuvem e Oracle | Conta, região, tenancy, compartimento, shapes (A1 ARM), Always Free, cotas e por que `unset` nas regionais, Cloud Shell e CLI `oci` | `deploy/oracle-criar-vm.sh`, cota `teto-always-free` |
| 2 | Rede da nuvem | VCN, sub-rede, internet gateway, rota, IP público, security list | criação da VM |
| 3 | Linux do servidor | Ubuntu, `apt`, usuários e grupos, `sudo` e sudoers, permissões, setgid, ACL | usuários `hub` e `agente`, `/srv/hub` |
| 4 | SSH | Par de chaves, `~/.ssh`, `authorized_keys`, `known_hosts` e chave de host, `ssh -t`, `scp`, comando restrito para deploy | acesso à VM, deploy |
| 5 | Firewall | `iptables`, `ufw`, por que a imagem da Oracle furava o ufw, como testar de fora | `--fechar-ssh` |
| 6 | Tailscale | VPN mesh, tailnet, `tailscale up`, aprovação de dispositivos, IPs 100.x, tags e ACL, por que dispensa porta aberta | Mac, iPhone, `hub-cloud` |
| 7 | systemd | Unidade, `Environment`, `User`, `UMask`, reinício, `journalctl`, `systemd-run`, `systemd-creds` | `hub.service`, `orca.service`, chave do cofre |
| 8 | Orca sem tela | `orca-ide serve`, orcad, endpoint anunciado, ambientes, pareamento (`orca://pair`, cliente web), `--environment` | Orca do `agente` |
| 9 | Pareamento | Mac (`orca environment add`), celular (link do cliente web), o que o token de pareamento dá e como trocar | Mac e iPhone vendo a mesma sessão |
| 10 | Claude Code no servidor | Login do `agente`, pasta confiável, `--permission-mode auto`, histórico em `~/.claude/projects` | `hub-confiar-pasta`, despacho |
| 11 | Git no servidor | Git como `agente`, `safe.directory`, clone, contas e chaves por espaço | `src/git.ts` |
| 12 | Cofre e segredos | AES-256-GCM, chave-mestra no `systemd-creds`, cópia de recuperação, o que um snapshot do disco expõe | `CofreArquivoCifrado` |
| 13 | Deploy e CI | `git archive`, `atualizar.sh`, GitHub Actions entrando pela tailnet | `deploy/` |
| 14 | Operação | Logs, reinício, atualizar o Orca, heartbeat (Healthchecks.io), recuperar a VM | dia a dia |
| 15 | Ensaio local | Lima, VMs Ubuntu ARM no Mac, como testar antes da nuvem | [servidor](../servidor.md#testes-t) |

## Como vai ser

- Na ordem da tabela; cada aula tem um exercício numa VM de ensaio (Lima) e depois a conferência na `hub-cloud`.
- Enquanto o módulo não existe: todo comando novo de infra vem explicado no momento em que é usado.
