// Busca de políticos por nome e leitura da carreira, usadas pelas perguntas 9 e 10 e pela cabine do oráculo.
//
// Os dados vêm em três tipos de arquivo (gerados por gera_dados.py):
//   politicos/indice/ABC.json   palavras que começam com ABC -> números dos políticos
//                               (em diferenças: [5, 4, 21] = 5, 9, 30)
//   politicos/fichas/N.json     nome, UF, último cargo, anos e vitórias, 2.000 por arquivo
//   politicos/carreira/N.json   candidaturas, 1.000 políticos por arquivo
// A busca baixa só as fatias e fichas necessárias; abrir um político baixa uma carreira.
import { carregaDados, formata, fotoCandidato } from './comum.js?v=20261157';

const LIMITE_RESULTADOS = 30;
export const tabelasPoliticos = () => carregaDados('politicos/tabelas.json');

/** Mesma normalização do gerador: sem acentos, maiúsculas, só letras. */
async function palavrasDoNome(texto) {
  const ignoradas = new Set((await tabelasPoliticos()).palavras_ignoradas);
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
  const tabelas = await tabelasPoliticos();
  const porArquivo = Map.groupBy(ids, id => Math.floor((id - 1) / tabelas.por_ficha));
  const lidas = await Promise.all([...porArquivo.keys()].map(n => carregaDados(`politicos/fichas/${n}.json`)));
  const todas = Object.assign({}, ...lidas);
  return ids.map(id => ({ id, ...Object.fromEntries(tabelas.campos_ficha.map((c, i) => [c, todas[id][i]])) }));
}

/** As fichas dos políticos com todas as palavras de `texto` no nome (no máximo 400, pelos números), ou null quando o
 *  texto não tem palavra que sirva para buscar. */
export async function procuraPoliticos(texto) {
  const termos = await palavrasDoNome(texto);
  if (!termos.length) return null;
  const conjuntos = await Promise.all(termos.map(idsPorPrefixo));
  conjuntos.sort((a, b) => a.size - b.size);
  const ids = [...conjuntos[0]].filter(id => conjuntos.every(c => c.has(id))).sort((a, b) => a - b);
  return fichas(ids.slice(0, 400));
}

/** Liga o campo de busca do formulário à lista de resultados em `caixa`. Cada resultado é um link para
 *  hrefDe(ficha); `filtro(ficha)` esconde quem não serve à página (por exemplo, sem candidatura recente). */
export function montaBusca(form, caixa, { hrefDe = f => `#${f.id}`, filtro = () => true, vazio = '' } = {}) {
  const campo = form.querySelector('input[type="search"]');
  let atual = 0;
  async function busca(texto) {
    const minha = ++atual;
    const todas = await procuraPoliticos(texto);
    if (minha !== atual) return;                    // o usuário já digitou outra coisa
    if (!todas) { caixa.innerHTML = vazio; return; }
    const tabelas = await tabelasPoliticos();
    const achados = todas.filter(filtro);
    if (!achados.length) {
      caixa.innerHTML = '<p class="apoio">Nenhum político com esse nome. Confira a grafia ou use outra palavra do nome.</p>';
      return;
    }
    const mostrados = achados.slice(0, LIMITE_RESULTADOS);
    const extra = achados.length > LIMITE_RESULTADOS
      ? `<p class="apoio">Mostrando ${LIMITE_RESULTADOS} de ${formata.numero(achados.length)}. Acrescente outra palavra do nome para refinar.</p>` : '';
    caixa.innerHTML = `
      <ul class="resultados">${mostrados.map(f => `
        <li><a href="${hrefDe(f)}">
          <span class="santinho-faixa">${tabelas.cargos[f.ultimo_cargo].toLowerCase()} · ${f.uf}</span>
          <span class="resultado-corpo">${fotoCandidato(f.foto, 'resultado-foto')}<span class="resultado-texto">
            <span class="resultado-nome">${f.nome}</span>
            <span class="resultado-meta">${f.primeiro_ano === f.ultimo_ano ? f.primeiro_ano : `${f.primeiro_ano} a ${f.ultimo_ano}`}, ${f.vitorias} ${f.vitorias === 1 ? 'vitória' : 'vitórias'}</span>
          </span></span>
        </a></li>`).join('')}
      </ul>${extra}`;
  }
  let espera;
  campo.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => busca(campo.value), 250); });
  form.addEventListener('submit', e => { e.preventDefault(); busca(campo.value); });
  return { limpa: () => { campo.value = ''; caixa.innerHTML = vazio; } };
}

/** A carreira de um político: { nome, foto, cands }, cada candidatura com cargo, situação e sigla por extenso,
 *  `ue` (UF, BR ou código do município) e as notas ideológicas do partido no ano. */
export async function carreiraDe(id) {
  const tabelas = await tabelasPoliticos();
  const lote = await carregaDados(`politicos/carreira/${Math.floor((id - 1) / tabelas.por_arquivo)}.json`);
  if (!lote[id]) return null;
  const [nome, linhas, foto] = lote[id];
  const cands = linhas.map(l => {
    const c = Object.fromEntries(tabelas.campos_candidatura.map((campo, i) => [campo, l[i] ?? null]));
    const notas = tabelas.notas[`${c.partido}|${c.ano}`] ?? [null, null];
    return {
      ...c, ue: c.local, cargo: tabelas.cargos[c.cargo], situacao: tabelas.situacoes[c.situacao],
      sigla: tabelas.partidos[c.partido], local: tabelas.municipios[c.local] ?? (c.local === 'BR' ? 'Brasil' : c.local),
      eleito: tabelas.eleito.includes(tabelas.situacoes[c.situacao]), nota: notas[0], camara: notas[1],
    };
  });
  return { nome, cands, foto };
}
