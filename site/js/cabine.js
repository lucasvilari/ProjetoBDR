// A cabine do oráculo: perguntas gerais, fora das páginas das questões (comparar carreiras, municípios, o resultado de
// uma eleição). São dois pedidos ao oráculo: no primeiro, ele transforma a pergunta num pedido de dados (o "plano");
// a página busca esses dados nos mesmos arquivos do site, monta o retrato e, no segundo, o oráculo responde com ele.
//
// Abaixo da resposta, um cartão para cada político ou município de que ela fala, com links para as perguntas já no
// recorte dele. Os links são montados aqui, com os códigos dos dados, e não pela IA.
//
// Dados: politicos/ (busca e carreiras), indices/municipios.json e idade/idade.json (municípios),
// candidaturas/<ue>-<ano>.json, mapa/ e vies/ (eleições).
import { montaPagina, carregaDados, formata, NOME_UF, fotoCandidato } from './comum.js?v=20261157';
import { ENDERECO, AVISOS } from './oraculo.js?v=20261157';
import { procuraPoliticos, carreiraDe, tabelasPoliticos } from './busca.js?v=20261157';
import { leCandidaturas, nomeDe, UFS_PROJETO } from './pecas.js?v=20261157';
import { retratoEmTexto, comparacao } from './lib/retrato.js?v=20261157';
import { achaMunicipios, escolhePolitico, resumoCarreira, votacao, citados, linksDoCandidato, linksDoMunicipio } from './lib/cabine.js?v=20261157';

montaPagina();

const MUNICIPAIS = ['PREFEITO', 'VEREADOR'];
const ANOS_GERAIS = [2018, 2022, 2026], ANOS_MUNICIPAIS = [2020, 2024];
const UNICO = ['PRESIDENTE', 'GOVERNADOR', 'PREFEITO'];
const PROPORCIONAIS = ['DEPUTADO FEDERAL', 'DEPUTADO ESTADUAL', 'VEREADOR'];
const NEVOAS = 'As névoas não me deixam ver o que você pergunta. Pergunte sobre a carreira de políticos, sobre municípios '
  + 'dos seis estados ou sobre o resultado de uma eleição.';
const dec = (v, casas = 2) => (v == null ? '—' : v.toFixed(casas).replace('.', ','));
const pct = v => (v == null ? '—' : `${dec(v, 1)}%`);
const minusculo = t => t.toLowerCase();
/** A UF e o município (nos cargos municipais) de uma unidade eleitoral: BR, a UF ou o código do município. */
const lugarDaUe = (ue, tabelas) => (/^\d{5}$/.test(ue) ? { uf: tabelas.municipios[ue]?.match(/\((..)\)$/)?.[1] ?? null, mun: ue }
  : { uf: ue === 'BR' ? null : ue, mun: null });
const mediana = vs => {
  const o = vs.filter(v => v != null).sort((a, b) => a - b);
  return o.length ? (o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2) : null;
};

// ---------------------------------------------------------------- os retratos de cada tipo de pedido

async function retratoPoliticos(nomes, anoPedido) {
  const tabelas = await tabelasPoliticos();
  const secoes = [], cartoes = [], faltas = [], achados = [];
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
    // o cartão leva à eleição pedida, ou à mais recente com os dados de cada candidato (2018 em diante)
    const alvo = cands.find(c => c.ano === anoPedido) ?? cands.filter(c => c.ano >= 2018).at(-1) ?? cands.at(-1);
    cartoes.push({ nome: carreira.nome, sempre: true, faixa: `${minusculo(alvo.cargo)} · ${alvo.ano}`,
      foto: fotoCandidato(escolhido.foto, 'cabine-cartao-foto'),
      sobre: `${alvo.sigla} · ${minusculo(alvo.situacao ?? '')} · ${r.vitorias} ${r.vitorias === 1 ? 'vitória' : 'vitórias'} em ${r.candidaturas} candidaturas`,
      links: linksDoCandidato({ pid: escolhido.id, ano: alvo.ano, cargo: alvo.cargo, ...lugarDaUe(alvo.ue, tabelas) }) });
  }
  if (achados.length >= 2) {
    const [a, b] = achados;
    secoes.push({ titulo: 'Comparações prontas (calculadas pela página)', linhas: [
      [`Maior votação de ${a.nome} em relação à de ${b.nome}`, a.r.maiorVotacao && b.r.maiorVotacao ? comparacao(a.r.maiorVotacao.votos, b.r.maiorVotacao.votos) : null],
    ] });
  }
  return { secoes, cartoes, faltas };
}

