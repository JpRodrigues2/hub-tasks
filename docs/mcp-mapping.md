# Mapeamento dos MCPs das ferramentas de gestão

Levantado em 2026-10-14 com `scripts/mcp-explore.ts` (lista completa de ferramentas e schemas em `data/mcp-tools-<nome>.json`, fora do git) e testado com `scripts/mcp-call.ts` (só leitura).

| | Funifier PM | Bnexo (DAC) |
|---|---|---|
| Servidor | `pm-funifier-mcp 0.1.0+62ef07c31e11` | `dac-capital-essencial 1.0.0` |
| URL | `FUNIFIER_PM_MCP_URL` = `https://pm-mcp.funifier.com/mcp` | `BNEXO_MCP_URL` (bundle `/mcp/essencial`) |
| Transporte | Streamable HTTP | Streamable HTTP |
| Autenticação | OAuth 2.1 + PKCE, registro dinâmico de cliente (`/register`), `refresh_token`. Login no navegador **uma vez**; tokens em `data/oauth/funifier-pm.json` (600, fora do git) e renovados sozinhos pelo SDK. Se o refresh falhar, o hub precisa avisar no Telegram para refazer o login (`npm run mcp:explore -- funifier-pm`). | `Authorization: Bearer $BNEXO_MCP_TOKEN` |
| Nº de ferramentas | 20 | 166 (inclui CRM, ponto, estoque etc.) |
| Usuário | `joao.rodrigues@funifier.com` (role `member`) | org ativa "DAC Capital" (role `member`) |

## Ferramentas por função

| Função | Funifier PM | Bnexo |
|---|---|---|
| (a) listar minhas tasks | `list_my_tasks(status?, project?, sprint?, text?, includeDone?, limit≤50, cursor?)` — paginar com `nextCursor` | `get_my_tasks(status?, priority?, project_id?, limit≤100)` — sem paginação; chamar **por status** (`pending`, `in_progress`, `suspended`, `in_validation`). Sem `status` volta tudo, inclusive concluídas. |
| (b) detalhes + comentários | `get_task(taskId)` → notas, pai/subtarefas, `comments[]`, checklist, anexos, `url` | `get_task(task_id)` → `observations` (HTML), `project_id`, `deadline`. **Não há leitura de comentários** no bundle Essencial. `list_checklist(task_id)` para subtarefas. |
| (c) mudar status | `move_task(taskId, status)` — escrita direta, sem preview | `update_task(task_id, status)` — **nunca** usar `complete_task` |
| (d) comentar | `preview_add_comment(taskId, content)` → `add_comment(taskId, content, confirmation)` (o `confirmation` do preview é obrigatório) | `add_task_comment(task_id, content)` |
| (e) listar projetos | `list_projects()` → id, nome, contagem por status | **Não existe.** Projetos só aparecem como `project_id` (UUID) em `get_task`. Nomes precisam vir do João (Fase 2). |
| (f) usuário logado | `whoami()` | Não existe; `get_my_tasks` já filtra pelo dono do token. `list_organizations()` mostra a org ativa. |

## Status

| Significado no hub | Funifier PM (`key`) | Bnexo (`status`) |
|---|---|---|
| backlog | `backlog` | — |
| pendente | `todo` (fora do workflow, mas muito usado) | `pending` |
| em progresso | `in_progress` | `in_progress` |
| suspensa | — | `suspended` (mostrar junto com pendentes) |
| **em revisão** (destino do hub ao terminar) | `review` | `in_validation` |
| concluída (**o hub nunca usa**) | `done` (credita pontos) | `completed` |
| cancelada | — | `cancelled` |

A fonte de verdade dos status do PM é `list_catalogs()`. Ler na inicialização e falhar alto se `review` sumir.

## Atraso
- **Funifier PM:** `due` (ISO, ex.: `2026-10-16T03:00:00.000Z` = dia 16 em BRT) `< agora` e status ≠ `done`.
- **Bnexo:** `deadline < agora` e status ∉ {`completed`, `cancelled`}. Não usar `get_overdue_tasks`: ele devolve as atrasadas **da organização inteira**, não só as do João.
- Prazos vêm como meia-noite de Brasília (03:00Z); comparar por data em `America/Sao_Paulo`.

## Links
- **Funifier PM:** `get_task` devolve `url` (`https://pm.funifier.app/project/<proj>/task/<task>`); dá para montar o mesmo formato a partir de `list_my_tasks`.
- **Bnexo:** não há URL na resposta nem deep-link de task. Usar o link do projeto: `https://app.bnexo.com.br/projects/<project_id>` (painel geral: `https://app.bnexo.com.br/my-space`).

## Contagem em 2026-10-14
- **Funifier PM:** 2 `in_progress`, 46 `done` (ambas ativas são do "PlayDPS Suporte").
- **Bnexo:** 1 `pending`, 7 `in_progress`, 39 `completed`, 0 `suspended`/`in_validation`/`cancelled`. As 8 ativas estão em 4 projetos:
  - `e2d760e0-8ec7-4cf9-8fda-84080e5ac790` — 5 tasks "Refactor :: Menu …"
  - `7a4b4e84-3020-4fbe-95a4-f636f9cfca4e` — "T-04 · Módulo de auditoria randômica…"
  - `69b0abb8-8fdd-461c-bd1e-8ab404efd27b` — "Exibir usuário que receberá o primeiro acesso…"
  - `08d793a7-9631-4012-ae1a-4b845b197738` — "Corrigir botão Exportar…" (o mesmo da task de CNPJ no credenciamento → provavelmente pecas-c4)

## Projetos do Funifier PM (`list_projects`)
| id | nome |
|---|---|
| `69d8f4b5d95d627e2bd7bdd8` | Assban |
| `proj-mtsz38dndein` | CONTA COMIGO BRB |
| `proj-mud9xwnid7mn` | Evolução :: Park Funifier |
| `proj-mud9vrrdzsr8` | Funifier Studio :: Evolução |
| `proj-mtdi8n12yfs0` | PlayDPS Suporte |
| `69d7de2428fe032bb252954f` | Plugin do Teams |
| `6a7e02bd77a7a572bce1988d` | Reconheça BRB |
| `6a0280e990c05316483cd7c4` | Rota Viva |
| `69f2470f90c053164823e2f4` | Teensmart |

## Observações
- Toda resposta do PM termina com um texto "Versão das tools no servidor: …" depois do JSON; o adaptador deve usar `structuredContent` (ou o primeiro bloco de texto) e registrar em log se a versão mudar (hoje `62ef07c31e11`).
- Os previews do PM (`preview_*`) são leitura e servem para testar sem gravar.
