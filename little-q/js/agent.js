// The game rules and the Deep Q-learning agent, with no DOM so they can be tested headless.
import { W, H, DX, DY, walkable, idx, inside, generate, nextEntry } from './world.js';
import { MLP } from './mlp.js';

export const GROUPS = ['open', 'closer to exit', 'mob on it', 'mob next to it', 'mob 2 away', 'been there', 'last move'];

export const REWARD = { exit: 2, caught: -2, closer: 0.1, notCloser: -0.15 };

// ---------- environment ----------
export class Env {
  constructor(nMobs = 4) {
    this.nMobs = nMobs;
    this.newMap(3, Math.floor(H / 2));
  }

  newMap(side, pos) {
    this.world = generate(side, pos);
    this.fails = 0;
    this.spawnMobs();
    this.reset();
  }

  nextMap() {
    const { side, pos } = nextEntry(this.world.exit);
    this.newMap(side, pos);
  }

  // Mobs start well away from the entry. Slimes hop at random; beetles pace a straight line.
  spawnMobs() {
    const { tiles, entry, exit } = this.world;
    const spots = [];
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++)
        if (walkable(tiles[idx(x, y)]) && Math.abs(x - entry.x) + Math.abs(y - entry.y) >= 7 &&
            Math.abs(x - exit.x) + Math.abs(y - exit.y) >= 2) spots.push([x, y]);
    this.spawns = [];
    for (let n = 0; n < this.nMobs && spots.length; n++) {
      const [x, y] = spots.splice(Math.floor(Math.random() * spots.length), 1)[0];
      const type = Math.random() < 0.35 ? 'beetle' : 'slime';
      let dir = Math.floor(Math.random() * 4);
      if (type === 'beetle') {
        // pace along whichever axis has the longer open run
        const run = d => { let k = 0; while (this.mobFree(x + DX[d] * (k + 1), y + DY[d] * (k + 1))) k++; return k; };
        dir = run(0) + run(2) >= run(1) + run(3) ? 0 : 1;
      }
      this.spawns.push({ type, x, y, dir });
    }
  }

  reset() {
    const { entry, dist } = this.world;
    this.x = entry.x; this.y = entry.y;
    this.prev = (entry.side + 2) % 4;
    this.visits = new Uint8Array(W * H);
    this.visits[idx(this.x, this.y)] = 1;
    this.steps = 0;
    this.tick = 0;
    this.optimal = dist[idx(entry.x, entry.y)];
    this.mobs = this.spawns.map(s => ({ ...s, frame: 0 }));
  }

  setMobCount(n) {
    this.nMobs = n;
    this.spawnMobs();
    // keep the current run going, but never drop a mob right next to the agent
    this.mobs = this.spawns
      .filter(s => Math.abs(s.x - this.x) + Math.abs(s.y - this.y) >= 4)
      .map(s => ({ ...s, frame: 0 }));
  }

  mobAt(x, y) { return this.mobs.some(m => m.x === x && m.y === y); }

  mobFree(x, y) {
    const { tiles, exit, entry } = this.world;
    return inside(x, y) && walkable(tiles[idx(x, y)]) &&
      !(x === exit.x && y === exit.y) && !(x === entry.x && y === entry.y);
  }

  // What the agent senses: seven questions about each of the four neighbouring tiles.
  features(x = this.x, y = this.y, prev = this.prev, visits = this.visits) {
    const { tiles, dist } = this.world;
    const f = new Float32Array(GROUPS.length * 4), mask = [0, 0, 0, 0];
    const here = dist[idx(x, y)];
    const mobWithin = (nx, ny, r) => this.mobs.some(m => {
      const d = Math.abs(m.x - nx) + Math.abs(m.y - ny);
      return d === r && !(m.x === x && m.y === y);
    });
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      const open = inside(nx, ny) && walkable(tiles[idx(nx, ny)]) ? 1 : 0;
      mask[d] = open;
      f[d] = open;
      if (!open) { f[24 + d] = prev === d ? 1 : 0; continue; }
      f[4 + d] = dist[idx(nx, ny)] < here ? 1 : 0;
      f[8 + d] = mobWithin(nx, ny, 0) ? 1 : 0;
      f[12 + d] = mobWithin(nx, ny, 1) ? 1 : 0;
      f[16 + d] = mobWithin(nx, ny, 2) ? 1 : 0;
      f[20 + d] = Math.min(visits[idx(nx, ny)], 3) / 3;
      f[24 + d] = prev === d ? 1 : 0;
    }
    return { f, mask };
  }

  // Move the agent, then the mobs. Returns the reward and how the run ended, if it did.
  step(a) {
    const { dist, exit } = this.world;
    const before = dist[idx(this.x, this.y)];
    this.x += DX[a]; this.y += DY[a];
    this.prev = a;
    this.steps++;
    this.tick++;
    const i = idx(this.x, this.y);
    this.visits[i] = Math.min(255, this.visits[i] + 1);

    if (this.mobAt(this.x, this.y)) return { reward: REWARD.caught, outcome: 'caught' };
    if (this.x === exit.x && this.y === exit.y) return { reward: REWARD.exit, outcome: 'exit' };
    this.moveMobs();
    if (this.mobAt(this.x, this.y)) return { reward: REWARD.caught, outcome: 'caught' };
    const reward = dist[i] < before ? REWARD.closer : REWARD.notCloser;
    if (this.steps >= this.optimal * 3 + 30) return { reward, outcome: 'timeout' };
    return { reward, outcome: null };
  }

  moveMobs() {
    for (const m of this.mobs) {
      m.fromX = m.x; m.fromY = m.y;
      const canGo = d => this.mobFree(m.x + DX[d], m.y + DY[d]) && !this.mobAt(m.x + DX[d], m.y + DY[d]);
      if (m.type === 'slime') {
        m.frame++;
        if (Math.random() < 0.5) continue;
        const options = [0, 1, 2, 3].filter(canGo);
        if (!options.length) continue;
        const d = options.includes(m.dir) && Math.random() < 0.5 ? m.dir : options[Math.floor(Math.random() * options.length)];
        m.dir = d; m.x += DX[d]; m.y += DY[d];
      } else {
        if (this.tick % 2) continue; // beetles are slow but relentless
        m.frame++;
        if (!canGo(m.dir)) m.dir = (m.dir + 2) % 4;
        if (canGo(m.dir)) { m.x += DX[m.dir]; m.y += DY[m.dir]; }
      }
    }
  }
}

