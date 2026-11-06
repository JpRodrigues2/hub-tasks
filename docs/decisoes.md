# Decisões

Todas as decisões da v2 numa lista só. **D-S** são do servidor do João; **D-A**, do app universal (o produto para
outros colaboradores). ✅ decidida · 🟡 em aberto · ❌ descartada.

## Servidor (D-S)

| Id | Assunto | Decisão |
|---|---|---|
| D-S1 ✅ | Onde hospedar | Oracle Always Free (VM ARM, Ubuntu 24.04); plano B: Hetzner (02/11) |
| D-S2 ✅ | Rede entre Mac, celular e servidor | Tailscale: plano Personal no piloto, Standard (US$ 8/mês) a partir da virada, porque o grátis é só para uso não comercial |
| D-S3 ✅ | Servidor só do João ou da equipe | Só do João; cada colaborador cuida da própria infra |
| D-S4 🟡 | Contas do Claude no servidor | `claude login` do usuário `agente` (funcionou); `orca account` não testado |
| D-S5 🟡 | Agendamento | Manter o cron do hub; reavaliar as automações do Orca depois |
| D-S6 ✅ | Código das empresas fora do Mac | Autorizado: ambiente isolado, só o João acessa, conta GitHub pessoal dele |
| D-S7 🟡 | Backup | Snapshot do provedor + cópia de `dados/` com o cofre cifrado |

## App universal (D-A)

| Id | Assunto | Decisão |
|---|---|---|
| D-A1 ✅ | Um hub por pessoa ou central | Um por colaborador, cada um com a própria infra |
| D-A2 ✅ | Bot do Telegram | Um bot por colaborador |
| D-A3 ✅ | Executor | Orca (único com app no celular pareado ao servidor); a porta `Executor` deixa o tmux como plano B |
| D-A4 🟡 | Acesso ao Funifier PM | OAuth pessoal (como hoje); confirmar se o papel `member` basta |
| D-A5 🟡 | Cofre no Mac | Keychain (já implementado); ampliada pela D-A14 e D-A15 |
| D-A6 ❌ | Distribuição | Substituída pela D-A19 |
| D-A7 🟡 | Nome do produto | — |
| D-A8 🟡 | Aprovação da Funifier e suporte | Só necessária quando formos distribuir |
| D-A9 ✅ | Passagem da v1 para a v2 | Em passos: primeiro o mínimo para hospedar, depois o resto |
| D-A10 ✅ | Chat além do Telegram | Telegram agora; Teams depois (porta `Notificador`) |
| D-A11 ✅ | Framework | TypeScript + bibliotecas focadas, sem NestJS. Reavaliar se outras pessoas forem manter o código |
| D-A12 ✅ | Arquitetura | Hexagonal (portas e adaptadores), já na etapa 1 ([arquitetura](arquitetura.md)) |
| D-A13 ✅ | Banco e ORM | Prisma + SQLite; Postgres só se virar SaaS. Falta o teste P1 |
| D-A14 ✅ | Uso das credenciais | Cofre cifrado + broker: o agente nunca vê a chave ([segurança](seguranca.md)) |
| D-A15 🟡 | Entrada das credenciais | Fora do chat: OAuth quando houver, senão pelo `hub init` |
| D-A16 ✅ | Terceira ferramenta de gestão | Jira (junto com Funifier PM e Bnexo, escolhidas no onboarding) |
| D-A17 🟡 | Modelo futuro | Self-hosted agora; SaaS (nuvem + runner local) registrado para depois |
| D-A18 ✅ | Onde o hub roda | Dois modos, escolhidos na instalação: local ou servidor do usuário |
| D-A19 🟡 | Distribuição | Proposta: Homebrew no Mac, script para Ubuntu no servidor |
| D-A20 🟡 | Site de suporte | Proposta: site estático com downloads, docs, vídeos e aviso de versão nova |
| D-A21 🟡 | Sistemas operacionais | Proposta: macOS (local) e Linux (servidor); Windows depois |
| D-A22 ✅ | CI/CD | GitHub Actions: CI em todo push ✔️; deploy automático no backlog |

## Decisões de processo (do João)

- **Mudar status no PM:** "em progresso" ao despachar; "concluída" só com Sim no Encerrar; nunca "em revisão" (B01–B04).
- **Comentar no PM:** nunca, sem comando explícito (B02).
- **Históricos do Mac:** foram para o servidor como estavam, com as credenciais antigas (04/11, exceção consciente).
  Usuários novos nunca terão credenciais nos históricos.
- **VPS:** o hub não escolhe nem cria; entregamos um documento de requisitos (04/11).
- **Onboarding** só depois do backend da etapa 1 (04/11).
- **Broker só no servidor** (06/11): no modo local (Mac) a sessão continua recebendo o `credenciais.json`; não entra
  no lançamento (B21).
- **Pastas sem git:** "Só criar a pasta" cria um git só local, porque o Orca só aceita repositórios (02/11).
- **Várias contas git por pasta-mãe** (app universal): cada pasta-mãe vira um "espaço" com conta, chave SSH e
  `includeIf` no `~/.gitconfig` do agente. Substitui as empresas fixas (I3/I4).
