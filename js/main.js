import { StudyScene } from './scene.js';
import { AudioManager, VOLUME_KEYS } from './audio.js';
import { Voice } from './voice.js';
import { Net } from './net.js';
import { DECOR, LAMP_COLORS } from './props.js';

const $ = (s) => document.querySelector(s);
const won = (n) => (n ? n.toLocaleString('ko-KR') + '원' : '무료');
const VENUE_DESC = {
  studycafe: '조용한 칸막이 자리, 백색소음, 자판기 · 편의점',
  cafe: '잔잔한 말소리, 커피랑 디저트 주문',
  library: '아주 조용, 책장 넘기는 소리, 음식 반입 금지',
};
const STATUS_ICON = { store: '🏪', toilet: '🚽' };

// ---------- 기기에 저장 (로컬) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('cagong-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cagong-' + k, JSON.stringify(v)); } catch {} },
};
const settings = { master: 1, ambient: 0.8, sfx: 0.8, voice: 1, autoMic: true, ...store.get('settings', {}) };
let lifetimeMs = store.get('lifetime', 0);
let myDecor = store.get('decor', []);
const unlocked = () => DECOR.filter((d) => lifetimeMs / 60000 >= d.minutes).map((d) => d.key);
const hm = (ms) => { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : m ? `${m}분` : `${Math.floor(ms / 1000)}초`; };

const menu = await (await fetch('menu.json')).json();
const params = new URLSearchParams(location.search);
$('#roomInput').value = params.get('room') || '';
$('#nameInput').value = store.get('name', '');
if (lifetimeMs > 0) $('#lifetimeTip').textContent = `지금까지 누적 공부 ${hm(lifetimeMs)} · 꾸미기 ${unlocked().length}/${DECOR.length}개 해금`;

let socket, scene, audio, voice;
let myId = null;
let state = null;
let cart = {};
let cartStore = false;
let micOn = false;
let lastStudyMs = 0;
let lastPhase = null;
let joinedAt = Date.now();

// ===================== 입장 =====================
$('#joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#joinBtn').disabled = true;
  const name = $('#nameInput').value.trim();
  store.set('name', name);

  audio = new AudioManager(); // 사용자 클릭 안에서 만들어야 소리가 남
  socket = new Net(menu);
  myId = socket.id;
  voice = new Voice(socket, audio.ctx, onLevel);
  if (await voice.initMic()) voice.setMuted(true); // 공부 중이니까 마이크는 기본 OFF
  applySettings();
  updateMicBtn();

  $('#lobby').hidden = true;
  $('#app').hidden = false;
  scene = new StudyScene($('#view'), menu, {
    onItem: (id) => socket.emit('take', id),
    onLamp: () => socket.emit('lamp'),
  });

  const typed = $('#roomInput').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const code = typed || makeCode();
  $('#roomCode').textContent = code;
  history.replaceState(null, '', `?room=${code}${params.has('fast') ? '&fast' : ''}`);
  if (typed) banner('친구들 찾는 중… 🔎', 6000);

  bindSocket();
  joinedAt = Date.now();
  socket.connect(code, !typed);
  socket.emit('join', { name, decor: myDecor.filter((k) => unlocked().includes(k)) });
});

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function bindSocket() {
  socket.on('joined', () => $('#banner').classList.remove('show'));
  socket.on('state', onState);
  socket.on('fx', onFx);
  socket.on('chat', ({ id, name, text }) => {
    addChat(name, text);
    scene.showBubble(id, text);
  });
  socket.on('look', ({ id, yaw, pitch }) => scene.remoteLook(id, yaw, pitch));
  socket.on('notice', (msg) => banner(msg));
  socket.on('receipt', showReceipt);
  socket.on('status', ({ relays, relayTotal, peers, host }) => {
    const el = $('#netStatus');
    const alone = state && state.members.length <= 1;
    el.textContent = relays === 0 ? `🔴 중계망 연결 안 됨 (0/${relayTotal})`
      : `${peers ? '🟢' : '🟡'} 중계망 ${relays}/${relayTotal} · 친구 ${peers}명 연결${host === 'me' ? ' · 내가 방장' : ''}`;
    el.classList.toggle('bad', relays === 0 || (alone && peers === 0 && Date.now() - joinedAt > 20000));
  });

  let last = '';
  setInterval(() => {
    const cur = `${scene.yaw.toFixed(2)},${scene.pitch.toFixed(2)}`;
    if (cur !== last) { last = cur; socket.emit('look', { yaw: scene.yaw, pitch: scene.pitch }); }
  }, 150);
  setInterval(renderPomo, 500);
}

