# v2 · Parte B — App universal

Parte da [v2](README.md). Legenda: 🟡 em aberto · ✅ decidida · ❌ descartada. A estrutura atual do código está em [arquitetura e código](../arquitetura/arquitetura-e-codigo.md).

## B.1 Objetivo

Qualquer colaborador da Funifier instala o hub e, em poucos minutos, recebe as próprias tasks do Funifier PM no Telegram e as despacha para sessões do Claude Code, com as mesmas proteções da v1.

**Fica de fora:**
- regras e pastas da DAC (o Bnexo passa a ser uma das ferramentas escolhidas no onboarding, D-A16);
- configurações pessoais do João.

## B.2 Público e premissas

- **Público:** desenvolvedores da Funifier, com Mac.
- **Cada colaborador tem:**
  - a própria conta do Claude Code;
  - o Orca instalado (D-A3);
  - acesso aos repositórios;
  - acesso ao Funifier PM.
- **Execução local:** a execução é de cada pessoa (conta, repositórios, máquina). Por isso cada colaborador roda o próprio hub (D-A1).
- **Suporte:** o colaborador médio não vai editar YAML nem `.env` à mão. A configuração precisa ser guiada.

## B.3 Arquitetura

```
@funifier/hub
├─ núcleo         fluxo (resumo → seleção → conversa → fila), despacho, acompanhamento, próximos passos,
│                 lote, limpeza, banco (migrações), padrão visual das mensagens
├─ adaptadores    ferramenta de gestão: Funifier PM (incluído) · outros como plugin (ex.: Bnexo do João)
├─ executor       Orca (v2) · terminal/tmux (futuro, D-A3)
├─ interface      Telegram (v2)
└─ configuração   hub.config.yaml + apps.yaml + regras/ + cofre (Keychain)
```

A v1 já tem a interface `PmAdapter` (`src/pm/types.ts`) para as ferramentas de gestão. A v2 faz o mesmo para o executor (`Executor`, hoje a classe `Orca`) e tira do núcleo tudo o que é da DAC ou do João.

## B.4 Inventário: o que é pessoal na v1

| Onde | Hoje | Na v2 |
|---|---|---|
| `src/config.ts` | `BNEXO_MCP_URL` e `BNEXO_MCP_TOKEN` obrigatórios | Opcionais; o adaptador do Bnexo vira plugin. |
| `src/pm/bnexo.ts` | No núcleo | Plugin fora do pacote da Funifier. |
| `regras/dac.md` | No repositório | Sai; `regras/funifier.md` vira modelo padrão editável. |
| Empresas `funifier` e `dac` | Fixas no código (`fluxo.ts`, `config.ts`, `prompt.ts`) | Lista configurável; na edição Funifier, só uma. |
| `pastaAmbiente` (`fluxo.ts`) | `~/Documents/FUNIFIER` ou `~/Documents/DAC` | Pasta-mãe configurável. |
| `SERVIDORES_BASE` (`gamificacoes.ts`) | Servidores que o João usa | Lista configurável, com padrão da Funifier. |
| Textos com "João" | ~30 ocorrências em 13 arquivos (prompts, regras, mensagens) | Nome do usuário configurado. |
| `ORCA_BIN` | Caminho fixo do Mac | Detectado na instalação. |
| `apps.yaml` | Escrito à mão pelo João | Gerado pelo assistente de instalação (B.5). |
| Cofre (`data/segredos/gamificacoes.json`) | Arquivo JSON 600; cópia entregue à sessão | Porta `Cofre` (Keychain no Mac) e gateway: o agente nunca vê a chave ([segurança e dados](seguranca-e-dados.md), D-A14). |
| `TELEGRAM_CHAT_ID` | Do João | Descoberto na instalação (o colaborador manda `/start`). |
| Commits sem coautor | Regra nos `regras/*.md` | Padrão de fábrica nas regras. |

## B.5 Instalação e configuração

Assistente de instalação (`npx @funifier/hub init`, ou o equivalente pela distribuição escolhida em D-A6), num passo a passo:

