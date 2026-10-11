// Página Mapa (perguntas 1, 2 e 8): Brasil, estados do projeto e seus municípios.
//
// Dados (gerados por gera_dados.py):
//   mapa/brasil.json            linhas do Brasil e das 27 UFs
//   mapa/municipios/UF.json     linhas dos municípios de uma UF do projeto
//   geo/estados.json, geo/municipios/UF.json   contornos do IBGE
// A seleção (pergunta, ano, cargo, faixa, UF e município) fica no endereço da página.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/+esm';
import { montaPagina, carregaDados, formata } from './comum.js';

montaPagina();

const NOME_UF = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul',
  MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul', SC: 'Santa Catarina',
  SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins',
};
const CARGOS_MUNICIPAIS = ['PREFEITO', 'VEREADOR'];
// "no Brasil", "na Paraíba", "no Amapá"; os demais estados e os municípios levam "em"
const PREPOSICAO = { Brasil: 'no', 'Amapá': 'no', 'Paraíba': 'na', Acre: 'no', Amazonas: 'no', 'Pará': 'no',
  Tocantins: 'no', 'Maranhão': 'no', 'Piauí': 'no', 'Ceará': 'no', 'Rio Grande do Norte': 'no', 'Espírito Santo': 'no',
  'Rio de Janeiro': 'no', 'Paraná': 'no', 'Rio Grande do Sul': 'no', 'Distrito Federal': 'no', Bahia: 'na' };
const em = nome => `${PREPOSICAO[nome] ?? 'em'} ${nome}`;
// escala do verde-limão ao verde-escuro: até a classe mais baixa se destaca do fundo bege;
// "sem dado" é hachurado, para não se confundir com valor baixo
const SEM_DADO = 'url(#sem-dado)';
const CORES = ['#d4ee74', '#9bd35a', '#4fb548', '#1d8a3f', '#0b5a2e'];
const RAMPA = d3.piecewise(d3.interpolateRgb, CORES);

const brasil = await carregaDados('mapa/brasil.json');
const geoEstados = await carregaDados('geo/estados.json');
const ufsProjeto = new Set(brasil.ufs_projeto);

const form = document.getElementById('controles');
const selAno = form.elements.ano, selCargo = form.elements.cargo, selFaixa = form.elements.faixa;
const svgCaixa = document.getElementById('mapa');
const painel = document.getElementById('painel');

// ---------------------------------------------------------------- estado da página

const estado = { pergunta: 'custo', ano: 2022, cargo: 'DEPUTADO FEDERAL', faixa: null, uf: null, mun: null };

function leEndereco() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (['custo', 'patrimonio', 'dependencia'].includes(p.get('pergunta'))) estado.pergunta = p.get('pergunta');
  if (brasil.anos.includes(Number(p.get('ano')))) estado.ano = Number(p.get('ano'));
  if (p.get('cargo')) estado.cargo = p.get('cargo');
  estado.faixa = p.has('faixa') ? Number(p.get('faixa')) : null;
  estado.uf = ufsProjeto.has(p.get('uf')) ? p.get('uf') : null;
  estado.mun = estado.uf && p.get('mun') ? p.get('mun') : null;
}

function escreveEndereco() {
  const p = new URLSearchParams({ pergunta: estado.pergunta, ano: estado.ano, cargo: estado.cargo });
  if (estado.faixa != null && estado.pergunta !== 'custo') p.set('faixa', estado.faixa);
  if (estado.uf) p.set('uf', estado.uf);
  if (estado.mun) p.set('mun', estado.mun);
  history.replaceState(null, '', `#${p}`);
}

// ---------------------------------------------------------------- leitura das linhas

const idxCargo = c => brasil.cargos.indexOf(c);
const registro = (campos, linha) => Object.fromEntries(campos.map((c, i) => [c, linha[i]]));

async function fonte(territorio) {
  // municípios moram no arquivo da UF; Brasil e UFs, no arquivo do Brasil
  if (/^\d{5}$/.test(territorio)) return carregaDados(`mapa/municipios/${estado.uf}.json`);
  return brasil;
}

function custos(dados, filtro) {
  return dados.custo.map(l => registro(brasil.campos_custo, l)).filter(filtro);
}
function faixas(dados, filtro) {
  return dados[estado.pergunta].map(l => registro(brasil.campos_faixa, l)).filter(filtro);
}

