// Pergunta 12: quanto cresceu o patrimônio? — corrida de cavalos
import { montaPagina, carregaDados, formata, santinho, fotoCandidato, NOME_UF, em, registraRetrato } from './comum.js?v=20261114';
import { UFS_PROJETO } from './pecas.js?v=20261112';
import { numeroBr, mandatoDe } from './lib/retrospecto.js?v=20261112';

montaPagina();

const corrida = await carregaDados('patrimonio_corrida.json');
const POL = corrida.politicos;  // [{n, f, c: [[ano, cargo, ue, partido, pat, foto, eleito],...]}]
const C = { ano: 0, cargo: 1, ue: 2, partido: 3, pat: 4, foto: 5, eleito: 6 };

const NOMES_CARGO = { GOV: 'Governador', DEPFED: 'Dep. Federal', DEPEST: 'Dep. Estadual',
  PREF: 'Prefeito', VER: 'Vereador', SEN: 'Senador', VGOV: 'Vice-Governador',
  VPREF: 'Vice-Prefeito', PRES: 'Presidente', VPRES: 'Vice-Presidente', SUP1: '1º Suplente', SUP2: '2º Suplente' };

const real = v => formata.real(v);
const nomeCurto = n => { const p = n.split(' '); return p.length <= 2 ? n : `${p[0]} ${p.at(-1)}`; };

// ---------------------------------------------------------------- estado

const RECORTES_FIXOS = ['gov', 'depfed', 'depest'];
const estado = { ano: null, recorte: null };

function anosDoRecorte(r) {
  const rc = corrida.recortes[r];
  if (!rc) return [];
  return Object.keys(rc).map(Number).sort();
}

function leHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const r = h.get('r') || 'gov';
  estado.recorte = RECORTES_FIXOS.includes(r) ? r : UFS_PROJETO.includes(r) ? r : 'gov';
  const anos = anosDoRecorte(estado.recorte);
  const pedido = +h.get('ano');
  estado.ano = anos.includes(pedido) ? pedido : (anos.at(-1) || 2022);
}
leHash();

function escreveHash() {
  const p = new URLSearchParams();
  p.set('ano', estado.ano);
  p.set('r', estado.recorte);
  history.replaceState(null, '', `#${p}`);
}

// ---------------------------------------------------------------- controles

const form = document.getElementById('controles');
const grupoAno = document.getElementById('grupo-ano');
const grupoUf = document.getElementById('grupo-uf');

function montaControles() {
  const anos = anosDoRecorte(estado.recorte);
  grupoAno.innerHTML = `<div class="grupo-opcoes"><span class="grupo-rotulo">Eleição</span><div class="fileira-teclas" data-opcoes="anos">${
    anos.map(a => `<label class="tecla"><input type="radio" name="ano" value="${a}"${a === estado.ano ? ' checked' : ''}>${a}</label>`).join('')
  }</div></div>`;
  const r = estado.recorte;
  grupoUf.innerHTML = `<div class="grupo-opcoes"><span class="grupo-rotulo">Recorte</span><div class="fileira-teclas" data-opcoes="recortes">${[
    `<label class="tecla"><input type="radio" name="recorte" value="gov"${r === 'gov' ? ' checked' : ''}>Governadores</label>`,
    `<label class="tecla"><input type="radio" name="recorte" value="depfed"${r === 'depfed' ? ' checked' : ''}>Dep. Federais</label>`,
    `<label class="tecla"><input type="radio" name="recorte" value="depest"${r === 'depest' ? ' checked' : ''}>Dep. Estaduais</label>`,
    ...UFS_PROJETO.map(u => `<label class="tecla"><input type="radio" name="recorte" value="${u}"${r === u ? ' checked' : ''}>${u}</label>`)
  ].join('')}</div></div>`;
}
montaControles();

form.addEventListener('change', () => {
  const fd = new FormData(form);
  const novoRecorte = fd.get('recorte') || 'gov';
  const mudouRecorte = novoRecorte !== estado.recorte;
  estado.recorte = novoRecorte;
  const anos = anosDoRecorte(estado.recorte);
  if (mudouRecorte) {
    estado.ano = anos.includes(estado.ano) ? estado.ano : (anos.at(-1) || 2022);
    montaControles();
  } else {
    estado.ano = +fd.get('ano');
  }
  escreveHash();
  atualiza();
});
window.addEventListener('hashchange', () => { leHash(); montaControles(); atualiza(); });

// ---------------------------------------------------------------- extração

