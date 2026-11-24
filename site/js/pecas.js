// Peças que as páginas das perguntas dividem: o seletor de recorte (ano, cargo, lugar), a leitura
// dos candidatos de um recorte, o gráfico de dinheiro × votos e o cartão de um político.
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/+esm';
import { carregaDados, formata, santinho, fotoCandidato, NOME_UF, em } from './comum.js?v=20261170';
import { custoPorVoto, spearman, descreveCorrelacao, abreviaReais } from './lib/dinheiro.js?v=20261170';
import { leRecorte, escreveRecorte, cargosDoAno, ajustaLugar, MUNICIPAIS } from './lib/recorte.js?v=20261170';
import { COR } from './lib/cores.js?v=20261170';
import { registraRecortes } from './oraculo.js?v=20261170';

// as 27 UFs, em ordem de sigla
export const UFS_PROJETO = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI',
  'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
// as UFs com eleição municipal: o Distrito Federal não tem prefeito nem vereador
export const UFS_MUNICIPAIS = UFS_PROJETO.filter(u => u !== 'DF');
// a capital de cada estado, o município aberto quando a página precisa de um (o DF não tem municípios com eleição)
export const CAPITAIS = { AC: '01392', AL: '27855', AM: '02550', AP: '06050', BA: '38490', CE: '13897', ES: '57053',
  GO: '93734', MA: '09210', MG: '41238', MS: '90514', MT: '90670', PA: '04278', PB: '20516', PE: '25313', PI: '12190',
  PR: '75353', RJ: '60011', RN: '17612', RO: '00035', RR: '03018', RS: '88013', SC: '81051', SE: '31054', SP: '71072',
  TO: '73440' };
// o nome de cada estado com a preposição: "os municípios da Paraíba", "do Amapá", "de Minas Gerais"
export const DA_UF = Object.fromEntries(UFS_PROJETO.map(u => {
  const nome = NOME_UF[u];
  const artigo = em(nome).split(' ')[0];
  return [u, `${artigo === 'na' ? 'da' : artigo === 'no' ? 'do' : 'de'} ${nome}`];
}));
const minusculo = c => c.toLowerCase();

// ---------------------------------------------------------------- seletor de recorte

/** Troca os filhos de `caixa` pelos do `html` novo, mas mantém no lugar cada fileira de teclas que continua com as
 *  mesmas opções (só a marcada muda). Redesenhar a fileira inteira trocaria a tecla clicada por uma nova no meio da
 *  animação de apertar, e a animação seria cortada. */
export function trocaMantendoTeclas(caixa, html) {
  const molde = document.createElement('template');
  molde.innerHTML = html.trim();
  const novos = [...molde.content.children];
  novos.forEach((novo, i) => {
    const velho = caixa.children[i];
    const igual = velho?.dataset.opcoes && velho.dataset.opcoes === novo.dataset.opcoes;
    if (igual) {
      const marcada = novo.querySelector('input:checked')?.value;
      velho.querySelectorAll('input').forEach(entrada => { entrada.checked = entrada.value === marcada; });
    } else if (velho) velho.replaceWith(novo);
    else caixa.append(novo);
  });
  while (caixa.children.length > novos.length) caixa.lastElementChild.remove();
}

/** Uma fileira de teclas, uma por opção, para escolher uma só (botões de rádio com cara de tecla). A fileira tem
 *  o rótulo à esquerda; cada tipo de escolha fica na sua. `opcoes`: [[valor, texto]]; `atual`: o valor marcado. */