const ehCargo = r => r.ano === estado.ano && r.cargo === idxCargo(estado.cargo);
const custoMedio = r => (r.eleitos ? r.gasto_eleitos / r.eleitos : null);
const taxa = (eleitos, candidatos) => (candidatos ? (100 * eleitos) / candidatos : null);

/** Valor que colore cada território do mapa atual: {território: número}. */
function valoresDoMapa(dados) {
  const valores = {};
  if (estado.pergunta === 'custo') {
    for (const r of custos(dados, ehCargo)) valores[r.territorio] = custoMedio(r);
  } else {
    // parcela dos eleitos de cada território que está na faixa escolhida: a base são os
    // eleitos, então funciona até com um eleito só (governador) e não depende de muitos candidatos
    const eleitos = {}, naFaixa = {};
    for (const r of faixas(dados, ehCargo)) {
      eleitos[r.territorio] = (eleitos[r.territorio] ?? 0) + r.eleitos;
      if (r.faixa === estado.faixa) naFaixa[r.territorio] = r.eleitos;
    }
    for (const [t, total] of Object.entries(eleitos)) valores[t] = total ? (100 * (naFaixa[t] ?? 0)) / total : null;
  }
  delete valores.BR;          // o total do Brasil vai para o painel, não para as cores dos estados
  return valores;
}

// ---------------------------------------------------------------- candidatos um a um

const LIMITE_INDIVIDUAL = 20;   // até tantos candidatos, o painel mostra cada um em vez de faixas

/** Candidatos do recorte atual (presidente, governador, senador, prefeito), ou [] se não houver lista. */
async function candidatosDe(onde) {
  const arquivo = onde === 'BR' ? 'BR' : /^\d{5}$/.test(onde) ? estado.uf : onde;
  let dados;
  try { dados = await carregaDados(`mapa/candidatos/${arquivo}.json`); }
  catch { return []; }                         // UF fora do projeto: não há lista
  return dados.candidatos.map(l => registro(dados.campos, l))
    .filter(c => c.ano === estado.ano && c.cargo === idxCargo(estado.cargo) && c.territorio === onde);
}

const parcelaPublica = c => (c.receita ? (100 * (c.receita_publica ?? 0)) / c.receita : null);
const resultadoCandidato = c => (c.eleito ? 'eleito' : c.situacao === 'SEM SITUAÇÃO' ? 'resultado não informado pelo TSE' : c.situacao.toLowerCase());

