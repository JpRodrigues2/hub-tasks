# Desinstalar

```sh
cd ~/Documents/hub
./hub desinstalar
```

Ele mostra exatamente o que vai desfazer e pede confirmação. Desfaz só o que o `hub init` fez:

| O que | Como |
|---|---|
| O serviço do hub | Para e apaga o LaunchAgent |
| As linhas do hub no `~/.gitconfig` | Tira só as linhas `includeIf` que o hub pôs (as suas ficam) |
| As credenciais das gamificações | Apaga os itens do hub no Keychain |
| `~/.hub` | Configuração, banco, logs e os logins do GitHub que eram só do hub |
| As pastas que o hub criou | Pergunta uma por uma (podem ter repositórios clonados) |

**Não mexe em:** Claude Code, Orca, git, gh e nas contas que você já usava.

**Fica com você** (o desinstalar lembra no fim):
- Apagar o bot no BotFather (`/deletebot`).
- Tirar do Orca os projetos que o hub abriu (botão direito → Remove) e o celular pareado, se quiser.
- Revogar o "GitHub CLI" em github.com/settings/applications, se quiser.
- Apagar a pasta do código: `rm -rf ~/Documents/hub`.

## Testar num computador emprestado

Para não misturar nada com o que o dono do computador usa, o melhor é **uma conta de usuário nova no macOS**
(Ajustes → Usuários e Grupos → Adicionar usuário): ela começa sem `~/.claude`, `~/.gitconfig`, Keychain nem
configuração do Orca, e os programas instalados (Orca, Node) continuam disponíveis. No fim, apague a conta.

Se não der para criar uma conta, use a conta do dono e rode `./hub desinstalar` no fim: ele desfaz o que o hub fez,
sem tocar no Claude Code nem nas contas dele. Rode `./hub desinstalar` também entre uma tentativa e outra, para testar
de novo do zero.
