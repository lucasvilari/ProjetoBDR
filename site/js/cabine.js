// A cabine do oráculo: perguntas gerais, fora das páginas das questões (comparar carreiras, municípios, o resultado de
// uma eleição). São dois pedidos ao oráculo: no primeiro, ele transforma a pergunta num pedido de dados (o "plano");
// a página busca esses dados nos mesmos arquivos do site, monta o retrato e, no segundo, o oráculo responde com ele.
//
// Dados: politicos/ (busca e carreiras), indices/municipios.json e idade/idade.json (municípios),
// candidaturas/<ue>-<ano>.json, mapa/ e vies/ (eleições).
import { montaPagina, carregaDados, formata, NOME_UF } from './comum.js?v=20261155';
import { ENDERECO, AVISOS } from './oraculo.js?v=20261155';
import { procuraPoliticos, carreiraDe, tabelasPoliticos } from './busca.js?v=20261155';
import { leCandidaturas, nomeDe, UFS_PROJETO } from './pecas.js?v=20261155';
import { retratoEmTexto, comparacao } from './lib/retrato.js?v=20261155';
import { achaMunicipios, escolhePolitico, resumoCarreira, votacao } from './lib/cabine.js?v=20261155';

montaPagina();

const MUNICIPAIS = ['PREFEITO', 'VEREADOR'];
const ANOS_GERAIS = [2018, 2022, 2026], ANOS_MUNICIPAIS = [2020, 2024];
const UNICO = ['PRESIDENTE', 'GOVERNADOR', 'PREFEITO'];
const NEVOAS = 'As névoas não me deixam ver o que você pergunta. Pergunte sobre a carreira de políticos, sobre municípios '
  + 'dos seis estados ou sobre o resultado de uma eleição.';
const dec = (v, casas = 2) => (v == null ? '—' : v.toFixed(casas).replace('.', ','));
const pct = v => (v == null ? '—' : `${dec(v, 1)}%`);
const minusculo = t => t.toLowerCase();
const mediana = vs => {
  const o = vs.filter(v => v != null).sort((a, b) => a - b);
  return o.length ? (o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2) : null;
};

// ---------------------------------------------------------------- os retratos de cada tipo de pedido

async function retratoPoliticos(nomes) {
  const tabelas = await tabelasPoliticos();
  const secoes = [], fontes = [], faltas = [], achados = [];
  for (const nome of nomes) {
    const fichas = ((await procuraPoliticos(nome)) ?? []).map(f => ({ ...f, cargo: tabelas.cargos[f.ultimo_cargo] }));
    const { escolhido, parecidos } = escolhePolitico(fichas, nome);
    const carreira = escolhido && await carreiraDe(escolhido.id);
    if (!carreira) { faltas.push(`nenhum político com o nome "${nome}" nos dados do site`); continue; }
    const cands = [...carreira.cands].sort((a, b) => a.ano - b.ano);
    const r = resumoCarreira(cands);
    achados.push({ nome: carreira.nome, r });
    secoes.push({ titulo: `Político: ${carreira.nome} (${escolhido.uf}), candidaturas de ${escolhido.primeiro_ano} a ${escolhido.ultimo_ano} (pedido como "${nome}")`, linhas: [
      ['Candidaturas', formata.numero(r.candidaturas)],
      ['Vitórias (eleito)', formata.numero(r.vitorias)],
      ['Sem vitória (não eleito, suplente ou candidatura barrada)', formata.numero(r.candidaturas - r.vitorias)],
      ['Cargos disputados', r.cargos.map(minusculo).join(', ')],
      ['Partidos', r.partidos.join(', ')],
      ['Maior votação (no 1º turno, nos cargos com dois turnos)', r.maiorVotacao ? `${formata.numero(r.maiorVotacao.votos)} votos (${minusculo(r.maiorVotacao.cargo)}, ${r.maiorVotacao.ano})` : null],
      ...cands.map(c => [null, `${c.ano}: ${minusculo(c.cargo)} em ${c.local}, ${c.sigla}${c.nota == null ? '' : ` (nota ${dec(c.nota)})`}, `
        + `${minusculo(c.situacao)}${c.votos > 0 ? `, ${formata.numero(c.votos)} votos${UNICO.includes(c.cargo) ? ' no 1º turno' : ''}` : ''}${c.despesa > 0 ? `, gasto ${formata.real(c.despesa)}` : ''}`
        + `${c.patrimonio > 0 ? `, patrimônio declarado ${formata.real(c.patrimonio)}` : ''}`]),
    ] });
    if (parecidos.length) {
      secoes.push({ titulo: `Outros políticos com nome parecido com "${nome}" (o retrato acima é de ${carreira.nome})`,
        linhas: parecidos.slice(0, 4).map(f => [null, `${f.nome} (${f.uf}, ${minusculo(f.cargo)}, ${f.primeiro_ano === f.ultimo_ano ? f.primeiro_ano : `${f.primeiro_ano} a ${f.ultimo_ano}`}, ${f.vitorias} ${f.vitorias === 1 ? 'vitória' : 'vitórias'})`]) });
    }
    fontes.push({ rotulo: `Carreira de ${carreira.nome}`, href: `pergunta-10.html#${escolhido.id}` });
  }
  if (achados.length >= 2) {
    const [a, b] = achados;
    secoes.push({ titulo: 'Comparações prontas (calculadas pela página)', linhas: [
      [`Maior votação de ${a.nome} em relação à de ${b.nome}`, a.r.maiorVotacao && b.r.maiorVotacao ? comparacao(a.r.maiorVotacao.votos, b.r.maiorVotacao.votos) : null],
    ] });
  }
  return { secoes, fontes, faltas };
}

