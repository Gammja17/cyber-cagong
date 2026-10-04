// 서버 없이 P2P로 연결 (Trystero / Nostr 릴레이로 서로 찾음).
// 방장 한 명이 StudyHost를 돌리고, 나머지는 방장에게 요청을 보냄. socket.io 비슷한 on/emit 인터페이스.
import { joinRoom, selfId } from 'https://cdn.jsdelivr.net/npm/trystero@0.25.4/+esm';
import { StudyHost } from './host.js';

const APP_ID = 'cyber-cagong-2026';
const FIND_MS = 5000; // 이 시간 안에 방장을 못 찾으면 내가 방장

export class Net {
  constructor(menu) {
    this.menu = menu;
    this.id = selfId;
    this.handlers = {};
    this.hostId = null;
    this.host = null;
    this.snap = null;
    this.queue = [];
    this.joinData = null;
  }

  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  fire(ev, data) { for (const fn of this.handlers[ev] || []) fn(data); }

  connect(code, fresh) {
    this.code = code;
    this.room = joinRoom({ appId: APP_ID }, `cagong-${code}`);
    this.c2h = this.room.makeAction('c2h');
    this.h2c = this.room.makeAction('h2c');
    this.lookAction = this.room.makeAction('look');

    this.c2h.onMessage = ({ ev, data }, { peerId }) => this.host?.handle(peerId, ev, data);
    this.h2c.onMessage = (msg, { peerId }) => this.fromHost(msg, peerId);
    this.lookAction.onMessage = (d, { peerId }) => this.fire('look', { ...d, id: peerId });
    this.room.onPeerJoin = (peerId) => {
      this.fire('peer', peerId);
      if (this.host) this.h2c.send(this.wrap('state', this.host.publicState()), { target: peerId });
    };
    this.room.onPeerLeave = (peerId) => this.peerLeft(peerId);
    this.room.onPeerStream = (stream, peerId) => this.fire('stream', { stream, peerId });

    if (fresh) this.becomeHost(null);
    else setTimeout(() => !this.hostId && this.becomeHost(null), FIND_MS);
  }

  emit(ev, data) {
    if (ev === 'look') return this.lookAction.send(data);
    if (ev === 'join') this.joinData = data;
    if (this.host) return queueMicrotask(() => this.host.handle(this.id, ev, data));
    if (!this.hostId) return this.queue.push([ev, data]);
    this.c2h.send({ ev, data }, { target: this.hostId });
  }

  flush() {
    const q = this.queue.splice(0);
    for (const [ev, data] of q) this.emit(ev, data);
  }

  wrap(ev, data) {
    const msg = { ev, data };
    if (ev === 'state') msg.snap = this.host.snapshot();
    return msg;
  }

  deliver(ev, data) {
    this.fire(ev, data);
    if (ev === 'receipt') setTimeout(() => this.room.leave(), 1500);
  }

  connected(id) {
    return id === this.id || id in this.room.getPeers();
  }

  becomeHost(snap) {
    this.hostId = this.id;
    this.host = new StudyHost(this.menu, this.code, {
      toAll: (ev, data) => { this.h2c.send(this.wrap(ev, data)); this.deliver(ev, data); },
      toPeer: (id, ev, data) => (id === this.id ? this.deliver(ev, data) : this.h2c.send(this.wrap(ev, data), { target: id })),
    }, snap);
    // 스냅샷에 있지만 이미 나간 사람 정리
    for (const id of Object.keys(this.host.room.members)) if (!this.connected(id)) this.host.leave(id);
    if (snap) {
      this.host.broadcast();
      if (!this.host.room.members[this.id] && this.joinData) this.host.handle(this.id, 'join', this.joinData);
    }
    this.flush();
  }

  // 방장에서 온 메시지
  fromHost({ ev, data, snap }, peerId) {
    if (ev === 'state' && peerId !== this.hostId) {
      // 방장이 둘이 되면 id가 작은 쪽으로 통일
      const keep = this.hostId && this.connected(this.hostId) && this.hostId < peerId;
      if (keep) return;
      if (this.host) { this.host.stop(); this.host = null; }
      this.hostId = peerId;
      if (this.joinData) this.c2h.send({ ev: 'join', data: this.joinData }, { target: peerId });
      this.queue = this.queue.filter(([e]) => e !== 'join');
      this.flush();
    }
    if (peerId !== this.hostId) return;
    if (snap) this.snap = snap;
    this.deliver(ev, data);
  }

  peerLeft(peerId) {
    this.fire('peer_leave', peerId);
    if (this.host) return this.host.leave(peerId);
    if (peerId !== this.hostId) return;
    // 방장이 나감 → 스냅샷 멤버 순서대로 다음 방장
    const next = Object.keys(this.snap?.members || {}).find((id) => id !== peerId && this.connected(id));
    if (!next || next === this.id) {
      this.becomeHost(this.snap);
    } else {
      this.hostId = next;
    }
  }
}
