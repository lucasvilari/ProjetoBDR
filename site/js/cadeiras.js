// Página Cadeiras (pergunta 1 e os eleitos por partido): o plenário de cada eleição e o custo da cadeira.
//
// Dados (gerados por gera_dados.py):
//   mapa/brasil.json, mapa/municipios/UF.json   vagas, candidatos, eleitos e gastos (pergunta 1)
//   cadeiras/UF.json, cadeiras/BR.json          eleitos por partido nos seis estados, nos municípios
//                                               deles e para presidente
//   partidos.json                               eleitos por partido no Brasil, em 2022 e 2024
//   mapa/candidatos/UF.json                     candidatos um a um, nos recortes com poucos candidatos
// A seleção (ano, cargo, lugar e município) fica no endereço da página.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/+esm';
import { montaPagina, carregaDados, formata, santinho, NOME_UF, em } from './comum.js?v=20261015c';

montaPagina();

const CARGOS_MUNICIPAIS = ['PREFEITO', 'VEREADOR'];
const LIMITE_INDIVIDUAL = 20;          // até tantos candidatos, o painel mostra o gasto de cada um
const CARGOS_INDIVIDUAIS = ['PRESIDENTE', 'GOVERNADOR', 'SENADOR', 'PREFEITO'];   // os que têm lista de candidatos
// acima disso (vereadores e prefeitos de um estado inteiro), cada bolinha vale várias cadeiras:
// milhares de bolinhas pesam para desenhar e viram uma textura em que não se distingue partido nenhum
const MAX_BOLINHAS = 600;
const PASSOS = [1, 2, 5, 10, 20, 50, 100, 200];
// a mesma régua de cores do viés no Mapa: roxo (esquerda) → bege (centro) → dourado (direita)
const COR_NOTA = d3.interpolateRgbBasis(['#5b3f99', '#ddd0b4', '#b8860b']);
const SEM_NOTA = '#9a8f7a';
const corDaNota = n => (n == null ? SEM_NOTA : COR_NOTA(Math.max(0, Math.min(1, (n - 3) / 5))));
// as classes da consulta p07, juntadas em três lados
const LADOS = [
  { nome: 'esquerda e centro-esquerda', ate: 4.5 },
  { nome: 'centro', ate: 5.5 },
  { nome: 'centro-direita e direita', ate: Infinity },
];

const brasil = await carregaDados('mapa/brasil.json');
const { partidos: partidosBR } = await carregaDados('partidos.json');
const ufsProjeto = new Set(brasil.ufs_projeto);

const form = document.getElementById('controles');
const { ano: selAno, cargo: selCargo, onde: selOnde, mun: selMun } = form.elements;

const estado = { ano: 2022, cargo: 'DEPUTADO FEDERAL', onde: 'BR', mun: null };

function leEndereco() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (brasil.anos.includes(Number(p.get('ano')))) estado.ano = Number(p.get('ano'));
  if (brasil.cargos.includes(p.get('cargo'))) estado.cargo = p.get('cargo');
  estado.onde = p.get('onde') === 'BR' || NOME_UF[p.get('onde')] ? p.get('onde') : 'BR';
  estado.mun = ufsProjeto.has(estado.onde) && p.get('mun') ? p.get('mun') : null;
}

function escreveEndereco() {
  const p = new URLSearchParams({ ano: estado.ano, cargo: estado.cargo, onde: estado.onde });
  if (estado.mun) p.set('mun', estado.mun);
  history.replaceState(null, '', `#${p}`);
}

// ---------------------------------------------------------------- leitura

const registro = (campos, linha) => Object.fromEntries(campos.map((c, i) => [c, linha[i]]));
const idxCargo = c => brasil.cargos.indexOf(c);
const municipal = () => CARGOS_MUNICIPAIS.includes(estado.cargo);
const territorio = () => (estado.mun && municipal() ? estado.mun : estado.onde);
const municipiosDa = uf => carregaDados(`mapa/municipios/${uf}.json`);

async function nomeLugar() {
  if (estado.mun && municipal()) {
    const dados = await municipiosDa(estado.onde);
    return dados.municipios[estado.mun]?.nome ?? estado.mun;
  }
  return estado.onde === 'BR' ? 'Brasil' : NOME_UF[estado.onde];
}

