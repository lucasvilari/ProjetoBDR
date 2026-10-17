"""Testes do gerador do site: põe site/ no caminho de importação e pula os testes
marcados com "banco" quando o PostgreSQL não está disponível."""
import subprocess
import sys
from pathlib import Path

import pytest

SITE = Path(__file__).resolve().parents[2] / 'site'
sys.path.insert(0, str(SITE))


def _banco_disponivel():
    try:
        return subprocess.run(['psql', '-d', 'eleicoes', '-Atc', 'select 1'],
                              capture_output=True, timeout=10).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def pytest_collection_modifyitems(config, items):
    if _banco_disponivel():
        return
    pula = pytest.mark.skip(reason='banco PostgreSQL indisponível')
    for item in items:
        if 'banco' in item.keywords:
            item.add_marker(pula)
