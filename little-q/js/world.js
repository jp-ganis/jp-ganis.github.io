// Procedural top-down screens and their pixel-art renderer.

export const W = 21, H = 15, TILE = 16;
export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // up, right, down, left
export const T = { GRASS: 0, FLOWER: 1, PATH: 2, TALL: 3, TREE: 4, BUSH: 5, HOUSE: 6, WATER: 7, FENCE: 8 };

export const walkable = t => t >= 0 && t <= T.TALL;
export const idx = (x, y) => y * W + x;
export const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function sideTile(side, pos) {
  if (side === 0) return { x: pos, y: 0 };
  if (side === 1) return { x: W - 1, y: pos };
  if (side === 2) return { x: pos, y: H - 1 };
  return { x: 0, y: pos };
}
const sideRange = side => (side % 2 === 0 ? [2, W - 3] : [2, H - 3]);
const inward = side => (side + 2) % 4;

export function generate(entrySide, entryPos) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const world = tryGenerate(entrySide, entryPos, Math.max(0.3, 1 - attempt * 0.05), attempt < 60);
    if (world) return world;
  }
  throw new Error('could not generate a connected screen');
}

function tryGenerate(entrySide, entryPos, density, requireAlt) {
  const tiles = new Int8Array(W * H).fill(T.GRASS);
  const reserved = new Uint8Array(W * H);
  const seed = Array.from({ length: W * H }, () => Math.random());

  for (let x = 0; x < W; x++) { tiles[idx(x, 0)] = T.TREE; tiles[idx(x, H - 1)] = T.TREE; }
  for (let y = 0; y < H; y++) { tiles[idx(0, y)] = T.TREE; tiles[idx(W - 1, y)] = T.TREE; }

  const exitSide = pick([0, 1, 2, 3].filter(s => s !== entrySide));
  const [lo, hi] = sideRange(exitSide);
  const entry = { ...sideTile(entrySide, entryPos), side: entrySide };
  const exit = { ...sideTile(exitSide, rint(lo, hi)), side: exitSide };

  for (const e of [entry, exit]) {
    tiles[idx(e.x, e.y)] = T.GRASS;
    const d = e === entry ? inward(e.side) : inward(e.side);
    for (let k = 0; k < 2; k++) {
      const x = e.x + DX[d] * k, y = e.y + DY[d] * k;
      if (inside(x, y)) reserved[idx(x, y)] = 1;
    }
  }

  const free = (x, y) => inside(x, y) && tiles[idx(x, y)] === T.GRASS && !reserved[idx(x, y)];
  const interior = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1;

  // Houses: a two-row roof over one or two rows of wall, door on the bottom row.
  const houses = [];
  const nHouses = Math.round(rint(3, 6) * density);
  for (let n = 0; n < nHouses; n++) {
    for (let tries = 0; tries < 40; tries++) {
      const w = pick([2, 2, 3, 3, 4]), h = pick([2, 2, 3]);
      const x = rint(1, W - 1 - w), y = rint(1, H - 2 - h);
      let ok = true;
      for (let yy = y - 1; yy <= y + h && ok; yy++)
        for (let xx = x - 1; xx <= x + w && ok; xx++)
          if (inside(xx, yy) && interior(xx, yy) && !free(xx, yy)) ok = false;
      if (!ok) continue;
      const doorX = x + (w <= 2 ? rint(0, 1) : rint(1, w - 2));
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++) tiles[idx(xx, yy)] = T.HOUSE;
      reserved[idx(doorX, y + h)] = 1;
      houses.push({ x, y, w, h, doorX, roof: pick(ROOFS) });
      break;
    }
  }

  // Ponds
  for (let n = Math.random() < 0.5 * density + 0.15 ? rint(1, 2) : 0; n > 0; n--) {
    const cx = rint(3, W - 4), cy = rint(3, H - 4);
    const rx = 1 + Math.random() * 1.1, ry = 0.8 + Math.random() * 0.7;
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const v = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (v < 1 + (Math.random() - 0.5) * 0.4 && free(x, y)) tiles[idx(x, y)] = T.WATER;
      }
  }

  // Fences
  for (let n = rint(0, 2); n > 0; n--) {
    const len = rint(2, 4), y = rint(2, H - 3), x0 = rint(1, W - 1 - len);
    for (let x = x0; x < x0 + len; x++) if (free(x, y)) tiles[idx(x, y)] = T.FENCE;
  }

  // Bushes and the odd lone tree, as short random walks
  const walkPlace = (type, count, minLen, maxLen) => {
    for (let n = 0; n < count; n++) {
      let x = rint(1, W - 2), y = rint(1, H - 2);
      const len = rint(minLen, maxLen);
      for (let k = 0; k < len; k++) {
        if (free(x, y)) tiles[idx(x, y)] = type;
        const d = rint(0, 3);
        if (interior(x + DX[d], y + DY[d])) { x += DX[d]; y += DY[d]; }
      }
    }
  };
  walkPlace(T.BUSH, Math.round(rint(10, 16) * density), 1, 2);
  walkPlace(T.TREE, Math.round(rint(3, 6) * density), 1, 1);

  // Walkable decoration
  walkPlace(T.TALL, rint(3, 6), 6, 16);
  for (let n = rint(10, 20); n > 0; n--) {
    const x = rint(1, W - 2), y = rint(1, H - 2);
    if (tiles[idx(x, y)] === T.GRASS) tiles[idx(x, y)] = T.FLOWER;
  }

  const dist = distanceMap(tiles, exit);
  if (dist[idx(entry.x, entry.y)] === Infinity) return null;
  if (requireAlt && !hasDetour(tiles, entry, exit, dist)) return null;

  // A meandering dirt path from entry to exit, plus spurs to front doors.
  const noise = Array.from({ length: W * H }, () => Math.random() * 3);
  const cost = i => 1 + noise[i] + (tiles[i] === T.TALL ? 2 : 0);
  const carve = path => path.forEach(i => { if (walkable(tiles[i])) tiles[i] = T.PATH; });
  carve(dijkstra(tiles, idx(entry.x, entry.y), i => i === idx(exit.x, exit.y), cost));
  for (const h of houses) {
    if (Math.random() < 0.75) {
      const start = idx(h.doorX, h.y + h.h);
      if (walkable(tiles[start]))
        carve(dijkstra(tiles, start, i => tiles[i] === T.PATH && i !== start, cost));
    }
  }

  return { tiles, seed, houses, entry, exit, dist: distanceMap(tiles, exit) };
}