/** Linhas de custo (vagas, candidatos, eleitos, gastos) de um ano num território. */
async function custos(ano, onde) {
  const dados = /^\d{5}$/.test(onde) ? await municipiosDa(estado.onde) : brasil;
  return dados.custo.map(l => registro(brasil.campos_custo, l)).filter(r => r.ano === ano && r.territorio === onde);
}

/** Cargos com eleição no ano e no lugar escolhidos. */
function cargosDisponiveis() {
  const presentes = new Set(brasil.custo.filter(l => l[0] === estado.ano && l[2] === estado.onde).map(l => l[1]));
  return brasil.cargos.filter((_, i) => presentes.has(i));
}

/** Eleitos por partido no recorte atual, da esquerda para a direita: [{sigla, nota, n}], ou null sem o dado.
 *  `eleitos` é o total oficial: no Brasil, partidos.json só traz os partidos atuais, e as cadeiras de
 *  partidos extintos ou fundidos desde então entram como "outros". */
async function partidosDoRecorte(eleitos) {
  const { ano, cargo } = estado;
  if (estado.onde === 'BR' && cargo !== 'PRESIDENTE') {
    // Brasil: partidos.json, só para 2022 e 2024
    const lista = partidosBR.map(p => ({
      sigla: p.sigla, nota: p.especialistas[ano <= 2020 ? '2018' : '2022'] ?? p.especialistas['2022'] ?? p.especialistas['2018'],
      n: p.eleicoes.filter(e => e[0] === ano && e[1] === cargo).reduce((s, e) => s + e[3], 0),
    })).filter(p => p.n);
    if (!lista.length) return null;
    const falta = (eleitos ?? 0) - d3.sum(lista, p => p.n);
    return [...ordena(lista), ...(falta > 0 ? [{ sigla: 'outros', nota: null, n: falta, outros: true }] : [])];
  }
  if (estado.onde !== 'BR' && !ufsProjeto.has(estado.onde)) return null;
  const dados = await carregaDados(`cadeiras/${estado.onde}.json`);
  const ic = dados.cargos.indexOf(cargo), onde = territorio();
  const lista = dados.linhas.filter(l => l[0] === ano && l[1] === ic && l[2] === onde)
    .map(([, , , p, n]) => ({ sigla: dados.partidos[p][0], nota: dados.partidos[p][1][ano] ?? null, n }));
  return lista.length ? ordena(lista) : null;
}

const ordena = lista => lista.sort((a, b) => (a.nota ?? 99) - (b.nota ?? 99) || b.n - a.n || a.sigla.localeCompare(b.sigla));

async function candidatosDoRecorte() {
  if (!CARGOS_INDIVIDUAIS.includes(estado.cargo)) return [];
  const arquivo = estado.onde === 'BR' ? 'BR' : estado.onde;
  if (arquivo !== 'BR' && !ufsProjeto.has(arquivo)) return [];
  let dados;
  try { dados = await carregaDados(`mapa/candidatos/${arquivo}.json`); }
  catch { return []; }
  const ic = idxCargo(estado.cargo), onde = territorio();
  return dados.candidatos.map(l => registro(dados.campos, l)).filter(c => c.ano === estado.ano && c.cargo === ic && c.territorio === onde);
}

// ---------------------------------------------------------------- o plenário

/** Posições das cadeiras num semicírculo de raio 1, em fileiras; ordenadas da esquerda para a direita,
 *  para que cada partido ocupe uma fatia contínua, como nos gráficos de plenário. */
