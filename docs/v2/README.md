# Hub de Tasks — v2

Visão geral e ordem de trabalho da v2. A v1 é o hub de hoje ([roadmap](../roadmap/roadmap-v1.md), [backlog](../backlog/backlog-v1.md), [arquitetura](../arquitetura/arquitetura-e-codigo.md)): roda no MacBook do João, atende Funifier e DAC e conversa pelo @JoaoTaskBot.

A v2 tem duas frentes:
- **[A. Servidor](../hospedagem/servidor-nuvem.md):** o hub e as sessões do Claude rodam 24 h num servidor; o Orca do MacBook vê e usa essas mesmas sessões.
- **[B. App universal](app-universal.md):** o hub vira um pacote instalável e configurável, só com as funcionalidades da Funifier, para todos os colaboradores.

Legenda das decisões: 🟡 em aberto · ✅ decidida · ❌ descartada. Cada decisão tem um id (D-S para o servidor, D-A para o app) para citarmos nas conversas e nos commits.

---

## Ordem de trabalho

| # | Etapa | Status |
|---|---|---|
| 1 | Criar os documentos da v2 e organizar a documentação (`docs/`), com a arquitetura da v1 | ✔️ |
| 2 | Servidor: decidir escopo, testar e validar as decisões, contratar o serviço de cloud, implementar | ⬜ |
| 3 | Documentar a v1 inteira, versionar no git do João (repositório remoto) e criar a branch `v2` | ⬜ |
| 4 | Decidir tudo da v2 (app universal): fechar as decisões D-A | ⬜ |
| 5 | Implementar a v2 | ⬜ |

**Por que o servidor vem antes do app:** o servidor quase não muda o código (seção A.3 de [servidor-nuvem](../hospedagem/servidor-nuvem.md)). Resolve já o problema do PC ligado 24 h e ensina como o hub se comporta fora do MacBook, que é exatamente o que o app universal vai precisar.

**Pré-requisito comum:** a Fase 7 da v1 (LaunchAgent, reinício, espera do Orca, aviso "Hub online"). Num servidor sem ninguém olhando, o hub precisa subir e se recuperar sozinho. A Fase 7 entra na etapa 2.
