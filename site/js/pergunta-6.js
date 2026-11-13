// Pergunta 6: idade e alternância. No mini mapa, o leitor escolhe um município (ou um estado, ou os seis juntos). A faixa
// de prefeito passa de mão em mão: cada prefeito eleito de 2000 a 2024 é uma faixa na cor da posição do partido, e entre
// uma e outra aparece o que mudou. As ampulhetas comparam os municípios mais jovens e os mais velhos (pela mediana da
// idade, Censo 2022): a idade dos prefeitos eleitos em 2020 e 2024 e quantas vezes o partido ou a pessoa mudou. A régua
// de idades põe lado a lado a idade média de quem foi votar e a de quem se elegeu vereador e prefeito.
//
// Dados: idade/idade.json (perfil etário dos municípios, prefeitos de 2000 a 2024, notas dos partidos e, em 2020 e 2024,
// a idade média de quem foi votar e a dos eleitos para prefeito e vereador, por município).
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { montaPagina, carregaDados, formata, santinho, NOME_UF, registraRetrato, fotoCandidato } from './comum.js?v=20261161';
import { grupoOpcoes, trocaMantendoTeclas, DA_UF } from './pecas.js?v=20261161';
import { comparacao } from './lib/retrato.js?v=20261161';
import { corIdeologia } from './lib/cores.js?v=20261161';
import { trocas, alternancia, mediaPonderada, diferencaDeIdade } from './lib/idade.js?v=20261161';
import { criaMapaDeLugares, PROJETO } from './mapa-lugares.js?v=20261161';

montaPagina();