function assentos(n) {
  if (n === 1) return { pontos: [{ x: 0, y: -0.45 }], raio: 0.3, interno: 1 };
  const fileiras = n <= 10 ? 1 : Math.min(40, Math.max(2, Math.round(Math.sqrt(n / 4.5))));
  const interno = fileiras === 1 ? 1 : Math.max(0.38, 1 - 0.12 * fileiras);   // poucas fileiras: meia-lua fina, com espaço no meio
  const raios = d3.range(fileiras).map(i => (fileiras === 1 ? 1 : interno + ((1 - interno) * i) / (fileiras - 1)));
  const soma = d3.sum(raios);
  const porFileira = raios.map(r => Math.max(1, Math.round((n * r) / soma)));
  // o arredondamento sobra ou falta algumas cadeiras: acerta nas fileiras de fora, que têm mais espaço
  for (let i = fileiras - 1, dif = n - d3.sum(porFileira); dif !== 0; i = (i - 1 + fileiras) % fileiras) {
    if (dif < 0 && porFileira[i] <= 1) continue;
    porFileira[i] += Math.sign(dif); dif -= Math.sign(dif);
  }
  const pontos = raios.flatMap((r, i) => d3.range(porFileira[i]).map(j => {
    const ang = porFileira[i] === 1 ? Math.PI / 2 : Math.PI - (Math.PI * j) / (porFileira[i] - 1);
    return { x: r * Math.cos(ang), y: -r * Math.sin(ang), ang, r };
  }));
  pontos.sort((a, b) => b.ang - a.ang || a.r - b.r);
  const passoArco = d3.min(raios, (r, i) => (porFileira[i] > 1 ? (Math.PI * r) / (porFileira[i] - 1) : 2));
  const passoFileira = fileiras > 1 ? (1 - interno) / (fileiras - 1) : 2;
  return { pontos, raio: Math.min(0.09, 0.45 * Math.min(passoArco, passoFileira)), interno };
}

/** Quantas bolinhas cada partido recebe quando cada uma vale `passo` cadeiras: pelos maiores restos,
 *  para a soma bater com o total de bolinhas e cada fatia ficar proporcional às cadeiras. */
function bolinhasPorGrupo(grupos, passo, bolinhas) {
  const cotas = grupos.map(n => n / passo);
  const base = cotas.map(Math.floor);
  const ordem = d3.range(grupos.length).sort((a, b) => (cotas[b] - base[b]) - (cotas[a] - base[a]));
  for (let k = 0, falta = bolinhas - d3.sum(base); falta > 0; k = (k + 1) % ordem.length, falta--) base[ordem[k]] += 1;
  return base;
}

function desenhaPlenario(lista, total) {
  const caixa = document.getElementById('plenario');
  const passo = PASSOS.find(q => total / q <= MAX_BOLINHAS) ?? Math.ceil(total / MAX_BOLINHAS);
  const bolinhas = Math.max(1, Math.round(total / passo));
  const { pontos, raio, interno } = assentos(bolinhas);
  // cada bolinha recebe o partido da vez; as cadeiras sem eleito e, sem dado por partido, todas ficam neutras
  const grupos = lista ? [...lista.map(p => p.n), total - d3.sum(lista, p => p.n)] : [total];
  const porGrupo = bolinhasPorGrupo(grupos, passo, bolinhas);
  const donos = lista ? porGrupo.flatMap((q, i) => Array(q).fill(i < lista.length ? i : null)) : [];
  const E = 100;                         // unidades do desenho por raio
  // uma cadeira só (presidente, governador, prefeito de um município): moldura curta, em volta dela
  const [L, topo, base] = bolinhas === 1 ? [1.6 * E, -0.8 * E, -0.1 * E] : [1.12 * E, -1.12 * E, 0.2 * E];
  const circulos = pontos.map((pt, k) => {
    const i = donos[k];
    const p = lista?.[i];
    return `<circle cx="${(pt.x * E).toFixed(2)}" cy="${(pt.y * E).toFixed(2)}" r="${(raio * E).toFixed(2)}" data-p="${i ?? ''}"
      fill="${p ? corDaNota(p.nota) : 'var(--visor)'}"><title>${p ? `${p.sigla}: ${p.n} ${p.n === 1 ? 'cadeira' : 'cadeiras'}` : lista ? 'sem eleito registrado' : 'cadeira'}</title></circle>`;
  }).join('');
  caixa.innerHTML = `<svg viewBox="${-L} ${topo} ${2 * L} ${base - topo}" class="plenario-svg${raio < 0.02 ? ' miudo' : ''}"
      role="img" aria-label="${total} ${total === 1 ? 'cadeira' : 'cadeiras'}${lista ? ', coloridas pelo partido' : ''}">
    ${circulos}
    <text x="0" y="${-0.06 * E}" class="plenario-total" font-size="${Math.min(26, (1.7 * (interno - raio) * E) / (0.6 * formata.numero(total).length)).toFixed(1)}">${formata.numero(total)}</text>
    <text x="0" y="${0.1 * E}" class="plenario-rotulo">${total === 1 ? 'cadeira' : 'cadeiras'}</text>
    ${passo > 1 ? `<text x="0" y="${0.17 * E}" class="plenario-escala">cada bolinha ≈ ${passo} cadeiras</text>` : ''}
  </svg>`;
  if (total === 1) caixa.querySelectorAll('text').forEach(t => t.remove());
  return passo;
}

