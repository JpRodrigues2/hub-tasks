# v2 · Implantação: local ou servidor do usuário

Parte da [v2](README.md). Como o colaborador escolhe onde o hub roda, e como o app chega até ele. Arquitetura em [arquitetura v2](arquitetura-v2.md); segurança em [segurança e dados](seguranca-e-dados.md).

Legenda: 🟡 em aberto · ✅ decidida · ❌ descartada.

---

## 1. Requisito (D-A18 ✅)

A **v2.1**, primeira entrega da v2, já sai com dois modos de execução, escolhidos **pelo usuário na configuração**:

| Modo | Onde o hub e as sessões do Claude rodam | Quem mantém |
|---|---|---|
| **Local** | No computador do usuário, que precisa ficar ligado | O usuário |
| **Servidor** | Num servidor **do usuário** (VPS, Mac mini…), ligado 24 h | O usuário, não nós |

**Mesmo código e mesma configuração.** O modo só muda quais adaptadores a raiz de composição (`main.ts`) liga: é a arquitetura hexagonal ([arquitetura v2, seção 3](arquitetura-v2.md)) sendo usada para o que ela serve.

## 2. O que é igual nos dois modos

- O núcleo inteiro: fluxo, fila, despacho, acompanhamento, máquinas de estado.
- Telegram por **long polling**: só conexões de saída, nenhuma porta aberta, nos dois modos.
- Ferramentas de gestão: Funifier PM, Bnexo e Jira.
- Banco: Prisma + SQLite, um arquivo local onde o hub roda.

## 3. O que muda

| Peça (porta) | Local | Servidor do usuário |
|---|---|---|
| Hub | Mac do usuário | Servidor (Linux ou Mac mini, D-A21) |
| Executor | Orca local | Orca no servidor (`orca serve`, [Parte A](../hospedagem/servidor-nuvem.md)) **ou** terminal/tmux |
| Sessões do Claude | Conta do usuário no Mac | Conta do usuário logada no servidor |
| Repositórios | Pastas do Mac | Clonados no servidor pelo assistente (precisa de acesso git no servidor: mais um segredo) |
| Ver e usar as sessões | Janela do Orca | Orca do Mac pareado com o servidor (`orca environment add`), ou SSH |
| Serviço (subir sozinho, se recuperar) | LaunchAgent | systemd (ou política de reinício do Docker) |
| Cofre | Keychain do macOS | Arquivo cifrado com chave fora do disco ([C1](seguranca-e-dados.md#c1-guardar-porta-cofre-com-um-adaptador-por-ambiente)) |
| Disponibilidade | Só com o computador ligado e acordado | 24 h |

### Dependência crítica: o Orca no servidor

O modo servidor depende de o Orca rodar **sem tela** no servidor. Isso é o teste **T4** da Parte A (`orca serve` em Linux).

- **Se o T4 passar:** o executor Orca serve nos dois modos.
- **Se o T4 falhar:** o modo servidor exige o **executor por terminal/tmux** (D-A3), que deixa de ser "futuro" e entra na v2.1. Ou o servidor tem de ser um Mac.

**O T4 é o primeiro teste a rodar.**

## 4. Como funciona a escolha

1. O assistente de instalação pergunta: **"Onde o hub vai rodar? Neste computador / Num servidor meu"**.
2. **Local:** detecta o Orca e o Claude Code, usa o Keychain e instala o LaunchAgent.
3. **Servidor:** o assistente roda **no próprio servidor**, por SSH. Ele confere os pré-requisitos (Node, Claude Code, Orca ou tmux), faz o `claude login`, clona os repositórios, cria o cofre cifrado e o serviço systemd. No fim, mostra o código para parear o Orca do Mac.
4. A escolha fica gravada na configuração:
   ```yaml
   implantacao:
     modo: local        # local | servidor
     executor: orca     # orca | tmux
   ```
5. **Mudar de ideia depois:** um comando de exportar/importar leva banco, configuração e cofre de um modo para o outro. O cofre é recifrado no destino e nunca sai em texto puro.

## 5. Distribuição (D-A19 🟡, substitui a D-A6)

| Opção | Para | Prós | Contras |
|---|---|---|---|
| Homebrew tap | Mac (local) | Familiar para dev; `brew upgrade` atualiza | Só Mac |
| `.pkg` / `.dmg` assinado e notarizado | Mac (local) | O mais amigável | Conta Apple Developer; assinar cada versão |
| `npx` / pacote npm | Mac e servidor | Um comando, fácil de atualizar | Exige Node instalado |
| Script de instalação (Ubuntu LTS) | Servidor | Simples para VPS | Um sistema operacional por vez |
| Imagem Docker | Servidor | Isola dependências; reinício automático | Claude Code, repositórios e Orca dentro do container precisam de validação |
| Executável único (Node SEA, Bun compile) | Ambos | Um arquivo, sem Node | Dependências nativas (better-sqlite3, Prisma) complicam: validar |
| `.exe` | Windows | — | Depende da D-A21 |

**Recomendação inicial:**
- **Mac:** Homebrew, com `.pkg` assinado depois.
- **Servidor:** script de instalação para Ubuntu LTS, com Docker opcional.
- **Executável único:** avaliar junto com o teste P1 do Prisma ([segurança e dados, seção 4](seguranca-e-dados.md#4-banco-de-dados-d-a13-)).

## 6. Site de suporte (D-A20 🟡)

Hospedado por nós, como site estático:
- **downloads**;
- **documentação** do colaborador;
- **vídeos** tutoriais (instalação local, instalação em servidor, primeiro despacho);
- **notas de versão**.

Também publica um **manifesto de versões**, que o hub consulta para avisar no Telegram que há atualização.

**Regra:** o nosso servidor **nunca recebe** credenciais, tasks ou código dos usuários. Ele só serve arquivos públicos.

## 7. Relação com a Parte A

A [Parte A](../hospedagem/servidor-nuvem.md) foi escrita para o servidor do João. Ela passa a ser o **piloto e a validação do modo servidor**: os testes T1–T8 continuam valendo, e o T4 vira prioridade (seção 3).

## 8. Decisões

| Id | Decisão | Opções | Recomendação |
|---|---|---|---|
| D-A18 ✅ | Modos de execução na v2.1 | Só local · local + servidor do usuário | **Local + servidor do usuário**, escolhido na instalação (decidido em 30/10/2026). |
| D-A19 🟡 | Distribuição | Ver seção 5 | Homebrew no Mac; script Ubuntu no servidor. |
| D-A20 🟡 | Site de suporte | Site estático · nenhum | Site estático com downloads, docs, vídeos e manifesto de versões. |
| D-A21 🟡 | Sistemas operacionais | macOS · Linux · Windows | macOS (local) e Linux (servidor) na v2.1; Windows depois (verificar Orca no Windows). |
