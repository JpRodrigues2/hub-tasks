# Plano de execução: hub no servidor

Parte da [Parte A, servidor](servidor-nuvem.md). Pesquisa feita em 30/10/2026: documentação oficial do Orca (repositório `stablyai/orca`), do Claude Code (code.claude.com), da Oracle Cloud, e o código do hub. Cada resposta indica a fonte; o que ainda precisa ser confirmado na prática continua como teste.

---

## 1. Respostas às lacunas

### Orca

| Lacuna | Resposta | Fonte | Falta testar |
|---|---|---|---|
| Existe Orca para Linux? (T0) | ✅ Sim. Cada versão publica `.deb`, `.rpm` e AppImage para **x64 e arm64**. O projeto é open source (MIT). | Releases do `stablyai/orca` (v1.4.245, 30/10/2026) | — |
| Roda sem tela? (T4) | ✅ Sim, oficialmente: `orca serve` é o modo para "headless Linux server ou VM gerenciada por serviço". Ele sobe um Xvfb próprio e desliga a GPU por padrão. | `docs/remote-servers.mdx` | Rodar de fato numa VM arm64 |
| Nome do CLI no Linux | **`orca-ide`**, não `orca` (o leitor de tela GNOME Orca já usa `/usr/bin/orca`). O primeiro início é `orca-ide serve`. Dentro dos terminais do Orca, `orca` funciona. | `docs/install.mdx` | O hub usa `ORCA_BIN=/usr/bin/orca-ide` |
| Como serviço (T4b) | ✅ Existe `orca serve service install` em versões recentes (não na 1.4.220 do Mac). Há um bug aberto com a AppImage (#36000): **usar o `.deb`**. Para sobreviver ao logout: `loginctl enable-linger <usuário>`. | Docs e issues #36000 | Instalar e reiniciar |
| Pareamento (T1) | ✅ Tailscale nos dois lados; o `serve` imprime um link de acesso; no Mac, **Settings → Remote Orca Servers → Add Server**. Cada cliente recebe um token próprio, revogável. **Não expor a porta na internet.** | `docs/remote-servers.mdx` | Parear o Mac |
| Sessões sobrevivem a reinício do `serve`? (T11) | ✅ Parcial. O processo que hospeda os terminais **continua rodando quando o `orca serve` reinicia**. ⚠️ Mas há issue aberta: **atualizar o `serve` sem tela mata todas as sessões** (#15956). | Docs e issue #15956 | Confirmar; regra: só atualizar sem despacho ativo |
| Versões precisam ser iguais? (T13) | Na prática, sim: em caso de "incompatible protocol version", atualizar os dois. O Mac está na **1.4.220** e a última é a **1.4.245**. | `docs/remote-servers.mdx` | Manter as duas iguais |
| O CLI do hub funciona contra o servidor? (T3a) | Provável: os comandos são os mesmos, e a doc recomenda seletores `path:<caminho-absoluto-do-servidor>`, que o hub **já usa**. | `docs/cli/reference.mdx` | Rodar os 9 métodos do `orca.ts` |
| Proteção de memória | `ORCA_TERMINAL_MEMORY_MAX` limita a memória **por terminal** (systemd + cgroup v2). Um processo descontrolado morre sozinho, sem derrubar o servidor. | `docs/remote-servers.mdx` | Configurar |
| Contas do Claude sem tela | `orca account add --agent claude`, rodado no shell do servidor. | `docs/remote-servers.mdx` | T8 |

### Claude Code

| Lacuna | Resposta | Fonte |
|---|---|---|
| Requisitos | Ubuntu 20.04+ ou Debian 10+, **4 GB+ de RAM**, x64 ou **ARM64**. Há repositório apt oficial assinado. | code.claude.com/docs/en/setup |
| Login sem navegador (T8) | Três caminhos: (1) `claude` → tecla `c` copia a URL de login → abrir no Mac → colar o código no terminal; (2) `orca account add --agent claude`; (3) `claude setup-token` gera um token de 1 ano para `CLAUDE_CODE_OAUTH_TOKEN`. Há relatos de erro 401 com o caminho 3; preferir 1 ou 2. | code.claude.com/docs/en/authentication |
| Onde fica a credencial | `~/.claude/.credentials.json` (0600). Aviso de renovação 3 dias antes de expirar. | Idem |
| Memória real | Sem número oficial por sessão. Há relatos de vazamento de memória em sessões longas. Por isso o limite por terminal do Orca é obrigatório. | Issues do `anthropics/claude-code` |

### Hub

| Lacuna | Resposta | Fonte |
|---|---|---|
| `better-sqlite3` precisa compilar? (gargalo 12) | ✅ **Não.** O pacote já traz binários para `linux-x64` e `linux-arm64`. | `node_modules/better-sqlite3/prebuilds` |
| Login do Funifier PM sem navegador (T10) | O callback do OAuth é `http://localhost:53682/callback`, e o hub **imprime a URL** de login. Solução: `ssh -L 53682:127.0.0.1:53682 <servidor>`, rodar `npm run pm:login` no servidor e abrir a URL no Mac. Alternativa: copiar `data/oauth/`. | `src/pm/mcp-client.ts:20` |
| Caminhos do `apps.yaml` | O hub já aceita `HUB_APPS_FILE`: o servidor tem o **seu próprio** `apps.yaml`, com caminhos do servidor, sem tocar no do Mac. | `src/config.ts:74` |
| Duas instâncias do bot | Só uma pode fazer long polling: a do Mac precisa parar antes (`409 Conflict`). | Bot API do Telegram |

### Rede

| Lacuna | Resposta | Fonte |
|---|---|---|
| Tailscale grátis? | Plano Personal gratuito: até 6 usuários e dispositivos ilimitados. ⚠️ "Only suitable for non-commercial use." Standard: US$ 8/usuário/mês. Decisão: Personal no piloto, Standard na virada (D-S2). | tailscale.com/pricing (conferido em 02/11/2026) |

### Ainda sem resposta (não dá para resolver pesquisando)

- ~~D-S6~~: autorizado em 02/11/2026, com ambiente isolado e acesso só do João.
- **Quanto de memória o conjunto usa** (T5): só medindo.

## 1b. Modelo de uso (requisito do João, 02/11/2026)

O celular e o computador são usados o tempo todo, e **nenhum dos dois guarda estado**: tudo vive no servidor.

| Aparelho | Para quê | Como |
|---|---|---|
| Celular | Tasks simples, acompanhar ao vivo | Telegram (todas as funcionalidades do hub) + **app do Orca pareado com o servidor**, inclusive com o MacBook desligado (**imprescindível**, T14) |
| Computador | Tasks complexas | Orca do Mac pareado com o servidor (as mesmas sessões) + editor com acesso remoto (VS Code/Cursor Remote-SSH) para o código no servidor |

**Requisitos:**
- **Mesma sessão nos dois aparelhos:** a sessão do Claude é um processo no servidor; o Orca do Mac e o do celular são duas janelas para ele. Nada a sincronizar.
- **Computador sempre atualizado:** o trabalho das tasks acontece nos clones **do servidor**. O Mac não precisa dos próprios clones para isso; se usar, eles se atualizam pelo git (a sessão dá push na branch da task; o Mac faz `git fetch`). Regra: uma branch tem um só lugar de trabalho por vez.
- **Testar o front:** pelo Tailscale, do Mac ou do celular, sem abrir porta (T6). Opcional: um link público temporário para mostrar a alguém de fora (T6b).
- **Login do Funifier PM pelo celular:** pelo Telegram, colando o endereço de retorno do OAuth (T10, mudança na fase 5).

### Rede: como configurar (D-S2)

```
              ┌──────────── tailnet (rede privada do Tailscale) ────────────┐
  MacBook ────┤  hub-cloud (servidor)   100.x.x.x                           │
  iPhone  ────┤    ├─ SSH (só pelo Tailscale)                               │
              │    ├─ orca serve --port 6768   (Mac e celular pareados)      │
              │    └─ servidores de dev (ex.: :5173) → http://hub-cloud:5173 │
              └──────────────────────────────────────────────────────────────┘
  Internet → servidor: nada entra (security list da Oracle e ufw sem regras de entrada).
  Servidor → internet: Telegram, Claude, GitHub, Funifier PM, Bnexo (só saída).
```

1. Conta no Tailscale (login com a conta do Google ou do GitHub). Plano Personal no piloto; **Standard na virada**, porque o Personal é só para uso não comercial.
2. Instalar o Tailscale no **Mac**, no **iPhone** e no **servidor** (`tailscale up`). Nome do servidor: `hub-cloud` (MagicDNS: os aparelhos acham o servidor pelo nome).
3. No painel do Tailscale, **desligar a expiração da chave** do servidor (senão ele sai da rede a cada 180 dias).
4. SSH pelo Tailscale: `ssh hub@hub-cloud`. Depois que funcionar, **remover a regra da porta 22** da security list da Oracle.
5. `ufw`: negar toda entrada, liberar só a interface `tailscale0`.
6. `orca serve` com `--pairing-address <IP do Tailscale do servidor>` e `--port 6768` (porta fixa para o serviço).
7. Parear o Mac (Settings → Remote Orca Servers → Add Server) e o celular (`--mobile-pairing`, QR code).
8. ACL do Tailscale: só os aparelhos do João enxergam o servidor.

**Front para alguém de fora (opcional, T6b):** `tailscale funnel` (do próprio Tailscale), Cloudflare Tunnel ou ngrok publicam um servidor de dev num endereço HTTPS público, **temporário** e de preferência com senha. Nunca publicar a porta do Orca.

---

## 2. Onde hospedar: os gratuitos

O hub precisa de uma **máquina virtual de verdade, sempre ligada**: terminais interativos, Orca com Xvfb, sessões do Claude, repositórios em disco e servidores de dev. Isso descarta as plataformas de container (PaaS).

| Provedor | Grátis? | Serve? | Por quê |
|---|---|---|---|
| **Render** | Plano free | ❌ | Serviços free "dormem" sem tráfego, não têm disco persistente, não há worker grátis (o mais barato é US$ 7/mês), 512 MB de RAM. |
| Railway, Fly.io, Koyeb | Trial ou crédito | ❌ | Containers, sem free permanente para contas novas. Também não comportam Orca + Claude interativo. |
| Google Cloud e2-micro | Sempre grátis | ❌ | 1 GB de RAM; o Claude Code pede 4 GB+. |
| AWS (contas novas) | Até US$ 200 em créditos por 6 meses | 🟡 Temporário | Paga uma t4g.large (8 GB) por alguns meses; bom para testar, não para ficar. |
| **Oracle Cloud Always Free** | **Sempre grátis** | ✅ **Melhor opção grátis** | Ampere A1 (ARM): **2 OCPU e 12 GB de RAM** no total (reduzido de 4/24 em agosto de 2026). Orca e Claude Code têm builds arm64. |
| Hetzner (pago, referência) | ~€ 5,50–6/mês por 4 GB | ✅ Plano B | Barato e estável; 4 GB é o mínimo do Claude, então o ideal são 8 GB. |

### Riscos do Oracle Always Free

- **Instância ociosa pode ser recuperada:** a Oracle considera ociosa uma VM com CPU (percentil 95), rede **e** memória abaixo de 20% por 7 dias. Com o Orca e uma sessão do Claude ocupando mais de 2,4 GB, a memória fica acima de 20%. Monitorar.
- **Falta de capacidade ARM** na região é comum na criação: tentar outra região ou outro horário.
- **As regras mudam sem aviso:** a cota caiu à metade em 2026. Ter o plano B pronto (backup + script de instalação) evita depender da Oracle.
- O código das empresas fica num provedor de terceiros (D-S6 ✅: autorizado com ambiente isolado).

**Recomendação:** testar tudo de graça na **Oracle Always Free** (2 OCPU, 12 GB, Ubuntu 24.04 arm64). Se a Oracle falhar (capacidade, recuperação, desempenho), migrar para a Hetzner, com o mesmo script.

---

## 3. Plano de execução

Cada fase termina com um critério de pronto. As fases 1 a 5 não tocam no hub que está rodando no Mac.

### Fase 0: preparo (sem custo)

- [x] Autorização para o código no servidor (D-S6 ✅).
- [x] Rede: Tailscale (D-S2 ✅).
- [ ] Atualizar o Orca do Mac para a última versão (hoje 1.4.220 → 1.4.245).
- [ ] Criar a conta na Oracle Cloud (pede cartão para verificação; o Always Free não cobra).

**Pronto quando:** conta criada e decisão de rede tomada. A autorização das empresas pode correr em paralelo com as fases 1 a 5.

### Fase 1: provisionar a máquina

- [ ] VM `VM.Standard.A1.Flex` com 2 OCPU e 12 GB, Ubuntu 24.04 arm64, disco de 50–100 GB (o Always Free dá até 200 GB de block volume).
- [ ] Usuário dedicado (`hub`), acesso só por chave SSH, senha desligada.
- [ ] Tailscale instalado; firewall (`ufw` e a security list da Oracle) **sem nenhuma porta de entrada pública**, nem SSH: o SSH passa a ser só pelo Tailscale.
- [ ] Atualizações de segurança automáticas (`unattended-upgrades`); swap de 4 GB.

**Pronto quando:** `ssh hub@<ip-tailscale>` funciona e a VM não aceita nada vindo da internet.

### Fase 2: Orca no servidor (T4, T4b, T1, T13)

- [ ] Instalar o `.deb` arm64 do Orca na mesma versão do Mac.
- [ ] `orca-ide serve --pairing-address <ip-tailscale>`: sobe sem tela? (**T4**)
- [ ] `orca serve service install` + `loginctl enable-linger hub`; sair do SSH e reiniciar o serviço. (**T4b**)
- [ ] Parear o Orca do Mac com o link de acesso. (**T1**)
- [ ] Parear o app do Orca no celular (`--mobile-pairing`, QR code) **com o MacBook desligado**, e acompanhar uma sessão ao vivo. (**T14**)
- [ ] `ORCA_TERMINAL_MEMORY_MAX=4G` e `ORCA_TERMINAL_MEMORY_SWAP_MAX=0` no serviço.

**Pronto quando:** o Orca do Mac lista os terminais do servidor, e o servidor reinicia sem ninguém intervir.

**Se o T4 falhar:** o executor tmux (D-A3) entra antes da v2, ou o servidor passa a ser um Mac.

### Fase 3: Claude Code e git (T8, T9)

- [ ] Instalar o Claude Code pelo repositório apt oficial (canal `stable`).
- [ ] Login pelo `orca account add --agent claude` ou pelo fluxo de copiar a URL e colar o código. (**T8**)
- [ ] Abrir uma sessão longa pelo Orca do Mac e ver que não pede login de novo.
- [ ] Acesso git: chave SSH própria do servidor com acesso aos repositórios (ou deploy key por repositório) e `gh auth login`. (**T9**)

**Pronto quando:** uma sessão do Claude no servidor, aberta pelo Orca do Mac, clona um repositório de teste, faz commit numa branch e abre um PR.

### Fase 4: o hub conversa com o Orca do servidor (T3a, T3b, T3c, T2)

- [ ] Node 22, clone do `hub-tasks` (deploy key só de leitura) e `npm ci`.
- [ ] Script `scripts/orca-check.ts` (a escrever): roda os 9 métodos do `orca.ts` com `ORCA_BIN=/usr/bin/orca-ide` e compara o formato do JSON. (**T3a**)
- [ ] `worktree ps` com o Claude trabalhando e parado. (**T3b**)
- [ ] Telas reais do servidor passando pelo `classificarTela`: ocioso, ocupado, aguardando, limite. (**T3c**)
- [ ] Você digitando no Orca do Mac e o hub lendo a mesma tela. (**T2**)

**Pronto quando:** o script passa e as quatro classificações batem.

### Fase 5: ajustes no código do hub

Mudanças pequenas, na `main`, com a rotina de sempre (tsc, reinício, commit):

- [ ] **Fase 7 da v1:** unidade systemd do hub; ao subir, esperar o `orca status` ficar pronto e mandar "Hub online" no Telegram.
- [ ] **Pasta-mãe dos ambientes configurável** (hoje `~/Documents/FUNIFIER` e `DAC`, `fluxo.ts:816`).
- [ ] **Batimento (heartbeat):** o hub manda um sinal de saída a cada N minutos para um monitor externo, que avisa se ele parar. É só conexão de saída, sem abrir porta. Escolher o serviço na hora.
- [ ] **I13:** remover a pasta de `runs/` quando ela ficar vazia.
- [ ] `apps.yaml` próprio do servidor via `HUB_APPS_FILE`, com os caminhos do servidor.
- [ ] **Login do Funifier PM pelo Telegram:** `/pm_login` manda o link; o João faz o login no celular; o navegador tenta abrir `localhost:53682/callback?code=…` e falha (não há nada no celular nessa porta); o João copia esse endereço e cola no chat; o hub extrai o `code` e conclui o login. O `code` sozinho não serve para nada: o `code_verifier` (PKCE) fica só no hub.

**Pronto quando:** o hub sobe pelo systemd no servidor, com um bot de teste (não o @JoaoTaskBot), e manda "Hub online".

### Fase 6: ensaio com o sandbox (T3, T5, T6, T7, T10, T11, T12)

Com um **bot de teste**, para não disputar o long polling com o hub do Mac:

- [ ] Login do Funifier PM pelo Telegram, no celular (túnel SSH como reserva). (**T10**)
- [ ] Task do sandbox do começo ao Encerrar. (**T3**)
- [ ] Medir memória e CPU com 2 ou 3 sessões e um servidor de dev. (**T5**)
- [ ] Abrir o front do servidor de dev no navegador do Mac **e do celular** pelo Tailscale. (**T6**)
- [ ] Link público temporário de um servidor de dev (`tailscale funnel` ou similar). (**T6b**, opcional)
- [ ] Desligar o MacBook e trabalhar só pelo celular (Telegram + Orca) por um dia. (**T14**)
- [ ] Reiniciar a VM com um despacho rodando. (**T7**)
- [ ] Reiniciar só o `orca serve`. (**T11**)
- [ ] Fechar a tampa do Mac com tasks rodando. (**T12**)

**Pronto quando:** todos passam, ou têm um contorno documentado.

### Fase 7: virada

1. Clonar os repositórios reais no servidor.
2. Parar o hub do Mac (`pkill`) e confirmar que ele parou.
3. Copiar `data/hub.db`, `data/oauth/` e `regras/` pelo Tailscale (`scp`). Copiar o cofre e **rotacionar as credenciais em seguida** (ver [segurança e dados](../v2/seguranca-e-dados.md)).
4. Subir o hub do servidor com o token do @JoaoTaskBot.
5. Acompanhar por uma semana.

**Plano de volta:** parar o hub do servidor e subir de novo o do Mac. O banco do Mac fica guardado como estava na virada.

---

## 4. Custos

| Item | Custo |
|---|---|
| Oracle Always Free (2 OCPU, 12 GB, até 200 GB de disco) | R$ 0 |
| Tailscale | Personal R$ 0 no piloto; **Standard US$ 8/mês a partir da virada** (D-S2) |
| Monitor do batimento | Plano grátis (a escolher) |
| Plano B: Hetzner 8 GB | Poucos euros por mês (conferir o preço atual) |
| Claude Code | Já é a assinatura atual do João |

## 5. Riscos principais

1. **Orca no celular sem o Mac (T14) falhar:** é imprescindível. Contorno: app de SSH no celular + tmux para ver as sessões; reavaliar.
2. **Oracle recuperar ou desligar a VM:** backup diário do `data/` e o script da fase 1 pronto para a Hetzner.
3. **Atualizar o Orca mata as sessões** (#15956): só atualizar sem despacho ativo, e o hub deve avisar antes.
4. **Vazamento de memória do Claude Code:** limite por terminal (fase 2) e acompanhamento no T5.
5. **Credenciais no servidor:** o disco da Oracle é cifrado em repouso pelo provedor, mas o cofre continua em texto puro para quem tiver acesso à VM. Vale a [seção 0 de segurança e dados](../v2/seguranca-e-dados.md#0-ponto-de-atenção-principal).