const ida = await carregaDados('idade/idade.json');
const MUNICIPIOS = ida.municipios.map(([cod, nome, uf, idade, envelhecimento], i) => ({ cod, nome, uf, idade, envelhecimento, i }));
const POR_COD = new Map(MUNICIPIOS.map(m => [m.cod, m]));
// a régua de mais jovem e mais velho: a mediana das idades medianas dos 1.238 municípios (como a p06a)
const MEDIANA = d3.median(MUNICIPIOS, m => m.idade);
const ehVelho = m => m.idade >= MEDIANA;
const SEIS = 'SEIS';
const PADRAO = { ano: 2024, lugar: '20516' };      // João Pessoa
const ANOS_ALTERNANCIA = [2020, 2024];
const virgula = (v, casas = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const C = Object.fromEntries(ida.campos_prefeito.map((n, i) => [n, i]));

/** Os prefeitos de um município em ordem de eleição, como objetos. */
function prefeitosDe(cod) {
  return (ida.prefeitos[cod] ?? []).map(l => {
    const [sigla, numero] = ida.partidos[l[C.partido]];
    return { ano: l[C.ano], nome: l[C.nome] ?? null, pid: l[C.pid] ?? null, partido: l[C.partido], sigla, numero,
      idade: l[C.idade] ?? null, foto: l[C.foto] ?? null, nota: ida.notas[l[C.ano]]?.[sigla] ?? null };
  });
}

let estado = { ...PADRAO, prefeito: null };
const form = document.getElementById('recorte');
const ufDoLugar = lugar => (lugar === SEIS ? null : POR_COD.get(lugar)?.uf ?? lugar);
const nomeDoLugar = lugar => (lugar === SEIS ? 'Os seis estados' : POR_COD.has(lugar)
  ? `${POR_COD.get(lugar).nome} (${POR_COD.get(lugar).uf})` : NOME_UF[lugar]);
const doLugar = () => MUNICIPIOS.filter(m => !ufDoLugar(estado.lugar) || m.uf === ufDoLugar(estado.lugar));

function leEndereco() {
  const p = new URLSearchParams(location.hash.slice(1));
  const ano = Number(p.get('ano'));
  estado.ano = ida.anos.includes(ano) ? ano : PADRAO.ano;
  const lugar = p.get('lugar');
  estado.lugar = lugar === SEIS || PROJETO.has(lugar) || POR_COD.has(lugar) ? lugar : PADRAO.lugar;
}
const escreveEndereco = () => history.replaceState(null, '', `#${new URLSearchParams({ ano: estado.ano, lugar: estado.lugar })}`);

function montaSeletor() {
  trocaMantendoTeclas(form, `
    ${grupoOpcoes('ano', 'Ano', ida.anos.map(a => [a, a]), estado.ano)}`);
}

form.addEventListener('change', e => {
  if (e.target.name === 'ano') estado.ano = Number(e.target.value);
  atualiza();
});

// ---------------------------------------------------------------- o mini mapa

const miniMapa = criaMapaDeLugares({ caixa: document.getElementById('mini-mapa'), chaveSessao: 'mini-mapa-idade',
  aoEscolher: escolheNoMapa, plano: true, larguraMax: 260 });

function escolheNoMapa(k, vista) {
  if (vista === 'UF') estado.lugar = k === estado.lugar ? ufDoLugar(k) : k;
  else estado.lugar = k;
  estado.prefeito = null;
  atualiza();
}

function desenhaMiniMapa() {
  const uf = ufDoLugar(estado.lugar);
  const lugares = uf ? MUNICIPIOS.filter(m => m.uf === uf).map(m => ({ chave: m.cod, nome: m.nome, idade: m.idade }))
    : Object.keys(NOME_UF).map(u => ({ chave: u, nome: NOME_UF[u], idade: null }));
  const porChave = new Map(lugares.map(l => [l.chave, {
    cor: uf ? '#cdb98c' : PROJETO.has(l.chave) ? '#b49a63' : '#d6c9ad',
    titulo: `${l.nome}${l.idade == null ? (!uf && !PROJETO.has(l.chave) ? ' · fora dos seis estados do projeto' : '') : `: idade mediana de ${virgula(l.idade)} anos`}` }]));
  miniMapa.desenha({ vista: uf ? 'UF' : 'BR', uf, escolhido: POR_COD.has(estado.lugar) ? estado.lugar : null, porChave });
  document.getElementById('lugar-atual').textContent = nomeDoLugar(estado.lugar);
  document.getElementById('dica-mini').textContent = !uf ? 'Clique num dos seis estados do projeto (contorno escuro).'
    : POR_COD.has(estado.lugar) ? 'Clique em outro município, ou de novo neste para ver o estado inteiro.'
      : 'Clique num município para ver os prefeitos dele.';
  const voltar = document.getElementById('voltar-lugar');
  voltar.hidden = !uf;
  voltar.textContent = POR_COD.has(estado.lugar) ? 'Ver o estado inteiro' : 'Voltar aos seis estados';
}

document.getElementById('voltar-lugar').addEventListener('click', () => {
  estado.lugar = POR_COD.has(estado.lugar) ? ufDoLugar(estado.lugar) : SEIS;
  estado.prefeito = null;
  atualiza();
});

// ---------------------------------------------------------------- a faixa de prefeito

const nomeCurto = nome => {
  if (!nome) return 'sem nome no banco';
  const partes = nome.split(' ');
  return partes.length > 2 ? `${partes[0]} ${partes.at(-1)}` : nome;
};
const SINAL_TROCA = t => (t.partido && t.pessoa ? 'mudou o partido e a pessoa' : t.partido ? 'mesma pessoa, outro partido'
  : t.pessoa ? 'mesmo partido, outra pessoa' : t.pessoa == null ? 'mesmo partido' : 'reeleito');

function desenhaFaixas() {
  const m = POR_COD.get(estado.lugar);
  const titulo = document.getElementById('t-faixas');
  const caixa = document.getElementById('faixas');
  if (!m) {
    titulo.innerHTML = 'A faixa de prefeito';
    caixa.innerHTML = '<p class="aviso-vazio">Escolha um município no mini mapa para ver os prefeitos dele, de 2000 a 2024.</p>';
    document.getElementById('prefeito-cartao').innerHTML = '';
    document.getElementById('santinho-idade').innerHTML = '';
    return;
  }
  const lista = prefeitosDe(m.cod);
  const ts = trocas(lista);
  titulo.innerHTML = `<span class="sobre">${m.nome} (${m.uf}) · prefeitos de 2000 a 2024</span>A faixa de prefeito`;
  caixa.innerHTML = `<ol class="faixas">${lista.map((x, i) => `${i ? `<li class="troca${ts[i - 1].partido || ts[i - 1].pessoa ? ' mudou' : ''}" aria-label="${SINAL_TROCA(ts[i - 1])}">
      <span>${ts[i - 1].partido || ts[i - 1].pessoa ? '⇄' : '='}</span><small>${SINAL_TROCA(ts[i - 1])}</small></li>` : ''}
    <li class="faixa-item" style="--i:${i}"><button type="button" class="faixa" data-i="${i}" aria-pressed="${estado.prefeito === i}"
      style="--cor:${corIdeologia(x.nota)}" title="${x.nome ?? ''} (${x.sigla}), eleito em ${x.ano}">
      <b>${x.ano}</b><span class="faixa-sigla">${x.sigla}</span><span class="faixa-nome">${nomeCurto(x.nome)}</span>
      <span class="faixa-idade">${x.idade == null ? '' : `${x.idade} anos`}</span></button></li>`).join('')}</ol>`;
  const escolhido = estado.prefeito == null ? null : lista[estado.prefeito];
  document.getElementById('prefeito-cartao').innerHTML = escolhido ? cartaoPrefeito(escolhido, m) : '';
  desenhaSantinho(m, lista, ts);
}

function cartaoPrefeito(x, m) {
  return `<article class="mini-cartao">
    <header>${fotoCandidato(x.foto, 'mini-cartao-foto')}<div><b>${x.nome ?? 'Prefeito sem nome no banco'}</b>
      <span>${x.sigla} · prefeito de ${m.nome} · eleito em ${x.ano}</span></div></header>
    <dl>
      <div><dt>Idade na posse</dt><dd>${x.idade == null ? 'sem dado' : `${x.idade} anos`}</dd></div>
      <div><dt>Idade mediana do município (2022)</dt><dd>${virgula(m.idade)} anos</dd></div>
      <div><dt>Posição do partido (0 esquerda, 10 direita)</dt><dd>${x.nota == null ? 'sem nota' : virgula(x.nota, 2)}</dd></div>
    </dl>
    ${x.pid ? `<a class="botao" href="pergunta-10.html#${x.pid}">Ver a carreira</a>` : ''}
  </article>`;
}

document.getElementById('faixas').addEventListener('click', e => {
  const b = e.target.closest('.faixa');
  if (!b) return;
  const i = Number(b.dataset.i);
  estado.prefeito = estado.prefeito === i ? null : i;
  desenhaFaixas();
});

function desenhaSantinho(m, lista, ts) {
  const partido = ts.filter(t => t.partido).length, pessoa = ts.filter(t => t.pessoa).length;
  const idades = lista.map(x => x.idade).filter(v => v != null);
  document.getElementById('santinho-idade').innerHTML = santinho({
    faixa: 'idade · Censo 2022', nome: `${m.nome} (${m.uf})`,
    numero: `${virgula(m.idade)} anos`,
    rotulo: `de idade mediana: ${ehVelho(m) ? 'mais velho' : 'mais jovem'} que a mediana dos 1.238 municípios (${virgula(MEDIANA)} anos).`,
    linhas: [
      ['Prefeitos eleitos de 2000 a 2024', formata.numero(lista.length)],
      ['Vezes em que o partido mudou', `${partido} de ${ts.length}`],
      ['Vezes em que a pessoa mudou', `${pessoa} de ${ts.filter(t => t.pessoa != null).length}`],
      ['Idade média dos prefeitos na posse', idades.length ? `${virgula(d3.mean(idades))} anos` : '—'],
    ],
    verso: `<p>A idade mediana é a do Censo 2022: metade dos moradores tem menos que ela. O município é "mais velho" se ela
      está na mediana dos 1.238 municípios dos seis estados ou acima dela.</p>
      <p>O Censo de 2022 é posterior às eleições de 2018 e 2020. O índice de envelhecimento do Censo 2010 (idosos por 100
      crianças) dá a medida anterior: ${m.envelhecimento == null ? 'sem dado neste município' : `${virgula(m.envelhecimento)} em ${m.nome}`}.</p>
      <p>Trocas: cada eleição comparada com a anterior do mesmo município; a troca de pessoa só conta quando se sabe
      quem era o prefeito anterior.</p>`,
    fonte: 'p06a_alternancia.sql',
  });
}

// ---------------------------------------------------------------- as ampulhetas

function grupos() {
  const ms = doLugar();
  const de = lista => alternancia(lista.map(m => prefeitosDe(m.cod)), ANOS_ALTERNANCIA);
  return { jovens: de(ms.filter(m => !ehVelho(m))), velhos: de(ms.filter(ehVelho)) };
}

/** Uma ampulheta: a areia de baixo é a parcela de eleições com troca de partido. */
function ampulheta(pct) {
  const p = (pct ?? 0) / 100;
  // a areia de cima é um triângulo com a ponta no gargalo; a de baixo, um trapézio que sobe do fundo. As alturas saem
  // das áreas: no bulbo de cima, a área cresce com o quadrado da altura; no de baixo, a parte vazia é que é o triângulo
  const t = 70 * Math.sqrt(1 - p), h = 70 - 70 * Math.sqrt(1 - p);
  return `<svg viewBox="0 0 120 170" class="ampulheta-svg" aria-hidden="true">
    <rect x="8" y="2" width="104" height="9" rx="3" class="ampulheta-tampa"/><rect x="8" y="159" width="104" height="9" rx="3" class="ampulheta-tampa"/>
    <polygon points="${60 - (t * 46) / 70},${85 - t} ${60 + (t * 46) / 70},${85 - t} 60,85" class="ampulheta-areia"/>
    <polygon points="${60 - 46},157 ${60 + 46},157 ${60 + 46 - (46 * h) / 70},${157 - h} ${60 - 46 + (46 * h) / 70},${157 - h}" class="ampulheta-areia"/>
    ${p > 0 && p < 1 ? '<line x1="60" y1="85" x2="60" y2="155" class="ampulheta-fio"/>' : ''}
    <path d="M14 13 L106 13 L66 85 L106 157 L14 157 L54 85 Z" class="ampulheta-vidro"/>
  </svg>`;
}

function desenhaAmpulhetas() {
  const { jovens, velhos } = grupos();
  const m = POR_COD.get(estado.lugar);
  const uf = ufDoLugar(estado.lugar);
  document.getElementById('t-ampulhetas').innerHTML = `<span class="sobre">${uf ? `os municípios ${DA_UF[uf]}` : 'os 1.238 municípios dos seis estados'} · eleições de 2020 e 2024</span>Municípios jovens trocam mais de prefeito?`;
  const cartao = (g, nome, velho) => `<figure class="ampulheta${m && ehVelho(m) === velho ? ' atual' : ''}">
    ${ampulheta(g.partido)}
    <figcaption><b>${nome}</b><small>idade mediana ${velho ? `de ${virgula(MEDIANA)} anos ou mais` : `abaixo de ${virgula(MEDIANA)} anos`} ·
      ${formata.numero(g.municipios)} municípios${m && ehVelho(m) === velho ? ` · inclui ${m.nome}` : ''}</small>
      <dl><div><dt>Trocou de partido</dt><dd>${g.partido == null ? '—' : formata.pct(g.partido)}</dd></div>
        <div><dt>Trocou de pessoa</dt><dd>${g.pessoa == null ? '—' : formata.pct(g.pessoa)}</dd></div>
        <div><dt>Idade média dos prefeitos</dt><dd>${g.idade == null ? '—' : `${virgula(g.idade)} anos`}</dd></div></dl></figcaption>
  </figure>`;
  document.getElementById('ampulhetas').innerHTML = cartao(jovens, 'Os mais jovens', false) + cartao(velhos, 'Os mais velhos', true);
  document.getElementById('frase-ampulhetas').innerHTML = jovens.partido == null || velhos.partido == null ? ''
    : `O partido do prefeito mudou em <strong>${formata.pct(jovens.partido)}</strong> das eleições nos municípios mais jovens e em
      <strong>${formata.pct(velhos.partido)}</strong> nos mais velhos; a pessoa, em ${formata.pct(jovens.pessoa ?? 0)} e
      ${formata.pct(velhos.pessoa ?? 0)}. Os prefeitos tinham, em média, ${virgula(jovens.idade)} e ${virgula(velhos.idade)} anos.`;
}

// ---------------------------------------------------------------- quem é eleito tem a idade de quem vota?

const CARGOS = [
  { cargo: 'VEREADOR', nome: 'Vereadores eleitos', um: 'Vereador eleito', cor: 'var(--ouro-escuro)', corTexto: '#7a5718' },
  { cargo: 'PREFEITO', nome: 'Prefeitos eleitos', um: 'Prefeito eleito', cor: 'var(--veludo)', corTexto: 'var(--veludo)' },
];
const EM_UF = { AP: 'No Amapá', MG: 'Em Minas Gerais', MS: 'Em Mato Grosso do Sul', PB: 'Na Paraíba', RO: 'Em Rondônia', RR: 'Em Roraima' };
const anos = (v, casas = 1) => `${virgula(v, casas)} ${Math.abs(v) < 2 ? 'ano' : 'anos'}`;

/** O prefeito eleito no município no ano (o último, se houve eleição suplementar), para dar nome à idade dele. */
const prefeitoDoAno = (cod, ano) => prefeitosDe(cod).filter(x => x.ano === ano).at(-1) ?? null;

/** A régua do lugar no ano: a idade média de quem foi votar e, por cargo, a dos eleitos, a diferença e, com mais de um
 *  município, em quantos os eleitos são mais velhos que quem votou. */
function regua() {
  const r = ida.regua[estado.ano];
  // um município escolhido é só ele; as ampulhetas, ao contrário, usam o estado inteiro
  const ms = POR_COD.has(estado.lugar) ? [POR_COD.get(estado.lugar)] : doLugar();
  const votantes = mediaPonderada(ms.map(m => r.votantes[m.i]));
  const cargos = CARGOS.map(c => {
    const e = mediaPonderada(ms.map(m => r[c.cargo][m.i]));
    const comDado = ms.filter(m => r[c.cargo][m.i] && r.votantes[m.i]);
    const maisVelhos = comDado.filter(m => r[c.cargo][m.i][0] > r.votantes[m.i][0]).length;
    return { ...c, media: e.media, eleitos: e.peso, municipios: comDado.length, maisVelhos,
      diferenca: e.media == null || votantes.media == null ? null : e.media - votantes.media };
  });
  return { votantes: votantes.media, quemVotou: votantes.peso, municipios: votantes.lugares, cargos };
}

function desenhaRegua() {
  const g = regua();
  const m = POR_COD.get(estado.lugar);
  const uf = ufDoLugar(estado.lugar);
  document.getElementById('t-regua').innerHTML = `<span class="sobre">${m ? `${m.nome} (${m.uf})` : uf ? NOME_UF[uf] : 'os seis estados'} · eleição de ${estado.ano}</span>Quem é eleito tem a idade de quem vota?`;
  const caixa = document.getElementById('regua-idades'), frase = document.getElementById('frase-regua');
  if (g.votantes == null) {
    caixa.innerHTML = '<p class="aviso-vazio">Sem a idade de quem votou neste lugar em ' + estado.ano + '.</p>';
    frase.innerHTML = '';
    return;
  }
  // a escala: de 5 em 5 anos, com folga em volta dos três pontos e pelo menos 20 anos de largura
  const valores = [g.votantes, ...g.cargos.map(c => c.media).filter(v => v != null)];
  let lo = Math.floor((Math.min(...valores) - 3) / 5) * 5, hi = Math.ceil((Math.max(...valores) + 3) / 5) * 5;
  while (hi - lo < 20) { hi += 5; if (hi - lo < 20) lo -= 5; }
  const pos = v => (100 * (v - lo)) / (hi - lo);
  const pv = pos(g.votantes);
  const borda = pv < 12 ? ' na-borda-esq' : pv > 88 ? ' na-borda-dir' : '';
  const linha = `<i class="regua-linha" style="left:${pv}%"></i>`;
  const filaCargo = c => {
    const p = m && c.cargo === 'PREFEITO' ? prefeitoDoAno(m.cod, estado.ano) : null;
    const detalhe = c.media == null ? 'sem eleitos com idade no banco'
      : p && c.eleitos === 1 ? `${nomeCurto(p.nome)} (${p.sigla}), ${virgula(c.media, 0)} anos na posse`
        : `${formata.numero(c.eleitos)} eleitos · média de ${virgula(c.media)} anos`;
    const d = c.diferenca;
    const trilho = c.media == null ? linha : `${linha}
      <i class="regua-faixa" style="left:${Math.min(pv, pos(c.media))}%;width:${Math.abs(pos(c.media) - pv)}%"></i>
      <i class="regua-ponto" style="left:${pos(c.media)}%"></i>`;
    return `<div class="regua-fila regua-cargo" style="--cor:${c.cor};--cor-texto:${c.corTexto}">
      <span class="regua-nome"><b>${c.eleitos === 1 ? c.um : c.nome}</b><small>${detalhe}</small></span>
      <span class="regua-diferenca">${d == null ? '—' : Math.round(d * 10) === 0 ? '0,0' : `${d > 0 ? '+' : '−'}${anos(Math.abs(d))}`}<small>${d == null ? '' : 'que quem votou'}</small></span>
      <span class="regua-trilho" role="img" aria-label="${c.nome}: ${c.media == null ? 'sem dado' : `${virgula(c.media)} anos, ${diferencaDeIdade(g.votantes, c.media)} que quem foi votar`}">${trilho}</span>
    </div>`;
  };
  const marcas = [];
  const passo = hi - lo > 30 ? 10 : 5;   // numa escala larga (um prefeito muito mais velho), marcas de 10 em 10
  for (let a = Math.ceil(lo / passo) * passo; a <= hi; a += passo) marcas.push(`<span style="left:${pos(a)}%"${a + passo > hi ? ' class="fim"' : ''}>${a}${a + passo > hi ? ' anos' : ''}</span>`);
  caixa.innerHTML = `
    <div class="regua-fila regua-topo"><span class="regua-trilho">
      <span class="regua-votantes${borda}" style="left:${pv}%">quem foi votar<b>${virgula(g.votantes)} anos</b></span></span></div>
    ${g.cargos.map(filaCargo).join('')}
    <div class="regua-fila regua-eixo"><span class="regua-trilho" aria-hidden="true">${marcas.join('')}</span></div>`;

  const [ver, pre] = g.cargos;
  const quem = m ? `Em ${m.nome}` : uf ? EM_UF[uf] : 'Nos seis estados';
  const textoCargo = (c, plural) => c.media == null ? `não há a idade ${plural ? 'dos' : 'do'} ${c.nome.toLowerCase()}`
    : `${virgula(c.media)} (${diferencaDeIdade(g.votantes, c.media)})`;
  let texto = `${quem}, em ${estado.ano}, quem foi votar tinha em média <strong>${virgula(g.votantes)} anos</strong>. Os vereadores eleitos tinham ${textoCargo(ver, true)}`;
  texto += m && pre.eleitos === 1 ? `; o prefeito eleito, ${textoCargo(pre)}.` : `, e os prefeitos, ${textoCargo(pre, true)}.`;
  if (!m && pre.municipios) texto += ` O prefeito eleito é mais velho que a média de quem votou em <strong>${formata.numero(pre.maisVelhos)} dos ${formata.numero(pre.municipios)} municípios</strong>; a média dos vereadores eleitos, em ${formata.numero(ver.maisVelhos)}.`;
  frase.innerHTML = texto;
}

// ---------------------------------------------------------------- ciclo

function atualiza() {
  escreveEndereco();
  montaSeletor();
  desenhaMiniMapa();
  desenhaFaixas();
  desenhaAmpulhetas();
  desenhaRegua();
}

leEndereco();
atualiza();
addEventListener('hashchange', () => { leEndereco(); atualiza(); });

// ---------------------------------------------------------------- o retrato para o oráculo

/** O que a página mostra agora: os prefeitos do município, as ampulhetas com as comparações prontas e a régua de idades
 *  (quem foi votar e os eleitos). */
registraRetrato(() => {
  const m = POR_COD.get(estado.lugar);
  const lista = m ? prefeitosDe(m.cod) : [];
  const ts = trocas(lista);
  const { jovens, velhos } = grupos();
  const g = regua();
  const uf = ufDoLugar(estado.lugar);
  const lugarRegua = m ? `${m.nome} (${m.uf})` : uf ? `os municípios ${DA_UF[uf]}` : 'os 1.238 municípios dos seis estados';
  const linhaCargo = c => {
    if (c.media == null) return [c.nome, 'sem dado'];
    const p = m && c.cargo === 'PREFEITO' && c.eleitos === 1 ? prefeitoDoAno(m.cod, estado.ano) : null;
    return [p ? `${c.um} (${p.nome ?? 'sem nome'}, ${p.sigla})` : `${c.nome} (${formata.numero(c.eleitos)})`,
      `${p ? '' : 'média de '}${virgula(c.media)} anos na posse: ${diferencaDeIdade(g.votantes, c.media)} que quem foi votar`
      + (!m && c.municipios ? `; ${c.cargo === 'PREFEITO' ? 'o prefeito eleito é mais velho' : 'a média dos vereadores eleitos é maior'} que a de quem votou em ${c.maisVelhos} dos ${c.municipios} municípios` : '')];
  };
  return {
    numero: 6, pergunta: 'Cidade jovem troca mais de prefeito?',
    recorte: `${nomeDoLugar(estado.lugar)} · régua de idades: eleição de ${estado.ano}`,
    secoes: [
      ...(m ? [{ titulo: `Prefeitos de ${m.nome} (${m.uf}), de 2000 a 2024; idade mediana do município ${virgula(m.idade)} anos (${ehVelho(m) ? 'mais velho' : 'mais jovem'} que a mediana dos 1.238, ${virgula(MEDIANA)} anos)`,
        linhas: lista.map((x, i) => [String(x.ano), `${x.nome ?? 'sem nome'} (${x.sigla}${x.nota == null ? '' : `, nota ${virgula(x.nota, 2)}`}), ${x.idade == null ? 'idade sem dado' : `${x.idade} anos na posse`}${i ? `; ${SINAL_TROCA(ts[i - 1])}` : ''}`]) }] : []),
      { titulo: `Ampulhetas: ${uf ? `municípios ${DA_UF[uf]}` : 'os 1.238 municípios'} mais jovens e mais velhos (mediana de ${virgula(MEDIANA)} anos), eleições de prefeito de 2020 e 2024`,
        linhas: [['Mais jovens', `${jovens.municipios} municípios; trocou de partido ${formata.pct(jovens.partido ?? 0)}, trocou de pessoa ${formata.pct(jovens.pessoa ?? 0)}, idade média dos prefeitos ${jovens.idade == null ? '—' : virgula(jovens.idade)} anos`],
          ['Mais velhos', `${velhos.municipios} municípios; trocou de partido ${formata.pct(velhos.partido ?? 0)}, trocou de pessoa ${formata.pct(velhos.pessoa ?? 0)}, idade média dos prefeitos ${velhos.idade == null ? '—' : virgula(velhos.idade)} anos`]] },
      { titulo: 'Comparações prontas (calculadas pela página)', linhas: [
        ['Troca de partido nos mais jovens em relação aos mais velhos', comparacao(jovens.partido, velhos.partido)],
        ['Troca de pessoa nos mais jovens em relação aos mais velhos', comparacao(jovens.pessoa, velhos.pessoa)],
        ['Idade dos prefeitos nos mais jovens em relação aos mais velhos', comparacao(jovens.idade, velhos.idade)],
      ] },
      { titulo: `Régua de idades: ${lugarRegua}, eleição de ${estado.ano} (idade média de quem foi votar no 1º turno e dos eleitos na posse, na mesma eleição)`,
        linhas: g.votantes == null ? [[null, 'sem a idade de quem votou']] : [
          [`Quem foi votar (${formata.numero(g.quemVotou)} pessoas)`, `média de ${virgula(g.votantes)} anos`],
          ...g.cargos.map(linhaCargo)] },
    ],
  };
});
