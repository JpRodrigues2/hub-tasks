# Estudo: a arquitetura hexagonal do hub, como ficou

Para estudar depois que o backend estiver pronto. A proposta está em [arquitetura da v2](../v2/arquitetura-v2.md);
aqui fica o que foi feito em 05/11/2026 e as perguntas para o estudo.

## O mapa

```
src/dominio/            regras puras: estados da seleção e do despacho, leitura da tela, política do broker
src/aplicacao/
  portas.ts             o que o hub precisa de fora: Executor, Notificador, repositórios, Cofre, GitProjetos, CatalogoApps…
  despacho/             Despachar (fila → sessão) · Monitor (sessão → resultado) · ProximosPassos (instrução, PR, encerrar)
  selecao/              ResumoDiario (marcar tasks) · ConfigurarSelecao (a conversa) · Ambientes (projeto sem app)
src/adaptadores/
  persistencia/sqlite   todo o SQL de seleções, despachos e resumos
  chat/telegram         NotificadorTelegram: HTML + botões, download de anexos
  executor/orca         Orca pela CLI
  cofre/                arquivo cifrado (servidor) ou Keychain (Mac)
src/main.ts             raiz de composição: o único lugar que escolhe os adaptadores e liga os casos de uso
```

**Regra de dependência:** os casos de uso só importam `dominio/` e `portas.ts`; quem conhece SQLite, grammy e Orca
são os adaptadores. Por isso os testes dos dois ciclos rodam com um chat falso e um Orca falso, sem Telegram e sem
terminal, em menos de um segundo (`tests/unit/despacho.test.ts`, `tests/unit/selecao.test.ts`).

## O que ainda não segue a regra

- `gamificacoes.ts`, `regras.ts`, `projetos.ts`, `login-pm.ts` e `confirmacao.ts` ainda falam com o Telegram direto.
- Os casos de uso montam o HTML das mensagens (`cartao()`): falta o Presenter, que só vale a pena quando houver um
  segundo chat (Teams, D-A10).
- Os botões ainda são texto (`f:12:pr`): falta o codec tipado.
- Os casos de uso se chamam por callbacks (`aoLiberar`, `onDespachar`): eventos de domínio quando houver mais ouvintes.

## Perguntas para o estudo

1. O que é uma porta e o que é um adaptador? Ache três portas no `portas.ts` e quem as implementa.
2. Por que o `Despachar` não pode importar `better-sqlite3` nem `grammy`? O que se ganha nos testes?
3. Raiz de composição: por que todo `new` de adaptador fica no `main.ts`?
4. Repository: por que o repositório tem métodos como `concluir()` e `iniciar()` em vez de um `update()` genérico?
   (Pista: transação e o lote.)
5. Como o `Monitor` avisa o `Despachar` que o app ficou livre sem um importar o outro (callback `aoLiberar`)?
   Quando isso vira evento de domínio?
6. Teste de ponta a ponta com dublês: o que o `ExecutorFalso` simula, e o que ele **não** garante (o Orca real).
7. Por que injetar `dormir` deixa o teste do monitor rápido sem mudar o código de produção?
8. O que mudaria para trocar o SQLite pelo Prisma (D-A13)? Quantos arquivos?
9. O que mudaria para trocar o Telegram pelo Teams? Onde o Presenter entraria?
