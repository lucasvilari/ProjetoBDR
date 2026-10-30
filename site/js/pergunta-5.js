// Pergunta 5: quem entrou pela legenda? Cada eleito é um copo cuja borda é o quociente eleitoral, o preço de uma
// cadeira em votos. Os copos ficam agrupados pela chapa (partido, coligação ou federação) que recebeu as cadeiras: os
// puxadores transbordam, e a sobra deles enche os copos dos colegas; o que ainda falta vem da jarra da chapa (votos
// dos colegas que não se elegeram e votos de legenda). Clicar num copo mostra o eleito e de onde veio cada voto.
//
// Dados: legenda/<ue>.json (eleitos, votos, quociente e os votos de cada chapa; UFs dos seis estados e seus
// municípios) e legenda/resumo.json (eleitos e eleitos pela legenda por partido, ano, cargo e UF).
import { montaPagina, carregaDados, formata, NOME_UF, em, registraRetrato } from './comum.js?v=20261156';
import { corIdeologia, contraste, COR } from './lib/cores.js?v=20261156';
import { porLegenda, resumoPorPartido, enchimento } from './lib/quociente.js?v=20261156';
import { abreviaReais } from './lib/dinheiro.js?v=20261156';
import { montaSeletor, leCandidaturas, cartaoPolitico } from './pecas.js?v=20261156';

montaPagina();

const CARGOS = ['DEPUTADO FEDERAL', 'DEPUTADO ESTADUAL', 'DEPUTADO DISTRITAL', 'VEREADOR'];
const { partidos } = await carregaDados('partidos.json');
const resumoSeis = await carregaDados('legenda/resumo.json');
const nota = (sigla, ano) => partidos.find(p => p.sigla === sigla)?.especialistas[ano <= 2020 ? '2018' : '2022'] ?? null;
const reduz = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const minusculo = c => c.toLowerCase();
// votos abreviados: "1,5 mi", "184 mil" (a abreviação de reais, sem o "R$")
const votosCurto = v => abreviaReais(v).replace('R$ ', '');
/** O primeiro e o último nome (sem "de", "da"...), como o eleitor costuma conhecer: Nikolas Ferreira de Oliveira -> Nikolas Oliveira. */
const primeiroEUltimo = n => {
  const partes = (n ?? 'eleito').split(' ');
  const ultimo = partes.slice(1).filter(p => p.length > 2).slice(-1)[0];
  return ultimo ? [partes[0], ultimo] : [partes[0]];
};
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

// ---------------------------------------------------------------- os copos

const AC = 58;   // altura do copo até a borda, que é o quociente

/** Um copo em SVG: os votos do próprio eleito (escuro), a sobra dos puxadores (médio) e a jarra da chapa (claro),
 *  de baixo para cima; o puxador transborda acima da borda; o que faltou fica tracejado. */
function svgCopo(c, id) {
  const h = v => (AC * v) / atual.q;
  const camadas = [['proprio', c.proprio], ['puxadores', c.dosPuxadores], ['chapa', c.daChapa]];
  let base = 66;
  const rects = camadas.filter(([, v]) => v > 0).map(([classe, v]) => {
    const alt = h(v); base -= alt;
    return `<rect class="liquido liquido-${classe}" x="0" y="${base.toFixed(2)}" width="40" height="${alt.toFixed(2)}"/>`;
  }).join('');
  const transborda = c.transborda > 0
    ? `<path class="liquido liquido-proprio transbordo" d="M5 8 Q20 -${Math.min(10, 3 + Math.log10(1 + c.transborda / atual.q) * 12)} 35 8 Z"/>
       <path class="liquido liquido-proprio escorre" d="M35 8 q4 1 4 6 v10 a1.6 1.6 0 0 1 -3.2 0 v-8 q0 -4 -3 -6 Z"/>` : '';
  return `<svg viewBox="-2 -14 44 82" class="copo-svg" aria-hidden="true">
    <clipPath id="vidro-${id}"><path d="M4 8 L36 8 L31 66 L9 66 Z"/></clipPath>
    <g clip-path="url(#vidro-${id})">${rects}${c.vazio > 0 ? `<line class="falta" x1="0" x2="40" y1="${base.toFixed(2)}" y2="${base.toFixed(2)}"/>` : ''}</g>
    ${transborda}
    <path class="vidro" d="M4 8 L36 8 L31 66 L9 66 Z"/>
    <path class="marca-quociente" d="M2 8 H38"/>
  </svg>`;
}