/** Apontar um partido (na legenda ou no plenário) acende as cadeiras dele. */
function destaca(i) {
  const svg = document.querySelector('.plenario-svg');
  if (!svg) return;
  svg.classList.toggle('destacando', i != null);
  svg.querySelectorAll('circle').forEach(c => c.classList.toggle('ativo', c.dataset.p === String(i)));
  document.querySelectorAll('#legenda-partidos li').forEach(li => li.classList.toggle('ativo', li.dataset.p === String(i)));
}
for (const id of ['plenario', 'legenda-partidos']) {
  const el = document.getElementById(id);
  el.addEventListener('pointerover', e => { const p = e.target.closest('[data-p]')?.dataset.p; destaca(p ? Number(p) : null); });
  el.addEventListener('pointerleave', () => destaca(null));
  el.addEventListener('focusin', e => { const p = e.target.closest('[data-p]')?.dataset.p; if (p) destaca(Number(p)); });
  el.addEventListener('focusout', () => destaca(null));
}

const CASA = {
  PRESIDENTE: () => 'Presidência da República',
  GOVERNADOR: br => (br ? 'Governos dos estados' : 'Governo do estado'),
  SENADOR: () => 'Senado: cadeiras em disputa',
  'DEPUTADO FEDERAL': br => (br ? 'Câmara dos Deputados' : 'Bancada na Câmara dos Deputados'),
  'DEPUTADO ESTADUAL': br => (br ? 'Assembleias legislativas' : 'Assembleia Legislativa'),
  'DEPUTADO DISTRITAL': () => 'Câmara Legislativa do Distrito Federal',
  PREFEITO: (br, mun) => (mun ? 'Prefeitura' : 'Prefeituras'),
  VEREADOR: (br, mun) => (mun ? 'Câmara Municipal' : 'Câmaras municipais'),
};

const plural = (n, um, varios) => `${formata.numero(n)} ${n === 1 ? um : varios}`;

