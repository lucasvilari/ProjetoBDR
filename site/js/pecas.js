// Peças que as páginas das perguntas dividem: o seletor de recorte (ano, cargo, lugar), a leitura
// dos candidatos de um recorte, o gráfico de dinheiro × votos e o cartão de um político.
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/+esm';
import { carregaDados, formata, santinho, fotoCandidato, NOME_UF } from './comum.js?v=20261020';
import { custoPorVoto, spearman, descreveCorrelacao, abreviaReais } from './lib/dinheiro.js?v=20261020';
import { leRecorte, escreveRecorte, cargosDoAno, ajustaLugar, MUNICIPAIS } from './lib/recorte.js?v=20261020';
import { COR } from './lib/cores.js?v=20261020';

export const UFS_PROJETO = ['AP', 'MG', 'MS', 'PB', 'RO', 'RR'];
// a capital de cada estado, o município aberto quando a página precisa de um
const CAPITAIS = { AP: '06050', MG: '41238', MS: '90514', PB: '20516', RO: '00035', RR: '03018' };
const minusculo = c => c.toLowerCase();

// ---------------------------------------------------------------- seletor de recorte

/** Monta os seletores de ano, cargo e (se pedido) lugar dentro de `form`, lê o recorte do endereço,
 *  grava o recorte no endereço a cada mudança e chama aoMudar(recorte). Devolve { recorte(), muda(novo) }.
 *  O lugar é sempre um dos seis estados do projeto, onde há os dados completos de cada candidato; presidente é a
 *  única eleição nacional e não tem lugar. opcoes: { anos, cargos?: string[] (filtra os do ano), comLugar,
 *  padrao: {ano, cargo, uf?, mun?}, municipioObrigatorio: sem a opção "todo o estado" para prefeito e
 *  vereador, que abrem na capital }. */
export function montaSeletor(form, { anos, cargos, comLugar = true, padrao, aoMudar, municipioObrigatorio = false }) {
  const ufPadrao = UFS_PROJETO.includes(padrao.uf) ? padrao.uf : 'MG';
  // nenhum dos seis estados é o DF, então os cargos do ano não dependem do estado
  const cargosValidos = ano => cargosDoAno(ano, ufPadrao).filter(c => !cargos || cargos.includes(c));
  const ufs = [...UFS_PROJETO].sort((a, b) => NOME_UF[a].localeCompare(NOME_UF[b]));
  const ajusta = novo => {
    if (!cargosValidos(novo.ano).includes(novo.cargo)) novo.cargo = cargosValidos(novo.ano)[0];
    const certo = ajustaLugar(novo, UFS_PROJETO, ufPadrao);
    if (municipioObrigatorio && MUNICIPAIS.includes(certo.cargo) && !certo.mun) certo.mun = CAPITAIS[certo.uf];
    for (const k of Object.keys(certo)) if (certo[k] === undefined) delete certo[k];
    return certo;
  };
  let r = ler();

  function ler() {
    const bruto = new URLSearchParams(location.hash.slice(1));
    const ano = anos.includes(Number(bruto.get('ano'))) ? Number(bruto.get('ano')) : padrao.ano;
    return ajusta(leRecorte(location.hash, { ...padrao, ano }, { anos, cargos: cargosValidos(ano), ufs }));
  }

  async function desenha() {
    const municipios = r.uf && MUNICIPAIS.includes(r.cargo)
      ? Object.entries((await carregaDados(`mapa/municipios/${r.uf}.json`)).municipios).sort((a, b) => a[1].nome.localeCompare(b[1].nome))
      : [];
    form.innerHTML = `
      <label class="campo"><span class="so-leitor">Ano</span>
        <select name="ano">${anos.map(a => `<option${a === r.ano ? ' selected' : ''}>${a}</option>`).join('')}</select></label>
      <label class="campo"><span class="so-leitor">Cargo</span>
        <select name="cargo">${cargosValidos(r.ano).map(c => `<option value="${c}"${c === r.cargo ? ' selected' : ''}>${minusculo(c)}</option>`).join('')}</select></label>
      ${comLugar && r.cargo !== 'PRESIDENTE' ? `<label class="campo"><span class="so-leitor">Estado</span>
        <select name="uf">${ufs.map(u => `<option value="${u}"${u === r.uf ? ' selected' : ''}>${NOME_UF[u]}</option>`).join('')}</select></label>` : ''}
      ${comLugar && r.cargo === 'PRESIDENTE' ? '<span class="seletor-nota">eleição nacional: o Brasil inteiro</span>' : ''}
      ${municipios.length ? `<label class="campo"><span class="so-leitor">Município</span>
        <select name="mun">${municipioObrigatorio ? '' : '<option value="">todo o estado</option>'}${municipios.map(([cod, m]) => `<option value="${cod}"${cod === r.mun ? ' selected' : ''}>${m.nome}</option>`).join('')}</select></label>` : ''}`;
  }

  async function aplica(novo) {
    r = ajusta(novo);
    history.replaceState(null, '', `#${escreveRecorte(r)}`);
    await desenha();
    aoMudar(r);
  }

  form.addEventListener('change', e => {
    const novo = { ...r, [e.target.name]: e.target.name === 'ano' ? Number(e.target.value) : e.target.value || undefined };
    if (e.target.name === 'uf') delete novo.mun;
    aplica(novo);
  });
  addEventListener('hashchange', () => aplica(ler()));
  aplica(r);
  return { recorte: () => r, muda: novo => aplica({ ...r, ...novo }) };
}

