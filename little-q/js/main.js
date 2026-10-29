import { W, H, DX, DY, walkable, idx, TILE, Renderer } from './world.js';
import { Env, Learner, GROUPS } from './agent.js';
import { Net3D } from './net3d.js';

const $ = id => document.getElementById(id);
const env = new Env(+$('mobs').value);
const brain = new Learner();
const net = new Net3D($('net'), brain.online, GROUPS);
const view = new Renderer($('game'), 3);

// ms per step at each speed; turbo runs as many unrendered steps as fit in a frame
const SPEEDS = { 1: 190, 4: 55, 16: 12, turbo: 0 };
let speed = '4';
const WINDOW = 20;

// ---------- state ----------
let builtWorld = null;
let trail = [];
let episodes = [];          // {outcome, steps, optimal}
let curve = [];             // per run: rolling success rate and route efficiency
let totalSteps = 0;
let frozen = null;          // the last moment of a finished run, held briefly on screen
let pauseUntil = 0;
let effects = [];           // poofs and sparkles {kind, x, y, t0}
let lastTime = 0, acc = 0;
let lastAct = null;
let policy = null, policyAt = 0, learnedAt = 0, chartAt = 0;
const agent = { px: 0, py: 0, dir: 1, walking: false, step: 0, visible: true, fromX: 0, fromY: 0, t0: 0, dur: 0 };

function syncAgent() {
  agent.px = agent.fromX = env.x; agent.py = agent.fromY = env.y;
  agent.dir = env.prev; agent.walking = false; agent.dur = 0;
  for (const m of env.mobs) { m.fromX = m.x; m.fromY = m.y; }
  trail = [[env.x, env.y]];
}

// ---------- one step of the game ----------
function tick(now, animate) {
  const s = env.features();
  const act = brain.act(s.f, s.mask);
  const fromX = env.x, fromY = env.y;
  const { reward, outcome } = env.step(act.a);
  const s2 = env.features();
  brain.observe(s, act.a, reward, s2, outcome === 'exit' || outcome === 'caught');
  totalSteps++;
  lastAct = { ...act, mask: s.mask };
  trail.push([env.x, env.y]);

  agent.fromX = fromX; agent.fromY = fromY; agent.dir = act.a; agent.step++;
  agent.t0 = now; agent.dur = animate && speed !== '16' ? SPEEDS[speed] : 0;

  if (animate && speed !== '16') {
    if (speed === '1' || totalSteps % 2 === 0) net.forward(act.acts, normalise(act.q, s.mask));
    showQ(act, s.mask);
  }

  if (outcome) endRun(outcome, now, animate);
}

function endRun(outcome, now, animate) {
  episodes.push({ outcome, steps: env.steps, optimal: env.optimal });
  const last = episodes.slice(-WINDOW), ok = last.filter(e => e.outcome === 'exit');
  curve.push({
    success: ok.length / last.length,
    eff: ok.length ? ok.reduce((s, e) => s + e.optimal / e.steps, 0) / ok.length : null,
    outcome,
  });
  const hold = !animate ? 0 : speed === '1' ? 800 : speed === '4' ? 400 : 0;
  if (hold) {
    frozen = { x: env.x, y: env.y, mobs: env.mobs.map(m => ({ ...m, fromX: m.x, fromY: m.y })), outcome };
    pauseUntil = now + hold;
  }
  if (animate) { effects.push({ kind: outcome, x: env.x, y: env.y, t0: now }); flash(outcome); }

  if (outcome === 'exit') env.nextMap();
  else if (++env.fails >= 3) env.nextMap();
  else env.reset();
  if (!hold) syncAgent();
}

const normalise = (q, mask) => {
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < 4; k++) if (mask[k]) { lo = Math.min(lo, q[k]); hi = Math.max(hi, q[k]); }
  return Float32Array.from(q, (v, k) => (mask[k] ? (hi > lo ? 0.15 + 0.85 * (v - lo) / (hi - lo) : 1) : 0));
};

// ---------- main loop ----------
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(250, now - (lastTime || now));
  lastTime = now;

  if (frozen && now >= pauseUntil) { frozen = null; syncAgent(); }
  if (!frozen) {
    if (speed === 'turbo') {
      const t = performance.now();
      while (performance.now() - t < 12) tick(now, false);
      if (lastAct) showQ(lastAct, lastAct.mask);
    } else {
      acc += dt;
      const ms = SPEEDS[speed];
      for (let n = 0; acc >= ms && n < 8 && !frozen; n++) { acc -= ms; tick(now, true); }
      if (frozen) acc = 0;
    }
  }

  if (now - learnedAt > (speed === 'turbo' ? 400 : 200)) { net.learned(0.1); learnedAt = now; }
  if (now - policyAt > (speed === 'turbo' ? 300 : 120)) { policy = computePolicy(); policyAt = now; updateStats(); }
  if (now - chartAt > 500) { drawChart(); chartAt = now; }

  draw(now);
}

// ---------- drawing ----------
const S = 3, TS = TILE * S;
const center = ([x, y]) => [(x + 0.5) * TS, (y + 0.5) * TS];

