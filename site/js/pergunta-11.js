// Pergunta 11: o que mudou no mandato? O mapa dos seis estados (e, ao clicar, dos municípios) pintado por um indicador
// de um ano: setor que mais pesa, PIB per capita, homicídios, ou a variação de PIB e homicídios durante o mandato de
// quem foi eleito (governador no mapa do Brasil, prefeito no mapa do estado).
//
// Dados: retrospecto/uf.json (série anual por UF e governadores), retrospecto/municipios/<UF>.json (série anual e prefeitos
// de cada município) e geo/ (contornos do IBGE). O recorte (indicador, ano, UF, município) fica no endereço da página.
// O PIB per capita é a preços correntes: a variação não desconta a inflação. É retrato, não prova de causa.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/+esm';
import { montaPagina, carregaDados, formata, santinho, NOME_UF, em, registraRetrato } from './comum.js?v=20261159';
import { COR } from './lib/cores.js?v=20261159';
import { UFS_PROJETO, grupoOpcoes, trocaMantendoTeclas } from './pecas.js?v=20261159';
import { SETORES, indiceDoMaior, limitesPorQuantis, limitesDivergentes, faixaDe, numeroBr, mandatoDe, rotuloMandato, extremos } from './lib/retrospecto.js?v=20261159';

montaPagina();

const [uf, geoEstados] = await Promise.all([carregaDados('retrospecto/uf.json'), carregaDados('geo/estados.json')]);
const ufsProjeto = new Set(UFS_PROJETO);
const reduz = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ESTILO = { fontFamily: 'Archivo, sans-serif', fontSize: '12px', background: 'transparent' };

// posições dos campos nas linhas dos JSON (campos_ano e campos_mandato de retrospecto/)
const A = { ano: 0, pib: 1, pop: 2, pibPc: 3, hom: 4, agro: 5, ind: 6, serv: 7, adm: 8 };    // série anual de uma UF
const M = { ano: 0, pibPc: 1, hom3: 2, agro: 3, ind: 4, serv: 5, adm: 6, setor: 7 };         // série anual de um município
const D = { eleicao: 0, nome: 1, partido: 2, pibIni: 3, anoPib: 4, pibFim: 5, varPib: 6, homIni: 7, anoHom: 8, homFim: 9, varHom: 10 };

const form = document.getElementById('controles');
const svgCaixa = document.getElementById('mapa');
const painel = document.getElementById('painel');
const virgula = v => (v == null ? '—' : String(v).replace('.', ','));

// ---------------------------------------------------------------- indicadores

const COR_SETOR = ['#4e9a3a', '#3b6ea8', '#d9a21b', '#8c5a9e'];
const VERDES = ['#ddd0b4', '#bcd5a2', '#8dbb7a', '#5a9c57', '#2f7d3d', '#0b5a2e'];
const LARANJAS = ['#ddd0b4', '#f2c49b', '#ee9a5e', '#e2692a', '#b8431a', '#7a2208'];
// a variação dos homicídios diverge: queda em verde (bom), alta em laranja (ruim)
const DIVERGE = ['#0b5a2e', '#5a9c57', '#bcd5a2', '#f2c49b', '#e2692a', '#7a2208'];

const real = v => formata.real(v);
const IND = {
  setor: { rotulo: 'setor que mais pesa', anos: d3.range(2010, 2022), tipo: 'categorias',
    explica: 'O setor da economia que mais pesa no valor adicionado do lugar: agropecuária, indústria, serviços ou administração pública (IBGE, até 2021).' },
  pib: { rotulo: 'PIB per capita', anos: d3.range(2011, 2023), paleta: VERDES, texto: real,
    explica: 'PIB por habitante a preços correntes (IBGE, até 2022). Não desconta a inflação: compare lugares no mesmo ano, não anos distantes entre si.' },
  homicidios: { rotulo: 'homicídios', anos: d3.range(2010, 2025), paleta: LARANJAS, texto: v => `${numeroBr(v)} por 100 mil`,
    explica: 'Homicídios por 100 mil habitantes (Atlas da Violência, registros do Ministério da Saúde, até 2024). Nos municípios, média dos últimos 3 anos; os que o Atlas não publica ficam hachurados.' },
  var_pib: { rotulo: 'variação do PIB per capita no mandato', mandato: true, paleta: VERDES, texto: v => `${numeroBr(v, 1, true)}%`,
    explica: 'Quanto o PIB per capita mudou entre o ano da eleição e o último ano medido do mandato de quem foi eleito (governador no mapa do Brasil, prefeito no mapa do estado). É a preços correntes: parte da alta é só inflação.' },
  var_hom: { rotulo: 'variação dos homicídios no mandato', mandato: true, paleta: DIVERGE, divergente: true, texto: v => `${numeroBr(v, 1, true)} por 100 mil`,
    explica: 'Quanto a taxa de homicídios (média de 3 anos) mudou entre o ano da eleição e o último ano medido do mandato. Verde: caiu; laranja: subiu. Os mandatos sem desfecho medido (eleição de 2024, e governador de 2022 no PIB) ficam hachurados.' },
};
const ehMandato = ind => Boolean(IND[ind].mandato);
const anosDe = ind => (ehMandato(ind) ? (estado.uf ? [2012, 2016, 2020] : [2014, 2018, 2022]) : IND[ind].anos);