// ===================== 상태 =====================
function onState(s) {
  const prevVenue = state?.venue;
  state = s;
  state.pomo.endsAt = Date.now() + s.pomo.left; // 방장 시계랑 어긋나지 않게
  const me = s.members.find((m) => m.id === myId);
  if (s.venue !== prevVenue) {
    audio.setVenue(s.venue);
    const v = menu[s.venue];
    $('#venueName').textContent = v.name;
    $('#orderBtn span').textContent = v.orderVerb || '주문';
    $('#orderBtn').hidden = !v.items.length;
    $('#storeBtn').hidden = !v.store;
  }
  scene.setState(s, myId);

  // 누적 공부 시간 (내 기기에 저장 → 꾸미기 해금)
  if (me) {
    if (me.studyMs > lastStudyMs) {
      const before = unlocked().length;
      lifetimeMs += me.studyMs - lastStudyMs;
      store.set('lifetime', lifetimeMs);
      if (unlocked().length > before) {
        const d = DECOR.find((x) => x.key === unlocked().at(-1));
        banner(`🎁 새 꾸미기 해금: ${d.name}`, 4000);
        audio.play('pomo_bell', { volume: 0.5, rate: 1.3 });
      }
    }
    lastStudyMs = me.studyMs;
  }

  $('#memberList').innerHTML = s.members.map((m) => `
    <li data-id="${m.id}"><span class="dot" style="background:${m.color}"></span>${esc(m.name)}${m.id === myId ? ' (나)' : ''}
    ${m.lamp && !m.away ? '<span class="st">💡</span>' : ''}${m.away ? `<span class="st">${STATUS_ICON[m.away]}</span>` : ''}
    <span class="st">${hm(m.studyMs)}</span></li>`).join('');

  const away = !!me?.away;
  for (const id of ['#orderBtn', '#storeBtn', '#toiletBtn', '#lampBtn']) $(id).disabled = away;
  $('#lampBtn').classList.toggle('on', !!me?.lamp);
  $('#moveBtn').disabled = !!s.vote;
  $('#endBtn').disabled = !!s.vote;
  $('#bladderFill').style.width = `${Math.round((me?.bladder || 0) * 100)}%`;
  $('#peeNote').classList.toggle('on', !away && (me?.bladder || 0) >= 0.7);

  // 뽀모도로 단계가 바뀌면 마이크 자동 (휴식 때만 켬)
  const phase = s.pomo.running ? s.pomo.phase : 'off';
  if (phase !== lastPhase) {
    if (settings.autoMic && voice.stream) {
      micOn = phase === 'break';
      voice.setMuted(!micOn);
      updateMicBtn();
    }
    lastPhase = phase;
  }
  renderPomo();
  renderVote();
}

function renderPomo() {
  if (!state) return;
  const p = state.pomo;
  const el = $('#pomo');
  el.classList.toggle('focus', p.running && p.phase === 'focus');
  el.classList.toggle('break', p.running && p.phase === 'break');
  if (!p.running) {
    $('#pomoPhase').textContent = '⏱ 뽀모도로';
    $('#pomoTime').textContent = '25:00';
    $('#pomoBtn').textContent = '같이 시작';
  } else {
    const left = Math.max(0, p.endsAt - Date.now());
    const mm = String(Math.floor(left / 60000)).padStart(2, '0');
    const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
    $('#pomoPhase').textContent = p.phase === 'focus' ? '📖 집중' : '☕ 휴식';
    $('#pomoTime').textContent = `${mm}:${ss}`;
    $('#pomoBtn').textContent = '멈춤';
  }
  $('#pomoCount').textContent = p.count ? `${p.count}세트 완료` : '';
  if (pipTimer) pipTimer.textContent = `${$('#pomoPhase').textContent} ${$('#pomoTime').textContent}`;
}

