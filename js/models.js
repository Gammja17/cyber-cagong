import * as THREE from 'three';

export const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, ...opts });

export function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}

export const box = (w, h, d, color, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat(color), x, y, z);
export const cyl = (rt, rb, h, color, x, y, z, seg = 10) =>
  mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color), x, y, z);

// ---------- 사람 ----------
const SKIN = ['#f1c9a5', '#e0b08a', '#c98f68', '#f5d6bb'];
const HAIR = ['#1c1410', '#3a2414', '#2b2b2b', '#5a3a1a'];

export function makeAvatar(color, seed = Math.random()) {
  const g = new THREE.Group();
  const skin = SKIN[Math.floor(seed * 97) % SKIN.length];
  const hair = HAIR[Math.floor(seed * 53) % HAIR.length];

  const torso = cyl(0.15, 0.2, 0.52, color, 0, 0.72, 0, 8);
  g.add(torso);
  // 팔 (테이블 쪽으로 걸친 느낌)
  for (const side of [-1, 1]) {
    const arm = cyl(0.045, 0.045, 0.42, color, side * 0.2, 0.78, -0.12, 6);
    arm.rotation.x = 1.0;
    g.add(arm);
    g.add(mesh(new THREE.SphereGeometry(0.045, 6, 5), mat(skin), side * 0.2, 0.66, -0.3));
  }
  const head = new THREE.Group();
  head.position.set(0, 1.12, 0);
  head.add(mesh(new THREE.IcosahedronGeometry(0.14, 1), mat(skin)));
  const hairCap = mesh(new THREE.SphereGeometry(0.148, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(hair), 0, 0.01, 0.01);
  hairCap.rotation.x = 0.25;
  head.add(hairCap);
  for (const side of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.018, 6, 4), mat('#111'), side * 0.05, 0.02, -0.125));
  const mouth = box(0.06, 0.012, 0.01, '#5a1a1a', 0, -0.06, -0.13);
  head.add(mouth);
  // 볼터치 (취기)
  const blush = [];
  for (const side of [-1, 1]) {
    const b = mesh(new THREE.CircleGeometry(0.025, 8), new THREE.MeshBasicMaterial({ color: '#ff5a5a', transparent: true, opacity: 0 }), side * 0.08, -0.03, -0.128);
    b.rotation.y = Math.PI + side * 0.5;
    head.add(b);
    blush.push(b);
  }
  // 담배 (입 오른쪽)
  const cig = new THREE.Group();
  cig.add(cyl(0.006, 0.006, 0.08, '#f4f1ea', 0, 0, 0, 6));
  const tip = mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.01, 6), new THREE.MeshBasicMaterial({ color: '#ff5a1a' }), 0, 0.044, 0);
  cig.add(tip);
  cig.rotation.x = -1.35;
  cig.position.set(0.035, -0.065, -0.17);
  cig.visible = false;
  head.add(cig);
  g.add(head);

  return { group: g, head, torso, mouth, cig, tip, blush };
}

// ---------- 길고양이 ----------

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function makeTextSprite({ bg = 'rgba(0,0,0,0.55)', fg = '#fff', font = 34, maxWidth = 520, tail = false } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.renderOrder = 10;

  sprite.setText = (text) => {
    ctx.font = `bold ${font}px "Pretendard", "Malgun Gothic", sans-serif`;
    // 줄바꿈
    const lines = [];
    let line = '';
    for (const ch of String(text)) {
      if (ctx.measureText(line + ch).width > maxWidth) { lines.push(line); line = ''; }
      line += ch;
    }
    lines.push(line);
    const lineH = font * 1.3;
    const w = Math.min(maxWidth, Math.max(...lines.map((l) => ctx.measureText(l).width))) + 36;
    const h = lines.length * lineH + 22 + (tail ? 18 : 0);
    canvas.width = Math.ceil(w);
    canvas.height = Math.ceil(h);
    ctx.font = `bold ${font}px "Pretendard", "Malgun Gothic", sans-serif`;
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, w, h - (tail ? 18 : 0), 18);
    ctx.fill();
    if (tail) {
      ctx.beginPath();
      ctx.moveTo(w / 2 - 14, h - 18);
      ctx.lineTo(w / 2, h);
      ctx.lineTo(w / 2 + 14, h - 18);
      ctx.fill();
    }
    ctx.fillStyle = fg;
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, 18, 11 + i * lineH));
    tex.needsUpdate = true;
    const scale = 0.0016;
    sprite.scale.set(w * scale, h * scale, 1);
    sprite.center.set(0.5, 0);
  };
  return sprite;
}