// ---------------------------------------------------------------- estado e endereço

const PADRAO = { ind: 'setor', ano: 2021 };
const estado = { ...PADRAO, uf: null, mun: null };

function leEndereco() {
  const p = new URLSearchParams(location.hash.slice(1));
  estado.ind = IND[p.get('ind')] ? p.get('ind') : PADRAO.ind;
  estado.uf = ufsProjeto.has(p.get('uf')) ? p.get('uf') : null;
  estado.mun = estado.uf && /^\d{5}$/.test(p.get('mun') ?? '') ? p.get('mun') : null;
  const ano = Number(p.get('ano'));
  estado.ano = anosDe(estado.ind).includes(ano) ? ano : PADRAO.ano;
  ajustaAno();
}
function ajustaAno() {
  const anos = anosDe(estado.ind);
  if (!anos.includes(estado.ano)) estado.ano = anos.reduce((m, a) => (Math.abs(a - estado.ano) < Math.abs(m - estado.ano) ? a : m));
}
const escreveEndereco = () => {
  const p = new URLSearchParams({ ind: estado.ind, ano: estado.ano });
  if (estado.uf) p.set('uf', estado.uf);
  if (estado.mun) p.set('mun', estado.mun);
  history.replaceState(null, '', `#${p}`);
};

// ---------------------------------------------------------------- dados por lugar

const _municipios = new Map();
const carregaMunicipios = u => {
  if (!_municipios.has(u)) _municipios.set(u, carregaDados(`retrospecto/municipios/${u}.json`));
  return _municipios.get(u);
};
let MUN = {};   // municípios do estado aberto: { cod: { nome, anos, prefeitos } }

const nomeUF = u => NOME_UF[u];
const nomeMun = cod => MUN[cod]?.nome ?? cod;
const linhaUF = (u, ano) => uf.ufs[u]?.anos.find(l => l[A.ano] === ano);
const linhaMun = (cod, ano) => MUN[cod]?.anos.find(l => l[M.ano] === ano);
const mandatoUF = (u, ano) => uf.ufs[u]?.governadores.find(m => m[D.eleicao] === ano);
const mandatoMun = (cod, ano) => MUN[cod]?.prefeitos.find(m => m[D.eleicao] === ano);

/** O valor de um indicador num lugar e ano: número, ou o índice do setor; null sem dado. */
function valor(terr, ind, ano) {
  const ehMun = /^\d{5}$/.test(terr);
  if (ehMandato(ind)) {
    const m = ehMun ? mandatoMun(terr, ano) : mandatoUF(terr, ano);
    return m ? m[ind === 'var_pib' ? D.varPib : D.varHom] ?? null : null;
  }
  const l = ehMun ? linhaMun(terr, ano) : linhaUF(terr, ano);
  if (!l) return null;
  if (ind === 'pib') return l[ehMun ? M.pibPc : A.pibPc] ?? null;
  if (ind === 'homicidios') return l[ehMun ? M.hom3 : A.hom] ?? null;
  return ehMun ? l[M.setor] ?? null : indiceDoMaior([l[A.agro], l[A.ind], l[A.serv], l[A.adm]]);
}
const territorios = () => (estado.uf ? Object.keys(MUN) : UFS_PROJETO);
const territorio = () => estado.mun ?? estado.uf;

// ---------------------------------------------------------------- escala de cores

/** As faixas e cores do indicador no nível aberto, iguais em todos os anos para a linha do tempo ser comparável. */
function montaEscala(ind) {
  if (IND[ind].tipo === 'categorias') {
    return { cor: v => COR_SETOR[v], itens: SETORES.map((s, i) => [COR_SETOR[i], s]) };
  }
  const todos = territorios().flatMap(t => anosDe(ind).map(a => valor(t, ind, a))).filter(v => v != null);
  const { paleta, divergente, texto } = IND[ind];
  const limites = divergente ? limitesDivergentes(todos) : limitesPorQuantis(todos, paleta.length);
  if (!limites.length) return { cor: () => paleta[0], itens: [] };
  const cores = divergente ? paleta : paleta.slice(0, limites.length + 1);
  const rot = i => (i === 0 ? `até ${texto(limites[0])}` : i === limites.length ? `${texto(limites.at(-1))} ou mais`
    : `${texto(limites[i - 1])} a ${texto(limites[i])}`);
  return { cor: v => cores[faixaDe(v, limites)], itens: cores.map((c, i) => [c, rot(i)]) };
}

