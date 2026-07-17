import * as THREE from 'three';
import { earthShader, atmosphereShader, sunShader } from './shaders.js';

const TEX = (loader, file, colorSpace = THREE.SRGBColorSpace) => {
  const t = loader.load(`/textures/${file}`);
  t.colorSpace = colorSpace;
  t.anisotropy = 8;
  return t;
};

export function createStarfield(loader) {
  const geo = new THREE.SphereGeometry(4000, 48, 48);
  const mat = new THREE.MeshBasicMaterial({
    map: TEX(loader, 'stars.jpg'),
    side: THREE.BackSide,
    color: 0x9aa4b8, // 稍压暗，避免喧宾夺主
    depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}

export function createSun(loader, sunData) {
  const group = new THREE.Group();
  group.name = 'sun';

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: TEX(loader, sunData.texture) },
      time: { value: 0 },
    },
    vertexShader: sunShader.vertex,
    fragmentShader: sunShader.fragment,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(sunData.radius, 96, 96), mat);
  mesh.name = 'sun';
  group.add(mesh);

  // 日冕：径向渐变 sprite，加色混合
  const corona = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeCoronaTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.55,
    })
  );
  corona.scale.setScalar(sunData.radius * 5.2);
  group.add(corona);

  // 太阳是唯一光源
  const light = new THREE.PointLight(0xfff2e0, 2.2, 0, 0);
  group.add(light);

  return { group, mesh, mat };
}

function makeCoronaTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255, 235, 190, 0.55)');
  g.addColorStop(0.18, 'rgba(255, 200, 120, 0.28)');
  g.addColorStop(0.4, 'rgba(255, 160, 80, 0.1)');
  g.addColorStop(0.7, 'rgba(255, 130, 60, 0.03)');
  g.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 通用行星：标准 PBR 材质 + 可选大气壳、光环
export function createPlanet(loader, data) {
  // orbitGroup 承载轨道倾角；positionGroup 沿轨道移动；tiltGroup 承载自转轴倾角
  const orbitGroup = new THREE.Group();
  orbitGroup.rotation.x = THREE.MathUtils.degToRad(data.inclinationDeg || 0);

  const positionGroup = new THREE.Group();
  orbitGroup.add(positionGroup);

  const tiltGroup = new THREE.Group();
  tiltGroup.rotation.z = THREE.MathUtils.degToRad(data.tiltDeg || 0);
  positionGroup.add(tiltGroup);

  let mesh;
  let extras = {};

  if (data.id === 'earth') {
    ({ mesh, ...extras } = createEarthMesh(loader, data));
  } else {
    const mat = new THREE.MeshStandardMaterial({
      map: TEX(loader, data.texture),
      roughness: 1.0,
      metalness: 0.0,
    });
    mesh = new THREE.Mesh(new THREE.SphereGeometry(data.radius, 64, 64), mat);
  }
  mesh.name = data.id;
  tiltGroup.add(mesh);

  // 大气辉光壳
  if (data.atmosphere) {
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(data.radius * 1.045, 64, 64),
      new THREE.ShaderMaterial({
        uniforms: {
          glowColor: { value: new THREE.Color(data.atmosphere.color) },
          intensity: { value: data.atmosphere.intensity },
          sunDirection: { value: new THREE.Vector3(1, 0, 0) },
        },
        vertexShader: atmosphereShader.vertex,
        fragmentShader: atmosphereShader.fragment,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    positionGroup.add(atmo);
    extras.atmosphere = atmo;
  }

  // 土星光环
  if (data.ring) {
    const ring = createRing(loader, data);
    tiltGroup.add(ring);
    extras.ring = ring;
  }

  // 轨道线
  const orbitLine = createOrbitLine(data.dist);
  orbitGroup.add(orbitLine);

  return {
    data,
    orbitGroup,
    positionGroup,
    tiltGroup,
    mesh,
    orbitLine,
    ...extras,
  };
}

function createEarthMesh(loader, data) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: TEX(loader, 'earth_day.jpg') },
      nightMap: { value: TEX(loader, 'earth_night.jpg') },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: earthShader.vertex,
    fragmentShader: earthShader.fragment,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(data.radius, 96, 96), mat);

  // 云层：独立球壳，云图亮度作为透明度，白云随太阳光照明暗
  const cloudsTex = TEX(loader, 'earth_clouds.jpg', THREE.NoColorSpace);
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(data.radius * 1.012, 96, 96),
    new THREE.MeshLambertMaterial({
      color: 0xffffff,
      alphaMap: cloudsTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.95,
    })
  );
  mesh.add(clouds);

  return { mesh, earthMat: mat, clouds };
}

function createRing(loader, data) {
  const inner = data.radius * data.ring.innerScale;
  const outer = data.radius * data.ring.outerScale;
  const geo = new THREE.RingGeometry(inner, outer, 180, 1);

  // 重映射 UV：u 沿半径方向，匹配光环条带贴图
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const v3 = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v3.fromBufferAttribute(pos, i);
    const r = (v3.length() - inner) / (outer - inner);
    uv.setXY(i, r, 0.5);
  }

  // 光环是水平薄面，点光源掠射下 PBR 光照趋近于零，会整环变黑；
  // 冰环反照率本就极高，这里用自发光近似太阳照亮的效果
  const tex = TEX(loader, data.ring.texture);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: 0xd8d2c4,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.name = data.id; // 点击光环也算点击土星
  return ring;
}

function createOrbitLine(dist) {
  const points = [];
  const N = 256;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * dist, 0, Math.sin(a) * dist));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: 0x4a5e7a,
    transparent: true,
    opacity: 0.35,
  });
  return new THREE.Line(geo, mat);
}

// 月球：挂在地球的 positionGroup 下
export function createMoon(loader, moonData) {
  const orbitGroup = new THREE.Group();
  orbitGroup.rotation.x = THREE.MathUtils.degToRad(moonData.inclinationDeg);

  const positionGroup = new THREE.Group();
  orbitGroup.add(positionGroup);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(moonData.radius, 48, 48),
    new THREE.MeshStandardMaterial({
      map: TEX(loader, moonData.texture),
      roughness: 1.0,
      metalness: 0.0,
    })
  );
  mesh.name = 'moon';
  positionGroup.add(mesh);

  const orbitLine = createOrbitLine(moonData.dist);
  orbitLine.material.opacity = 0.2;
  orbitGroup.add(orbitLine);

  return { data: moonData, orbitGroup, positionGroup, tiltGroup: positionGroup, mesh, orbitLine };
}
