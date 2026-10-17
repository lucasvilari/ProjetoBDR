// Pergunta 5: quem entrou pela legenda? Uma coluna por eleito, do tamanho dos votos dele, agrupadas pela
// coligação ou federação que recebeu as cadeiras; a linha do quociente eleitoral atravessa tudo, e os
// votos que sobram aos puxadores escorrem até os eleitos que ficaram abaixo dela.
//
// Dados: legenda/<ue>.json (eleitos, votos, quociente; UFs dos seis estados e seus municípios) e
// legenda/resumo.json (eleitos e eleitos pela legenda por partido, ano, cargo e UF).
import { montaPagina, carregaDados, formata, NOME_UF, em } from './comum.js?v=20261020';
import { corIdeologia, COR } from './lib/cores.js?v=20261020';
import { porLegenda, escoamento, resumoPorPartido } from './lib/quociente.js?v=20261020';
import { montaSeletor, leCandidaturas, cartaoPolitico } from './pecas.js?v=20261020';

montaPagina();

const CARGOS = ['DEPUTADO FEDERAL', 'DEPUTADO ESTADUAL', 'DEPUTADO DISTRITAL', 'VEREADOR'];
const { partidos } = await carregaDados('partidos.json');
const resumoSeis = await carregaDados('legenda/resumo.json');
const nota = (sigla, ano) => partidos.find(p => p.sigla === sigla)?.especialistas[ano <= 2020 ? '2018' : '2022'] ?? null;
const reduz = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const minusculo = c => c.toLowerCase();
const curto = n => (n.length > 34 ? `${n.slice(0, 33)}…` : n);
let primeiraPintura = true;
let atual = null;

/** A unidade eleitoral do recorte: o município para vereador, a UF para deputado. */
function ueDe(r) {
  if (r.cargo === 'VEREADOR') return r.mun ?? null;
  return r.uf;
}

async function nomeDe(r, ue) {
  if (/^\d{5}$/.test(ue)) return (await carregaDados(`mapa/municipios/${r.uf}.json`)).municipios[ue]?.nome ?? ue;
  return NOME_UF[ue];
}

// ---------------------------------------------------------------- a régua

/** Colunas em SVG, uma por eleito, agrupadas pela unidade, com a linha do quociente. Colunas muito altas
 *  (os puxadores de milhões de votos) são cortadas no topo da régua, com o valor escrito. */
function desenhaRegua(rec, unidades, ano) {
  const q = rec.quociente;
  const eleitos = rec.eleitos.map(([pid, nome, sigla, unidade, votos, situacao, foto]) => ({ pid, nome, sigla, unidade, votos, situacao, foto }));
  const grupos = [...new Set(eleitos.map(e => e.unidade))]
    .map(u => ({ u, nome: unidades[u], eleitos: eleitos.filter(e => e.unidade === u).sort((a, b) => b.votos - a.votos) }))
    .sort((a, b) => b.eleitos.length - a.eleitos.length);
  const COL = 22, GAP = 4, ENTRE = 26, TOPO = 46, BASE = 84, ALT = 300;
  const teto = Math.max(q * 2.4, ...eleitos.map(e => Math.min(e.votos, q * 2.4)));
  const y = v => TOPO + ALT - (ALT * Math.min(v, teto)) / teto;
  let x = 10;
  const posX = new Map();
  const blocos = grupos.map(g => {
    const ini = x;
    g.eleitos.forEach(e => { posX.set(e.pid ?? `${e.nome}`, x); x += COL + GAP; });
    x += ENTRE - GAP;
    return { ...g, ini, fim: x - ENTRE };
  });
  const largura = Math.max(x + 10, 320);
  const colunas = blocos.flatMap(b => b.eleitos.map(e => {
    const cx = posX.get(e.pid ?? `${e.nome}`), topo = y(e.votos), leg = porLegenda(e, q), cortada = e.votos > teto;
    return `<g class="coluna${leg ? ' pela-legenda' : ''}" data-pid="${e.pid ?? ''}" tabindex="0" role="button"
        aria-label="${e.nome ?? 'eleito'} (${e.sigla}): ${formata.numero(e.votos)} votos${leg ? ', pela legenda' : ''}">
      <rect x="${cx}" y="${topo}" width="${COL}" height="${TOPO + ALT - topo}" fill="${corIdeologia(nota(e.sigla, ano))}"/>
      ${cortada ? `<path d="M${cx} ${topo + 6} l${COL / 3} -6 l${COL / 3} 6 l${COL / 3} -6" class="corte"/>
        <text x="${cx + COL / 2}" y="${topo - 6}" class="coluna-valor">${formata.numero(Math.round(e.votos / 1000))} mil</text>` : ''}
      <title>${e.nome ?? 'eleito'} (${e.sigla}): ${formata.numero(e.votos)} votos${leg ? ' — abaixo do quociente' : ''}</title>
    </g>`;
  })).join('');
  const rotulos = blocos.map(b => `<text x="${(b.ini + b.fim) / 2}" y="${TOPO + ALT + 18}" class="unidade-rotulo">${curto(b.nome)}</text>
    <text x="${(b.ini + b.fim) / 2}" y="${TOPO + ALT + 34}" class="unidade-conta">${b.eleitos.length} ${b.eleitos.length === 1 ? 'eleito' : 'eleitos'}, ${b.eleitos.filter(e => porLegenda(e, q)).length} pela legenda</text>`).join('');
  const yq = y(q);
  return {
    largura,
    svg: `<svg viewBox="0 0 ${largura} ${TOPO + ALT + BASE}" width="${largura}" height="${TOPO + ALT + BASE}" class="regua-svg" role="group"
        aria-label="Eleitos e o quociente eleitoral de ${formata.numero(q)} votos">
      ${colunas}
      <line x1="0" x2="${largura}" y1="${yq}" y2="${yq}" class="linha-quociente"/>
      <text x="6" y="${yq - 8}" class="rotulo-quociente">quociente eleitoral: ${formata.numero(q)} votos</text>
      ${rotulos}
      <g class="gotas"></g>
    </svg>`,
    eleitos, posX, y, COL,
  };
}

