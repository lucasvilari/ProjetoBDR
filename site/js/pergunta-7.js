// Pergunta 7: para que lado se vota? O mapa do Brasil pintado do vermelho (esquerda) ao azul (direita) pelo
// índice ideológico dos votos, cargo a cargo e ano a ano, nas duas réguas; o lugar escolhido no santinho e no
// painel; e, no fim, os partidos (o que era a página Partido), cada um aberto na própria tabela ou em destaque.
//
// Dados: vies/brasil.json (Brasil, regiões e UFs, por cargo), vies/municipios/<UF>.json (municípios, combinado)
// e vies/municipios/<UF>-<cargo>.json (municípios, cada cargo); partidos.json; candidaturas/<ue>-<ano>.json
// (quem recebeu os votos nos cargos de um eleito só); geo/ (contornos do IBGE).
// O recorte (cargo, ano, régua, UF, município e partido em destaque) fica no endereço da página.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/+esm';
import { montaPagina, carregaDados, formata, comSeta, santinho, fotoCandidato, NOME_UF, em, registraRetrato } from './comum.js?v=20261156';
import { COR, corIdeologia, contraste } from './lib/cores.js?v=20261156';
import { leCandidaturas, UFS_PROJETO, grupoOpcoes, trocaMantendoTeclas } from './pecas.js?v=20261156';

montaPagina();

const [vies, geoEstados, { partidos, concordancia_coligacoes: concordancia }] = await Promise.all([
  carregaDados('vies/brasil.json'), carregaDados('geo/estados.json'), carregaDados('partidos.json')]);

const ANOS = [2018, 2020, 2022, 2024, 2026];
const MUNICIPAIS = ['PREFEITO', 'VEREADOR'];
// deputado distrital só existe no DF: entra no mapa de deputado estadual, no lugar do DF
// presidente (o padrão) primeiro; o combinado, que junta dois cargos, por último
const CARGOS = [...vies.cargos.filter(c => c !== 'DEPUTADO DISTRITAL' && c !== 'COMBINADO'), 'COMBINADO'];
const UMA_VAGA = ['PRESIDENTE', 'GOVERNADOR', 'SENADOR', 'PREFEITO'];
const ufsProjeto = new Set(UFS_PROJETO);
const reduz = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ESTILO = { fontFamily: 'Archivo, sans-serif', fontSize: '12px', background: 'transparent' };

const anosDoCargo = c => (c === 'COMBINADO' ? ANOS : MUNICIPAIS.includes(c) ? [2020, 2024] : [2018, 2022, 2026]);
const nomeCargo = c => (c === 'COMBINADO' ? 'combinado' : c.toLowerCase());
// o 2º turno para presidente vem junto com os dados de todo cargo do ano, mas só faz sentido na eleição para presidente
const segundoTurno = l => (estado.cargo === 'PRESIDENTE' ? l?.presidente?.segundo_turno ?? [] : []);
/** O cargo cujos votos fazem o índice num ano: o combinado usa deputado federal nos anos gerais e vereador nos municipais. */
const cargoDosVotos = (c, ano) => (c === 'COMBINADO' ? (ano % 4 === 2 ? 'deputado federal' : 'vereador') : c.toLowerCase());
const slug = c => c.toLowerCase().replaceAll(' ', '-');
const registro = (campos, l) => Object.fromEntries(campos.map((c, i) => [c, l[i]]));
const virgula = v => (v == null ? '—' : String(v).replace('.', ','));
const comSinal = v => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${virgula(Math.abs(v))}`);

const LINHAS_BR = vies.linhas.map(l => registro(vies.campos, l));

const svgCaixa = document.getElementById('mapa');
const painel = document.getElementById('painel');
const form = document.getElementById('controles');

// ---------------------------------------------------------------- estado e endereço

const PADRAO = { cargo: 'PRESIDENTE', ano: 2022, regua: 'especialistas' };
const estado = { ...PADRAO, uf: null, mun: null, partido: null };

function leEndereco() {
  const p = new URLSearchParams(location.hash.slice(1));
  estado.cargo = CARGOS.includes(p.get('cargo')) ? p.get('cargo') : PADRAO.cargo;
  const anos = anosDoCargo(estado.cargo);
  estado.ano = anos.includes(Number(p.get('ano'))) ? Number(p.get('ano')) : anos.includes(PADRAO.ano) ? PADRAO.ano : anos.at(-1);
  estado.regua = p.get('regua') === 'camara' ? 'camara' : 'especialistas';
  estado.uf = ufsProjeto.has(p.get('uf')) ? p.get('uf') : null;
  estado.mun = estado.uf && /^\d{5}$/.test(p.get('mun') ?? '') ? p.get('mun') : null;
  estado.partido = partidos.some(x => x.sigla === p.get('partido')) ? p.get('partido') : null;
}

function endereco(extra = {}) {
  const e = { ...estado, ...extra };
  const p = new URLSearchParams({ cargo: e.cargo, ano: e.ano, regua: e.regua });
  if (e.uf) p.set('uf', e.uf);
  if (e.mun) p.set('mun', e.mun);
  if (e.partido) p.set('partido', e.partido);
  return `#${p}`;
}
const escreveEndereco = () => history.replaceState(null, '', endereco());

// ---------------------------------------------------------------- linhas do índice