1. **Pré-requisitos:** confere Node, Orca e Claude Code. Se faltar algo, explica como instalar. Nada global é instalado sem perguntar.
2. **Nome:** como o hub chama o colaborador nos prompts e nas mensagens.
3. **Telegram:** guia a criação do bot no BotFather, recebe o token e pede para mandar `/start` no bot; o assistente descobre o chat id sozinho.
4. **Funifier PM:** abre o login OAuth do PM no navegador (como o `npm run pm:login` da v1) e testa com `whoami`. O colaborador não precisa copiar token.
5. **Repositórios:** procura repositórios git na pasta-mãe (padrão `~/Documents/FUNIFIER`) e mostra a lista.
6. **Projetos:** lista os projetos do Funifier PM do colaborador e liga cada um a um repositório. Gera o `apps.yaml`.
7. **Regras:** copia o modelo `regras/funifier.md`, que dá para editar depois pelo `/regras`.
8. **Serviço:** instala o LaunchAgent (o hub sobe com o Mac e se recupera).
9. **Teste:** manda "Hub online" no Telegram e uma task de exemplo no sandbox.

Depois da instalação, tudo o que já é configurável pelo Telegram na v1 continua lá: `/projetos`, `/regras`, `/gamificacoes`, ambiente novo (B15).

### Arquivos de configuração (proposta)

| Arquivo | Conteúdo | No git? |
|---|---|---|
| `~/.funifier-hub/hub.config.yaml` | Nome, pasta-mãe, horário do resumo, fuso, permissão das sessões, travas (escrita, comentários) | Não, é da máquina. |
| `~/.funifier-hub/apps.yaml` | Apps, pastas, projetos, gamificações (só ids de credencial) | Não. |
| `~/.funifier-hub/regras/` | Regras de trabalho | Não. |
| Keychain do macOS | Token do Telegram, tokens OAuth do PM, credenciais de gamificação | Nunca. |
| `~/.funifier-hub/data/` | Banco, runs, logs | Não. |

O código do pacote fica separado dos dados do colaborador: atualizar o pacote nunca mexe na configuração.

## B.6 Proteções padrão de fábrica

Herdadas da v1 e ligadas por padrão, sem o colaborador precisar saber delas:
- **Ferramenta de gestão:** o hub muda o status (em progresso no despacho; concluída só com confirmação no Encerrar). **Comentários desligados.** Nunca coloca a task em revisão.
- **Sessões:** `--permission-mode auto`. bypass recusado mesmo se configurado.
- **Commits e PRs:** sem `Co-Authored-By` nem menção a IA. Sem push na branch principal sem perguntar. PR sem merge.
- **Gamificações:** só altera as autorizadas na task; credenciais só no cofre e na cópia da task.
- **Telegram:** só responde ao chat do colaborador; mensagens com credenciais são apagadas.
- **Repositórios:** arquivos locais só via `.git/info/exclude`.

## B.7 Distribuição e atualização (D-A6 ❌, ver D-A19 em [implantação](implantacao.md))

| Opção | Prós | Contras |
|---|---|---|
| Repositório privado na org da Funifier + `git clone` + `npm run setup` | Simples; nada para publicar. | Atualizar é `git pull`, mais manual. |
| Pacote npm privado (GitHub Packages) + `npx @funifier/hub init` | Instalação e atualização com um comando. | Precisa de token do GitHub Packages em cada máquina. |
| Homebrew tap | Familiar para dev de Mac; `brew upgrade`. | Mais uma coisa para manter. |
| App com janela (Electron ou Tauri) | Mais amigável. | Muito mais manutenção; o Telegram já é a interface. Fica para depois. |

**Atualização:** o hub avisa no Telegram quando houver versão nova. As migrações do banco já existem (`PRAGMA user_version`) e continuam valendo.

## B.8 Piloto

