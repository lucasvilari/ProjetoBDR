// Pergunta 11: o que mudou no mandato? O mapa dos seis estados (e, ao clicar, dos municípios) pintado por um indicador
// de um ano: setor que mais pesa, PIB per capita, homicídios, ou a variação de PIB e homicídios durante o mandato de
// quem foi eleito (governador no mapa do Brasil, prefeito no mapa do estado).
//
// Dados: retrospecto/uf.json (série anual por UF e governadores), retrospecto/municipios/<UF>.json (série anual e prefeitos
// de cada município) e geo/ (contornos do IBGE). O recorte (indicador, ano, UF, município) fica no endereço da página.
// O PIB per capita é a preços correntes: a variação não desconta a inflação. É retrato, não prova de causa.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/+esm';
import { montaPagina, carregaDados, formata, santinho, fotoCandidato, NOME_UF, em, registraRetrato } from './comum.js?v=20261162';
import { registraRecortes } from './oraculo.js?v=20261162';
import { COR } from './lib/cores.js?v=20261162';
import { UFS_PROJETO, grupoOpcoes, trocaMantendoTeclas } from './pecas.js?v=20261162';
import { SETORES, indiceDoMaior, limitesPorQuantis, limitesDivergentes, faixaDe, numeroBr, mandatoDe, rotuloMandato, extremos } from './lib/retrospecto.js?v=20261162';

montaPagina();

const [uf, geoEstados] = await Promise.all([carregaDados('retrospecto/uf.json'), carregaDados('geo/estados.json')]);
const ufsProjeto = new Set(UFS_PROJETO);
const reduz = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ESTILO = { fontFamily: 'Archivo, sans-serif', fontSize: '12px', background: 'transparent' };

// posições dos campos nas linhas dos JSON (campos_ano e campos_mandato de retrospecto/)
const A = { ano: 0, pib: 1, pop: 2, pibPc: 3, hom: 4, agro: 5, ind: 6, serv: 7, adm: 8,
             empMil: 9, desoc: 10, inf: 11, agua: 12, esgoto: 13 };
const M = { ano: 0, pibPc: 1, hom3: 2, agro: 3, ind: 4, serv: 5, adm: 6, setor: 7, empMil: 8, agua: 9, esgoto: 10 };
const D = { eleicao: 0, nome: 1, partido: 2, pibIni: 3, anoPib: 4, pibFim: 5, varPib: 6,
            homIni: 7, anoHom: 8, homFim: 9, varHom: 10,
            empIni: 11, anoEmp: 12, empFim: 13, varEmp: 14,
            desocIni: 15, anoDesoc: 16, desocFim: 17, varDesoc: 18,
            infIni: 19, anoInf: 20, infFim: 21, varInf: 22 };
const form = document.getElementById('controles');
const svgCaixa = document.getElementById('mapa');
const painel = document.getElementById('painel');
const virgula = v => (v == null ? '—' : String(v).replace('.', ','));

// ---------------------------------------------------------------- indicadores

const COR_SETOR = ['#4e9a3a', '#3b6ea8', '#d9a21b', '#8c5a9e'];
const VERDES = ['#ddd0b4', '#bcd5a2', '#8dbb7a', '#5a9c57', '#2f7d3d', '#0b5a2e'];
const AZUIS = ['#ddd0b4', '#b3cde3', '#6baed6', '#3182bd', '#1a6dad', '#08519c'];
const LARANJAS = ['#ddd0b4', '#f2c49b', '#ee9a5e', '#e2692a', '#b8431a', '#7a2208'];
// a variação dos homicídios diverge: queda em verde (bom), alta em laranja (ruim)
const DIVERGE = ['#0b5a2e', '#5a9c57', '#bcd5a2', '#f2c49b', '#e2692a', '#7a2208'];

const real = v => formata.real(v);

const DEFINICAO_SETOR = {
  'Agropecuária': 'Agricultura, pecuária, produção florestal, pesca e aquicultura. Inclui tudo o que vem da terra e do mar: plantações, criações, extração vegetal.',
  'Indústria': 'Indústrias extrativas (mineração), de transformação (fábricas), construção civil e distribuição de eletricidade, gás, água e esgoto.',
  'Serviços': 'Comércio, transporte, alimentação, informação, finanças, seguros, imóveis, serviços profissionais, educação e saúde privadas, artes e outros serviços.',
  'Administração pública': 'Administração pública, defesa, seguridade social, educação e saúde públicas. É o peso do Estado (federal, estadual e municipal) na economia do lugar.',
};
const DEFINICAO_SEM_DADO = 'O dado não está disponível para este lugar e ano. Os setores vão até 2021, o PIB per capita até 2022, os homicídios até 2024 e os empregos formais até 2024. A desocupação e a informalidade vêm da PNAD e só existem por estado (não por município); não há dado estadual em 2020-2021 por causa da pandemia. O saneamento (água e esgoto) vem do Censo e só tem dado em 2010 e 2022. No mapa de variação do mandato, a eleição de 2024 ainda não tem desfecho medido.';
const DEFINICAO_SEM_REGISTRO = 'O Atlas da Violência (Ipea) não publica município sem nenhum homicídio no ano. Esses municípios entram com taxa zero, que é a melhor estimativa (as taxas dos estados, somadas assim, batem com as do Atlas).';