async function retratoMunicipios(pedidos) {
  const [ind, idade] = await Promise.all([carregaDados('indices/municipios.json'), carregaDados('idade/idade.json')]);
  const ultimo = ind.anos.at(-1);
  const campo = (ano, i, nome) => ind.valores[ano][i]?.[ind.campos.indexOf(nome)] ?? null;
  const secoes = [], fontes = [], faltas = [], achados = [];
  for (const pedido of pedidos) {
    const achadosNome = achaMunicipios(pedido, ind.municipios);
    if (!achadosNome.length) { faltas.push(`nenhum município chamado "${pedido.nome}"${pedido.uf ? ` em ${pedido.uf}` : ''} nos seis estados do site`); continue; }
    const m = achadosNome[0];
    const i = ind.municipios.findIndex(([cod]) => cod === m.cod);
    const linhaIdade = idade.municipios.find(([cod]) => cod === m.cod);
    achados.push({ ...m, i });
    secoes.push({ titulo: `Município: ${m.nome} (${m.uf})${achadosNome.length > 1 ? `; há ${achadosNome.length} municípios com esse nome (${achadosNome.map(x => `${x.nome}, ${x.uf}`).join('; ')}) e o retrato usa o primeiro` : ''}`, linhas: [
      ['Idade mediana dos moradores (Censo 2022)', linhaIdade ? `${dec(linhaIdade[3], 1)} anos` : null],
      ...ind.anos.map(ano => {
        const st = campo(ano, i, 'segundo_turno');
        const prefeito = campo(ano, i, 'prefeito');
        return [String(ano), `PIB per capita ${formata.real(campo(ano, i, 'pib_per_capita'))} (IBGE ${ind.ano_pib[ano]}), IDHM ${dec(campo(ano, i, 'idhm'), 3)}, `
          + `eleitores por habitante ${pct(100 * campo(ano, i, 'eleitores_por_populacao'))}, isentos ${pct(campo(ano, i, 'isentos_pct'))}, `
          + `prefeito do ${prefeito == null ? '—' : ind.partidos[prefeito]} (eleito em ${campo(ano, i, 'ano_prefeito')}), `
          + `voto ${dec(campo(ano, i, 'ideologia'))} (${minusculo(ind.classificacoes[campo(ano, i, 'classificacao')] ?? 'sem nota')})`
          + `${st ? `, 2º turno para presidente: ${st[0]} ${pct(st[1])}, ${st[2]} ${pct(st[3])}` : ''}`];
      }),
      ...(idade.prefeitos[m.cod] ?? []).map(([ano, nome, , p, anos]) => [null, `Prefeito eleito em ${ano}: ${nome} (${idade.partidos[p]?.[0] ?? '—'}), ${anos} anos na posse`]),
    ] });
    fontes.push({ rotulo: `Índices e voto de ${m.nome} (${m.uf})`, href: `pergunta-3.html#ano=${ultimo}&mun=${m.cod}` },
      { rotulo: `Prefeitos de ${m.nome}`, href: `pergunta-6.html#ano=2024&cargo=PREFEITO&lugar=${m.cod}` });
  }
  if (achados.length) {
    const todos = ind.municipios.map((_, i) => i);
    secoes.push({ titulo: `Medianas dos ${formata.numero(ind.municipios.length)} municípios dos seis estados em ${ultimo}`, linhas: [
      ['PIB per capita', formata.real(mediana(todos.map(i => campo(ultimo, i, 'pib_per_capita'))))],
      ['IDHM', dec(mediana(todos.map(i => campo(ultimo, i, 'idhm'))), 3)],
      ['Voto (0 esquerda, 10 direita)', dec(mediana(todos.map(i => campo(ultimo, i, 'ideologia'))))],
    ] });
  }
  if (achados.length >= 2) {
    const [a, b] = achados;
    secoes.push({ titulo: `Comparações prontas (calculadas pela página), em ${ultimo}`, linhas: [
      [`PIB per capita de ${a.nome} em relação ao de ${b.nome}`, comparacao(campo(ultimo, a.i, 'pib_per_capita'), campo(ultimo, b.i, 'pib_per_capita'))],
      [`IDHM de ${a.nome} em relação ao de ${b.nome}`, comparacao(campo(ultimo, a.i, 'idhm'), campo(ultimo, b.i, 'idhm'))],
    ] });
  }
  secoes.unshift({ titulo: 'Como ler', linhas: [[null, 'O voto é a média das notas dos partidos (especialistas: 0 esquerda, 10 direita), com peso pelos votos para deputado federal (anos gerais) ou vereador (anos municipais). O IDHM é o de 2010 em todos os anos. Isentos: brancos, nulos e abstenções do 1º turno.']] });
  return { secoes, fontes, faltas };
}

