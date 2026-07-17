import { SPEEDS, DEFAULT_SPEED_INDEX } from './data.js';

export function initUI(handlers) {
  const { onSelect, onDeselect, onSpeedChange, onPauseToggle, onToggleOrbits, onToggleLabels } = handlers;

  // 左侧行星导航
  const nav = document.getElementById('planet-nav');
  for (const body of handlers.navBodies) {
    const btn = document.createElement('button');
    btn.textContent = body.name;
    btn.dataset.id = body.id;
    btn.addEventListener('click', () => onSelect(body.id));
    nav.appendChild(btn);
  }

  // 速度档位
  const speedWrap = document.getElementById('speed-buttons');
  SPEEDS.forEach((s, i) => {
    const btn = document.createElement('button');
    btn.textContent = s.label;
    btn.dataset.index = i;
    if (i === DEFAULT_SPEED_INDEX) btn.classList.add('active');
    btn.addEventListener('click', () => {
      speedWrap.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onSpeedChange(s.daysPerSec);
    });
    speedWrap.appendChild(btn);
  });

  // 暂停
  const pauseBtn = document.getElementById('btn-pause');
  pauseBtn.addEventListener('click', () => {
    const paused = onPauseToggle();
    pauseBtn.textContent = paused ? '▶' : '⏸';
  });

  // 开关
  document.getElementById('toggle-orbits').addEventListener('change', (e) => onToggleOrbits(e.target.checked));
  document.getElementById('toggle-labels').addEventListener('change', (e) => onToggleLabels(e.target.checked));

  // 信息面板关闭
  document.getElementById('info-close').addEventListener('click', () => onDeselect());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') onDeselect();
  });
}

export function showInfo(data) {
  document.getElementById('info-name').textContent = data.name;
  document.getElementById('info-name-en').textContent = data.nameEn;
  document.getElementById('info-desc').textContent = data.desc;
  const stats = document.getElementById('info-stats');
  stats.innerHTML = '';
  for (const [k, v] of Object.entries(data.stats)) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    stats.append(dt, dd);
  }
  document.getElementById('info-panel').classList.add('visible');
  setActiveNav(data.id);
}

export function hideInfo() {
  document.getElementById('info-panel').classList.remove('visible');
  setActiveNav(null);
}

function setActiveNav(id) {
  document.querySelectorAll('#planet-nav button').forEach((b) => {
    b.classList.toggle('active', b.dataset.id === id);
  });
}

export function updateSimDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  document.getElementById('sim-date').textContent = `${y}-${m}-${d}`;
}

// ---------- 视角机位 ----------

export function initViewPanel(views, onSelect) {
  const panel = document.getElementById('view-panel');
  const list = document.getElementById('view-list');
  document.getElementById('view-toggle').addEventListener('click', () => {
    panel.classList.toggle('open');
  });
  for (const v of views) {
    const item = document.createElement('button');
    item.className = 'view-item';
    item.dataset.id = v.id;
    const name = document.createElement('span');
    name.className = 'view-name';
    name.textContent = v.name;
    const desc = document.createElement('span');
    desc.className = 'view-desc';
    desc.textContent = v.desc;
    item.append(name, desc);
    item.addEventListener('click', () => onSelect(v.id));
    list.appendChild(item);
  }
}

export function setActiveView(id) {
  document.querySelectorAll('.view-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.id === id);
  });
}

// ---------- 3D 标签 ----------

export function createLabels(bodies, onClick) {
  const wrap = document.getElementById('labels');
  const labels = new Map();
  for (const body of bodies) {
    const el = document.createElement('div');
    el.className = 'body-label';
    el.textContent = body.name;
    el.addEventListener('click', () => onClick(body.id));
    wrap.appendChild(el);
    labels.set(body.id, el);
  }
  return labels;
}

export function setLabelsVisible(visible) {
  document.getElementById('labels').style.display = visible ? '' : 'none';
}

// ---------- 加载进度 ----------

export function bindLoading(manager) {
  const fill = document.getElementById('loading-fill');
  const text = document.getElementById('loading-text');
  manager.onProgress = (url, loaded, total) => {
    fill.style.width = `${Math.round((loaded / total) * 100)}%`;
    text.textContent = `正在加载纹理 ${loaded}/${total}`;
  };
  manager.onLoad = () => {
    fill.style.width = '100%';
    setTimeout(() => document.getElementById('loading').classList.add('done'), 300);
  };
}