function draw(now) {
  // while a finished run is held on screen, keep showing its map, agent and mobs
  if (!frozen && builtWorld !== env.world) { view.build(env.world); builtWorld = env.world; }
  const t = agent.dur ? Math.min(1, (now - agent.t0) / agent.dur) : 1;
  const ax = frozen ? frozen.x : env.x, ay = frozen ? frozen.y : env.y;
  agent.px = frozen ? ax : agent.fromX + (ax - agent.fromX) * t;
  agent.py = frozen ? ay : agent.fromY + (ay - agent.fromY) * t;
  agent.walking = !frozen && t < 1;
  agent.visible = !(frozen?.outcome === 'caught' && Math.floor(now / 90) % 2) && frozen?.outcome !== 'exit';
  const mobs = frozen ? frozen.mobs : env.mobs;
  for (const m of mobs) {
    const fx = m.fromX ?? m.x, fy = m.fromY ?? m.y;
    m.px = fx + (m.x - fx) * t; m.py = fy + (m.y - fy) * t;
  }

  view.draw(agent, mobs, ctx => {
    const { exit } = frozen ? builtWorld : env.world;
    const [ex, ey] = center([exit.x, exit.y]);
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(now / 250);
    ctx.fillStyle = '#fff6c9'; ctx.shadowColor = '#ffe36b'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(ex, ey, 8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if ($('show-policy').checked && policy && !frozen) drawPolicy(ctx);
    drawTrail(ctx);
  }, ctx => drawEffects(ctx, now));
}

function drawTrail(ctx) {
  if (trail.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
  ctx.shadowColor = '#fff'; ctx.shadowBlur = 6;
  ctx.beginPath();
  trail.forEach((p, k) => (k ? ctx.lineTo(...center(p)) : ctx.moveTo(...center(p))));
  ctx.stroke();
  ctx.restore();
}

// The network's favourite move from every tile, as if it were standing there right now.
function computePolicy() {
  const out = new Int8Array(W * H).fill(-1);
  const empty = new Uint8Array(W * H);
  const { tiles, exit } = env.world;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!walkable(tiles[idx(x, y)]) || (x === exit.x && y === exit.y) || env.mobAt(x, y)) continue;
      const { f, mask } = env.features(x, y, -1, empty);
      out[idx(x, y)] = brain.act(f, mask, true).a;
    }
  return out;
}

function drawPolicy(ctx) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < policy.length; i++) {
    const d = policy[i];
    if (d < 0) continue;
    const [cx, cy] = center([i % W, Math.floor(i / W)]);
    const ux = DX[d], uy = DY[d], L = TS * 0.22, hw = TS * 0.1;
    const tipX = cx + ux * L, tipY = cy + uy * L;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(cx - ux * L * 0.8, cy - uy * L * 0.8); ctx.lineTo(tipX, tipY);
      ctx.moveTo(tipX - ux * hw - uy * hw, tipY - uy * hw + ux * hw);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(tipX - ux * hw + uy * hw, tipY - uy * hw - ux * hw);
    };
    ctx.strokeStyle = 'rgba(20,18,26,0.45)'; ctx.lineWidth = 5; path(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,250,240,0.8)'; ctx.lineWidth = 2; path(); ctx.stroke();
  }
  ctx.restore();
}

