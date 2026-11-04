# Estudo: o broker (gateway MCP do hub)

Para estudar depois que o backend estiver pronto. O desenho geral está em [segurança e dados, C3](../v2/seguranca-e-dados.md);
aqui ficam o que descobrimos ao implementar e as perguntas para o estudo.

## O que descobrimos (04/11/2026)

**Como as sessões falam com a Funifier hoje.** Pelo `funifier-mcp` (pacote npm da própria Funifier), um servidor MCP que
a sessão do Claude inicia sozinha. Ele pega as credenciais de três jeitos:
1. `funifier.json` na pasta do projeto (`apiKey`, `secretKey`, `serverUrl`);
2. variáveis de ambiente `FUNIFIER_API_KEY`, `FUNIFIER_SECRET_KEY`, `FUNIFIER_SERVER_URL`;
3. a ferramenta `funifier_connect`, que recebe a chave **como argumento**: a chave entra no histórico da conversa.

Nos projetos do Mac as credenciais estão espalhadas: `funifier.json` e `.mcp.json` ignorados pelo git, um `.mcp.json`
**versionado** (assban-cursos-frontend), e a configuração do Claude (`~/.claude.json`, bb-jogajunto).

**Autenticação na API.** Cada requisição vai com `Authorization: Basic base64(apiKey:secretKey)`: a chave inteira
viaja sempre. Existe `POST /v3/auth/token` com `client_credentials`, que devolve um token de 7 dias com o escopo da
aplicação (não testado ainda).

**As ferramentas já dizem o que fazem.** Cada uma traz as anotações do MCP `readOnlyHint` e `destructiveHint`
(ex.: `get` é só leitura; `delete` e `database` são destrutivas). O broker usa isso para classificar.

## O desenho implementado

```
sessão do Claude (usuário agente)
   │  MCP por HTTP em 127.0.0.1, com token
   ▼
broker, dentro do hub (usuário hub)  ── lê a chave do cofre ──▶ funifier-mcp filho (usuário hub, chave no ambiente)
   │  política: só gamificações de tasks em andamento;                     │
   │  destrutiva negada; escrita em produção pede confirmação no Telegram  ▼
   └─ auditoria em logs/broker.jsonl (sem valores)                    API da Funifier
```

- **Por que o broker roda como `hub` e não dentro da sessão:** um processo do mesmo usuário consegue ler o ambiente
  do outro (`/proc/<pid>/environ`). Se o `funifier-mcp` com a chave rodasse como `agente`, o Claude conseguiria ler a chave.
- **Três ferramentas em vez de dezenas:** `funifier_gamificacoes` (quais posso usar), `funifier_ferramentas` (o que dá
  para fazer) e `funifier_chamar` (faz, passando pela política). A sessão nunca recebe `funifier_connect`.
- **A autorização acaba no Encerrar:** o broker consulta o banco a cada chamada; task fora de andamento não autoriza nada.

## Perguntas para o estudo

1. O que é o MCP (Model Context Protocol)? Diferença entre transporte stdio e HTTP (Streamable HTTP).
2. O que são anotações de ferramenta (`readOnlyHint`, `destructiveHint`) e por que não são garantia de segurança.
3. Por que separar usuários Linux protege a chave e mesmo usuário não protege (`/proc/<pid>/environ`, permissões).
4. Autenticação Basic x Bearer; o que muda com um token de curta duração (`/v3/auth/token`).
5. Token do broker: por que um token fixo no `~/.claude.json` do agente basta aqui, e quando valeria um por task.
6. Como a confirmação pelo Telegram segura uma chamada esperando a resposta (promessa pendente, tempo limite).
7. Auditoria: o que registrar e o que nunca registrar.
8. Modo local (Mac): hub e sessão são o mesmo usuário; o que o broker ainda protege e o que não.
9. Por que as chaves antigas do João continuam nos históricos e o que garante que usuários novos não passem por isso.
