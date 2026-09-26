#!/usr/bin/env python3
"""Gera o print (.png) de cada sessão do psql gravada em evidencias/ev_*.txt.

Mostra o cabeçalho do ambiente, o comando e as primeiras linhas do resultado;
quando a saída é longa, omite o meio e mantém o final (contagem de linhas e tempo).
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONTE = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 14)
MAX_LINHAS, FINAL, LARGURA_MAX = 70, 5, 170
FUNDO, TEXTO, DESTAQUE = (30, 30, 30), (220, 220, 210), (130, 190, 140)


def linhas_do_print(texto):
    linhas = [l.rstrip() for l in texto.splitlines()]
    if len(linhas) > MAX_LINHAS:
        omitidas = len(linhas) - (MAX_LINHAS - FINAL)
        linhas = linhas[:MAX_LINHAS - FINAL] + [f'... ({omitidas} linhas omitidas no print; resultado completo no CSV) ...'] + linhas[-FINAL:]
    return [l if len(l) <= LARGURA_MAX else l[:LARGURA_MAX - 1] + '…' for l in linhas]


def gerar(txt):
    linhas = linhas_do_print(txt.read_text(encoding='utf-8'))
    alt_linha = 18
    largura = int(max(FONTE.getlength(l) for l in linhas)) + 40
    img = Image.new('RGB', (max(largura, 600), alt_linha * len(linhas) + 30), FUNDO)
    d = ImageDraw.Draw(img)
    for i, l in enumerate(linhas):
        cor = DESTAQUE if l.startswith(('--', 'Time:', '(')) else TEXTO
        d.text((20, 15 + i * alt_linha), l, font=FONTE, fill=cor)
    destino = txt.with_suffix('.png')
    img.save(destino)
    return destino


if __name__ == '__main__':
    for arq in sys.argv[1:]:
        print('print:', gerar(Path(arq)))
