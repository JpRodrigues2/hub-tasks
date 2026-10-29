# Documentação do Hub de Tasks

```
docs/
├── README.md                              este índice
├── arquitetura/
│   └── arquitetura-e-codigo.md            como a v1 funciona: stack, camadas, arquivos, integrações, banco
├── roadmap/
│   └── roadmap-v1.md                      fases 0–9 da v1 (instruções originais para o Claude Code)
├── backlog/
│   └── backlog-v1.md                      ajustes B01–B19 pedidos depois do primeiro fluxo
├── referencia/
│   └── mcp-ferramentas-de-gestao.md       tools, status e particularidades do Funifier PM e do Bnexo
├── v2/
│   ├── README.md                          visão geral e ordem de trabalho da v2
│   └── app-universal.md                   Parte B: pacote instalável para os colaboradores da Funifier
└── hospedagem/
    └── servidor-nuvem.md                  Parte A: hub e sessões num servidor, Orca do Mac pareado
```

| Quero… | Leia |
|---|---|
| Entender o código | [arquitetura e código](arquitetura/arquitetura-e-codigo.md) |
| Saber o que a v1 faz e o que falta (Fases 7–9) | [roadmap](roadmap/roadmap-v1.md) |
| Ver por que algo funciona do jeito que funciona | [backlog](backlog/backlog-v1.md) (cada item tem o pedido e a decisão) |
| Mexer na integração com o PM ou o Bnexo | [referência dos MCPs](referencia/mcp-ferramentas-de-gestao.md) |
| Acompanhar a v2 | [v2](v2/README.md) → [servidor](hospedagem/servidor-nuvem.md) e [app universal](v2/app-universal.md) |

Fora de `docs/` ficam só arquivos que o hub **lê em execução**: `apps.yaml` e `regras/*.md`.
