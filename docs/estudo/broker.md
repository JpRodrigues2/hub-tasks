# Estudo: o broker (gateway MCP do hub)

Para estudar depois que o backend estiver pronto. O desenho, a política e o que descobrimos sobre a Funifier estão em
[segurança, seção 3](../seguranca.md#3-o-broker-c3).

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
