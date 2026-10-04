// 보이스챗: Trystero가 연결해준 P2P 연결 위로 마이크 스트림을 주고받음
export class Voice {
  constructor(net, audioCtx, onLevel) {
    this.net = net;
    this.ctx = audioCtx;
    this.onLevel = onLevel;
    this.stream = null;
    this.muted = false;
    this.volume = 1;
    this.peers = new Map(); // id -> { audio, analyser }

    net.on('peer', (id) => this.stream && net.room.addStream(this.stream, { target: id }));
    net.on('stream', ({ stream, peerId }) => this.attach(peerId, stream));
    net.on('peer_leave', (id) => this.remove(id));
    this.loop();
  }

  async initMic() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.localAnalyser = this.makeAnalyser(this.stream);
      return true;
    } catch (e) {
      console.warn('마이크 사용 불가:', e);
      return false;
    }
  }

  makeAnalyser(stream) {
    const a = this.ctx.createAnalyser();
    a.fftSize = 512;
    this.ctx.createMediaStreamSource(stream).connect(a);
    return a;
  }

  attach(id, stream) {
    this.remove(id);
    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.volume = this.volume;
    audio.play().catch(() => {});
    this.peers.set(id, { audio, analyser: this.makeAnalyser(stream) });
  }

  remove(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.audio.srcObject = null;
    this.peers.delete(id);
    this.onLevel(id, 0);
  }

  setVolume(v) {
    this.volume = v;
    for (const p of this.peers.values()) p.audio.volume = v;
  }

  setMuted(m) {
    this.muted = m;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !m));
  }

  level(analyser) {
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / buf.length) * 4);
  }

  loop() {
    setInterval(() => {
      for (const [id, p] of this.peers) this.onLevel(id, this.level(p.analyser));
      if (this.localAnalyser) this.onLevel('me', this.muted ? 0 : this.level(this.localAnalyser));
    }, 80);
  }
}
