import { Engine } from './engine.js';
const engine = new Engine();
self.onmessage = (e) => {
  const { id, type, fen, history, cfg, move, timeMs } = e.data;
  if (type === 'analyze') {
    let result = null;
    try { result = engine.analyze(fen, move, history || [], timeMs || 300); } catch (err) { result = null; }
    self.postMessage({ id, result });
    return;
  }
  engine.load(fen, history || []);
  const m = engine.think(cfg);
  self.postMessage({ id, move: m });
};