// ---------------------------------------------------------------- controles

function montaControles() {
  const ativo = document.activeElement;
  const foco = form.contains(ativo) ? ativo.name || ativo.id : null;
  trocaMantendoTeclas(document.getElementById('grupo-indicador'), grupoOpcoes('ind', 'Indicador', [
    ['setor', 'setor que mais pesa'], ['pib', 'PIB per capita'], ['homicidios', 'homicídios'],
    ['var_pib', 'variação do PIB no mandato'], ['var_hom', 'variação dos homicídios no mandato']], estado.ind));
  const anos = anosDe(estado.ind), campo = document.getElementById('ano');
  campo.max = anos.length - 1;
  campo.value = anos.indexOf(estado.ano);
  document.getElementById('ano-saida').textContent = ehMandato(estado.ind)
    ? `eleição de ${estado.ano} (mandato ${mandatoDe(estado.ano).de}–${mandatoDe(estado.ano).ate})` : estado.ano;
  document.getElementById('explica').textContent = IND[estado.ind].explica;
  if (foco) (document.getElementById(foco) ?? form.querySelector(`[name="${foco}"]:checked`))?.focus();
}

form.addEventListener('change', e => {
  if (e.target.name !== 'ind') return;
  para();
  estado.ind = e.target.value;
  ajustaAno();
  atualiza();
});
document.getElementById('ano').addEventListener('input', e => {
  para();
  estado.ano = anosDe(estado.ind)[Number(e.target.value)];
  atualiza();
});
document.getElementById('voltar').addEventListener('click', () => { para(); estado.uf = null; estado.mun = null; MUN = {}; ajustaAno(); atualiza(); });

const tocar = document.getElementById('tocar');
let relogio = null;
function para() {
  clearInterval(relogio); relogio = null;
  tocar.setAttribute('aria-pressed', 'false'); tocar.textContent = '▶ Linha do tempo';
}
tocar.addEventListener('click', () => {
  if (relogio) { para(); return; }
  const anos = anosDe(estado.ind);
  if (estado.ano === anos.at(-1)) { estado.ano = anos[0]; atualiza({ animar: true }); }
  tocar.setAttribute('aria-pressed', 'true'); tocar.textContent = '❚❚ Parar';
  relogio = setInterval(() => {
    const i = anos.indexOf(estado.ano);
    if (i >= anos.length - 1) { para(); return; }
    estado.ano = anos[i + 1];
    atualiza({ animar: true });
    if (i + 1 === anos.length - 1) para();
  }, ehMandato(estado.ind) ? 1800 : 900);
});

// ---------------------------------------------------------------- mapa

let mapa = null;   // { id, forma, chave }

async function constroiMapa(largura, id) {
  const naUF = Boolean(estado.uf);
  const geo = naUF ? await carregaDados(`geo/municipios/${estado.uf}.json`) : geoEstados;
  const chave = f => (naUF ? f.properties.mun : f.properties.uf);
  const projecao = d3.geoMercator().fitWidth(largura, geo);
  let altura = Math.ceil(d3.geoPath(projecao).bounds(geo)[1][1]);
  if (altura > 640) { altura = 640; projecao.fitSize([largura, altura], geo); }
  const caminho = d3.geoPath(projecao);
  const svg = d3.create('svg').attr('viewBox', [0, 0, largura, altura]).attr('class', 'mapa-svg')
    .attr('role', 'group').attr('aria-label', naUF ? `Municípios de ${nomeUF(estado.uf)}` : 'Estados do Brasil');
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
  svg.append('g').attr('class', 'contornos').attr('aria-hidden', 'true')
    .selectAll('path').data(geo.features.filter(f => (naUF ? f.properties.mun === estado.mun : ufsProjeto.has(f.properties.uf))))
    .join('path').attr('d', caminho).attr('class', naUF ? 'municipio selecionado' : 'estado projeto');
  const foco = svg.append('path').attr('class', 'contorno-foco').attr('aria-hidden', 'true');
  clicavel.on('focus', (e, f) => { if (e.target.matches(':focus-visible')) foco.attr('d', caminho(f)); })
    .on('blur', () => foco.attr('d', null));
  svgCaixa.replaceChildren(svg.node());
  mapa = { id, forma, chave };
}

