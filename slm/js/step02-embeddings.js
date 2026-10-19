// Step 02: the embedding table, before and after training.
// Data comes from train/step02_embeddings.py via data/embeddings.js.

(() => {
  const E = window.EMBEDDINGS;
  const root = document.getElementById("emb-demo");
  if (!E || !root) return;

  const SVG = "http://www.w3.org/2000/svg";
  const V = E.vocab.length;
  const plot = root.querySelector("#emb-plot");
  const table = root.querySelector("#emb-table");
  const rowCells = root.querySelector("#emb-row-cells");
  const rowLabel = root.querySelector("#emb-row-label");
  const nbrsOut = root.querySelector("#emb-nbrs");
  const modeBtns = root.querySelectorAll("[data-emb]");

  const show = c => c === " " ? "·" : c === "\n" ? "↵" : c;
  const name = c => c === " " ? "space" : c === "\n" ? "newline" : `'${c}'`;
  const category = c =>
    /[aeiou]/.test(c) ? "vowel" : /[a-z]/.test(c) ? "consonant" : /[A-Z]/.test(c) ? "upper" : "other";

  // --- geometry ------------------------------------------------------------

  const W = 400, H = 320, PAD = 18;

  function fit(points) {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const s = Math.min((W - 2 * PAD) / (x1 - x0), (H - 2 * PAD) / (y1 - y0));
    const cx = (W - s * (x1 - x0)) / 2, cy = (H - s * (y1 - y0)) / 2;
    return points.map(([x, y]) => [cx + s * (x - x0), cy + s * (y1 - y)]);
  }

  const layouts = { init: fit(E.init2d), trained: fit(E.trained2d) };

  function neighbours(m, i, k = 5) {
    const norm = r => Math.hypot(...r);
    const a = m[i], na = norm(a);
    return m
      .map((b, j) => [j, a.reduce((s, x, t) => s + x * b[t], 0) / (na * norm(b))])
      .filter(([j]) => j !== i)
      .sort((p, q) => q[1] - p[1])
      .slice(0, k)
      .map(([j]) => j);
  }

  // Diverging fill as a CSS colour, so it follows the theme tokens.
  function fill(v, scale) {
    const t = Math.max(-1, Math.min(1, v / scale));
    const pole = t < 0 ? "var(--div-neg)" : "var(--div-pos)";
    return `color-mix(in oklab, ${pole} ${Math.round(Math.abs(t) * 100)}%, var(--div-mid))`;
  }

  function scaleOf(m) {
    const abs = m.flat().map(Math.abs).sort((a, b) => a - b);
    return abs[Math.floor(abs.length * 0.95)];
  }

  // --- build plot ----------------------------------------------------------

  const linkLayer = document.createElementNS(SVG, "g");
  const dotLayer = document.createElementNS(SVG, "g");
  plot.append(linkLayer, dotLayer);

  const dots = E.vocab.map((c, i) => {
    const g = document.createElementNS(SVG, "g");
    g.setAttribute("class", `dot ${category(c)}`);
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.setAttribute("aria-label", `${name(c)}, token ${i}`);
    const hit = document.createElementNS(SVG, "circle");
    hit.setAttribute("r", 14);
    hit.setAttribute("class", "hit");
    const ring = document.createElementNS(SVG, "circle");
    ring.setAttribute("r", 9);
    const t = document.createElementNS(SVG, "text");
    t.textContent = show(c);
    t.setAttribute("dy", "0.35em");
    g.append(hit, ring, t);
    g.addEventListener("mouseenter", () => select(i, false));
    g.addEventListener("click", () => select(i, true));
    g.addEventListener("focus", () => select(i, true));
    dotLayer.append(g);
    return g;
  });

  // --- build table (65 rows x d columns) ------------------------------------

  const CW = 8, CH = 4;
  table.setAttribute("viewBox", `0 0 ${E.d * CW} ${V * CH}`);
  table.setAttribute("width", E.d * CW);
  table.setAttribute("height", V * CH);
  const cells = [];
  for (let i = 0; i < V; i++) {
    const row = [];
    for (let j = 0; j < E.d; j++) {
      const r = document.createElementNS(SVG, "rect");
      r.setAttribute("x", j * CW);
      r.setAttribute("y", i * CH);
      r.setAttribute("width", CW);
      r.setAttribute("height", CH);
      table.append(r);
      row.push(r);
    }
    cells.push(row);
  }
  const rowMark = document.createElementNS(SVG, "rect");
  rowMark.setAttribute("class", "row-mark");
  rowMark.setAttribute("x", 0.5);
  rowMark.setAttribute("width", E.d * CW - 1);
  rowMark.setAttribute("height", CH);
  table.append(rowMark);
  table.addEventListener("click", e => {
    const y = (e.clientY - table.getBoundingClientRect().top) / table.getBoundingClientRect().height;
    select(Math.min(V - 1, Math.floor(y * V)), true);
  });

  const strip = [];
  for (let j = 0; j < E.d; j++) {
    const c = document.createElement("span");
    c.className = "emb-cell";
    rowCells.append(c);
    strip.push(c);
  }

  // --- state ---------------------------------------------------------------

  let mode = "trained";
  let selected = E.vocab.indexOf("a");
  let pos = layouts[mode].map(p => p.slice());
  let anim = null;

  function placeDots() {
    dots.forEach((g, i) => g.setAttribute("transform", `translate(${pos[i][0].toFixed(1)},${pos[i][1].toFixed(1)})`));
    drawLinks();
  }

  function drawLinks() {
    const nb = neighbours(E[mode], selected);
    linkLayer.replaceChildren(...nb.map(j => {
      const l = document.createElementNS(SVG, "line");
      l.setAttribute("x1", pos[selected][0]);
      l.setAttribute("y1", pos[selected][1]);
      l.setAttribute("x2", pos[j][0]);
      l.setAttribute("y2", pos[j][1]);
      return l;
    }));
    dots.forEach((g, i) => {
      g.classList.toggle("selected", i === selected);
      g.classList.toggle("nbr", nb.includes(i));
    });
    return nb;
  }

  function paintTable() {
    const m = E[mode], s = scaleOf(m);
    cells.forEach((row, i) => row.forEach((r, j) => { r.style.fill = fill(m[i][j], s); }));
  }

  function select(i, pin) {
    if (!pin && pinned !== null) return;
    if (pin) pinned = i;
    selected = i;
    const m = E[mode], s = scaleOf(m), c = E.vocab[i];
    rowMark.setAttribute("y", i * CH);
    rowLabel.textContent = `Row ${i} · ${name(c)}`;
    m[i].forEach((v, j) => {
      strip[j].style.background = fill(v, s);
      strip[j].title = v.toFixed(3);
    });
    const nb = drawLinks();
    nbrsOut.replaceChildren(...nb.map(j => {
      const k = document.createElement("code");
      k.textContent = show(E.vocab[j]);
      return k;
    }));
  }
  let pinned = null;
  plot.addEventListener("mouseleave", () => { if (pinned === null) select(selected, false); });

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    modeBtns.forEach(b => b.setAttribute("aria-pressed", b.dataset.emb === mode));
    paintTable();
    select(selected, true);
    const from = pos.map(p => p.slice()), to = layouts[mode];
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now(), DUR = reduce ? 0 : 900;
    cancelAnimationFrame(anim);
    const step = now => {
      const t = DUR ? Math.min(1, (now - t0) / DUR) : 1;
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      pos = from.map((p, i) => [p[0] + (to[i][0] - p[0]) * e, p[1] + (to[i][1] - p[1]) * e]);
      placeDots();
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  modeBtns.forEach(b => b.addEventListener("click", () => setMode(b.dataset.emb)));
  modeBtns.forEach(b => b.setAttribute("aria-pressed", b.dataset.emb === mode));
  paintTable();
  placeDots();
  select(selected, true);
})();