/** Uma linha do arquivo de viés (vies/), como objeto. */
const registro = (campos, l) => Object.fromEntries(campos.map((c, i) => [c, l[i]]));

async function retratoEleicao(plano) {
  const cargo = plano.cargo ?? (ANOS_MUNICIPAIS.includes(plano.ano) ? 'PREFEITO' : 'PRESIDENTE');
  const municipal = MUNICIPAIS.includes(cargo);
  const ano = plano.ano ?? (municipal ? 2024 : 2026);
  const secoes = [], fontes = [], faltas = [];
  if ((municipal ? ANOS_MUNICIPAIS : ANOS_GERAIS).includes(ano) === false) {
    faltas.push(ano < 2018 ? `o site só tem os votos de cada candidato de 2018 em diante (pedido: ${ano})`
      : `não houve eleição para ${minusculo(cargo)} em ${ano}: ${municipal ? 'prefeito e vereador são eleitos em 2020 e 2024' : 'os cargos estaduais e federais são eleitos em 2018, 2022 e 2026'}`);
    return { secoes, fontes, faltas };
  }
  // o lugar: o município (prefeito e vereador, ou o voto de uma cidade para presidente), o estado ou o Brasil
  let mun = null;
  if (plano.municipio) {
    const ind = await carregaDados('indices/municipios.json');
    mun = achaMunicipios(plano.municipio, ind.municipios)[0] ?? null;
    if (!mun) faltas.push(`nenhum município chamado "${plano.municipio.nome}" nos seis estados do site`);
  }
  const uf = mun?.uf ?? (plano.uf !== 'BR' ? plano.uf : null);
  let ue;
  if (cargo === 'PRESIDENTE') ue = 'BR';
  else if (municipal) ue = mun?.cod ?? null;
  else ue = uf;
  if (!ue) {
    faltas.push(municipal ? `para ${minusculo(cargo)}, diga o município (dos seis estados)` : `para ${minusculo(cargo)}, diga o estado`);
    return { secoes, fontes, faltas };
  }
  if (cargo !== 'PRESIDENTE' && !UFS_PROJETO.includes(uf)) {
    faltas.push(`o site só tem os candidatos a ${minusculo(cargo)} de AP, MG, MS, PB, RO e RR (pedido: ${NOME_UF[uf] ?? uf})`);
    return { secoes, fontes, faltas };
  }
  const nomeLugar = ue === 'BR' ? 'Brasil' : municipal ? `${mun.nome} (${mun.uf})` : NOME_UF[uf];
  const cands = (await leCandidaturas(ue, ano)).filter(c => c.cargo === cargo);
  if (!cands.length) { faltas.push(`sem candidatos a ${minusculo(cargo)} em ${nomeLugar} em ${ano} nos dados do site`); return { secoes, fontes, faltas }; }
  const linhas = votacao(cands);
  const eleitos = linhas.filter(c => c.eleito);
  const mostrados = linhas.slice(0, 15);
  const brasil = await carregaDados('mapa/brasil.json');
  const dadosCusto = municipal ? await carregaDados(`mapa/municipios/${mun.uf}.json`) : brasil;
  const custo = dadosCusto.custo.map(l => registro(brasil.campos_custo, l))
    .find(x => x.ano === ano && brasil.cargos[x.cargo] === cargo && x.territorio === ue);
  secoes.push({ titulo: `Eleição: ${minusculo(cargo)} · ${nomeLugar} · ${ano}`, linhas: [
    ['Vagas', custo ? formata.numero(custo.vagas) : null],
    ['Candidatos', formata.numero(cands.length)],
    ['Eleitos', formata.numero(eleitos.length)],
    ['Gasto de todos os candidatos', custo ? formata.real(custo.gasto) : null],
    ['Gasto dos eleitos', custo ? formata.real(custo.gasto_eleitos) : null],
    ...(ano === 2026 ? [[null, 'As contas de campanha de 2026 estavam incompletas quando os dados foram gerados (29/10/2026): os gastos ainda podem crescer.']] : []),
  ] });
  secoes.push({ titulo: `Candidatos do mais votado ao menos votado${linhas.length > mostrados.length ? ` (os ${mostrados.length} primeiros de ${linhas.length})` : ''}; a porcentagem é sobre os votos dados aos candidatos`,
    linhas: mostrados.map(c => [null, `${nomeDe(c)} (${c.sigla}): ${formata.numero(c.votos ?? 0)} votos (${pct(c.pct)})`
      + `${c.pct2t != null ? `; 2º turno: ${formata.numero(c.votos_2t)} votos (${pct(c.pct2t)})` : ''}, ${c.eleito ? 'eleito' : minusculo(c.situacao ?? 'não eleito')}`
      + `${c.despesa > 0 ? `, gasto ${formata.real(c.despesa)}` : ''}`]) });
  if (!UNICO.includes(cargo)) {
    const porPartido = Object.entries(Object.groupBy(eleitos, c => c.sigla)).map(([s, cs]) => [s, cs.length]).sort((a, b) => b[1] - a[1]);
    secoes.push({ titulo: 'Eleitos por partido', linhas: [[null, porPartido.map(([s, n]) => `${s} ${n}`).join(', ')]] });
  }
  // para presidente, o voto do estado ou da cidade pedidos, ao lado do Brasil
  if (cargo === 'PRESIDENTE') {
    const vies = await carregaDados('vies/brasil.json');
    const daqui = async (territorio, arquivo) => {
      const d = arquivo ? await carregaDados(arquivo).catch(() => null) : vies;
      const l = d?.linhas.map(x => registro(d.campos, x)).find(x => x.ano === ano && x.territorio === territorio && x.cargo === 'PRESIDENTE');
      return l?.presidente?.segundo_turno ?? null;
    };
    const lugares = [['Brasil', await daqui('BR')]];
    if (uf) lugares.push([NOME_UF[uf], await daqui(uf)]);
    if (mun) lugares.push([`${mun.nome} (${mun.uf})`, await daqui(mun.cod, `vies/municipios/${mun.uf}-presidente.json`)]);
    secoes.push({ titulo: 'Presidente, 2º turno, por lugar (porcentagem dos votos válidos do 2º turno)',
      linhas: lugares.filter(([, st]) => st).map(([nome, st]) => [nome, st.map(([n, s, p]) => `${n} (${s}) ${pct(p)}`).join(', ')]) });
    fontes.push({ rotulo: `Para que lado se votou para presidente em ${ano}`, href: `pergunta-7.html#cargo=PRESIDENTE&ano=${ano}&regua=especialistas` });
  }
  fontes.push({ rotulo: `Custo das cadeiras: ${minusculo(cargo)}, ${nomeLugar}, ${ano}`,
    href: `pergunta-1.html#ano=${ano}&cargo=${encodeURIComponent(cargo).replace(/%20/g, '+')}${uf ? `&uf=${uf}` : ''}${municipal ? `&mun=${mun.cod}` : ''}` });
  return { secoes, fontes, faltas };
}