const _municipais = new Map();
/** Linhas dos municípios de uma UF para um cargo (o combinado mora no arquivo da UF; cada cargo, no seu). */
async function linhasMunicipais(uf, cargo) {
  const caminho = cargo === 'COMBINADO' ? `vies/municipios/${uf}.json` : `vies/municipios/${uf}-${slug(cargo)}.json`;
  if (!_municipais.has(caminho)) {
    _municipais.set(caminho, carregaDados(caminho).then(f => f.linhas.map(l => registro(f.campos, l))).catch(() => []));
  }
  return _municipais.get(caminho);
}

const ehMunicipio = t => /^\d{5}$/.test(t);
/** A linha de um território num cargo e ano, ou undefined. No DF, deputado estadual é o distrital. */
async function linhaDe(terr, cargo, ano) {
  const linhas = ehMunicipio(terr) ? await linhasMunicipais(estado.uf, cargo) : LINHAS_BR;
  const c = cargo === 'DEPUTADO ESTADUAL' && terr === 'DF' ? 'DEPUTADO DISTRITAL' : cargo;
  return linhas.find(l => l.territorio === terr && l.cargo === c && l.ano === ano);
}

const valor = (l, regua = estado.regua) => (l == null ? null : regua === 'camara' ? l.indice_camara : l.indice);
const cobertura = (l, regua = estado.regua) => (regua === 'camara' ? l.cobertura_camara_pct : l.cobertura_especialistas_pct);
const formataValor = (v, regua = estado.regua) => (regua === 'camara' ? comSinal(v) : virgula(v));
const cor = (v, regua = estado.regua) => corIdeologia(v, regua);
const ladoDe = (v, regua = estado.regua) => {
  if (v == null) return 'sem dado';
  const c = regua === 'camara' ? 0 : 5;
  return v === c ? 'no centro' : v < c ? 'à esquerda do centro' : 'à direita do centro';
};
const escalaTexto = (regua = estado.regua) => (regua === 'camara'
  ? 'na régua da Câmara, de −100 (esquerda) a +100 (direita)' : 'numa escala de 0 (esquerda) a 10 (direita)');
const textoSobre = fundo => (contraste(fundo, '#ffffff') >= 4.5 ? '#ffffff' : COR.tecla);

// as notas de cada partido em cada ano, tiradas das próprias linhas (incluem partidos que já não existem)
const NOTA_ANO = {};
for (const l of LINHAS_BR) for (const [sigla, , nota] of l.principais_partidos) (NOTA_ANO[l.ano] ??= {})[sigla] ??= nota;
const PARTIDO = new Map(partidos.map(p => [p.sigla, p]));
const notaPartido = (sigla, ano, regua = estado.regua) => (regua === 'camara'
  ? PARTIDO.get(sigla)?.camara ?? null
  : NOTA_ANO[ano]?.[sigla] ?? PARTIDO.get(sigla)?.especialistas[ano <= 2020 ? '2018' : '2022'] ?? null);

// ---------------------------------------------------------------- controles

const EXPLICA = {
  especialistas: `<strong>Régua dos especialistas.</strong> Cientistas políticos deram a cada partido uma nota de 0
    (esquerda) a 10 (direita) pela ideologia que o partido declara e defende. Mede onde o partido diz estar.`,
  camara: `<strong>Régua da Câmara.</strong> A posição de cada partido nas votações nominais da Câmara dos Deputados,
    de −100 (esquerda) a +100 (direita). Mede como o partido vota, e sobretudo se vota com o governo da vez, seja qual
    for a ideologia declarada. Por isso as duas réguas podem discordar, e os números de uma não se comparam aos da outra.`,
};

function montaControles() {
  const ativo = document.activeElement;
  const foco = form.contains(ativo) ? ativo.name : null;
  // as fileiras que não mudaram de opções ficam no lugar (a tecla clicada termina a animação de apertar)
  trocaMantendoTeclas(document.getElementById('grupo-cargo'), grupoOpcoes('cargo', 'Cargo', CARGOS.map(c => [c, c === 'COMBINADO'
    ? 'combinado (deputado federal e vereador)' : c.toLowerCase()]), estado.cargo));
  trocaMantendoTeclas(document.getElementById('grupo-ano'), grupoOpcoes('ano', 'Ano', anosDoCargo(estado.cargo).map(a => [a, a]), estado.ano));
  const anos = document.querySelector('#grupo-ano .teclas-opcoes');
  if (tocar.parentNode !== anos) anos.append(tocar);    // a linha do tempo passa por estes anos
  if (ativo === tocar) tocar.focus();
  else if (foco) form.querySelector(`[name="${foco}"]:checked`)?.focus();
  form.elements.regua.value = estado.regua;
  document.getElementById('explica-regua').innerHTML = EXPLICA[estado.regua];
}

form.addEventListener('change', e => {
  para();
  const { name, value } = e.target;
  if (name === 'cargo') {
    estado.cargo = value;
    const anos = anosDoCargo(value);
    if (!anos.includes(estado.ano)) estado.ano = anos.reduce((m, a) => (Math.abs(a - estado.ano) < Math.abs(m - estado.ano) ? a : m));
  }
  if (name === 'ano') estado.ano = Number(value);
  if (name === 'regua') estado.regua = value;
  atualiza();
});

