# Fase 0 — Reconhecimento (2026-10-14)

## Ambiente
- macOS 26.6.2 (arm64), Node v22.18.0, git 2.54.0
- Orca 1.4.220 — CLI em `/Applications/Orca.app/Contents/Resources/bin/orca`, `orca status --json` → runtime `ready`
- Comandos necessários existem: `terminal list|read|send|wait|create`, `worktree ps|set` (`--workspace-status in-review`, `--comment`).
  `--unread` **não** aparece no usage de `worktree set` nesta versão — verificar na Fase 6.

## Diferenças em relação ao ROADMAP
- Pastas reais: `~/Documents/FUNIFIER` (maiúsculo), `~/Documents/HUB`, `~/Documents/Contexto` (não `Context`). APFS é case-insensitive, mas o `apps.yaml` deve usar os caminhos canônicos.
- `Contexto/` **não** é repositório git.
- `~/Documents/mcp-tests/` está vazio; não há `.mcp.json` na raiz de `~/Documents`.

## Orca — repos registrados
| Repo | Pasta | Remote |
|---|---|---|
| vista | DAC/vista | daccapital/vista |
| pecas-c4 | DAC/pecas-c4 | daccapital/pecas-c4 |
| assban-cursos-frontend | FUNIFIER/assban-cursos-frontend | funifierinc/… |
| doc | FUNIFIER/doc | funifierinc/doc |
| funifier-mcp | FUNIFIER/funifier-mcp | funifierinc/… |
| funifier-service | FUNIFIER/funifier-service | funifierinc/… |
| funifier-story-player | FUNIFIER/funifier-story-player | funifierinc/… |
| moderation-text-analyzer | FUNIFIER/moderation-text-analyzer | funifierinc/… |
| playdps-app | FUNIFIER/playdps-app | funifierinc/… |
| rota-viva | FUNIFIER/rota-viva | funifieragentdev01/rota-viva |
| teensmart-app | FUNIFIER/teensmart-app | funifierinc/… |
| brb-reconheca | FUNIFIER/brb-reconheca | funifierinc/… |
| IDB_Jovem-* (3) | facul/GCES/… | idbjovemnacional/… (fora do escopo) |
| HUB | HUB | (pasta, sem git) |

## Orca — terminais vivos
| Pasta | Título | Agente |
|---|---|---|
| FUNIFIER/brb-reconheca | Dashboard executivo gamificação | claude |
| (sem worktree — pasta `~/Documents`) | Funifier-pm-mcp e MCP essencial | claude |
| HUB | ROADMAP_HUB.md Fase 0 | claude |
| DAC/vista | VISTA | claude |
| DAC/vista | Terminal 2 | shell |
| DAC/pecas-c4 | credenciamento-poc-adjustments | claude |
| FUNIFIER/playdps-app | FINDES badges missing … | claude |

Obs.: o terminal aberto em `~/Documents` vem com `worktreePath` vazio — redescoberta "pela pasta" precisa tratar esse caso.

## Pastas das empresas (1º nível)
**FUNIFIER**
| Pasta | Git | Remote | No Orca |
|---|---|---|---|
| assban-cursos-frontend | sim | funifierinc/assban-cursos-frontend | sim |
| assban-studio | não (tem CLAUDE.md, .mcp.json funifier) | — | não |
| assban | não (backups/, migracao/) | — | não |
| brb-contacomigo-dashboard | sim | funifierinc/brb-contacomigo-dashboard | **não** |
| brb-reconheca | sim | funifierinc/brb-reconheca | sim |
| doc | sim | funifierinc/doc | sim |
| funifier-mcp | sim | funifierinc/funifier-mcp | sim |
| funifier-service | sim | funifierinc/funifier-service | sim |
| funifier-story-player | sim | funifierinc/funifier-story-player | sim |
| moderation-text-analyzer | sim | funifierinc/moderation-text-analyzer | sim |
| playdps-app | sim | funifierinc/playdps-app | sim |
| playdps-studio | não (tem CLAUDE.md, .mcp.json funifier) | — | não |
| rota-viva | sim | funifieragentdev01/rota-viva | sim |
| teensmart-app | sim | funifierinc/teensmart-app | sim |

**DAC**
| Pasta | Git | Remote | No Orca |
|---|---|---|---|
| bots | sim | pipetechsoftware/bots | não |
| executive-panel | sim | pipetechsoftware/executive-panel | não |
| lp-plugai | sim | pipetechsoftware/lp-plugai | não |
| pecas-c4 | sim | daccapital/pecas-c4 | sim |
| rdc-app-jhipster | sim | daccapital/rdc-app-jhipster | não |
| rdc-app | sim | daccapital/rdc-app | não |
| vista | sim | daccapital/vista | sim |

## Contexto
- Estrutura: `apps/C4/{pecas-c4,vista}`, `apps/FUNIFIER/{assban,brb,playdps,teensmart}`
- CONTEXT.md existente: **só** `apps/C4/pecas-c4/CONTEXT.md`. As demais pastas estão vazias.

## MCPs (sem segredos)
- **Funifier PM:** MCP `pm` em escopo de usuário no `~/.claude.json`, `type: http`, `url: https://pm-mcp.funifier.com/mcp`, sem headers → autenticação provavelmente via OAuth do Claude Code (o hub vai precisar de outra forma de autenticar: token/API key).
- **Bnexo:** nenhuma configuração encontrada (`~/.claude.json`, `.mcp.json`, Claude Desktop).
- Funifier backend: `playdps-studio/.mcp.json` e `assban-studio/.mcp.json` usam `npx` com env `FUNIFIER_API_KEY`, `FUNIFIER_SECRET_KEY`, `FUNIFIER_SERVER_URL`, `FUNIFIER_PROJECT_ROOT`.
- Outros: `penpot` no projeto `DAC/pecas-c4`.
