// O plenário em 3D (Three.js): as cadeiras em degraus, num semicírculo, coloridas pelo partido de
// quem se sentou; em volta, a multidão de candidatos que não se elegeram. Na primeira vez, os eleitos
// saem da multidão e caminham até as cadeiras. Dá para girar a cena; clicar numa cadeira aproxima a
// câmera e mostra quem está sentado ali.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { formata } from './comum.js?v=20261107';

const MAX_MULTIDAO = 2400;
const BEGE = new THREE.Color('#e8dcc4'), VISOR = new THREE.Color('#faf7ef');
const SAI = t => 1 - (1 - t) ** 3;

/** Gerador pseudoaleatório com semente: a multidão fica no mesmo lugar a cada desenho. */
function sorteio(semente) {
  let s = semente >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** Monta a cena em `alvo`. dados: { total, passo, geo: {pontos, raio}, lista, donos, ocupantes, cores, multidao }.
 *  aoEscolher({ assento, partido, candidato }) é chamado no clique de uma cadeira.
 *  Devolve { destroi, destaca(i), escolhe(k) }. */
export function montaPlenario3D(alvo, dados, aoEscolher, { animar = true } = {}) {
  const { total, passo, geo: { pontos, raio }, donos, ocupantes, cores, multidao } = dados;
  alvo.innerHTML = '';
  alvo.classList.add('plenario-3d');
  let largura = alvo.clientWidth || 640;
  let altura = Math.round(Math.min(560, Math.max(320, largura * 0.62)));
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(largura, altura);
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', `Plenário em 3D com ${formata.numero(total)} ${total === 1 ? 'cadeira' : 'cadeiras'}; arraste para girar`);
  alvo.append(renderer.domElement);
  alvo.insertAdjacentHTML('beforeend', `<p class="plenario-3d-total"><b>${formata.numero(total)}</b> ${total === 1 ? 'cadeira' : 'cadeiras'}${passo > 1 ? ` · cada cadeira ≈ ${passo}` : ''}</p>`);

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, largura / altura, 0.01, 60);
  // poucas cadeiras (presidente, governador, prefeito): câmera mais perto e a multidão em volta da mesa
  const poucas = pontos.length <= 3;
  const casaCamera = poucas ? new THREE.Vector3(0, 0.6, 0.65) : new THREE.Vector3(0, 1.45, 1.75);
  const casaAlvo = poucas ? new THREE.Vector3(0, 0.05, -0.4) : new THREE.Vector3(0, 0, -0.42);
  // tela estreita (celular em pé): afasta a câmera para o semicírculo inteiro caber
  const recuo = Math.max(1, 1.35 / camera.aspect);
  casaCamera.sub(casaAlvo).multiplyScalar(recuo).add(casaAlvo);
  camera.position.copy(casaCamera);
  cena.add(new THREE.HemisphereLight(0xfff8ec, 0x8a7a5a, 1.25));
  const sol = new THREE.DirectionalLight(0xffffff, 1.4);
  sol.position.set(2, 4, 3);
  cena.add(sol);

  const geometrias = [], materiais = [];
  const guarda = (g, m) => { geometrias.push(g); materiais.push(m); return [g, m]; };

  // piso e degraus: cada fileira um degrau, as de trás mais altas
  const [gPiso, mPiso] = guarda(new THREE.CircleGeometry(2.3, 64), new THREE.MeshStandardMaterial({ color: '#d8c9a9', roughness: 0.9 }));
  const piso = new THREE.Mesh(gPiso, mPiso);
  piso.rotation.x = -Math.PI / 2;
  cena.add(piso);
  const fileiras = Math.max(...pontos.map(p => p.fileira)) + 1;
  const ALTURA_DEGRAU = Math.min(0.03, 0.5 / Math.max(fileiras, 1));
  const raiosFileira = Array.from({ length: fileiras }, (_, i) => Math.max(...pontos.filter(p => p.fileira === i).map(p => Math.hypot(p.x, p.y))));
  const [, mDegrau] = guarda(null, new THREE.MeshStandardMaterial({ color: '#d9cbb0', roughness: 0.9, side: THREE.DoubleSide }));
  // cada degrau é uma faixa em meia-lua (do meio do caminho até a fileira anterior ao meio do caminho até
  // a seguinte), virada para o fundo, onde ficam as cadeiras (z negativo)
  raiosFileira.forEach((r, i) => {
    const dentro = i === 0 ? Math.max(0, r - raio * 1.6) : (raiosFileira[i - 1] + r) / 2;
    const fora = i === fileiras - 1 ? r + raio * 1.6 : (r + raiosFileira[i + 1]) / 2;
    const h = ALTURA_DEGRAU * (i + 1);
    const perfil = [new THREE.Vector2(dentro, 0), new THREE.Vector2(fora, 0), new THREE.Vector2(fora, h), new THREE.Vector2(dentro, h)];
    const g = new THREE.LatheGeometry(perfil, 64, Math.PI / 2, Math.PI);
    geometrias.push(g);
    cena.add(new THREE.Mesh(g, mDegrau));
  });
  const alturaDe = p => ALTURA_DEGRAU * (p.fileira + 1);

  // cadeiras e quem se sentou nelas
  const tamanho = poucas ? 0.13 : Math.min(0.07, Math.max(0.012, raio * 1.25));   // nem gigante nem sumida
  const [gCadeira, mCadeira] = guarda(new THREE.CylinderGeometry(tamanho * 0.48, tamanho * 0.52, tamanho * 0.3, 14), new THREE.MeshStandardMaterial({ roughness: 0.55 }));
  const cadeiras = new THREE.InstancedMesh(gCadeira, mCadeira, pontos.length);
  // cada eleito sentado leva a cor do partido; a cadeira fica clara
  const [gPessoa, mPessoa] = guarda(new THREE.CapsuleGeometry(tamanho * 0.42, tamanho * 0.55, 4, 12), new THREE.MeshStandardMaterial({ roughness: 0.6 }));
  const sentados = new THREE.InstancedMesh(gPessoa, mPessoa, pontos.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), um = new THREE.Vector3(1, 1, 1);
  const posAssento = pontos.map(p => new THREE.Vector3(p.x, alturaDe(p), -p.y));
  const coresBase = pontos.map((_, k) => (donos?.[k] != null ? new THREE.Color(cores[donos[k]]) : VISOR.clone()));
  posAssento.forEach((v, k) => {
    m.compose(new THREE.Vector3(v.x, v.y + tamanho * 0.22, v.z), q, um);
    cadeiras.setMatrixAt(k, m);
    cadeiras.setColorAt(k, donos?.[k] != null ? VISOR : BEGE);
    sentados.setColorAt(k, coresBase[k]);
  });
  // o paletó: o corpo na cor do partido; na frente, o V da camisa branca, a gravata escura, as lapelas (no tom mais
  // escuro do partido) dos dois lados do V e dois botões. As peças já ficam no lugar certo em relação ao corpo, e
  // cada uma recebe a mesma matriz do eleito
  const rCorpo = tamanho * 0.42;
  const gCamisa = new THREE.ConeGeometry(tamanho * 0.17, tamanho * 0.36, 3);
  gCamisa.rotateX(Math.PI); gCamisa.scale(1, 1, 0.25); gCamisa.translate(0, tamanho * 0.17, rCorpo * 0.93);
  const gGravata = new THREE.BoxGeometry(tamanho * 0.075, tamanho * 0.3, tamanho * 0.035);
  gGravata.translate(0, tamanho * 0.09, rCorpo * 1.0);
  const lapela = lado => {
    const g = new THREE.BoxGeometry(tamanho * 0.07, tamanho * 0.4, tamanho * 0.03);
    g.rotateZ(lado * 0.38); g.translate(lado * -tamanho * 0.115, tamanho * 0.15, rCorpo * 0.97);
    return g;
  };
  const botao = y => new THREE.SphereGeometry(tamanho * 0.028, 8, 6).translate(0, y, rCorpo * 0.99);
  const junta = partes => { const g = mergeGeometries(partes); partes.forEach(parte => parte.dispose()); return g; };
  const gLapelas = junta([lapela(1), lapela(-1)]);
  const gBotoes = junta([botao(-tamanho * 0.06), botao(-tamanho * 0.17)]);
  const [, mCamisa] = guarda(gCamisa, new THREE.MeshStandardMaterial({ color: '#faf7ef', roughness: 0.7 }));
  const [, mGravata] = guarda(gGravata, new THREE.MeshStandardMaterial({ color: '#22201c', roughness: 0.5 }));
  const [, mLapelas] = guarda(gLapelas, new THREE.MeshStandardMaterial({ roughness: 0.55 }));
  guarda(gBotoes, null);
  const camisas = new THREE.InstancedMesh(gCamisa, mCamisa, pontos.length);
  const gravatas = new THREE.InstancedMesh(gGravata, mGravata, pontos.length);
  const lapelas = new THREE.InstancedMesh(gLapelas, mLapelas, pontos.length);
  const botoes = new THREE.InstancedMesh(gBotoes, mGravata, pontos.length);
  const corLapela = cor => cor.clone().lerp(new THREE.Color('#000000'), 0.35);
  pontos.forEach((_, k) => lapelas.setColorAt(k, corLapela(coresBase[k])));
  const roupa = [camisas, gravatas, lapelas, botoes];
  cena.add(cadeiras, sentados, ...roupa);

  // a multidão dos que não se elegeram, em volta do plenário (atrás e dos lados, sem tapar a vista)
  const sorte = sorteio(total * 31 + pontos.length);
  const naMultidao = Math.min(multidao, MAX_MULTIDAO);
  const [, mMultidao] = guarda(null, new THREE.MeshStandardMaterial({ color: '#b9ab8d', roughness: 0.9, transparent: true, opacity: 0.85 }));
  const lugarNaMultidao = () => {
    const ang = -0.2 * Math.PI + sorte() * 1.4 * Math.PI, r = poucas ? 0.75 + sorte() * 0.5 : 1.18 + sorte() * 0.75;
    return new THREE.Vector3(r * Math.cos(ang), 0, -r * Math.sin(ang));
  };
  const multidaoMesh = new THREE.InstancedMesh(gPessoa, mMultidao, Math.max(naMultidao, 1));
  for (let i = 0; i < naMultidao; i += 1) {
    const v = lugarNaMultidao();
    m.compose(new THREE.Vector3(v.x, tamanho * 0.55, v.z), q, um);
    multidaoMesh.setMatrixAt(i, m);
  }
  multidaoMesh.count = naMultidao;
  cena.add(multidaoMesh);

  // os eleitos: saem da multidão e caminham até as cadeiras
  const ocupados = pontos.map((_, k) => donos?.[k] != null);
  const partida = pontos.map(() => lugarNaMultidao());
  const posPessoa = (k, t) => {
    const fim = posAssento[k], ini = partida[k];
    const v = ini.clone().lerp(fim, t);
    v.y = (t < 1 ? Math.sin(Math.PI * t) * 0.08 : 0) + fim.y * t + tamanho * 0.62;
    return v;
  };
  // cada eleito olha para o centro do plenário (a mesa), de frente para a câmera
  const cima = new THREE.Vector3(0, 1, 0);
  const olhar = posAssento.map(v => new THREE.Quaternion().setFromAxisAngle(cima, Math.atan2(-v.x, -v.z)));
  function poePessoas(t) {
    posAssento.forEach((_, k) => {
      const escala = ocupados[k] ? 1 : 0;
      m.compose(posPessoa(k, t), olhar[k], new THREE.Vector3(escala, escala, escala));
      sentados.setMatrixAt(k, m);
      for (const peca of roupa) peca.setMatrixAt(k, m);
    });
    // os eleitos mudaram de lugar: a esfera que envolve todos eles (usada para saber se estão na tela e no clique)
    // precisa ser refeita, senão quem chegou à cadeira fica fora dela e some com a câmera de perto
    for (const malha of [sentados, ...roupa]) {
      malha.instanceMatrix.needsUpdate = true;
      malha.boundingSphere = null; malha.boundingBox = null;
    }
  }

  // câmera e controles
  const controles = new OrbitControls(camera, renderer.domElement);
  controles.target.copy(casaAlvo);
  controles.enablePan = false;
  controles.minDistance = 0.5; controles.maxDistance = 5;
  controles.minPolarAngle = 0.15; controles.maxPolarAngle = 1.35;
  controles.minAzimuthAngle = -Math.PI / 2; controles.maxAzimuthAngle = Math.PI / 2;
  controles.enableDamping = true;
  controles.update();

  let quadro = null, animacoes = [];
  const desenha = () => renderer.render(cena, camera);
  function laco(agora) {
    animacoes = animacoes.filter(a => a(agora));
    const mexendo = controles.update();
    desenha();
    quadro = animacoes.length || mexendo ? requestAnimationFrame(laco) : null;
  }
  const acorda = () => { if (quadro == null) quadro = requestAnimationFrame(laco); };
  controles.addEventListener('change', acorda);

  function anima(duracao, passoAnim) {
    const inicio = performance.now();
    animacoes.push(agora => { const t = Math.min(1, (agora - inicio) / duracao); passoAnim(SAI(t)); return t < 1; });
    acorda();
  }

  if (animar) { poePessoas(0); anima(1200, poePessoas); } else { poePessoas(1); acorda(); }

  // escolher uma cadeira: marca, aproxima a câmera e avisa a página
  const [gMarca, mMarca] = guarda(new THREE.TorusGeometry(tamanho * 0.9, tamanho * 0.12, 8, 32), new THREE.MeshBasicMaterial({ color: '#f26522' }));
  const marca = new THREE.Mesh(gMarca, mMarca);
  marca.rotation.x = -Math.PI / 2;
  marca.visible = false;
  cena.add(marca);
  function escolhe(k) {
    const alvoV = posAssento[k];
    marca.position.set(alvoV.x, alvoV.y + 0.004, alvoV.z);
    marca.visible = true;
    const deCam = camera.position.clone(), deAlvo = controles.target.clone();
    const paraAlvo = alvoV.clone();
    const paraCam = alvoV.clone().add(new THREE.Vector3(alvoV.x * 0.35, 0.45, 0.75));
    anima(600, t => { camera.position.lerpVectors(deCam, paraCam, t); controles.target.lerpVectors(deAlvo, paraAlvo, t); });
    aoEscolher({ assento: k, partido: donos?.[k] ?? null, candidato: ocupantes?.[k] ?? null });
  }

  const raio3d = new THREE.Raycaster(), ponteiro = new THREE.Vector2();
  let apertou = null;
  const acertou = e => {
    const r = renderer.domElement.getBoundingClientRect();
    ponteiro.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raio3d.setFromCamera(ponteiro, camera);
    const [hit] = raio3d.intersectObjects([cadeiras, sentados], false);
    return hit?.instanceId ?? null;
  };
  const aoApertar = e => { apertou = [e.clientX, e.clientY]; };
  const aoSoltar = e => {
    if (!apertou || Math.hypot(e.clientX - apertou[0], e.clientY - apertou[1]) > 5) return;
    const k = acertou(e);
    if (k != null) escolhe(k);
  };
  const aoMover = e => { if (e.buttons === 0) renderer.domElement.style.cursor = acertou(e) != null ? 'pointer' : 'grab'; };
  renderer.domElement.addEventListener('pointerdown', aoApertar);
  renderer.domElement.addEventListener('pointerup', aoSoltar);
  renderer.domElement.addEventListener('pointermove', aoMover);

  // o ajuste vai para o próximo quadro: mudar a altura do canvas dentro do aviso de redimensionamento (a barra de
  // rolagem pode aparecer e mudar a largura) gerava outro aviso no mesmo quadro, e o navegador acusava um laço
  let ajuste = 0;
  const observa = new ResizeObserver(() => {
    cancelAnimationFrame(ajuste);
    ajuste = requestAnimationFrame(() => {
      const w = alvo.clientWidth;
      if (!w || w === largura) return;
      largura = w; altura = Math.round(Math.min(560, Math.max(320, largura * 0.62)));
      renderer.setSize(largura, altura);
      camera.aspect = largura / altura; camera.updateProjectionMatrix();
      acorda();
    });
  });
  observa.observe(alvo);

  return {
    escolhe,
    destaca(i) {
      pontos.forEach((_, k) => {
        const cor = i == null || donos?.[k] === i ? coresBase[k] : coresBase[k].clone().lerp(BEGE, 0.8);
        sentados.setColorAt(k, cor);
        lapelas.setColorAt(k, corLapela(cor));
      });
      sentados.instanceColor.needsUpdate = true;
      lapelas.instanceColor.needsUpdate = true;
      acorda();
    },
    volta() {
      marca.visible = false;
      const deCam = camera.position.clone(), deAlvo = controles.target.clone();
      anima(600, t => { camera.position.lerpVectors(deCam, casaCamera, t); controles.target.lerpVectors(deAlvo, casaAlvo, t); });
    },
    destroi() {
      if (quadro != null) cancelAnimationFrame(quadro);
      observa.disconnect(); cancelAnimationFrame(ajuste);
      controles.dispose();
      geometrias.forEach(g => g?.dispose()); materiais.forEach(mt => mt?.dispose());
      renderer.dispose();
      alvo.classList.remove('plenario-3d');
      alvo.innerHTML = '';
    },
  };
}