document.getElementById('voltar').addEventListener('click', () => { para(); estado.uf = null; estado.mun = null; atualiza(); });

// linha do tempo: passa os anos do cargo, um a cada 1,2 s, e para no último
const tocar = document.getElementById('tocar');
let relogio = null;
function para() {
  clearInterval(relogio); relogio = null;
  tocar.setAttribute('aria-pressed', 'false'); tocar.textContent = '▶ Linha do tempo';
}
tocar.addEventListener('click', () => {
  if (relogio) { para(); return; }
  const anos = anosDoCargo(estado.cargo);
  if (estado.ano === anos.at(-1)) { estado.ano = anos[0]; atualiza({ animar: true }); }
  tocar.setAttribute('aria-pressed', 'true'); tocar.textContent = '❚❚ Parar';
  relogio = setInterval(() => {
    const i = anos.indexOf(estado.ano);
    if (i >= anos.length - 1) { para(); return; }
    estado.ano = anos[i + 1];
    atualiza({ animar: true });
    if (i + 1 === anos.length - 1) para();
  }, 1200);
});

// ---------------------------------------------------------------- mapa

let mapa = null;   // { id, forma, chave, nomes }

async function constroiMapa(largura, id) {
  const naUF = Boolean(estado.uf);
  const geo = naUF ? await carregaDados(`geo/municipios/${estado.uf}.json`) : geoEstados;
  const nomes = naUF ? (await carregaDados(`mapa/municipios/${estado.uf}.json`)).municipios : null;
  const chave = f => (naUF ? f.properties.mun : f.properties.uf);
  // a altura acompanha o formato do território (a Paraíba é larga e baixa), até um limite
  const projecao = d3.geoMercator().fitWidth(largura, geo);
  let altura = Math.ceil(d3.geoPath(projecao).bounds(geo)[1][1]);
  if (altura > 640) { altura = 640; projecao.fitSize([largura, altura], geo); }
  const caminho = d3.geoPath(projecao);
  const svg = d3.create('svg').attr('viewBox', [0, 0, largura, altura]).attr('class', 'mapa-svg')
    .attr('role', 'group').attr('aria-label', naUF ? `Municípios de ${NOME_UF[estado.uf]}` : 'Estados do Brasil');
  // "sem dado" é hachurado, para não se confundir com o centro bege
  const hachura = svg.append('defs').append('pattern').attr('id', 'sem-dado').attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 6).attr('height', 6).attr('patternTransform', 'rotate(45)');
  hachura.append('rect').attr('width', 6).attr('height', 6).attr('fill', '#cbbd9d');
  hachura.append('rect').attr('width', 1.6).attr('height', 6).attr('fill', '#8f8470');

  const forma = svg.append('g').selectAll('path').data(geo.features).join('path')
    .attr('d', caminho).attr('fill', 'url(#sem-dado)')
    .attr('class', f => (naUF ? `municipio${f.properties.mun === estado.mun ? ' selecionado' : ''}`
      : ufsProjeto.has(f.properties.uf) ? 'estado projeto' : 'estado'));
  forma.append('title');

  const clicavel = naUF ? forma : forma.filter(f => ufsProjeto.has(f.properties.uf));
  clicavel.attr('tabindex', 0).attr('role', 'button')
    .on('click', (_, f) => seleciona(f))
    .on('keydown', (e, f) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleciona(f); } });
  // contornos grossos numa camada por cima, para os vizinhos desenhados depois não os cobrirem
  svg.append('g').attr('class', 'contornos').attr('aria-hidden', 'true')
    .selectAll('path').data(geo.features.filter(f => (naUF ? f.properties.mun === estado.mun : ufsProjeto.has(f.properties.uf))))
    .join('path').attr('d', caminho).attr('class', naUF ? 'municipio selecionado' : 'estado projeto');
  const foco = svg.append('path').attr('class', 'contorno-foco').attr('aria-hidden', 'true');
  clicavel.on('focus', (e, f) => { if (e.target.matches(':focus-visible')) foco.attr('d', caminho(f)); })
    .on('blur', () => foco.attr('d', null));

  svgCaixa.replaceChildren(svg.node());
  mapa = { id, forma, chave, nomes };
}

async function pintaMapa(animar) {
  const naUF = Boolean(estado.uf);
  const linhas = naUF ? await linhasMunicipais(estado.uf, estado.cargo) : LINHAS_BR;
  const valores = {};
  for (const l of linhas) {
    if (l.ano !== estado.ano || (!naUF && !/^[A-Z]{2}$/.test(l.territorio))) continue;
    if (l.cargo === estado.cargo || (estado.cargo === 'DEPUTADO ESTADUAL' && l.cargo === 'DEPUTADO DISTRITAL' && l.territorio === 'DF')) {
      valores[l.territorio] = valor(l);
    }
  }
  const { forma, chave, nomes } = mapa;
  const preenche = f => (valores[chave(f)] == null ? 'url(#sem-dado)' : cor(valores[chave(f)]));
  // a transição de cor entre anos ajuda a ver a mudança; com movimento reduzido, o mapa só troca
  if (animar && !reduz()) forma.transition().duration(700).ease(d3.easeCubicOut).attr('fill', preenche);
  else forma.interrupt().attr('fill', preenche);
  forma.select('title').text(f => {
    const v = valores[chave(f)];
    const nome = naUF ? nomes?.[f.properties.mun]?.nome ?? 'Município' : NOME_UF[f.properties.uf];
    return `${nome}: ${v == null ? 'sem dado' : `${formataValor(v)} (${ladoDe(v)})`}${!naUF && !ufsProjeto.has(f.properties.uf) ? ' · fora dos seis estados do projeto' : ''}`;
  });
  desenhaLegenda();
  document.getElementById('dica').textContent = naUF
    ? 'Clique num município para ver os números dele; clique de novo para voltar ao estado.'
    : `Os seis estados do projeto têm contorno escuro e podem ser clicados.${estado.cargo === 'COMBINADO'
      ? ` Em ${estado.ano}, o combinado usa os votos para ${cargoDosVotos('COMBINADO', estado.ano)}.` : ''}`;
}