// ===================== 이벤트 연출 =====================
function onFx(f) {
  const P = audio.play.bind(audio);
  const mine = f.id === myId;
  switch (f.type) {
    case 'join':
      P('chair_scrape', { volume: 0.5 });
      sys(`${f.name} 님이 자리에 앉았어요`);
      break;
    case 'leave':
      voice.remove(f.id);
      P('chair_scrape', { volume: 0.4, rate: 1.1 });
      sys(`${f.name} 님이 먼저 갔어요`);
      break;
    case 'ordered':
      if (f.venue === 'cafe') { P('call_bell', { volume: 0.4 }); sys(`${f.name}: ${f.names.join(', ')} 주문했어요`); }
      break;
    case 'served':
      if (f.venue === 'cafe') { P('serve', { volume: 0.5 }); feed(`☕ ${f.name} 님 ${f.names.join(', ')} 나왔어요`); }
      else { P('can_open', { volume: 0.5, delay: 0.3 }); feed(`🥤 ${f.name} 님 자판기에서 ${f.names.join(', ')}`); }
      break;
    case 'store_go':
      P('chair_scrape', { volume: 0.5 });
      P('footsteps', { volume: 0.4, delay: 0.6 });
      sys(`${f.name} 님 편의점 다녀와요 (${f.names.join(', ')})`);
      break;
    case 'store_back':
      P('plastic_bag', { volume: 0.6 });
      P('chair_scrape', { volume: 0.4, delay: 1 });
      feed(`🏪 ${f.name} 님 ${f.names.join(', ')} 사 왔어요`);
      break;
    case 'sip':
      scene.bounceItem(f.itemId);
      if (mine) P('sip', { volume: 0.5 });
      break;
    case 'bite':
      scene.bounceItem(f.itemId);
      if (mine) P('bite', { volume: 0.5 });
      break;
    case 'lamp':
      P('lamp_click', { volume: mine ? 0.6 : 0.25 });
      break;
    case 'toilet':
      P('chair_scrape', { volume: 0.4 });
      if (f.forced) { banner(`${mine ? '나' : f.name} 참다 참다 결국 화장실로 뛰어감 🏃💨`, 3500); feed(`🚽 ${f.name} 님 급하게 화장실 ㅋㅋ`); }
      else feed(`🚽 ${f.name} 님 화장실 감`);
      break;
    case 'toilet_back':
      if (mine) P('toilet_flush', { volume: 0.5 });
      P('chair_scrape', { volume: 0.3, delay: mine ? 1.2 : 0 });
      break;
    case 'pomo_start':
      P('pomo_bell', { volume: 0.6 });
      banner(`${f.name}: 25분 집중 시작! 📖`, 3000);
      break;
    case 'pomo_stop':
      sys(`${f.name} 님이 타이머를 멈췄어요`);
      break;
    case 'pomo_done':
      P('pomo_bell', { volume: 0.8 });
      P('pomo_bell', { volume: 0.6, delay: 0.5, rate: 1.2 });
      scene.celebrate();
      banner(`수고했다 🙌 ${f.count}세트 완료! 5분 쉬자`, 4500);
      break;
    case 'pomo_focus':
      P('pomo_bell', { volume: 0.6 });
      banner('휴식 끝! 다시 집중 📖', 3000);
      break;
    case 'vote_result':
      if (!f.passed) banner(f.vote === 'move' ? '이동 취소… 여기 계속 있자' : '아직 더 한다!');
      break;
    case 'moved':
      $('#fade').classList.add('on');
      P('chair_scrape', { volume: 0.6 });
      P('footsteps', { volume: 0.5, delay: 0.5 });
      setTimeout(() => {
        $('#fade').classList.remove('on');
        banner(`${menu[f.venue].name} 도착!`, 3000);
      }, 1400);
      break;
  }
}

function onLevel(id, level) {
  if (id === 'me') id = myId;
  else scene?.setTalk(id, level);
  document.querySelector(`#memberList li[data-id="${id}"]`)?.classList.toggle('talking', level > 0.08);
}

// ===================== 채팅 / 알림 =====================
function addChat(name, text) {
  const d = document.createElement('div');
  d.innerHTML = `<b>${esc(name)}</b>${esc(text)}`;
  $('#chatLog').append(d);
  $('#chatLog').scrollTop = 1e9;
}
function sys(text) {
  const d = document.createElement('div');
  d.className = 'sys';
  d.textContent = text;
  $('#chatLog').append(d);
  $('#chatLog').scrollTop = 1e9;
}
$('#chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#chatInput').value.trim();
  if (v) socket.emit('chat', v);
  $('#chatInput').value = '';
});
addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if (e.key === 'Enter' && !typing && !$('#app').hidden) $('#chatInput').focus();
  if (e.key === 'Escape') document.activeElement?.blur();
});