// BFS distance (in steps) from every tile to the exit.
export function distanceMap(tiles, exit) {
  const dist = new Float32Array(W * H).fill(Infinity);
  const start = idx(exit.x, exit.y);
  dist[start] = 0;
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % W, y = (i / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (!inside(nx, ny)) continue;
      const j = idx(nx, ny);
      if (walkable(tiles[j]) && dist[j] === Infinity) { dist[j] = dist[i] + 1; queue.push(j); }
    }
  }
  return dist;
}

// True if blocking the middle of the shortest route still leaves a way to the exit,
// so every screen offers at least two genuinely different routes.
function hasDetour(tiles, entry, exit, dist) {
  const route = [];
  let x = entry.x, y = entry.y;
  while (dist[idx(x, y)] > 0) {
    const d = [0, 1, 2, 3].find(d => inside(x + DX[d], y + DY[d]) && dist[idx(x + DX[d], y + DY[d])] === dist[idx(x, y)] - 1);
    x += DX[d]; y += DY[d];
    route.push(idx(x, y));
  }
  const middle = route.slice(2, -3);
  if (!middle.length) return true;
  const blocked = Int8Array.from(tiles);
  for (const i of middle) blocked[i] = T.BUSH;
  return distanceMap(blocked, exit)[idx(entry.x, entry.y)] !== Infinity;
}

function dijkstra(tiles, start, isGoal, cost) {
  const best = new Float32Array(W * H).fill(Infinity);
  const from = new Int32Array(W * H).fill(-1);
  const open = [[0, start]];
  best[start] = 0;
  while (open.length) {
    let m = 0;
    for (let k = 1; k < open.length; k++) if (open[k][0] < open[m][0]) m = k;
    const [c, i] = open.splice(m, 1)[0];
    if (c > best[i]) continue;
    if (isGoal(i)) {
      const path = [];
      for (let p = i; p !== -1; p = from[p]) path.push(p);
      return path;
    }
    const x = i % W, y = (i / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (!inside(nx, ny)) continue;
      const j = idx(nx, ny);
      if (!walkable(tiles[j])) continue;
      const nc = c + cost(j);
      if (nc < best[j]) { best[j] = nc; from[j] = i; open.push([nc, j]); }
    }
  }
  return [];
}

