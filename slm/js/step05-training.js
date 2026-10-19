// Step 05: (a) the -log(p) loss curve, (b) a bigram trained live with Adam.

(() => {
  const SVG = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(SVG, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.append(e);
    return e;
  };

  // --- (a) loss curve ------------------------------------------------------

  (() => {
    const root = document.getElementById("loss-demo");
    if (!root) return;
    const svg = root.querySelector("#loss-plot");
    const slider = root.querySelector("#loss-p");
    const out = root.querySelector("#loss-out");
    const axisBtns = root.querySelectorAll("[data-axis]");

    const W = 400, H = 200, L = 36, R = 12, T = 24, B = 30;
    const PMIN = 0.0005, YMAX = 8;
    let logAxis = false;

    const xOf = p => logAxis
      ? L + (Math.log10(p) - Math.log10(PMIN)) / -Math.log10(PMIN) * (W - L - R)
      : L + p * (W - L - R);
    const yOf = loss => T + (1 - loss / YMAX) * (H - T - B);

    const grid = el("g", { class: "ch-grid" }, svg);
    const curve = el("path", { class: "ch-line series-1" }, svg);
    const marks = el("g", {}, svg);
    const guide = el("line", { class: "ch-guide" }, svg);
    const dot = el("circle", { r: 5, class: "ch-dot" }, svg);

    function draw() {
      grid.replaceChildren();
      for (let y = 0; y <= YMAX; y += 2) {
        el("line", { x1: L, x2: W - R, y1: yOf(y), y2: yOf(y) }, grid);
        el("text", { x: L - 6, y: yOf(y), dy: "0.35em", "text-anchor": "end" }, grid).textContent = y;
      }
      const ticks = logAxis ? [0.001, 0.01, 0.1, 1] : [0, 0.25, 0.5, 0.75, 1];
      ticks.forEach(p => {
        el("text", { x: xOf(Math.max(p, PMIN)), y: H - B + 16, "text-anchor": "middle" }, grid).textContent = p;
      });
      el("text", { x: W - R, y: H - 2, "text-anchor": "end" }, grid).textContent =
        "probability given to the right answer" + (logAxis ? " (log scale)" : "");
      el("text", { x: 4, y: 10 }, grid).textContent = "loss";

      let d = "";
      for (let k = 0; k <= 300; k++) {
        const p = logAxis ? PMIN * Math.pow(1 / PMIN, k / 300) : Math.max(PMIN, k / 300);
        const loss = -Math.log(p);
        if (loss > YMAX + 0.5) continue;
        d += (d ? "L" : "M") + xOf(p).toFixed(1) + "," + yOf(Math.min(loss, YMAX + 0.5)).toFixed(1);
      }
      curve.setAttribute("d", d);

      marks.replaceChildren();
      [[1 / 65, "guessing"], [0.001, "To be → ,"]].forEach(([p, label]) => {
        el("circle", { cx: xOf(p), cy: yOf(-Math.log(p)), r: 3, class: "ch-mark" }, marks);
        el("text", { x: xOf(p) + 7, y: yOf(-Math.log(p)) - 6, class: "ch-note" }, marks).textContent = label;
      });
      update();
    }

    function update() {
      const p = Math.pow(10, +slider.value), loss = -Math.log(p);
      const x = xOf(p), y = yOf(Math.min(loss, YMAX));
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", y);
      guide.setAttribute("x1", x); guide.setAttribute("x2", x);
      guide.setAttribute("y1", y); guide.setAttribute("y2", H - B);
      out.textContent = `p = ${p < 0.01 ? p.toFixed(4) : p.toFixed(3)}  →  loss = ${loss.toFixed(2)}`;
    }

    axisBtns.forEach(b => b.addEventListener("click", () => {
      logAxis = b.dataset.axis === "log";
      axisBtns.forEach(x => x.setAttribute("aria-pressed", x === b));
      draw();
    }));
    slider.addEventListener("input", update);
    axisBtns.forEach(x => x.setAttribute("aria-pressed", x.dataset.axis === "linear"));
    draw();
  })();

  // --- (b) live training ---------------------------------------------------

  (() => {
    const root = document.getElementById("train-demo");
    if (!root || !window.PAIRS || !window.createTrainer) return;

    const svg = root.querySelector("#train-plot");
    const runBtn = root.querySelector("#train-run");
    const resetBtn = root.querySelector("#train-reset");
    const lrBtns = root.querySelectorAll("[data-lr]");
    const stats = root.querySelector("#train-stats");
    const sampleOut = root.querySelector("#train-sample");
    const sampleHead = root.querySelector("#train-sample-head");

    const MAX_STEPS = 1500, PER_FRAME = 3, EVAL_EVERY = 10, SAMPLE_EVERY = 150;
    const W = 400, H = 220, L = 36, R = 64, T = 24, B = 28;
    const YMIN = 2, YMAX = 5;
    const xOf = s => L + s / MAX_STEPS * (W - L - R);
    const yOf = v => T + (1 - (Math.min(YMAX, Math.max(YMIN, v)) - YMIN) / (YMAX - YMIN)) * (H - T - B);

    const grid = el("g", { class: "ch-grid" }, svg);
    for (let y = YMIN; y <= YMAX; y += 0.5) {
      el("line", { x1: L, x2: W - R, y1: yOf(y), y2: yOf(y) }, grid);
      if (y % 1 === 0) el("text", { x: L - 6, y: yOf(y), dy: "0.35em", "text-anchor": "end" }, grid).textContent = y;
    }
    [0, 500, 1000, 1500].forEach(s =>
      el("text", { x: xOf(s), y: H - B + 16, "text-anchor": "middle" }, grid).textContent = s);
    el("text", { x: W - R, y: H - 2, "text-anchor": "end" }, grid).textContent = "training steps";
    el("text", { x: 4, y: 10 }, grid).textContent = "loss";
    [[Math.log(65), "random guess"], [2.45, "bigram's best"]].forEach(([v, label]) => {
      el("line", { x1: L, x2: W - R, y1: yOf(v), y2: yOf(v), class: "ch-ref" }, svg);
      el("text", { x: W - R + 4, y: yOf(v), dy: "0.35em", class: "ch-note" }, svg).textContent = label;
    });

    const ghost = el("path", { class: "ch-line ghost" }, svg);
    const trainLine = el("path", { class: "ch-line series-1 thin" }, svg);
    const valLine = el("path", { class: "ch-line series-2" }, svg);
    const hoverG = el("g", { class: "ch-hover", visibility: "hidden" }, svg);
    const hoverLine = el("line", { y1: T, y2: H - B }, hoverG);
    const hit = el("rect", { x: L, y: T, width: W - L - R, height: H - T - B, fill: "transparent" }, svg);
    const tip = root.querySelector("#train-tip");

    let lr = 0.03;
    let trainer = createTrainer(window.PAIRS, { lr });
    let trainPts = [], valPts = [], samples = [], running = false, raf = null, lastRun = null;

    const path = pts => pts.map(([s, v], k) => (k ? "L" : "M") + xOf(s).toFixed(1) + "," + yOf(v).toFixed(1)).join("");

    function record() {
      const s = trainer.steps;
      valPts.push([s, trainer.valLoss()]);
      if (s % SAMPLE_EVERY === 0) {
        samples.push([s, trainer.sample(90).replace(/\n/g, " / ")]);
        renderSamples();
      }
    }

    function renderSamples() {
      sampleHead.textContent = `Text sampled from the model as it trains (learning rate ${lr})`;
      sampleOut.replaceChildren(...samples.slice(-4).map(([s, txt]) => {
        const row = document.createElement("div");
        const k = document.createElement("span");
        k.className = "train-s-step";
        k.textContent = `step ${s}`;
        row.append(k, document.createTextNode(txt));
        return row;
      }));
    }

    function render() {
      trainLine.setAttribute("d", path(trainPts));
      valLine.setAttribute("d", path(valPts));
      const tr = trainPts.at(-1), va = valPts.at(-1);
      stats.textContent = `Step ${trainer.steps} · training loss ${tr ? tr[1].toFixed(2) : "–"} · validation loss ${va[1].toFixed(2)}`;
    }

    function frame() {
      for (let k = 0; k < PER_FRAME && trainer.steps < MAX_STEPS; k++) {
        const loss = trainer.step();
        trainPts.push([trainer.steps, loss]);
        if (trainer.steps % EVAL_EVERY === 0) record();
      }
      render();
      if (trainer.steps >= MAX_STEPS) return stop();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (trainer.steps >= MAX_STEPS) reset();
      running = true;
      runBtn.textContent = "Pause";
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
      runBtn.textContent = trainer.steps >= MAX_STEPS ? "Train again" : "Train";
    }
    function reset() {
      stop();
      if (valPts.length > 1) lastRun = { lr: trainer.lr, pts: valPts };
      ghost.setAttribute("d", lastRun ? path(lastRun.pts) : "");
      trainer = createTrainer(window.PAIRS, { lr, seed: Math.floor(Math.random() * 1e9) });
      trainPts = []; valPts = []; samples = [];
      record();
      render();
      runBtn.textContent = "Train";
    }

    runBtn.addEventListener("click", () => running ? stop() : start());
    resetBtn.addEventListener("click", reset);
    lrBtns.forEach(b => b.addEventListener("click", () => {
      lr = +b.dataset.lr;
      lrBtns.forEach(x => x.setAttribute("aria-pressed", x === b));
      reset();
      start();
    }));
    lrBtns.forEach(x => x.setAttribute("aria-pressed", +x.dataset.lr === lr));

    hit.addEventListener("pointermove", e => {
      if (!valPts.length) return;
      const box = svg.getBoundingClientRect();
      const s = ((e.clientX - box.left) / box.width * W - L) / (W - L - R) * MAX_STEPS;
      const near = valPts.reduce((a, b) => Math.abs(b[0] - s) < Math.abs(a[0] - s) ? b : a);
      const trv = trainPts[near[0] - 1];
      hoverG.setAttribute("visibility", "visible");
      hoverLine.setAttribute("x1", xOf(near[0]));
      hoverLine.setAttribute("x2", xOf(near[0]));
      tip.hidden = false;
      tip.style.left = (xOf(near[0]) / W * 100) + "%";
      tip.innerHTML = `<b>Step ${near[0]}</b><br>validation ${near[1].toFixed(2)}` +
        (trv ? `<br>training ${trv[1].toFixed(2)}` : "") +
        (lastRun ? `<br><span>previous run (lr ${lastRun.lr})</span>` : "");
    });
    hit.addEventListener("pointerleave", () => { hoverG.setAttribute("visibility", "hidden"); tip.hidden = true; });

    record();
    render();
  })();
})();
