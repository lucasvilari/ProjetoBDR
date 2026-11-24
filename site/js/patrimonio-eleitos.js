// O ranking de patrimônio dos eleitos, no fim da pergunta 2: quanto cresceu a soma dos bens declarados ao TSE por quem
// se elegeu governador, deputado federal ou estadual (o Brasil inteiro) ou prefeito (um estado por vez), comparada
// com a candidatura anterior da mesma pessoa. Cada faixa é um link para a carreira do político na pergunta 10.
//
// Dados: politicos/patrimonio.json (gera_dados.py, parte politicos).
import { carregaDados, formata, fotoCandidato, NOME_UF, em } from './comum.js?v=20261170';
import { UFS_MUNICIPAIS, grupoOpcoes, grupoLista, trocaMantendoTeclas } from './pecas.js?v=20261170';
import { numeroBr } from './lib/retrospecto.js?v=20261170';

const real = v => formata.real(v);
const pct = v => `${numeroBr(v, 1, true)}%`;

const CARGOS = [['gov', 'Governadores'], ['depfed', 'Deputados federais'], ['depest', 'Deputados estaduais'], ['pref', 'Prefeitos']];
const MAX_MOSTRAR = 50;

/** Monta o ranking dentro de `caixa`; cada faixa leva a `hrefDe(pid)`. Devolve { retrato() }: as seções do ranking
 *  para o retrato do oráculo. */