export function nextEntry(exit) {
  const side = inward(exit.side);
  return { side, pos: exit.side % 2 === 0 ? exit.x : exit.y };
}

// ---------- rendering ----------

const ROOFS = [
  ['#d9553f', '#a83a2c', '#f08a6c'],
  ['#4a78d0', '#2f539c', '#7fa6ec'],
  ['#8d5cc4', '#643d93', '#b791e3'],
  ['#d9902f', '#a8661c', '#f2bd6a'],
  ['#3f9e86', '#2a7262', '#76cbb3'],
];

const C = {
  grass: '#86cf68', grassLo: '#6db552', grassHi: '#a8e486',
  tall: '#4f9d3f', tallLo: '#2f6e2b', tallHi: '#86cf68',
  path: '#e6cf9a', pathLo: '#cdb27a', pathHi: '#f3e2b8',
  leaf: '#2f8a3e', leafLo: '#1d6230', leafHi: '#5ec05b', trunk: '#7a5230',
  bush: '#3f9d4b', bushLo: '#2a7337', bushHi: '#74d06c',
  water: '#4b9fe6', waterLo: '#367fc2', waterHi: '#b3dcff',
  wood: '#b98250', woodLo: '#6d4520',
  wall: '#f3ead6', wallLo: '#cdbf9f', glass: '#7cc3f0', glassHi: '#d6f0ff',
  ink: '#1f1d26',
};

export class Renderer {
  constructor(canvas, scale = 3) {
    this.canvas = canvas;
    this.S = scale;
    canvas.width = W * TILE * scale;
    canvas.height = H * TILE * scale;
    this.ctx = canvas.getContext('2d');
    this.bg = document.createElement('canvas');
    this.bg.width = canvas.width; this.bg.height = canvas.height;
    this.fg = document.createElement('canvas'); // tall-grass tops drawn over the player
    this.fg.width = canvas.width; this.fg.height = canvas.height;
  }