/** A jarra de uma chapa: começa com os votos dos colegas sem cadeira e de legenda e esvazia o que deu aos copos. */
function svgJarra(j) {
  const nivel = j.inicio ? j.resta / j.inicio : 0;
  // desenhada espelhada: o bico fica do lado dos copos, para onde ela se inclina
  return `<svg viewBox="0 0 48 70" class="jarra-svg" aria-hidden="true"><g transform="translate(48 0) scale(-1 1)">
    <clipPath id="jarra-${atual.chave}-${j.unidade}"><path d="M8 14 Q4 14 6 22 L8 64 Q8 68 12 68 L36 68 Q40 68 40 64 L42 22 Q44 14 40 14 Z"/></clipPath>
    <rect class="liquido liquido-chapa jarra-nivel" clip-path="url(#jarra-${atual.chave}-${j.unidade})" x="0" y="14" width="48" height="56"
      style="--nivel:${nivel.toFixed(3)}"/>
    <path class="vidro" d="M8 14 Q4 14 6 22 L8 64 Q8 68 12 68 L36 68 Q40 68 40 64 L42 22 Q44 14 40 14 Z"/>
    <path class="vidro" d="M40 22 Q50 26 46 40 Q44 46 40 46" fill="none"/>
    <path class="vidro" d="M8 14 L4 8 L14 10" fill="none"/>
  </g></svg>`;
}