// ---------------------------------------------------------------- candidatos de um recorte

/** Os candidatos de uma unidade eleitoral num ano (arquivo candidaturas/<ue>-<ano>.json), como objetos.
 *  Unidade sem arquivo (por exemplo, vereadores de um estado inteiro) devolve lista vazia. */
export async function leCandidaturas(ue, ano) {
  // em ano municipal não há candidatos com UF ou Brasil como unidade: nem pede o arquivo
  if (ano % 4 === 0 && !/^\d{5}$/.test(ue)) return [];
  let f;
  try { f = await carregaDados(`candidaturas/${ue}-${ano}.json`); } catch { return []; }
  return f.linhas.map(l => {
    const o = Object.fromEntries(f.campos.map((c, i) => [c, l[i] ?? null]));
    o.cargo = f.cargos[o.cargo]; o.sigla = f.partidos[o.partido]; o.unidade = f.unidades[o.unidade];
    o.situacao = f.situacoes[o.situacao]; o.eleito = Boolean(o.eleito);
    o.nomeado = o.nome != null; o.custoPorVoto = custoPorVoto(o.despesa, o.votos);
    return o;
  });
}

export const nomeDe = c => (c.nomeado ? c.nome : `candidato ${c.sigla} de fora dos seis estados`);

// ---------------------------------------------------------------- dinheiro × votos

const ROTULO_CAMPO = { despesa: 'gasto de campanha', receita_publica: 'dinheiro público recebido', patrimonio: 'patrimônio declarado', receita: 'receita' };

/** Um ponto por candidato: dinheiro (escala logarítmica) contra votos, eleitos em verde. Acima, a
 *  força da relação em palavras; abaixo, quantos ficaram de fora por não terem dinheiro ou votos.
 *  `destaque` é o pid de um candidato marcado com um anel e o nome. */