let bannerTimer;
function banner(text, ms = 2500) {
  $('#banner').textContent = text;
  $('#banner').classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => $('#banner').classList.remove('show'), ms);
}
function feed(text) {
  const d = document.createElement('div');
  d.textContent = text;
  $('#feed').append(d);
  setTimeout(() => d.remove(), 5000);
}

// ===================== 버튼 =====================
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => (b.closest('.modal').hidden = true)));
const ready = () => { if (!state) banner('아직 친구들 찾는 중… 잠깐만!'); return !!state; };

function openMenu(isStore) {
  if (!ready()) return;
  cart = {};
  cartStore = isStore;
  $('#menuTitle').textContent = isStore ? '🏪 편의점에서 뭐 사올까?' : state.venue === 'cafe' ? '☕ 카페 메뉴' : '🥤 자판기';
  $('#orderSubmit').textContent = isStore ? '사러 가기' : '주문하기';
  renderMenu();
  $('#menuModal').hidden = false;
}
$('#orderBtn').addEventListener('click', () => openMenu(false));
$('#storeBtn').addEventListener('click', () => openMenu(true));

function renderMenu() {
  const items = cartStore ? menu[state.venue].store : menu[state.venue].items;
  $('#menuList').innerHTML = items.map((it) => `
    <li><span class="nm">${it.name}${it.caffeine ? ' <small title="카페인">☕</small>'.repeat(it.caffeine) : ''}</span><span class="pr">${won(it.price)}</span>
    <span class="qty"><button data-k="${it.key}" data-d="-1">−</button><b>${cart[it.key] || 0}</b><button data-k="${it.key}" data-d="1">+</button></span></li>`).join('');
  const keys = Object.entries(cart).filter(([, n]) => n > 0);
  const count = keys.reduce((s, [, n]) => s + n, 0);
  const total = keys.reduce((s, [k, n]) => s + items.find((i) => i.key === k).price * n, 0);
  $('#cartText').textContent = keys.length ? keys.map(([k, n]) => `${items.find((i) => i.key === k).name}×${n}`).join(', ') : '담은 거 없음 (책상엔 3개까지)';
  $('#cartTotal').textContent = won(total);
  $('#orderSubmit').disabled = !count || count > 3;
}
$('#menuList').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  cart[b.dataset.k] = Math.max(0, Math.min(3, (cart[b.dataset.k] || 0) + +b.dataset.d));
  renderMenu();
});
$('#orderSubmit').addEventListener('click', () => {
  const keys = Object.entries(cart).flatMap(([k, n]) => Array(n).fill(k));
  if (keys.length) socket.emit('order', { keys, store: cartStore });
  $('#menuModal').hidden = true;
});

$('#lampBtn').addEventListener('click', () => socket.emit('lamp'));
$('#toiletBtn').addEventListener('click', () => socket.emit('toilet'));
$('#pomoBtn').addEventListener('click', () => socket.emit('pomo'));

$('#moveBtn').addEventListener('click', () => {
  if (!ready()) return;
  $('#venueChoices').innerHTML = Object.keys(menu).filter((k) => k !== state.venue)
    .map((k) => `<button data-v="${k}"><b>${menu[k].name}</b><span>${VENUE_DESC[k]}</span></button>`).join('');
  $('#moveModal').hidden = false;
});
$('#venueChoices').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  socket.emit('propose', { type: 'move', target: b.dataset.v });
  $('#moveModal').hidden = true;
});
$('#endBtn').addEventListener('click', () => socket.emit('propose', { type: 'end' }));

$('#micBtn').addEventListener('click', () => {
  if (!voice.stream) return banner('마이크 권한이 없어요. 주소창 옆 🔒에서 허용 후 새로고침!', 4000);
  micOn = !micOn;
  voice.setMuted(!micOn);
  updateMicBtn();
});
function updateMicBtn() {
  $('#micBtn').classList.toggle('off', !micOn);
  $('#micBtn span').textContent = micOn ? '마이크 ON' : '마이크 OFF';
}

