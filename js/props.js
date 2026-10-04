// 책상 위 음료/간식, 노트북·스탠드 같은 소품, 공부 보상 꾸미기
import * as THREE from 'three';
import { mat, mesh, box, cyl } from './models.js';

const glassMat = (color, opacity = 0.35) => new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.15 });

function liquidColumn(g, rTop, rBot, h, color, y0) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, 12);
  geo.translate(0, h / 2, 0);
  const liq = mesh(geo, mat(color, { transparent: true, opacity: 0.9 }), 0, y0, 0);
  g.add(liq);
  return liq;
}

function pieces(g, count, make) {
  const list = Array.from({ length: count }, (_, i) => { const p = make(i); g.add(p); return p; });
  return (left) => list.forEach((p, i) => (p.visible = i < left));
}

export function makeItem(def) {
  const g = new THREE.Group();
  const max = def.servings;
  let update = () => {};
  switch (def.model) {
    case 'bottle': { // 생수
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.2, 12), glassMat('#dff1ff', 0.3), 0, 0.1, 0));
      g.add(cyl(0.014, 0.014, 0.02, '#2a7be8', 0, 0.21, 0));
      g.add(cyl(0.0325, 0.0325, 0.05, '#2a7be8', 0, 0.12, 0, 12));
      const liq = liquidColumn(g, 0.028, 0.03, 0.18, def.color, 0.005);
      update = (left) => (liq.scale.y = Math.max(0.02, left / max));
      break;
    }
    case 'can': {
      g.add(cyl(0.033, 0.033, 0.12, def.color, 0, 0.06, 0, 14));
      g.add(cyl(0.03, 0.033, 0.012, '#c9ccd2', 0, 0.126, 0, 14));
      g.add(cyl(0.0335, 0.0335, 0.03, '#f4f1ea', 0, 0.07, 0, 14));
      break;
    }
    case 'jar': { // 바나나우유
      g.add(mesh(new THREE.SphereGeometry(0.045, 12, 10), mat(def.color), 0, 0.05, 0));
      g.add(cyl(0.022, 0.03, 0.04, def.color, 0, 0.1, 0, 12));
      g.add(cyl(0.024, 0.024, 0.012, '#2e9a4a', 0, 0.125, 0, 12));
      break;
    }
    case 'icecup': { // 테이크아웃 아이스컵 + 빨대
      g.add(mesh(new THREE.CylinderGeometry(0.045, 0.034, 0.15, 14, 1, true), glassMat('#ffffff', 0.25), 0, 0.075, 0));
      g.add(cyl(0.046, 0.046, 0.01, '#f4f4f4', 0, 0.152, 0, 14));
      const straw = cyl(0.005, 0.005, 0.2, '#2e9a4a', 0.012, 0.16, 0, 6);
      straw.rotation.z = -0.15;
      g.add(straw);
      const liq = liquidColumn(g, 0.043, 0.033, 0.14, def.color, 0.004);
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.022, 0.022, 0.022), glassMat('#eaf6ff', 0.6), (i - 1) * 0.015, 0.11 + i * 0.008, (i % 2) * 0.01));
      update = (left) => (liq.scale.y = Math.max(0.02, left / max));
      break;
    }
    case 'mug': { // 따뜻한 머그
      g.add(cyl(0.042, 0.038, 0.09, '#f4f1ea', 0, 0.045, 0, 14));
      const handle = mesh(new THREE.TorusGeometry(0.025, 0.007, 6, 10), mat('#f4f1ea'), 0.046, 0.05, 0);
      handle.rotation.y = Math.PI / 2;
      g.add(handle);
      const top = cyl(0.039, 0.039, 0.004, def.color, 0, 0.085, 0, 14);
      g.add(top);
      update = (left) => (top.position.y = 0.02 + 0.065 * (left / max));
      break;
    }
    case 'triangle': {
      update = pieces(g, max, (i) => {
        const t = new THREE.Group();
        t.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 3), mat('#f5f2ea'), 0, 0.0125, 0));
        t.add(box(0.035, 0.026, 0.045, def.color, 0, 0.013, 0.022));
        t.position.set((i - 1) * 0.045, 0, (i % 2) * 0.03);
        t.rotation.y = i * 0.8;
        return t;
      });
      break;
    }
    case 'bar': {
      update = pieces(g, max, (i) => box(0.035, 0.018, 0.05, i === max - 1 ? '#e8463a' : def.color, i * 0.03 - 0.03, 0.009, 0));
      break;
    }
    case 'cake': {
      g.add(cyl(0.08, 0.07, 0.01, '#f5f5f0', 0, 0.005, 0, 16));
      const slice = new THREE.Group();
      slice.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.045, 3, 1, false, 0, Math.PI / 3), mat(def.color), 0, 0.032, 0));
      slice.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.008, 3, 1, false, 0, Math.PI / 3), mat('#c8322e'), 0, 0.058, 0));
      g.add(slice);
      update = (left) => slice.scale.set(1, 1, Math.max(0.15, left / max));
      break;
    }
    case 'macaron': {
      g.add(cyl(0.06, 0.055, 0.008, '#f5f5f0', 0, 0.004, 0, 14));
      update = pieces(g, max, (i) => {
        const m = new THREE.Group();
        m.add(cyl(0.022, 0.022, 0.012, i ? '#9ad0f2' : def.color, 0, 0.014, 0, 12));
        m.add(cyl(0.019, 0.019, 0.008, '#fff3e0', 0, 0.024, 0, 12));
        m.add(cyl(0.022, 0.022, 0.012, i ? '#9ad0f2' : def.color, 0, 0.034, 0, 12));
        m.position.x = (i - 0.5) * 0.05;
        return m;
      });
      break;
    }
    case 'plate': {
      g.add(cyl(0.08, 0.07, 0.01, '#f5f5f0', 0, 0.005, 0, 16));
      update = pieces(g, max, (i) => {
        const p = box(0.04, 0.012, 0.04, def.color, Math.cos(i * 1.3) * 0.035, 0.016 + (i % 2) * 0.008, Math.sin(i * 1.3) * 0.035);
        p.rotation.y = i;
        return p;
      });
      break;
    }
  }
  const hit = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 8), new THREE.MeshBasicMaterial({ visible: false }), 0, 0.1, 0);
  g.add(hit);
  g.hit = hit;
  g.setLeft = update;
  return g;
}

