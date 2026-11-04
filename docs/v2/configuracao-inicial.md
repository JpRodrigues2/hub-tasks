# Configuração inicial fluida (requisito)

Pedido do João em 03/11/2026, depois de subir o hub na Oracle: **o projeto deve sair com um fluxo de configuração
inicial mais fluido.** A primeira subida funcionou, mas foi travada e com muitos erros
(ver os atritos A1–A15 em [oracle-hub-cloud](../hospedagem/oracle-hub-cloud.md)). O desenho fica para depois;
este documento guarda o requisito e o que já sabemos.

## O que o fluxo precisa garantir

- **Um ponto de partida só.** Uma pessoa sem experiência em infra começa por um comando ou uma tela e é guiada até o fim.
- **Mostra o que falta.** Lista dos passos com ✅/⬜, e retoma de onde parou (os scripts já são idempotentes).
- **Confere cada passo de verdade**, de fora quando precisa (ex.: a porta 22 fechou mesmo, o celular alcança o Orca).
- **Segredos nunca passam pelo chat.** Tokens, chaves e links de pareamento vão direto para o servidor ou para o cofre; a cópia de recuperação vai direto para o gerenciador de senhas.
- **Sem console de nuvem**, além do login e do que a conta exige (cota, pagamento).
- **Pareamento por QR code** do link certo, para o Mac e o celular.
- **Login das ferramentas fora do navegador do Telegram**, ou por código curto.
- **Catálogo e pastas criados pelo assistente**, já no formato do servidor.
- **Mensagens de erro que dizem o próximo passo**, não só o erro.

## Ideias para o desenho

- Assistente no terminal (TUI) que roda no Mac e conversa com a VM pelo Tailscale.
- Estado da configuração no próprio servidor (`/home/hub/dados/configuracao.json`), para o bot também mostrar o que falta.
- Reaproveita `deploy/oracle-criar-vm.sh`, `deploy/preparar-vm.sh` e `scripts/servidor-teste.ts` como etapas.
- Junto com o onboarding e a autoconfiguração da etapa 2 (D-A15) e do [app universal](app-universal.md).