function pintaMapa(animar) {
  const naUF = Boolean(estado.uf);
  const escala = montaEscala(estado.ind);
  const { forma, chave } = mapa;
  const valores = {};
  for (const t of territorios()) valores[t] = valor(t, estado.ind, estado.ano);
  const preenche = f => (valores[chave(f)] == null ? 'url(#sem-dado)' : escala.cor(valores[chave(f)]));
  if (animar && !reduz()) forma.transition().duration(600).ease(d3.easeCubicOut).attr('fill', preenche);
  else forma.interrupt().attr('fill', preenche);
  forma.select('title').text(f => {
    const k = chave(f), v = valores[k];
    const nome = naUF ? nomeMun(k) : NOME_UF[f.properties.uf];
    return `${nome}: ${v == null ? 'sem dado' : textoValor(estado.ind, v)}${!naUF && !ufsProjeto.has(f.properties.uf) ? ' · fora dos seis estados do projeto' : ''}`;
  });
  document.getElementById('legenda').innerHTML = `
    <span class="legenda-titulo">${IND[estado.ind].rotulo[0].toUpperCase() + IND[estado.ind].rotulo.slice(1)}${ehMandato(estado.ind) ? `, eleição de ${estado.ano}` : `, ${estado.ano}`}</span>
    <span class="legenda-faixas">${escala.itens.map(([c, r]) => `<span><i style="background:${c}"></i>${r}</span>`).join('')}
      <span><i class="sem-dado"></i>sem dado</span></span>`;
  document.getElementById('dica').textContent = naUF
    ? 'Clique num município para ver os números dele; clique de novo para voltar ao estado.'
    : 'Os seis estados do projeto têm contorno escuro e podem ser clicados; os outros não fazem parte da base.';
}

const textoValor = (ind, v) => (IND[ind].tipo === 'categorias' ? SETORES[v] : IND[ind].texto(v));

async function desenhaMapa(animar = false) {
  const largura = svgCaixa.clientWidth || 640;
  const id = `${estado.uf ?? 'BR'}|${estado.mun ?? ''}|${largura}`;
  if (mapa?.id !== id) await constroiMapa(largura, id);
  pintaMapa(animar);
  document.getElementById('titulo-territorio').textContent = estado.mun ? `${nomeMun(estado.mun)} (${estado.uf})` : estado.uf ? nomeUF(estado.uf) : 'Brasil';
  document.getElementById('voltar').hidden = !estado.uf;
}

function seleciona(f) {
  para();
  if (!estado.uf) { estado.uf = f.properties.uf; estado.mun = null; }
  else estado.mun = f.properties.mun === estado.mun ? null : f.properties.mun;
  atualiza();
}

// ---------------------------------------------------------------- santinho

const VERSO_MANDATO = `<p>O PIB e o valor adicionado por setor vêm do IBGE (PIB dos Municípios), a taxa de homicídios do Atlas da Violência
  (Ipea). Nos estados, o PIB e a população dos municípios são somados e a taxa de homicídios é a média dos municípios
  ponderada pela população.</p>
  <p>A variação do mandato compara o ano da eleição com o último ano medido dentro dos quatro anos seguintes. O PIB per
  capita é a preços correntes, sem descontar a inflação. Mostra o que mudou durante o mandato, não que o eleito causou a mudança.</p>`;
const nomeDoLugar = () => (estado.mun ? `${nomeMun(estado.mun)} (${estado.uf})` : estado.uf ? nomeUF(estado.uf) : 'Brasil');
const pctsSetores = l => (estado.mun ? [l[M.agro], l[M.ind], l[M.serv], l[M.adm]] : [l[A.agro], l[A.ind], l[A.serv], l[A.adm]]);
const mandatoDoLugar = ano => (estado.mun ? mandatoMun(estado.mun, ano) : mandatoUF(estado.uf, ano));