async function desenhaMapa(animar = false) {
  const largura = svgCaixa.clientWidth || 640;
  const id = `${estado.uf ?? 'BR'}|${estado.mun ?? ''}|${largura}`;
  if (mapa?.id !== id) await constroiMapa(largura, id);
  await pintaMapa(animar);
}

/** A legenda: o degradê da régua escolhida, com as fronteiras das classes (especialistas) ou o zero (Câmara). */
function desenhaLegenda() {
  const camara = estado.regua === 'camara';
  const [min, max] = camara ? [-100, 100] : [3, 8];
  const pos = v => (100 * (v - min)) / (max - min);
  const paradas = d3.range(min, max + 0.001, (max - min) / 20).map(v => `${cor(v)} ${pos(v)}%`).join(', ');
  const marcas = camara ? [[-50, '−50'], [0, '0'], [50, '+50']] : vies.faixas.slice(0, -1).map(f => [f[0], virgula(f[0])]);
  document.getElementById('legenda').innerHTML = `
    <span class="legenda-titulo">${camara ? 'Régua da Câmara (−100 = esquerda, +100 = direita)' : 'Índice dos especialistas (0 = esquerda, 10 = direita)'}</span>
    <span class="escala-vies">
      <i style="background: linear-gradient(90deg, ${paradas})"></i>
      ${marcas.map(([v, r]) => `<b style="left:${pos(v)}%">${r}</b>`).join('')}
      <em class="ponta-esq">esquerda</em><em class="ponta-dir">direita</em>
    </span>
    <span class="legenda-faixas"><span><i class="sem-dado"></i>sem dado</span></span>`;
}

function seleciona(f) {
  para();
  if (!estado.uf) { estado.uf = f.properties.uf; estado.mun = null; }
  else estado.mun = f.properties.mun === estado.mun ? null : f.properties.mun;
  atualiza();
}

// ---------------------------------------------------------------- lugar escolhido

const territorio = () => estado.mun ?? estado.uf ?? 'BR';
async function nomeDe(terr) {
  if (ehMunicipio(terr)) return `${(await carregaDados(`mapa/municipios/${estado.uf}.json`)).municipios[terr]?.nome ?? terr} (${estado.uf})`;
  return terr === 'BR' ? 'Brasil' : NOME_UF[terr] ?? `região ${terr}`;
}
const Em = nome => { const t = em(nome); return t[0].toUpperCase() + t.slice(1); };
const apelido = n => ({ 'LUIZ INÁCIO LULA DA SILVA': 'Lula', 'JAIR MESSIAS BOLSONARO': 'Bolsonaro', 'FERNANDO HADDAD': 'Haddad' })[n]
  ?? n.split(' ').filter(p => p.length > 2).slice(-1)[0].replace(/^(.)(.*)$/, (_, a, b) => a + b.toLowerCase());

/** O santinho do ano escolhido e, atrás dele, os outros anos do mesmo cargo. */
let anoDoSantinho = null;
async function desenhaSantinho(terr, nome) {
  const anos = anosDoCargo(estado.cargo);
  const linhas = await Promise.all(anos.map(a => linhaDe(terr, estado.cargo, a)));
  const l = linhas[anos.indexOf(estado.ano)];
  const outra = estado.regua === 'camara' ? 'especialistas' : 'camara';
  const st = segundoTurno(l);
  const caixa = document.getElementById('pilha');
  const v = valor(l);
  caixa.innerHTML = `
    <div class="pilha-anos" role="group" aria-label="Outros anos do mesmo cargo">
      ${anos.map((a, j) => [a, linhas[j]]).filter(([a]) => a !== estado.ano).map(([a, x], k) => `<button type="button" class="pilha-ano" data-ano="${a}" style="--k:${k}">
        <b>${a}</b><span>${valor(x) == null ? 'sem dado' : formataValor(valor(x))}</span></button>`).join('')}
    </div>
    ${v == null
    ? santinho({ faixa: `${nomeCargo(estado.cargo)} · ${estado.ano}`, nome, numero: '—', rotulo: 'Sem dado para este recorte.', classe: 'santinho-neutro' })
    : santinho({
      faixa: `${nomeCargo(estado.cargo)} · ${estado.ano}`, nome, classe: 'santinho-vies',
      numero: `<i class="ponto-vies" style="--cor:${cor(v)}"></i>${formataValor(v)}`,
      rotulo: `${estado.regua === 'camara' ? ladoDe(v)[0].toUpperCase() + ladoDe(v).slice(1) : l.classificacao}, ${escalaTexto()}, nos votos para ${cargoDosVotos(estado.cargo, estado.ano)}.`,
      linhas: [
        ...(st.length ? [['Presidente, 2º turno', `${apelido(st[0][0])} ${virgula(st[0][2])}%`]] : []),
        ['Votos contados', formata.numero(l.votos)],
        ['Votos com nota', `${virgula(cobertura(l))}%`],
        [outra === 'camara' ? 'Na régua da Câmara' : 'Na régua dos especialistas', formataValor(valor(l, outra), outra)],
      ],
      verso: `<p>Cada partido tem uma posição na régua. O índice é a média dessas posições, com peso pelos votos que cada
        partido recebeu para ${cargoDosVotos(estado.cargo, estado.ano)} no 1º turno (votos no candidato e na legenda).</p>
        <p>Partidos sem posição na régua ficam fora da média; "votos com nota" diz quanto dos votos entrou na conta.</p>`,
      fonte: 'p07_vies_ideologico.sql',
    })}`;
  if (anoDoSantinho != null && anoDoSantinho !== estado.ano) {
    caixa.classList.remove('assenta'); void caixa.offsetWidth; caixa.classList.add('assenta');
  }
  anoDoSantinho = estado.ano;
}

