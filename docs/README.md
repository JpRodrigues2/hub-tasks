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
├── estudo/
│   └── etapa-1.md                         estudo antes de implementar: hexagonal, cofre e broker, Tailscale, systemd, Docker, Orca serve
├── v2/
│   ├── README.md                          visão geral e ordem de trabalho da v2
│   ├── app-universal.md                   Parte B: pacote instalável para os colaboradores da Funifier
│   ├── arquitetura-v2.md                  impeditivos, arquitetura hexagonal, padrões, framework
│   ├── seguranca-e-dados.md               credenciais, banco, SaaS, ferramentas de gestão
│   ├── implantacao.md                     modo local ou servidor do usuário, distribuição, site de suporte
│   └── plano-v2.md                        etapa 1 (o crítico) e etapa 2 (o resto), com o andamento
└── hospedagem/
    ├── servidor-nuvem.md                  Parte A: hub e sessões num servidor, Orca do Mac pareado
    ├── plano-execucao.md                  respostas pesquisadas, provedores grátis e o plano por fases
    └── ensaio-local.md                    testes do servidor numa VM Ubuntu ARM no Mac (Lima) e aprendizados
```

| Quero… | Leia |
|---|---|
| Entender o código | [arquitetura e código](arquitetura/arquitetura-e-codigo.md) |
| Saber o que a v1 faz e o que falta (Fases 7–9) | [roadmap](roadmap/roadmap-v1.md) |
| Ver por que algo funciona do jeito que funciona | [backlog](backlog/backlog-v1.md) (cada item tem o pedido e a decisão) |
| Mexer na integração com o PM ou o Bnexo | [referência dos MCPs](referencia/mcp-ferramentas-de-gestao.md) |
| Estudar a etapa 1 antes de implementar | [estudo da etapa 1](estudo/etapa-1.md) |
| Acompanhar a v2 | [v2](v2/README.md) → [servidor](hospedagem/servidor-nuvem.md) ([plano](hospedagem/plano-execucao.md)), [app universal](v2/app-universal.md), [arquitetura v2](v2/arquitetura-v2.md), [segurança e dados](v2/seguranca-e-dados.md), [implantação](v2/implantacao.md) |

Fora de `docs/` ficam só arquivos que o hub **lê em execução**: `apps.yaml` e `regras/*.md`.