function desenhaSantinho() {
  const caixa = document.getElementById('pilha');
  const terr = territorio();
  if (!terr) {
    caixa.innerHTML = santinho({ faixa: `${IND[estado.ind].rotulo} · ${estado.ano}`, nome: 'Brasil', numero: '—',
      rotulo: 'Clique num dos seis estados do mapa para ver os números dele.', classe: 'santinho-neutro' });
    return;
  }
  const ind = estado.ind, ano = estado.ano;
  if (ehMandato(ind) && !estado.mun) {
    // o mapa mostra os prefeitos eleitos no ano; o estado, então, é o resumo dos municípios
    const com = Object.keys(MUN).map(c => [c, valor(c, ind, ano)]).filter(([, x]) => x != null);
    const total = Object.keys(MUN).length;
    const faixaResumo = `${IND[ind].rotulo} · eleição de ${ano}`;
    if (!com.length) {
      caixa.innerHTML = santinho({ faixa: faixaResumo, nome: nomeDoLugar(), numero: '—', classe: 'santinho-neutro',
        rotulo: 'Nenhum município tem desfecho medido para este mandato.' });
      return;
    }
    const alta = d3.greatest(com, ([, x]) => x), queda = d3.least(com, ([, x]) => x);
    caixa.innerHTML = santinho({
      faixa: faixaResumo, nome: nomeDoLugar(), numero: textoValor(ind, d3.median(com, ([, x]) => x)),
      rotulo: `é a mediana entre os ${formata.numero(com.length)} municípios com dado, de ${formata.numero(total)}. Clique num município para ver o prefeito eleito.`,
      linhas: [['Maior alta', `${nomeMun(alta[0])}: ${textoValor(ind, alta[1])}`], ['Maior queda', `${nomeMun(queda[0])}: ${textoValor(ind, queda[1])}`]],
      verso: VERSO_MANDATO, fonte: 'p11_retrospecto (visões vw_retrospecto_*)',
    });
    return;
  }
  const v = valor(terr, ind, ano);
  const l = ehMandato(ind) ? null : (estado.mun ? linhaMun(terr, ano) : linhaUF(terr, ano));
  const m = ehMandato(ind) ? mandatoDoLugar(ano) : null;
  const faixa = `${IND[ind].rotulo} · ${ehMandato(ind) ? `eleição de ${ano}` : ano}`;
  if (v == null) {
    caixa.innerHTML = santinho({ faixa, nome: nomeDoLugar(), numero: '—', classe: 'santinho-neutro',
      rotulo: ehMandato(ind) ? 'Mandato sem desfecho medido para este indicador.' : 'Sem dado para este lugar e ano.' });
    return;
  }
  let numero, rotulo, linhas = [];
  if (ind === 'setor') {
    const pct = pctsSetores(l)[v];
    numero = `${numeroBr(pct)}%`; rotulo = `${SETORES[v]} é o setor que mais pesa no valor adicionado.`;
    linhas = pctsSetores(l).map((p, i) => [SETORES[i], p == null ? '—' : `${numeroBr(p)}%`]);
  } else if (ehMandato(ind)) {
    numero = textoValor(ind, v);
    rotulo = ind === 'var_pib' ? `de variação do PIB per capita (preços correntes), do ano da eleição ao último medido do mandato.`
      : 'de variação na taxa de homicídios (média de 3 anos), do ano da eleição ao último ano medido do mandato.';
    linhas = [[estado.mun ? 'Prefeito eleito' : 'Governador eleito', nomeCurto(m[D.nome])],
      ['Partido', m[D.partido]],
      ind === 'var_pib' ? ['PIB per capita', `${real(m[D.pibIni])} → ${real(m[D.pibFim])} (${m[D.anoPib]})`]
        : ['Homicídios', `${numeroBr(m[D.homIni])} → ${numeroBr(m[D.homFim])} (${m[D.anoHom]})`]];
  } else {
    numero = textoValor(ind, v).replace(' por 100 mil', '');
    rotulo = ind === 'pib' ? 'de PIB por habitante, a preços correntes.' : 'homicídios por 100 mil habitantes.';
    const base = estado.mun ? [l[M.pibPc], l[M.hom3]] : [l[A.pibPc], l[A.hom]];
    linhas = [ind === 'pib' ? ['Homicídios', base[1] == null ? '—' : `${numeroBr(base[1])} por 100 mil`] : ['PIB per capita', base[0] == null ? '—' : real(base[0])]];
    const s = indiceDoMaior(pctsSetores(l));
    if (s != null) linhas.push(['Setor que mais pesa', SETORES[s]]);
  }
  caixa.innerHTML = santinho({
    faixa, nome: nomeDoLugar(), numero, rotulo, linhas,
    verso: VERSO_MANDATO,
    fonte: 'p11_retrospecto (visões vw_retrospecto_*)',
  });
}

// ---------------------------------------------------------------- painel

const LIGA = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);
const nomeCurto = n => {
  const partes = n.split(' ').slice(0, 3);
  while (partes.length > 1 && LIGA.has(partes.at(-1).toUpperCase())) partes.pop();   // "José Alexandre De" → "José Alexandre"
  return partes.join(' ').toLowerCase().replace(/(^| )(.)/g, (_, a, b) => a + b.toUpperCase());
};

function linhasDaSerie() {
  if (estado.mun) {
    return (MUN[estado.mun]?.anos ?? []).map(l => ({ ano: l[M.ano], pib: l[M.pibPc], hom: l[M.hom3],
      pcts: [l[M.agro], l[M.ind], l[M.serv], l[M.adm]] }));
  }
  return (uf.ufs[estado.uf]?.anos ?? []).map(l => ({ ano: l[A.ano], pib: l[A.pibPc], hom: l[A.hom],
    pcts: [l[A.agro], l[A.ind], l[A.serv], l[A.adm]] }));
}

/** Faixas dos mandatos no fundo dos gráficos, com a sigla do partido de quem foi eleito. */
function faixasMandatos(mandatos, ultimoAno) {
  const dados = mandatos.filter(m => mandatoDe(m[D.eleicao]).de <= ultimoAno)
    .map((m, i) => ({ x1: mandatoDe(m[D.eleicao]).de - 0.5, x2: Math.min(mandatoDe(m[D.eleicao]).ate + 0.5, ultimoAno + 0.5),
      sigla: m[D.partido], par: i % 2 }));
  return [
    Plot.rectX(dados, { x1: 'x1', x2: 'x2', fill: d => (d.par ? 'rgb(34 32 28 / 0.06)' : 'rgb(34 32 28 / 0.15)') }),
    Plot.text(dados, { x: d => (d.x1 + d.x2) / 2, text: 'sigla', frameAnchor: 'top', dy: 6, fontWeight: 700, fill: COR.tecla }),
  ];
}

