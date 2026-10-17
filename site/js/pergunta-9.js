// Pergunta 9: onde gastam em propaganda? A rua da campanha, com um objeto por tipo de despesa do tamanho do
// gasto; a TV com as palavras das descrições das despesas; ao lado, o gasto com votos e custo por voto; e o
// gráfico de gasto contra votos do recorte. Vale para um recorte (ano, cargo, lugar) ou para um político.
//
// Dados: propaganda/<ue>.json (gasto por tipo e palavras de cada recorte), propaganda/pessoas/<n>.json (o mesmo
// para cada candidatura dos políticos com nome), candidaturas/<ue>-<ano>.json (votos e gasto de cada candidato),
// politicos/ (busca e carreira).
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { montaPagina, carregaDados, formata, santinho, fotoCandidato, NOME_UF, em } from './comum.js?v=20261020';
import { ueDoRecorte } from './lib/recorte.js?v=20261020';
import { OBJETOS, objetoDoTipo } from './lib/propaganda.js?v=20261020';
import { montaSeletor, leCandidaturas, cartaoPolitico } from './pecas.js?v=20261020';
import { montaBusca, carreiraDe, tabelasPoliticos } from './busca.js?v=20261020';
import { cenaDaRua, CURTO } from './rua.js?v=20261020';

montaPagina();

const brasil = await carregaDados('mapa/brasil.json');
const tabelas = await tabelasPoliticos();
const minusculo = c => c.toLowerCase();
const reduz = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const compacto = v => (v >= 1e6 ? `R$ ${String((v / 1e6).toFixed(v >= 1e7 ? 0 : 1)).replace('.', ',')} mi`
  : v >= 1e3 ? `R$ ${Math.round(v / 1e3)} mil` : formata.real(v));
let primeiraPintura = true;

async function nomeLugar(r) {
  const ue = ueDoRecorte(r);
  if (/^\d{5}$/.test(ue)) return (await carregaDados(`mapa/municipios/${r.uf}.json`)).municipios[ue]?.nome ?? ue;
  return ue === 'BR' ? 'Brasil' : NOME_UF[ue];
}

// ---------------------------------------------------------------- o político escolhido

/** As candidaturas de 2018 em diante de um político, nos cargos com dados de despesa, mais recentes primeiro. */
async function pessoaDe(pid) {
  const c = await carreiraDe(pid);
  if (!c) return null;
  const cands = c.cands.filter(x => x.ano >= 2018 && brasil.cargos.includes(x.cargo)).reverse();
  return { pid, nome: c.nome, foto: c.foto, cands };
}

/** O recorte de uma candidatura: o lugar dela no seletor. */
function recorteDa(cand, pid) {
  const r = { ano: cand.ano, cargo: cand.cargo, pid };
  if (/^\d{5}$/.test(cand.ue)) { r.mun = cand.ue; r.uf = tabelas.municipios[cand.ue]?.match(/\((..)\)$/)?.[1]; }
  else if (cand.ue !== 'BR') r.uf = cand.ue;
  return r;
}

function mostraPessoa(pessoa, r) {
  const caixa = document.getElementById('pessoa');
  if (!pessoa) { caixa.hidden = true; caixa.innerHTML = ''; return; }
  caixa.hidden = false;
  caixa.innerHTML = `
    <div class="p9-pessoa-topo">${fotoCandidato(pessoa.foto, 'resultado-foto')}
      <div><h2>${pessoa.nome}</h2>
        <p class="apoio">Escolha a candidatura. <a href="pergunta-10.html#${pessoa.pid}">Ver a carreira completa</a></p></div>
      <button type="button" class="botao" id="sai-pessoa">Ver todos do recorte</button></div>
    <div class="p9-candidaturas" role="group" aria-label="Candidaturas de ${pessoa.nome}">
      ${pessoa.cands.map((c, i) => `<button type="button" class="botao" data-i="${i}" aria-pressed="${c.ano === r.ano && c.cargo === r.cargo}">
        ${c.ano} · ${minusculo(c.cargo)} · ${c.local}</button>`).join('')}
    </div>`;
}