async function desenhaTopo(lista, custo) {
  const nome = await nomeLugar();
  const mun = Boolean(estado.mun && municipal());
  document.getElementById('t-plenario').innerHTML = `<span class="sobre">${nome} · ${estado.ano}</span>
    ${CASA[estado.cargo]?.(estado.onde === 'BR', mun) ?? estado.cargo.toLowerCase()}`;
  // as vagas do TSE; se faltar eleito registrado (cassação, eleição sub judice), a cadeira fica em branco
  const ocupadas = lista ? d3.sum(lista, p => p.n) : 0;
  const total = Math.max(ocupadas, custo?.vagas ?? 0) || custo?.eleitos || 0;
  const resumo = document.getElementById('resumo-plenario');
  const legenda = document.getElementById('legenda-partidos');
  const nota = document.getElementById('nota-plenario');
  if (!total) {
    document.getElementById('plenario').innerHTML = `<p class="aviso-vazio">Não há eleição para ${estado.cargo.toLowerCase()} ${em(nome)} em ${estado.ano}.</p>`;
    resumo.innerHTML = legenda.innerHTML = nota.textContent = '';
    return;
  }
  const passo = desenhaPlenario(lista, total);
  if (!lista) {
    resumo.innerHTML = '';
    legenda.innerHTML = '';
    nota.textContent = estado.onde === 'BR'
      ? 'A divisão por partido no Brasil inteiro só está disponível para 2022 e 2024. Escolha um desses anos ou um dos seis estados do projeto.'
      : 'A divisão por partido só está disponível para o Brasil (2022 e 2024) e para os seis estados do projeto: AP, MG, MS, PB, RO e RR.';
    return;
  }
  const maior = d3.greatest(lista, p => p.n);
  const lados = LADOS.map((l, i) => ({ ...l, n: d3.sum(lista.filter(p => p.nota != null && p.nota < l.ate && (i === 0 || p.nota >= LADOS[i - 1].ate)), p => p.n) }));
  const semNota = d3.sum(lista.filter(p => p.nota == null), p => p.n);
  const eleito = total === 1 ? (await candidatosDoRecorte()).find(c => c.eleito) : null;
  resumo.innerHTML = total === 1
    ? `Ficou com ${eleito ? `<a href="politico.html#${eleito.id}"><strong>${eleito.nome}</strong></a>, do ` : 'o '}<strong>${maior.sigla}</strong>.`
    : `<strong>${lista.length} ${lista.length === 1 ? 'partido' : 'partidos'}</strong> dividem as ${formata.numero(total)} cadeiras.
       O maior é o <strong>${maior.sigla}</strong>, com ${plural(maior.n, 'cadeira', 'cadeiras')} (${formata.pct((100 * maior.n) / total)}).
       ${lados.filter(l => l.n).map(l => `<span class="lado" style="--cor:${corDaNota(l.ate === 4.5 ? 3.4 : l.ate === 5.5 ? 5 : 7.2)}">${l.nome}: <b>${formata.numero(l.n)}</b></span>`).join('')}
       ${semNota ? `<span class="lado" style="--cor:${SEM_NOTA}">sem nota: <b>${formata.numero(semNota)}</b></span>` : ''}`;
  legenda.innerHTML = lista.map((p, i) => `<li data-p="${i}" tabindex="0"><i style="background:${corDaNota(p.nota)}"></i>
    <span class="sigla">${p.sigla}</span><b>${formata.numero(p.n)}</b></li>`).join('');
  const vazias = total - ocupadas;
  const escala = passo > 1
    ? `Com ${formata.numero(total)} cadeiras, cada bolinha vale cerca de ${passo}; partido com menos de ${Math.ceil(passo / 2)} pode não ganhar bolinha, mas está na lista acima.${municipal() && ufsProjeto.has(estado.onde) ? ' Escolha um município para ver cadeira por cadeira.' : ''} `
    : '';
  nota.textContent = `${escala}${vazias ? `${plural(vazias, 'cadeira fica', 'cadeiras ficam')} em branco: não há eleito registrado no TSE para ${vazias === 1 ? 'ela' : 'elas'}. ` : ''}Partidos da esquerda para a direita pela nota dos especialistas (0 a 10); a cor segue a mesma nota, do roxo ao dourado. Partidos sem nota ficam no fim, em cinza.${lista.some(p => p.outros) ? ' "Outros" são cadeiras de partidos que deixaram de existir ou se fundiram depois da eleição.' : ''} Aponte um partido para ver as cadeiras dele.`;
}

// ---------------------------------------------------------------- o santinho: quanto custa uma cadeira

const custoMedio = r => (r.eleitos ? r.gasto_eleitos / r.eleitos : null);

async function desenhaSantinho(custo) {
  const nome = await nomeLugar();
  const faixa = `${estado.cargo.toLowerCase()} · ${estado.ano}`;
  const caixa = document.getElementById('santinho');
  if (!custo || custoMedio(custo) == null) {
    caixa.innerHTML = santinho({ faixa, nome, numero: '—', rotulo: 'Sem dado de gasto para este recorte.', classe: 'santinho-neutro' });
    return;
  }
  const um = custo.eleitos === 1;
  caixa.innerHTML = santinho({
    faixa, nome, numero: formata.real(custoMedio(custo)),
    rotulo: um ? 'gastou a campanha de quem se elegeu.' : `gastou, em média, cada um dos ${formata.numero(custo.eleitos)} eleitos.`,
    linhas: [
      ['Disputa por cadeira', custo.vagas ? formata.real(custo.gasto / custo.vagas) : '—'],
      ['Candidatos por vaga', custo.vagas ? formata.numero(Math.round(10 * custo.candidatos / custo.vagas) / 10) : '—'],
      ['Vagas', formata.numero(custo.vagas ?? 0)],
    ],
    verso: `<p>O número grande soma as despesas ${um ? 'da campanha vencedora' : `dos ${formata.numero(custo.eleitos)} eleitos e divide por ${formata.numero(custo.eleitos)}`}:
      quanto custou, para quem venceu, chegar à cadeira.</p>
      <p>A disputa por cadeira soma as despesas de todos os ${formata.numero(custo.candidatos)} candidatos, eleitos ou não,
      e divide pelas ${formata.numero(custo.vagas ?? 0)} vagas.</p>
      <p>Despesas contratadas pelas campanhas, em reais de cada ano, sem correção pela inflação.</p>`,
    fonte: 'p01_custo_cadeira.sql',
  });
}