document.getElementById('pilha').addEventListener('click', e => {
  const ano = e.target.closest('.pilha-ano')?.dataset.ano;
  if (ano) { para(); estado.ano = Number(ano); atualiza(); }
});

/** Barras do 2º turno para presidente: o lugar e o Brasil, cada candidato na cor da nota do partido. */
function barrasPresidente(linhas, largura) {
  const dados = linhas.flatMap(({ rotulo, presidente }) => (presidente?.segundo_turno ?? []).map(([nome, sigla, pct, nota]) =>
    ({ rotulo, curto: apelido(nome), sigla, pct, nota })));
  if (!dados.length) return null;
  const marginLeft = Math.min(130, 14 + 7 * d3.max(linhas, l => l.rotulo.length));
  const cabe = d => (d.pct / 100) * (largura - marginLeft - 10) > 7 * (d.curto.length + 7);
  return Plot.plot({
    width: largura, height: 34 + 34 * linhas.length, marginLeft, marginRight: 10, style: ESTILO,
    x: { domain: [0, 100], axis: null }, y: { domain: linhas.map(l => l.rotulo), label: null },
    marks: [
      Plot.barX(dados, Plot.stackX({ y: 'rotulo', x: 'pct', fill: d => corIdeologia(d.nota), stroke: COR.tecla, strokeWidth: 1 })),
      Plot.text(dados, Plot.stackX({ y: 'rotulo', x: 'pct', text: d => (cabe(d) ? `${d.curto} ${virgula(d.pct)}%` : `${virgula(d.pct)}%`),
                                     fill: d => textoSobre(corIdeologia(d.nota)), fontWeight: 700, title: d => `${d.curto} (${d.sigla}): ${virgula(d.pct)}%` })),
      Plot.ruleX([50], { stroke: COR.tecla, strokeDasharray: '2,3' }),
    ],
  });
}

/** Quem recebeu os votos nos cargos de um eleito só: cada candidato, a barra na cor do partido. */
async function quemRecebeu(terr) {
  if (!UMA_VAGA.includes(estado.cargo)) return '';
  const ue = estado.cargo === 'PRESIDENTE' ? (terr === 'BR' ? 'BR' : null)
    : estado.cargo === 'PREFEITO' ? (ehMunicipio(terr) ? terr : null) : (ufsProjeto.has(terr) ? terr : null);
  if (!ue) return '';
  const cands = (await leCandidaturas(ue, estado.ano)).filter(c => c.cargo === estado.cargo && c.votos > 0)
    .sort((a, b) => b.votos - a.votos).slice(0, 8);
  if (!cands.length) return '';
  const total = d3.sum(cands, c => c.votos), maior = cands[0].votos;
  return `<h4>Quem recebeu esses votos</h4>
    <ol class="quem-votos">${cands.map(c => {
      const n = notaPartido(c.sigla, estado.ano);
      return `<li>${c.nomeado ? fotoCandidato(c.foto, 'quem-foto') : ''}
        <span class="quem-nome">${c.pid ? `<a href="pergunta-10.html#${c.pid}">${c.nome}</a>` : c.nome}
          <a class="selo-partido" href="${endereco({ partido: c.sigla })}" data-partido="${c.sigla}" style="--cor:${cor(n)};color:${textoSobre(cor(n))}">${c.sigla}</a>
          ${c.eleito ? '<span class="selo selo-vitoria">eleito</span>' : ''}</span>
        <span class="quem-barra"><i style="width:${(100 * c.votos) / maior}%;--cor:${cor(n)}"></i></span>
        <span class="quem-votos-n">${formata.numero(c.votos)} <span class="apoio">${formata.pct((100 * c.votos) / total)}</span>
          ${c.votos_2t ? `<small>2º turno: ${formata.numero(c.votos_2t)}</small>` : ''}</span></li>`;
    }).join('')}</ol>
    <p class="apoio">Barras: votos no 1º turno, os do 2º turno ao lado quando houve. A cor de cada barra é a posição do partido do candidato na régua escolhida
      (${estado.regua === 'camara' ? 'Câmara' : 'especialistas'}); cinza quando o partido não tem posição nela.</p>`;
}

