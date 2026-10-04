import * as THREE from 'three';
import { mat, mesh, box, cyl, makeAvatar } from './models.js';
import { makeLamp } from './props.js';

export const TABLE_H = 0.74;
const TABLE_W = 3.6, TABLE_D = 1.3;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const CROWD = ['#3d5a80', '#ee6c4d', '#98c1d9', '#6d597a', '#e5989b', '#588157', '#bc6c25', '#7f5539', '#adb5bd'];

// 자리 i: 0~2는 앞줄(+z, -z쪽을 봄), 3~5는 맞은편(-z, +z쪽을 봄)
export function seatPos(i) {
  const side = i < 3 ? 1 : -1;
  const x = [-1.1, 0, 1.1][i % 3]; // 0↔3, 1↔4, 2↔5 가 마주봄
  return { x, z: side * 1.0, rotY: side > 0 ? 0 : Math.PI, side };
}
// 자리 앞 책상 위 기준점
export function deskPos(i) {
  const s = seatPos(i);
  return { x: s.x, z: s.side * 0.34, rotY: s.rotY, side: s.side };
}

function textTexture(lines, { w = 512, h = 256, bg = '#111', fg = '#fff', font = 64 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${font}px "Malgun Gothic", sans-serif`;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * font * 1.25));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const plane = (w, h, material, x, y, z, ry = 0) => { const p = mesh(new THREE.PlaneGeometry(w, h), material, x, y, z); p.rotation.y = ry; return p; };

function room(group, W, H, D, wall, floor, ceiling) {
  group.add(mesh(new THREE.BoxGeometry(W, H, D), mat(wall, { side: THREE.BackSide }), 0, H / 2, 0));
  const f = mesh(new THREE.PlaneGeometry(W, D), mat(floor), 0, 0.002, 0);
  f.rotation.x = -Math.PI / 2;
  group.add(f);
  const c = mesh(new THREE.PlaneGeometry(W, D), mat(ceiling), 0, H - 0.01, 0);
  c.rotation.x = Math.PI / 2;
  group.add(c);
}

function longTable(color, legColor = '#333') {
  const g = new THREE.Group();
  g.add(box(TABLE_W, 0.04, TABLE_D, color, 0, TABLE_H - 0.02, 0));
  for (const [x, z] of [[-1.7, -0.55], [1.7, -0.55], [-1.7, 0.55], [1.7, 0.55]]) g.add(box(0.05, TABLE_H - 0.04, 0.05, legColor, x, (TABLE_H - 0.04) / 2, z));
  return g;
}

// 다른 손님 (공부하는 사람 / 수다 떠는 사람)
function extra(group, x, z, rotY, { chatty = false, lamp = false, chair } = {}) {
  const p = makeAvatar(pick(CROWD));
  p.group.position.set(x, 0, z);
  p.group.rotation.y = rotY;
  p.phase = Math.random() * 10;
  p.chatty = chatty;
  group.add(p.group);
  if (chair) {
    const c = chair();
    c.position.set(x, 0, z);
    c.rotation.y = rotY;
    group.add(c);
  }
  if (lamp) {
    const l = makeLamp('#2f6b45');
    l.position.set(x + 0.35, TABLE_H, z - Math.cos(rotY) * 0.5);
    l.setOn(true);
    group.add(l);
  }
  return p;
}

function animateExtras(list, t) {
  for (const p of list) {
    if (p.chatty) {
      const s = Math.sin(t * 2 + p.phase);
      p.head.rotation.y = Math.sin(t * 0.5 + p.phase) * 0.5;
      p.head.rotation.x = Math.max(0, s) * 0.12 - 0.05;
      p.mouth.scale.y = 1 + Math.max(0, Math.sin(t * 8 + p.phase)) * 2.5 * (s > 0.2 ? 1 : 0);
    } else {
      // 고개 숙이고 공부, 가끔 기지개
      const stretch = Math.sin(t * 0.07 + p.phase) > 0.97;
      p.head.rotation.x = stretch ? 0.3 : -0.55 + Math.sin(t * 0.8 + p.phase) * 0.04;
      p.head.rotation.y = stretch ? Math.sin(t) * 0.4 : Math.sin(t * 0.2 + p.phase) * 0.08;
    }
  }
}

function officeChair(color = '#2a2d33') {
  const g = new THREE.Group();
  g.add(cyl(0.22, 0.22, 0.02, '#555', 0, 0.03, 0, 5));
  g.add(cyl(0.025, 0.025, 0.4, '#666', 0, 0.22, 0, 6));
  g.add(box(0.44, 0.06, 0.42, color, 0, 0.45, 0));
  const back = box(0.42, 0.5, 0.04, color, 0, 0.75, 0.22);
  back.rotation.x = -0.1;
  g.add(back);
  return g;
}
function woodChair(color = '#8b5a2b') {
  const g = new THREE.Group();
  g.add(box(0.42, 0.04, 0.4, color, 0, 0.45, 0));
  for (const [x, z] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) g.add(box(0.035, 0.45, 0.035, color, x, 0.225, z));
  for (const x of [-0.18, 0.18]) g.add(box(0.035, 0.45, 0.035, color, x, 0.68, 0.18));
  g.add(box(0.4, 0.12, 0.03, color, 0, 0.84, 0.18));
  g.add(box(0.4, 0.05, 0.03, color, 0, 0.62, 0.18));
  return g;
}

// ====================== 스터디카페 ======================
function buildStudyCafe() {
  const group = new THREE.Group();
  const W = 12, H = 2.8, D = 10;
  room(group, W, H, D, '#3a3d44', '#4a3a2e', '#1e2024');
  group.add(new THREE.HemisphereLight('#c8d4ff', '#1a1410', 0.35));
  // 천장 다운라이트
  for (const [x, z] of [[0, 0], [-3.5, -3], [3.5, -3], [-3.5, 3], [3.5, 3]]) {
    const disc = mesh(new THREE.CircleGeometry(0.12, 12), new THREE.MeshBasicMaterial({ color: '#fff4dc' }), x, H - 0.02, z);
    disc.rotation.x = Math.PI / 2;
    group.add(disc);
    const l = new THREE.SpotLight('#fff1d6', 6, 6, 0.7, 0.6, 1.4);
    l.position.set(x, H - 0.05, z);
    l.target.position.set(x, 0, z);
    group.add(l, l.target);
  }
  // 우리 책상 + 칸막이(반투명)
  group.add(longTable('#d9c7a5', '#2a2d33'));
  const acrylic = new THREE.MeshStandardMaterial({ color: '#e8f0f4', transparent: true, opacity: 0.22, roughness: 0.2, side: THREE.DoubleSide });
  group.add(mesh(new THREE.BoxGeometry(TABLE_W, 0.3, 0.01), acrylic, 0, TABLE_H + 0.15, 0));
  for (const x of [-0.55, 0.55]) for (const s of [1, -1]) group.add(mesh(new THREE.BoxGeometry(0.01, 0.35, 0.6), acrylic, x, TABLE_H + 0.175, s * 0.33));
  // 벽 쪽 1인석들 + 공부하는 사람들
  const extras = [];
  for (let i = 0; i < 5; i++) {
    const x = -4 + i * 2;
    group.add(box(1.0, 0.04, 0.6, '#d9c7a5', x, TABLE_H, -4.6));
    group.add(box(1.0, 0.45, 0.03, '#2a2d33', x, TABLE_H + 0.22, -4.88));
    group.add(box(0.03, 0.45, 0.6, '#2a2d33', x + 0.5, TABLE_H + 0.22, -4.6));
    if (Math.random() < 0.7) extras.push(extra(group, x, -4.0, 0, { lamp: true, chair: officeChair }));
  }
  for (let i = 0; i < 2; i++) {
    const x = -4 + i * 8;
    group.add(box(1.0, 0.04, 0.6, '#d9c7a5', x, TABLE_H, 3.6));
    extras.push(extra(group, x, 4.2, Math.PI, { lamp: true, chair: officeChair }));
  }
  // 자판기
  group.add(box(0.9, 1.8, 0.7, '#c8322e', 5.3, 0.9, 2.8));
  group.add(plane(0.6, 1.0, new THREE.MeshBasicMaterial({ color: '#e8f6ff' }), 4.94, 1.1, 2.8, -Math.PI / 2));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) group.add(box(0.02, 0.12, 0.08, pick(['#3a7be8', '#6b3a12', '#f2c94c', '#2e9a4a']), 4.93, 0.75 + r * 0.22, 2.58 + c * 0.13));
  const vendLight = new THREE.PointLight('#dff1ff', 1.2, 3, 1.5);
  vendLight.position.set(4.7, 1.2, 2.8);
  group.add(vendLight);
  // 벽 표지판 + 시계
  group.add(plane(1.6, 0.5, new THREE.MeshBasicMaterial({ map: textTexture(['🤫 정숙'], { w: 512, h: 160, bg: '#1e2024', fg: '#8fe3c8', font: 90 }) }), 0, 2.1, -4.98));
  group.add(plane(1.4, 0.45, new THREE.MeshBasicMaterial({ map: textTexture(['휴대폰 무음'], { w: 512, h: 160, bg: '#1e2024', fg: '#fff', font: 70 }) }), -5.98, 1.9, 0, Math.PI / 2));
  const clock = mesh(new THREE.CircleGeometry(0.25, 24), mat('#f4f4ee'), 3, 2.1, -4.98);
  group.add(clock);
  const hand = box(0.01, 0.18, 0.01, '#111', 3, 2.1, -4.97);
  group.add(hand);

  return {
    group, background: '#15161b', fog: ['#15161b', 8, 18], chair: () => officeChair('#2a2d33'),
    update(t) {
      animateExtras(extras, t);
      hand.rotation.z = -t * 0.05;
    },
  };
}

// ====================== 카페 ======================
function buildCafe() {
  const group = new THREE.Group();
  const W = 14, H = 3.2, D = 11;
  room(group, W, H, D, '#efe6da', '#b88a5a', '#f4efe8');
  group.add(new THREE.HemisphereLight('#fff4e0', '#8a6a4a', 0.75));
  // 펜던트 조명
  const pendant = (x, z, power = 3) => {
    group.add(box(0.01, 0.8, 0.01, '#222', x, H - 0.4, z));
    group.add(mesh(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#2a2d33', { side: THREE.DoubleSide }), x, H - 0.85, z));
    group.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe0a0' }), x, H - 0.88, z));
    const l = new THREE.PointLight('#ffcf8a', power, 5, 1.5);
    l.position.set(x, H - 1.0, z);
    group.add(l);
  };
  for (const x of [-1.2, 0, 1.2]) pendant(x, 0, 2.5);
  group.add(longTable('#7a5232', '#2a2d33'));
  // 큰 창문 (저녁 도시)
  const windowMat = new THREE.MeshBasicMaterial({ color: '#2a3a5a' });
  for (const x of [-4.5, -1.5, 1.5, 4.5]) {
    group.add(plane(2.6, 2.0, windowMat, x, 1.5, -D / 2 + 0.02));
    for (let i = 0; i < 6; i++) group.add(plane(0.2, 0.3, new THREE.MeshBasicMaterial({ color: pick(['#ffd28a', '#9fd3ff', '#ffe9b0']) }), x + rand(-1, 1), rand(0.8, 2.2), -D / 2 + 0.03));
    group.add(box(0.06, 2.1, 0.05, '#2a2d33', x + 1.3, 1.5, -D / 2 + 0.04));
  }
  // 카운터 + 커피머신 + 메뉴판
  group.add(box(4, 1.0, 0.7, '#3b2a1e', 3.5, 0.5, 4.6));
  group.add(box(4, 0.04, 0.8, '#efe6da', 3.5, 1.02, 4.6));
  group.add(box(0.6, 0.45, 0.45, '#c9ccd2', 2.6, 1.27, 4.7));
  group.add(box(0.3, 0.3, 0.3, '#2a2d33', 3.4, 1.19, 4.7));
  group.add(plane(3, 1.1, new THREE.MeshBasicMaterial({ map: textTexture(['아메리카노 4.5', '카페라떼 5.0', '치즈케이크 6.5'], { w: 768, h: 300, bg: '#2a2d33', fg: '#fff3e0', font: 60 }) }), 3.5, 2.3, D / 2 - 0.02, Math.PI));
  const barista = makeAvatar('#2a2d33');
  barista.group.position.set(3.5, 0.3, 5.2);
  barista.group.rotation.y = Math.PI;
  group.add(barista.group);
  // 화분
  for (const [x, z] of [[-6.3, -4.8], [6.3, -4.8], [-6.3, 4.8]]) {
    group.add(cyl(0.25, 0.2, 0.5, '#c96a3a', x, 0.25, z));
    for (let i = 0; i < 6; i++) {
      const leaf = mesh(new THREE.SphereGeometry(0.2, 6, 4), mat('#4caf50'), x + Math.cos(i) * 0.2, 0.8 + (i % 3) * 0.2, z + Math.sin(i) * 0.2);
      leaf.scale.set(0.8, 1.6, 0.5);
      group.add(leaf);
    }
  }
  // 다른 테이블 수다 손님
  const extras = [];
  for (const [x, z] of [[-4.5, -2.5], [4.5, -2.5], [-4.5, 2.5], [-1.5, 3.6]]) {
    group.add(cyl(0.4, 0.4, 0.04, '#7a5232', x, TABLE_H, z, 16));
    group.add(cyl(0.04, 0.04, TABLE_H, '#2a2d33', x, TABLE_H / 2, z, 6));
    for (const s of [1, -1]) if (Math.random() < 0.85) extras.push(extra(group, x, z + s * 0.75, s > 0 ? 0 : Math.PI, { chatty: true, chair: woodChair }));
  }
  return {
    group, background: '#efe6da', fog: ['#efe6da', 12, 25], chair: () => woodChair('#6b4426'),
    update(t) {
      animateExtras(extras, t);
      barista.head.rotation.y = Math.sin(t * 0.4) * 0.6;
    },
  };
}

// ====================== 도서관 ======================
function buildLibrary() {
  const group = new THREE.Group();
  const W = 16, H = 4.5, D = 12;
  room(group, W, H, D, '#d9cdb8', '#6a3a2a', '#e8e0d0');
  group.add(new THREE.HemisphereLight('#fff8e8', '#5a3a2a', 0.6));
  for (const x of [-4, 0, 4]) for (const z of [-3, 3]) {
    group.add(box(1.6, 0.05, 0.3, '#ffffff', x, H - 0.03, z));
    const l = new THREE.PointLight('#fff4e0', 3, 8, 1.4);
    l.position.set(x, H - 0.4, z);
    group.add(l);
  }
  group.add(longTable('#6b4426', '#3b2414'));
  // 초록 뱅커 램프 (책상 가운데)
  for (const x of [-1.65, -0.55, 0.55, 1.65]) { // 자리 사이에 둬서 얼굴 안 가리게
    const lamp = new THREE.Group();
    lamp.add(cyl(0.06, 0.07, 0.02, '#c9a34a', 0, 0.01, 0, 10));
    lamp.add(cyl(0.008, 0.008, 0.28, '#c9a34a', 0, 0.15, 0, 6));
    const shade = mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.08, 12, 1, true, 0, Math.PI), mat('#1f6b45', { side: THREE.DoubleSide }), 0, 0.3, 0);
    shade.rotation.z = Math.PI / 2;
    shade.rotation.y = Math.PI / 2;
    lamp.add(shade);
    lamp.position.set(x, TABLE_H, 0);
    group.add(lamp);
  }
  // 책장 (책은 InstancedMesh)
  const books = [];
  const shelf = (x, z, rotY, len) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    g.add(box(len, 2.4, 0.4, '#5a3a22', 0, 1.2, 0));
    for (let r = 0; r < 5; r++) {
      g.add(box(len, 0.03, 0.42, '#4a2d18', 0, 0.2 + r * 0.45, 0.01));
      for (let bx = -len / 2 + 0.05; bx < len / 2 - 0.05;) {
        const w = rand(0.03, 0.07), h = rand(0.25, 0.38);
        books.push({ g, x: bx + w / 2, y: 0.22 + r * 0.45 + h / 2, w, h, color: pick(['#8a2a22', '#2d4a7a', '#2e6a3a', '#c9a34a', '#5a3a6a', '#d9cdb8', '#3a3a3a']) });
        bx += w + 0.005;
      }
    }
    group.add(g);
    return g;
  };
  const shelves = [shelf(0, -D / 2 + 0.3, 0, 14), shelf(-W / 2 + 0.3, 0, Math.PI / 2, 10), shelf(W / 2 - 0.3, 0, -Math.PI / 2, 10)];
  for (const z of [-3.2, 3.4]) for (const x of [-5, 5]) shelves.push(shelf(x, z, 0, 3));
  const byShelf = new Map();
  for (const b of books) (byShelf.get(b.g) || byShelf.set(b.g, []).get(b.g)).push(b);
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  for (const [g, list] of byShelf) {
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat('#fff'), list.length);
    list.forEach((b, i) => {
      inst.setMatrixAt(i, m4.compose(new THREE.Vector3(b.x, b.y, 0.05), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, 0.3)));
      inst.setColorAt(i, c.set(b.color));
    });
    g.add(inst);
  }
  // 카펫 + 다른 열람석
  const rug = mesh(new THREE.PlaneGeometry(6, 4), mat('#7a2a2a'), 0, 0.005, 0);
  rug.rotation.x = -Math.PI / 2;
  group.add(rug);
  const extras = [];
  const other = longTable('#6b4426', '#3b2414');
  other.position.set(0, 0, 4.2);
  group.add(other);
  for (const x of [-1.1, 1.1]) extras.push(extra(group, x, 5.2, 0, { chair: woodChair }));
  extras.push(extra(group, 0, 3.2, Math.PI, { chair: woodChair }));
  group.add(plane(2, 0.5, new THREE.MeshBasicMaterial({ map: textTexture(['조용히 해 주세요'], { w: 512, h: 128, bg: '#3b2414', fg: '#e8d8b0', font: 60 }) }), 0, 3.3, -D / 2 + 0.55));
  return {
    group, background: '#d9cdb8', fog: ['#d9cdb8', 12, 26], chair: () => woodChair('#5a3a22'),
    update(t) { animateExtras(extras, t); },
  };
}

export function buildVenue(key) {
  return { studycafe: buildStudyCafe, cafe: buildCafe, library: buildLibrary }[key]();
}