/** Painel com os candidatos lado a lado: a métrica da pergunta em barras, o eleito em verde. */
function painelIndividual(lista, nome, pergunta) {
  const metrica = {
    custo: { valor: c => c.despesa, rotulo: 'gasto de campanha', fmt: v => formata.real(v), falta: 'sem despesa declarada' },
    patrimonio: { valor: c => c.patrimonio, rotulo: 'patrimônio declarado', fmt: v => formata.real(v), falta: 'nenhum bem declarado' },
    dependencia: { valor: parcelaPublica, rotulo: 'parcela da receita vinda de dinheiro público', fmt: v => formata.pct(v), falta: 'sem receita declarada' },
  }[pergunta];
  // 0% de dinheiro público é um dado; patrimônio ou gasto zero é ausência de declaração
  const linhas = lista.map(c => ({ ...c, v: pergunta === 'dependencia' ? metrica.valor(c) : metrica.valor(c) || null }))
    .sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
  const eleitos = linhas.filter(c => c.eleito), outros = linhas.filter(c => !c.eleito);
  const mediana = d3.median(outros.filter(c => c.v != null), c => c.v);
  const posicao = c => linhas.filter(x => x.v != null).indexOf(c) + 1;
  const frase = eleitos.map(e => (e.v == null
    ? `${e.nome} (${e.partido}), eleito, não tem ${metrica.rotulo} registrado`
    : `${e.nome} (${e.partido}), eleito, teve ${metrica.fmt(e.v)} de ${metrica.rotulo}, ${posicao(e)}º entre os ${linhas.filter(x => x.v != null).length} candidatos com esse dado`)).join('; ');
  const comparacao = mediana == null ? '' : ` Entre os que não se elegeram, o valor do meio (mediana) foi ${metrica.fmt(mediana)}.`;

  const comValor = linhas.filter(c => c.v != null);
  const grafico = comValor.length ? Plot.plot({
    width: Math.min(760, painel.clientWidth || 520), height: 30 + 30 * comValor.length,
    marginLeft: 245, marginRight: 110, marginTop: 10,
    style: { fontFamily: 'Archivo, sans-serif', fontSize: '12.5px', background: 'transparent' },
    x: { axis: null, domain: pergunta === 'dependencia' ? [0, 100] : undefined },
    y: { domain: comValor.map(c => c.nome), label: null, tickFormat: n => (n.length > 28 ? `${n.slice(0, 27)}…` : n) },
    marks: [
      Plot.barX(comValor, { y: 'nome', x: 'v', fill: c => (c.eleito ? '#00a651' : '#cbbd9d'), stroke: '#22201c', strokeWidth: 1,
                            title: c => `${c.nome} (${c.partido}): ${metrica.fmt(c.v)}` }),
      Plot.text(comValor, { y: 'nome', x: 'v', text: c => metrica.fmt(c.v), dx: 6, textAnchor: 'start' }),
    ],
  }) : null;

  const caixa = document.createElement('div');
  const titulo = {
    custo: `Quanto gastou cada candidato a ${estado.cargo.toLowerCase()} ${em(nome)}, em ${estado.ano}?`,
    patrimonio: `O que separou quem se elegeu ${estado.cargo.toLowerCase()} ${em(nome)}, em ${estado.ano}: o patrimônio`,
    dependencia: `O que separou quem se elegeu ${estado.cargo.toLowerCase()} ${em(nome)}, em ${estado.ano}: o dinheiro público`,
  }[pergunta];
  caixa.innerHTML = `
    <h3>${titulo}</h3>
    <p>${frase}.${comparacao}</p>
    <div class="grafico"></div>
    <div class="rolagem"><table class="tabela">
      <thead><tr><th>Candidato</th><th>Resultado</th><th class="num">Patrimônio</th><th class="num">Gasto</th><th class="num">Dinheiro público</th></tr></thead>
      <tbody>${linhas.map(c => `<tr${c.eleito ? ' class="atual"' : ''}>
        <td><a href="politico.html#${c.id}">${c.nome}</a> <span class="apoio situacao">${c.partido}</span></td>
        <td>${resultadoCandidato(c)}</td>
        <td class="num">${c.patrimonio ? formata.real(c.patrimonio) : '<span class="sem-info">nenhum bem</span>'}</td>
        <td class="num">${c.despesa ? formata.real(c.despesa) : '<span class="sem-info">sem despesa</span>'}</td>
        <td class="num">${parcelaPublica(c) == null ? '<span class="sem-info">sem receita</span>' : formata.pct(parcelaPublica(c))}</td></tr>`).join('')}
      </tbody></table></div>
    <p class="apoio">Barras em verde: quem se elegeu. ${linhas.length - comValor.length ? `Sem barra: ${linhas.length - comValor.length} candidato(s) sem ${metrica.rotulo} registrado (${metrica.falta}), em geral candidaturas que não chegaram à eleição.` : ''}</p>`;
  if (grafico) caixa.querySelector('.grafico').append(grafico);
  return caixa;
}

// ---------------------------------------------------------------- controles

function cargosDoAno(ano) {
  const presentes = new Set(brasil.custo.filter(l => l[0] === ano && l[2] === 'BR').map(l => l[1]));
  return brasil.cargos.filter((_, i) => presentes.has(i));
}

function nomeFaixas() {
  return estado.pergunta === 'patrimonio' ? brasil.faixas_patrimonio : brasil.faixas_dependencia;
}

function montaControles() {
  form.elements.pergunta.value = estado.pergunta;
  selAno.innerHTML = brasil.anos.map(a => `<option${a === estado.ano ? ' selected' : ''}>${a}</option>`).join('');
  const cargos = cargosDoAno(estado.ano);
  if (!cargos.includes(estado.cargo)) estado.cargo = cargos.includes('VEREADOR') ? 'VEREADOR' : 'DEPUTADO FEDERAL';
  selCargo.innerHTML = cargos.map(c => `<option value="${c}"${c === estado.cargo ? ' selected' : ''}>${c.toLowerCase()}</option>`).join('');
  const comFaixa = estado.pergunta !== 'custo';
  document.getElementById('campo-faixa').hidden = !comFaixa || estado.cargo === 'PRESIDENTE';
  if (comFaixa) {
    const nomes = nomeFaixas();
    // padrão: R$ 1 milhão a R$ 5 milhões (patrimônio) e 75% ou mais público (dependência)
    if (estado.faixa == null || estado.faixa >= nomes.length) estado.faixa = estado.pergunta === 'patrimonio' ? 4 : 0;
    selFaixa.innerHTML = nomes.map((n, i) => `<option value="${i}"${i === estado.faixa ? ' selected' : ''}>${n}</option>`).join('');
  }
}

