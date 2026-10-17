// Geometria do plenário: cadeiras num semicírculo, em fileiras, com os partidos da esquerda para a
// direita. Coordenadas num semicírculo de raio 1, com y para cima (y ≥ 0); quem desenha inverte se precisar.

export const PASSOS = [1, 2, 5, 10, 20, 50, 100, 200];

const soma = v => v.reduce((s, x) => s + x, 0);

/** Posições de n cadeiras, ordenadas da esquerda (ângulo π) para a direita (ângulo 0), para que cada
 *  partido ocupe uma fatia contínua. Devolve { pontos: [{x, y, angulo, fileira}], raio, interno }. */
export function assentos(n, { fileiras } = {}) {
  if (n === 1) return { pontos: [{ x: 0, y: 0.45, angulo: Math.PI / 2, fileira: 0 }], raio: 0.3, interno: 1 };
  const f = fileiras ?? (n <= 10 ? 1 : Math.min(40, Math.max(2, Math.round(Math.sqrt(n / 4.5)))));
  const interno = f === 1 ? 1 : Math.max(0.38, 1 - 0.12 * f);   // poucas fileiras: meia-lua fina, com espaço no meio
  const raios = Array.from({ length: f }, (_, i) => (f === 1 ? 1 : interno + ((1 - interno) * i) / (f - 1)));
  const total = soma(raios);
  const porFileira = raios.map(r => Math.max(1, Math.round((n * r) / total)));
  // o arredondamento sobra ou falta algumas cadeiras: acerta nas fileiras de fora, que têm mais espaço
  for (let i = f - 1, dif = n - soma(porFileira); dif !== 0; i = (i - 1 + f) % f) {
    if (dif < 0 && porFileira[i] <= 1) continue;
    porFileira[i] += Math.sign(dif); dif -= Math.sign(dif);
  }
  const pontos = raios.flatMap((r, i) => Array.from({ length: porFileira[i] }, (_, j) => {
    const angulo = porFileira[i] === 1 ? Math.PI / 2 : Math.PI - (Math.PI * j) / (porFileira[i] - 1);
    return { x: r * Math.cos(angulo), y: r * Math.sin(angulo), angulo, fileira: i };
  }));
  pontos.sort((a, b) => b.angulo - a.angulo || a.fileira - b.fileira);
  const passoArco = Math.min(...raios.map((r, i) => (porFileira[i] > 1 ? (Math.PI * r) / (porFileira[i] - 1) : 2)));
  const passoFileira = f > 1 ? (1 - interno) / (f - 1) : 2;
  return { pontos, raio: Math.min(0.09, 0.45 * Math.min(passoArco, passoFileira)), interno };
}

/** Da esquerda para a direita pela nota dos especialistas; sem nota no fim; os do mesmo partido juntos. */
export function ordenaPorLado(eleitos) {
  return [...eleitos].sort((a, b) => (a.nota ?? 99) - (b.nota ?? 99) || String(a.partido).localeCompare(String(b.partido)));
}

/** Quantas cadeiras cada bolinha vale para não passar de `maximo` bolinhas. */
export function agrupa(n, maximo) {
  return PASSOS.find(q => n / q <= maximo) ?? Math.ceil(n / maximo);
}

/** Quantas bolinhas cada grupo recebe quando cada uma vale `passo` cadeiras: pelos maiores restos,
 *  para a soma bater com o total de bolinhas e cada fatia ficar proporcional. */
export function bolinhasPorGrupo(grupos, passo, bolinhas) {
  const cotas = grupos.map(g => g / passo);
  const base = cotas.map(Math.floor);
  const ordem = grupos.map((_, i) => i).sort((a, b) => (cotas[b] - base[b]) - (cotas[a] - base[a]));
  for (let k = 0, falta = bolinhas - soma(base); falta > 0 && ordem.length; k = (k + 1) % ordem.length, falta -= 1) base[ordem[k]] += 1;
  return base;
}
