// Pergunta 10: como foi a carreira de um político? Busca por nome e, para o político escolhido, a linha do tempo
// com um santinho por eleição (foto de 2004 em diante; votos, gasto e custo por voto de 2018 em diante), o resumo da carreira,
// a trajetória ideológica dos partidos e a tabela de todas as candidaturas.
//
// Dados: politicos/ (índice, fichas e carreiras; ver js/busca.js).
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/+esm';
import { montaPagina, formata, santinho, fotoCandidato } from './comum.js?v=20261021';
import { COR, corIdeologia } from './lib/cores.js?v=20261021';
import { custoPorVoto } from './lib/dinheiro.js?v=20261021';
import { montaBusca, carreiraDe } from './busca.js?v=20261021';

montaPagina();

const ficha = document.getElementById('ficha');
montaBusca(document.getElementById('form-busca'), document.getElementById('resultados'));

// ---------------------------------------------------------------- resultado de cada candidatura

function resultado(c) {
  if (c.eleito && c.reeleicao) return 'Reeleito';
  if (c.eleito) return 'Vitória';
  if (c.situacao === 'NÃO ELEITO' || c.situacao === 'SUPLENTE') return 'Derrota';
  if (c.situacao === 'SEM SITUAÇÃO') return 'Resultado não informado';
  return 'Candidatura não concluída';
}

/** Por que falta o resultado: o arquivo de 2006 não traz a eleição presidencial; nos demais casos,
 *  o TSE deixa a situação vazia, em geral para candidaturas indeferidas ou retiradas antes da eleição. */
function motivoSemResultado(c) {
  if (c.ano === 2006 && c.cargo === 'PRESIDENTE') return 'o arquivo de 2006 do TSE não traz o resultado da eleição presidencial';
  return 'situação não informada pelo TSE (em geral, candidatura indeferida ou retirada antes da eleição)';
}

const ganhou = c => c.resultado === 'Vitória' || c.resultado === 'Reeleito';
const selo = c => `<span class="selo selo-${c.resultado === 'Derrota' ? 'derrota' : ganhou(c) ? 'vitoria' : 'neutro'}">${c.resultado === 'Derrota' ? '× derrota' : c.resultado}</span>`;

function resumo(cands) {
  const anos = cands.map(c => c.ano);
  const vit = cands.filter(ganhou).length;
  return {
    periodo: Math.min(...anos) === Math.max(...anos) ? Math.min(...anos) : `${Math.min(...anos)}–${Math.max(...anos)}`,
    candidaturas: cands.length, vitorias: vit, derrotas: cands.filter(c => c.resultado === 'Derrota').length,
    reeleicoes: cands.filter(c => c.resultado === 'Reeleito').length,
    cargos: new Set(cands.map(c => c.cargo)).size, partidos: new Set(cands.map(c => c.sigla)).size,
    taxa: formata.pct((100 * vit) / cands.length),
  };
}

/** A ficha em forma de santinho: o número grande são as vitórias; o verso diz o que a ficha não cobre. */
function santinhoDoPolitico(cands, chaveFoto) {
  const r = resumo(cands);
  const ultima = cands.at(-1);
  return santinho({
    faixa: `${ultima.cargo.toLowerCase()} · ${ultima.local} · ${ultima.ano}`,
    numero: r.vitorias,
    rotulo: `${r.vitorias === 1 ? 'vitória' : 'vitórias'} em ${r.candidaturas} ${r.candidaturas === 1 ? 'candidatura' : 'candidaturas'}, ${r.periodo}.`,
    linhas: [['Derrotas', r.derrotas], ['Reeleições', r.reeleicoes], ['Cargos diferentes', r.cargos],
             ['Partidos diferentes', r.partidos], ['Taxa de vitória', r.taxa]],
    verso: `<p>As candidaturas de uma mesma pessoa são ligadas pelo título eleitoral, que o TSE só publica de 1998 em diante.
      As de 1994 e 1996 entram pelo nome e pela data de nascimento, só quando batem com uma única pessoa.
      O título e o CPF não são publicados aqui.</p>
      <p>Votos, patrimônio, receitas e despesas só existem a partir de 2018. Candidaturas que não chegaram à eleição costumam
      não ter resultado nem prestação de contas.</p>`,
    fonte: 'p10b_resumo_carreira.sql',
    classe: r.vitorias ? '' : 'santinho-derrota',
    foto: fotoCandidato(chaveFoto, 'santinho-foto'),
  });
}

// ---------------------------------------------------------------- linha do tempo de santinhos

const linhaCartao = (rotulo, valor) => `<div><dt>${rotulo}</dt><dd>${valor}</dd></div>`;
const falta = t => `<span class="sem-info">${t}</span>`;

