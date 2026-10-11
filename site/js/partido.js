// Página Partido: as três medidas de ideologia e os eleitos de cada partido atual.
// Dados: partidos.json (gerado por gera_dados.py a partir do banco nacional).
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/+esm';
import { montaPagina, carregaDados, formata } from './comum.js';

montaPagina();

const { partidos, concordancia_coligacoes: concordancia } = await carregaDados('partidos.json');
const ESTILO = { fontFamily: 'Archivo, sans-serif', fontSize: '13px', background: 'transparent' };
const nota = v => (v == null ? '—' : String(v.toFixed(2)).replace('.', ','));

// partidos com nota dos especialistas de 2022, da esquerda para a direita
const ordenados = partidos.filter(p => p.especialistas['2022'] != null)
  .sort((a, b) => a.especialistas['2022'] - b.especialistas['2022']);
const siglas = ordenados.map(p => p.sigla);
const altura = 40 + 22 * siglas.length;
const MARGENS = { marginTop: 34, marginBottom: 6 };   // iguais nos dois gráficos, para as linhas coincidirem

function graficoEspectro() {
  const pontos = ordenados.map(p => ({ sigla: p.sigla, esp: p.especialistas['2022'], col: p.coligacoes['2024'] ?? null }));
  const largura = document.getElementById('g-espectro').clientWidth || 640;
  return Plot.plot({
    width: largura, height: altura, marginLeft: 120, ...MARGENS, style: ESTILO,
    x: { domain: [0, 10], ticks: [0, 2.5, 5, 7.5, 10], tickFormat: v => ({ 0: 'esquerda', 5: 'centro', 10: 'direita' })[v] ?? '', grid: true, label: null, axis: 'top' },
    y: { domain: siglas, label: null },
    marks: [
      Plot.link(pontos.filter(d => d.col != null), { x1: 'esp', x2: 'col', y1: 'sigla', y2: 'sigla', stroke: '#9cc5a9', strokeWidth: 2 }),
      Plot.dot(pontos.filter(d => d.col != null), { x: 'col', y: 'sigla', r: 5, stroke: '#157a42', strokeWidth: 2, fill: '#e4e6e1',
                                                    title: d => `${d.sigla}, alianças 2024: ${nota(d.col)}` }),
      Plot.dot(pontos, { x: 'esp', y: 'sigla', r: 5, fill: '#1f2124', title: d => `${d.sigla}, especialistas 2022: ${nota(d.esp)}` }),
    ],
  });
}

function graficoCamara() {
  const pontos = ordenados.map(p => ({ sigla: p.sigla, camara: p.camara }));
  return Plot.plot({
    width: 220, height: altura, marginLeft: 10, marginRight: 14, ...MARGENS, style: ESTILO,
    x: { domain: [-100, 100], ticks: [-100, 0, 100], grid: true, label: 'Câmara', labelAnchor: 'center', axis: 'top' },
    y: { domain: siglas, axis: null },
    marks: [
      Plot.ruleX([0], { stroke: '#8a8f86' }),
      Plot.barX(pontos.filter(d => d.camara != null), { x: 'camara', y: 'sigla', fill: d => (d.camara < 0 ? '#b3d4bd' : '#f0b89c'),
                                                         title: d => `${d.sigla}, Câmara: ${d.camara}` }),
      Plot.text(pontos.filter(d => d.camara == null), { x: 0, y: 'sigla', text: () => 'sem deputados', fill: '#8a8f86', fontSize: 11 }),
    ],
  });
}

function eleitosDe(p, ano, cargos) {
  return p.eleicoes.filter(e => e[0] === ano && cargos.includes(e[1])).reduce((s, e) => s + e[3], 0);
}