function ehMunicipal() { return UFS_PROJETO.includes(estado.recorte); }
function ehDeputado() { return estado.recorte === 'depfed' || estado.recorte === 'depest'; }

function tituloRecorte() {
  if (estado.recorte === 'gov') return 'Governadores dos seis estados';
  if (estado.recorte === 'depfed') return 'Deputados federais dos seis estados';
  if (estado.recorte === 'depest') return 'Deputados estaduais dos seis estados';
  return `Prefeitos ${em(NOME_UF[estado.recorte])}`;
}

function listaDoRecorte() {
  const rc = corrida.recortes[estado.recorte];
  if (!rc) return [];
  return rc[String(estado.ano)] || [];
}

function lugarCompleto(e) {
  if (estado.recorte === 'gov' || ehDeputado()) return NOME_UF[e.l] || e.l;
  return e.l;
}

// ---------------------------------------------------------------- corrida de cavalos

const corridaDiv = document.getElementById('tabela');
const resumoDiv = document.getElementById('resumo');
const rankingsDiv = document.getElementById('rankings');
const MAX_MOSTRAR = 50;
let mostrandoTodos = false;

function atualiza() {
  mostrandoTodos = false;
  const lista = listaDoRecorte();
  const comVar = lista.filter(e => e.v != null);
  const semVar = lista.filter(e => e.v == null);
  const titulo = tituloRecorte();

  // resumo
  const mediana = comVar.length ? comVar.map(e => e.v).sort((a, b) => a - b)[Math.floor(comVar.length / 2)] : null;
  const subiram = comVar.filter(e => e.v > 0).length;
  const cairam = comVar.filter(e => e.v < 0).length;

  let html = `<h3>${titulo} · eleição de ${estado.ano}</h3>`;
  if (comVar.length) {
    html += `<p class="apoio">${comVar.length} com comparação entre eleições: ${subiram} cresceram, ${cairam} diminuíram.`
      + (mediana != null ? ` Mediana: ${numeroBr(mediana, 1, true)}%.` : '') + `</p>`;
  }
  if (semVar.length) html += `<p class="apoio">${semVar.length} sem eleição anterior para comparar.</p>`;
  if (!lista.length) {
    const mun = ehMunicipal(), dep = ehDeputado(), anoMun = estado.ano % 4 === 0;
    if (mun && !anoMun) html += `<p class="apoio">Em ${estado.ano} a eleição foi para governador e deputados; prefeitos são eleitos em anos pares divisíveis por 4.</p>`;
    else if (!mun && !dep && anoMun) html += `<p class="apoio">Em ${estado.ano} a eleição foi municipal; governadores são eleitos em 2018, 2022, 2026.</p>`;
    else if (dep && anoMun) html += `<p class="apoio">Em ${estado.ano} a eleição foi municipal; deputados são eleitos em 2018, 2022, 2026.</p>`;
    else html += `<p class="apoio">Nenhum candidato com patrimônio declarado.</p>`;
  }
  resumoDiv.innerHTML = html;

  desenhaCorrida(lista);
  desenhaRankings(lista);
}

function desenhaCorrida(lista) {
  if (!lista.length) { corridaDiv.innerHTML = ''; return; }

  const maxAbs = Math.max(1, ...lista.filter(e => e.v != null).map(e => Math.abs(e.v)));
  const cortado = mostrandoTodos ? lista : lista.slice(0, MAX_MOSTRAR);

  let html = '<div class="corrida">';
  for (const e of cortado) {
    const pol = POL[e.i];
    const fotoHtml = e.fo
      ? fotoCandidato(e.fo, 'corrida-foto')
      : `<span class="corrida-foto-vazia" aria-hidden="true">👤</span>`;
    const pct = e.v != null ? Math.min(100, Math.abs(e.v) / maxAbs * 100) : 0;
    const cls = e.v != null ? (e.v >= 0 ? 'positivo' : 'negativo') : '';
    const varTexto = e.v != null ? `${numeroBr(e.v, 1, true)}%` : '—';
    html += `<div class="corrida-faixa" data-idx="${e.i}">
      <span class="corrida-pos"></span>
      ${fotoHtml}
      <div class="corrida-corpo">
        <span class="corrida-nome">${nomeCurto(pol.n)}</span>
        <span class="corrida-meta"><span>${e.p}</span><span>${lugarCompleto(e)}</span><span>${real(e.pa)}</span></span>
      </div>
      <span class="corrida-valor ${cls}">${varTexto}</span>
    </div>`;
  }
  html += '</div>';

  if (!mostrandoTodos && lista.length > MAX_MOSTRAR) {
    html += `<button class="tecla" id="ver-todos" style="margin:var(--m2) 0">Ver todos os ${lista.length} candidatos</button>`;
  }

  corridaDiv.innerHTML = html;

  corridaDiv.querySelector('.corrida')?.addEventListener('click', ev => {
    const faixa = ev.target.closest('.corrida-faixa');
    if (!faixa) return;
    const idx = +faixa.dataset.idx;
    const entry = cortado.find(e => e.i === idx);
    if (entry) mostraModal(entry);
  });

  corridaDiv.querySelector('#ver-todos')?.addEventListener('click', () => {
    mostrandoTodos = true;
    desenhaCorrida(lista);
  });
}

