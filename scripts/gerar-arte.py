#!/usr/bin/env python3
# Regera src/cli/arte-dados.ts (o estagiário em caracteres de meio-bloco) a partir de site/public/muxor.png.
# Uso: python3 scripts/gerar-arte.py [largura]   (precisa do Pillow: pip install pillow)
import sys
from pathlib import Path
from PIL import Image

raiz = Path(__file__).resolve().parent.parent
largura = int(sys.argv[1]) if len(sys.argv) > 1 else 24
im = Image.open(raiz / 'site/public/muxor.png').convert('RGBA')
w, h = im.size
alt = round(h * largura / w)
alt += alt % 2
im = im.resize((largura, alt), Image.LANCZOS)
hx = lambda p: '%02x%02x%02x' % p[:3] if p[3] > 110 else '-'
linhas = []
for y in range(0, alt, 2):
    cel = []
    for x in range(largura):
        t, b = hx(im.getpixel((x, y))), hx(im.getpixel((x, y + 1)))
        cel.append('.' if t == '-' and b == '-' else t + b)
    linhas.append(' '.join(cel))
saida = ["// Gerado de site/public/muxor.png (o estagiário): cada linha são células de meio-bloco, 'topo+base' em hex.",
         "// '.' = célula vazia; '-' = metade vazia. Regerar: scripts/gerar-arte.py.", 'export const ARTE: string[] = [']
saida += [f"  '{l}'," for l in linhas] + ['];']
(raiz / 'src/cli/arte-dados.ts').write_text('\n'.join(saida) + '\n')
print(f'{largura} x {len(linhas)} linhas')
