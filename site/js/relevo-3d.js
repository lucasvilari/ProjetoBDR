// O mapa em relevo (Three.js) da pergunta 3: cada estado ou município é uma peça erguida do chão, com a altura e a
// cor que a página manda. Dá para girar e aproximar; passar o ponteiro mostra o nome e os números do lugar, e clicar
// num lugar clicável avisa a página.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const CHAO = 0.012;          // a altura de um lugar sem índice ou com o índice mais baixo
const SAI = t => 1 - (1 - t) ** 3;
const reduz = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Os anéis (listas de [x, y]) de cada polígono de um contorno GeoJSON, já projetados. */
const poligonos = (geometria, projeta) => (geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.coordinates)
  .map(aneis => aneis.map(anel => anel.map(projeta)));

/** Monta o mapa em `alvo`. geo: FeatureCollection; chave(f): o código do lugar; clicaveis: Set de chaves;
 *  rotulo: o texto para leitores de tela; aoEscolher(chave) no clique; alturaMax: a altura do mais alto, num mapa de 2
 *  unidades de largura (menor com muitos lugares pequenos, para as colunas não esconderem as vizinhas).
 *  Devolve { pinta, destroi }. */
export function montaRelevo(alvo, { geo, chave, clicaveis, rotulo, aoEscolher, alturaMax = 0.34 }) {
  alvo.innerHTML = '';
  alvo.classList.add('relevo-3d');
  let largura = alvo.clientWidth || 640;
  const alturaDe = w => Math.round(Math.min(600, Math.max(340, w * 0.78)));
  let altura = alturaDe(largura);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(largura, altura);
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', `${rotulo} em relevo; arraste para girar e use a roda para aproximar`);
  alvo.append(renderer.domElement);
  const dica = document.createElement('div');
  dica.className = 'relevo-dica';
  dica.hidden = true;
  alvo.append(dica);

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, largura / altura, 0.01, 40);
  cena.add(new THREE.HemisphereLight(0xfff8ec, 0x8a7a5a, 1.6));
  const sol = new THREE.DirectionalLight(0xffffff, 1.5);
  sol.position.set(-1.5, 3, 1.2);
  cena.add(sol);

  // o mapa projetado num quadrado de 2 × 2 em volta da origem, com o norte para o fundo da cena
  const projecao = d3.geoMercator().fitSize([2, 2], geo);
  const [[x0, y0], [x1, y1]] = d3.geoPath(projecao).bounds(geo);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const projeta = p => { const [x, y] = projecao(p); return [x - cx, cy - y]; };
  const mapa = new THREE.Group();
  mapa.rotation.x = -Math.PI / 2;
  cena.add(mapa);

  const pecas = new Map();   // chave → { malha, material, materialLinha, tracos (o contorno do topo), titulo }
  const geometrias = [], materiais = [];
  for (const f of geo.features) {
    const formas = [], tracos = [];
    for (const [fora, ...buracos] of poligonos(f.geometry, projeta)) {
      if (fora.length < 3) continue;
      const forma = new THREE.Shape(fora.map(([x, y]) => new THREE.Vector2(x, y)));
      forma.holes = buracos.filter(b => b.length >= 3).map(b => new THREE.Path(b.map(([x, y]) => new THREE.Vector2(x, y))));
      formas.push(forma);
      // o contorno do topo: segmentos em z = 1, que sobem e descem junto com a peça
      for (const anel of [fora, ...buracos]) {
        for (let i = 0; i < anel.length; i += 1) {
          const a = anel[i], b = anel[(i + 1) % anel.length];
          tracos.push(a[0], a[1], 1, b[0], b[1], 1);
        }
      }
    }
    if (!formas.length) continue;
    const g = new THREE.ExtrudeGeometry(formas, { depth: 1, bevelEnabled: false });
    // as faces ficam um pouco atrás na profundidade, para os contornos do topo não piscarem com elas
    const material = new THREE.MeshStandardMaterial({ color: '#d8c9a9', roughness: 0.85, polygonOffset: true,
      polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
    const malha = new THREE.Mesh(g, material);
    malha.scale.z = CHAO;
    malha.userData.chave = chave(f);
    const gl = new THREE.BufferGeometry();
    gl.setAttribute('position', new THREE.Float32BufferAttribute(tracos, 3));
    const materialLinha = new THREE.LineBasicMaterial({ color: '#faf7ef', transparent: true, opacity: 0.55 });
    const linhas = new THREE.LineSegments(gl, materialLinha);
    malha.add(linhas);
    mapa.add(malha);
    geometrias.push(g, gl); materiais.push(material, materialLinha);
    pecas.set(chave(f), { malha, material, materialLinha, tracos, titulo: '' });
  }

  // os contornos grossos (o lugar escolhido em laranja, os seis estados em preto): linhas com largura em pixels, presas
  // ao topo da peça, para a cor da peça continuar sendo só a do voto
  const grossos = [];
  const largas = [];
  // por cima de tudo (por cima): o escolhido não some atrás das paredes dos vizinhos mais altos
  function contornoGrosso(p, cor, espessura, porCima = false) {
    const g = new LineSegmentsGeometry().setPositions(p.tracos);
    const m = new LineMaterial({ color: cor, linewidth: espessura, depthTest: !porCima, transparent: porCima });
    m.resolution.set(largura, altura);
    const l = new LineSegments2(g, m);
    if (porCima) l.renderOrder = 10;
    p.malha.add(l);
    grossos.push(l); largas.push(m);
  }
  function limpaGrossos() {
    for (const l of grossos) { l.parent.remove(l); l.geometry.dispose(); l.material.dispose(); }
    grossos.length = 0; largas.length = 0;
  }

  // a câmera olha do sul, inclinada, e afasta em telas estreitas para o mapa inteiro caber
  const recuo = Math.max(1, 1.25 / camera.aspect);
  const casa = new THREE.Vector3(0, 2.4, 2.05).multiplyScalar(recuo);
  camera.position.copy(casa);
  const controles = new OrbitControls(camera, renderer.domElement);
  controles.target.set(0, 0, 0.06);
  controles.enablePan = true; controles.screenSpacePanning = true;
  controles.minDistance = 0.4; controles.maxDistance = 6;
  controles.minPolarAngle = 0; controles.maxPolarAngle = 1.3;
  controles.enableDamping = true;
  controles.update();

  let quadro = null, animacoes = [];
  function laco(agora) {
    animacoes = animacoes.filter(a => a(agora));
    const mexendo = controles.update();
    renderer.render(cena, camera);
    quadro = animacoes.length || mexendo ? requestAnimationFrame(laco) : null;
  }
  const acorda = () => { if (quadro == null) quadro = requestAnimationFrame(laco); };
  controles.addEventListener('change', acorda);

  // ponteiro: o nome do lugar ao passar, a escolha ao clicar (sem arrastar)
  const raio = new THREE.Raycaster(), ponteiro = new THREE.Vector2();
  const malhas = [...pecas.values()].map(p => p.malha);
  const acertou = e => {
    const r = renderer.domElement.getBoundingClientRect();
    ponteiro.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raio.setFromCamera(ponteiro, camera);
    return raio.intersectObjects(malhas, false)[0]?.object.userData.chave ?? null;
  };
  let apertou = null;
  const aoApertar = e => { apertou = [e.clientX, e.clientY]; };
  const aoSoltar = e => {
    if (!apertou || Math.hypot(e.clientX - apertou[0], e.clientY - apertou[1]) > 5) return;
    const k = acertou(e);
    if (k != null && clicaveis.has(k)) aoEscolher(k);
  };
  const aoMover = e => {
    if (e.buttons !== 0) { dica.hidden = true; return; }
    const k = acertou(e);
    renderer.domElement.style.cursor = k != null && clicaveis.has(k) ? 'pointer' : 'grab';
    if (k == null) { dica.hidden = true; return; }
    const r = alvo.getBoundingClientRect();
    dica.textContent = pecas.get(k).titulo;
    dica.hidden = false;
    dica.style.left = `${Math.min(e.clientX - r.left + 14, r.width - dica.offsetWidth - 8)}px`;
    dica.style.top = `${e.clientY - r.top + 14}px`;
  };
  const aoSair = () => { dica.hidden = true; };
  renderer.domElement.addEventListener('pointerdown', aoApertar);
  renderer.domElement.addEventListener('pointerup', aoSoltar);
  renderer.domElement.addEventListener('pointermove', aoMover);
  renderer.domElement.addEventListener('pointerleave', aoSair);

  let ajuste = 0;
  const observa = new ResizeObserver(() => {
    cancelAnimationFrame(ajuste);
    ajuste = requestAnimationFrame(() => {
      const w = alvo.clientWidth;
      if (!w || w === largura) return;
      largura = w; altura = alturaDe(w);
      renderer.setSize(largura, altura);
      camera.aspect = largura / altura; camera.updateProjectionMatrix();
      largas.forEach(m => m.resolution.set(largura, altura));
      acorda();
    });
  });
  observa.observe(alvo);

  return {
    /** porChave: Map chave → { cor, altura (0 a 1, ou null = rente ao chão), titulo }; escolhido: a chave em laranja;
     *  realcadas: chaves com o contorno escuro. As alturas sobem ou descem aos poucos. */
    pinta(porChave, { escolhido = null, realcadas = new Set() } = {}) {
      const de = new Map(), para = new Map();
      limpaGrossos();
      for (const [k, p] of pecas) {
        const v = porChave.get(k);
        p.material.color.set(v?.cor ?? '#b9ae97');
        if (realcadas.has(k) && k !== escolhido) contornoGrosso(p, '#22201c', 2);
        p.titulo = v?.titulo ?? '';
        de.set(k, p.malha.scale.z);
        para.set(k, CHAO + (v?.altura ?? 0) * alturaMax);
      }
      if (escolhido != null && pecas.has(escolhido)) contornoGrosso(pecas.get(escolhido), '#f26522', 4, true);
      if (reduz()) { for (const [k, p] of pecas) p.malha.scale.z = para.get(k); acorda(); return; }
      const inicio = performance.now();
      animacoes = [agora => {
        const t = SAI(Math.min(1, (agora - inicio) / 700));
        for (const [k, p] of pecas) p.malha.scale.z = de.get(k) + (para.get(k) - de.get(k)) * t;
        return t < 1;
      }];
      acorda();
    },
    destroi() {
      if (quadro != null) cancelAnimationFrame(quadro);
      observa.disconnect(); cancelAnimationFrame(ajuste);
      controles.dispose();
      limpaGrossos();
      geometrias.forEach(g => g.dispose()); materiais.forEach(m => m.dispose());
      renderer.dispose();
      alvo.classList.remove('relevo-3d');
      alvo.innerHTML = '';
    },
  };
}
