// Synthetische Sounds per WebAudio – keine Dateien nötig
let ctx = null;
let muted = localStorage.getItem('muted') === '1';
const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());

function tone({ freq = 440, type = 'sine', dur = 0.12, vol = 0.2, slide = 0, delay = 0, noise = false }) {
  if (muted) return;
  const a = ac(), t = a.currentTime + delay;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(a.destination);
  let src;
  if (noise) {
    const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    src.connect(f); f.connect(g);
  } else {
    src = a.createOscillator(); src.type = type; src.frequency.setValueAtTime(freq, t);
    if (slide) src.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    src.connect(g);
  }
  src.start(t); src.stop(t + dur + 0.02);
}

export const sound = {
  get muted() { return muted; },
  toggle() { muted = !muted; localStorage.setItem('muted', muted ? '1' : '0'); return muted; },
  move() { tone({ freq: 1800, noise: true, dur: 0.07, vol: 0.5 }); tone({ freq: 180, type: 'sine', dur: 0.06, vol: 0.15 }); },
  capture() { tone({ freq: 1200, noise: true, dur: 0.12, vol: 0.7 }); tone({ freq: 140, type: 'triangle', dur: 0.1, vol: 0.25, slide: -60 }); },
  check() { tone({ freq: 880, type: 'square', dur: 0.09, vol: 0.06 }); tone({ freq: 660, type: 'square', dur: 0.12, vol: 0.06, delay: 0.09 }); },
  start() { [523, 659, 784].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.18, vol: 0.12, delay: i * 0.09 })); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.14, delay: i * 0.12 })); },
  lose() { [392, 330, 262].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.35, vol: 0.12, delay: i * 0.16 })); },
  coin() { tone({ freq: 988, type: 'square', dur: 0.06, vol: 0.05 }); tone({ freq: 1319, type: 'square', dur: 0.16, vol: 0.05, delay: 0.06 }); },
  click() { tone({ freq: 600, type: 'sine', dur: 0.04, vol: 0.05 }); },
  notify() { tone({ freq: 740, type: 'sine', dur: 0.12, vol: 0.12 }); tone({ freq: 988, type: 'sine', dur: 0.2, vol: 0.12, delay: 0.1 }); },
  boom() { tone({ freq: 90, noise: true, dur: 0.9, vol: 0.9 }); tone({ freq: 70, type: 'sine', dur: 0.8, vol: 0.4, slide: -40 }); },
  zap() { tone({ freq: 3000, noise: true, dur: 0.35, vol: 0.6 }); tone({ freq: 120, type: 'sawtooth', dur: 0.3, vol: 0.12, slide: -80 }); },
  whoosh() { tone({ freq: 500, noise: true, dur: 0.8, vol: 0.35 }); },
  shatter() { for (let i = 0; i < 6; i++) tone({ freq: 3000 + Math.random() * 3000, noise: true, dur: 0.15, vol: 0.3, delay: i * 0.03 }); },
  thud() { tone({ freq: 110, type: 'sine', dur: 0.25, vol: 0.35, slide: -50 }); tone({ freq: 400, noise: true, dur: 0.15, vol: 0.3 }); },
};