form.addEventListener('change', e => {
  if (e.target.name === 'pergunta') { estado.pergunta = e.target.value; estado.faixa = null; }
  if (e.target.name === 'ano') estado.ano = Number(e.target.value);
  if (e.target.name === 'cargo') estado.cargo = e.target.value;
  if (e.target.name === 'faixa') estado.faixa = Number(e.target.value);
  atualiza();
});

document.getElementById('voltar').addEventListener('click', () => { estado.uf = null; estado.mun = null; atualiza(); });

// ---------------------------------------------------------------- mapa

/** Até cinco classes com o mesmo número de territórios; cortes repetidos (muitos zeros) são unidos.
 *  Com até cinco valores distintos (governador: 0% ou 100%), cada valor ganha sua própria cor. */
function escala(valores) {
  const presentes = Object.values(valores).filter(v => v != null).sort(d3.ascending);
  if (!presentes.length) return null;
  const distintos = [...new Set(presentes)];
  if (distintos.length <= 5) {
    const cores = distintos.length === 1 ? [CORES[2]] : d3.quantize(RAMPA, distintos.length);
    const esc = d3.scaleThreshold().domain(distintos.slice(1).map((v, i) => (v + distintos[i]) / 2)).range(cores);
    esc.rotulos = distintos.map(formatoValor);
    return esc;
  }
  const cortes = [...new Set([0.2, 0.4, 0.6, 0.8].map(q => d3.quantileSorted(presentes, q)))]
    .filter(c => c > presentes[0] && c < presentes.at(-1));
  const cores = cortes.length ? d3.quantize(RAMPA, cortes.length + 1) : [CORES[2]];
  const esc = d3.scaleThreshold().domain(cortes).range(cores);
  esc.limites = [presentes[0], ...cortes, presentes.at(-1)];
  return esc;
}

function formatoValor(v) {
  if (v == null) return 'sem dado';
  return estado.pergunta === 'custo' ? formata.real(v) : formata.pct(v);
}

function desenhaLegenda(esc) {
  const legenda = document.getElementById('legenda');
  if (!esc) { legenda.innerHTML = ''; return; }
  const limites = esc.limites;
  const rotulo = i => (esc.rotulos ? esc.rotulos[i] : `${formatoValor(limites[i])} a ${formatoValor(limites[i + 1])}`);
  const titulo = estado.pergunta === 'custo'
    ? 'Gasto médio de quem se elegeu'
    : `Parcela dos eleitos na faixa "${nomeFaixas()[estado.faixa]}"`;
  legenda.innerHTML = `<span class="legenda-titulo">${titulo}</span>
    <span class="legenda-faixas">${esc.range().map((c, i) => `<span><i style="background:${c}"></i>${rotulo(i)}</span>`).join('')}
    <span><i class="sem-dado"></i>${estado.pergunta === 'custo' ? 'sem dado' : 'sem eleitos com esse dado'}</span></span>`;
}

