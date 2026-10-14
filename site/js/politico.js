// Página Político (pergunta 10): busca por nome e carreira de 1998 a 2024.
//
// Os dados vêm em três tipos de arquivo (gerados por gera_dados.py):
//   politicos/indice/ABC.json   palavras que começam com ABC -> números dos políticos
//                               (em diferenças: [5, 4, 21] = 5, 9, 30)
//   politicos/fichas/N.json     nome, UF, último cargo, anos e vitórias, 2.000 por arquivo
//   politicos/carreira/N.json   candidaturas, 1.000 políticos por arquivo
// A busca baixa só as fatias e fichas necessárias; abrir um político baixa uma carreira.
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/+esm';
import { montaPagina, carregaDados, formata, santinho } from './comum.js?v=20261013';

montaPagina();

const LIMITE_RESULTADOS = 30;
const ORDEM_CARGOS = ['PRESIDENTE', 'VICE-PRESIDENTE', 'GOVERNADOR', 'VICE-GOVERNADOR', 'SENADOR',
  '1º SUPLENTE SENADOR', '1º SUPLENTE', '2º SUPLENTE SENADOR', '2º SUPLENTE', 'DEPUTADO FEDERAL',
  'DEPUTADO ESTADUAL', 'PREFEITO', 'VICE-PREFEITO', 'VEREADOR'];
const COR_RESULTADO = { 'Vitória': '#00a651', 'Reeleito': '#00a651', 'Derrota': '#f26522', 'Candidatura não concluída': '#9a8f7a',
  'Resultado não informado': '#e8dcc4' };

const campo = document.getElementById('campo-busca');
const caixaResultados = document.getElementById('resultados');
const ficha = document.getElementById('ficha');
const tabelas = await carregaDados('politicos/tabelas.json');
const ignoradas = new Set(tabelas.palavras_ignoradas);

/** Mesma normalização do gerador: sem acentos, maiúsculas, só letras. */
function palavras(texto) {
  return texto.normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z ]+/g, ' ').split(' ').filter(p => p.length >= 3 && !ignoradas.has(p));
}

function somaDiferencas(lista) {
  let acumulado = 0;
  return lista.map(d => (acumulado += d));
}

/** Números dos políticos com alguma palavra do nome começando por `prefixo`. */
async function idsPorPrefixo(prefixo) {
  let fatia;
  try { fatia = await carregaDados(`politicos/indice/${prefixo.slice(0, 3)}.json`); }
  catch { return new Set(); }                      // nenhuma palavra com essas três letras
  const ids = new Set();
  for (const [palavra, lista] of Object.entries(fatia)) {
    if (palavra.startsWith(prefixo)) somaDiferencas(lista).forEach(id => ids.add(id));
  }
  return ids;
}

async function fichas(ids) {
  const porArquivo = Map.groupBy(ids, id => Math.floor((id - 1) / tabelas.por_ficha));
  const lidas = await Promise.all([...porArquivo.keys()].map(n => carregaDados(`politicos/fichas/${n}.json`)));
  const todas = Object.assign({}, ...lidas);
  return ids.map(id => ({ id, ...Object.fromEntries(tabelas.campos_ficha.map((c, i) => [c, todas[id][i]])) }));
}

let buscaAtual = 0;
async function busca(texto) {
  const termos = palavras(texto);
  if (!termos.length) { caixaResultados.replaceChildren(); return; }
  const minha = ++buscaAtual;
  const conjuntos = await Promise.all(termos.map(idsPorPrefixo));
  if (minha !== buscaAtual) return;                 // o usuário já digitou outra coisa
  conjuntos.sort((a, b) => a.size - b.size);
  const ids = [...conjuntos[0]].filter(id => conjuntos.every(c => c.has(id))).sort((a, b) => a - b);
  if (!ids.length) {
    caixaResultados.innerHTML = '<p class="apoio">Nenhum político com esse nome. Confira a grafia ou use outra palavra do nome.</p>';
    return;
  }
  const mostrados = await fichas(ids.slice(0, LIMITE_RESULTADOS));
  if (minha !== buscaAtual) return;
  const extra = ids.length > LIMITE_RESULTADOS
    ? `<p class="apoio">Mostrando ${LIMITE_RESULTADOS} de ${formata.numero(ids.length)}. Acrescente outra palavra do nome para refinar.</p>` : '';
  caixaResultados.innerHTML = `
    <ul class="resultados">${mostrados.map(f => `
      <li><a href="#${f.id}">
        <span class="santinho-faixa">${tabelas.cargos[f.ultimo_cargo].toLowerCase()} · ${f.uf}</span>
        <span class="resultado-nome">${f.nome}</span>
        <span class="resultado-meta">${f.primeiro_ano === f.ultimo_ano ? f.primeiro_ano : `${f.primeiro_ano} a ${f.ultimo_ano}`}, ${f.vitorias} ${f.vitorias === 1 ? 'vitória' : 'vitórias'}</span>
      </a></li>`).join('')}
    </ul>${extra}`;
}

