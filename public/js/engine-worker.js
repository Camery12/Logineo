import { Engine } from './engine.js';
const engine = new Engine();
self.onmessage = (e) => {
  const { id, fen, history, cfg } = e.data;
  engine.load(fen, history || []);
  const move = engine.think(cfg);
  self.postMessage({ id, move });
};
