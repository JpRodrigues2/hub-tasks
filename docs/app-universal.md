# App universal e onboarding

O produto que vem depois do hub do João: qualquer colaborador da Funifier instala o hub e, em poucos minutos, recebe as
próprias tasks no Telegram e as despacha para sessões do Claude Code, com as mesmas proteções. É a etapa 2 do
[plano](plano.md). Decisões citadas em [decisões](decisoes.md).

## 1. Premissas

- Cada colaborador tem a própria conta do Claude Code, o Orca, acesso aos repositórios e às ferramentas de gestão.
- Cada um roda **o próprio hub, com o próprio bot** (D-A1, D-A2).
- O colaborador médio não edita YAML nem `.env`: a configuração é guiada.
- **Ferramentas de gestão da primeira versão:** Funifier PM, Bnexo e Jira, escolhidas no onboarding (D-A16).

## 2. Dois modos (D-A18)

| | Local | Servidor do usuário |
|---|---|---|
| Hub e sessões | No computador, que precisa ficar ligado | Numa VPS do usuário, 24 h |
| Executor | Orca local | Orca sem tela no servidor (pareado com Mac e celular) |
| Cofre | Keychain | Arquivo cifrado + `systemd-creds` |
| Serviço | LaunchAgent | systemd |

Mesmo código: o modo só muda quais adaptadores o `main.ts` liga. **O hub não escolhe nem cria a VPS:** entregamos um
documento com requisitos (ARM/x86, memória, Ubuntu, custo, o que a Oracle grátis exige) e o usuário cria, sozinho ou
com o Claude Code dele. O modo servidor já roda no piloto do João ([servidor](servidor.md)).

## 3. Onboarding (`hub init`)

Pedido de 03/11/2026, depois da primeira subida na Oracle, que funcionou mas teve 17 atritos
([A1–A17](servidor.md#atritos-a1a17)).

**Canal:** assistente no terminal (`hub init`). O Claude Code pode ser copiloto (lê o `hub diagnostico`, nunca digita
segredos). O Telegram serve para o depois: o que falta, QR de pareamento, projetos.

**Passos:**
1. **Pré-requisitos:** Node, Orca, Claude Code; no modo servidor, o assistente começa quando a VPS já responde por SSH.
2. **Modo:** local ou servidor.
3. **Telegram:** criar o bot no BotFather, receber o token direto (nunca pelo chat) e descobrir o chat id pelo `/start`.
4. **Ferramentas de gestão:** o usuário marca quais usa (Funifier PM, Bnexo, Jira). Só as marcadas são configuradas:
   login (OAuth quando houver), projetos e catálogo. Dá para adicionar outra depois.
5. **Identidade do Git** (A16): nome, e-mail, chave SSH e login do `gh` **por espaço**, nunca globais, porque a mesma
   pessoa costuma ter conta corporativa e pessoal (B27). Vale no Mac e no servidor (`agente` e `hub`).
6. **Repositórios e catálogo:** acha os repositórios, liga cada projeto a um, gera o `apps.yaml`.
7. **Regras de trabalho:** copia o modelo, editável depois pelo `/regras`.
8. **Serviço, cofre e pareamento:** sobe o serviço; no servidor, cria o cofre, guarda a cópia de recuperação e mostra
   o QR code do pareamento do Mac e do celular.
9. **Teste:** "Hub online" no Telegram e uma task de exemplo no sandbox.

**O que o assistente garante:** um ponto de partida só; lista do que falta (✅/⬜) e retoma de onde parou; confere
cada passo de verdade (ex.: a porta 22 fechou mesmo); segredos nunca passam pelo chat; nada pelo console da nuvem;
erros que dizem o próximo passo.

**No mesmo pacote:** a listagem de tasks igual à do PM ([B20](backlog.md#b20)), porque é a primeira tela que o
usuário novo vê depois de configurar.

## 4. O que é pessoal na v1 e precisa sair do código

| Hoje | Na v2 |
|---|---|
| Bnexo obrigatório (I3) | Uma das ferramentas escolhidas no onboarding |
| Empresas `funifier`/`dac` e pastas `~/Documents/FUNIFIER`, `DAC` (I4) | "Espaços" configuráveis: pasta-mãe, ferramenta, regras e conta git ([decisões](decisoes.md#decisões-de-processo-do-joão)) |
| Servidores de gamificação que o João usa | Lista configurável |
| `apps.yaml` e `.env` escritos à mão | Gerados pelo `hub init` |

## 5. Proteções de fábrica

Ligadas por padrão, sem o colaborador precisar saber delas: status no PM só "em progresso" e "concluída" com
confirmação; nunca comenta nem põe em revisão; sessões em `--permission-mode auto`; commits sem coautor de IA; só o
chat do dono é atendido; credenciais só pelo broker; arquivos locais nos repositórios só via `.git/info/exclude`.

## 6. Distribuição e suporte (D-A19 a D-A21, em aberto)

- **Mac:** Homebrew, depois `.pkg` assinado. **Servidor:** script de instalação para Ubuntu LTS.
- **Site de suporte** estático: downloads, documentação, vídeos e aviso de versão nova. Nunca recebe credenciais,
  tasks ou código dos usuários.
- **Piloto:** o João no próprio servidor → 1 ou 2 colegas acompanhados → equipe.

## 7. Riscos

- Papel `member` no PM consegue mudar status? (D-A4)
- Aprovação da liderança da Funifier e quem dá suporte (D-A8).
- Contas e limites do Claude variam por pessoa.
- **SaaS** (D-A17, não é escopo): se um dia existir, a nuvem seria só o plano de controle; sessões e credenciais das
  gamificações continuam na máquina de cada um.