let espera;
campo.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => busca(campo.value), 250); });
document.getElementById('form-busca').addEventListener('submit', e => { e.preventDefault(); busca(campo.value); });

// ---------------------------------------------------------------- carreira

function resultado(c) {
  const eleito = tabelas.eleito.includes(c.situacao);
  if (eleito && c.reeleicao) return 'Reeleito';
  if (eleito) return 'Vitória';
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

function local(codigo) {
  return tabelas.municipios[codigo] ?? (codigo === 'BR' ? 'Brasil' : codigo);
}

async function carreira(id) {
  const lote = await carregaDados(`politicos/carreira/${Math.floor((id - 1) / tabelas.por_arquivo)}.json`);
  const [nome, linhas] = lote[id];
  const cands = linhas.map(l => {
    const c = Object.fromEntries(tabelas.campos_candidatura.map((campo, i) => [campo, l[i] ?? null]));
    const notas = tabelas.notas[`${c.partido}|${c.ano}`] ?? [null, null];
    return {
      ...c, cargo: tabelas.cargos[c.cargo], situacao: tabelas.situacoes[c.situacao],
      sigla: tabelas.partidos[c.partido], local: local(c.local),
      nota: notas[0], camara: notas[1],
    };
  });
  cands.forEach(c => { c.resultado = resultado(c); });
  return { nome, cands };
}

function resumo(cands) {
  const anos = cands.map(c => c.ano);
  const vit = cands.filter(c => c.resultado === 'Vitória' || c.resultado === 'Reeleito').length;
  const der = cands.filter(c => c.resultado === 'Derrota').length;
  return [
    ['Período', Math.min(...anos) === Math.max(...anos) ? Math.min(...anos) : `${Math.min(...anos)}–${Math.max(...anos)}`],
    ['Anos de carreira', Math.max(...anos) - Math.min(...anos)],
    ['Candidaturas', cands.length],
    ['Vitórias', vit],
    ['Derrotas', der],
    ['Reeleições', cands.filter(c => c.resultado === 'Reeleito').length],
    ['Cargos diferentes', new Set(cands.map(c => c.cargo)).size],
    ['Partidos diferentes', new Set(cands.map(c => c.sigla)).size],
    ['Taxa de vitória', formata.pct(100 * vit / cands.length)],
  ];
}

/** Largura e margens das linhas do tempo, medidas no próprio quadro. No celular o gráfico mantém uma
 *  largura mínima legível e rola para o lado. */
function medidas(alvo) {
  const disponivel = document.getElementById(alvo).clientWidth;
  const estreito = disponivel < 600;
  return {
    width: Math.max(540, Math.min(1080, disponivel)), marginLeft: estreito ? 128 : 170, marginRight: 30,
    style: { fontFamily: 'Archivo, sans-serif', fontSize: estreito ? '12px' : '13px', background: 'transparent' },
  };
}

function grafico(cands) {
  const cargos = ORDEM_CARGOS.filter(c => cands.some(d => d.cargo === c));
  return Plot.plot({
    ...medidas('g-linha'),
    height: 70 + 46 * cargos.length, marginTop: 30,
    x: { domain: [1997, 2025], ticks: [1998, 2002, 2006, 2010, 2014, 2018, 2022], tickFormat: d => String(d), label: null, grid: true },
    y: { domain: cargos, label: null, tickFormat: c => c.toLowerCase() },
    marks: [
      Plot.ruleY(cargos, { stroke: '#c9b994' }),
      Plot.dot(cands, { x: 'ano', y: 'cargo', r: 9, fill: c => COR_RESULTADO[c.resultado], stroke: c => (c.resultado === 'Derrota' ? '#f26522' : '#22201c'),
                        strokeWidth: c => (c.resultado === 'Derrota' ? 3.5 : 1.5),
                        symbol: c => (c.resultado === 'Reeleito' ? 'diamond2' : c.resultado === 'Derrota' ? 'times' : 'circle'),
                        title: c => `${c.ano}: ${c.cargo.toLowerCase()}, ${c.local}, ${c.sigla}\n${c.resultado} (${c.situacao === 'SEM SITUAÇÃO' ? motivoSemResultado(c) : c.situacao.toLowerCase()})` }),
      Plot.text(cands, { x: 'ano', y: 'cargo', text: 'sigla', dy: -17, fontWeight: 700 }),
    ],
  });
}

function graficoIdeologia(cands) {
  const comNota = cands.filter(c => c.nota != null);
  if (comNota.length < 2) return null;
  return Plot.plot({
    ...medidas('g-ideo'),
    height: 200,
    x: { domain: [1997, 2025], ticks: [1998, 2002, 2006, 2010, 2014, 2018, 2022], tickFormat: d => String(d), label: null },
    y: { domain: [0, 10], ticks: [0, 5, 10], tickFormat: v => ({ 0: 'esquerda (0)', 5: 'centro (5)', 10: 'direita (10)' })[v], label: null, grid: true },
    marks: [
      Plot.line(comNota, { x: 'ano', y: 'nota', stroke: '#22201c', strokeWidth: 2.5, curve: 'step-after' }),
      Plot.dot(comNota, { x: 'ano', y: 'nota', r: 5, fill: '#00a651', stroke: '#22201c',
                          title: c => `${c.ano}: ${c.sigla}, nota ${String(c.nota).replace('.', ',')}` }),
      // a sigla só aparece quando o partido muda, para os rótulos não se sobreporem
      Plot.text(comNota.filter((c, i) => i === 0 || c.sigla !== comNota[i - 1].sigla),
                { x: 'ano', y: 'nota', text: 'sigla', dy: -12, fontWeight: 700 }),
    ],
  });
}

/** A ficha em forma de santinho: o número grande são as vitórias; o verso diz o que a ficha não cobre. */
function santinhoDoPolitico(cands) {
  const r = Object.fromEntries(resumo(cands));
  const ultima = cands.at(-1);
  return santinho({
    faixa: `${ultima.cargo.toLowerCase()} · ${ultima.local} · ${ultima.ano}`,
    numero: r['Vitórias'],
    rotulo: `${r['Vitórias'] === 1 ? 'vitória' : 'vitórias'} em ${r['Candidaturas']} ${r['Candidaturas'] === 1 ? 'candidatura' : 'candidaturas'}, ${r['Período']}.`,
    linhas: [['Derrotas', r['Derrotas']], ['Reeleições', r['Reeleições']], ['Cargos diferentes', r['Cargos diferentes']],
             ['Partidos diferentes', r['Partidos diferentes']], ['Taxa de vitória', r['Taxa de vitória']]],
    verso: `<p>As candidaturas de uma mesma pessoa são ligadas pelo título eleitoral, que o TSE só publica de 1998 em diante.
      O título e o CPF não são publicados aqui.</p>
      <p>Patrimônio, receitas e despesas só existem a partir de 2018. Candidaturas que não chegaram à eleição costumam
      não ter resultado nem prestação de contas.</p>`,
    fonte: 'p10b_resumo_carreira.sql',
    classe: r['Vitórias'] ? '' : 'santinho-derrota',
  });
}

const dinheiro = v => (v == null ? '' : formata.real(v));
const faltou = texto => `<span class="sem-info">${texto}</span>`;

/** Patrimônio, receita, parcela pública e despesa; quando falta, diz por quê. As candidaturas
 *  anteriores a 2018 seguidas dividem uma célula só com o aviso, em vez de repeti-lo em cada linha. */
function celulasFinanceiras(c, i, cands) {
  if (c.ano < 2018) {
    if (i > 0 && cands[i - 1].ano < 2018) return '';
    let n = 1;
    while (cands[i + n]?.ano < 2018) n += 1;
    return `<td colspan="4"${n > 1 ? ` rowspan="${n}"` : ''} class="sem-info-linha">${faltou('Dados de patrimônio, receitas e despesas só existem de 2018 em diante.')}</td>`;
  }
  const patrimonio = c.patrimonio ? dinheiro(c.patrimonio) : faltou('nenhum bem declarado');
  const receita = c.receita ? dinheiro(c.receita) : faltou('nenhuma receita declarada');
  const publica = c.receita ? formata.pct(100 * (c.receita_publica ?? 0) / c.receita) : faltou('sem receita');
  const despesa = c.despesa ? dinheiro(c.despesa) : faltou('nenhuma despesa declarada');
  return `<td class="num">${patrimonio}</td><td class="num">${receita}</td><td class="num">${publica}</td><td class="num">${despesa}</td>`;
}

async function abre(id) {
  ficha.hidden = false;
  ficha.innerHTML = '<p class="apoio">Carregando a carreira…</p>';
  let dados;
  try { dados = await carreira(id); }
  catch { ficha.innerHTML = '<p class="apoio">Esse político não foi encontrado. Faça uma nova busca.</p>'; return; }
  const { nome, cands } = dados;
  document.title = `${nome} · Tá no Olho do Povo`;
  ficha.innerHTML = `
    <h2 class="ficha-nome">${nome}</h2>
    <div class="ficha-cabeca">
    ${santinhoDoPolitico(cands)}
    <section aria-labelledby="t-linha">
      <h3 id="t-linha">Linha do tempo</h3>
      <p class="legenda-grafico">
        <span class="chave" style="--cor:#00a651">vitória</span>
        <span class="chave chave-losango" style="--cor:#00a651">reeleição</span>
        <span class="chave chave-x" style="--cor:#f26522">derrota</span>
        <span class="chave" style="--cor:#9a8f7a">não concluída</span>
        <span class="chave chave-anel" style="--cor:#22201c">resultado não informado</span>
      </p>
      <div id="g-linha" class="grafico rola"></div>
    </section>
    </div>
    <section class="bloco-ficha" aria-labelledby="t-ideo" id="s-ideo">
      <h3 id="t-ideo">Posição ideológica do partido</h3>
      <p class="apoio">Nota dada por especialistas a cada partido pelo qual concorreu, de 0 (esquerda) a 10 (direita).</p>
      <p class="apoio" id="ideo-faltas" hidden></p>
      <div id="g-ideo" class="grafico rola"></div>
    </section>
    <section class="bloco-ficha" aria-labelledby="t-tabela">
      <h3 id="t-tabela">Todas as candidaturas</h3>
      <p class="apoio">Patrimônio, receitas e despesas existem a partir de 2018. A parcela pública é a receita vinda do fundo eleitoral e do Fundo Partidário. Candidaturas que não chegaram à eleição costumam não ter prestação de contas.</p>
      <div class="rolagem">
        <table class="tabela">
          <thead><tr><th>Ano</th><th>Cargo</th><th>Local</th><th>Partido</th><th>Resultado</th>
            <th class="num">Patrimônio</th><th class="num">Receita</th><th class="num">Parcela pública</th><th class="num">Despesa</th></tr></thead>
          <tbody>${cands.map((c, i) => `<tr>
            <td>${c.ano}</td><td>${c.cargo.toLowerCase()}</td><td>${c.local}</td><td>${c.sigla}</td>
            <td><span class="selo selo-${c.resultado === 'Derrota' ? 'derrota' : ['Vitória', 'Reeleito'].includes(c.resultado) ? 'vitoria' : 'neutro'}">${c.resultado}</span>
              <span class="apoio situacao">${c.situacao === 'SEM SITUAÇÃO' ? motivoSemResultado(c) : c.situacao.toLowerCase()}</span></td>
            ${celulasFinanceiras(c, i, cands)}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
  document.getElementById('g-linha').append(grafico(cands));
  const ideo = graficoIdeologia(cands);
  // partidos sem nota: extintos antes da pesquisa com especialistas (2018 e 2022)
  const semNota = [...new Set(cands.filter(c => c.nota == null).map(c => `${c.sigla} (${c.ano})`))];
  if (semNota.length) {
    const aviso = document.getElementById('ideo-faltas');
    aviso.hidden = false;
    aviso.textContent = `Sem nota dos especialistas, por serem partidos extintos ou criados fora das pesquisas de 2018 e 2022: ${semNota.join(', ')}.`;
  }
  if (ideo) document.getElementById('g-ideo').append(ideo);
  else if (!semNota.length) document.getElementById('s-ideo').hidden = true;
  else document.getElementById('g-ideo').innerHTML = '<p class="apoio">Notas insuficientes para traçar a trajetória.</p>';
  ficha.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function rotaAtual() {
  const id = Number(location.hash.slice(1));
  if (Number.isInteger(id) && id > 0) abre(id);
}
window.addEventListener('hashchange', rotaAtual);
rotaAtual();