// ---------------------------------------------------------------- o painel: todos os cargos e os candidatos

function graficoCandidatos(lista) {
  const comValor = lista.filter(c => c.despesa).sort((a, b) => b.despesa - a.despesa);
  if (!comValor.length) return null;
  const largura = Math.min(760, document.getElementById('painel').clientWidth || 520);
  const estreito = largura < 560;
  const barra = Plot.barX(comValor, { y: 'nome', x: 'despesa', fill: c => (c.eleito ? '#00a651' : '#cbbd9d'), stroke: '#22201c', strokeWidth: 1,
                                       insetTop: estreito ? 19 : 0, title: c => `${c.nome} (${c.partido}): ${formata.real(c.despesa)}` });
  const valor = Plot.text(comValor, { y: 'nome', x: 'despesa', text: c => formata.real(c.despesa), dx: 6, dy: estreito ? 9 : 0, textAnchor: 'start' });
  return Plot.plot({
    width: largura, height: (estreito ? 16 : 30) + (estreito ? 46 : 30) * comValor.length,
    marginLeft: estreito ? 0 : 245, marginRight: estreito ? 100 : 110, marginTop: 10,
    style: { fontFamily: 'Archivo, sans-serif', fontSize: '12.5px', background: 'transparent' },
    x: { axis: null },
    y: { domain: comValor.map(c => c.nome), label: null, axis: estreito ? null : 'left', tickFormat: n => (n.length > 28 ? `${n.slice(0, 27)}…` : n) },
    marks: estreito
      ? [barra, valor, Plot.text(comValor, { y: 'nome', x: 0, text: c => `${c.nome} (${c.partido})`, dy: -12, textAnchor: 'start',
                                             fontWeight: c => (c.eleito ? 700 : 400), lineWidth: 40 })]
      : [barra, valor],
  });
}

async function desenhaPainel(doAno) {
  const nome = await nomeLugar();
  const painel = document.getElementById('painel');
  const linhas = [...doAno].sort((a, b) => (custoMedio(b) ?? 0) - (custoMedio(a) ?? 0));
  const lista = await candidatosDoRecorte();
  const individual = lista.length && lista.length <= LIMITE_INDIVIDUAL;
  painel.innerHTML = `
    ${individual ? `<h3>Quanto gastou cada candidato a ${estado.cargo.toLowerCase()} ${em(nome)}, em ${estado.ano}?</h3>
      <div class="grafico" id="g-candidatos"></div>
      <p class="apoio">Barras em verde: quem se elegeu. Candidatos sem despesa declarada ficam sem barra.</p>` : ''}
    <h3>Todos os cargos de ${estado.ano} ${em(nome)}</h3>
    ${linhas.length ? `<div class="rolagem"><table class="tabela">
      <thead><tr><th>Cargo</th><th class="num">Vagas</th><th class="num">Candidatos por vaga</th><th class="num">Disputa por cadeira</th><th class="num">Gasto médio por eleito</th></tr></thead>
      <tbody>${linhas.map(x => `<tr${brasil.cargos[x.cargo] === estado.cargo ? ' class="atual"' : ''}>
        <td><button type="button" class="link-cargo" data-cargo="${brasil.cargos[x.cargo]}">${brasil.cargos[x.cargo].toLowerCase()}</button></td>
        <td class="num">${formata.numero(x.vagas ?? 0)}</td>
        <td class="num">${x.vagas ? formata.numero(Math.round(10 * x.candidatos / x.vagas) / 10) : ''}</td>
        <td class="num">${x.vagas ? formata.real(x.gasto / x.vagas) : ''}</td>
        <td class="num">${custoMedio(x) == null ? '' : formata.real(custoMedio(x))}</td></tr>`).join('')}
      </tbody></table></div>` : `<p class="aviso-vazio">Sem dados de ${estado.ano} ${em(nome)}.</p>`}`;
  if (individual) {
    const g = graficoCandidatos(lista);
    if (g) painel.querySelector('#g-candidatos').append(g);
  }
}