function criaInfoBtn(texto, container) {
  const btn = document.createElement('button');
  btn.className = 'info-btn'; btn.type = 'button'; btn.textContent = '?';
  btn.setAttribute('aria-label', 'O que é isso?');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const antigo = container.querySelector('.balao.aberto');
    if (antigo) { antigo.classList.remove('aberto'); if (antigo.dataset.dono === btn.dataset.id) return; }
    let balao = container.querySelector(`.balao[data-dono="${btn.dataset.id = btn.dataset.id || Math.random().toString(36).slice(2)}"]`);
    if (!balao) {
      balao = document.createElement('div'); balao.className = 'balao'; balao.dataset.dono = btn.dataset.id;
      const fechar = document.createElement('button'); fechar.className = 'balao-fechar'; fechar.type = 'button';
      fechar.textContent = '×'; fechar.setAttribute('aria-label', 'Fechar');
      fechar.addEventListener('click', ev => { ev.stopPropagation(); balao.classList.remove('aberto'); });
      balao.append(fechar, document.createTextNode(texto));
      container.append(balao);
    }
    balao.classList.add('aberto');
  });
  return btn;
}

const IND = {
  setor: { rotulo: 'setor que mais pesa', anos: d3.range(2010, 2022), tipo: 'categorias',
    explica: 'O setor da economia que mais pesa no valor adicionado do lugar: agropecuária, indústria, serviços ou administração pública (IBGE, até 2021).' },
  pib: { rotulo: 'PIB per capita', anos: d3.range(2011, 2023), paleta: VERDES, texto: real,
    explica: 'PIB por habitante a preços constantes de 2022, corrigido pelo IPCA (IBGE, até 2022). Valores de anos anteriores foram atualizados pela inflação acumulada.' },
  homicidios: { rotulo: 'homicídios', anos: d3.range(2010, 2025), paleta: LARANJAS, texto: v => `${numeroBr(v)} por 100 mil`,
    explica: 'Homicídios por 100 mil habitantes (Atlas da Violência, registros do Ministério da Saúde, até 2024). Nos municípios, média dos últimos 3 anos. O Atlas não publica município sem homicídio no ano, e ele entra como taxa zero.' },
  var_pib: { rotulo: 'variação do PIB per capita no mandato', mandato: true, paleta: VERDES, texto: v => `${numeroBr(v, 1, true)}%`,
    explica: 'Quanto o PIB per capita real (corrigido pelo IPCA) mudou entre o ano da eleição e o último ano medido do mandato de quem foi eleito (governador no mapa do Brasil, prefeito no mapa do estado). Já desconta a inflação.' },
  var_hom: { rotulo: 'variação dos homicídios no mandato', mandato: true, paleta: DIVERGE, divergente: true, texto: v => `${numeroBr(v, 1, true)} por 100 mil`,
    explica: 'Quanto a taxa de homicídios (média de 3 anos) mudou entre o ano da eleição e o último ano medido do mandato. Verde: caiu; laranja: subiu. Os mandatos sem desfecho medido (eleição de 2024, e governador de 2022 no PIB) ficam hachurados.' },
  emprego: { rotulo: 'empregos formais / mil hab', anos: d3.range(2011, 2025), paleta: VERDES, texto: v => `${numeroBr(v, 1)} / mil`,
    explica: 'Empregos formais por mil habitantes (CEMPRE/IBGE, Cadastro Central de Empresas, até 2024). Conta o pessoal ocupado total em empresas e organizações formalmente registradas; não inclui trabalhadores informais.' },
  desocupacao: { rotulo: 'taxa de desocupação', anos: d3.range(2012, 2026), paleta: LARANJAS, somenteUF: true, texto: v => `${numeroBr(v, 1)}%`,
    explica: 'Porcentagem da força de trabalho que procura emprego e não encontra (PNAD Contínua/IBGE, 4º trimestre, até 2025). Só existe por estado, não por município. Não há dado estadual em 2020 e 2021 por causa das restrições da pandemia.' },
  informalidade: { rotulo: 'taxa de informalidade', anos: d3.range(2015, 2026), paleta: LARANJAS, somenteUF: true, texto: v => `${numeroBr(v, 1)}%`,
    explica: 'Porcentagem dos ocupados em trabalho informal (PNAD Contínua/IBGE, 4º trimestre, a partir de 2015). Inclui empregados sem carteira, conta-própria sem CNPJ e trabalhadores familiares. Só existe por estado. Sem dado em 2020-2021.' },
  var_emp: { rotulo: 'variação dos empregos no mandato', mandato: true, paleta: VERDES, texto: v => `${numeroBr(v, 1, true)} / mil`,
    explica: 'Quanto os empregos formais por mil habitantes mudaram entre o ano da eleição e o último ano medido do mandato. Mais verde: mais empregos formais criados.' },
  var_desoc: { rotulo: 'variação da desocupação no mandato', mandato: true, paleta: DIVERGE, divergente: true, somenteUF: true, texto: v => `${numeroBr(v, 1, true)} pp`,
    explica: 'Quanto a taxa de desocupação (em pontos percentuais) mudou entre o ano da eleição e o último medido do mandato. Verde: caiu (bom); laranja: subiu.' },
  var_inf: { rotulo: 'variação da informalidade no mandato', mandato: true, paleta: DIVERGE, divergente: true, somenteUF: true, texto: v => `${numeroBr(v, 1, true)} pp`,
    explica: 'Quanto a taxa de informalidade (em pontos percentuais) mudou entre o ano da eleição e o último medido do mandato. Verde: caiu; laranja: subiu.' },
  agua: { rotulo: '% domicílios com água da rede', anos: [2010, 2022], paleta: AZUIS, texto: v => `${numeroBr(v, 1)}%`,
    explica: 'Porcentagem de domicílios com abastecimento de água da rede geral (Censo/IBGE, 2010 e 2022). Nos anos entre os censos, o valor é o do censo mais próximo.' },
  esgoto: { rotulo: '% domicílios com esgoto adequado', anos: [2010, 2022], paleta: AZUIS, texto: v => `${numeroBr(v, 1)}%`,
    explica: 'Porcentagem de domicílios com esgotamento sanitário adequado: rede geral/pluvial ou fossa séptica (Censo/IBGE, 2010 e 2022). Nos anos entre os censos, o valor é o do censo mais próximo.' },
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
  if (estado.uf && IND[estado.ind].somenteUF) estado.ind = PADRAO.ind;
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
const POS_VAR = { var_pib: D.varPib, var_hom: D.varHom, var_emp: D.varEmp, var_desoc: D.varDesoc, var_inf: D.varInf };
function valor(terr, ind, ano) {
  const ehMun = /^\d{5}$/.test(terr);
  if (ehMandato(ind)) {
    const m = ehMun ? mandatoMun(terr, ano) : mandatoUF(terr, ano);
    return m ? m[POS_VAR[ind]] ?? null : null;
  }
  const l = ehMun ? linhaMun(terr, ano) : linhaUF(terr, ano);
  if (!l) return null;
  if (ind === 'pib') return l[ehMun ? M.pibPc : A.pibPc] ?? null;
  if (ind === 'homicidios') return l[ehMun ? M.hom3 : A.hom] ?? null;
  if (ind === 'emprego') return l[ehMun ? M.empMil : A.empMil] ?? null;
  if (ind === 'desocupacao') return ehMun ? null : (l[A.desoc] ?? null);
  if (ind === 'informalidade') return ehMun ? null : (l[A.inf] ?? null);
  if (ind === 'agua') return l[ehMun ? M.agua : A.agua] ?? null;
  if (ind === 'esgoto') return l[ehMun ? M.esgoto : A.esgoto] ?? null;
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
  const opcInd = [
    ['setor', 'setor que mais pesa'], ['pib', 'PIB per capita'], ['homicidios', 'homicídios'],
    ['emprego', 'empregos formais'],
    ...(!estado.uf ? [['desocupacao', 'desocupação'], ['informalidade', 'informalidade']] : []),
    ['agua', 'água da rede'], ['esgoto', 'esgoto adequado'],
    ['var_pib', 'var. PIB no mandato'], ['var_hom', 'var. homicídios no mandato'],
    ['var_emp', 'var. empregos no mandato'],
    ...(!estado.uf ? [['var_desoc', 'var. desocupação no mandato'], ['var_inf', 'var. informalidade no mandato']] : []),
  ];
  trocaMantendoTeclas(document.getElementById('grupo-indicador'), grupoOpcoes('ind', 'Indicador', opcInd, estado.ind));
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
  const legDiv = document.getElementById('legenda');
  legDiv.innerHTML = `
    <span class="legenda-titulo">${IND[estado.ind].rotulo[0].toUpperCase() + IND[estado.ind].rotulo.slice(1)}${ehMandato(estado.ind) ? `, eleição de ${estado.ano}` : `, ${estado.ano}`}</span>
    <span class="legenda-faixas">${escala.itens.map(([c, r]) => `<span><i style="background:${c}"></i>${r}</span>`).join('')}
      <span><i class="sem-dado"></i>sem dado</span></span>`;
  if (IND[estado.ind].tipo === 'categorias') {
    legDiv.querySelectorAll('.legenda-faixas > span').forEach(sp => {
      const txt = sp.textContent.trim();
      if (DEFINICAO_SETOR[txt]) sp.append(criaInfoBtn(DEFINICAO_SETOR[txt], legDiv));
    });
  }
  const semDadoSpan = legDiv.querySelector('.legenda-faixas > span:last-child');
  if (semDadoSpan) semDadoSpan.append(criaInfoBtn(DEFINICAO_SEM_DADO, legDiv));
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
  if (!estado.uf) {
    estado.uf = f.properties.uf; estado.mun = null;
    if (IND[estado.ind].somenteUF) estado.ind = 'setor';
  }
  else estado.mun = f.properties.mun === estado.mun ? null : f.properties.mun;
  atualiza();
}

// ---------------------------------------------------------------- santinho

const VERSO_MANDATO = `<p>O PIB e o valor adicionado por setor vêm do IBGE (PIB dos Municípios), a taxa de homicídios do Atlas da Violência
  (Ipea), os empregos formais do CEMPRE/IBGE (Cadastro Central de Empresas), a desocupação e informalidade da PNAD Contínua/IBGE, o saneamento do Censo/IBGE (2010 e 2022),
  Nos estados, o PIB e a população dos municípios são somados e a taxa de homicídios é a média dos municípios
  ponderada pela população.</p>
  <p>A variação do mandato compara o ano da eleição com o último ano medido dentro dos quatro anos seguintes. O PIB per
  capita é a preços constantes de 2022, corrigido pelo IPCA (inflação já descontada). Mostra o que mudou durante o mandato, não que o eleito causou a mudança.</p>`;
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
    const rotulosVar = { var_pib: 'de variação real do PIB per capita (R$ de 2022), do ano da eleição ao último medido do mandato.',
      var_hom: 'de variação na taxa de homicídios (média de 3 anos), do ano da eleição ao último ano medido do mandato.',
      var_emp: 'de variação nos empregos formais por mil habitantes, do ano da eleição ao último medido do mandato.',
      var_desoc: 'de variação na taxa de desocupação (em pontos percentuais), do ano da eleição ao último medido do mandato.',
      var_inf: 'de variação na taxa de informalidade (em pontos percentuais), do ano da eleição ao último medido do mandato.' };
    rotulo = rotulosVar[ind];
    const detalheVar = { var_pib: ['PIB per capita', `${real(m[D.pibIni])} → ${real(m[D.pibFim])} (${m[D.anoPib]})`],
      var_hom: ['Homicídios', `${numeroBr(m[D.homIni])} → ${numeroBr(m[D.homFim])} (${m[D.anoHom]})`],
      var_emp: ['Empregos / mil', `${numeroBr(m[D.empIni], 1)} → ${numeroBr(m[D.empFim], 1)} (${m[D.anoEmp]})`],
      var_desoc: ['Desocupação', `${numeroBr(m[D.desocIni], 1)}% → ${numeroBr(m[D.desocFim], 1)}% (${m[D.anoDesoc]})`],
      var_inf: ['Informalidade', `${numeroBr(m[D.infIni], 1)}% → ${numeroBr(m[D.infFim], 1)}% (${m[D.anoInf]})`] };
    linhas = [[estado.mun ? 'Prefeito eleito' : 'Governador eleito', nomeCurto(m[D.nome])],
      ['Partido', m[D.partido]], detalheVar[ind]];
  } else {
    numero = textoValor(ind, v).replace(' por 100 mil', '').replace(' / mil', '');
    const rotulosInd = { pib: 'de PIB por habitante, em R$ de 2022.', homicidios: 'homicídios por 100 mil habitantes.',
      emprego: 'empregos formais por mil habitantes.', desocupacao: 'da força de trabalho desocupada.', informalidade: 'dos ocupados em trabalho informal.',
      agua: 'dos domicílios com água da rede geral.', esgoto: 'dos domicílios com esgoto adequado.' };
    rotulo = rotulosInd[ind] || '';
    const base = estado.mun ? [l[M.pibPc], l[M.hom3], l[M.empMil], l[M.agua], l[M.esgoto]] : [l[A.pibPc], l[A.hom], l[A.empMil], l[A.agua], l[A.esgoto]];
    if (ind === 'pib') linhas = [['Homicídios', base[1] == null ? '—' : `${numeroBr(base[1])} por 100 mil`]];
    else if (ind === 'homicidios') linhas = [['PIB per capita', base[0] == null ? '—' : real(base[0])]];
    else if (ind === 'emprego') linhas = [['PIB per capita', base[0] == null ? '—' : real(base[0])], ['Homicídios', base[1] == null ? '—' : `${numeroBr(base[1])} por 100 mil`]];
    else if (ind === 'agua') linhas = [['Esgoto adequado', base[4] == null ? '—' : `${numeroBr(base[4], 1)}%`], ['Empregos formais', base[2] == null ? '—' : `${numeroBr(base[2], 1)} / mil hab`]];
    else if (ind === 'esgoto') linhas = [['Água da rede', base[3] == null ? '—' : `${numeroBr(base[3], 1)}%`], ['Empregos formais', base[2] == null ? '—' : `${numeroBr(base[2], 1)} / mil hab`]];
    else linhas = [['Empregos formais', base[2] == null ? '—' : `${numeroBr(base[2], 1)} / mil hab`]];
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
      pcts: [l[M.agro], l[M.ind], l[M.serv], l[M.adm]], empMil: l[M.empMil], agua: l[M.agua], esgoto: l[M.esgoto] }));
  }
  return (uf.ufs[estado.uf]?.anos ?? []).map(l => ({ ano: l[A.ano], pib: l[A.pibPc], hom: l[A.hom],
    pcts: [l[A.agro], l[A.ind], l[A.serv], l[A.adm]], empMil: l[A.empMil], desoc: l[A.desoc], inf: l[A.inf], agua: l[A.agua], esgoto: l[A.esgoto] }));
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