function desenhaCopos(rec, unidades, ano) {
  const q = rec.quociente;
  const eleitos = rec.eleitos.map(([pid, nome, sigla, unidade, votos, situacao, foto]) => ({ pid, nome, sigla, unidade, votos, situacao, foto }));
  const chapas = (rec.chapas ?? []).map(([unidade, nominais, legenda]) => ({ unidade, nominais, legenda }));
  const { copos, jarras } = enchimento(eleitos, chapas, q);
  atual.eleitos = eleitos; atual.copos = copos;
  const grupos = [...new Set(eleitos.map(e => e.unidade))]
    .map(u => ({ u, nome: unidades[u], eleitos: eleitos.filter(e => e.unidade === u).sort((a, b) => b.votos - a.votos),
      chapa: chapas.find(c => c.unidade === u), jarra: { ...jarras.get(u), unidade: u } }))
    .sort((a, b) => b.eleitos.length - a.eleitos.length || b.eleitos[0].votos - a.eleitos[0].votos);
  return grupos.map(g => {
    const legenda = g.eleitos.filter(e => porLegenda(e, q)).length;
    // a jarra começa cheia (os copos só com os votos de cada eleito); o leitor a esvazia nos copos
    const comJarra = Boolean(g.chapa && (g.jarra.inicio || g.eleitos.some(e => copos.get(e.pid).dosPuxadores)));
    return `<section class="chapa${comJarra ? ' jarra-cheia' : ''}" data-u="${g.u}" aria-label="${g.nome}: ${g.eleitos.length} ${g.eleitos.length === 1 ? 'cadeira' : 'cadeiras'}">
      <div class="chapa-topo"><b>${g.nome}</b>
        <span class="apoio">${g.eleitos.length} ${g.eleitos.length === 1 ? 'cadeira' : 'cadeiras'}${legenda ? `, ${legenda} pela legenda` : ''}
          ${g.chapa ? ` · ${votosCurto(g.chapa.nominais + g.chapa.legenda)} votos na chapa` : ''}</span></div>
      <div class="chapa-corpo">
        ${g.chapa ? `<figure class="jarra" title="Votos dos colegas sem cadeira e de legenda: ${formata.numero(g.jarra.inicio)}; sobraram ${formata.numero(g.jarra.resta)}">
          ${svgJarra(g.jarra)}<figcaption>jarra: ${votosCurto(g.jarra.inicio)}<br><span class="apoio jarra-estado"
            data-depois="${g.jarra.resta ? `sobrou ${votosCurto(g.jarra.resta)}` : 'esvaziou'}">${comJarra ? 'cheia' : g.jarra.resta ? `sobrou ${votosCurto(g.jarra.resta)}` : 'esvaziou'}</span></figcaption>
          ${comJarra ? '<button type="button" class="botao jarra-botao" aria-pressed="false">Esvaziar a jarra</button>' : ''}</figure>` : ''}
        <ol class="fila-copos">${g.eleitos.map((e, i) => {
          const c = copos.get(e.pid);
          const cor = corIdeologia(nota(e.sigla, ano));
          return `<li style="--i:${i}"><button type="button" class="copo${porLegenda(e, q) ? ' pela-legenda' : ''}${c.transborda ? ' puxador' : ''}" data-pid="${e.pid}"
              aria-label="${e.nome ?? 'eleito'} (${e.sigla}): ${formata.numero(e.votos)} votos${c.transborda ? `, ${formata.numero(c.transborda)} acima do quociente` : `, ${formata.numero(q - e.votos)} abaixo do quociente`}">
            ${c.transborda ? `<span class="copo-sobra">+${votosCurto(c.transborda)}</span>` : '<span class="copo-sobra"></span>'}
            ${svgCopo(c, `${atual.chave}-${g.u}-${i}`)}
            <span class="copo-nome">${primeiroEUltimo(e.nome).map(p => `<span>${p}</span>`).join('')}</span>
            <span class="copo-sigla" style="background:${cor};color:${contraste(cor, '#ffffff') >= 4.5 ? '#fff' : COR.tecla}">${e.sigla}</span>
          </button></li>`;
        }).join('')}</ol>
      </div>
    </section>`;
  }).join('');
}

/** Na primeira vez, os copos se enchem com os votos de cada eleito, e os puxadores transbordam. A sobra dos puxadores
 *  e a jarra só entram nos copos quando o leitor esvazia a jarra (ou quando a chapa não tem jarra). */
function animaCopos(caixa) {
  const ordem = [['.liquido-proprio:not(.transbordo):not(.escorre)', 0], ['.transbordo, .escorre', 450],
    ['.chapa:not(.jarra-cheia) .liquido-puxadores', 650], ['.chapa:not(.jarra-cheia) .copo .liquido-chapa', 1050]];
  for (const [seletor, atraso] of ordem) {
    caixa.querySelectorAll(seletor).forEach((el, i) => el.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }],
      { duration: 420, delay: atraso + Math.min(i, 30) * 18, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' }));
  }
}

// ---------------------------------------------------------------- o eleito escolhido

/** A cadeira de um eleito numa barra do tamanho do quociente: os próprios votos, a sobra de cada puxador, a jarra
 *  da chapa e o que faltou. Para um puxador, a barra passa do quociente e lista os colegas que a sobra encheu. */