document.getElementById('pessoa').addEventListener('click', e => {
  if (e.target.closest('#sai-pessoa')) { seletor.muda({ pid: undefined }); return; }
  const i = e.target.closest('[data-i]')?.dataset.i;
  if (i != null && pessoaAtual) seletor.muda({ mun: undefined, uf: undefined, ...recorteDa(pessoaAtual.cands[i], pessoaAtual.pid) });
});

// ---------------------------------------------------------------- a rua e a TV

/** Gasto por objeto da rua: {objeto: reais} e, para a lista, os tipos de cada objeto. */
function porObjeto(gasto, tipos) {
  const valores = {}, detalhes = {};
  for (const [i, v] of gasto) {
    const o = objetoDoTipo(tipos[i]);
    valores[o] = (valores[o] ?? 0) + v;
    (detalhes[o] ??= []).push([tipos[i], v]);
  }
  return { valores, detalhes };
}

function desenhaRua({ valores, detalhes }) {
  const caixa = document.getElementById('rua');
  caixa.innerHTML = cenaDaRua(valores, compacto);
  const total = d3.sum(Object.values(valores));
  const texto = id => {
    const o = OBJETOS.find(x => x.id === id), v = valores[id] ?? 0;
    const tipos = (detalhes[id] ?? []).slice(0, 4).map(([t, x]) => `${t.toLowerCase()} (${compacto(x)})`).join('; ');
    return `<strong>${o.nome}: ${formata.real(v)}</strong>${total ? `, ${formata.pct((100 * v) / total)} do total` : ''}.${tipos ? ` ${tipos}.` : ' Nenhum gasto declarado.'}`;
  };
  const detalhe = document.getElementById('detalhe-rua');
  detalhe.innerHTML = 'Toque, passe o mouse ou o foco num objeto para ver o gasto; a tabela abaixo traz todos.';
  caixa.querySelectorAll('.objeto-rua').forEach(g => {
    const mostra = () => { detalhe.innerHTML = texto(g.dataset.objeto); };
    g.addEventListener('mouseenter', mostra); g.addEventListener('focus', mostra);
  });
  if (primeiraPintura && !reduz()) {
    caixa.querySelectorAll('.objeto-desenho').forEach((g, i) => g.animate(
      [{ transform: 'scale(0)' }, { transform: 'scale(1)' }],
      { duration: 520, delay: 70 * i, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' }));
  }
  // a mesma informação em lista, para ler e comparar sem passar o mouse
  const ordem = OBJETOS.map(o => o.id).sort((a, b) => (valores[b] ?? 0) - (valores[a] ?? 0));
  document.getElementById('lista-rua').innerHTML = `<div class="rolagem"><table class="tabela tabela-compacta">
    <thead><tr><th>Objeto da rua</th><th class="num">Gasto</th><th class="num">Parcela</th><th>Tipos de despesa do TSE</th></tr></thead>
    <tbody>${ordem.map(id => `<tr><td>${CURTO[id]}</td><td class="num">${formata.real(valores[id] ?? 0)}</td>
      <td class="num">${total ? formata.pct((100 * (valores[id] ?? 0)) / total) : '—'}</td>
      <td class="apoio">${(detalhes[id] ?? []).map(([t, v]) => `${t} (${compacto(v)})`).join('; ') || '—'}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

/** A TV: as palavras das descrições, do tamanho da frequência e da cor do dinheiro que passou por elas. */
function desenhaTV(palavras, titulo) {
  const caixa = document.getElementById('tv');
  if (!palavras.length) {
    caixa.innerHTML = `<div class="tv"><div class="tv-tela"><p class="tv-titulo">${titulo}</p><p class="tv-vazia">Sem descrições de despesa.</p></div></div>`;
    return;
  }
  const fMax = d3.max(palavras, p => p[1]);
  const vs = palavras.map(p => p[2]).filter(v => v > 0);
  const tom = d3.scaleLog().domain([Math.max(1, d3.min(vs) ?? 1), Math.max(2, d3.max(vs) ?? 2)]).range([0, 1]).clamp(true);
  const cor = v => d3.interpolateRgb('#7a705c', '#22201c')(tom(Math.max(1, v)));
  // ordem embaralhada (sempre a mesma), para as palavras grandes não ficarem todas juntas
  const mistura = w => [...w].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 9973, 7);
  const ordem = [...palavras].sort((a, b) => mistura(a[0]) - mistura(b[0]));
  caixa.innerHTML = `<div class="tv" role="img" aria-label="${titulo}: ${palavras.slice(0, 10).map(p => p[0]).join(', ')}">
    <span class="tv-antena" aria-hidden="true"></span>
    <div class="tv-tela"><p class="tv-titulo">${titulo}</p>
      <p class="nuvem">${ordem.map(([w, f, v]) => `<span style="font-size:${(0.8 + 1.9 * Math.sqrt(f / fMax)).toFixed(2)}rem;color:${cor(v)}"
        title="${w}: ${formata.numero(f)} ${f === 1 ? 'vez' : 'vezes'}, ${formata.real(v)}">${w}</span>`).join(' ')}</p></div>
    <span class="tv-pes" aria-hidden="true"></span></div>
    <p class="legenda-grafico"><span>Tamanho: quantas vezes a palavra aparece.</span>
      <span class="degrade-tv"><span>cor: menos dinheiro</span><i aria-hidden="true"></i><span>mais dinheiro</span></span></p>`;
}

// ---------------------------------------------------------------- gasto, votos e custo por voto

function ladoDoRecorte(r, nome, total, cands, nCandidatos) {
  const comVotos = cands.filter(c => c.votos > 0);
  const votos = d3.sum(comVotos, c => c.votos), gastoLista = d3.sum(cands, c => c.despesa ?? 0);
  const eleitos = cands.filter(c => c.eleito);
  const gastoEleitos = d3.sum(eleitos, c => c.despesa ?? 0), votosEleitos = d3.sum(eleitos, c => c.votos ?? 0);
  return santinho({
    faixa: `${minusculo(r.cargo)} · ${r.ano}`, nome, numero: compacto(total),
    rotulo: `de gastos declarados por ${formata.numero(nCandidatos)} ${nCandidatos === 1 ? 'candidato' : 'candidatos'}.`,
    linhas: [
      ['Gasto médio', nCandidatos ? formata.real(total / nCandidatos) : '—'],
      ...(cands.length ? [
        ['Votos', formata.numero(votos)],
        ['Custo por voto', votos ? formata.porVoto(gastoLista / votos) : '—'],
        ['Custo por voto dos eleitos', votosEleitos ? formata.porVoto(gastoEleitos / votosEleitos) : '—'],
      ] : [['Votos', 'lista de candidatos só por estado, município ou presidente']]),
    ],
    verso: `<p>Soma das despesas declaradas ao TSE pelos candidatos do recorte. O custo por voto divide o gasto dos
      candidatos pelos votos que eles tiveram no 1º turno.</p>`,
    fonte: 'p09a_gasto_por_tipo.sql',
  });
}

// ---------------------------------------------------------------- ciclo

let pessoaAtual = null;
let pedido = 0;
async function atualiza(r) {
  const meu = ++pedido;
  if (r.pid) {
    const nova = pessoaAtual?.pid !== r.pid;
    if (nova) pessoaAtual = await pessoaDe(r.pid);
    if (meu !== pedido) return;
    if (!pessoaAtual || !pessoaAtual.cands.length) {
      pessoaAtual = null;
      document.getElementById('resultados').innerHTML = '<p class="aviso-vazio">Este político não tem candidatura de 2018 a 2024 com dados de despesa.</p>';
      seletor.muda({ pid: undefined });
      return;
    }
    // o recorte acompanha a candidatura escolhida. Político recém-escolhido abre na candidatura do recorte, se
    // tiver uma, ou na mais recente; se o leitor muda o seletor para um ano ou cargo que ele não disputou, a página
    // volta ao recorte, sem o político
    const doRecorte = pessoaAtual.cands.find(c => c.ano === r.ano && c.cargo === r.cargo);
    if (!doRecorte && !nova) { seletor.muda({ pid: undefined }); return; }
    const cand = doRecorte ?? pessoaAtual.cands[0];
    const alvo = recorteDa(cand, r.pid);
    if (alvo.ano !== r.ano || alvo.cargo !== r.cargo || alvo.uf !== r.uf || alvo.mun !== r.mun) {
      seletor.muda({ mun: undefined, uf: undefined, ...alvo });
      return;
    }
  } else pessoaAtual = null;
  mostraPessoa(pessoaAtual, r);
  if (pessoaAtual) document.getElementById('resultados').innerHTML = '';

  const ue = ueDoRecorte(r);
  const [nome, prop, todos] = await Promise.all([
    nomeLugar(r), carregaDados(`propaganda/${ue}.json`).catch(() => null), leCandidaturas(ue, r.ano)]);
  let dados = null;
  if (pessoaAtual) {
    const arq = await carregaDados(`propaganda/pessoas/${Math.floor((pessoaAtual.pid - 1) / tabelas.por_arquivo)}.json`).catch(() => null);
    const e = arq?.pessoas[pessoaAtual.pid]?.[`${r.ano}|${r.cargo}`];
    dados = { gasto: e?.gasto ?? [], palavras: (e?.palavras ?? []).map(([i, f, v]) => [arq.palavras[i], f, v]), tipos: arq?.tipos ?? [] };
  } else {
    const e = prop?.anos[r.ano]?.[r.cargo];
    dados = { gasto: e?.gasto ?? [], palavras: e?.palavras ?? [], tipos: prop?.tipos ?? [], candidatos: e?.candidatos ?? 0 };
  }
  if (meu !== pedido) return;
  const cands = todos.filter(c => c.cargo === r.cargo);
  const total = d3.sum(dados.gasto, g => g[1]);
  const quem = pessoaAtual ? pessoaAtual.nome : nome;
  document.getElementById('t-rua').innerHTML = `<span class="sobre">${minusculo(r.cargo)} · ${nome} · ${r.ano}</span>
    A rua ${pessoaAtual ? `de ${quem}` : em(nome).replace(/^(em|no|na|nos|nas) /, m => ({ 'em ': 'de ', 'no ': 'do ', 'na ': 'da ', 'nos ': 'dos ', 'nas ': 'das ' })[m])}`;
  desenhaRua(porObjeto(dados.gasto, dados.tipos));
  if (!total) {
    document.getElementById('detalhe-rua').innerHTML = `<span class="aviso-vazio">${pessoaAtual
      ? `${quem} não declarou despesas nesta candidatura.` : `Nenhuma despesa declarada para ${minusculo(r.cargo)} ${em(nome)} em ${r.ano}.`}</span>`;
  }
  desenhaTV(dados.palavras, pessoaAtual ? `O que ${quem.split(' ')[0]} mais comprou` : 'O que mais aparece nas despesas');

  const lado = document.getElementById('lado');
  const eu = pessoaAtual && cands.find(c => c.pid === pessoaAtual.pid);
  lado.innerHTML = eu ? cartaoPolitico(eu)
    : pessoaAtual ? santinho({ faixa: `${minusculo(r.cargo)} · ${r.ano}`, nome: quem, numero: compacto(total), rotulo: 'de gastos declarados.' })
    : ladoDoRecorte(r, nome, total, cands, dados.candidatos);

  primeiraPintura = false;
}

const seletor = montaSeletor(document.getElementById('recorte'), {
  anos: brasil.anos, comLugar: true, padrao: { ano: 2024, cargo: 'PREFEITO', uf: 'PB', mun: '20516' }, aoMudar: atualiza,
  municipioObrigatorio: true,
});
montaBusca(document.getElementById('form-busca'), document.getElementById('resultados'), {
  hrefDe: f => `#pid=${f.id}`, filtro: f => f.ultimo_ano >= 2018,
});
