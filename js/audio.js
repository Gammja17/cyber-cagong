// sounds/ 폴더의 mp3를 불러와 재생. 파일이 없으면 조용히 건너뜀 (sounds/README.md 참고)
const SOUNDS = [
  'ambient_studycafe', 'ambient_cafe', 'ambient_library',
  'chair_scrape', 'can_open', 'door_chime', 'footsteps', 'sip', 'call_bell', 'plastic_bag', 'bite', 'serve', 'clink',
  'page_turn', 'pencil', 'keyboard', 'coffee_machine', 'toilet_flush', 'lamp_click', 'pomo_bell',
];

// 원본이 긴 효과음은 쓸 구간만 재생: [시작초, 길이초] (여러 개면 랜덤)
const CLIPS = {
  chair_scrape: [[4.0, 2.0], [17.7, 1.6], [21.9, 1.6], [26.3, 1.8]],
  clink: [[0.5, 0.9]],
  sip: [[6.2, 1.0]],
  bite: [[2.0, 0.9], [7.8, 0.9], [14.0, 0.9]],
  serve: [[0.4, 1.0], [6.5, 1.0], [12.3, 1.2]],
  call_bell: [[0, 2.0]],
  door_chime: [[0, 2.5]],
  plastic_bag: [[2.0, 1.8], [9.8, 1.2]],
  footsteps: [[0, 3.0]],
  pencil: [[0, 1.4], [5.0, 1.5], [10, 2]],
  keyboard: [[2.3, 4.5], [8.3, 4], [14, 4]],
  coffee_machine: [[4.2, 6]],
  toilet_flush: [[0.2, 4.5]],
  pomo_bell: [[0.1, 2.0]],
  lamp_click: [[3.3, 0.4]],
};

// 장소별 분위기: 배경 루프 볼륨 + 가끔 나는 소리 [이름, 최소초, 최대초, 볼륨]
const VENUE_SOUND = {
  studycafe: { loop: 'ambient_studycafe', vol: 0.35, random: [['pencil', 6, 18, 0.15], ['page_turn', 15, 40, 0.12], ['keyboard', 10, 30, 0.08], ['chair_scrape', 40, 90, 0.08]] },
  cafe: { loop: 'ambient_cafe', vol: 0.45, random: [['coffee_machine', 25, 60, 0.18], ['clink', 10, 25, 0.12], ['door_chime', 30, 80, 0.1]] },
  library: { loop: 'ambient_library', vol: 0.3, random: [['page_turn', 6, 16, 0.15], ['pencil', 12, 30, 0.1], ['footsteps', 30, 70, 0.08], ['chair_scrape', 40, 100, 0.06]] },
};

export const VOLUME_KEYS = ['master', 'ambient', 'sfx', 'voice'];

export class AudioManager {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.buffers = {};
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.bus = { ambient: this.ctx.createGain(), sfx: this.ctx.createGain() };
    for (const b of Object.values(this.bus)) b.connect(this.master);
    this.current = null;
    this.timers = [];
    this.missing = [];
    this.ready = Promise.all(SOUNDS.map((n) => this.load(n))).then(() => {
      if (this.missing.length) console.info('[sound] 아직 없는 파일:', this.missing.join(', '));
    });
  }

  async load(name) {
    try {
      const res = await fetch(`sounds/${name}.mp3`);
      if (!res.ok) throw 0;
      this.buffers[name] = await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      this.missing.push(name);
    }
  }

  // bus: 'sfx'(기본) | 'ambient'
  play(name, { volume = 1, rate = 1, delay = 0, bus = 'sfx' } = {}) {
    const buf = this.buffers[name];
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.bus[bus]);
    const when = this.ctx.currentTime + delay;
    const clips = CLIPS[name];
    if (clips) {
      const [offset, dur] = clips[Math.floor(Math.random() * clips.length)];
      const len = dur / rate;
      g.gain.setValueAtTime(volume, when + Math.max(0, len - 0.15)); // 끝을 살짝 페이드아웃
      g.gain.linearRampToValueAtTime(0, when + len);
      src.start(when, offset, dur);
    } else {
      src.start(when);
    }
    return src;
  }

  async setVenue(key) {
    await this.ready;
    const cfg = VENUE_SOUND[key];
    this.timers.forEach(clearTimeout);
    this.timers = [];
    const now = this.ctx.currentTime;
    if (this.current) {
      const old = this.current;
      old.gain.gain.setTargetAtTime(0, now, 0.6);
      setTimeout(() => old.src.stop(), 3000);
      this.current = null;
    }
    if (this.buffers[cfg.loop]) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[cfg.loop];
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(cfg.vol, now, 0.8);
      src.connect(gain).connect(this.bus.ambient);
      src.start();
      this.current = { src, gain };
    }
    for (const [name, min, max, vol] of cfg.random) {
      const loop = () => {
        this.timers.push(setTimeout(() => {
          this.play(name, { volume: vol, rate: 0.9 + Math.random() * 0.2, bus: 'ambient' });
          loop();
        }, (min + Math.random() * (max - min)) * 1000));
      };
      loop();
    }
  }

  // 설정 창 볼륨 (0~1). voice는 Voice 쪽에서 처리
  setVolume(key, v) {
    const node = key === 'master' ? this.master : this.bus[key];
    if (node) node.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  stopAll() {
    this.timers.forEach(clearTimeout);
    if (this.current) this.current.src.stop();
    this.current = null;
  }
}
