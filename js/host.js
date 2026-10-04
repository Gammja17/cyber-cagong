// 방장 브라우저에서 돌아가는 "서버". 방장이 나가면 다른 사람이 스냅샷으로 이어받음.
const FAST = new URLSearchParams(location.search).has('fast'); // ?fast 붙이면 테스트용으로 시간 단축
const MAX_MEMBERS = 6;
const ITEMS_PER_DESK = 3;
const VOTE_MS = 20000;
const STORE_TRIP_MS = 8000;
const TOILET_MS = FAST ? 4000 : 10000;
const FOCUS_MS = FAST ? 20000 : 25 * 60000;
const BREAK_MS = FAST ? 10000 : 5 * 60000;
const TICK_MS = 1000;
const SIP_BLADDER = 0.1; // 한 모금마다
const CAFFEINE_BLADDER = 0.06; // 카페인 1단계마다 추가
const SEAT_ORDER = [1, 4, 0, 3, 2, 5]; // 2명이면 마주보게
const COLORS = ['#e4572e', '#4c9be8', '#f3c13a', '#5fbf6a', '#b06ad9', '#ef7fb0'];

export class StudyHost {
  // out: { toAll(ev, data), toPeer(id, ev, data) }
  constructor(menu, code, out, snap = null) {
    this.MENU = menu;
    this.out = out;
    this.alive = true;
    this.room = snap ? restore(snap) : {
      code, venue: 'studycafe', members: {}, items: [], ledger: [], vote: null,
      pomo: { running: false, phase: 'focus', endsAt: 0, count: 0 },
      history: ['studycafe'], startedAt: Date.now(), nextItemId: 1,
    };
    if (snap && this.room.vote) this.room.vote.timer = this.later(Math.max(0, this.room.vote.endsAt - Date.now()) + 50, () => this.resolveVote());
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    this.alive = false;
    clearInterval(this.tickTimer);
    if (this.room.vote) clearTimeout(this.room.vote.timer);
  }

  snapshot() {
    const r = this.room;
    return {
      code: r.code, venue: r.venue, members: r.members, items: r.items, ledger: r.ledger,
      pomo: r.pomo, history: r.history, startedAt: r.startedAt, nextItemId: r.nextItemId,
      vote: r.vote && { ...r.vote, timer: undefined },
    };
  }

  publicState() {
    const r = this.room, now = Date.now();
    return {
      code: r.code,
      venue: r.venue,
      members: Object.values(r.members),
      items: r.items,
      pomo: { running: r.pomo.running, phase: r.pomo.phase, left: r.pomo.endsAt - now, count: r.pomo.count },
      vote: r.vote && {
        type: r.vote.type, target: r.vote.target, by: r.vote.by,
        byName: r.vote.byName, answers: r.vote.answers, left: r.vote.endsAt - now,
      },
    };
  }

  broadcast() { if (this.alive) this.out.toAll('state', this.publicState()); }
  fx(data) { if (this.alive) this.out.toAll('fx', data); }
  later(ms, fn) { return setTimeout(() => this.alive && fn(), ms); }
  allDefs() { const v = this.MENU[this.room.venue]; return [...v.items, ...(v.store || [])]; }
  defOf(item) { return this.allDefs().find((d) => d.key === item.key); }
  freeSlots(owner) {
    const used = new Set(this.room.items.filter((i) => i.owner === owner).map((i) => i.slot));
    return [...Array(ITEMS_PER_DESK).keys()].filter((s) => !used.has(s));
  }

  // 1초마다: 공부 시간 적립, 뽀모도로 진행, 화장실 한계 (공부 시간 공유는 5초마다)
  tick() {
    const r = this.room, now = Date.now();
    this.ticks = (this.ticks || 0) + 1;
    let changed = false;
    for (const m of Object.values(r.members)) {
      if (m.lamp && !m.away) { m.studyMs += TICK_MS; if (this.ticks % 5 === 0) changed = true; }
      if (m.bladder >= 1 && !m.away) { this.goToilet(m, true); changed = true; }
    }
    const p = r.pomo;
    if (p.running && now >= p.endsAt) {
      if (p.phase === 'focus') {
        p.count += 1;
        for (const m of Object.values(r.members)) m.pomos += 1;
        p.phase = 'break';
        p.endsAt = now + BREAK_MS;
        this.fx({ type: 'pomo_done', count: p.count });
      } else {
        p.phase = 'focus';
        p.endsAt = now + FOCUS_MS;
        this.fx({ type: 'pomo_focus' });
      }
      changed = true;
    }
    if (changed) this.broadcast();
  }