function barraDaCadeira(e, c) {
  const q = atual.q;
  const nomeDoPid = p => atual.eleitos.find(x => x.pid === p)?.nome ?? 'um colega';
  const pct = v => (100 * v) / q;
  const segmentos = [
    { classe: 'liquido-proprio', rotulo: 'votos do próprio eleito', votos: c.proprio },
    ...c.fontes.filter(f => f.de !== 'chapa').map(f => ({ classe: 'liquido-puxadores', rotulo: `sobra de ${nomeDoPid(f.de)}`, votos: f.votos })),
    ...(c.daChapa ? [{ classe: 'liquido-chapa', rotulo: 'jarra da chapa: colegas sem cadeira e legenda', votos: c.daChapa }] : []),
    ...(c.vazio ? [{ classe: 'segmento-falta', rotulo: 'faltou: cadeira ganha nas sobras, por média', votos: c.vazio }] : []),
  ];
  // o puxador: a barra é o que ele teve, e o quociente fica marcado no meio dela
  const total = c.transborda ? c.proprio + c.transborda : q;
  const largura = v => (100 * v) / total;
  const barra = c.transborda
    ? `<span class="segmento liquido-proprio" style="width:${largura(q)}%"></span><span class="segmento liquido-transborda" style="width:${largura(c.transborda)}%"></span>`
    : segmentos.map(s => `<span class="segmento ${s.classe}" style="width:${largura(s.votos)}%" title="${s.rotulo}: ${formata.numero(s.votos)}"></span>`).join('');
  const encheu = c.transborda ? [...atual.copos].flatMap(([para, outro]) => outro.fontes.filter(f => f.de === e.pid)
    .map(f => ({ nome: nomeDoPid(para), votos: f.votos }))) : [];
  const linhas = c.transborda
    ? [{ classe: 'liquido-proprio', rotulo: 'até o quociente', votos: q }, { classe: 'liquido-transborda', rotulo: 'transbordou para a chapa', votos: c.transborda }]
    : segmentos;
  return `<div class="barra-cadeira" role="img" aria-label="${linhas.map(l => `${l.rotulo}: ${formata.numero(l.votos)} votos`).join('; ')}">
      ${barra}${c.transborda ? `<span class="marca-q" style="left:${largura(q)}%"><span>quociente</span></span>` : ''}</div>
    <ul class="barra-legenda">${linhas.map(l => `<li><i class="segmento ${l.classe}"></i><span>${l.rotulo}</span>
      <b>${formata.numero(l.votos)}</b><span class="apoio">${formata.pct(pct(l.votos))} do quociente</span></li>`).join('')}</ul>
    ${encheu.length ? `<h4>A sobra encheu os copos de</h4><ul class="encheu">${encheu.map(x => `<li>${x.nome} <b>${formata.numero(x.votos)}</b></li>`).join('')}</ul>` : ''}`;
}