// ---------- 책상 소품 ----------
export function makeLaptop(color = '#b8bcc4') {
  const g = new THREE.Group();
  g.add(box(0.32, 0.015, 0.22, color, 0, 0.0075, 0));
  g.add(box(0.28, 0.002, 0.1, '#2a2d33', 0, 0.016, 0.03));
  const lid = new THREE.Group();
  lid.position.set(0, 0.015, -0.11);
  lid.rotation.x = -0.25;
  lid.add(box(0.32, 0.21, 0.01, color, 0, 0.105, 0));
  const screen = mesh(new THREE.PlaneGeometry(0.29, 0.18), new THREE.MeshBasicMaterial({ color: '#cfe3ff' }), 0, 0.105, 0.006);
  lid.add(screen);
  g.add(lid);
  g.screen = screen;
  return g;
}

export function makeNotebook(color) {
  const g = new THREE.Group();
  g.add(box(0.2, 0.012, 0.27, color, 0, 0.006, 0));
  g.add(box(0.19, 0.004, 0.26, '#fbf8f0', 0, 0.014, 0));
  for (let i = 0; i < 6; i++) g.add(box(0.15, 0.0005, 0.003, '#9fb7d8', 0.01, 0.0165, -0.09 + i * 0.035));
  const pen = cyl(0.005, 0.005, 0.15, '#2a2d33', 0.13, 0.008, 0.02, 6);
  pen.rotation.x = Math.PI / 2;
  pen.rotation.z = 0.3;
  g.add(pen);
  g.pen = pen;
  return g;
}

export function makeBooks() {
  const g = new THREE.Group();
  const colors = ['#c8322e', '#2d5bd7', '#2e9a4a', '#f2c94c'];
  for (let i = 0; i < 3; i++) {
    const b = box(0.18 - i * 0.01, 0.03, 0.25 - i * 0.01, colors[(i * 3) % 4], 0, 0.015 + i * 0.03, 0);
    b.rotation.y = (i - 1) * 0.12;
    g.add(b);
  }
  return g;
}