/** As gotas: o excedente dos puxadores escorrendo até quem ficou abaixo da linha, uma vez, na primeira pintura. */
function animaGotas(svg, desenho, q) {
  const fluxos = escoamento(desenho.eleitos, q);
  if (!fluxos.length) return;
  const camada = svg.querySelector('.gotas');
  const de = pid => desenho.eleitos.find(e => e.pid === pid);
  fluxos.slice(0, 40).forEach((f, i) => {
    const a = de(f.de), b = de(f.para);
    if (!a || !b) return;
    const x0 = desenho.posX.get(a.pid) + desenho.COL / 2, y0 = desenho.y(Math.min(a.votos, q * 2.4)) + 4;
    const x1 = desenho.posX.get(b.pid) + desenho.COL / 2, y1 = desenho.y(b.votos) - 4;
    const gota = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    gota.setAttribute('r', String(Math.max(3, Math.min(8, Math.sqrt(f.votos / q) * 10))));
    gota.setAttribute('class', 'gota');
    gota.setAttribute('cx', '0'); gota.setAttribute('cy', '0');
    camada.append(gota);
    const meio = Math.min(y0, y1) - 40;
    gota.animate([
      { transform: `translate(${x0}px, ${y0}px)`, opacity: 0 },
      { transform: `translate(${(x0 + x1) / 2}px, ${meio}px)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${x1}px, ${y1}px)`, opacity: 0 },
    ], { duration: 900, delay: i * 60, easing: 'cubic-bezier(0.33, 0, 0.2, 1)', fill: 'both' });
  });
}

// ---------------------------------------------------------------- tabela por partido