document.getElementById('painel').addEventListener('click', e => {
  const cargo = e.target.closest('.link-cargo')?.dataset.cargo;
  if (cargo) { estado.cargo = cargo; atualiza(); document.getElementById('t-plenario').scrollIntoView({ behavior: 'smooth' }); }
});

// ---------------------------------------------------------------- controles

async function montaControles() {
  selAno.innerHTML = brasil.anos.map(a => `<option${a === estado.ano ? ' selected' : ''}>${a}</option>`).join('');
  // presidente só no Brasil; o Distrito Federal não tem prefeito nem vereador
  const ufs = Object.keys(NOME_UF).filter(uf => brasil.custo.some(l => l[0] === estado.ano && l[2] === uf));
  if (estado.onde !== 'BR' && !ufs.includes(estado.onde)) { estado.onde = 'BR'; estado.mun = null; }
  const ordem = [...ufs].sort((a, b) => NOME_UF[a].localeCompare(NOME_UF[b]));
  selOnde.innerHTML = `<option value="BR">Brasil</option>
    <optgroup label="Estados do projeto">${ordem.filter(u => ufsProjeto.has(u)).map(u => `<option value="${u}">${NOME_UF[u]}</option>`).join('')}</optgroup>
    <optgroup label="Outros estados">${ordem.filter(u => !ufsProjeto.has(u)).map(u => `<option value="${u}">${NOME_UF[u]}</option>`).join('')}</optgroup>`;
  selOnde.value = estado.onde;
  const cargos = cargosDisponiveis();
  if (!cargos.includes(estado.cargo)) estado.cargo = cargos.includes('VEREADOR') ? 'VEREADOR' : cargos.includes('DEPUTADO FEDERAL') ? 'DEPUTADO FEDERAL' : cargos[0];
  selCargo.innerHTML = cargos.map(c => `<option value="${c}"${c === estado.cargo ? ' selected' : ''}>${c.toLowerCase()}</option>`).join('');
  // município: só nos estados do projeto e nos cargos municipais
  const comMun = ufsProjeto.has(estado.onde) && municipal();
  document.getElementById('campo-mun').hidden = !comMun;
  if (comMun) {
    const { municipios } = await municipiosDa(estado.onde);
    const nomes = Object.entries(municipios).sort((a, b) => a[1].nome.localeCompare(b[1].nome));
    selMun.innerHTML = `<option value="">Todos os municípios</option>${nomes.map(([cod, m]) => `<option value="${cod}">${m.nome}</option>`).join('')}`;
    selMun.value = estado.mun ?? '';
  }
}

form.addEventListener('change', e => {
  const { name, value } = e.target;
  if (name === 'ano') estado.ano = Number(value);
  if (name === 'cargo') estado.cargo = value;
  if (name === 'onde') { estado.onde = value; estado.mun = null; }
  if (name === 'mun') estado.mun = value || null;
  atualiza();
});

// ---------------------------------------------------------------- ciclo

async function atualiza() {
  await montaControles();
  escreveEndereco();
  const doAno = await custos(estado.ano, territorio());
  const custo = doAno.find(r => r.cargo === idxCargo(estado.cargo));
  const lista = await partidosDoRecorte(custo?.eleitos);
  await Promise.all([desenhaTopo(lista, custo), desenhaSantinho(custo), desenhaPainel(doAno)]);
}

leEndereco();
await atualiza();
window.addEventListener('hashchange', () => { leEndereco(); atualiza(); });