let pedido = 0;
async function desenhaPainel(terr, nome) {
  const meu = pedido;
  const ehMun = ehMunicipio(terr);
  const l = await linhaDe(terr, estado.cargo, estado.ano);
  if (!l) { painel.innerHTML = `<p class="aviso-vazio">Não há votos para ${nomeCargo(estado.cargo)} ${em(nome)} em ${estado.ano}.</p>`; return; }
  const v = valor(l);
  const curto = ehMun ? (nome.length > 14 ? `${nome.slice(0, 13)}…` : nome.replace(/ \(..\)$/, '')) : terr === 'BR' ? 'Brasil' : terr;
  const st = segundoTurno(l);
  const brAno = terr !== 'BR' ? await linhaDe('BR', estado.cargo, estado.ano) : null;
  const quem = await quemRecebeu(terr);
  if (meu !== pedido) return;

  let abertura = `${Em(nome)}, em ${estado.ano}, os votos para ${cargoDosVotos(estado.cargo, estado.ano)} deram um índice de
    <strong>${formataValor(v)}</strong> ${escalaTexto()}: ${estado.regua === 'camara' ? ladoDe(v) : (l.classificacao ?? 'sem classificação').toLowerCase()}.`;
  if (v != null && brAno && valor(brAno) != null) {
    const d = v - valor(brAno);
    abertura += ` No Brasil, o mesmo cargo deu ${formataValor(valor(brAno))}; ${em(nome)} votou ${Math.abs(d) < 0.05 * (estado.regua === 'camara' ? 20 : 1)
      ? 'quase igual ao país' : d < 0 ? 'mais à esquerda que o país' : 'mais à direita que o país'}.`;
  }
  if (st.length >= 2) {
    abertura += ` Para presidente, o 2º turno deu ${virgula(st[0][2])}% a ${apelido(st[0][0])} (${st[0][1]}) e ${virgula(st[1][2])}% a ${apelido(st[1][0])} (${st[1][1]}).`;
  }
  const largura = Math.min(900, painel.clientWidth || 520);
  const caixa = document.createElement('div');
  caixa.innerHTML = `
    <h3>Para que lado ${em(nome)} votou?</h3>
    <p>${abertura}</p>
    ${st.length ? `<h4>Presidente, 2º turno de ${estado.ano}</h4><div class="grafico" id="g-presidente"></div>
      <p class="apoio">A cor de cada candidato segue a nota do partido dele nos especialistas.</p>` : ''}
    ${quem}
    <h4>Partidos mais votados para ${cargoDosVotos(estado.cargo, estado.ano)} ${em(nome)}, em ${estado.ano}</h4>
    <div class="rolagem"><table class="tabela">
      <thead><tr><th>Partido</th><th class="num">Parcela dos votos</th><th class="num">Especialistas<span class="situacao">esquerda 0 a 10 direita</span></th>
        <th class="num">Câmara<span class="situacao">esquerda −100 a +100 direita</span></th></tr></thead>
      <tbody>${l.principais_partidos.map(([sigla, pct, nota]) => `<tr><td>${PARTIDO.has(sigla) ? `<a href="${endereco({ partido: sigla })}" data-partido="${sigla}">${sigla}</a>` : sigla}</td>
        <td class="num">${virgula(pct)}%</td>
        <td class="num">${nota == null ? '<span class="sem-info">sem nota</span>' : comSeta(nota)}</td>
        <td class="num">${PARTIDO.get(sigla)?.camara == null ? '<span class="sem-info">sem dado</span>' : comSeta(PARTIDO.get(sigla).camara, 0, 1)}</td></tr>`).join('')}</tbody></table></div>
    <p class="apoio">Os votos dados a cada partido no 1º turno (no candidato e na legenda) pesam a média das posições dos
      partidos. ${virgula(cobertura(l))}% dos votos ${em(nome)} foram de partidos com posição na régua ${estado.regua === 'camara'
      ? 'da Câmara' : 'dos especialistas'}; os demais ficaram fora da conta.</p>`;
  if (st.length) {
    const b = barrasPresidente([{ rotulo: curto, presidente: l.presidente }, ...(brAno?.presidente ? [{ rotulo: 'Brasil', presidente: brAno.presidente }] : [])], largura);
    if (b) caixa.querySelector('#g-presidente').append(b);
  }
  painel.replaceChildren(caixa);
}

// ---------------------------------------------------------------- partidos