// ---------------------------------------------------------------- a conversa

const form = document.getElementById('cabine-form');
const campo = document.getElementById('cabine-texto');
const botao = form.querySelector('button[type="submit"]');
const olho = document.getElementById('cabine-olho');
const estado = document.getElementById('cabine-estado');
const resposta = document.getElementById('cabine-resposta');
const consultas = document.getElementById('cabine-fontes');
const temPergunta = () => (campo.value.match(/\p{L}/gu) ?? []).length >= 3;
campo.addEventListener('input', () => { if (!botao.classList.contains('esperando')) botao.disabled = !temPergunta(); });
campo.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!botao.disabled) form.requestSubmit(); }
});
document.querySelector('.cabine-exemplos').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  campo.value = b.textContent.trim();
  botao.disabled = false;
  form.requestSubmit();
});

// o olho da cabine: fechado enquanto espera e pensa, aberto quando responde; sem resposta, a pupila sobe e some
const olhoFica = como => { olho.dataset.estado = como; };
const semResposta = texto => { estado.textContent = ''; resposta.textContent = texto; olhoFica('vazio'); };

const pede = corpo => fetch(ENDERECO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
const mostraFontes = fontes => {
  consultas.hidden = !fontes.length;
  consultas.innerHTML = fontes.length ? `<h2>O que o oráculo consultou</h2><ul>${fontes.map(f => `<li><a href="${f.href}">${f.rotulo}</a></li>`).join('')}</ul>` : '';
};

async function pergunta(texto) {
  resposta.textContent = '';
  mostraFontes([]);
  olhoFica('fechado');
  estado.textContent = 'O oráculo está entendendo a pergunta…';
  const r1 = await pede({ modo: 'plano', pergunta: texto });
  if (!r1.ok) { semResposta(AVISOS[r1.status] ?? 'O oráculo não conseguiu responder agora.'); return; }
  const { plano } = await r1.json();
  const fazer = { politicos: () => retratoPoliticos(plano.politicos), municipios: () => retratoMunicipios(plano.municipios),
    eleicao: () => retratoEleicao(plano) }[plano.tipo];
  const vazio = plano.tipo === 'politicos' ? !plano.politicos.length : plano.tipo === 'municipios' ? !plano.municipios.length : false;
  if (!fazer || vazio) { semResposta(NEVOAS); return; }
  estado.textContent = 'O oráculo está consultando os dados…';
  const { secoes, fontes, faltas } = await fazer();
  mostraFontes(fontes);
  if (!secoes.length) { semResposta(`As névoas escondem o que você procura: ${faltas.join('; ')}.`); return; }
  if (faltas.length) secoes.push({ titulo: 'O que não foi encontrado', linhas: faltas.map(f => [null, f]) });
  const retrato = retratoEmTexto({ numero: 0, pergunta: 'Cabine do oráculo (pergunta geral)', recorte: `pedido de dados: ${plano.tipo}`, secoes });
  estado.textContent = 'O oráculo está lendo os dados…';
  const r2 = await pede({ numero: 0, retrato, pergunta: texto });
  if (!r2.ok) { semResposta(AVISOS[r2.status] ?? 'O oráculo não conseguiu responder agora.'); return; }
  const leitor = r2.body.getReader(), decodifica = new TextDecoder();
  let primeiro = true;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    if (primeiro) { estado.textContent = ''; olhoFica('aberto'); primeiro = false; }
    resposta.textContent += decodifica.decode(value, { stream: true });
  }
  estado.textContent = '';
  if (primeiro) semResposta('O oráculo não conseguiu responder agora.');
  else if (/^\s*As névoas/.test(resposta.textContent)) olhoFica('vazio');   // a recusa do próprio oráculo
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!temPergunta() || botao.classList.contains('esperando')) return;
  botao.disabled = true;
  botao.classList.add('esperando');
  form.closest('.cabine').classList.add('consultando');
  try { await pergunta(campo.value.trim()); }
  catch { semResposta('Não foi possível falar com o oráculo. Verifique a conexão.'); }
  finally {
    botao.classList.remove('esperando');
    botao.disabled = !temPergunta();
    form.closest('.cabine').classList.remove('consultando');
  }
});