/** Um santinho pequeno por eleição: com foto de 2004 em diante (quando o TSE tem) e, de 2018 em diante, com os números. */
function cartao(c) {
  const recente = c.ano >= 2018;
  const porVoto = custoPorVoto(c.despesa, c.votos);
  const numero = recente && c.votos > 0 ? formata.numero(c.votos) : '';
  return `<li class="cartao-eleicao${ganhou(c) ? '' : c.resultado === 'Derrota' ? ' cartao-derrota' : ' cartao-neutro'}">
    <div class="cartao-faixa"><b>${c.ano}</b> ${c.cargo.toLowerCase()}</div>
    <div class="cartao-corpo">
      ${c.foto_sq ? fotoCandidato(`${c.ano}/${c.foto_sq}/${c.ue}`, 'cartao-foto') : ''}
      <p class="cartao-onde">${c.local} · <b>${c.sigla}</b></p>
      ${selo(c)}
      ${numero ? `<p class="cartao-votos"><strong>${numero}</strong> votos</p>` : ''}
      ${recente ? `<dl class="cartao-linhas">
        ${linhaCartao('Gasto', c.despesa ? formata.real(c.despesa) : falta('nenhum declarado'))}
        ${linhaCartao('Custo por voto', porVoto == null ? falta(c.votos > 0 ? 'sem gasto' : 'sem votos') : formata.porVoto(porVoto))}
        ${linhaCartao('Patrimônio', c.patrimonio ? formata.real(c.patrimonio) : falta('nenhum bem'))}
        ${linhaCartao('Dinheiro público', c.receita ? formata.pct((100 * (c.receita_publica ?? 0)) / c.receita) : falta('sem receita'))}
      </dl>` : ''}
      ${c.resultado === 'Resultado não informado' ? `<p class="apoio cartao-nota">${motivoSemResultado(c)}.</p>` : ''}
      ${c.ano < 1998 ? '<p class="apoio cartao-nota">Ligada pelo nome e pela data de nascimento: o TSE não publica o título eleitoral antes de 1998.</p>' : ''}
    </div>
  </li>`;
}

function linhaDoTempo(cands) {
  const antes = cands.filter(c => c.ano < 2018), depois = cands.filter(c => c.ano >= 2018);
  // uma nota só, no ponto em que os dados mudam, em vez de repetir a falta em cada cartão antigo
  const marco = antes.length && depois.length ? `<li class="marco-2018"><b>2018</b>
    <span>Daqui em diante o TSE publica votos, gasto e patrimônio de cada candidatura.</span></li>` : '';
  const nota = antes.length && !depois.length ? `<p class="apoio">Votos, gasto e patrimônio só existem de 2018 em diante; as
    candidaturas deste político são todas anteriores.</p>` : '';
  return `${nota}${cands.length > 1 ? '<p class="apoio dica-rolar">Arraste para o lado para ver as outras eleições →</p>' : ''}<ol class="linha-cartoes" aria-label="Uma eleição por cartão, da mais antiga à mais recente">
    ${antes.map(cartao).join('')}${marco}${depois.map(cartao).join('')}</ol>`;
}

// ---------------------------------------------------------------- trajetória ideológica

function graficoIdeologia(cands, largura) {
  const comNota = cands.filter(c => c.nota != null);
  if (comNota.length < 2) return null;
  const estreito = largura < 600;
  return Plot.plot({
    width: Math.max(540, Math.min(1080, largura)), height: 210, marginLeft: estreito ? 96 : 110, marginRight: 30,
    style: { fontFamily: 'Archivo, sans-serif', fontSize: estreito ? '12px' : '13px', background: 'transparent' },
    x: { domain: [1993, 2025], ticks: [1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022], tickFormat: d => String(d), label: null },
    y: { domain: [0, 10], ticks: [0, 5, 10], tickFormat: v => ({ 0: 'esquerda (0)', 5: 'centro (5)', 10: 'direita (10)' })[v], label: null, grid: true },
    marks: [
      Plot.line(comNota, { x: 'ano', y: 'nota', stroke: COR.tecla, strokeWidth: 2.5, curve: 'step-after' }),
      Plot.dot(comNota, { x: 'ano', y: 'nota', r: 6, fill: c => corIdeologia(c.nota), stroke: COR.tecla, strokeWidth: 1.5,
                          title: c => `${c.ano}: ${c.sigla}, nota ${String(c.nota).replace('.', ',')}` }),
      // a sigla só aparece quando o partido muda, para os rótulos não se sobreporem
      Plot.text(comNota.filter((c, i) => i === 0 || c.sigla !== comNota[i - 1].sigla),
                { x: 'ano', y: 'nota', text: 'sigla', dy: -13, fontWeight: 700 }),
    ],
  });
}

// ---------------------------------------------------------------- tabela

const dinheiro = v => (v == null ? '' : formata.real(v));

/** Votos, patrimônio, receita, parcela pública, despesa e custo por voto; quando falta, diz por quê. As
 *  candidaturas anteriores a 2018 seguidas dividem uma célula só com o aviso. */