// ---------------------------------------------------------------- modal com carreira

const VERSO = `<p>O patrimônio é a soma dos bens declarados ao TSE. A variação compara com a candidatura anterior
  (qualquer cargo), identificada pelo título eleitoral. Valor nominal, sem correção pela inflação.</p>`;

function mostraModal(e) {
  const velho = document.querySelector('.modal-santinho');
  if (velho) velho.remove();

  const pol = POL[e.i];
  const de = mandatoDe(estado.ano);
  const cargoNome = estado.recorte === 'gov' ? 'Governador' : estado.recorte === 'depfed' ? 'Dep. Federal'
    : estado.recorte === 'depest' ? 'Dep. Estadual' : 'Prefeito';
  const faixa = `${cargoNome} · ${lugarCompleto(e)} · ${de.de}–${de.ate}`;

  const numero = e.v != null ? `${numeroBr(e.v, 1, true)}%` : real(e.pa);
  const rotulo = e.v != null
    ? `de variação no patrimônio, de ${e.ab} para ${estado.ano}.`
    : 'de patrimônio declarado (sem eleição anterior).';

  const linhas = [['Patrimônio atual', `${real(e.pa)} (${estado.ano})`]];
  if (e.pb != null) linhas.push(['Patrimônio anterior', `${real(e.pb)} (${e.ab})`]);
  linhas.push(['Partido', e.p]);

  // carreira como timeline
  const timelineHtml = pol.c.map(c => {
    const cargoC = NOMES_CARGO[c[C.cargo]] || c[C.cargo];
    const patC = c[C.pat] != null ? real(c[C.pat]) : '—';
    const cls = c[C.eleito] ? 'eleito' : '';
    const local = NOME_UF[c[C.ue]] || c[C.ue];
    return `<li class="carreira-passo ${cls}">
      <span class="carreira-ano">${c[C.ano]}</span>
      <span class="carreira-cargo">${cargoC}</span> · ${local} · ${c[C.partido]}
      ${c[C.eleito] ? ' ✓' : ''}
      <br><span class="carreira-pat">${patC}</span>
    </li>`;
  }).join('');

  const foto = e.fo ? fotoCandidato(e.fo, 'santinho-foto') : '';

  const modal = document.createElement('div');
  modal.className = 'modal-santinho';
  modal.innerHTML = `<button class="modal-fechar" aria-label="Fechar">×</button>` +
    santinho({ faixa, nome: pol.n, numero, rotulo, linhas, foto,
      verso: `<h4 style="margin:0.5rem 0 0.3rem;font-size:0.9rem">Carreira política</h4>
        <ul class="carreira-timeline">${timelineHtml}</ul>` + VERSO,
      fonte: 'TSE · dados abertos de bens de candidatos' });
  document.body.append(modal);

  modal.addEventListener('click', ev => { if (ev.target === modal || ev.target.closest('.modal-fechar')) modal.remove(); });
  document.addEventListener('keydown', function esc(ev) { if (ev.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', esc); } });
}

// ---------------------------------------------------------------- rankings

function desenhaRankings(lista) {
  if (!lista.length) { rankingsDiv.innerHTML = ''; return; }
  const comVar = lista.filter(e => e.v != null);

  const porPartido = {};
  for (const e of lista) {
    if (!porPartido[e.p]) porPartido[e.p] = { partido: e.p, total: 0, n: 0, vars: [] };
    porPartido[e.p].total += e.pa || 0;
    porPartido[e.p].n++;
    if (e.v != null) porPartido[e.p].vars.push(e.v);
  }
  const partidos = Object.values(porPartido).filter(p => p.vars.length)
    .map(p => { p.vars.sort((a, b) => a - b); p.mediana = p.vars[Math.floor(p.vars.length / 2)]; return p; })
    .sort((a, b) => b.mediana - a.mediana);

  const topCresc = comVar.filter(e => e.v > 0).slice(0, 10);
  const topPat = [...lista].sort((a, b) => (b.pa || 0) - (a.pa || 0)).slice(0, 10);

  let html = `<div class="abas-ranking">
    <button class="aba-ranking ativa" data-aba="partido">Por partido</button>
    <button class="aba-ranking" data-aba="crescimento">Maior crescimento</button>
    <button class="aba-ranking" data-aba="patrimonio">Maior patrimônio</button></div>`;

  html += `<div class="aba-conteudo ativa" data-aba="partido">`;
  if (partidos.length) {
    html += `<div class="ranking-cards">${partidos.map(p =>
      `<div class="ranking-card"><h4>${p.partido}</h4>
        <div class="ranking-valor">${numeroBr(p.mediana, 1, true)}%</div>
        <div class="ranking-detalhe">mediana · ${p.vars.length} eleito${p.vars.length > 1 ? 's' : ''}</div>
        <div class="ranking-detalhe">Total: ${real(p.total)}</div></div>`
    ).join('')}</div>`;
  } else html += `<p class="apoio">Sem variação para comparar.</p>`;
  html += `</div>`;

  const miniCorrida = (items, label) => items.map(e => {
    const pol = POL[e.i];
    const fotoH = e.fo ? fotoCandidato(e.fo, 'corrida-foto') : `<span class="corrida-foto-vazia">👤</span>`;
    const varT = e.v != null ? `${numeroBr(e.v, 1, true)}%` : '—';
    return `<div class="corrida-faixa" data-idx="${e.i}" style="padding:0.25rem 0.5rem">
      ${fotoH}<div class="corrida-corpo"><span class="corrida-nome">${nomeCurto(pol.n)}</span>
      <span class="corrida-meta"><span>${e.p}</span><span>${lugarCompleto(e)}</span></span></div>
      <span class="corrida-valor ${(e.v || 0) >= 0 ? 'positivo' : 'negativo'}">${label === 'pat' ? real(e.pa) : varT}</span></div>`;
  }).join('');

  html += `<div class="aba-conteudo" data-aba="crescimento"><div class="corrida">${miniCorrida(topCresc, 'var')}</div></div>`;
  html += `<div class="aba-conteudo" data-aba="patrimonio"><div class="corrida">${miniCorrida(topPat, 'pat')}</div></div>`;

  rankingsDiv.innerHTML = html;

  rankingsDiv.querySelectorAll('.aba-ranking').forEach(btn => {
    btn.addEventListener('click', () => {
      rankingsDiv.querySelectorAll('.aba-ranking').forEach(b => b.classList.remove('ativa'));
      rankingsDiv.querySelectorAll('.aba-conteudo').forEach(d => d.classList.remove('ativa'));
      btn.classList.add('ativa');
      rankingsDiv.querySelector(`.aba-conteudo[data-aba="${btn.dataset.aba}"]`).classList.add('ativa');
    });
  });

  rankingsDiv.querySelectorAll('.corrida').forEach(div => {
    div.addEventListener('click', ev => {
      const faixa = ev.target.closest('.corrida-faixa');
      if (!faixa) return;
      const idx = +faixa.dataset.idx;
      const entry = lista.find(e => e.i === idx) || topCresc.find(e => e.i === idx) || topPat.find(e => e.i === idx);
      if (entry) mostraModal(entry);
    });
  });
}

// ---------------------------------------------------------------- oráculo

registraRetrato(() => {
  const lista = listaDoRecorte();
  const recorte = `${tituloRecorte()} · eleição de ${estado.ano}`;
  const secoes = [{ titulo: `Patrimônio declarado (${estado.ano})`, linhas: lista.slice(0, 20).map(e => {
    const pol = POL[e.i];
    const txt = e.v != null
      ? `${real(e.pa)} (${numeroBr(e.v, 1, true)}% vs ${real(e.pb)} em ${e.ab})`
      : `${real(e.pa)} (sem anterior)`;
    return [`${pol.n} (${e.p}), ${lugarCompleto(e)}`, txt];
  }) }];
  secoes.push({ titulo: 'Cuidados', linhas: [
    ['Dados', 'bens declarados ao TSE, de 2006 em diante'],
    ['Variação', 'compara com a candidatura anterior (qualquer cargo), pelo título eleitoral'],
    ['Valor nominal', 'sem correção pela inflação']] });
  return { numero: 12, pergunta: 'Quanto cresceu o patrimônio?', recorte, secoes };
});

// ---------------------------------------------------------------- arranque

atualiza();
