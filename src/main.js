import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { SUN, PLANETS, MOON, SPEEDS, DEFAULT_SPEED_INDEX } from './data.js';
import { createStarfield, createSun, createPlanet, createMoon } from './bodies.js';
import { createViews } from './views.js';
import * as ui from './ui.js';

// ---------- 渲染器 / 场景 / 相机 ----------

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 10000);

const OVERVIEW_POS = new THREE.Vector3(0, 62, 165);
camera.position.copy(OVERVIEW_POS);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2;
controls.maxDistance = 800;

// ---------- 后期：Bloom ----------

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.35, // strength
  0.45, // radius
  0.85  // threshold
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ---------- 天体 ----------

const loadingManager = new THREE.LoadingManager();
ui.bindLoading(loadingManager);
const loader = new THREE.TextureLoader(loadingManager);

scene.add(new THREE.AmbientLight(0x223344, 0.25));
scene.add(createStarfield(loader));

const sun = createSun(loader, SUN);
scene.add(sun.group);

const planets = PLANETS.map((data) => {
  const p = createPlanet(loader, data);
  scene.add(p.orbitGroup);
  return p;
});

const earth = planets.find((p) => p.data.id === 'earth');
const moon = createMoon(loader, MOON);
earth.positionGroup.add(moon.orbitGroup);

// 可点击 / 可聚焦的天体集合
const focusables = new Map();
focusables.set('sun', { data: SUN, mesh: sun.mesh, getWorldPos: () => new THREE.Vector3(0, 0, 0) });
for (const p of planets) {
  focusables.set(p.data.id, {
    data: p.data,
    mesh: p.mesh,
    getWorldPos: () => p.positionGroup.getWorldPosition(new THREE.Vector3()),
  });
}
focusables.set('moon', {
  data: MOON,
  mesh: moon.mesh,
  getWorldPos: () => moon.positionGroup.getWorldPosition(new THREE.Vector3()),
});

// ---------- 模拟状态 ----------

let simDays = 0;
let daysPerSec = SPEEDS[DEFAULT_SPEED_INDEX].daysPerSec;
let paused = false;
let showLabels = true;
const START_DATE = new Date(2026, 6, 17);

// ---------- 聚焦 / 相机动画 ----------

let followId = null; // 相机跟随的天体（聚焦或跟随型机位）
let tween = null;
const prevFocusPos = new THREE.Vector3();

function startTween(toPos, toTarget, duration = 1.4) {
  tween = {
    fromPos: camera.position.clone(),
    toPos,
    fromTarget: controls.target.clone(),
    toTarget,
    t: 0,
    duration,
  };
}

function focusBody(id) {
  const body = focusables.get(id);
  if (!body) return;
  followId = id;
  ui.showInfo(body.data);
  ui.setActiveView(null);

  const bodyPos = body.getWorldPos();
  const r = body.data.radius;
  const dist = Math.max(r * 4.2, 3.5);
  // 保持当前观察方向飞过去，略微抬高视角
  const dir = camera.position.clone().sub(bodyPos).normalize();
  dir.y = Math.max(dir.y, 0.25);
  dir.normalize();

  startTween(bodyPos.clone().add(dir.multiplyScalar(dist)), bodyPos.clone());
  prevFocusPos.copy(bodyPos);
}

function applyView(view) {
  const { pos, target, follow } = view.getView();
  followId = follow || null;
  ui.hideInfo();
  ui.setActiveView(view.id);
  startTween(pos, target, 1.6);
  if (followId) prevFocusPos.copy(focusables.get(followId).getWorldPos());
}

