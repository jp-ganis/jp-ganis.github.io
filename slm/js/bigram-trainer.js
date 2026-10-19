// A bigram model trained with Adam, small enough to run in the browser.
// The model is a V x V table of logits; row i is the prediction after token i.
// Shared by the Step 05 demo (and testable in Node).

(function (global) {
  function createTrainer({ vocab, train, val }, { lr = 0.03, batch = 512, seed = 1 } = {}) {
    const V = vocab.length;
    let rand = mulberry32(seed);

    // Sampling a training position == sampling a pair in proportion to its count.
    const flat = train.flat();
    const cum = new Float64Array(flat.length);
    flat.reduce((acc, c, k) => (cum[k] = acc + c), 0);
    const total = cum[cum.length - 1];
    const valTotal = val.flat().reduce((a, b) => a + b, 0);

    let W, m, v, t;
    function reset() {
      rand = mulberry32(seed);
      W = Float64Array.from({ length: V * V }, () => gauss(rand));
      m = new Float64Array(V * V);
      v = new Float64Array(V * V);
      t = 0;
    }
    reset();

    function rowProbs(i, out = new Float64Array(V)) {
      let max = -Infinity;
      for (let j = 0; j < V; j++) max = Math.max(max, W[i * V + j]);
      let sum = 0;
      for (let j = 0; j < V; j++) sum += (out[j] = Math.exp(W[i * V + j] - max));
      for (let j = 0; j < V; j++) out[j] /= sum;
      return out;
    }

    function samplePair() {
      const r = rand() * total;
      let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] > r) hi = mid; else lo = mid + 1; }
      return [Math.floor(lo / V), lo % V];
    }

    // One training step: forward on a mini-batch, backward, Adam update.
    function step() {
      const grad = new Float64Array(V * V);
      const p = new Float64Array(V);
      let loss = 0;
      for (let b = 0; b < batch; b++) {
        const [i, j] = samplePair();
        rowProbs(i, p);
        loss -= Math.log(p[j]);
        // d(-log softmax_j)/d(logit_k) = p_k - [k == j]
        for (let k = 0; k < V; k++) grad[i * V + k] += (p[k] - (k === j)) / batch;
      }
      t++;
      const b1 = 0.9, b2 = 0.999, eps = 1e-8;
      for (let k = 0; k < V * V; k++) {
        m[k] = b1 * m[k] + (1 - b1) * grad[k];
        v[k] = b2 * v[k] + (1 - b2) * grad[k] * grad[k];
        const mh = m[k] / (1 - b1 ** t), vh = v[k] / (1 - b2 ** t);
        W[k] -= api.lr * mh / (Math.sqrt(vh) + eps);
      }
      return loss / batch;
    }

    // Exact loss on the held-out text, straight from its pair counts.
    function valLoss() {
      let loss = 0;
      const p = new Float64Array(V);
      for (let i = 0; i < V; i++) {
        rowProbs(i, p);
        for (let j = 0; j < V; j++) if (val[i][j]) loss -= val[i][j] * Math.log(p[j]);
      }
      return loss / valTotal;
    }

    function sample(n, start = vocab.indexOf("\n")) {
      let i = start, out = "";
      const p = new Float64Array(V);
      for (let k = 0; k < n; k++) {
        rowProbs(i, p);
        let r = Math.random(), j = 0;
        while (j < V - 1 && (r -= p[j]) > 0) j++;
        out += vocab[(i = j)];
      }
      return out;
    }

    const api = { lr, step, valLoss, sample, reset, get steps() { return t; } };
    return api;
  }

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gauss(rand) {
    return Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
  }

  if (typeof module !== "undefined") module.exports = { createTrainer };
  else global.createTrainer = createTrainer;
})(this);