export function makeLamp(color = '#f4f4ee') {
  const g = new THREE.Group();
  const parts = [];
  const add = (m) => { g.add(m); parts.push(m); return m; };
  add(cyl(0.05, 0.055, 0.015, color, 0, 0.0075, 0, 12));
  add(cyl(0.007, 0.007, 0.32, color, 0, 0.17, 0, 6));
  const head = new THREE.Group();
  head.position.set(0, 0.33, 0.04);
  head.rotation.x = 0.9;
  const shade = mesh(new THREE.ConeGeometry(0.06, 0.07, 12, 1, true), mat(color, { side: THREE.DoubleSide }));
  head.add(shade);
  parts.push(shade);
  const bulb = mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: '#555' }), 0, -0.02, 0);
  head.add(bulb);
  g.add(head);
  const light = new THREE.PointLight('#ffe2a8', 0, 1.6, 1.5);
  light.position.set(0, 0.27, 0.12);
  g.add(light);
  g.setOn = (on) => {
    light.intensity = on ? 2.2 : 0;
    bulb.material.color.set(on ? '#fff3c8' : '#555');
  };
  g.setColor = (c) => parts.forEach((p) => p.material.color.set(c));
  return g;
}

// 공부 시간(분, 누적)으로 풀리는 꾸미기 소품
export const DECOR = [
  { key: 'plant', name: '🌱 작은 화분', minutes: 10 },
  { key: 'postit', name: '🟨 포스트잇', minutes: 30 },
  { key: 'lamp_mint', name: '💡 민트 스탠드', minutes: 60 },
  { key: 'mug_pens', name: '✏️ 연필꽂이', minutes: 90 },
  { key: 'lamp_pink', name: '💡 핑크 스탠드', minutes: 150 },
  { key: 'cat', name: '🐈 고양이 피규어', minutes: 240 },
  { key: 'cactus', name: '🌵 선인장', minutes: 360 },
  { key: 'lamp_gold', name: '💡 골드 스탠드', minutes: 600 },
];
export const LAMP_COLORS = { lamp_mint: '#8fe3c8', lamp_pink: '#f7a8c8', lamp_gold: '#e8c24a' };

export function makeDecor(key) {
  const g = new THREE.Group();
  switch (key) {
    case 'plant':
      g.add(cyl(0.035, 0.028, 0.06, '#c96a3a', 0, 0.03, 0, 10));
      for (let i = 0; i < 5; i++) {
        const leaf = mesh(new THREE.SphereGeometry(0.025, 6, 4), mat('#4caf50'), Math.cos(i * 1.3) * 0.02, 0.08 + (i % 2) * 0.02, Math.sin(i * 1.3) * 0.02);
        leaf.scale.set(1, 1.6, 0.6);
        leaf.rotation.z = Math.cos(i * 1.3) * 0.6;
        g.add(leaf);
      }
      break;
    case 'postit':
      ['#ffe36b', '#ff9ac0', '#9ad0f2'].forEach((c, i) => {
        const p = box(0.06, 0.002, 0.06, c, i * 0.05, 0.001 + i * 0.001, (i % 2) * 0.03);
        p.rotation.y = (i - 1) * 0.2;
        g.add(p);
      });
      break;
    case 'mug_pens':
      g.add(cyl(0.03, 0.03, 0.08, '#2d5bd7', 0, 0.04, 0, 10));
      ['#f2c94c', '#e8463a', '#2a2d33'].forEach((c, i) => {
        const pen = cyl(0.004, 0.004, 0.13, c, (i - 1) * 0.012, 0.1, (i % 2) * 0.01, 6);
        pen.rotation.z = (i - 1) * 0.15;
        g.add(pen);
      });
      break;
    case 'cat': {
      const body = mesh(new THREE.SphereGeometry(0.03, 8, 6), mat('#e8a04a'), 0, 0.03, 0);
      body.scale.set(1, 1.1, 1.3);
      g.add(body);
      g.add(mesh(new THREE.SphereGeometry(0.022, 8, 6), mat('#e8a04a'), 0, 0.07, -0.02));
      for (const s of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(0.008, 0.016, 4), mat('#c97a2a'), s * 0.012, 0.09, -0.02));
      break;
    }
    case 'cactus':
      g.add(cyl(0.03, 0.025, 0.05, '#f4f1ea', 0, 0.025, 0, 10));
      g.add(cyl(0.017, 0.02, 0.09, '#3d8b4a', 0, 0.095, 0, 8));
      g.add(cyl(0.01, 0.01, 0.04, '#3d8b4a', 0.025, 0.1, 0, 6));
      break;
  }
  return g;
}