function drawEffects(ctx, now) {
  effects = effects.filter(e => now - e.t0 < 700);
  for (const e of effects) {
    const t = (now - e.t0) / 700, [cx, cy] = center([e.x, e.y]);
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.lineWidth = 4;
    if (e.kind === 'caught') {
      ctx.strokeStyle = '#ff3b1f'; ctx.shadowColor = '#ff3b1f'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(cx, cy, 10 + t * 40, 0, Math.PI * 2); ctx.stroke();
    } else if (e.kind === 'exit') {
      ctx.fillStyle = '#ffe36b'; ctx.shadowColor = '#ffe36b'; ctx.shadowBlur = 20;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, r = 8 + t * 46;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
}

// ---------- UI ----------
function showQ(act, mask) {
  for (let d = 0; d < 4; d++) {
    const el = $(`p-${d}`);
    const v = act.q[d];
    el.querySelector('.num').textContent = mask[d] ? (v >= 0 ? '+' : '') + v.toFixed(2) : '—';
    el.querySelector('.bar').style.setProperty('--v', mask[d] ? Math.max(0, Math.min(1, (v + 2) / 4)) : 0);
    el.classList.toggle('best', d === act.a);
    el.classList.toggle('blocked', !mask[d]);
  }
  $('explore-badge').hidden = !act.explore;
}

function flash(outcome) {
  const el = $('verdict');
  el.textContent = { exit: 'Made it!', caught: 'Caught!', timeout: 'Out of time' }[outcome];
  el.className = `verdict ${outcome === 'exit' ? 'hit' : 'miss'}`;
  void el.offsetWidth;
  el.classList.add('show');
}

const pct = v => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);

function updateStats() {
  const last = episodes.slice(-WINDOW);
  const c = curve[curve.length - 1];
  $('s-success').textContent = last.length ? pct(c.success) : '—';
  $('s-eff').textContent = last.length ? pct(c.eff) : '—';
  $('s-caught').textContent = last.length ? pct(last.filter(e => e.outcome === 'caught').length / last.length) : '—';
  $('s-explore').textContent = pct(brain.epsilon());
  $('s-count').textContent = `${episodes.length} · ${totalSteps.toLocaleString()}`;
}

// Rolling success rate and route efficiency per run.
const chart = $('chart');
let chartHover = -1;
function drawChart() {
  const dpr = Math.min(devicePixelRatio, 2);
  const cw = chart.clientWidth, ch = chart.clientHeight;
  if (!cw) return;
  chart.width = cw * dpr; chart.height = ch * dpr;
  const ctx = chart.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const pad = { l: 38, r: 112, t: 10, b: 24 };
  const iw = cw - pad.l - pad.r, ih = ch - pad.t - pad.b;
  const n = curve.length;
  const X = i => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = v => pad.t + (1 - v) * ih;
  const css = getComputedStyle(document.body);

  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  ctx.strokeStyle = css.getPropertyValue('--rule'); ctx.fillStyle = css.getPropertyValue('--ink-3');
  ctx.lineWidth = 1;
  for (const v of [0, 0.5, 1]) {
    ctx.beginPath(); ctx.moveTo(pad.l, Y(v) + 0.5); ctx.lineTo(pad.l + iw, Y(v) + 0.5); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(pct(v), pad.l - 6, Y(v) + 4);
  }
  ctx.textAlign = 'left';
  ctx.fillText(n ? `run 1 → ${n}` : 'Waiting for the first run to finish', pad.l, ch - 6);
  if (!n) return;

  const series = [['eff', '#4a8fe0', 'Route efficiency'], ['success', '#f2553a', 'Success rate']];
  const ends = {};
  for (const [key, color] of series) {
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    curve.forEach((p, i) => {
      if (p[key] === null) { started = false; return; }
      started ? ctx.lineTo(X(i), Y(p[key])) : ctx.moveTo(X(i), Y(p[key]));
      started = true;
    });
    ctx.stroke();
    ends[key] = [...curve].reverse().find(p => p[key] !== null)?.[key];
  }
  // direct labels at the line ends, nudged apart if they collide
  const ys = series.map(([key]) => (ends[key] === undefined ? null : Y(ends[key]) + 4));
  if (ys[0] !== null && ys[1] !== null && Math.abs(ys[0] - ys[1]) < 13) {
    const mid = (ys[0] + ys[1]) / 2, up = ys[0] < ys[1] ? 0 : 1;
    ys[up] = mid - 7; ys[1 - up] = mid + 7;
  }
  ctx.fillStyle = css.getPropertyValue('--ink-2');
  series.forEach(([, , name], k) => ys[k] !== null && ctx.fillText(name, pad.l + iw + 8, ys[k]));

  const tip = $('chart-tip');
  if (chartHover >= 0 && chartHover < n) {
    const p = curve[chartHover], x = X(chartHover);
    ctx.strokeStyle = css.getPropertyValue('--ink-3'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 0.5, pad.t); ctx.lineTo(x + 0.5, pad.t + ih); ctx.stroke();
    tip.innerHTML = `<b>Run ${chartHover + 1}</b> · ${{ exit: 'made it', caught: 'caught', timeout: 'out of time' }[p.outcome]}<br>
      <i style="--c:#f2553a"></i>Success (last ${WINDOW}) ${pct(p.success)}<br>
      <i style="--c:#4a8fe0"></i>Route efficiency ${pct(p.eff)}`;
    tip.hidden = false;
    tip.style.left = `${Math.min(cw - tip.offsetWidth - 4, Math.max(4, x + 10))}px`;
  } else tip.hidden = true;
}

chart.addEventListener('pointermove', e => {
  const n = curve.length;
  if (!n) return;
  const r = chart.getBoundingClientRect();
  const iw = r.width - 38 - 112;
  chartHover = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left - 38) / iw) * (n - 1))));
  drawChart();
});
chart.addEventListener('pointerleave', () => { chartHover = -1; drawChart(); });
new ResizeObserver(drawChart).observe(chart);

// ---------- controls ----------
document.querySelectorAll('.speed button').forEach(btn => btn.addEventListener('click', () => {
  speed = btn.dataset.speed;
  document.querySelectorAll('.speed button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
  acc = 0;
}));

$('mobs').addEventListener('input', e => {
  $('mobs-n').textContent = e.target.value;
  env.setMobCount(+e.target.value);
  for (const m of env.mobs) { m.fromX = m.x; m.fromY = m.y; }
});

function restart() {
  frozen = null; pauseUntil = 0;
  syncAgent();
}

$('new-map').addEventListener('click', () => {
  env.newMap(Math.floor(Math.random() * 4), 4);
  restart();
});

$('reset').addEventListener('click', () => {
  brain.reset();
  net.reset();
  episodes = []; curve = []; totalSteps = 0;
  env.newMap(3, Math.floor(H / 2));
  restart();
  updateStats(); drawChart();
});

// ---------- go ----------
syncAgent();
updateStats();
requestAnimationFrame(frame);
document.fonts?.ready.then(() => drawChart());