const nota2 = v => (v == null ? '—' : String(v.toFixed(2)).replace('.', ','));
/** O detalhe de um partido: o santinho, as alianças ao longo do tempo e os eleitos de cada eleição. */
function detalhePartido(p, { fechar = false } = {}) {
  const caixa = document.createElement('div');
  caixa.className = 'detalhe-partido';
  const serie = Object.entries(p.coligacoes).map(([ano, v]) => ({ ano: Number(ano), v }));
  const esp = Object.entries(p.especialistas).filter(([, v]) => v != null).map(([ano, v]) => ({ ano: Number(ano), v }));
  const eleicoes = p.eleicoes.map(([ano, cargo, candidatos, eleitos]) => ({ ano, cargo, candidatos, eleitos }))
    .sort((a, b) => b.ano - a.ano || b.eleitos - a.eleitos);
  caixa.innerHTML = `
    ${santinho({
      faixa: `partido · número ${p.numero}`, nome: p.sigla, numero: p.numero, rotulo: p.nome.toLowerCase(),
      linhas: [['Especialistas, 2022', nota2(p.especialistas['2022'])], ['Alianças, 2024', nota2(p.coligacoes['2024'] ?? null)],
               ['Câmara', p.camara == null ? 'sem deputados' : comSinal(p.camara)]],
      verso: `<p>Especialistas: nota de 0 (esquerda) a 10 (direita) dada por cientistas políticos em 2018 e 2022.</p>
        <p>Alianças: a posição revelada pelas coligações para prefeito, na mesma escala.</p>
        <p>Câmara: posição nas votações nominais, de −100 a +100; mede sobretudo o alinhamento com o governo.</p>`,
      fonte: 'p07b_ideologia_coligacoes.sql', classe: 'santinho-partido',
    })}
    <div class="detalhe-partido-corpo">
      <div class="detalhe-partido-topo"><h3>${p.sigla} ao longo do tempo</h3>
        ${fechar ? '<button type="button" class="botao fecha-destaque">Fechar</button>' : ''}</div>
      <p>As alianças do partido para prefeito (linha) e a nota dos especialistas (quadrados). Somando todos os partidos, a
        concordância entre as duas foi de ${virgula(concordancia['2016'])} em 2016 e ${virgula(concordancia['2024'])} em 2024
        (1 seria a mesma ordem).</p>
      <div class="grafico g-detalhe"></div>
      ${eleicoes.length ? `<h4>Eleitos em cada eleição</h4>
        <div class="rolagem"><table class="tabela tabela-compacta">
          <thead><tr><th>Ano</th><th>Cargo</th><th class="num">Candidatos</th><th class="num">Eleitos</th></tr></thead>
          <tbody>${eleicoes.map(e => `<tr><td>${e.ano}</td><td><a href="pergunta-1.html#${new URLSearchParams({ ano: e.ano, cargo: e.cargo })}">${e.cargo.toLowerCase()}</a></td>
            <td class="num">${formata.numero(e.candidatos)}</td><td class="num">${formata.numero(e.eleitos)}</td></tr>`).join('')}</tbody>
        </table></div>` : ''}
    </div>`;
  requestAnimationFrame(() => {
    const alvo = caixa.querySelector('.g-detalhe');
    if (!serie.length && !esp.length) return;
    alvo.append(Plot.plot({
      width: alvo.clientWidth || 560, height: 220, marginLeft: 70, style: { ...ESTILO, fontSize: '13px' },
      x: { domain: [1999, 2027], ticks: [2000, 2004, 2008, 2012, 2016, 2020, 2024], tickFormat: String, label: null },
      y: { domain: [0, 10], ticks: [0, 5, 10], tickFormat: v => ({ 0: 'esquerda', 5: 'centro', 10: 'direita' })[v], grid: true, label: null },
      marks: [
        Plot.line(serie, { x: 'ano', y: 'v', stroke: COR.tecla, strokeWidth: 2 }),
        Plot.dot(serie, { x: 'ano', y: 'v', fill: d => corIdeologia(d.v), stroke: COR.tecla, r: 4.5, title: d => `alianças ${d.ano}: ${nota2(d.v)}` }),
        Plot.dot(esp, { x: 'ano', y: 'v', symbol: 'square', fill: d => corIdeologia(d.v), stroke: COR.tecla, strokeWidth: 2, r: 6,
                        title: d => `especialistas ${d.ano}: ${nota2(d.v)}` }),
      ],
    }));
  });
  return caixa;
}

/** O partido aberto por uma sigla do painel (ou pelo endereço #partido=SIGLA); a seção só aparece com ele. */
function mostraDestaque(rolar) {
  const alvo = document.getElementById('destaque-partido');
  document.getElementById('partidos').hidden = !estado.partido;
  if (!estado.partido) { alvo.replaceChildren(); return; }
  alvo.replaceChildren(detalhePartido(PARTIDO.get(estado.partido), { fechar: true }));
  if (rolar) {
    alvo.scrollIntoView({ behavior: reduz() ? 'auto' : 'smooth', block: 'start' });
    alvo.focus({ preventScroll: true });
  }
}

document.getElementById('destaque-partido').addEventListener('click', e => {
  if (!e.target.closest('.fecha-destaque')) return;
  estado.partido = null; escreveEndereco(); mostraDestaque(false);
});

// os links de partido (tabela, painel, candidatos) abrem o destaque sem perder o recorte do mapa
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-partido]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  estado.partido = a.dataset.partido; escreveEndereco(); mostraDestaque(true);
});

// ---------------------------------------------------------------- ciclo

async function atualiza({ animar = false } = {}) {
  const meu = ++pedido;
  montaControles();
  escreveEndereco();
  const terr = territorio();
  const nome = await nomeDe(terr);
  if (meu !== pedido) return;
  document.getElementById('titulo-territorio').textContent = estado.uf ? nome : 'Brasil';
  document.getElementById('voltar').hidden = !estado.uf;
  await Promise.all([desenhaMapa(animar), desenhaSantinho(terr, nome), desenhaPainel(terr, nome)]);
}