async function desenhaMapa() {
  // presidente: a eleição é nacional e não se divide por estado nem município
  document.querySelector('.mapa-grade').classList.toggle('sem-mapa', estado.cargo === 'PRESIDENTE');
  if (estado.cargo === 'PRESIDENTE') {
    svgCaixa.innerHTML = `<div class="aviso-vazio aviso-mapa"><p><strong>A eleição para presidente é nacional.</strong>
      Os votos são somados no país inteiro, então não há custo, patrimônio ou dinheiro público por estado
      para colorir o mapa. A resposta para o Brasil está abaixo.</p></div>`;
    document.getElementById('legenda').innerHTML = '';
    document.getElementById('dica').textContent = 'Escolha outro cargo para ver o mapa.';
    return;
  }
  const largura = svgCaixa.clientWidth || 640;
  const altura = Math.round(largura * 0.92);
  const naUF = Boolean(estado.uf);
  const geo = naUF ? await carregaDados(`geo/municipios/${estado.uf}.json`) : geoEstados;
  const municipal = naUF && CARGOS_MUNICIPAIS.includes(estado.cargo);
  const dados = naUF ? await carregaDados(`mapa/municipios/${estado.uf}.json`) : brasil;
  // num estado, cargo estadual: todos os municípios recebem a cor do estado
  const valores = naUF && !municipal ? valoresDoMapa(brasil) : valoresDoMapa(dados);
  const esc = escala(naUF && !municipal ? valoresDoMapa(brasil) : valores);
  const chave = f => (naUF ? (municipal ? f.properties.mun : estado.uf) : f.properties.uf);

  const projecao = d3.geoMercator().fitSize([largura, altura], geo);
  const caminho = d3.geoPath(projecao);
  const svg = d3.create('svg').attr('viewBox', [0, 0, largura, altura]).attr('class', 'mapa-svg')
    .attr('role', 'group').attr('aria-label', naUF ? `Municípios de ${NOME_UF[estado.uf]}` : 'Estados do Brasil');
  // hachurado de "sem dado"
  const hachura = svg.append('defs').append('pattern').attr('id', 'sem-dado').attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 6).attr('height', 6).attr('patternTransform', 'rotate(45)');
  hachura.append('rect').attr('width', 6).attr('height', 6).attr('fill', '#cbbd9d');
  hachura.append('rect').attr('width', 1.6).attr('height', 6).attr('fill', '#8f8470');

  const forma = svg.append('g').selectAll('path').data(geo.features).join('path')
    .attr('d', caminho)
    .attr('fill', f => { const v = valores[chave(f)]; return v == null || !esc ? SEM_DADO : esc(v); })
    .attr('class', f => {
      if (naUF) return `municipio${f.properties.mun === estado.mun ? ' selecionado' : ''}`;
      return ufsProjeto.has(f.properties.uf) ? 'estado projeto' : 'estado';
    });

  forma.append('title').text(f => {
    if (naUF) return `${dadosMunicipio(dados, f.properties.mun)?.nome ?? 'Município'}: ${formatoValor(valores[chave(f)])}`;
    const uf = f.properties.uf;
    return `${NOME_UF[uf]}: ${formatoValor(valores[uf])}${ufsProjeto.has(uf) ? '' : ' (fora dos seis estados do projeto)'}`;
  });

  // estados do projeto e municípios são clicáveis e alcançáveis pelo teclado
  const clicavel = naUF ? forma : forma.filter(f => ufsProjeto.has(f.properties.uf));
  clicavel.attr('tabindex', 0).attr('role', 'button')
    .on('click', (_, f) => seleciona(f))
    .on('keydown', (e, f) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleciona(f); } });

  svgCaixa.replaceChildren(svg.node());
  desenhaLegenda(esc);
  document.getElementById('dica').textContent = naUF
    ? (municipal ? 'Clique num município para ver os números dele.' : `Cargo estadual: o valor é o mesmo para todo o estado. Escolha prefeito ou vereador para comparar municípios.`)
    : 'Os seis estados do projeto têm contorno escuro e podem ser clicados.';
}

function dadosMunicipio(dados, cod) {
  return dados.municipios?.[cod];
}

function seleciona(f) {
  if (!estado.uf) { estado.uf = f.properties.uf; estado.mun = null; }
  else estado.mun = f.properties.mun === estado.mun ? null : f.properties.mun;
  atualiza();
}

// ---------------------------------------------------------------- painel de respostas

async function nomeTerritorio() {
  if (estado.mun) {
    const dados = await carregaDados(`mapa/municipios/${estado.uf}.json`);
    return `${dadosMunicipio(dados, estado.mun)?.nome ?? estado.mun} (${estado.uf})`;
  }
  return estado.uf ? NOME_UF[estado.uf] : 'Brasil';
}

function territorioAtual() {
  if (estado.mun && CARGOS_MUNICIPAIS.includes(estado.cargo)) return estado.mun;
  return estado.uf ?? 'BR';
}