async function mostraCartao(pid) {
  const caixa = document.getElementById('cartao-copo');
  if (!pid || !atual) { caixa.innerHTML = ''; return; }
  document.querySelectorAll('#copos .copo').forEach(b => b.classList.toggle('escolhido', b.dataset.pid === String(pid)));
  const e = atual.eleitos.find(x => String(x.pid) === String(pid));
  atual.aberto = e.pid;
  const c = atual.copos.get(e.pid);
  const q = atual.q;
  const emprestado = c.dosPuxadores + c.daChapa;
  const texto = c.transborda
    ? `Teve <b>${formata.numero(e.votos)}</b> votos, ${formata.numero(c.transborda)} acima do quociente de ${formata.numero(q)}: entraria sozinho, e a sobra encheu os copos dos colegas da chapa.`
    : `Teve <b>${formata.numero(e.votos)}</b> votos, ${formata.numero(q - e.votos)} abaixo do quociente de ${formata.numero(q)}.
      ${emprestado ? `${formata.pct((100 * emprestado) / q)} da cadeira veio de outros votos da chapa.` : ''}
      ${c.vazio ? `Mesmo com eles faltaram ${formata.numero(c.vazio)}: a cadeira veio na distribuição das sobras, por média.` : ''}`;
  const cands = await leCandidaturas(atual.ue, atual.r.ano);
  const cand = cands.find(x => x.pid === Number(pid) && x.cargo === atual.r.cargo);
  caixa.innerHTML = `<div class="cartao-com-regua">
      ${cand ? `<div class="cartao-coluna">${cartaoPolitico(cand)}</div>` : ''}
      <div class="copo-detalhe">
        <h3>De onde veio a cadeira de ${e.nome ?? 'este eleito'}</h3>
        <p>${texto}</p>
        ${barraDaCadeira(e, c)}
      </div>
    </div>`;
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

let pedido = 0;
async function atualiza(r) {
  const meu = ++pedido;
  const ue = ueDe(r);
  const titulo = document.getElementById('t-copos');
  const caixa = document.getElementById('copos');
  const avisa = texto => {
    titulo.textContent = ''; caixa.innerHTML = `<p class="aviso-vazio">${texto}</p>`;
    ['resumo-copos', 'legenda-copos', 'cartao-copo', 'tabela-legenda'].forEach(id => { document.getElementById(id).innerHTML = ''; });
    atual = null;
  };
  if (!ue) { avisa('Escolha um município: a câmara de vereadores é eleita município a município.'); return; }
  let dados;
  try { dados = await carregaDados(`legenda/${ue}.json`); } catch { dados = null; }
  if (meu !== pedido) return;
  const rec = dados?.anos?.[r.ano]?.[r.cargo];
  const nome = await nomeDe(r, ue);
  if (!rec) { avisa(`Não há eleição para ${minusculo(r.cargo)} ${em(nome)} em ${r.ano}.`); return; }
  atual = { r, ue, q: rec.quociente, chave: `${ue}-${r.ano}`, rec, unidades: dados.unidades, nome, aberto: null };
  caixa.innerHTML = desenhaCopos(rec, dados.unidades, r.ano);
  const pelaLegenda = atual.eleitos.filter(e => porLegenda(e, rec.quociente)).length;
  titulo.innerHTML = `<span class="sobre">${minusculo(r.cargo)} · ${nome} · ${r.ano}</span>
    ${pelaLegenda} de ${atual.eleitos.length} eleitos não encheram o copo sozinhos`;
  document.getElementById('resumo-copos').innerHTML = `Preço de uma cadeira (quociente eleitoral): <b>${formata.numero(rec.quociente)}</b> votos
    (${formata.numero(rec.validos)} votos válidos ÷ ${formata.numero(rec.vagas)} vagas). Clique num copo para ver de onde vieram os votos.`;
  document.getElementById('legenda-copos').innerHTML = `
    <span class="chave chave-liquido liquido-proprio">votos do próprio eleito</span>
    <span class="chave chave-liquido liquido-puxadores">sobra dos puxadores da chapa</span>
    <span class="chave chave-liquido liquido-chapa">jarra: colegas sem cadeira e legenda</span>
    <span class="chave chave-falta">faltou (cadeira pelas sobras)</span>
    <span>A sigla abaixo do copo tem a cor da posição do partido: vermelho à esquerda, azul à direita.</span>`;
  document.getElementById('tabela-legenda').innerHTML = tabelaPartidos(r, atual.eleitos, rec.quociente);
  document.getElementById('cartao-copo').innerHTML = '';
  if (primeiraPintura && !reduz()) animaCopos(caixa);
  primeiraPintura = false;
}

document.getElementById('copos').addEventListener('click', e => {
  const b = e.target.closest('.copo');
  if (b) { mostraCartao(b.dataset.pid); return; }
  // esvaziar a jarra enche os copos com a sobra dos puxadores e os votos da chapa; encher de novo desfaz a distribuição
  const botao = e.target.closest('.jarra-botao');
  if (!botao) return;
  const chapa = botao.closest('.chapa');
  const cheia = chapa.classList.toggle('jarra-cheia');
  botao.setAttribute('aria-pressed', String(!cheia));
  botao.textContent = cheia ? 'Esvaziar a jarra' : 'Encher de novo';
  const estado = chapa.querySelector('.jarra-estado');
  estado.textContent = cheia ? 'cheia' : estado.dataset.depois;
  // a jarra se inclina para os copos enquanto o líquido passa (para despejar ou, ao encher de novo, para receber)
  if (!reduz()) {
    chapa.querySelector('.jarra-svg').animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(30deg)', offset: 0.22 },
      { transform: 'rotate(30deg)', offset: 0.72 }, { transform: 'rotate(0deg)' }], { duration: 1500, easing: 'ease-in-out' });
  }
});

