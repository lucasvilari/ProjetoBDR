// Pergunta 5: quem entrou pela legenda. Um eleito por quociente partidário ou média entrou "pela legenda"
// quando os próprios votos ficaram abaixo do quociente eleitoral; a vaga veio dos votos que sobraram aos
// colegas da mesma chapa (os "puxadores"), dos colegas que não se elegeram e dos votos dados à legenda.

/** Eleito com votação nominal abaixo do quociente eleitoral. */
export const porLegenda = (eleito, quociente) => eleito.votos < quociente;

/** Por partido: eleitos, quantos pela legenda e a porcentagem; mais eleitos primeiro. */
export function resumoPorPartido(eleitos, quociente) {
  const por = new Map();
  for (const e of eleitos) {
    const p = por.get(e.sigla) ?? { partido: e.sigla, eleitos: 0, porLegenda: 0 };
    p.eleitos += 1;
    if (porLegenda(e, quociente)) p.porLegenda += 1;
    por.set(e.sigla, p);
  }
  return [...por.values()].map(p => ({ ...p, pct: (100 * p.porLegenda) / p.eleitos }))
    .sort((a, b) => b.eleitos - a.eleitos || a.partido.localeCompare(b.partido));
}

/** Os copos da pergunta 5: cada eleito é um copo que se enche até o quociente. Primeiro com os próprios votos; quem
 *  passa do quociente transborda (os puxadores). Os copos que faltam se enchem, dentro da mesma chapa e do mais
 *  votado ao menos votado, com a sobra dos puxadores e depois com a "jarra" da chapa: os votos dos colegas que não
 *  se elegeram e os votos de legenda. O que ainda falta fica vazio (cadeira ganha nas sobras, por média).
 *  `chapas`: [{unidade, nominais (de todos os candidatos), legenda}]. Devolve { copos: pid -> {proprio, transborda,
 *  dosPuxadores, daChapa, vazio, fontes: [{de: pid ou 'chapa', votos}]}, jarras: unidade -> {inicio, resta} }. */
export function enchimento(eleitos, chapas, quociente) {
  const copos = new Map(), jarras = new Map();
  const unidades = new Map();
  for (const e of eleitos) unidades.set(e.unidade, [...(unidades.get(e.unidade) ?? []), e]);
  for (const [unidade, grupo] of unidades) {
    const chapa = chapas.find(c => c.unidade === unidade);
    const votosDosEleitos = grupo.reduce((s, e) => s + e.votos, 0);
    const inicio = chapa ? Math.max(0, chapa.nominais - votosDosEleitos) + chapa.legenda : 0;
    const jarra = { inicio, resta: inicio };
    const ordem = [...grupo].sort((a, b) => b.votos - a.votos);
    const sobras = ordem.filter(e => e.votos > quociente).map(e => ({ pid: e.pid, resta: e.votos - quociente }));
    for (const e of ordem) {
      const copo = { proprio: Math.min(e.votos, quociente), transborda: Math.max(0, e.votos - quociente),
        dosPuxadores: 0, daChapa: 0, vazio: 0, fontes: [] };
      let falta = quociente - copo.proprio;
      for (const s of sobras) {
        if (!falta) break;
        const dado = Math.min(s.resta, falta);
        if (dado > 0) { copo.fontes.push({ de: s.pid, votos: dado }); copo.dosPuxadores += dado; s.resta -= dado; falta -= dado; }
      }
      if (falta && jarra.resta) {
        const dado = Math.min(jarra.resta, falta);
        copo.fontes.push({ de: 'chapa', votos: dado }); copo.daChapa = dado; jarra.resta -= dado; falta -= dado;
      }
      copo.vazio = falta;
      copos.set(e.pid, copo);
    }
    jarras.set(unidade, jarra);
  }
  return { copos, jarras };
}