function tabela() {
  const linhas = [...partidos].sort((a, b) => (a.especialistas['2022'] ?? 99) - (b.especialistas['2022'] ?? 99));
  document.getElementById('tabela').innerHTML = `
    <thead><tr><th>Partido</th><th class="num">Número</th><th class="num">Especialistas 2018</th><th class="num">Especialistas 2022</th>
      <th class="num">Alianças 2024</th><th class="num">Câmara</th><th class="num">Deputados federais 2022</th>
      <th class="num">Prefeitos 2024</th><th class="num">Vereadores 2024</th></tr></thead>
    <tbody>${linhas.map(p => `<tr>
      <td><a href="#${encodeURIComponent(p.sigla)}">${p.sigla}</a> <span class="apoio situacao">${p.nome.toLowerCase()}</span></td>
      <td class="num">${p.numero}</td><td class="num">${nota(p.especialistas['2018'])}</td><td class="num">${nota(p.especialistas['2022'])}</td>
      <td class="num">${nota(p.coligacoes['2024'])}</td><td class="num">${p.camara ?? '—'}</td>
      <td class="num">${formata.numero(eleitosDe(p, 2022, ['DEPUTADO FEDERAL']))}</td>
      <td class="num">${formata.numero(eleitosDe(p, 2024, ['PREFEITO']))}</td>
      <td class="num">${formata.numero(eleitosDe(p, 2024, ['VEREADOR']))}</td></tr>`).join('')}</tbody>`;
}

function detalhe(sigla) {
  const p = partidos.find(x => x.sigla === sigla) ?? partidos.find(x => x.sigla === 'PT') ?? partidos[0];
  document.getElementById('escolha').value = p.sigla;
  const serie = Object.entries(p.coligacoes).map(([ano, v]) => ({ ano: Number(ano), v }));
  const esp = Object.entries(p.especialistas).filter(([, v]) => v != null).map(([ano, v]) => ({ ano: Number(ano), v }));
  const caixa = document.getElementById('detalhe');
  caixa.innerHTML = `
    <h3 class="ficha-nome">${p.sigla} <span class="apoio">${p.nome.toLowerCase()}, número ${p.numero}</span></h3>
    <p>As alianças do partido ao longo do tempo (linha) e a nota dos especialistas (quadrados). A concordância
      entre as duas réguas, somando todos os partidos, foi de ${String(concordancia['2016']).replace('.', ',')} em 2016
      e ${String(concordancia['2024']).replace('.', ',')} em 2024 (1 seria a mesma ordem).</p>
    <div class="grafico" id="g-detalhe"></div>
    <div class="rolagem"><table class="tabela">
      <thead><tr><th>Ano</th><th>Cargo</th><th class="num">Candidatos</th><th class="num">Eleitos</th><th class="num">Taxa de vitória</th></tr></thead>
      <tbody>${p.eleicoes.map(([ano, cargo, cand, el]) => `<tr><td>${ano}</td><td>${cargo.toLowerCase()}</td>
        <td class="num">${formata.numero(cand)}</td><td class="num">${formata.numero(el)}</td>
        <td class="num">${formata.pct(100 * el / cand)}</td></tr>`).join('')}</tbody>
    </table></div>`;
  if (serie.length) {
    caixa.querySelector('#g-detalhe').append(Plot.plot({
      width: Math.min(760, caixa.clientWidth || 700), height: 220, marginLeft: 70, style: ESTILO,
      x: { domain: [1999, 2025], ticks: [2000, 2004, 2008, 2012, 2016, 2020, 2024], tickFormat: String, label: null },
      y: { domain: [0, 10], ticks: [0, 5, 10], tickFormat: v => ({ 0: 'esquerda', 5: 'centro', 10: 'direita' })[v], grid: true, label: null },
      marks: [
        Plot.line(serie, { x: 'ano', y: 'v', stroke: '#157a42', strokeWidth: 2 }),
        Plot.dot(serie, { x: 'ano', y: 'v', fill: '#157a42', r: 4, title: d => `alianças ${d.ano}: ${nota(d.v)}` }),
        Plot.dot(esp, { x: 'ano', y: 'v', symbol: 'square', fill: '#1f2124', r: 5, title: d => `especialistas ${d.ano}: ${nota(d.v)}` }),
      ],
    }));
  }
}

document.getElementById('g-espectro').append(graficoEspectro());
document.getElementById('g-camara').append(graficoCamara());
tabela();
const escolha = document.getElementById('escolha');
escolha.innerHTML = [...partidos].sort((a, b) => a.sigla.localeCompare(b.sigla))
  .map(p => `<option value="${p.sigla}">${p.sigla}</option>`).join('');
escolha.addEventListener('change', () => { location.hash = encodeURIComponent(escolha.value); });
window.addEventListener('hashchange', () => detalhe(decodeURIComponent(location.hash.slice(1))));
detalhe(decodeURIComponent(location.hash.slice(1)));