  build(world) {
    const ctx = this.bg.getContext('2d');
    const fctx = this.fg.getContext('2d');
    fctx.clearRect(0, 0, this.fg.width, this.fg.height);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) this.tile(ctx, world, x, y);
    for (const h of world.houses) this.house(ctx, h);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (world.tiles[idx(x, y)] === T.TALL) this.tallTop(fctx, x, y, world.seed[idx(x, y)]);
  }

  px(ctx, x0, y0) {
    const S = this.S;
    return (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect((x0 + x) * S, (y0 + y) * S, w * S, h * S); };
  }

  tile(ctx, world, x, y) {
    const t = world.tiles[idx(x, y)];
    const s = world.seed[idx(x, y)];
    const p = this.px(ctx, x * TILE, y * TILE);
    const rng = mulberry(Math.floor(s * 1e9));

    const grass = () => {
      p(0, 0, 16, 16, C.grass);
      for (let k = 0; k < 3; k++) {
        const bx = Math.floor(rng() * 14), by = Math.floor(rng() * 13) + 1;
        p(bx, by, 1, 2, C.grassLo); p(bx + 1, by - 1, 1, 2, C.grassLo);
      }
      if (rng() < 0.5) p(Math.floor(rng() * 15), Math.floor(rng() * 15), 1, 1, C.grassHi);
    };

    switch (t) {
      case T.GRASS: grass(); break;
      case T.FLOWER: {
        grass();
        const petal = ['#ff6b6b', '#ffd94a', '#ffffff', '#ff9ad5'][Math.floor(s * 4)];
        const spots = [[3, 3], [10, 9], [9, 2]];
        for (let k = 0; k < 2; k++) {
          const [fx, fy] = spots[(Math.floor(s * 10) + k) % 3];
          p(fx + 1, fy, 1, 1, petal); p(fx, fy + 1, 1, 1, petal); p(fx + 2, fy + 1, 1, 1, petal);
          p(fx + 1, fy + 2, 1, 1, petal); p(fx + 1, fy + 1, 1, 1, '#f2a516');
        }
        break;
      }
      case T.PATH: {
        p(0, 0, 16, 16, C.path);
        for (let k = 0; k < 5; k++) p(Math.floor(rng() * 15), Math.floor(rng() * 15), 1, 1, C.pathLo);
        for (let k = 0; k < 2; k++) p(Math.floor(rng() * 15), Math.floor(rng() * 15), 1, 1, C.pathHi);
        // soften edges against non-path neighbours
        const edge = (nx, ny) => inside(nx, ny) && world.tiles[idx(nx, ny)] !== T.PATH && walkable(world.tiles[idx(nx, ny)]);
        if (edge(x, y - 1)) p(0, 0, 16, 1, C.pathLo);
        if (edge(x, y + 1)) p(0, 15, 16, 1, C.pathLo);
        if (edge(x - 1, y)) p(0, 0, 1, 16, C.pathLo);
        if (edge(x + 1, y)) p(15, 0, 1, 16, C.pathLo);
        break;
      }
      case T.TALL: {
        p(0, 0, 16, 16, C.tall);
        for (const [tx, ty] of [[1, 2], [9, 1], [5, 9], [12, 10]]) tuft(p, tx, ty + 4);
        break;
      }
      case T.TREE: {
        grass();
        p(6, 12, 4, 4, C.trunk); p(6, 12, 1, 4, C.woodLo);
        disc(p, 8, 7, 7.2, (dx, dy) => (dx + dy > 5 ? C.leafLo : dx + dy < -5 ? C.leafHi : C.leaf));
        p(4, 4, 2, 1, C.leafHi); p(3, 5, 1, 2, C.leafHi);
        break;
      }
      case T.BUSH: {
        grass();
        disc(p, 8, 9, 6.3, (dx, dy) => (dx + dy > 4 ? C.bushLo : dx + dy < -4 ? C.bushHi : C.bush));
        p(5, 7, 1, 1, C.bushHi); p(10, 11, 1, 1, C.bushLo);
        if (s < 0.3) { p(6, 10, 1, 1, '#e8402a'); p(10, 7, 1, 1, '#e8402a'); }
        break;
      }
      case T.WATER: {
        p(0, 0, 16, 16, C.water);
        const wet = (nx, ny) => inside(nx, ny) && world.tiles[idx(nx, ny)] === T.WATER;
        if (!wet(x, y - 1)) p(0, 0, 16, 2, C.waterLo);
        if (!wet(x - 1, y)) p(0, 0, 2, 16, C.waterLo);
        p(3, 5, 4, 1, C.waterHi); p(9, 10, 4, 1, C.waterHi); p(10, 3, 2, 1, C.waterHi);
        break;
      }
      case T.FENCE: {
        grass();
        p(0, 5, 16, 2, C.wood); p(0, 10, 16, 2, C.wood); p(0, 7, 16, 1, C.woodLo); p(0, 12, 16, 1, C.woodLo);
        for (const fx of [2, 11]) { p(fx, 2, 3, 12, C.wood); p(fx + 2, 2, 1, 12, C.woodLo); p(fx, 2, 3, 1, C.pathHi); }
        break;
      }
      default: grass();
    }
  }

  house(ctx, h) {
    const p = this.px(ctx, h.x * TILE, h.y * TILE);
    const w = h.w * TILE, hh = h.h * TILE, roofH = (h.h - 1) * TILE - 2;
    const [roof, roofLo, roofHi] = h.roof;
    p(0, roofH, w, hh - roofH, C.wall);
    p(0, hh - 3, w, 3, C.wallLo);
    p(-1, 0, w + 2, roofH, roof);
    for (let y = 4; y < roofH; y += 5) p(-1, y, w + 2, 1, roofLo);
    p(-1, 0, w + 2, 2, roofHi);
    p(-1, roofH - 2, w + 2, 2, roofLo);
    p(-1, -1, w + 2, 1, C.ink); p(-2, 0, 1, roofH, C.ink); p(w + 1, 0, 1, roofH, C.ink);
    p(-1, roofH, w + 2, 1, C.ink);
    p(0, roofH, 1, hh - roofH, C.ink); p(w - 1, roofH, 1, hh - roofH, C.ink);
    const wallTop = roofH + 1, wallH = hh - roofH - 1;
    for (let cx = 0; cx < h.w; cx++) {
      const ox = cx * TILE;
      if (h.x + cx === h.doorX) {
        p(ox + 4, hh - 12, 8, 12, C.ink); p(ox + 5, hh - 11, 6, 11, '#8a5a32');
        p(ox + 5, hh - 11, 6, 1, '#a8743f'); p(ox + 9, hh - 5, 1, 1, '#f2c14e');
      } else if (wallH >= 10) {
        const wy = wallTop + Math.max(2, Math.floor(wallH / 2) - 5);
        p(ox + 3, wy, 10, 8, C.ink); p(ox + 4, wy + 1, 8, 6, C.glass);
        p(ox + 4, wy + 1, 3, 2, C.glassHi); p(ox + 8, wy + 1, 1, 6, C.ink);
      }
    }
  }

  tallTop(ctx, x, y) {
    const p = this.px(ctx, x * TILE, y * TILE);
    for (const [tx, ty] of [[1, 10], [6, 11], [11, 10]]) tuft(p, tx, ty);
  }

  // Draw the scene. `overlays` is a callback for paths drawn between ground and player.
  // `under` draws between ground and sprites, `over` on top of everything.
  draw(player, enemies, under, over) {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.bg, 0, 0);
    under?.(ctx);
    const S = this.S;
    const hideLegs = (px, py) => {
      const sx = Math.round(px * TILE) * S, sy = Math.round(py * TILE) * S;
      ctx.drawImage(this.fg, sx, sy + 9 * S, TILE * S, 7 * S, sx, sy + 9 * S, TILE * S, 7 * S);
    };
    for (const e of enemies) { this.enemy(ctx, e); hideLegs(e.px, e.py); }
    if (player.visible !== false) { this.sprite(ctx, player); hideLegs(player.px, player.py); }
    over?.(ctx);
  }

  enemy(ctx, e) {
    const S = this.S, frames = e.type === 'beetle' ? BEETLE : SLIME;
    const rows = frames[e.frame % 2];
    const flip = e.dir === 3;
    const x0 = Math.round(e.px * TILE), y0 = Math.round(e.py * TILE);
    ctx.fillStyle = 'rgba(20,30,20,0.25)';
    ctx.fillRect((x0 + 3) * S, (y0 + 14) * S, 10 * S, 2 * S);
    for (let r = 0; r < 16; r++) {
      const row = rows[r];
      for (let c = 0; c < 16; c++) {
        const ch = row[flip ? 15 - c : c];
        if (ch === '.') continue;
        ctx.fillStyle = MOB_PAL[ch];
        ctx.fillRect((x0 + c) * S, (y0 + r) * S, S, S);
      }
    }
  }

  sprite(ctx, pl) {
    const S = this.S;
    const frames = pl.dir === 0 ? SPR.up : pl.dir === 2 ? SPR.down : SPR.side;
    let rows = frames.slice(0, 14);
    const legs = pl.walking ? (pl.step % 2 ? frames.slice(16, 18) : frames.slice(18, 20)) : frames.slice(14, 16);
    rows = rows.concat(legs);
    const flip = pl.dir === 3;
    const bob = pl.walking && pl.step % 2 ? -1 : 0;
    const x0 = Math.round(pl.px * TILE), y0 = Math.round(pl.py * TILE) + bob;
    ctx.fillStyle = 'rgba(20,30,20,0.25)';
    ctx.fillRect((x0 + 3) * S, (y0 - bob + 14) * S, 10 * S, 2 * S);
    for (let r = 0; r < 16; r++) {
      const row = rows[r];
      for (let c = 0; c < 16; c++) {
        const ch = row[flip ? 15 - c : c];
        if (ch === '.') continue;
        ctx.fillStyle = PAL[ch];
        ctx.fillRect((x0 + c) * S, (y0 + r) * S, S, S);
      }
    }
  }
}

