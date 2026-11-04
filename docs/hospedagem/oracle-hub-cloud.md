# Hub na Oracle: a VM `hub-cloud` (03/11/2026)

Primeira subida real do hub da v2 na nuvem. Serve de registro do que existe, de lista de atritos para o
[fluxo de configuração inicial](../v2/configuracao-inicial.md) e de roteiro para o [estudo da infra](../estudo/infra-nuvem.md).

## O que existe

| Peça | Valor |
|---|---|
| Conta | Oracle Cloud, região São Paulo (`sa-saopaulo-1`), conta paga com cota `teto-always-free` |
| VM | `hub-cloud`, `VM.Standard.A1.Flex` (ARM), 2 OCPU, 12 GB, Ubuntu 24.04 |
| Tailnet | `hub-cloud` 100.109.123.99 · `macbook` 100.88.138.47 · `iphone` 100.65.221.83 |
| Acesso | `ssh -i ~/.ssh/oracle_hub ubuntu@100.109.123.99` (só pelo Tailscale; a porta 22 pública está fechada) |
| Orca | `orca.service`, usuário `agente`, `ws://100.109.123.99:6768`; Mac e celular pareados |
| Hub | `hub.service`, usuário `hub`, bot de teste `@HubTasksCloudBot`, código em `/home/hub/app` |
| Dados | `/home/hub/dados`: `.env`, `apps.yaml` do servidor, banco, `cofre.enc`, OAuth do PM |
| Repositórios | `/srv/hub/repos` (do `agente`); anexos das tasks em `/srv/hub/runs` |

Cota da Oracle (o teto que impede gastar): A1 até 2 OCPU / 12 GB, 200 GB de disco, banco zerado. As linhas
`*-regional-count` precisam de `unset`; com `set` a Oracle recusa a criação da VM.

## Ordem que funcionou

1. Cota `teto-always-free` (console da Oracle → Governance → Quota policies).
2. `deploy/oracle-criar-vm.sh` no Cloud Shell: cria rede e VM, tentando de novo enquanto falta capacidade (criou na 2ª).
3. `deploy/preparar-vm.sh` na VM (usuários, Node, Orca, Tailscale, systemd, cofre). Depois `tailscale up` e aprovar no painel.
4. Código: `git archive HEAD | ssh … tar -x` em `/home/hub/app`, `npm ci`, testes; `scripts/servidor-teste.ts` como o `hub.service`.
5. Mac com o Tailscale ligado → SSH pelo Tailscale → `preparar-vm.sh --fechar-ssh`.
6. `.env` do servidor (cópia do Mac com o token do bot de teste), `hub.service` ligado, `/pm_login` pelo bot.
7. Login do Claude do `agente`, cópia de recuperação da chave-mestra no app Senhas.
8. Pareamento: Mac por `orca environment add`; celular pelo link do cliente web (`http://100.109.123.99:6768/web-index.html#pairing=…`).
9. Catálogo do servidor (`HUB_APPS_FILE`) com o sandbox, e a task de teste ponta a ponta.

## Atritos (o que travou ou deu erro)

Cada linha é um requisito do [fluxo de configuração inicial](../v2/configuracao-inicial.md).

| # | Atrito | Correção agora | Como deveria ser |
|---|---|---|---|
| A1 | Cota com `set` nas contagens regionais bloqueou a VM | `unset` | Script cria a cota certa |
| A2 | "Out of capacity" da Oracle | Script com nova tentativa a cada 90 s | Igual, com aviso no celular quando criar |
| A3 | Console da Oracle difícil de navegar (rolagem, shape A2 escolhido por engano) | Cloud Shell + script | Nada pelo console além do login |
| A4 | Imagem da Oracle tem iptables próprio que libera a 22 antes do ufw; `--fechar-ssh` não fechava nada | Script remove as 3 regras | Verificar de fora que a 22 fechou |
| A5 | SSH pelo Tailscale falhou com o Tailscale do Mac desligado e chave de host nova | Ligar o Tailscale, conferir a chave | Assistente confere a tailnet antes de fechar a 22 |
| A6 | Muitos passos manuais em ordem (login do Claude, chave de recuperação, `.env`, bot, pareamento) | Lista de passos no chat | Um assistente que guia passo a passo e mostra o que falta |
| A7 | Token do bot e link de pareamento passaram pelo chat | Avisado; risco baixo (só pela tailnet) | Segredos entram direto no servidor, nunca no chat |
| A8 | Login do PM no navegador do Telegram não completa | Mensagem manda abrir no Safari | Idem, ou login por QR/código curto |
| A9 | Endereço de retorno do OAuth copiado sem `http://` não era reconhecido | Reconhece variações | — |
| A10 | Bot novo não aparece nos contatos até o primeiro "Iniciar" | Explicado | Assistente manda o link `t.me/…` |
| A11 | `orca://pair` não abre no iPhone; o log também mostra um link antigo com 127.0.0.1 | Link do cliente web por `pbcopy` | QR code do link certo |
| A12 | `apps.yaml` do código tem caminhos do Mac | Catálogo próprio em `dados/` | Catálogo criado pelo assistente |
| A13 | Orca da VM nova não conhecia a pasta → `selector_not_found` | Despacho adiciona a pasta | — |
| A14 | Projetos de teste da verificação ficaram no Orca (CLI não remove) | Remover pela interface | Verificação sem sobras |
| A15 | `tar` do Mac levou arquivos `._*` | Apagados | Copiar com `COPYFILE_DISABLE=1` ou clonar |

## Testes

| Teste | Resultado |
|---|---|
| `servidor-teste.ts` como o `hub.service` (cofre, Orca, pasta nova, clone, sessão confiável, permissões) | ✅ |
| Porta 22 fechada pela internet, SSH pelo Tailscale, saída para a internet | ✅ |
| `/pm_login` real com o Funifier PM | ✅ |
| Task fictícia do sandbox: hub → Orca → Claude (`--permission-mode auto`) → arquivo criado na VM | ✅ |
| Mac e celular vendo o Orca do servidor | ✅ |
| Reinício da VM: Tailscale, Orca e hub voltam sozinhos; 22 continua fechada; Mac alcança o Orca | ✅ |
| Celular continua a sessão com o Mac desligado (T14) | com o João |
