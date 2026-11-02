#!/usr/bin/env bash
# Roda NO SERVIDOR, chamado pelo deploy (authorized_keys: command="…/deploy/atualizar.sh" com o SHA como argumento).
# Atualiza para o commit exato que passou no CI, confere de novo e reinicia o hub.
# O reinício não derruba as tasks: as sessões vivem no Orca, e o hub retoma o acompanhamento pelo banco.
set -euo pipefail

SHA="${SSH_ORIGINAL_COMMAND:-${1:-}}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "SHA inválido"; exit 1; }

cd "$(dirname "$0")/.."
git fetch --quiet origin
git checkout --quiet --detach "$SHA"
npm ci --silent
npx tsc --noEmit -p .
npx vitest run --silent
systemctl --user restart hub
echo "hub atualizado para $SHA"
