#!/usr/bin/env python3
# Regera src/cli/arte-dados.ts a partir de scripts/estagiario.txt (o estagiário em pixel art, desenhado à mão).
# As cores são exatamente cores do xterm-256: ficam iguais no Terminal do macOS e nos terminais de 24 bits.
# Uso: python3 scripts/gerar-arte.py   (depois: npx tsx scripts/arte-instalador.ts, para levar ao install.sh)
from pathlib import Path

raiz = Path(__file__).resolve().parent.parent
COR = {'K': '121212', 'H': '3a3a3a', 'h': '585858', 'S': 'ffd7af', 's': 'd7af87', 'W': 'eeeeee', 'M': '585858',
       'B': '00005f', 'b': '000087', 'Y': 'ffff5f'}
grade = [l for l in (raiz / 'scripts/estagiario.txt').read_text().split('\n') if l and not l.startswith('#')]
largura = max(len(l) for l in grade)
grade = [l.ljust(largura, '.') for l in grade]
if len(grade) % 2:
    grade.append('.' * largura)
linhas = []
for y in range(0, len(grade), 2):
    cel = []
    for x in range(largura):
        t, b = COR.get(grade[y][x], '-'), COR.get(grade[y + 1][x], '-')
        cel.append('.' if t == '-' and b == '-' else t + b)
    linhas.append(' '.join(cel))
saida = ["// Gerado de scripts/estagiario.txt (o estagiário em pixel art): cada linha são células de meio-bloco,",
         "// 'topo+base' em hex; '.' = célula vazia; '-' = metade vazia. Regerar: scripts/gerar-arte.py.",
         'export const ARTE: string[] = [']
saida += [f"  '{l}'," for l in linhas] + ['];']
(raiz / 'src/cli/arte-dados.ts').write_text('\n'.join(saida) + '\n')
print(f'{largura} x {len(linhas)} linhas')
