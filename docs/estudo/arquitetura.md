# Estudo: a arquitetura hexagonal do hub

Para estudar depois que o backend estiver pronto. Leia antes a [arquitetura](../arquitetura.md): a seção 2 explica
as camadas e a seção 3 diz a responsabilidade de cada arquivo.

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