async function retratoMunicipios(pedidos) {
  const [ind, idade] = await Promise.all([carregaDados('indices/municipios.json'), carregaDados('idade/idade.json')]);
  const ultimo = ind.anos.at(-1);
  const campo = (ano, i, nome) => ind.valores[ano][i]?.[ind.campos.indexOf(nome)] ?? null;
  const secoes = [], cartoes = [], faltas = [], achados = [];
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
    cartoes.push(cartaoMunicipio(m, ultimo, idade));
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
  return { secoes, cartoes, faltas };
}

/** O cartão de um município: o prefeito eleito por último e os links das perguntas sobre ele. */
function cartaoMunicipio(m, ultimo, idade) {
  const [ano, prefeito, , p] = (idade.prefeitos[m.cod] ?? []).at(-1) ?? [];
  return { nome: m.nome, sempre: true, faixa: `município · ${NOME_UF[m.uf]}`,
    sobre: prefeito ? `prefeito eleito em ${ano}: ${prefeito} (${idade.partidos[p]?.[0] ?? '—'})` : '',
    links: linksDoMunicipio(m, ultimo) };
}

/** Uma linha do arquivo de viés (vies/), como objeto. */
const registro = (campos, l) => Object.fromEntries(campos.map((c, i) => [c, l[i]]));

async function retratoEleicao(plano) {
  const cargo = plano.cargo ?? (ANOS_MUNICIPAIS.includes(plano.ano) ? 'PREFEITO' : 'PRESIDENTE');
  const municipal = MUNICIPAIS.includes(cargo);
  const ano = plano.ano ?? (municipal ? 2024 : 2026);
  const secoes = [], cartoes = [], faltas = [], eleicao = [];
  if ((municipal ? ANOS_MUNICIPAIS : ANOS_GERAIS).includes(ano) === false) {
    faltas.push(ano < 2018 ? `o site só tem os votos de cada candidato de 2018 em diante (pedido: ${ano})`
      : `não houve eleição para ${minusculo(cargo)} em ${ano}: ${municipal ? 'prefeito e vereador são eleitos em 2020 e 2024' : 'os cargos estaduais e federais são eleitos em 2018, 2022 e 2026'}`);
    return { secoes, cartoes, faltas };
  }
  // o lugar: o município (prefeito e vereador, ou o voto de uma cidade para presidente), o estado ou o Brasil
  let mun = null, ind = null;
  if (plano.municipio) {
    ind = await carregaDados('indices/municipios.json');
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
    return { secoes, cartoes, faltas };
  }
  if (cargo !== 'PRESIDENTE' && !UFS_PROJETO.includes(uf)) {
    faltas.push(`o site só tem os candidatos a ${minusculo(cargo)} de AP, MG, MS, PB, RO e RR (pedido: ${NOME_UF[uf] ?? uf})`);
    return { secoes, cartoes, faltas };
  }
  const nomeLugar = ue === 'BR' ? 'Brasil' : municipal ? `${mun.nome} (${mun.uf})` : NOME_UF[uf];
  const cands = (await leCandidaturas(ue, ano)).filter(c => c.cargo === cargo);
  if (!cands.length) { faltas.push(`sem candidatos a ${minusculo(cargo)} em ${nomeLugar} em ${ano} nos dados do site`); return { secoes, cartoes, faltas }; }
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
    eleicao.push({ rotulo: 'Para que lado se votou', href: `pergunta-7.html#cargo=PRESIDENTE&ano=${ano}&regua=especialistas` });
  }
  // os candidatos ganham cartão se a resposta os citar (sem nenhum citado, os eleitos); o cartão da eleição, sempre
  const [custoDaEleicao, patrimonio, publico] = linksDoCandidato({ pid: null, ano, cargo, uf, mun: mun?.cod }).map(l => l.href);
  cartoes.push({ nome: nomeLugar, sempre: true, faixa: `eleição · ${ano}`, titulo: `${minusculo(cargo)} · ${nomeLugar}`,
    sobre: `${formata.numero(cands.length)} candidatos, ${formata.numero(eleitos.length)} ${eleitos.length === 1 ? 'eleito' : 'eleitos'}`,
    links: [{ rotulo: 'Custo das cadeiras', href: custoDaEleicao }, { rotulo: 'Patrimônio dos candidatos', href: patrimonio },
      { rotulo: 'Dinheiro público', href: publico }, ...eleicao,
      ...(PROPORCIONAIS.includes(cargo) ? [{ rotulo: 'Eleitos pela legenda', href: custoDaEleicao.replace('pergunta-1', 'pergunta-5') }] : [])] });
  for (const c of mostrados.filter(c => c.nomeado)) {
    cartoes.push({ nome: nomeDe(c), candidato: true, eleito: c.eleito, faixa: `${minusculo(cargo)} · ${ano}`,
      foto: fotoCandidato(c.foto, 'cabine-cartao-foto'),
      sobre: `${c.sigla} · ${c.eleito ? 'eleito' : 'não eleito'} · ${formata.numero(c.votos ?? 0)} votos${c.votos_2t ? ` (${formata.numero(c.votos_2t)} no 2º turno)` : ''}`,
      links: linksDoCandidato({ pid: c.pid, ano, cargo, uf, mun: mun?.cod }) });
  }
  if (mun && ind) cartoes.push(cartaoMunicipio(mun, ind.anos.at(-1), await carregaDados('idade/idade.json')));
  return { secoes, cartoes, faltas };
}