function unfocus() {
  if (followId === null && !tween) return;
  followId = null;
  ui.hideInfo();
  ui.setActiveView(null);
  startTween(OVERVIEW_POS.clone(), new THREE.Vector3(0, 0, 0));
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ---------- UI ----------

ui.initUI({
  navBodies: [SUN, ...PLANETS, MOON],
  onSelect: focusBody,
  onDeselect: unfocus,
  onSpeedChange: (v) => (daysPerSec = v),
  onPauseToggle: () => (paused = !paused),
  onToggleOrbits: (v) => {
    for (const p of planets) p.orbitLine.visible = v;
    moon.orbitLine.visible = v;
  },
  onToggleLabels: (v) => {
    showLabels = v;
    ui.setLabelsVisible(v);
  },
});

const labels = ui.createLabels([SUN, ...PLANETS, MOON], focusBody);

const views = createViews((id) => focusables.get(id).getWorldPos());
ui.initViewPanel(views, (id) => applyView(views.find((v) => v.id === id)));
// 手动拖拽后不再是预设机位，取消高亮
controls.addEventListener('start', () => ui.setActiveView(null));

// ---------- 拾取 ----------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downXY = null;

canvas.addEventListener('pointerdown', (e) => (downXY = [e.clientX, e.clientY]));
canvas.addEventListener('pointerup', (e) => {
  if (!downXY) return;
  const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
  downXY = null;
  if (moved > 5) return; // 拖拽不算点击

  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const meshes = [...focusables.values()].map((b) => b.mesh);
  const hits = raycaster.intersectObjects(meshes, true);
  if (hits.length > 0) {
    let obj = hits[0].object;
    while (obj && !focusables.has(obj.name)) obj = obj.parent;
    if (obj) focusBody(obj.name);
  }
});

// ---------- 主循环 ----------

const clock = new THREE.Clock();
const tmpV3 = new THREE.Vector3();

function positionBody(p, days) {
  const angle = p.data.phase + (days / p.data.periodDays) * Math.PI * 2;
  p.positionGroup.position.set(
    Math.cos(angle) * p.data.dist,
    0,
    Math.sin(angle) * p.data.dist
  );
  // 自转
  const spin = (days * 24 / p.data.rotationHours) * Math.PI * 2;
  p.mesh.rotation.y = spin;
}

function updateLabels() {
  if (!showLabels) return;
  const earthPos = earth.positionGroup.getWorldPosition(tmpV3.set(0, 0, 0));
  const camToEarth = camera.position.distanceTo(earthPos);

  for (const [id, el] of labels) {
    const body = focusables.get(id);
    const pos = body.getWorldPos();
    // 月球标签只在靠近地球时显示
    if (id === 'moon' && camToEarth > 40) {
      el.classList.add('hidden');
      continue;
    }
    const projected = pos.clone().project(camera);
    const behind = projected.z > 1;
    if (behind || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) {
      el.classList.add('hidden');
      continue;
    }
    el.classList.remove('hidden');
    el.style.left = `${(projected.x * 0.5 + 0.5) * window.innerWidth}px`;
    el.style.top = `${(-projected.y * 0.5 + 0.5) * window.innerHeight}px`;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!paused) simDays += dt * daysPerSec;

  // 天体位置与自转
  for (const p of planets) positionBody(p, simDays);
  positionBody(moon, simDays);
  sun.mesh.rotation.y = (simDays / 25.4) * Math.PI * 2;
  sun.mat.uniforms.time.value += dt;

  // 更新 sunDirection uniform（太阳在原点，方向 = -归一化行星位置）
  for (const p of planets) {
    const worldPos = p.positionGroup.getWorldPosition(tmpV3);
    const sunDir = worldPos.clone().normalize().negate();
    if (p.earthMat) p.earthMat.uniforms.sunDirection.value.copy(sunDir);
    if (p.atmosphere) p.atmosphere.material.uniforms.sunDirection.value.copy(sunDir);
  }

  // 相机动画 / 跟随
  if (tween) {
    tween.t += dt / tween.duration;
    const k = easeInOut(Math.min(tween.t, 1));
    // 聚焦目标在移动，动态刷新终点
    if (followId) {
      const bodyPos = focusables.get(followId).getWorldPos();
      const delta = bodyPos.clone().sub(prevFocusPos);
      tween.toPos.add(delta);
      tween.toTarget.copy(bodyPos);
      prevFocusPos.copy(bodyPos);
    }
    camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
    controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
    if (tween.t >= 1) tween = null;
  } else if (followId) {
    // 跟随：目标移动多少，相机平移多少
    const bodyPos = focusables.get(followId).getWorldPos();
    const delta = tmpV3.copy(bodyPos).sub(prevFocusPos);
    camera.position.add(delta);
    controls.target.copy(bodyPos);
    prevFocusPos.copy(bodyPos);
  }

  controls.update();
  updateLabels();
  ui.updateSimDate(new Date(START_DATE.getTime() + simDays * 86400000));

  composer.render();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

animate();