async function painelCusto(onde, nome) {
  const dados = await fonte(onde);
  const doAno = custos(dados, r => r.ano === estado.ano && r.territorio === onde);
  const r = doAno.find(x => x.cargo === idxCargo(estado.cargo));
  if (!r) return `<p class="aviso-vazio">Não há ${estado.cargo.toLowerCase()} ${em(nome)} em ${estado.ano}${estado.cargo === 'PRESIDENTE' ? ': o cargo de presidente só tem valor para o Brasil' : ''}.</p>`;
  const linhas = doAno.sort((a, b) => (custoMedio(b) ?? 0) - (custoMedio(a) ?? 0)).map(x => `<tr${x === r ? ' class="atual"' : ''}>
      <td>${brasil.cargos[x.cargo].toLowerCase()}</td><td class="num">${formata.numero(x.vagas ?? 0)}</td>
      <td class="num">${x.vagas ? formata.numero(Math.round(10 * x.candidatos / x.vagas) / 10) : ''}</td>
      <td class="num">${x.vagas ? formata.real(x.gasto / x.vagas) : ''}</td>
      <td class="num">${custoMedio(x) == null ? '' : formata.real(custoMedio(x))}</td></tr>`).join('');
  const umEleito = r.eleitos === 1;
  const html = `
    <h3>Quanto custa uma cadeira de ${estado.cargo.toLowerCase()} ${em(nome)}, em ${estado.ano}?</h3>
    <dl class="numeros numeros-painel">
      <div><dt>${umEleito ? 'Quanto gastou quem se elegeu' : 'Quanto gastou, em média, cada eleito'}</dt>
        <dd>${custoMedio(r) == null ? '—' : formata.real(custoMedio(r))}</dd>
        <dd class="explica">${umEleito ? 'Despesas da campanha vencedora.' : `Despesas dos ${formata.numero(r.eleitos)} eleitos ÷ ${formata.numero(r.eleitos)}.`}</dd></div>
      <div><dt>Quanto a disputa custou por cadeira</dt>
        <dd>${r.vagas ? formata.real(r.gasto / r.vagas) : '—'}</dd>
        <dd class="explica">Despesas de todos os ${formata.numero(r.candidatos)} candidatos, eleitos ou não, ÷ ${formata.numero(r.vagas ?? 0)} ${r.vagas === 1 ? 'vaga' : 'vagas'}.</dd></div>
      <div><dt>Candidatos por vaga</dt><dd>${r.vagas ? formata.numero(Math.round(10 * r.candidatos / r.vagas) / 10) : '—'}</dd></div>
      <div><dt>Vagas</dt><dd>${formata.numero(r.vagas ?? 0)}</dd></div>
    </dl>
    <p class="apoio">O primeiro número diz quanto custou, para quem venceu, chegar à cadeira; o segundo, quanto
      dinheiro a disputa inteira movimentou para cada cadeira, contando também quem perdeu. Despesas
      contratadas pelas campanhas, em reais de cada ano, sem correção pela inflação.</p>
    <div id="individual"></div>
    <h4>Todos os cargos de ${estado.ano} ${em(nome)}</h4>
    <div class="rolagem"><table class="tabela">
      <thead><tr><th>Cargo</th><th class="num">Vagas</th><th class="num">Candidatos por vaga</th><th class="num">Disputa por cadeira</th><th class="num">Gasto médio por eleito</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>`;
  const caixa = document.createElement('div');
  caixa.innerHTML = html;
  const lista = await candidatosDe(onde);
  if (lista.length && lista.length <= LIMITE_INDIVIDUAL) caixa.querySelector('#individual').append(painelIndividual(lista, nome, 'custo'));
  return caixa;
}

