// The toy model from Elhage et al. (2022): x' = ReLU(WᵀW x + b), trained with Adam.
// W is m × n (row-major); column i is feature i's direction in the hidden space.

(function (root) {
  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createModel({ n, m, seed = 1 }) {
    const rand = mulberry32(seed);
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
    const W = new Float64Array(m * n), b = new Float64Array(n);
    const std = Math.sqrt(2 / (n + m));
    for (let k = 0; k < W.length; k++) W[k] = gauss() * std;
    return {
      n, m, W, b, rand, step: 0,
      mW: new Float64Array(m * n), vW: new Float64Array(m * n),
      mb: new Float64Array(n), vb: new Float64Array(n),
    };
  }

  // Forward pass for one input; fills h (m) and returns z (pre-ReLU, n).
  function forward(model, x, h, z) {
    const { n, m, W, b } = model;
    for (let k = 0; k < m; k++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += W[k * n + j] * x[j];
      h[k] = s;
    }
    for (let i = 0; i < n; i++) {
      let s = b[i];
      for (let k = 0; k < m; k++) s += W[k * n + i] * h[k];
      z[i] = s;
    }
    return z;
  }

  // One Adam step on a fresh batch. p = feature probability (1 − sparsity).
  function trainStep(model, { p, importance, batch = 512, lr = 1e-2 }) {
    const { n, m, W, b, rand } = model;
    const gW = new Float64Array(m * n), gb = new Float64Array(n);
    const x = new Float64Array(n), h = new Float64Array(m), z = new Float64Array(n);
    const dz = new Float64Array(n), dh = new Float64Array(m);
    let loss = 0;

    for (let s = 0; s < batch; s++) {
      for (let j = 0; j < n; j++) x[j] = rand() < p ? rand() : 0;
      forward(model, x, h, z);
      for (let i = 0; i < n; i++) {
        const y = z[i] > 0 ? z[i] : 0, err = y - x[i];
        loss += importance[i] * err * err;
        dz[i] = z[i] > 0 ? 2 * importance[i] * err / batch : 0;
        gb[i] += dz[i];
      }
      // z = Wᵀh + b, h = Wx: W gets gradient through both uses.
      for (let k = 0; k < m; k++) {
        let s2 = 0;
        for (let i = 0; i < n; i++) { gW[k * n + i] += dz[i] * h[k]; s2 += W[k * n + i] * dz[i]; }
        dh[k] = s2;
      }
      for (let k = 0; k < m; k++) for (let j = 0; j < n; j++) gW[k * n + j] += dh[k] * x[j];
    }

    model.step++;
    const b1 = 0.9, b2 = 0.999, eps = 1e-8, t = model.step;
    const c1 = 1 - Math.pow(b1, t), c2 = 1 - Math.pow(b2, t);
    const adam = (P, G, M, V) => {
      for (let k = 0; k < P.length; k++) {
        M[k] = b1 * M[k] + (1 - b1) * G[k];
        V[k] = b2 * V[k] + (1 - b2) * G[k] * G[k];
        P[k] -= lr * (M[k] / c1) / (Math.sqrt(V[k] / c2) + eps);
      }
    };
    adam(W, gW, model.mW, model.vW);
    adam(b, gb, model.mb, model.vb);
    return loss / batch;
  }

  // Length of each feature's direction, ‖W_i‖.
  function featureNorms(model) {
    const { n, m, W } = model;
    return Array.from({ length: n }, (_, i) => {
      let s = 0;
      for (let k = 0; k < m; k++) s += W[k * n + i] ** 2;
      return Math.sqrt(s);
    });
  }

  // m / ‖W‖²_F: hidden dimensions spent per feature (Elhage et al., §7).
  function dimsPerFeature(model) {
    let s = 0;
    for (const w of model.W) s += w * w;
    return model.m / s;
  }

  root.ToyModel = { createModel, forward, trainStep, featureNorms, dimsPerFeature };
})(typeof window !== "undefined" ? window : globalThis);
