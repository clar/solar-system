import * as THREE from 'three';

// 预设机位：getView 在点击时求值，跟随型机位（follow 非空）会持续追踪目标天体
export function createViews(getWorldPos) {
  const UP = new THREE.Vector3(0, 1, 0);
  const ORIGIN = () => new THREE.Vector3(0, 0, 0);

  return [
    {
      id: 'overview',
      name: '全景俯瞰',
      desc: '纵览八大行星与轨道的经典视角',
      getView: () => ({ pos: new THREE.Vector3(0, 62, 165), target: ORIGIN(), follow: null }),
    },
    {
      id: 'topdown',
      name: '顶视鸟瞰',
      desc: '正上方俯视，轨道呈同心圆展开',
      getView: () => ({ pos: new THREE.Vector3(0, 275, 0.5), target: ORIGIN(), follow: null }),
    },
    {
      id: 'ecliptic',
      name: '黄道平面',
      desc: '贴着公转平面平视，行星与你同高',
      getView: () => ({ pos: new THREE.Vector3(42, 6, 182), target: ORIGIN(), follow: null }),
    },
    {
      id: 'inner',
      name: '内太阳系',
      desc: '聚焦太阳与四颗岩质行星',
      getView: () => ({ pos: new THREE.Vector3(0, 26, 64), target: ORIGIN(), follow: null }),
    },
    {
      id: 'earthmoon',
      name: '地月同框',
      desc: '跟随地球，与月球同框而行',
      getView: () => {
        const earth = getWorldPos('earth');
        const moon = getWorldPos('moon');
        const mid = earth.clone().add(moon).multiplyScalar(0.5);
        // 相机站在地月连线的侧向，保证两者都在画面里
        const side = moon.clone().sub(earth).cross(UP).normalize();
        const pos = mid.clone().addScaledVector(side, 7).addScaledVector(UP, 2);
        return { pos, target: mid, follow: 'earth' };
      },
    },
    {
      id: 'saturnring',
      name: '土星环上空',
      desc: '掠过光环受光面的低角度特写',
      getView: () => {
        const saturn = getWorldPos('saturn');
        const toSun = saturn.clone().negate().normalize();
        const pos = saturn.clone().addScaledVector(toSun, 16).add(new THREE.Vector3(0, 3.4, 0));
        return { pos, target: saturn.clone(), follow: 'saturn' };
      },
    },
  ];
}
