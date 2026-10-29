// Figure 2: train a fresh 20→5 model at each density and count the features it stores.

(() => {
  const SVG = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(SVG, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.append(e);
    return e;
  };
  const T = window.ToyModel;
  const root = document.getElementById("sweep");
  if (!root) return;

  const N = 20, M = 5, STEPS = 3000, PER_FRAME = 100;
  const DENSITIES = [1, 0.5, 0.3, 0.2, 0.1, 0.05, 0.03, 0.02, 0.01, 0.005, 0.002];
  const IMPORTANCE = Array.from({ length: N }, (_, i) => Math.pow(0.9, i));

  const svg = root.querySelector("#sweep-plot"), tip = root.querySelector("#sweep-tip");
  const btn = root.querySelector("#sweep-run"), progress = root.querySelector("#sweep-progress");
  const tbody = root.querySelector("#sweep-table tbody");

  const W = 640, H = 300, L = 44, R = 16, TOP = 20, B = 44;
  const LMIN = Math.log10(DENSITIES[DENSITIES.length - 1]);
  const xOf = p => L + Math.log10(p) / LMIN * (W - L - R);
  const yOf = v => TOP + (1 - v / N) * (H - TOP - B);

  let results = [], running = false, seed = 100;

  function drawAxes() {
    svg.replaceChildren();
    for (let v = 0; v <= N; v += 5) {
      el("line", { class: "gridline", x1: L, x2: W - R, y1: yOf(v), y2: yOf(v) }, svg);
      el("text", { x: L - 8, y: yOf(v), dy: "0.35em", "text-anchor": "end" }, svg).textContent = v;
    }
    [1, 0.3, 0.1, 0.03, 0.01, 0.003].forEach(p => {
      el("text", { x: xOf(p), y: H - B + 18, "text-anchor": "middle" }, svg).textContent = p;
    });
    el("text", { x: W - R, y: H - 4, "text-anchor": "end" }, svg).textContent = "feature density (log scale) → sparser";
    el("text", { x: 4, y: 10 }, svg).textContent = "features stored";
    el("line", { class: "ref-line", x1: L, x2: W - R, y1: yOf(M), y2: yOf(M) }, svg);
    el("text", { class: "ref-label", x: W - R, y: yOf(M) - 6, "text-anchor": "end" }, svg).textContent =
      "m = 5: one feature per dimension";
  }

  function draw() {
    drawAxes();
    if (!results.length) return;
    const d = results.map((r, k) => (k ? "L" : "M") + xOf(r.p).toFixed(1) + "," + yOf(r.stored).toFixed(1)).join("");
    el("path", { class: "line", d }, svg);
    results.forEach(r => {
      const g = el("g", {}, svg);
      const pt = el("circle", { class: "pt", cx: xOf(r.p), cy: yOf(r.stored), r: 5 }, g);
      const hit = el("circle", { class: "hit", cx: xOf(r.p), cy: yOf(r.stored), r: 16 }, g);
      hit.addEventListener("pointerenter", () => {
        pt.classList.add("hover");
        tip.hidden = false;
        tip.style.left = (xOf(r.p) / W * 100) + "%";
        tip.style.top = (yOf(r.stored) / H * 100) + "%";
        tip.innerHTML = `<b>${r.stored} of ${N}</b> features stored<br>` +
          `<span class="m">density ${r.p} · ${r.dims.toFixed(2)} dims per feature</span>`;
      });
      hit.addEventListener("pointerleave", () => { pt.classList.remove("hover"); tip.hidden = true; });
    });
  }

  function run() {
    if (running) return;
    running = true;
    btn.disabled = true;
    results = [];
    tbody.replaceChildren();
    draw();
    let k = 0, model = null;
    const frame = () => {
      if (!model) model = T.createModel({ n: N, m: M, seed: seed++ });
      const p = DENSITIES[k];
      for (let s = 0; s < PER_FRAME && model.step < STEPS; s++) {
        T.trainStep(model, { p, importance: IMPORTANCE, batch: 256, lr: model.step < STEPS * 0.75 ? 1e-2 : 2e-3 });
      }
      progress.textContent = `Training model ${k + 1} of ${DENSITIES.length} (density ${p})…`;
      if (model.step >= STEPS) {
        const r = { p, stored: T.featureNorms(model).filter(v => v > 0.5).length, dims: T.dimsPerFeature(model) };
        results.push(r);
        tbody.insertAdjacentHTML("beforeend", `<tr><td>${r.p}</td><td>${r.stored}</td><td>${r.dims.toFixed(2)}</td></tr>`);
        draw();
        model = null;
        k++;
      }
      if (k < DENSITIES.length) setTimeout(frame, 0);
      else {
        running = false;
        btn.disabled = false;
        btn.textContent = "Run again";
        progress.textContent = `${DENSITIES.length} models trained.`;
      }
    };
    setTimeout(frame, 0);
  }

  btn.addEventListener("click", run);
  drawAxes();

  // Start once the figure scrolls into view.
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); run(); }
    }, { threshold: 0.3 });
    io.observe(root);
  }
})();