// ---------------------------------------------------------------- o retrato para o oráculo

/** O que a página mostra agora: o índice do lugar nas duas réguas e o do Brasil, os outros anos do mesmo cargo, os
 *  partidos mais votados, o 2º turno (na eleição para presidente) e o partido que o leitor abriu. */
/** A diferença entre dois índices na régua escolhida, em palavras: diferenças menores que 5% da escala (0,5 ponto na
 *  régua de 0 a 10; 10 pontos na da Câmara) contam como praticamente iguais. */
function diferenca(a, b, r = estado.regua) {
  if (a == null || b == null) return null;
  const d = a - b, quase = r === 'camara' ? 10 : 0.5;
  const pontos = formataValor(Math.round(Math.abs(d) * 100) / 100, 'especialistas');
  if (Math.abs(d) < quase / 10) return `praticamente igual (${pontos} ponto de diferença)`;
  return `${Math.abs(d) < quase ? 'ligeiramente' : 'bem'} mais à ${d > 0 ? 'direita' : 'esquerda'} (${pontos} ponto${Math.abs(d) >= 2 ? 's' : ''} de diferença)`;
}

registraRetrato(async () => {
  const terr = territorio();
  const [nome, l] = await Promise.all([nomeDe(terr), linhaDe(terr, estado.cargo, estado.ano)]);
  const br = terr === 'BR' ? null : await linhaDe('BR', estado.cargo, estado.ano);
  const anos = anosDoCargo(estado.cargo);
  const serie = await Promise.all(anos.map(a => linhaDe(terr, estado.cargo, a)));
  const outra = estado.regua === 'camara' ? 'especialistas' : 'camara';
  const st = segundoTurno(l);
  const p = estado.partido ? PARTIDO.get(estado.partido) : null;
  const regua = r => (r === 'camara' ? 'régua da Câmara (−100 esquerda a +100 direita)' : 'régua dos especialistas (0 esquerda a 10 direita)');
  return {
    numero: 7, pergunta: 'Para que lado se vota?',
    recorte: `${nomeCargo(estado.cargo)} · ${nome} · ${estado.ano} · ${regua(estado.regua)}`,
    secoes: [
      { titulo: 'O índice do lugar (média das posições dos partidos, com peso pelos votos de cada um no 1º turno)', linhas: l ? [
        ['Votos usados', `para ${cargoDosVotos(estado.cargo, estado.ano)}`],
        ['Índice nesta régua', valor(l) == null ? 'sem dado' : `${formataValor(valor(l))} (${estado.regua === 'camara' ? ladoDe(valor(l)) : (l.classificacao ?? 'sem classificação').toLowerCase()})`],
        [`Índice na ${regua(outra)}`, valor(l, outra) == null ? null
          : `${formataValor(valor(l, outra), outra)} (${outra === 'camara' ? ladoDe(valor(l, outra), 'camara') : (l.classificacao ?? 'sem classificação').toLowerCase()})`],
        ['Votos com posição na régua (o resto ficou fora da conta)', `${virgula(cobertura(l))}%`],
        ['Brasil, mesmo cargo e ano', br && valor(br) != null ? formataValor(valor(br)) : null],
      ] : [[null, `Não há votos para ${nomeCargo(estado.cargo)} neste lugar em ${estado.ano}.`]] },
      { titulo: 'Comparações prontas (calculadas pela página)', linhas: [
        ['Este lugar em relação ao Brasil', l && br ? diferenca(valor(l), valor(br)) : null],
        ...anos.slice(1).map((a, i) => [`${a} em relação a ${anos[i]}`, diferenca(valor(serie[i + 1]), valor(serie[i]))]),
      ] },
      { titulo: 'O mesmo cargo e lugar em outros anos', linhas: anos.map((a, i) => [String(a), valor(serie[i]) == null ? 'sem dado' : formataValor(valor(serie[i]))]) },
      { titulo: 'Presidente, 2º turno', linhas: st.map(([candidato, sigla, pct]) => [null, `${candidato} (${sigla}): ${virgula(pct)}%`]) },
      { titulo: 'Partidos mais votados (parcela dos votos e nota dos especialistas)', linhas: (l?.principais_partidos ?? []).slice(0, 12)
        .map(([sigla, pct, nota]) => [null, `${sigla}: ${virgula(pct)}% dos votos, ${nota == null ? 'sem nota' : `nota ${virgula(nota)}`}`]) },
      { titulo: 'Partido aberto pelo leitor', linhas: p ? [
        ['Partido', p.sigla], ['Nota dos especialistas neste ano', notaPartido(p.sigla, estado.ano, 'especialistas') == null ? null : virgula(notaPartido(p.sigla, estado.ano, 'especialistas'))],
        ['Posição na régua da Câmara', p.camara == null ? null : comSinal(p.camara)],
      ] : [] },
    ],
  };
});

leEndereco();
await atualiza();
mostraDestaque(Boolean(estado.partido));
// endereço colado ou botões voltar e avançar do navegador
addEventListener('hashchange', () => { para(); leEndereco(); atualiza(); mostraDestaque(Boolean(estado.partido)); });
let redimensiona;
addEventListener('resize', () => { clearTimeout(redimensiona); redimensiona = setTimeout(() => desenhaMapa(), 200); });