function graficoSaneamento(dados, mandatos, largura) {
  const aguaVal = dados.filter(d => d.agua != null);
  const esgotoVal = dados.filter(d => d.esgoto != null);
  if (!aguaVal.length && !esgotoVal.length) return document.createTextNode('Sem dados de saneamento para este lugar.');
  const longo = [
    ...aguaVal.map(d => ({ ano: d.ano, valor: d.agua, tipo: 'Água da rede' })),
    ...esgotoVal.map(d => ({ ano: d.ano, valor: d.esgoto, tipo: 'Esgoto adequado' })),
  ];
  return Plot.plot({
    width: largura, height: 200, marginLeft: 40, marginRight: 14, style: ESTILO,
    x: { tickFormat: d => String(d), label: null, domain: [2009.5, 2024.5] },
    y: { label: null, grid: true, tickFormat: v => `${v}%`, domain: [0, 100] },
    color: { domain: ['Água da rede', 'Esgoto adequado'], range: ['#3182bd', '#08519c'], legend: true },
    marks: [
      ...faixasMandatos(mandatos, 2024),
      Plot.line(longo, { x: 'ano', y: 'valor', stroke: 'tipo', strokeWidth: 2.5 }),
      Plot.dot(longo, { x: 'ano', y: 'valor', fill: 'tipo', r: 4, title: d => `${d.ano}: ${d.tipo} ${numeroBr(d.valor, 1)}%` }),
      Plot.text(longo.filter(d => d.ano === 2022), { x: 'ano', y: 'valor', text: d => `${numeroBr(d.valor, 1)}%`, dx: 0, dy: -12, fontWeight: 700, fill: d => d.tipo === 'Água da rede' ? '#3182bd' : '#08519c' }),
    ],
  });
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

let tabelaOrdem = { col: 'eleicao', dir: 'asc' };

function extraiDadosMandato(m, comLugar, uf) {
  return {
    uf: comLugar ? uf : null,
    eleicao: m[D.eleicao],
    nome: m[D.nome],
    partido: m[D.partido],
    varPib: m[D.varPib],
    pibIni: m[D.pibIni], pibFim: m[D.pibFim], anoPib: m[D.anoPib],
    varHom: m[D.varHom],
    homIni: m[D.homIni], homFim: m[D.homFim], anoHom: m[D.anoHom],
    varEmp: m[D.varEmp],
    empIni: m[D.empIni], empFim: m[D.empFim], anoEmp: m[D.anoEmp],
    varDesoc: m.length > 22 ? m[D.varDesoc] : null,
    desocIni: m.length > 22 ? m[D.desocIni] : null, desocFim: m.length > 22 ? m[D.desocFim] : null, anoDesoc: m.length > 22 ? m[D.anoDesoc] : null,
    varInf: m.length > 22 ? m[D.varInf] : null,
    infIni: m.length > 22 ? m[D.infIni] : null, infFim: m.length > 22 ? m[D.infFim] : null, anoInf: m.length > 22 ? m[D.anoInf] : null,
    temGov: m.length > 22,
    foto: m.at(-1) || null,
    _m: m,
  };
}

function ordenaMandatos(dados) {
  const { col, dir } = tabelaOrdem;
  return [...dados].sort((a, b) => {
    let va = a[col], vb = b[col];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string') return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return dir === 'asc' ? va - vb : vb - va;
  });
}

function mostraModalMandato(d) {
  const velho = document.querySelector('.modal-santinho');
  if (velho) velho.remove();

  const de = mandatoDe(d.eleicao);
  const cargo = d.temGov ? 'Governador' : 'Prefeito';
  const lugar = d.uf ? nomeUF(d.uf) : nomeDoLugar();
  const faixa = `${cargo} · ${lugar} · ${de.de}–${de.ate}`;

  const linhas = [['Partido', d.partido]];
  linhas.push(['PIB per capita', d.varPib == null ? 'sem dado' : `${numeroBr(d.varPib, 1, true)}% (${real(d.pibIni)} → ${real(d.pibFim)}, ${d.anoPib})`]);
  linhas.push(['Homicídios', d.varHom == null ? 'sem dado' : `${numeroBr(d.varHom, 1, true)} por 100 mil (${numeroBr(d.homIni)} → ${numeroBr(d.homFim)}, ${d.anoHom})`]);
  linhas.push(['Empregos formais', d.varEmp == null ? 'sem dado' : `${numeroBr(d.varEmp, 1, true)} / mil hab (${numeroBr(d.empIni, 1)} → ${numeroBr(d.empFim, 1)}, ${d.anoEmp})`]);
  if (d.temGov) {
    linhas.push(['Desocupação', d.varDesoc == null ? 'sem dado' : `${numeroBr(d.varDesoc, 1, true)} pp (${numeroBr(d.desocIni, 1)}% → ${numeroBr(d.desocFim, 1)}%, ${d.anoDesoc})`]);
    linhas.push(['Informalidade', d.varInf == null ? 'sem dado' : `${numeroBr(d.varInf, 1, true)} pp (${numeroBr(d.infIni, 1)}% → ${numeroBr(d.infFim, 1)}%, ${d.anoInf})`]);
  }

  const numero = d.varPib != null ? `${numeroBr(d.varPib, 1, true)}%` : '—';
  const rotulo = d.varPib != null ? 'de variação real do PIB per capita (R$ de 2022).' : 'PIB sem dado para este mandato.';

  const foto = d.foto ? fotoCandidato(d.foto, 'santinho-foto') : '';

  const modal = document.createElement('div');
  modal.className = 'modal-santinho';
  modal.innerHTML = `<button class="modal-fechar" aria-label="Fechar">×</button>` +
    santinho({ faixa, nome: d.nome, numero, rotulo, linhas, foto,
      verso: VERSO_MANDATO, fonte: 'IBGE, Atlas da Violência, CEMPRE, PNAD, Censo' });
  document.body.append(modal);
  modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('.modal-fechar')) modal.remove(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', esc); } });
}

function tabelaMandatos(linhas, comLugar = false) {
  if (!linhas.length) return '<p class="aviso-vazio">Sem mandatos para mostrar.</p>';
  const dados = linhas.map(l => {
    const m = comLugar ? l.m : l;
    return extraiDadosMandato(m, comLugar, comLugar ? l.uf : null);
  });
  const temGov = dados[0].temGov;
  const ordenados = ordenaMandatos(dados);

  const celula = d => {
    const pib = d.varPib == null ? '<span class="sem-info">sem dado</span>'
      : `<strong>${numeroBr(d.varPib, 1, true)}%</strong><span class="situacao">${real(d.pibIni)} → ${real(d.pibFim)} (${d.anoPib})</span>`;
    const hom = d.varHom == null ? '<span class="sem-info">sem dado</span>'
      : `<strong class="${d.varHom > 0 ? 'sobe' : 'cai'}">${numeroBr(d.varHom, 1, true)}</strong><span class="situacao">${numeroBr(d.homIni)} → ${numeroBr(d.homFim)} (${d.anoHom})</span>`;
    const emp = d.varEmp == null ? '<span class="sem-info">sem dado</span>'
      : `<strong class="${d.varEmp >= 0 ? 'cai' : 'sobe'}">${numeroBr(d.varEmp, 1, true)}</strong><span class="situacao">${numeroBr(d.empIni, 1)} → ${numeroBr(d.empFim, 1)} (${d.anoEmp})</span>`;
    const r = [pib, hom, emp];
    if (temGov) {
      const desoc = d.varDesoc == null ? '<span class="sem-info">sem dado</span>'
        : `<strong class="${d.varDesoc > 0 ? 'sobe' : 'cai'}">${numeroBr(d.varDesoc, 1, true)} pp</strong><span class="situacao">${numeroBr(d.desocIni, 1)}% → ${numeroBr(d.desocFim, 1)}% (${d.anoDesoc})</span>`;
      const inf = d.varInf == null ? '<span class="sem-info">sem dado</span>'
        : `<strong class="${d.varInf > 0 ? 'sobe' : 'cai'}">${numeroBr(d.varInf, 1, true)} pp</strong><span class="situacao">${numeroBr(d.infIni, 1)}% → ${numeroBr(d.infFim, 1)}% (${d.anoInf})</span>`;
      r.push(desoc, inf);
    }
    return r;
  };

  const th = (chave, rotulo, extra = '') => {
    const cls = `num ordenavel${tabelaOrdem.col === chave ? ` ${tabelaOrdem.dir}` : ''}`;
    return `<th class="${cls}" data-col="${chave}">${rotulo}${extra}</th>`;
  };

  const html = `<div class="rolagem"><table class="tabela" data-tabela-mandatos>
    <thead><tr>${comLugar ? th('uf', 'Estado') : ''}${th('eleicao', 'Mandato')}${th('nome', 'Eleito')}${th('partido', 'Partido')}
      ${th('varPib', 'PIB per capita', '<span class="situacao">var. real (R$ 2022)</span>')}
      ${th('varHom', 'Homicídios', '<span class="situacao">var. por 100 mil</span>')}
      ${th('varEmp', 'Empregos', '<span class="situacao">formais / mil hab</span>')}
      ${temGov ? `${th('varDesoc', 'Desocupação', '<span class="situacao">var. em pp</span>')}${th('varInf', 'Informalidade', '<span class="situacao">var. em pp</span>')}` : ''}
      </tr></thead>
    <tbody>${ordenados.map((d, i) => {
      const cols = celula(d);
      return `<tr class="clicavel" data-midx="${i}">${comLugar ? `<td>${d.uf}</td>` : ''}<td>${mandatoDe(d.eleicao).de}–${mandatoDe(d.eleicao).ate}</td><td>${nomeCurto(d.nome)}</td><td>${d.partido}</td>
        ${cols.map(c => `<td class="num">${c}</td>`).join('')}</tr>`;
    }).join('')}</tbody></table></div>`;

  // attach events after render via setTimeout
  setTimeout(() => {
    const tabela = document.querySelector('[data-tabela-mandatos]');
    if (!tabela) return;
    tabela.querySelector('thead').addEventListener('click', e => {
      const thEl = e.target.closest('th[data-col]');
      if (!thEl) return;
      const col = thEl.dataset.col;
      if (tabelaOrdem.col === col) tabelaOrdem.dir = tabelaOrdem.dir === 'desc' ? 'asc' : 'desc';
      else { tabelaOrdem.col = col; tabelaOrdem.dir = 'desc'; }
      desenhaPainel();
    });
    tabela.querySelector('tbody').addEventListener('click', e => {
      const tr = e.target.closest('tr[data-midx]');
      if (!tr) return;
      mostraModalMandato(ordenados[+tr.dataset.midx]);
    });
  }, 0);

  return html;
}

let pedido = 0;
function desenhaPainel() {
  const terr = territorio();
  if (!terr) {
    const todos = UFS_PROJETO.flatMap(u => (uf.ufs[u]?.governadores ?? []).map(m => ({ uf: u, m }))).sort((a, b) => a.uf.localeCompare(b.uf) || a.m[D.eleicao] - b.m[D.eleicao]);
    painel.innerHTML = `<h3>Os governadores dos seis estados e o que mudou no mandato</h3>
      ${tabelaMandatos(todos, true)}
      <p class="apoio">A variação do PIB per capita é real (R$ de 2022, corrigida pelo IPCA). O mandato de 2022 vai até 2026 e ainda não tem o PIB medido
        (o IBGE publica o PIB com cerca de dois anos de atraso); a taxa de homicídios vai até 2024; os empregos formais vêm do CEMPRE/IBGE (até 2024).
        A desocupação e a informalidade vêm da PNAD Contínua (4º trimestre).</p>`;
    return;
  }
  const meu = ++pedido;
  const nome = nomeDoLugar(), nm = estado.mun ? nomeMun(estado.mun) : nomeUF(estado.uf);
  const mandatos = (estado.mun ? MUN[estado.mun]?.prefeitos : uf.ufs[estado.uf]?.governadores) ?? [];
  const dados = linhasDaSerie();
  const largura = Math.min(760, painel.clientWidth || 560);
  const quem = estado.mun ? 'prefeitos' : 'governadores';
  const caixa = document.createElement('div');
  const ehUF = !estado.mun;
  caixa.innerHTML = `
    <h3>O que mudou ${em(nm)}</h3>
    <p>As faixas cinzas dos gráficos são os mandatos de ${quem} eleitos, com o partido de cada um. Veja se a linha sobe ou desce dentro da faixa, e lembre
      que várias coisas, de fora do poder do eleito, empurram esses números.</p>
    <h4>PIB per capita, em R$ de 2022</h4><div class="grafico" id="g-pib"></div>
    <h4>Homicídios por 100 mil habitantes${estado.mun ? ' (média de 3 anos)' : ''}</h4><div class="grafico" id="g-hom"></div>
    <h4>Empregos formais por mil habitantes</h4><div class="grafico" id="g-emp"></div>
    ${ehUF ? '<h4>Taxa de desocupação (%)</h4><div class="grafico" id="g-desoc"></div>' : ''}
    ${ehUF ? '<h4>Taxa de informalidade (%)</h4><div class="grafico" id="g-inf"></div>' : ''}
    <h4>Saneamento: água da rede e esgoto adequado (%)</h4><div class="grafico" id="g-san"></div>
    <h4>Peso de cada setor no valor adicionado</h4><div class="grafico" id="g-setor"></div>
    <h4>${estado.mun ? 'Prefeitos eleitos' : 'Governadores eleitos'} e o que mudou no mandato</h4>
    ${tabelaMandatos(mandatos)}
    <p class="apoio">Mandatos em andamento, ou sem o dado publicado ainda, aparecem como "sem dado". O PIB per capita é a preços constantes de 2022 (corrigido pelo IPCA), e a taxa de homicídios
      dos municípios pequenos oscila muito de um ano para outro: leia a tendência, não um ano isolado.
      Empregos formais vêm do CEMPRE/IBGE. ${ehUF ? 'A desocupação e a informalidade vêm da PNAD Contínua (4º trimestre); não há dado estadual em 2020-2021.' : ''}
        Os indicadores de saneamento (água e esgoto) vêm do Censo/IBGE e só existem para 2010 e 2022.</p>`;
  if (meu !== pedido) return;
  caixa.querySelector('#g-pib').append(graficoLinha(dados, 'pib', COR.vitoria, 'PIB per capita', mandatos, largura, v => formata.real(v), 84));
  caixa.querySelector('#g-hom').append(graficoLinha(dados, 'hom', '#e2692a', 'homicídios', mandatos, largura, v => numeroBr(v)));
  caixa.querySelector('#g-emp').append(graficoLinha(dados, 'empMil', '#3b6ea8', 'empregos formais', mandatos, largura, v => numeroBr(v, 1)));
  if (ehUF) {
    caixa.querySelector('#g-desoc').append(graficoLinha(dados, 'desoc', '#e2692a', 'desocupação', mandatos, largura, v => `${numeroBr(v, 1)}%`));
    caixa.querySelector('#g-inf').append(graficoLinha(dados, 'inf', '#8c5a9e', 'informalidade', mandatos, largura, v => `${numeroBr(v, 1)}%`));
  }
  caixa.querySelector('#g-san').append(graficoSaneamento(dados, mandatos, largura));
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
    : `${numeroBr(m[D.varPib], 1, true)}% (${real(m[D.pibIni])} em ${m[D.eleicao]} para ${real(m[D.pibFim])} em ${m[D.anoPib]}, R$ de 2022)`;
  const hom = m[D.varHom] == null ? 'sem dado'
    : `${numeroBr(m[D.varHom], 1, true)} por 100 mil (${numeroBr(m[D.homIni])} em ${m[D.eleicao]} para ${numeroBr(m[D.homFim])} em ${m[D.anoHom]})`;
  const emp = m[D.varEmp] == null ? 'sem dado'
    : `${numeroBr(m[D.varEmp], 1, true)} / mil hab (${numeroBr(m[D.empIni], 1)} em ${m[D.eleicao]} para ${numeroBr(m[D.empFim], 1)} em ${m[D.anoEmp]})`;
  let txt = `${nomeCurto(m[D.nome])} (${m[D.partido]}); PIB per capita: ${pib}; homicídios: ${hom}; empregos formais: ${emp}`;
  if (m.length > 22) {
    const desoc = m[D.varDesoc] == null ? 'sem dado'
      : `${numeroBr(m[D.varDesoc], 1, true)} pp (${numeroBr(m[D.desocIni], 1)}% em ${m[D.eleicao]} para ${numeroBr(m[D.desocFim], 1)}% em ${m[D.anoDesoc]})`;
    const inf = m[D.varInf] == null ? 'sem dado'
      : `${numeroBr(m[D.varInf], 1, true)} pp (${numeroBr(m[D.infIni], 1)}% em ${m[D.eleicao]} para ${numeroBr(m[D.infFim], 1)}% em ${m[D.anoInf]})`;
    txt += `; desocupação: ${desoc}; informalidade: ${inf}`;
  }
  return txt;
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
    secoes.push({ titulo: `Série anual ${em(nome)}`, linhas: linhasDaSerie().map(l => {
      let txt = `PIB per capita ${l.pib == null ? 'sem dado' : real(l.pib)}; homicídios ${l.hom == null ? 'sem dado' : `${numeroBr(l.hom)} por 100 mil`}; empregos formais ${l.empMil == null ? 'sem dado' : `${numeroBr(l.empMil, 1)} / mil hab`}`;
      if (l.desoc !== undefined) txt += `; desocupação ${l.desoc == null ? 'sem dado' : `${numeroBr(l.desoc, 1)}%`}; informalidade ${l.inf == null ? 'sem dado' : `${numeroBr(l.inf, 1)}%`}`;
      if (l.agua != null || l.esgoto != null) txt += `; água da rede ${l.agua == null ? 'sem dado' : `${numeroBr(l.agua, 1)}%`}; esgoto adequado ${l.esgoto == null ? 'sem dado' : `${numeroBr(l.esgoto, 1)}%`}`;
      txt += `; setor que mais pesa ${indiceDoMaior(l.pcts) == null ? 'sem dado' : SETORES[indiceDoMaior(l.pcts)]}`;
      return [String(l.ano), txt];
    }) });
  } else {
    secoes.push({ titulo: 'Governadores dos seis estados e o que mudou no mandato', linhas: UFS_PROJETO.flatMap(u =>
      (uf.ufs[u]?.governadores ?? []).map(m => [`${nomeUF(u)}, ${rotuloMandato(m[D.eleicao])}`, textoMandato(m)])) });
  }
  secoes.push({ titulo: 'Cuidados na leitura', linhas: [
    ['Mapa', estado.uf && !estado.mun ? 'o mapa do estado mostra os municípios; nos indicadores do mandato, os prefeitos eleitos no ano escolhido'
      : 'o mapa do Brasil mostra os seis estados; nos indicadores do mandato, os governadores eleitos no ano escolhido'],
    ['PIB per capita', 'a preços constantes de 2022, corrigido pelo IPCA: a inflação já foi descontada'],
    ['Setores', 'o IBGE publica o valor adicionado por setor só até 2021; o PIB per capita, até 2022'],
    ['Homicídios', 'registros do Ministério da Saúde no Atlas da Violência; nos municípios, média de 3 anos, e os pequenos oscilam muito'],
    ['Homicídios sem registro', 'o Atlas não publica município sem nenhum homicídio no ano; a página conta o ausente como taxa zero (as taxas dos estados, somadas assim, batem com as do Atlas)'],
    ['Empregos formais', 'do CEMPRE/IBGE (Cadastro Central de Empresas, até 2024): só conta trabalhadores em empresas e organizações formais'],
    ['Desocupação e informalidade', 'da PNAD Contínua/IBGE (4º trimestre); só existem por estado, não por município; sem dado estadual em 2020 e 2021 por causa da pandemia'],
    ['Saneamento', 'do Censo/IBGE, só em 2010 e 2022; água da rede: % com abastecimento da rede geral; esgoto adequado: % com rede geral/pluvial ou fossa séptica; nos anos entre censos, usa o dado do censo mais próximo'],
    ['Causa', 'mostra o que mudou durante o mandato, não que o eleito causou a mudança']] });
  return { numero: 11, pergunta: 'O que mudou no mandato?', recorte: `${nome} · ${rotulo}`, secoes };
});

