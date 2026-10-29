// A tiny fully-connected network trained with Adam.
// ReLU hidden layers, linear outputs: one Q-value (expected future reward) per move.

export class MLP {
  constructor(sizes, lr = 0.003) {
    this.sizes = sizes;
    this.lr = lr;
    this.init();
  }

  init() {
    const s = this.sizes;
    this.W = []; this.b = [];
    this.mW = []; this.vW = []; this.mb = []; this.vb = [];
    this.delta = []; // |change| per weight since the view last read it, for the glow
    for (let l = 0; l < s.length - 1; l++) {
      const nIn = s[l], nOut = s[l + 1];
      const W = new Float32Array(nIn * nOut);
      const scale = Math.sqrt(2 / nIn) * (l === s.length - 2 ? 0.3 : 1);
      for (let i = 0; i < W.length; i++) W[i] = gauss() * scale;
      this.W.push(W);
      this.b.push(new Float32Array(nOut).fill(l < s.length - 2 ? 0.05 : 0));
      this.mW.push(new Float32Array(W.length)); this.vW.push(new Float32Array(W.length));
      this.mb.push(new Float32Array(nOut)); this.vb.push(new Float32Array(nOut));
      this.delta.push(new Float32Array(W.length));
    }
    this.t = 0;
  }

  copyFrom(other) {
    for (let l = 0; l < this.W.length; l++) { this.W[l].set(other.W[l]); this.b[l].set(other.b[l]); }
  }

  // Returns activations per layer: [input, hidden..., outputs]
  forward(x) {
    const acts = [x instanceof Float32Array ? x : Float32Array.from(x)];
    const L = this.W.length;
    for (let l = 0; l < L; l++) {
      const nIn = this.sizes[l], nOut = this.sizes[l + 1];
      const W = this.W[l], b = this.b[l], a = acts[l];
      const z = new Float32Array(nOut);
      for (let j = 0; j < nOut; j++) {
        let sum = b[j];
        const row = j * nIn;
        for (let i = 0; i < nIn; i++) sum += W[row + i] * a[i];
        z[j] = l < L - 1 ? Math.max(0, sum) : sum;
      }
      acts.push(z);
    }
    return acts;
  }

  q(x) { const acts = this.forward(x); return acts[acts.length - 1]; }

  // One Adam step pulling Q(x, a) towards `target` for each {x, a, target}.
  // Huber loss: errors beyond ±1 count linearly, so one surprise can't blow up the weights.
  trainQ(batch) {
    const L = this.W.length;
    const gW = this.W.map(w => new Float32Array(w.length));
    const gb = this.b.map(b => new Float32Array(b.length));
    let loss = 0;

    for (const { x, a, target } of batch) {
      const acts = this.forward(x);
      const err = acts[L][a] - target;
      loss += Math.abs(err) < 1 ? 0.5 * err * err : Math.abs(err) - 0.5;
      let d = new Float32Array(this.sizes[L]);
      d[a] = Math.max(-1, Math.min(1, err));

      for (let l = L - 1; l >= 0; l--) {
        const nIn = this.sizes[l], nOut = this.sizes[l + 1];
        const act = acts[l], W = this.W[l];
        const dPrev = new Float32Array(nIn);
        for (let j = 0; j < nOut; j++) {
          const dj = d[j];
          if (dj === 0) continue;
          gb[l][j] += dj;
          const row = j * nIn;
          for (let i = 0; i < nIn; i++) {
            gW[l][row + i] += dj * act[i];
            dPrev[i] += dj * W[row + i];
          }
        }
        if (l > 0) for (let i = 0; i < nIn; i++) if (act[i] <= 0) dPrev[i] = 0;
        d = dPrev;
      }
    }

    this.t++;
    const n = batch.length, b1 = 0.9, b2 = 0.999, eps = 1e-8;
    const c1 = 1 - Math.pow(b1, this.t), c2 = 1 - Math.pow(b2, this.t);
    for (let l = 0; l < L; l++) {
      adam(this.W[l], gW[l], this.mW[l], this.vW[l], n, this.lr, b1, b2, c1, c2, eps, this.delta[l]);
      adam(this.b[l], gb[l], this.mb[l], this.vb[l], n, this.lr, b1, b2, c1, c2, eps, null);
    }
    return loss / n;
  }
}

function adam(p, g, m, v, n, lr, b1, b2, c1, c2, eps, delta) {
  for (let i = 0; i < p.length; i++) {
    const gi = g[i] / n;
    m[i] = b1 * m[i] + (1 - b1) * gi;
    v[i] = b2 * v[i] + (1 - b2) * gi * gi;
    const step = lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + eps);
    p[i] -= step;
    if (delta) delta[i] += Math.abs(step);
  }
}

function gauss() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