1. O João usa a v2 no próprio servidor ([Parte A](../hospedagem/servidor-nuvem.md)) com a configuração nova.
2. Instalação com 1 ou 2 colegas, acompanhando o assistente ao vivo.
3. Ajustes, documentação de uso (README para o colaborador), depois abertura para a equipe.

## B.9 Riscos

- **Acesso ao Funifier PM por colaborador:** o login é OAuth (cada um entra com a própria conta). Confirmar que o papel `member` basta para listar as próprias tasks e mudar status (D-A4).
- **Orca:** se parte da equipe não usa o Orca, o executor por terminal vira obrigatório (D-A3).
- **Contas do Claude:** cada colaborador paga ou recebe a própria; limites de uso variam.
- **Aprovação da Funifier:** é uma ferramenta que mexe nas tasks e no código da empresa. Validar com a liderança antes do piloto (D-A8).
- **Suporte:** quem atende o colaborador quando algo quebra?

## B.10 Decisões do app universal

| Id | Decisão | Opções | Recomendação |
|---|---|---|---|
| D-A1 ✅ | Um hub por colaborador ou um hub central | Por colaborador · central multiusuário | **Por colaborador**, cada um com a própria infra (02/11/2026). |
| D-A2 ✅ | Bot do Telegram | Um bot por colaborador · bot único da Funifier | **Um bot por colaborador** (02/11/2026). |
| D-A3 🟡 | Executor | Só Orca · Orca + terminal/tmux | Só Orca na v2, com a interface `Executor` pronta para o terminal. |
| D-A4 🟡 | Acesso ao Funifier PM | OAuth pessoal · conta de serviço | OAuth pessoal (já é como a v1 funciona; cada um vê as próprias tasks). |
| D-A5 🟡 | Cofre | Keychain · arquivo 600 | Keychain no Mac. Ampliada em D-A14 (uso) e D-A15 (entrada). |
| D-A6 ❌ | Distribuição | Repositório · npm privado · Homebrew · app | Substituída pela D-A19 ([implantação](implantacao.md)). |
| D-A7 🟡 | Nome do produto | — | — |
| D-A8 🟡 | Quem aprova na Funifier e quem dá suporte | — | Aprovar = a liderança autorizar o uso da ferramenta pelos colaboradores (código da empresa, contas do Claude, custo). Só necessária quando formos distribuir. |
| D-A9 ✅ | Como o João passa da v1 para a v2 | v2 + plugin · v1 em paralelo | **Em passos:** primeiro refatorar o mínimo da v1 para hospedar e fazer o teste na nuvem; depois seguir com o resto dos ajustes e funcionalidades da v2 (02/11/2026). |
| D-A10 ✅ | Interface além do Telegram (Slack, Teams) | Só Telegram · outra | **Telegram agora; Teams depois** (02/11/2026). A porta `Notificador` da arquitetura hexagonal é o que permite isso. |
| D-A11 ✅ | Framework | NestJS · TypeScript + bibliotecas focadas | **TypeScript + bibliotecas focadas** (02/11/2026, [arquitetura v2](arquitetura-v2.md#5-framework-e-ferramentas-d-a11-)). |
| D-A12 ✅ | Arquitetura | Implícita (v1) · hexagonal por módulos | **Hexagonal**, começando já na etapa 1 da v2 (02/11/2026; [arquitetura v2](arquitetura-v2.md#3-arquitetura-proposta-hexagonal-portas-e-adaptadores-por-módulos-d-a12-)). |
| D-A13 a D-A17 | Banco e ORM ✅, credenciais ✅, Jira ✅, SaaS 🟡 | — | Ver [segurança e dados](seguranca-e-dados.md#7-decisões). |
| D-A18 a D-A21 | Modos local e servidor ✅, distribuição, site, sistemas operacionais 🟡 | — | Ver [implantação](implantacao.md#8-decisões). |
| D-A22 ✅ | Integração e entrega contínuas | Manual · GitHub Actions | **GitHub Actions:** CI (tipos + testes) em todo push; deploy automático da `v2` no servidor pelo Tailscale, depois do CI verde (02/11/2026, [plano v2](plano-v2.md)). |