// ---------------------------------------------------------------- o retrato para o oráculo

/** O que a página mostra agora: o quociente, cada chapa com quem entrou pela legenda e quem puxou votos, e o copo
 *  (eleito) que o leitor abriu. */
registraRetrato(() => {
  if (!atual?.eleitos) return null;
  const { r, q, rec, unidades, nome, eleitos, copos } = atual;
  const pelaLegenda = eleitos.filter(e => porLegenda(e, q));
  const chapas = [...new Set(eleitos.map(e => e.unidade))].map(un => {
    const es = eleitos.filter(e => e.unidade === un);
    const puxadores = es.filter(e => copos.get(e.pid).transborda);
    return [unidades[un], `${es.length} ${es.length === 1 ? 'cadeira' : 'cadeiras'}, ${es.filter(e => porLegenda(e, q)).length} pela legenda`
      + (puxadores.length ? `; puxadores (passaram do quociente): ${puxadores.map(e => `${e.nome ?? 'eleito'} (${formata.numero(e.votos)} votos)`).join(', ')}` : '')];
  }).sort((a, b) => Number.parseInt(b[1], 10) - Number.parseInt(a[1], 10));
  const e = atual.aberto == null ? null : eleitos.find(x => x.pid === atual.aberto);
  const c = e ? copos.get(e.pid) : null;
  return {
    numero: 5, pergunta: 'Quem entrou pela legenda?',
    recorte: `${minusculo(r.cargo)} · ${nome} · ${r.ano}`,
    secoes: [
      { titulo: 'O preço de uma cadeira', linhas: [
        ['Quociente eleitoral (votos válidos ÷ vagas)', `${formata.numero(q)} votos`],
        ['Votos válidos', formata.numero(rec.validos)], ['Vagas', formata.numero(rec.vagas)],
        ['Eleitos que não chegaram ao quociente sozinhos (entraram pela legenda)', `${pelaLegenda.length} de ${eleitos.length}`],
      ] },
      { titulo: 'Cada chapa (partido ou federação)', linhas: chapas },
      { titulo: `Votos próprios de cada eleito e quanto do quociente alcançou sozinho${eleitos.length > 30 ? ' (os 30 mais votados)' : ''}`,
        linhas: [...eleitos].sort((a, b) => b.votos - a.votos).slice(0, 30)
          .map(x => [null, `${x.nome ?? 'eleito'} (${x.sigla}): ${formata.numero(x.votos)} votos, ${formata.pct((100 * x.votos) / q)} do quociente${porLegenda(x, q) ? ', pela legenda' : ''}`]) },
      { titulo: 'Eleito aberto pelo leitor', linhas: e ? [
        ['Nome', e.nome ?? 'eleito'], ['Partido', e.sigla], ['Votos próprios', formata.numero(e.votos)],
        c.transborda ? ['Passou do quociente em', `${formata.numero(c.transborda)} votos (a sobra foi para os colegas da chapa)`]
          : ['Faltou para o quociente', `${formata.numero(q - e.votos)} votos`],
        ['Votos vindos da sobra dos puxadores', c.dosPuxadores ? formata.numero(c.dosPuxadores) : null],
        ['Votos vindos da chapa (colegas sem cadeira e legenda)', c.daChapa ? formata.numero(c.daChapa) : null],
        ['Ainda faltou (cadeira veio pelas sobras, por média)', c.vazio ? formata.numero(c.vazio) : null],
      ] : [] },
    ],
  };
});

const brasil = await carregaDados('mapa/brasil.json');
montaSeletor(document.getElementById('recorte'), {
  anos: brasil.anos, cargos: CARGOS, comLugar: true, padrao: { ano: 2022, cargo: 'DEPUTADO FEDERAL', uf: 'PB' }, aoMudar: atualiza,
  municipioObrigatorio: true,
});