async function painelFaixas(onde, nome) {
  const lista = await candidatosDe(onde);
  if (lista.length && lista.length <= LIMITE_INDIVIDUAL) return painelIndividual(lista, nome, estado.pergunta);
  const dados = await fonte(onde);
  const nomes = nomeFaixas();
  const linhas = faixas(dados, r => ehCargo(r) && r.territorio === onde)
    .map(r => ({ ...r, nome: nomes[r.faixa], taxa: taxa(r.eleitos, r.candidatos) }))
    .sort((a, b) => a.faixa - b.faixa);
  if (!linhas.length) return `<p class="aviso-vazio">Não há dados de ${estado.cargo.toLowerCase()} ${em(nome)} em ${estado.ano}.</p>`;
  const cand = d3.sum(linhas, r => r.candidatos), eleitos = d3.sum(linhas, r => r.eleitos);
  const geral = taxa(eleitos, cand);
  const pergunta = estado.pergunta === 'patrimonio'
    ? `Patrimônio declarado ajuda a eleger ${estado.cargo.toLowerCase()}?`
    : `Quem depende de dinheiro público se elege ${estado.cargo.toLowerCase()}?`;
  const grafico = Plot.plot({
    width: Math.min(560, painel.clientWidth || 520), height: 64 + 38 * linhas.length,
    marginLeft: 170, marginRight: 120, marginTop: 30,
    style: { fontFamily: 'Archivo, sans-serif', fontSize: '13px', background: 'transparent' },
    x: { label: 'taxa de vitória (%)', grid: true, nice: true },
    y: { domain: linhas.map(r => r.nome), label: null },
    marks: [
      Plot.barX(linhas, { y: 'nome', x: 'taxa', fill: r => (r.faixa === estado.faixa ? '#00a651' : '#b9de8a'), stroke: '#22201c', strokeWidth: 1 }),
      // média de todos os candidatos: atrás dos rótulos e com o nome escrito no topo
      Plot.ruleX([geral], { stroke: '#22201c', strokeWidth: 1.5, strokeDasharray: '5,3' }),
      Plot.text([geral], { x: d => d, frameAnchor: 'top', dy: -18, text: d => `todos os candidatos: ${formata.pct(d)}`, fontWeight: 700 }),
      Plot.text(linhas, { y: 'nome', x: 'taxa', text: r => `${formata.pct(r.taxa)} (${formata.numero(r.candidatos)})`,
                          dx: 6, textAnchor: 'start', stroke: '#e8dcc4', strokeWidth: 4, fill: '#22201c', paintOrder: 'stroke' }),
    ],
  });
  const escolhida = linhas.find(r => r.faixa === estado.faixa);
  const parcela = escolhida && eleitos ? (100 * escolhida.eleitos) / eleitos : 0;
  const caixa = document.createElement('div');
  caixa.innerHTML = `
    <h3>${pergunta}</h3>
    <p>${em(nome)[0].toUpperCase()}${em(nome).slice(1)}, em ${estado.ano}: ${formata.numero(eleitos)} ${eleitos === 1 ? 'eleito' : 'eleitos'} entre ${formata.numero(cand)} candidatos.
      Cada barra é a taxa de vitória de uma faixa, com o número de candidatos entre parênteses; a linha
      tracejada é a taxa de todos os candidatos juntos (${formata.pct(geral)}). Barra que passa da linha
      é faixa que se elege mais do que a média.</p>
    <div class="grafico"></div>
    <p>Dos eleitos, ${formata.pct(parcela)} estavam na faixa "${nomes[estado.faixa]}", a que colore o mapa.</p>
    <p class="apoio">${estado.pergunta === 'patrimonio'
      ? 'Bens declarados ao TSE no registro da candidatura.'
      : 'Parcela da receita vinda do fundo eleitoral e do Fundo Partidário; candidatos sem receita ficam de fora.'}
      A relação não é de causa e efeito: dinheiro, viabilidade e já ocupar o cargo andam juntos.</p>`;
  caixa.querySelector('.grafico').append(grafico);
  return caixa;
}

async function desenhaPainel() {
  const onde = territorioAtual();
  const nome = await nomeTerritorio();
  const conteudo = estado.pergunta === 'custo' ? await painelCusto(onde, nome) : await painelFaixas(onde, nome);
  if (typeof conteudo === 'string') painel.innerHTML = conteudo;
  else painel.replaceChildren(conteudo);
  if (estado.mun && !CARGOS_MUNICIPAIS.includes(estado.cargo)) {
    painel.insertAdjacentHTML('afterbegin', `<p class="apoio">${nome} selecionado, mas ${estado.cargo.toLowerCase()} é um cargo estadual: os números abaixo são de ${NOME_UF[estado.uf]}.</p>`);
  }
}

// ---------------------------------------------------------------- ciclo

async function atualiza() {
  montaControles();
  escreveEndereco();
  document.getElementById('titulo-territorio').textContent = await nomeTerritorio();
  document.getElementById('voltar').hidden = !estado.uf;
  await Promise.all([desenhaMapa(), desenhaPainel()]);
}

leEndereco();
await atualiza();
// endereço colado ou botões voltar e avançar do navegador
window.addEventListener('hashchange', () => { leEndereco(); atualiza(); });
let redimensiona;
window.addEventListener('resize', () => { clearTimeout(redimensiona); redimensiona = setTimeout(desenhaMapa, 200); });