$('#inviteBtn').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?room=${$('#roomCode').textContent}`;
  try { await navigator.clipboard.writeText(url); banner('초대 링크 복사 완료!'); } catch { banner(url, 5000); }
});

// ---------- 설정 ----------
function applySettings() {
  for (const k of VOLUME_KEYS) if (k !== 'voice') audio.setVolume(k, settings[k]);
  voice.setVolume(settings.voice * settings.master);
}
$('#settingsBtn').addEventListener('click', () => {
  document.querySelectorAll('[data-vol]').forEach((el) => (el.value = settings[el.dataset.vol]));
  $('#autoMic').checked = settings.autoMic;
  $('#settingsModal').hidden = false;
});
document.querySelectorAll('[data-vol]').forEach((el) => el.addEventListener('input', () => {
  settings[el.dataset.vol] = +el.value;
  store.set('settings', settings);
  applySettings();
}));
$('#autoMic').addEventListener('change', (e) => { settings.autoMic = e.target.checked; store.set('settings', settings); });

// ---------- 꾸미기 ----------
function renderDecor() {
  const have = unlocked();
  $('#decorInfo').textContent = `누적 공부 ${hm(lifetimeMs)} · 스탠드 켜고 공부한 시간만 쌓여요`;
  $('#decorList').innerHTML = DECOR.map((d) => {
    const ok = have.includes(d.key);
    return `<li class="${ok ? '' : 'locked'}"><span class="nm">${d.name}</span><span class="pr">${ok ? '' : `${d.minutes}분 공부하면 🔒`}</span>
      <input type="checkbox" data-k="${d.key}" ${ok ? '' : 'disabled'} ${myDecor.includes(d.key) ? 'checked' : ''} /></li>`;
  }).join('');
}
$('#decorBtn').addEventListener('click', () => { renderDecor(); $('#decorModal').hidden = false; });
$('#decorList').addEventListener('change', (e) => {
  const k = e.target.dataset.k;
  if (!k) return;
  myDecor = myDecor.filter((x) => x !== k);
  if (e.target.checked) {
    if (LAMP_COLORS[k]) myDecor = myDecor.filter((x) => !LAMP_COLORS[x]); // 스탠드 색은 하나만
    myDecor.push(k);
  }
  store.set('decor', myDecor);
  socket.emit('decor', myDecor);
  renderDecor();
});

// ---------- 메모 / 할 일 ----------
let todos = store.get('todos', []);
$('#memoText').value = store.get('memo', '');
function renderTodos() {
  $('#todoList').innerHTML = todos.map((t, i) => `<li class="${t.done ? 'done' : ''}"><input type="checkbox" data-i="${i}" ${t.done ? 'checked' : ''} /><span>${esc(t.text)}</span><button data-del="${i}">✕</button></li>`).join('');
}
renderTodos();
$('#memoBtn').addEventListener('click', () => ($('#memo').hidden = !$('#memo').hidden));
$('#memoClose').addEventListener('click', () => ($('#memo').hidden = true));
$('#memoText').addEventListener('input', (e) => store.set('memo', e.target.value));
$('#todoForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#todoInput').value.trim();
  if (!text) return;
  todos.push({ text, done: false });
  store.set('todos', todos);
  $('#todoInput').value = '';
  renderTodos();
});
$('#todoList').addEventListener('click', (e) => {
  if (e.target.dataset.del) todos.splice(+e.target.dataset.del, 1);
  else if (e.target.dataset.i) {
    const t = todos[+e.target.dataset.i];
    t.done = e.target.checked;
    if (t.done) { audio.play('pencil', { volume: 0.5 }); feed('✅ 할 일 하나 끝!'); }
  } else return;
  store.set('todos', todos);
  renderTodos();
});

// ---------- 📌 미니 창 (문서 PiP: 다른 창 위에 항상 떠 있음) ----------
let pipWin = null, pipTimer = null;
$('#pipBtn').addEventListener('click', async () => {
  if (pipWin) return pipWin.close();
  if (!('documentPictureInPicture' in window)) return banner('미니 창은 크롬/엣지에서만 돼요', 3500);
  pipWin = await documentPictureInPicture.requestWindow({ width: 420, height: 300 });
  const st = pipWin.document.createElement('style');
  st.textContent = `html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:sans-serif}
    #view{position:absolute;inset:0} #pipTimer{position:absolute;left:8px;top:8px;background:rgba(0,0,0,.6);color:#fff;padding:4px 10px;border-radius:99px;font-size:14px}`;
  pipWin.document.head.append(st);
  pipTimer = pipWin.document.createElement('div');
  pipTimer.id = 'pipTimer';
  const view = $('#view');
  pipWin.document.body.append(view, pipTimer);
  scene.setWindow(pipWin);
  renderPomo();
  $('#pipBtn').classList.add('on');
  pipWin.addEventListener('pagehide', () => {
    $('#app').prepend(view);
    scene.setWindow(window);
    pipWin = null;
    pipTimer = null;
    $('#pipBtn').classList.remove('on');
  });
});

