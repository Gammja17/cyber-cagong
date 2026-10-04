import * as THREE from 'three';
import { buildVenue, seatPos, deskPos, TABLE_H } from './venues.js';
import { makeAvatar, makeTextSprite } from './models.js';
import { makeItem, makeLaptop, makeNotebook, makeBooks, makeLamp, makeDecor, LAMP_COLORS } from './props.js';

const EYE_Y = 1.13;
const BASE_PITCH = -0.38;
const ITEM_SLOTS = [[0.33, 0.15], [0.47, -0.08], [-0.33, 0.15]];
const DECOR_SPOTS = { plant: [-0.2, -0.24], postit: [0.12, -0.22], mug_pens: [0.3, -0.24], cat: [-0.5, 0.0], cactus: [0.55, 0.18] };
const STATUS = { store: '🏪 편의점 가는 중…', toilet: '🚽 화장실…' };

export class StudyScene {
  constructor(container, menu, { onItem, onLamp }) {
    this.menu = menu;
    this.onItem = onItem;
    this.onLamp = onLamp;
    this.win = window;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.03, 120);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.yaw = 0;
    this.pitch = 0;
    this.myId = null;
    this.mySeat = 1;
    this.venueKey = null;
    this.avatars = new Map();
    this.desks = new Map(); // memberId -> { group, lamp, decorKey, decor }
    this.items = new Map();
    this.seats = [];
    this.anims = [];
    this.talk = new Map();
    this.sprites = [];
    this.raycaster = new THREE.Raycaster();
    this.emojiTex = {};