  goToilet(m, forced) {
    m.away = 'toilet';
    this.fx({ type: 'toilet', id: m.id, name: m.name, forced });
    this.later(TOILET_MS, () => {
      if (!this.room.members[m.id] || m.away !== 'toilet') return;
      m.away = null;
      m.bladder = 0;
      m.toilets += 1;
      this.fx({ type: 'toilet_back', id: m.id, name: m.name });
      this.broadcast();
    });
  }

  resolveVote() {
    const r = this.room;
    const v = r.vote;
    if (!v) return;
    const ids = Object.keys(r.members);
    const rejected = ids.some((id) => v.answers[id] === false);
    const allYes = ids.every((id) => v.answers[id] === true);
    if (!rejected && !allYes && Date.now() < v.endsAt) return;

    clearTimeout(v.timer);
    r.vote = null;
    const passed = allYes && !rejected;
    this.fx({ type: 'vote_result', passed, vote: v.type, target: v.target });

    if (passed && v.type === 'move') {
      r.venue = v.target;
      r.items = [];
      r.history.push(r.venue);
      for (const m of Object.values(r.members)) m.away = null;
      this.fx({ type: 'moved', venue: r.venue });
    }
    if (passed && v.type === 'end') {
      const spent = {};
      for (const l of r.ledger) spent[l.by] = (spent[l.by] || 0) + l.price;
      this.out.toAll('receipt', {
        history: r.history,
        ledger: r.ledger,
        pomos: r.pomo.count,
        members: Object.values(r.members).map((m) => ({
          name: m.name, studyMs: m.studyMs, sips: m.sips, toilets: m.toilets, pomos: m.pomos, spent: spent[m.name] || 0,
        })),
        startedAt: r.startedAt,
        endedAt: Date.now(),
      });
      this.stop();
      return;
    }
    this.broadcast();
  }