// ===================== 투표 =====================
let voteTick;
function renderVote() {
  const v = state.vote;
  clearInterval(voteTick);
  if (!v) { $('#voteModal').hidden = true; return; }
  $('#voteModal').hidden = false;
  $('#voteTitle').textContent = v.type === 'move'
    ? `${v.byName}: ${menu[v.target].name}(으)로 옮기자!`
    : `${v.byName}: 오늘은 여기까지 할까? 📊`;
  const yes = state.members.filter((m) => v.answers[m.id] === true).map((m) => m.name);
  const waiting = state.members.filter((m) => v.answers[m.id] === undefined).map((m) => m.name);
  $('#voteStatus').textContent = `찬성: ${yes.join(', ') || '-'}${waiting.length ? ` · 대기: ${waiting.join(', ')}` : ''} (전원 찬성해야 함)`;
  $('#voteButtons').hidden = v.answers[myId] !== undefined;
  const endsAt = Date.now() + v.left;
  const tick = () => ($('#voteTimer').style.width = `${Math.max(0, (endsAt - Date.now()) / 20000) * 100}%`);
  tick();
  voteTick = setInterval(tick, 200);
}
$('#voteYes').addEventListener('click', () => socket.emit('vote', true));
$('#voteNo').addEventListener('click', () => socket.emit('vote', false));

// ===================== 공부 기록 =====================
function showReceipt(r) {
  audio.stopAll();
  pipWin?.close();
  $('#voteModal').hidden = true;
  const fmt = (t) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  let html = `<h3>📚 사이버 카공 공부 기록</h3><div class="c">${fmt(r.startedAt)} ~ ${fmt(r.endedAt)}</div>`;
  html += `<div class="c">${r.history.map((v) => menu[v].name).join(' → ')}</div><hr>`;
  for (const m of [...r.members].sort((a, b) => b.studyMs - a.studyMs)) {
    html += `<div class="who">${esc(m.name)}</div>`;
    html += `<div class="ln"><span class="n">공부 시간 (스탠드 ON)</span><span>${hm(m.studyMs)}</span></div>`;
    html += `<div class="ln"><span class="n">뽀모도로</span><span>${m.pomos}세트</span></div>`;
    html += `<div class="ln"><span class="n">마신 횟수</span><span>${m.sips}모금</span></div>`;
    html += `<div class="ln"><span class="n">화장실</span><span>${m.toilets}번</span></div>`;
    html += `<div class="ln"><span class="n">쓴 돈</span><span>${m.spent.toLocaleString()}원</span></div>`;
  }
  const total = r.ledger.reduce((s, l) => s + l.price, 0);
  html += `<hr><div class="ln tot"><span class="n">다 같이 쓴 돈</span><span>${total.toLocaleString()}원</span></div>`;
  const best = [...r.members].sort((a, b) => b.studyMs - a.studyMs)[0];
  const pee = [...r.members].sort((a, b) => b.toilets - a.toilets)[0];
  if (best?.studyMs) html += `<hr><div class="c">🏆 오늘의 공부왕: <b>${esc(best.name)}</b> (${hm(best.studyMs)})</div>`;
  if (pee?.toilets) html += `<div class="c">🚽 화장실왕: <b>${esc(pee.name)}</b> (${pee.toilets}번)</div>`;
  html += `<hr><div class="c">내 누적 공부 시간: ${hm(lifetimeMs)}</div>`;
  html += `<div class="barcode"></div><div class="c">오늘도 수고했어요 ✏️</div>`;
  $('#receipt').innerHTML = html;
  $('#receiptModal').hidden = false;
  $('#app').hidden = true;
}
$('#receiptClose').addEventListener('click', () => (location.href = location.pathname));

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