export function grupoOpcoes(nome, rotulo, opcoes, atual, { extra = '', classe = '' } = {}) {
  const id = `rotulo-${nome}`;
  // data-opcoes diz quais teclas a fileira tem: com as mesmas, trocaMantendoTeclas a mantém no lugar
  const assinatura = `${nome}:${opcoes.map(([v, t]) => `${v}=${t}`).join('|')}`.replace(/"/g, '&quot;');
  return `<div class="grupo-opcoes ${classe}" role="radiogroup" aria-labelledby="${id}" data-opcoes="${assinatura}">
    <span class="grupo-rotulo" id="${id}">${rotulo}</span>
    <div class="pergunta teclas-opcoes">${opcoes.map(([v, t]) => `<label><input type="radio" name="${nome}" value="${v}"${String(v) === String(atual) ? ' checked' : ''}>${t}</label>`).join('')}${extra}</div>
  </div>`;
}

/** Uma lista suspensa para escolher uma opção (onde há opções demais para teclas, como os 27 estados), com o mesmo
 *  rótulo à esquerda das fileiras de teclas. `opcoes`: [[valor, texto]]; `atual`: o valor escolhido. */
export function grupoLista(nome, rotulo, opcoes, atual) {
  const id = `escolhe-${nome}`;
  const assinatura = `${nome}:${opcoes.map(([v, t]) => `${v}=${t}`).join('|')}`.replace(/"/g, '&quot;');
  return `<div class="grupo-opcoes" data-opcoes="${assinatura}"><label class="grupo-rotulo" for="${id}">${rotulo}</label>
    <span class="campo"><select name="${nome}" id="${id}">${opcoes.map(([v, t]) => `<option value="${v}"${String(v) === String(atual) ? ' selected' : ''}>${t}</option>`).join('')}</select></span></div>`;
}

/** Monta os seletores de ano, cargo e (se pedido) lugar dentro de `form`, lê o recorte do endereço,
 *  grava o recorte no endereço a cada mudança e chama aoMudar(recorte). Devolve { recorte(), muda(novo) }.
 *  O lugar é sempre um dos 27 estados (em ano municipal, um dos 26 com municípios); presidente é a única eleição
 *  nacional e não tem lugar. opcoes: { anos, cargos?: string[] (filtra os do ano), comLugar,
 *  padrao: {ano, cargo, uf?, mun?}, municipioObrigatorio: sem a opção "todo o estado" para prefeito e
 *  vereador, que abrem na capital }. */
// as contas de campanha de 2026 ainda não estavam completas quando os dados foram gerados: o prazo das contas finais
// vai até o começo de novembro de 2026
export const AVISO_CONTAS_2026 = ano => (ano === 2026 ? 'Contas de campanha de 2026 ainda incompletas: o TSE recebe as contas '
  + 'finais até o começo de novembro, e os gastos e receitas daqui são os declarados até 29/10/2026.' : '');

/** aviso(ano): um texto que aparece no seletor para aquele ano (vazio, nada). */
export function montaSeletor(form, { anos, cargos, comLugar = true, padrao, aoMudar, municipioObrigatorio = false, aviso = () => '' }) {
  const ufPadrao = UFS_MUNICIPAIS.includes(padrao.uf) ? padrao.uf : 'MG';
  // no DF o deputado distrital ocupa o lugar do estadual: a página que aceita um aceita o outro
  const aceito = c => !cargos || cargos.includes(c) || (c === 'DEPUTADO DISTRITAL' && cargos.includes('DEPUTADO ESTADUAL'));
  const cargosValidos = (ano, uf) => cargosDoAno(ano, uf).filter(aceito);
  const ufsDoAno = ano => (ano % 4 === 0 ? UFS_MUNICIPAIS : UFS_PROJETO);
  const ufs = [...UFS_PROJETO].sort((a, b) => NOME_UF[a].localeCompare(NOME_UF[b]));
  const ajusta = novo => {
    // o cargo "estadual" troca de nome com o estado (distrital no DF), e o DF sai dos anos municipais
    if (novo.uf && !ufsDoAno(novo.ano).includes(novo.uf)) { delete novo.uf; delete novo.mun; }
    if (novo.cargo === 'DEPUTADO DISTRITAL' && novo.uf && novo.uf !== 'DF') novo.cargo = 'DEPUTADO ESTADUAL';
    if (novo.cargo === 'DEPUTADO ESTADUAL' && novo.uf === 'DF') novo.cargo = 'DEPUTADO DISTRITAL';
    if (!cargosValidos(novo.ano, novo.uf).includes(novo.cargo)) novo.cargo = cargosValidos(novo.ano, novo.uf)[0];
    const certo = ajustaLugar(novo, ufsDoAno(novo.ano), ufPadrao);
    if (municipioObrigatorio && MUNICIPAIS.includes(certo.cargo) && !certo.mun) certo.mun = CAPITAIS[certo.uf];
    for (const k of Object.keys(certo)) if (certo[k] === undefined) delete certo[k];
    return certo;
  };
  let r = ler();

  function ler() {
    const bruto = new URLSearchParams(location.hash.slice(1));
    const ano = anos.includes(Number(bruto.get('ano'))) ? Number(bruto.get('ano')) : padrao.ano;
    return ajusta(leRecorte(location.hash, { ...padrao, ano }, { anos, cargos: [...new Set([...cargosValidos(ano), ...cargosValidos(ano, 'DF')])], ufs }));
  }

  async function desenha() {
    const municipios = r.uf && MUNICIPAIS.includes(r.cargo)
      ? Object.entries((await carregaDados(`mapa/municipios/${r.uf}.json`)).municipios).sort((a, b) => a[1].nome.localeCompare(b[1].nome))
      : [];
    trocaMantendoTeclas(form, `
      ${grupoOpcoes('ano', 'Ano', anos.map(a => [a, a]), r.ano)}
      ${grupoOpcoes('cargo', 'Cargo', cargosValidos(r.ano, r.uf).map(c => [c, minusculo(c)]), r.cargo)}
      ${comLugar && r.cargo !== 'PRESIDENTE' ? grupoLista('uf', 'Estado', ufs.filter(u => ufsDoAno(r.ano).includes(u)).map(u => [u, NOME_UF[u]]), r.uf) : ''}
      ${comLugar && r.cargo === 'PRESIDENTE' ? '<div class="grupo-opcoes"><span class="grupo-rotulo">Lugar</span><span class="seletor-nota">eleição nacional: o Brasil inteiro</span></div>' : ''}
      ${municipios.length ? `<div class="grupo-opcoes"><label class="grupo-rotulo" for="escolhe-mun">Município</label>
        <span class="campo"><select name="mun" id="escolhe-mun">${municipioObrigatorio ? '' : '<option value="">todo o estado</option>'}${municipios.map(([cod, m]) => `<option value="${cod}"${cod === r.mun ? ' selected' : ''}>${m.nome}</option>`).join('')}</select></span></div>` : ''}
      ${aviso(r.ano) ? `<p class="seletor-aviso" role="note">${aviso(r.ano)}</p>` : ''}`);
  }

  async function aplica(novo) {
    r = ajusta(novo);
    history.replaceState(null, '', `#${escreveRecorte(r)}`);
    const foco = form.contains(document.activeElement) ? document.activeElement.name : null;
    await desenha();
    // as teclas são redesenhadas: o foco volta para a escolhida do mesmo grupo
    if (foco) form.querySelector(`[name="${foco}"]:checked, select[name="${foco}"]`)?.focus();
    await aoMudar(r);
    return r;
  }

  form.addEventListener('change', e => {
    const novo = { ...r, [e.target.name]: e.target.name === 'ano' ? Number(e.target.value) : e.target.value || undefined };
    if (e.target.name === 'uf') delete novo.mun;
    aplica(novo);
  });
  addEventListener('hashchange', () => aplica(ler()));
  aplica(r);
  // o oráculo pode mudar o recorte pela pergunta do leitor ("presidente em 2026"): o lugar novo substitui o velho
  const soRecorte = x => Object.fromEntries(['ano', 'cargo', 'uf', 'mun'].filter(k => x[k] != null).map(k => [k, x[k]]));
  registraRecortes({
    opcoes: { anos, cargosDoAno: cargosValidos, lugar: comLugar ? 'mun' : null },
    atual: () => soRecorte(r),
    aplica: async novo => {
      const base = { ...r };
      delete base.uf; delete base.mun;
      return soRecorte(await aplica({ ...base, ...novo }));
    },
  });
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

export const nomeDe = c => (c.nomeado ? c.nome : `candidato ${c.sigla} sem nome registrado`);

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
  caixa.innerHTML = `<p class="dispersao-frase"><strong>${descreveCorrelacao(r)}</strong></p>`;
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
 *  carreira quando a pessoa tem carreira no site (quem já se elegeu e os candidatos a presidente). */
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
    nome: c.nomeado ? c.nome : 'Candidato sem nome registrado',
    numero: c.despesa > 0 ? (abreviado ? abreviaReais(c.despesa) : formata.real(c.despesa)) : '—',
    rotulo: c.despesa > 0 ? 'de gasto de campanha.' : 'Sem gasto de campanha declarado.',
    linhas,
    foto: c.nomeado ? fotoCandidato(c.foto, 'santinho-foto') : '',
    classe: c.eleito ? 'santinho-vitoria' : 'santinho-derrota',
  }) + (c.pid ? `<a class="botao cartao-carreira" href="pergunta-10.html#${c.pid}">Ver a carreira</a>`
    : '<p class="apoio">Sem carreira no site: as carreiras são de quem já se elegeu e dos candidatos a presidente.</p>');
}