export function dispersaoDinheiroVotos(linhas, { campo, largura, destaque = null }) {
  const caixa = document.createElement('div');
  caixa.className = 'dispersao';
  const comAmbos = linhas.filter(c => c[campo] > 0 && c.votos > 0);
  const semVotos = linhas.filter(c => c[campo] > 0 && !(c.votos > 0)).length;
  const semDinheiro = linhas.filter(c => !(c[campo] > 0)).length;
  const r = spearman(comAmbos.map(c => [c[campo], c.votos]));
  if (comAmbos.length < 3) {
    caixa.innerHTML = `<p class="aviso-vazio">Poucos candidatos com ${ROTULO_CAMPO[campo]} e votos neste recorte para comparar.</p>`;
    return caixa;
  }
  caixa.innerHTML = `<p class="dispersao-frase"><strong>${descreveCorrelacao(r)}</strong>
    <span class="apoio">(correlação de Spearman ${String(r.toFixed(2)).replace('.', ',')}, ${formata.numero(comAmbos.length)} candidatos)</span></p>`;
  const ordenados = [...comAmbos].sort((a, b) => a.eleito - b.eleito);   // eleitos por cima
  caixa.append(Plot.plot({
    width: largura, height: Math.min(420, Math.max(260, largura * 0.55)), marginLeft: 64, marginBottom: 42,
    style: { fontFamily: 'Archivo, sans-serif', fontSize: '12px', background: 'transparent' },
    x: { type: 'log', label: `${ROTULO_CAMPO[campo]} (R$, escala log) →`, tickFormat: '~s', grid: true },
    y: { type: 'log', label: '↑ votos (escala log)', tickFormat: '~s', grid: true },
    marks: [
      Plot.dot(ordenados, {
        x: campo, y: 'votos', r: d => (d.eleito ? 4 : 3), fill: d => (d.eleito ? COR.vitoria : '#cbbd9d'),
        stroke: COR.tecla, strokeWidth: 0.5, fillOpacity: 0.85,
        title: d => `${nomeDe(d)} (${d.sigla})\n${ROTULO_CAMPO[campo]}: ${formata.real(d[campo])}\nvotos: ${formata.numero(d.votos)}`
          + `\nR$ por voto: ${formata.porVoto(d[campo] / d.votos)}\n${d.eleito ? 'eleito' : 'não eleito'}`,
      }),
      ...(destaque == null ? [] : [
        Plot.dot(comAmbos.filter(c => c.pid === destaque), { x: campo, y: 'votos', r: 9, stroke: COR.tecla, strokeWidth: 2.5, fill: 'none' }),
        Plot.text(comAmbos.filter(c => c.pid === destaque), { x: campo, y: 'votos', text: d => nomeDe(d), dy: -16, fontWeight: 800,
          stroke: COR.urna, strokeWidth: 4, paintOrder: 'stroke', fill: COR.tecla }),
      ]),
    ],
  }));
  const fora = [semVotos ? `${formata.numero(semVotos)} com ${ROTULO_CAMPO[campo]} e sem votos registrados (em geral, candidaturas indeferidas)` : '',
    semDinheiro ? `${formata.numero(semDinheiro)} sem ${ROTULO_CAMPO[campo]} declarado` : ''].filter(Boolean);
  caixa.insertAdjacentHTML('beforeend', `<p class="legenda-grafico"><span class="chave" style="--cor:${COR.vitoria}">eleito</span>
    <span class="chave" style="--cor:#cbbd9d">não eleito</span>${fora.length ? `<span>Fora do gráfico: ${fora.join('; ')}.</span>` : ''}</p>`);
  return caixa;
}

// ---------------------------------------------------------------- cartão de político

/** O santinho de um candidato: gasto, votos, custo por voto e resultado; com foto e link para a
 *  carreira quando é dos seis estados ou presidente, anônimo nos outros casos. */
export function cartaoPolitico(c) {
  // gastos de dezenas de milhões não cabem inteiros ao lado da foto: o número grande vai abreviado, e o exato numa linha
  const abreviado = c.despesa >= 1e7;
  const linhas = [
    ...(abreviado ? [['Gasto exato', formata.real(c.despesa)]] : []),
    ['Partido', c.sigla],
    ['Votos', c.votos > 0 ? formata.numero(c.votos) : 'sem votos'],
    ...(c.votos_2t ? [['Votos no 2º turno', formata.numero(c.votos_2t)]] : []),
    ['Custo por voto', c.custoPorVoto == null ? 'sem votos ou sem gasto' : formata.porVoto(c.custoPorVoto)],
    ['Resultado', c.eleito ? 'eleito' : '× não eleito'],
  ];
  return santinho({
    faixa: `${minusculo(c.cargo)} · ${c.ano}`,
    nome: c.nomeado ? c.nome : 'Candidato de outro estado',
    numero: c.despesa > 0 ? (abreviado ? abreviaReais(c.despesa) : formata.real(c.despesa)) : '—',
    rotulo: c.despesa > 0 ? 'de gasto de campanha.' : 'Sem gasto de campanha declarado.',
    linhas,
    foto: c.nomeado ? fotoCandidato(c.foto, 'santinho-foto') : '',
    classe: c.eleito ? '' : 'santinho-derrota',
  }) + (c.pid ? `<a class="botao cartao-carreira" href="pergunta-10.html#${c.pid}">Ver a carreira</a>`
    : c.nomeado ? '' : '<p class="apoio">Candidato de fora dos seis estados do projeto: aparece sem nome, foto ou carreira.</p>');
}