function tabelaPartidos(r, eleitos, q) {
  const doRecorte = resumoPorPartido(eleitos, q);
  const seis = new Map();
  for (const [ano, cargo, , partido, n, leg] of resumoSeis.linhas) {
    if (ano !== r.ano || cargo !== r.cargo) continue;
    const p = seis.get(partido) ?? { eleitos: 0, leg: 0 };
    p.eleitos += n; p.leg += leg; seis.set(partido, p);
  }
  return `<div class="rolagem"><table class="tabela">
    <thead><tr><th>Partido</th><th class="num">Eleitos aqui</th><th class="num">Pela legenda aqui</th><th class="num">%</th>
      <th class="num">Eleitos nos seis estados</th><th class="num">Pela legenda nos seis estados</th></tr></thead>
    <tbody>${doRecorte.map(p => {
      const s = seis.get(p.partido) ?? { eleitos: 0, leg: 0 };
      return `<tr><td>${p.partido}</td><td class="num">${p.eleitos}</td><td class="num">${p.porLegenda}</td>
        <td class="num">${formata.pct(p.pct)}</td><td class="num">${formata.numero(s.eleitos)}</td>
        <td class="num">${formata.numero(s.leg)} (${formata.pct(s.eleitos ? (100 * s.leg) / s.eleitos : 0)})</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

// ---------------------------------------------------------------- ciclo

async function mostraCartao(pid) {
  const caixa = document.getElementById('cartao-regua');
  if (!pid || !atual) { caixa.innerHTML = ''; return; }
  const cands = await leCandidaturas(atual.ue, atual.r.ano);
  const c = cands.find(x => x.pid === Number(pid) && x.cargo === atual.r.cargo);
  const e = atual.desenho.eleitos.find(x => String(x.pid) === String(pid));
  caixa.innerHTML = c ? `<div class="cartao-com-regua">${cartaoPolitico(c)}
      <p class="apoio">${e && porLegenda(e, atual.q) ? `Ficou ${formata.numero(atual.q - e.votos)} votos abaixo do quociente: a vaga veio dos votos que sobraram aos colegas da mesma ${atual.r.ano === 2018 ? 'coligação' : 'federação ou partido'} e dos votos de legenda.`
        : `Teve ${formata.numero(e.votos - atual.q)} votos acima do quociente: entraria sozinho, e a sobra ajudou os colegas.`}</p></div>` : '';
  caixa.querySelector('.botao')?.focus({ preventScroll: true });
}

let pedido = 0;
async function atualiza(r) {
  const meu = ++pedido;
  const ue = ueDe(r);
  const titulo = document.getElementById('t-regua');
  const regua = document.getElementById('regua');
  const avisa = texto => {
    titulo.textContent = ''; regua.innerHTML = `<p class="aviso-vazio">${texto}</p>`;
    ['resumo-regua', 'legenda-regua', 'cartao-regua', 'tabela-legenda'].forEach(id => { document.getElementById(id).innerHTML = ''; });
    atual = null;
  };
  if (!ue) {
    avisa('Escolha um município: a câmara de vereadores é eleita município a município.');
    return;
  }
  let dados;
  try { dados = await carregaDados(`legenda/${ue}.json`); } catch { dados = null; }
  if (meu !== pedido) return;
  const rec = dados?.anos?.[r.ano]?.[r.cargo];
  const nome = await nomeDe(r, ue);
  if (!rec) { avisa(`Não há eleição para ${minusculo(r.cargo)} ${em(nome)} em ${r.ano}.`); return; }
  const desenho = desenhaRegua(rec, dados.unidades, r.ano);
  atual = { r, ue, q: rec.quociente, desenho };
  const pelaLegenda = desenho.eleitos.filter(e => porLegenda(e, rec.quociente)).length;
  titulo.innerHTML = `<span class="sobre">${minusculo(r.cargo)} · ${nome} · ${r.ano}</span>
    ${pelaLegenda} de ${desenho.eleitos.length} eleitos entraram pela legenda`;
  document.getElementById('resumo-regua').innerHTML = `Quociente eleitoral: <b>${formata.numero(rec.quociente)}</b> votos
    (${formata.numero(rec.validos)} votos válidos ÷ ${formata.numero(rec.vagas)} vagas). Colunas abaixo da linha, com contorno
    tracejado, são eleitos pela legenda. Clique numa coluna para ver o eleito.`;
  regua.innerHTML = desenho.svg;
  document.getElementById('legenda-regua').innerHTML = `<span>Cor do partido pela nota dos especialistas: vermelho à esquerda, azul à direita.</span>
    <span class="chave" style="--cor:${COR.centro}">eleito com os próprios votos</span>
    <span class="chave chave-anel" style="--cor:${COR.tecla}">eleito pela legenda (contorno tracejado)</span>`;
  document.getElementById('tabela-legenda').innerHTML = tabelaPartidos(r, desenho.eleitos, rec.quociente);
  document.getElementById('cartao-regua').innerHTML = '';
  if (primeiraPintura && !reduz()) animaGotas(regua.querySelector('svg'), desenho, rec.quociente);
  primeiraPintura = false;
}

const regua = document.getElementById('regua');
regua.addEventListener('click', e => { const g = e.target.closest('.coluna'); if (g) mostraCartao(g.dataset.pid); });
regua.addEventListener('keydown', e => { const g = e.target.closest('.coluna'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); mostraCartao(g.dataset.pid); } });

const brasil = await carregaDados('mapa/brasil.json');
montaSeletor(document.getElementById('recorte'), {
  anos: brasil.anos, cargos: CARGOS, comLugar: true, padrao: { ano: 2022, cargo: 'DEPUTADO FEDERAL', uf: 'PB' }, aoMudar: atualiza,
  municipioObrigatorio: true,
});