function celulasNumeros(c, i, cands) {
  if (c.ano < 2018) {
    if (i > 0 && cands[i - 1].ano < 2018) return '';
    let n = 1;
    while (cands[i + n]?.ano < 2018) n += 1;
    return `<td colspan="6"${n > 1 ? ` rowspan="${n}"` : ''} class="sem-info-linha">${falta('Votos, patrimônio, receitas e despesas só existem de 2018 em diante.')}</td>`;
  }
  const porVoto = custoPorVoto(c.despesa, c.votos);
  return `<td class="num">${c.votos > 0 ? formata.numero(c.votos) : falta('sem votos')}</td>
    <td class="num">${c.patrimonio ? dinheiro(c.patrimonio) : falta('nenhum bem declarado')}</td>
    <td class="num">${c.receita ? dinheiro(c.receita) : falta('nenhuma receita declarada')}</td>
    <td class="num">${c.receita ? formata.pct((100 * (c.receita_publica ?? 0)) / c.receita) : falta('sem receita')}</td>
    <td class="num">${c.despesa ? dinheiro(c.despesa) : falta('nenhuma despesa declarada')}</td>
    <td class="num">${porVoto == null ? falta('—') : formata.porVoto(porVoto)}</td>`;
}

// ---------------------------------------------------------------- ficha

async function abre(id) {
  ficha.hidden = false;
  ficha.innerHTML = '<p class="apoio">Carregando a carreira…</p>';
  let dados;
  try { dados = await carreiraDe(id); } catch { dados = null; }
  if (!dados) { naoEncontrado(); return; }
  const { nome, cands } = dados;
  cands.forEach(c => { c.resultado = resultado(c); });
  document.title = `${nome} · Olho do Povo`;
  ficha.innerHTML = `
    <h2 class="ficha-nome">${nome}</h2>
    <div class="ficha-cabeca">
      ${santinhoDoPolitico(cands, dados.foto)}
      <section aria-labelledby="t-ideo" id="s-ideo">
        <h3 id="t-ideo">Para que lado foram os partidos dele</h3>
        <p class="apoio">Nota dada por especialistas a cada partido pelo qual concorreu, de 0 (esquerda) a 10 (direita), na cor
          da posição: vermelho à esquerda, azul à direita.</p>
        <p class="apoio" id="ideo-faltas" hidden></p>
        <div id="g-ideo" class="grafico rola"></div>
      </section>
    </div>
    <section class="bloco-ficha" aria-labelledby="t-linha">
      <h3 id="t-linha">Linha do tempo</h3>
      ${linhaDoTempo(cands)}
    </section>
    <section class="bloco-ficha" aria-labelledby="t-tabela">
      <h3 id="t-tabela">Todas as candidaturas</h3>
      <p class="apoio">Votos do 1º turno. A parcela pública é a receita vinda do fundo eleitoral e do Fundo Partidário; o custo por
        voto divide a despesa pelos votos. Candidaturas que não chegaram à eleição costumam não ter prestação de contas.</p>
      <div class="rolagem">
        <table class="tabela">
          <thead><tr><th>Ano</th><th>Cargo</th><th>Local</th><th>Partido</th><th>Resultado</th><th class="num">Votos</th>
            <th class="num">Patrimônio</th><th class="num">Receita</th><th class="num">Parcela pública</th><th class="num">Despesa</th>
            <th class="num">Custo por voto</th></tr></thead>
          <tbody>${cands.map((c, i) => `<tr>
            <td>${c.ano}</td><td>${c.cargo.toLowerCase()}</td><td>${c.local}</td><td>${c.sigla}</td>
            <td>${selo(c)} <span class="apoio situacao">${c.situacao === 'SEM SITUAÇÃO' ? motivoSemResultado(c) : c.situacao.toLowerCase()}${c.ano < 1998 ? '; ligada pelo nome e nascimento' : ''}</span></td>
            ${celulasNumeros(c, i, cands)}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
  const caixaIdeo = document.getElementById('g-ideo');
  const ideo = graficoIdeologia(cands, caixaIdeo.clientWidth || 600);
  // partidos sem nota: extintos antes da pesquisa com especialistas (2018 e 2022)
  const semNota = [...new Set(cands.filter(c => c.nota == null).map(c => `${c.sigla} (${c.ano})`))];
  if (semNota.length) {
    const aviso = document.getElementById('ideo-faltas');
    aviso.hidden = false;
    aviso.textContent = `Sem nota dos especialistas, por serem partidos extintos ou criados fora das pesquisas de 2018 e 2022: ${semNota.join(', ')}.`;
  }
  if (ideo) caixaIdeo.append(ideo);
  else caixaIdeo.innerHTML = '<p class="apoio">Notas insuficientes para traçar a trajetória.</p>';
  ficha.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

const TITULO = document.title;
function naoEncontrado() {
  document.title = TITULO;
  ficha.hidden = false;
  ficha.innerHTML = '<p class="aviso-vazio">Esse político não foi encontrado. Faça uma nova busca.</p>';
}

function rotaAtual() {
  const id = Number(location.hash.slice(1));
  if (Number.isInteger(id) && id > 0) abre(id);
  else if (location.hash.length > 1) naoEncontrado();
}
addEventListener('hashchange', rotaAtual);
rotaAtual();
