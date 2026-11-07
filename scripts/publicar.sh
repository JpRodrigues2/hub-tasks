#!/usr/bin/env bash
# Monta o repositório PÚBLICO a partir deste (o de desenvolvimento): só o código e o que é do usuário final.
# Ficam de fora docs/ (decisões, backlog, estudo), o apps.yaml e as regras pessoais. Usa só o que está commitado.
#   scripts/publicar.sh <pasta do clone do repositório público> [--conferir]
# --conferir: roda npm ci, tipos e testes na árvore gerada.
set -euo pipefail

DEST="${1:?uso: scripts/publicar.sh <pasta do repositório público> [--conferir]}"
ORIG="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)"

# O que entra (caminhos do repositório de desenvolvimento).
ENTRA=(
  src bin hub deploy tests scripts instalacao
  regras/modelo.md
  .claude/skills/instalar-hub
  package.json package-lock.json tsconfig.json vitest.config.ts
  .github/workflows/ci.yml
  .env.example .gitignore
)
# Versões públicas destes arquivos (sem os links para os docs internos).
PUBLICO=(README.md CLAUDE.md AGENTS.md)
# Nada disso pode aparecer na árvore pública.
PROIBIDO='100\.[0-9]+\.[0-9]+\.[0-9]+|joaopedro|1117969078|teensmart|jogajunto|brb-|pecas-c4|assban|playdps|rota-viva|DAC Capital|HubTasksCloudBot|JoaoTaskBot'

mkdir -p "$DEST"
# Limpa tudo menos o .git do destino (o histórico do repositório público é só dele).
find "$DEST" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
git -C "$ORIG" archive --format=tar HEAD "${ENTRA[@]}" | tar -x -C "$DEST"
for f in "${PUBLICO[@]}"; do cp "$ORIG/publico/$f" "$DEST/$f"; done
[[ -f "$ORIG/publico/LICENSE" ]] && cp "$ORIG/publico/LICENSE" "$DEST/LICENSE" || echo "aviso: sem publico/LICENSE (defina a licença antes de publicar)"

if grep -rInE "$PROIBIDO" "$DEST" --exclude-dir=.git --exclude-dir=node_modules; then
  echo "ERRO: dados pessoais na árvore pública (acima). Nada foi publicado."
  exit 1
fi
# Links para docs/ internos viram texto morto no público: lista para revisar.
links=$(grep -rIlE "\]\((\.\./)*docs/|docs/[a-z-]+\.md" "$DEST" --exclude-dir=.git --exclude-dir=node_modules || true)
[[ -n "$links" ]] && echo "aviso: arquivos citando docs/ (que não é publicado):" && echo "$links"

if [[ "${2:-}" == "--conferir" ]]; then
  (cd "$DEST" && npm ci --silent --no-audit --no-fund && npx tsc --noEmit -p . && npx vitest run --silent)
fi
echo "árvore pública pronta em $DEST ($(git -C "$ORIG" rev-parse --short HEAD))"
