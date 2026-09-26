#!/usr/bin/env python3
"""Gera modelo_relacional.html a partir do template e do catálogo do banco (esquema.json).

    python3 gera_pagina.py              usa o esquema.json guardado
    python3 gera_pagina.py --atualizar  relê o catálogo do banco (psql, banco eleicoes) antes
"""
import json
import os
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
BANCO = os.environ.get('BANCO', 'eleicoes')
ESQUEMA = AQUI / 'esquema.json'

if '--atualizar' in sys.argv:
    psql = ['psql', '-X', '-At', '-d', BANCO]
    dados = json.loads(subprocess.check_output(psql + ['-f', str(AQUI / 'extrai_esquema.sql')]))
    for tabela in dados['tabelas']:              # o catálogo só estima as linhas; conta de verdade
        dados['tabelas'][tabela]['linhas'] = int(subprocess.check_output(psql + ['-c', f'SELECT count(*) FROM {tabela}']))
    ESQUEMA.write_text(json.dumps(dados, ensure_ascii=False), encoding='utf-8')
    print('catálogo atualizado:', ESQUEMA)

dados = json.loads(ESQUEMA.read_text(encoding='utf-8'))
modelo = (AQUI / 'modelo_relacional.template.html').read_text(encoding='utf-8')
saida = AQUI / 'modelo_relacional.html'
saida.write_text(modelo.replace('/*__DADOS__*/null', json.dumps(dados, ensure_ascii=False)), encoding='utf-8')
print('gerado:', saida, f'{saida.stat().st_size / 1024:.0f} KB')
