// Pergunta 5: quem entrou pela legenda. Um eleito por quociente partidário ou média entrou "pela legenda"
// quando os próprios votos ficaram abaixo do quociente eleitoral; a vaga veio dos votos que sobraram aos
// colegas da mesma coligação ou federação (os "puxadores") e dos votos dados à legenda.

/** Eleito com votação nominal abaixo do quociente eleitoral. */
export const porLegenda = (eleito, quociente) => eleito.votos < quociente;

/** Como os votos que sobram acima do quociente nos puxadores cobririam a falta dos eleitos pela legenda,
 *  só dentro da mesma unidade (partido, coligação ou federação). Puxadores do mais votado ao menos votado;
 *  faltas também do mais votado ao menos. Devolve [{ de, para, votos }]. */
export function escoamento(eleitos, quociente) {
  const fluxos = [];
  const unidades = new Map();
  for (const e of eleitos) unidades.set(e.unidade, [...(unidades.get(e.unidade) ?? []), e]);
  for (const grupo of unidades.values()) {
    const sobras = grupo.filter(e => e.votos > quociente).sort((a, b) => b.votos - a.votos)
      .map(e => ({ pid: e.pid, resta: e.votos - quociente }));
    const faltas = grupo.filter(e => porLegenda(e, quociente)).sort((a, b) => b.votos - a.votos);
    for (const f of faltas) {
      let falta = quociente - f.votos;
      for (const s of sobras) {
        if (!falta) break;
        const dado = Math.min(s.resta, falta);
        if (dado > 0) { fluxos.push({ de: s.pid, para: f.pid, votos: dado }); s.resta -= dado; falta -= dado; }
      }
    }
  }
  return fluxos;
}

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
