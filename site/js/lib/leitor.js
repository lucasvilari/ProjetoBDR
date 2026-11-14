// O leitor de pedidos do oráculo: antes de responder, o olhinho procura na pergunta do leitor um ano, um cargo, um estado,
// um município ou o Brasil e, se a página tiver esse recorte, muda a página para ele. Assim o leitor confere na tela os
// números que a IA leu. Tudo aqui é texto e regra fixa, sem IA: o que não está claro na pergunta fica como está.

const ORDEM_CARGOS = ['PRESIDENTE', 'GOVERNADOR', 'SENADOR', 'DEPUTADO FEDERAL', 'DEPUTADO ESTADUAL', 'PREFEITO', 'VEREADOR'];
// cada cargo pelo jeito de escrever na pergunta (sem acento e em minúsculas); "deputado" sozinho não diz qual
const CARGOS = {
  PRESIDENTE: /\bpresiden(te|ta|tes|cia|cial|ciais)\b/,
  GOVERNADOR: /\bgovernador(a|es|as)?\b|\bgoverno do estado\b/,
  SENADOR: /\bsenador(a|es|as)?\b|\bsenado\b/,
  'DEPUTADO FEDERAL': /\bdeputad[oa]s? federa(l|is)\b|\bcamara dos deputados\b/,
  'DEPUTADO ESTADUAL': /\bdeputad[oa]s? estadua(l|is)\b|\bassembleia legislativa\b/,
  PREFEITO: /\bprefeit(o|a|os|as|ura|uras)\b/,
  VEREADOR: /\bvereador(a|es|as)?\b|\bcamara municipal\b/,
};
const UFS = { AP: /\bamapa\b/, MG: /\bminas( gerais)?\b/, MS: /\bmato grosso do sul\b/, PB: /\bparaiba\b/, RO: /\brondonia\b/, RR: /\broraima\b/ };
const NOMES_UF = ['amapa', 'minas gerais', 'mato grosso do sul', 'paraiba', 'rondonia', 'roraima'];
const NOME_CARGO = c => c.toLowerCase();
const LOCATIVO = /(?:\b(?:em|no|na|nos|nas)|\b(?:municipio|cidade|prefeitura|prefeit[oa]s?|vereador(?:a|es|as)?|camara|eleitores|eleitorado) d[eoa]s?)\s+$/;

/** Tira os acentos sem mudar o tamanho do texto (cada letra continua no mesmo lugar). */
const semAcento = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const escapa = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** O que a pergunta cita: { anos, cargos, ufs, municipios: [{cod, nome, uf}], ambiguos: [nomes], brasil }.
 *  `municipios`: [[cod, nome, uf]]. Um município só conta escrito com maiúscula ("Esperança", não "esperança") e, se o
 *  nome tem uma palavra só, depois de "em", "no", "na" ou de "município de", "prefeito de" e parecidos; o
 *  trecho dele sai do texto antes de procurar cargos, para "Governador Valadares" não virar governador. */