    this.setupInput();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
    this.clock = new THREE.Clock();
    const loop = () => { this.frame(); this.win.requestAnimationFrame(loop); };
    this.win.requestAnimationFrame(loop);
  }

  // 미니 창(문서 PiP)으로 옮겨질 때: 그 창의 rAF/resize를 써야 메인 탭이 가려져도 계속 그려짐
  setWindow(win) {
    this.win.removeEventListener('resize', this.onResize);
    this.win = win;
    win.addEventListener('resize', this.onResize);
    this.resize();
  }

  resize() {
    const p = this.renderer.domElement.parentElement;
    const w = p.clientWidth || 1, h = p.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------- 입력 ----------------
  setupInput() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, moved: false };
      try { el.setPointerCapture(e.pointerId); } catch {}
    });
    el.addEventListener('pointermove', (e) => {
      if (down) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!down.moved && Math.hypot(dx, dy) < 6) return;
        down.moved = true;
        this.yaw = THREE.MathUtils.clamp(this.yaw - dx * 0.005, -1.7, 1.7);
        this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.005, -0.7, 0.9);
        down.x = e.clientX;
        down.y = e.clientY;
      } else {
        el.style.cursor = this.pick(e) ? 'pointer' : 'grab';
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (down && !down.moved) {
        const hit = this.pick(e);
        if (hit?.itemId) this.onItem(hit.itemId);
        if (hit?.lamp) this.onLamp();
      }
      down = null;
    });
  }

  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const mine = [...this.items.entries()].filter(([, o]) => o.owner === this.myId);
    const targets = mine.map(([, o]) => o.hit);
    const myDesk = this.desks.get(this.myId);
    if (myDesk) targets.push(myDesk.lampHit);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    if (myDesk && hit.object === myDesk.lampHit) return { lamp: true };
    const found = mine.find(([, o]) => o.hit === hit.object);
    return found ? { itemId: found[0] } : null;
  }

  // ---------------- 장소 ----------------
  setVenue(key) {
    if (this.venue) this.scene.remove(this.venue.group);
    this.venueKey = key;
    this.venue = buildVenue(key);
    this.scene.add(this.venue.group);
    this.scene.background = new THREE.Color(this.venue.background);
    this.scene.fog = new THREE.Fog(...this.venue.fog);
    this.seats.forEach((s) => this.scene.remove(s));
    this.seats = Array.from({ length: 6 }, (_, i) => {
      const s = this.venue.chair();
      const p = seatPos(i);
      s.position.set(p.x, 0, p.z);
      s.rotation.y = p.rotY;
      this.scene.add(s);
      return s;
    });
    for (const o of this.items.values()) o.parent?.remove(o);
    this.items.clear();
    for (const d of this.desks.values()) this.scene.remove(d.group);
    this.desks.clear();
    this.occ = null;
    this.yaw = 0;
    this.pitch = 0;
  }

  ensureDesk(m) {
    let d = this.desks.get(m.id);
    if (d && d.seat === m.seat) return d;
    if (d) this.scene.remove(d.group);
    const p = deskPos(m.seat);
    const group = new THREE.Group();
    group.position.set(p.x, TABLE_H, p.z);
    group.rotation.y = p.rotY;
    const main = m.seat % 2 ? makeNotebook(m.color) : makeLaptop();
    main.position.set(0, 0, 0.02);
    group.add(main);
    if (m.seat % 2) {
      const books = makeBooks();
      books.position.set(0.35, 0, -0.22);
      books.rotation.y = 0.3;
      group.add(books);
    }
    const lamp = makeLamp();
    lamp.position.set(-0.45, 0, -0.15);
    lamp.rotation.y = 0.5;
    group.add(lamp);
    const lampHit = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.16), new THREE.MeshBasicMaterial({ visible: false }));
    lampHit.position.set(-0.45, 0.2, -0.15);
    group.add(lampHit);
    this.scene.add(group);
    d = { group, lamp, lampHit, seat: m.seat, decorKey: '', decor: [], main };
    this.desks.set(m.id, d);
    return d;
  }

  // ---------------- 상태 동기화 ----------------
  setState(state, myId) {
    this.myId = myId;
    if (state.venue !== this.venueKey) this.setVenue(state.venue);
    const me = state.members.find((m) => m.id === myId);
    if (me) this.mySeat = me.seat;
    const present = new Set(state.members.map((m) => m.id));

    for (const m of state.members) {
      // 책상 (스탠드, 꾸미기)
      const d = this.ensureDesk(m);
      d.lamp.setOn(m.lamp && !m.away);
      const decorKey = (m.decor || []).join(',');
      if (decorKey !== d.decorKey) {
        d.decor.forEach((o) => d.group.remove(o));
        d.decor = [];
        const lampColor = (m.decor || []).filter((k) => LAMP_COLORS[k]).pop();
        d.lamp.setColor(lampColor ? LAMP_COLORS[lampColor] : '#f4f4ee');
        for (const k of m.decor || []) {
          if (!DECOR_SPOTS[k]) continue;
          const o = makeDecor(k);
          o.position.set(DECOR_SPOTS[k][0], 0, DECOR_SPOTS[k][1]);
          o.rotation.y = Math.random() * 0.6 - 0.3;
          d.group.add(o);
          d.decor.push(o);
        }
        d.decorKey = decorKey;
      }
      if (m.id === myId) continue;

      // 친구 아바타
      let av = this.avatars.get(m.id);
      if (!av) {
        av = makeAvatar(m.color, m.seat / 6 + 0.13);
        av.label = makeTextSprite({ font: 30 });
        av.label.position.y = 1.36;
        av.group.add(av.label);
        av.bubble = makeTextSprite({ bg: 'rgba(255,255,255,0.95)', fg: '#111', font: 30, maxWidth: 420, tail: true });
        av.bubble.position.y = 1.5;
        av.bubble.visible = false;
        av.group.add(av.bubble);
        av.lastLabel = '';
        this.scene.add(av.group);
        this.avatars.set(m.id, av);
      }
      const p = seatPos(m.seat);
      av.group.position.set(p.x, 0, p.z + p.side * 0.03);
      av.group.rotation.y = p.rotY;
      const away = !!m.away;
      av.group.children.forEach((c) => { if (c !== av.label && c !== av.bubble) c.visible = !away; });
      const label = (away ? `${m.name} ${STATUS[m.away]}` : m.name) + (!away && m.lamp ? ' 💡' : '') + (!away && m.bladder >= 0.7 ? ' 😣' : '');
      if (label !== av.lastLabel) { av.label.setText(label); av.lastLabel = label; }
      av.studying = m.lamp && !away;
      av.bladder = m.bladder || 0;
    }
    for (const [id, av] of this.avatars) if (!present.has(id)) { this.scene.remove(av.group); this.avatars.delete(id); }
    for (const [id, d] of this.desks) if (!present.has(id)) { this.scene.remove(d.group); this.desks.delete(id); }

    // 앉거나 일어나면 의자가 뒤로 쓱
    const occ = Array(6).fill('');
    for (const m of state.members) occ[m.seat] = m.id + (m.away ? '-away' : '');
    if (this.occ) occ.forEach((o, i) => o !== this.occ[i] && this.slideChair(i));
    this.occ = occ;

    // 책상 위 음료/간식
    const defs = [...this.menu[state.venue].items, ...(this.menu[state.venue].store || [])];
    const ids = new Set(state.items.map((i) => i.id));
    for (const it of state.items) {
      let obj = this.items.get(it.id);
      if (!obj) {
        const d = this.desks.get(it.owner);
        if (!d) continue;
        obj = makeItem(defs.find((x) => x.key === it.key));
        obj.owner = it.owner;
        const [lx, lz] = ITEM_SLOTS[it.slot];
        obj.position.set(lx, 0.002, lz);
        obj.rotation.y = Math.random() * Math.PI;
        obj.scale.setScalar(0.01);
        this.tween(0.35, (t) => obj.scale.setScalar(Math.max(0.01, easeOutBack(t))));
        d.group.add(obj);
        this.items.set(it.id, obj);
      }
      obj.setLeft(it.left);
    }
    for (const [id, obj] of this.items) if (!ids.has(id)) { obj.parent?.remove(obj); this.items.delete(id); }
  }

  updateCamera() {
    const p = seatPos(this.mySeat);
    this.camera.position.set(p.x, EYE_Y, p.z + p.side * 0.08);
    this.camera.rotation.y = p.rotY + this.yaw;
    this.camera.rotation.x = BASE_PITCH + this.pitch;
  }

  // ---------------- 이펙트 ----------------
  remoteLook(id, yaw, pitch) {
    const av = this.avatars.get(id);
    if (av) av.look = { yaw: THREE.MathUtils.clamp(yaw, -1.3, 1.3), pitch: THREE.MathUtils.clamp(BASE_PITCH + pitch, -0.7, 0.5) };
  }

  showBubble(id, text) {
    const av = this.avatars.get(id);
    if (!av) return;
    av.bubble.setText(text);
    av.bubble.visible = true;
    clearTimeout(av.bubbleTimer);
    av.bubbleTimer = setTimeout(() => (av.bubble.visible = false), 4000 + text.length * 80);
  }

  setTalk(id, level) { this.talk.set(id, level); }

  bounceItem(itemId) {
    const obj = this.items.get(itemId);
    if (obj) this.tween(0.25, (t) => obj.scale.setScalar(1 - Math.sin(t * Math.PI) * 0.15));
  }

  slideChair(i) {
    const s = this.seats[i];
    if (!s) return;
    const p = seatPos(i);
    this.tween(0.8, (t) => {
      const k = Math.sin(t * Math.PI) * 0.2;
      s.position.set(p.x, 0, p.z + p.side * k);
    });
  }

  // 뽀모도로 한 세트 끝: 테이블 위로 🙌🎉✨ 팡
  celebrate() {
    const emojis = ['🙌', '🎉', '✨', '👏', '💯'];
    for (let i = 0; i < 36; i++) {
      const e = emojis[i % emojis.length];
      this.emojiTex[e] ||= makeEmojiTexture(e);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.emojiTex[e], transparent: true, depthWrite: false }));
      s.position.set((Math.random() - 0.5) * 3, TABLE_H + 0.1, (Math.random() - 0.5) * 1.0);
      s.scale.setScalar(0.12);
      s.life = -Math.random() * 0.6;
      s.vel = new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.0 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4);
      s.visible = false;
      this.scene.add(s);
      this.sprites.push(s);
    }
  }

  tween(duration, fn) { this.anims.push({ t: 0, duration, fn }); }

  // ---------------- 루프 ----------------
  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    this.updateCamera();
    this.venue?.update(t, dt);

    for (const [id, av] of this.avatars) {
      const look = av.look || { yaw: 0, pitch: BASE_PITCH };
      // 스탠드 켜면(집중) 고개 숙이고 끄덕끄덕 필기
      const targetPitch = av.studying ? -0.6 + Math.sin(t * 1.3 + av.group.position.x) * 0.05 : look.pitch;
      const targetYaw = av.studying ? Math.sin(t * 0.3 + av.group.position.x) * 0.1 : look.yaw;
      av.head.rotation.y += (targetYaw - av.head.rotation.y) * 0.1;
      av.head.rotation.x += (targetPitch - av.head.rotation.x) * 0.1;
      av.torso.rotation.y = av.head.rotation.y * 0.3;
      // 화장실 급하면 다리 떨기
      const jiggle = av.bladder >= 0.7 ? Math.sin(t * 28) * 0.012 : 0;
      av.torso.position.y = 0.72 + jiggle;
      av.torso.scale.y = 1 + Math.sin(t * 2 + av.group.position.x) * 0.012;
      const lvl = this.talk.get(id) || 0;
      av.mouth.scale.y += (1 + lvl * 6 - av.mouth.scale.y) * 0.4;
    }

    this.sprites = this.sprites.filter((s) => {
      s.life += dt;
      if (s.life < 0) return true;
      s.visible = true;
      s.position.addScaledVector(s.vel, dt);
      s.vel.y -= dt * 0.9;
      s.material.opacity = Math.max(0, 1 - s.life / 2.2);
      if (s.life > 2.2) { this.scene.remove(s); s.material.dispose(); return false; }
      return true;
    });

    this.anims = this.anims.filter((a) => {
      a.t += dt;
      const k = Math.min(1, a.t / a.duration);
      a.fn(k);
      return k < 1;
    });

    this.renderer.render(this.scene, this.camera);
  }
}

function makeEmojiTexture(emoji) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = '48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 32, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const easeOutBack = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
