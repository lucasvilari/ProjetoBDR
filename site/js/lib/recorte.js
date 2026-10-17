// O recorte de cada página (ano, cargo, lugar e escolhas da página) guardado no endereço,
// para o link poder ser compartilhado e o botão voltar do navegador funcionar.

const GERAIS = ['PRESIDENTE', 'GOVERNADOR', 'SENADOR', 'DEPUTADO FEDERAL', 'DEPUTADO ESTADUAL'];
export const MUNICIPAIS = ['PREFEITO', 'VEREADOR'];

/** Cargos em disputa num ano; no Distrito Federal o deputado distrital ocupa o lugar do estadual. */
export function cargosDoAno(ano, uf) {
  if (ano % 4 === 0) return [...MUNICIPAIS];
  return GERAIS.map(c => (c === 'DEPUTADO ESTADUAL' && uf === 'DF' ? 'DEPUTADO DISTRITAL' : c));
}

/** Lê o recorte do endereço; o que for inválido volta ao padrão, e o que não existir fica de fora. */
export function leRecorte(hash, padrao, validos) {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const r = {};
  const ano = Number(p.get('ano'));
  r.ano = validos.anos.includes(ano) ? ano : padrao.ano;
  r.cargo = validos.cargos.includes(p.get('cargo')) ? p.get('cargo') : padrao.cargo;
  // o lugar padrão só vale para um endereço sem recorte: com ano ou cargo e sem uf, o recorte é o Brasil
  const temRecorte = p.has('ano') || p.has('cargo');
  r.uf = validos.ufs.includes(p.get('uf')) ? p.get('uf') : temRecorte ? undefined : padrao.uf;
  if (/^\d{5}$/.test(p.get('mun') ?? '')) r.mun = p.get('mun');
  else if (!temRecorte && padrao.mun) r.mun = padrao.mun;
  if (/^[A-Z0-9 ]{2,15}$/.test(p.get('partido') ?? '')) r.partido = p.get('partido');
  if (/^\d+$/.test(p.get('pid') ?? '')) r.pid = Number(p.get('pid'));
  if (/^[a-z-]{1,20}$/.test(p.get('modo') ?? '')) r.modo = p.get('modo');
  for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
  return r;
}

/** O recorte como texto de endereço, sem o "#". */
export function escreveRecorte(r) {
  const p = new URLSearchParams();
  for (const k of ['ano', 'cargo', 'uf', 'mun', 'partido', 'pid', 'modo']) if (r[k] != null && r[k] !== '') p.set(k, r[k]);
  return p.toString();
}

/** A unidade eleitoral do recorte: BR para presidente, o município para prefeito e vereador
 *  quando há um escolhido, senão a UF (ou o Brasil, se nenhuma UF foi escolhida). */
export function ueDoRecorte(r) {
  if (r.cargo === 'PRESIDENTE') return 'BR';
  if (MUNICIPAIS.includes(r.cargo) && r.mun) return r.mun;
  return r.uf ?? 'BR';
}

/** O lugar de um recorte nas páginas com seletor: presidente é nacional (sem UF nem município); os demais cargos
 *  ficam num dos estados do projeto (`ufs`), e o município só vale para prefeito e vereador. Devolve um recorte novo. */
export function ajustaLugar(r, ufs, ufPadrao) {
  const novo = { ...r };
  if (novo.cargo === 'PRESIDENTE') { delete novo.uf; delete novo.mun; return novo; }
  if (!ufs.includes(novo.uf)) { novo.uf = ufPadrao; delete novo.mun; }
  if (!MUNICIPAIS.includes(novo.cargo)) delete novo.mun;
  return novo;
}
