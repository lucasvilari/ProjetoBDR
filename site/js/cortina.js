// A cortina da cabine do oráculo, entre uma página e outra: duas metades de veludo desenhadas num shader (WebGL), com
// pregas que se apertam quando o tecido se junta num lado, a borda de baixo atrasada em relação à de cima (o pano se
// curva ao ser puxado), um balanço leve e a sombra do tecido sobre a página. O topo do site, parado, é a sanefa de onde
// ela pende (o veludo e a franja dele estão em css/estilo.css).
// js/transicao.js chama fecha() ao clicar num link do site e abre() na página nova; a imagem da cortina fechada passa
// de uma página para a outra pelo sessionStorage, para a página nova já nascer coberta.

const FECHAR = 620, ABRIR = 820;   // ms
export const CHAVE = 'cortina-fechada';

const VERTICE = `attribute vec2 p; varying vec2 v; void main() { v = p * 0.5 + 0.5; v.y = 1.0 - v.y; gl_Position = vec4(p, 0.0, 1.0); }`;

// para cada pixel: está em qual metade, onde fica a borda dessa metade na altura dele, a prega (seno) e a luz sobre ela
const FRAGMENTO = `precision highp float;
varying vec2 v;
uniform vec2 res;
uniform float aberta;   // 0 fechada, 1 aberta
uniform float tempo;
uniform float abrindo;  // 1 abrindo, 0 fechando
const float PI = 3.14159265;
const float PREGAS = 11.0;

// quanto a metade já abriu na altura y (0 em cima, 1 embaixo): a barra de cima puxa o pano e o pé vem atrás, em
// curva; abrindo, o pé fica menos aberto que o alto, e fechando, mais
float abertura(float y) {
  float atraso = y * y * 0.45;
  float a = clamp(abrindo > 0.5 ? aberta * 1.45 - atraso : aberta * 1.45 - 0.45 + atraso, 0.0, 1.0);
  return a * a * (3.0 - 2.0 * a);
}

// a cor do veludo numa metade, com x medido do lado de fora (0) até a borda (1 = a borda que se move)
vec4 veludo(float x, float y, float lado) {
  float o = abertura(y);
  float largura = 0.5 * (1.0 - o) + 0.012 * (1.0 - o);
  float balanco = sin(y * 5.0 + tempo * 7.0 + lado) * 0.006 * sin(aberta * PI);
  float borda = largura + balanco * (0.4 + y);
  float aa = 1.5 / res.x;
  float dentro = 1.0 - smoothstep(borda - aa, borda + aa, x);
  float sombra = (1.0 - smoothstep(borda, borda + 0.045, x)) * 0.42 * (1.0 - o);
  if (dentro <= 0.0) return vec4(0.0, 0.0, 0.0, sombra);
  float u = x / max(borda, 0.002);
  float fase = u * PREGAS * 2.0 * PI + lado * 1.7 + sin(y * 3.0 + lado) * 0.6;
  // a profundidade da prega é a mesma no pano; apertado num pedaço estreito, a inclinação (e a sombra) cresce
  float inclinacao = cos(fase) * 0.9 / (borda * 6.0 + 0.35);
  vec3 n = normalize(vec3(-inclinacao * lado, -0.12, 1.0));
  vec3 luz = normalize(vec3(-0.35 * lado - 0.2, -0.55, 1.0));
  float difusa = max(dot(n, luz), 0.0);
  float brilho = pow(1.0 - n.z, 1.6) * 0.9;                      // o lustro do veludo nas dobras viradas
  vec3 base = vec3(0.47, 0.07, 0.09);
  vec3 cor = base * (0.22 + 0.95 * difusa) + vec3(0.55, 0.16, 0.16) * brilho;
  cor *= 0.78 + 0.22 * smoothstep(0.0, 0.25, y);                  // mais escuro junto da sanefa (o topo)
  cor *= 1.0 - 0.35 * smoothstep(0.85, 1.0, y);                   // e no pé, perto do chão
  cor *= 1.0 - 0.45 * smoothstep(0.93, 1.0, u);                   // a barra escura da borda
  return vec4(cor, dentro);
}

void main() {
  vec4 c = v.x < 0.5 ? veludo(v.x, v.y, 1.0) : veludo(1.0 - v.x, v.y, -1.0);
  gl_FragColor = vec4(c.rgb * c.a, c.a);
}`;

function montaCena(topo) {
  const tela = document.createElement('canvas');
  tela.className = 'cortina-tela';
  tela.setAttribute('aria-hidden', 'true');
  tela.style.top = `${topo}px`;
  tela.style.height = `${Math.max(1, innerHeight - topo)}px`;
  document.body.append(tela);
  const gl = tela.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
  if (!gl) { tela.remove(); return null; }
  const programa = gl.createProgram();
  for (const [tipo, fonte] of [[gl.VERTEX_SHADER, VERTICE], [gl.FRAGMENT_SHADER, FRAGMENTO]]) {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, fonte);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); tela.remove(); return null; }
    gl.attachShader(programa, s);
  }
  gl.linkProgram(programa);
  gl.useProgram(programa);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const p = gl.getAttribLocation(programa, 'p');
  gl.enableVertexAttribArray(p);
  gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
  const u = nome => gl.getUniformLocation(programa, nome);
  const escala = Math.min(devicePixelRatio || 1, 1.5);
  const desenha = (aberta, tempo, abrindo) => {
    const w = Math.round(tela.clientWidth * escala), h = Math.round(tela.clientHeight * escala);
    if (tela.width !== w || tela.height !== h) { tela.width = w; tela.height = h; gl.viewport(0, 0, w, h); }
    gl.uniform2f(u('res'), w, h);
    gl.uniform1f(u('aberta'), aberta);
    gl.uniform1f(u('tempo'), tempo);
    gl.uniform1f(u('abrindo'), abrindo ? 1 : 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  return { tela, desenha };
}

const anima = (duracao, passo) => new Promise(resolve => {
  const inicio = performance.now();
  const quadro = agora => {
    const t = Math.min(1, (agora - inicio) / duracao);
    passo(t, (agora - inicio) / 1000);
    if (t < 1) requestAnimationFrame(quadro); else resolve();
  };
  requestAnimationFrame(quadro);
});
const suave = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Fecha a cortina sobre a página e só então vai para `endereco`. Sem WebGL, vai direto. */
export async function fecha(endereco) {
  const topo = Math.max(0, document.querySelector('header.topo')?.getBoundingClientRect().bottom ?? 0);
  const cena = montaCena(topo);
  if (!cena) { location.href = endereco; return; }
  await anima(FECHAR, (t, s) => cena.desenha(1 - suave(t), s, false));
  cena.desenha(0, 0, false);
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify({ topo, imagem: cena.tela.toDataURL('image/jpeg', 0.82) }));
  } catch { /* sem armazenamento: a página nova abre sem a cortina */ }
  location.href = endereco;
  // voltando pelo histórico (bfcache), a página reaparece como ficou: tira a cortina
  addEventListener('pageshow', () => cena.tela.remove(), { once: true });
}

/** Abre a cortina que a página nova herdou fechada (a imagem dela está no fundo da página até o WebGL desenhar). */
export async function abre({ topo }, tirarImagem) {
  const cena = montaCena(topo);
  if (!cena) { tirarImagem(); return; }
  cena.desenha(0, 0, true);
  tirarImagem();
  await anima(ABRIR, (t, s) => cena.desenha(suave(t), s, true));
  cena.tela.remove();
}
