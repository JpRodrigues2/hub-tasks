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

## Decisões (04/11/2026)

- **Canal:** assistente no terminal (`hub init`) como base; o Claude Code como copiloto opcional (lê `hub diagnostico`, nunca digita segredos); o Telegram para o depois (o que falta, QR de pareamento, projetos).
- **Ordem:** só depois da arquitetura hexagonal, do cofre e do broker fechados.
- **Servidor fora do escopo:** o hub **não** escolhe nem cria a VPS. Entregamos um documento com requisitos, dicas e dúvidas comuns (provedores, ARM/x86, memória, Ubuntu, custo, o que a Oracle grátis exige). O usuário cria o servidor por conta própria, ou pede ao Claude Code dele, como o João fez. O `hub init` começa quando o servidor já existe e responde por SSH.