function graficoLinha(dados, campo, cor, rotulo, mandatos, largura, formato, margem = 56) {
  const validos = dados.filter(d => d[campo] != null);
  if (validos.length < 2) return `<p class="aviso-vazio">Sem série de ${rotulo} para este lugar.</p>`;
  const g = Plot.plot({
    width: largura, height: 200, marginLeft: margem, marginRight: 14, style: ESTILO,
    x: { tickFormat: d => String(d), label: null, domain: [2009.5, 2024.5] },
    y: { label: null, grid: true, tickFormat: formato, zero: true },
    marks: [
      ...faixasMandatos(mandatos, 2024),
      Plot.lineY(validos, { x: 'ano', y: campo, stroke: cor, strokeWidth: 2.5 }),
      Plot.dot(validos, { x: 'ano', y: campo, fill: cor, r: 3, title: d => `${d.ano}: ${formato(d[campo])}` }),
      Plot.text([validos.at(-1)], { x: 'ano', y: campo, text: d => formato(d[campo]), dx: 0, dy: -10, fontWeight: 700, fill: cor }),
    ],
  });
  return g;
}

function graficoSetores(dados, largura) {
  const longo = dados.flatMap(d => (d.pcts.every(p => p == null) ? [] : d.pcts.map((p, i) => ({ ano: d.ano, setor: SETORES[i], pct: p ?? 0 }))));
  if (!longo.length) return `<p class="aviso-vazio">Sem peso por setor para este lugar.</p>`;
  return Plot.plot({
    width: largura, height: 200, marginLeft: 40, marginRight: 14, style: ESTILO,
    x: { tickFormat: d => String(d), label: null },
    y: { label: null, tickFormat: d => `${d}%`, domain: [0, 100] },
    color: { domain: SETORES, range: COR_SETOR, legend: true },
    marks: [Plot.areaY(longo, { x: 'ano', y: 'pct', fill: 'setor', order: SETORES.map((_, i) => i), curve: 'monotone-x', title: d => `${d.ano} · ${d.setor}: ${numeroBr(d.pct)}%` })],
  });
}