function tuft(p, x, y) {
  p(x, y, 1, 2, C.tallLo); p(x + 1, y - 2, 1, 3, C.tallLo); p(x + 2, y - 1, 1, 2, C.tallLo);
  p(x + 3, y - 2, 1, 3, C.tallLo); p(x + 4, y, 1, 2, C.tallLo);
  p(x + 1, y - 2, 1, 1, C.tallHi); p(x + 3, y - 2, 1, 1, C.tallHi);
}

function disc(p, cx, cy, r, color) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) p(x, y, 1, 1, d2 > (r - 1) * (r - 1) ? C.ink : color(dx, dy));
    }
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PAL = {
  k: '#1f1d26', h: '#4a2f24', s: '#f7c99b', e: '#1f1d26',
  r: '#e8402a', t: '#2f7fb5', p: '#34344a', b: '#5a3a26',
};

// 14 body rows, then 2 standing leg rows, then two 2-row walking variants.
const SPR = {
  down: [
    '......kkkk......', '....kkhhhhkk....', '...khhhhhhhhk...', '...khhhhhhhhk...',
    '..khhsssssshhk..', '..khsesssseshk..', '...kssssssssk...', '...krrrrrrrrk...',
    '..ktrrrrrrrrtk..', '.ksttttttttttsk.', '.kkttttttttttkk.', '...kttttttttk...',
    '...kppppppppk...', '..kppppkkppppk..',
    '..kbbbk..kbbbk..', '..kkkkk..kkkkk..',
    '..kbbbk...kkk...', '..kkkkk.........',
    '...kkk...kbbbk..', '.........kkkkk..',
  ],
  up: [
    '......kkkk......', '....kkhhhhkk....', '...khhhhhhhhk...', '...khhhhhhhhk...',
    '..khhhhhhhhhhk..', '..khhhhhhhhhhk..', '...khhhhhhhhk...', '...krrrrrrrrk...',
    '..ktrrrrrrrrtk..', '.ksttttrrttttsk.', '.kkttttrrttttkk.', '...kttttttttk...',
    '...kppppppppk...', '..kppppkkppppk..',
    '..kbbbk..kbbbk..', '..kkkkk..kkkkk..',
    '..kbbbk...kkk...', '..kkkkk.........',
    '...kkk...kbbbk..', '.........kkkkk..',
  ],
  side: [
    '......kkkk......', '....kkhhhhkk....', '...khhhhhhhhk...', '...khhhhhhhhk...',
    '...khhhhsssssk..', '...khhhsssesk...', '....ksssssssk...', '....krrrrrrrk...',
    '...krrrtttttk...', '...krkttttstk...', '....kttttttk....', '....kttttttk....',
    '....kppppppk....', '....kppkkppk....',
    '....kbbkkbbk....', '....kkkkkkkk....',
    '...kbbk..kbbk...', '...kkkk..kkkk...',
    '.....kbbbbk.....', '.....kkkkkk.....',
  ],
};

