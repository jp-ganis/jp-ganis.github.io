// Figure 1: n features in 2 dimensions, trained live. Draws W's columns, WᵀW, and a probe.

(() => {
  const SVG = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(SVG, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.append(e);
    return e;
  };
  const T = window.ToyModel;
  const root = document.getElementById("toy");
  if (!root) return;

  const DENSITIES = [1, 0.5, 0.3, 0.2, 0.1, 0.05, 0.03, 0.02, 0.01, 0.005, 0.002];
  const STEPS = 4000, PER_FRAME = 30, M = 2;

  const pIn = root.querySelector("#p"), impIn = root.querySelector("#imp");
  const pVal = root.querySelector("#p-val"), impVal = root.querySelector("#imp-val");
  const nSeg = root.querySelector("#n-seg"), probeSeg = root.querySelector("#probe-seg");
  const plane = root.querySelector("#plane"), gram = root.querySelector("#gram");
  const bars = root.querySelector("#bars"), status = root.querySelector("#status");

  let n = 5, seed = 1, model, loss = NaN, probe = 0, running = false;

  const density = () => DENSITIES[+pIn.value];
  const importance = () => Array.from({ length: n }, (_, i) => Math.pow(+impIn.value, i));

  // Importance shade: one hue, most important darkest.
  const shade = i => `color-mix(in srgb, var(--accent) ${Math.round(100 - 65 * i / Math.max(1, n - 1))}%, var(--panel))`;
  const diverge = v => {
    const a = Math.round(Math.min(1, Math.abs(v)) * 100);
    return `color-mix(in srgb, ${v < 0 ? "var(--div-neg)" : "var(--div-pos)"} ${a}%, var(--div-mid))`;
  };

  // --- training loop --------------------------------------------------------

  // Every setting change trains a fresh model: warm-starting from dense weights
  // leaves dead features stuck at zero.
  function reset() {
    model = T.createModel({ n, m: M, seed: seed++ });
    probe = Math.min(probe, n - 1);
    buildProbe();
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  function tick() {
    const p = density(), imp = importance();
    for (let k = 0; k < PER_FRAME && model.step < STEPS; k++) {
      loss = T.trainStep(model, { p, importance: imp, lr: model.step < STEPS * 0.75 ? 1e-2 : 2e-3 });
    }
    draw();
    if (model.step < STEPS) requestAnimationFrame(tick);
    else running = false;
  }

  // --- drawing --------------------------------------------------------------

  const C = 160, R = 110;

  function drawPlane() {
    plane.replaceChildren();
    el("line", { class: "axis", x1: 10, x2: 310, y1: C, y2: C }, plane);
    el("line", { class: "axis", x1: C, x2: C, y1: 10, y2: 310 }, plane);
    el("circle", { class: "ring", cx: C, cy: C, r: R }, plane);
    const { W } = model;
    // Least important first, so important arrows sit on top.
    for (let i = n - 1; i >= 0; i--) {
      const x = W[i], y = W[n + i], len = Math.hypot(x, y);
      const g = el("g", { class: "feat" + (i === probe ? " probed" : "") }, plane);
      const tx = C + x * R, ty = C - y * R;
      el("line", { class: "arrow", x1: C, y1: C, x2: tx, y2: ty, style: `stroke:${shade(i)}` }, g);
      el("circle", { class: "tip-dot", cx: tx, cy: ty, r: 5, style: `fill:${shade(i)}` }, g);
      const off = len > 0.05 ? 16 / len : 0;
      el("text", { class: "lbl", x: tx + x * off, y: ty - y * off }, g).textContent = i + 1;
      el("title", {}, g).textContent = `Feature ${i + 1}: ‖W‖ = ${len.toFixed(2)}`;
    }
  }

  function drawGram() {
    gram.replaceChildren();
    const { W, b } = model;
    const size = Math.min(26, 190 / n), x0 = 24, y0 = 24, gap = 10;
    for (let i = 0; i < n; i++) {
      el("text", { x: x0 + i * size + size / 2, y: y0 - 10 }, gram).textContent = i + 1;
      el("text", { x: x0 - 10, y: y0 + i * size + size / 2 }, gram).textContent = i + 1;
      for (let j = 0; j < n; j++) {
        const v = W[i] * W[j] + W[n + i] * W[n + j];
        const r = el("rect", { x: x0 + j * size, y: y0 + i * size, width: size, height: size, rx: 3, style: `fill:${diverge(v)}` }, gram);
        el("title", {}, r).textContent = `W${i + 1} · W${j + 1} = ${v.toFixed(2)}`;
      }
      const r = el("rect", { x: x0 + n * size + gap, y: y0 + i * size, width: size, height: size, rx: 3, style: `fill:${diverge(b[i])}` }, gram);
      el("title", {}, r).textContent = `b${i + 1} = ${b[i].toFixed(2)}`;
    }
    el("text", { x: x0 + n * size + gap + size / 2, y: y0 - 10 }, gram).textContent = "b";
    gram.setAttribute("viewBox", `0 0 260 ${y0 + n * size + 4}`);
  }

  const XMIN = -1, XMAX = 1.5;
  const pct = v => (Math.max(XMIN, Math.min(XMAX, v)) - XMIN) / (XMAX - XMIN) * 100;

  function drawBars() {
    // Input e_probe: pre-activation z = (WᵀW)_{:,probe} + b, output ReLU(z).
    const x = new Float64Array(n); x[probe] = 1;
    const z = T.forward(model, x, new Float64Array(M), new Float64Array(n));
    bars.replaceChildren();
    for (let i = 0; i < n; i++) {
      const row = document.createElement("div");
      row.className = "bar-row" + (i === probe ? " on" : "");
      const v = Math.max(0, z[i]);
      const lo = pct(Math.min(0, z[i])), hi = pct(Math.max(0, z[i]));
      row.innerHTML =
        `<span class="k">x′${i + 1}</span>` +
        `<span class="track" style="background-position:${pct(0)}% 50%">` +
        `<span class="fill ${z[i] < 0 ? "clipped" : "out"}" style="left:${lo}%;width:${Math.max(hi - lo, 0.5)}%"></span></span>` +
        `<span class="v">${v.toFixed(2)}</span>`;
      row.title = `pre-activation ${z[i].toFixed(2)}, output ${v.toFixed(2)}`;
      bars.append(row);
    }
    if (!root.querySelector(".legend")) {
      bars.insertAdjacentHTML("afterend",
        `<ul class="legend"><li><span class="sw"></span>output after ReLU</li>` +
        `<li><span class="sw clipped"></span>negative pre-activation, clipped to 0</li></ul>`);
    }
  }

  function draw() {
    drawPlane();
    drawGram();
    drawBars();
    const stored = T.featureNorms(model).filter(v => v > 0.5).length;
    status.textContent =
      `step ${model.step.toLocaleString()} · loss ${loss.toFixed(4)} · ` +
      `${stored} of ${n} features stored in ${M} dimensions`;
  }

  // --- controls -------------------------------------------------------------

  function buildProbe() {
    probeSeg.replaceChildren();
    for (let i = 0; i < n; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = i + 1;
      b.setAttribute("aria-pressed", i === probe);
      b.addEventListener("click", () => {
        probe = i;
        probeSeg.querySelectorAll("button").forEach((x, k) => x.setAttribute("aria-pressed", k === probe));
        draw();
      });
      probeSeg.append(b);
    }
  }

  function syncLabels() {
    pVal.textContent = density();
    impVal.textContent = (+impIn.value).toFixed(2);
    nSeg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.n === n));
  }

  pIn.addEventListener("input", () => { syncLabels(); reset(); });
  impIn.addEventListener("input", () => { syncLabels(); reset(); });
  nSeg.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b || +b.dataset.n === n) return;
    n = +b.dataset.n;
    syncLabels();
    reset();
  });
  root.querySelector("#retrain").addEventListener("click", reset);

  syncLabels();
  reset();
})();