// ---------- learner ----------
const argmaxValid = (q, mask) => {
  let m = -1;
  for (let k = 0; k < q.length; k++) if (mask[k] && (m < 0 || q[k] > q[m])) m = k;
  return m;
};

export class Learner {
  constructor() {
    this.online = new MLP([GROUPS.length * 4, 16, 12, 4], 0.002);
    this.target = new MLP(this.online.sizes);
    this.reset();
  }

  reset() {
    this.online.init();
    this.target.copyFrom(this.online);
    this.buffer = [];
    this.steps = 0;
    this.gamma = 0.95;
    this.lastLoss = 0;
  }

  // Explore a lot at first, then mostly trust the network.
  epsilon() { return Math.max(0.03, 1 - this.steps / 3000); }

  act(f, mask, greedy = false) {
    const acts = this.online.forward(f);
    const q = acts[acts.length - 1];
    const explore = !greedy && Math.random() < this.epsilon();
    let a;
    if (explore) {
      const valid = [0, 1, 2, 3].filter(d => mask[d]);
      a = valid[Math.floor(Math.random() * valid.length)];
    } else a = argmaxValid(q, mask);
    return { a, q, acts, explore };
  }

  // Store one transition and take one training step on a random batch of old ones.
  observe(s, a, reward, s2, terminal) {
    this.buffer.push({ x: s.f, a, reward, x2: s2.f, mask2: s2.mask, terminal });
    if (this.buffer.length > 30000) this.buffer.splice(0, 1000);
    this.steps++;
    if (this.buffer.length < 200) return;
    const batch = [];
    for (let k = 0; k < 32; k++) {
      const t = this.buffer[Math.floor(Math.random() * this.buffer.length)];
      let target = t.reward;
      if (!t.terminal) {
        // Double DQN: the online net picks the next move, the slow target net values it
        const next = argmaxValid(this.online.q(t.x2), t.mask2);
        target += this.gamma * this.target.q(t.x2)[next];
      }
      batch.push({ x: t.x, a: t.a, target });
    }
    this.lastLoss = this.online.trainQ(batch);
    if (this.steps % 300 === 0) this.target.copyFrom(this.online);
  }
}