// ---------------------------------------------------------------- a conversa

const form = document.getElementById('cabine-form');
const campo = document.getElementById('cabine-texto');
const botao = form.querySelector('button[type="submit"]');
const olho = document.getElementById('cabine-olho');
const estado = document.getElementById('cabine-estado');
const resposta = document.getElementById('cabine-resposta');
const caixaCartoes = document.getElementById('cabine-cartoes');
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

/** Os cartões dos políticos e lugares de que a resposta fala: os de cartão fixo (os pedidos e a eleição) e os
 *  candidatos que ela citou pelo nome (sem nenhum citado, os eleitos). */
function mostraCartoes(cartoes, texto) {
  const candidatos = cartoes.filter(c => c.candidato);
  const nomes = citados(texto, candidatos.map(c => c.nome));
  const escolhidos = nomes.length ? candidatos.filter(c => nomes.includes(c.nome)) : candidatos.filter(c => c.eleito).slice(0, 3);
  const mostrar = [...escolhidos.sort((a, b) => Number(b.eleito) - Number(a.eleito)), ...cartoes.filter(c => c.sempre)];
  caixaCartoes.hidden = !mostrar.length;
  caixaCartoes.innerHTML = mostrar.length ? `<h2>Para ver nas páginas</h2>
    <div class="cabine-cartoes-lista">${mostrar.map(c => `<article class="cabine-cartao">
      <div class="santinho-faixa">${c.faixa}</div>
      <div class="cabine-cartao-quem">${c.foto ?? ''}<div><b>${c.titulo ?? c.nome}</b>${c.sobre ? `<span>${c.sobre}</span>` : ''}</div></div>
      <ul>${c.links.map(l => `<li><a href="${l.href}">${l.rotulo}</a></li>`).join('')}</ul>
    </article>`).join('')}</div>` : '';
}

async function pergunta(texto) {
  resposta.textContent = '';
  mostraCartoes([], '');
  olhoFica('fechado');
  estado.textContent = 'O oráculo está entendendo a pergunta…';
  const r1 = await pede({ modo: 'plano', pergunta: texto });
  if (!r1.ok) { semResposta(AVISOS[r1.status] ?? 'O oráculo não conseguiu responder agora.'); return; }
  const { plano } = await r1.json();
  const fazer = { politicos: () => retratoPoliticos(plano.politicos, plano.ano), municipios: () => retratoMunicipios(plano.municipios),
    eleicao: () => retratoEleicao(plano) }[plano.tipo];
  const vazio = plano.tipo === 'politicos' ? !plano.politicos.length : plano.tipo === 'municipios' ? !plano.municipios.length : false;
  if (!fazer || vazio) { semResposta(NEVOAS); return; }
  estado.textContent = 'O oráculo está consultando os dados…';
  const { secoes, cartoes, faltas } = await fazer();
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
  else mostraCartoes(cartoes, resposta.textContent);
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