export async function montaRankingPatrimonio(caixa, hrefDe) {
  const dados = await carregaDados('politicos/patrimonio.json');
  const recortes = {};
  for (const [r, porAno] of Object.entries(dados.recortes)) {
    recortes[r] = {};
    for (const [ano, lista] of Object.entries(porAno)) {
      recortes[r][ano] = lista.map(([pid, nome, partido, lugar, pa, pb, ab, v, foto]) => ({ pid, nome, partido, lugar, pa, pb, ab, v, foto }));
    }
  }
  const anosDe = r => Object.keys(recortes[r] ?? {}).map(Number).sort((a, b) => a - b);

  const estado = { recorte: 'gov', ano: anosDe('gov').at(-1) };
  let ufPrefeitos = 'MG';
  let mostrandoTodos = false;

  caixa.innerHTML = `
    <form class="seletor" id="controles-patrimonio" aria-label="Escolher cargo e eleição do ranking de patrimônio"></form>
    <div id="resumo-patrimonio"></div>
    <div id="corrida-patrimonio"></div>
    <div id="rankings-patrimonio"></div>`;
  const form = caixa.querySelector('#controles-patrimonio');
  const resumoDiv = caixa.querySelector('#resumo-patrimonio');
  const corridaDiv = caixa.querySelector('#corrida-patrimonio');
  const rankingsDiv = caixa.querySelector('#rankings-patrimonio');

  const ehPrefeito = () => UFS_MUNICIPAIS.includes(estado.recorte);
  const lista = () => recortes[estado.recorte]?.[estado.ano] ?? [];
  const lugarDe = e => (ehPrefeito() ? e.lugar : NOME_UF[e.lugar] ?? e.lugar);
  const titulo = () => ({ gov: 'Governadores eleitos no Brasil', depfed: 'Deputados federais eleitos no Brasil',
    depest: 'Deputados estaduais e distritais eleitos no Brasil' })[estado.recorte] ?? `Prefeitos eleitos ${em(NOME_UF[estado.recorte])}`;

  // o cargo e, para prefeitos, o estado; a eleição depende do cargo (governador e deputados em 2018, 2022, 2026; prefeito em 2020, 2024)
  function montaControles() {
    const pref = ehPrefeito();
    if (pref) ufPrefeitos = estado.recorte;
    trocaMantendoTeclas(form, grupoOpcoes('cargo', 'Cargo', CARGOS, pref ? 'pref' : estado.recorte)
      + grupoOpcoes('ano', 'Eleição', anosDe(estado.recorte).map(a => [a, a]), estado.ano)
      + (pref ? grupoLista('uf', 'Estado', [...UFS_MUNICIPAIS].sort((a, b) => NOME_UF[a].localeCompare(NOME_UF[b])).map(u => [u, NOME_UF[u]]), estado.recorte) : ''));
    // sem prefeitos, a fileira de estados some
    if (!pref) form.querySelector('[data-opcoes^="uf:"]')?.remove();
  }

  function muda(recorte, ano) {
    estado.recorte = recorte;
    const anos = anosDe(recorte);
    estado.ano = anos.includes(ano) ? ano : anos.at(-1);
    montaControles();
    atualiza();
  }

  form.addEventListener('change', e => {
    if (e.target.name === 'ano') { muda(estado.recorte, +e.target.value); return; }
    const cargo = new FormData(form).get('cargo');
    muda(cargo === 'pref' ? (e.target.name === 'uf' ? e.target.value : ufPrefeitos) : cargo, estado.ano);
  });

  /** Uma faixa: posição, foto, nome inteiro, partido e lugar à esquerda; à direita, o número em destaque (`principal`:
   *  'var' a variação, 'pat' o patrimônio) e o outro embaixo, menor. */
  function faixaHtml(e, principal) {
    // a moldura fica mesmo se a foto não carregar (fotoCandidato remove a imagem que falha): o 👤 aparece por trás
    const foto = `<span class="corrida-foto" aria-hidden="true">👤${fotoCandidato(e.foto, 'corrida-foto-img')}</span>`;
    const cls = e.v == null ? '' : e.v >= 0 ? 'positivo' : 'negativo';
    const variacao = e.v != null ? `${pct(e.v)} desde ${e.ab}` : 'sem candidatura anterior com bens';
    const [grande, pequeno] = principal === 'pat'
      ? [`<span class="corrida-valor">${real(e.pa)}</span>`, `<span class="corrida-sub ${cls}">${variacao}</span>`]
      : [`<span class="corrida-valor ${cls}">${e.v != null ? pct(e.v) : '—'}</span>`,
         `<span class="corrida-sub">${e.v != null ? `${real(e.pb)} em ${e.ab} → ${real(e.pa)}` : `patrimônio ${real(e.pa)}`}</span>`];
    return `<a class="corrida-faixa" href="${hrefDe(e.pid)}" aria-label="${e.nome}: abrir a carreira na pergunta 10">
      <span class="corrida-pos" aria-hidden="true"></span>
      ${foto}
      <div class="corrida-corpo">
        <span class="corrida-nome">${e.nome}</span>
        <span class="corrida-meta"><span class="corrida-partido">${e.partido}</span><span class="corrida-lugar">${lugarDe(e)}</span></span>
      </div>
      <div class="corrida-numeros">${grande}${pequeno}</div>
    </a>`;
  }

  function atualiza() {
    mostrandoTodos = false;
    const l = lista();
    const comVar = l.filter(e => e.v != null);
    const vars = comVar.map(e => e.v).sort((a, b) => a - b);
    const mediana = vars.length ? vars[Math.floor(vars.length / 2)] : null;
    let html = `<h3>${titulo()} · eleição de ${estado.ano}</h3>`;
    if (comVar.length) {
      html += `<p class="apoio">${comVar.length} com candidatura anterior para comparar: ${comVar.filter(e => e.v > 0).length} cresceram,
        ${comVar.filter(e => e.v < 0).length} diminuíram. Mediana: ${pct(mediana)}.</p>`;
    }
    const sem = l.length - comVar.length;
    if (sem) html += `<p class="apoio">${sem} sem candidatura anterior com bens declarados, no fim da lista.</p>`;
    if (!l.length) html += '<p class="apoio">Nenhum eleito com patrimônio declarado.</p>';
    resumoDiv.innerHTML = html;
    desenhaCorrida(l);
    desenhaRankings(l);
  }

  function desenhaCorrida(l) {
    const cortado = mostrandoTodos ? l : l.slice(0, MAX_MOSTRAR);
    corridaDiv.innerHTML = l.length ? `<div class="corrida">${cortado.map(e => faixaHtml(e, 'var')).join('')}</div>`
      + (!mostrandoTodos && l.length > MAX_MOSTRAR ? `<button type="button" class="botao" id="ver-todos">Ver todos os ${l.length} eleitos</button>` : '') : '';
    corridaDiv.querySelector('#ver-todos')?.addEventListener('click', () => { mostrandoTodos = true; desenhaCorrida(l); });
  }

  function porPartido(l) {
    const grupos = {};
    for (const e of l) {
      const g = grupos[e.partido] ??= { partido: e.partido, total: 0, vars: [] };
      g.total += e.pa || 0;
      if (e.v != null) g.vars.push(e.v);
    }
    return Object.values(grupos).filter(g => g.vars.length)
      .map(g => { g.vars.sort((a, b) => a - b); g.mediana = g.vars[Math.floor(g.vars.length / 2)]; return g; })
      .sort((a, b) => b.mediana - a.mediana);
  }

  function desenhaRankings(l) {
    if (!l.length) { rankingsDiv.innerHTML = ''; return; }
    const partidos = porPartido(l);
    const topPat = [...l].sort((a, b) => (b.pa || 0) - (a.pa || 0)).slice(0, 10);
    const quedas = l.filter(e => e.v != null && e.v < 0).sort((a, b) => a.v - b.v).slice(0, 10);
    rankingsDiv.innerHTML = `<div class="abas-ranking" role="tablist">
        <button type="button" class="aba-ranking ativa" role="tab" aria-selected="true" data-aba="partido">Por partido</button>
        <button type="button" class="aba-ranking" role="tab" aria-selected="false" data-aba="patrimonio">Maior patrimônio</button>
        <button type="button" class="aba-ranking" role="tab" aria-selected="false" data-aba="queda">Maior queda</button></div>
      <div class="aba-conteudo ativa" data-aba="partido">${partidos.length ? `<div class="ranking-cards">${partidos.map(p => `
        <div class="ranking-card"><h4>${p.partido}</h4>
          <div class="ranking-valor">${pct(p.mediana)}</div>
          <div class="ranking-detalhe">mediana de ${p.vars.length} eleito${p.vars.length > 1 ? 's' : ''} com comparação</div>
          <div class="ranking-detalhe">Patrimônio somado: ${real(p.total)}</div></div>`).join('')}</div>`
        : '<p class="apoio">Ninguém com candidatura anterior para comparar.</p>'}</div>
      <div class="aba-conteudo" data-aba="patrimonio"><div class="corrida">${topPat.map(e => faixaHtml(e, 'pat')).join('')}</div></div>
      <div class="aba-conteudo" data-aba="queda">${quedas.length ? `<div class="corrida">${quedas.map(e => faixaHtml(e, 'var')).join('')}</div>`
        : '<p class="apoio">Nenhum eleito declarou menos do que na candidatura anterior.</p>'}</div>`;
    rankingsDiv.querySelectorAll('.aba-ranking').forEach(botao => botao.addEventListener('click', () => {
      rankingsDiv.querySelectorAll('.aba-ranking').forEach(b => { b.classList.toggle('ativa', b === botao); b.setAttribute('aria-selected', b === botao); });
      rankingsDiv.querySelectorAll('.aba-conteudo').forEach(d => d.classList.toggle('ativa', d.dataset.aba === botao.dataset.aba));
    }));
  }

  montaControles();
  atualiza();

  return {
    /** As seções do retrato do oráculo: o recorte do ranking e os 20 primeiros. */
    retrato: () => {
      const l = lista();
      const comVar = l.filter(e => e.v != null);
      return {
        recorte: `${titulo()}, eleição de ${estado.ano}`,
        secoes: [{ titulo: `Ranking de patrimônio: ${titulo().toLowerCase()}, eleição de ${estado.ano} (${l.length} eleitos, ${comVar.length} com candidatura anterior para comparar)`,
          linhas: l.slice(0, 20).map(e => [`${e.nome} (${e.partido}), ${lugarDe(e)}`,
            e.v != null ? `${real(e.pa)}, ${pct(e.v)} sobre ${real(e.pb)} declarados em ${e.ab}` : `${real(e.pa)}, sem candidatura anterior com bens`]) }],
      };
    },
  };
}