const MOB_PAL = {
  k: '#1f1d26', g: '#62b8ff', G: '#2f6fcf', w: '#e8f6ff',
  r: '#e04848', R: '#9c2a2a', h: '#3a2a30', s: '#ffd0c0',
};

// Two-frame mobs: a hopping slime and a patrolling beetle.
const E = '................';
const SLIME = [
  [E, E, E, E,
    '......kkkk......', '....kkggggkk....', '...kgwwggggGk...', '..kgwggggggGGk..',
    '..kggkggkgggGk..', '..kggkggkgggGk..', '.kgggggggggggGk.', '.kggggggggggGGk.',
    '.kgggggggggGGGk.', '..kGGGGGGGGGGk..', '...kkkkkkkkkk...', E],
  [E, E, E, E, E,
    '......kkkk......', '...kkkggggkkk...', '..kgwwgggggggk..', '.kgwgkggkggggGk.',
    '.kgggkggkgggGGk.', 'kggggggggggggGGk', 'kgggggggggggGGGk', '.kGGGGGGGGGGGGk.',
    '..kkkkkkkkkkkk..', E, E],
];
const BEETLE = [
  [E, E, '......kkkk......', '.....khhhhk.....', '..k..khsshk..k..', '...kkkkkkkkkk...',
    '..krrrrkkrrrrk..', 'kkkrsrrkkrrsrkkk', '..krrrrkkrrrrk..', '..krrRrkkrRrrk..',
    'kkkrrrrkkrrrrkkk', '..kRrrrkkrrrRk..', '..kRRrrkkrrRRk..', '...kRRRkkRRRk...',
    '..k.kkkkkkkk.k..', E],
  [E, E, '......kkkk......', '.....khhhhk.....', '...k.khsshk.k...', '...kkkkkkkkkk...',
    '..krrrrkkrrrrk..', '.kkrsrrkkrrsrkk.', '..krrrrkkrrrrk..', '..krrRrkkrRrrk..',
    'kkkrrrrkkrrrrkkk', '..kRrrrkkrrrRk..', '..kRRrrkkrrRRk..', '...kRRRkkRRRk...',
    '.k..kkkkkkkk..k.', E],
];