export function achaNoTexto(texto, municipios = []) {
  const original = semAcento(String(texto ?? ''));
  let baixo = original.toLowerCase();

  // os municípios: o nome inteiro, com maiúscula no começo; nomes iguais aos dos estados ficam para o estado
  const achados = [];
  for (const [cod, nome, uf] of municipios) {
    const chave = semAcento(nome).toLowerCase();
    if (chave.length < 3 || NOMES_UF.includes(chave)) continue;
    const re = new RegExp(`(?<![a-z0-9])${escapa(chave)}(?![a-z0-9])`, 'g');
    for (const m of baixo.matchAll(re)) {
      const letra = original[m.index];
      if (letra !== letra.toUpperCase() || letra === letra.toLowerCase()) continue;
      // nome de uma palavra só ("Oliveira", "Esperança") pode ser sobrenome ou palavra comum: precisa vir depois de
      // "em", "no", "na" ou de "município de", "prefeito de" e parecidos
      if (!chave.includes(' ') && !LOCATIVO.test(baixo.slice(0, m.index))) continue;
      achados.push({ cod, nome, uf, de: m.index, ate: m.index + chave.length });
    }
  }
  // um nome dentro de outro mais longo ("Grande" dentro de "Campo Grande") não conta, nem dentro do nome de um estado
  // ("Mato Grosso" dentro de "Mato Grosso do Sul"); um município mais longo que o estado ("Minas Novas") conta
  const estados = Object.values(UFS).flatMap(re => [...baixo.matchAll(new RegExp(re.source, 'g'))].map(m => ({ de: m.index, ate: m.index + m[0].length })));
  const dentro = (a, b) => b.de <= a.de && b.ate >= a.ate && b.ate - b.de > a.ate - a.de;
  const inteiros = achados.filter(a => !achados.some(b => b !== a && dentro(a, b)) && !estados.some(e => dentro(a, e)));
  for (const a of inteiros) baixo = baixo.slice(0, a.de) + ' '.repeat(a.ate - a.de) + baixo.slice(a.ate);

  const ufs = Object.keys(UFS).filter(uf => UFS[uf].test(baixo) || new RegExp(`\\b${uf}\\b`).test(original));
  // o mesmo nome em mais de um estado: vale o do estado citado; sem ele, não escolhe
  const porNome = new Map();
  for (const a of inteiros) porNome.set(a.nome, [...(porNome.get(a.nome) ?? []).filter(b => b.cod !== a.cod), a]);
  const municipiosAchados = [], ambiguos = [];
  for (const [nome, lista] of porNome) {
    const doEstado = lista.length > 1 ? lista.filter(a => ufs.includes(a.uf)) : lista;
    if (doEstado.length === 1) municipiosAchados.push({ cod: doEstado[0].cod, nome, uf: doEstado[0].uf });
    else ambiguos.push(nome);
  }

  return {
    anos: [...new Set([...baixo.matchAll(/\b(19[89]\d|20[0-4]\d)\b/g)].map(m => Number(m[1])))],
    cargos: ORDEM_CARGOS.filter(c => CARGOS[c].test(baixo)),
    ufs,
    municipios: municipiosAchados,
    ambiguos,
    brasil: /\b(brasil|nacional|pais|seis estados)\b/.test(baixo),
  };
}

/** O recorte novo que a pergunta pede numa página. `atual`: { ano, cargo?, uf?, mun? }. `opcoes`: { anos,
 *  cargosDoAno?: ano => cargos (sem ele, a página não tem cargo), lugar?: 'mun' | 'uf' (sem ele, a página não tem
 *  lugar), brasil?: a página aceita o Brasil inteiro }. Devolve { novo (null se nada muda), avisos }. */
export function recorteDoPedido(achados, atual, opcoes) {
  const { anos, cargosDoAno, lugar, brasil } = opcoes;
  const novo = { ...atual };
  const avisos = [];

  const anosValidos = achados.anos.filter(a => anos.includes(a));
  for (const a of achados.anos.filter(a => !anos.includes(a))) avisos.push(`Esta página não tem dados de ${a}.`);
  const anoDito = anosValidos.length ? Math.max(...anosValidos) : null;
  if (anoDito) novo.ano = anoDito;

  const cargo = cargosDoAno ? achados.cargos[0] : null;
  if (cargo) {
    if (cargosDoAno(novo.ano).includes(cargo)) novo.cargo = cargo;
    else if (anoDito) {
      // o cargo dito não existe no ano dito ("presidente em 2024"): não muda nem um nem outro, só avisa
      avisos.push(`Não houve eleição para ${NOME_CARGO(cargo)} em ${anoDito}.`);
      novo.ano = atual.ano;
    }
    else {
      // o ano do cargo: a última eleição dele que a página tem
      const ano = [...anos].reverse().find(a => cargosDoAno(a).includes(cargo));
      if (ano) { novo.ano = ano; novo.cargo = cargo; } else avisos.push(`Esta página não mostra ${NOME_CARGO(cargo)}.`);
    }
  }

  if (lugar) {
    const mun = achados.municipios[0];
    if (mun) {
      novo.uf = mun.uf;
      if (lugar === 'mun') novo.mun = mun.cod; else delete novo.mun;
    } else if (achados.ufs.length) {
      if (novo.uf !== achados.ufs[0]) delete novo.mun;
      novo.uf = achados.ufs[0];
    } else if (achados.brasil && brasil) {
      delete novo.uf; delete novo.mun;
    }
    for (const nome of achados.ambiguos) avisos.push(`Há mais de um município chamado ${nome}: diga também o estado.`);
  }

  const chaves = new Set([...Object.keys(atual), ...Object.keys(novo)]);
  const mudou = [...chaves].some(k => atual[k] !== novo[k]);
  return { novo: mudou ? novo : null, avisos };
}