// ---------------------------------------------------------------- busca de municípios

const buscaCaixa = document.getElementById('busca-mun');
const buscaInput = document.getElementById('busca-mun-input');
const buscaLista = document.getElementById('busca-mun-lista');

function normaliza(t) { return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

function atualizaBusca() {
  buscaCaixa.hidden = !estado.uf;
  if (!estado.uf) { buscaInput.value = ''; buscaLista.innerHTML = ''; return; }
}

buscaInput.addEventListener('input', () => {
  const q = normaliza(buscaInput.value.trim());
  if (q.length < 2) { buscaLista.innerHTML = ''; return; }
  const resultados = Object.entries(MUN)
    .filter(([, m]) => normaliza(m.nome).includes(q))
    .sort((a, b) => {
      const ai = normaliza(a[1].nome).indexOf(q), bi = normaliza(b[1].nome).indexOf(q);
      return ai - bi || a[1].nome.localeCompare(b[1].nome);
    })
    .slice(0, 12);
  buscaLista.innerHTML = resultados.map(([cod, m]) => {
    const inicio = normaliza(m.nome).indexOf(q);
    const nome = m.nome;
    const marcado = nome.slice(0, inicio) + '<mark>' + nome.slice(inicio, inicio + q.length) + '</mark>' + nome.slice(inicio + q.length);
    return `<li role="option" data-cod="${cod}">${marcado}</li>`;
  }).join('');
});

buscaLista.addEventListener('click', e => {
  const li = e.target.closest('li[data-cod]');
  if (!li) return;
  para();
  estado.mun = li.dataset.cod;
  buscaInput.value = '';
  buscaLista.innerHTML = '';
  atualiza();
});

buscaInput.addEventListener('keydown', e => {
  const itens = [...buscaLista.querySelectorAll('li')];
  if (!itens.length) return;
  const atual = itens.findIndex(li => li.classList.contains('ativo'));
  if (e.key === 'ArrowDown') { e.preventDefault(); itens.forEach(li => li.classList.remove('ativo')); itens[Math.min(atual + 1, itens.length - 1)].classList.add('ativo'); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); itens.forEach(li => li.classList.remove('ativo')); itens[Math.max(atual - 1, 0)].classList.add('ativo'); }
  else if (e.key === 'Enter') { e.preventDefault(); const ativo = itens.find(li => li.classList.contains('ativo')); if (ativo) ativo.click(); }
  else if (e.key === 'Escape') { buscaLista.innerHTML = ''; }
});

document.addEventListener('click', e => { if (!buscaCaixa.contains(e.target)) buscaLista.innerHTML = ''; });

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
  atualizaBusca();
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

// ---------------------------------------------------------------- o recorte pedido ao oráculo

// a pergunta do leitor pode pedir outro ano ou lugar (o indicador fica); o lugar sem estado é o Brasil
const recorteAtual = () => ({ ano: estado.ano, ...(estado.uf ? { uf: estado.uf } : {}), ...(estado.mun ? { mun: estado.mun } : {}) });
registraRecortes({
  opcoes: () => ({ anos: anosDe(estado.ind), lugar: 'mun', brasil: true }),
  atual: recorteAtual,
  aplica: async novo => {
    const p = new URLSearchParams({ ind: estado.ind, ano: novo.ano });
    if (novo.uf) p.set('uf', novo.uf);
    if (novo.mun) p.set('mun', novo.mun);
    history.replaceState(null, '', `#${p}`);
    leEndereco();
    await atualiza();
    return recorteAtual();
  },
});