function tabelaMandatos(linhas, comLugar = false) {
  if (!linhas.length) return '<p class="aviso-vazio">Sem mandatos para mostrar.</p>';
  const celula = (m) => {
    const pib = m[D.varPib] == null ? '<span class="sem-info">sem dado</span>'
      : `<strong>${numeroBr(m[D.varPib], 1, true)}%</strong><span class="situacao">${real(m[D.pibIni])} → ${real(m[D.pibFim])} (${m[D.anoPib]})</span>`;
    const hom = m[D.varHom] == null ? '<span class="sem-info">sem dado</span>'
      : `<strong class="${m[D.varHom] > 0 ? 'sobe' : 'cai'}">${numeroBr(m[D.varHom], 1, true)}</strong><span class="situacao">${numeroBr(m[D.homIni])} → ${numeroBr(m[D.homFim])} (${m[D.anoHom]})</span>`;
    return [pib, hom];
  };
  return `<div class="rolagem"><table class="tabela">
    <thead><tr>${comLugar ? '<th>Estado</th>' : ''}<th>Mandato</th><th>Eleito</th><th>Partido</th>
      <th class="num">PIB per capita<span class="situacao">variação nominal</span></th>
      <th class="num">Homicídios<span class="situacao">variação por 100 mil</span></th></tr></thead>
    <tbody>${linhas.map(l => {
      const m = comLugar ? l.m : l, [pib, hom] = celula(m);
      return `<tr>${comLugar ? `<td>${l.uf}</td>` : ''}<td>${mandatoDe(m[D.eleicao]).de}–${mandatoDe(m[D.eleicao]).ate}</td><td>${nomeCurto(m[D.nome])}</td><td>${m[D.partido]}</td>
        <td class="num">${pib}</td><td class="num">${hom}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

let pedido = 0;
function desenhaPainel() {
  const terr = territorio();
  if (!terr) {
    const todos = UFS_PROJETO.flatMap(u => (uf.ufs[u]?.governadores ?? []).map(m => ({ uf: u, m }))).sort((a, b) => a.uf.localeCompare(b.uf) || a.m[D.eleicao] - b.m[D.eleicao]);
    painel.innerHTML = `<h3>Os governadores dos seis estados e o que mudou no mandato</h3>
      ${tabelaMandatos(todos, true)}
      <p class="apoio">A variação do PIB per capita é a preços correntes, sem descontar a inflação. O mandato de 2022 vai até 2026 e ainda não tem o PIB medido
        (o IBGE publica o PIB com cerca de dois anos de atraso); a taxa de homicídios vai até 2024.</p>`;
    return;
  }
  const meu = ++pedido;
  const nome = nomeDoLugar(), nm = estado.mun ? nomeMun(estado.mun) : nomeUF(estado.uf);
  const mandatos = (estado.mun ? MUN[estado.mun]?.prefeitos : uf.ufs[estado.uf]?.governadores) ?? [];
  const dados = linhasDaSerie();
  const largura = Math.min(760, painel.clientWidth || 560);
  const quem = estado.mun ? 'prefeitos' : 'governadores';
  const caixa = document.createElement('div');
  caixa.innerHTML = `
    <h3>O que mudou ${em(nm)}</h3>
    <p>As faixas cinzas dos gráficos são os mandatos de ${quem} eleitos, com o partido de cada um. Veja se a linha sobe ou desce dentro da faixa, e lembre
      que várias coisas, de fora do poder do eleito, empurram esses números.</p>
    <h4>PIB per capita, a preços correntes</h4><div class="grafico" id="g-pib"></div>
    <h4>Homicídios por 100 mil habitantes${estado.mun ? ' (média de 3 anos)' : ''}</h4><div class="grafico" id="g-hom"></div>
    <h4>Peso de cada setor no valor adicionado</h4><div class="grafico" id="g-setor"></div>
    <h4>${estado.mun ? 'Prefeitos eleitos' : 'Governadores eleitos'} e o que mudou no mandato</h4>
    ${tabelaMandatos(mandatos)}
    <p class="apoio">Mandatos em andamento, ou sem o dado publicado ainda, aparecem como "sem dado". O PIB per capita é a preços correntes, e a taxa de homicídios
      dos municípios pequenos oscila muito de um ano para outro: leia a tendência, não um ano isolado.</p>`;
  if (meu !== pedido) return;
  caixa.querySelector('#g-pib').append(graficoLinha(dados, 'pib', COR.vitoria, 'PIB per capita', mandatos, largura, v => formata.real(v), 84));
  caixa.querySelector('#g-hom').append(graficoLinha(dados, 'hom', '#e2692a', 'homicídios', mandatos, largura, v => numeroBr(v)));
  caixa.querySelector('#g-setor').append(graficoSetores(dados, largura));
  painel.replaceChildren(caixa);
}

// ---------------------------------------------------------------- retrato para o oráculo

// os lugares do nível aberto (os seis estados, ou os municípios do estado) no indicador e ano escolhidos
function secaoDosLugares(nome) {
  const ind = estado.ind, ano = estado.ano, rot = IND[ind].rotulo;
  const lugares = estado.uf ? Object.keys(MUN) : UFS_PROJETO;
  const nomeDe = estado.uf ? nomeMun : nomeUF;
  const quem = ehMandato(ind) ? (estado.uf ? `prefeitos eleitos em ${ano}` : `governadores eleitos em ${ano}`) : String(ano);
  const pares = lugares.map(t => [t, valor(t, ind, ano)]);
  if (IND[ind].tipo === 'categorias') {
    const conta = SETORES.map((_, i) => pares.filter(([, v]) => v === i).length);
    const linhas = SETORES.map((s, i) => [s, `${conta[i]} ${estado.uf ? (conta[i] === 1 ? 'município' : 'municípios') : (conta[i] === 1 ? 'estado' : 'estados')}`]);
    if (!estado.uf) pares.forEach(([t, v]) => linhas.push([nomeUF(t), v == null ? 'sem dado' : SETORES[v]]));
    return { titulo: `${estado.uf ? `Municípios ${em(nome)}` : 'Os seis estados'}: setor que mais pesa em ${ano}`, linhas };
  }
  if (!estado.uf) {
    const quando = ehMandato(ind) ? `no mandato do governador eleito em ${ano}` : `em ${ano}`;
    return { titulo: `Os seis estados: ${rot} ${quando} (o que o mapa pinta agora)`, linhas: pares.map(([t, v]) => {
      const m = ehMandato(ind) ? mandatoUF(t, ano) : null;
      return [nomeUF(t), `${v == null ? 'sem dado' : `${textoValor(ind, v)} ${quando}`}${m ? ` (${nomeCurto(m[D.nome])}, ${m[D.partido]})` : ''}`];
    }) };
  }
  const r = extremos(pares, 5);
  const item = ([t, v]) => {
    const m = ehMandato(ind) ? mandatoMun(t, ano) : null;
    return `${nomeDe(t)}: ${textoValor(ind, v)}${m ? ` (prefeito ${nomeCurto(m[D.nome])}, ${m[D.partido]})` : ''}`;
  };
  return { titulo: `Municípios ${em(nome)}: ${rot}, ${quem}`, linhas: [
    ['Municípios com dado', `${formata.numero(r.comDado)} de ${formata.numero(r.total)}`],
    ['Mediana dos municípios', r.mediana == null ? 'sem dado' : textoValor(ind, r.mediana)],
    ['Maiores valores', r.maiores.map(item).join('; ') || 'nenhum'],
    ['Menores valores', r.menores.map(item).join('; ') || 'nenhum']] };
}

const textoMandato = m => {
  const pib = m[D.varPib] == null ? 'sem dado'
    : `${numeroBr(m[D.varPib], 1, true)}% (${real(m[D.pibIni])} em ${m[D.eleicao]} para ${real(m[D.pibFim])} em ${m[D.anoPib]}, a preços correntes)`;
  const hom = m[D.varHom] == null ? 'sem dado'
    : `${numeroBr(m[D.varHom], 1, true)} por 100 mil (${numeroBr(m[D.homIni])} em ${m[D.eleicao]} para ${numeroBr(m[D.homFim])} em ${m[D.anoHom]})`;
  return `${nomeCurto(m[D.nome])} (${m[D.partido]}); PIB per capita: ${pib}; homicídios: ${hom}`;
};

registraRetrato(() => {
  const terr = territorio(), nome = nomeDoLugar();
  const ind = estado.ind, ano = estado.ano;
  const rotulo = `${IND[ind].rotulo}, ${ehMandato(ind) ? `eleição de ${ano}` : ano}`;
  const secoes = [];
  if (estado.mun || !estado.uf || !ehMandato(ind)) {
    if (terr) {
      const v = valor(terr, ind, ano);
      secoes.push({ titulo: `${nome}: ${rotulo}`, linhas: [[IND[ind].rotulo, v == null ? 'sem dado' : textoValor(ind, v)]] });
    }
  }
  if (!estado.mun) secoes.push(secaoDosLugares(nome));
  if (terr) {
    const mandatos = (estado.mun ? MUN[estado.mun]?.prefeitos : uf.ufs[estado.uf]?.governadores) ?? [];
    secoes.push({ titulo: `${estado.mun ? 'Prefeitos' : 'Governadores'} ${em(nome)} e o que mudou no mandato (do ano da eleição ao último ano medido do mandato)`,
      linhas: mandatos.map(m => [rotuloMandato(m[D.eleicao]), textoMandato(m)]) });
    secoes.push({ titulo: `Série anual ${em(nome)}`, linhas: linhasDaSerie().map(l => [String(l.ano),
      `PIB per capita ${l.pib == null ? 'sem dado' : real(l.pib)}; homicídios ${l.hom == null ? 'sem dado' : `${numeroBr(l.hom)} por 100 mil`}; setor que mais pesa ${indiceDoMaior(l.pcts) == null ? 'sem dado' : SETORES[indiceDoMaior(l.pcts)]}`]) });
  } else {
    secoes.push({ titulo: 'Governadores dos seis estados e o que mudou no mandato', linhas: UFS_PROJETO.flatMap(u =>
      (uf.ufs[u]?.governadores ?? []).map(m => [`${nomeUF(u)}, ${rotuloMandato(m[D.eleicao])}`, textoMandato(m)])) });
  }
  secoes.push({ titulo: 'Cuidados na leitura', linhas: [
    ['Mapa', estado.uf && !estado.mun ? 'o mapa do estado mostra os municípios; nos indicadores do mandato, os prefeitos eleitos no ano escolhido'
      : 'o mapa do Brasil mostra os seis estados; nos indicadores do mandato, os governadores eleitos no ano escolhido'],
    ['PIB per capita', 'a preços correntes, sem descontar a inflação: parte da alta é só preço'],
    ['Setores', 'o IBGE publica o valor adicionado por setor só até 2021; o PIB per capita, até 2022'],
    ['Homicídios', 'registros do Ministério da Saúde no Atlas da Violência; nos municípios, média de 3 anos, e os pequenos oscilam muito'],
    ['Causa', 'mostra o que mudou durante o mandato, não que o eleito causou a mudança']] });
  return { numero: 11, pergunta: 'O que mudou no mandato?', recorte: `${nome} · ${rotulo}`, secoes };
});

// ---------------------------------------------------------------- tudo junto

let ultima = 0;
async function atualiza({ animar = false } = {}) {
  const meu = ++ultima;
  if (estado.uf) MUN = (await carregaMunicipios(estado.uf)).municipios;
  else MUN = {};
  if (meu !== ultima) return;
  ajustaAno();
  escreveEndereco();
  montaControles();
  await desenhaMapa(animar);
  if (meu !== ultima) return;
  desenhaSantinho();
  desenhaPainel();
}

addEventListener('hashchange', () => { leEndereco(); atualiza(); });
let larguraAntes = svgCaixa.clientWidth;
new ResizeObserver(() => {
  if (Math.abs(svgCaixa.clientWidth - larguraAntes) > 40) { larguraAntes = svgCaixa.clientWidth; atualiza(); }
}).observe(svgCaixa);

leEndereco();
if (estado.uf) MUN = (await carregaMunicipios(estado.uf)).municipios;
await atualiza();