  // ---------- 손님 요청 처리 ----------
  handle(id, ev, data) {
    if (!this.alive) return;
    const r = this.room;
    if (ev === 'join') return this.join(id, data);
    const me = r.members[id];
    if (!me) return;

    switch (ev) {
      case 'chat': {
        const text = String(data || '').trim().slice(0, 200);
        if (text) this.out.toAll('chat', { id, name: me.name, text });
        break;
      }
      case 'order': { // { keys, store }
        const keys = data?.keys;
        if (!Array.isArray(keys) || !keys.length || keys.length > ITEMS_PER_DESK || me.away) return;
        const venue = this.MENU[r.venue];
        const list = data.store ? venue.store : venue.items;
        if (!list || !list.length) return;
        const defs = keys.map((k) => list.find((i) => i.key === k)).filter(Boolean);
        if (!defs.length) return;
        if (this.freeSlots(id).length < defs.length) return this.out.toPeer(id, 'notice', '책상이 꽉 찼어요! 좀 먹고 시키자');
        const names = defs.map((d) => d.name);
        const venueNow = r.venue;
        const deliver = () => {
          if (!r.members[id] || r.venue !== venueNow) return [];
          const slots = this.freeSlots(id);
          const got = [];
          for (const d of defs) {
            const slot = slots.shift();
            if (slot === undefined) break;
            r.items.push({ id: r.nextItemId++, key: d.key, owner: id, slot, left: d.servings });
            r.ledger.push({ venue: r.venue, name: d.name, price: d.price, by: me.name });
            got.push(d.name);
          }
          return got;
        };
        if (data.store) {
          me.away = 'store';
          this.fx({ type: 'store_go', id, name: me.name, names });
          this.broadcast();
          this.later(STORE_TRIP_MS, () => {
            if (!r.members[id] || me.away !== 'store') return;
            me.away = null;
            this.fx({ type: 'store_back', id, name: me.name, names: deliver() });
            this.broadcast();
          });
        } else {
          this.fx({ type: 'ordered', id, name: me.name, names, venue: r.venue });
          this.later(r.venue === 'cafe' ? 4000 + Math.random() * 3000 : 1200, () => {
            const got = deliver();
            if (!got.length) return;
            this.fx({ type: 'served', id, name: me.name, names: got, venue: r.venue });
            this.broadcast();
          });
        }
        break;
      }
      case 'take': { // 내 책상 위 음료 한 모금 / 간식 한입
        if (me.away) return;
        const item = r.items.find((i) => i.id === data && i.owner === id);
        if (!item) return;
        const def = this.defOf(item);
        item.left -= 1;
        if (item.left <= 0) r.items = r.items.filter((i) => i !== item);
        if (def.kind === 'drink') {
          me.sips += 1;
          me.bladder = Math.min(1, me.bladder + SIP_BLADDER + (def.caffeine || 0) * CAFFEINE_BLADDER);
          this.fx({ type: 'sip', id, name: me.name, item: def.name, itemId: data, empty: item.left <= 0 });
        } else {
          this.fx({ type: 'bite', id, name: me.name, item: def.name, itemId: data, empty: item.left <= 0 });
        }
        this.broadcast();
        break;
      }
      case 'toilet': {
        if (me.away) return;
        this.goToilet(me, false);
        this.broadcast();
        break;
      }
      case 'lamp': {
        me.lamp = !me.lamp;
        this.fx({ type: 'lamp', id, on: me.lamp });
        this.broadcast();
        break;
      }
      case 'decor': {
        if (!Array.isArray(data)) return;
        me.decor = data.filter((k) => typeof k === 'string').slice(0, 8);
        this.broadcast();
        break;
      }
      case 'pomo': {
        const p = r.pomo;
        if (p.running) {
          p.running = false;
          this.fx({ type: 'pomo_stop', name: me.name });
        } else {
          p.running = true;
          p.phase = 'focus';
          p.endsAt = Date.now() + FOCUS_MS;
          this.fx({ type: 'pomo_start', name: me.name });
        }
        this.broadcast();
        break;
      }
      case 'propose': {
        const { type, target } = data || {};
        if (r.vote) return;
        if (type === 'move' && (!this.MENU[target] || target === r.venue)) return;
        if (type !== 'move' && type !== 'end') return;
        r.vote = {
          type, target: type === 'move' ? target : null, by: id, byName: me.name,
          answers: { [id]: true }, endsAt: Date.now() + VOTE_MS,
        };
        r.vote.timer = this.later(VOTE_MS + 50, () => this.resolveVote());
        this.broadcast();
        this.resolveVote();
        break;
      }
      case 'vote': {
        if (!r.vote) return;
        r.vote.answers[id] = !!data;
        this.broadcast();
        this.resolveVote();
        break;
      }
    }
  }

  join(id, data) {
    const r = this.room;
    if (r.members[id]) { // 방장 교대 후 다시 인사한 경우
      this.out.toPeer(id, 'joined', { id, code: r.code });
      return this.broadcast();
    }
    const name = String(data?.name || '').trim().slice(0, 12) || '익명';
    const taken = new Set(Object.values(r.members).map((m) => m.seat));
    const seat = SEAT_ORDER.find((s) => !taken.has(s));
    if (seat === undefined || Object.keys(r.members).length >= MAX_MEMBERS) return this.out.toPeer(id, 'notice', '자리가 꽉 찼어요 (최대 6명)');
    r.members[id] = {
      id, name, seat, color: COLORS[seat], away: null, lamp: false, bladder: 0,
      studyMs: 0, sips: 0, toilets: 0, pomos: 0, decor: Array.isArray(data?.decor) ? data.decor.slice(0, 8) : [],
    };
    this.out.toPeer(id, 'joined', { id, code: r.code });
    this.fx({ type: 'join', id, name });
    this.broadcast();
  }

  leave(id) {
    const r = this.room;
    const me = r.members[id];
    if (!me) return;
    delete r.members[id];
    r.items = r.items.filter((i) => i.owner !== id);
    this.fx({ type: 'leave', id, name: me.name });
    if (r.vote) { delete r.vote.answers[id]; this.resolveVote(); }
    this.broadcast();
  }
}

function restore(snap) {
  const r = structuredClone(snap);
  for (const m of Object.values(r.members)) m.away = null;
  return r;
}
